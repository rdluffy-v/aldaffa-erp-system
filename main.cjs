const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const Database = require('better-sqlite3');
const { autoUpdater } = require('electron-updater');
const { promisify } = require('util');
const { exec } = require('child_process');
const rm = promisify(fs.rm);

let mainWindow;
let db;

// Database initialization
function initDatabase() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'aldaffa_erp.db');

  console.log('Database path:', dbPath);

  db = new Database(dbPath);
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
  `;

  db.exec(schema);

  // Non-destructive column migrations & index extensions
  const migrations = [
    "ALTER TABLE inventory ADD COLUMN barcode TEXT;",
    "ALTER TABLE inventory ADD COLUMN min_qty REAL DEFAULT 5;",
    "ALTER TABLE inventory ADD COLUMN notes TEXT;",
    "ALTER TABLE inventory ADD COLUMN is_demo INTEGER DEFAULT 0;",
    "ALTER TABLE inventory ADD COLUMN image_url TEXT;",
    "ALTER TABLE inventory ADD COLUMN discount_rate REAL DEFAULT 0;",
    "ALTER TABLE inventory ADD COLUMN wholesale_price REAL DEFAULT 0;",
    "ALTER TABLE inventory ADD COLUMN original_price REAL DEFAULT 0;",
    "ALTER TABLE inventory ADD COLUMN capacity REAL DEFAULT 0;",
    "ALTER TABLE sales ADD COLUMN discount_type TEXT DEFAULT 'percentage';",
    "ALTER TABLE sales ADD COLUMN is_demo INTEGER DEFAULT 0;",
    "ALTER TABLE sales ADD COLUMN type TEXT DEFAULT 'store';",
    "ALTER TABLE sales ADD COLUMN debtor_id TEXT;",
    "ALTER TABLE sales ADD COLUMN customer_name TEXT;",
    "ALTER TABLE sales ADD COLUMN phone TEXT;",
    "ALTER TABLE sales ADD COLUMN notes TEXT;",
    "ALTER TABLE sale_items ADD COLUMN is_demo INTEGER DEFAULT 0;",
    "ALTER TABLE sale_items ADD COLUMN unit_cost REAL DEFAULT 0;",
    "ALTER TABLE sale_items ADD COLUMN portion_ml REAL;",
    "ALTER TABLE purchases ADD COLUMN invoice_ref TEXT;",
    "ALTER TABLE purchases ADD COLUMN payment_type TEXT DEFAULT 'cash';",
    "ALTER TABLE purchases ADD COLUMN notes TEXT;",
    "ALTER TABLE purchases ADD COLUMN is_demo INTEGER DEFAULT 0;",
    "ALTER TABLE debtors ADD COLUMN is_demo INTEGER DEFAULT 0;",
    "ALTER TABLE debt_history ADD COLUMN is_demo INTEGER DEFAULT 0;",
    "ALTER TABLE debt_history ADD COLUMN invoice_id INTEGER;",
    "ALTER TABLE categories ADD COLUMN is_demo INTEGER DEFAULT 0;",
    "ALTER TABLE withdrawals ADD COLUMN is_demo INTEGER DEFAULT 0;",
    "ALTER TABLE capital_injections ADD COLUMN is_demo INTEGER DEFAULT 0;",
    "ALTER TABLE gifts ADD COLUMN is_demo INTEGER DEFAULT 0;",
    "ALTER TABLE losses ADD COLUMN is_demo INTEGER DEFAULT 0;",
    "ALTER TABLE notes ADD COLUMN is_demo INTEGER DEFAULT 0;",
    "ALTER TABLE returns ADD COLUMN is_demo INTEGER DEFAULT 0;",
    "ALTER TABLE archives ADD COLUMN is_demo INTEGER DEFAULT 0;",
    "ALTER TABLE shift_reports ADD COLUMN is_demo INTEGER DEFAULT 0;",
    `CREATE TABLE IF NOT EXISTS shift_reports (
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
    );`
  ];

  migrations.forEach((sql) => {
    try {
      db.exec(sql);
    } catch (e) {
      // Column/table already exists, safe to ignore
    }
  });

  // Performance Indexes for high traffic querying
  const indexes = `
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
    CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_name);
    CREATE INDEX IF NOT EXISTS idx_sales_debtor ON sales(debtor_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
    CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);
    CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON inventory(barcode);
    CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);
    CREATE INDEX IF NOT EXISTS idx_losses_date ON losses(date);
    CREATE INDEX IF NOT EXISTS idx_withdrawals_date ON withdrawals(date);
    CREATE INDEX IF NOT EXISTS idx_debt_history_debtor ON debt_history(debtor_id);
    CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns(sale_id);
  `;
  db.exec(indexes);

  // Seed default manager user if users table is empty
  try {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    if (!userCount || userCount.count === 0) {
      db.prepare(`
        INSERT INTO users (id, name, pin, role, created_at)
        VALUES ('admin_1', 'المدير العام', '1234', 'manager', datetime('now'))
      `).run();
      console.log('Default Manager user created (PIN: 1234)');
    }
  } catch (seedErr) {
    console.warn('User seed warning:', seedErr);
  }

  // Automatic Safe Database Snapshot Backup
  try {
    const backupsDir = path.join(userDataPath, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const backupTarget = path.join(backupsDir, `aldaffa_autobackup_${new Date().toISOString().split('T')[0]}.db`);
    if (!fs.existsSync(backupTarget)) {
      fs.copyFileSync(dbPath, backupTarget);
      console.log('Automated daily database snapshot backup created:', backupTarget);
    }
  } catch (backupErr) {
    console.warn('Daily database snapshot backup warning:', backupErr);
  }

  console.log('Database schema, migrations & performance indexes initialized');
}

// Helper to fetch live print template settings from SQLite
function getPrintSettings() {
  const defaults = {
    printMode: 'thermal',
    storeName: 'الدفة للعطور',
    storeSubtitle: 'Aldaffa Perfumes - لأرقى العطور والخلطات',
    storePhone: '0123456789',
    storeAddress: 'ليبيا - مصراتة',
    receiptGreeting: 'شكراً لتسوقكم معنا .. نسعد بخدمتكم دائماً',
    receiptPolicy: 'سياسة الاستبدال والاسترجاع: خلال 30 ساعة مع الفاتورة الأصلية. المنتجات المفتوحة لا تسترجع.',
    showLogo: true,
    showBarcode: true,
    showCashier: true,
    showPhone: true,
    logoBase64: '',
    receiptTheme: 'luxury_gold', // 'classic' | 'luxury_gold' | 'modern_minimal' | 'ornate_box'
    receiptBorder: 'dashed', // 'dashed' | 'solid' | 'double' | 'none'
    receiptWatermarkBase64: '',
    fontSize: 'md', // 'sm' | 'md' | 'lg'
    currencySymbol: 'د.ل'
  };

  try {
    if (!db) return defaults;
    const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN (
      'print_mode', 'store_name', 'store_subtitle', 'store_phone', 'store_address',
      'receipt_greeting', 'receipt_policy', 'show_logo', 'show_barcode',
      'show_cashier', 'show_phone', 'logo_base64', 'receipt_theme', 'receipt_border',
      'receipt_watermark_base64', 'font_size', 'currency_symbol'
    )`).all();

    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });

    return {
      printMode: map['print_mode'] || defaults.printMode,
      storeName: map['store_name'] || defaults.storeName,
      storeSubtitle: map['store_subtitle'] || defaults.storeSubtitle,
      storePhone: map['store_phone'] || defaults.storePhone,
      storeAddress: map['store_address'] || defaults.storeAddress,
      receiptGreeting: map['receipt_greeting'] || defaults.receiptGreeting,
      receiptPolicy: map['receipt_policy'] || defaults.receiptPolicy,
      showLogo: map['show_logo'] !== undefined ? map['show_logo'] === 'true' : defaults.showLogo,
      showBarcode: map['show_barcode'] !== undefined ? map['show_barcode'] === 'true' : defaults.showBarcode,
      showCashier: map['show_cashier'] !== undefined ? map['show_cashier'] === 'true' : defaults.showCashier,
      showPhone: map['show_phone'] !== undefined ? map['show_phone'] === 'true' : defaults.showPhone,
      logoBase64: map['logo_base64'] || '',
      receiptTheme: map['receipt_theme'] || defaults.receiptTheme,
      receiptBorder: map['receipt_border'] || defaults.receiptBorder,
      receiptWatermarkBase64: map['receipt_watermark_base64'] || '',
      fontSize: map['font_size'] || defaults.fontSize,
      currencySymbol: map['currency_symbol'] || defaults.currencySymbol
    };
  } catch (e) {
    return defaults;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'الدفة للعطور - Aldaffa ERP',
    backgroundColor: '#030712'
  });

  // Load app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Safe Cache Purging - Never touches SQLite or userData root
function purgeSafeCaches() {
  try {
    const userDataPath = app.getPath('userData');
    const cacheDirsToPurge = ['Cache', 'GPUCache', 'Code Cache', 'DawnCache', 'blob_storage'];
    const purged = [];

    cacheDirsToPurge.forEach(dir => {
      const targetDir = path.join(userDataPath, dir);
      if (fs.existsSync(targetDir)) {
        try {
          fs.rmSync(targetDir, { recursive: true, force: true });
          purged.push(dir);
        } catch (e) {
          console.error(`Failed to purge cache dir: ${dir}`, e);
        }
      }
    });
    console.log('Safely purged cache directories:', purged);
    return { success: true, purged };
  } catch (error) {
    console.error('Error clearing cache:', error);
    return { success: false, error: error.message };
  }
}

// Auto updater setup
function setupAutoUpdater() {
  if (process.env.NODE_ENV === 'development') return;

  // Default GitHub token for updates
  if (!process.env.GH_TOKEN) {
    process.env.GH_TOKEN = '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';
  }

  autoUpdater.autoDownload = false;
  autoUpdater.allowDowngrade = false;

  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'rdluffy-v',
      repo: 'aldaffa-erp-system',
      private: true,
      token: process.env.GH_TOKEN || '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'
    });
  } catch (e) {
    console.warn('setFeedURL warning:', e.message);
  }

  autoUpdater.on('checking-for-update', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { status: 'checking', message: 'جاري التحقق من وجود تحديثات...' });
    }
  });
  autoUpdater.on('update-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { status: 'available', updateAvailable: true, info });
    }
  });
  autoUpdater.on('update-not-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { status: 'not-available', updateNotAvailable: true, info });
    }
  });
  autoUpdater.on('error', (err) => {
    console.error('AutoUpdater error event:', err);
    const errorMsg = err?.message || String(err);
    const fallbackUrl = 'https://github.com/rdluffy-v/aldaffa-erp-system/releases/latest';
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', {
        status: 'error',
        error: errorMsg,
        fallbackUrl
      });
    }
  });
  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-download-progress', progress);
    }
  });
  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { status: 'downloaded', updateDownloaded: true, info });
    }
  });
}

