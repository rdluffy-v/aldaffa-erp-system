# ALDAFFA PERFUMES ERP — AUTOMATED E2E TEST INFRASTRUCTURE SPECIFICATION
**Document Version**: 2.0.0  
**Project**: Aldaffa Perfumes ERP (الدفة للعطور) — Desktop & Mobile Companion Cloudflare Hybrid Sync  
**Scope Reference**: `/home/rdluffy/Desktop/aldaffa-app-desktop/PROJECT.md`  
**Test Harness Location**: `test/harness/`  
**Test Suites Location**: `test/suites/`  

---

## 1. Executive Summary & 4-Tier Testing Methodology

The Aldaffa Perfumes ERP test framework enforces rigorous, zero-dependency, automated verification across all 19 system features. Operating under retail conditions with intermittent connectivity and rapid point-of-sale throughput, testing is architected across four distinct progressive verification tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TIER 4: REAL-WORLD SCENARIOS                    │
│    Store Onboarding, Blackout Blackbox, 50-Node Flash Sale Storm       │
├────────────────────────────────────────────────────────────────────────┤
│                     TIER 3: PAIRWISE COMBINATORIAL                     │
│    Cross-Role × Payment Methods, Multi-Device Commutative Stock Sync   │
├────────────────────────────────────────────────────────────────────────┤
│                 TIER 2: BOUNDARY VALUE ANALYSIS (BVA)                  │
│    10m TTL Expiry, Tampered HMAC, Poison Pills, 0/Neg Stock, Network   │
├────────────────────────────────────────────────────────────────────────┤
│             TIER 1: CATEGORY-PARTITION EQUIVALENCE PATHS               │
│    QR Payload Gen, Token Claim, PIN Auth, Delta Stream, Outbox Queue   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Feature Inventory Verification Matrix

