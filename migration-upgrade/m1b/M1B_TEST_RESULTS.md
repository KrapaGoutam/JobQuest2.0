# M1B Test Results

**Target 1:** local Supabase stack (CLI 2.117.0: GoTrue v2.197.0 image, PostgREST, Postgres 17) trusting a generated ES256 key. Verified both on the developer machine and in GitHub Actions.
**Target 2 (Hosted):** Supabase `jobquest-dev` (`xpnkasclquplmrcmhsif`, us-west-2) trusting the activated Option B ES256 key (`a73390b9-56bf-4d1a-a642-efd4479ca0b3`). Full hosted validation executed and passed.

## Evidence files (`migration-upgrade/m1b/evidence/`, sanitized: no tokens, keys, passwords or verifiers)

| File | What | Result |
|---|---|---|
| `integration-local-45d230.json` | First local run | 16/17: **B14 failed** (an expired token was still accepted 2.5 s after `exp`). This led to measuring the Data API skew leeway; B14 has no entry in this file |
| `integration-local-01494d.json` | Local run after the B14 correction | **17/17 PASS** |
| `integration-local-b2968d.json` | Local re-run before commit | **17/17 PASS** |
| `ci-36053855534/integration-local-fe60b3.json` | **CI** run on commit `6e17efc` | **17/17 PASS** |
| `integration-hosted-dev-56ede5.json` | **Hosted `jobquest-dev`** integration suite run | **17/17 PASS** (B01, B02, B04–B22, B25, B26, SEC, B03-api) |
| `e2e-browser-local-726814.json` | First Chromium run (local) | FAIL, a **false positive**: the Vite dev server served source modules (`/src/App.tsx` contains the detector literal `$argon2id$`; supabase-js contains the identifier `token_hash`). Code is covered by the bundle scans instead |
| `e2e-browser-local-fc5527.json`, `e2e-browser-local-6187b7.json` | Chromium, data-response scan (local) | **PASS** |
| `ci-36053855534/e2e-browser-local-9de84a.json` | **CI** Chromium | **PASS** |
| `e2e-browser-hosted-dev-593c4b.json` | **Hosted `jobquest-dev`** Chromium E2E spec | **PASS** (37 requests, 24 data responses, 0 forbidden hits, clean surfaces, B25 403, direct PostgREST read/write) |
| `bundle-scan-8b5c31.json` | B23: built bundle scanned with 4 real secret values as known secrets | **PASS** (0 findings) |
| `option-a-users-inventory.json` | Inventory of 20 synthetic Option A users on `jobquest-dev` before cleanup | **INVENTORIED & CLEANED** (0 remaining) |

## Matrix

