# Project: Aldaffa Perfumes ERP (الدفة للعطور) Mobile Companion & Cloudflare Hybrid Sync

## Architecture
- **Desktop Core**: Electron 43.3.0 + React 19 + `better-sqlite3` in SQLite WAL mode. Master database with 18 canonical tables (`inventory`, `sales`, `sale_items`, `users`, `user_permissions`, `debtors`, `debt_history`, `withdrawals`, `capital_injections`, `gifts`, `losses`, `notes`, `categories`, `archives`, `shift_reports`, `settings`).
- **Cloudflare Hybrid Sync Engine**: Cloudflare Worker with D1 relational database mirror, KV fast caching for pairing tokens, and Durable Objects WebSocket synchronization channel.
- **Pairing & Authentication Protocol**: Time-bounded (10m TTL) cryptographic pairing token with HMAC-SHA256 signature generated in Desktop Settings as dynamic QR code. Mobile scans QR to obtain persistent device token and authenticates via 4-digit PIN with RBAC enforcement.
- **Mobile Companion Client**: Responsive Progressive Web App (PWA) in `public/mobile/` supporting offline operations via IndexedDB outbox queue, background sync on reconnect, Web Audio & Haptic feedback, and camera-based BarcodeDetector engine (<300ms decode for Code-128 & EAN-13).
- **Desktop Bridge Server**: Local HTTP bridge (`server/mobileBridgeServer.cjs`) running on port 4848 with harmonized schema access to `inventory`, `sales`, `sale_items`, and `users`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Cloudflare Worker Sync Engine | Worker routing, D1 cloud database schema, KV pairing cache, delta changelog sync | R1 | ORIGINAL_REQUEST §R1 |
| 2 | Desktop Settings QR Code & Pairing UI | Settings tab `mobile_sync` in `Settings.jsx` showing live pairing QR code, server controls, and token refresh | R1 | ORIGINAL_REQUEST §R1 |
| 3 | Desktop Bridge Schema Harmonization | Harmonize `server/mobileBridgeServer.cjs` to query canonical `inventory`, `sales`, `sale_items`, `users` tables | R1 | Explorer 1 & 2 survey |
| 4 | Bi-Directional Delta Sync Protocol | Push & pull sequence-vector deltas for products, prices, low-stock limits, and sales | R1 | ORIGINAL_REQUEST §R1 |
| 5 | Mobile POS Responsive Touch Layout | Touchscreen checkout UI optimized for mobile viewports with category filtering and instant cart | R2 | ORIGINAL_REQUEST §R2 |
| 6 | Mobile POS Camera Barcode Integration | Instant product lookup & quantity increment upon barcode detection (<300ms) | R2 | ORIGINAL_REQUEST §R2 |
| 7 | Mobile POS Multi-Payment Split | Support Cash (with change calculator), Debt (with debtor ledger update), and Card/Network | R2 | ORIGINAL_REQUEST §R2 |
| 8 | Mobile Offline Transaction Outbox Queue | IndexedDB queue storing transactions offline and flushing automatically on reconnect | R2 | ORIGINAL_REQUEST §Acceptance Criteria 4 |
| 9 | High-Speed Camera Barcode Engine | Native BarcodeDetector + ZXing fallback for Code-128 and EAN-13 (<300ms decode) | R3 | ORIGINAL_REQUEST §R3 |
| 10 | Audio & Haptic Scan Feedback | 1800Hz Web Audio tone burst (80ms) + tactile `navigator.vibrate(50)` on barcode match | R3 | ORIGINAL_REQUEST §R3 |
| 11 | Continuous Live Stocktaking Mode | Viewfinder stays open across scans, displaying expected vs actual qty and live discrepancy | R3 | ORIGINAL_REQUEST §R3 |
| 12 | Stock Audit Reason Logging & Adjustments | Reason presets (`عجز جرد`, `كسر/تلف`, `عينة تجربة/Tester`) with automatic `losses` logging and inventory update | R3 | ORIGINAL_REQUEST §R3 |
| 13 | Price Checker & Product Details Sheet | Quick camera scan to view retail, wholesale, unit cost, formula capacity, and stock levels | R3 | ORIGINAL_REQUEST §R3 |
| 14 | Real-Time Executive KPI Cards | Live today's sales revenue, gross profit, actual cash drawer balance, and invoice count | R4 | ORIGINAL_REQUEST §R4 |
| 15 | Top-Selling Perfumes & Velocity Graph | Real-time top fragrance rankings and 24-hour hourly sales velocity sparkline | R4 | ORIGINAL_REQUEST §R4 |
| 16 | PIN RBAC & Financial Data Masking | 4-digit PIN login; Manager gets full visibility, Cashier role gets profit/cost data masked (`*** د.ل`) | R4 | ORIGINAL_REQUEST §R4 |
| 17 | Zero-Lock SQLite Concurrency | Synchronous `better-sqlite3` WAL transactions (`db.transaction()`) preventing concurrency lock errors | R1-R4 | ORIGINAL_REQUEST §Acceptance Criteria 6 |
| 18 | Opaque-Box E2E Test Suite (Tiers 1-4) | Comprehensive automated QA test suite verifying all features, boundaries, and scenarios | M5 | Project Orchestrator Dual Track |
| 19 | Adversarial Hardening (Tier 5) | White-box stress tests, concurrency race condition tests, network partition recovery tests | M6 | Project Orchestrator Phase 2 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| R1 | Cloudflare Hybrid Sync Engine & Desktop IPC Bridge | Cloudflare Worker backend (`src/worker/`), D1/KV sync, desktop QR pairing tab in `Settings.jsx`, IPC channels, schema harmonization | none | PLANNED |
| R2 | Mobile POS & Quick Checkout Module | Mobile responsive touch POS UI, barcode integration, cash/debt/card checkout, IndexedDB offline outbox queue | R1 | PLANNED |
| R3 | Mobile Inventory & Stocktaking Scanner | Camera barcode scanner (<300ms Code-128/EAN-13), audio/haptic feedback, continuous stocktaking, reason logging | R1 | PLANNED |
| R4 | Real-Time Executive Mobile Dashboard | Live financial KPIs (sales, profit, drawer, invoices), hourly velocity graph, top perfumes, PIN RBAC with data masking | R1 | PLANNED |
| M5 | E2E Testing Track & Full Verification | Comprehensive automated test suite (Tiers 1-4), test runner execution, 100% passing tests | R1, R2, R3, R4 | PLANNED |
| M6 | Adversarial Hardening (Tier 5) & Forensic Audit | Challenger stress tests, offline split-brain recovery, concurrency benchmarks, forensic integrity audit | M5 | PLANNED |

