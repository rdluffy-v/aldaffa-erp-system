---
name: desktop-erp-troubleshooting-patterns
description: >-
  Essential architectural guardrails, debugging patterns, and preventative rules for
  Electron, React, SQLite, and Desktop ERP applications across all projects.
  Use when diagnosing single-character focus loss, SQLite schema migrations,
  offline-first isolation, WAL checkpointing, receipt/thermal printing,
  multi-step wizards, date comparison bugs, cash drawer reconciliation, or IPC main process lifecycles.
---

# Desktop ERP Architecture & Troubleshooting Patterns

A master collection of root-cause analyses, robust solutions, and proactive guardrails for building resilient desktop applications (Electron + React + SQLite / Node.js).

---

## 1. React Focus Retention & Single-Character Input Loss

### Root Cause
Declaring helper subcomponents or input wrappers *inside* the parent component's render body (e.g., `const InputField = () => <input ... />` within `InventoryModule` or `PurchasesModule`).
Every time state changes, React re-evaluates the parent, generating a brand-new component type identity for `InputField`. React unmounts the old DOM node and mounts a new one, destroying DOM focus after a single keystroke.

### Prevention & Guardrail
1. **Hoist All Subcomponents**: Always declare subcomponents outside the parent file scope or in separate dedicated files.
2. **Stable Keys**: Never use array indices as React keys for lists where items are added, deleted, or reordered. Use persistent unique identifiers (`item.id`).
3. **Controlled Inputs**: Pass `value` and `onChange` directly, or use stable custom hooks with debouncing (`useDebounce`).

---

## 2. Safe & Idempotent SQLite Schema Migrations

### Root Cause
Running hardcoded `ALTER TABLE table_name ADD COLUMN column_name ...` statements at app startup or during test data seeding. If the column already exists, SQLite throws:
```text
SqliteError: duplicate column name: barcode
```
This halts application boot and causes crash loops.

