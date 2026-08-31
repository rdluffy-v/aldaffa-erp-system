/**
 * In-Memory SQLite Test Database Helper
 * Uses better-sqlite3 with complete ERP schema
 */

import Database from 'better-sqlite3';

export function createTestDb() {
  const db = new Database(':memory:');

  const schema = `
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT
    );

    CREATE TABLE IF NOT EXISTS inventory (
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

    CREATE TABLE IF NOT EXISTS sales (
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
      is_demo INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sale_items (
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

    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      returned_amount REAL DEFAULT 0,
      returned_cost REAL DEFAULT 0,
      items_json TEXT,
      reason TEXT,
      FOREIGN KEY(sale_id) REFERENCES sales(id)
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      recipient TEXT,
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS capital_injections (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      donor_name TEXT,
      donor_phone TEXT,
      amount REAL NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS gifts (
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
      cost_value REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      author TEXT,
      title TEXT,
      content TEXT,
      priority TEXT DEFAULT 'normal'
    );

    CREATE TABLE IF NOT EXISTS debtors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      total_debt REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS debt_history (
      id TEXT PRIMARY KEY,
      debtor_id TEXT NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      invoice_id INTEGER,
      FOREIGN KEY(debtor_id) REFERENCES debtors(id)
    );

    CREATE TABLE IF NOT EXISTS losses (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      item_name TEXT NOT NULL,
      qty REAL NOT NULL,
      unit TEXT,
      cost_value REAL DEFAULT 0,
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      supplier_name TEXT,
      invoice_ref TEXT,
      payment_type TEXT DEFAULT 'cash',
      total REAL DEFAULT 0,
      notes TEXT,
      items_json TEXT,
      is_demo INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS archives (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      total_revenue REAL DEFAULT 0,
      total_profit REAL DEFAULT 0,
      sales_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pin TEXT NOT NULL,
      role TEXT DEFAULT 'cashier',
      avatar TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id TEXT NOT NULL,
      permission_key TEXT NOT NULL,
      is_allowed INTEGER DEFAULT 1,
      PRIMARY KEY(user_id, permission_key)
    );

    CREATE TABLE IF NOT EXISTS shift_reports (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      period TEXT NOT NULL,
      total_sales REAL DEFAULT 0,
      total_profit REAL DEFAULT 0,
      total_purchases REAL DEFAULT 0,
      total_withdrawals REAL DEFAULT 0,
      total_capital REAL DEFAULT 0,
      total_losses REAL DEFAULT 0,
      total_returns REAL DEFAULT 0,
      expected_cash REAL DEFAULT 0,
      actual_cash REAL DEFAULT 0,
      cash_difference REAL DEFAULT 0,
      cashier TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );
  `;

  db.exec(schema);

  return {
    rawDb: db,
    query(sql, ...args) {
      const flat = args.flat().filter(a => a !== undefined);
      const stmt = db.prepare(sql);
      return stmt.all(...flat);
    },
    run(sql, ...args) {
      const flat = args.flat().filter(a => a !== undefined);
      const stmt = db.prepare(sql);
      return stmt.run(...flat);
    },
    get(sql, ...args) {
      const flat = args.flat().filter(a => a !== undefined);
      const stmt = db.prepare(sql);
      return stmt.get(...flat);
    },
    transaction(queries) {
      const runTx = db.transaction((qList) => {
        const results = [];
        for (const q of qList) {
          if (!q || !q.sql) continue;
          const stmt = db.prepare(q.sql);
          const pList = Array.isArray(q.params) ? q.params : (q.params !== undefined ? [q.params] : []);
          results.push(stmt.run(...pList));
        }
        return results;
      });
      return runTx(queries);
    },
    close() {
      db.close();
    }
  };
}
