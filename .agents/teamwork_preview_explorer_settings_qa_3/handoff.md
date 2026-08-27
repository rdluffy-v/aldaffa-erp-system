# Handoff Report: Universal Settings Store & 20-Module Automated QA Suite (R3 & R4)

**Agent:** Explorer 3 (Universal Settings Store & 20-Module Automated QA Suite)  
**Date:** 2026-08-27  
**Working Directory:** `/home/rdluffy/Desktop/aldaffa-app-desktop/.agents/teamwork_preview_explorer_settings_qa_3`  
**Handoff Type:** Hard Handoff (Investigation & Architecture Complete)

---

## 1. Observation

Direct code observations across the repository:

1. **Parameters Defined vs Exposed in Settings UI**:
   - `src/stores/useSettingsStore.js` (lines 11–67) defines `DEFAULT_SETTINGS` with 33 parameters including `tax_rate: '0'`, `currency_symbol: 'د.ل'`, `currency_name: 'دينار ليبي'`, `low_stock_threshold: '10'`, `invoice_prefix: 'INV-'`, `purchase_prefix: 'PUR-'`, `commercial_reg: ''`, `tax_id: ''`.
   - `src/modules/Settings.jsx` (lines 898–904) defines 5 tabs: `guide`, `print`, `labels`, `archive`, `ai_updates`. It contains **no UI input fields** for `tax_rate`, `currency_symbol`, `currency_name`, `invoice_prefix`, `purchase_prefix`, `low_stock_threshold`, `commercial_reg`, or `tax_id`.
   - `src/modules/Settings.jsx` also lacks a dedicated management screen for **User Roles & Granular Permissions (R1)** despite `UsersRepository.js` and `useAuthStore.js` existing.

