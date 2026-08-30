## 2026-08-30T05:56:07Z
You are the Project Orchestrator for the Aldaffa Perfumes ERP (الدفة للعطور) Mobile Companion Application & Cloudflare Hybrid Sync project.

Working directory: /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/orchestrator_mobile_1
Project root: /home/rdluffy/Desktop/aldaffa-app-desktop
Original request file: /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/ORIGINAL_REQUEST.md (see header ## 2026-08-30T05:55:35Z)

## Objective
Build the official mobile companion application and cloud sync backend for Aldaffa Perfumes ERP (الدفة للعطور). The companion app connects seamlessly via Cloudflare Hybrid Sync, enables camera-based live barcode scanning for instant inventory stocktaking, provides a lightweight mobile POS checkout, and displays real-time store financial KPIs.

## Core Milestones to Deliver
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
1. QR Code pairing generated from Desktop Settings securely connects Mobile App in under 3 seconds.
2. Mobile users authenticate with their designated PIN code, respecting the same RBAC permissions matrix.
3. Sales made on mobile appear instantly on Desktop ERP sales history.
4. Offline queue support: Mobile app queues transactions locally if connection drops and syncs on reconnect.
5. Camera barcode scanner accurately reads Code-128 and EAN-13 barcodes in under 300ms.
6. 100% clean SQLite transactions on the Desktop without concurrency lock errors.

## Orchestration Protocol
- Initialize your BRIEFING.md, plan.md, and progress.md in your working directory.
- Dispatch specialists (explorers, implementers/workers, reviewers, challengers, automated QA testers).
- Execute comprehensive testing across all new modules, IPC channels, and sync pipelines.
- Maintain progress.md with regular updates so sentinel monitors can track execution.
- When all requirements are implemented and fully verified with automated tests, write your handoff.md and send a completion message.
