# Project: Aldaffa Perfumes ERP (الدفة للعطور) Mobile Companion & Cloudflare Hybrid Sync

## Architecture
- **Desktop Core**: Electron 43.3.0 + React 19 + `better-sqlite3` in SQLite WAL mode. Master database with 18 canonical tables (`inventory`, `sales`, `sale_items`, `users`, `user_permissions`, `debtors`, `debt_history`, `withdrawals`, `capital_injections`, `gifts`, `losses`, `notes`, `categories`, `archives`, `shift_reports`, `settings`).
- **Cloudflare Hybrid Sync Engine**: Cloudflare Worker with D1 relational database mirror, KV fast caching for pairing tokens, and Durable Objects WebSocket synchronization channel.
- **Pairing & Authentication Protocol**: Time-bounded (10m TTL) cryptographic pairing token with HMAC-SHA256 signature generated in Desktop Settings as dynamic QR code. Mobile scans QR to obtain persistent device token and authenticates via 4-digit PIN with RBAC enforcement.
- **Mobile Companion Client**: Responsive Progressive Web App (PWA) in `public/mobile/` supporting offline operations via IndexedDB outbox queue, background sync on reconnect, Web Audio & Haptic feedback, and camera-based BarcodeDetector engine (<300ms decode for Code-128 & EAN-13).
- **Desktop Bridge Server**: Local HTTP bridge (`server/mobileBridgeServer.cjs`) running on port 4848 with harmonized schema access to `inventory`, `sales`, `sale_items`, and `users`.

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | Cloudflare Worker Sync Engine | Worker routing, D1 cloud database schema, KV pairing cache, delta changelog sync | R1 | ORIGINAL_REQUEST §R1 | DONE |
| 2 | Desktop Settings QR Code & Pairing UI | Settings tab `mobile_sync` in `Settings.jsx` showing live pairing QR code, server controls, and token refresh | R1 | ORIGINAL_REQUEST §R1 | DONE |
| 3 | Desktop Bridge Schema Harmonization | Harmonize `server/mobileBridgeServer.cjs` to query canonical `inventory`, `sales`, `sale_items`, `users` tables | R1 | Explorer 1 & 2 survey | DONE |
| 4 | Bi-Directional Delta Sync Protocol | Push & pull sequence-vector deltas for products, prices, low-stock limits, and sales | R1 | ORIGINAL_REQUEST §R1 | DONE |
| 5 | Mobile POS Responsive Touch Layout | Touchscreen checkout UI optimized for mobile viewports with category filtering and instant cart | R2 | ORIGINAL_REQUEST §R2 | DONE |
| 6 | Mobile POS Camera Barcode Integration | Instant product lookup & quantity increment upon barcode detection (<300ms) | R2 | ORIGINAL_REQUEST §R2 | DONE |
| 7 | Mobile POS Multi-Payment Split | Support Cash (with change calculator), Debt (with debtor ledger update), and Card/Network | R2 | ORIGINAL_REQUEST §R2 | DONE |
| 8 | Mobile Offline Transaction Outbox Queue | IndexedDB queue storing transactions offline and flushing automatically on reconnect | R2 | ORIGINAL_REQUEST §Acceptance Criteria 4 | DONE |
| 9 | High-Speed Camera Barcode Engine | Native BarcodeDetector + ZXing fallback for Code-128 and EAN-13 (<300ms decode) | R3 | ORIGINAL_REQUEST §R3 | DONE |
| 10 | Audio & Haptic Scan Feedback | 1800Hz Web Audio tone burst (80ms) + tactile `navigator.vibrate(50)` on barcode match | R3 | ORIGINAL_REQUEST §R3 | DONE |
| 11 | Continuous Live Stocktaking Mode | Viewfinder stays open across scans, displaying expected vs actual qty and live discrepancy | R3 | ORIGINAL_REQUEST §R3 | DONE |
| 12 | Stock Audit Reason Logging & Adjustments | Reason presets (`عجز جرد`, `كسر/تلف`, `عينة تجربة/Tester`) with automatic `losses` logging and inventory update | R3 | ORIGINAL_REQUEST §R3 | DONE |
| 13 | Price Checker & Product Details Sheet | Quick camera scan to view retail, wholesale, unit cost, formula capacity, and stock levels | R3 | ORIGINAL_REQUEST §R3 | DONE |
| 14 | Real-Time Executive KPI Cards | Live today's sales revenue, gross profit, actual cash drawer balance, and invoice count | R4 | ORIGINAL_REQUEST §R4 | DONE |
| 15 | Top-Selling Perfumes & Velocity Graph | Real-time top fragrance rankings and 24-hour hourly sales velocity sparkline | R4 | ORIGINAL_REQUEST §R4 | DONE |
| 16 | PIN RBAC & Financial Data Masking | 4-digit PIN login; Manager gets full visibility, Cashier role gets profit/cost data masked (`*** د.ل`) | R4 | ORIGINAL_REQUEST §R4 | DONE |
| 17 | Zero-Lock SQLite Concurrency | Synchronous `better-sqlite3` WAL transactions (`db.transaction()`) preventing concurrency lock errors | R1-R4 | ORIGINAL_REQUEST §Acceptance Criteria 6 | DONE |
| 18 | Opaque-Box E2E Test Suite (Tiers 1-4) | Comprehensive automated QA test suite verifying all features, boundaries, and scenarios | M5 | Project Orchestrator Dual Track | DONE |
| 19 | Adversarial Hardening (Tier 5) | White-box stress tests, concurrency race condition tests, negative boundaries, forensic integrity audit | M6 | Project Orchestrator Phase 2 | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status | Key Outputs |
|---|------|-------|-------------|--------|-------------|
| R1 | Cloudflare Hybrid Sync Engine & Desktop IPC Bridge | Cloudflare Worker backend (`src/worker/`), D1/KV sync, desktop QR pairing tab in `Settings.jsx`, IPC channels, schema harmonization | none | DONE | `src/worker/`, `server/mobileBridgeServer.cjs`, `src/modules/Settings.jsx`, `test/suites/15_...`, `16_...`, `17_...` |
| R2 | Mobile POS & Quick Checkout Module | Mobile responsive touch POS UI, barcode integration, cash/debt/card checkout, IndexedDB offline outbox queue | R1 | DONE | `public/mobile/app.js`, `public/mobile/index.html`, `test/suites/19_...` |
| R3 | Mobile Inventory & Stocktaking Scanner | Camera barcode scanner (<300ms Code-128/EAN-13), audio/haptic feedback, continuous stocktaking, reason logging | R1 | DONE | `public/mobile/app.js`, `test/suites/19_...` |
| R4 | Real-Time Executive Mobile Dashboard | Live financial KPIs (sales, profit, drawer, invoices), hourly velocity graph, top perfumes, PIN RBAC with data masking | R1 | DONE | `public/mobile/app.js`, `test/suites/20_...` |
| M5 | E2E Testing Track & Full Verification | Comprehensive automated test suite (Tiers 1-4), test runner execution, 100% passing tests | R1, R2, R3, R4 | DONE | `TEST_INFRA.md`, `TEST_READY.md`, 25 test suites passing (146/146 tests) |
| M6 | Adversarial Hardening (Tier 5) & Forensic Audit | Challenger stress tests, offline split-brain recovery, concurrency benchmarks, forensic integrity audit | M5 | DONE | All 6 challenger defects remediated, Final Challenger APPROVE, Final Auditor CLEAN |

## Verification Summary
- **Test Suites Executed**: 25 suites
- **Total Tests**: 146 tests
- **Passing**: 146 / 146 (100%)
- **Production Build**: Vite build succeeds in 1.34s with 0 errors
- **Forensic Audit**: CLEAN (0 facades, 0 hardcoded values, authentic subsystems)
