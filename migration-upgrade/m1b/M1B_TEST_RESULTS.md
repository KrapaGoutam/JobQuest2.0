# M1B Test Results

**Target:** local Supabase stack (CLI 2.117.0: GoTrue v2.197.0 image, PostgREST, Postgres 17) trusting a generated ES256 key. Verified both on the developer machine and in GitHub Actions.
**Hosted `jobquest-dev`:** **NOT RUN.** It is held at the signing-key checkpoint; see `M1B_INFRASTRUCTURE.md` §3.

## Evidence files (`migration-upgrade/m1b/evidence/`, sanitized: no tokens, keys, passwords or verifiers)

| File | What | Result |
|---|---|---|
| `integration-local-45d230.json` | First local run | 16/17: **B14 failed** (an expired token was still accepted 2.5 s after `exp`). This led to measuring the Data API skew leeway; B14 has no entry in this file |
| `integration-local-01494d.json` | Local run after the B14 correction | **17/17 PASS** |
| `integration-local-b2968d.json` | Local re-run before commit | **17/17 PASS** |
| `ci-36053855534/integration-local-fe60b3.json` | **CI** run on commit `6e17efc` | **17/17 PASS** |
| `e2e-browser-local-726814.json` | First Chromium run | FAIL, a **false positive**: the Vite dev server served source modules (`/src/App.tsx` contains the detector literal `$argon2id$`; supabase-js contains the identifier `token_hash`). Code is covered by the bundle scans instead |
| `e2e-browser-local-fc5527.json`, `e2e-browser-local-6187b7.json` | Chromium, data-response scan | **PASS** |
| `ci-36053855534/e2e-browser-local-9de84a.json` | **CI** Chromium | **PASS** |
| `bundle-scan-8b5c31.json` | B23: built bundle scanned with 4 real secret values as known secrets | **PASS** (0 findings) |

## Matrix

