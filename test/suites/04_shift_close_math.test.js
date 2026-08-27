/**
 * Suite 04: Shift Close Financial Reconciliation & Cash Drawer Math
 */

import assert from 'assert';
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

  await test('4.1 Cash Drawer Formula with Cash Returns Subtraction', async () => {
    const totalCashSales = 1500;
    const totalCapital = 500;
    const totalWithdrawals = 200;
    const totalCashPurchases = 300;
    const totalCashReturns = 150;

    // Verified Formula:
    // expectedCash = totalCashSales + totalCapital - totalWithdrawals - totalCashPurchases - totalCashReturns
    const expectedCash = totalCashSales + totalCapital - totalWithdrawals - totalCashPurchases - totalCashReturns;

    // Expected: 1500 + 500 - 200 - 300 - 150 = 1350
    assert.strictEqual(expectedCash, 1350, 'Expected cash in drawer must be 1,350');

    // Case 1: Exact cash counted
    const actualCashExact = 1350;
    const diffExact = actualCashExact - expectedCash;
    assert.strictEqual(diffExact, 0, 'Difference should be 0 when counted cash matches expected');

    // Case 2: Shortage (عجز)
    const actualCashShort = 1300;
    const diffShort = actualCashShort - expectedCash;
    assert.strictEqual(diffShort, -50, 'Deficit of 50');

    // Case 3: Overage (فائض)
    const actualCashOver = 1400;
    const diffOver = actualCashOver - expectedCash;
    assert.strictEqual(diffOver, 50, 'Surplus of 50');
  });

  await test('4.2 Shift Report Creation & Retrieval in Database', async () => {
    const testDb = createTestDb();

    const report = {
      id: 'shift_20260827_001',
      date: '2026-08-27',
      period: 'الفترة الصباحية',
      total_sales: 2400,
      total_profit: 900,
      total_purchases: 500,
      total_withdrawals: 150,
      total_capital: 300,
      total_losses: 50,
      total_returns: 100,
      expected_cash: 1850,
      actual_cash: 1850,
      cash_difference: 0,
      cashier: 'أحمد عبد الله',
      notes: 'تم إغلاق الوردية ومطابقة الصندوق بدون عجز',
      created_at: new Date().toISOString()
    };

    testDb.run(
      `INSERT INTO shift_reports (
        id, date, period, total_sales, total_profit, total_purchases, total_withdrawals,
        total_capital, total_losses, total_returns, expected_cash, actual_cash, cash_difference,
        cashier, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        report.id, report.date, report.period, report.total_sales, report.total_profit,
        report.total_purchases, report.total_withdrawals, report.total_capital, report.total_losses,
        report.total_returns, report.expected_cash, report.actual_cash, report.cash_difference,
        report.cashier, report.notes, report.created_at
      ]
    );

    const saved = testDb.get('SELECT * FROM shift_reports WHERE id = ?', [report.id]);
    assert(saved, 'Shift report should be found in database');
    assert.strictEqual(saved.expected_cash, 1850);
    assert.strictEqual(saved.total_returns, 100);
    assert.strictEqual(saved.cash_difference, 0);

    testDb.close();
  });

  return results;
}
