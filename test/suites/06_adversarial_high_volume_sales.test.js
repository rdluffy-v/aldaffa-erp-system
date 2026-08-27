/**
 * Suite 06: Adversarial High-Volume Sales & Stock Deductions Stress Test
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

  await test('6.1 High Volume Inventory Seeding & Stock Integrity (2,000 Items)', async () => {
    const testDb = createTestDb();

    // Prepare 2,000 inventory items
    const insertQueries = [];
    for (let i = 1; i <= 2000; i++) {
      insertQueries.push({
        sql: 'INSERT INTO inventory (id, name, category, qty, cost, price, capacity) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [`prod_${i}`, `عطر اختباري ${i}`, (i % 5 === 0 ? 'شرقي' : 'فرنسي'), 100, 20.5, 45.0, 100]
      });
    }

    testDb.transaction(insertQueries);

    const count = testDb.get('SELECT COUNT(*) as cnt FROM inventory').cnt;
    assert.strictEqual(count, 2000, 'All 2,000 products must be seeded successfully');

    testDb.close();
  });

  await test('6.2 High Volume Consecutive Sales Execution (1,000 Transactions)', async () => {
    const testDb = createTestDb();

    // Seed 10 base products with 1,000 qty each
    for (let i = 1; i <= 10; i++) {
      testDb.run(
        'INSERT INTO inventory (id, name, category, qty, cost, price, capacity) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [`item_${i}`, `منتج رقم ${i}`, 'عام', 1000, 10, 25, 50]
      );
    }

    // Execute 1,000 sales transactions (each sale purchasing 1 unit of item_1 and 2 units of item_2)
    const salesTx = [];
    const baseDate = new Date('2026-08-01T00:00:00.000Z').getTime();

    for (let s = 1; s <= 1000; s++) {
      const saleDate = new Date(baseDate + s * 60000).toISOString();
      const saleQueries = [
        {
          sql: 'INSERT INTO sales (id, date, subtotal, discount, total, profit, payment_method, customer_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          params: [s, saleDate, 75, 0, 75, 45, (s % 3 === 0 ? 'card' : 'cash'), `عميل_${s}`]
        },
        {
          sql: 'INSERT INTO sale_items (sale_id, product_id, name, cart_qty, final_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
          params: [s, 'item_1', 'منتج رقم 1', 1, 25, 10]
        },
        {
          sql: 'INSERT INTO sale_items (sale_id, product_id, name, cart_qty, final_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
          params: [s, 'item_2', 'منتج رقم 2', 2, 25, 10]
        },
        {
          sql: "UPDATE inventory SET qty = qty - 1 WHERE id = 'item_1'",
          params: []
        },
        {
          sql: "UPDATE inventory SET qty = qty - 2 WHERE id = 'item_2'",
          params: []
        }
      ];

      // Execute in atomic transaction per sale
      testDb.transaction(saleQueries);
    }

    // Verification
    const totalSales = testDb.get('SELECT COUNT(*) as cnt, SUM(total) as rev, SUM(profit) as prof FROM sales');
    assert.strictEqual(totalSales.cnt, 1000, 'Should have exactly 1,000 recorded sales');
    assert.strictEqual(totalSales.rev, 75000, 'Total revenue must be 75,000');
    assert.strictEqual(totalSales.prof, 45000, 'Total profit must be 45,000');

    // Check inventory exact deductions
    const item1 = testDb.get("SELECT qty FROM inventory WHERE id = 'item_1'");
    const item2 = testDb.get("SELECT qty FROM inventory WHERE id = 'item_2'");
    assert.strictEqual(item1.qty, 0, 'Item 1 stock should be exactly 1000 - 1000 = 0');
    assert.strictEqual(item2.qty, -1000, 'Item 2 stock should be exactly 1000 - 2000 = -1000 (negative stock tracked correctly)');

    testDb.close();
  });

  await test('6.3 Fractional Portion (ML) Stock Deductions Precision', async () => {
    const testDb = createTestDb();

    // 1 Bottle of 100ml Oil (qty = 1 bottle, capacity = 100ml)
    testDb.run(
      'INSERT INTO inventory (id, name, category, qty, cost, price, capacity) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['oil_musk', 'زيت مسك مركز 100مل', 'زيوت', 10, 50, 120, 100]
    );

    // Dispense 15ml via POS (cart_qty = 1, portion_ml = 15, capacity = 100 -> qtyToDeduct = 1 * 15 / 100 = 0.15 bottle)
    const qtyToDeduct = (1 * 15) / 100; // 0.15
    const queries = [
      {
        sql: 'INSERT INTO sales (id, date, subtotal, total, profit) VALUES (?, ?, ?, ?, ?)',
        params: [1, new Date().toISOString(), 18, 18, 10.5]
      },
      {
        sql: 'INSERT INTO sale_items (sale_id, product_id, name, cart_qty, final_price, unit_cost, portion_ml) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [1, 'oil_musk', 'زيت مسك مركز 100مل', 1, 18, 7.5, 15]
      },
      {
        sql: 'UPDATE inventory SET qty = qty - ? WHERE id = ?',
        params: [qtyToDeduct, 'oil_musk']
      }
    ];

    testDb.transaction(queries);

    const updated = testDb.get('SELECT qty FROM inventory WHERE id = ?', ['oil_musk']);
    assert.strictEqual(Number(updated.qty.toFixed(2)), 9.85, '10 - 0.15 must equal 9.85');

    testDb.close();
  });

  return results;
}
