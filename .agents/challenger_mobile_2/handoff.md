# Empirical Handoff Report — Challenger 2 (POS & Scanner Boundary Challenger)

## 1. Observation

### Empirical Test Execution & Benchmark Metrics
- **Test Suite**: `test/suites/22_adversarial_pos_scanner_boundaries.test.js` executed via `node test/harness/test-runner.js`.
- **Test Suite Results**: 13 / 13 tests passed (100%) in `22_adversarial_pos_scanner_boundaries.test.js`.
- **System-Wide Results**: 143 passed, 2 failed out of 145 total tests in the runner.
- **Barcode Latency Benchmark (5,000 SKUs, 1,000 randomized queries)**:
  - `p50` latency: **0.004 ms**
  - `p95` latency: **0.005 ms**
  - `p99` latency: **0.021 ms**
  - `max` latency: **0.163 ms**
  - **SLA Conformance**: Strictly < 300 ms SLA (exceeds SLA by 1800x).

---

### Verbatim Code Observations & Defect Evidence

#### Defect 1: Cryptographic Pairing Token Verification Bypass
- **File**: `server/mobileBridgeServer.cjs:158`
- **Verbatim Code**:
  ```javascript
  if (token === pairingToken || (token && token.startsWith('pair_'))) {
  ```
- **Finding**: The condition `(token && token.startsWith('pair_'))` evaluates to `true` for ANY client providing an arbitrary header `X-Pairing-Token: pair_arbitrary_string_12345`. This completely bypasses pairing token verification on `/api/pairing/verify` and allows unauthenticated pairing claims.

#### Defect 2: Stock Audit Note Timestamp ID Collision
- **File**: `server/mobileBridgeServer.cjs:647`
- **Verbatim Code**:
  ```javascript
  db.prepare(`
    INSERT INTO notes (id, title, content, date, is_completed)
    VALUES (?, ?, ?, ?, 1)
  `).run(
    'AUDIT-' + Date.now(),
    `تعديل مخزون: ${product.name}`,
    `تم تعديل الكمية من ${prevQty} إلى ${newQuantity}. السبب: ${reason}`,
    new Date().toISOString()
  );
  ```
- **Finding**: Generating IDs with `'AUDIT-' + Date.now()` creates primary key collisions when rapid barcode scans or batch adjustments occur within the same millisecond. Because the operation is wrapped in `try { ... } catch(e) {}`, SQLite throws `UNIQUE constraint failed: notes.id` and the audit note is silently dropped without logging.

#### Defect 3: Server-Side Financial Data Leakage over HTTP REST API
- **File**: `server/mobileBridgeServer.cjs:357-483` & `server/mobileBridgeServer.cjs:292-353`
- **Verbatim Code**:
  ```javascript
  return sendJson(200, {
    success: true,
    date: today,
    stats: {
      invoices: totalInvoices,
      revenue: totalRevenue,
      profit: totalProfit, // <--- Raw profit sent over wire
      cashDrawer,
      cashSales,
      debtSales,
      bankSales,
      expenses: expensesAmount,
      returns: returnsAmount
    },
    today_sales: totalRevenue,
    today_profit: totalProfit, // <--- Raw profit sent over wire
    cash_drawer: cashDrawer,
    invoices_count: totalInvoices,
    top_perfumes: topProducts,
    topProducts
  });
  ```
- **Finding**: Financial data masking is implemented solely on the client DOM in `public/mobile/app.js:958-981`. The backend bridge server transmits raw unmasked profit and unit cost prices in the JSON payload to all callers of `/api/dashboard/stats` and `/api/products` regardless of the caller's role or PIN session. Any cashier inspecting HTTP responses via browser DevTools or `curl` can view exact profit margins.

#### Defect 4: Cash Change Calculator Bug on 100% Discount / Zero-Total Transactions
- **File**: `public/mobile/app.js:778`
- **Verbatim Code**:
  ```javascript
  if (received >= totalAmount && totalAmount > 0) {
    const change = received - totalAmount;
    changeEl.textContent = `${change.toFixed(2)} د.ل`;
    changeEl.className = 'font-black text-emerald-400 font-mono text-sm';
  } else if (received > 0 && received < totalAmount) {
    const deficit = totalAmount - received;
    changeEl.textContent = `متبقي: -${deficit.toFixed(2)} د.ل`;
    changeEl.className = 'font-black text-rose-400 font-mono text-sm';
  } else {
    changeEl.textContent = '0.00 د.ل';
    changeEl.className = 'font-black text-[#8b949e] font-mono text-sm';
  }
  ```
