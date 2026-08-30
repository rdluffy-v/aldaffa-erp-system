# 🌐 Architectural Handoff Report: Cloudflare Hybrid Sync Engine
**Project**: Aldaffa Perfumes ERP (الدفة للعطور) — Desktop & Mobile Companion Sync  
**Author**: Explorer 2 (Cloudflare Sync Architect Explorer)  
**Date**: 2026-08-30  
**Target Path**: `/home/rdluffy/Desktop/aldaffa-app-desktop/.agents/explorer_survey_sync/handoff.md`  

---

## 1. Observation

Direct examination of the repository structure, code files, database schemas, and existing test suites revealed the following verified facts:

### 1.1 Desktop ERP Core Architecture
- **Process Model**: Electron 43.3.0 main process (`main.cjs`) orchestrating React 19 UI with `better-sqlite3` (v13.0.3) in SQLite WAL mode (`db.pragma('journal_mode = WAL')`).
- **Database Schema**: Master database initialized in `main.cjs` (lines 17–195) and mirrored in `test/harness/test-db.js`:
  - `inventory` table: columns `id`, `name`, `category`, `qty`, `cost`, `price`, `wholesale_price`, `original_price`, `unit`, `discount_rate`, `capacity`, `image_url`, `barcode`, `min_qty`, `notes`, `is_demo`.
  - `sales` table: columns `id` (INTEGER AUTOINCREMENT), `date`, `subtotal`, `discount`, `total`, `profit`, `payment_method`, `debtor_id`, `customer_name`, `sale_pricing_mode`, `type`, `phone`, `notes`, `is_demo`.
  - `sale_items` table: columns `id` (INTEGER AUTOINCREMENT), `sale_id`, `product_id`, `name`, `cart_qty`, `unit`, `final_price`, `unit_cost`, `portion_ml`, `is_demo`.
  - `users` table: columns `id`, `name`, `pin`, `role` (enum: `manager`, `accountant`, `cashier`), `avatar`, `created_at`.
  - `user_permissions` table: columns `user_id`, `permission_key`, `is_allowed`.
  - `debtors` & `debt_history` tables: manage customer balances and ledger entries.
  - `shift_reports` table: records daily cash drawer reconciliation.
  - `settings` table: key-value store for store identity, tax rates, printer modes, low stock alerts, and feature toggles.

### 1.2 Existing Mobile Bridge State
- `server/mobileBridgeServer.cjs` (lines 1–413):
  - Spawns a lightweight Node.js `http` server on port `4848` (configurable).
  - Provides endpoints: `/api/pairing/verify`, `/api/auth/pin`, `/api/products`, `/api/dashboard/stats`, `/api/pos/checkout`, `/api/inventory/adjust`.
  - Serves static mobile PWA assets from `public/mobile/`.
- **Identified Schema Disparity**:
  - `mobileBridgeServer.cjs` and `test/suites/15_mobile_companion_and_cloud_sync.test.js` currently query table names and columns named `products` (`stock_quantity`, `price`), `users` (`username`, `full_name`, `pin_code`), whereas the core desktop ERP database in `main.cjs` uses `inventory` (`qty`, `price`), `users` (`name`, `pin`, `role`).
  - *Resolution Required*: Implement a unified database abstraction layer / SQLite view (`v_products`, `v_sync_users`) or repository adapter so the bridge and Cloudflare sync interface seamlessly with the live desktop SQLite tables.

### 1.3 Test Suite Execution
- Running `npm test` triggers `test/harness/test-runner.js`, executing 17 test suites (68 tests total) in 813ms with 100% passing results, including initial unit tests for `mobileBridgeServer.cjs` in `test/suites/15_mobile_companion_and_cloud_sync.test.js`.

---

## 2. Logic Chain

From the observed requirements in `/home/rdluffy/Desktop/aldaffa-app-desktop/.agents/ORIGINAL_REQUEST.md` (R1–R4) and the offline-first constraints of perfume retail operations:

```
[Retail Store Constraint: Intermittent Internet / High-Volume POS]
  │
  ├──► Local SQLite must remain the single authoritative source of truth (Offline-First Authority).
  │
  ├──► Mobile Companion requires dual-connectivity:
  │      1. Fast Local LAN Bridge (when on store Wi-Fi: <10ms latency, zero internet requirement).
  │      2. Cloudflare Edge Relay & D1 Sync (when outside store or on cellular data).
  │
  ├──► Pairing Protocol must be zero-friction and secure:
  │      - Desktop Settings generates time-limited (10m TTL) cryptographic token & QR Code.
  │      - QR contains dual URLs (LAN IP + Cloudflare Worker endpoint) & HMAC signature.
  │      - Mobile scans QR, exchanges token for persistent Device ID & authenticated session.
  │
  ├──► Bi-Directional Delta Sync Protocol:
  │      - Downstream (Desktop -> Cloud/Mobile): Product catalog updates, price changes, low stock limits.
  │      - Upstream (Mobile -> Cloud/Desktop): Mobile POS sales transactions & Camera barcode stock audits.
  │      - Real-Time Aggregates: Push-broadcast of today's sales, revenue, profit, cash drawer total.
  │
  ├──► Conflict Resolution & Offline Queuing:
  │      - Sales Invoices: Append-only immutable records with UUID/invoice prefixes (Zero conflict).
  │      - Stock Updates: Commutative relative deltas (`qty = qty - delta`) for sales;
  │                       Last-Write-Wins (LWW) with audit logging for camera physical stocktaking.
  │      - Idempotency Keys: Prevent duplicate transactions during offline queue retries.
  │
  └──► Testability:
         - Zero-dependency Node.js Mock Cloudflare Worker in `test/harness/` for 100% offline CI/CD test execution.
```

---

## 3. Caveats

1. **Network Split-Brain & Dual Sales**: If both desktop POS and mobile POS ring up the very last unit of a fragrance while disconnected, both sales succeed locally. When syncing, stock becomes negative (e.g. `-1`).
   - *Design Choice*: Allow negative stock transition with an automatic `LOW_STOCK_AUDIT_WARNING` event and visual flag rather than blocking checkout, adhering to retail rule: *Never lose a paying customer at the counter due to software lock*.
2. **Schema Field Harmonization**: Desktop SQLite repository methods (`SalesRepository`, `InventoryRepository`, `UsersRepository`) must remain backward-compatible while providing standardized DTOs (Data Transfer Objects) for Cloudflare sync payloads.
3. **PWA Camera Scanner Permissions**: In mobile browsers, camera access (`navigator.mediaDevices.getUserMedia`) requires HTTPS or `localhost`/private IP contexts. Cloudflare Worker provides a production HTTPS domain (`https://aldaffa-sync.workers.dev`), ensuring mobile camera scanning works seamlessly everywhere.

---

## 4. Conclusion & Architectural Blueprint

### 4.1 Cloudflare Worker Architecture (`worker/`)

```
                          ┌────────────────────────┐
                          │   Cloudflare Edge      │
                          │   Worker Router        │
                          │   (Hono / ESM fetch)   │
                          └───────────┬────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│  Cloudflare D1   │        │  Cloudflare KV   │        │ Durable Objects  │
│  (Relational DB) │        │  (Fast Cache)    │        │ (StoreSyncRoom)  │
│  - stores        │        │  - pair:{token}  │        │ - WebSockets     │
│  - devices       │        │  - sess:{token}  │        │ - Live Broadcast │
│  - products      │        │  - kpi:{storeId} │        │ - Presence Heart │
│  - sales         │        └──────────────────┘        └──────────────────┘
│  - sync_events   │
│  - idempotency   │
└──────────────────┘
```

#### Storage Bindings (`wrangler.jsonc`)
```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "aldaffa-sync-worker",
  "main": "src/worker/index.js",
  "compatibility_date": "2026-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    { "binding": "DB", "database_name": "aldaffa_erp_cloud", "database_id": "aldaffa-d1-sync-prod" }
  ],
  "kv_namespaces": [
    { "binding": "KV_CACHE", "id": "aldaffa-kv-sync-prod" }
  ],
  "durable_objects": {
    "bindings": [
      { "name": "STORE_SYNC_ROOM", "class_name": "StoreSyncRoomDO" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["StoreSyncRoomDO"] }
  ]
}
```