| # | Feature Name | Primary Test Suite | Tier 1 (Equivalence) | Tier 2 (Boundary / Negative) | Tier 3 (Pairwise Combinatorial) | Tier 4 (Workload Simulation) |
|---|--------------|-------------------|----------------------|------------------------------|--------------------------------|-----------------------------|
| 1 | **Cloudflare Worker Sync Engine** | `15`, `16`, `17` | D1 schema & KV token generation | TTL expiration, tampered HMAC signature | Multi-device room isolation | Multi-store isolated sync cluster |
| 2 | **Desktop Settings QR & Pairing UI** | `15`, `16` | QR JSON schema & LAN/Cloud URL parsing | Malformed QR payload, expired token (>10m) | Multi-device pairing on same store | Full store onboarding & token regeneration |
| 3 | **Desktop Bridge Schema Harmonization** | `15`, `16`, `17` | Direct mapping to `inventory`, `sales`, `users` | Missing column fallback, type coercion | Cross-schema view synchronization | Full ERP 18-table relational integrity |
| 4 | **Bi-Directional Delta Sync Protocol** | `17` | Sequence vector increments (`seq++`) | Out-of-order `since_seq`, empty delta stream | Concurrent delta pull/push across nodes | High-volume flash sale (50 concurrent sales) |
| 5 | **Mobile POS Responsive Touch Layout** | `15`, `17` | Product catalog filtering by category | Empty category, missing product image | Search query × Category filter matrix | Peak counter rush checkout burst |
| 6 | **Mobile POS Camera Barcode Integration** | `15`, `17` | Code-128 & EAN-13 barcode match | Unregistered barcode, damaged barcode format | Camera scan × Multiple quantity increments | Multi-item cart rapid-fire scanning |
| 7 | **Mobile POS Multi-Payment Split** | `15`, `17`, `18` | Cash, Debt, Card payment execution | 0 amount, overpayment change calculation | Role (Manager/Cashier) × Payment Method | Mixed tender retail shift operations |
| 8 | **Mobile Offline Transaction Outbox Queue** | `18` | Enqueue sale offline, inspect IndexedDB record | Partial network drop mid-batch, retry backoff | Offline Sale × Offline Stock Audit on same SKU | Complete store blackout & 100% reconciliation |
| 9 | **High-Speed Camera Barcode Engine** | `13`, `15` | Native BarcodeDetector decode (<300ms) | ZXing fallback, unreadable symbol rejection | Code-128 × EAN-13 × QR Code formats | Continuous stream rapid inventory scan |
| 10 | **Audio & Haptic Scan Feedback** | `15` | 1800Hz Web Audio tone burst & vibrate(50) | AudioContext suspended state auto-resume | Web Audio available vs unavailable env | High-speed audible barcode stocktaking |
| 11 | **Continuous Live Stocktaking Mode** | `15`, `18` | Expected vs Actual live discrepancy counter | Zero stock item, surplus inventory adjustment | Multi-category live audit workflow | Full warehouse shelf cycle count |
| 12 | **Stock Audit Reason Logging & Adjustments** | `15`, `18` | Presets (`عجز جرد`, `كسر/تلف`, `عينة`) | Empty reason fallback, huge discrepancy qty | Reason Type × User Role × Stock Impact | Fiscal year-end physical inventory audit |
| 13 | **Price Checker & Product Details Sheet** | `15` | Retail, wholesale, unit cost display | Inactive product, unassigned barcode | Role visibility (Manager cost vs Cashier mask)| In-aisle customer price inquiry lookup |
| 14 | **Real-Time Executive KPI Cards** | `15`, `17` | Today's sales, gross profit, cash drawer | Zero sales initial state, negative cash flow | Manager full profit vs Cashier masked data | Full business day revenue accumulation |
| 15 | **Top-Selling Perfumes & Velocity Graph** | `03`, `15` | Top 5 fragrance rankings & hourly velocity | No sales recorded today, tied top products | Multi-category sales volume ranking | Black Friday hourly sales velocity spike |
| 16 | **PIN RBAC & Financial Data Masking** | `01`, `07`, `16` | 4-digit PIN authentication & session token | Invalid PIN lockout, revoked device token | Manager vs Accountant vs Cashier permissions | Multi-role shift handoff & sole manager guard|
| 17 | **Zero-Lock SQLite Concurrency** | `02`, `07`, `17` | Synchronous `better-sqlite3` WAL transactions | Mid-stream transaction rollback on syntax err | 50 concurrent writers on single database | High-throughput concurrent POS & Sync writes |
| 18 | **Opaque-Box E2E Test Suite (Tiers 1-4)**| `16`, `17`, `18` | Automated end-to-end multi-agent runner | Edge case & adversarial test coverage | Pairwise combinatorial matrix execution | End-to-end integration verification |
| 19 | **Adversarial Hardening (Tier 5)** | `06`, `07`, `08` | Fuzzing, large payload stress, SQL injection | Boundary value attacks, negative inventory | Resource starvation & race condition attacks| Stress testing under 15,000+ item seedings |

---

## 3. Tier-by-Tier Testing Specification

### Tier 1: Category-Partition & Equivalence Classes
- **Objective**: Verify standard, expected operational paths for all components under valid input sets.
- **Methodology**: Partition inputs into valid equivalence classes; select representative values per partition.
- **Coverage Areas**:
  1. Pairing QR payload format: `{ storeId, storeName, token, lanUrl, cloudUrl, expiresAt, signature }`.
  2. Device pairing claim flow: Exchange ephemeral pairing token for long-lived `deviceToken`.
  3. PIN authentication & session establishment: 4-digit PIN returns user identity, role, and permission flags.
  4. Delta pull & push stream: Pulling with `since_seq` returns incremental change-log; pushing batch mutations updates database.
  5. Offline outbox queuing: Local IndexedDB store inserts records with deterministic idempotency keys and initial status `pending`.