- **Finding**: If a 100% discount is applied (`totalAmount === 0`) and the cashier receives cash (e.g. `received = 50`), the condition `totalAmount > 0` is `false`. The function falls through to `else` and displays `0.00 د.ل` change instead of `50.00 د.ل`, failing change return math.

#### Defect 5: Inventory Decant Deduction Granularity
- **File**: `server/mobileBridgeServer.cjs:582`
- **Verbatim Code**:
  ```javascript
  db.prepare(`UPDATE ${invTable} SET ${qtyField} = MAX(0, ${qtyField} - ?) WHERE id = ?`).run(itemQty, pId);
  ```
- **Finding**: When a 3ml decant portion is sold, `itemQty` is passed as `1` (one portion bottle). The backend decrements the parent product's stock by `1` full tola (12ml) instead of `0.25` tolas (or `3ml` volume equivalent). Selling four 3ml decants deducts 4 full tolas (48ml) rather than 1 full tola (12ml).

---

## 2. Logic Chain

1. **Premise 1 (Cryptographic Authentication)**: A pairing endpoint that accepts any string prefixed with `'pair_'` (Observation 1) permits arbitrary clients to bypass token secrecy and claim pairing credentials.
2. **Premise 2 (Audit Log Integrity)**: Rapid barcode auditing requires sub-millisecond logging. Using `Date.now()` without a random salt as a primary key (Observation 2) guarantees constraint collisions under rapid scans, violating audit trail integrity.
3. **Premise 3 (RBAC Security & Data Masking)**: Masking sensitive financial figures only in the presentation layer (DOM) while serving raw costs and profits over open REST endpoints (Observation 3) violates the RBAC security contract defined in `PROJECT.md §16` and `ORIGINAL_REQUEST §R4`.
4. **Premise 4 (Financial Math Precision)**: Guarding change return with `totalAmount > 0` (Observation 4) creates an edge case where 100% discounted invoices cannot calculate change from received cash.
5. **Premise 5 (Decant Inventory Precision)**: Decanting fractional portions (Observation 5) requires proportional stock decrement (`portion_ml / capacity_ml` or equivalent portion volume). Decrementing integer units causes 4x over-deduction for 3ml decants.

---

## 3. Caveats

- **Hardware Sensors**: Physical camera sensors and hardware vibrators were evaluated using standard Web Audio (1800Hz / 80ms) and Web API vibration invariants in memory rather than on physical Android/iOS hardware.
- **Client Offline Queue Tests**: Service worker background sync was evaluated via IndexedDB mock state machines rather than live browser tab disconnects.

---

## 4. Conclusion & Verdict

- **Explicit Verdict**: **`REJECT`**
- **Rationale**: While POS touch calculations, EAN-13/Code-128 barcode format validation, and barcode lookup latency (<0.163ms vs <300ms SLA) perform exceptionally well, the implementation exhibits **5 critical security, concurrency, and mathematical boundary defects**:
  1. Pairing token prefix authentication bypass (`server/mobileBridgeServer.cjs:158`).
  2. Stock audit note primary key timestamp collision under rapid scans (`server/mobileBridgeServer.cjs:647`).
  3. Server-side API profit/cost leakage over REST endpoints for restricted Cashier sessions (`server/mobileBridgeServer.cjs:357-483`).
  4. Change return calculator failure on 0-total / 100% discount transactions (`public/mobile/app.js:778`).
  5. Fractional decant inventory over-deduction (`server/mobileBridgeServer.cjs:582`).

---

## 5. Verification Method

To independently reproduce and verify all observations and test invariants:

```bash
# Execute full multi-suite test runner including Suite 22 (Challenger 2 Boundary Suite)
node test/harness/test-runner.js
```

### Invalidation Conditions
- Defect 1 is invalidated if `server/mobileBridgeServer.cjs:158` is updated to strict equality: `if (token === pairingToken)`.
- Defect 2 is invalidated if `server/mobileBridgeServer.cjs:647` uses unique IDs: `'AUDIT-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex')`.
- Defect 3 is invalidated if `/api/dashboard/stats` and `/api/products` inspect the session token and sanitize `profit` and `cost_price` to `null` or `0` for cashier roles on the server side.
- Defect 4 is invalidated if `public/mobile/app.js:778` changes to `if (received >= totalAmount && (totalAmount > 0 || received > 0))`.
- Defect 5 is invalidated if `/api/pos/checkout` calculates `effectiveDeductQty = item.portion_ml ? (item.portion_ml / (isTola ? 12 : 100)) * itemQty : itemQty`.
