# Original User Request

## 2026-08-27T19:43:26Z

An autonomous multi-agent engineering and QA testing team for Aldaffa Perfumes ERP (الدفة للعطور). The agent team systematically explores all 20 desktop ERP modules, tests edge cases, detects UI glitches and data integrity flaws, verifies full settings editability, and implements requested new features.

Working directory: /home/rdluffy/Desktop/aldaffa-app-desktop
Integrity mode: development

## Requirements

### R1. User Roles & Granular Permissions System (نظام المستخدمين والصلاحيات)
- Create SQLite tables for users & permissions (`users`, `user_permissions`) with secure PIN/Password login and quick user switching.
- Support 3 primary roles: **المدير العام (Manager)**, **المحاسب (Accountant)**, **الكاشير المناوب (Cashier)**.
- Integrate permissions checks across all 20 ERP modules (e.g. restrict cost/profit visibility, delete operations, or sandbox purges based on role).
- Provide a dedicated management screen in `Settings.jsx` to add/edit users, assign PINs, and toggle feature permissions individually.

### R2. Advanced Financial Analytics & Profit Charts Module (التقارير المالية المتقدمة والرسوم البيانية)
- Build interactive visual dashboards for revenue, gross profit, daily liquidity flow, and sales trends using responsive charts.
- Top-selling & highest-profit products ranking with category distribution breakdown.
- One-click export of executive financial reports to pristine A4 PDF & CSV formats.

### R3. Universal Settings & Full System Customization
- Ensure 100% of application parameters (store identity, print mode, tax %, currency symbol, invoice prefixes, low stock thresholds, section labels) are fully editable via Settings and persisted in SQLite (`useSettingsStore`).

### R4. Multi-Agent Automated QA & Testing Suite
- Run automated end-to-end tests across all modules (POS, Inventory, Purchases, Debtors, Barcode Studio, Mix Lab, Shift Close, Settings) to verify zero crashes, clean transaction handling, and accurate calculations.

## Acceptance Criteria

### Security & Roles
- [ ] User login and PIN authentication enforced on app launch and user switch.
- [ ] Restricted actions (e.g. invoice deletion, data purge, profit view) are hidden or blocked for Cashier role.
- [ ] Permissions configuration in Settings immediately takes effect across the application.

### Analytics & Reports
- [ ] Charts dynamically update based on date ranges (Today, This Week, This Month, Year-to-Date).
- [ ] Financial report PDF exports render clean Arabic layout with store branding.

### Integrity & Stability
- [ ] 100% clean SQLite transactions without locking errors.
- [ ] Zero unhandled IPC errors during print, export, or deletion.
