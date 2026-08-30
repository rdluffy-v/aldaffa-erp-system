-- ============================================================================
-- ALDAFFA PERFUMES ERP — CLOUDFLARE D1 RELATIONAL DATABASE MIRROR SCHEMA
-- ============================================================================

-- Stores Table (Multi-tenant store registry)
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT DEFAULT 'د.ل',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Devices Table (Paired mobile devices & terminals)
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  device_name TEXT,
  device_token TEXT NOT NULL UNIQUE,
  is_active INTEGER DEFAULT 1,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- Products & Inventory Table (Cloud mirror of desktop inventory)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  barcode TEXT,
  category TEXT,
  qty REAL DEFAULT 0,
  cost REAL DEFAULT 0,
  price REAL DEFAULT 0,
  wholesale_price REAL DEFAULT 0,
  unit TEXT DEFAULT 'piece',
  min_qty REAL DEFAULT 5,
  is_active INTEGER DEFAULT 1,
  updated_at TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- Sales & Orders Table (Sales executed locally or synced to cloud)
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  device_id TEXT,
  invoice_number TEXT,
  date TEXT NOT NULL,
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  total REAL DEFAULT 0,
  profit REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  customer_name TEXT,
  debtor_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  synced_at TEXT,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- Sale Items Table (Line items for each sale)
CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  cart_qty REAL NOT NULL,
  unit TEXT,
  final_price REAL NOT NULL,
  unit_cost REAL DEFAULT 0,
  portion_ml REAL,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

-- Sync Events Log (Delta changelog for bi-directional sequence sync)
CREATE TABLE IF NOT EXISTS sync_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  device_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL
);

-- Idempotency Keys (Deduplication for mobile network retries)
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  response_json TEXT NOT NULL
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_products_store_updated ON products(store_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_products_store_version ON products(store_id, version);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(store_id, barcode);
CREATE INDEX IF NOT EXISTS idx_sales_store_date ON sales(store_id, date);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_store_version ON sync_events(store_id, version);
CREATE INDEX IF NOT EXISTS idx_devices_store_token ON devices(store_id, device_token);
