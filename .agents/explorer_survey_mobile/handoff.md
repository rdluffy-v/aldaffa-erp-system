# Mobile Client UI & Scanner Exploration Report
**Project**: Aldaffa Perfumes ERP (الدفة للعطور) — Mobile Companion Application & Cloud Sync Architecture  
**Author**: Explorer 3 (Mobile Client UI & Scanner Explorer)  
**Date**: 2026-08-30  
**Working Directory**: `/home/rdluffy/Desktop/aldaffa-app-desktop/.agents/explorer_survey_mobile`

---

## 1. Observation

### 1.1 Existing Architecture & File Footprint
An initial mobile prototype and bridge server exist in the project:
1. **`server/mobileBridgeServer.cjs`** (413 lines):
   - Starts an HTTP listener on port `4848` binding to `0.0.0.0`.
   - Serves static assets from `public/mobile/` under `/mobile/`.
   - Generates and verifies pairing tokens (`crypto.randomBytes(16).toString('hex')`).
   - Exposes REST endpoints:
     - `/api/pairing/verify`
     - `/api/auth/pin`
     - `/api/products`
     - `/api/dashboard/stats`
     - `/api/pos/checkout`
     - `/api/inventory/adjust`
2. **`public/mobile/index.html`** (274 lines), **`public/mobile/app.js`** (499 lines), **`public/mobile/style.css`** (104 lines), **`public/mobile/manifest.json`** (22 lines):
   - Vanilla JS / Tailwind CDN mobile web app.
   - Basic 4-tab bottom navigation: POS, Stocktaking, Dashboard, Settings.
   - Camera video stream via `navigator.mediaDevices.getUserMedia` with experimental `BarcodeDetector` support.
   - Web Audio synthesizer `playBeep(freq, duration)` and haptic feedback `navigator.vibrate(50)`.
3. **`main.cjs`** (lines 13, 2925–2975):
   - Automatically initializes `startMobileBridgeServer(db, 4848)` on Electron app startup.
   - Provides IPC channels `mobile:get-info`, `mobile:restart-server`, and `mobile:regenerate-token`.

### 1.2 Critical Architectural & Schema Inconsistencies Discovered
During analysis of `server/mobileBridgeServer.cjs` against `main.cjs` and SQLite repositories (`src/database/repositories/SalesRepository.js`, `InventoryRepository.js`), several severe schema mismatches were discovered:
- **Products vs Inventory**: `mobileBridgeServer.cjs` queries `FROM products WHERE is_active = 1` using column names `stock_quantity`, `cost_price`, `category_id`. However, the canonical SQLite table defined in `main.cjs` (lines 34–51) is `inventory` with columns `qty`, `cost`, `price`, `category`, `barcode`, `min_qty`, and `is_demo`.
- **Sales Schema Inconsistency**: `mobileBridgeServer.cjs` inserts into `sales` using `invoice_number`, `total_amount`, `total_cost`, `payment_type` instead of canonical columns `date`, `subtotal`, `discount`, `total`, `profit`, `payment_method`, `sale_pricing_mode`, `debtor_id`, `customer_name`.
- **Sale Items Schema Inconsistency**: `mobileBridgeServer.cjs` inserts into `sale_items` using `quantity`, `unit_price`, `total_price` instead of canonical columns `cart_qty`, `unit`, `final_price`, `unit_cost`, `portion_ml`.
- **Users Table Inconsistency**: `mobileBridgeServer.cjs` queries `pin_code`, `username`, `full_name`, `is_active` instead of canonical `users` table columns `id`, `name`, `pin`, `role`, `created_at`.
- **Missing Offline Queue & Sync Pipeline**: The mobile web client currently sends immediate `fetch()` calls. If Wi-Fi/cellular drops in the warehouse or stockroom, transactions fail immediately with unhandled errors.

---

## 2. Logic Chain

### 2.1 Mobile Client Architecture: PWA + Offline Queue + Hybrid Cloudflare Sync
To achieve bulletproof reliability in retail perfume environments, the mobile client must operate seamlessly both on local store Wi-Fi and remotely via Cloudflare Hybrid Sync.

```
+-------------------------------------------------------------------------------+
|                        ALDAFFA MOBILE COMPANION APP                           |
|                    (React 19 / PWA / Service Worker)                          |
+-------------------------------------------------------------------------------+
       |                                                    |
 [Local LAN Mode]                                    [Remote Cloud Mode]
 Direct HTTP/WS                                      Encrypted HTTPS / WSS
 (e.g. http://192.168.1.50:4848)                     (Cloudflare Workers Edge)
       |                                                    |
       v                                                    v
+-----------------------------+                     +---------------------------+
| Desktop Bridge HTTP Server  |                     | Cloudflare Worker & D1    |
| (mobileBridgeServer.cjs)    |<===================>| Sync Channel              |
+-----------------------------+   Cloudflare Tunnel +---------------------------+
       |                           (cloudflared)
       v
+-----------------------------+
| Desktop SQLite (WAL Mode)   |
| aldaffa_erp.db              |
+-----------------------------+
```

