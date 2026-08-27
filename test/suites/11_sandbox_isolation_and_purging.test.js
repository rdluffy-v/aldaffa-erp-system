/**
 * Suite 11: Sandbox Demo Data Isolation & Multi-Table Atomic Purge Stress Test
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

  await test('11.1 Multi-Table Demo Data Partitioning & Atomic Purge', async () => {
    const testDb = createTestDb();

    // 1. Seed Real User Data (is_demo = 0)
    testDb.run('INSERT INTO inventory (id, name, qty, cost, price, is_demo) VALUES (?, ?, ?, ?, ?, ?)', [
      'real_inv_1', 'عطر حقيقي للتاجر', 50, 20, 50, 0
    ]);
    testDb.run('INSERT INTO sales (id, date, total, profit, is_demo) VALUES (?, ?, ?, ?, ?)', [
      1001, '2026-08-20T10:00:00.000Z', 500, 200, 0
    ]);
    testDb.run('INSERT INTO sale_items (id, sale_id, product_id, name, cart_qty, final_price, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      1001, 1001, 'real_inv_1', 'عطر حقيقي للتاجر', 10, 50, 0
    ]);
    testDb.run('INSERT INTO withdrawals (id, date, amount, recipient, reason) VALUES (?, ?, ?, ?, ?)', [
      'real_w_1', '2026-08-20T10:00:00.000Z', 100, 'إيجار المحل', 'مصروف حقيقي'
    ]);
    testDb.run('INSERT INTO capital_injections (id, date, donor_name, amount) VALUES (?, ?, ?, ?)', [
      'real_cap_1', '2026-08-20T10:00:00.000Z', 'المالك', 5000
    ]);
    testDb.run('INSERT INTO debtors (id, name, phone, total_debt) VALUES (?, ?, ?, ?)', [
      'real_deb_1', 'عميل دائم', '0912345678', 300
    ]);

    // 2. Seed Mock Demo Data (is_demo = 1) across tables
    const demoQueries = [];
    for (let i = 1; i <= 100; i++) {
      demoQueries.push({
        sql: 'INSERT INTO inventory (id, name, qty, cost, price, is_demo) VALUES (?, ?, ?, ?, ?, ?)',
        params: [`demo_inv_${i}`, `عطر تجريبي ${i}`, 10, 15, 35, 1]
      });
      demoQueries.push({
        sql: 'INSERT INTO sales (id, date, total, profit, is_demo) VALUES (?, ?, ?, ?, ?)',
        params: [2000 + i, '2026-08-21T12:00:00.000Z', 70, 40, 1]
      });
      demoQueries.push({
        sql: 'INSERT INTO sale_items (id, sale_id, product_id, name, cart_qty, final_price, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [2000 + i, 2000 + i, `demo_inv_${i}`, `عطر تجريبي ${i}`, 2, 35, 1]
      });
    }
    testDb.transaction(demoQueries);

    // Verify pre-purge state
    const realInvCount = testDb.get('SELECT COUNT(*) as cnt FROM inventory WHERE is_demo = 0').cnt;
    const demoInvCount = testDb.get('SELECT COUNT(*) as cnt FROM inventory WHERE is_demo = 1').cnt;
    assert.strictEqual(realInvCount, 1);
    assert.strictEqual(demoInvCount, 100);

    const realSalesCount = testDb.get('SELECT COUNT(*) as cnt FROM sales WHERE is_demo = 0').cnt;
    const demoSalesCount = testDb.get('SELECT COUNT(*) as cnt FROM sales WHERE is_demo = 1').cnt;
    assert.strictEqual(realSalesCount, 1);
    assert.strictEqual(demoSalesCount, 100);

    // 3. Execute Atomic Sandbox Demo Data Purge
    const ALL_SANDBOX_TABLES = [
      'inventory', 'sales', 'sale_items'
    ];

    const purgeQueries = ALL_SANDBOX_TABLES.map(table => ({
      sql: `DELETE FROM ${table} WHERE is_demo = 1`,
      params: []
    }));

    testDb.transaction(purgeQueries);

    // 4. Verify post-purge state: 0 demo records remain, 100% real records intact
    const remainingDemoInv = testDb.get('SELECT COUNT(*) as cnt FROM inventory WHERE is_demo = 1').cnt;
    const remainingRealInv = testDb.get('SELECT COUNT(*) as cnt FROM inventory WHERE is_demo = 0').cnt;
    assert.strictEqual(remainingDemoInv, 0, 'Zero demo inventory items must remain after purge');
    assert.strictEqual(remainingRealInv, 1, 'Real inventory item must be 100% preserved');

    const remainingDemoSales = testDb.get('SELECT COUNT(*) as cnt FROM sales WHERE is_demo = 1').cnt;
    const remainingRealSales = testDb.get('SELECT COUNT(*) as cnt FROM sales WHERE is_demo = 0').cnt;
    assert.strictEqual(remainingDemoSales, 0, 'Zero demo sales must remain after purge');
    assert.strictEqual(remainingRealSales, 1, 'Real sale must be 100% preserved');

    const remainingDemoItems = testDb.get('SELECT COUNT(*) as cnt FROM sale_items WHERE is_demo = 1').cnt;
    const remainingRealItems = testDb.get('SELECT COUNT(*) as cnt FROM sale_items WHERE is_demo = 0').cnt;
    assert.strictEqual(remainingDemoItems, 0, 'Zero demo sale items must remain after purge');
    assert.strictEqual(remainingRealItems, 1, 'Real sale items must be 100% preserved');

    // Check non-sandbox tables were completely unaffected
    const realDebtor = testDb.get("SELECT * FROM debtors WHERE id = 'real_deb_1'");
    assert.strictEqual(realDebtor.total_debt, 300);

    testDb.close();
  });

  return results;
}