2. **Currency Symbol Lookup Chain Broken**:
   - `src/utils/helpers.js` (lines 23–27):
     ```javascript
     const symbol =
       customSymbol ||
       (typeof window !== 'undefined' && window.__CURRENCY_SYMBOL__) ||
       'د.ل';
     return `${val.toLocaleString('ar-LY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${symbol}`;
     ```
   - `window.__CURRENCY_SYMBOL__` is **never set anywhere in the application** (`grep_search` found 0 assignments). Consequently, all `formatCurrency` calls across all 20 modules default permanently to `'د.ل'`.
   - Hardcoded `'د.ل'` found in:
     - `src/components/shared/CurrencyInput.jsx` (line 27, line 153)
     - `src/modules/POS.jsx` (line 567)
     - `src/modules/PerfumeMixLab.jsx` (lines 737, 837, 949, 1062, 1075)
     - `src/modules/Purchases.jsx` (lines 1289, 1291)
     - `src/modules/BarcodeStudio.jsx` (lines 893, 1191, 1264)
     - `src/modules/Dashboard.jsx` (line 66: hardcoded `LOW_STOCK_THRESHOLD = 10`)
     - `src/components/layout/Header.jsx` (lines 149–151: hardcoded store name "الدفة للعطور")
     - `main.cjs` (lines 698, 957, 1124, 1486: hardcoded `د.ل` in print templates)

3. **Tab Customization Storage Discrepancy**:
   - `src/stores/useLabelsStore.js` (lines 32–42):
     ```javascript
     const loadStoredLabels = () => {
       try {
         const raw = localStorage.getItem(STORAGE_KEY);
         if (raw) return { ...DEFAULT_MODULE_LABELS, ...JSON.parse(raw) };
       } catch (e) {}
       return { ...DEFAULT_MODULE_LABELS };
     };
     ```
   - Custom labels load solely from `localStorage` on startup and never hydrate from the SQLite `settings` table. In addition, `DEFAULT_MODULE_LABELS` is missing `analytics` and `invoices`.

4. **IPC Transaction Concurrency Flaw**:
   - `src/database/connection.js` (lines 70–91) simulates transactions by dispatching sequential asynchronous IPC calls:
     ```javascript
     async transaction(queries) {
       try {
         await this.run('BEGIN TRANSACTION');
         const results = [];
         for (const { sql, params } of queries) {
           const result = await ipcRenderer.invoke('db:run', { sql, params });
           if (!result.success) throw new Error(result.error);
           results.push(result.data);
         }
         await this.run('COMMIT');
         this.invalidateCache();
         return results;
       } catch (error) {
         await this.run('ROLLBACK').catch(() => {});
         throw error;
       }
     }
     ```
   - `main.cjs` (lines 655–688) only exposes `db:query`, `db:run`, and `db:get`. It has no `db:transaction` handler. Concurrent asynchronous renderer calls can interleave into the single SQLite connection, causing `cannot start a transaction within a transaction`.

5. **Non-Transactional Multi-Query Operations**:
   - `src/database/repositories/SalesRepository.js` (line 31): Master sale row is inserted outside the transaction; child items and inventory deduction are inside.
   - `src/modules/Returns.jsx` (lines 180–225): `adjustStock`, `saleItemsRepo.update/delete`, `salesRepo.update`, and `returnsRepo.create` execute as 4 separate un-transactioned calls.
   - `src/modules/PerfumeMixLab.jsx` (lines 350–392): Creates compound product and deducts bottle/oil/alcohol components via un-transactioned individual calls.
   - `src/modules/Discounts.jsx` (lines 114–130): Loops over hundreds of products updating each one individually with `await inventoryRepo.update(...)` outside any transaction.

6. **Shift Close Cash Drawer Formula Defect**:
   - `src/modules/ShiftClose.jsx` (line 191):
     `const expectedCashBalance = totalCashSales + totalCapital - totalWithdrawals - totalCashPurchases;`
   - `ShiftClose.jsx` does not query the `returns` table or subtract Cash Returns (`totalCashReturns`), leading to an inaccurate expected cash calculation and false drawer deficits whenever refunds occur.

7. **Test Suite Status in `package.json`**:
   - `package.json` (lines 10–16) has no `"test"` script.
   - Only a manual table test script `test-db.js` exists in the repository.

---

## 2. Logic Chain

1. **From Observation 1 & 2 $\rightarrow$ R3 Customization Assessment**:
   - Because `Settings.jsx` lacks UI controls for general parameters (`currency_symbol`, `tax_rate`, `invoice_prefix`, `low_stock_threshold`), and because `window.__CURRENCY_SYMBOL__` is never initialized from `useSettingsStore`, user customization cannot take effect across the application.
   - Hardcoded strings in `Header.jsx`, `Dashboard.jsx`, `POS.jsx`, `PerfumeMixLab.jsx`, and `main.cjs` bypass reactive state management.

2. **From Observation 3 $\rightarrow$ Label Store Persistence Assessment**:
   - Because `useLabelsStore` only reads from `localStorage` during initialization, any device switch, cache clearing, or SQLite backup restore causes customized module tab labels to be lost.

3. **From Observation 4 & 5 $\rightarrow$ SQLite Transaction & Concurrency Assessment**:
   - Better-sqlite3 is synchronous in the main process, but the renderer communicates via asynchronous IPC.
   - Dispatched individual `BEGIN TRANSACTION`, `db:run`, and `COMMIT` IPC calls can interleave if multiple operations occur concurrently, creating transaction deadlocks or partial commits.
   - Non-transactional execution in `Returns.jsx`, `PerfumeMixLab.jsx`, and `SalesRepository.js` risks data corruption if any intermediate step fails.

4. **From Observation 6 $\rightarrow$ Accounting Reconciliation Defect in ShiftClose**:
   - When a sale is returned in cash, the drawer loses cash. Because `ShiftClose.jsx` ignores cash returns in `expectedCashBalance`, the system over-estimates expected drawer cash, reporting a false deficit.

5. **From Observation 7 $\rightarrow$ QA Strategy Formulation (R4)**:
   - Without an automated test runner, regression risks are high. A native Node.js automated QA test harness covering all 20 modules is required to validate calculations, transaction rollbacks, WAC accuracy, and permission boundaries.

---

## 3. Caveats

- `test-db.js` was inspected statically; terminal execution timed out due to non-interactive subagent permissions.
- Electron thermal direct printer output (`node-thermal-printer` / CUPS LP devices) requires attached physical hardware; automated tests must mock hardware devices.
- No other caveats.

---

## 4. Conclusion

1. **Universal Settings Store (R3)** requires:
   - Adding a **General Store & Financial Preferences** tab and a **User Roles & Granular Permissions** tab (R1) in `Settings.jsx`.
   - Setting `window.__CURRENCY_SYMBOL__` on `useSettingsStore` hydration and dispatching a custom event on change.
   - Replacing hardcoded `د.ل` and store name strings across all modules with reactive store hooks.
   - Synchronizing `useLabelsStore` with SQLite on startup.

2. **SQLite Transaction Integrity (R4)** requires:
   - Implementing native atomic `ipcMain.handle('db:transaction', ...)` in `main.cjs`.
   - Wrapping `Returns.jsx.processReturn`, `PerfumeMixLab.jsx.handleFinalizeFormula`, `SalesRepository.createSaleWithItems`, and `Discounts.jsx.applyDiscount` in atomic transactions.
   - Fixing the `ShiftClose.jsx` expected cash balance equation to subtract Cash Returns.

3. **20-Module Automated QA Suite (R4)** requires:
   - Implementing a zero-external-dependency Node.js test harness covering all 20 ERP modules as detailed in `analysis.md`.
   - Adding `"test": "node test/harness/test-runner.js"` to `package.json`.

---

## 5. Verification Method

To independently verify these findings:

1. **Verify Missing Settings UI Fields**:
   - Inspect `src/modules/Settings.jsx` lines 898–940. Notice only 5 tabs exist with no inputs for `tax_rate`, `currency_symbol`, `invoice_prefix`, `low_stock_threshold`, or user management.

2. **Verify Broken Currency Lookup**:
   - Inspect `src/utils/helpers.js` line 25: `(typeof window !== 'undefined' && window.__CURRENCY_SYMBOL__)`.
   - Run grep across `src/` for `__CURRENCY_SYMBOL__` assignment; verify 0 write occurrences.

3. **Verify IPC Transaction Asynchrony**:
   - Inspect `src/database/connection.js` lines 70–91. Note sequential `BEGIN`, `db:run`, `COMMIT` IPC calls.
   - Inspect `main.cjs` lines 650–690. Note lack of `db:transaction` handler.

4. **Verify Shift Close Formula Omission**:
   - Inspect `src/modules/ShiftClose.jsx` lines 145–195. Note absence of `returns` query and omission of cash returns in `expectedCashBalance`.
