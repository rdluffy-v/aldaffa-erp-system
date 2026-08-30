## 2026-08-30T06:31:35Z
You are Worker: Remediation & Boundary Hardening Specialist.
Your Working Directory: /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/worker_remediation_1
Project Scope: /home/rdluffy/Desktop/aldaffa-app-desktop/PROJECT.md
Original Request: /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/ORIGINAL_REQUEST.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Context:
Challenger 1 and Challenger 2 identified 6 specific concurrency, security, and boundary defects during Phase 2 stress-testing.

Your Mission:
Remediate all 6 defects with genuine production-grade fixes and verify that all test suites pass.

Defects to Fix:
1. **Atomic Idempotency Reservation** (`src/worker/d1-client.js`, `src/worker/index.js`, `test/harness/mock-cloudflare-worker.js`):
   - Fix TOCTOU race condition where 100 concurrent requests with the same idempotency key slip past `getIdempotencyRecord()`.
   - Implement atomic reservation on `idempotency_keys` table using `INSERT INTO idempotency_keys (key, store_id, response_payload, created_at)` inside the atomic database transaction or reserve prior to execution. If a duplicate key is detected, return the cached response immediately and do NOT re-deduct inventory stock.
2. **Pairing Token Exact Match** (`server/mobileBridgeServer.cjs:158`):
   - Replace loose prefix check `token.startsWith('pair_')` with strict validation against the actual active pairing token (`token === activePairingToken` / valid token registry).
3. **Stock Audit Primary Key Collision** (`server/mobileBridgeServer.cjs:647`):
   - Change `id: 'AUDIT-' + Date.now()` to `id: 'AUDIT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)` to prevent primary key collision under rapid sub-millisecond barcode scans.
4. **Server-Side Financial RBAC Masking** (`server/mobileBridgeServer.cjs`):
   - Enforce server-side financial data masking on `/api/dashboard/stats` and `/api/products`.
   - In `/api/dashboard/stats`: Read user role from session/token/headers (`x-user-role`, `x-auth-token`). If role is `'cashier'`, return `profit: null`, `today_profit: null`, `masked: true`, empty velocity array, preventing raw profit leak to unauthorized clients.
   - In `/api/products`: When queried by cashier, omit or set `cost` / `cost_price` to `null`.
5. **Change Return Calculation Error** (`public/mobile/app.js:778`):
   - Fix change calculation when `totalAmount === 0` (e.g. 100% discount / free item) so `cashReceived` returns correct change: `const change = state.pos.cashReceived >= totalAmount ? Math.max(0, state.pos.cashReceived - totalAmount) : 0;`.
6. **Decant Fractional Stock Deduction** (`server/mobileBridgeServer.cjs:582`):
   - In checkout loop, calculate proportional decant deduction:
     `const qtyToDeduct = (item.portion_ml && item.capacity && item.capacity > 0) ? (Number(item.cart_qty || 1) * Number(item.portion_ml) / Number(item.capacity)) : Number(item.cart_qty || 1);`
     and update `inventory SET qty = qty - ? WHERE id = ?`.

Verification:
- Run `npm test` and verify that all test suites pass 100%.
- Run `npm run build` and verify that Vite builds cleanly.
- Write your handoff report to `/home/rdluffy/Desktop/aldaffa-app-desktop/.agents/worker_remediation_1/handoff.md` and report back.
