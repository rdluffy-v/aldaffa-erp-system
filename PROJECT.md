# Project: Aldaffa Perfumes ERP (الدفة للعطور)

## Architecture
- **Desktop Runtime**: Electron 43 + Node.js + Vite 8
- **Frontend UI**: React 19 + Tailwind CSS + Lucide Icons + Recharts + Framer Motion
- **State Management**: Zustand stores (`useAuthStore`, `useSettingsStore`, `useInventoryStore`, `useCartStore`, `useUIStore`, `useLabelsStore`)
- **Persistence**: SQLite (via `better-sqlite3` in Electron Main process / repository pattern via IPC or direct backend)
- **Module Count**: 20 desktop ERP modules (POS, Inventory, InventoryFull, Purchases, Invoices, Debtors, BarcodeStudio, PerfumeMixLab, ShiftClose, Analytics, Dashboard, AIAdvisor, CapitalInjections, Categories, Discounts, Gifts, Losses, Notes, OnlineSales, Returns, Settings, Withdrawals)

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: User Roles & Granular Permissions System | SQLite user/permissions schema, PIN auth, role restrictions across all 20 modules, user management UI in Settings | none | DONE |
| 2 | M2: Advanced Financial Analytics & Profit Charts | Interactive Recharts dashboards, profit/revenue trends, product rankings, PDF (A4) & CSV export with Arabic branding | M1 | DONE |
| 3 | M3: Universal Settings & Full System Customization | 100% parameter editability, store branding, tax, printer configs, section labels, reactive store sync | M1 | DONE |
| 4 | M4: Multi-Agent Automated QA & 20-Module Testing Suite | Automated test harness, transaction locking verification, IPC safety, 20-module E2E validation | M1, M2, M3 | DONE |


## Interface Contracts
### Auth Store (`useAuthStore`) ↔ ERP Modules
- State: `currentUser`, `permissions`, `isAuthenticated`, `roles`
- Methods: `login(pin)`, `logout()`, `switchUser(pin)`, `hasPermission(permissionKey)`
- Default Roles: `manager` (المدير العام), `accountant` (المحاسب), `cashier` (الكاشير المناوب)

### Settings Store (`useSettingsStore`) ↔ SQLite Repository & UI
- State: Store branding, Tax rate, Currency, Invoice prefix, Thermal print config, Low stock threshold, UI section labels
- Methods: `updateSetting(key, value)`, `saveSettings()`, `loadSettings()`, `exportBackup()`, `importBackup()`

### Financial Analytics (`Analytics.jsx`) ↔ Database Repositories
- Date Ranges: `today`, `this_week`, `this_month`, `ytd`, `custom`
- Metrics: Total Revenue, Gross Profit, Net Margin, Liquidity Flow, Top Selling Items, Category Breakdown
- Export: `exportFinancialPDF()`, `exportFinancialCSV()`

## Code Layout
- `main.cjs`: Electron main process, IPC handlers, SQLite connection & schema initialization
- `src/database/`: SQLite repositories (`UsersRepository`, `SettingsRepository`, `SalesRepository`, etc.)
- `src/stores/`: Zustand reactive stores
- `src/modules/`: 20 ERP module views and workflows
- `src/components/`: Shared UI components, layout, modals, print templates
- `src/utils/`: Formatting, calculation helpers, barcode/PDF generators