#### D1 Relational Schema
```sql
-- Store Registry
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  master_secret_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Paired Mobile Devices
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  role TEXT DEFAULT 'cashier',
  last_sync_at TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

-- Cloud Products Mirror (Authoritative Master from Desktop)
CREATE TABLE IF NOT EXISTS products (
  id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  category TEXT,
  qty REAL DEFAULT 0,
  cost REAL DEFAULT 0,
  price REAL DEFAULT 0,
  wholesale_price REAL DEFAULT 0,
  unit TEXT DEFAULT 'piece',
  min_qty REAL DEFAULT 5,
  is_active INTEGER DEFAULT 1,
  updated_at TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  PRIMARY KEY (id, store_id)
);

-- Cloud Sales Transactions (Append-Only)
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  date TEXT NOT NULL,
  total_amount REAL NOT NULL,
  total_cost REAL DEFAULT 0,
  profit REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  payment_type TEXT NOT NULL,
  customer_name TEXT,
  device_id TEXT,
  user_id TEXT,
  notes TEXT,
  synced_at TEXT NOT NULL
);

-- Cloud Sale Items
CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL,
  cost_price REAL DEFAULT 0,
  profit REAL DEFAULT 0,
  portion_ml REAL,
  FOREIGN KEY (sale_id) REFERENCES sales(id)
);

-- Event Change Log (For Delta Sync)
CREATE TABLE IF NOT EXISTS sync_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- 'product' | 'sale' | 'stock_adjustment' | 'setting'
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,   -- 'INSERT' | 'UPDATE' | 'DELETE' | 'DELTA'
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Idempotency Guard Log
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  response_payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

---

### 4.2 Pairing Protocol & Cryptographic Flow

```
+---------------+                              +---------------+                               +------------------+
|  Desktop ERP  |                              | Cloudflare KV |                               | Mobile Companion |
+-------+-------+                              +-------+-------+                               +--------+---------+
        |                                              |                                                |
        | 1. Generate Token & HMAC                     |                                                |
        |    secret = randomBytes(32)                  |                                                |
        |    token  = "pair_" + randomBytes(16)        |                                                |
        +--------------------------------------------->|                                                |
        |    KV.put("pair:" + token, meta, TTL=600s)   |                                                |
        |                                              |                                                |
        | 2. Render Dynamic QR Code on Screen          |                                                |
        |    { storeId, token, lanUrl, cloudUrl, exp } |                                                |
        |                                              |                                                |
        |                                              |                               3. Camera Scans  |
        |                                              |                                  QR Code       |
        |                                              |                                       |        |
        |                                              |                                       v        |
        |                                              | 4. Probe Fast LAN (GET lanUrl)                 |
        |<-------------------------------------------------------------------------------------+        |
        |    (If LAN reachable, exchange local session)|                                                |
        |                                              |                                                |
        |                                              | 5. If Remote, Claim Token                      |
        |                                              |<-----------------------------------------------+
        |                                              |    POST /api/v1/pairing/claim                  |
        |                                              |    { token, deviceId, deviceName }             |
        |                                              |                                                |
        |                                              | 6. Validate Token & Issue                      |
        |                                              |    { deviceToken, storeSnapshot }              |
        |                                              +----------------------------------------------->|
        |                                              |                                                |
        |                                              |                               7. User Enters   |
        |                                              |                                  PIN Code      |
        |                                              |                                       |        |
        |                                              | 8. Authenticate Role & Permissions    v        |
        |                                              |<-----------------------------------------------+
        |                                              |    POST /api/v1/auth/pin                       |
        |                                              |    { pin, deviceToken }                        |
        |                                              |                                                |
        |                                              | 9. Returns Session Token & RBAC Matrix         |
        |                                              +----------------------------------------------->|
        |                                                                                               |
```

---

### 4.3 Bi-Directional Delta Sync Protocol Specification

#### Downstream Pull (Desktop / Mobile Client pulls deltas)
- **Endpoint**: `GET /api/v1/sync/pull?store_id={storeId}&since_seq={lastKnownSeq}`
- **Header**: `Authorization: Bearer {deviceToken}`
- **Response**:
```json
{
  "success": true,
  "current_seq": 1042,
  "deltas": [
    {
      "seq": 1039,
      "entity_type": "product",
      "operation": "UPDATE",
      "data": {
        "id": "item_oud_royal",
        "price": 280,
        "wholesale_price": 240,
        "stock_quantity": 45,
        "updated_at": "2026-08-30T05:30:00Z"
      }
    },
    {
      "seq": 1040,
      "entity_type": "setting",
      "operation": "UPDATE",
      "data": {
        "key": "tax_rate",
        "value": "15"
      }
    }
  ],
  "has_more": false
}
```

#### Upstream Push (Batch Mutations from Mobile or Desktop)
- **Endpoint**: `POST /api/v1/sync/push`
- **Payload**:
```json
{
  "store_id": "store_ald_01",
  "device_id": "dev_mobile_ahmad_01",
  "mutations": [
    {
      "idempotency_key": "sale_inv_m_1725012398450_8f9",
      "type": "SALE_CHECKOUT",
      "payload": {
        "sale_id": "INV-M-1725012398450",
        "date": "2026-08-30T05:35:00Z",
        "total_amount": 750,
        "total_cost": 450,
        "profit": 300,
        "payment_type": "cash",
        "customer_name": "عميل نقدي",
        "items": [
          { "product_id": "item_oud_royal", "quantity": 3, "unit_price": 250, "cost_price": 150 }
        ]
      }
    },
    {
      "idempotency_key": "audit_item_musk_1725012410",
      "type": "STOCK_AUDIT",
      "payload": {
        "product_id": "item_musk",
        "new_quantity": 32,
        "reason": "جرد فعلي بالكاميرا",
        "user_id": "usr_mgr"
      }
    }
  ]
}
```

---

### 4.4 Offline Queue Data Structure & Conflict Matrix

#### Mobile Offline Queue Engine (IndexedDB Schema)
```typescript
interface OfflineQueueRecord {
  id: string;             // UUID v4
  idempotencyKey: string; // Deterministic: `${action}_${entityId}_${timestamp}`
  action: 'POS_CHECKOUT' | 'STOCK_AUDIT' | 'DEBT_PAYMENT';
  payload: any;
  createdAt: number;      // Epoch ms
  retryCount: number;     // Backoff: 1s, 2s, 5s, 15s, 30s
  status: 'pending' | 'in_flight' | 'acknowledged' | 'failed';
  lastError?: string;
}
```

#### Conflict Resolution Rules Table

| Entity & Action | Conflict Scenario | Resolution Strategy | System Action |
|---|---|---|---|
| **POS Sales Checkout** | Multiple mobile & desktop devices sell concurrently | **Append-Only Immutable** | Each sale creates a distinct record (`INV-M-...` or `#1024`). Never overwritten. |
| **Inventory Stock (Sale)** | Stock sold on multiple devices in offline state | **Commutative Relative Deltas** | `stock = stock - sold_qty`. Relative math is order-independent. If stock dips `< 0`, flag low-stock alert. |
| **Inventory Stock (Stocktaking Audit)** | Physical audit overwrites stock | **Last-Write-Wins (LWW) with Audit Trail** | The latest physical count replaces quantity in SQLite, logging previous quantity, author, and timestamp in `notes`/`audit_log`. |
| **Product Catalog / Pricing** | Price edited simultaneously | **Desktop-Authoritative LWW** | Desktop ERP is the authoritative master. Mobile updates require Manager PIN validation. |
| **Debtor Transactions** | Debt payment recorded offline | **Append-Only Ledger (`debt_history`)** | Balance calculated as sum of debt history entries; prevents balance overwrites. |

