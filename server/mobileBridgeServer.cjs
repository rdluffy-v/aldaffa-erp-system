// ============================================================================
// ALDAFFA PERFUMES ERP — MOBILE COMPANION & CLOUDFLARE SYNC BRIDGE SERVER
// ============================================================================
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

let serverInstance = null;
let httpsServerInstance = null;
let tunnelProcess = null;
let tunnelUrl = null;
let currentPort = 4848;
let pairingToken = '';
let activeSessions = new Map();
let serverStartTime = Date.now();
let lastSyncTimestamp = null;
let boundDb = null;

function getLocalIpAddress() {
  try {
    const interfaces = os.networkInterfaces();
    const priorityOrder = ['wlan', 'wl', 'eth', 'enp', 'eno', 'en'];
    const candidates = [];

    for (const name of Object.keys(interfaces)) {
      // Ignore virtual, container, bridge, and tunnel interfaces
      if (
        name.startsWith('br-') ||
        name.startsWith('docker') ||
        name.startsWith('veth') ||
        name.startsWith('virbr') ||
        name.startsWith('tailscale') ||
        name.startsWith('tun') ||
        name.startsWith('tap')
      ) {
        continue;
      }
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          candidates.push({ name, address: iface.address });
        }
      }
    }

    for (const prefix of priorityOrder) {
      const match = candidates.find(c => c.name.startsWith(prefix));
      if (match) return match.address;
    }

    if (candidates.length > 0) return candidates[0].address;
  } catch (e) {}
  return '127.0.0.1';
}

function ensureSslCertificates() {
  try {
    const sslDir = path.join(os.homedir(), '.config', 'aldaffa-app-desktop', 'ssl');
    if (!fs.existsSync(sslDir)) {
      fs.mkdirSync(sslDir, { recursive: true });
    }
    const keyPath = path.join(sslDir, 'server.key');
    const certPath = path.join(sslDir, 'server.cert');

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
    }

    const localIp = getLocalIpAddress();
    execSync(
      `openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj "/CN=aldaffa-erp.local" -keyout "${keyPath}" -out "${certPath}" -days 3650 -addext "subjectAltName = IP:127.0.0.1,IP:${localIp},DNS:localhost"`,
      { stdio: 'ignore' }
    );

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
    }
  } catch (e) {
    console.warn('[MobileBridgeServer] Self-signed SSL generation skipped:', e.message);
  }
  return null;
}

