# Aldaffa Perfumes ERP — Full Implementation Changelog

**Engineer**: Worker 1 (Full ERP Implementation Engineer)  
**Date**: 2026-08-27  
**Scope**: Milestones 1, 2, 3, and 4 (RBAC, Financial Analytics, Universal Settings, Native Transactions & Automated QA)

---

## 1. Milestone 1: User Roles & Granular Permissions System (R1)
- **`src/database/repositories/UsersRepository.js`**:
  - Exported standard `ROLE_PRESETS` for `manager`, `accountant`, and `cashier` defining all 21 module keys and 7 special action keys.
  - Implemented automatic default users seeding:
    - Manager: `admin_1` (PIN `1234`, role `manager`)
    - Accountant: `usr_accountant` (PIN `5678`, role `accountant`)
    - Cashier: `usr_cashier` (PIN `0000`, role `cashier`)
  - Implemented `checkPinAvailability(pin, excludeUserId)` ensuring unique PINs across staff.
  - Implemented sole manager deletion guard preventing deletion of the only remaining manager.
- **`src/stores/useAuthStore.js`**:
  - Defined comprehensive permission keys covering all 21 modules (`module_*`) and 7 special actions (`delete_invoice`, `change_price`, `apply_discount`, `view_profit`, `purge_data`, `edit_settings`, `delete_shift`).
  - Added session locking state `isLocked`, `lockApp()`, `unlockApp(pin)`, `quickSwitchUser(user, pin)`.
  - Added reactive permission checking helpers `hasPermission(key)` and `canAccessModule(moduleId)`.
- **`src/components/auth/LockScreenModal.jsx` & `QuickUserSwitchModal.jsx`**:
  - Created full-screen lock screen modal with numpad PIN entry and shake animation on invalid PIN.
  - Created quick staff user switch modal with fast avatar grid and PIN verification.
- **`src/App.jsx`**:
  - Hydrated users on startup, guarded tab navigation using `canAccessModule(activeTab)`, redirecting unauthorized access to `pos`.
  - Wired `LockScreenModal` and `QuickUserSwitchModal`.
- **`src/components/layout/Header.jsx` & `Navigation.jsx`**:
  - Added current user badge with Arabic role label, Lock Screen button, Quick Switch button.
  - Guarded sandbox purge button with `hasPermission('purge_data')`.
  - Filtered visible module tabs in sidebar and navigation to only show authorized modules for active role.
- **`src/modules/Settings.jsx`**:
  - Added "المستخدمين والصلاحيات" (Users & Permissions) tab.
  - Added staff list table, Add/Edit User modal with 21 module checkboxes, 7 special action toggles, and role preset auto-fill buttons.
  - Added user deletion confirmation modal with sole manager protection.
- **Granular UI & Profit Guards**:
  - `POS.jsx`: Price modification guarded with `change_price`; discount override guarded with `apply_discount`.
  - `Invoices.jsx`: Trash deletion button guarded with `delete_invoice`.
  - `InventoryFull.jsx`: Unit costs, wholesale prices, and total valuation masked with `'••••••'` when `!hasPermission('view_profit')`.
  - `ShiftClose.jsx`: Net profit and sales row profits masked when `!hasPermission('view_profit')`; shift report deletion guarded by manager role.
  - `Dashboard.jsx`: Profit KPI card and profit chart series hidden when `!hasPermission('view_profit')`.
  - `Debtors.jsx` & `Purchases.jsx`: Delete operations guarded with permissions.

---

## 2. Milestone 2: Advanced Financial Analytics & Profit Charts Module (R2)
- **`src/database/repositories/SalesRepository.js`**:
  - Implemented `getMostProfitableProducts(limit, startDate, endDate)` returning product revenue, profit, quantity, and profit margin percentage.
  - Implemented `getSalesByCategory(startDate, endDate)` returning sales, quantities, and profit per category.
  - Ensured date range queries (`getSalesInRange`, `getSalesSummary`, `getTopSellingProducts`) use indexed SQLite timestamp filtering.
