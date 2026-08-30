## 2026-08-30T06:00:51Z
You are the Test Writer for the E2E Testing Track.
Your Working Directory: /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/test_writer_e2e
Project Scope: /home/rdluffy/Desktop/aldaffa-app-desktop/PROJECT.md
Original Request: /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/ORIGINAL_REQUEST.md

Relevant Skills:
- /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/skills/automated-erp-qa-testing/SKILL.md
- /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/skills/cash-drawer-shift-reconciliation/SKILL.md
- /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/skills/multi-role-rbac-security/SKILL.md

Tasks:
1. Create `TEST_INFRA.md` at project root (`/home/rdluffy/Desktop/aldaffa-app-desktop/TEST_INFRA.md`) based on `PROJECT.md` Feature Inventory following the 4-tier methodology (Category-Partition, Boundary Value Analysis, Pairwise Combinatorial, Real-World Workloads).
2. Implement comprehensive automated test suites in `test/suites/`:
   - `test/suites/16_cloudflare_pairing_and_token_exchange.test.js`:
     * Tier 1: Pairing payload generation, QR code content structure, token claim, PIN verification.
     * Tier 2: Expired token rejection (>10m TTL), tampered HMAC signature rejection, invalid PIN attempts, revoked device blocking.
     * Tier 3: Pairwise cross-role logins (manager vs accountant vs cashier) and multi-device pairing on same store.
     * Tier 4: Real-world store onboarding scenario (Manager pairs 3 cashier phones, regenerates master token).
   - `test/suites/17_cloudflare_delta_sync_and_idempotency.test.js`:
     * Tier 1: Pull delta stream, push batch mutations, sequence vector increments.
     * Tier 2: Duplicate mutation submission with identical idempotency key (must be idempotent), out-of-order sequence handling, empty delta streams.
     * Tier 3: Concurrent delta sync across multiple devices; commutative stock deductions (`qty = qty - sold`).
     * Tier 4: High-volume flash sale scenario (50 mobile transactions synced simultaneously to desktop).
   - `test/suites/18_offline_queue_resilience_and_reconnection.test.js`:
     * Tier 1: Enqueue sales offline, inspect IndexedDB queue structure, flush on online event.
     * Tier 2: Partial network failures mid-batch, retry backoff calculation, corrupted queue record isolation.
     * Tier 3: Offline sale + offline stock audit on the same perfume bottle; conflict resolution check.
     * Tier 4: Complete store internet blackout simulation (10 offline sales, 5 stock audits, reconnected, 100% clean SQLite reconciliation).
3. Ensure all tests integrate cleanly into `test/harness/test-runner.js` and pass with `npm test`.
4. Create `TEST_READY.md` at project root summarizing all tiers and coverage.
5. Write your handoff report to `/home/rdluffy/Desktop/aldaffa-app-desktop/.agents/test_writer_e2e/handoff.md` and report back.
