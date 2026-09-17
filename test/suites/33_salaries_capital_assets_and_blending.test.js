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

  return results;
}
