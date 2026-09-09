/**
 * Suite 29: Mathematical Invariants, Decant Proportioning, Stock Conservation & Cash Drawer Reconciliation
 *
 * Comprehensive tests for:
 * 1. POS Retail vs Wholesale Pricing & Discount Invariant Math (% & Fixed bounds)
 * 2. Decant Proportional Math & Fractional Inventory Accounting (Parent bottle decrements)
 * 3. Bidirectional Stock Conservation Across All 6 Operations (Purchases, Sales, Returns, Compounding, Losses, Gifts)
 * 4. Weighted Average Cost (WAC) Inventory Valuation & Edge Cases
 * 5. Cash Drawer Shift Closing Reconciliation Equation & Multi-Payment Isolation
 * 6. Zero-Negative Boundary Clamping (MAX(0, ...)), NaN/Infinity Immunity & Precision
 */

import assert from 'assert';
import Database from 'better-sqlite3';
import {
  calculateWAC,
  safeParseFloat,
  safeDivide,
  calculatePercentage,
  clamp,
  roundToTwo
} from '../../src/utils/helpers.js';
import { createTestDb } from '../harness/test-db.js';

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

  // =========================================================================
  // 1. POS RETAIL VS WHOLESALE PRICING & DISCOUNT BOUNDS MATH
  // =========================================================================

  await test('29.1.1 POS Pricing Modes: Retail vs Wholesale Unit Pricing & Fallbacks', async () => {
    const productA = { id: 'p1', name: 'عطر العود الفاخر', price: 120.00, wholesale_price: 90.00, cost: 50.00 };
    const productB = { id: 'p2', name: 'عطر الياسمين', price: 80.00, wholesale_price: 0, cost: 35.00 }; // 0 wholesale fallback
    const productC = { id: 'p3', name: 'عطر الورد', price: 65.00, wholesale_price: null, cost: 25.00 }; // null wholesale fallback

    // Retail Mode
    const getFinalPrice = (product, mode, customPrice = null) => {
      if (customPrice !== null) return customPrice;
      return mode === 'wholesale' ? (product.wholesale_price || product.price) : product.price;
    };

    assert.strictEqual(getFinalPrice(productA, 'retail'), 120.00, 'Product A retail price must be 120.00');
    assert.strictEqual(getFinalPrice(productA, 'wholesale'), 90.00, 'Product A wholesale price must be 90.00');

    // Fallbacks to retail price when wholesale is 0 or null
    assert.strictEqual(getFinalPrice(productB, 'wholesale'), 80.00, 'Product B wholesale price fallback to retail 80.00');
    assert.strictEqual(getFinalPrice(productC, 'wholesale'), 65.00, 'Product C wholesale price fallback to retail 65.00');

    // Custom price override
    assert.strictEqual(getFinalPrice(productA, 'retail', 110.00), 110.00, 'Custom price overrides retail');
    assert.strictEqual(getFinalPrice(productA, 'wholesale', 85.00), 85.00, 'Custom price overrides wholesale');
  });

  await test('29.1.2 Percentage Discount Bounds, Subtotal, Net Total & Profit Calculations', async () => {
    const calculateSaleTotals = (items, discountRate, discountType = 'percentage') => {
      const subtotal = items.reduce((sum, item) => sum + (item.final_price * item.cart_qty), 0);
      const totalCost = items.reduce((sum, item) => sum + (item.unit_cost * item.cart_qty), 0);

      let discountAmount = 0;
      if (discountType === 'percentage') {
        const boundedDiscountRate = clamp(safeParseFloat(discountRate, 0), 0, 100);
        discountAmount = roundToTwo(subtotal * (boundedDiscountRate / 100));
      } else {
        const boundedDiscountFixed = Math.max(0, safeParseFloat(discountRate, 0));
        discountAmount = Math.min(subtotal, boundedDiscountFixed);
      }

      const total = Math.max(0, roundToTwo(subtotal - discountAmount));
      const grossProfit = roundToTwo((subtotal - totalCost) - discountAmount);

      return { subtotal: roundToTwo(subtotal), discountAmount, total, grossProfit, totalCost: roundToTwo(totalCost) };
    };

    const cart = [
      { product_id: 'p1', final_price: 100.00, unit_cost: 40.00, cart_qty: 2 }, // 200 rev, 80 cost
      { product_id: 'p2', final_price: 50.00, unit_cost: 20.00, cart_qty: 3 }   // 150 rev, 60 cost
    ]; // Subtotal = 350, Total Cost = 140

    // Standard 10% discount
    const res10 = calculateSaleTotals(cart, 10, 'percentage');
    assert.strictEqual(res10.subtotal, 350.00);
    assert.strictEqual(res10.discountAmount, 35.00);
    assert.strictEqual(res10.total, 315.00);
    assert.strictEqual(res10.grossProfit, 175.00, 'Gross profit = (350 - 140) - 35 = 175.00');

    // 0% discount
    const res0 = calculateSaleTotals(cart, 0, 'percentage');
    assert.strictEqual(res0.discountAmount, 0.00);
    assert.strictEqual(res0.total, 350.00);
    assert.strictEqual(res0.grossProfit, 210.00);

    // 100% discount (Free promotional sale)
    const res100 = calculateSaleTotals(cart, 100, 'percentage');
    assert.strictEqual(res100.discountAmount, 350.00);
    assert.strictEqual(res100.total, 0.00);
    assert.strictEqual(res100.grossProfit, -140.00, '100% discount incurs loss equal to COGS');

    // Boundary: Over 100% discount (e.g. 150%) must be clamped to 100%
    const res150 = calculateSaleTotals(cart, 150, 'percentage');
    assert.strictEqual(res150.discountAmount, 350.00);
    assert.strictEqual(res150.total, 0.00);

    // Boundary: Negative discount (e.g. -20%) must be clamped to 0%
    const resNeg = calculateSaleTotals(cart, -20, 'percentage');
    assert.strictEqual(resNeg.discountAmount, 0.00);
    assert.strictEqual(resNeg.total, 350.00);
  });

  await test('29.1.3 Fixed Discount Bounds & Non-Negative Total Guarantees', async () => {
    const calculateFixedTotals = (subtotal, totalCost, fixedDiscount) => {
      const parsedDiscount = Math.max(0, safeParseFloat(fixedDiscount, 0));
      const discountAmount = Math.min(subtotal, parsedDiscount);
      const total = Math.max(0, roundToTwo(subtotal - discountAmount));
      const profit = roundToTwo((subtotal - totalCost) - discountAmount);
      return { discountAmount, total, profit };
    };

    const subtotal = 200.00;
    const cost = 80.00;

    // Normal fixed discount: $50
    const normal = calculateFixedTotals(subtotal, cost, 50.00);
    assert.strictEqual(normal.discountAmount, 50.00);
    assert.strictEqual(normal.total, 150.00);
    assert.strictEqual(normal.profit, 70.00);

    // Exact subtotal discount: $200
    const exact = calculateFixedTotals(subtotal, cost, 200.00);
    assert.strictEqual(exact.discountAmount, 200.00);
    assert.strictEqual(exact.total, 0.00);
    assert.strictEqual(exact.profit, -80.00);

    // Excessive fixed discount: $300 (must be clamped to subtotal $200, total must not be negative)
    const excessive = calculateFixedTotals(subtotal, cost, 300.00);
    assert.strictEqual(excessive.discountAmount, 200.00, 'Discount amount cannot exceed subtotal');
    assert.strictEqual(excessive.total, 0.00, 'Total cannot be negative');
    assert.strictEqual(excessive.profit, -80.00);
  });

  // =========================================================================
  // 2. DECANT PROPORTIONAL MATH & FRACTIONAL INVENTORY ACCOUNTING
  // =========================================================================

  await test('29.2.1 Decant Proportional Math: 100ml Parent -> 10ml Decants Stock Decrements', async () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE inventory (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        qty REAL DEFAULT 0,
        cost REAL DEFAULT 0,
        price REAL DEFAULT 0,
        capacity REAL DEFAULT 0
      );
      CREATE TABLE sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        total REAL
      );
      CREATE TABLE sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER,
        product_id TEXT,
        cart_qty REAL,
        unit_cost REAL,
        final_price REAL,
        portion_ml REAL
      );
    `);

    // Parent bottle: 100ml bottle with 5 bottles in stock, cost = $50/bottle ($0.50/ml)
    db.prepare('INSERT INTO inventory (id, name, qty, cost, price, capacity) VALUES (?, ?, ?, ?, ?, ?)').run(
      'bottle_100ml', 'عطر عنبر 100 مل', 5.0, 50.00, 150.00, 100.0
    );

    // Function to calculate stock deduction for decants
    const computeDeduction = (cartQty, portionMl, capacity) => {
      if (portionMl && capacity && capacity > 0) {
        return (cartQty * portionMl) / capacity;
      }
      return cartQty;
    };

    // Case A: 1 portion of 10ml -> deducts (1 * 10) / 100 = 0.10 bottles
    const ded1 = computeDeduction(1, 10, 100);
    assert.strictEqual(ded1, 0.10, '10ml portion from 100ml bottle must decrement stock by 0.10');

    // Case B: 3 portions of 15ml -> deducts (3 * 15) / 100 = 0.45 bottles
    const ded2 = computeDeduction(3, 15, 100);
    assert.strictEqual(ded2, 0.45, '3x 15ml portions from 100ml bottle must decrement stock by 0.45');

    // Case C: 2 portions of 50ml -> deducts (2 * 50) / 100 = 1.00 bottle
    const ded3 = computeDeduction(2, 50, 100);
    assert.strictEqual(ded3, 1.00, '2x 50ml portions from 100ml bottle must decrement stock by 1.00');

    // Execute atomic decant sale in SQLite
    const saleTx = db.transaction(() => {
      const sale = db.prepare('INSERT INTO sales (date, total) VALUES (?, ?)').run(new Date().toISOString(), 75.00);
      const saleId = sale.lastInsertRowid;

      // Sell 1 portion of 10ml for $25.00 (unit cost = 50 * 10 / 100 = $5.00)
      const portionMl = 10;
      const capacity = 100;
      const cartQty = 1;
      const unitCost = 50.00 * (portionMl / capacity); // 5.00
      const finalPrice = 25.00;
      const qtyToDeduct = computeDeduction(cartQty, portionMl, capacity); // 0.10

      db.prepare(`
        INSERT INTO sale_items (sale_id, product_id, cart_qty, unit_cost, final_price, portion_ml)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(saleId, 'bottle_100ml', cartQty, unitCost, finalPrice, portionMl);

      db.prepare('UPDATE inventory SET qty = round(qty - ?, 4) WHERE id = ?').run(qtyToDeduct, 'bottle_100ml');
    });

    saleTx();

    const parent = db.prepare('SELECT * FROM inventory WHERE id = ?').get('bottle_100ml');
    assert.strictEqual(parent.qty, 4.90, 'Stock must decrease from 5.0 to 4.90');

    // Execute 9 more 10ml sales to complete 1 full bottle decrement
    for (let i = 0; i < 9; i++) {
      const ded = computeDeduction(1, 10, 100);
      db.prepare('UPDATE inventory SET qty = round(qty - ?, 4) WHERE id = ?').run(ded, 'bottle_100ml');
    }

    const parentAfter10 = db.prepare('SELECT * FROM inventory WHERE id = ?').get('bottle_100ml');
    assert.strictEqual(parentAfter10.qty, 4.00, '10 decants of 10ml must decrement exactly 1 full bottle (4.00 remaining)');
  });

  // =========================================================================
  // 3. FULL BIDIRECTIONAL STOCK CONSERVATION ACROSS ALL 6 STREAMS
  // =========================================================================

  await test('29.3.1 Bidirectional Stock Conservation Across Purchases, Sales, Returns, Lab, Losses & Gifts', async () => {
    const testDb = createTestDb();

    // Initial Inventory Setup
    // P1: Finished Perfume (Initial = 100 units @ cost $40)
    // Oil1: Raw Oud Oil (Initial = 1000 ml @ cost $1.50/ml)
    // Alc1: Alcohol Solvent (Initial = 5000 ml @ cost $0.05/ml)
    // Bot1: Empty Bottle 50ml (Initial = 200 pcs @ cost $3.00/pc)
    testDb.run('INSERT INTO inventory (id, name, category, qty, cost, price) VALUES (?, ?, ?, ?, ?, ?)', [
      'p_perfume', 'عطر المسك الأزرق', 'عطور', 100.0, 40.0, 100.0
    ]);
    testDb.run('INSERT INTO inventory (id, name, category, qty, cost, price) VALUES (?, ?, ?, ?, ?, ?)', [
      'raw_oil', 'زيت عود ملكي', 'زيوت', 1000.0, 1.5, 0
    ]);
    testDb.run('INSERT INTO inventory (id, name, category, qty, cost, price) VALUES (?, ?, ?, ?, ?, ?)', [
      'raw_alc', 'كحول نقي', 'كحول', 5000.0, 0.05, 0
    ]);
    testDb.run('INSERT INTO inventory (id, name, category, qty, cost, price) VALUES (?, ?, ?, ?, ?, ?)', [
      'raw_bot', 'زجاجة فارغة 50 مل', 'زجاجات', 200.0, 3.0, 0
    ]);

    let expectedPStock = 100.0;

    // 1. Purchases (+): Buy 40 units of P1
    testDb.run('UPDATE inventory SET qty = qty + ? WHERE id = ?', [40.0, 'p_perfume']);
    expectedPStock += 40.0; // 140.0
    assert.strictEqual(testDb.get('SELECT qty FROM inventory WHERE id = ?', ['p_perfume']).qty, expectedPStock);

    // 2. Sales (-): Sell 25 units of P1
    testDb.run('UPDATE inventory SET qty = qty - ? WHERE id = ?', [25.0, 'p_perfume']);
    expectedPStock -= 25.0; // 115.0
    assert.strictEqual(testDb.get('SELECT qty FROM inventory WHERE id = ?', ['p_perfume']).qty, expectedPStock);

    // 3. Returns (+): Customer returns 5 units of P1
    testDb.run('UPDATE inventory SET qty = qty + ? WHERE id = ?', [5.0, 'p_perfume']);
    expectedPStock += 5.0; // 120.0
    assert.strictEqual(testDb.get('SELECT qty FROM inventory WHERE id = ?', ['p_perfume']).qty, expectedPStock);

    // 4. Compounding in Lab: Produce 10 new bottles of P1 from Raw Materials
    // Formula per bottle: 10ml oil + 40ml solvent + 1 bottle
    const batchQty = 10;
    testDb.transaction([
      { sql: 'UPDATE inventory SET qty = qty + ? WHERE id = ?', params: [batchQty, 'p_perfume'] },
      { sql: 'UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?', params: [batchQty * 10, 'raw_oil'] },
      { sql: 'UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?', params: [batchQty * 40, 'raw_alc'] },
      { sql: 'UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?', params: [batchQty * 1, 'raw_bot'] }
    ]);
    expectedPStock += batchQty; // 130.0
    assert.strictEqual(testDb.get('SELECT qty FROM inventory WHERE id = ?', ['p_perfume']).qty, expectedPStock);
    assert.strictEqual(testDb.get('SELECT qty FROM inventory WHERE id = ?', ['raw_oil']).qty, 900.0); // 1000 - 100
    assert.strictEqual(testDb.get('SELECT qty FROM inventory WHERE id = ?', ['raw_alc']).qty, 4600.0); // 5000 - 400
    assert.strictEqual(testDb.get('SELECT qty FROM inventory WHERE id = ?', ['raw_bot']).qty, 190.0); // 200 - 10

    // 5. Losses (-): 4 bottles broken
    testDb.run('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?', [4.0, 'p_perfume']);
    expectedPStock -= 4.0; // 126.0
    assert.strictEqual(testDb.get('SELECT qty FROM inventory WHERE id = ?', ['p_perfume']).qty, expectedPStock);

    // 6. Promotional Gifts (-): 6 tester bottles given out
    testDb.run('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?', [6.0, 'p_perfume']);
    expectedPStock -= 6.0; // 120.0
    assert.strictEqual(testDb.get('SELECT qty FROM inventory WHERE id = ?', ['p_perfume']).qty, expectedPStock);

    // 7. Deletion Restorations:
    // Delete Loss record -> Restores +4 bottles
    testDb.run('UPDATE inventory SET qty = qty + ? WHERE id = ?', [4.0, 'p_perfume']);
    expectedPStock += 4.0; // 124.0

    // Delete Gift record -> Restores +6 bottles
    testDb.run('UPDATE inventory SET qty = qty + ? WHERE id = ?', [6.0, 'p_perfume']);
    expectedPStock += 6.0; // 130.0

    assert.strictEqual(testDb.get('SELECT qty FROM inventory WHERE id = ?', ['p_perfume']).qty, expectedPStock);
    assert.strictEqual(expectedPStock, 130.0, 'Final verified inventory balance must be exactly 130.0');

    testDb.close();
  });

  // =========================================================================
  // 4. WEIGHTED AVERAGE COST (WAC) INVENTORY VALUATION
  // =========================================================================

  await test('29.4.1 Multi-Stage Weighted Average Cost (WAC) Valuation & Edge Cases', async () => {
    // Stage 1: Initial Purchase of 100 units @ $20.00
    let currentQty = 100;
    let currentCost = 20.00;

    // Stage 2: Purchase 50 units @ $35.00
    // New WAC = (100 * 20 + 50 * 35) / (100 + 50) = (2000 + 1750) / 150 = 3750 / 150 = $25.00
    currentCost = calculateWAC(currentQty, currentCost, 50, 35.00);
    currentQty += 50;
    assert.strictEqual(roundToTwo(currentCost), 25.00, 'Stage 2 WAC must be 25.00');

    // Stage 3: Sale occurs (100 units sold @ WAC 25.00). Remaining stock = 50 units @ WAC 25.00
    currentQty -= 100;
    assert.strictEqual(currentQty, 50);

    // Stage 4: Purchase 150 units @ $45.00
    // New WAC = (50 * 25 + 150 * 45) / (50 + 150) = (1250 + 6750) / 200 = 8000 / 200 = $40.00
    currentCost = calculateWAC(currentQty, currentCost, 150, 45.00);
    currentQty += 150;
    assert.strictEqual(roundToTwo(currentCost), 40.00, 'Stage 4 WAC must be 40.00');

    // Stage 5: Fractional Purchase
    // 200 units @ 40.00 + 33.33 units @ 55.50
    // Total Cost = (200 * 40) + (33.33 * 55.50) = 8000 + 1849.815 = 9849.815
    // Total Qty = 233.33
    // WAC = 9849.815 / 233.33 = 42.21409... -> 42.21
    const fracCost = calculateWAC(200, 40.00, 33.33, 55.50);
    assert.strictEqual(roundToTwo(fracCost), 42.21, 'Fractional WAC must be 42.21');

    // Edge Cases:
    // Zero old stock: adopts new purchase unit cost directly
    assert.strictEqual(calculateWAC(0, 0, 80, 29.99), 29.99);
    // Zero total stock: returns new cost safely without division by zero
    assert.strictEqual(calculateWAC(0, 10, 0, 60), 60);
  });

  // =========================================================================
  // 5. CASH DRAWER CLOSING RECONCILIATION EQUATION & PAYMENT ISOLATION
  // =========================================================================

  await test('29.5.1 Cash Drawer Master Reconciliation Equation with Multi-Payment Isolation', async () => {
    // Master Equation:
    // Expected Cash = Initial/Opening Cash + Cash Sales + Capital Injections - Cash Withdrawals - Cash Purchases - Cash Returns
    // CRITICAL: Non-cash payments (Card, Bank Transfer, Debt) MUST NOT enter the cash drawer!
    // CRITICAL: Debt purchases MUST NOT deduct from the cash drawer!

    const openingCash = 750.00;

    // Sales Breakdown:
    const cashSales = 3200.00;
    const cardSales = 1500.00;       // Excluded from cash drawer
    const bankTransferSales = 850.00; // Excluded from cash drawer
    const debtSales = 600.00;        // Excluded from cash drawer
    const totalSalesRevenue = cashSales + cardSales + bankTransferSales + debtSales; // 6150.00

    // Capital Injections (Cash In):
    const capitalInjections = 1200.00;

    // Withdrawals / Expenses (Cash Out):
    const cashWithdrawals = 450.00;

    // Purchases Breakdown:
    const cashPurchases = 900.00;    // Deducted from cash drawer
    const debtPurchases = 2500.00;   // Excluded from cash drawer
    const totalPurchases = cashPurchases + debtPurchases; // 3400.00

    // Returns Breakdown:
    const cashReturns = 300.00;      // Refunded in cash to customer

    // Expected Cash Calculation:
    const expectedCash = roundToTwo(
      openingCash + cashSales + capitalInjections - cashWithdrawals - cashPurchases - cashReturns
    );
    // 750 + 3200 + 1200 - 450 - 900 - 300 = 5150 - 1650 = 3500.00
    assert.strictEqual(expectedCash, 3500.00, 'Expected cash in drawer must be exactly 3,500.00');

    // Variance Analysis (Counted - Expected):
    // Scenario 1: Exact Balance (مطابق)
    const counted1 = 3500.00;
    const var1 = roundToTwo(counted1 - expectedCash);
    assert.strictEqual(var1, 0.00, 'Zero variance on exact match');

    // Scenario 2: Cash Surplus (فائض) +125.50
    const counted2 = 3625.50;
    const var2 = roundToTwo(counted2 - expectedCash);
    assert.strictEqual(var2, 125.50, 'Surplus must be positive 125.50');

    // Scenario 3: Cash Shortage (عجز) -75.25
    const counted3 = 3424.75;
    const var3 = roundToTwo(counted3 - expectedCash);
    assert.strictEqual(var3, -75.25, 'Deficit must be negative -75.25');
  });

  // =========================================================================
  // 6. ZERO-NEGATIVE BOUNDARY CLAMPING, NAN/INFINITY IMMUNITY & PRECISION
  // =========================================================================

  await test('29.6.1 Zero-Floor Boundary Clamping (MAX(0, ...)) on Stock and Debt', async () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE inventory (id TEXT PRIMARY KEY, qty REAL);
      CREATE TABLE debtors (id TEXT PRIMARY KEY, total_debt REAL);
    `);

    db.prepare('INSERT INTO inventory (id, qty) VALUES (?, ?)').run('item_low', 3.0);
    db.prepare('INSERT INTO debtors (id, total_debt) VALUES (?, ?)').run('debtor_1', 100.0);

    // Over-deduct stock: deduct 10 from 3 -> should clamp to 0
    db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(10.0, 'item_low');
    const inv = db.prepare('SELECT qty FROM inventory WHERE id = ?').get('item_low');
    assert.strictEqual(inv.qty, 0, 'Inventory stock must never fall below zero');

    // Over-pay debt: pay 150 towards 100 debt -> should clamp to 0
    db.prepare('UPDATE debtors SET total_debt = MAX(0, total_debt - ?) WHERE id = ?').run(150.0, 'debtor_1');
    const deb = db.prepare('SELECT total_debt FROM debtors WHERE id = ?').get('debtor_1');
    assert.strictEqual(deb.total_debt, 0, 'Debtor total debt must never fall below zero');
  });

  await test('29.6.2 Mathematical Immunity Against NaN, Infinity, Null & Undefined Inputs', async () => {
    // safeParseFloat robustness
    assert.strictEqual(safeParseFloat(null, 0), 0);
    assert.strictEqual(safeParseFloat(undefined, 42), 42);
    assert.strictEqual(safeParseFloat('not-a-number', 99), 99);
    assert.strictEqual(safeParseFloat(NaN, 10), 10);
    assert.strictEqual(safeParseFloat(Infinity, 0), 0);
    assert.strictEqual(safeParseFloat(-Infinity, 0), 0);
    assert.strictEqual(safeParseFloat('123.45', 0), 123.45);

    // safeDivide robustness
    assert.strictEqual(safeDivide(100, 0), 0, 'safeDivide by zero must return 0, not Infinity');
    assert.strictEqual(safeDivide(0, 0), 0, 'safeDivide 0/0 must return 0, not NaN');
    assert.strictEqual(safeDivide(50, 2), 25);

    // calculatePercentage robustness
    assert.strictEqual(calculatePercentage(25, 0), 0, 'Percentage of 0 total must return 0');
    assert.strictEqual(calculatePercentage(25, 100), 25);
    assert.strictEqual(calculatePercentage(50, 200), 25);

    // clamp utility
    assert.strictEqual(clamp(-10, 0, 100), 0);
    assert.strictEqual(clamp(150, 0, 100), 100);
    assert.strictEqual(clamp(45, 0, 100), 45);

    // roundToTwo floating point resolution
    assert.strictEqual(roundToTwo(0.1 + 0.2), 0.3, '0.1 + 0.2 must round to exactly 0.3');
    assert.strictEqual(roundToTwo(10.556), 10.56, '10.556 must round to 10.56');
    assert.strictEqual(roundToTwo(1.234), 1.23, '1.234 must round to 1.23');
    assert.strictEqual(roundToTwo(NaN), 0, 'NaN input to roundToTwo must safely return 0');
    assert.strictEqual(roundToTwo(null), 0, 'null input to roundToTwo must safely return 0');
  });

  return results;
}
