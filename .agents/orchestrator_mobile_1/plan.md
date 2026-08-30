# Project Plan: Aldaffa Perfumes ERP Mobile Companion & Cloudflare Hybrid Sync

## Phase 0: Survey & Full Scope Mapping
- Dispatch 3 parallel Explorers:
  - Explorer 1 (Desktop ERP & SQLite & Settings): Investigate existing Electron main process, IPC handlers, SQLite database tables (products, sales, stock, users/PINs, settings), and Settings UI for pairing QR code integration.
  - Explorer 2 (Cloudflare Sync & Worker Infrastructure): Investigate Cloudflare Worker/D1/KV/WebSocket sync mechanisms, pairing token generation/validation, bi-directional sync protocols, and offline queue reconciliation.
  - Explorer 3 (Mobile Companion Client Architecture): Investigate mobile web/PWA/React client architecture, camera-based barcode scanning (Code-128, EAN-13 under 300ms), Mobile POS touch checkout, Stocktaking scanner with haptic/audio feedback, and Executive Dashboard.
- Synthesize explorer findings into `PROJECT.md` with full architecture, feature inventory, code layout, and interface contracts.

## Phase 1: Dual Track Execution
### Implementation Track:
- Milestone R1: Cloudflare Hybrid Sync Engine & Desktop IPC Bridge (Worker backend, pairing QR code in Settings, desktop sync daemon/IPC, bi-directional replication).
- Milestone R2: Mobile POS & Quick Checkout Module (Responsive touch UI, camera barcode scanning, cash/debt/card, transaction sync).
- Milestone R3: Mobile Inventory & Stocktaking Scanner (Continuous camera scanner, audio/haptic cues, count audits, discrepancy adjustments).
- Milestone R4: Real-Time Executive Mobile Dashboard (Live revenue/profit/cash metrics, velocity chart, PIN RBAC with financial masking).
- Final Milestone: 100% E2E test pass + Adversarial Hardening (Tier 5).

### E2E Testing Track:
- Test infrastructure design (`TEST_INFRA.md`).
- Tier 1: Feature coverage tests (>=5 per feature).
- Tier 2: Boundary and corner cases (>=5 per feature).
- Tier 3: Cross-feature combinations and pairwise testing.
- Tier 4: Real-world store operational scenarios.
- Signal completion via `TEST_READY.md`.

## Phase 2: Verification, Adversarial Hardening & Forensic Audit
- Verify all E2E tests pass.
- Run Challenger adversarial tests.
- Run Forensic Auditor integrity checks.
- Compile and send final handoff report.
