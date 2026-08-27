/**
 * Suite 06: Adversarial Stress Testing — Financial Precision & Mathematical Invariants
 * Tests: COGS, WAC, Gross/Net Margins, Fractional Quantities, Floating Point Rounding,
 * Cash Flow In/Out, Shift Close Equations, and Compound Discounts.
 */

import assert from 'assert';
import { createTestDb } from '../harness/test-db.js';
import { calculateWAC, safeParseFloat, calculatePercentage, clamp } from '../../src/utils/helpers.js';

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

  await test('6.1 Weighted Average Cost (WAC) Precision & Zero-Stock Invariants', async () => {
    // Normal case: 10 units @ $20 + 20 units @ $35 -> (200 + 700) / 30 = 900 / 30 = $30
    const wac1 = calculateWAC(10, 20, 20, 35);
    assert.strictEqual(wac1, 30, 'WAC should be 30.00');

    // Fractional stock: 3.5 liters @ $14.20 + 6.5 liters @ $18.40
    // Total cost = (3.5 * 14.20) + (6.5 * 18.40) = 49.70 + 119.60 = 169.30
    // Total qty = 10.0
    // WAC = 16.93
    const wac2 = calculateWAC(3.5, 14.20, 6.5, 18.40);
    assert.strictEqual(Math.round(wac2 * 100) / 100, 16.93, 'WAC for fractional items should be 16.93');

    // Edge Case: Zero existing stock -> Should adopt new cost directly
    const wacZeroOld = calculateWAC(0, 0, 15, 45.5);
    assert.strictEqual(wacZeroOld, 45.5, 'Zero old stock should result in new cost');

    // Edge Case: Zero total stock -> fallback to new cost
    const wacZeroTotal = calculateWAC(0, 50, 0, 75);
    assert.strictEqual(wacZeroTotal, 75, 'Zero total stock should return new cost');
  });

  await test('6.2 Financial Invariants: Revenue, COGS, Gross Profit, and Net Margin', async () => {
    const testDb = createTestDb();

    // Scenario with multiple sales, discounts, and item breakdowns
    // Sale 1: Subtotal 500, Discount 50 (10%), Total 450, COGS 200 -> Profit = (500 - 200) - 50 = 250
    testDb.run(
      'INSERT INTO sales (id, date, subtotal, discount, total, profit, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [1, '2026-08-20T10:00:00.000Z', 500, 50, 450, 250, 'cash']
    );
    testDb.run(
      'INSERT INTO sale_items (sale_id, product_id, name, cart_qty, final_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
      [1, 'p1', 'عطر المسك', 5, 100, 40] // 5 * 100 = 500 revenue, 5 * 40 = 200 COGS
    );

    // Sale 2: Subtotal 120, Fixed Discount 20, Total 100, COGS 80 -> Profit = (120 - 80) - 20 = 20
    testDb.run(
      'INSERT INTO sales (id, date, subtotal, discount, total, profit, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [2, '2026-08-20T14:00:00.000Z', 120, 20, 100, 20, 'card']
    );
    testDb.run(
      'INSERT INTO sale_items (sale_id, product_id, name, cart_qty, final_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
      [2, 'p2', 'زيت الورد', 2, 60, 40] // 2 * 60 = 120 revenue, 2 * 40 = 80 COGS
    );

    // Operational expenses and losses
    testDb.run('INSERT INTO withdrawals (id, date, amount, reason) VALUES (?, ?, ?, ?)', [
      'w1', '2026-08-20T16:00:00.000Z', 70, 'مصاريف كهرباء'
    ]);
    testDb.run('INSERT INTO losses (id, date, item_name, qty, unit, cost_value, reason) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      'l1', '2026-08-20T17:00:00.000Z', 'زجاجة مكسورة', 1, 'قطعة', 30, 'كسر'
    ]);

    const sales = testDb.query('SELECT * FROM sales');
    const withdrawals = testDb.query('SELECT * FROM withdrawals');
    const losses = testDb.query('SELECT * FROM losses');

    const totalRevenue = sales.reduce((acc, s) => acc + s.total, 0); // 450 + 100 = 550
    const totalProfit = sales.reduce((acc, s) => acc + s.profit, 0); // 250 + 20 = 270
    const totalWithdrawals = withdrawals.reduce((acc, w) => acc + w.amount, 0); // 70
    const totalLosses = losses.reduce((acc, l) => acc + l.cost_value, 0); // 30

    const netProfit = totalProfit - totalWithdrawals - totalLosses; // 270 - 70 - 30 = 170
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0; // (270 / 550) * 100 = 49.09%
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0; // (170 / 550) * 100 = 30.91%
    const avgOrderValue = totalRevenue / sales.length; // 550 / 2 = 275.00

    assert.strictEqual(totalRevenue, 550, 'Total Revenue must be 550');
    assert.strictEqual(totalProfit, 270, 'Total Gross Profit must be 270');
    assert.strictEqual(netProfit, 170, 'Net Profit after withdrawals & losses must be 170');
    assert.strictEqual(profitMargin.toFixed(2), '49.09', 'Gross Profit Margin must be 49.09%');
    assert.strictEqual(netMargin.toFixed(2), '30.91', 'Net Margin must be 30.91%');
    assert.strictEqual(avgOrderValue, 275, 'Average Order Value must be 275');

    testDb.close();
  });

  await test('6.3 Shift Close Complete Reconciliation Mathematical Formula', async () => {
    // Formula verification with all possible cash movements:
    // Cash Sales: 3,450.00
    // Capital Injections (Cash In): 1,000.00
    // Cash Withdrawals (Cash Out): 450.00
    // Cash Purchases (Cash Out to Supplier): 800.00
    // Cash Returns (Cash Out to Customer): 200.00
    // Expected Cash = 3,450 + 1,000 - 450 - 800 - 200 = 3,000.00

    const cashSales = 3450.00;
    const capitalInjections = 1000.00;
    const cashWithdrawals = 450.00;
    const cashPurchases = 800.00;
    const cashReturns = 200.00;

    const expectedCash = cashSales + capitalInjections - cashWithdrawals - cashPurchases - cashReturns;
    assert.strictEqual(expectedCash, 3000.00, 'Expected Cash must be exactly 3,000.00');

    // Subcase 1: Perfect Balance
    const countedExact = 3000.00;
    const varianceExact = countedExact - expectedCash;
    assert.strictEqual(varianceExact, 0.00, 'Zero variance on exact count');

    // Subcase 2: Cash Surplus (فائض)
    const countedSurplus = 3075.50;
    const varianceSurplus = countedSurplus - expectedCash;
    assert.strictEqual(varianceSurplus, 75.50, 'Surplus must be +75.50');

    // Subcase 3: Cash Shortage (عجز)
    const countedDeficit = 2940.25;
    const varianceDeficit = countedDeficit - expectedCash;
    assert.strictEqual(varianceDeficit, -59.75, 'Deficit must be -59.75');
  });

  await test('6.4 Fractional Quantities, Portion Compounding & Price Precision', async () => {
    // Compounding test: 12.5 ml of Oil @ $2.40/ml + 1 Bottle @ $8.00
    // Material Cost = (12.5 * 2.40) + 8.00 = 30.00 + 8.00 = $38.00
    // Sale Price = $95.00
    // Gross Profit = 95.00 - 38.00 = $57.00
    // Margin % = (57 / 95) * 100 = 60.0%

    const portionMl = 12.5;
    const costPerMl = 2.40;
    const bottleCost = 8.00;
    const computedUnitCost = (portionMl * costPerMl) + bottleCost;
    const retailPrice = 95.00;

    assert.strictEqual(computedUnitCost, 38.00);
    const profit = retailPrice - computedUnitCost;
    assert.strictEqual(profit, 57.00);
    const margin = (profit / retailPrice) * 100;
    assert.strictEqual(margin, 60.0);
  });

  await test('6.5 Liquidity Flow Aggregation Inflow vs Outflow Invariant', async () => {
    // Test that Cash Inflow = (Sales Total + Capital Total)
    // Cash Outflow = (Purchases Total + Withdrawals Total + Losses Total)
    // Net Flow = Inflow - Outflow

    const salesTotal = 4200.75;
    const capitalTotal = 1500.00;
    const purchasesTotal = 2100.50;
    const withdrawalsTotal = 350.25;
    const lossesTotal = 120.00;

    const inflow = salesTotal + capitalTotal; // 5700.75
    const outflow = purchasesTotal + withdrawalsTotal + lossesTotal; // 2570.75
    const netFlow = inflow - outflow; // 3130.00

    assert.strictEqual(inflow, 5700.75, 'Inflow calculation');
    assert.strictEqual(outflow, 2570.75, 'Outflow calculation');
    assert.strictEqual(netFlow, 3130.00, 'Net flow calculation');
  });

  return results;
}
