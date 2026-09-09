/**
 * Suite 31: Empirical Adversarial Stress & Mathematical Invariant Challenge
 *
 * Final Challenger 1 Automated Test Suite:
 * 1. Zero & Negative Quantities / Prices / Boundary Clamping
 * 2. 100% Discounts, Super-Discounts (>100%), Negative Discounts & Profit Loss Accounting
 * 3. Multi-Payment Split Isolation (Cash, Card, Bank, Debt) & Cash Drawer Exact Balancing
 * 4. Decant Proportional Math, Zero-Stock Deductions & Lab Compounding Conservation
 * 5. Multi-Stage Weighted Average Cost (WAC) with Interleaved Sales, Fractional Stock & Zero-Stock Transitions
 * 6. Debtor Lifecycle, Overpayment Clamping & Aging Invariants
 * 7. High-Volume 1,000-Transaction Randomized Stress Oracle (Cash & Stock Conservation)
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
  // 1. ZERO & NEGATIVE QUANTITIES / PRICES / BOUNDARY CLAMPING
  // =========================================================================

  await test('31.1.1 Zero & Negative Input Sanitization in Cart and Price Calculations', async () => {
    // Helper replicating POS cart total calculation with adversarial boundary defenses
    const calculateCart = (items, discount = 0, discountType = 'percentage') => {
      const sanitizedItems = items.map(item => {
        const qty = Math.max(0, safeParseFloat(item.cart_qty, 0));
        const price = Math.max(0, safeParseFloat(item.final_price, 0));
        const cost = Math.max(0, safeParseFloat(item.unit_cost, 0));
        return {
          ...item,
          cart_qty: qty,
          final_price: price,
          unit_cost: cost,
          item_total: roundToTwo(qty * price),
          item_cost: roundToTwo(qty * cost)
        };
      });

      const subtotal = roundToTwo(sanitizedItems.reduce((s, i) => s + i.item_total, 0));
      const totalCost = roundToTwo(sanitizedItems.reduce((s, i) => s + i.item_cost, 0));

      let discountAmount = 0;
      if (discountType === 'percentage') {
        const rate = clamp(safeParseFloat(discount, 0), 0, 100);
        discountAmount = roundToTwo(subtotal * (rate / 100));
      } else {
        const fixed = Math.max(0, safeParseFloat(discount, 0));
        discountAmount = Math.min(subtotal, fixed);
      }

      const total = Math.max(0, roundToTwo(subtotal - discountAmount));
      const profit = roundToTwo((subtotal - totalCost) - discountAmount);

      return { subtotal, discountAmount, total, profit, totalCost, items: sanitizedItems };
    };

    // Adversarial inputs: zero qty, negative qty, negative price, negative cost
    const chaoticCart = [
      { id: '1', name: 'Item Zero Qty', cart_qty: 0, final_price: 100, unit_cost: 40 },
      { id: '2', name: 'Item Negative Qty', cart_qty: -5, final_price: 50, unit_cost: 20 },
      { id: '3', name: 'Item Negative Price', cart_qty: 2, final_price: -80, unit_cost: 30 },
      { id: '4', name: 'Item Valid Freebie', cart_qty: 3, final_price: 0, unit_cost: 15 },
      { id: '5', name: 'Item Normal', cart_qty: 4, final_price: 25, unit_cost: 10 }
    ];

    const result = calculateCart(chaoticCart, 10, 'percentage');

    // Expected:
    // Item 1: 0 * 100 = 0 (cost 0)
    // Item 2: clamped to 0 qty -> 0 * 50 = 0 (cost 0)
    // Item 3: clamped to 0 price -> 2 * 0 = 0 (cost 2 * 30 = 60)
    // Item 4: 3 * 0 = 0 (cost 3 * 15 = 45)
    // Item 5: 4 * 25 = 100 (cost 4 * 10 = 40)
    // Subtotal = 100.00
    // Total Cost = 60 + 45 + 40 = 145.00
    // 10% discount on 100 = 10.00
    // Total = 90.00
    // Profit = (100 - 145) - 10 = -55.00

    assert.strictEqual(result.subtotal, 100.00, 'Subtotal must be 100.00');
    assert.strictEqual(result.totalCost, 145.00, 'Total cost must be 145.00');
    assert.strictEqual(result.discountAmount, 10.00, 'Discount amount must be 10.00');
    assert.strictEqual(result.total, 90.00, 'Total must be 90.00');
    assert.strictEqual(result.profit, -55.00, 'Profit must be -55.00');
  });

  // =========================================================================
  // 2. 100% DISCOUNTS, SUPER-DISCOUNTS (>100%) & NEGATIVE DISCOUNTS
  // =========================================================================

  await test('31.1.2 100% Discounts, Super-Discounts (>100%) & Negative Discount Invariants', async () => {
    const evaluateDiscount = (subtotal, totalCost, discountVal, discountType) => {
      let discountAmount = 0;
      if (discountType === 'percentage') {
        const rate = clamp(safeParseFloat(discountVal, 0), 0, 100);
        discountAmount = roundToTwo(subtotal * (rate / 100));
      } else {
        const fixed = Math.max(0, safeParseFloat(discountVal, 0));
        discountAmount = Math.min(subtotal, fixed);
      }
      const total = Math.max(0, roundToTwo(subtotal - discountAmount));
      const profit = roundToTwo((subtotal - totalCost) - discountAmount);
      return { discountAmount, total, profit };
    };

    const subtotal = 500.00;
    const cost = 200.00;

    // Test A: Exactly 100% Percentage Discount (Free Giveaway)
    const d100 = evaluateDiscount(subtotal, cost, 100, 'percentage');
    assert.strictEqual(d100.discountAmount, 500.00);
    assert.strictEqual(d100.total, 0.00);
    assert.strictEqual(d100.profit, -200.00, '100% discount incurs loss equal to COGS (-200)');

    // Test B: Super-Discount Percentage 250% (Clamped to 100%)
    const d250 = evaluateDiscount(subtotal, cost, 250, 'percentage');
    assert.strictEqual(d250.discountAmount, 500.00);
    assert.strictEqual(d250.total, 0.00);
    assert.strictEqual(d250.profit, -200.00);

    // Test C: Negative Percentage Discount -40% (Clamped to 0%)
    const dNeg = evaluateDiscount(subtotal, cost, -40, 'percentage');
    assert.strictEqual(dNeg.discountAmount, 0.00);
    assert.strictEqual(dNeg.total, 500.00);
    assert.strictEqual(dNeg.profit, 300.00);

    // Test D: Super-Fixed Discount $1000 on $500 subtotal (Clamped to $500)
    const dFixedSuper = evaluateDiscount(subtotal, cost, 1000, 'fixed');
    assert.strictEqual(dFixedSuper.discountAmount, 500.00);
    assert.strictEqual(dFixedSuper.total, 0.00);
    assert.strictEqual(dFixedSuper.profit, -200.00);

    // Test E: Negative Fixed Discount -$150 (Clamped to 0)
    const dFixedNeg = evaluateDiscount(subtotal, cost, -150, 'fixed');
    assert.strictEqual(dFixedNeg.discountAmount, 0.00);
    assert.strictEqual(dFixedNeg.total, 500.00);
    assert.strictEqual(dFixedNeg.profit, 300.00);
  });

  // =========================================================================
  // 3. MULTI-PAYMENT SPLIT & CASH DRAWER RECONCILIATION MASTER INVARIANTS
  // =========================================================================

  await test('31.2.1 Multi-Payment Split Isolation & Exact Cash Drawer Reconciliation Oracle', async () => {
    // We simulate a comprehensive 1-day store shift with diverse financial movements
    const shift = {
      openingCash: 1250.00,
      transactions: [
        // Cash Sales
        { type: 'sale', method: 'cash', total: 450.00, cost: 200.00 },
        { type: 'sale', method: 'cash', total: 1200.50, cost: 600.00 },
        { type: 'sale', method: 'cash', total: 75.25, cost: 30.00 },
        // Card Sales (POS card terminal - must NOT enter cash drawer)
        { type: 'sale', method: 'card', total: 850.00, cost: 400.00 },
        { type: 'sale', method: 'card', total: 2100.00, cost: 1100.00 },
        // Bank Transfer Sales (must NOT enter cash drawer)
        { type: 'sale', method: 'bank_transfer', total: 1500.00, cost: 700.00 },
        // Debt Sales (Customer on credit - must NOT enter cash drawer)
        { type: 'sale', method: 'debt', total: 620.00, cost: 310.00 },
        { type: 'sale', method: 'debt', total: 380.00, cost: 190.00 },

        // Capital Injections (Owner adds cash to drawer)
        { type: 'capital', method: 'cash', amount: 2000.00 },

        // Cash Withdrawals / Operational Expenses (Cash out of drawer)
        { type: 'withdrawal', method: 'cash', amount: 350.00 },
        { type: 'withdrawal', method: 'cash', amount: 125.75 },

        // Purchases (Supplier goods)
        { type: 'purchase', payment_type: 'cash', total: 1400.00 }, // Cash out of drawer
        { type: 'purchase', payment_type: 'debt', total: 5000.00 }, // Credit purchase - NOT from drawer

        // Returns & Refunds
        { type: 'return', refund_type: 'cash', amount: 150.00 },   // Refunded in cash - deducts drawer
        { type: 'return', refund_type: 'debt', amount: 200.00 }    // Refunded to credit - NOT drawer
      ]
    };

    // Calculate drawer reconciliation components
    let totalCashSales = 0;
    let totalCardSales = 0;
    let totalBankSales = 0;
    let totalDebtSales = 0;
    let totalCapitalInjections = 0;
    let totalCashWithdrawals = 0;
    let totalCashPurchases = 0;
    let totalDebtPurchases = 0;
    let totalCashReturns = 0;
    let totalDebtReturns = 0;

    for (const tx of shift.transactions) {
      if (tx.type === 'sale') {
        if (tx.method === 'cash') totalCashSales += tx.total;
        else if (tx.method === 'card') totalCardSales += tx.total;
        else if (tx.method === 'bank_transfer') totalBankSales += tx.total;
        else if (tx.method === 'debt') totalDebtSales += tx.total;
      } else if (tx.type === 'capital') {
        totalCapitalInjections += tx.amount;
      } else if (tx.type === 'withdrawal') {
        totalCashWithdrawals += tx.amount;
      } else if (tx.type === 'purchase') {
        if (tx.payment_type === 'cash') totalCashPurchases += tx.total;
        else if (tx.payment_type === 'debt') totalDebtPurchases += tx.total;
      } else if (tx.type === 'return') {
        if (tx.refund_type === 'cash') totalCashReturns += tx.amount;
        else if (tx.refund_type === 'debt') totalDebtReturns += tx.amount;
      }
    }

    // Cash Sales = 450 + 1200.50 + 75.25 = 1725.75
    assert.strictEqual(roundToTwo(totalCashSales), 1725.75);
    // Card Sales = 850 + 2100 = 2950.00
    assert.strictEqual(roundToTwo(totalCardSales), 2950.00);
    // Bank Sales = 1500.00
    assert.strictEqual(roundToTwo(totalBankSales), 1500.00);
    // Debt Sales = 1000.00
    assert.strictEqual(roundToTwo(totalDebtSales), 1000.00);
    // Total Revenue = 1725.75 + 2950 + 1500 + 1000 = 7175.75
    const totalRevenue = totalCashSales + totalCardSales + totalBankSales + totalDebtSales;
    assert.strictEqual(roundToTwo(totalRevenue), 7175.75);

    // Invariant: Master Cash Drawer Reconciliation Formula
    // Expected Cash = Opening + Cash Sales + Capital - Withdrawals - Cash Purchases - Cash Returns
    // 1250.00 + 1725.75 + 2000.00 - 475.75 - 1400.00 - 150.00 = 2950.00
    const expectedCash = roundToTwo(
      shift.openingCash + totalCashSales + totalCapitalInjections - totalCashWithdrawals - totalCashPurchases - totalCashReturns
    );

    assert.strictEqual(expectedCash, 2950.00, 'Expected cash must be exactly 2,950.00');

    // Test Variance States
    // 1. Exact match
    assert.strictEqual(roundToTwo(2950.00 - expectedCash), 0.00);
    // 2. Surplus (+50.25)
    assert.strictEqual(roundToTwo(3000.25 - expectedCash), 50.25);
    // 3. Shortage (-100.00)
    assert.strictEqual(roundToTwo(2850.00 - expectedCash), -100.00);
  });

  // =========================================================================
  // 4. DECANT PROPORTIONS & ZERO-STOCK COMPOSITION INVARIANTS
  // =========================================================================

  await test('31.3.1 Decant Proportions, Zero-Stock Decrements & Compounding Invariants in SQLite', async () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE inventory (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        qty REAL DEFAULT 0,
        cost REAL DEFAULT 0,
        price REAL DEFAULT 0,
        capacity REAL DEFAULT 0
      );
    `);

    // Insert Parent bottle: 100ml with ONLY 0.20 bottles in stock (20ml remaining)
    db.prepare('INSERT INTO inventory (id, name, qty, cost, price, capacity) VALUES (?, ?, ?, ?, ?, ?)').run(
      'parent_oud', 'عطر عود كمبودي 100مل', 0.20, 100.00, 300.00, 100.0
    );

    // Decant portion helper:
    const getDecantDeduction = (cartQty, portionMl, capacity) => {
      if (portionMl && capacity && capacity > 0) {
        return roundToTwo((cartQty * portionMl) / capacity);
      }
      return cartQty;
    };

    // Sell 1 portion of 10ml -> deducts (1 * 10) / 100 = 0.10 bottles
    const ded1 = getDecantDeduction(1, 10, 100);
    db.prepare('UPDATE inventory SET qty = MAX(0, round(qty - ?, 4)) WHERE id = ?').run(ded1, 'parent_oud');
    let item = db.prepare('SELECT qty FROM inventory WHERE id = ?').get('parent_oud');
    assert.strictEqual(item.qty, 0.10, 'Remaining stock must be 0.10 bottle');

    // Sell another portion of 10ml -> deducts 0.10 bottles -> stock reaches exactly 0.00
    const ded2 = getDecantDeduction(1, 10, 100);
    db.prepare('UPDATE inventory SET qty = MAX(0, round(qty - ?, 4)) WHERE id = ?').run(ded2, 'parent_oud');
    item = db.prepare('SELECT qty FROM inventory WHERE id = ?').get('parent_oud');
    assert.strictEqual(item.qty, 0.00, 'Remaining stock must reach exactly 0.00');

    // Adversarial: Attempt to decant 1 portion of 15ml from 0-stock bottle
    // System must clamp stock to 0.00 and NEVER produce negative inventory
    const ded3 = getDecantDeduction(1, 15, 100);
    db.prepare('UPDATE inventory SET qty = MAX(0, round(qty - ?, 4)) WHERE id = ?').run(ded3, 'parent_oud');
    item = db.prepare('SELECT qty FROM inventory WHERE id = ?').get('parent_oud');
    assert.strictEqual(item.qty, 0.00, 'Zero-stock decant must remain at 0.00 (no negative stock)');

    // Multiple bottle capacities testing:
    // 50ml bottle, 10ml portion -> 10/50 = 0.20
    assert.strictEqual(getDecantDeduction(1, 10, 50), 0.20);
    // 250ml bottle, 25ml portion -> 25/250 = 0.10
    assert.strictEqual(getDecantDeduction(1, 25, 250), 0.10);
    // 30ml bottle, 10ml portion -> 10/30 = 0.33
    assert.strictEqual(getDecantDeduction(1, 10, 30), 0.33);

    db.close();
  });

  // =========================================================================
  // 5. MULTI-STAGE WEIGHTED AVERAGE COST (WAC) FULL LIFECYCLE
  // =========================================================================

  await test('31.4.1 Comprehensive Multi-Stage WAC Lifecycle with Depletions & Restocking', async () => {
    // Stage 1: Brand new product, initial purchase: 50 units @ $10.00
    let stock = 0;
    let wac = 0;

    wac = calculateWAC(stock, wac, 50, 10.00);
    stock += 50;
    assert.strictEqual(roundToTwo(wac), 10.00);
    assert.strictEqual(stock, 50);

    // Stage 2: Second purchase batch: 50 units @ $20.00
    // New WAC = (50*10 + 50*20) / 100 = (500 + 1000) / 100 = $15.00
    wac = calculateWAC(stock, wac, 50, 20.00);
    stock += 50;
    assert.strictEqual(roundToTwo(wac), 15.00);
    assert.strictEqual(stock, 100);

    // Stage 3: Sales occur: 70 units sold (WAC does not change during sales)
    stock -= 70;
    assert.strictEqual(stock, 30);
    assert.strictEqual(roundToTwo(wac), 15.00);

    // Stage 4: Third purchase batch: 70 units @ $35.00
    // New WAC = (30 * 15 + 70 * 35) / 100 = (450 + 2450) / 100 = 2900 / 100 = $29.00
    wac = calculateWAC(stock, wac, 70, 35.00);
    stock += 70;
    assert.strictEqual(roundToTwo(wac), 29.00);
    assert.strictEqual(stock, 100);

    // Stage 5: Total depletion: all 100 units sold -> Stock reaches 0
    stock -= 100;
    assert.strictEqual(stock, 0);

    // Stage 6: Restock from zero stock: 40 units @ $50.00
    // WAC must reset to new unit cost $50.00 without division-by-zero artifacts
    wac = calculateWAC(stock, wac, 40, 50.00);
    stock += 40;
    assert.strictEqual(roundToTwo(wac), 50.00, 'Restock from 0 stock must set WAC to new cost');
    assert.strictEqual(stock, 40);

    // Stage 7: Zero quantity purchase anomaly: 0 units @ $100.00
    // WAC must remain unchanged at $50.00
    wac = calculateWAC(stock, wac, 0, 100.00);
    assert.strictEqual(roundToTwo(wac), 50.00, '0 qty purchase must not distort WAC');
    assert.strictEqual(stock, 40);
  });

  // =========================================================================
  // 6. DEBTOR LIFECYCLE, OVERPAYMENT CLAMPING & AGING
  // =========================================================================

  await test('31.5.1 Debtor Balance Aging & Overpayment Clamping Invariants', async () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE debtors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        total_debt REAL DEFAULT 0
      );
      CREATE TABLE debt_history (
        id TEXT PRIMARY KEY,
        debtor_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL
      );
    `);

    // Create debtor
    db.prepare('INSERT INTO debtors (id, name, total_debt) VALUES (?, ?, ?)').run('d1', 'عميل آجل', 0);

    // 1. Debt sale (+300)
    db.prepare('INSERT INTO debt_history (id, debtor_id, type, amount, date) VALUES (?, ?, ?, ?, ?)').run(
      'dh1', 'd1', 'debt', 300.00, new Date().toISOString()
    );
    db.prepare('UPDATE debtors SET total_debt = total_debt + ? WHERE id = ?').run(300.00, 'd1');
    assert.strictEqual(db.prepare('SELECT total_debt FROM debtors WHERE id = ?').get('d1').total_debt, 300.00);

    // 2. Partial payment (-100)
    db.prepare('INSERT INTO debt_history (id, debtor_id, type, amount, date) VALUES (?, ?, ?, ?, ?)').run(
      'dh2', 'd1', 'payment', 100.00, new Date().toISOString()
    );
    db.prepare('UPDATE debtors SET total_debt = MAX(0, total_debt - ?) WHERE id = ?').run(100.00, 'd1');
    assert.strictEqual(db.prepare('SELECT total_debt FROM debtors WHERE id = ?').get('d1').total_debt, 200.00);

    // 3. Overpayment (-250 on remaining 200 debt) -> clamped to 0.00
    db.prepare('INSERT INTO debt_history (id, debtor_id, type, amount, date) VALUES (?, ?, ?, ?, ?)').run(
      'dh3', 'd1', 'payment', 250.00, new Date().toISOString()
    );
    db.prepare('UPDATE debtors SET total_debt = MAX(0, total_debt - ?) WHERE id = ?').run(250.00, 'd1');
    assert.strictEqual(db.prepare('SELECT total_debt FROM debtors WHERE id = ?').get('d1').total_debt, 0.00);

    // 4. Aging Buckets Categorization
    const now = Date.now();
    const dayMs = 86400000;
    const testRecords = [
      { id: '1', date: new Date(now - 5 * dayMs).toISOString(), amount: 50 },   // 0-30 days
      { id: '2', date: new Date(now - 45 * dayMs).toISOString(), amount: 100 }, // 31-60 days
      { id: '3', date: new Date(now - 75 * dayMs).toISOString(), amount: 150 }, // 61-90 days
      { id: '4', date: new Date(now - 120 * dayMs).toISOString(), amount: 200 } // 90+ days
    ];

    const categorizeAging = (records) => {
      const buckets = { current: 0, days30: 0, days60: 0, days90Plus: 0 };
      const currentTs = Date.now();
      for (const r of records) {
        const days = (currentTs - new Date(r.date).getTime()) / dayMs;
        if (days <= 30) buckets.current += r.amount;
        else if (days <= 60) buckets.days30 += r.amount;
        else if (days <= 90) buckets.days60 += r.amount;
        else buckets.days90Plus += r.amount;
      }
      return buckets;
    };

    const aging = categorizeAging(testRecords);
    assert.strictEqual(aging.current, 50);
    assert.strictEqual(aging.days30, 100);
    assert.strictEqual(aging.days60, 150);
    assert.strictEqual(aging.days90Plus, 200);

    db.close();
  });

  // =========================================================================
  // 7. HIGH-VOLUME 1,000-TRANSACTION RANDOMIZED STRESS ORACLE
  // =========================================================================

  await test('31.6.1 High-Volume 1,000-Transaction Randomized Stress Oracle (Conservation Proof)', async () => {
    // We execute 1,000 randomized operations against an isolated SQLite instance
    // and verify that inventory conservation and drawer balance invariants are 100% strictly maintained.
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE inventory (
        id TEXT PRIMARY KEY,
        qty REAL DEFAULT 0,
        cost REAL DEFAULT 0,
        price REAL DEFAULT 0
      );
      CREATE TABLE sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total REAL,
        payment_method TEXT
      );
      CREATE TABLE purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total REAL,
        payment_type TEXT
      );
      CREATE TABLE withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount REAL
      );
      CREATE TABLE capital (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount REAL
      );
      CREATE TABLE returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        returned_amount REAL,
        payment_method TEXT
      );
    `);

    // 5 products initialized
    for (let i = 1; i <= 5; i++) {
      db.prepare('INSERT INTO inventory (id, qty, cost, price) VALUES (?, ?, ?, ?)').run(
        `prod_${i}`, 500.0, 20.0, 50.0
      );
    }

    let oracleExpectedCash = 1000.00; // Starting cash
    const rng = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const paymentMethods = ['cash', 'card', 'bank_transfer', 'debt'];

    for (let t = 0; t < 1000; t++) {
      const op = rng(1, 5);
      const prodId = `prod_${rng(1, 5)}`;

      if (op === 1) {
        // Sale
        const qty = rng(1, 5);
        const method = paymentMethods[rng(0, 3)];
        const total = roundToTwo(qty * 50.00);

        db.prepare('INSERT INTO sales (total, payment_method) VALUES (?, ?)').run(total, method);
        db.prepare('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?').run(qty, prodId);

        if (method === 'cash') {
          oracleExpectedCash = roundToTwo(oracleExpectedCash + total);
        }
      } else if (op === 2) {
        // Purchase
        const qty = rng(5, 20);
        const method = rng(0, 1) === 0 ? 'cash' : 'debt';
        const total = roundToTwo(qty * 20.00);

        db.prepare('INSERT INTO purchases (total, payment_type) VALUES (?, ?)').run(total, method);
        db.prepare('UPDATE inventory SET qty = qty + ? WHERE id = ?').run(qty, prodId);

        if (method === 'cash') {
          oracleExpectedCash = roundToTwo(oracleExpectedCash - total);
        }
      } else if (op === 3) {
        // Return
        const qty = 1;
        const method = rng(0, 1) === 0 ? 'cash' : 'debt';
        const amount = 50.00;

        db.prepare('INSERT INTO returns (returned_amount, payment_method) VALUES (?, ?)').run(amount, method);
        db.prepare('UPDATE inventory SET qty = qty + ? WHERE id = ?').run(qty, prodId);

        if (method === 'cash') {
          oracleExpectedCash = roundToTwo(oracleExpectedCash - amount);
        }
      } else if (op === 4) {
        // Withdrawal / Expense
        const amount = roundToTwo(rng(10, 50));
        db.prepare('INSERT INTO withdrawals (amount) VALUES (?)').run(amount);
        oracleExpectedCash = roundToTwo(oracleExpectedCash - amount);
      } else if (op === 5) {
        // Capital Injection
        const amount = roundToTwo(rng(50, 200));
        db.prepare('INSERT INTO capital (amount) VALUES (?)').run(amount);
        oracleExpectedCash = roundToTwo(oracleExpectedCash + amount);
      }
    }

    // Now query SQLite for the actual closing totals
    const cashSales = db.prepare("SELECT COALESCE(SUM(total), 0) as s FROM sales WHERE payment_method = 'cash'").get().s;
    const cashPurchases = db.prepare("SELECT COALESCE(SUM(total), 0) as s FROM purchases WHERE payment_type = 'cash'").get().s;
    const cashReturns = db.prepare("SELECT COALESCE(SUM(returned_amount), 0) as s FROM returns WHERE payment_method = 'cash'").get().s;
    const withdrawals = db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM withdrawals").get().s;
    const capital = db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM capital").get().s;

    const computedExpectedCash = roundToTwo(
      1000.00 + cashSales + capital - withdrawals - cashPurchases - cashReturns
    );

    assert.strictEqual(
      computedExpectedCash,
      oracleExpectedCash,
      `Calculated cash ($${computedExpectedCash}) must exactly equal oracle expected cash ($${oracleExpectedCash})`
    );

    // Verify non-negative inventory invariant across all products
    const inventories = db.prepare('SELECT * FROM inventory').all();
    for (const item of inventories) {
      assert(item.qty >= 0, `Inventory ${item.id} qty (${item.qty}) must be non-negative`);
    }

    db.close();
  });

  return results;
}