1. **Service Worker (`sw.js`) Strategy**:
   - **Static Shell**: Pre-cache all CSS, JS bundles, icons, and Arabic web fonts (`Tajawal`, `Cairo`) with a **Cache-First** strategy for zero-latency startup.
   - **Dynamic Data**: **Network-First with IndexedDB Fallback**. When connected, read fresh products and dashboard KPIs; when disconnected, serve the local snapshot from IndexedDB.
2. **Offline Outbox Queue (`IndexedDB`)**:
   - When a sale is completed or a stock adjustment is submitted offline, generate a client-side UUID (`INV-OFF-${Date.now()}-${uuid}`) and push the mutation into the `outbox_sales` or `outbox_audits` store.
   - Listen to `window.addEventListener('online', ...)` and `navigator.serviceWorker.ready.then(reg => reg.sync.register('sync-sales'))` to automatically flush the queue upon reconnect.
   - Show a persistent indicator: `🟢 متصل بالمحل (Live)` vs `🟡 وضع عدم الاتصال (3 عمليات معلقة للمزامنة)`.

### 2.2 Ultra-Fast Camera Barcode Scanner (<300ms)
Aldaffa Perfumes uses two standard barcode symbologies:
- **EAN-13**: Standard international barcodes on commercial branded perfume bottles.
- **Code-128**: High-density 1D barcodes generated by Aldaffa Barcode Studio for custom perfume mix batches, decants, and laboratory formulas.

#### Performance Optimization Engine:
```
Camera Feed (1080p/720p @ 60fps)
              │
              ▼
 ┌───────────────────────────┐
 │ Hardware BarcodeDetector? │───► Yes ───► Native Browser GPU Engine (<80ms)
 └───────────────────────────┘
              │ No
              ▼
 ┌───────────────────────────┐
 │ WebAssembly / ZXing-C++   │────────────► Dedicated Web Worker (<220ms)
 └───────────────────────────┘
              │
              ▼
       Barcode Decoded
              │
              ├─► Web Audio API: 1800Hz Sine Tone (80ms)
              ├─► Haptics: navigator.vibrate(50)
              └─► Instant Lookup in IndexedDB / Memory Cache
```

- **Zero Allocation Scan Loop**: Reuse image buffers and bounding boxes without triggering JavaScript garbage collection spikes.
- **Temporal Debounce Filter**: Cache the last scanned barcode for 1200ms to avoid firing repeated triggers for the same bottle while allowing instant scanning of the next item.
- **Hardware Flashlight (Torch)**: Control device LED via `MediaStreamTrack.applyConstraints({ advanced: [{ torch: true }] })` for dimly lit perfume display cabinets.

### 2.3 Mobile POS Quick Checkout UI
- **Thumb-Zone UX**: Critical controls (search, category tabs, cart trigger, checkout button) reside within bottom 60% of the screen.
- **Dynamic Portion Decants**: Support selling custom milliliter fractions of perfume oils (e.g. 10ml, 25ml, 50ml, 100ml) with proportional pricing calculations:
  $$\text{Portion Price} = \text{Base Price} \times \frac{\text{Portion ML}}{\text{Bottle Capacity}}$$
- **Payment Method Split**:
  - `نقداً (Cash)`: Quick cash buttons (50, 100, 200 د.ل) with instant change calculation.
  - `بطاقة / شبكة (Card)`: Fast POS machine payment confirmation.
  - `آجل (Debt)`: Searchable debtor list with one-tap new customer registration.
- **Atomic SQLite Transaction**: Executed inside `db.transaction()` on the desktop to prevent lock collisions with active desktop cashiers.

### 2.4 Mobile Stocktaking & Inventory Audit
- **Continuous Live Viewfinder**: Camera remains active without closing the viewfinder between items.
- **Live Discrepancy Calculation**:
  $$\text{Discrepancy} = \text{Actual Counted Qty} - \text{System Expected Qty}$$
- **Discrepancy Reason Presets**:
  1. `عجز جرد مخزني (Inventory Shortage)`
  2. `كسر / تلف أثناء العرض (Breakage / Display Damage)`
  3. `عينة تجربة وتستر (Tester / Sample Used)`
  4. `خطأ تسجيل سابق (Previous Data Entry Error)`
  5. `زيادة غير مسجلة (Unrecorded Surplus)`
