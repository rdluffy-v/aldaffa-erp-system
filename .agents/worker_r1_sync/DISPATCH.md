## 2026-08-30T06:00:51Z
You are Worker 1 for Milestone R1: Cloudflare Hybrid Sync Engine & Desktop IPC Bridge.
Your Working Directory: /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/worker_r1_sync
Project Scope: /home/rdluffy/Desktop/aldaffa-app-desktop/PROJECT.md
Original Request: /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/ORIGINAL_REQUEST.md

Relevant Skills:
- /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/skills/cloudflare/SKILL.md
- /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/skills/offline-first-data-sync/SKILL.md
- /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/skills/durable-objects/SKILL.md
- /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/skills/wrangler/SKILL.md
- /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/skills/aldaffa-project-error-prevention/SKILL.md
- /home/rdluffy/Desktop/aldaffa-app-desktop/.agents/skills/sqlite-desktop-performance/SKILL.md

Tasks for Milestone R1:
1. Cloudflare Worker Backend (`src/worker/`):
   - Create `src/worker/index.js`, `src/worker/schema.sql`, `src/worker/d1-client.js`, `wrangler.jsonc`.
   - Implement D1 tables (`stores`, `devices`, `products`, `sales`, `sale_items`, `sync_events`, `idempotency_keys`).
   - Implement KV pairing token management (`pair:{token}` with 10m TTL), device token issuance, and delta sync endpoints (`GET /api/v1/sync/pull`, `POST /api/v1/sync/push`, `POST /api/v1/pairing/claim`, `POST /api/v1/auth/pin`).
2. Mock Cloudflare Worker (`test/harness/mock-cloudflare-worker.js`):
   - Implement an in-memory test harness simulating Worker + D1 (via better-sqlite3 :memory:) + KV so all automated tests run offline.
3. Desktop Settings UI (`src/modules/Settings.jsx`):
   - Add a dedicated `mobile_sync` tab with luxury Arabic styling.
   - Display dynamic pairing QR code (containing storeId, token, LAN URL, Cloud URL, expiration), connection status badge, server controls (start/restart/port change), pairing token regenerator, and Cloudflare sync telemetry.
4. Desktop Bridge Server Harmonization (`server/mobileBridgeServer.cjs` & `main.cjs`):
   - Harmonize queries to access canonical `inventory`, `sales`, `sale_items`, `users`, `debtors` tables.
   - Wrap mutations in atomic `better-sqlite3` `db.transaction()` calls for zero-lock SQLite concurrency.
   - Expose updated IPC channels in `main.cjs` for mobile pairing and sync telemetry.
5. Verification:
   - Run `npm test` to verify that all existing tests pass and the new bridge works seamlessly.
   - Write your handoff report to `/home/rdluffy/Desktop/aldaffa-app-desktop/.agents/worker_r1_sync/handoff.md` and report back.
