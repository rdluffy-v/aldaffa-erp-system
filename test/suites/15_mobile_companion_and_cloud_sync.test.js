import assert from 'assert';
import Database from 'better-sqlite3';
import { createRequire } from 'module';
import http from 'http';

const require = createRequire(import.meta.url);
const { startMobileBridgeServer, getMobileServerInfo, stopMobileBridgeServer, generatePairingToken } = require('../../server/mobileBridgeServer.cjs');

export async function run() {
  const results = [];

  const test = async (name, fn) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ name, passed: true, duration: Date.now() - start });
    } catch (err) {
      results.push({ name, passed: false, error: err, duration: Date.now() - start });
    }
  };

  // Create in-memory SQLite database for testing
  const testDb = new Database(':memory:');
  testDb.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO settings (key, value) VALUES ('store_name', 'الدفة للعطور التجريبية');

    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      pin_code TEXT UNIQUE,
      is_active INTEGER DEFAULT 1
    );
    INSERT INTO users (id, username, full_name, role, pin_code, is_active)
    VALUES ('usr-mgr', 'admin', 'المدير العام', 'manager', '9999', 1);

    CREATE TABLE user_permissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      permission_key TEXT NOT NULL,
      is_granted INTEGER DEFAULT 1
    );
    INSERT INTO user_permissions (id, user_id, permission_key, is_granted)
    VALUES ('perm-1', 'usr-mgr', 'view_profits', 1);

    CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, is_active INTEGER DEFAULT 1);
    INSERT INTO categories (id, name, is_active) VALUES ('cat-oud', 'دهن عود', 1);

    CREATE TABLE products (
      id TEXT PRIMARY KEY,
      barcode TEXT UNIQUE,
      name TEXT NOT NULL,
      category_id TEXT,
      price REAL DEFAULT 0,
      cost_price REAL DEFAULT 0,
      wholesale_price REAL DEFAULT 0,
      stock_quantity REAL DEFAULT 0,
      min_stock_alert REAL DEFAULT 5,
      unit TEXT DEFAULT 'piece',
      is_composite INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1
    );
    INSERT INTO products (id, barcode, name, category_id, price, cost_price, stock_quantity, unit)
    VALUES ('p-100', '6281100112233', 'عود كمبودي فاخر', 'cat-oud', 250, 150, 20, 'تولة');

    CREATE TABLE sales (
      id TEXT PRIMARY KEY,
      invoice_number TEXT,
      date TEXT,
      total_amount REAL,
      total_cost REAL,
      profit REAL,
      discount REAL,
      tax REAL,
      payment_type TEXT,
      customer_name TEXT,
      notes TEXT
    );

    CREATE TABLE sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT,
      product_id TEXT,
      name TEXT,
      quantity REAL,
      unit_price REAL,
      total_price REAL,
      cost_price REAL,
      profit REAL
    );

    CREATE TABLE debtors (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE,
      current_balance REAL DEFAULT 0,
      created_at TEXT
    );

    CREATE TABLE notes (
      id TEXT PRIMARY KEY,
      title TEXT,
      content TEXT,
      date TEXT,
      is_completed INTEGER DEFAULT 0
    );

    CREATE TABLE withdrawals (id TEXT PRIMARY KEY, amount REAL, date TEXT);
  `);

  // Start test server on dynamic test port 4899
  const TEST_PORT = 4899;
  const serverInfo = startMobileBridgeServer(testDb, TEST_PORT);

  function requestApi(path, options = {}, bodyData = null) {
    return new Promise((resolve, reject) => {
      const opt = {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Pairing-Token': serverInfo.pairingToken,
          ...(options.headers || {})
        }
      };

      const req = http.request(opt, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, text: body });
          }
        });
      });
      req.on('error', reject);
      if (bodyData) req.write(JSON.stringify(bodyData));
      req.end();
    });
  }

  await test('15.1 Mobile Server Starts and Reports Port & Token', async () => {
    const info = getMobileServerInfo();
    assert.strictEqual(info.isRunning, true, 'Server should be running');
    assert.strictEqual(info.port, TEST_PORT, 'Port should match test port');
    assert(info.pairingToken.length >= 16, 'Pairing token must be secure string');
  });

  await test('15.2 QR Pairing Verification API Returns Store Name', async () => {
    const res = await requestApi('/api/pairing/verify');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.storeName, 'الدفة للعطور التجريبية');
  });

  await test('15.3 PIN Code Authentication Validates Role & Permissions', async () => {
    const res = await requestApi('/api/auth/pin', { method: 'POST' }, { pin: '9999' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.user.role, 'manager');
    assert.strictEqual(res.data.user.permissions.view_profits, true);
    assert(res.data.sessionToken.length > 20, 'Session token must be present');
  });

  await test('15.4 Products Catalog Returns Formatted Barcode Items', async () => {
    const res = await requestApi('/api/products');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.products.length, 1);
    assert.strictEqual(res.data.products[0].barcode, '6281100112233');
    assert.strictEqual(res.data.products[0].stock_quantity, 20);
  });

  await test('15.5 Mobile POS Checkout Deducts Inventory Stock Atomically', async () => {
    const checkoutRes = await requestApi('/api/pos/checkout', { method: 'POST' }, {
      items: [
        { productId: 'p-100', quantity: 3, unitPrice: 250, costPrice: 150 }
      ],
      totalAmount: 750,
      paymentType: 'cash',
      customerName: 'عميل نقدي'
    });

    assert.strictEqual(checkoutRes.status, 200);
    assert.strictEqual(checkoutRes.data.success, true);
    assert(checkoutRes.data.invoiceId.startsWith('INV-M-'));

    // Check inventory stock in SQLite
    const prod = testDb.prepare(`SELECT stock_quantity FROM products WHERE id = 'p-100'`).get();
    assert.strictEqual(prod.stock_quantity, 17, 'Stock should decrease from 20 to 17');
  });

  await test('15.6 Camera Stocktaking Adjusts Inventory & Logs Audit Record', async () => {
    const adjustRes = await requestApi('/api/inventory/adjust', { method: 'POST' }, {
      productId: 'p-100',
      newQuantity: 25,
      reason: 'جرد فعلي بالكاميرا'
    });

    assert.strictEqual(adjustRes.status, 200);
    assert.strictEqual(adjustRes.data.success, true);
    assert.strictEqual(adjustRes.data.newQuantity, 25);

    const prod = testDb.prepare(`SELECT stock_quantity FROM products WHERE id = 'p-100'`).get();
    assert.strictEqual(prod.stock_quantity, 25, 'Stock should now be updated to 25');

    const note = testDb.prepare(`SELECT * FROM notes WHERE title LIKE '%عود كمبودي%'`).get();
    assert(note, 'Audit note record must be created');
  });

  await test('15.7 Real-Time Dashboard Aggregates Today Sales & Top Products', async () => {
    const dashRes = await requestApi('/api/dashboard/stats');
    assert.strictEqual(dashRes.status, 200);
    assert.strictEqual(dashRes.data.success, true);
    assert.strictEqual(dashRes.data.stats.invoices, 1);
    assert.strictEqual(dashRes.data.stats.revenue, 750);
    assert.strictEqual(dashRes.data.stats.cashSales, 750);
    assert.strictEqual(dashRes.data.topProducts.length, 1);
    assert.strictEqual(dashRes.data.topProducts[0].name, 'عود كمبودي فاخر');
  });

  // Stop test server
  stopMobileBridgeServer();
  testDb.close();

  return results;
}
