# Comprehensive Analysis: Universal Settings Store, SQLite Integrity & 20-Module Automated QA Suite

**Module Scope:** Universal Settings Store (`useSettingsStore`, `Settings.jsx`, `SettingsRepository`, `useLabelsStore`), SQLite Transaction/Concurrency/WAL Safety, and 20-Module ERP Automated Testing Suite (R3 & R4).  
**Investigator:** Explorer 3  
**Date:** 2026-08-27  
**Working Directory:** `/home/rdluffy/Desktop/aldaffa-app-desktop`

---

## 1. Executive Summary

A comprehensive architectural and code audit of the Aldaffa Perfumes ERP (`aldaffa-app-desktop`) was conducted across all 20 modules, database repositories, Zustand reactive state stores, Electron main/IPC layers, and testing infrastructure.

### Core Findings Summary:
1. **Settings Store & Parameter Editability (R3)**:
   - While `useSettingsStore.js` defines an extensive dictionary of 33 parameters in `DEFAULT_SETTINGS`, **only a subset is exposed in the `Settings.jsx` UI**.
   - Parameters like `tax_rate`, `currency_symbol`, `currency_name`, `invoice_prefix`, `purchase_prefix`, `low_stock_threshold`, `commercial_reg`, and `tax_id` **have no input fields in `Settings.jsx`**, preventing the user from customizing them in the UI.
   - Multiple hardcoded values were identified across modules (e.g., hardcoded currency symbol `د.ل` in `helpers.js`, `CurrencyInput.jsx`, `main.cjs`, `POS.jsx`, `PerfumeMixLab.jsx`, and hardcoded `LOW_STOCK_THRESHOLD = 10` in `Dashboard.jsx`, hardcoded store branding in `Header.jsx`).
   - `useLabelsStore.js` manages custom section labels via `localStorage`, failing to hydrate from SQLite `settings` table on startup.

2. **SQLite Transaction Safety & Concurrency (R4)**:
   - SQLite runs in **WAL (Write-Ahead Logging)** mode (`journal_mode = WAL`), which provides excellent read concurrency and durability.
   - **Critical Concurrency Flaw in IPC Transactions**: `connection.js` executes `db.transaction(queries)` by dispatching sequential asynchronous IPC calls (`BEGIN TRANSACTION`, individual `db:run` calls, and `COMMIT`/`ROLLBACK`). In Electron, asynchronous IPC message interleaving across concurrent renderer actions can result in transaction collision (`cannot start a transaction within a transaction`) or data corruption.
   - Several multi-table mutations in repositories and modules are executed without transactional boundaries (e.g., `SalesRepository.createSaleWithItems` inserts the sale master outside the transaction; `Returns.jsx.processReturn` executes 4 separate non-transactional calls; `PerfumeMixLab.jsx` creates products and adjusts stock in uncoordinated queries).

3. **Automated Testing & QA Infrastructure (R4)**:
   - Currently, there is **no automated testing script (`npm test`) configured in `package.json`**. Only a basic manual table verification script (`test-db.js`) exists in the root folder.
   - An end-to-end automated QA test harness covering all 20 modules has been formulated in detail below, providing mathematical verification of inventory movements, WAC calculations, cash drawer reconciliation, double discounts, PIN authentication, and transaction rollbacks.

---

## 2. Universal Settings Store & Parameters Deep Audit (R3)

### 2.1 Complete Application Parameters Audit Table

