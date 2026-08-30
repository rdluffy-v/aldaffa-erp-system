/**
 * Suite 22: Adversarial POS Checkout Calculations, Decant Math, Barcode Scanner Boundaries & RBAC Masking Audit
 * Challenger 2 (POS & Scanner Boundary Challenger)
 * 
 * Comprehensive Empirical Verification of:
 * - Domain 1: Extreme Price & Discount Calculations (100% discount, 0 total, fractional ML portions, IEEE 754 precision)
 * - Domain 2: Cash Change Return Math (Exact, Overpaid, Deficit, Zero-Total Boundary, Split Tender)
 * - Domain 3: Barcode Decoding Latency & Format Validation (Code-128, EAN-13 Checksum, 5,000-SKU Latency <300ms SLA)
 * - Domain 4: Stock Discrepancy Math (Positive Surplus, Negative Shortage, Zero Variance, Reason Presets, Audit Collisions)
 * - Domain 5: Security Audit of RBAC Financial Data Masking (Cashier Profit/Cost suppression, DOM vs API leak boundaries)
 */

import assert from 'assert';
import Database from 'better-sqlite3';
import { createRequire } from 'module';
import http from 'http';
import crypto from 'crypto';

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
        ('p_oud_royal', '6281100112235', 'دهن عود ملكي معتق', 'cat-oud', 360, 180, 300, 50, 'تولة'),
        ('p_musk_safwa', '6281100445568', 'مسك الصفوة 100ml', 'cat-perfume', 150, 70, 120, 40, 'قطعة'),
        ('p_free_tester', '6281100990011', 'عينة مجانية تستر', 'cat-perfume', 0, 10, 0, 100, 'قطعة'),
        ('p_luxury_rooh', '6281100889922', 'روح العود الكمبودي النادر', 'cat-oud', 9999.99, 4500, 8000, 10, 'تولة');

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

  function makeApiCall(port, token, endpoint, method = 'GET', body = null, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: endpoint,
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Pairing-Token': token,
          ...extraHeaders
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, raw: data });
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // ==========================================================================
  // DOMAIN 1: EXTREME PRICE & DISCOUNT CALCULATIONS
  // ==========================================================================

  await test('22.1.1 100% Full Discount Checkout Zero-Total Invariant and Non-Negative Profit Guard', async () => {
    const testDb = createTestDb();
    const server = startMobileBridgeServer(testDb, 4921);

    const res = await makeApiCall(4921, server.pairingToken, '/api/pos/checkout', 'POST', {
      items: [{ productId: 'p_musk_safwa', quantity: 1, unitPrice: 150, costPrice: 70 }],
      totalAmount: 0,
      total: 0,
      discount: 150,
      paymentType: 'cash',
      customerName: 'عميل خصم كامل'
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.totalAmount, 0);

    const sale = testDb.prepare(`SELECT * FROM sales WHERE customer_name = 'عميل خصم كامل'`).get();
    assert(sale !== undefined);
    assert.strictEqual(sale.total_amount, 0);
    assert.strictEqual(sale.discount, 150);
    assert(sale.profit >= 0, 'Profit must not be negative under 100% discount');
    assert.strictEqual(sale.profit, 0);

    const prod = testDb.prepare(`SELECT stock_quantity FROM products WHERE id = 'p_musk_safwa'`).get();
    assert.strictEqual(prod.stock_quantity, 39);

    stopMobileBridgeServer();
    testDb.close();
  });

  await test('22.1.2 Zero-Price Tester Gift Item Checkout Boundary Handling', async () => {
    const testDb = createTestDb();
    const server = startMobileBridgeServer(testDb, 4922);

    const res = await makeApiCall(4922, server.pairingToken, '/api/pos/checkout', 'POST', {
      items: [{ productId: 'p_free_tester', quantity: 3, unitPrice: 0, costPrice: 10 }],
      totalAmount: 0,
      total: 0,
      discount: 0,
      paymentType: 'cash',
      customerName: 'توزيع عينات'
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);

    const prod = testDb.prepare(`SELECT stock_quantity FROM products WHERE id = 'p_free_tester'`).get();
    assert.strictEqual(prod.stock_quantity, 97, 'Stock must decrease from 100 to 97');

    stopMobileBridgeServer();
    testDb.close();
  });

  await test('22.1.3 Fractional Portion (ML) Decants: Tola & Custom Flacon Capacities Precision', async () => {
    const calcDecant = (basePrice, unit, ml) => {
      let price = 0;
      if (unit === 'تولة') {
        price = (basePrice / 12) * ml;
      } else {
        price = (basePrice / 100) * ml;
      }
      return Math.max(1, Math.round(price * 100) / 100);
    };

    const tolaBase = 360; // 360 د.ل per Tola (12ml)
    assert.strictEqual(calcDecant(tolaBase, 'تولة', 0.25), 7.5, '1/48 Tola (0.25ml) = 7.50 د.ل');
    assert.strictEqual(calcDecant(tolaBase, 'تولة', 0.75), 22.5, '1/16 Tola (0.75ml) = 22.50 د.ل');
    assert.strictEqual(calcDecant(tolaBase, 'تولة', 1.5), 45, '1/8 Tola (1.5ml) = 45.00 د.ل');
    assert.strictEqual(calcDecant(tolaBase, 'تولة', 3.0), 90, '1/4 Tola (3ml) = 90.00 د.ل');
    assert.strictEqual(calcDecant(tolaBase, 'تولة', 6.0), 180, '1/2 Tola (6ml) = 180.00 د.ل');
    assert.strictEqual(calcDecant(tolaBase, 'تولة', 12.0), 360, 'Full Tola (12ml) = 360.00 د.ل');
    assert.strictEqual(calcDecant(tolaBase, 'تولة', 24.0), 720, 'Double Tola (24ml) = 720.00 د.ل');
    assert.strictEqual(calcDecant(tolaBase, 'تولة', 33.33), 999.9, 'Custom 33.33ml = 999.90 د.ل');

    const bottleBase = 250;
    assert.strictEqual(calcDecant(bottleBase, 'قطعة', 5), 12.5, '5ml decant = 12.50 د.ل');
    assert.strictEqual(calcDecant(bottleBase, 'قطعة', 10), 25, '10ml decant = 25.00 د.ل');
    assert.strictEqual(calcDecant(bottleBase, 'قطعة', 25), 62.5, '25ml decant = 62.50 د.ل');
    assert.strictEqual(calcDecant(bottleBase, 'قطعة', 30), 75, '30ml decant = 75.00 د.ل');
    assert.strictEqual(calcDecant(bottleBase, 'قطعة', 50), 125, '50ml decant = 125.00 د.ل');
    assert.strictEqual(calcDecant(bottleBase, 'قطعة', 100), 250, '100ml decant = 250.00 د.ل');
  });

  await test('22.1.4 IEEE 754 Floating-Point Invariance Over 1,000 Randomized Fractions', async () => {
    for (let i = 0; i < 1000; i++) {
      const qty = (Math.random() * 50) + 0.1;
      const unitPrice = (Math.random() * 500) + 1;
      const discountPct = Math.random() * 0.5;

      const rawSubtotal = qty * unitPrice;
      const roundedSubtotal = Math.round(rawSubtotal * 100) / 100;
      const rawDiscount = roundedSubtotal * discountPct;
      const roundedDiscount = Math.round(rawDiscount * 100) / 100;
      const netTotal = Math.round((roundedSubtotal - roundedDiscount) * 100) / 100;

      assert(!isNaN(netTotal), 'Net total must not be NaN');
      assert(isFinite(netTotal), 'Net total must be finite');
      assert(netTotal >= 0, 'Net total must be non-negative');

      const decimalPlaces = (netTotal.toString().split('.')[1] || '').length;
      assert(decimalPlaces <= 2, `Value ${netTotal} has more than 2 decimal places`);
    }
  });

  // ==========================================================================
  // DOMAIN 2: CASH CHANGE RETURN MATH UNDER MULTIPLE PAYMENT MODES
  // ==========================================================================

  await test('22.2.1 Cash Change Return Math Under Exact, Overpaid, and Deficit Payments', async () => {
    function calculateChange(received, total) {
      const r = Math.round(Number(received || 0) * 100) / 100;
      const t = Math.round(Number(total || 0) * 100) / 100;
      if (r >= t && t > 0) {
        return { status: 'EXACT_OR_CHANGE', change: Math.round((r - t) * 100) / 100 };
      } else if (r > 0 && r < t) {
        return { status: 'DEFICIT', deficit: Math.round((t - r) * 100) / 100 };
      }
      return { status: 'ZERO', change: 0 };
    }

    assert.deepStrictEqual(calculateChange(150, 150), { status: 'EXACT_OR_CHANGE', change: 0 });
    assert.deepStrictEqual(calculateChange(37.5, 37.5), { status: 'EXACT_OR_CHANGE', change: 0 });
    assert.deepStrictEqual(calculateChange(200, 162.5), { status: 'EXACT_OR_CHANGE', change: 37.5 });
    assert.deepStrictEqual(calculateChange(500, 412.25), { status: 'EXACT_OR_CHANGE', change: 87.75 });
    assert.deepStrictEqual(calculateChange(100, 13.75), { status: 'EXACT_OR_CHANGE', change: 86.25 });
    assert.deepStrictEqual(calculateChange(50, 49.99), { status: 'EXACT_OR_CHANGE', change: 0.01 });
    assert.deepStrictEqual(calculateChange(100, 150), { status: 'DEFICIT', deficit: 50 });
    assert.deepStrictEqual(calculateChange(20, 100), { status: 'DEFICIT', deficit: 80 });
  });

  await test('22.2.2 Multi-Payment Split Tender Flow (Cash, Card, Debt Ledger Mutation)', async () => {
    const testDb = createTestDb();
    const server = startMobileBridgeServer(testDb, 4923);

    const rCash = await makeApiCall(4923, server.pairingToken, '/api/pos/checkout', 'POST', {
      items: [{ productId: 'p_musk_safwa', quantity: 1, unitPrice: 150, costPrice: 70 }],
      totalAmount: 150,
      paymentType: 'cash',
      customerName: 'زبون مشترك'
    });
    assert.strictEqual(rCash.data.success, true);

    const rCard = await makeApiCall(4923, server.pairingToken, '/api/pos/checkout', 'POST', {
      items: [{ productId: 'p_musk_safwa', quantity: 1, unitPrice: 200, costPrice: 70 }],
      totalAmount: 200,
      paymentType: 'card',
      customerName: 'زبون مشترك'
    });
    assert.strictEqual(rCard.data.success, true);

    const rDebt = await makeApiCall(4923, server.pairingToken, '/api/pos/checkout', 'POST', {
      items: [{ productId: 'p_oud_royal', quantity: 1, unitPrice: 360, costPrice: 180 }],
      totalAmount: 360,
      paymentType: 'debt',
      customerName: 'الحاج مصطفى'
    });
    assert.strictEqual(rDebt.data.success, true);

    const debtor = testDb.prepare(`SELECT * FROM debtors WHERE name = 'الحاج مصطفى'`).get();
    assert(debtor !== undefined);
    assert.strictEqual(debtor.current_balance, 360);

    stopMobileBridgeServer();
    testDb.close();
  });

  // ==========================================================================
  // DOMAIN 3: BARCODE DECODING LATENCY & FORMAT VALIDATION
  // ==========================================================================

  await test('22.3.1 EAN-13 Checksum Algorithm & GS1 Symbology Boundary Validation', async () => {
    function isValidEan13(code) {
      if (typeof code !== 'string' || !/^\d{13}$/.test(code)) return false;
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        sum += parseInt(code[i], 10) * (i % 2 === 0 ? 1 : 3);
      }
      const checkDigit = (10 - (sum % 10)) % 10;
      return checkDigit === parseInt(code[12], 10);
    }

    // Valid EAN-13 barcodes across global GS1 prefixes
    assert.strictEqual(isValidEan13('6281100112235'), true, 'Valid GCC 628 prefix (check digit 5)');
    assert.strictEqual(isValidEan13('5012345678900'), true, 'Valid UK 50 prefix (check digit 0)');
    assert.strictEqual(isValidEan13('8901030383458'), true, 'Valid India 890 prefix (check digit 8)');
    assert.strictEqual(isValidEan13('4006381333931'), true, 'Valid Germany 400 prefix (check digit 1)');
    assert.strictEqual(isValidEan13('0012345678905'), true, 'Valid US 00 prefix (check digit 5)');

    // Invalid EAN-13 barcodes (Check digit corrupted or wrong length)
    assert.strictEqual(isValidEan13('6281100112230'), false, 'Corrupted check digit');
    assert.strictEqual(isValidEan13('6281100112239'), false, 'Corrupted check digit');
    assert.strictEqual(isValidEan13('62811001122'), false, 'Only 11 digits');
    assert.strictEqual(isValidEan13('62811001122334'), false, '14 digits (GTIN-14)');
    assert.strictEqual(isValidEan13('628110011223A'), false, 'Contains letter');
    assert.strictEqual(isValidEan13(null), false);
    assert.strictEqual(isValidEan13(''), false);
  });

  await test('22.3.2 Code-128 Symbology Format and Printable ASCII Boundary Validation', async () => {
    function isValidCode128(code) {
      if (typeof code !== 'string') return false;
      if (code.length < 3 || code.length > 64) return false;
      return /^[\x20-\x7E]+$/.test(code);
    }

    assert.strictEqual(isValidCode128('ALDAFFA-OUD-ROYAL-001'), true);
    assert.strictEqual(isValidCode128('INV-M-1725012398450-8F9'), true);
    assert.strictEqual(isValidCode128('SKU_PERF_100ML#45'), true);
    assert.strictEqual(isValidCode128('A/B/C.123-456'), true);
    assert.strictEqual(isValidCode128('ABC'), true, 'Min 3 chars');

    assert.strictEqual(isValidCode128('AB'), false, 'Too short (<3)');
    assert.strictEqual(isValidCode128('A'.repeat(65)), false, 'Too long (>64)');
    assert.strictEqual(isValidCode128('ALDAFFA\n001'), false, 'Contains newline');
    assert.strictEqual(isValidCode128('ALDAFFA\t001'), false, 'Contains tab');
    assert.strictEqual(isValidCode128('عطر_عود_123'), false, 'Contains non-ASCII Unicode');
  });

  await test('22.3.3 Barcode Lookup Latency Benchmark: 1,000 Lookups Against 5,000 SKUs (<300ms SLA)', async () => {
    const testDb = createTestDb();

    testDb.exec(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);`);

    const insertStmt = testDb.prepare(`
      INSERT INTO products (id, barcode, name, price, cost_price, stock_quantity)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const seedTransaction = testDb.transaction(() => {
      for (let i = 1; i <= 5000; i++) {
        const barcode = `628${String(i).padStart(10, '0')}`;
        insertStmt.run(`p_perf_${i}`, barcode, `عطر تجريبي فاخر رقم ${i}`, 150 + (i % 200), 70 + (i % 80), 20 + (i % 50));
      }
    });
    seedTransaction();

    const lookupStmt = testDb.prepare(`SELECT * FROM products WHERE barcode = ?`);

    const latencies = [];
    for (let j = 0; j < 1000; j++) {
      const targetIdx = Math.floor(Math.random() * 5000) + 1;
      const targetBarcode = `628${String(targetIdx).padStart(10, '0')}`;

      const t0 = performance.now();
      const row = lookupStmt.get(targetBarcode);
      const elapsed = performance.now() - t0;

      latencies.push(elapsed);
      assert(row !== undefined, `Product with barcode ${targetBarcode} must exist`);
      assert.strictEqual(row.id, `p_perf_${targetIdx}`);
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.50)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const maxLatency = latencies[latencies.length - 1];

    console.log(`\n     ⚡ Barcode Lookup Benchmark (5,000 SKUs, 1,000 Queries):`);
    console.log(`        p50 = ${p50.toFixed(3)}ms | p95 = ${p95.toFixed(3)}ms | p99 = ${p99.toFixed(3)}ms | max = ${maxLatency.toFixed(3)}ms`);

    assert(p99 < 5.0, `p99 latency (${p99.toFixed(3)}ms) must be <5ms for indexed SQLite DB`);
    assert(maxLatency < 300.0, `Max decode & lookup latency (${maxLatency.toFixed(3)}ms) must be strictly <300ms SLA`);

    testDb.close();
  });

  // ==========================================================================
  // DOMAIN 4: STOCK DISCREPANCY MATH & AUDIT ADJUSTMENTS
  // ==========================================================================

  await test('22.4.1 Stock Discrepancy Math: Positive Surplus, Negative Shortage, and Zero Variance', async () => {
    function calculateVariance(countedQty, systemQty) {
      const c = Number(countedQty || 0);
      const s = Number(systemQty || 0);
      const variance = c - s;

      let status = 'MATCH';
      let formattedText = '0 (مطابق)';
      let badgeClass = 'text-emerald-400';

      if (variance < 0) {
        status = 'SHORTAGE';
        formattedText = `${variance} (عجز)`;
        badgeClass = 'text-rose-400';
      } else if (variance > 0) {
        status = 'SURPLUS';
        formattedText = `+${variance} (زيادة)`;
        badgeClass = 'text-amber-400';
      }

      return { variance, status, formattedText, badgeClass };
    }

    const vMatch = calculateVariance(50, 50);
    assert.strictEqual(vMatch.variance, 0);
    assert.strictEqual(vMatch.status, 'MATCH');
    assert.strictEqual(vMatch.formattedText, '0 (مطابق)');

    const vDeficit = calculateVariance(43, 50);
    assert.strictEqual(vDeficit.variance, -7);
    assert.strictEqual(vDeficit.status, 'SHORTAGE');
    assert.strictEqual(vDeficit.formattedText, '-7 (عجز)');

    const vSurplus = calculateVariance(58, 50);
    assert.strictEqual(vSurplus.variance, 8);
    assert.strictEqual(vSurplus.status, 'SURPLUS');
    assert.strictEqual(vSurplus.formattedText, '+8 (زيادة)');

    const vZero = calculateVariance(0, 50);
    assert.strictEqual(vZero.variance, -50);
    assert.strictEqual(vZero.status, 'SHORTAGE');

    const vFromZero = calculateVariance(15, 0);
    assert.strictEqual(vFromZero.variance, 15);
    assert.strictEqual(vFromZero.status, 'SURPLUS');
    assert.strictEqual(vFromZero.formattedText, '+15 (زيادة)');
  });

  await test('22.4.2 End-to-End Stock Audit Adjustment API with Reason Mapping', async () => {
    const testDb = createTestDb();
    const server = startMobileBridgeServer(testDb, 4924);

    // Initial stock of 'p_oud_royal' is 50
    // Audit 1: Deficit of 5 (Counted = 45, Reason = 'عجز جرد مخزني')
    const r1 = await makeApiCall(4924, server.pairingToken, '/api/inventory/adjust', 'POST', {
      productId: 'p_oud_royal',
      newQuantity: 45,
      reason: 'عجز جرد مخزني'
    });
    assert.strictEqual(r1.data.success, true);
    assert.strictEqual(r1.data.previousQuantity, 50);
    assert.strictEqual(r1.data.newQuantity, 45);

    // Delay 2ms to prevent same-millisecond collision on Date.now() note ID
    await new Promise(r => setTimeout(r, 5));

    // Audit 2: Breakage of 2 (Counted = 43, Reason = 'كسر/تلف أثناء العرض')
    const r2 = await makeApiCall(4924, server.pairingToken, '/api/inventory/adjust', 'POST', {
      productId: 'p_oud_royal',
      newQuantity: 43,
      reason: 'كسر/تلف أثناء العرض'
    });
    assert.strictEqual(r2.data.success, true);
    assert.strictEqual(r2.data.previousQuantity, 45);
    assert.strictEqual(r2.data.newQuantity, 43);

    const p = testDb.prepare(`SELECT stock_quantity FROM products WHERE id = 'p_oud_royal'`).get();
    assert.strictEqual(p.stock_quantity, 43);

    stopMobileBridgeServer();
    testDb.close();
  });

  // ==========================================================================
  // DOMAIN 5: SECURITY AUDIT OF RBAC FINANCIAL DATA MASKING
  // ==========================================================================

  await test('22.5.1 RBAC Financial Masking Security: Cashier Masking Invariant Across Dashboard & Details', async () => {
    const testDb = createTestDb();
    const server = startMobileBridgeServer(testDb, 4925);
    const today = new Date().toISOString().split('T')[0];

    testDb.exec(`
      INSERT INTO sales (id, invoice_number, date, total_amount, total_cost, profit, payment_type)
      VALUES ('s10', 'INV-10', '${today}T11:00:00Z', 1000, 400, 600, 'cash');
    `);

    // 1. Authenticate Cashier (PIN 3333)
    const cshAuth = await makeApiCall(4925, server.pairingToken, '/api/auth/pin', 'POST', { pin: '3333' });
    assert.strictEqual(cshAuth.data.success, true);
    assert.strictEqual(cshAuth.data.user.role, 'cashier');
    assert.strictEqual(cshAuth.data.user.permissions.view_profits, false);

    // 2. Client-Side Rendering with Cashier Session
    function renderDashboardMetrics(stats, user) {
      const isCashier = user.role === 'cashier' || !user.permissions.view_profits;
      return {
        revenue: `${Number(stats.revenue).toFixed(2)} د.ل`,
        profit: isCashier ? '*** د.ل' : `${Number(stats.profit).toFixed(2)} د.ل`,
        profitSubtext: isCashier ? 'محجوب بصلاحيات الكاشير' : 'صافي الربح التقديري',
        masked: isCashier
      };
    }

    function renderProductDetailsCost(product, user) {
      const isCashier = user.role === 'cashier' || !user.permissions.view_profits;
      return {
        costPriceDisplay: isCashier ? '*** د.ل (محجوب)' : `${Number(product.cost_price).toFixed(2)} د.ل`,
        masked: isCashier
      };
    }

    const dashCashier = renderDashboardMetrics({ revenue: 1000, profit: 600 }, cshAuth.data.user);
    assert.strictEqual(dashCashier.profit, '*** د.ل');
    assert.strictEqual(dashCashier.profitSubtext, 'محجوب بصلاحيات الكاشير');
    assert.strictEqual(dashCashier.masked, true);

    const costCashier = renderProductDetailsCost({ cost_price: 180 }, cshAuth.data.user);
    assert.strictEqual(costCashier.costPriceDisplay, '*** د.ل (محجوب)');
    assert.strictEqual(costCashier.masked, true);

    // 3. Authenticate Manager (PIN 9999) -> Unmasked
    const mgrAuth = await makeApiCall(4925, server.pairingToken, '/api/auth/pin', 'POST', { pin: '9999' });
    assert.strictEqual(mgrAuth.data.success, true);
    assert.strictEqual(mgrAuth.data.user.role, 'manager');
    assert.strictEqual(mgrAuth.data.user.permissions.view_profits, true);

    const dashMgr = renderDashboardMetrics({ revenue: 1000, profit: 600 }, mgrAuth.data.user);
    assert.strictEqual(dashMgr.profit, '600.00 د.ل');
    assert.strictEqual(dashMgr.masked, false);

    const costMgr = renderProductDetailsCost({ cost_price: 180 }, mgrAuth.data.user);
    assert.strictEqual(costMgr.costPriceDisplay, '180.00 د.ل');
    assert.strictEqual(costMgr.masked, false);

    stopMobileBridgeServer();
    testDb.close();
  });

  await test('22.5.2 Security Boundary Audit: Unauthenticated / Invalid Pairing Token Rejection', async () => {
    const testDb = createTestDb();
    const server = startMobileBridgeServer(testDb, 4926);

    // Completely missing or non-matching token returns 401
    const badTokenRes = await makeApiCall(4926, 'invalid_random_token_12345', '/api/pairing/verify');
    assert.strictEqual(badTokenRes.statusCode, 401);
    assert.strictEqual(badTokenRes.data.success, false);

    // Missing items on checkout returns 400 Bad Request
    const badPosRes = await makeApiCall(4926, server.pairingToken, '/api/pos/checkout', 'POST', {});
    assert.strictEqual(badPosRes.statusCode, 400);
    assert.strictEqual(badPosRes.data.success, false);

    // Non-existent product adjustment returns 404 Not Found
    const badAdjustRes = await makeApiCall(4926, server.pairingToken, '/api/inventory/adjust', 'POST', {
      productId: 'p_non_existent_skux',
      newQuantity: 10
    });
    assert.strictEqual(badAdjustRes.statusCode, 404);
    assert.strictEqual(badAdjustRes.data.success, false);

    stopMobileBridgeServer();
    testDb.close();
  });

  await test('22.5.3 Remediation Hardening: Exact Pairing Token, Sub-ms Audit Uniqueness, Server RBAC Masking & Proportional Decants', async () => {
    const testDb = createTestDb();
    const server = startMobileBridgeServer(testDb, 4927);

    // 1. Strict Pairing Token: Fake token starting with 'pair_' must be rejected (401)
    const fakePairRes = await makeApiCall(4927, 'pair_fake_prefix_bypass_attempt_9999', '/api/pairing/verify');
    assert.strictEqual(fakePairRes.statusCode, 401, 'Loose prefix token must be rejected with 401');
    assert.strictEqual(fakePairRes.data.success, false);

    // 2. Server-side Financial Masking for Cashier Role
    // 2a. Dashboard Stats
    const cashierStatsRes = await makeApiCall(4927, server.pairingToken, '/api/dashboard/stats', 'GET', null, { 'X-User-Role': 'cashier' });
    assert.strictEqual(cashierStatsRes.statusCode, 200);
    assert.strictEqual(cashierStatsRes.data.masked, true, 'Dashboard must indicate masked: true for cashier');
    assert.strictEqual(cashierStatsRes.data.today_profit, null, 'Cashier must not see today_profit');
    assert.strictEqual(cashierStatsRes.data.stats.profit, null, 'Cashier must not see stats.profit');
    assert.deepStrictEqual(cashierStatsRes.data.hourly_velocity, [], 'Cashier must receive empty hourly_velocity');

    // 2b. Products Catalog Cost Masking
    const cashierProductsRes = await makeApiCall(4927, server.pairingToken, '/api/products', 'GET', null, { 'X-User-Role': 'cashier' });
    assert.strictEqual(cashierProductsRes.statusCode, 200);
    for (const p of cashierProductsRes.data.products) {
      assert.strictEqual(p.cost, null, `Product ${p.id} cost must be null for cashier`);
      assert.strictEqual(p.cost_price, null, `Product ${p.id} cost_price must be null for cashier`);
    }

    // 3. Proportional Decant Fractional Stock Deduction
    testDb.exec(`
      INSERT INTO products (id, barcode, name, price, cost_price, stock_quantity, unit)
      VALUES ('p_decant_bottle_100', '628999001', 'زجاجة عود فاخر 100ml', 500, 200, 10.0, 'bottle');
    `);

    const decantSaleRes = await makeApiCall(4927, server.pairingToken, '/api/pos/checkout', 'POST', {
      totalAmount: 100,
      total: 100,
      paymentType: 'cash',
      items: [
        {
          productId: 'p_decant_bottle_100',
          name: 'تعبئة 20ml عود فاخر',
          cart_qty: 1,
          quantity: 1,
          unitPrice: 100,
          portion_ml: 20,
          capacity: 100
        }
      ]
    });
    assert.strictEqual(decantSaleRes.statusCode, 200);
    assert.strictEqual(decantSaleRes.data.success, true);

    const remainingStock = testDb.prepare(`SELECT stock_quantity FROM products WHERE id = 'p_decant_bottle_100'`).get().stock_quantity;
    // 10.0 - (1 * 20 / 100) = 9.80
    assert.strictEqual(Math.round(remainingStock * 100) / 100, 9.80, `Expected 9.80 bottles remaining, found ${remainingStock}`);

    // 4. Stock Audit Sub-millisecond Rapid Scanning (Zero Note Primary Key Collisions)
    const rapidAudits = Array.from({ length: 20 }, (_, i) =>
      makeApiCall(4927, server.pairingToken, '/api/inventory/adjust', 'POST', {
        productId: 'p_decant_bottle_100',
        newQuantity: 9.80 - (i * 0.1),
        reason: `جرد سريع رقم ${i + 1}`
      })
    );

    const auditResults = await Promise.all(rapidAudits);
    for (let i = 0; i < auditResults.length; i++) {
      assert.strictEqual(auditResults[i].statusCode, 200, `Rapid audit #${i} must succeed`);
      assert.strictEqual(auditResults[i].data.success, true);
    }

    const noteCount = testDb.prepare(`SELECT COUNT(*) as cnt FROM notes WHERE id LIKE 'AUDIT-%'`).get().cnt;
    assert.strictEqual(noteCount, 20, `Expected exactly 20 distinct audit note entries, found ${noteCount}`);

    stopMobileBridgeServer();
    testDb.close();
  });

  return results;
}
