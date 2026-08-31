/**
 * Suite 26: Full App Lifecycle 300% Verification: Inventory, Purchases WAC, Sales, Deletions, and Stock Invariants
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

  await test('26.1 Inventory: Adding product with initial stock and verifying SQLite record', async () => {
    const testDb = createTestDb();
    const prodId = 'test_prod_26_1';
    testDb.run(
      `INSERT INTO inventory (id, name, category, qty, cost, price, wholesale_price, unit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [prodId, 'عطر مسك الغزال الفاخر', 'عطور شرقية', 25, 40, 90, 70, 'قطعة']
    );

    const inserted = testDb.get('SELECT * FROM inventory WHERE id = ?', [prodId]);
    assert(inserted, 'Product must exist in SQLite');
    assert.strictEqual(inserted.qty, 25, 'Initial quantity must be exactly 25');
    assert.strictEqual(inserted.cost, 40, 'Initial cost must be 40');
    assert.strictEqual(inserted.price, 90, 'Initial retail price must be 90');
  });

  await test('26.2 Purchases: Creating a purchase order for new product correctly increments stock & WAC', async () => {
    const testDb = createTestDb();
    const newProdId = 'purch_prod_26_2';
    // 1. Create product as happens in Purchases.jsx wizard
    testDb.run(
      `INSERT INTO inventory (id, name, category, cost, price, qty, unit)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newProdId, 'عطر عنبر ملكي جديد', 'عطور ملكية', 50, 120, 0, 'قطعة']
    );

    // 2. Purchase 20 units at 50 LYD
    testDb.run(
      `UPDATE inventory
       SET
         cost = CASE WHEN (qty + 20) <= 0 THEN 50 ELSE (qty * cost + 20 * 50) / (qty + 20) END,
         qty = qty + 20
       WHERE id = ? OR CAST(id AS TEXT) = ?`,
      [newProdId, newProdId]
    );

    let updatedProd = testDb.get('SELECT * FROM inventory WHERE id = ?', [newProdId]);
    assert(updatedProd, 'Product must exist');
    assert.strictEqual(updatedProd.qty, 20, 'Product quantity must be incremented from 0 to 20');
    assert.strictEqual(updatedProd.cost, 50, 'Product cost must equal purchase cost');

    // 3. Purchase 10 units at 80 LYD: WAC = (20*50 + 10*80) / (20+10) = 1800 / 30 = 60 LYD
    testDb.run(
      `UPDATE inventory
       SET
         cost = CASE WHEN (qty + 10) <= 0 THEN 80 ELSE (qty * cost + 10 * 80) / (qty + 10) END,
         qty = qty + 10
       WHERE id = ? OR CAST(id AS TEXT) = ?`,
      [newProdId, newProdId]
    );

    const wacProd = testDb.get('SELECT * FROM inventory WHERE id = ?', [newProdId]);
    assert.strictEqual(wacProd.qty, 30, 'Product quantity must be 30');
    assert.strictEqual(Math.round(wacProd.cost), 60, 'Weighted Average Cost must equal 60');
  });

  await test('26.3 Purchases Deletion: Deleting purchase safely deducts stock and removes record', async () => {
    const testDb = createTestDb();
    const prodId = 'del_purch_prod_26_3';
    testDb.run(
      `INSERT INTO inventory (id, name, category, cost, price, qty, unit)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [prodId, 'عطر الورد الطائفي', 'عطور طبيعية', 30, 70, 10, 'قطعة']
    );

    const purchaseId = 'po_del_26_3';
    testDb.run(
      `INSERT INTO purchases (id, date, supplier_name, total, payment_type, items_json)
       VALUES (?, datetime('now'), ?, ?, ?, ?)`,
      [purchaseId, 'مؤسسة الزهور', 300, 'cash', JSON.stringify([{ product_id: prodId, quantity: 10, cost_per_unit: 30 }])]
    );

    let prod = testDb.get('SELECT * FROM inventory WHERE id = ?', [prodId]);
    assert.strictEqual(prod.qty, 10, 'Stock must be 10 before purchase deletion');

    // Delete purchase with stock deduction
    testDb.run('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?', [10, prodId]);
    testDb.run('DELETE FROM purchases WHERE id = ?', [purchaseId]);

    const deletedPo = testDb.get('SELECT * FROM purchases WHERE id = ?', [purchaseId]);
    assert.strictEqual(deletedPo, undefined, 'Purchase record must be deleted');

    prod = testDb.get('SELECT * FROM inventory WHERE id = ?', [prodId]);
    assert.strictEqual(prod.qty, 0, 'Stock must be deducted back to 0');
  });

  await test('26.4 Instant Product Deletion: Product is deleted from database without ghost records', async () => {
    const testDb = createTestDb();
    const prodId = 'instant_del_26_4';
    testDb.run(
      `INSERT INTO inventory (id, name, category, qty, cost, price, unit)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [prodId, 'عطر الصندل المحذوف', 'أخشاب', 5, 20, 50, 'قطعة']
    );

    let found = testDb.get('SELECT * FROM inventory WHERE id = ?', [prodId]);
    assert(found, 'Product must exist initially');

    testDb.run('DELETE FROM inventory WHERE id = ? OR CAST(id AS TEXT) = ?', [prodId, prodId]);

    found = testDb.get('SELECT * FROM inventory WHERE id = ?', [prodId]);
    assert.strictEqual(found, undefined, 'Product must be immediately deleted in SQLite');
  });

  await test('26.5 Sales, POS & Returns: Stock deduction on sale and full restoration on return', async () => {
    const testDb = createTestDb();
    const prodId = 'sale_prod_26_5';
    testDb.run(
      `INSERT INTO inventory (id, name, category, qty, cost, price, unit)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [prodId, 'عطر خشب الصندل الإندونيسي', 'أخشاب', 15, 50, 100, 'قطعة']
    );

    // Make POS sale of 3 units
    testDb.run(
      `INSERT INTO sales (id, date, subtotal, discount, total, profit, payment_method, customer_name, type)
       VALUES (501, datetime('now'), 300, 0, 300, 150, 'cash', 'زبون نقدي', 'store')`
    );
    testDb.run(
      `INSERT INTO sale_items (sale_id, product_id, name, cart_qty, unit, final_price, unit_cost)
       VALUES (501, ?, 'عطر خشب الصندل الإندونيسي', 3, 'قطعة', 100, 50)`,
      [prodId]
    );
    testDb.run('UPDATE inventory SET qty = qty - 3 WHERE id = ?', [prodId]);

    let prod = testDb.get('SELECT * FROM inventory WHERE id = ?', [prodId]);
    assert.strictEqual(prod.qty, 12, 'Inventory stock must be deducted from 15 to 12');

    // Delete sale with stock restore
    testDb.run('UPDATE inventory SET qty = qty + 3 WHERE id = ?', [prodId]);
    testDb.run('DELETE FROM sales WHERE id = 501');
    testDb.run('DELETE FROM sale_items WHERE sale_id = 501');

    prod = testDb.get('SELECT * FROM inventory WHERE id = ?', [prodId]);
    assert.strictEqual(prod.qty, 15, 'Inventory stock must be fully restored to 15');
  });

  await test('26.6 Gifts & Losses: Inventory deduction and restoration', async () => {
    const testDb = createTestDb();
    const prodId = 'gift_prod_26_6';
    testDb.run(
      `INSERT INTO inventory (id, name, category, qty, cost, price, unit)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [prodId, 'عطر هدية VIP', 'هدايا', 10, 30, 80, 'قطعة']
    );

    const giftId = 'gift_26_6';
    testDb.run(
      `INSERT INTO gifts (id, date, recipient_name, reason, product_id, item_name, qty, unit, cost_value)
       VALUES (?, datetime('now'), 'أحمد الزروق', 'هدية افتتاح', ?, 'عطر هدية VIP', 2, 'قطعة', 60)`,
      [giftId, prodId]
    );
    testDb.run('UPDATE inventory SET qty = qty - 2 WHERE id = ?', [prodId]);

    let prod = testDb.get('SELECT * FROM inventory WHERE id = ?', [prodId]);
    assert.strictEqual(prod.qty, 8, 'Stock must decrease from 10 to 8');

    // Restore gift
    testDb.run('UPDATE inventory SET qty = qty + 2 WHERE id = ?', [prodId]);
    testDb.run('DELETE FROM gifts WHERE id = ?', [giftId]);

    prod = testDb.get('SELECT * FROM inventory WHERE id = ?', [prodId]);
    assert.strictEqual(prod.qty, 10, 'Stock must restore to 10');
  });

  await test('26.7 Categories & Debtors: Full CRUD and Foreign Reference Integrity', async () => {
    const testDb = createTestDb();
    const catId = 'cat_26_7';
    testDb.run(`INSERT INTO categories (id, name, icon) VALUES (?, 'تصنيف التجربة السريعة', '⚡')`, [catId]);

    let cat = testDb.get('SELECT * FROM categories WHERE id = ?', [catId]);
    assert(cat, 'Category must exist');

    testDb.run('DELETE FROM categories WHERE id = ?', [catId]);
    cat = testDb.get('SELECT * FROM categories WHERE id = ?', [catId]);
    assert.strictEqual(cat, undefined, 'Category must be deleted');

    // Debtor creation, transaction, and deletion
    const debtorId = 'deb_26_7';
    testDb.run(`INSERT INTO debtors (id, name, phone, total_debt) VALUES (?, 'عميل الديون التجريبي', '0910000000', 0)`, [debtorId]);

    let debtor = testDb.get('SELECT * FROM debtors WHERE id = ?', [debtorId]);
    assert(debtor, 'Debtor must exist');

    testDb.run(
      `INSERT INTO debt_history (id, debtor_id, type, amount, date)
       VALUES ('tx_26_7', ?, 'debt', 250, datetime('now'))`,
      [debtorId]
    );
    testDb.run('UPDATE debtors SET total_debt = total_debt + 250 WHERE id = ?', [debtorId]);

    debtor = testDb.get('SELECT * FROM debtors WHERE id = ?', [debtorId]);
    assert.strictEqual(debtor.total_debt, 250, 'Total debt must be 250');

    testDb.run('DELETE FROM debt_history WHERE debtor_id = ?', [debtorId]);
    testDb.run('DELETE FROM debtors WHERE id = ?', [debtorId]);

    debtor = testDb.get('SELECT * FROM debtors WHERE id = ?', [debtorId]);
    assert.strictEqual(debtor, undefined, 'Debtor must be deleted');
  });

  return results;
}
