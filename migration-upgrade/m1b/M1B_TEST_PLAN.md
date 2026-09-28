# M1B Test Plan: Auth Option B

**Architecture under test:** `../gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md`
**Implementation:**
- `tests/integration/m1b.test.ts`: in-process Node API plus a real Supabase stack
- `e2e/leak.spec.ts`: real Chromium
- `tests/unit/*.test.ts`
- `scripts/check-bundle.mjs`

**Targets:**
1. **Local Supabase stack**: CLI 2.117.0; migrations applied from `supabase/migrations`; trusts a generated ES256 key. Also runs in CI.
2. **Hosted `jobquest-dev`**: runs after the signing-key checkpoint (`M1B_ENV_FILE=.env.local`). Same suite, no code changes.

**Rule:** a test is PASS only when its assertions ran and passed and sanitized evidence was written. HARD tests are Option B hard-fail conditions (amendment §16). Any HARD failure means OPTION B = FAIL, with no partial success.

| ID | Test | Method | Expected | Hard? |
|---|---|---|---|---|
| B01 | Credential provisioning | `POST /api/auth/register`; service-role reads | `user_accounts`, `user_credentials` (Argon2id PHC, never the plaintext), profile, PERSONAL workspace with MANAGER role, 10 unused Argon2id code verifiers; **no `auth.users` row**; duplicate username (any case) 409; weak password 422; invalid email 422; optional email and phone accepted | yes |
| B02 | Username/password login | `POST /api/auth/login` | 200; `jq_rt` HttpOnly, Secure, SameSite=Strict, Path=/api/auth; body has only user and session; wrong password and unknown user return identical responses | yes |
| B03 | No synthetic or private identity leak | API transcript scan (all responses) plus a Chromium scan of network data responses, storage, cookies, DOM, React state, console, and the in-page self-check (including a `/auth/v1/user` probe) | No verifier, credential field, refresh token (outside Set-Cookie), synthetic email, private key or secret key anywhere; the refresh cookie is not readable by script | **yes** |
| B04 | Custom JWT accepted by the Data API | Decode the header and claims; Data API query; forged (other key), tampered (`sub` changed), and `alg:none` tokens | ES256 with `kid`; claims exactly `aud, exp, iat, iss, jti, role, session_id, sub`; valid token 200 with rows; all three attacks 401 | **yes** |
| B05 | `auth.uid()` resolves | Own profile via RLS; `rpc_create_workspace.created_by`; forged-owner insert; `auth.admin.getUserById(sub)` | `auth.uid()` = `sub` = `user_accounts.user_id`; forged owner 42501; no `auth.users` row | **yes** |
| B06 | USER own-record RLS | USER selects, inserts and updates own rows in a shared workspace | All allowed; only own rows visible | **yes** |
| B07 | Peer USER denial | USER reads or updates a peer's row, inserts for a peer, adds a member | 0 rows / 0 rows / 42501 / 42501 | **yes** |
| B08 | Cross-workspace denial | Outsider reads, inserts or lists members in a foreign workspace; a member reads a foreign personal workspace | 0 / 42501 / 0 / 0 | **yes** |
| B09 | MANAGER same-workspace access | MANAGER reads all rows, updates a member's row, inserts for a member | Sees A and B; update 1 row; insert allowed | **yes** |
| B10 | MANAGER cross-workspace denial | MANAGER reads, updates, inserts into or self-adds to a foreign workspace; demotes the last manager | 0 / 0 / 42501 / 42501; last-manager trigger blocks | **yes** |
| B11 | Direct browser Data API read | supabase-js `accessToken` client (integration) plus Chromium `GET /rest/v1/*` | Rows returned under RLS; no Node proxy | **yes** |
| B12 | Direct browser Data API write | Insert and update through supabase-js (integration) plus Chromium `POST`/`PATCH /rest/v1/applications` | Allowed for own rows; DELETE denied (archive-first); CHECK constraint enforced | **yes** |
| B13 | Session creation | Login, then read `auth_sessions` and `auth_refresh_tokens` | Session row (30-day absolute), one refresh verifier = SHA-256(cookie), raw token and raw IP not stored | yes |
| B14 | Access-token expiry | Mint a 1-second token; Data API at +2.5 s and +32.5 s; Node `/me` | Node rejects immediately; Data API rejects after its skew leeway (PGRST303); default TTL 900 s | yes |
| B15 | Refresh rotation | `POST /api/auth/refresh` (plus missing-CSRF and foreign-origin attempts) | 200; new cookie and new access token; old verifier consumed; child links to parent; CSRF 403 / origin 403 | **yes** |
| B16 | Old refresh replay rejection | Replay the consumed token immediately; the legitimate holder refreshes afterwards; 5 concurrent refreshes of one token | Replay 401 `REFRESH_REUSED`; session revoked; holder 401; data 0 rows; exactly 1 of 5 concurrent refreshes wins; grace window 0 | **yes** |
| B17 | Logout / revocation | Local logout, old token and old refresh; other session; global logout | Revoked token 0 rows; old refresh 401; other session unaffected; global revokes all | **yes** |
| B18 | Password change | Wrong current, missing CSRF, change, old and new password logins, current vs other sessions | 401 / 403 / 200; old 401, new 200; **current kept** (rows + refresh 200); **others revoked** | **yes** |
| B19 | Recovery-code reset | Weak new password; recover; replay the code; old and new password; regenerate; old unused code; new code | 422 before any code is consumed; 200 with 9 remaining; replay 401; old 401 / new 200; regenerate 200; old set 401; new code 200 | **yes** |
| B20 | Global invalidation after recovery | 3 pre-existing sessions, then recovery | All 3: 0 rows and refresh 401; the recovering client's new session works | **yes** |
| B21 | Rate limiting: account | 6 wrong logins, then the correct password; 4 wrong recovery codes | `[401×5, 429]`; correct password while locked 429; recovery `[401×3, 429]`; stored in Postgres | yes |
| B22 | Rate limiting: IP abstraction | 21 logins from one IP; another IP; two independent server clients on one bucket | 21st 429; other IP 401; counter shared across clients; key is SHA-256 (no raw IP) | yes |
| B23 | Service role absent from the bundle | Build, then scan the bundle with the real secret values as known secrets (local plus hosted-dev secret key, DB password, signing-key `d`); static unit test of `apps/web/src` | 0 findings; publishable key present (expected) | **yes** |
| B24 | Bundle secret scan | `pnpm check:bundle` and `pnpm check:secrets` (all tracked files); scanner unit tests (true fixtures FAIL, harmless literals PASS) | 0 findings; all scanner tests pass | **yes** |
| B25 | `/auth/v1/user` with an Option B token | Integration plus Chromium probe; GoTrue signup and password grant | Not 200; no email or username in the body; no `auth.users` rows for test accounts; signup and grant refused | **yes** |
| B26 | Canonical workflow retrieval | Data API plus `GET /api/workflow`; client update; no token | Identical 8 stages and 5 outcomes; update 0 rows; Node without token 401 | yes |
| SEC | Privilege boundary | User token against the 6 auth system tables and 4 privileged RPCs | All 42501 | **yes** |

Hosted-only concerns, which a local stack cannot prove:
- API gateway behavior with `sb_publishable_` plus a custom `Authorization` JWT
- The imported key's `kid` handling after rotation
- Hosted GoTrue `/auth/v1/user` response
- Hosted Data API skew leeway

The same suite covers them once it runs against `jobquest-dev`.