// Auto-Updater IPC Handlers
ipcMain.handle('updater:get-version', async () => {
  return { success: true, version: app.getVersion() };
});

ipcMain.handle('updater:set-token', async (event, { token }) => {
  try {
    if (token) {
      process.env.GH_TOKEN = token;
      try {
        autoUpdater.setFeedURL({
          provider: 'github',
          owner: 'rdluffy-v',
          repo: 'aldaffa-erp-system',
          private: true,
          token
        });
      } catch (e) {}
      return { success: true };
    }
    return { success: false, error: 'Token is empty' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('updater:check', async (event, { token } = {}) => {
  try {
    if (token) {
      process.env.GH_TOKEN = token;
    }
    const result = await autoUpdater.checkForUpdates();
    return { success: true, result };
  } catch (error) {
    console.error('Check for updates error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('updater:download', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    console.error('Download update error:', error);
    return {
      success: false,
      error: error.message,
      fallbackUrl: 'https://github.com/rdluffy-v/aldaffa-erp-system/releases/latest'
    };
  }
});

ipcMain.handle('updater:install', async () => {
  try {
    // Attempt standard quiet/interactive quitAndInstall
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  } catch (error) {
    console.error('Install update error:', error);
    return {
      success: false,
      error: error.message,
      fallbackUrl: 'https://github.com/rdluffy-v/aldaffa-erp-system/releases/latest'
    };
  }
});

ipcMain.handle('updater:open-releases', async (event, { url } = {}) => {
  try {
    const targetUrl = url || 'https://github.com/rdluffy-v/aldaffa-erp-system/releases/latest';
    await shell.openExternal(targetUrl);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('system:purge-cache', async () => {
  return purgeSafeCaches();
});

// Data Archiving & Migration Engine
ipcMain.handle('archive:create', async (event, { name } = {}) => {
  try {
    const archivesDir = path.join(app.getPath('userData'), 'archives');
    await fs.promises.mkdir(archivesDir, { recursive: true });
    const timestamp = Date.now();
    const archiveFile = path.join(archivesDir, `aldaffa_backup_${timestamp}.json`);
    
    // Quick full tables snapshot
    const tables = ['products', 'categories', 'sales', 'sale_items', 'purchases', 'purchase_items', 'debtors', 'losses', 'withdrawals', 'capital_injections', 'gifts', 'notes', 'discounts', 'settings'];
    const snapshot = { createdAt: new Date().toISOString(), name: name || 'نسخة احتياطية يدوية', data: {} };
    
    for (const table of tables) {
      try {
        snapshot.data[table] = db.prepare(`SELECT * FROM ${table}`).all();
      } catch (e) {
        snapshot.data[table] = [];
      }
    }
    
    await fs.promises.writeFile(archiveFile, JSON.stringify(snapshot, null, 2));
    return { success: true, filePath: archiveFile };
  } catch (err) {
    console.error('archive:create error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('archive:export', async (event, { cutoffYear, cutoffDate: customCutoff }) => {
  try {
    const cutoffDate = customCutoff || (cutoffYear ? `${cutoffYear}-01-01` : '2024-01-01');
    const archivesDir = path.join(app.getPath('userData'), 'archives');
    await fs.promises.mkdir(archivesDir, { recursive: true });
    const yearLabel = cutoffYear || cutoffDate.split('-')[0];
    const archiveFile = path.join(archivesDir, `aldaffa_archive_${yearLabel}_${Date.now()}.json`);

    // Export sales, losses, and notes older than cutoffDate
    const sales = db.prepare(`SELECT * FROM sales WHERE date < ?`).all(cutoffDate);
    const saleIds = sales.map(s => s.id);
    let saleItems = [];
    if (saleIds.length > 0) {
      const placeholders = saleIds.map(() => '?').join(',');
      saleItems = db.prepare(`SELECT * FROM sale_items WHERE sale_id IN (${placeholders})`).all(...saleIds);
    }
    const losses = db.prepare(`SELECT * FROM losses WHERE date < ?`).all(cutoffDate);
    const notes = db.prepare(`SELECT * FROM notes WHERE date < ?`).all(cutoffDate);

    const archiveData = {
      exportedAt: new Date().toISOString(),
      cutoffDate,
      counts: {
        sales: sales.length,
        saleItems: saleItems.length,
        losses: losses.length,
        notes: notes.length
      },
      sales,
      saleItems,
      losses,
      notes
    };

    await fs.promises.writeFile(archiveFile, JSON.stringify(archiveData, null, 2));

    // Record archive metadata in archives table
    try {
      const totalRev = sales.reduce((s, x) => s + (x.total || 0), 0);
      const totalProf = sales.reduce((s, x) => s + (x.profit || 0), 0);
      db.prepare(`
        INSERT OR REPLACE INTO archives (id, date, total_revenue, total_profit, sales_count)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        `ARCHIVE-${yearLabel}-${Date.now()}`,
        new Date().toISOString(),
        totalRev,
        totalProf,
        sales.length
      );
    } catch (e) {
      console.warn('Failed to insert archive record:', e.message);
    }

    return {
      success: true,
      file: archiveFile,
      counts: archiveData.counts
    };
  } catch (error) {
    console.error('Archive export error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('archive:shrink', async (event, { cutoffYear, cutoffDate: customCutoff }) => {
  try {
    const cutoffDate = customCutoff || (cutoffYear ? `${cutoffYear}-01-01` : '2024-01-01');

    // Find sales to remove
    const sales = db.prepare(`SELECT id FROM sales WHERE date < ?`).all(cutoffDate);
    const saleIds = sales.map(s => s.id);

    if (saleIds.length > 0) {
      const placeholders = saleIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM sale_items WHERE sale_id IN (${placeholders})`).run(...saleIds);
    }

    // Delete archived records from active tables
    const salesResult = db.prepare(`DELETE FROM sales WHERE date < ?`).run(cutoffDate);
    const lossesResult = db.prepare(`DELETE FROM losses WHERE date < ?`).run(cutoffDate);
    const notesResult = db.prepare(`DELETE FROM notes WHERE date < ?`).run(cutoffDate);

    // Vacuum and optimize database to reclaim physical disk space
    db.pragma('vacuum');
    db.pragma('optimize');

    return {
      success: true,
      deletedSales: salesResult.changes,
      deletedLosses: lossesResult.changes,
      deletedNotes: notesResult.changes
    };
  } catch (error) {
    console.error('Archive shrink error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('archive:list', async () => {
  try {
    const archivesDir = path.join(app.getPath('userData'), 'archives');
    if (!fs.existsSync(archivesDir)) {
      return { success: true, archives: [] };
    }
    const files = await fs.promises.readdir(archivesDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const archives = await Promise.all(
      jsonFiles.map(async (filename) => {
        const filePath = path.join(archivesDir, filename);
        const stats = await fs.promises.stat(filePath);
        return {
          filename,
          filePath,
          sizeBytes: stats.size,
          createdAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString()
        };
      })
    );

    return { success: true, archives };
  } catch (error) {
    console.error('Archive list error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('archive:view', async (event, { archiveFile }) => {
  try {
    const data = await fs.promises.readFile(archiveFile, 'utf8');
    const archiveData = JSON.parse(data);
    return { success: true, data: archiveData };
  } catch (error) {
    console.error('Archive view error:', error);
    return { success: false, error: error.message };
  }
});

// IPC handlers for database operations and update actions

// IPC handlers for database operations and update actions
ipcMain.handle('db:query', async (event, { sql, params = [] }) => {
  try {
    const stmt = db.prepare(sql);
    const result = stmt.all(...params);
    return { success: true, data: result };
  } catch (error) {
    console.error('Database query error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:run', async (event, { sql, params = [] }) => {
  try {
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    return { success: true, data: result };
  } catch (error) {
    if (!error.message || !error.message.includes('duplicate column name')) {
      console.error('Database run error:', error);
    }
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:get', async (event, { sql, params = [] }) => {
  try {
    const stmt = db.prepare(sql);
    const result = stmt.get(...params);
    return { success: true, data: result };
  } catch (error) {
    console.error('Database get error:', error);
    return { success: false, error: error.message };
  }
});

// Atomic Transaction Handler (Synchronous SQLite Transaction)
ipcMain.handle('db:transaction', async (event, { queries = [] }) => {
  try {
    const runAtomicTx = db.transaction((queriesList) => {
      const results = [];
      for (const q of queriesList) {
        if (!q || !q.sql) continue;
        const stmt = db.prepare(q.sql);
        const res = stmt.run(...(q.params || []));
        results.push(res);
      }
      return results;
    });

    const results = runAtomicTx(queries);
    return { success: true, data: results };
  } catch (error) {
    console.error('Database atomic transaction error:', error);
    return { success: false, error: error.message };
  }
});

// Thermal & A4 Receipt Printing
ipcMain.handle('print:receipt', async (event, receiptData) => {
  try {
    const { saleId, date, items, subtotal, discount, total, paymentMethod, customerName } = receiptData;
    const settings = getPrintSettings();

    const formatCurrency = (amount) => {
      const val = Number(amount) || 0;
      return `${val.toLocaleString('ar-LY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${settings.currencySymbol || 'د.ل'}`;
    };

    const formatDate = (dateStr) => {
      return new Intl.DateTimeFormat('ar-LY', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(dateStr));
    };

    // Build HTML receipt for 80mm thermal printer
    const isBox = settings.receiptTheme === 'ornate_box';
    const isMinimal = settings.receiptTheme === 'modern_minimal';
    const isGold = settings.receiptTheme === 'luxury_gold';

    const fontStyle = isMinimal ? "'Segoe UI', 'Tajawal', sans-serif" : "'Courier New', monospace, sans-serif";
    const bodySize = settings.fontSize === 'lg' ? '13px' : settings.fontSize === 'sm' ? '11px' : '12px';

    const dividerStyle =
      settings.receiptBorder === 'solid' ? '1.5px solid #000' :
      settings.receiptBorder === 'double' ? '3px double #000' :
      settings.receiptBorder === 'none' ? 'none' : '1px dashed #000';

    const receiptHtml = `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${fontStyle};
      width: 80mm;
      padding: ${isBox ? '3mm' : '4mm'};
      font-size: ${bodySize};
      line-height: 1.4;
      background: #fff;
      color: #000;
      position: relative;
      ${isBox ? 'border: 2px solid #000; border-radius: 4px;' : ''}
    }
    .watermark-bg {
      position: absolute;
      top: 25%;
      left: 10%;
      width: 80%;
      opacity: 0.08;
      pointer-events: none;
      z-index: 0;
      text-align: center;
    }
    .watermark-bg img {
      max-width: 100%;
      max-height: 50mm;
      object-fit: contain;
    }
    .content-layer {
      position: relative;
      z-index: 1;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .large { font-size: ${settings.fontSize === 'lg' ? '17px' : '15px'}; }
    .logo-container {
      text-align: center;
      margin-bottom: 3mm;
    }
    .logo-img {
      max-width: 50mm;
      max-height: 25mm;
      object-fit: contain;
    }
    .logo-fallback {
      background: #fbbf24;
      color: #000;
      padding: 6px;
      font-size: 16px;
      font-weight: bold;
      border-radius: 4px;
      display: inline-block;
    }
    .divider {
      border-top: ${dividerStyle};
      margin: 2.5mm 0;
    }
    table { width: 100%; border-collapse: collapse; margin: 2mm 0; }
    td { padding: 2px 0; }
    .item-row td { vertical-align: top; }
    .right { text-align: right; }
    .left { text-align: left; }
    .total-row { font-size: 14px; font-weight: bold; }
    .barcode {
      text-align: center;
      margin: 4mm 0 2mm;
      font-size: 10px;
      letter-spacing: 2px;
    }
    .policy {
      font-size: 9px;
      text-align: center;
      margin-top: 3mm;
      color: #333;
    }
  </style>
</head>
<body>
  ${settings.receiptWatermarkBase64 ? `
  <div class="watermark-bg">
    <img src="${settings.receiptWatermarkBase64}" alt="Watermark" />
  </div>
  ` : ''}

  <div class="content-layer">
    ${settings.showLogo ? `
    <div class="logo-container">
      ${settings.logoBase64 ? `<img src="${settings.logoBase64}" class="logo-img" alt="Logo" />` : `<div class="logo-fallback">${settings.storeName}</div>`}
    </div>
    ` : ''}

    <div class="center bold large">${settings.storeName}</div>
    ${settings.storeSubtitle ? `<div class="center" style="font-size:10px; color:#444;">${settings.storeSubtitle}</div>` : ''}
    ${settings.showPhone && settings.storePhone ? `<div class="center" style="font-size:11px;">📱 ${settings.storePhone}</div>` : ''}
    ${settings.storeAddress ? `<div class="center" style="font-size:10px; color:#555;">📍 ${settings.storeAddress}</div>` : ''}

    <div class="divider"></div>
    <div class="center bold">فاتورة بيع ${isGold ? '⭐ الدفة للعطور ⭐' : ''}</div>

    <table style="margin: 2mm 0;">
      <tr>
        <td class="bold">رقم الفاتورة:</td>
        <td class="right">#${saleId}</td>
      </tr>
      <tr>
        <td class="bold">التاريخ:</td>
        <td class="right">${formatDate(date)}</td>
      </tr>
      ${customerName ? `
      <tr>
        <td class="bold">العميل:</td>
        <td class="right">${customerName}</td>
      </tr>
      ` : ''}
      ${settings.showCashier ? `
      <tr>
        <td class="bold">الكاشير:</td>
        <td class="right">المسؤول</td>
      </tr>
      ` : ''}
      <tr>
        <td class="bold">الدفع:</td>
        <td class="right">${paymentMethod === 'cash' ? 'نقدي' : paymentMethod === 'card' ? 'بطاقة' : paymentMethod === 'debt' ? 'دين (آجل)' : 'تحويل'}</td>
      </tr>
    </table>

    <div class="divider"></div>

    <table>
      <thead>
        <tr class="bold">
          <td>المنتج</td>
          <td class="center">الكمية</td>
          <td class="right">السعر</td>
          <td class="right">المجموع</td>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => `
        <tr class="item-row">
          <td>${item.name}${item.portion_ml ? ` (${item.portion_ml}ml)` : ''}</td>
          <td class="center">${item.cart_qty}</td>
          <td class="right">${formatCurrency(item.final_price)}</td>
          <td class="right">${formatCurrency(item.final_price * item.cart_qty)}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="divider"></div>

    <table>
      <tr>
        <td class="bold">المجموع الجزئي:</td>
        <td class="right">${formatCurrency(subtotal)}</td>
      </tr>
      ${discount > 0 ? `
      <tr>
        <td class="bold">الخصم:</td>
        <td class="right">-${formatCurrency(subtotal * discount / 100)}</td>
      </tr>
      ` : ''}
      <tr class="total-row">
        <td>الإجمالي:</td>
        <td class="right">${formatCurrency(total)}</td>
      </tr>
    </table>

    ${settings.showBarcode ? `
    <div class="barcode">
      <div>||| | ||||| ||| |||| |||| ||</div>
      <div>*${saleId.toString().padStart(8, '0')}*</div>
    </div>
    ` : ''}

    ${settings.receiptPolicy ? `
    <div class="policy">
      ${settings.receiptPolicy}
    </div>
    ` : ''}

    ${settings.receiptGreeting ? `
    <div class="center bold" style="margin-top: 3mm; font-size: 11px;">
      ${settings.receiptGreeting}
    </div>
    ` : ''}
  </div>
</body>
</html>`;

    // Create hidden window for printing
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false
      }
    });

    await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(receiptHtml));

    // Print silently to default printer
    printWindow.webContents.print({
      silent: true,
      printBackground: true,
      margins: { marginType: 'none' }
    }, (success, errorType) => {
      if (!success) {
        console.error('Print failed:', errorType);
      }
      printWindow.close();
    });

    return { success: true };
  } catch (error) {
    console.error('Print receipt error:', error);
    return { success: false, error: error.message };
  }
});

// A4 Purchase Order Printing
ipcMain.handle('print:purchase-order', async (event, orderData) => {
  try {
    const { orderId, date, supplier, items, total, notes } = orderData;
    const settings = getPrintSettings();

    const formatCurrency = (amount) => {
      const val = Number(amount) || 0;
      return `${val.toLocaleString('ar-LY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${settings.currencySymbol || 'د.ل'}`;
    };

    const orderHtml = `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 12px;
      line-height: 1.6;
      color: #111827;
      background: #fff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #fbbf24;
      padding-bottom: 8mm;
      margin-bottom: 8mm;
    }
    .logo-area { display: flex; align-items: center; gap: 12px; }
    .logo-img { max-height: 45px; object-fit: contain; }
    .logo-text { font-size: 24px; font-weight: bold; color: #92400e; }
    .company-info { text-align: left; font-size: 11px; color: #4b5563; }
    .title {
      text-align: center;
      font-size: 22px;
      font-weight: bold;
      margin-bottom: 6mm;
      color: #1f2937;
    }
    table { width: 100%; border-collapse: collapse; margin: 4mm 0; }
    th, td { padding: 8px 10px; text-align: right; border: 1px solid #e5e7eb; }
    th { background: #f3f4f6; font-weight: bold; }
    .total-row { font-weight: bold; background: #fffbeb; color: #92400e; }
    .footer {
      margin-top: 12mm;
      padding-top: 4mm;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-area">
      ${settings.showLogo && settings.logoBase64 ? `<img src="${settings.logoBase64}" class="logo-img" alt="Logo" />` : ''}
      <div>
        <div class="logo-text">${settings.storeName}</div>
        <div style="font-size: 11px; color: #6b7280;">${settings.storeSubtitle}</div>
      </div>
    </div>
    <div class="company-info">
      <div>📍 ${settings.storeAddress}</div>
      <div>📱 ${settings.storePhone}</div>
      <div>📅 ${new Date(date).toLocaleDateString('ar-SD')}</div>
    </div>
  </div>

  <div class="title">طلب شراء وتوريد - Purchase Order</div>

  <table style="width: 55%; margin-bottom: 6mm;">
    <tr>
      <td style="width: 40%; font-weight: bold;">رقم الطلب:</td>
      <td>#${orderId}</td>
    </tr>
    <tr>
      <td style="font-weight: bold;">التاريخ:</td>
      <td>${new Date(date).toLocaleDateString('ar-SD')}</td>
    </tr>
    <tr>
      <td style="font-weight: bold;">المورد:</td>
      <td>${supplier || 'غير محدد'}</td>
    </tr>
  </table>

  <table>
    <thead>
      <tr>
        <th style="width: 5%;">#</th>
        <th style="width: 45%;">المنتج</th>
        <th style="width: 15%;">الكمية</th>
        <th style="width: 17.5%;">سعر الوحدة</th>
        <th style="width: 17.5%;">المجموع</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${item.name}</td>
        <td>${item.quantity} ${item.unit}</td>
        <td>${formatCurrency(item.cost_per_unit)}</td>
        <td>${formatCurrency(item.total_cost)}</td>
      </tr>
      `).join('')}
      <tr class="total-row">
        <td colspan="4" style="text-align: left;">الإجمالي الكلي:</td>
        <td>${formatCurrency(total)}</td>
      </tr>
    </tbody>
  </table>

  ${notes ? `
  <div style="margin-top: 6mm;">
    <div style="font-weight: bold; margin-bottom: 2mm;">ملاحظات:</div>
    <div style="border: 1px solid #e5e7eb; padding: 3mm; background: #f9fafb; border-radius: 4px;">
      ${notes}
    </div>
  </div>
  ` : ''}

  <div style="margin-top: 15mm; display: flex; justify-content: space-between;">
    <div style="text-align: center; width: 40%;">
      <div style="border-top: 1px solid #000; padding-top: 2mm; margin-top: 12mm;">توقيع المورد</div>
    </div>
    <div style="text-align: center; width: 40%;">
      <div style="border-top: 1px solid #000; padding-top: 2mm; margin-top: 12mm;">توقيع المسؤول المعتمد</div>
    </div>
  </div>

  <div class="footer">
    <div>${settings.storeName} — شكراً لتعاونكم</div>
  </div>
</body>
</html>`;

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false
      }
    });

    await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(orderHtml));

    printWindow.webContents.print({
      silent: false,
      printBackground: true
    }, (success, errorType) => {
      if (!success) {
        console.error('Print failed:', errorType);
      }
      printWindow.close();
    });

    return { success: true };
  } catch (error) {
    console.error('Print purchase order error:', error);
    return { success: false, error: error.message };
  }
});

// Shift Report HTML Template Generator
function generateShiftReportHtml(reportData, settings = {}) {
  const { period, sales, profit, purchases, withdrawals, capital, losses, gifts, notes, cash, cashier } = reportData;

  const formatCurrency = (amount) => {
    const val = Number(amount) || 0;
    return `${val.toLocaleString('ar-LY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${settings.currencySymbol || 'د.ل'}`;
  };

  const formatDateStr = (d) => {
    if (!d) return '—';
    try {
      const dateObj = new Date(d);
      return dateObj.toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return d;
    }
  };

  return `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 10mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #111827;
      background: #fff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #d97706;
      padding-bottom: 5mm;
      margin-bottom: 4mm;
    }
    .logo-area { display: flex; align-items: center; gap: 10px; }
    .logo-img { max-height: 44px; object-fit: contain; }
    .logo-text { font-size: 20px; font-weight: bold; color: #78350f; }
    .title { font-size: 17px; font-weight: bold; text-align: center; margin-bottom: 2mm; color: #1f2937; }
    table { width: 100%; border-collapse: collapse; margin: 2.5mm 0; font-size: 10.5px; }
    th, td { padding: 4.5px 6px; text-align: right; border: 1px solid #e5e7eb; }
    th { background: #f3f4f6; font-weight: bold; color: #374151; }
    .section { margin: 4mm 0; }
    .section-title { font-size: 12px; font-weight: bold; margin-bottom: 1.5mm; background: #fef3c7; color: #92400e; padding: 3px 6px; border-right: 3px solid #d97706; border-radius: 2px; }
    .total-row { font-weight: bold; background: #fffbeb; }
    .highlight { background: #fffdf5; }
    .variance-positive { color: #059669; font-weight: bold; }
    .variance-negative { color: #dc2626; font-weight: bold; }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-area">
      ${settings.showLogo && settings.logoBase64 ? `<img src="${settings.logoBase64}" class="logo-img" alt="Logo" />` : ''}
      <div>
        <div class="logo-text">${settings.storeName || 'منظومة الدفة للعطور'}</div>
        <div style="font-size: 10px; color: #6b7280;">${settings.storeSubtitle || 'عطور شرقية وغربية وزيوت ملكية'}</div>
      </div>
    </div>
    <div style="text-align: left; font-size: 10px; color: #4b5563;">
      <div>📍 ${settings.storeAddress || 'مصراتة - ليبيا'}</div>
      <div>📱 ${settings.storePhone || '091xxxxxxx'}</div>
      <div>الكاشير: ${cashier || 'المناوب'}</div>
      <div>تاريخ التقرير: ${new Date().toLocaleDateString('ar-LY')}</div>
    </div>
  </div>

  <div class="title">تقرير إغلاق الوردية والحسابات الشاملة</div>
  <div style="text-align: center; font-size: 11px; color: #6b7280; margin-bottom: 4mm;">
    الفترة: من ${period?.start || ''} إلى ${period?.end || ''}
  </div>

  <!-- 1. FINANCIAL SUMMARY -->
  <div class="section">
    <div class="section-title">1. الملخص المالي والتشغيلي العام</div>
    <table>
      <tr>
        <td style="width: 25%;">إجمالي المبيعات (${sales?.count || 0} فاتورة)</td>
        <td style="width: 25%; font-weight: bold; color: #059669;">${formatCurrency(sales?.total)}</td>
        <td style="width: 25%;">صافي الربح المحقق</td>
        <td style="width: 25%; font-weight: bold; color: #047857;">${formatCurrency(profit)}</td>
      </tr>
      <tr>
        <td>مبيعات كاش (نقدي)</td>
        <td>${formatCurrency(sales?.cash)}</td>
        <td>مبيعات بطاقة</td>
        <td>${formatCurrency(sales?.card)}</td>
      </tr>
      <tr>
        <td>مبيعات تحويل مصرفي</td>
        <td>${formatCurrency(sales?.transfer)}</td>
        <td>مبيعات آجلة (ديون عملاء)</td>
        <td>${formatCurrency(sales?.debt)}</td>
      </tr>
    </table>
  </div>

  <!-- 2. CASH RECONCILIATION -->
  <div class="section">
    <div class="section-title">2. تسوية وفحص النقدية في الدرج (Cash Drawer)</div>
    <table>
      <tr>
        <td style="width: 60%;">النقد المتوقع في الدرج (Expected Cash)</td>
        <td style="font-weight: bold;">${formatCurrency(cash?.expected)}</td>
      </tr>
      <tr>
        <td>النقد الفعلي المعدود في الصندوق (Actual Counted)</td>
        <td style="font-weight: bold;">${formatCurrency(cash?.actual)}</td>
      </tr>
      <tr class="total-row ${cash?.variance >= 0 ? 'variance-positive' : 'variance-negative'}">
        <td>حالة المطابقة والفارق (${cash?.variance >= 0 ? 'فائض نقدي' : 'عجز نقدي'})</td>
        <td style="font-size: 12px;">${cash?.variance >= 0 ? '+' : ''}${formatCurrency(cash?.variance)}</td>
      </tr>
    </table>
  </div>

  <!-- 3. PURCHASES BREAKDOWN -->
  ${purchases && purchases.items && purchases.items.length > 0 ? `
  <div class="section">
    <div class="section-title">3. فواتير المشتريات والتوريدات المسجلة (${purchases.count} فاتورة — الإجمالي: ${formatCurrency(purchases.total)})</div>
    <table>
      <thead>
        <tr>
          <th>الوقت / المرجع</th>
          <th>المورد</th>
          <th>طريقة الدفع</th>
          <th class="text-left">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${purchases.items.map(p => `
          <tr>
            <td>${formatDateStr(p.date)} ${p.invoice_ref ? `(${p.invoice_ref})` : ''}</td>
            <td>${p.supplier_name || 'مورد عام'}</td>
            <td>${p.payment_type === 'cash' ? 'كاش' : 'آجل / أخرى'}</td>
            <td class="text-left" style="font-weight: bold;">${formatCurrency(p.total)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <!-- 4. LOSSES & DAMAGED ITEMS -->
  ${losses && losses.items && losses.items.length > 0 ? `
  <div class="section">
    <div class="section-title">4. التوالف والفاقد (${losses.count} صنف — التكلفة: ${formatCurrency(losses.total)})</div>
    <table>
      <thead>
        <tr>
          <th>الصنف التالف</th>
          <th class="text-center">الكمية</th>
          <th>سبب التلف</th>
          <th class="text-left">قيمة الخسارة</th>
        </tr>
      </thead>
      <tbody>
        ${losses.items.map(l => `
          <tr>
            <td>${l.item_name}</td>
            <td class="text-center">${l.qty} ${l.unit || 'قطعة'}</td>
            <td>${l.reason || 'تلف'}</td>
            <td class="text-left" style="color: #dc2626; font-weight: bold;">${formatCurrency(l.cost_value)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <!-- 5. WITHDRAWALS & CAPITAL -->
  ${(withdrawals && withdrawals.items && withdrawals.items.length > 0) || (capital && capital.items && capital.items.length > 0) ? `
  <div class="section">
    <div class="section-title">5. السحوبات النقدية والضخ المالي</div>
    <table>
      <thead>
        <tr>
          <th>النوع</th>
          <th>البيان / المستلم</th>
          <th>السبب / الملاحظات</th>
          <th class="text-left">المبلغ</th>
        </tr>
      </thead>
      <tbody>
        ${(withdrawals?.items || []).map(w => `
          <tr>
            <td style="color: #dc2626; font-weight: bold;">سحب نقدي</td>
            <td>${w.person || 'سحب'}</td>
            <td>${w.reason || w.category || 'مصاريف'}</td>
            <td class="text-left" style="color: #dc2626; font-weight: bold;">-${formatCurrency(w.amount)}</td>
          </tr>
        `).join('')}
        ${(capital?.items || []).map(c => `
          <tr>
            <td style="color: #2563eb; font-weight: bold;">ضخ مالي</td>
            <td>${c.source || 'خزينة'}</td>
            <td>${c.notes || 'ضخ سيولة'}</td>
            <td class="text-left" style="color: #2563eb; font-weight: bold;">+${formatCurrency(c.amount)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <!-- 6. GIFTS & NOTES -->
  ${(gifts && gifts.items && gifts.items.length > 0) || (notes && notes.items && notes.items.length > 0) ? `
  <div class="section">
    <div class="section-title">6. الهدايا والملاحظات التوثيقية للوردية</div>
    <table>
      <thead>
        <tr>
          <th>البند</th>
          <th>التفاصيل</th>
          <th class="text-left">القيمة / الملاحظة</th>
        </tr>
      </thead>
      <tbody>
        ${(gifts?.items || []).map(g => `
          <tr>
            <td>🎁 هدية / عينة: ${g.recipient || 'زبون'}</td>
            <td>${g.item_name} (×${g.qty})</td>
            <td class="text-left" style="font-weight: bold;">${formatCurrency(g.cost_value)}</td>
          </tr>
        `).join('')}
        ${(notes?.items || []).map(n => `
          <tr>
            <td>📝 ملاحظة: ${n.title || 'تنبيه'}</td>
            <td colspan="2">${n.content || n.notes || '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div style="margin-top: 8mm; display: flex; justify-content: space-between;">
    <div style="text-align: center; width: 45%;">
      <div style="border-top: 1px solid #000; padding-top: 1.5mm; margin-top: 10mm; font-size: 10px;">توقيع الكاشير المناوب (${cashier || 'الكاشير'})</div>
    </div>
    <div style="text-align: center; width: 45%;">
      <div style="border-top: 1px solid #000; padding-top: 1.5mm; margin-top: 10mm; font-size: 10px;">توقيع المدير / المشرف العام</div>
    </div>
  </div>

  <div style="text-align: center; margin-top: 6mm; font-size: 9px; color: #6b7280;">
    <div>${settings.storeName || 'منظومة الدفة للعطور'} — طبع بتاريخ: ${new Date().toLocaleString('ar-LY')}</div>
  </div>
</body>
</html>`;
}

// Export Shift Report as PDF File (Direct Save)
ipcMain.handle('export:shift-pdf', async (event, reportData) => {
  let pdfWindow = null;
  try {
    const settings = getPrintSettings();
    const html = generateShiftReportHtml(reportData, settings);

    const cashier = (reportData.cashier || 'الكاشير').replace(/[/\\?%*:|"<>]/g, '-');
    const dateStr = (reportData.period?.start || new Date().toISOString().split('T')[0]).split('T')[0];
    const defaultFileName = `تقرير_وردية_${cashier}_${dateStr}.pdf`;

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'حفظ وتصدير تقرير إغلاق الوردية كملف (PDF)',
      defaultPath: defaultFileName,
      filters: [{ name: 'مستند PDF', extensions: ['pdf'] }]
    });

    if (canceled || !filePath) {
      return { success: true, saved: false };
    }

    pdfWindow = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false }
    });

    await pdfWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        top: 0.3,
        bottom: 0.3,
        left: 0.3,
        right: 0.3
      }
    });

    fs.writeFileSync(filePath, pdfBuffer);

    if (pdfWindow && !pdfWindow.isDestroyed()) {
      pdfWindow.destroy();
      pdfWindow = null;
    }

    return { success: true, saved: true, filePath };
  } catch (error) {
    if (pdfWindow && !pdfWindow.isDestroyed()) {
      try { pdfWindow.destroy(); } catch (e) {}
    }
    console.error('Export shift PDF error:', error);
    return { success: false, error: error.message };
  }
});

// Shift Report Printing (Crash-Safe)
ipcMain.handle('print:shift-report', async (event, reportData) => {
  let printWindow = null;
  try {
    const settings = getPrintSettings();
    const html = generateShiftReportHtml(reportData, settings);

    printWindow = new BrowserWindow({
      show: false,
      parent: mainWindow || undefined,
      webPreferences: {
        nodeIntegration: false
      }
    });

    await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    printWindow.webContents.print({
      silent: false,
      printBackground: true
    }, (success, errorType) => {
      if (!success) {
        console.warn('Print shift report status:', errorType);
      }
      setTimeout(() => {
        try {
          if (printWindow && !printWindow.isDestroyed()) {
            printWindow.destroy();
          }
        } catch (e) {}
      }, 1000);
    });

    return { success: true };
  } catch (error) {
    if (printWindow && !printWindow.isDestroyed()) {
      try { printWindow.destroy(); } catch (e) {}
    }
    console.error('Print shift report error:', error);
    return { success: false, error: error.message };
  }
});

// A4 Stock / Inventory Report Printing
ipcMain.handle('print:inventory-report', async (event, inventoryData) => {
  try {
    const { products = [], totalCost = 0, totalRetail = 0, lowStockCount = 0 } = inventoryData;
    const settings = getPrintSettings();

    const formatCurrency = (amount) => {
      const val = Number(amount) || 0;
      return `${val.toLocaleString('ar-LY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${settings.currencySymbol || 'د.ل'}`;
    };

    const reportHtml = `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 12mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #111827;
      background: #fff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #fbbf24;
      padding-bottom: 6mm;
      margin-bottom: 6mm;
    }
    .logo-area { display: flex; align-items: center; gap: 10px; }
    .logo-img { max-height: 40px; object-fit: contain; }
    .logo-text { font-size: 22px; font-weight: bold; color: #92400e; }
    .title { font-size: 20px; font-weight: bold; text-align: center; margin-bottom: 4mm; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 3mm;
      margin-bottom: 5mm;
    }
    .summary-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 6px 10px;
      text-align: center;
    }
    .summary-card .label { font-size: 10px; color: #6b7280; }
    .summary-card .value { font-size: 14px; font-weight: bold; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 2mm; font-size: 10px; }
    th, td { padding: 5px 6px; text-align: right; border: 1px solid #e5e7eb; }
    th { background: #f3f4f6; font-weight: bold; color: #1f2937; }
    tr:nth-child(even) { background: #fafafa; }
    .low-stock { background: #fee2e2 !important; color: #b91c1c; font-weight: bold; }
    .total-row { font-weight: bold; background: #fffbeb; }
    .footer {
      margin-top: 10mm;
      padding-top: 3mm;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-area">
      ${settings.showLogo && settings.logoBase64 ? `<img src="${settings.logoBase64}" class="logo-img" alt="Logo" />` : ''}
      <div>
        <div class="logo-text">${settings.storeName}</div>
        <div style="font-size: 10px; color: #6b7280;">${settings.storeSubtitle}</div>
      </div>
    </div>
    <div style="text-align: left; font-size: 10px; color: #4b5563;">
      <div>📍 ${settings.storeAddress}</div>
      <div>📱 ${settings.storePhone}</div>
      <div>تاريخ الجرد: ${new Date().toLocaleDateString('ar-SD')}</div>
    </div>
  </div>

  <div class="title">كشف جرد المخزون العام والتقييم المالي</div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="label">إجمالي الأصناف</div>
      <div class="value">${products.length} صنف</div>
    </div>
    <div class="summary-card">
      <div class="label">أصناف منخفضة المخزون</div>
      <div class="value" style="color: #dc2626;">${lowStockCount} صنف</div>
    </div>
    <div class="summary-card">
      <div class="label">إجمالي تكلفة المخزون</div>
      <div class="value" style="color: #92400e;">${formatCurrency(totalCost)}</div>
    </div>
    <div class="summary-card">
      <div class="label">القيمة البيعية المتوقعة</div>
      <div class="value" style="color: #059669;">${formatCurrency(totalRetail)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 5%;">#</th>
        <th style="width: 35%;">اسم الصنف / المنتج</th>
        <th style="width: 15%;">التصنيف</th>
        <th style="width: 10%;">الكمية</th>
        <th style="width: 10%;">الوحدة</th>
        <th style="width: 12%;">التكلفة</th>
        <th style="width: 13%;">سعر البيع</th>
      </tr>
    </thead>
    <tbody>
      ${products.map((p, idx) => `
      <tr class="${p.qty <= 10 ? 'low-stock' : ''}">
        <td>${idx + 1}</td>
        <td>${p.name}</td>
        <td>${p.category || '-'}</td>
        <td>${p.qty}</td>
        <td>${p.unit || 'حبة'}</td>
        <td>${formatCurrency(p.cost)}</td>
        <td>${formatCurrency(p.price)}</td>
      </tr>
      `).join('')}
    </tbody>
  </table>

  <div style="margin-top: 12mm; display: flex; justify-content: space-between;">
    <div style="text-align: center; width: 40%;">
      <div style="border-top: 1px solid #000; padding-top: 2mm; margin-top: 10mm;">توقيع مسؤول المخزن</div>
    </div>
    <div style="text-align: center; width: 40%;">
      <div style="border-top: 1px solid #000; padding-top: 2mm; margin-top: 10mm;">اعتماد الإدارة</div>
    </div>
  </div>

  <div class="footer">
    <div>${settings.storeName} — تقرير معتمد &copy; ${new Date().getFullYear()}</div>
  </div>
</body>
</html>`;

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false
      }
    });

    await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(reportHtml));

    printWindow.webContents.print({
      silent: false,
      printBackground: true
    }, (success, errorType) => {
      if (!success) {
        console.error('Print inventory report failed:', errorType);
      }
      printWindow.close();
    });

    return { success: true };
  } catch (error) {
    console.error('Print inventory report error:', error);
    return { success: false, error: error.message };
  }
});

// Test Thermal Receipt Print (80mm)
ipcMain.handle('print:test-thermal', async (event, templateConfig = {}) => {
  try {
    const {
      title = 'الدفة للعطور',
      subtitle = 'Aldaffa Perfumes - لأرقى العطور والخلطات',
      phone = '0123456789',
      address = 'الخرطوم، السودان',
      greeting = 'شكراً لتسوقكم معنا .. نسعد بخدمتكم دائماً',
      policy = 'سياسة الاستبدال والاسترجاع: خلال 30 ساعة مع الفاتورة الأصلية. المنتجات المفتوحة لا تسترجع.',
      showLogo = true,
      showBarcode = true,
      showCashier = true,
      showPhone = true,
      logoBase64
    } = templateConfig;

    const receiptHtml = `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace, sans-serif;
      width: 80mm;
      padding: 4mm;
      font-size: 12px;
      line-height: 1.4;
      background: #fff;
      color: #000;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .large { font-size: 16px; }
    .logo-container {
      text-align: center;
      margin-bottom: 3mm;
    }
    .logo-img {
      max-width: 50mm;
      max-height: 25mm;
      object-fit: contain;
    }
    .logo-fallback {
      background: #fbbf24;
      color: #000;
      padding: 6px;
      font-size: 18px;
      font-weight: bold;
      border-radius: 4px;
      display: inline-block;
    }
    .divider {
      border-top: 1px dashed #000;
      margin: 3mm 0;
    }
    table { width: 100%; border-collapse: collapse; margin: 2mm 0; }
    td { padding: 2px 0; }
    .right { text-align: right; }
    .left { text-align: left; }
    .total-row { font-size: 14px; font-weight: bold; }
    .barcode {
      text-align: center;
      margin: 4mm 0 2mm;
      font-size: 11px;
      letter-spacing: 3px;
    }
    .policy {
      font-size: 9px;
      text-align: center;
      margin-top: 3mm;
      color: #333;
    }
  </style>
</head>
<body>
  ${showLogo ? `
  <div class="logo-container">
    ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" alt="Logo" />` : `<div class="logo-fallback">${title}</div>`}
  </div>
  ` : ''}

  <div class="center bold large">${title}</div>
  ${subtitle ? `<div class="center" style="font-size:10px; color:#444;">${subtitle}</div>` : ''}
  ${showPhone && phone ? `<div class="center" style="font-size:11px;">📱 ${phone}</div>` : ''}
  ${address ? `<div class="center" style="font-size:10px; color:#555;">📍 ${address}</div>` : ''}

  <div class="divider"></div>
  <div class="center bold">فاتورة تجريبية (طباعة حرارية 80mm)</div>
  <div class="divider"></div>

  <table>
    <tr>
      <td class="bold">رقم الفاتورة:</td>
      <td class="right">#TEST-001</td>
    </tr>
    <tr>
      <td class="bold">التاريخ:</td>
      <td class="right">${new Date().toLocaleString('ar-SD')}</td>
    </tr>
    ${showCashier ? `
    <tr>
      <td class="bold">الكاشير:</td>
      <td class="right">المدير العام</td>
    </tr>
    ` : ''}
    <tr>
      <td class="bold">طريقة الدفع:</td>
      <td class="right">نقدي</td>
    </tr>
  </table>

  <div class="divider"></div>

  <table>
    <thead>
      <tr class="bold">
        <td>الصنف</td>
        <td class="center">الكمية</td>
        <td class="right">السعر</td>
        <td class="right">الإجمالي</td>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>عطر العود الملكي (50ml)</td>
        <td class="center">1</td>
        <td class="right">15,000</td>
        <td class="right">15,000</td>
      </tr>
      <tr>
        <td>زيت مسك الطهارة (10ml)</td>
        <td class="center">2</td>
        <td class="right">4,500</td>
        <td class="right">9,000</td>
      </tr>
    </tbody>
  </table>

  <div class="divider"></div>

  <table>
    <tr>
      <td class="bold">المجموع الفرعي:</td>
      <td class="right">24,000 د.ل</td>
    </tr>
    <tr>
      <td class="bold">الخصم (10%):</td>
      <td class="right">-2,400 د.ل</td>
    </tr>
    <tr class="total-row">
      <td>الإجمالي النهائي:</td>
      <td class="right">21,600 د.ل</td>
    </tr>
  </table>

  ${showBarcode ? `
  <div class="barcode">
    <div>||| | ||||| ||| |||| |||| ||</div>
    <div>*ALDAFFA-TEST-001*</div>
  </div>
  ` : ''}

  ${policy ? `<div class="policy">${policy}</div>` : ''}
  ${greeting ? `<div class="center bold" style="margin-top:4mm; font-size:11px;">${greeting}</div>` : ''}
</body>
</html>`;

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false }
    });

    await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(receiptHtml));

    printWindow.webContents.print({
      silent: false,
      printBackground: true,
      margins: { marginType: 'none' }
    }, (success, errorType) => {
      if (!success) {
        console.error('Test thermal print failed:', errorType);
      }
      printWindow.close();
    });

    return { success: true };
  } catch (error) {
    console.error('Test thermal print error:', error);
    return { success: false, error: error.message };
  }
});

// Test A4 Document / PDF Print
ipcMain.handle('print:test-pdf', async (event, templateConfig = {}) => {
  try {
    const {
      title = 'الدفة للعطور',
      subtitle = 'Aldaffa Perfumes ERP - منظومة إدارة المحل والمخزون',
      phone = '0123456789',
      address = 'ليبيا - مصراتة',
      greeting = 'نسعد بخدمتكم دائماً',
      policy = 'وثيقة محاسبية رسمية معتمدة من المنظومة',
      showLogo = true,
      logoBase64
    } = templateConfig;

    const reportHtml = `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 13px;
      line-height: 1.6;
      color: #1f2937;
      background: #fff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #d97706;
      padding-bottom: 8mm;
      margin-bottom: 8mm;
    }
    .title-area h1 {
      font-size: 26px;
      font-weight: 800;
      color: #92400e;
      margin-bottom: 2px;
    }
    .title-area p {
      font-size: 12px;
      color: #6b7280;
    }
    .company-info {
      text-align: left;
      font-size: 11px;
      color: #4b5563;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      background: #fef3c7;
      color: #92400e;
      border-radius: 6px;
      font-weight: 700;
      font-size: 14px;
      margin-bottom: 6mm;
    }
    table { width: 100%; border-collapse: collapse; margin: 6mm 0; }
    th, td { padding: 10px 12px; text-align: right; border: 1px solid #e5e7eb; }
    th { background: #f3f4f6; font-weight: 700; color: #111827; }
    tr:nth-child(even) { background: #fafafa; }
    .total-row { font-weight: 800; background: #fffbeb; color: #92400e; }
    .footer {
      margin-top: 15mm;
      padding-top: 5mm;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 11px;
      color: #9ca3af;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title-area">
      ${showLogo && logoBase64 ? `<img src="${logoBase64}" style="max-height: 40px; margin-bottom: 4px;" alt="Logo" />` : ''}
      <h1>${title}</h1>
      <p>${subtitle}</p>
    </div>
    <div class="company-info">
      <div>📍 ${address}</div>
      <div>📱 ${phone}</div>
      <div>📅 تاريخ الطباعة: ${new Date().toLocaleDateString('ar-LY')}</div>
    </div>
  </div>

  <div class="badge">تقرير تجريبي معتمد A4 (PDF Export & Print)</div>

  <table>
    <thead>
      <tr>
        <th style="width: 10%;">#</th>
        <th style="width: 45%;">البيان / الصنف</th>
        <th style="width: 15%;">الكمية</th>
        <th style="width: 15%;">السعر الفردي</th>
        <th style="width: 15%;">الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>عطر دقة العود الفاخر - 50 مل</td>
        <td>3 حبات</td>
        <td>180.00 د.ل</td>
        <td>540.00 د.ل</td>
      </tr>
      <tr>
        <td>2</td>
        <td>زيت الصندل الصافي - 20 مل</td>
        <td>5 حبات</td>
        <td>60.00 د.ل</td>
        <td>300.00 د.ل</td>
      </tr>
      <tr>
        <td>3</td>
        <td>خلطة الدفة الخاصة الملكية - 100 مل</td>
        <td>2 حبة</td>
        <td>320.00 د.ل</td>
        <td>640.00 د.ل</td>
      </tr>
      <tr class="total-row">
        <td colspan="4" style="text-align: left;">المجموع الكلي:</td>
        <td>1,480.00 د.ل</td>
      </tr>
    </tbody>
  </table>

  <div style="margin-top: 15mm; display: flex; justify-content: space-between;">
    <div style="text-align: center; width: 40%;">
      <div style="border-top: 1px solid #111827; padding-top: 3mm; margin-top: 12mm; font-weight: bold;">اعتماد الإدارة</div>
    </div>
    <div style="text-align: center; width: 40%;">
      <div style="border-top: 1px solid #111827; padding-top: 3mm; margin-top: 12mm; font-weight: bold;">توقيع المحاسب</div>
    </div>
  </div>

  <div class="footer">
    <div>${policy}</div>
    <div>${greeting} — الدفة للعطور &copy; ${new Date().getFullYear()}</div>
  </div>
</body>
</html>`;

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false }
    });

    await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(reportHtml));

    printWindow.webContents.print({
      silent: false,
      printBackground: true
    }, (success, errorType) => {
      if (!success) {
        console.error('Test PDF print failed:', errorType);
      }
      printWindow.close();
    });

    return { success: true };
  } catch (error) {
    console.error('Test PDF print error:', error);
    return { success: false, error: error.message };
  }
});

// Comprehensive Financial Report PDF Export Handler
ipcMain.handle('export:financial-pdf', async (event, payload = {}) => {
  try {
    const { reportData = {}, templateConfig = {} } = payload;
    const {
      title = 'الدفة للعطور',
      subtitle = 'Aldaffa Perfumes - لأرقى العطور والخلطات',
      phone = '0123456789',
      address = 'ليبيا - مصراتة',
      currency = 'د.ل',
      logoBase64
    } = templateConfig;

    const {
      periodLabel = 'الفترة المحددة',
      startDate = '',
      endDate = '',
      metrics = {},
      paymentMethods = [],
      topProducts = [],
      categories = []
    } = reportData;

    const formatCurr = (num) => {
      const val = Number(num) || 0;
      return `${val.toLocaleString('ar-LY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
    };

    const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>تقرير تحليلي مالي - ${title}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #1f2937;
      background: #fff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #f59e0b;
      padding-bottom: 5mm;
      margin-bottom: 5mm;
    }
    .title-area h1 {
      font-size: 22px;
      font-weight: 800;
      color: #92400e;
    }
    .title-area p {
      font-size: 11px;
      color: #6b7280;
    }
    .company-info {
      text-align: left;
      font-size: 10px;
      color: #4b5563;
    }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      background: #fef3c7;
      color: #92400e;
      border-radius: 6px;
      font-weight: 700;
      font-size: 12px;
      margin-bottom: 4mm;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 3mm;
      margin-bottom: 5mm;
    }
    .kpi-card {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 3mm;
      background: #f9fafb;
    }
    .kpi-title {
      font-size: 9px;
      color: #6b7280;
      font-weight: 600;
    }
    .kpi-value {
      font-size: 13px;
      font-weight: 800;
      color: #111827;
      margin-top: 2px;
    }
    .kpi-sub {
      font-size: 8px;
      color: #9ca3af;
      margin-top: 2px;
    }
    .section-title {
      font-size: 12px;
      font-weight: 700;
      color: #111827;
      margin: 4mm 0 2mm 0;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 1mm;
    }
    table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
    th, td { padding: 6px 8px; text-align: right; border: 1px solid #e5e7eb; font-size: 10px; }
    th { background: #f3f4f6; font-weight: 700; color: #374151; }
    tr:nth-child(even) { background: #f9fafb; }
    .tables-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4mm;
    }
    .sign-section {
      margin-top: 6mm;
      display: flex;
      justify-content: space-between;
    }
    .sign-box {
      text-align: center;
      width: 40%;
      border-top: 1px solid #9ca3af;
      padding-top: 2mm;
      font-size: 10px;
      font-weight: 700;
    }
    .footer {
      margin-top: 6mm;
      padding-top: 3mm;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 9px;
      color: #9ca3af;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title-area">
      ${logoBase64 ? `<img src="${logoBase64}" style="max-height: 35px; margin-bottom: 3px;" alt="Logo" />` : ''}
      <h1>${title}</h1>
      <p>${subtitle}</p>
    </div>
    <div class="company-info">
      <div>📍 ${address}</div>
      <div>📱 ${phone}</div>
      <div>📅 تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-LY')}</div>
    </div>
  </div>

  <div class="badge">تقرير الأداء والتحليل المالي الشامل (${periodLabel}: ${startDate} إلى ${endDate})</div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-title">إجمالي المبيعات</div>
      <div class="kpi-value" style="color: #d97706;">${formatCurr(metrics.totalRevenue)}</div>
      <div class="kpi-sub">${metrics.invoiceCount || 0} فاتورة صادرة</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">مجمل الربح المحقق</div>
      <div class="kpi-value" style="color: #059669;">${formatCurr(metrics.totalProfit)}</div>
      <div class="kpi-sub">هامش الربح: ${metrics.profitMargin || 0}%</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">صافي الأرباح (بعد المصاريف)</div>
      <div class="kpi-value" style="color: #2563eb;">${formatCurr(metrics.netProfit)}</div>
      <div class="kpi-sub">صافي العائد الفعلي</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">متوسط الفاتورة</div>
      <div class="kpi-value">${formatCurr(metrics.avgOrderValue)}</div>
      <div class="kpi-sub">متوسط سلة المبيعات</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">إجمالي المشتريات</div>
      <div class="kpi-value">${formatCurr(metrics.totalPurchases)}</div>
      <div class="kpi-sub">فواتير التوريد</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">السحوبات والمصروفات</div>
      <div class="kpi-value">${formatCurr(metrics.totalWithdrawals)}</div>
      <div class="kpi-sub">المصاريف التشغيلية</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">التوالف والضياع</div>
      <div class="kpi-value" style="color: #dc2626;">${formatCurr(metrics.totalLosses)}</div>
      <div class="kpi-sub">قيمة الهدر والتالف</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">رأس المال والضخ</div>
      <div class="kpi-value">${formatCurr(metrics.totalCapital)}</div>
      <div class="kpi-sub">التمويل الإضافي</div>
    </div>
  </div>

  <div class="section-title">الأصناف والمنتجات الأكثر مساهمة في الأرباح</div>
  <table>
    <thead>
      <tr>
        <th style="width: 5%;">#</th>
        <th style="width: 45%;">المنتج / الصنف</th>
        <th style="width: 15%;">الكمية المباعة</th>
        <th style="width: 15%;">إجمالي المبيعات</th>
        <th style="width: 20%;">صافي الربح المحقق</th>
      </tr>
    </thead>
    <tbody>
      ${(topProducts || []).slice(0, 10).map((p, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td style="font-weight: 600;">${p.name || 'صنف'}</td>
          <td>${p.total_qty || 0} قطعة</td>
          <td>${formatCurr(p.total_revenue)}</td>
          <td style="font-weight: bold; color: #059669;">${formatCurr(p.total_profit)}</td>
        </tr>
      `).join('') || '<tr><td colspan="5" style="text-align: center;">لا توجد مبيعات مسجلة في هذه الفترة</td></tr>'}
    </tbody>
  </table>

  <div class="tables-row">
    <div>
      <div class="section-title">توزيع طرق التحصيل والدفع</div>
      <table>
        <thead>
          <tr>
            <th>طريقة الدفع</th>
            <th>القيمة</th>
          </tr>
        </thead>
        <tbody>
          ${(paymentMethods || []).map((pm) => `
            <tr>
              <td>${pm.name || 'طريقة دفع'}</td>
              <td style="font-weight: bold;">${formatCurr(pm.value)}</td>
            </tr>
          `).join('') || '<tr><td colspan="2" style="text-align: center;">—</td></tr>'}
        </tbody>
      </table>
    </div>
    <div>
      <div class="section-title">المبيعات حسب التصنيف</div>
      <table>
        <thead>
          <tr>
            <th>التصنيف</th>
            <th>الإيرادات</th>
          </tr>
        </thead>
        <tbody>
          ${(categories || []).slice(0, 5).map((c) => `
            <tr>
              <td>${c.category || 'عام'}</td>
              <td style="font-weight: bold;">${formatCurr(c.total_revenue)}</td>
            </tr>
          `).join('') || '<tr><td colspan="2" style="text-align: center;">—</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <div class="sign-section">
    <div class="sign-box">توقيع المحاسب القانوني</div>
    <div class="sign-box">اعتماد المدير العام</div>
  </div>

  <div class="footer">
    تقرير مالي تم إنشاؤه آلياً بواسطة منظومة ${title} &copy; ${new Date().getFullYear()} — وثيقة للاستخدام الإداري والمحاسبي
  </div>
</body>
</html>`;

    const printWin = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false }
    });

    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    const pdfBuffer = await printWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
    });

    printWin.close();

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'حفظ التقرير المالي كملف PDF',
      defaultPath: path.join(app.getPath('documents'), `تقرير_مالي_الدفة_${new Date().toISOString().split('T')[0]}.pdf`),
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    fs.writeFileSync(filePath, pdfBuffer);
    return { success: true, filePath };
  } catch (err) {
    console.error('export:financial-pdf error:', err);
    return { success: false, error: err.message };
  }
});

// Hardware & USB Printer/Scanner Discovery Handler (Real Hardware Status Polling)
ipcMain.handle('hardware:get-devices', async () => {
  const result = {
    systemPrinters: [],
    usbPrinters: [],
    usbScanners: [],
    rawUsbDevices: [],
    lpDevices: [],
    cupsRunning: false,
    platform: process.platform,
    isOnline: false,
    primaryPrinter: null
  };

  // 1. Query Linux /dev/usb/lp devices
  if (process.platform === 'linux') {
    try {
      if (fs.existsSync('/dev/usb')) {
        const lpDevs = fs.readdirSync('/dev/usb').filter(f => f.startsWith('lp'));
        result.lpDevices = lpDevs.map(f => `/dev/usb/${f}`);
      }
    } catch (e) {}

    // 2. Query CUPS service status
    try {
      const { execSync } = require('child_process');
      const cupsCheck = execSync('systemctl is-active cups 2>&1 || true', { encoding: 'utf8' }).trim();
      result.cupsRunning = cupsCheck === 'active';
    } catch (e) {}
  }

  // 3. Query USB Bus Devices (lsusb on Linux)
  if (process.platform === 'linux') {
    try {
      const { execSync } = require('child_process');
      const lsusb = execSync('lsusb 2>&1 || true', { encoding: 'utf8' });
      const lines = lsusb.trim().split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        const isPrinter = /printer|pos|thermal|xprinter|tsc|zebra|epson|80mm|58mm/i.test(line);
        const isScanner = /barcode|scanner|hid|honeywell|datalogic|symbol|reader/i.test(line);
        const deviceName = line.replace(/^Bus \d+ Device \d+: ID [a-f0-9:]+ /i, '').trim();

        const item = {
          raw: line,
          name: deviceName,
          isPrinter,
          isScanner
        };

        if (isPrinter) result.usbPrinters.push(item);
        else if (isScanner) result.usbScanners.push(item);
        else result.rawUsbDevices.push(item);
      }
    } catch (e) {}
  }

  // 4. Query CUPS lpstat printer detailed hardware states on Linux
  let cupsPrinterStates = {};
  if (process.platform === 'linux') {
    try {
      const { execSync } = require('child_process');
      const lpstatOut = execSync('lpstat -p -d 2>&1 || true', { encoding: 'utf8' });
      const printerBlocks = lpstatOut.split(/^printer /m);
      for (const block of printerBlocks) {
        if (!block.trim()) continue;
        const firstLine = block.split('\n')[0] || '';
        const pName = firstLine.split(' ')[0];
        if (pName) {
          const isUnplugged = /unplugged|turned off|disabled|offline/i.test(block);
          const isIdle = /is idle|enabled/i.test(firstLine) && !isUnplugged;
          cupsPrinterStates[pName] = {
            raw: block.trim(),
            isOnline: isIdle || (result.lpDevices.length > 0 && !isUnplugged),
            isUnplugged
          };
        }
      }
    } catch (e) {}
  }

  // 5. Query OS System Printers (via Electron) & Decorate with Live Status
  try {
    if (mainWindow && mainWindow.webContents) {
      const rawPrinters = await mainWindow.webContents.getPrintersAsync();
      result.systemPrinters = rawPrinters.map(p => {
        let isOnline = false;
        let statusReason = 'جاهزة للطباعة';

        if (process.platform === 'linux') {
          const cupsInfo = cupsPrinterStates[p.name];
          if (cupsInfo) {
            isOnline = cupsInfo.isOnline;
            if (cupsInfo.isUnplugged) {
              statusReason = 'الكيبل مفصول أو الطابعة مغلقة (Unplugged / Off)';
            } else if (!isOnline) {
              statusReason = 'الطابعة غير مفعلة (Disabled)';
            }
          } else {
            // If /dev/usb/lp0 exists or status is 0
            isOnline = result.lpDevices.length > 0 || p.status === 0;
            if (!isOnline) statusReason = 'الطابعة غير متصلة';
          }
        } else {
          // Windows / macOS: status 0 is IDLE/Ready
          isOnline = p.status === 0;
          if (!isOnline) statusReason = `حالة غير متصلة (${p.status})`;
        }

        return {
          ...p,
          isOnline,
          statusReason,
          hasDirectUsbNode: result.lpDevices.length > 0
        };
      });
    }
  } catch (e) {
    console.warn('getPrintersAsync error:', e.message);
  }

  // Determine top-level primary printer status
  if (result.systemPrinters.length > 0) {
    const primary = result.systemPrinters.find(p => p.isDefault) || result.systemPrinters[0];
    result.primaryPrinter = primary;
    result.isOnline = !!primary.isOnline;
  } else {
    result.isOnline = result.lpDevices.length > 0;
  }

  return { success: true, ...result };
});

// Hardware Sensor Auto-Calibration Handler (TSPL GAPDETECT for Xprinter XP-365B)
ipcMain.handle('printer:calibrate-sensor', async (event, { printerName, widthMm = 50, heightMm = 30 } = {}) => {
  try {
    const calibrateCmd = Buffer.from(
      `SIZE ${widthMm} mm, ${heightMm} mm\r\n` +
      `GAP 2 mm, 0 mm\r\n` +
      `OFFSET 0 mm\r\n` +
      `REFERENCE 0,0\r\n` +
      `DIRECTION 0,0\r\n` +
      `SET PEEL OFF\r\n` +
      `SET CUTTER OFF\r\n` +
      `SET TEAR ON\r\n` +
      `GAPDETECT\r\n` +
      `FEED 1\r\n`
    );

    // 1. Direct write to USB device node if present
    const usbDevices = ['/dev/usb/lp0', '/dev/usb/lp1', '/dev/usb/lp2'];
    for (const devPath of usbDevices) {
      if (fs.existsSync(devPath)) {
        try {
          fs.writeFileSync(devPath, calibrateCmd);
          return { success: true, message: `✅ تم إرسال أمر معايرة حساس الفواصل (Auto-Gap) بنجاح عبر ${devPath}` };
        } catch (e) {
          console.warn(`Direct write to ${devPath} failed:`, e.message);
        }
      }
    }

    // 2. Pipe raw TSPL to CUPS printer queue
    if (printerName && process.platform === 'linux') {
      const tempPath = path.join(os.tmpdir(), `aldaffa_calib_${Date.now()}.bin`);
      fs.writeFileSync(tempPath, calibrateCmd);
      const lpCmd = `lp -d "${printerName}" -o raw "${tempPath}"`;
      const { exec } = require('child_process');
      await new Promise((resolve) => {
        exec(lpCmd, (error) => {
          try { fs.unlinkSync(tempPath); } catch (e) {}
          resolve();
        });
      });
      return { success: true, message: `✅ تم إرسال أمر معايرة الحساس (Auto-Gap) إلى الطابعة (${printerName})` };
    }

    return {
      success: false,
      error: 'لم يتم العثور على منفذ طابعة حرارية نشط للمعايرة. يرجى التأكد من توصيل كابل USB بالطابعة وتشغيلها.'
    };
  } catch (err) {
    console.error('printer:calibrate-sensor error:', err);
    return { success: false, error: err.message };
  }
});

/**
 * Convert Rendered HTML Label directly into a 1-bit Monochrome TSPL command Buffer (203 DPI)
 * Supports natural direction (0,0), crisp 2x supersampled rasterization, and anti-aliasing preservation.
 */
async function renderHtmlToTsplCommand(htmlString, widthMm = 50, heightMm = 30, direction = 0) {
  const dotsW = Math.max(80, Math.round(widthMm * 8)); // 50mm = 400 dots
  const dotsH = Math.max(80, Math.round(heightMm * 8)); // 30mm = 240 dots
  const widthBytes = Math.ceil(dotsW / 8);

  const win = new BrowserWindow({
    show: false,
    width: dotsW,
    height: dotsH,
    useContentSize: true,
    backgroundColor: '#FFFFFF',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  try {
    win.webContents.setZoomFactor(1.0);
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlString));
    // Wait for fonts and vector SVGs to rasterize cleanly
    await new Promise((r) => setTimeout(r, 120));

    let image = await win.webContents.capturePage({ x: 0, y: 0, width: dotsW, height: dotsH });

    // GUARANTEE 1:1 pixel match for 203 DPI thermal head regardless of screen DPI/scale factor
    const currentSize = image.getSize();
    if (currentSize.width !== dotsW || currentSize.height !== dotsH) {
      image = image.resize({ width: dotsW, height: dotsH, quality: 'best' });
    }

    const w = dotsW;
    const h = dotsH;
    const bytesPerRow = Math.ceil(w / 8);
    const bitmap = image.toBitmap(); // RGBA Buffer

    const tsplData = Buffer.alloc(bytesPerRow * h, 0xff); // 0xff is blank/white

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const offset = (y * w + x) * 4;
        const r = bitmap[offset];
        const g = bitmap[offset + 1];
        const b = bitmap[offset + 2];
        const a = bitmap[offset + 3];

        // Standard luminance calculation
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        // High-contrast threshold: Any non-pure-white dot (<215) with opacity is burned as black
        if (a > 50 && lum < 215) {
          const bIdx = y * bytesPerRow + Math.floor(x / 8);
          const bitIdx = 7 - (x % 8);
          tsplData[bIdx] &= ~(1 << bitIdx); // Burn black dot (0)
        }
      }
    }

    const header = Buffer.from(
      `SIZE ${widthMm} mm, ${heightMm} mm\r\n` +
      `GAP 2 mm, 0 mm\r\n` +
      `DIRECTION ${direction},0\r\n` +
      `REFERENCE 0,0\r\n` +
      `OFFSET 0 mm\r\n` +
      `SET PEEL OFF\r\n` +
      `SET CUTTER OFF\r\n` +
      `SET TEAR ON\r\n` +
      `CLS\r\n` +
      `BITMAP 0,0,${bytesPerRow},${h},0,`
    );
    const footer = Buffer.from(`\r\nPRINT 1,1\r\n`);

    return Buffer.concat([header, tsplData, footer]);
  } finally {
    if (win && !win.isDestroyed()) {
      try { win.destroy(); } catch (e) {}
    }
  }
}

// Dedicated Direct Barcode Printing Handler (Crash-Proof & Native Hardware TSPL)
ipcMain.handle('print:barcodes-direct', async (event, printData) => {
  return new Promise(async (resolve) => {
    try {
      const { html, labels = [], printerName, silent = false, widthMm = 50, heightMm = 30, direction = 0 } = printData || {};

      // Mode 1: Interactive System Dialog (silent: false)
      if (!silent) {
        const previewWin = new BrowserWindow({
          parent: mainWindow || undefined,
          modal: true,
          show: true,
          width: 780,
          height: 850,
          title: 'معاينة ملصقات الباركود وحوار الطباعة',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
          }
        });

        const interactiveHtml = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>معاينة ملصقات الباركود</title>
  <style>
    @media screen {
      body {
        margin: 0;
        padding: 0;
        background: #0d1117;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }
      #ald-print-bar {
        position: sticky;
        top: 0;
        z-index: 99999;
        background: #161b22;
        color: #e6edf3;
        padding: 12px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 2px solid #fbbf24;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      }
      .ald-btn {
        padding: 8px 18px;
        border-radius: 8px;
        font-weight: bold;
        font-size: 13px;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
      }
      .ald-btn-primary { background: #fbbf24; color: #0d1117; }
      .ald-btn-primary:hover { background: #f59e0b; }
      .ald-btn-sec { background: #30363d; color: #e6edf3; margin-inline-start: 8px; }
      .ald-btn-sec:hover { background: #484f58; }
      #print-content {
        padding: 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        background: #0d1117;
        min-height: 100vh;
      }
    }
    @media print {
      @page {
        size: ${widthMm}mm ${heightMm}mm;
        margin: 0;
      }
      #ald-print-bar { display: none !important; }
      #print-content { padding: 0 !important; margin: 0 !important; background: #fff !important; }
    }
  </style>
</head>
<body>
  <div id="ald-print-bar">
    <div style="font-weight: bold; font-size: 14px;">🖨️ معاينة ملصقات الباركود (${widthMm}×${heightMm} mm)</div>
    <div>
      <button class="ald-btn ald-btn-primary" onclick="window.print()">🖨️ بدء الطباعة الآن</button>
      <button class="ald-btn ald-btn-sec" onclick="window.close()">إغلاق</button>
    </div>
  </div>
  <div id="print-content">
    ${html}
  </div>
</body>
</html>`;

        await previewWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(interactiveHtml));
        return resolve({ success: true, message: 'تم فتح نافذة المعاينة والطباعة بأمان' });
      }

      // Mode 2: Instant Hardware TSPL Direct Printing (silent: true)
      let boxesToPrint = [];
      if (Array.isArray(labels) && labels.length > 0) {
        boxesToPrint = labels;
      } else if (typeof html === 'string' && html.includes('label-box')) {
        // Safe extraction of label-box elements without HTML truncation
        const matches = Array.from(html.matchAll(/<div\s+class="label-box"[^>]*>([\s\S]*?)<\/div>/g));
        if (matches.length > 0) {
          boxesToPrint = matches.map((m) => `<div class="label-box">${m[1]}</div>`);
        }
      }

      if (boxesToPrint.length === 0) {
        boxesToPrint = [html];
      }

      let combinedTsplBuffer = Buffer.alloc(0);

      for (const singleBox of boxesToPrint) {
        const singleHtml = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${widthMm}mm;
      height: ${heightMm}mm;
      margin: 0;
      padding: 0;
      background: #FFFFFF;
      color: #000000;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      overflow: hidden;
      display: flex;
      justify-content: center;
      align-items: center;
      direction: rtl;
    }
    .label-box {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      text-align: center;
      padding: 1.5mm 1.5mm;
      box-sizing: border-box;
    }
    .store-title { font-size: 9px; font-weight: 800; color: #111; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 98%; }
    .product-title { font-size: 11px; font-weight: 900; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 98%; line-height: 1.1; margin: 0.5mm 0; }
    .barcode-area { width: 100%; display: flex; justify-content: center; align-items: center; flex-grow: 1; }
    .barcode-area svg { width: ${widthMm - 6}mm !important; height: auto !important; max-height: ${heightMm - 14}mm; display: block; margin: 0 auto; }
    .price-badge { font-size: 11.5px; font-weight: 900; color: #000; line-height: 1.1; }
  </style>
</head>
<body>
  ${singleBox}
</body>
</html>`;

        const tsplChunk = await renderHtmlToTsplCommand(singleHtml, widthMm, heightMm, direction);
        combinedTsplBuffer = Buffer.concat([combinedTsplBuffer, tsplChunk]);
      }

      // Try Direct /dev/usb/lp0 Stream First
      const usbDevices = ['/dev/usb/lp0', '/dev/usb/lp1', '/dev/usb/lp2'];
      let writtenToDevice = false;

      for (const devPath of usbDevices) {
        if (fs.existsSync(devPath)) {
          try {
            fs.writeFileSync(devPath, combinedTsplBuffer);
            writtenToDevice = true;
            console.log(`Successfully streamed ${boxesToPrint.length} labels directly to ${devPath}`);
            return resolve({
              success: true,
              message: `✅ تم إرسال ${boxesToPrint.length} ملصق مباشرة إلى منفذ الطابعة (${devPath})`
            });
          } catch (e) {
            console.warn(`Direct write to ${devPath} failed:`, e.message);
          }
        }
      }

      // Fallback: Pipe Raw TSPL to CUPS via `lp -o raw`
      if (printerName && process.platform === 'linux') {
        const tempTsplPath = path.join(os.tmpdir(), `aldaffa_tspl_${Date.now()}.bin`);
        fs.writeFileSync(tempTsplPath, combinedTsplBuffer);

        const lpCmd = `lp -d "${printerName}" -o raw "${tempTsplPath}"`;
        exec(lpCmd, (error, stdout, stderr) => {
          try { fs.unlinkSync(tempTsplPath); } catch (e) {}
          if (error) {
            console.error('CUPS raw print error:', stderr || error.message);
            return resolve({
              success: false,
              error: `خطأ في إرسال أمر الطباعة لطابعة (${printerName}): ${stderr || error.message}`
            });
          }
          return resolve({
            success: true,
            message: `✅ تم إرسال ${boxesToPrint.length} ملصق إلى ${printerName} بنجاح`
          });
        });
        return;
      }

      resolve({
        success: false,
        error: 'لم يتم العثور على منفذ طابعة حرارية نشط (/dev/usb/lp0) أو طابعة CUPS محددة'
      });
    } catch (err) {
      console.error('Direct barcode print error:', err);
      resolve({ success: false, error: err.message });
    }
  });
});


// Auto-save and flush database WAL on app exit
function safeFlushAndBackup() {
  if (db && db.open) {
    try {
      db.pragma('wal_checkpoint(FULL)');
    } catch (e) {
      console.error('Safe flush on exit error:', e);
    }
  }
}

app.whenReady().then(() => {
  initDatabase();
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      setupAutoUpdater();
    }
  });
});

app.on('window-all-closed', () => {
  safeFlushAndBackup();
  if (process.platform !== 'darwin') {
    if (db) {
      try {
        db.close();
      } catch (e) {}
    }
    app.quit();
  }
});

app.on('before-quit', () => {
  safeFlushAndBackup();
  if (db) {
    try {
      db.close();
    } catch (e) {}
  }
});

// AutoUpdater events - strictly safe cache cleanup
autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall();
});

// Clear temporary web caches when update is applied, NEVER touch database
autoUpdater.on('update-applied', async () => {
  purgeSafeCaches();
});