| ID | Objective | Expected | Local / CI Result | Hosted `jobquest-dev` Result | Overall Status |
|---|---|---|---|---|---|
| B01 | Credential provisioning | Account, Argon2id credential, profile, PERSONAL + MANAGER, 10 codes, no `auth.users` | PASS. PHC `m=19456,t=2,p=1`; `supabase_auth_user_exists: false`; duplicate 409, weak 422, invalid email 422, optional email + phone 201 | PASS. HTTP 201, 10 recovery codes, Argon2id, no `auth.users` row; duplicate 409, weak 422 | **PASS** |
| B02 | Username/password login | 200 + HttpOnly refresh cookie; identical failures | PASS. 200; cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`; body keys `session, user`; wrong vs unknown identical | PASS. HTTP 200; `jq_rt` HttpOnly cookie set; body keys `session, user`; wrong vs unknown identical | **PASS** |
| B03 | No synthetic or private identity leak (HARD) | Nothing exposed | PASS. API: 97 responses clean. Browser: 24 data responses clean; surfaces clean; self-check 5/5 clean | PASS. API: 97 responses scanned, 0 findings. Hosted browser: 24 data responses, 0 findings; DOM, storage, cookies, console clean | **PASS** |
| B04 | Custom JWT accepted by the Data API (HARD) | ES256 + `kid`; contract claims; attacks 401 | PASS. Claims `aud, exp, iat, iss, jti, role, session_id, sub`; TTL 900 s; valid 200; attacks 401 | PASS. ES256 with kid `a73390b9-...`; Data API 200 (1 row); forged / tampered / alg-none all 401 | **PASS** |
| B05 | `auth.uid()` (HARD) | = `sub`, without an `auth.users` row | PASS. Profile row = `sub`; `rpc_create_workspace.created_by` = `sub`; forged owner 42501; `auth.users` row: none | PASS. `rls_profile_row_equals_sub: true`, `rpc_created_by_equals_sub: true`, forged owner 42501, no `auth.users` row | **PASS** |
| B06 | USER own-record RLS (HARD) | Own rows only; insert/update allowed | PASS | PASS. Own rows visible; own insert allowed; own update allowed | **PASS** |
| B07 | Peer USER denial (HARD) | 0 / 0 / 42501 / 42501 | PASS | PASS. Peer row visible: 0; peer update: 0; insert for peer: 42501; add member: 42501 | **PASS** |
| B08 | Cross-workspace denial (HARD) | 0 / 42501 / 0 / 0 | PASS | PASS. Outsider rows in W: 0; insert into W: 42501; foreign personal: 0; outsider membership: 0 | **PASS** |
| B09 | MANAGER same-workspace (HARD) | Sees all; update and insert for a member | PASS. Sees A and B; update 1; insert allowed | PASS. Manager sees owners A and B; update 1; insert allowed | **PASS** |
| B10 | MANAGER cross-workspace denial (HARD) | 0 / 0 / 42501 / 42501; last manager protected | PASS | PASS. Foreign ws rows: 0; update: 0; insert: 42501; self-add: 42501; last-manager demotion blocked | **PASS** |
| B11 | Direct browser Data API read (HARD) | Rows under RLS, no proxy | PASS. supabase-js `accessToken` 200; Chromium `GET /rest/v1/*` | PASS. supabase-js `createClient({ accessToken })` SELECT 200; browser Chromium GET 200 | **PASS** |
| B12 | Direct browser Data API write (HARD) | Insert and update allowed; DELETE denied; CHECK enforced | PASS. Insert 201, update 200, delete 42501, bad stage 23514 | PASS. Insert 201, update 200, delete 42501, bad stage 23514; browser Chromium POST + PATCH | **PASS** |
| B13 | Session creation | Session row + SHA-256 verifier; no raw token or IP | PASS. 30-day session; verifier = SHA-256(cookie); IP SHA-256 | PASS. Session row created (30 days); verifier = SHA-256(cookie); raw token false; IP sha256 only | **PASS** |
| B14 | Access-token expiry | Node rejects at once; Data API rejects after its leeway | PASS. Node 401; Data API 401 PGRST303 at +32.5 s; default TTL 900 s | PASS. Node `/me` 401; Data API 200 at +2.5s (clock-skew leeway), 401 PGRST303 at +32.5s | **PASS** |
| B15 | Refresh rotation (HARD) | Rotates; old consumed; CSRF and origin enforced | PASS. As expected; child links to parent; 403 / 403 | PASS. New access token; old verifier consumed; child links parent; missing CSRF 403; foreign origin 403 | **PASS** |
| B16 | Replay rejection (HARD) | Replay 401; session revoked; exactly 1 concurrent winner | PASS. Replay 401 `REFRESH_REUSED`; revoked `REFRESH_REUSE`; holder 401; concurrency `[200, 401×4]` | PASS. Immediate replay 401 `REFRESH_REUSED`; session revoked; holder 401; 1 of 5 concurrent wins | **PASS** |
| B17 | Logout / revocation (HARD) | Immediate | PASS. Revoked token 200 `[]`; old refresh 401; global revoked 4 | PASS. Local logout 200, cookies cleared, revoked token 0 rows; global logout revoked 4 sessions | **PASS** |
| B18 | Password change (HARD) | Current kept; others revoked | PASS. Current session rows 1 + refresh 200; other 0 rows / refresh 401 | PASS. Wrong current 401, change 200, other sessions revoked (3); current session kept (rows 1, refresh 200) | **PASS** |
| B19 | Recovery-code reset (HARD) | Single use; regeneration invalidates | PASS. Weak new password 422; recover 200 (9 left); replay 401; regenerate 200; old code 401 | PASS. Weak new 422; recover 200 (9 left); replay 401; regenerate 200; old code 401; new code 200 | **PASS** |
| B20 | Global invalidation after recovery (HARD) | All prior sessions dead | PASS. 3 of 3: 0 rows, refresh 401; new session works | PASS. All 3 pre-existing sessions revoked (0 rows, refresh 401); new session active | **PASS** |
| B21 | Account rate limiting | `[401×5, 429]`, locked even with the correct password | PASS. `failed_login_count` 5; recovery `[401×3, 429]` | PASS. 5 failures → 6th is 429 even with correct password; store is `user_accounts` (Postgres) | **PASS** |
| B22 | IP rate limiting (shared) | 21st 429; other IP OK; counter shared | PASS. Bucket hits 21 (key SHA-256); cross-client `allowed×3, blocked` | PASS. Limit 20; 21st is 429; different IP 401; shared across instances via `auth_rate_limits` table | **PASS** |
| B23 | Service role absent from the bundle (HARD) | 0 findings with real secrets as known values | PASS. 2 files, 4 known secret values, 0 findings; static test clean | PASS. Production bundle has 0 secret findings; only public publishable key present | **PASS** |
| B24 | Bundle secret scan (HARD) | Real secrets FAIL; harmless literals PASS | PASS. `check:bundle` 0; `check:secrets` 0; scanner unit tests 16/16 | PASS. Tracked files 188 scanned, 0 findings; bundle 0 findings; scanner fixtures verified | **PASS** |
| B25 | `/auth/v1/user` with an Option B token (HARD) | No identity | PASS. 403 `user_not_found`, body keys `code, error_code, msg`; no email or username; GoTrue signup 422 | PASS. Hosted 403 `user_not_found`, body keys `["code", "error_code", "msg"]`, no email/username; GoTrue signup 422, grant 400; browser probe 403 | **PASS** |
| B26 | Canonical workflow | Identical via Data API and Node; immutable | PASS. 8 stages, 5 outcomes; client update 0 rows; Node without token 401 | PASS. 8 stages, 5 outcomes, 5 closure reasons; Data API equals Node API; client update 0 rows | **PASS** |
| SEC | Privilege boundary (HARD) | 42501 everywhere | PASS. 6 auth tables and 4 privileged RPCs → 42501 | PASS. 6 auth system tables and 4 privileged RPCs return 42501 when called with user token | **PASS** |

**Local score: 26/26 B-tests + SEC PASS.**
**CI score: 26/26 B-tests + SEC PASS.**
**Hosted `jobquest-dev` score: 26/26 B-tests + SEC PASS.**
**Zero hard-fail conditions observed across all environments.**

## Static quality

| Check | Local | CI `36053855534` | Hosted Dev Pre-flight |
|---|---|---|---|
| `pnpm lint` | PASS | PASS | PASS |
| `pnpm typecheck` | PASS | PASS | PASS |
| `pnpm test:unit` | 6 files, 37 tests PASS | PASS | 6 files, 37 tests PASS |
| `pnpm build` | PASS | PASS | PASS |
| `pnpm check:bundle` | PASS (0 findings) | PASS | PASS (0 findings) |
| `pnpm check:secrets` | PASS (188 files, 0 findings) | PASS | PASS (188 files, 0 findings) |
| Integration suite | 17/17 PASS | 17/17 PASS | 17/17 PASS (`integration-hosted-dev-56ede5.json`) |
| Browser E2E spec | PASS | PASS | PASS (`e2e-browser-hosted-dev-593c4b.json`) |