| Parameter Key | Default Value in `useSettingsStore` | Exposed in `Settings.jsx`? | Persisted in SQLite `settings` table? | Propagated Reactively to Modules? | Hardcoded References Identified |
|---|---|---|---|---|---|
| `store_name` | `'الدفة للعطور'` | ✅ Yes (Print Tab) | ✅ Yes | ⚠️ Partial | Hardcoded in `Header.jsx:149` |
| `store_subtitle` | `'Aldaffa Perfumes - لأرقى العطور والخلطات'` | ✅ Yes (Print Tab) | ✅ Yes | ⚠️ Partial | Hardcoded in `Header.jsx:151` |
| `store_phone` | `'0123456789'` | ✅ Yes (Print Tab) | ✅ Yes | ✅ Yes (Receipts) | - |
| `store_address` | `'ليبيا - مصراتة'` | ✅ Yes (Print Tab) | ✅ Yes | ✅ Yes (Receipts) | - |
| `currency_symbol` | `'د.ل'` | ❌ **No UI Input** | ✅ In Schema / Store | ❌ **Broken Lookup** | Hardcoded in `helpers.js:26`, `CurrencyInput.jsx:27,153`, `main.cjs:698`, `POS.jsx:567`, `PerfumeMixLab.jsx` |
| `currency_name` | `'دينار ليبي'` | ❌ **No UI Input** | ✅ In Schema / Store | ❌ Not used | - |
| `tax_rate` | `'0'` | ❌ **No UI Input** | ✅ In Schema / Store | ❌ **Ignored in POS** | `useCartStore` ignores tax |
| `commercial_reg` | `''` | ❌ **No UI Input** | ✅ In Schema / Store | ❌ Not displayed | - |
| `tax_id` | `''` | ❌ **No UI Input** | ✅ In Schema / Store | ❌ Not displayed | - |
| `low_stock_threshold` | `'10'` | ❌ **No UI Input** | ✅ In Schema / Store | ⚠️ Only in `InventoryFull` | Hardcoded `10` in `Dashboard.jsx:66` |
| `default_payment_method` | `'cash'` | ❌ **No UI Input** | ✅ In Schema / Store | ⚠️ Default in `useCartStore` | - |
| `enable_wholesale` | `'1'` | ❌ **No UI Input** | ✅ In Schema / Store | ⚠️ Used in POS/Inv | - |
| `enable_price_override` | `'1'` | ❌ **No UI Input** | ✅ In Schema / Store | ⚠️ Used in POS | - |
| `invoice_prefix` | `'INV-'` | ❌ **No UI Input** | ✅ In Schema / Store | ❌ **Ignored in POS** | POS hardcodes `#${saleId}` |
| `purchase_prefix` | `'PUR-'` | ❌ **No UI Input** | ✅ In Schema / Store | ❌ **Ignored in Purchases** | Purchases displays raw ID |
| `default_unit` | `'piece'` | ❌ **No UI Input** | ✅ In Schema / Store | ⚠️ Used in Inv modals | - |
| `auto_calculate_wac` | `'1'` | ❌ **No UI Input** | ✅ In Schema / Store | ⚠️ WAC runs always | `PurchasesRepository` doesn't check flag |
| `sound_effects` | `'1'` | ❌ **No UI Input** | ✅ In Schema / Store | ❌ No audio triggers | - |
| `print_mode` | `'thermal'` | ✅ Yes (Print Tab) | ✅ Yes | ✅ Yes (`main.cjs`) | - |
| `thermal_paper_width`| `'80mm'` | ✅ Yes (Print Tab) | ✅ Yes | ✅ Yes (`main.cjs`) | - |
| `receipt_theme` | `'luxury_gold'` | ✅ Yes (Print Tab) | ✅ Yes | ✅ Yes (`main.cjs`) | - |
| `receipt_font_size` | `'md'` | ✅ Yes (Print Tab) | ✅ Yes | ✅ Yes (`main.cjs`) | - |
| `receipt_border` | `'dashed'` | ✅ Yes (Print Tab) | ✅ Yes | ✅ Yes (`main.cjs`) | - |
| `receipt_greeting` | `'شكراً لتسوقكم معنا...'` | ✅ Yes (Print Tab) | ✅ Yes | ✅ Yes (`main.cjs`) | - |
| `receipt_policy` | `'سياسة الاستبدال...'` | ✅ Yes (Print Tab) | ✅ Yes | ✅ Yes (`main.cjs`) | - |
| `show_logo` | `'1'` | ✅ Yes (Print Tab) | ✅ Yes | ✅ Yes (`main.cjs`) | - |
| `show_barcode` | `'1'` | ✅ Yes (Print Tab) | ✅ Yes | ✅ Yes (`main.cjs`) | - |
| `show_cashier` | `'1'` | ✅ Yes (Print Tab) | ✅ Yes | ✅ Yes (`main.cjs`) | - |
| `show_phone` | `'1'` | ✅ Yes (Print Tab) | ✅ Yes | ✅ Yes (`main.cjs`) | - |
| `show_customer_info` | `'1'` | ✅ Yes (Print Tab) | ✅ Yes | ✅ Yes (`main.cjs`) | - |
| `logo_base64` | `''` | ✅ Yes (Print Tab) | ✅ Yes | ✅ Yes (`main.cjs`) | - |
| `receipt_watermark_base64`| `''` | ✅ Yes (Print Tab) | ✅ Yes | ✅ Yes (`main.cjs`) | - |
| `custom_labels` | JSON of tab names | ✅ Yes (Labels Tab) | ⚠️ Partial | ⚠️ localStorage only | `useLabelsStore` ignores SQLite on init |
| `ai_provider` | `'gemini'` | ✅ Yes (AI Tab) | ✅ Yes | ✅ Yes (`AIAdvisor`) | - |
| `ai_model` / `ai_model_name`| `'gemini-2.0-flash'` | ✅ Yes (AI Tab) | ✅ Yes | ✅ Yes (`AIAdvisor`) | - |
| `gemini_api_key` | `''` | ✅ Yes (AI Tab) | ✅ Yes | ✅ Yes (`AIAdvisor`) | - |
| `openai_api_key` | `''` | ✅ Yes (AI Tab) | ✅ Yes | ✅ Yes (`AIAdvisor`) | - |
| `github_token` | default token | ✅ Yes (AI Tab) | ✅ Yes | ✅ Yes (Updater) | - |
| `sandbox_mode` | `'0'` | ✅ Yes (Archive Tab) | ✅ Yes | ✅ Yes (`SandboxEngine`)| - |

---

### 2.2 Deep Flaw Analysis in Settings Store