- **Automated Logging**: Shortages automatically log an entry in the `losses` table and update `inventory.qty`.

### 2.5 Real-Time Executive Mobile Dashboard & RBAC Data Masking
- **Executive KPIs**:
  1. $\text{Today's Sales Revenue} = \sum \text{total}$ for today's sales.
  2. $\text{Gross Profit} = \sum (\text{final\_price} - \text{unit\_cost}) - \text{discounts}$.
  3. $\text{Actual Cash Drawer} = \text{Cash Sales} - \text{Cash Returns} - \text{Cash Withdrawals}$.
  4. $\text{Invoices Count} = \text{Count of sales today}$.
- **Hourly Revenue Velocity**: Responsive SVG sparkline visualizing 24-hour revenue flow to detect peak afternoon and evening shopping hours.
- **Granular RBAC Data Masking**:
  - **Manager (المدير العام)**: Complete visibility into profit, margins, unit costs, and inventory values.
  - **Accountant (المحاسب)**: Full visibility into sales revenue, drawer balance, and expenses; product cost editing hidden.
  - **Cashier (الكاشير)**: Sensitive profit figures, total store profits, and unit costs are replaced with masked asterisks (`*** د.ل`) or hidden entirely.

### 2.6 Luxury Arabic RTL Visual Design System
- **Palette**:
  - Canvas: Nocturne Obsidian `#070B14`, Charcoal `#0D1322`, Slate `#141B2D`.
  - Accents: Warm Amber Gold `#FBBF24` (`#C79549`), Emerald Sage `#34D399` (`#8BA892`), Crimson Rose `#FB7185`.
- **Materiality**: Frosted glass cards with `backdrop-filter: blur(16px)`, 1px border highlights (`rgba(255,255,255,0.08)` and `rgba(245, 158, 11, 0.25)`).
- **Typography**: High-legibility Arabic typography (`Tajawal`, `Cairo`) with explicit `line-height: 1.5`, RTL directionality, and descender clearance on numbers and currencies (`د.ل`).

---

## 3. Caveats & Assumptions

1. **Camera Permissions over HTTP vs HTTPS**:
   - Modern mobile browsers (especially iOS Safari) strictly require **HTTPS** (or `localhost`) to grant `getUserMedia` camera permissions.
   - When connecting over local LAN IP (e.g. `http://192.168.1.50:4848`), iOS may block camera access unless paired via Cloudflare Tunnel HTTPS (`https://mobile.aldaffa.com`) or a self-signed certificate. Cloudflare Hybrid Sync solves this cleanly.
2. **Background Sync on iOS WebKit**:
   - iOS Safari limits Service Worker background sync when the screen is locked or the browser is minimized. The offline queue sync agent must also execute immediately on app `visibilitychange` (when reopened) and before every checkout attempt.
3. **Database Concurrency**:
   - With multiple mobile devices and desktop POS writing simultaneously, SQLite WAL mode (`PRAGMA journal_mode = WAL`) handles concurrent reads and serializes writes via `better-sqlite3` atomic transactions. All writes must remain synchronous and wrapped in `db.transaction()` blocks.

---

## 4. Conclusion & Recommended Implementation Blueprint

### 4.1 Reconciled SQLite Bridge API Specification
Replace the mismatched queries in `server/mobileBridgeServer.cjs` with the exact schema matching `main.cjs`:

```javascript
// Canonical Products Catalog
const products = db.prepare(`
  SELECT id, barcode, name, category, price, cost, wholesale_price, qty, min_qty, unit, capacity, image_url
  FROM inventory
  ORDER BY name ASC
`).all();

// Canonical POS Checkout Mutation
const checkoutTx = db.transaction((salePayload) => {
  const { date, items, subtotal, discount, discount_type, total, profit, payment_method, customer_name, debtor_id, phone, notes } = salePayload;
  
  const saleRes = db.prepare(`
    INSERT INTO sales (date, subtotal, discount, discount_type, total, profit, payment_method, customer_name, debtor_id, phone, notes, type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'mobile')
  `).run(date || new Date().toISOString(), subtotal, discount, discount_type || 'percentage', total, profit, payment_method || 'cash', customer_name || 'زبون نقدي', debtor_id || null, phone || null, notes || 'تطبيق الجوال');
  
  const saleId = saleRes.lastInsertRowid;
  
  for (const item of items) {
    db.prepare(`
      INSERT INTO sale_items (sale_id, product_id, name, cart_qty, unit, final_price, unit_cost, portion_ml)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(saleId, String(item.product_id), item.name, item.cart_qty, item.unit || 'قطعة', item.final_price, item.unit_cost || 0, item.portion_ml || null);
    
    // Deduct Stock
    const qtyToDeduct = item.portion_ml ? (item.cart_qty * item.portion_ml / (item.capacity || 1)) : item.cart_qty;
    db.prepare(`UPDATE inventory SET qty = qty - ? WHERE id = ?`).run(qtyToDeduct, item.product_id);
  }
  
  if (payment_method === 'debt' && debtor_id) {
    db.prepare(`UPDATE debtors SET total_debt = total_debt + ? WHERE id = ?`).run(total, debtor_id);
    db.prepare(`INSERT INTO debt_history (id, debtor_id, date, type, amount, invoice_id) VALUES (?, ?, ?, 'debt', ?, ?)`).run(`DH-${Date.now()}`, debtor_id, date, total, saleId);
  }
  
  return { saleId, total };
});
```

### 4.2 High-Performance Multi-Tier Scanner Engine Skeleton
```javascript
export class BarcodeScannerEngine {
  constructor(videoElement, onDetected) {
    this.video = videoElement;
    this.onDetected = onDetected;
    this.isScanning = false;
    this.lastScannedCode = null;
    this.lastScannedTime = 0;
    this.detector = null;
    this.initDetector();
  }

