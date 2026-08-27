/**
 * Suite 03: Sales, Indexed Range Queries & Advanced Analytics
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

  await test('3.1 Sales Range Queries & Aggregations', async () => {
    const testDb = createTestDb();

    // Insert 3 sales at different dates
    testDb.run('INSERT INTO sales (id, date, total, profit, payment_method) VALUES (?, ?, ?, ?, ?)', [
      1, '2026-08-01T10:00:00.000Z', 100, 40, 'cash'
    ]);
    testDb.run('INSERT INTO sales (id, date, total, profit, payment_method) VALUES (?, ?, ?, ?, ?)', [
      2, '2026-08-15T14:00:00.000Z', 250, 110, 'card'
    ]);
    testDb.run('INSERT INTO sales (id, date, total, profit, payment_method) VALUES (?, ?, ?, ?, ?)', [
      3, '2026-08-25T18:00:00.000Z', 300, 150, 'cash'
    ]);

    // Query in range Aug 10 to Aug 30
    const salesInRange = testDb.query(
      'SELECT * FROM sales WHERE date >= ? AND date <= ? ORDER BY date DESC',
      ['2026-08-10T00:00:00.000Z', '2026-08-30T23:59:59.999Z']
    );

    assert.strictEqual(salesInRange.length, 2, 'Should find 2 sales in mid-to-late August');
    assert.strictEqual(salesInRange[0].id, 3);
    assert.strictEqual(salesInRange[1].id, 2);

    const totalRev = salesInRange.reduce((acc, s) => acc + s.total, 0);
    assert.strictEqual(totalRev, 550);

    const totalProf = salesInRange.reduce((acc, s) => acc + s.profit, 0);
    assert.strictEqual(totalProf, 260);

    testDb.close();
  });

  await test('3.2 Top Profitable Products SQL Aggregation', async () => {
    const testDb = createTestDb();

    testDb.run('INSERT INTO sales (id, date, total, profit) VALUES (?, ?, ?, ?)', [
      1, '2026-08-20T12:00:00.000Z', 500, 300
    ]);
    testDb.run('INSERT INTO sales (id, date, total, profit) VALUES (?, ?, ?, ?)', [
      2, '2026-08-21T12:00:00.000Z', 400, 200
    ]);

    // Product A: 5 units @ 40 price, 10 cost -> 200 revenue, 150 profit
    testDb.run('INSERT INTO sale_items (sale_id, product_id, name, cart_qty, final_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?)', [
      1, 'prod_a', 'عطر المسك الأبيض', 5, 40, 10
    ]);
    // Product B: 3 units @ 100 price, 50 cost -> 300 revenue, 150 profit
    testDb.run('INSERT INTO sale_items (sale_id, product_id, name, cart_qty, final_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?)', [
      1, 'prod_b', 'دهن عود كلمنتان', 3, 100, 50
    ]);
    // Product A again in sale 2: 5 units @ 40 price, 10 cost -> 200 rev, 150 prof (total A profit = 300)
    testDb.run('INSERT INTO sale_items (sale_id, product_id, name, cart_qty, final_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?)', [
      2, 'prod_a', 'عطر المسك الأبيض', 5, 40, 10
    ]);

    const sql = `
      SELECT
        si.product_id,
        si.name,
        SUM(si.cart_qty) as total_qty,
        SUM(si.cart_qty * si.final_price) as total_revenue,
        SUM(si.cart_qty * (si.final_price - si.unit_cost)) as total_profit,
        CASE
          WHEN SUM(si.cart_qty * si.final_price) > 0
          THEN (SUM(si.cart_qty * (si.final_price - si.unit_cost)) / SUM(si.cart_qty * si.final_price)) * 100
          ELSE 0
        END as profit_margin_pct
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      GROUP BY si.product_id, si.name
      ORDER BY total_profit DESC
      LIMIT 10
    `;

    const profitable = testDb.query(sql);
    assert.strictEqual(profitable.length, 2);
    assert.strictEqual(profitable[0].product_id, 'prod_a', 'Product A should be top profitable (300 profit)');
    assert.strictEqual(profitable[0].total_profit, 300);
    assert.strictEqual(profitable[0].total_qty, 10);
    assert.strictEqual(profitable[0].profit_margin_pct, 75); // (300 / 400) * 100 = 75%

    assert.strictEqual(profitable[1].product_id, 'prod_b');
    assert.strictEqual(profitable[1].total_profit, 150);

    testDb.close();
  });

  await test('3.3 Sales by Category Breakdown', async () => {
    const testDb = createTestDb();

    testDb.run('INSERT INTO inventory (id, name, category, cost, price) VALUES (?, ?, ?, ?, ?)', ['i1', 'عطر شرقي', 'عطور شرقية', 20, 50]);
    testDb.run('INSERT INTO inventory (id, name, category, cost, price) VALUES (?, ?, ?, ?, ?)', ['i2', 'عطر فرنسي', 'عطور فرنسية', 30, 80]);

    testDb.run('INSERT INTO sales (id, date, total, profit) VALUES (?, ?, ?, ?)', [1, '2026-08-20T10:00:00.000Z', 130, 80]);
    testDb.run('INSERT INTO sale_items (sale_id, product_id, name, cart_qty, final_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?)', [
      1, 'i1', 'عطر شرقي', 1, 50, 20
    ]);
    testDb.run('INSERT INTO sale_items (sale_id, product_id, name, cart_qty, final_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?)', [
      1, 'i2', 'عطر فرنسي', 1, 80, 30
    ]);

    const sql = `
      SELECT
        COALESCE(i.category, 'غير مصنف') as category,
        COUNT(DISTINCT s.id) as invoice_count,
        SUM(si.cart_qty) as total_qty,
        SUM(si.cart_qty * si.final_price) as total_revenue,
        SUM(si.cart_qty * (si.final_price - si.unit_cost)) as total_profit
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN inventory i ON si.product_id = i.id
      GROUP BY COALESCE(i.category, 'غير مصنف')
      ORDER BY total_revenue DESC
    `;

    const byCat = testDb.query(sql);
    assert.strictEqual(byCat.length, 2);
    assert.strictEqual(byCat[0].category, 'عطور فرنسية');
    assert.strictEqual(byCat[0].total_revenue, 80);
    assert.strictEqual(byCat[1].category, 'عطور شرقية');
    assert.strictEqual(byCat[1].total_revenue, 50);

    testDb.close();
  });

  return results;
}