## Interface Contracts

### 1. Pairing Protocol
- **QR Code Payload**:
  ```json
  {
    "storeId": "aldaffa_store_main",
    "storeName": "الدفة للعطور - الفرع الرئيسي",
    "token": "pair_01a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6",
    "lanUrl": "http://192.168.1.50:4848/mobile",
    "cloudUrl": "https://sync.aldaffa.com",
    "expiresAt": 1725015600000
  }
  ```
- **Claim Endpoint**: `POST /api/pairing/claim` (Body: `{ token, deviceName, deviceId }` -> Returns: `{ deviceToken, storeInfo }`)
- **PIN Auth Endpoint**: `POST /api/auth/pin` (Body: `{ pin, deviceToken }` -> Returns: `{ sessionToken, user: { id, name, role, permissions } }`)

### 2. POS Checkout Payload
- **Endpoint**: `POST /api/pos/checkout`
- **Request Body**:
  ```json
  {
    "idempotencyKey": "sale_m_1725012398450_8f9",
    "date": "2026-08-30T06:00:00Z",
    "subtotal": 250.0,
    "discount": 10.0,
    "discount_type": "percentage",
    "total": 225.0,
    "profit": 95.0,
    "payment_method": "cash",
    "customer_name": "زبون نقدي",
    "debtor_id": null,
    "phone": null,
    "notes": "تطبيق الجوال",
    "items": [
      {
        "product_id": "prod_oud_01",
        "name": "عطر عود ملكي فاخر",
        "cart_qty": 1,
        "unit": "قطعة",
        "final_price": 225.0,
        "unit_cost": 130.0,
        "portion_ml": null
      }
    ]
  }
  ```
- **Response**: `{ success: true, saleId: 1042, total: 225.0 }`

### 3. Inventory Stock Adjustment Payload
- **Endpoint**: `POST /api/inventory/adjust`
- **Request Body**:
  ```json
  {
    "idempotencyKey": "audit_1725012410_01",
    "product_id": "prod_oud_01",
    "counted_qty": 18,
    "expected_qty": 20,
    "variance": -2,
    "reason": "عجز جرد مخزني",
    "user_id": "admin_1",
    "notes": "جرد عبر كاميرا الجوال"
  }
  ```
- **Response**: `{ success: true, new_qty: 18, logged_loss: true }`

### 4. Executive Dashboard Stats Payload
- **Endpoint**: `GET /api/dashboard/stats`
- **Response (Manager)**:
  ```json
  {
    "today_sales": 1850.0,
    "today_profit": 740.0,
    "cash_drawer": 1420.0,
    "invoices_count": 14,
    "top_perfumes": [
      { "id": "prod_oud_01", "name": "عود ملكي", "sold_qty": 6, "revenue": 1350.0 }
    ],
    "hourly_velocity": [
      { "hour": "10:00", "sales": 250.0 },
      { "hour": "11:00", "sales": 400.0 }
    ],
    "masked": false
  }
  ```
- **Response (Cashier)**:
  ```json
  {
    "today_sales": 1850.0,
    "today_profit": null,
    "cash_drawer": 1420.0,
    "invoices_count": 14,
    "top_perfumes": [
      { "id": "prod_oud_01", "name": "عود ملكي", "sold_qty": 6, "revenue": 1350.0 }
    ],
    "hourly_velocity": [],
    "masked": true
  }
  ```

## Code Layout
- `src/worker/`: Cloudflare Worker sync engine (`index.js`, `schema.sql`, `d1-client.js`).
- `server/mobileBridgeServer.cjs`: Local desktop HTTP/WebSocket bridge server.
- `src/modules/Settings.jsx`: Desktop settings UI with dedicated `mobile_sync` tab and pairing QR code.
- `public/mobile/`: Mobile companion Progressive Web App:
  - `index.html`: Responsive mobile shell.
  - `app.js`: Main mobile controller with Router, POS, Scanner, Stocktaking, Dashboard, RBAC, and OfflineSyncQueue.
  - `style.css`: Luxury Arabic RTL theme.
  - `sw.js`: Service worker with Cache-First static and Network-First dynamic caching.
  - `manifest.json`: PWA manifest.
- `test/`: Automated QA test framework:
  - `test/harness/mock-cloudflare-worker.js`: Mock Cloudflare Worker & D1/KV.
  - `test/suites/`: Unit, integration, and E2E test suites (15_mobile_companion_and_cloud_sync, 16_cloudflare_pairing, 17_delta_sync, 18_offline_queue, 19_scanner_and_pos, 20_rbac_and_dashboard).