---

### 4.5 Local Mock Test Harness Design

To ensure all automated unit, integration, and E2E tests run in milliseconds without network calls or Cloudflare account dependencies:

- **Mock Worker Component** (`test/harness/mock-cloudflare-worker.js`):
  - In-memory D1 engine backed by `better-sqlite3` `:memory:`.
  - In-memory KV storage backed by `Map<string, { value: string, expiresAt: number }>`.
  - In-memory Durable Object WebSocket broadcast mock.
  - Native Node.js `http.createServer` or direct invocation handler.
- **Automated Test Scenarios** (to add to `test/suites/`):
  1. `16_cloudflare_pairing_and_token_exchange.test.js`: Validates QR token TTL, cryptographic HMAC signatures, and PIN role authorization.
  2. `17_cloudflare_delta_sync_and_idempotency.test.js`: Validates sequence vectors, duplicate mutation filtering via idempotency keys, and commutative stock deductions.
  3. `18_offline_queue_resilience_and_reconnection.test.js`: Simulates network drop, queues 50 mutations offline, reconnects, verifies atomic batch sync.

---

## 5. Verification Method

To independently verify the architecture and prepare for implementation:

### 5.1 Verification Commands
1. **Run Current Test Suite**:
   ```bash
   npm test
   ```
   *Expected Result*: All 17 existing test suites pass cleanly with 0 failures.

2. **Verify Mobile Bridge Startup**:
   ```bash
   node -e "
     const { startMobileBridgeServer, stopMobileBridgeServer } = require('./server/mobileBridgeServer.cjs');
     const Database = require('better-sqlite3');
     const db = new Database(':memory:');
     const info = startMobileBridgeServer(db, 4999);
     console.log('Bridge Started:', info);
     stopMobileBridgeServer();
   "
   ```

3. **Verify SQLite WAL Concurrency**:
   ```bash
   node -e "
     const Database = require('better-sqlite3');
     const db = new Database(':memory:');
     db.pragma('journal_mode = WAL');
     console.log('WAL Mode Active:', db.pragma('journal_mode', { simple: true }));
   "
   ```

### 5.2 Implementation Checklist for Implementer Agents
- [ ] **Step 1**: Implement `src/worker/` with `index.js`, D1 database migrations, and KV pairing handlers.
- [ ] **Step 2**: Add Mobile Pairing UI & QR Code generator tab to `src/modules/Settings.jsx`.
- [ ] **Step 3**: Harmonize `server/mobileBridgeServer.cjs` to query both `inventory` and `products` transparently via compatibility views or repository layer.
- [ ] **Step 4**: Implement `OfflineSyncQueue` in `public/mobile/app.js` with IndexedDB persistence and auto-retry on reconnection.
- [ ] **Step 5**: Add comprehensive test suites (`16_...`, `17_...`, `18_...`) to `test/suites/` and verify with `npm test`.

---
*Report completed and self-contained.*
