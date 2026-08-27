/**
 * Suite 02: Atomic Transactions & Rollback Behavior
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

  await test('2.1 Multi-Query Transaction Commit', async () => {
    const testDb = createTestDb();

    // Seed raw materials
    testDb.run('INSERT INTO inventory (id, name, qty, cost, price) VALUES (?, ?, ?, ?, ?)', [
      'bottle_1', 'زجاجة عطر 50 مل', 100, 5, 10
    ]);
    testDb.run('INSERT INTO inventory (id, name, qty, cost, price) VALUES (?, ?, ?, ?, ?)', [
      'oil_oud', 'زيت عود ملكي', 500, 2, 5
    ]);

    // Atomic Batch Compounding:
    // 1. Insert compound perfume
    // 2. Deduct bottle stock
    // 3. Deduct oil stock
    // 4. Insert formula note
    const queries = [
      {
        sql: 'INSERT INTO inventory (id, name, qty, cost, price, category) VALUES (?, ?, ?, ?, ?, ?)',
        params: ['perfume_royal', 'عطر العود الملكي المخلط', 10, 25, 60, 'عطور مركبة']
      },
      {
        sql: 'UPDATE inventory SET qty = qty - ? WHERE id = ?',
        params: [10, 'bottle_1']
      },
      {
        sql: 'UPDATE inventory SET qty = qty - ? WHERE id = ?',
        params: [150, 'oil_oud']
      },
      {
        sql: 'INSERT INTO notes (id, date, title, content) VALUES (?, ?, ?, ?)',
        params: ['note_formula_1', new Date().toISOString(), 'FORMULA: عطر العود الملكي', '{"oils":150}']
      }
    ];

    const txRes = testDb.transaction(queries);
    assert.strictEqual(txRes.length, 4, 'All 4 transaction operations must return execution results');

    // Verify all records updated atomically
    const perfume = testDb.get('SELECT * FROM inventory WHERE id = ?', ['perfume_royal']);
    assert(perfume, 'Compounded perfume should exist');
    assert.strictEqual(perfume.qty, 10);

    const bottle = testDb.get('SELECT * FROM inventory WHERE id = ?', ['bottle_1']);
    assert.strictEqual(bottle.qty, 90, 'Bottle stock should be 100 - 10 = 90');

    const oil = testDb.get('SELECT * FROM inventory WHERE id = ?', ['oil_oud']);
    assert.strictEqual(oil.qty, 350, 'Oil stock should be 500 - 150 = 350');

    const note = testDb.get('SELECT * FROM notes WHERE id = ?', ['note_formula_1']);
    assert(note, 'Formula note should exist');

    testDb.close();
  });

  await test('2.2 Automatic Rollback on SQL Syntax / Constraint Error', async () => {
    const testDb = createTestDb();

    // Initial state
    testDb.run('INSERT INTO inventory (id, name, qty, cost, price) VALUES (?, ?, ?, ?, ?)', [
      'product_x', 'عطر اختبار', 50, 10, 25
    ]);

    const queriesWithFailure = [
      {
        sql: 'UPDATE inventory SET qty = qty - ? WHERE id = ?',
        params: [10, 'product_x']
      },
      {
        // Invalid query: table does not exist
        sql: 'INSERT INTO non_existent_table_xyz (col1) VALUES (?)',
        params: ['broken_data']
      }
    ];

    let errorCaught = false;
    try {
      testDb.transaction(queriesWithFailure);
    } catch (err) {
      errorCaught = true;
    }

    assert(errorCaught, 'Transaction must throw an error when a sub-query fails');

    // Verify product_x was NOT updated (remains 50 instead of 40)
    const product = testDb.get('SELECT * FROM inventory WHERE id = ?', ['product_x']);
    assert.strictEqual(product.qty, 50, 'Stock must remain 50 due to full transaction rollback');

    testDb.close();
  });

  await test('2.3 Returns Processing Atomic Transaction', async () => {
    const testDb = createTestDb();

    // Seed sale and items
    testDb.run('INSERT INTO inventory (id, name, qty, cost, price) VALUES (?, ?, ?, ?, ?)', ['p1', 'عطر مميز', 10, 20, 50]);
    testDb.run('INSERT INTO sales (id, date, subtotal, total, profit) VALUES (?, ?, ?, ?, ?)', [101, new Date().toISOString(), 100, 100, 60]);
    testDb.run('INSERT INTO sale_items (id, sale_id, product_id, name, cart_qty, final_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      1, 101, 'p1', 'عطر مميز', 2, 50, 20
    ]);

    // Return 1 piece:
    // 1. Stock +1
    // 2. sale_items cart_qty = 1
    // 3. sales total = 50, profit = 30
    // 4. insert return record
    const returnQueries = [
      {
        sql: 'UPDATE inventory SET qty = qty + ? WHERE id = ?',
        params: [1, 'p1']
      },
      {
        sql: 'UPDATE sale_items SET cart_qty = ? WHERE id = ?',
        params: [1, 1]
      },
      {
        sql: 'UPDATE sales SET total = ?, subtotal = ?, profit = ? WHERE id = ?',
        params: [50, 50, 30, 101]
      },
      {
        sql: 'INSERT INTO returns (sale_id, date, returned_amount, returned_cost, items_json) VALUES (?, ?, ?, ?, ?)',
        params: [101, new Date().toISOString(), 50, 20, '[{"name":"عطر مميز","qty":1}]']
      }
    ];

    testDb.transaction(returnQueries);

    const updatedInv = testDb.get('SELECT qty FROM inventory WHERE id = ?', ['p1']);
    assert.strictEqual(updatedInv.qty, 11, 'Inventory should be restored from 10 to 11');

    const updatedSale = testDb.get('SELECT total, profit FROM sales WHERE id = ?', [101]);
    assert.strictEqual(updatedSale.total, 50);
    assert.strictEqual(updatedSale.profit, 30);

    const returnRec = testDb.get('SELECT * FROM returns WHERE sale_id = ?', [101]);
    assert(returnRec);
    assert.strictEqual(returnRec.returned_amount, 50);

    testDb.close();
  });

  return results;
}
