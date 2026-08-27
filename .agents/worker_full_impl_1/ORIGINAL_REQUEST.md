## 2026-08-27T19:53:31Z

You are Worker 1 (Full ERP Implementation Engineer).
Your working directory is: /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/worker_full_impl_1
Target Project: /home/rdluffy/Desktop/aldaffa-app-desktop

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

READ THE EXPLORER HANDOFF REPORTS CAREFULLY:
1. /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/teamwork_preview_explorer_arch_1/handoff.md
2. /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/teamwork_preview_explorer_analytics_2/handoff.md
3. /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/teamwork_preview_explorer_settings_qa_3/handoff.md
4. /home/rdluffy/Desktop/aldaffa-app-desktop/PROJECT.md

YOUR COMPLETE IMPLEMENTATION TASKS:

1. MILESTONE 1 (R1: User Roles & Granular Permissions System):
   - `src/database/repositories/UsersRepository.js`:
     * Seed 3 default roles if empty: Manager (`admin_1`, PIN `1234`, role `manager`), Accountant (`usr_accountant`, PIN `5678`, role `accountant`), Cashier (`usr_cashier`, PIN `0000`, role `cashier`).
     * Implement `checkPinAvailability(pin, excludeUserId)`.
     * Prevent deleting the sole remaining manager account.
     * Export standard `ROLE_PRESETS` for `manager`, `accountant`, and `cashier`.
   - `src/stores/useAuthStore.js`:
     * Define comprehensive `PERMISSION_KEYS` covering all 20 modules and 6 special actions (`delete_invoice`, `change_price`, `apply_discount`, `view_profit`, `purge_data`, `edit_settings`).
     * Add `isLocked` state, `lockApp()`, `unlockApp(pin)`, `quickSwitchUser(user, pin)`, `hasPermission(key)`, `canAccessModule(moduleId)`.
   - `src/App.jsx`:
     * Load users on app start, render full-screen `LockScreenModal` when locked.
     * Filter module routes and navigation with `canAccessModule()`, redirecting unauthorized access to `pos`.
   - `src/components/layout/Header.jsx`:
     * Display current user badge (name & role in Arabic), quick switch user and lock screen buttons.
     * Hide or disable the sandbox purge button if `!hasPermission('purge_data')`.
   - `src/components/layout/Navigation.jsx`:
     * Filter module tabs so only authorized modules appear for the active user role.
   - `src/modules/Settings.jsx`:
     * Add "المستخدمين والصلاحيات" (Users & Permissions) tab with staff list, Add/Edit User modal, role selector, PIN configuration, granular toggle matrix.
   - Granular Module Guards:
     * `POS.jsx`: Guard manual price editing with `change_price` and discount overrides with `apply_discount`.
     * `Invoices.jsx`: Guard `<Trash2>` deletion with `delete_invoice`.
     * `InventoryFull.jsx`: Mask cost prices and total stock valuation if `!hasPermission('view_profit')`; guard delete buttons.
     * `ShiftClose.jsx`: Mask `صافي الأرباح المحققة` if `!hasPermission('view_profit')`; guard delete shift report.
     * `Dashboard.jsx`: Hide profit KPI card and profit chart series if `!hasPermission('view_profit')`.
     * `Debtors.jsx` & `Purchases.jsx`: Guard destructive delete operations.

2. MILESTONE 2 (R2: Advanced Financial Analytics & Profit Charts Module):
   - `src/database/repositories/SalesRepository.js`:
     * Implement `getMostProfitableProducts(limit, startDate, endDate)` and `getSalesByCategory(startDate, endDate)`.
     * Ensure database-level date range queries are indexed and efficient.
   - `src/modules/Analytics.jsx`:
     * Replace memory-bound `findAll()` with indexed date range queries for sales, purchases, withdrawals, losses, and capital injections.
     * Implement date filter buttons (`today`, `this_week`, `this_month`, `ytd`, `custom`) and Custom Date Range picker UI.
     * 8 KPI cards: Total Revenue, Cost of Goods Sold (COGS), Gross Profit, Net Profit Margin %, Purchases, Cash Inflow, Cash Outflow, Average Order Value (AOV).
     * 4 Recharts visual charts: Revenue & Profit Trend, Daily Liquidity Flow (Cash In vs Cash Out with net line), Category Distribution Breakdown, Payment Methods Split.
     * Dual-tab table: Top Selling Products (by quantity) vs Most Profitable Products (by profit amount and margin %).
     * One-click CSV export with UTF-8 BOM and proper column headers.
   - `main.cjs`:
     * Add `export:financial-pdf` IPC handler and `generateFinancialReportHtml` generating pristine A4 PDF with store branding and Arabic CSS.

3. MILESTONE 3 (R3: Universal Settings & Full System Customization):
   - `src/modules/Settings.jsx`:
     * Add "الإعدادات العامة والمالية" (General & Financial Settings) tab exposing `tax_rate`, `currency_symbol`, `currency_name`, `invoice_prefix`, `purchase_prefix`, `low_stock_threshold`, `commercial_reg`, `tax_id`.
   - `src/stores/useSettingsStore.js`:
     * Ensure `window.__CURRENCY_SYMBOL__` is set on hydration and updated reactively.
     * Ensure all 33 settings parameters are saved to and loaded from SQLite `settings` table.
   - `src/stores/useLabelsStore.js`:
     * Synchronize custom tab labels with SQLite settings on mount.
   - Global Hardcoded String Cleanups:
     * Replace hardcoded `د.ل` and store name strings across `Header.jsx`, `POS.jsx`, `PerfumeMixLab.jsx`, `Purchases.jsx`, `BarcodeStudio.jsx`, `Dashboard.jsx`, and `main.cjs` print templates with reactive settings.

4. MILESTONE 4 (R4: Multi-Agent Automated QA & Testing Suite + IPC Safety):
   - `main.cjs`:
     * Implement native atomic `ipcMain.handle('db:transaction', async (event, { queries }) => { ... })` wrapping all queries inside a synchronous `db.transaction()` block.
   - `src/database/connection.js`:
     * Implement `transaction(queries)` using the single atomic IPC `db:transaction` call.
   - Wrap multi-query operations in `Returns.jsx`, `PerfumeMixLab.jsx`, `SalesRepository.js`, and `Discounts.jsx` in atomic transactions.
   - Fix `ShiftClose.jsx`: Subtract Cash Returns in expected drawer cash calculation:
     `expectedCash = totalCashSales + totalCapital - totalWithdrawals - totalCashPurchases - totalCashReturns`.
   - Automated QA Test Harness:
     * Create comprehensive test suite in `test/` directory (`test/harness/test-runner.js` and individual test suites for all 20 modules, transactions, rollbacks, and permissions).
     * Add `"test": "node test/harness/test-runner.js"` in `package.json`.
     * Run `npm run build` and `npm test` and ensure all tests pass 100%!

5. DELIVERABLES:
   - Run `npm run build` and `npm test` to verify build & tests pass.
   - Document all changes in `.agents/worker_full_impl_1/changes.md`.
   - Write a structured handoff report in `.agents/worker_full_impl_1/handoff.md`.
   - Send completion message to parent orchestrator.

## 2026-08-27T20:10:19Z
**Context**: Progress Check for Full ERP Implementation (Milestones 1-4)
**Content**: Orchestrator heartbeat check. Please report your current implementation status across M1 (RBAC/permissions), M2 (Financial Analytics/charts/PDF), M3 (Settings/customization), and M4 (Atomic transactions/test suite).
**Action**: Please update your progress.md and reply with a brief status summary.
