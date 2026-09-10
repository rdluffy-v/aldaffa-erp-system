# Project: Aldaffa Perfumes ERP 22-Module Audit & Production Hardening

## Architecture
Aldaffa Perfumes ERP (منظومة الدفة للعطور) is an offline-first desktop ERP application built with:
- **Renderer**: React 18 / Vite 5 / TailwindCSS / Lucide Icons / Recharts with 22 functional business modules.
- **Main Process**: Electron 28 with context isolation (`contextIsolation: true`, `nodeIntegration: false`), safe contextBridge (`window.aldaffa.ipcRenderer`), and IPC security sanitization.
- **Database**: SQLite 3 via `better-sqlite3` with WAL mode, parameterized statements, synchronous atomic transactions (`db.transaction`), and daily backup snapshots.
- **Printing & Hardware**: TSPL 203/300 DPI thermal barcode engine, ESC/POS 80mm thermal receipt generator, A4 PDF generation via Chromium print-to-PDF, and CUPS/lp direct hardware integration.
- **Exporting**: CSV exports with UTF-8 BOM (`\uFEFF`) for Arabic Excel compatibility and PDF reports.
- **Packaging**: Electron-builder configuring Debian `.deb`, AppImage, and portable binaries.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | POS Module & Cart Engine | Full checkout, barcode scan buffer, portions/decants modal, retail/wholesale pricing, discounts (% and fixed), multi-payment split (cash, card, bank, debt). | M1 | VERIFIED |
| 2 | Invoices & Purchase Orders UI | Invoices list, reprint receipt, PDF export, PO creation and receipt generator. | M1 | VERIFIED |
| 3 | Purchases 4-Step Wizard | Wizard, Gemini AI OCR receipt scanner, dynamic catalog injector, WAC costing, TSPL barcode studio. | M1 | VERIFIED |
| 4 | Returns Management | POS vs Online returns, invoice ID lookup, item return quantity picker, stock restoration, partial refunds. | M1 | VERIFIED |
| 5 | Online Sales Management | Customer phone, delivery city, catalog selector, shipment timeline, 30-hour edit window. | M1 | VERIFIED |
| 6 | Shift Close & Drawer Reconciliation | Drawer reconciliation equation, variance calculation, 8 detail tabs, save shift report, export PDF, print thermal. | M1 | VERIFIED |
| 7 | Full Inventory CRUD & Filtering | Product catalog CRUD, debounced search, category filter, low-stock filter, pagination, quick category creator. | M1 | VERIFIED |
| 8 | Categories Management | Category CRUD, 32 emoji icon picker + custom emoji, orphan product guard. | M1 | VERIFIED |
| 9 | Perfume Mix Lab | 5-step compounding wizard, bottle size, oil blending, solvent ratios, perfume grading, ingredient stock deduction. | M1 | VERIFIED |
| 10 | Barcode Studio & Thermal Presets | Thermal label generator, 50x30/40x20/60x40/80mm/A4 presets, barcode text/price customization, gap sensor calibration. | M1 | VERIFIED |
| 11 | Withdrawals & Expenses Log | Cash expenses list, date range filter, summary cards, delete modal with financial deduction. | M1 | VERIFIED |
| 12 | Debtors Ledger & Aging | Debtors list & aging report (0-30, 31-60, 61-90, 90+ days), payment timeline, delete debtor with cascade history. | M1 | VERIFIED |
| 13 | Capital Injections | Capital injections list, date range filter, donor history chips, summary stats. | M1 | VERIFIED |
| 14 | Losses & Damages Log | Broken bottles & expired items log, damage reasons, inventory deduction, delete modal. | M1 | VERIFIED |
| 15 | Promotional Gifts Log | Promotional gifts & tester bottles, inventory deduction, inventory restore on delete, summary metrics. | M1 | VERIFIED |
| 16 | Discounts Studio | Storewide, category, or single product discounts, updates `original_price`/`discount_rate`, 1-click price restore. | M1 | VERIFIED |
| 17 | Analytics & Financial Reports | Income statement, revenue charts, expense breakdown, financial PDF export, CSV export with UTF-8 BOM. | M1 | VERIFIED |
| 18 | Executive Dashboard | Executive dashboard, today/week/month presets, delta comparisons, low-stock alerts, top selling products. | M1 | VERIFIED |
| 19 | Operational Notes | Notes & tasks, 4 priorities, search & filter chips, CRUD modal. | M1 | VERIFIED |
| 20 | AI Advisor Co-pilot | Multi-provider AI co-pilot (OpenRouter, DeepSeek, Gemini, Groq, OpenAI, Ollama), connection test, tool execution. | M1 | VERIFIED |
| 21 | Settings & RBAC Management | 8 tabs (Guide, General, Users/RBAC, Print Studio, Mobile Sync, Labels, Archive & Maintenance, AI Updates). | M1 | VERIFIED |
| 22 | Navigation & App Shell | App shell, dynamic navigation bar, header with clock, lock screen modal, quick user switch modal. | M1 | VERIFIED |
| 23 | Mathematical Invariant Engine | NaN/Infinity prevention, non-negative stock guards, fixed-point rounding precision. | M2 | VERIFIED |
| 24 | Bidirectional Stock Conservation | Stock consistency across purchases (+), sales (-), returns (+), decants, mixes, losses (-), gifts (-). | M2 | VERIFIED |
| 25 | Cash Drawer Financial Balancing | Precise closing formula: Expected Cash = Sales + Capital - Withdrawals - Purchases - Cash Returns. | M2 | VERIFIED |
| 26 | TSPL 203/300 DPI Thermal Printing | 1-bit monochrome TSPL buffer generation, coordinate mapping, direct USB/CUPS streaming. | M3 | VERIFIED |
| 27 | ESC/POS Receipt Printing | 80mm/58mm thermal receipt layout, Arabic text formatting, cut commands, preview modal. | M3 | VERIFIED |
| 28 | A4 PDF Invoice & Report Generator | Chromium print-to-PDF, styled invoice layouts, landscape financial summaries. | M3 | VERIFIED |
| 29 | UTF-8 BOM CSV Export Engine | Prepend `\uFEFF` before CSV strings for Arabic compatibility across all modules. | M3 | VERIFIED |
| 30 | Packaging & Preload Bundling | Guarantee `preload.cjs` inclusion in `package.json.build.files` for Debian `.deb` packages. | M3 | VERIFIED |
| 31 | Automated QA Test Suite Expansion | 36 test suites, 247 test cases, 100% test pass rate. | M4 | VERIFIED |
| 32 | Production Build & Packaging Verification | Clean Vite production build and Debian `.deb` package generation verification (`release/aldaffa-app-desktop_2.3.40_amd64.deb`). | M4 | VERIFIED |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | 22-Module UI & Button Action Verification | Audit all 22 JSX modules, fix `Analytics.jsx`, `Invoices.jsx`, `Debtors.jsx`, `PerfumeMixLab.jsx`, `Inventory.jsx`, `Settings.jsx`, verify all buttons, modals, callbacks, and RBAC guards. | Survey | DONE |
| M2 | Mathematical Invariants & State Consistency | Validate and harden POS totals, decants, WAC costing, cash drawer balancing, negative stock guards, and NaN protections. | M1 | DONE |
| M3 | Print, Export & Packaging Configuration | Verify TSPL 203/300 DPI, ESC/POS, PDF, CSV UTF-8 BOM, and verify `package.json` `"build"."files"` with `"preload.cjs"`. | M1 | DONE |
| M4 | QA Test Suite Expansion & Production Packaging | 36 test suites, 247 tests, 100% pass rate, clean Vite build, verified Debian `.deb` release package. | M2, M3 | DONE |

## Code Layout
- `src/App.jsx` — Core application router and module state registry.
- `src/components/` — Reusable layout, navigation, modals, and auth components.
- `src/modules/` — All 22 business modules.
- `src/utils/electronBridge.js` — Safe IPC renderer accessor (`getIpcRenderer()`, `isElectronRuntime()`).
- `main.cjs` — Electron main process, IPC handler registry, SQLite repository, TSPL/ESC-POS/PDF print generators.
- `preload.cjs` — Context bridge exposing `window.aldaffa.ipcRenderer`.
- `package.json` — Dependency management and Electron builder configuration.
- `test/` — SQLite automated QA test runner and 36 test suites (`test-runner.js`, `suites/*.test.js`).
- `release/aldaffa-app-desktop_2.3.40_amd64.deb` — Production Debian installation package.