| ID | Objective | Expected | Actual (local + CI) | Result |
|---|---|---|---|---|
| B01 | Credential provisioning | Account, Argon2id credential, profile, PERSONAL + MANAGER, 10 codes, no `auth.users` | As expected. PHC `m=19456,t=2,p=1`; `supabase_auth_user_exists: false`; duplicate 409, weak 422, invalid email 422, optional email + phone 201 | **PASS** |
| B02 | Username/password login | 200 + HttpOnly refresh cookie; identical failures | 200; cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`; body keys `session, user`; wrong vs unknown identical | **PASS** |
| B03 | No synthetic or private identity leak (HARD) | Nothing exposed | API: 97 responses scanned, 0 findings. Browser: 24 data responses, 0 hits; storage, cookies, DOM, React state and console clean; self-check 5/5 clean; refresh cookie HttpOnly | **PASS** |
| B04 | Custom JWT accepted by the Data API (HARD) | ES256 + `kid`; contract claims; attacks 401 | Claims `aud, exp, iat, iss, jti, role, session_id, sub`; TTL 900 s; valid 200 with 1 row; forged / tampered / alg-none → 401 / 401 / 401 | **PASS** |
| B05 | `auth.uid()` (HARD) | = `sub`, without an `auth.users` row | Profile row = `sub`; `rpc_create_workspace.created_by` = `sub`; forged owner 42501; `auth.users` row: none | **PASS** |
| B06 | USER own-record RLS (HARD) | Own rows only; insert/update allowed | As expected | **PASS** |
| B07 | Peer USER denial (HARD) | 0 / 0 / 42501 / 42501 | As expected | **PASS** |
| B08 | Cross-workspace denial (HARD) | 0 / 42501 / 0 / 0 | As expected | **PASS** |
| B09 | MANAGER same-workspace (HARD) | Sees all; update and insert for a member | Sees A and B; update 1; insert allowed | **PASS** |
| B10 | MANAGER cross-workspace denial (HARD) | 0 / 0 / 42501 / 42501; last manager protected | As expected; demotion blocked | **PASS** |
| B11 | Direct browser Data API read (HARD) | Rows under RLS, no proxy | supabase-js `accessToken` 200; Chromium `GET /rest/v1/applications, workspace_members, workflow_definitions` | **PASS** |
| B12 | Direct browser Data API write (HARD) | Insert and update allowed; DELETE denied; CHECK enforced | Insert 201, update 200, delete 42501, bad stage 23514; Chromium `POST` + `PATCH /rest/v1/applications` | **PASS** |
| B13 | Session creation | Session row + SHA-256 verifier; no raw token or IP | 30-day session; verifier = SHA-256(cookie); 256-bit token; IP stored only as SHA-256 | **PASS** |
| B14 | Access-token expiry | Node rejects at once; Data API rejects after its leeway | Node `/me` 401; Data API 200 at +2.5 s, **401 PGRST303 at +32.5 s**; default TTL 900 s | **PASS** (leeway documented) |
| B15 | Refresh rotation (HARD) | Rotates; old consumed; CSRF and origin enforced | As expected; child links to parent; 403 / 403 | **PASS** |
| B16 | Replay rejection (HARD) | Replay 401; session revoked; exactly 1 concurrent winner | Replay 401 `REFRESH_REUSED`; revoked reason `REFRESH_REUSE`; holder 401; 0 rows; concurrency `[200, 401, 401, 401, 401]`; grace window 0 | **PASS** |
| B17 | Logout / revocation (HARD) | Immediate | Revoked token 200 `[]`; old refresh 401; other session unaffected; global revoked 4 | **PASS** |
| B18 | Password change (HARD) | Current kept; others revoked | Wrong current 401; no CSRF 403; change 200; others revoked 3; old password 401 / new 200; current session rows 1 + refresh 200; other session 0 rows / refresh 401 | **PASS** |
| B19 | Recovery-code reset (HARD) | Single use; regeneration invalidates | Weak new password 422 (code not consumed); recover 200 (9 left); replay 401; old / new password 401 / 200; regenerate 200; old code 401; new code 200 | **PASS** |
| B20 | Global invalidation after recovery (HARD) | All prior sessions dead | 3 of 3: 0 rows, refresh 401; new session works | **PASS** |
| B21 | Account rate limiting | `[401×5, 429]`, locked even with the correct password | As expected; `failed_login_count` 5; recovery `[401, 401, 401, 429]` | **PASS** |
| B22 | IP rate limiting (shared) | 21st 429; other IP OK; counter shared | As expected; bucket hits 21 (key SHA-256); cross-client `allowed×3, blocked` | **PASS** |
| B23 | Service role absent from the bundle (HARD) | 0 findings with real secrets as known values | 2 files, 447,821 bytes, 4 known secret values, 0 findings; publishable key present (expected). Static test: `apps/web/src` has no server-secret references | **PASS** |
| B24 | Bundle secret scan (HARD) | Real secrets FAIL; harmless literals PASS | `check:bundle` 0 findings; `check:secrets` 176 tracked files 0 findings; scanner tests 16/16 (true fixtures fail, harmless literals pass) | **PASS** |
| B25 | `/auth/v1/user` with an Option B token (HARD) | No identity | 403 `user_not_found`, body keys `code, error_code, msg`; no email or username; 0 `auth.users` rows; GoTrue signup 422, password grant 422; Chromium probe 403 | **PASS** |
| B26 | Canonical workflow | Identical via Data API and Node; immutable | 8 stages, 5 outcomes, 5 closure reasons; identical; client update 0 rows; Node without token 401 | **PASS** |
| SEC | Privilege boundary (HARD) | 42501 everywhere | 6 auth tables and 4 privileged RPCs → 42501 | **PASS** |

**Local and CI score: 26/26 B-tests + SEC PASS. No hard-fail condition was observed.**
**Hosted `jobquest-dev`: not run (0/26).**

## Static quality (commit `6e17efc`)

| Check | Local | CI `36053855534` |
|---|---|---|
| `pnpm lint` | PASS | PASS |
| `pnpm typecheck` | PASS | PASS |
| `pnpm test:unit` | 6 files, 37 tests PASS | PASS |
| `pnpm build` | PASS | PASS |
| `pnpm check:bundle` | PASS | PASS |
| `pnpm check:secrets` | PASS | PASS |
| Integration (local stack) | 17/17 | 17/17 |
| Browser e2e (local stack) | PASS | PASS |
