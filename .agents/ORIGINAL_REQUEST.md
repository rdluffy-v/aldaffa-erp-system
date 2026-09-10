# Original User Request

## Initial Request — 2026-09-01T15:40:03Z

You are the Project Orchestrator for Aldaffa Perfumes ERP (منظومة الدفة للعطور) comprehensive 22-module audit, button action verification, mathematical invariant hardening, QA test suite expansion, and production packaging.

Your working directory is: /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/orchestrator_audit/
Authoritative user request: /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/ORIGINAL_REQUEST.md

Scope & Requirements:
1. Complete System-Wide Audit & Button Action Verification (فحص وتدقيق كافة الأزرار والمدخلات): Exhaustive static and dynamic verification across all 22 JSX modules (POS, Inventory, Purchases, Returns, Invoices, OnlineSales, Expenses, Categories, Debtors, PerfumeMixLab, Barcodes, Settings, ShiftClose, Users/RBAC, Notes, Capital, Gifts, Losses, Archives, Analytics). Ensure every button, modal, form submission, and callback triggers reliably with zero unhandled errors.
2. Input & Business Logic Mathematical Invariants (سلامة المدخلات والمنطق الرياضي): Prevent NaN, Infinity, negative stock, and rounding drift across all numerical operations. Validate bidirectional stock consistency (purchases, sales, returns, decants, mix formulations).
3. Output, Exporting, and Print Hardening (سلامة المخرجات والطباعة والتصدير): Verify PDF generation, A4 invoice printing, ESC/POS receipt printing, TSPL 203/300 DPI barcode printing, and CSV exports across all modules. Ensure graceful error handling.
4. Automated Multi-Agent QA Verification Suite (جناح الاختبارات المؤتمتة): 100% pass rate across SQLite test harness, clean Vite production build, and successful Debian (.deb) package generation.

Decompose these tasks, spawn specialist subagents (explorers, workers, reviewers, challengers), track progress continuously in your progress.md, and synthesize results. Deliver handoff when ready for Victory Audit.
## 2026-09-01T17:52:16Z

<USER_REQUEST>
Comprehensive quality audit, reactivity verification, and automated release pipeline for Aldaffa Perfumes Desktop ERP (Electron, React, SQLite, TSPL Thermal Engine).

Working directory: /home/rdluffy/Desktop/aldaffa-app-desktop
Integrity mode: development

## Requirements

### R1. UI Reactivity & Module Health Audit
Verify that every action button and state mutation across all 22 modules triggers immediate reactive UI feedback without requiring page reload, screen switching, or manual data re-fetching. Prevent unhandled React exceptions, race conditions, and console errors during rapid user interactions.

### R2. Mathematical Invariants & Data Integrity Verification
Audit and enforce exact financial and inventory invariant calculations across all database operations:
- Stock deduction and Weighted Average Cost (WAC) preservation in Purchases, Sales, Perfume Mix Lab, Returns, and Gifts.
- Exact arithmetic balance in Debtors ledgers, Capital Injections, Expense Withdrawals, and POS Cash Drawer Shift Closings.

### R3. Automated Test Verification & Debian Package Release
Execute the complete automated test harness, verify 100% pass rate, ensure clean Vite build with zero unresolved imports, and package the production .deb binary and update manifest.

## Acceptance Criteria

### UI & Reactivity
- [ ] Every button and action trigger in all 22 modules updates the active view immediately with zero required screen refreshes.
- [ ] Zero unhandled exceptions or state synchronization failures occur during rapid user interaction cycles.

### Data Integrity & Financial Precision
- [ ] Purchases, Sales, Mix Lab, Returns, and Gifts accurately maintain stock levels and Weighted Average Cost (WAC) invariants.
- [ ] Debtor transactions, Capital Injections, and POS Cash Drawer reconciliation match exact mathematical sums with zero variance discrepancy.

### Stability & Packaging
- [ ] 100% automated test pass rate across all SQLite, IPC, and unit test suites.
- [ ] Clean Vite production build with zero syntax or bundling warnings.
- [ ] Successful packaging of release/aldaffa-app-desktop_*.deb and generation of release/latest-linux.yml.
</USER_REQUEST>
