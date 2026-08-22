const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Simulate Electron's userData path
const userDataPath = path.join(os.homedir(), '.config', 'aldaffa-erp-test');
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}

const dbPath = path.join(userDataPath, 'aldaffa_erp.db');
console.log('Testing database at:', dbPath);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Create all tables
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
    barcode TEXT,
    min_qty REAL DEFAULT 5,
    notes TEXT
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
    notes TEXT
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
    FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    returned_amount REAL DEFAULT 0,
    returned_cost REAL DEFAULT 0,
    items_json TEXT,
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
    total REAL DEFAULT 0,
    items_json TEXT
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
`;

try {
  db.exec(schema);
  console.log('✅ All 15 tables created successfully');

  // Verify tables exist
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log(`\n✅ Verified ${tables.length} tables:`);
  tables.forEach(t => console.log(`   - ${t.name}`));

  // Test insert and query
  db.prepare("INSERT OR IGNORE INTO categories (id, name, icon) VALUES (?, ?, ?)").run('test-cat', 'Test Category', '🧪');
  const testCat = db.prepare("SELECT * FROM categories WHERE id = ?").get('test-cat');
  console.log('\n✅ Insert/Query test passed:', testCat);

  console.log('\n✅ Database setup verified successfully!');
  console.log('📂 Database location:', dbPath);
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
} finally {
  db.close();
}
