/**
 * Suite 07: Concurrent Transactions & Deep Rollback Verification
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

  await test('7.1 50-Step Atomic Transaction Rollback on Mid-Stream Failure', async () => {
    const testDb = createTestDb();

    // Initial state: 10 inventory items with 50 qty each
    for (let i = 1; i <= 10; i++) {
      testDb.run(
        'INSERT INTO inventory (id, name, qty, cost, price) VALUES (?, ?, ?, ?, ?)',
        [`item_${i}`, `Item ${i}`, 50, 10, 20]
      );
    }

    // Build a 50-statement transaction where step 45 fails with a duplicate key constraint
    const multiTx = [];
    for (let i = 1; i <= 44; i++) {
      multiTx.push({
        sql: 'UPDATE inventory SET qty = qty - 1 WHERE id = ?',
        params: [`item_${(i % 10) + 1}`]
      });
      multiTx.push({
        sql: 'INSERT INTO notes (id, date, title, content) VALUES (?, ?, ?, ?)',
        params: [`note_${i}`, new Date().toISOString(), `Note ${i}`, `Content ${i}`]
      });
    }

    // Poison pill: step 89 (duplicate ID in inventory)
    multiTx.push({
      sql: 'INSERT INTO inventory (id, name, qty, cost, price) VALUES (?, ?, ?, ?, ?)',
      params: ['item_1', 'Duplicate item_1', 10, 5, 10] // Primary key collision!
    });

    let txFailed = false;
    try {
      testDb.transaction(multiTx);
    } catch (err) {
      txFailed = true;
    }

    assert(txFailed, 'Transaction must fail on primary key collision');

    // Verify 100% complete rollback:
    // 1. All inventory items must still have qty = 50
    for (let i = 1; i <= 10; i++) {
      const item = testDb.get('SELECT qty FROM inventory WHERE id = ?', [`item_${i}`]);
      assert.strictEqual(item.qty, 50, `Item ${i} qty must remain 50 after rollback`);
    }

    // 2. Zero notes should have been created
    const noteCount = testDb.get('SELECT COUNT(*) as cnt FROM notes').cnt;
    assert.strictEqual(noteCount, 0, 'Zero notes should exist after full rollback');

    testDb.close();
  });

  await test('7.2 Cascade Deletion on Sales and Sale Items', async () => {
    const testDb = createTestDb();

    // Enable foreign keys
    testDb.rawDb.pragma('foreign_keys = ON');

    testDb.run('INSERT INTO sales (id, date, total) VALUES (?, ?, ?)', [999, new Date().toISOString(), 150]);
    testDb.run('INSERT INTO sale_items (id, sale_id, product_id, name, cart_qty, final_price) VALUES (?, ?, ?, ?, ?, ?)', [
      1, 999, 'p1', 'عطر', 1, 150
    ]);

    const itemsBefore = testDb.query('SELECT * FROM sale_items WHERE sale_id = 999');
    assert.strictEqual(itemsBefore.length, 1);

    // Delete sale
    testDb.run('DELETE FROM sales WHERE id = 999');

    const itemsAfter = testDb.query('SELECT * FROM sale_items WHERE sale_id = 999');
    assert.strictEqual(itemsAfter.length, 0, 'Sale items must be deleted on cascade or cleaned up');

    testDb.close();
  });

  await test('7.3 Complex Compounding Atomic Transaction Rollback', async () => {
    const testDb = createTestDb();

    // Seed base raw materials
    testDb.run('INSERT INTO inventory (id, name, qty, cost, price) VALUES (?, ?, ?, ?, ?)', ['raw_alcohol', 'كحول نقي', 1000, 0.05, 0.1]);
    testDb.run('INSERT INTO inventory (id, name, qty, cost, price) VALUES (?, ?, ?, ?, ?)', ['raw_amber', 'زيت عنبر', 200, 2.0, 5.0]);

    // Transaction that attempts to compound new perfume but has a bad SQL in last step
    const badQueries = [
      { sql: "UPDATE inventory SET qty = qty - 200 WHERE id = 'raw_alcohol'", params: [] },
      { sql: "UPDATE inventory SET qty = qty - 50 WHERE id = 'raw_amber'", params: [] },
      { sql: 'INSERT INTO inventory (id, name, qty, cost, price) VALUES (?, ?, ?, ?, ?)', params: ['comp_amber_fresh', 'عنبر منعش', 10, 15, 40] },
      { sql: 'INSERT INTO non_existent_audit_log (action) VALUES (?)', params: ['compounded amber'] }
    ];

    let threw = false;
    try {
      testDb.transaction(badQueries);
    } catch (e) {
      threw = true;
    }

    assert(threw, 'Should throw due to invalid table');

    // Verify alcohol and amber quantities untouched
    const alcohol = testDb.get("SELECT qty FROM inventory WHERE id = 'raw_alcohol'");
    const amber = testDb.get("SELECT qty FROM inventory WHERE id = 'raw_amber'");
    const comp = testDb.get("SELECT * FROM inventory WHERE id = 'comp_amber_fresh'");

    assert.strictEqual(alcohol.qty, 1000, 'Alcohol stock must be untouched');
    assert.strictEqual(amber.qty, 200, 'Amber stock must be untouched');
    assert.strictEqual(comp, undefined, 'Compounded item must not exist in DB');

    testDb.close();
  });

  return results;
}