- **`src/modules/Analytics.jsx`**:
  - Overhauled with luxury double-bezel card design and dark glassmorphic styling.
  - Replaced memory-bound `findAll()` with indexed range queries (`getSalesInRange`, `getPurchasesInRange`, `getWithdrawalsInRange`, `getLossesInRange`, `getInjectionsInRange`, `getTopSellingProducts`, `getMostProfitableProducts`, `getSalesByCategory`).
  - Implemented 5 date filter presets (`today`, `this_week`, `this_month`, `ytd`, `custom`) and date picker UI.
  - Implemented 8 financial KPI cards (Total Revenue, Gross Profit, Net Profit, Operating Profit Margin %, Average Order Value, Total Purchases, Total Withdrawals, Total Losses, Total Capital).
  - Implemented 4 interactive Recharts charts:
    1. Revenue & Profit Trend AreaChart with gradient fills
    2. Daily Liquidity Flow BarChart (Cash In vs Cash Out)
    3. Category Distribution BarChart
    4. Payment Methods Distribution PieChart
  - Implemented dual-tab product ranking table (Top Selling by Qty vs Most Profitable by Margin & Profit).
  - Implemented CSV export with UTF-8 BOM (`\uFEFF`) and proper column headers.
  - Implemented PDF export calling `export:financial-pdf` IPC handler.
- **`main.cjs`**:
  - Implemented `export:financial-pdf` IPC handler generating pristine A4 PDF report with store branding, date range, 8 KPIs, payment breakdown, category breakdown, top products table, and authorized sign-off box.

---

## 3. Milestone 3: Universal Settings & System Customization (R3)
- **`src/modules/Settings.jsx`**:
  - Added "الإعدادات العامة والمالية" (General & Financial Settings) tab exposing store identity, currency symbol, currency name, invoice prefix, purchase prefix, low stock threshold, commercial registration, tax ID, and tax rate.
- **`src/stores/useSettingsStore.js`**:
  - Added reactive synchronization of `window.__CURRENCY_SYMBOL__` on store hydration, update, and reset.
- **`src/stores/useLabelsStore.js`**:
  - Added `analytics` and `invoices` module label defaults and implemented SQLite database synchronization on mount.
- **`src/utils/helpers.js` & Print Templates**:
  - `formatCurrency` dynamically checks `customSymbol || window.__CURRENCY_SYMBOL__ || 'د.ل'`.
  - Updated all print handlers in `main.cjs` (`print:receipt`, `print:purchase-order`, `generateShiftReportHtml`, `print:inventory-report`, `getPrintSettings`) to dynamically read configured `currency_symbol` from settings table.

---

## 4. Milestone 4: Native Atomic Transactions & Automated QA (R4)
- **`main.cjs`**:
  - Implemented native atomic transaction handler `ipcMain.handle('db:transaction', async (event, { queries }) => { ... })` executing queries inside a synchronous `db.transaction()` block with automatic rollback on error.
- **`src/database/connection.js`**:
  - Updated `db.transaction(queries)` to execute via single atomic IPC call `_executeWithRetry('db:transaction', { queries })`.
- **Multi-Query Operations Wrapped in Atomic Transactions**:
  - `src/modules/Returns.jsx`: Stock restoration + sale item adjustment/deletion + sale total/profit update + return record insertion bundled into a single atomic transaction.
  - `src/modules/PerfumeMixLab.jsx`: Compound perfume creation + bottle/oil/alcohol raw material stock deduction + formula note creation bundled into a single atomic transaction.
  - `src/modules/Discounts.jsx`: Multi-product price modification + discount note creation bundled into atomic transaction; restore discount bundled into atomic transaction.
  - `src/database/repositories/SalesRepository.js`: Sale master creation + sale items insertion + stock deduction bundled into atomic transaction; sale deletion with stock restoration and debtor adjustment bundled into atomic transaction.
- **Shift Close Reconciliation Fix**:
  - `src/modules/ShiftClose.jsx`: Corrected expected cash drawer formula to subtract cash returns:
    `expectedCash = totalCashSales + totalCapital - totalWithdrawals - totalCashPurchases - totalCashReturns`.
- **Automated QA Test Harness & Test Suites**:
  - `test/harness/test-db.js`: In-memory SQLite database provider with complete production schema and transaction support.
  - `test/harness/test-runner.js`: Automated discovery and execution engine with execution timing and summary.
  - `test/suites/01_rbac_permissions.test.js`: 4 test cases verifying role presets, user seeding, PIN collision guards, and sole manager deletion protections.
  - `test/suites/02_atomic_transactions.test.js`: 3 test cases verifying multi-query commits, automatic rollbacks on errors, and return transactions.
  - `test/suites/03_sales_analytics.test.js`: 3 test cases verifying indexed range queries, top profitable products aggregation, and category breakdown.
  - `test/suites/04_shift_close_math.test.js`: 2 test cases verifying cash drawer formulas, return subtractions, and shift report database storage.
  - `test/suites/05_modules_coverage.test.js`: 12 test cases verifying CRUD operations and business logic across all 20 modules.
  - Added `"test": "node test/harness/test-runner.js"` in `package.json`.
