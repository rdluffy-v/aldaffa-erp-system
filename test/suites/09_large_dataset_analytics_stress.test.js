/**
 * Suite 09: Large Dataset Analytics & Financial Aggregation Stress Test
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

  await test('9.1 High-Volume Financial Seeding (5,000 Sales & 15,000 Items)', async () => {
    const testDb = createTestDb();

    // Create 20 products across 4 categories
    const categories = ['عطور شرقية', 'عطور فرنسية', 'زيوت عطرية', 'دخون وبخور'];
    for (let c = 0; c < categories.length; c++) {
      testDb.run('INSERT INTO categories (id, name) VALUES (?, ?)', [`cat_${c}`, categories[c]]);
    }

    const prodQueries = [];
    for (let p = 1; p <= 20; p++) {
      const cat = categories[p % categories.length];
      prodQueries.push({
        sql: 'INSERT INTO inventory (id, name, category, qty, cost, price) VALUES (?, ?, ?, ?, ?, ?)',
        params: [`p_${p}`, `عطر تجريبي ${p}`, cat, 5000, 15 + p, 40 + p * 2]
      });
    }
    testDb.transaction(prodQueries);

    // Seed 5,000 sales spread over the year 2026
    const baseTime = new Date('2026-01-01T00:00:00.000Z').getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    const BATCH_SIZE = 500;
    for (let batch = 0; batch < 10; batch++) {
      const batchQueries = [];
      for (let i = 1; i <= BATCH_SIZE; i++) {
        const saleId = batch * BATCH_SIZE + i;
        // spread across 240 days
        const dateMs = baseTime + ((saleId * 17) % 240) * oneDay + (saleId % 86400) * 1000;
        const dateStr = new Date(dateMs).toISOString();

        const p1Id = `p_${(saleId % 20) + 1}`;
        const p2Id = `p_${((saleId + 3) % 20) + 1}`;

        const p1Price = 40 + ((saleId % 20) + 1) * 2;
        const p1Cost = 15 + ((saleId % 20) + 1);

        const p2Price = 40 + (((saleId + 3) % 20) + 1) * 2;
        const p2Cost = 15 + (((saleId + 3) % 20) + 1);

        const subtotal = p1Price * 2 + p2Price * 1;
        const profit = (p1Price - p1Cost) * 2 + (p2Price - p2Cost) * 1;
        const method = saleId % 4 === 0 ? 'card' : saleId % 7 === 0 ? 'bank_transfer' : 'cash';

        batchQueries.push({
          sql: 'INSERT INTO sales (id, date, subtotal, discount, total, profit, payment_method, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          params: [saleId, dateStr, subtotal, 0, subtotal, profit, method, 'store']
        });

        batchQueries.push({
          sql: 'INSERT INTO sale_items (sale_id, product_id, name, cart_qty, final_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
          params: [saleId, p1Id, `عطر تجريبي ${(saleId % 20) + 1}`, 2, p1Price, p1Cost]
        });

        batchQueries.push({
          sql: 'INSERT INTO sale_items (sale_id, product_id, name, cart_qty, final_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
          params: [saleId, p2Id, `عطر تجريبي ${((saleId + 3) % 20) + 1}`, 1, p2Price, p2Cost]
        });
      }
      testDb.transaction(batchQueries);
    }

    const salesCount = testDb.get('SELECT COUNT(*) as cnt FROM sales').cnt;
    const itemsCount = testDb.get('SELECT COUNT(*) as cnt FROM sale_items').cnt;

    assert.strictEqual(salesCount, 5000, '5,000 sales transactions seeded');
    assert.strictEqual(itemsCount, 10000, '10,000 sale items seeded');

    // 9.2 Measure Query Execution Latency on Large Dataset
    const qStart = Date.now();

    // 1. Sales Summary in Range (Q1 to Q3 2026)
    const summary = testDb.get(`
      SELECT
        COUNT(*) as total_sales,
        SUM(total) as total_revenue,
        SUM(profit) as total_profit,
        SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END) as cash_sales,
        SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END) as card_sales
      FROM sales
      WHERE date >= '2026-01-01T00:00:00.000Z' AND date <= '2026-08-31T23:59:59.999Z'
    `);

    assert(summary.total_sales > 0);
    assert(summary.total_revenue > 0);
    assert(summary.total_profit > 0);

    // 2. Top Selling & Most Profitable Products
    const topProducts = testDb.query(`
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
      WHERE s.date >= '2026-01-01T00:00:00.000Z' AND s.date <= '2026-08-31T23:59:59.999Z'
      GROUP BY si.product_id, si.name
      ORDER BY total_profit DESC
      LIMIT 10
    `);

    assert.strictEqual(topProducts.length, 10, 'Should return top 10 products');
    assert(topProducts[0].total_profit >= topProducts[1].total_profit, 'Top products must be strictly sorted by total profit');

    // 3. Category Breakdown
    const catBreakdown = testDb.query(`
      SELECT
        COALESCE(i.category, 'غير مصنف') as category,
        COUNT(DISTINCT s.id) as invoice_count,
        SUM(si.cart_qty) as total_qty,
        SUM(si.cart_qty * si.final_price) as total_revenue,
        SUM(si.cart_qty * (si.final_price - si.unit_cost)) as total_profit
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN inventory i ON si.product_id = i.id
      WHERE s.date >= '2026-01-01T00:00:00.000Z' AND s.date <= '2026-08-31T23:59:59.999Z'
      GROUP BY COALESCE(i.category, 'غير مصنف')
      ORDER BY total_revenue DESC
    `);

    assert.strictEqual(catBreakdown.length, 4, 'All 4 product categories must be accurately aggregated');

    const duration = Date.now() - qStart;
    assert(duration < 500, `Analytical aggregation queries took ${duration}ms, must be under 500ms`);

    testDb.close();
  });

  return results;
}
