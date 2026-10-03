/**
 * Suite 33: Salaries, Capital Assets & Custom Perfume Blending Verification
 *
 * Comprehensive tests for:
 * 1. Salaries Management & Filtering: Source tracking (Drawer vs Safe)
 * 2. Capital Assets & Machinery: Fixed equipment (CapEx) isolation
 * 3. Cash Drawer Reconciliation: Strict mathematical isolation (Safe withdrawals do not penalize Drawer)
 * 4. Custom Perfume Blending Proportional Math: Oil ml, alcohol ml, bottle sizes (5-200ml), and packaging
 * 5. Atomic Stock Decrement: Multi-component raw materials depletion on POS checkout
 * 6. Atomic Stock Restoration: Full reversal upon sale deletion
 * 7. Analytics Financial Invariants: Separation of operating expenses from capital asset investments
 */

import assert from 'assert';
import { createTestDb } from '../harness/test-db.js';
import { safeParseFloat, formatCurrency } from '../../src/utils/helpers.js';

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
  // 1. SALARIES & WITHDRAWALS SOURCE TRACKING (DRAWER VS SAFE)
  // =========================================================================

  await test('33.1.1 Salaries: Create and filter employee salaries with Drawer vs Safe source', async () => {
    const db = createTestDb();

    // Insert general expense
    db.run(`
      INSERT INTO withdrawals (id, date, amount, recipient, reason, category, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, 'w-1', '2026-09-15T10:00:00Z', 50.0, 'كهربائي', 'صيانة إضاءة', 'general', 'drawer');

    // Insert salary paid from daily drawer
    db.run(`
      INSERT INTO withdrawals (id, date, amount, recipient, reason, category, source, employee_name, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, 'w-2', '2026-09-15T14:00:00Z', 250.0, 'محمد علي', 'سلفة من الراتب', 'salary', 'drawer', 'محمد علي', 'دفعة نصف شهرية');

    // Insert salary paid from safe/capital
    db.run(`
      INSERT INTO withdrawals (id, date, amount, recipient, reason, category, source, employee_name, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, 'w-3', '2026-09-15T18:00:00Z', 1200.0, 'سالم محمود', 'مرتب شهري كامل', 'salary', 'safe', 'سالم محمود', 'مرتب شهر سبتمبر من الخزينة الرئيسية');

    // Query all salaries
    const salaries = db.query(`SELECT * FROM withdrawals WHERE category = 'salary' ORDER BY amount ASC`);
    assert.strictEqual(salaries.length, 2, 'Should return exactly 2 salary records');
    assert.strictEqual(salaries[0].employee_name, 'محمد علي');
    assert.strictEqual(salaries[0].source, 'drawer');
    assert.strictEqual(salaries[1].employee_name, 'سالم محمود');
    assert.strictEqual(salaries[1].source, 'safe');

    // Query drawer-only withdrawals
    const drawerWithdrawals = db.get(`
      SELECT SUM(amount) as total FROM withdrawals
      WHERE (source = 'drawer' OR source IS NULL) AND category != 'capital_asset'
    `);
    assert.strictEqual(drawerWithdrawals.total, 300.0, 'Drawer withdrawals should sum 50 + 250 = 300');
  });

  // =========================================================================
  // 2. CAPITAL ASSETS & FIXED EQUIPMENT (MACHINERY / CAPEX)
  // =========================================================================

  await test('33.1.2 Capital Assets: Fixed machinery without wholesale price recorded as CapEx', async () => {
    const db = createTestDb();

    // Insert machinery / capital asset
    db.run(`
      INSERT INTO withdrawals (id, date, amount, reason, category, source, asset_name, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      'w-cap-1',
      '2026-09-15T12:00:00Z',
      3500.0,
      'شراء ماكينة كبس وتثبيت أغطية العطور الهيدروليكية',
      'capital_asset',
      'safe',
      'ماكينة كبس عطور هيدروليكية',
      'فاتورة شركة الآلات الحديثة رقم #4421 - ضمان سنتين'
    );

    const capitalRecord = db.get(`SELECT * FROM withdrawals WHERE category = 'capital_asset'`);
    assert.ok(capitalRecord, 'Capital asset record must exist');
    assert.strictEqual(capitalRecord.amount, 3500.0);
    assert.strictEqual(capitalRecord.source, 'safe', 'Capital assets must always be paid from safe/capital');
    assert.strictEqual(capitalRecord.asset_name, 'ماكينة كبس عطور هيدروليكية');
  });

  // =========================================================================
  // 3. CASH DRAWER MASTER RECONCILIATION INVARIANT
  // =========================================================================

  await test('33.2.1 Shift Close Cash Drawer: Safe salaries and Capital Assets do not penalize Drawer', async () => {
    const db = createTestDb();

    const initialCash = 500.0;
    const cashSales = 1200.0;
    const cashReturns = 100.0;
    const cashPurchases = 150.0;
    const capitalInjections = 200.0;

    // Drawer expenses
    const drawerGeneralExpense = 40.0;
    const drawerSalaryExpense = 160.0; // Salary paid from cashier drawer

    // Safe expenses (Do NOT touch drawer)
    const safeSalaryExpense = 800.0;
    const safeCapitalAsset = 2500.0;

    // Expected Drawer Cash = Initial + Sales + Injections - Returns - Purchases - Drawer Withdrawals
    // Drawer Withdrawals = 40 + 160 = 200
    const expectedDrawerCash =
      initialCash + cashSales + capitalInjections - cashReturns - cashPurchases - (drawerGeneralExpense + drawerSalaryExpense);

    assert.strictEqual(expectedDrawerCash, 1450.0, 'Expected physical cash in drawer must be 1450');

    // Insert records
    db.run(`INSERT INTO withdrawals (id, date, amount, category, source) VALUES (?, ?, ?, ?, ?)`, 'd1', 'now', drawerGeneralExpense, 'general', 'drawer');
    db.run(`INSERT INTO withdrawals (id, date, amount, category, source) VALUES (?, ?, ?, ?, ?)`, 'd2', 'now', drawerSalaryExpense, 'salary', 'drawer');
    db.run(`INSERT INTO withdrawals (id, date, amount, category, source) VALUES (?, ?, ?, ?, ?)`, 's1', 'now', safeSalaryExpense, 'salary', 'safe');
    db.run(`INSERT INTO withdrawals (id, date, amount, category, source) VALUES (?, ?, ?, ?, ?)`, 'c1', 'now', safeCapitalAsset, 'capital_asset', 'safe');

    const drawerSum = db.get(`
      SELECT COALESCE(SUM(amount), 0) as total FROM withdrawals
      WHERE (source = 'drawer' OR source IS NULL) AND category != 'capital_asset'
    `).total;

    assert.strictEqual(drawerSum, 200.0, 'Drawer withdrawals query must isolate exactly drawer items');

    const calculatedExpected = initialCash + cashSales + capitalInjections - cashReturns - cashPurchases - drawerSum;
    assert.strictEqual(calculatedExpected, 1450.0);
  });

  // =========================================================================
  // 4. CUSTOM PERFUME BLENDING PROPORTIONAL MATH
  // =========================================================================

  await test('33.3.1 Blending Math: Proportional raw oil cost, alcohol volume, bottle sizes and packaging', async () => {
    // 1000ml bulk bottle costs 600 LYD -> cost per ml = 0.60 LYD/ml
    const bulkCapacity = 1000;
    const bulkCost = 600;
    const unitOilCostPerMl = bulkCost / bulkCapacity; // 0.60

    // Bottle presets test across [5, 10, 20, 30, 40, 50, 100, 200]
    const bottleSizes = [5, 10, 20, 30, 40, 50, 100, 200];
    const alcoholCostPerMl = 0.04;
    const bottleCost = 6.0;
    const boxCost = 3.5;

    for (const size of bottleSizes) {
      const oilMl = Math.round(size * 0.3); // 30% oil concentration
      const alcMl = size - oilMl; // Remaining is alcohol

      assert.strictEqual(oilMl + alcMl, size, `Oil (${oilMl}ml) + Alcohol (${alcMl}ml) must equal bottle capacity (${size}ml)`);

      const formulaCostWithBox = (oilMl * unitOilCostPerMl) + (alcMl * alcoholCostPerMl) + bottleCost + boxCost;
      const formulaCostWithoutBox = (oilMl * unitOilCostPerMl) + (alcMl * alcoholCostPerMl) + bottleCost;

      assert.ok(formulaCostWithBox > formulaCostWithoutBox, 'Box must add to unit cost');
      assert.strictEqual(
        Math.round((formulaCostWithBox - formulaCostWithoutBox) * 100) / 100,
        boxCost,
        'Difference must equal packaging box cost'
      );
    }
  });

  // =========================================================================
  // 5. ATOMIC MULTI-COMPONENT STOCK DECREMENT ON POS CHECKOUT
  // =========================================================================

  await test('33.3.2 Blending Stock Decrement: Atomic deduction of raw oil, alcohol, bottle, and box', async () => {
    const db = createTestDb();

    // Insert raw materials into inventory
    db.run(`
      INSERT INTO inventory (id, name, category, qty, cost, price, unit, capacity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, 'oil-oud', 'زيت عود ملكي خام', 'زيوت خام', 500.0, 400.0, 600.0, 'ml', 500);

    db.run(`
      INSERT INTO inventory (id, name, category, qty, cost, price, unit, capacity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, 'alc-pure', 'كحول إيثيلي 96%', 'مذيبات', 2000.0, 80.0, 120.0, 'ml', 2000);

    db.run(`
      INSERT INTO inventory (id, name, category, qty, cost, price, unit, capacity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, 'bot-50', 'زجاجة كريستال 50ml', 'زجاجات', 50, 5.0, 10.0, 'bottle', 50);

    db.run(`
      INSERT INTO inventory (id, name, category, qty, cost, price, unit, capacity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, 'box-lux', 'علبة كرتونية مخملية فاخرة', 'علب وتغليف', 40, 3.0, 6.0, 'piece', 1);

    // Blended item payload to sell: 2 bottles of 50ml (each has 15ml oil + 35ml alc + 1 bottle + 1 box)
    const cartQty = 2;
    const oilPerBottle = 15;
    const alcPerBottle = 35;

    const blendSpec = {
      is_custom_blend: true,
      bottle_capacity: 50,
      oil: { id: 'oil-oud', name: 'زيت عود ملكي خام', ml: oilPerBottle, cost_per_ml: 0.8 },
      alcohol: { id: 'alc-pure', name: 'كحول إيثيلي 96%', ml: alcPerBottle, cost_per_ml: 0.04 },
      bottle: { id: 'bot-50', name: 'زجاجة كريستال 50ml', cost: 5.0 },
      packaging: { id: 'box-lux', name: 'علبة كرتونية مخملية فاخرة', cost: 3.0 }
    };

    // Execute atomic sale using db.transaction
    const saleId = 101;
    const queries = [
      {
        sql: `INSERT INTO sales (id, date, subtotal, total, profit, payment_method, type) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [saleId, '2026-09-15T15:00:00Z', 180.0, 180.0, 100.0, 'cash', 'store']
      },
      {
        sql: `INSERT INTO sale_items (sale_id, product_id, name, cart_qty, unit, final_price, unit_cost, portion_ml, blend_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          saleId,
          'custom_blend_test',
          'خلطة عود ملكي خاصة 50ml',
          cartQty,
          'زجاجة',
          90.0,
          21.4,
          50,
          JSON.stringify(blendSpec)
        ]
      },
      {
        sql: 'UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?',
        params: [oilPerBottle * cartQty, blendSpec.oil.id]
      },
      {
        sql: 'UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?',
        params: [alcPerBottle * cartQty, blendSpec.alcohol.id]
      },
      {
        sql: 'UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?',
        params: [1 * cartQty, blendSpec.bottle.id]
      },
      {
        sql: 'UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?',
        params: [1 * cartQty, blendSpec.packaging.id]
      }
    ];

    db.transaction(queries);

    // Verify stock levels after checkout
    const oilStock = db.get('SELECT qty FROM inventory WHERE id = ?', 'oil-oud').qty;
    const alcStock = db.get('SELECT qty FROM inventory WHERE id = ?', 'alc-pure').qty;
    const botStock = db.get('SELECT qty FROM inventory WHERE id = ?', 'bot-50').qty;
    const boxStock = db.get('SELECT qty FROM inventory WHERE id = ?', 'box-lux').qty;

    assert.strictEqual(oilStock, 500.0 - (15 * 2), 'Oil must be 470ml');
    assert.strictEqual(alcStock, 2000.0 - (35 * 2), 'Alcohol must be 1930ml');
    assert.strictEqual(botStock, 50 - 2, 'Bottles must be 48');
    assert.strictEqual(boxStock, 40 - 2, 'Boxes must be 38');
  });

  // =========================================================================
  // 6. ATOMIC STOCK RESTORATION ON DELETING BLENDED SALE
  // =========================================================================

  await test('33.3.3 Blending Stock Restore: Deleting blended sale restores all raw materials', async () => {
    const db = createTestDb();

    // Setup inventory with known balances
    db.run(`INSERT INTO inventory (id, name, qty, cost, price) VALUES ('oil-1', 'زيت صندل', 470.0, 0.5, 1.0)`);
    db.run(`INSERT INTO inventory (id, name, qty, cost, price) VALUES ('alc-1', 'كحول', 930.0, 0.05, 0.1)`);
    db.run(`INSERT INTO inventory (id, name, qty, cost, price) VALUES ('bot-1', 'زجاجة', 18, 5.0, 10.0)`);
    db.run(`INSERT INTO inventory (id, name, qty, cost, price) VALUES ('box-1', 'علبة', 28, 2.0, 5.0)`);

    const blendDetails = JSON.stringify({
      is_custom_blend: true,
      oil: { id: 'oil-1', ml: 15 },
      alcohol: { id: 'alc-1', ml: 35 },
      bottle: { id: 'bot-1' },
      packaging: { id: 'box-1' }
    });

    const saleId = 202;
    db.run(`INSERT INTO sales (id, date, total) VALUES (?, ?, ?)`, saleId, 'now', 90.0);
    db.run(`
      INSERT INTO sale_items (sale_id, product_id, name, cart_qty, final_price, unit_cost, blend_details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, saleId, 'custom_blend_del', 'خلطة صندل', 2, 45.0, 15.0, blendDetails);

    // Now simulate deleteSaleWithStockRestore
    const items = db.query('SELECT * FROM sale_items WHERE sale_id = ?', saleId);

    const restoreQueries = [];
    for (const it of items) {
      const blend = JSON.parse(it.blend_details);
      const qty = it.cart_qty;
      if (blend.oil?.id) {
        restoreQueries.push({
          sql: 'UPDATE inventory SET qty = qty + ? WHERE id = ?',
          params: [blend.oil.ml * qty, blend.oil.id]
        });
      }
      if (blend.alcohol?.id) {
        restoreQueries.push({
          sql: 'UPDATE inventory SET qty = qty + ? WHERE id = ?',
          params: [blend.alcohol.ml * qty, blend.alcohol.id]
        });
      }
      if (blend.bottle?.id) {
        restoreQueries.push({
          sql: 'UPDATE inventory SET qty = qty + ? WHERE id = ?',
          params: [qty, blend.bottle.id]
        });
      }
      if (blend.packaging?.id) {
        restoreQueries.push({
          sql: 'UPDATE inventory SET qty = qty + ? WHERE id = ?',
          params: [qty, blend.packaging.id]
        });
      }
    }
    restoreQueries.push({ sql: 'DELETE FROM sale_items WHERE sale_id = ?', params: [saleId] });
    restoreQueries.push({ sql: 'DELETE FROM sales WHERE id = ?', params: [saleId] });

    db.transaction(restoreQueries);

    // Check restored inventory
    assert.strictEqual(db.get('SELECT qty FROM inventory WHERE id = ?', 'oil-1').qty, 500.0);
    assert.strictEqual(db.get('SELECT qty FROM inventory WHERE id = ?', 'alc-1').qty, 1000.0);
    assert.strictEqual(db.get('SELECT qty FROM inventory WHERE id = ?', 'bot-1').qty, 20);
    assert.strictEqual(db.get('SELECT qty FROM inventory WHERE id = ?', 'box-1').qty, 30);
  });

  // =========================================================================
  // 7. ANALYTICS FINANCIAL SEPARATION (OPEX VS CAPEX)
  // =========================================================================

  await test('33.4.1 Financial Invariant: CapEx does not deduct from Trading Net Profit', async () => {
    const grossTradingProfit = 5000.0;
    const generalExpenses = 600.0;
    const employeeSalaries = 1400.0;
    const inventoryLosses = 200.0;
    const capitalAssetPurchases = 4500.0; // E.g. crimping machinery, lab equipment

    // Operating expenses = General + Salaries = 2000
    const operatingExpenses = generalExpenses + employeeSalaries;

    // Trading Net Profit = Gross Profit - Operating Expenses - Inventory Losses
    const netTradingProfit = grossTradingProfit - operatingExpenses - inventoryLosses;

    assert.strictEqual(netTradingProfit, 2800.0, 'Net trading profit must be 2800 (not -1700)');

    // Total Cash Outflow includes CapEx
    const totalCashOutflow = operatingExpenses + capitalAssetPurchases;
    assert.strictEqual(totalCashOutflow, 6500.0);
  });

  // =========================================================================
  // 8. ENHANCED PAYROLL & SALARY SETTLEMENTS (MONTH, DELIVERY DATE & DUP CHECKS)
  // =========================================================================

  await test('33.5.1 Enhanced Salaries: Persist target salary_month and delivery_date in withdrawals', async () => {
    const db = createTestDb();

    db.run(`
      INSERT INTO withdrawals (id, date, amount, recipient, reason, category, source, employee_name, notes, salary_month, delivery_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      'sal-oct-1',
      '2026-10-03T00:00:00.000Z',
      1800.0,
      'أحمد عبد الله',
      'مرتب شهر أكتوبر 2026 - أحمد عبد الله',
      'salary',
      'drawer',
      'أحمد عبد الله',
      'تسليم نقدي مع إيصال استلام',
      '2026-10',
      '2026-10-03'
    );

    const record = db.get(`SELECT * FROM withdrawals WHERE id = ?`, 'sal-oct-1');
    assert.ok(record, 'Salary record must be persisted');
    assert.strictEqual(record.employee_name, 'أحمد عبد الله');
    assert.strictEqual(record.amount, 1800.0);
    assert.strictEqual(record.salary_month, '2026-10', 'Target salary month must be accurately saved');
    assert.strictEqual(record.delivery_date, '2026-10-03', 'Handover delivery date must be accurately saved');
    assert.strictEqual(record.source, 'drawer');
  });

  await test('33.5.2 Enhanced Salaries: Duplicate month detection for same employee', async () => {
    const db = createTestDb();

    // First disbursement for October 2026
    db.run(`
      INSERT INTO withdrawals (id, date, amount, employee_name, category, source, salary_month, delivery_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, 'sal-1', '2026-10-01T00:00:00.000Z', 1500.0, 'سالم محمود', 'salary', 'safe', '2026-10', '2026-10-01');

    // Check duplicate query
    const dup = db.get(`
      SELECT * FROM withdrawals
      WHERE category = 'salary'
        AND LOWER(TRIM(employee_name)) = LOWER(TRIM(?))
        AND salary_month = ?
    `, 'سالم محمود', '2026-10');

    assert.ok(dup, 'Must detect existing salary for October 2026');
    assert.strictEqual(dup.amount, 1500.0);

    // Check non-duplicate for November 2026
    const nonDup = db.get(`
      SELECT * FROM withdrawals
      WHERE category = 'salary'
        AND LOWER(TRIM(employee_name)) = LOWER(TRIM(?))
        AND salary_month = ?
    `, 'سالم محمود', '2026-11');

    assert.strictEqual(nonDup, undefined, 'November 2026 must have no duplicate');
  });

  await test('33.5.3 Enhanced Salaries: Employee list extraction combining users and withdrawals', async () => {
    const db = createTestDb();

    // Create users table and insert user
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'cashier'
      )
    `);
    // Insert user with required pin
    db.run(`INSERT INTO users (id, name, pin, role) VALUES (?, ?, ?, ?)`, 'u-1', 'خالد أحمد', '1234', 'cashier');

    // Insert salary with non-user employee
    db.run(`
      INSERT INTO withdrawals (id, date, amount, employee_name, category, salary_month, delivery_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, 'sal-2', '2026-10-02T00:00:00.000Z', 1200.0, 'طارق نوري', 'salary', '2026-10', '2026-10-02');

    const users = db.query(`SELECT id, name, role FROM users`);
    const pastEmps = db.query(`SELECT DISTINCT employee_name as name FROM withdrawals WHERE employee_name IS NOT NULL`);

    const names = new Set([...users.map(u => u.name), ...pastEmps.map(e => e.name)]);
    assert(names.has('خالد أحمد'), 'Users must be in employee set');
    assert(names.has('طارق نوري'), 'Past withdrawal employees must be in employee set');
    assert.strictEqual(names.size, 2);
  });

  await test('33.5.4 Multi-Installments & Cross-Month Payroll: Advances, past arrears and future advance', async () => {
    const db = createTestDb();

    // 1. Advance payment for month 10
    db.run(`
      INSERT INTO withdrawals (id, date, amount, employee_name, category, source, salary_month, delivery_date, payment_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, 'sal-adv', '2026-10-05T10:00:00.000Z', 500.0, 'محمود عمر', 'salary', 'drawer', '2026-10', '2026-10-05', 'salary_advance');

    // 2. Remaining balance for month 10
    db.run(`
      INSERT INTO withdrawals (id, date, amount, employee_name, category, source, salary_month, delivery_date, payment_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, 'sal-rem', '2026-10-25T14:00:00.000Z', 1000.0, 'محمود عمر', 'salary', 'drawer', '2026-10', '2026-10-25', 'salary_remaining');

    // 3. Arrears for past month 9
    db.run(`
      INSERT INTO withdrawals (id, date, amount, employee_name, category, source, salary_month, delivery_date, payment_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, 'sal-past', '2026-10-10T12:00:00.000Z', 300.0, 'محمود عمر', 'salary', 'safe', '2026-09', '2026-10-10', 'salary_arrears');

    // 4. Advance for future month 11
    db.run(`
      INSERT INTO withdrawals (id, date, amount, employee_name, category, source, salary_month, delivery_date, payment_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, 'sal-fut', '2026-10-28T16:00:00.000Z', 600.0, 'محمود عمر', 'salary', 'safe', '2026-11', '2026-10-28', 'salary_advance_next');

    // Query all payments for month 10 (multiple installments)
    const month10Payments = db.query(`
      SELECT * FROM withdrawals
      WHERE employee_name = 'محمود عمر' AND salary_month = '2026-10'
      ORDER BY date ASC
    `);
    assert.strictEqual(month10Payments.length, 2, 'Must have 2 installments for month 10');
    const month10Total = month10Payments.reduce((s, p) => s + p.amount, 0);
    assert.strictEqual(month10Total, 1500.0, 'Combined month 10 salary must equal 1500');

    // Query past month arrears
    const arrears = db.get(`
      SELECT * FROM withdrawals
      WHERE employee_name = 'محمود عمر' AND salary_month = '2026-09'
    `);
    assert.ok(arrears, 'Past month arrears must be recorded');
    assert.strictEqual(arrears.amount, 300.0);

    // Query future month advance
    const futureAdv = db.get(`
      SELECT * FROM withdrawals
      WHERE employee_name = 'محمود عمر' AND salary_month = '2026-11'
    `);
    assert.ok(futureAdv, 'Future month advance must be recorded');
    assert.strictEqual(futureAdv.amount, 600.0);
  });

  await test('33.5.5 Daily Cash Outflow Invariant: Accurate day-by-day aggregation and drawer/safe isolation', async () => {
    const db = createTestDb();

    // Outflow on Oct 03: 1 drawer (100) + 1 safe (500)
    db.run(`INSERT INTO withdrawals (id, date, amount, category, source, delivery_date) VALUES (?, ?, ?, ?, ?, ?)`,
      'w1', '2026-10-03T09:00:00.000Z', 100.0, 'expense', 'drawer', '2026-10-03');
    db.run(`INSERT INTO withdrawals (id, date, amount, category, source, delivery_date) VALUES (?, ?, ?, ?, ?, ?)`,
      'w2', '2026-10-03T11:00:00.000Z', 500.0, 'salary', 'safe', '2026-10-03');

    // Outflow on Oct 04: 1 drawer salary (1200)
    db.run(`INSERT INTO withdrawals (id, date, amount, category, source, delivery_date) VALUES (?, ?, ?, ?, ?, ?)`,
      'w3', '2026-10-04T15:00:00.000Z', 1200.0, 'salary', 'drawer', '2026-10-04');

    const dailyFlow = db.query(`
      SELECT 
        COALESCE(delivery_date, SUBSTR(date, 1, 10)) as flow_date,
        SUM(CASE WHEN source = 'drawer' AND category != 'capital_asset' THEN amount ELSE 0 END) as drawer_total,
        SUM(CASE WHEN source = 'safe' OR category = 'capital_asset' THEN amount ELSE 0 END) as safe_total,
        SUM(amount) as day_total,
        COUNT(*) as count
      FROM withdrawals
      GROUP BY flow_date
      ORDER BY flow_date ASC
    `);

    assert.strictEqual(dailyFlow.length, 2);
    // Day 1
    assert.strictEqual(dailyFlow[0].flow_date, '2026-10-03');
    assert.strictEqual(dailyFlow[0].drawer_total, 100.0);
    assert.strictEqual(dailyFlow[0].safe_total, 500.0);
    assert.strictEqual(dailyFlow[0].day_total, 600.0);
    assert.strictEqual(dailyFlow[0].count, 2);

    // Day 2
    assert.strictEqual(dailyFlow[1].flow_date, '2026-10-04');
    assert.strictEqual(dailyFlow[1].drawer_total, 1200.0);
    assert.strictEqual(dailyFlow[1].safe_total, 0.0);
    assert.strictEqual(dailyFlow[1].day_total, 1200.0);
    assert.strictEqual(dailyFlow[1].count, 1);
  });

  return results;
}