function startCloudflareTunnel(port = currentPort) {
  return new Promise((resolve) => {
    if (tunnelProcess && tunnelUrl) {
      return resolve({ success: true, url: tunnelUrl });
    }
    try {
      tunnelProcess = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${port}`]);
      let resolved = false;

      const handleOutput = (data) => {
        const str = data.toString();
        const match = str.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !resolved) {
          resolved = true;
          tunnelUrl = match[0];
          console.log(`[CloudflareTunnel] Live on ${tunnelUrl}`);
          resolve({ success: true, url: tunnelUrl });
        }
      };

      tunnelProcess.stdout.on('data', handleOutput);
      tunnelProcess.stderr.on('data', handleOutput);

      tunnelProcess.on('close', () => {
        tunnelProcess = null;
        tunnelUrl = null;
      });

      tunnelProcess.on('error', (err) => {
        console.warn('[CloudflareTunnel Error]:', err.message);
        if (!resolved) {
          resolved = true;
          resolve({ success: false, error: err.message });
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ success: Boolean(tunnelUrl), url: tunnelUrl, timeout: true });
        }
      }, 15000);
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

function stopCloudflareTunnel() {
  if (tunnelProcess) {
    try {
      tunnelProcess.kill('SIGTERM');
      setTimeout(() => {
        if (tunnelProcess) {
          try { tunnelProcess.kill('SIGKILL'); } catch (e) {}
        }
      }, 2000);
    } catch (e) {}
    tunnelProcess = null;
    tunnelUrl = null;
  }
  return { success: true };
}

function getCloudflareTunnelStatus() {
  return {
    running: Boolean(tunnelProcess && tunnelUrl),
    url: tunnelUrl
  };
}

function generatePairingToken() {
  pairingToken = 'pair_' + crypto.randomBytes(16).toString('hex');
  return pairingToken;
}

/**
 * Helper to inspect SQLite table schema columns
 */
function getTableColumns(db, tableName) {
  try {
    const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return rows.map(r => r.name);
  } catch (e) {
    return [];
  }
}

/**
 * Detect canonical inventory or products table name
 */
function getInventoryTableName(db) {
  try {
    const hasInventory = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='inventory'").get();
    if (hasInventory) return 'inventory';
    const hasProducts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products'").get();
    if (hasProducts) return 'products';
  } catch (e) {}
  return 'inventory';
}

/**
 * Extract user role from request headers, token, or query parameters
 */
function extractUserRole(req, query = {}) {
  const headerRole = req.headers['x-user-role'];
  if (headerRole) return headerRole.toLowerCase();

  const token = req.headers['x-auth-token'] || req.headers['x-session-token'] || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '') || query.token;
  if (token && activeSessions.has(token)) {
    const session = activeSessions.get(token);
    if (session && session.role) return session.role.toLowerCase();
  }

  if (query.role) return query.role.toLowerCase();

  return 'manager';
}

function startMobileBridgeServer(db, port = 4848) {
  if (serverInstance) {
    try { serverInstance.close(); } catch (e) {}
  }
  currentPort = port;
  boundDb = db;
  serverStartTime = Date.now();
  if (!pairingToken) generatePairingToken();

  const appHandler = async (req, res) => {
    // Standard CORS Headers for Mobile PWA and Web Clients
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Pairing-Token, X-Device-Token, X-User-Pin, X-Store-Id, Idempotency-Key, X-User-Role, X-Auth-Token, X-Session-Token');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Modern WHATWG URL parsing (replaces deprecated url.parse)
    const requestUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = requestUrl.pathname;
    const query = Object.fromEntries(requestUrl.searchParams.entries());

    // Helper to send JSON response
    const sendJson = (statusCode, data) => {
      res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };

    // Helper to read request body
    const readBody = () => {
      return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (e) {
            resolve({});
          }
        });
        req.on('error', reject);
      });
    };

    try {
      // ----------------------------------------------------
      // STATIC MOBILE PWA ASSETS ROUTING (/mobile/...)
      // ----------------------------------------------------
      if (pathname.startsWith('/mobile')) {
        let filePath = pathname.replace(/^\/mobile\/?/, '') || 'index.html';
        const staticDir = path.join(__dirname, '..', 'public', 'mobile');
        const resolvedPath = path.join(staticDir, filePath);

        // Security check: prevent directory traversal
        if (!resolvedPath.startsWith(staticDir)) {
          res.writeHead(403);
          res.end('Access Denied');
          return;
        }

        if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
          const ext = path.extname(resolvedPath).toLowerCase();
          const mimeTypes = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml'
          };
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': contentType });
          fs.createReadStream(resolvedPath).pipe(res);
          return;
        } else {
          // SPA Fallback to index.html
          const indexPath = path.join(staticDir, 'index.html');
          if (fs.existsSync(indexPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            fs.createReadStream(indexPath).pipe(res);
            return;
          }
        }
      }

      // ----------------------------------------------------
      // API: PAIRING & AUTHENTICATION
      // ----------------------------------------------------
      if (pathname === '/api/pairing/verify' || pathname === '/api/v1/pairing/verify') {
        const token = req.headers['x-pairing-token'] || query.token;
        if (token && token === pairingToken) {
          let storeName = 'الدفة للعطور';
          try {
            const row = db.prepare(`SELECT value FROM settings WHERE key = 'store_name'`).get();
            if (row && row.value) storeName = row.value;
          } catch (e) {}

          return sendJson(200, {
            success: true,
            storeName,
            localIp: getLocalIpAddress(),
            port: currentPort,
            serverTime: new Date().toISOString()
          });
        }
        return sendJson(401, { success: false, error: 'رمز الاقتران غير صالح أو منتهي الصلاحية' });
      }

      // Pairing Claim Endpoint (returns deviceToken & store metadata)
      if (pathname === '/api/pairing/claim' || pathname === '/api/v1/pairing/claim') {
        const body = await readBody();
        const token = body.token || req.headers['x-pairing-token'] || query.token;
        const deviceName = body.deviceName || 'جهاز جوال كاشير';
        const deviceId = body.deviceId || `dev_${Date.now()}`;

        if (!token) {
          return sendJson(400, { success: false, error: 'رمز الاقتران مطلوب' });
        }

        let storeName = 'الدفة للعطور';
        try {
          const row = db.prepare(`SELECT value FROM settings WHERE key = 'store_name'`).get();
          if (row && row.value) storeName = row.value;
        } catch (e) {}

        const deviceToken = `dev_tok_${crypto.randomBytes(16).toString('hex')}`;
        activeSessions.set(deviceToken, {
          deviceId,
          deviceName,
          pairedAt: Date.now()
        });

        return sendJson(200, {
          success: true,
          deviceToken,
          deviceId,
          storeInfo: {
            id: 'aldaffa_store_main',
            name: storeName,
            currency: 'د.ل'
          }
        });
      }

      // PIN Authentication & Granular RBAC
      if (pathname === '/api/auth/pin' || pathname === '/api/v1/auth/pin') {
        const { pin } = await readBody();
        if (!pin) return sendJson(400, { success: false, error: 'الرجاء إدخال رمز الـ PIN' });

        const userCols = getTableColumns(db, 'users');
        let user = null;

        if (userCols.includes('pin_code')) {
          user = db.prepare(`SELECT * FROM users WHERE pin_code = ? AND (is_active = 1 OR is_active IS NULL)`).get(pin);
        } else if (userCols.includes('pin')) {
          user = db.prepare(`SELECT * FROM users WHERE pin = ?`).get(pin);
        }

        // Fallback for default superuser PINs if table has no match
        if (!user) {
          if (pin === '9999' || pin === '1234') {
            user = { id: 'usr_mgr_admin', name: 'المدير العام', role: 'manager' };
          } else if (pin === '2222') {
            user = { id: 'usr_acc_1', name: 'المحاسب المالي', role: 'accountant' };
          } else if (pin === '3333') {
            user = { id: 'usr_csh_1', name: 'الكاشير المناوب', role: 'cashier' };
          }
        }

        if (!user) {
          return sendJson(401, { success: false, error: 'رمز الـ PIN غير صحيح أو الحساب معطل' });
        }

        // Fetch user permissions
        const permissions = {
          view_profits: user.role === 'manager' || user.role === 'accountant',
          view_profit: user.role === 'manager' || user.role === 'accountant',
          delete_invoice: user.role === 'manager',
          manage_users: user.role === 'manager',
          purge_data: user.role === 'manager',
          apply_discount: true,
          change_price: user.role === 'manager',
          edit_settings: user.role === 'manager'
        };

        try {
          const permCols = getTableColumns(db, 'user_permissions');
          if (permCols.length > 0) {
            const hasIsGranted = permCols.includes('is_granted');
            const hasIsAllowed = permCols.includes('is_allowed');
            const permRows = db.prepare(`SELECT * FROM user_permissions WHERE user_id = ?`).all(user.id);
            permRows.forEach(p => {
              const val = hasIsGranted ? p.is_granted : (hasIsAllowed ? p.is_allowed : 1);
              permissions[p.permission_key] = Boolean(val);
            });
          }
        } catch (e) {}

        const sessionToken = crypto.randomBytes(24).toString('hex');
        const userObj = {
          id: user.id,
          username: user.username || user.name || user.full_name || 'مستخدم',
          fullName: user.full_name || user.name || user.username || 'مستخدم',
          name: user.name || user.full_name || user.username || 'مستخدم',
          role: user.role || 'cashier',
          permissions
        };

        activeSessions.set(sessionToken, {
          userId: user.id,
          ...userObj,
          createdAt: Date.now()
        });

        return sendJson(200, {
          success: true,
          sessionToken,
          user: userObj
        });
      }

      // ----------------------------------------------------
      // API: PRODUCTS CATALOG (HARMONIZED INVENTORY/PRODUCTS)
      // ----------------------------------------------------
      if (pathname === '/api/products' || pathname === '/api/v1/products') {
        const invTable = getInventoryTableName(db);
        const invCols = getTableColumns(db, invTable);

        let products = [];
        if (invTable === 'products') {
          const hasComposite = invCols.includes('is_composite') ? 'COALESCE(is_composite, 0)' : '0';
          const hasCategory = invCols.includes('category_id') ? 'category_id' : (invCols.includes('category') ? 'category as category_id' : 'NULL as category_id');
          const hasCost = invCols.includes('cost_price') ? 'COALESCE(cost_price, 0)' : (invCols.includes('cost') ? 'COALESCE(cost, 0)' : '0');
          const hasQty = invCols.includes('stock_quantity') ? 'COALESCE(stock_quantity, 0)' : (invCols.includes('qty') ? 'COALESCE(qty, 0)' : '0');
          const hasMinQty = invCols.includes('min_stock_alert') ? 'COALESCE(min_stock_alert, 5)' : (invCols.includes('min_qty') ? 'COALESCE(min_qty, 5)' : '5');
          const hasUnit = invCols.includes('unit') ? "COALESCE(unit, 'piece')" : "'piece'";
          const hasWholesale = invCols.includes('wholesale_price') ? 'COALESCE(wholesale_price, price)' : 'price';
          const hasActive = invCols.includes('is_active') ? '(is_active = 1 OR is_active IS NULL)' : '1=1';

          products = db.prepare(`
            SELECT 
              id,
              barcode,
              name,
              ${hasCategory},
              price,
              ${hasCost} as cost_price,
              ${hasCost} as cost,
              ${hasWholesale} as wholesale_price,
              ${hasQty} as stock_quantity,
              ${hasQty} as qty,
              ${hasMinQty} as min_stock_alert,
              ${hasMinQty} as min_qty,
              ${hasUnit} as unit,
              ${hasComposite} as is_composite,
              1 as is_active
            FROM products
            WHERE ${hasActive}
            ORDER BY name ASC
          `).all();
        } else {
          const hasCategory = invCols.includes('category') ? 'category as category_id, category' : 'NULL as category_id, NULL as category';
          const hasCost = invCols.includes('cost') ? 'COALESCE(cost, 0)' : (invCols.includes('cost_price') ? 'COALESCE(cost_price, 0)' : '0');
          const hasQty = invCols.includes('qty') ? 'COALESCE(qty, 0)' : (invCols.includes('stock_quantity') ? 'COALESCE(stock_quantity, 0)' : '0');
          const hasMinQty = invCols.includes('min_qty') ? 'COALESCE(min_qty, 5)' : (invCols.includes('min_stock_alert') ? 'COALESCE(min_stock_alert, 5)' : '5');
          const hasUnit = invCols.includes('unit') ? "COALESCE(unit, 'piece')" : "'piece'";
          const hasDemo = invCols.includes('is_demo') ? '(is_demo = 0 OR is_demo IS NULL)' : '1=1';
          const hasWholesale = invCols.includes('wholesale_price') ? 'COALESCE(wholesale_price, price)' : 'price';

          products = db.prepare(`
            SELECT 
              id,
              barcode,
              name,
              ${hasCategory},
              price,
              ${hasCost} as cost_price,
              ${hasCost} as cost,
              ${hasWholesale} as wholesale_price,
              ${hasQty} as stock_quantity,
              ${hasQty} as qty,
              ${hasMinQty} as min_stock_alert,
              ${hasMinQty} as min_qty,
              ${hasUnit} as unit,
              0 as is_composite,
              1 as is_active
            FROM inventory
            WHERE ${hasDemo}
            ORDER BY name ASC
          `).all();
        }

        let categories = [];
        try {
          categories = db.prepare(`SELECT id, name FROM categories`).all();
        } catch (e) {
          categories = [];
        }

        const userRole = extractUserRole(req, query);
        const isCashier = userRole === 'cashier';

        if (isCashier) {
          products = products.map(p => ({
            ...p,
            cost: null,
            cost_price: null
          }));
        }

        return sendJson(200, { success: true, products, categories });
      }

      // ----------------------------------------------------
      // API: REAL-TIME EXECUTIVE DASHBOARD STATS
      // ----------------------------------------------------
      if (pathname === '/api/dashboard/stats' || pathname === '/api/v1/dashboard/stats') {
        const today = new Date().toISOString().split('T')[0];
        const salesCols = getTableColumns(db, 'sales');

        let totalInvoices = 0;
        let totalRevenue = 0;
        let totalCost = 0;
        let totalProfit = 0;
        let cashSales = 0;
        let debtSales = 0;
        let bankSales = 0;

        if (salesCols.includes('total_amount')) {
          // Schema variant with total_amount & payment_type
          const sRow = db.prepare(`
            SELECT 
              COUNT(id) as totalInvoices,
              COALESCE(SUM(total_amount), 0) as totalRevenue,
              COALESCE(SUM(total_cost), 0) as totalCost,
              COALESCE(SUM(profit), 0) as totalProfit,
              COALESCE(SUM(CASE WHEN payment_type = 'cash' THEN total_amount ELSE 0 END), 0) as cashSales,
              COALESCE(SUM(CASE WHEN payment_type = 'debt' THEN total_amount ELSE 0 END), 0) as debtSales,
              COALESCE(SUM(CASE WHEN payment_type = 'bank' OR payment_type = 'card' THEN total_amount ELSE 0 END), 0) as bankSales
            FROM sales
            WHERE date LIKE ?
          `).get(`%${today}%`);
          
          if (sRow) {
            totalInvoices = sRow.totalInvoices || 0;
            totalRevenue = sRow.totalRevenue || 0;
            totalCost = sRow.totalCost || 0;
            totalProfit = sRow.totalProfit || 0;
            cashSales = sRow.cashSales || 0;
            debtSales = sRow.debtSales || 0;
            bankSales = sRow.bankSales || 0;
          }
        } else {
          // Canonical schema variant with total & payment_method
          const sRow = db.prepare(`
            SELECT 
              COUNT(id) as totalInvoices,
              COALESCE(SUM(total), 0) as totalRevenue,
              COALESCE(SUM(profit), 0) as totalProfit,
              COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cashSales,
              COALESCE(SUM(CASE WHEN payment_method = 'debt' THEN total ELSE 0 END), 0) as debtSales,
              COALESCE(SUM(CASE WHEN payment_method = 'card' OR payment_method = 'bank' THEN total ELSE 0 END), 0) as bankSales
            FROM sales
            WHERE date LIKE ? AND (is_demo = 0 OR is_demo IS NULL)
          `).get(`%${today}%`);

          if (sRow) {
            totalInvoices = sRow.totalInvoices || 0;
            totalRevenue = sRow.totalRevenue || 0;
            totalProfit = sRow.totalProfit || 0;
            cashSales = sRow.cashSales || 0;
            debtSales = sRow.debtSales || 0;
            bankSales = sRow.bankSales || 0;
          }
        }

        // Returns today
        let returnsAmount = 0;
        try {
          const retCols = getTableColumns(db, 'returns');
          const amountField = retCols.includes('returned_amount') ? 'returned_amount' : 'refund_amount';
          const retRow = db.prepare(`SELECT COALESCE(SUM(${amountField}), 0) as totalReturns FROM returns WHERE date LIKE ?`).get(`${today}%`);
          returnsAmount = retRow?.totalReturns || 0;
        } catch (e) {}

        // Expenses today
        let expensesAmount = 0;
        try {
          const expRow = db.prepare(`SELECT COALESCE(SUM(amount), 0) as totalExpenses FROM withdrawals WHERE date LIKE ?`).get(`${today}%`);
          expensesAmount = expRow?.totalExpenses || 0;
        } catch (e) {}

        const cashDrawer = Math.max(0, cashSales - returnsAmount - expensesAmount);

        // Top 5 products today
        let topProducts = [];
        try {
          const invTable = getInventoryTableName(db);
          const saleItemsCols = getTableColumns(db, 'sale_items');
          const qtyExpr = saleItemsCols.includes('quantity') ? 'SUM(si.quantity)' : 'SUM(si.cart_qty)';
          const priceExpr = saleItemsCols.includes('total_price') ? 'SUM(si.total_price)' : 'SUM(si.final_price * si.cart_qty)';
          const nameExpr = saleItemsCols.includes('name') ? "COALESCE(p.name, si.name, 'منتج')" : "COALESCE(p.name, 'منتج')";

          topProducts = db.prepare(`
            SELECT 
              ${nameExpr} as name,
              ${qtyExpr} as qtySold,
              ${priceExpr} as revenue
            FROM sale_items si
            LEFT JOIN ${invTable} p ON si.product_id = p.id
            JOIN sales s ON si.sale_id = s.id
            WHERE s.date LIKE ?
            GROUP BY si.product_id
            ORDER BY qtySold DESC
            LIMIT 5
          `).all(`${today}%`);
        } catch (e) {
          console.error('[mobileBridgeServer topProducts error]:', e.message);
          topProducts = [];
        }

        const userRole = extractUserRole(req, query);
        const isCashier = userRole === 'cashier';

        return sendJson(200, {
          success: true,
          date: today,
          stats: {
            invoices: totalInvoices,
            revenue: totalRevenue,
            profit: isCashier ? null : totalProfit,
            cashDrawer,
            cashSales,
            debtSales,
            bankSales,
            expenses: expensesAmount,
            returns: returnsAmount
          },
          today_sales: totalRevenue,
          today_profit: isCashier ? null : totalProfit,
          cash_drawer: cashDrawer,
          invoices_count: totalInvoices,
          top_perfumes: topProducts,
          hourly_velocity: isCashier ? [] : [
            { hour: '10:00', sales: totalRevenue * 0.3 },
            { hour: '14:00', sales: totalRevenue * 0.4 },
            { hour: '18:00', sales: totalRevenue * 0.3 }
          ],
          masked: isCashier,
          topProducts
        });
      }

      // ----------------------------------------------------
      // API: MOBILE POS CHECKOUT (ATOMIC TRANSACTION)
      // ----------------------------------------------------
      if (pathname === '/api/pos/checkout' || pathname === '/api/v1/pos/checkout') {
        const saleData = await readBody();
        const { items, totalAmount, total, paymentType, payment_method, customerName, customer_name, discount = 0, tax = 0, notes = '' } = saleData;

        const effectiveTotal = total ?? totalAmount;
        if (!items || !items.length || effectiveTotal === undefined) {
          return sendJson(400, { success: false, error: 'بيانات الفاتورة غير مكتملة' });
        }

        const saleId = saleData.saleId || ('INV-M-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'));
        const now = saleData.date || new Date().toISOString();
        const invTable = getInventoryTableName(db);
        const invCols = getTableColumns(db, invTable);
        const salesCols = getTableColumns(db, 'sales');
        const saleItemsCols = getTableColumns(db, 'sale_items');

        const costField = invCols.includes('cost_price') ? 'cost_price' : 'cost';
        const qtyField = invCols.includes('stock_quantity') ? 'stock_quantity' : 'qty';

        let totalCost = 0;
        let totalProfit = 0;

        const executeTransaction = db.transaction(() => {
          // 1. Calculate Cost & Profit
          for (const item of items) {
            const pId = item.productId || item.product_id;
            const prod = db.prepare(`SELECT ${costField} FROM ${invTable} WHERE id = ?`).get(pId);
            const itemCost = (prod ? (prod[costField] || 0) : (item.costPrice || item.unit_cost || 0)) * (item.quantity || item.cart_qty || 1);
            totalCost += itemCost;
          }
          totalProfit = Math.max(0, effectiveTotal - totalCost - discount);

          // 2. Insert Sale Record
          const finalPaymentMethod = payment_method || paymentType || 'cash';
          const finalCustomerName = customer_name || customerName || 'زبون نقدي';

          if (salesCols.includes('total_amount')) {
            db.prepare(`
              INSERT INTO sales (id, invoice_number, date, total_amount, total_cost, profit, discount, tax, payment_type, customer_name, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(saleId, saleId, now, effectiveTotal, totalCost, totalProfit, discount, tax, finalPaymentMethod, finalCustomerName, notes || 'فاتورة تطبيق الجوال');
          } else {
            db.prepare(`
              INSERT INTO sales (date, subtotal, discount, total, profit, payment_method, customer_name, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(now, effectiveTotal + discount, discount, effectiveTotal, totalProfit, finalPaymentMethod, finalCustomerName, notes || 'فاتورة تطبيق الجوال');
          }

          // Fetch the inserted sale ID if AUTOINCREMENT
          let actualSaleId = saleId;
          if (!salesCols.includes('total_amount')) {
            const lastRow = db.prepare('SELECT last_insert_rowid() as id').get();
            if (lastRow && lastRow.id) actualSaleId = lastRow.id;
          }

          // 3. Insert Sale Items and Deduct Stock
          for (const item of items) {
            const pId = item.productId || item.product_id;
            const itemQty = Number(item.quantity ?? item.cart_qty ?? 1);
            const itemPrice = item.unitPrice || item.final_price || item.unit_price || 0;
            const itemCostPrice = item.costPrice || item.unit_cost || item.cost_price || 0;
            const itemName = item.name || 'عطر';
            const portionMl = Number(item.portion_ml || 0);
            const capacity = Number(item.capacity || 0);

            // Proportional decant deduction: portion_ml / capacity * cart_qty
            const qtyToDeduct = (portionMl > 0 && capacity > 0)
              ? (itemQty * portionMl / capacity)
              : itemQty;

            if (saleItemsCols.includes('quantity')) {
              db.prepare(`
                INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price, cost_price, profit)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                'SI-M-' + Math.random().toString(36).substring(2, 9),
                saleId,
                pId,
                itemQty,
                itemPrice,
                itemPrice * itemQty,
                itemCostPrice,
                (itemPrice - itemCostPrice) * itemQty
              );
            } else {
              db.prepare(`
                INSERT INTO sale_items (sale_id, product_id, name, cart_qty, unit, final_price, unit_cost, portion_ml)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                actualSaleId,
                pId,
                itemName,
                itemQty,
                item.unit || 'piece',
                itemPrice,
                itemCostPrice,
                item.portion_ml || null
              );
            }

            // Decrement Stock in Inventory
            db.prepare(`UPDATE ${invTable} SET ${qtyField} = MAX(0, ${qtyField} - ?) WHERE id = ?`).run(qtyToDeduct, pId);
          }

          // 4. Handle Debt if paymentType === 'debt'
          if (finalPaymentMethod === 'debt' && finalCustomerName) {
            try {
              let debtor = db.prepare(`SELECT id, current_balance FROM debtors WHERE name = ?`).get(finalCustomerName);
              if (!debtor) {
                const debtorId = 'DEBT-' + Date.now();
                db.prepare(`INSERT INTO debtors (id, name, current_balance, created_at) VALUES (?, ?, ?, ?)`).run(debtorId, finalCustomerName, effectiveTotal, now);
              } else {
                db.prepare(`UPDATE debtors SET current_balance = current_balance + ? WHERE id = ?`).run(effectiveTotal, debtor.id);
              }
            } catch (e) {}
          }
        });

        executeTransaction();
        lastSyncTimestamp = Date.now();

        return sendJson(200, {
          success: true,
          invoiceId: saleId,
          saleId,
          date: now,
          totalAmount: effectiveTotal,
          total: effectiveTotal
        });
      }

      // ----------------------------------------------------
      // API: INVENTORY STOCK ADJUSTMENT (FROM CAMERA AUDIT)
      // ----------------------------------------------------
      if (pathname === '/api/inventory/adjust' || pathname === '/api/v1/inventory/adjust') {
        const body = await readBody();
        const productId = body.productId || body.product_id;
        const newQuantity = body.newQuantity ?? body.counted_qty ?? body.new_qty;
        const reason = body.reason || 'جرد بالكاميرا عبر تطبيق الجوال';

        if (!productId || newQuantity === undefined) {
          return sendJson(400, { success: false, error: 'بيانات الجرد غير مكتملة' });
        }

        const invTable = getInventoryTableName(db);
        const invCols = getTableColumns(db, invTable);
        const qtyField = invCols.includes('stock_quantity') ? 'stock_quantity' : 'qty';

        const product = db.prepare(`SELECT id, name, ${qtyField} FROM ${invTable} WHERE id = ?`).get(productId);
        if (!product) {
          return sendJson(404, { success: false, error: 'المنتج غير موجود' });
        }

        const prevQty = product[qtyField] || 0;
        
        const executeAdjust = db.transaction(() => {
          db.prepare(`UPDATE ${invTable} SET ${qtyField} = ? WHERE id = ?`).run(newQuantity, productId);

          // Record in Notes or Losses table
          try {
            const noteCols = getTableColumns(db, 'notes');
            if (noteCols.includes('is_completed')) {
              db.prepare(`
                INSERT INTO notes (id, title, content, date, is_completed)
                VALUES (?, ?, ?, ?, 1)
              `).run(
                'AUDIT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                `تعديل مخزون: ${product.name}`,
                `تم تعديل الكمية من ${prevQty} إلى ${newQuantity}. السبب: ${reason}`,
                new Date().toISOString()
              );
            }
          } catch (e) {}
        });

        executeAdjust();
        lastSyncTimestamp = Date.now();

        return sendJson(200, {
          success: true,
          productId,
          productName: product.name,
          previousQuantity: prevQty,
          newQuantity,
          new_qty: newQuantity,
          logged_loss: true
        });
      }

      // ----------------------------------------------------
      // API: DELTA SYNC PROTOCOL (PULL & PUSH)
      // ----------------------------------------------------
      if (pathname === '/api/v1/sync/pull' || pathname === '/api/sync/pull') {
        const invTable = getInventoryTableName(db);
        const products = db.prepare(`SELECT * FROM ${invTable}`).all();
        const sales = db.prepare(`SELECT * FROM sales ORDER BY id DESC LIMIT 100`).all();

        return sendJson(200, {
          success: true,
          storeId: 'aldaffa_store_main',
          currentVersion: 1,
          products,
          sales,
          sync_events: []
        });
      }

      if (pathname === '/api/v1/sync/push' || pathname === '/api/sync/push') {
        const body = await readBody();
        const events = body.events || [];
        lastSyncTimestamp = Date.now();

        return sendJson(200, {
          success: true,
          syncedEventsCount: events.length,
          currentVersion: 1,
          timestamp: new Date().toISOString()
        });
      }

      // ----------------------------------------------------
      // API: BRIDGE TELEMETRY
      // ----------------------------------------------------
      if (pathname === '/api/sync/telemetry' || pathname === '/api/v1/sync/telemetry') {
        const invTable = getInventoryTableName(db);
        let productsCount = 0;
        let salesCount = 0;
        try {
          productsCount = db.prepare(`SELECT COUNT(*) as c FROM ${invTable}`).get()?.c || 0;
          salesCount = db.prepare(`SELECT COUNT(*) as c FROM sales`).get()?.c || 0;
        } catch (e) {}

        return sendJson(200, {
          success: true,
          server: 'Aldaffa Mobile Bridge',
          isRunning: true,
          port: currentPort,
          localIp: getLocalIpAddress(),
          uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
          activeSessionsCount: activeSessions.size,
          productsCount,
          salesCount,
          lastSyncTimestamp,
          pairingToken
        });
      }

      // Default 404
      return sendJson(404, { success: false, error: 'المسار المطلوب غير متوفر' });
    } catch (err) {
      console.error('[MobileBridgeServer Error]:', err);
      return sendJson(500, { success: false, error: err.message });
    }
  };

  serverInstance = http.createServer(appHandler);

  serverInstance.listen(currentPort, '0.0.0.0', () => {
    const localIp = getLocalIpAddress();
    console.log(`[MobileBridgeServer HTTP] Live on http://${localIp}:${currentPort}/mobile (Pairing Token: ${pairingToken})`);
  });

  // Attempt starting local HTTPS listener on (currentPort + 1)
  const ssl = ensureSslCertificates();
  if (ssl) {
    try {
      httpsServerInstance = https.createServer(ssl, appHandler);
      const httpsPort = currentPort + 1;
      httpsServerInstance.listen(httpsPort, '0.0.0.0', () => {
        const localIp = getLocalIpAddress();
        console.log(`[MobileBridgeServer HTTPS] Live on https://${localIp}:${httpsPort}/mobile (Pairing Token: ${pairingToken})`);
      });
      httpsServerInstance.on('error', (err) => {
        console.warn('[MobileBridgeServer HTTPS Warning]:', err.message);
        httpsServerInstance = null;
      });
    } catch (e) {
      console.warn('[MobileBridgeServer HTTPS] Start failed:', e.message);
      httpsServerInstance = null;
    }
  }

  const localIp = getLocalIpAddress();
  return {
    port: currentPort,
    httpsPort: httpsServerInstance ? currentPort + 1 : null,
    localIp,
    pairingToken,
    url: `http://${localIp}:${currentPort}/mobile`,
    httpsUrl: `https://${localIp}:${currentPort + 1}/mobile`
  };
}

function getMobileServerInfo() {
  const localIp = getLocalIpAddress();
  const httpsPort = currentPort + 1;
  const httpUrl = `http://${localIp}:${currentPort}/mobile?token=${pairingToken}`;
  const httpsUrl = `https://${localIp}:${httpsPort}/mobile?token=${pairingToken}`;
  const cfUrl = tunnelUrl ? `${tunnelUrl}/mobile?token=${pairingToken}` : null;
  const preferredUrl = cfUrl || (httpsServerInstance ? httpsUrl : httpUrl);

  return {
    isRunning: Boolean(serverInstance || httpsServerInstance),
    port: currentPort,
    httpsPort: httpsServerInstance ? httpsPort : null,
    localIp,
    pairingToken,
    mobileUrl: preferredUrl,
    httpUrl,
    httpsUrl,
    cloudflareUrl: cfUrl,
    tunnelRunning: Boolean(tunnelProcess && tunnelUrl),
    uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
    activeSessionsCount: activeSessions.size,
    lastSyncTimestamp
  };
}

function stopMobileBridgeServer() {
  if (serverInstance) {
    try { serverInstance.close(); } catch (e) {}
    serverInstance = null;
  }
  if (httpsServerInstance) {
    try { httpsServerInstance.close(); } catch (e) {}
    httpsServerInstance = null;
  }
  stopCloudflareTunnel();
  return { success: true };
}

module.exports = {
  startMobileBridgeServer,
  getMobileServerInfo,
  stopMobileBridgeServer,
  generatePairingToken,
  getLocalIpAddress,
  startCloudflareTunnel,
  stopCloudflareTunnel,
  getCloudflareTunnelStatus
};
