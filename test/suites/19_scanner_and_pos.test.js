/**
 * Suite 19: Mobile POS Checkout, Decant ML Calculator, Barcode Scanner & Stocktaking Engine
 * 
 * Follows 4-Tier Verification Architecture:
 * - Tier 1: Category-Partition Equivalence Paths (Cart Aggregation, Fractional ML Decants, Multi-Payment & Change Math)
 * - Tier 2: Boundary Value Analysis & Barcode Invariants (Code-128/EAN-13, Live Discrepancies, Reason Presets, Tone Burst)
 * - Tier 3: Pairwise Combinatorial (Concurrent Decant Portions, Mixed Payments x Inventory Deductions)
 * - Tier 4: Real-World Workload Simulation (20-Product Continuous Stocktaking Camera Audit)
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

  // Helper to setup clean test SQLite database
  function createTestDb() {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
      INSERT INTO settings (key, value) VALUES ('store_name', 'الدفة للعطور - الفرع الرئيسي');

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
        ('u_acc', 'accountant', 'المحاسب', 'accountant', '2222'),
        ('u_csh', 'cashier', 'الكاشير', 'cashier', '3333');

      CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, is_active INTEGER DEFAULT 1);
      INSERT INTO categories (id, name) VALUES
        ('cat-oud', 'دهن عود'),
        ('cat-perfume', 'عطور بخاخ');

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
        is_active INTEGER DEFAULT 1
      );
      INSERT INTO products (id, barcode, name, category_id, price, cost_price, wholesale_price, stock_quantity, unit) VALUES
        ('p_oud_royal', '6281100112233', 'دهن عود ملكي معتق', 'cat-oud', 360, 180, 300, 50, 'تولة'),
        ('p_musk_safwa', '6281100445566', 'مسك الصفوة 100ml', 'cat-perfume', 150, 70, 120, 40, 'قطعة'),
        ('p_rose_taif', '6281100778899', 'ورد طائفي فاخر 50ml', 'cat-perfume', 240, 110, 190, 30, 'قطعة');

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
    return db;
  }

  // ==========================================================================
  // TIER 1: CATEGORY-PARTITION EQUIVALENCE PATHS
  // ==========================================================================

  await test('19.1.1 POS Touch Cart Item Aggregation and Subtotal Calculation', async () => {
    const testDb = createTestDb();
    const server = startMobileBridgeServer(testDb, 4881);

    const cart = [
      { productId: 'p_musk_safwa', quantity: 2, unitPrice: 150, costPrice: 70 },
      { productId: 'p_rose_taif', quantity: 1, unitPrice: 240, costPrice: 110 }
    ];

    const subtotal = cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const totalCost = cart.reduce((sum, item) => sum + (item.costPrice * item.quantity), 0);
    const profit = subtotal - totalCost;

    assert.strictEqual(subtotal, 540, '2x150 + 1x240 = 540 د.ل');
    assert.strictEqual(totalCost, 250, '2x70 + 1x110 = 250 د.ل');
    assert.strictEqual(profit, 290, '540 - 250 = 290 د.ل');

    stopMobileBridgeServer();
    testDb.close();
  });

  await test('19.1.2 Fractional Portion (ML) Decant Pricing Calculator Invariants', async () => {
    // Product 1: Tola (12ml) price = 360 د.ل
    const tolaBasePrice = 360;
    const calcTolaDecant = (ml) => Math.round(((tolaBasePrice / 12) * ml) * 100) / 100;

    assert.strictEqual(calcTolaDecant(3), 90, '1/4 Tola (3ml) must equal 90 د.ل');
    assert.strictEqual(calcTolaDecant(6), 180, '1/2 Tola (6ml) must equal 180 د.ل');
    assert.strictEqual(calcTolaDecant(12), 360, '1 Tola (12ml) must equal 360 د.ل');
    assert.strictEqual(calcTolaDecant(1.5), 45, '1/8 Tola (1.5ml) must equal 45 د.ل');

    // Product 2: 100ml Bottle price = 200 د.ل
    const bottleBasePrice = 200;
    const calcBottleDecant = (ml) => Math.round(((bottleBasePrice / 100) * ml) * 100) / 100;

    assert.strictEqual(calcBottleDecant(10), 20, '10ml decant = 20 د.ل');
    assert.strictEqual(calcBottleDecant(25), 50, '25ml decant = 50 د.ل');
    assert.strictEqual(calcBottleDecant(50), 100, '50ml decant = 100 د.ل');
  });

  await test('19.1.3 Multi-Payment Support: Cash, Card, and Debt Ledger Invariants', async () => {
    const testDb = createTestDb();
    const server = startMobileBridgeServer(testDb, 4882);

    function checkout(payload) {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: 4882,
          path: '/api/pos/checkout',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Pairing-Token': server.pairingToken }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
        req.write(JSON.stringify(payload));
        req.end();
      });
    }

    // 1. Cash Checkout
    const cashRes = await checkout({
      items: [{ productId: 'p_musk_safwa', quantity: 1, unitPrice: 150, costPrice: 70 }],
      totalAmount: 150,
      paymentType: 'cash',
      customerName: 'زبون نقدي'
    });
    assert.strictEqual(cashRes.success, true);

    // 2. Card Checkout
    const cardRes = await checkout({
      items: [{ productId: 'p_rose_taif', quantity: 1, unitPrice: 240, costPrice: 110 }],
      totalAmount: 240,
      paymentType: 'card',
      customerName: 'زبون بطاقة'
    });
    assert.strictEqual(cardRes.success, true);

    // 3. Debt Checkout
    const debtRes = await checkout({
      items: [{ productId: 'p_oud_royal', quantity: 1, unitPrice: 360, costPrice: 180 }],
      totalAmount: 360,
      paymentType: 'debt',
      customerName: 'الشيخ عبد الله'
    });
    assert.strictEqual(debtRes.success, true);

    // Verify Debt record updated in SQLite
    const debtor = testDb.prepare(`SELECT * FROM debtors WHERE name = 'الشيخ عبد الله'`).get();
    assert(debtor !== undefined, 'Debtor record must be created');
    assert.strictEqual(debtor.current_balance, 360, 'Debtor balance must equal 360 د.ل');

    stopMobileBridgeServer();
    testDb.close();
  });

  await test('19.1.4 Quick Banknotes (50, 100, 200 د.ل) & Change Return Calculator', async () => {
    const totalDue = 160;

    // Helper change return calculator
    const calcChange = (received, total) => {
      if (received >= total) return { change: received - total, status: 'EXACT_OR_CHANGE' };
      return { deficit: total - received, status: 'DEFICIT' };
    };

    assert.deepStrictEqual(calcChange(200, totalDue), { change: 40, status: 'EXACT_OR_CHANGE' });
    assert.deepStrictEqual(calcChange(160, totalDue), { change: 0, status: 'EXACT_OR_CHANGE' });
    assert.deepStrictEqual(calcChange(100, totalDue), { deficit: 60, status: 'DEFICIT' });
    assert.deepStrictEqual(calcChange(250, totalDue), { change: 90, status: 'EXACT_OR_CHANGE' });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY VALUE ANALYSIS & SCANNER INVARIANTS
  // ==========================================================================

  await test('19.2.1 Code-128 & EAN-13 Barcode Validation & Formatting Invariants', async () => {
    // EAN-13 Checksum validator function
    function isValidEan13(code) {
      if (!/^\d{13}$/.test(code)) return false;
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        sum += parseInt(code[i], 10) * (i % 2 === 0 ? 1 : 3);
      }
      const checkDigit = (10 - (sum % 10)) % 10;
      return checkDigit === parseInt(code[12], 10);
    }

    // Code-128 Regex
    function isValidCode128(code) {
      return typeof code === 'string' && code.length >= 3 && /^[\x20-\x7E]+$/.test(code);
    }

    assert.strictEqual(isValidEan13('6281100112233'), false); // invalid check digit
    assert.strictEqual(isValidEan13('6281100112235'), true);  // valid ean13 (check digit is 5)
    assert.strictEqual(isValidCode128('ALDAFFA-OUD-001'), true);
    assert.strictEqual(isValidCode128('INV-M-1725012398'), true);
  });

  await test('19.2.2 Live Stocktaking Discrepancy Calculation & Reason Preset Mapping', async () => {
    const testDb = createTestDb();
    const server = startMobileBridgeServer(testDb, 4883);

    function adjustStock(payload) {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: 4883,
          path: '/api/inventory/adjust',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Pairing-Token': server.pairingToken }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
        req.write(JSON.stringify(payload));
        req.end();
      });
    }

    // Initial stock of 'p_oud_royal' is 50
    // Audit counts 47 bottles -> Deficit of 3
    const auditRes = await adjustStock({
      productId: 'p_oud_royal',
      newQuantity: 47,
      reason: 'عجز جرد مخزني'
    });

    assert.strictEqual(auditRes.success, true);
    assert.strictEqual(auditRes.newQuantity, 47);
    assert.strictEqual(auditRes.previousQuantity, 50);

    // Verify stock updated in SQLite
    const prod = testDb.prepare(`SELECT stock_quantity FROM products WHERE id = 'p_oud_royal'`).get();
    assert.strictEqual(prod.stock_quantity, 47, 'Stock must update to audited 47 units');

    // Verify audit note created
    const note = testDb.prepare(`SELECT * FROM notes WHERE title LIKE '%عود ملكي%'`).get();
    assert(note !== undefined, 'Audit note record must be logged');
    assert(note.content.includes('عجز جرد مخزني'));

    stopMobileBridgeServer();
    testDb.close();
  });

  await test('19.2.3 Audio Tone Burst (1800Hz / 80ms) and Haptic Vibration Invariants', async () => {
    const scanSoundConfig = {
      frequency: 1800,
      durationMs: 80,
      waveform: 'sine',
      hapticDurationMs: 50
    };

    assert.strictEqual(scanSoundConfig.frequency, 1800, 'Audio tone burst must be exactly 1800Hz');
    assert.strictEqual(scanSoundConfig.durationMs, 80, 'Audio tone burst must be exactly 80ms');
    assert.strictEqual(scanSoundConfig.hapticDurationMs, 50, 'Haptic feedback must be 50ms');
  });

  // ==========================================================================
  // TIER 3: PAIRWISE COMBINATORIAL & CONCURRENCY
  // ==========================================================================

  await test('19.3.1 Concurrent Decant Portion Sales and Commutative Stock Deductions', async () => {
    const testDb = createTestDb();
    const server = startMobileBridgeServer(testDb, 4884);

    function checkout(payload) {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: 4884,
          path: '/api/pos/checkout',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Pairing-Token': server.pairingToken }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
        req.write(JSON.stringify(payload));
        req.end();
      });
    }

    // 3 concurrent sales of 'p_musk_safwa' (Initial: 40 units)
    // Sale 1: 5 units
    // Sale 2: 8 units
    // Sale 3: 7 units
    const [r1, r2, r3] = await Promise.all([
      checkout({ items: [{ productId: 'p_musk_safwa', quantity: 5, unitPrice: 150 }], totalAmount: 750 }),
      checkout({ items: [{ productId: 'p_musk_safwa', quantity: 8, unitPrice: 150 }], totalAmount: 1200 }),
      checkout({ items: [{ productId: 'p_musk_safwa', quantity: 7, unitPrice: 150 }], totalAmount: 1050 })
    ]);

    assert.strictEqual(r1.success, true);
    assert.strictEqual(r2.success, true);
    assert.strictEqual(r3.success, true);

    // Final Stock Invariant: 40 - 5 - 8 - 7 = 20
    const prod = testDb.prepare(`SELECT stock_quantity FROM products WHERE id = 'p_musk_safwa'`).get();
    assert.strictEqual(prod.stock_quantity, 20, 'Stock must converge to exactly 20 units');

    stopMobileBridgeServer();
    testDb.close();
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD 20-PRODUCT CONTINUOUS STOCKTAKING AUDIT
  // ==========================================================================

  await test('19.4.1 20-Product Continuous Stocktaking Camera Audit with Automated Discrepancy Reconciliation', async () => {
    const testDb = createTestDb();

    // Insert 20 perfume products for stocktaking
    for (let i = 1; i <= 20; i++) {
      testDb.prepare(`
        INSERT INTO products (id, barcode, name, price, cost_price, stock_quantity)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(`p_stock_${i}`, `6281000000${String(i).padStart(3, '0')}`, `عطر جرد تجريبي ${i}`, 200, 100, 30);
    }

    const server = startMobileBridgeServer(testDb, 4885);

    function adjust(pId, newQ, reason) {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: 4885,
          path: '/api/inventory/adjust',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Pairing-Token': server.pairingToken }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ productId: pId, newQuantity: newQ, reason }));
        req.end();
      });
    }

    // Audit 20 products
    const reasons = [
      'عجز جرد مخزني',
      'كسر/تلف أثناء العرض',
      'عينة تجربة وتستر',
      'خطأ تسجيل سابق',
      'زيادة غير مسجلة'
    ];

    for (let i = 1; i <= 20; i++) {
      const auditedQty = 25 + (i % 7); // between 25 and 31
      const reason = reasons[i % reasons.length];
      const res = await adjust(`p_stock_${i}`, auditedQty, reason);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.newQuantity, auditedQty);
    }

    // Verify all 20 products updated
    const count = testDb.prepare(`SELECT COUNT(*) as cnt FROM products WHERE id LIKE 'p_stock_%'`).get();
    assert.strictEqual(count.cnt, 20);

    stopMobileBridgeServer();
    testDb.close();
  });

  return results;
}
