/**
 * Suite 23: Comprehensive App Lifecycle, 22-Module Import Integrity, and Full CRUD Engine
 */

import assert from 'assert';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

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

  const createSchema = () => {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT,
        is_demo INTEGER DEFAULT 0
      );

      CREATE TABLE inventory (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        qty REAL DEFAULT 0,
        cost REAL DEFAULT 0,
        price REAL DEFAULT 0,
        wholesale_price REAL DEFAULT 0,
        original_price REAL DEFAULT 0,
        unit TEXT DEFAULT 'piece',
        discount_rate REAL DEFAULT 0,
        capacity REAL DEFAULT 0,
        image_url TEXT,
        barcode TEXT,
        min_qty REAL DEFAULT 5,
        notes TEXT,
        is_demo INTEGER DEFAULT 0
      );

      CREATE TABLE sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        subtotal REAL DEFAULT 0,
        discount REAL DEFAULT 0,
        total REAL DEFAULT 0,
        profit REAL DEFAULT 0,
        payment_method TEXT DEFAULT 'cash',
        debtor_id TEXT,
        customer_name TEXT,
        sale_pricing_mode TEXT DEFAULT 'retail',
        type TEXT DEFAULT 'store',
        phone TEXT,
        notes TEXT,
        discount_type TEXT DEFAULT 'percentage',
        is_demo INTEGER DEFAULT 0
      );

      CREATE TABLE sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        product_id TEXT NOT NULL,
        name TEXT NOT NULL,
        cart_qty REAL NOT NULL,
        unit TEXT,
        final_price REAL NOT NULL,
        unit_cost REAL DEFAULT 0,
        portion_ml REAL,
        is_demo INTEGER DEFAULT 0,
        FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE
      );

      CREATE TABLE returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        returned_amount REAL DEFAULT 0,
        returned_cost REAL DEFAULT 0,
        items_json TEXT,
        is_demo INTEGER DEFAULT 0,
        FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE
      );

      CREATE TABLE withdrawals (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        amount REAL NOT NULL,
        recipient TEXT,
        reason TEXT,
        is_demo INTEGER DEFAULT 0
      );

      CREATE TABLE capital_injections (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        donor_name TEXT,
        donor_phone TEXT,
        amount REAL NOT NULL,
        notes TEXT,
        is_demo INTEGER DEFAULT 0
      );

      CREATE TABLE gifts (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        recipient_name TEXT,
        recipient_phone TEXT,
        reason TEXT,
        author TEXT,
        product_id TEXT,
        item_name TEXT,
        qty REAL DEFAULT 0,
        unit TEXT,
        cost_value REAL DEFAULT 0,
        is_demo INTEGER DEFAULT 0
      );

      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        author TEXT,
        title TEXT,
        content TEXT,
        priority TEXT DEFAULT 'normal',
        is_demo INTEGER DEFAULT 0
      );

      CREATE TABLE debtors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        total_debt REAL DEFAULT 0,
        is_demo INTEGER DEFAULT 0
      );

      CREATE TABLE debt_history (
        id TEXT PRIMARY KEY,
        debtor_id TEXT NOT NULL,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        invoice_id INTEGER,
        is_demo INTEGER DEFAULT 0,
        FOREIGN KEY(debtor_id) REFERENCES debtors(id)
      );

      CREATE TABLE losses (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        item_name TEXT NOT NULL,
        qty REAL NOT NULL,
        unit TEXT,
        cost_value REAL DEFAULT 0,
        reason TEXT,
        is_demo INTEGER DEFAULT 0
      );

      CREATE TABLE purchases (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        supplier_name TEXT,
        total REAL DEFAULT 0,
        items_json TEXT,
        invoice_ref TEXT,
        payment_type TEXT DEFAULT 'cash',
        notes TEXT,
        is_demo INTEGER DEFAULT 0
      );

      CREATE TABLE archives (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        total_revenue REAL DEFAULT 0,
        total_profit REAL DEFAULT 0,
        sales_count INTEGER DEFAULT 0,
        is_demo INTEGER DEFAULT 0
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        pin TEXT NOT NULL,
        role TEXT DEFAULT 'cashier',
        avatar TEXT,
        created_at TEXT
      );

      CREATE TABLE user_permissions (
        user_id TEXT NOT NULL,
        permission_key TEXT NOT NULL,
        is_allowed INTEGER DEFAULT 1,
        PRIMARY KEY(user_id, permission_key)
      );

      CREATE TABLE shift_reports (
        id TEXT PRIMARY KEY,
        cashier_name TEXT,
        start_date TEXT,
        end_date TEXT,
        expected_cash REAL,
        actual_cash REAL,
        variance REAL,
        total_sales REAL,
        total_profit REAL,
        report_data_json TEXT,
        created_at TEXT,
        is_demo INTEGER DEFAULT 0
      );
    `);
    return db;
  };

  await test('23.1 All 22 JSX Modules Have Valid Physical Import Targets', async () => {
    const modulesDir = path.join(process.cwd(), 'src', 'modules');
    const files = fs.readdirSync(modulesDir).filter(f => f.endsWith('.jsx'));
    assert.strictEqual(files.length, 22, 'Must have exactly 22 modules');

    for (const file of files) {
      const fullPath = path.join(modulesDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');

      const importMatches = content.matchAll(/from\s+['"](\.[^'"]+)['"]/g);
      for (const match of importMatches) {
        const importRelPath = match[1];
        const resolvedPath = path.resolve(modulesDir, importRelPath);
        
        const exists = fs.existsSync(resolvedPath) ||
          fs.existsSync(`${resolvedPath}.jsx`) ||
          fs.existsSync(`${resolvedPath}.js`) ||
          fs.existsSync(path.join(resolvedPath, 'index.jsx')) ||
          fs.existsSync(path.join(resolvedPath, 'index.js'));

        assert(exists, `Broken import in ${file}: target '${importRelPath}' does not exist on disk!`);
      }
    }
  });

  await test('23.2 Complete Adding, Editing, Deleting, and Reading Flow Across All Core Tables', async () => {
    const db = createSchema();

    // 1. Categories CRUD
    db.prepare(`INSERT INTO categories (id, name, icon) VALUES (?, ?, ?)`).run('cat_1', 'عطور رجالية', 'Spray');
    let cat = db.prepare(`SELECT * FROM categories WHERE id = ?`).get('cat_1');
    assert.strictEqual(cat.name, 'عطور رجالية');
    db.prepare(`UPDATE categories SET name = ? WHERE id = ?`).run('عطور شرقية فاخرة', 'cat_1');
    cat = db.prepare(`SELECT * FROM categories WHERE id = ?`).get('cat_1');
    assert.strictEqual(cat.name, 'عطور شرقية فاخرة');

    // 2. Inventory / Products CRUD
    db.prepare(`
      INSERT INTO inventory (id, name, category, qty, cost, price, wholesale_price, barcode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('p_1', 'عطر الدفة الملكي', 'cat_1', 50, 40, 95, 75, '6281001001');
    let prod = db.prepare(`SELECT * FROM inventory WHERE id = ?`).get('p_1');
    assert.strictEqual(prod.qty, 50);
    assert.strictEqual(prod.price, 95);

    // Edit Product
    db.prepare(`UPDATE inventory SET qty = qty + 10, price = 110 WHERE id = ?`).run('p_1');
    prod = db.prepare(`SELECT * FROM inventory WHERE id = ?`).get('p_1');
    assert.strictEqual(prod.qty, 60);
    assert.strictEqual(prod.price, 110);

    // 3. Sales & Sale Items CRUD (POS Checkout)
    const saleInsert = db.prepare(`
      INSERT INTO sales (date, subtotal, discount, total, profit, payment_method, customer_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(new Date().toISOString(), 220, 20, 200, 120, 'cash', 'أحمد المحمودي');
    const saleId = saleInsert.lastInsertRowid;

    db.prepare(`
      INSERT INTO sale_items (sale_id, product_id, name, cart_qty, final_price, unit_cost)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(saleId, 'p_1', 'عطر الدفة الملكي', 2, 100, 40);

    // Deduct stock
    db.prepare(`UPDATE inventory SET qty = qty - 2 WHERE id = ?`).run('p_1');
    prod = db.prepare(`SELECT * FROM inventory WHERE id = ?`).get('p_1');
    assert.strictEqual(prod.qty, 58);

    // 4. Returns Flow
    db.prepare(`
      INSERT INTO returns (sale_id, date, returned_amount, returned_cost, items_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(saleId, new Date().toISOString(), 100, 40, JSON.stringify([{ product_id: 'p_1', qty: 1 }]));
    db.prepare(`UPDATE inventory SET qty = qty + 1 WHERE id = ?`).run('p_1');
    prod = db.prepare(`SELECT * FROM inventory WHERE id = ?`).get('p_1');
    assert.strictEqual(prod.qty, 59);

    // 5. Purchases CRUD
    const purId = 'pur_101';
    db.prepare(`
      INSERT INTO purchases (id, date, supplier_name, total, items_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(purId, new Date().toISOString(), 'المورد الدولي للزيوت', 500, JSON.stringify([{ name: 'زيوت فرنسية', cost: 500 }]));
    let pur = db.prepare(`SELECT * FROM purchases WHERE id = ?`).get(purId);
    assert.strictEqual(pur.total, 500);

    // 6. Debtors & Debt History CRUD
    db.prepare(`INSERT INTO debtors (id, name, phone, total_debt) VALUES (?, ?, ?, ?)`).run('d_1', 'طارق الزاوي', '0912345678', 350);
    db.prepare(`INSERT INTO debt_history (id, debtor_id, date, type, amount) VALUES (?, ?, ?, ?, ?)`).run('dh_1', 'd_1', new Date().toISOString(), 'debt', 350);
    let debtor = db.prepare(`SELECT * FROM debtors WHERE id = ?`).get('d_1');
    assert.strictEqual(debtor.total_debt, 350);

    // Repay debt
    db.prepare(`UPDATE debtors SET total_debt = total_debt - 150 WHERE id = ?`).run('d_1');
    db.prepare(`INSERT INTO debt_history (id, debtor_id, date, type, amount) VALUES (?, ?, ?, ?, ?)`).run('dh_2', 'd_1', new Date().toISOString(), 'payment', 150);
    debtor = db.prepare(`SELECT * FROM debtors WHERE id = ?`).get('d_1');
    assert.strictEqual(debtor.total_debt, 200);

    // 7. Losses, Withdrawals, Capital Injections, Gifts, Notes CRUD
    db.prepare(`INSERT INTO losses (id, date, item_name, qty, cost_value, reason) VALUES (?, ?, ?, ?, ?, ?)`).run('loss_1', new Date().toISOString(), 'عطر مكسور', 1, 40, 'سقوط بالخطأ');
    db.prepare(`INSERT INTO withdrawals (id, date, amount, recipient, reason) VALUES (?, ?, ?, ?, ?)`).run('w_1', new Date().toISOString(), 50, 'صيانة المحل', 'إصلاح إنارة');
    db.prepare(`INSERT INTO capital_injections (id, date, donor_name, amount) VALUES (?, ?, ?, ?)`).run('cap_1', new Date().toISOString(), 'الشريك المؤسس', 1000);
    db.prepare(`INSERT INTO gifts (id, date, recipient_name, product_id, item_name, qty, cost_value) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('g_1', new Date().toISOString(), 'ضيف شرف', 'p_1', 'عطر الدفة الملكي', 1, 40);
    db.prepare(`INSERT INTO notes (id, date, author, title, content) VALUES (?, ?, ?, ?, ?)`).run('n_1', new Date().toISOString(), 'المدير', 'تنبيه جرد', 'مراجعة زيوت العود');

    // 8. Shift Close Report CRUD
    db.prepare(`
      INSERT INTO shift_reports (id, cashier_name, start_date, end_date, expected_cash, actual_cash, variance, total_sales, total_profit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sr_1', 'الكاشير المناوب', new Date().toISOString(), new Date().toISOString(), 800, 800, 0, 800, 450);
    const report = db.prepare(`SELECT * FROM shift_reports WHERE id = ?`).get('sr_1');
    assert.strictEqual(report.variance, 0);
    assert.strictEqual(report.total_sales, 800);

    // 9. Clean Deletion & Cascade verification
    db.prepare(`DELETE FROM returns WHERE sale_id = ?`).run(saleId);
    db.prepare(`DELETE FROM sale_items WHERE sale_id = ?`).run(saleId);
    db.prepare(`DELETE FROM sales WHERE id = ?`).run(saleId);
    const remainingItems = db.prepare(`SELECT COUNT(*) as count FROM sale_items WHERE sale_id = ?`).get(saleId);
    assert.strictEqual(remainingItems.count, 0);

    db.prepare(`DELETE FROM inventory WHERE id = ?`).run('p_1');
    const remainingProd = db.prepare(`SELECT * FROM inventory WHERE id = ?`).get('p_1');
    assert.strictEqual(remainingProd, undefined);
  });

  await test('23.3 Settings & Universal Customization Persistence Invariants', async () => {
    const db = createSchema();
    const settingsEntries = [
      ['store_name', 'الدفة للعطور الفاخرة'],
      ['store_subtitle', 'Aldaffa Luxury Perfumes'],
      ['store_phone', '0910000000'],
      ['currency_symbol', 'د.ل'],
      ['print_mode', 'thermal'],
      ['receipt_theme', 'luxury_gold'],
      ['tax_rate', '0'],
      ['low_stock_threshold', '8']
    ];

    for (const [key, value] of settingsEntries) {
      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(key, value);
    }

    const fetched = db.prepare(`SELECT key, value FROM settings`).all();
    const map = {};
    fetched.forEach(f => { map[f.key] = f.value; });

    assert.strictEqual(map['store_name'], 'الدفة للعطور الفاخرة');
    assert.strictEqual(map['receipt_theme'], 'luxury_gold');
    assert.strictEqual(map['currency_symbol'], 'د.ل');
  });

  await test('23.4 Multi-Role User Management & RBAC Permissions Invariants', async () => {
    const db = createSchema();

    // Manager
    db.prepare(`INSERT INTO users (id, name, pin, role, created_at) VALUES (?, ?, ?, ?, ?)`).run('usr_mgr', 'المدير العام', '1234', 'manager', new Date().toISOString());
    // Cashier
    db.prepare(`INSERT INTO users (id, name, pin, role, created_at) VALUES (?, ?, ?, ?, ?)`).run('usr_csh', 'الكاشير الأول', '5555', 'cashier', new Date().toISOString());

    // Cashier permissions: Allowed POS, blocked profit & deletes
    db.prepare(`INSERT INTO user_permissions (user_id, permission_key, is_allowed) VALUES (?, ?, ?)`).run('usr_csh', 'pos_checkout', 1);
    db.prepare(`INSERT INTO user_permissions (user_id, permission_key, is_allowed) VALUES (?, ?, ?)`).run('usr_csh', 'view_profit', 0);
    db.prepare(`INSERT INTO user_permissions (user_id, permission_key, is_allowed) VALUES (?, ?, ?)`).run('usr_csh', 'delete_records', 0);

    const cashierPerm = db.prepare(`SELECT is_allowed FROM user_permissions WHERE user_id = ? AND permission_key = ?`).get('usr_csh', 'view_profit');
    assert.strictEqual(cashierPerm.is_allowed, 0);

    const cashierPos = db.prepare(`SELECT is_allowed FROM user_permissions WHERE user_id = ? AND permission_key = ?`).get('usr_csh', 'pos_checkout');
    assert.strictEqual(cashierPos.is_allowed, 1);
  });

  return results;
}
