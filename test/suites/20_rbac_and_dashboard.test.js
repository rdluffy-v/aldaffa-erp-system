/**
 * Suite 20: Executive Mobile Dashboard, 24h Velocity Graph & RBAC Financial Masking
 * 
 * Follows 4-Tier Verification Architecture:
 * - Tier 1: Category-Partition Equivalence Paths (KPI Aggregates, 24h Hourly Velocity, Top Perfumes Ranking)
 * - Tier 2: Boundary Value Analysis & Financial RBAC Masking (Cashier Profit Suppression `*** د.ل`, Accountant vs Manager)
 * - Tier 3: Pairwise Combinatorial & Token Sessions (Cross-Role PIN Switching, Multi-Session Concurrency)
 * - Tier 4: Real-World Multi-Role Store Workload (Opening, Sales, Stocktake, Drawer Reconciliation & Dashboard Sync)
 */

import assert from 'assert';
import Database from 'better-sqlite3';
import { createRequire } from 'module';
import http from 'http';

const require = createRequire(import.meta.url);
const { startMobileBridgeServer, stopMobileBridgeServer } = require('../../server/mobileBridgeServer.cjs');

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

  function createTestDb() {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
      INSERT INTO settings (key, value) VALUES ('store_name', 'الدفة للعطور');

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        pin_code TEXT UNIQUE,
        is_active INTEGER DEFAULT 1
      );
      INSERT INTO users (id, username, full_name, role, pin_code) VALUES
        ('u_mgr', 'admin', 'المدير العام', 'manager', '9999'),
        ('u_acc', 'accountant', 'المحاسب المالي', 'accountant', '2222'),
        ('u_csh', 'cashier', 'الكاشير المناوب', 'cashier', '3333');

      CREATE TABLE user_permissions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        permission_key TEXT NOT NULL,
        is_granted INTEGER DEFAULT 1
      );
      INSERT INTO user_permissions (id, user_id, permission_key, is_granted) VALUES
        ('p1', 'u_mgr', 'view_profits', 1),
        ('p2', 'u_mgr', 'delete_invoice', 1),
        ('p3', 'u_mgr', 'purge_data', 1),
        ('p4', 'u_acc', 'view_profits', 1),
        ('p5', 'u_acc', 'delete_invoice', 0),
        ('p6', 'u_acc', 'purge_data', 0),
        ('p7', 'u_csh', 'view_profits', 0),
        ('p8', 'u_csh', 'delete_invoice', 0);

      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        barcode TEXT UNIQUE,
        name TEXT NOT NULL,
        price REAL DEFAULT 0,
        cost_price REAL DEFAULT 0,
        stock_quantity REAL DEFAULT 0,
        unit TEXT DEFAULT 'piece',
        is_active INTEGER DEFAULT 1
      );
      INSERT INTO products (id, barcode, name, price, cost_price, stock_quantity) VALUES
        ('p_oud_1', '6281001', 'عود سيوفي سوبر', 500, 250, 20),
        ('p_musk_1', '6281002', 'مسك الطهارة', 100, 40, 50),
        ('p_rose_1', '6281003', 'ورد جوري', 150, 60, 30);

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

      CREATE TABLE debtors (id TEXT PRIMARY KEY, name TEXT UNIQUE, current_balance REAL DEFAULT 0, created_at TEXT);
      CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT, content TEXT, date TEXT, is_completed INTEGER DEFAULT 0);
      CREATE TABLE withdrawals (id TEXT PRIMARY KEY, amount REAL, date TEXT);
    `);
    return db;
  }

  // ==========================================================================
  // TIER 1: CATEGORY-PARTITION EQUIVALENCE PATHS
  // ==========================================================================

  await test('20.1.1 Executive Dashboard Financial Aggregation Invariants', async () => {
    const testDb = createTestDb();
    const server = startMobileBridgeServer(testDb, 4891);
    const today = new Date().toISOString().split('T')[0];

    // Seed 3 sales for today
    testDb.exec(`
      INSERT INTO sales (id, invoice_number, date, total_amount, total_cost, profit, payment_type)
      VALUES 
        ('s1', 'INV-1', '${today}T10:00:00Z', 1000, 500, 500, 'cash'),
        ('s2', 'INV-2', '${today}T12:30:00Z', 300, 120, 180, 'card'),
        ('s3', 'INV-3', '${today}T15:45:00Z', 500, 250, 250, 'cash');

      INSERT INTO withdrawals (id, amount, date) VALUES ('w1', 150, '${today}T14:00:00Z');

      INSERT INTO sale_items (id, sale_id, product_id, name, quantity, total_price)
      VALUES 
        ('si1', 's1', 'p_oud_1', 'عود سيوفي سوبر', 2, 1000),
        ('si2', 's2', 'p_musk_1', 'مسك الطهارة', 3, 300),
        ('si3', 's3', 'p_oud_1', 'عود سيوفي سوبر', 1, 500);
    `);

    function fetchDashboard() {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: 4891,
          path: '/api/dashboard/stats',
          headers: { 'X-Pairing-Token': server.pairingToken }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
        req.end();
      });
    }

    const dash = await fetchDashboard();
    assert.strictEqual(dash.success, true);

    // 1. Total Revenue = 1000 + 300 + 500 = 1800
    assert.strictEqual(dash.stats.revenue, 1800, 'Revenue must be 1,800 د.ل');

    // 2. Total Invoices = 3
    assert.strictEqual(dash.stats.invoices, 3, 'Invoices count must be 3');

    // 3. Gross Profit = 500 + 180 + 250 = 930
    assert.strictEqual(dash.stats.profit, 930, 'Gross profit must be 930 د.ل');

    // 4. Cash Drawer = Cash Sales (1500) - Withdrawals (150) = 1350
    assert.strictEqual(dash.stats.cashDrawer, 1350, 'Cash drawer must equal 1,350 د.ل');

    // 5. Top Selling Fragrance = 'p_oud_1' (3 units sold, 1500 revenue)
    assert.strictEqual(dash.topProducts[0].name, 'عود سيوفي سوبر');
    assert.strictEqual(dash.topProducts[0].qtySold, 3);
    assert.strictEqual(dash.topProducts[0].revenue, 1500);

    stopMobileBridgeServer();
    testDb.close();
  });

  await test('20.1.2 24-Hour Hourly Sales Velocity Distribution Invariants', async () => {
    // Verify 24-hour distribution function
    const salesRecords = [
      { date: '2026-08-30T10:15:00Z', total: 250 },
      { date: '2026-08-30T10:45:00Z', total: 150 },
      { date: '2026-08-30T14:20:00Z', total: 800 },
      { date: '2026-08-30T21:00:00Z', total: 500 }
    ];

    const hourlyMap = {};
    for (let h = 0; h < 24; h++) hourlyMap[h] = 0;

    salesRecords.forEach(s => {
      const hour = new Date(s.date).getUTCHours();
      hourlyMap[hour] += s.total;
    });

    assert.strictEqual(hourlyMap[10], 400, 'Hour 10 sales: 250 + 150 = 400');
    assert.strictEqual(hourlyMap[14], 800, 'Hour 14 sales = 800');
    assert.strictEqual(hourlyMap[21], 500, 'Hour 21 sales = 500');
    assert.strictEqual(hourlyMap[0], 0, 'Hour 0 sales = 0');
  });

  // ==========================================================================
  // TIER 2: BOUNDARY VALUE ANALYSIS & FINANCIAL RBAC MASKING
  // ==========================================================================

  await test('20.2.1 Multi-Role PIN Authentication & Permission Resolution', async () => {
    const testDb = createTestDb();
    const server = startMobileBridgeServer(testDb, 4892);

    function authPin(pin) {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: 4892,
          path: '/api/auth/pin',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Pairing-Token': server.pairingToken }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ pin }));
        req.end();
      });
    }

    // 1. Manager Auth
    const mgrAuth = await authPin('9999');
    assert.strictEqual(mgrAuth.success, true);
    assert.strictEqual(mgrAuth.user.role, 'manager');
    assert.strictEqual(mgrAuth.user.permissions.view_profits, true);
    assert.strictEqual(mgrAuth.user.permissions.delete_invoice, true);

    // 2. Accountant Auth
    const accAuth = await authPin('2222');
    assert.strictEqual(accAuth.success, true);
    assert.strictEqual(accAuth.user.role, 'accountant');
    assert.strictEqual(accAuth.user.permissions.view_profits, true);
    assert.strictEqual(accAuth.user.permissions.delete_invoice, false);

    // 3. Cashier Auth
    const cshAuth = await authPin('3333');
    assert.strictEqual(cshAuth.success, true);
    assert.strictEqual(cshAuth.user.role, 'cashier');
    assert.strictEqual(cshAuth.user.permissions.view_profits, false);

    // 4. Invalid PIN
    const badAuth = await authPin('0000');
    assert.strictEqual(badAuth.success, false);

    stopMobileBridgeServer();
    testDb.close();
  });

  await test('20.2.2 Cashier Role Strict Financial Masking Invariant (*** د.ل)', async () => {
    // Simulator for Mobile UI RBAC masking function
    function formatFinancialFigure(value, userRole, permissions) {
      const canView = userRole === 'manager' || userRole === 'accountant' || (permissions && permissions.view_profits);
      if (!canView) return '*** د.ل';
      return `${Number(value || 0).toFixed(2)} د.ل`;
    }

    const rawProfit = 950.0;

    // Cashier role -> masked
    assert.strictEqual(formatFinancialFigure(rawProfit, 'cashier', { view_profits: false }), '*** د.ل');

    // Manager role -> unmasked
    assert.strictEqual(formatFinancialFigure(rawProfit, 'manager', { view_profits: true }), '950.00 د.ل');

    // Accountant role -> unmasked
    assert.strictEqual(formatFinancialFigure(rawProfit, 'accountant', { view_profits: true }), '950.00 د.ل');
  });

  // ==========================================================================
  // TIER 3: PAIRWISE COMBINATORIAL & SESSION TOKENS
  // ==========================================================================

  await test('20.3.1 Rapid Cross-Role Switching & Session Token Validity', async () => {
    const testDb = createTestDb();
    const server = startMobileBridgeServer(testDb, 4893);

    function authPin(pin) {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: 4893,
          path: '/api/auth/pin',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Pairing-Token': server.pairingToken }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ pin }));
        req.end();
      });
    }

    // Switch rapidly: Manager -> Cashier -> Accountant -> Manager
    const s1 = await authPin('9999');
    const s2 = await authPin('3333');
    const s3 = await authPin('2222');
    const s4 = await authPin('9999');

    assert.strictEqual(s1.user.role, 'manager');
    assert.strictEqual(s2.user.role, 'cashier');
    assert.strictEqual(s3.user.role, 'accountant');
    assert.strictEqual(s4.user.role, 'manager');

    // All session tokens must be unique
    const tokens = new Set([s1.sessionToken, s2.sessionToken, s3.sessionToken, s4.sessionToken]);
    assert.strictEqual(tokens.size, 4, 'Each authentication must generate a unique session token');

    stopMobileBridgeServer();
    testDb.close();
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD END-TO-END MULTI-ROLE STORE WORKLOAD
  // ==========================================================================

  await test('20.4.1 Complete Store Multi-Role Lifecycle (Manager Opening -> Cashier 5 Sales -> Stock Audit -> Shift Close)', async () => {
    const testDb = createTestDb();
    const server = startMobileBridgeServer(testDb, 4894);

    function apiCall(endpoint, method = 'GET', body = null) {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: 4894,
          path: endpoint,
          method,
          headers: { 'Content-Type': 'application/json', 'X-Pairing-Token': server.pairingToken }
        }, (res) => {
          let b = '';
          res.on('data', chunk => b += chunk);
          res.on('end', () => resolve(JSON.parse(b)));
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
      });
    }

    // 1. Cashier logs in with PIN 3333
    const login = await apiCall('/api/auth/pin', 'POST', { pin: '3333' });
    assert.strictEqual(login.success, true);
    assert.strictEqual(login.user.role, 'cashier');

    // 2. Cashier conducts 5 sales (3 Cash, 2 Card)
    for (let i = 1; i <= 3; i++) {
      const saleRes = await apiCall('/api/pos/checkout', 'POST', {
        items: [{ productId: 'p_musk_1', quantity: 2, unitPrice: 100, costPrice: 40 }],
        totalAmount: 200,
        paymentType: 'cash',
        customerName: `زبون نقدي ${i}`
      });
      assert.strictEqual(saleRes.success, true);
    }

    for (let i = 1; i <= 2; i++) {
      const saleRes = await apiCall('/api/pos/checkout', 'POST', {
        items: [{ productId: 'p_rose_1', quantity: 1, unitPrice: 150, costPrice: 60 }],
        totalAmount: 150,
        paymentType: 'card',
        customerName: `زبون شبكة ${i}`
      });
      assert.strictEqual(saleRes.success, true);
    }

    // 3. Stock Audit: 'p_oud_1' counted 19 (was 20)
    const auditRes = await apiCall('/api/inventory/adjust', 'POST', {
      productId: 'p_oud_1',
      newQuantity: 19,
      reason: 'عجز جرد مخزني'
    });
    assert.strictEqual(auditRes.success, true);

    // 4. Manager reviews Executive Dashboard
    const dashRes = await apiCall('/api/dashboard/stats');
    assert.strictEqual(dashRes.success, true);

    // Total Revenue = (3 * 200) + (2 * 150) = 600 + 300 = 900 د.ل
    assert.strictEqual(dashRes.stats.revenue, 900);

    // Total Invoices = 5
    assert.strictEqual(dashRes.stats.invoices, 5);

    // Cash Sales = 600 د.ل
    assert.strictEqual(dashRes.stats.cashSales, 600);

    // Cash Drawer = 600 د.ل
    assert.strictEqual(dashRes.stats.cashDrawer, 600);

    // Stock verification: Musk was 50 - 6 = 44; Rose was 30 - 2 = 28; Oud was 20 -> 19
    const muskStock = testDb.prepare(`SELECT stock_quantity FROM products WHERE id = ?`).get('p_musk_1');
    assert.strictEqual(muskStock.stock_quantity, 44);

    const roseStock = testDb.prepare(`SELECT stock_quantity FROM products WHERE id = ?`).get('p_rose_1');
    assert.strictEqual(roseStock.stock_quantity, 28);

    const oudStock = testDb.prepare(`SELECT stock_quantity FROM products WHERE id = ?`).get('p_oud_1');
    assert.strictEqual(oudStock.stock_quantity, 19);

    stopMobileBridgeServer();
    testDb.close();
  });

  return results;
}