#### 1. Currency Formatting Broken Chain
- In `src/utils/helpers.js` (lines 21–28):
  ```javascript
  export const formatCurrency = (amount, customSymbol = null) => {
    const val = Number(amount) || 0;
    const symbol =
      customSymbol ||
      (typeof window !== 'undefined' && window.__CURRENCY_SYMBOL__) ||
      'د.ل';
    return `${val.toLocaleString('ar-LY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${symbol}`;
  };
  ```
- **The Defect**: Nowhere in `App.jsx` or `useSettingsStore.js` is `window.__CURRENCY_SYMBOL__` ever assigned when settings are loaded from SQLite.
- **Consequence**: Whenever `formatCurrency(val)` is called across all 20 modules without explicitly passing `customSymbol`, it permanently falls back to `'د.ل'`. If the merchant changes their currency to `SAR`, `USD`, `IQD`, or `EGP`, the UI continues displaying `د.ل`.
- **Fix Recommendation**: When `useSettingsStore.loadSettings()` resolves or `setSetting('currency_symbol', val)` is called, synchronously update `window.__CURRENCY_SYMBOL__ = val` and dispatch `window.dispatchEvent(new Event('aldaffa:currency-changed'))`.

#### 2. Tab Customization Store Inconsistency (`useLabelsStore.js`)
- `useLabelsStore.js` (lines 32–42) loads solely from `localStorage.getItem('aldaffa_custom_labels')`.
- When the user saves labels in `Settings.jsx`, it saves to both `localStorage` and SQLite (`settingsRepo.setSetting('custom_labels', ...)`).
- **The Defect**: On cold launch, `useLabelsStore` never queries SQLite. If localStorage is flushed or cleared, custom labels revert to default Arabic tab names despite being safely persisted in the database.
- In addition, `DEFAULT_MODULE_LABELS` in `useLabelsStore.js` only contains 19 labels, omitting `analytics` and `invoices`.

#### 3. Missing Settings Tabs in `Settings.jsx`
`Settings.jsx` currently contains 5 tabs:
1. `guide`: Lifecycle guide (دليل دورة الحياة)
2. `print`: Print studio (استوديو وقوالب الطباعة)
3. `labels`: Free label editing (التعديل الحر للمسميات)
4. `archive`: Maintenance & archiving (الترحيل وصيانة المنظومة)
5. `ai_updates`: AI co-pilot & GitHub updater (المستشار الذكي والتحديثات)

**Missing Critical UI Sections**:
- **General Store & Financial Preferences Tab**:
  - Currency selection dropdown (SAR, LYD, IQD, USD, EUR, EGP, AED, OMR, QAR, KWD, BHD) + custom symbol input.
  - Tax percentage input (`tax_rate`, e.g. 0%, 5%, 15%) and tax calculation mode (inclusive/exclusive).
  - Commercial Registration (`commercial_reg`) and Tax Identification (`tax_id`).
  - Invoice Prefix (`invoice_prefix`) and Purchase Order Prefix (`purchase_prefix`).
  - Low Stock Warning Threshold (`low_stock_threshold`).
  - Default Measurement Unit (`default_unit`: قطعة, مل, تولة, جرام).
  - Auto WAC Calculation toggle (`auto_calculate_wac`).
- **User Roles & Granular Permissions Tab (Requirement R1)**:
  - Add/edit user accounts, PIN codes, role selection (Manager, Accountant, Cashier).
  - Fine-grained permission checkboxes (view profit, delete invoice, apply discount, purge demo data, manage users).

---

## 3. Database Architecture, Concurrency & Transaction Safety

### 3.1 WAL Mode and Schema Initialization
- In `main.cjs` (line 22): `db.pragma('journal_mode = WAL');`.
- In `test-db.js` (line 16): `db.pragma('journal_mode = WAL');`.
- **Assessment**: WAL mode allows concurrent readers to query SQLite without blocking or being blocked by write transactions.
- **Optimization Needed**: On application shutdown or large purge operations, explicit checkpointing (`PRAGMA wal_checkpoint(TRUNCATE)`) should be performed to reclaim disk space and prevent WAL log inflation.

### 3.2 IPC Bridge & Transaction Collision Vulnerability
In `src/database/connection.js` (lines 70–91):
```javascript
async transaction(queries) {
  try {
    await this.run('BEGIN TRANSACTION');

    const results = [];
    for (const { sql, params } of queries) {
      const result = await ipcRenderer.invoke('db:run', { sql, params });
      if (!result.success) {
        throw new Error(result.error);
      }
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

#### Why This is an Architectural Defect:
1. **Asynchronous IPC Interleaving**: Because each step (`BEGIN`, individual query execution, `COMMIT`) is a separate asynchronous IPC message over Electron's IPC bus, if two asynchronous actions are triggered in the UI simultaneously (e.g. POS checkout while background barcode generator or sync runs), the `BEGIN TRANSACTION` from Call B will arrive before Call A commits, causing a fatal SQLite error: `SqliteError: cannot start a transaction within a transaction`.
2. **Main Process Lack of Atomic Transaction Handler**: In `main.cjs`, `ipcMain.handle` only exposes `db:query`, `db:run`, and `db:get`. It lacks a dedicated `db:transaction` handler.

#### Concrete Solution:
In `main.cjs`, implement native `better-sqlite3` atomic transaction handling:
```javascript
ipcMain.handle('db:transaction', async (event, { queries }) => {
  try {
    const runTx = db.transaction((queryList) => {
      const out = [];
      for (const q of queryList) {
        const stmt = db.prepare(q.sql);
        const res = stmt.run(...(q.params || []));
        out.push(res);
      }
      return out;
    });

    const data = runTx(queries);
    return { success: true, data };
  } catch (error) {
    console.error('Atomic transaction error:', error);
    return { success: false, error: error.message };
  }
});
```
And in `src/database/connection.js`:
```javascript
async transaction(queries) {
  const result = await ipcRenderer.invoke('db:transaction', { queries });
  if (!result.success) {
    throw new Error(result.error);
  }
  this.invalidateCache();
  return result.data;
}
```

---

### 3.3 Audit of Multi-Query Atomic Operations Across Modules

| Module / File | Operation | Current Implementation Status | Risk / Defect | Required Remediation |
|---|---|---|---|---|
| `SalesRepository.js:18-78` | `createSaleWithItems` | ⚠️ Partially Transactional | Master sale inserted *outside* transaction (`await this.create(...)`). If child items insert fails, master sale is orphaned. | Wrap `INSERT INTO sales`, `INSERT INTO sale_items`, and `UPDATE inventory` inside a single atomic transaction. |
| `SalesRepository.js:83-138` | `deleteSaleWithStockRestore` | ✅ Fully Transactional | Collects stock restores, item deletes, return deletes, debtor adjustments, and master delete into `queries` array and commits via `db.transaction(queries)`. | Meets transaction safety standard. |
| `PurchasesRepository.js:17-59` | `createPurchaseWithInventoryUpdate` | ✅ Fully Transactional | Combines purchase insert and WAC inventory updates into a single transaction. | Add guard against division by zero in WAC formula. |
| `PurchasesRepository.js:64-98` | `deletePurchaseWithStockAdjustment` | ✅ Fully Transactional | Combines inventory deductions and purchase record delete into single transaction. | Meets transaction safety standard. |
| `DebtorsRepository.js:48-69` | `addDebtTransaction` | ✅ Fully Transactional | Combines `debt_history` insert and `debtors.total_debt` update into single transaction. | Meets transaction safety standard. |
| `GiftsRepository.js:17-35` | `createGiftWithInventoryDeduction` | ✅ Fully Transactional | Combines gift insert and inventory deduction in single transaction. | Meets transaction safety standard. |
| `LossesRepository.js:23-41` | `createLossWithInventoryDeduction` | ✅ Fully Transactional | Combines loss insert and inventory deduction in single transaction. | Meets transaction safety standard. |
| `Returns.jsx:164-240` | `processReturn` | ❌ **Non-Transactional** | Executes `inventoryRepo.adjustStock`, `saleItemsRepo.update/delete`, `salesRepo.update`, and `returnsRepo.create` in 4 separate non-atomic calls. | Create `SalesRepository.processReturnWithStockRestore` that bundles all 4 operations into a single atomic transaction. |
| `PerfumeMixLab.jsx:327-400` | `handleFinalizeFormula` | ❌ **Non-Transactional** | Creates finished product, then deducts bottles, oils, and alcohol via separate `adjustStock` calls in a loop with empty catch blocks. | Create `InventoryRepository.createCompoundPerfumeWithDeductions` that atomically inserts the compound product and deducts all components. |
| `Discounts.jsx:69-150` | `applyDiscount` | ❌ **Non-Transactional** | Loops through affected items calling individual `inventoryRepo.update` calls sequentially without a transaction. | Bundle all product price & discount updates into a single `db.transaction(queries)` batch. |

---

## 4. 20-Module Comprehensive Quality & Logic Audit

```
┌────────────────────────────────────────────────────────────────────────┐
│                   ALDAFFA ERP 20-MODULE AUDIT MAP                      │
├──────────────────────┬───────────────────────┬─────────────────────────┤
│ Core Sales & POS     │ Inventory & Logistics │ Financials & Accounting │
│  • POS (F1, F3, F4)  │  • InventoryFull      │  • Debtors & Aging      │
│  • OnlineSales       │  • Purchases & WAC    │  • Withdrawals (Exp)    │
│  • Returns (30-hr)   │  • BarcodeStudio      │  • CapitalInjections    │
│  • Invoices Center   │  • PerfumeMixLab      │  • ShiftClose & Drawer  │
│  • Discounts         │  • Categories         │  • Analytics & Recharts │
├──────────────────────┼───────────────────────┼─────────────────────────┤
│ Operations & CRM     │ Intelligence & Config │ Executive               │
│  • Gifts             │  • AIAdvisor          │  • Dashboard            │
│  • Losses            │  • Settings           │                         │
│  • Notes             │                       │                         │
└──────────────────────┴───────────────────────┴─────────────────────────┘
```

### Module-by-Module Audit:

#### 1. POS Module (`src/modules/POS.jsx`)
- **Strengths**: Support for quick barcode scan (F1), instant checkout (F3), cart clear (F4), dual discount modes (fixed LYD vs percentage %), portion-aware selling (ml portions from perfume bottles), multiple payment methods (cash, card, bank transfer, debt).
- **Identified Issues**:
  - Does not compute or display `tax_rate` even if tax is configured.
  - Generates invoice numbers as `#${saleId}` rather than applying `invoice_prefix` (e.g. `INV-00123`).
  - Hardcoded currency badge `د.ل` at line 567.

#### 2. Inventory Full Module (`src/modules/InventoryFull.jsx`)
- **Strengths**: Comprehensive table view, search, category filter, low-stock threshold warning, automatic barcode generator, physical stocktaking reconciliation tab.
- **Identified Issues**:
  - Legacy `Inventory.jsx` still exists in codebase with older unstyled alert modals; ensure `InventoryFull.jsx` remains the canonical entry point.

#### 3. Purchases Module (`src/modules/Purchases.jsx`)
- **Strengths**: Direct supplier order logging, WAC (Weighted Average Cost) inventory adjustment, barcode printing for received quantities, invoice ref tagging.
- **Identified Issues**:
  - WAC formula `cost = (qty * cost + new_qty * new_cost) / (qty + new_qty)` can divide by zero if `qty + new_qty <= 0`. Needs `MAX(1, qty + new_qty)` safety clamp.

#### 4. Debtors Module (`src/modules/Debtors.jsx`)
- **Strengths**: Complete customer debt ledger, repayment logging, aging calculation (30, 60, 90+ days), search and filtering.
- **Identified Issues**:
  - Deleting a debt repayment directly updates debtor balance but should verify debtor existence first.

#### 5. Barcode Studio Module (`src/modules/BarcodeStudio.jsx`)
- **Strengths**: Real-time SVG barcode rendering, EAN-13 check digit validation, batch generation for whole categories or purchases, direct thermal printing via IPC `print:barcodes-direct`.
- **Identified Issues**:
  - Hardcoded `(د.ل)` in price tag labels at lines 893, 1191, 1264.

#### 6. Perfume Mix Lab Module (`src/modules/PerfumeMixLab.jsx`)
- **Strengths**: Specialized 5-step wizard for bespoke perfume formulation, multi-oil blend ratios (percentage and ml per bottle), alcohol/solvent calculations, automated cost breakdown, formula archiving.
- **Identified Issues**:
  - Compound product creation and ingredient stock deductions run in separate uncoordinated queries. If an ingredient fails, the finished perfume is created without deducting components.
  - Hardcoded `(د.ل)` in form labels at lines 737, 837, 949, 1062, 1075.

#### 7. Shift Close Module (`src/modules/ShiftClose.jsx`)
- **Strengths**: Compiles daily financial metrics (Cash Sales, Card Sales, Transfer Sales, Debt Sales, Purchases, Withdrawals, Capital Injections, Losses, Gifts, Notes), compares expected drawer cash vs counted cash, records variance, saves historical snapshots.
- **Identified Issues**:
  - **Expected Cash Formula Omission**: `expectedCashBalance = totalCashSales + totalCapital - totalWithdrawals - totalCashPurchases`. It fails to subtract **Cash Returns** (`totalCashReturns`). If a cashier issued a cash refund during the shift, the drawer will show an artificial deficit.

#### 8. Settings Module (`src/modules/Settings.jsx`)
- **Strengths**: Interactive 11-stage ERP lifecycle guide, print template studio with live preview, tab label customization, database archiving, vacuum/shrink, sandbox demo data engine, AI provider selector, auto-updater.
- **Identified Issues**:
  - Lacks dedicated UI tabs for General Store Identity (Tax %, Currency, Invoice Prefixes, Low Stock Thresholds) and User Roles / Granular Permissions (R1).

#### 9. Discounts Module (`src/modules/Discounts.jsx`)
- **Strengths**: Storewide, category, and single-item discount campaigns; preserves `original_price` on inventory items to allow 100% accurate price restoration.
- **Identified Issues**:
  - Bulk discount application loops over hundreds of items with individual `inventoryRepo.update` calls. Must be wrapped into a single batch transaction.

#### 10. Gifts Module (`src/modules/Gifts.jsx`)
- **Strengths**: Promotional gift tracking, recipient documentation, automatic stock deduction at unit cost, stock restoration on deletion.
- **Identified Issues**:
  - Minor: No multi-item gift bundling in a single gift ticket.

#### 11. Losses & Damages Module (`src/modules/Losses.jsx`)
- **Strengths**: Log broken bottles, expired batches, tester losses, deducts inventory automatically, monthly loss aggregation.
- **Identified Issues**:
  - The `losses` table does not have a `product_id` column; product ID is passed separately during creation.

#### 12. Notes Module (`src/modules/Notes.jsx`)
- **Strengths**: Operational sticky notes with priority tags (high, normal, low); doubles as metadata store for formulas and discount rules.

#### 13. Online Sales & Delivery Module (`src/modules/OnlineSales.jsx`)
- **Strengths**: Online delivery order management, customer address & phone capture, 30-hour grace window, status workflow (`new` -> `processing` -> `in_transit` -> `completed`).

#### 14. Returns & Refunds Module (`src/modules/Returns.jsx`)
- **Strengths**: 30-hour return policy enforcement, invoice lookup by ID, partial and full item returns, portion-aware stock restoration, sales profit & revenue adjustment.
- **Identified Issues**:
  - Multi-step return processing is not wrapped in a single database transaction.

#### 15. Withdrawals & Expenses Module (`src/modules/Withdrawals.jsx`)
- **Strengths**: Operational expense and owner withdrawal tracking, date range filters, summary statistics (total, average, max).

#### 16. Capital Injections Module (`src/modules/CapitalInjections.jsx`)
- **Strengths**: Cash additions to store capital, donor/partner tracking, drawer cash addition, full-text search.

#### 17. Categories Module (`src/modules/Categories.jsx`)
- **Strengths**: Product category management, icon picker (32 emoji icons), prevents deletion if category contains active products.

#### 18. Invoices Center Module (`src/modules/Invoices.jsx`)
- **Strengths**: Multi-tab invoice explorer (POS, Online, Purchases), full detail view, invoice deletion with automated stock restoration and debtor balance recalculation.

#### 19. Financial Analytics & Charts Module (`src/modules/Analytics.jsx`)
- **Strengths**: Interactive Recharts dashboards (Area, Bar, Pie charts), gross vs net profit, daily liquidity flow, top products ranking, A4 PDF & CSV export.

#### 20. AI Advisor Module (`src/modules/AIAdvisor.jsx`)
- **Strengths**: Direct LLM integration (Gemini, OpenRouter, DeepSeek, Groq, Ollama), executive queries (sales analysis, inventory health, debtor aging), graceful offline fallback.

#### 21. Executive Dashboard Module (`src/modules/Dashboard.jsx`)
- **Strengths**: Real-time KPI summary (Today Sales, Net Profit, Low Stock, Active Debt), revenue vs profit area charts, recent transactions table.
- **Identified Issues**:
  - Hardcoded `LOW_STOCK_THRESHOLD = 10` on line 66 instead of reading from `useSettingsStore`.

---

## 5. 20-Module Automated Testing & QA Suite Strategy (R4)

### 5.1 Test Framework Architecture

To ensure 100% offline verification without external network access, the test harness should be implemented using native Node.js (`node:test` + `node:assert`) or `better-sqlite3` in an in-memory / temporary test database environment.

```
test/
├── harness/
│   ├── db-test-helper.js         # In-memory SQLite fixture with full schema & migrations
│   ├── mock-ipc.js               # IPC bridge simulator for store/repository testing
│   └── test-runner.js            # Automated runner reporting pass/fail with Arabic summaries
├── unit/
│   ├── settings-store.test.js    # Settings persistence & reactive propagation tests
│   ├── auth-store.test.js        # PIN auth, role permissions & restrictions tests
│   ├── wac-calculator.test.js    # Weighted Average Cost precision tests
│   └── formatters.test.js        # Currency, Arabic date & barcode validation tests
└── e2e-modules/
    ├── 01_pos_cart.test.js       # POS: scanning, portion math, double discounts, checkout
    ├── 02_inventory.test.js      # Inventory: CRUD, duplicate barcode, stocktaking
    ├── 03_purchases.test.js      # Purchases: WAC updates, purchase deletion stock deduction
    ├── 04_debtors.test.js        # Debtors: debt accumulation, repayments, aging calculation
    ├── 05_barcode_studio.test.js # Barcode: EAN-13 check digit, batch generator
    ├── 06_mix_lab.test.js        # Mix Lab: multi-oil formulation, atomic deduction
    ├── 07_shift_close.test.js    # Shift Close: expected cash formula (including returns)
    ├── 08_settings.test.js       # Settings: 100% parameter SQLite persistence
    ├── 09_discounts.test.js      # Discounts: storewide/category/item & price restore
    ├── 10_gifts.test.js          # Gifts: inventory deduction & restore on delete
    ├── 11_losses.test.js         # Losses: damage logging & stock deduction
    ├── 12_notes.test.js          # Notes: priority filtering & formula persistence
    ├── 13_online_sales.test.js   # Online Sales: 30-hr modification & delivery pipeline
    ├── 14_returns.test.js        # Returns: partial/full return, portion stock restoration
    ├── 15_withdrawals.test.js    # Withdrawals: expense logging & cash impact
    ├── 16_capital.test.js        # Capital Injections: liquidity increase & drawer impact
    ├── 17_categories.test.js     # Categories: duplicate prevention & delete guards
    ├── 18_invoices.test.js       # Invoices: unified search & cascade deletion
    ├── 19_analytics.test.js      # Analytics: Gross/Net profit formulas, date filtering
    ├── 20_ai_advisor.test.js     # AI Advisor: query parsing & offline fallback
    └── 21_dashboard.test.js      # Dashboard: KPI calculation & low stock threshold
```

---

### 5.2 Test Specifications for All 20 Modules

#### 1. POS & Cart Test Spec (`01_pos_cart.test.js`)
- **Test 1.1**: Add product to cart, verify subtotal calculation: $\text{Subtotal} = \sum (\text{final\_price} \times \text{cart\_qty})$.
- **Test 1.2**: Apply percentage discount (e.g. 15%), verify total: $\text{Total} = \text{Subtotal} \times (1 - 0.15)$.
- **Test 1.3**: Apply fixed discount (e.g. 20 LYD), verify total: $\text{Total} = \max(0, \text{Subtotal} - 20)$.
- **Test 1.4**: Sell perfume in ml portion (e.g. 25ml from 100ml bottle), verify portion deduction math: $\text{Deducted Qty} = \frac{25}{100} = 0.25$ bottle.
- **Test 1.5**: Execute sale checkout, verify atomic insertion of `sales` and `sale_items`, and inventory reduction.

#### 2. Inventory & Stocktaking Test Spec (`02_inventory.test.js`)
- **Test 2.1**: Insert product with unique barcode, verify insertion and retrieval.
- **Test 2.2**: Attempt inserting product with duplicate barcode, verify constraint rejection.
- **Test 2.3**: Verify low-stock filter: products with $\text{qty} \le \text{low\_stock\_threshold}$ are flagged.
- **Test 2.4**: Physical stocktaking reconciliation: record counted quantity, calculate variance ($\text{Variance} = \text{Counted} - \text{System}$), adjust stock, and verify reconciliation audit record.

#### 3. Purchases & WAC Test Spec (`03_purchases.test.js`)
- **Test 3.1**: Initial stock: 10 units at 50 LYD cost. Purchase 10 units at 70 LYD cost.
  - Verify new WAC: $\text{WAC} = \frac{(10 \times 50) + (10 \times 70)}{10 + 10} = \frac{500 + 700}{20} = 60 \text{ LYD}$.
- **Test 3.2**: Delete purchase order, verify that purchased quantity is safely deducted from inventory without dropping below zero (`MAX(0, qty - purchased)`).

#### 4. Debtors & Aging Test Spec (`04_debtors.test.js`)
- **Test 4.1**: Create debtor account, record debt sale of 500 LYD. Verify `total_debt = 500`.
- **Test 4.2**: Record repayment of 200 LYD. Verify `total_debt = 300` and `debt_history` log created.
- **Test 4.3**: Calculate debt aging: transactions older than 30, 60, and 90 days correctly bucketed.
- **Test 4.4**: Delete debt invoice from Invoices module, verify debtor's `total_debt` is automatically reduced by 500 LYD.

#### 5. Barcode Studio Test Spec (`05_barcode_studio.test.js`)
- **Test 5.1**: Validate EAN-13 check digit calculation for prefix `628...`.
- **Test 5.2**: Batch generate barcodes for a list of 50 products, verify 100% uniqueness.

#### 6. Perfume Mix Lab Test Spec (`06_mix_lab.test.js`)
- **Test 6.1**: Formulate perfume: 1 bottle (5 LYD) + 15ml Oil A (0.8 LYD/ml = 12 LYD) + 35ml Alcohol (0.05 LYD/ml = 1.75 LYD).
  - Total unit cost: $5 + 12 + 1.75 = 18.75 \text{ LYD}$.
  - Retail price: 60 LYD.
  - Markup / Gross margin: $\frac{60 - 18.75}{60} \times 100 = 68.75\%$.
- **Test 6.2**: Batch produce 10 bottles: verify atomic creation of compound product (qty = 10) and stock deduction of 10 bottles, 150ml Oil A, and 350ml Alcohol.

#### 7. Shift Close & Drawer Test Spec (`07_shift_close.test.js`)
- **Test 7.1**: Calculate expected cash in drawer:
  $$\text{Expected Cash} = \text{Cash Sales} + \text{Capital Injections} - \text{Withdrawals} - \text{Cash Purchases} - \text{Cash Returns}$$
- **Test 7.2**: With Counted Cash = 1,450 LYD and Expected Cash = 1,450 LYD, verify variance = 0 (مطابق تماماً).
- **Test 7.3**: With Counted Cash = 1,400 LYD, verify variance = -50 LYD (عجز نقدي).
- **Test 7.4**: Save shift report, verify historical persistence in `shift_reports` table.

#### 8. Universal Settings Store Test Spec (`08_settings.test.js`)
- **Test 8.1**: Save updated `store_name`, `currency_symbol`, `tax_rate`, `invoice_prefix`, `low_stock_threshold` to SQLite.
- **Test 8.2**: Reload settings store from fresh connection, verify 100% exact retrieval.
- **Test 8.3**: Verify `window.__CURRENCY_SYMBOL__` update and reactive event trigger on currency symbol update.

#### 9. Discounts Test Spec (`09_discounts.test.js`)
- **Test 9.1**: Apply 20% discount to category "عطور شرقية", verify all products updated with `price = original_price * 0.8` and `discount_rate = 20`.
- **Test 9.2**: Remove discount rule, verify all products restored to exact `original_price`.

#### 10. Gifts Test Spec (`10_gifts.test.js`)
- **Test 10.1**: Dispatch 2 gift units of Product X (stock: 10), verify stock reduced to 8 and gift recorded.
- **Test 10.2**: Delete gift record, verify stock of Product X restored to 10.

#### 11. Losses & Damages Test Spec (`11_losses.test.js`)
- **Test 11.1**: Record 3 broken bottles of Product Y (stock: 15), verify stock reduced to 12.
- **Test 11.2**: Aggregate monthly loss total: verify sum of `cost_value` matches expected total.

#### 12. Notes Test Spec (`12_notes.test.js`)
- **Test 12.1**: Insert note with priority 'high', verify search by title prefix (`DISCOUNT:` / `FORMULA:`).

#### 13. Online Sales Test Spec (`13_online_sales.test.js`)
- **Test 13.1**: Create online order with customer phone & address, verify tagged with `type = 'online'`.
- **Test 13.2**: Status transition: `new` -> `processing` -> `in_transit` -> `completed`.

#### 14. Returns & Refunds Test Spec (`14_returns.test.js`)
- **Test 14.1**: Query sale within 30-hour policy window, perform partial return of 1 item from 3-item invoice.
- **Test 14.2**: Verify item inventory incremented, sale total reduced, sale profit adjusted, and return audit row created.
- **Test 14.3**: Attempt returning more items than purchased, verify rejection.

#### 15. Withdrawals Test Spec (`15_withdrawals.test.js`)
- **Test 15.1**: Log withdrawal of 150 LYD for electricity expense, verify record created and included in daily drawer calculation.

#### 16. Capital Injections Test Spec (`16_capital.test.js`)
- **Test 16.1**: Log capital injection of 2,000 LYD, verify record created and drawer cash incremented.

#### 17. Categories Test Spec (`17_categories.test.js`)
- **Test 17.1**: Create new category with icon.
- **Test 17.2**: Attempt deleting category that has 5 products assigned, verify deletion blocked.

#### 18. Invoices Center Test Spec (`18_invoices.test.js`)
- **Test 18.1**: Search invoices across POS, Online, and Purchases by ID or customer name.
- **Test 18.2**: Cascade delete invoice, verify sale items deleted, stock restored, debtor balance reduced.

#### 19. Financial Analytics Test Spec (`19_analytics.test.js`)
- **Test 19.1**: Calculate Gross Profit: $\text{Gross Profit} = \sum (\text{Revenue} - \text{COGS})$.
- **Test 19.2**: Calculate Net Margin: $\text{Net Margin} = \text{Gross Profit} - \text{Expenses} - \text{Losses}$.
- **Test 19.3**: Rank top-selling products by revenue and profit.

#### 20. AI Advisor Test Spec (`20_ai_advisor.test.js`)
- **Test 20.1**: Execute structured summary query: verify aggregation of revenue, profit, low stock count.
- **Test 20.2**: Offline resilience: when API call times out or fails, return formatted offline diagnostic report.

#### 21. Executive Dashboard Test Spec (`21_dashboard.test.js`)
- **Test 21.1**: Verify KPI card metrics matching SQLite aggregations for Today, Week, Month periods.
- **Test 21.2**: Dynamic low stock count reflects threshold from settings store.

---

## 6. Concrete Implementation Recommendations

1. **Native Atomic IPC Transaction Handler**:
   - Add `ipcMain.handle('db:transaction', ...)` to `main.cjs` using `db.transaction(fn)()`.
   - Update `DatabaseConnection.prototype.transaction` in `src/database/connection.js` to call `ipcRenderer.invoke('db:transaction', { queries })`.

2. **Universal Settings Store & UI Synchronization**:
   - Add a "General Store & Financial Configuration" tab to `Settings.jsx` exposing:
     - Store Branding (`store_name`, `store_subtitle`, `store_phone`, `store_address`, `commercial_reg`, `tax_id`).
     - Currency Configuration (`currency_symbol`, `currency_name`).
     - Tax & Invoicing (`tax_rate`, `invoice_prefix`, `purchase_prefix`).
     - Inventory Safety (`low_stock_threshold`, `default_unit`, `auto_calculate_wac`).
   - Add User Management & Permissions tab in `Settings.jsx` (R1).
   - In `useSettingsStore.js`, update `window.__CURRENCY_SYMBOL__` on load/save.
   - In `useLabelsStore.js`, hydrate custom labels from SQLite `settings` table on startup.

3. **Wrap Multi-Step Operations in Atomic Transactions**:
   - `SalesRepository.createSaleWithItems`: Include sale master insert in the transaction.
   - `Returns.jsx.processReturn`: Bundle return record insert, stock restoration, and sale updates into a single transaction.
   - `PerfumeMixLab.jsx.handleFinalizeFormula`: Bundle product creation and ingredient stock deductions into a single transaction.
   - `Discounts.jsx.applyDiscount`: Execute product price updates as a batch transaction.

4. **Shift Close Expected Cash Formula**:
   - Update `ShiftClose.jsx` expected cash formula to subtract Cash Returns:
     `expectedCash = cashSales + capitalInjections - withdrawals - cashPurchases - cashReturns`.

5. **Automated Test Suite Integration**:
   - Add `"test": "node test/harness/test-runner.js"` to `package.json` scripts.
   - Implement the test harness covering all 20 modules with zero-external-dependency Node.js tests.