  async initDetector() {
    if ('BarcodeDetector' in window) {
      try {
        const supported = await BarcodeDetector.getSupportedFormats();
        if (supported.includes('code_128') && supported.includes('ean_13')) {
          this.detector = new BarcodeDetector({ formats: ['code_128', 'ean_13', 'ean_8', 'qr_code'] });
        }
      } catch (e) {
        this.detector = null;
      }
    }
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    this.video.srcObject = stream;
    await this.video.play();
    this.isScanning = true;
    this.loop();
  }

  async loop() {
    if (!this.isScanning) return;
    const now = Date.now();
    try {
      if (this.detector) {
        const barcodes = await this.detector.detect(this.video);
        if (barcodes.length > 0) {
          const code = barcodes[0].rawValue;
          if (code !== this.lastScannedCode || now - this.lastScannedTime > 1200) {
            this.lastScannedCode = code;
            this.lastScannedTime = now;
            this.onDetected(code);
          }
        }
      }
    } catch (e) {}
    if (this.isScanning) {
      requestAnimationFrame(() => this.loop());
    }
  }

  stop() {
    this.isScanning = false;
    if (this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(t => t.stop());
      this.video.srcObject = null;
    }
  }
}
```

### 4.3 PWA Offline Transaction Queue Schema (`IndexedDB`)
- **Database**: `aldaffa_mobile_db` (v1)
- **Stores**:
  - `products_cache` (key: `id`, index: `barcode`)
  - `categories_cache` (key: `id`)
  - `outbox_sales` (key: `client_uuid`, index: `created_at`, `status`)
  - `outbox_audits` (key: `client_uuid`, index: `created_at`, `status`)
  - `session_auth` (key: `key`)

---

## 5. Verification Method

### 5.1 Automated Test Execution
Run the automated test runner to ensure database and transaction stability:
```bash
npm test
```

### 5.2 Independent Verification Steps
1. **Desktop Server Verification**:
   - Start Electron desktop app: `npm run dev` & `npm run electron:dev`.
   - Verify server log output: `[MobileBridgeServer] Live on http://<local_ip>:4848/mobile`.
2. **API Contract Verification**:
   - Send test product fetch: `curl -H "X-Pairing-Token: <token>" http://localhost:4848/api/products`.
   - Send test checkout request to `/api/pos/checkout` and confirm corresponding row insertion into `sales`, `sale_items`, and inventory deduction in SQLite.
3. **Scanner Performance Validation**:
   - Open `/mobile` in Chrome / Safari on a mobile device or responsive simulator.
   - Test EAN-13 and Code-128 barcodes; verify decode latency < 300ms, audio beep synthesizer triggering, and vibration firing.
4. **Offline Queue Validation**:
   - Enable Airplane Mode on the mobile client.
   - Create 2 POS sales; verify immediate UI confirmation and items added to IndexedDB outbox.
   - Reconnect Wi-Fi; verify automatic background flush and invoice appearance in desktop sales log.
5. **RBAC Data Masking Verification**:
   - Authenticate with Cashier PIN (`role: 'cashier'`); verify that profit metrics and store cost margins are completely masked with `*** د.ل`.
   - Authenticate with Manager PIN (`role: 'manager'`); verify full financial KPI visibility.
