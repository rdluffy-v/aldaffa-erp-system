const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const Database = require('better-sqlite3');
const { autoUpdater } = require('electron-updater');
const { promisify } = require('util');
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
      capacity REAL DEFAULT 0
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
  console.log('Database schema initialized');
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
    console.error('Database run error:', error);
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

// Thermal receipt printing (80mm)
ipcMain.handle('print:receipt', async (event, receiptData) => {
  try {
    const { saleId, date, items, subtotal, discount, total, paymentMethod, customerName } = receiptData;

    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('ar-SD', {
        style: 'currency',
        currency: 'SDG',
        minimumFractionDigits: 0
      }).format(amount);
    };

    const formatDate = (dateStr) => {
      return new Intl.DateTimeFormat('ar-SD', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(dateStr));
    };

    // Build HTML receipt for 80mm thermal printer
    const receiptHtml = `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      width: 80mm;
      padding: 5mm;
      font-size: 12px;
      line-height: 1.4;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .large { font-size: 16px; }
    .logo {
      width: 60mm;
      height: 20mm;
      margin: 0 auto 5mm;
      background: linear-gradient(135deg, #fbbf24, #f59e0b);
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 5px;
    }
    .logo-text {
      font-size: 24px;
      font-weight: bold;
      color: #030712;
    }
    .divider {
      border-top: 1px dashed #000;
      margin: 3mm 0;
    }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; }
    .item-row td { vertical-align: top; }
    .right { text-align: right; }
    .left { text-align: left; }
    .total-row { font-size: 14px; font-weight: bold; }
    .barcode {
      text-align: center;
      margin: 5mm 0;
      font-size: 10px;
      letter-spacing: 2px;
    }
    .policy {
      font-size: 9px;
      text-align: center;
      margin-top: 5mm;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="logo">
    <div class="logo-text">الدفة للعطور</div>
  </div>

  <div class="center bold">Aldaffa Perfumes</div>
  <div class="center">الخرطوم، السودان</div>
  <div class="center">📱 0123456789</div>

  <div class="divider"></div>

  <div class="center bold large">فاتورة بيع</div>

  <table style="margin: 3mm 0;">
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
    <tr>
      <td class="bold">الدفع:</td>
      <td class="right">${paymentMethod === 'cash' ? 'نقدي' : paymentMethod === 'card' ? 'بطاقة' : 'تحويل'}</td>
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
      <td class="bold">الخصم (${discount}%):</td>
      <td class="right">-${formatCurrency(subtotal * discount / 100)}</td>
    </tr>
    ` : ''}
    <tr class="total-row">
      <td>الإجمالي:</td>
      <td class="right">${formatCurrency(total)}</td>
    </tr>
  </table>

  <div class="barcode">
    <div>*${saleId.toString().padStart(8, '0')}*</div>
    <div>${saleId.toString().padStart(8, '0')}</div>
  </div>

  <div class="divider"></div>

  <div class="policy">
    سياسة الاسترجاع: يمكن استرجاع المنتجات خلال 30 ساعة من تاريخ الشراء
    مع الاحتفاظ بالفاتورة الأصلية. المنتجات المفتوحة لا يمكن استرجاعها.
  </div>

  <div class="center bold" style="margin-top: 5mm;">
    شكراً لتسوقكم معنا
  </div>
  <div class="center" style="margin-top: 2mm;">
    نسعد بخدمتكم دائماً
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

// A4 purchase order printing
ipcMain.handle('print:purchase-order', async (event, orderData) => {
  try {
    const { orderId, date, supplier, items, total, notes } = orderData;

    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('ar-SD', {
        style: 'currency',
        currency: 'SDG',
        minimumFractionDigits: 0
      }).format(amount);
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
      font-family: 'Arial', sans-serif;
      font-size: 12px;
      line-height: 1.6;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #fbbf24;
      padding-bottom: 10mm;
      margin-bottom: 10mm;
    }
    .logo { font-size: 32px; font-weight: bold; color: #fbbf24; }
    .company-info { text-align: left; }
    .title {
      text-align: center;
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 10mm;
    }
    table { width: 100%; border-collapse: collapse; margin: 5mm 0; }
    th, td { padding: 3mm; text-align: right; border: 1px solid #ddd; }
    th { background: #f5f5f5; font-weight: bold; }
    .total-row { font-weight: bold; background: #fff9e6; }
    .footer {
      margin-top: 15mm;
      padding-top: 5mm;
      border-top: 1px solid #ddd;
      text-align: center;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">الدفة للعطور</div>
      <div>Aldaffa Perfumes</div>
    </div>
    <div class="company-info">
      <div>الخرطوم، السودان</div>
      <div>📱 0123456789</div>
      <div>📧 info@aldaffa.sd</div>
    </div>
  </div>

  <div class="title">طلب شراء - Purchase Order</div>

  <table style="width: 60%; margin-bottom: 10mm;">
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
  <div style="margin-top: 10mm;">
    <div style="font-weight: bold; margin-bottom: 2mm;">ملاحظات:</div>
    <div style="border: 1px solid #ddd; padding: 3mm; background: #f9f9f9;">
      ${notes}
    </div>
  </div>
  ` : ''}

  <div style="margin-top: 15mm; display: flex; justify-content: space-between;">
    <div style="text-align: center; width: 40%;">
      <div style="border-top: 1px solid #000; padding-top: 2mm; margin-top: 15mm;">توقيع المورد</div>
    </div>
    <div style="text-align: center; width: 40%;">
      <div style="border-top: 1px solid #000; padding-top: 2mm; margin-top: 15mm;">توقيع المسؤول</div>
    </div>
  </div>

  <div class="footer">
    <div>الدفة للعطور - Aldaffa Perfumes</div>
    <div>شكراً لتعاونكم</div>
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

// Shift report printing
ipcMain.handle('print:shift-report', async (event, reportData) => {
  try {
    const { period, sales, profit, expenses, capital, cash } = reportData;

    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('ar-SD', {
        style: 'currency',
        currency: 'SDG',
        minimumFractionDigits: 0
      }).format(amount);
    };

    const reportHtml = `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Arial', sans-serif;
      font-size: 12px;
      line-height: 1.6;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #fbbf24;
      padding-bottom: 10mm;
      margin-bottom: 10mm;
    }
    .logo { font-size: 32px; font-weight: bold; color: #fbbf24; margin-bottom: 5mm; }
    .title { font-size: 24px; font-weight: bold; margin-bottom: 5mm; }
    table { width: 100%; border-collapse: collapse; margin: 5mm 0; }
    th, td { padding: 3mm; text-align: right; border: 1px solid #ddd; }
    th { background: #f5f5f5; font-weight: bold; }
    .section { margin: 8mm 0; }
    .section-title { font-size: 16px; font-weight: bold; margin-bottom: 3mm; background: #f0f0f0; padding: 2mm; }
    .total-row { font-weight: bold; background: #fff9e6; }
    .highlight { background: #fffacd; }
    .variance-positive { color: #0a0; font-weight: bold; }
    .variance-negative { color: #c00; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">الدفة للعطور</div>
    <div class="title">تقرير إغلاق الوردية</div>
    <div>من ${new Date(period.start).toLocaleDateString('ar-SD')} إلى ${new Date(period.end).toLocaleDateString('ar-SD')}</div>
  </div>

  <div class="section">
    <div class="section-title">ملخص المبيعات</div>
    <table>
      <tr>
        <td style="width: 60%;">عدد الفواتير</td>
        <td style="font-weight: bold;">${sales.count}</td>
      </tr>
      <tr class="highlight">
        <td>إجمالي المبيعات</td>
        <td style="font-weight: bold; color: #0a0;">${formatCurrency(sales.total)}</td>
      </tr>
      <tr>
        <td style="padding-right: 10mm;">نقدي</td>
        <td>${formatCurrency(sales.cash)}</td>
      </tr>
      <tr>
        <td style="padding-right: 10mm;">بطاقة</td>
        <td>${formatCurrency(sales.card)}</td>
      </tr>
      <tr>
        <td style="padding-right: 10mm;">تحويل بنكي</td>
        <td>${formatCurrency(sales.transfer)}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">الربحية</div>
    <table>
      <tr class="total-row">
        <td style="width: 60%; font-size: 14px;">صافي الربح</td>
        <td style="font-size: 14px; color: #0a0;">${formatCurrency(profit)}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">المصروفات</div>
    <table>
      <tr>
        <td style="width: 60%;">المشتريات</td>
        <td style="color: #c00;">${formatCurrency(expenses.purchases)}</td>
      </tr>
      <tr>
        <td>السحوبات النقدية</td>
        <td style="color: #c00;">${formatCurrency(expenses.withdrawals)}</td>
      </tr>
      <tr>
        <td>الخسائر والتالف</td>
        <td style="color: #c00;">${formatCurrency(expenses.losses)}</td>
      </tr>
      <tr>
        <td>الهدايا والعينات</td>
        <td style="color: #c00;">${formatCurrency(expenses.gifts)}</td>
      </tr>
      <tr class="total-row">
        <td>إجمالي المصروفات</td>
        <td style="color: #c00;">${formatCurrency(expenses.purchases + expenses.withdrawals + expenses.losses + expenses.gifts)}</td>
      </tr>
    </table>
  </div>

  ${capital > 0 ? `
  <div class="section">
    <div class="section-title">الضخ الرأسمالي</div>
    <table>
      <tr class="highlight">
        <td style="width: 60%;">إجمالي الضخ</td>
        <td style="font-weight: bold; color: #00a;">${formatCurrency(capital)}</td>
      </tr>
    </table>
  </div>
  ` : ''}

  <div class="section">
    <div class="section-title">تسوية النقد</div>
    <table>
      <tr>
        <td style="width: 60%;">النقد المتوقع في الدرج</td>
        <td style="font-weight: bold;">${formatCurrency(cash.expected)}</td>
      </tr>
      <tr>
        <td>النقد الفعلي (العد اليدوي)</td>
        <td style="font-weight: bold;">${formatCurrency(cash.actual)}</td>
      </tr>
      <tr class="total-row ${cash.variance >= 0 ? 'variance-positive' : 'variance-negative'}">
        <td style="font-size: 14px;">الفرق (${cash.variance >= 0 ? 'فائض' : 'عجز'})</td>
        <td style="font-size: 14px;">${cash.variance >= 0 ? '+' : ''}${formatCurrency(cash.variance)}</td>
      </tr>
    </table>
  </div>

  <div style="margin-top: 20mm; display: flex; justify-content: space-between;">
    <div style="text-align: center; width: 45%;">
      <div style="border-top: 2px solid #000; padding-top: 3mm; margin-top: 15mm;">توقيع المدير</div>
    </div>
    <div style="text-align: center; width: 45%;">
      <div style="border-top: 2px solid #000; padding-top: 3mm; margin-top: 15mm;">توقيع المحاسب</div>
    </div>
  </div>

  <div style="text-align: center; margin-top: 15mm; font-size: 10px; color: #666;">
    <div>الدفة للعطور - Aldaffa Perfumes</div>
    <div>تم الطباعة: ${new Date().toLocaleString('ar-SD')}</div>
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
        console.error('Print failed:', errorType);
      }
      printWindow.close();
    });

    return { success: true };
  } catch (error) {
    console.error('Print shift report error:', error);
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
      <td class="right">24,000 ج.س</td>
    </tr>
    <tr>
      <td class="bold">الخصم (10%):</td>
      <td class="right">-2,400 ج.س</td>
    </tr>
    <tr class="total-row">
      <td>الإجمالي النهائي:</td>
      <td class="right">21,600 ج.س</td>
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
      address = 'الخرطوم، السودان',
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
      <div>📅 تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SD')}</div>
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
        <td>18,000 ج.س</td>
        <td>54,000 ج.س</td>
      </tr>
      <tr>
        <td>2</td>
        <td>زيت الصندل الصافي - 20 مل</td>
        <td>5 حبات</td>
        <td>6,000 ج.س</td>
        <td>30,000 ج.س</td>
      </tr>
      <tr>
        <td>3</td>
        <td>خلطة الدفة الخاصة الملكية - 100 مل</td>
        <td>2 حبة</td>
        <td>32,000 ج.س</td>
        <td>64,000 ج.س</td>
      </tr>
      <tr class="total-row">
        <td colspan="4" style="text-align: left;">المجموع الكلي:</td>
        <td>148,000 ج.س</td>
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
  if (process.platform !== 'darwin') {
    if (db) {
      db.close();
    }
    app.quit();
  }
});

app.on('before-quit', () => {
  if (db) {
    db.close();
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
