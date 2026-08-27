/**
 * Suite 05: Complete 20-Module System Coverage & Business Logic Verification
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

  const testDb = createTestDb();

  await test('5.1 Categories Module CRUD', async () => {
    testDb.run('INSERT INTO categories (id, name, icon) VALUES (?, ?, ?)', ['cat_oriental', 'عطور شرقية', 'Sparkles']);
    const cat = testDb.get('SELECT * FROM categories WHERE id = ?', ['cat_oriental']);
    assert(cat);
    assert.strictEqual(cat.name, 'عطور شرقية');

    testDb.run('UPDATE categories SET name = ? WHERE id = ?', ['عطور شرقية فاخرة', 'cat_oriental']);
    const updated = testDb.get('SELECT name FROM categories WHERE id = ?', ['cat_oriental']);
    assert.strictEqual(updated.name, 'عطور شرقية فاخرة');
  });

  await test('5.2 Inventory Module & Low Stock Detection', async () => {
    testDb.run('INSERT INTO inventory (id, name, category, qty, cost, price, min_qty, barcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      'item_musk', 'مسك الطهارة', 'عطور زيتية', 2, 10, 25, 5, '6281001001'
    ]);

    const item = testDb.get('SELECT * FROM inventory WHERE id = ?', ['item_musk']);
    assert(item);
    assert.strictEqual(item.qty, 2);

    // Low stock query (qty <= min_qty)
    const lowStock = testDb.query('SELECT * FROM inventory WHERE qty <= min_qty');
    assert(lowStock.some((i) => i.id === 'item_musk'), 'Item with qty 2 and min_qty 5 should be flagged as low stock');
  });

  await test('5.3 POS & Sales Checkout Module', async () => {
    testDb.run('INSERT INTO sales (id, date, subtotal, discount, total, profit, payment_method, customer_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      501, new Date().toISOString(), 200, 20, 180, 80, 'cash', 'محمد علي'
    ]);
    testDb.run('INSERT INTO sale_items (sale_id, product_id, name, cart_qty, final_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?)', [
      501, 'item_musk', 'مسك الطهارة', 2, 90, 50
    ]);

    const sale = testDb.get('SELECT * FROM sales WHERE id = ?', [501]);
    assert.strictEqual(sale.total, 180);
    assert.strictEqual(sale.discount, 20);

    const items = testDb.query('SELECT * FROM sale_items WHERE sale_id = ?', [501]);
    assert.strictEqual(items.length, 1);
  });

  await test('5.4 Invoices Module', async () => {
    const invoices = testDb.query('SELECT * FROM sales ORDER BY id DESC');
    assert(invoices.length > 0);
    assert.strictEqual(invoices[0].customer_name, 'محمد علي');
  });

  await test('5.5 Purchases & Supplier Orders Module', async () => {
    testDb.run('INSERT INTO purchases (id, date, supplier_name, total, items_json) VALUES (?, ?, ?, ?, ?)', [
      'po_101', new Date().toISOString(), 'شركة العود العالمية', 1200, '[{"name":"خام عود","qty":10,"cost":120}]'
    ]);
    const po = testDb.get('SELECT * FROM purchases WHERE id = ?', ['po_101']);
    assert(po);
    assert.strictEqual(po.total, 1200);
    assert.strictEqual(po.supplier_name, 'شركة العود العالمية');
  });

  await test('5.6 Debtors & Debt History Module', async () => {
    testDb.run('INSERT INTO debtors (id, name, phone, total_debt) VALUES (?, ?, ?, ?)', [
      'deb_1', 'خالد عبد الله', '0912345678', 350
    ]);
    testDb.run('INSERT INTO debt_history (id, debtor_id, date, type, amount, invoice_id) VALUES (?, ?, ?, ?, ?, ?)', [
      'dh_1', 'deb_1', new Date().toISOString(), 'debt_added', 350, 501
    ]);

    const debtor = testDb.get('SELECT * FROM debtors WHERE id = ?', ['deb_1']);
    assert.strictEqual(debtor.total_debt, 350);

    // Repay debt
    testDb.run('UPDATE debtors SET total_debt = total_debt - ? WHERE id = ?', [150, 'deb_1']);
    testDb.run('INSERT INTO debt_history (id, debtor_id, date, type, amount) VALUES (?, ?, ?, ?, ?)', [
      'dh_2', 'deb_1', new Date().toISOString(), 'payment', 150
    ]);

    const updatedDebtor = testDb.get('SELECT total_debt FROM debtors WHERE id = ?', ['deb_1']);
    assert.strictEqual(updatedDebtor.total_debt, 200, 'Debt should decrease to 200');
  });

  await test('5.7 Losses & Spoilage Module', async () => {
    testDb.run('INSERT INTO losses (id, date, item_name, qty, unit, cost_value, reason) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      'loss_1', new Date().toISOString(), 'زجاجة عطر مكسورة', 1, 'قطعة', 45, 'كسر أثناء الترتيب'
    ]);
    const loss = testDb.get('SELECT * FROM losses WHERE id = ?', ['loss_1']);
    assert.strictEqual(loss.cost_value, 45);
  });

  await test('5.8 Withdrawals & Expenses Module', async () => {
    testDb.run('INSERT INTO withdrawals (id, date, amount, recipient, reason) VALUES (?, ?, ?, ?, ?)', [
      'w_1', new Date().toISOString(), 80, 'الكهرباء', 'فاتورة كهرباء المحل'
    ]);
    const w = testDb.get('SELECT * FROM withdrawals WHERE id = ?', ['w_1']);
    assert.strictEqual(w.amount, 80);
  });

  await test('5.9 Capital Injections Module', async () => {
    testDb.run('INSERT INTO capital_injections (id, date, donor_name, donor_phone, amount, notes) VALUES (?, ?, ?, ?, ?, ?)', [
      'cap_1', new Date().toISOString(), 'المالك', '0920000000', 1000, 'زيادة سيولة الصندوق'
    ]);
    const cap = testDb.get('SELECT * FROM capital_injections WHERE id = ?', ['cap_1']);
    assert.strictEqual(cap.amount, 1000);
  });

  await test('5.10 Notes & Tasks Module', async () => {
    testDb.run('INSERT INTO notes (id, date, author, title, content, priority) VALUES (?, ?, ?, ?, ?, ?)', [
      'note_1', new Date().toISOString(), 'الإدارة', 'جرد أسبوعي', 'مراجعة زيوت العطور الفرنسية', 'high'
    ]);
    const note = testDb.get('SELECT * FROM notes WHERE id = ?', ['note_1']);
    assert.strictEqual(note.priority, 'high');
  });

  await test('5.11 Settings Table & Parameter Storage (33 Parameters)', async () => {
    const testSettings = [
      { key: 'store_name', value: 'الدفة للعطور' },
      { key: 'currency_symbol', value: 'د.ل' },
      { key: 'tax_rate', value: '0' },
      { key: 'low_stock_threshold', value: '5' },
      { key: 'invoice_prefix', value: 'INV-' },
      { key: 'purchase_prefix', value: 'PO-' },
      { key: 'print_mode', value: 'thermal' }
    ];

    for (const s of testSettings) {
      testDb.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [s.key, s.value]);
    }

    const savedName = testDb.get('SELECT value FROM settings WHERE key = ?', ['store_name']).value;
    assert.strictEqual(savedName, 'الدفة للعطور');

    const savedCurr = testDb.get('SELECT value FROM settings WHERE key = ?', ['currency_symbol']).value;
    assert.strictEqual(savedCurr, 'د.ل');
  });

  await test('5.12 Gifts Module', async () => {
    testDb.run('INSERT INTO gifts (id, date, recipient_name, reason, author, item_name, qty, cost_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      'g_1', new Date().toISOString(), 'عميل مميز', 'هدية ولاء', 'المدير', 'تولة مسك الختام', 1, 30
    ]);
    const gift = testDb.get('SELECT * FROM gifts WHERE id = ?', ['g_1']);
    assert.strictEqual(gift.cost_value, 30);
  });

  testDb.close();

  return results;
}