### Prevention & Guardrail
1. **Idempotent Column Addition**: Query SQLite table metadata before running `ALTER TABLE`:
   ```javascript
   function ensureColumnExists(db, tableName, columnName, columnDefinition) {
     const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
     const exists = columns.some(c => c.name === columnName);
     if (!exists) {
       db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`).run();
     }
   }
   ```
2. **Safe Migration Wrapping**: Alternatively, wrap column additions in a scoped `try-catch`:
   ```javascript
   try {
     db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`).run();
   } catch (err) {
     if (!err.message.includes('duplicate column name')) {
       throw err;
     }
   }
   ```

---

## 3. SQLite ISO String Date Comparison Guardrails (Date Upper Bound Trap)

### Root Cause
In SQLite, dates are stored as ISO 8601 strings (`TEXT`, e.g., `'2026-08-22T06:28:09.000Z'`).
Using `new Date(8640000000000000).toISOString()` to create an "infinite upper bound" produces `'+275760-09-13T00:00:00.000Z'`.
In ASCII string comparisons, the plus sign `'+'` (ASCII 43) is strictly smaller than the digit `'2'` (ASCII 50).
Therefore, `WHERE date <= '+275760...'` evaluates to **FALSE for all modern 2000s timestamps**, silently returning 0 records despite successful database inserts.

### Prevention & Guardrail
1. **Bounded Upper Dates**: Always use standard forward dates:
   ```javascript
   // Correct upper bound for queries
   const endDate = new Date(Date.now() + 86400000).toISOString();
   // Or end of selected day:
   const endOfDay = `${selectedDate}T23:59:59.999Z`;
   ```
2. **Never Use `8640000000000000` with String Collations**: Never pass extreme timestamp numbers that format with leading `+` signs.

---

## 4. SQLite WAL Mode Checkpointing & Exit Race Prevention

### Root Cause
SQLite's Write-Ahead Log (`WAL`) stores uncommitted/uncheckpointed pages in the `-wal` file.
Calling asynchronous `db.backup(...)` while immediately executing synchronous `db.close()` causes:
```text
Failed auto exit backup: TypeError: The database connection is not open
```

### Prevention & Guardrail
1. **Synchronous Checkpoints on Exit**: Use `db.pragma('wal_checkpoint(FULL)')` on `window-all-closed` or `before-quit`:
   ```javascript
   function safeFlushAndCheckpoint() {
     if (db && db.open) {
       try {
         db.pragma('wal_checkpoint(FULL)');
       } catch (e) {
         console.error('WAL checkpoint error:', e);
       }
     }
   }
   ```
2. **Handle Database Lifecycles Cleanly**: Only close the database connection after all pending asynchronous backup promises have completed.

---

## 5. Offline-First Purity & External Service Isolation

### Root Cause
Coupling core ERP flows (Sales, Inventory, Invoicing, Shift Closing) to internet connectivity or external APIs (Gemini AI, OCR, Cloud Sync) freezes or crashes the app in offline environments.

### Prevention & Guardrail
1. **Local SQLite Single Source of Truth**: All core business logic must operate 100% locally and offline without external network dependency.
2. **Non-Blocking External Integrations**: Wrap all external cloud calls (AI OCR, webhooks) in isolated `try-catch` blocks that degrade gracefully without interrupting user workflows.

---

## 6. Interactive Multi-Step Wizards vs Flat Overloaded Forms

### Root Cause
Displaying 15+ simultaneous input fields (supplier info, item rows, prices, barcodes, batch numbers, storage locations, payment types) creates extreme cognitive fatigue, input errors, and cramped UI on smaller screens.

### Prevention & Guardrail
1. **4-Step Progressive State Machine**:
   - **Step 1: Supplier & Financial Metadata** (Supplier, phone, invoice reference, payment mode).
   - **Step 2: Items, Units & Pricing** (Wide table layout with dynamic units `قطعة/زجاجة/مل/لتر/تولة`, real-time cost, suggested retail price, and instant valid barcode generator `⚡`).
   - **Step 3: Storage, Batch & Quality** (Batch number, shelf location, expiry date, notes).
   - **Step 4: Comprehensive Review & Atomic Commit** (Grand total review before transactional commit).
2. **Ultra-Wide Responsive Containers**: Use wide modal layouts (`w-[98vw] max-w-[1360px] h-[95vh]`) with calibrated high-density typography (`text-xs` / `text-[11px]`) so large invoices can be entered effortlessly.

---

## 7. 100% Offline True Vector Scannable Barcode Standard

### Root Cause
Rendering barcodes with text font approximations (`||| |||| ||`) fails to scan on physical optical and laser barcode readers.

### Prevention & Guardrail
1. **Mathematical Code-128B / EAN-13 Vector SVG Engine**: Use clean vector SVG components (`BarcodeSVG`) that render exact binary bar patterns, module widths, and quiet zones:
   - High contrast (`#FFFFFF` background, `#000000` bars).
   - `shape-rendering="crispEdges"` for sharp rasterization on thermal heads.
2. **Automated Post-Commit Barcode Studio**: Immediately upon saving a purchase invoice, launch the barcode studio preloaded with all line items, allowing operators to adjust copy counts (`+` / `-`) or print in batch.

---

## 8. Cash Drawer Reconciliation & Audit-Grade Shift Closing

### Root Cause
Computing drawer balances purely from POS sales without tracking cash purchases, cash withdrawals, or cash injections causes massive cash discrepancies and unexplainable shortages.

### Prevention & Guardrail
1. **Exact Cash Drawer Reconciliation Formula**:
   $$\text{Expected Cash} = \text{Cash Sales} + \text{Cash Capital Injections} - \text{Cash Withdrawals} - \text{Cash Purchases (Paid in Cash)}$$
   $$\text{Variance} = \text{Actual Cash Counted} - \text{Expected Cash}$$
   - If $\text{Variance} > 0 \implies \text{فائض نقدي (+)}$
   - If $\text{Variance} < 0 \implies \text{عجز نقدي (-)}$
   - If $\text{Variance} = 0 \implies \text{مطابق تماماً (0.00 د.ل)}$
2. **Comprehensive Multi-Stream Audit**: Display and print itemized daily records across all operational categories: Sales Invoices, Purchase Orders, Damaged Goods, Expenses, Capital Injections, Promotional Gifts, and Shift Notes.

---

## 9. Thermal (50x30mm & 80mm) vs A4 Printable Document Standards

### Root Cause
Unformatted print templates cause cut-off text, broken page breaks, missing CSS styles, and unreadable barcodes when sending print jobs to thermal POS printers or standard office printers.

### Prevention & Guardrail
1. **Strict `@media print` CSS**:
   - For A4: `@page { size: A4; margin: 12mm; }`.
   - For Thermal: `@page { size: 80mm auto; margin: 0; }`.
   - Prevent table row splits: `tr, .card { page-break-inside: avoid; }`.
2. **Electron Headless Printing**: Render HTML strings to hidden `BrowserWindow` instances and call `webContents.print({ silent: false, printBackground: true })`.

---

## 10. Dual-Channel Release Publishing & Linux Auto-Updater Strategy

### Root Cause
Private GitHub repositories cause 404 errors or hash mismatch failures during automated client updates when standard CI/CD release tools cannot access private assets.

### Prevention & Guardrail
1. **Package Locally**: Build `.deb` or `.rpm` packages with `npx electron-builder --linux deb`.
2. **Calculate SHA-512 & Generate `latest-linux.yml`**:
   ```bash
   node -e '
   const fs = require("fs");
   const crypto = require("crypto");
   const fileBuffer = fs.readFileSync("release/app.deb");
   const sha512 = crypto.createHash("sha512").update(fileBuffer).digest("base64");
   '
   ```
3. **Direct Asset Streaming via GitHub REST API**: Upload binary assets directly to GitHub Releases with explicit authorization headers.

---

## 11. Electron Main Process Syntax Verification & IPC Handler Safety

### Root Cause
Placing `await` calls outside `async` functions or duplicating handler code blocks causes fatal syntax errors at boot (`SyntaxError: await is only valid in async functions`), completely preventing the Electron app from launching.

### Prevention & Guardrail
1. **Pre-Build Syntax Verification**: Always run `node --check <file>` on main process scripts before packaging:
   ```bash
   node --check main.cjs
   ```
2. **Atomic IPC Handlers**: Keep IPC handler functions clean, isolated, and properly wrapped in `async (event, data) => { try { ... } catch (e) { ... } }`.

---

## 12. Self-Healing ORM / Repository Column Sanitization & Schema Synchronization

### Root Cause
Frontend or business logic passes newly introduced properties (e.g. `notes`, `batch_number`, `is_demo`) to database insertion/update methods (`BaseRepository.create`, `BaseRepository.update`).
If the underlying SQLite table has not yet run the migration, or if legacy user databases lack the column, SQLite throws:
```text
Database error: table inventory has no column named notes
```
This causes immediate operation failure and blocks critical transactions.

### Prevention & Guardrail
1. **Multi-Tiered Defense (Schema + Migrations)**:
   - Always define the column in the primary `CREATE TABLE IF NOT EXISTS` block.
   - Always add the idempotent migration in the `migrations` array: `ALTER TABLE inventory ADD COLUMN notes TEXT;`.
2. **Self-Healing Dynamic Column Sanitization (Zero-Failure Guarantee)**:
   Equip `BaseRepository.create` and `BaseRepository.update` with an automatic catch-and-retry handler that parses `has no column named (\w+)`, removes the missing field from the payload, and re-executes the operation gracefully:
   ```javascript
   async create(data) {
     const sanitizeAndInsert = async (currentData) => {
       const keys = Object.keys(currentData);
       if (keys.length === 0) return { lastInsertRowid: null };
       const values = Object.values(currentData);
       const placeholders = keys.map(() => '?').join(', ');
       const sql = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
       try {
         return await db.run(sql, values);
       } catch (err) {
         const match = err.message && err.message.match(/has no column named (\w+)/i);
         if (match && match[1] && currentData[match[1]] !== undefined) {
           const nextData = { ...currentData };
           delete nextData[match[1]];
           return await sanitizeAndInsert(nextData);
         }
         throw err;
       }
     };
     return await sanitizeAndInsert(data);
   }
   ```

---

## 13. Universal Multi-Provider AI Architecture & Endpoint Normalization

### Root Cause
1. **Module Import Scope Failure**: Using database instances (`db.transaction(...)`) without importing `db` in UI modules produces `ReferenceError: db is not defined` when saving settings.
2. **Rigid API Endpoint Mismatches**: Users entering API base URLs (e.g. `https://openrouter.ai/api/v1` or `https://api.deepseek.com/v1`) without `/chat/completions` cause HTTP 404 or 405 routing errors.

### Prevention & Guardrail
1. **Always Verify Module Imports**: Ensure `db` and repository imports are explicitly resolved at the top of the component.
2. **Universal Endpoint Normalizer**:
   Automatically parse and append standard `/chat/completions` paths for all OpenAI-compatible providers (OpenRouter, DeepSeek, Groq, Ollama, LM Studio, Together, OpenAI):
   ```javascript
   function normalizeApiEndpoint(rawUrl) {
     let clean = (rawUrl || '').trim().replace(/\/+$/, '');
     if (!clean.endsWith('/chat/completions') && !clean.endsWith('/generateContent')) {
       clean = `${clean}/chat/completions`;
     }
     return clean;
   }
   ```
3. **Interactive Connection Probing**: Provide a single-click "Test Connection" (`handleTestConnection`) button in the UI sending a 1-token probe request to give users instant visual confirmation of latency and credential validity.

---

## 14. Hardware USB Printer & Scanner Live Discovery and Linux Print Subsystems

### Root Cause
1. **Linux Printing Daemon Inactivity**: Minimal or developer Linux distros (e.g. Kali Linux, Ubuntu Server/Minimal) frequently omit the CUPS print daemon (`cups.service`). Even when a USB thermal/barcode printer (e.g. `1fc9:2016 Printer-80`) is physically attached and creates `/dev/usb/lp0`, Chromium and Electron's `webContents.getPrintersAsync()` and `window.print()` will find 0 destinations because the OS spooler is absent.
2. **Missing Low-Level Hardware Probing**: Desktop ERP applications that only call `window.print()` leave merchants blind as to whether their USB cable or printer is recognized by the operating system.

### Prevention & Guardrail
1. **Dual-Layered Hardware Discovery (USB Bus + OS Queues)**:
   In the Electron main process, implement hardware discovery (`hardware:get-devices`) querying both the OS print subsystem (`webContents.getPrintersAsync()`) and raw USB bus devices (`lsusb`, `/dev/usb/lp*`):
   ```javascript
   ipcMain.handle('hardware:get-devices', async () => {
     const systemPrinters = await mainWindow.webContents.getPrintersAsync();
     const lpDevices = fs.existsSync('/dev/usb') ? fs.readdirSync('/dev/usb').filter(f => f.startsWith('lp')) : [];
     const usbPrinters = parseLsusbForPrinters();
     const cupsRunning = checkCupsStatus();
     return { systemPrinters, usbPrinters, lpDevices, cupsRunning };
   });
   ```
2. **Live Hardware Badges in Barcode & POS Modals**:
   Always display a live badge indicating physical USB connectivity (`🟢 متصل بالـ USB: Printer-80 على /dev/usb/lp0`).
3. **Dedicated Electron Direct Print Window**:
   Never rely solely on `window.print()`. Use a dedicated hidden `BrowserWindow` with `@page { size: 50mm 30mm; margin: 0; }` and pass target `deviceName` directly to `webContents.print({ silent: false, deviceName })`.
4. **Actionable OS Enabler**:
   When CUPS is inactive on Linux, provide the single-line enabler command inside the UI:
   `sudo apt-get install -y cups cups-daemon printer-driver-all && sudo usermod -aG lp $USER && sudo systemctl enable --now cups`.

---

## 15. Sandbox Demo Data Isolation, Zero Real-Data Loss & Multi-Table Purging Architecture

### Root Cause
1. **Partial Table Purging**: Deleting mock data from only primary tables (like `sales`) while omitting secondary tables (`inventory`, `debtors`, `purchases`, `withdrawals`, `capital_injections`, `gifts`, `losses`, `notes`, `shift_reports`) leaves zombie demo data persisting across other ERP modules when switching back to production.
2. **In-Memory Store Stale Cache**: In frontend state managers (Zustand/Redux), database mutations do not automatically update active React state unless explicit re-fetching is triggered across all modules.
3. **Accidental User Data Destruction Risk**: Failing to strictly partition real records (`is_demo = 0`) from generated mock data (`is_demo = 1`) risks deleting user-created data.

### Prevention & Guardrail
1. **Automatic Pre-Seed Snapshot Backup**:
   Before inserting any demo data, always take an automated snapshot backup of the database (`aldaffa_real_data_backup_<timestamp>.db`).
2. **Strict Non-Destructive Partitioning**:
   Ensure all user inputs across all repositories explicitly default to `is_demo = 0`. Tag all mock records with `is_demo = 1`.
3. **Atomic Multi-Table Purge**:
   When disabling Sandbox mode, execute `DELETE FROM <table> WHERE is_demo = 1` across ALL 15 application tables in a single SQLite transaction:
   ```javascript
   const ALL_SANDBOX_TABLES = [
     'inventory', 'sales', 'sale_items', 'debtors', 'debt_history',
     'purchases', 'shift_reports', 'withdrawals', 'capital_injections',
     'gifts', 'losses', 'notes', 'returns', 'categories'
   ];
   for (const table of ALL_SANDBOX_TABLES) {
     queries.push({ sql: `DELETE FROM ${table} WHERE is_demo = 1`, params: [] });
   }
   await db.transaction(queries);
   ```
4. **Global Reactive Store & UI Synchronization**:
   Broadcast a refresh event (`window.dispatchEvent(new CustomEvent('aldaffa:data-refresh'))`) and invoke store reloaders (`useInventoryStore.getState().loadProducts()`) to immediately refresh all screens without requiring app restart.

---

## 16. Linux GTK Print Segfault & Verified CUPS Thermal CLI Pipeline

### Root Cause
1. **GTK Print Dialog Segfault on Hidden Windows**:
   Calling `webContents.print({ silent: false })` on a hidden Electron `BrowserWindow` (`show: false`) triggers a fatal GTK assertion failure:
   `gtk_window_set_transient_for: assertion 'parent == NULL || gtk_widget_get_visible (GTK_WIDGET (parent))' failed`
   leading to an uncatchable SIGSEGV that crashes the entire Electron process.
2. **False-Positive Silent Print Failures**:
   Calling `webContents.print({ silent: true, deviceName })` on Linux often fails silently within Chromium's GTK spooler bridge while returning `success: true` to JavaScript, leaving the physical thermal printer (e.g. Xprinter XP-365B) unresponsive.

### Prevention & Guardrail
1. **Crash-Proof Visible Modal for System Dialogs**:
   Never invoke `silent: false` on a hidden window. Always spawn a visible modal preview window (`show: true, modal: true, parent: mainWindow`) allowing native `window.print()` to attach to a mapped, visible GTK surface.
2. **Direct CUPS PDF-CLI Pipeline for Instant Thermal Printing**:
   On Linux, convert label HTML to PDF via `webContents.printToPDF` and dispatch directly using the Linux `lp` command with exact custom dimensions:
   ```javascript
   const pdfBuffer = await printWindow.webContents.printToPDF({
     pageSize: { width: widthMm * 1000, height: heightMm * 1000 },
     margins: { marginType: 'none' },
     printBackground: true
   });
   const tempPdf = path.join(os.tmpdir(), `label_${Date.now()}.pdf`);
   fs.writeFileSync(tempPdf, pdfBuffer);
   const lpCmd = `lp -d "${printerName}" -o PageSize=Custom.${widthMm}x${heightMm}mm -o fit-to-page "${tempPdf}"`;
   exec(lpCmd, (error, stdout, stderr) => {
     try { fs.unlinkSync(tempPdf); } catch (e) {}
     if (error) return resolve({ success: false, error: stderr || error.message });
     return resolve({ success: true, details: stdout.trim() });
   });
   ```
3. **Linux `udev` Rules for Thermal USB Printers**:
   Install `/etc/udev/rules.d/99-xprinter.rules` granting `0666` mode to `/dev/usb/lp*` and adding the user to the `lp` group.

---

## 17. SQLite Transaction Parameterization, Live Schema Alignment & Top-Center Floating HUD Architecture

### Root Cause
1. **Raw SQL Identifier Misinterpretation**:
   Passing string literals inside raw SQL queries without explicit parameter binding (e.g. `VALUES (?, ?, 'store')`) can lead SQLite to misinterpret strings as column identifiers in complex transaction wrappers, throwing `SqliteError: no such column: "store"`.
2. **Multi-Table Seeding Column Mismatches**:
   Writing seeder scripts with assumed column names (e.g. `source` in `capital_injections`, `product_name` in `gifts`/`losses`, `notes` instead of `reason`) instead of matching live database schemas causes immediate transaction abortion.
3. **Corner Notification UI Clutter**:
   Placing toast notifications in the top-right corner obscures key action buttons (search bars, modal close buttons, filter dropdowns) across various ERP modules.

### Prevention & Guardrail
1. **100% Parameterized SQLite Transactions**:
   Never concatenate or hardcode literal values inside multi-row batch queries. Always bind every variable through positional parameters (`?`):
   ```javascript
   queries.push({
     sql: `INSERT INTO sales (date, subtotal, discount, total, profit, payment_method, customer_name, type, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
     params: [date, total, 0, total, profit, method, customerName, 'store', 1]
   });
   ```
2. **Schema-Matched Model Verification**:
   Verify every column against `PRAGMA table_info(<table>)` before constructing database seeder payloads.
3. **Top-Center Floating Island Notification HUD**:
   Position all transient alerts in the horizontal top-center (`fixed top-3 left-1/2 -translate-x-1/2 z-[9999]`) using glassmorphism and spring drop animations to ensure zero interference with right/left UI controls.

---

## 18. POS Checkout Flow: Silent Direct Completion & Non-Intrusive A4/PDF Invoicing

### Root Cause
Triggering automatic modal popups or ESC/POS thermal receipt windows upon completing a sale disrupts cashier checkout speed, creates unorganized popup windows, and attempts thermal printing in environments where structured A4 or PDF archiving is desired.

### Prevention & Guardrails
1. **Zero-Popup Default Checkout**:
   Upon pressing "إتمام البيع", execute all SQLite transactions, ledger updates, and store refreshes asynchronously and immediately clear the cart.
2. **Non-Blocking Post-Sale Confirmation**:
   Present an elegant, non-intrusive action bar or modal with two clear options:
   - 📄 **طباعة / حفظ فاتورة PDF** (Generates structured A4 PDF document).
   - ✖️ **متابعة البيع** (Clears immediately to receive the next customer).
3. **No Unsolicited Thermal Triggers**:
   Thermal hardware commands (`TSPL` / `ESC/POS`) must only be triggered when explicitly requested in dedicated modules (such as `BarcodeStudio` for label rolls), never forced upon checkout completion.
