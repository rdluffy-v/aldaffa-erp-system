/**
 * Suite 08: Zero, Negative & Boundary Condition Stress Test
 */

import assert from 'assert';
import { createTestDb } from '../harness/test-db.js';
import { safeParseFloat, formatCurrency, roundToTwo } from '../../src/utils/helpers.js';

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

  await test('8.1 Helper Functions Resiliency with Invalid & Boundary Inputs', async () => {
    // Test safeParseFloat
    assert.strictEqual(safeParseFloat(null, 0), 0);
    assert.strictEqual(safeParseFloat(undefined, 5), 5);
    assert.strictEqual(safeParseFloat('', 10), 10);
    assert.strictEqual(safeParseFloat('abc', 0), 0);
    assert.strictEqual(safeParseFloat(NaN, 0), 0);
    assert.strictEqual(safeParseFloat(Infinity, 0), 0);
    assert.strictEqual(safeParseFloat(-Infinity, 0), 0);
    assert.strictEqual(safeParseFloat('123.456', 0), 123.456);
    assert.strictEqual(safeParseFloat('-50.25', 0), -50.25);
    assert.strictEqual(safeParseFloat(0, 10), 0);

    // Test roundToTwo
    assert.strictEqual(roundToTwo(10.1234), 10.12);
    assert.strictEqual(roundToTwo(10.1289), 10.13);
    assert.strictEqual(roundToTwo(0), 0);
    assert.strictEqual(roundToTwo(-5.555), -5.55);
    assert.strictEqual(roundToTwo(null), 0);
    assert.strictEqual(roundToTwo('invalid'), 0);
  });

  await test('8.2 Zero and Negative Price & Qty in Database Computations', async () => {
    const testDb = createTestDb();

    // Zero price sale (promotional gift invoice)
    testDb.run(
      'INSERT INTO sales (id, date, subtotal, discount, total, profit, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [1, new Date().toISOString(), 0, 0, 0, -20, 'cash']
    );
    testDb.run(
      'INSERT INTO sale_items (sale_id, product_id, name, cart_qty, final_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
      [1, 'p_promo', 'عينة ترويجية مجانية', 1, 0, 20]
    );

    const sale = testDb.get('SELECT * FROM sales WHERE id = 1');
    assert.strictEqual(sale.total, 0);
    assert.strictEqual(sale.profit, -20);

    // Margin query with 0 total revenue should return 0% without crashing
    const marginSql = `
      SELECT
        si.product_id,
        CASE
          WHEN SUM(si.cart_qty * si.final_price) > 0
          THEN (SUM(si.cart_qty * (si.final_price - si.unit_cost)) / SUM(si.cart_qty * si.final_price)) * 100
          ELSE 0
        END as margin
      FROM sale_items si
      WHERE si.sale_id = 1
      GROUP BY si.product_id
    `;
    const marginRes = testDb.get(marginSql);
    assert.strictEqual(marginRes.margin, 0, 'Zero revenue margin must return 0 without division-by-zero exception');

    testDb.close();
  });

  await test('8.3 Extreme Discounts and Free Invoices', async () => {
    const testDb = createTestDb();

    // 100% discount: Subtotal 200, Discount 200 -> Total 0, Profit = 0 - 80 = -80
    testDb.run(
      'INSERT INTO sales (id, date, subtotal, discount, total, profit, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [2, new Date().toISOString(), 200, 200, 0, -80, 'cash']
    );
    testDb.run(
      'INSERT INTO sale_items (sale_id, product_id, name, cart_qty, final_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
      [2, 'prod_1', 'عطر مهدى', 2, 0, 40]
    );

    const summary = testDb.get('SELECT SUM(total) as rev, SUM(profit) as prof, SUM(discount) as disc FROM sales WHERE id = 2');
    assert.strictEqual(summary.rev, 0);
    assert.strictEqual(summary.prof, -80);
    assert.strictEqual(summary.disc, 200);

    testDb.close();
  });

  await test('8.4 Negative Inventory Adjustments and Debt Balance Boundary', async () => {
    const testDb = createTestDb();

    // Seed debtor with 100 debt
    testDb.run('INSERT INTO debtors (id, name, phone, total_debt) VALUES (?, ?, ?, ?)', ['deb_x', 'عميل x', '0911111111', 100]);

    // Overpayment of 150 debt: MAX(0, total_debt - payment)
    testDb.run('UPDATE debtors SET total_debt = MAX(0, total_debt - ?) WHERE id = ?', [150, 'deb_x']);

    const debtor = testDb.get("SELECT total_debt FROM debtors WHERE id = 'deb_x'");
    assert.strictEqual(debtor.total_debt, 0, 'Debtor balance should not drop below 0 when overpaid');

    testDb.close();
  });

  return results;
}
