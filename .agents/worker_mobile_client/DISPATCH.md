## 2026-08-30T06:14:16Z
You are Worker 2: Mobile Companion PWA Engineer for Milestones R2, R3, and R4.
Your Working Directory: /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/worker_mobile_client
Project Scope: /home/rdluffy/Desktop/aldaffa-app-desktop/PROJECT.md
Original Request: /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/ORIGINAL_REQUEST.md

Relevant Skills:
- /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/skills/design-taste-frontend/SKILL.md
- /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/skills/desktop-gui-accessibility-i18n/SKILL.md
- /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/skills/large-dataset-virtualization/SKILL.md
- /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/skills/offline-first-data-sync/SKILL.md
- /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/skills/aldaffa-project-error-prevention/SKILL.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Tasks to implement across `public/mobile/` (`index.html`, `app.js`, `style.css`, `sw.js`, `manifest.json`):

1. **Milestone R2: Mobile POS & Quick Checkout Module**:
   - Fast touchscreen checkout layout optimized for iOS/Android mobile viewports with category filter pills, search input, and responsive cart.
   - Fractional portion (ML) pricing calculator for custom fragrance decants.
   - Payment method support: Cash (with quick banknotes 50, 100, 200 د.ل and change return calculator), Card/Network, and Debt (with debtor selection and ledger recording).
   - Instant transaction dispatch to local desktop bridge or Cloudflare Worker sync channel.
   - Full offline resilience: if network is offline, transactions are queued to IndexedDB (`aldaffa_mobile_db`) with client-side UUIDs and automatic sync on reconnection.

2. **Milestone R3: Mobile Inventory & Stocktaking Scanner**:
   - Camera barcode scanner engine supporting **Code-128** and **EAN-13** with <300ms decode speed.
   - Tier-1 native `BarcodeDetector` with WebAssembly/ZXing fallback.
   - Audio feedback (1800Hz Web Audio tone burst for 80ms) and tactile haptic feedback (`navigator.vibrate(50)`) upon detection.
   - Flashlight (torch) control toggle for dark display cabinets.
   - Continuous live camera stocktaking mode displaying counted vs system quantity and live discrepancy.
   - Stock audit discrepancy reason presets (`عجز جرد مخزني`, `كسر/تلف أثناء العرض`, `عينة تجربة وتستر`, `خطأ تسجيل سابق`, `زيادة غير مسجلة`) with logging to losses/notes and inventory adjustment.
   - Price checker and product details modal.

3. **Milestone R4: Real-Time Executive Mobile Dashboard**:
   - Live KPI cards: Today's Sales Revenue, Gross Profit, Actual Cash Drawer Balance (`Cash Sales - Returns - Withdrawals`), and Invoices Count.
   - Top-selling perfumes ranking of the day.
   - 24-hour hourly sales velocity sparkline graph.
   - PIN Authentication with multi-role RBAC: Manager has full profit/cost visibility; Cashier role enforces financial data masking (`*** د.ل` with profit figures suppressed).

4. **Branding & Visual Design**:
   - Luxury Arabic RTL typography (`Tajawal`, `Cairo`) with gold accents (`#F59E0B`, `#C79549`), deep obsidian background (`#070B14`, `#0D1322`), frosted glass cards, and fluid touch animations.

5. **Verification**:
   - Run `npm test` and verify that all test suites pass 100%.
   - Write your handoff report to `/home/rdluffy/Desktop/aldaffa-app-desktop/.agents/worker_mobile_client/handoff.md` and report back.
