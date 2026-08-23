const { app, BrowserWindow, ipcMain } = require('electron');
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
    fontSize: 'md' // 'sm' | 'md' | 'lg'
  };

  try {
    if (!db) return defaults;
    const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN (
      'print_mode', 'store_name', 'store_subtitle', 'store_phone', 'store_address',
      'receipt_greeting', 'receipt_policy', 'show_logo', 'show_barcode',
      'show_cashier', 'show_phone', 'logo_base64', 'receipt_theme', 'receipt_border',
      'receipt_watermark_base64', 'font_size'
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
      fontSize: map['font_size'] || defaults.fontSize
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { status: 'error', error: err.message || String(err) });
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
    return { success: false, error: error.message };
  }
});

ipcMain.handle('updater:install', async () => {
  try {
    autoUpdater.quitAndInstall();
    return { success: true };
  } catch (error) {
    console.error('Install update error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('system:purge-cache', async () => {
  return purgeSafeCaches();
});

// Data Archiving & Migration Engine
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

// Thermal & A4 Receipt Printing
ipcMain.handle('print:receipt', async (event, receiptData) => {
  try {
    const { saleId, date, items, subtotal, discount, total, paymentMethod, customerName } = receiptData;
    const settings = getPrintSettings();

    const formatCurrency = (amount) => {
      const val = Number(amount) || 0;
      return `${val.toLocaleString('ar-LY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} د.ل`;
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
      return `${val.toLocaleString('ar-LY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} د.ل`;
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

// Shift Report Printing (A4 & Detailed Tables)
ipcMain.handle('print:shift-report', async (event, reportData) => {
  try {
    const { period, sales, profit, purchases, withdrawals, capital, losses, gifts, notes, cash, cashier } = reportData;
    const settings = getPrintSettings();

    const formatCurrency = (amount) => {
      const val = Number(amount) || 0;
      return `${val.toLocaleString('ar-LY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} د.ل`;
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
      border-bottom: 3px solid #d97706;
      padding-bottom: 6mm;
      margin-bottom: 4mm;
    }
    .logo-area { display: flex; align-items: center; gap: 10px; }
    .logo-img { max-height: 40px; object-fit: contain; }
    .logo-text { font-size: 20px; font-weight: bold; color: #78350f; }
    .title { font-size: 18px; font-weight: bold; text-align: center; margin-bottom: 2mm; color: #1f2937; }
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
        console.error('Print shift report failed:', errorType);
      }
      printWindow.close();
    });

    return { success: true };
  } catch (error) {
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
      return `${val.toLocaleString('ar-LY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} د.ل`;
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

// Hardware & USB Printer/Scanner Discovery Handler
ipcMain.handle('hardware:get-devices', async () => {
  const result = {
    systemPrinters: [],
    usbPrinters: [],
    usbScanners: [],
    rawUsbDevices: [],
    lpDevices: [],
    cupsRunning: false,
    platform: process.platform
  };

  // 1. Query OS System Printers (via Electron)
  try {
    if (mainWindow && mainWindow.webContents) {
      result.systemPrinters = await mainWindow.webContents.getPrintersAsync();
    }
  } catch (e) {
    console.warn('getPrintersAsync error:', e.message);
  }

  // 2. Query Linux /dev/usb/lp devices
  if (process.platform === 'linux') {
    try {
      if (fs.existsSync('/dev/usb')) {
        const lpDevs = fs.readdirSync('/dev/usb').filter(f => f.startsWith('lp'));
        result.lpDevices = lpDevs.map(f => `/dev/usb/${f}`);
      }
    } catch (e) {}

    // 3. Query CUPS status
    try {
      const { execSync } = require('child_process');
      const cupsCheck = execSync('systemctl is-active cups 2>&1 || true', { encoding: 'utf8' }).trim();
      result.cupsRunning = cupsCheck === 'active';
    } catch (e) {}
  }

  // 4. Query USB Bus Devices (lsusb on Linux)
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

  return { success: true, ...result };
});

// Dedicated Direct Barcode Printing Handler (Crash-Proof, Verified Linux CUPS & GTK Safe)
ipcMain.handle('print:barcodes-direct', async (event, printData) => {
  return new Promise(async (resolve) => {
    let printWindow = null;
    try {
      const { html, printerName, silent = false, widthMm = 50, heightMm = 30 } = printData || {};

      // If user wants interactive system dialog (silent: false), create a visible modal preview window to prevent GTK Segfault!
      if (!silent) {
        const previewWin = new BrowserWindow({
          parent: mainWindow || undefined,
          modal: true,
          show: true,
          width: 760,
          height: 840,
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
        justify-content: center;
        background: #0d1117;
        min-height: 100vh;
      }
    }
    @media print {
      #ald-print-bar { display: none !important; }
      #print-content { padding: 0 !important; margin: 0 !important; background: #fff !important; }
    }
  </style>
</head>
<body>
  <div id="ald-print-bar">
    <div style="font-weight: bold; font-size: 14px;">🖨️ معاينة ملصقات الباركود - جاهز للطباعة عبر النظام</div>
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

      // For Silent / Direct Printing (silent: true):
      printWindow = new BrowserWindow({
        show: false,
        width: 600,
        height: 800,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true
        }
      });

      const cleanup = () => {
        if (printWindow && !printWindow.isDestroyed()) {
          try { printWindow.destroy(); } catch (e) {}
          printWindow = null;
        }
      };

      printWindow.webContents.on('did-finish-load', async () => {
        try {
          // On Linux, use printToPDF + CUPS lp CLI pipe for 100% reliable execution & verified feedback!
          if (process.platform === 'linux' && printerName) {
            const pdfBuffer = await printWindow.webContents.printToPDF({
              pageSize: {
                width: Math.round((widthMm || 50) * 1000),
                height: Math.round((heightMm || 30) * 1000)
              },
              margins: { marginType: 'none' },
              printBackground: true
            });

            const tempPdfPath = path.join(os.tmpdir(), `aldaffa_barcode_${Date.now()}.pdf`);
            fs.writeFileSync(tempPdfPath, pdfBuffer);

            // Execute CUPS lp with exact custom dimensions and capture status
            const lpCmd = `lp -d "${printerName}" -o PageSize=Custom.${widthMm}x${heightMm}mm -o fit-to-page "${tempPdfPath}"`;

            exec(lpCmd, (error, stdout, stderr) => {
              // Delete temp pdf file
              try { fs.unlinkSync(tempPdfPath); } catch (e) {}
              cleanup();

              if (error) {
                console.error('CUPS lp error:', stderr || error.message);
                return resolve({
                  success: false,
                  error: `خطأ في طابعة لينكس (${printerName}): ${stderr || error.message}`
                });
              }

              console.log('CUPS lp success:', stdout);
              return resolve({
                success: true,
                message: `تم إرسال أمر الطباعة إلى ${printerName}`,
                details: stdout.trim()
              });
            });
            return;
          }

          // Fallback for Windows / macOS or standard Electron driver
          const printOptions = {
            silent: true,
            printBackground: true,
            margins: { marginType: 'none' }
          };

          if (printerName && typeof printerName === 'string' && printerName.trim()) {
            printOptions.deviceName = printerName.trim();
          }

          printWindow.webContents.print(printOptions, (success, errorType) => {
            cleanup();
            if (!success) {
              resolve({ success: false, error: errorType || 'فشل إرسال أمر الطباعة' });
            } else {
              resolve({ success: true, message: 'تم إرسال الملصق للطباعة بنجاح' });
            }
          });
        } catch (printErr) {
          cleanup();
          resolve({ success: false, error: printErr.message });
        }
      });

      printWindow.webContents.on('did-fail-load', (e, code, desc) => {
        cleanup();
        resolve({ success: false, error: `فشل تحميل محتوى الملصق: ${desc}` });
      });

      await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html || ''));
    } catch (error) {
      console.error('Direct barcode print error:', error);
      if (printWindow && !printWindow.isDestroyed()) {
        try { printWindow.destroy(); } catch (e) {}
      }
      resolve({ success: false, error: error.message });
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
