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

## 2026-08-30T05:55:35Z

Build the official mobile companion application and cloud sync backend for Aldaffa Perfumes ERP (الدفة للعطور). The companion app connects seamlessly via Cloudflare Hybrid Sync, enables camera-based live barcode scanning for instant inventory stocktaking, provides a lightweight mobile POS checkout, and displays real-time store financial KPIs.

Working directory: /home/rdluffy/Desktop/aldaffa-app-desktop
Integrity mode: development

## Requirements

### R1. Cloudflare Hybrid Sync Engine & Desktop IPC Bridge (محرك المزامنة السحابية الهجين)
- Implement a secure cloud sync pipeline (Cloudflare Worker + D1/KV sync channel or WebSocket RPC).
- Generate pairing tokens and QR code in Desktop Settings.jsx to pair mobile devices in seconds.
- Bi-directional sync for product catalog, stock updates, sales transactions, and live financial aggregates.

### R2. Mobile POS & Quick Checkout Module (نقطة البيع المحمولة)
- Fast touchscreen checkout optimized for mobile viewports (iOS/Android responsive).
- Barcode scanning via device camera with instant product lookup and quantity increments.
- Support cash, debt, and card payments, pushing finalized sales directly into the desktop database.

### R3. Mobile Inventory & Stocktaking Scanner (الجرد المخزني بالكاميرا)
- Continuous live camera barcode scanning with audio/haptic feedback on product detection.
- Quick stock count audits and discrepancy adjustments with reason logging.
- Price checker and product details overlay.

### R4. Real-Time Executive Mobile Dashboard (لوحة المتابعة الإدارية الفورية)
- Live monitoring of today's sales, gross profit, cash drawer total, and invoice count.
- Top-selling perfumes of the day and hourly revenue velocity graph.
- User role PIN authentication (Manager/Accountant/Cashier) with financial masking for restricted roles.

## Acceptance Criteria

### Security & Pairing
- [ ] QR Code pairing generated from Desktop Settings securely connects Mobile App in under 3 seconds.
- [ ] Mobile users authenticate with their designated PIN code, respecting the same RBAC permissions matrix.

### Sync & Integrity
- [ ] Sales made on mobile appear instantly on Desktop ERP sales history.
- [ ] Offline queue support: Mobile app queues transactions locally if connection drops and syncs on reconnect.

### Scanning & Performance
- [ ] Camera barcode scanner accurately reads Code-128 and EAN-13 barcodes in under 300ms.
- [ ] 100% clean SQLite transactions on the Desktop without concurrency lock errors.

