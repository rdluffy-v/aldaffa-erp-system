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