### Tier 2: Boundary Value Analysis (BVA) & Negative Fault Injection
- **Objective**: Validate strict rejection and recovery behaviors when inputs sit on or beyond operational boundaries.
- **Methodology**: Exercise minimums, maximums, empty collections, expired TTLs, tampered signatures, and poisoned payloads.
- **Coverage Areas**:
  1. **Token TTL Expiry**: Rejection of pairing claims when `Date.now() > expiresAt` (>10 minutes).
  2. **Cryptographic Tampering**: Rejection of pairing payloads with modified `storeId`, `token`, or invalid HMAC-SHA256 signature.
  3. **Security Lockout**: Rejection of revoked `deviceToken` (`is_active = 0`) and incorrect 4-digit PINs.
  4. **Idempotency Guard**: Re-submission of identical mutation payload with duplicate `idempotency_key` returns original cached result without re-executing business mutations.
  5. **Out-of-Order Sequence Vectors**: Requesting `since_seq` ahead of `current_seq` cleanly returns an empty delta stream without throwing.
  6. **Corrupted Queue Record (Poison Pill) Isolation**: A corrupted mutation record in an offline batch is isolated to dead-letter state without aborting or stalling valid preceding/subsequent transactions.
  7. **Exponential Backoff Calculation**: Exact formula verification for retry delays: `delay = Math.min(30000, 1000 * 2^retryCount)`.

### Tier 3: Pairwise Combinatorial & Concurrency Testing
- **Objective**: Test non-linear interactions across independent dimensions (Roles × Payment Methods × Sync States × Devices).
- **Methodology**: All-pairs orthogonal sampling to uncover multi-variable boundary bugs.
- **Coverage Areas**:
  1. **Cross-Role Permissions Matrix**:
     - *Manager* × (POS + Full Financial Dashboard + Unmasked Profit + Settings + Stock Adjust).
     - *Accountant* × (Financial Analytics + Unmasked Profit + Read-Only Settings + POS).
     - *Cashier* × (POS + Masked Profit `*** د.ل` + Blocked Settings + Blocked Invoice Deletion).
  2. **Multi-Device Concurrent Pairing**: Multiple mobile devices pairing with the same store token concurrently within valid TTL window.
  3. **Commutative Stock Deductions**:
     - Multiple mobile nodes independently selling fragrance units offline: Initial stock 100.
     - Device A sells 12 units; Device B sells 18 units; Device C sells 5 units.
     - Final converged stock must equal `100 - 12 - 18 - 5 = 65` regardless of arrival order (`qty = qty - sold`).
  4. **Dual Offline Action on Same SKU**:
     - Device A executes an offline POS sale of 2 units.
     - Device B performs an offline physical stock audit setting counted stock to 15.
     - System reconciles relative sale decrement alongside authoritative physical audit timestamp trail.

### Tier 4: Real-World Store Operational Workloads
- **Objective**: Simulate full-scale, end-to-end retail operational scenarios under heavy realistic conditions.
- **Methodology**: Multi-step stateful workflows mirroring actual perfume boutique daily operations.
- **Coverage Areas**:
  1. **Store Onboarding Flow**:
     - Manager generates pairing token and displays QR code.
     - Pairs 3 cashier mobile devices (Counter 1, Counter 2, Floor Scanner).
     - Manager regenerates master pairing token; existing active paired devices maintain valid sessions while expired token cannot be reused.
  2. **High-Volume Flash Sale Storm**:
     - 50 mobile transactions generated concurrently across multiple mobile workers.
     - All 50 transactions pushed simultaneously to desktop SQLite sync bridge.
     - Verifies: 100% success rate, 0 lock contention errors, exact revenue/COGS/profit accumulation, and zero duplicate invoices.
  3. **Complete Store Internet Blackout & Reconnection**:
     - Network connection drops to zero.
     - 10 mobile POS sales and 5 camera stock audits executed entirely offline into local outbox queue.
     - Connection is restored: outbox flushes all 15 records in batch.
     - Verifies: 100% clean SQLite reconciliation, zero data loss, exact cash drawer updates, and comprehensive audit trail logging.

---

## 4. Test Execution & Verification Protocol

### Commands
```bash
# Execute entire ERP automated QA and E2E verification suite
npm test

# Run individual suite
node --test test/suites/16_cloudflare_pairing_and_token_exchange.test.js
node --test test/suites/17_cloudflare_delta_sync_and_idempotency.test.js
node --test test/suites/18_offline_queue_resilience_and_reconnection.test.js
```

### In-Memory Isolation Architecture
All automated tests execute against dedicated in-memory SQLite (`:memory:`) and in-memory mock Cloudflare Worker/KV/D1 harnesses (`test/harness/mock-cloudflare-worker.js`). No live network ports or external Cloudflare credentials are required, enabling deterministic, sub-second CI execution.
