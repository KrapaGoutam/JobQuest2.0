# JOBQUEST2.0 — M1B OPTION B COMPLETION REPORT

## 1. Status

# OPTION B — PASS

- Option B passes all 26 B-tests plus the SEC boundary test across **all three targets**:
  1. **Local Supabase stack** (developer machine)
  2. **GitHub Actions CI** (disposable local stack)
  3. **Hosted Supabase `jobquest-dev`** (`xpnkasclquplmrcmhsif`, us-west-2)
- Zero Option B hard-fail conditions occurred in any environment.
- The hosted `jobquest-dev` signing-key checkpoint was completed with user approval: Option B ES256 key (`a73390b9-56bf-4d1a-a642-efd4479ca0b3`) imported and rotated to `in_use`; previous keys preserved as trusted in `previously_used` and **not revoked**.
- Migration `20260924200000_m1b_option_b_auth.sql` applied cleanly to `jobquest-dev`.
- Unintended M1 configuration drift restored (TOTP enroll/verify, OTP length, email interval); storage analytics limitation documented.
- All 20 synthetic Option A test accounts in `jobquest-dev` `auth.users` were inventoried and permanently purged.
- B25 critical security probe against hosted GoTrue `/auth/v1/user` returned 403 `user_not_found`, leaking zero user identity, username, email, or credentials.

## 2. Executive Summary

- **Option A** (M1) failed permanently. Supabase Auth's `/auth/v1/user` returned the synthetic email to the browser-held token.
- **What M1B built:** a narrowly scoped Option B architecture.
  - The Node API owns credentials (Argon2id) and sessions (app-owned session rows plus single-use rotating refresh tokens).
  - It mints 15-minute ES256 access JWTs.
  - The browser passes them to supabase-js (`accessToken` option) and calls the Data API directly under unchanged M1 RLS policies.
- **What hosted `jobquest-dev` and the local stack proved:**
  - the Data API accepts the Node-minted token and rejects forged, tampered, and `alg:none` tokens
  - `auth.uid()` equals the JWT `sub` with **no `auth.users` row**
  - all USER / peer / cross-workspace / MANAGER boundaries hold
  - direct browser reads and writes work without Node proxying
  - `/auth/v1/user` returns 403 `user_not_found`, so there is no identity to leak
  - replayed refresh tokens are rejected and the session is revoked (exactly 1 of 5 concurrent refreshes wins)
  - a password change keeps the current session and revokes the others
  - recovery revokes all sessions
  - account and shared per-IP limits work durably in PostgreSQL
  - the structure-aware secret scanner finds 0 findings in the bundle and in all 188 tracked files
- **Housekeeping done:**
  - Option A formally closed.
  - Evidence errata recorded.
  - CI verified green (Run `36053855534`).
  - Scanner corrected, with tests.
  - 4 verified dev settings restored; 5th setting (storage analytics) explained (requires paid tier for Iceberg catalog).
  - 20 synthetic Option A test identities purged from `jobquest-dev`.
  - Vanished-project investigation: **CAUSE UNKNOWN**.

## 3. Option A Closure

- **Result:** `AUTH OPTION A — FAILED`; permanently rejected for this architecture.
- **Recorded as:**
  - ADR-030 → **SUPERSEDED / FAILED IN M1** (original text preserved; `../DECISIONS.md`).
  - OQ-011 → **Option A resolved FAIL**; next evaluation Option B / M1B (`../OPEN_QUESTIONS.md`).
  - `../gate-03/AUTHENTICATION_DESIGN.md` carries the failure note and a pointer to the amendment.
- **Evidence:** `../m1/evidence/integration-191a31.json` (T03) and `../m1/evidence/e2e-leak-local-7e830d.json` (real Chromium).
- **Evidence re-read (M1B §4)** found discrepancies in the M1 summary. They were corrected in `../m1/M1_TEST_RESULTS.md` (Errata):
  - SEC-01/02 actually **passed**.
  - T07, T09 and T11 have no evidence-file entries; their failures are in the CI log of run `36046698484`.
  - `e2e-leak-local-995b06.json` was an invalid "PASS" in which the self-check had not run.
- The M1 branch keeps all tests and evidence; nothing was deleted.

## 4. Gate 03 Auth Amendment

`../gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md` formally amends authentication. It covers:
- reason and Option A evidence
- architecture
- credentials and hashing
- sessions and refresh tokens
- JWT signing and Supabase trust configuration
- the claim contract
- RLS, direct Data API and `auth.uid()` behavior
- recovery, password policy and rate limiting
- threat-model changes
- new, changed and removed objects
- deprecated Option A concepts
- pass/fail criteria
- **official sources**

Records updated:
- `../DECISIONS.md`: ADR-043 to ADR-047 (APPROVED based on M1B proof).
- `../CHANGE_REQUESTS.md`: CR-030 to CR-032.
- `../OPEN_QUESTIONS.md`: OQ-011, OQ-025, OQ-026, OQ-027, OQ-028 resolved.
- Notes added in `../gate-03/TARGET_SCHEMA.md` and `../gate-03/M1_SPIKE_PLAN.md`.

## 5. Credential Architecture

- `public.user_credentials` (`user_id`, `password_hash` as a PHC string, `password_algorithm = argon2id`, `password_version`, `password_changed_at`, timestamps) is separate from `user_accounts`.
- Argon2id with m = 19456 KiB, t = 2, p = 1 (OWASP baseline), configured centrally in `apps/api/src/env.ts`, with automatic rehash on login.
- The password policy is unchanged.
- Unknown usernames cost the same Argon2 work, and failures have a response-time floor.
- Plaintext is never stored. B01 verified the PHC prefix and the absence of plaintext on local, CI, and hosted `jobquest-dev`.

## 6. Session Architecture

- **`public.auth_sessions`:** absolute 30-day lifetime; revocable with a reason; user agent; IP stored only as SHA-256.
- **`public.auth_refresh_tokens`:** a 256-bit opaque token (`jqr_…`) in the `jq_rt` cookie (HttpOnly, Secure, SameSite=Strict, Path=/api/auth), with only its SHA-256 stored. Tokens are single use with parent links.
- **Access token:** 15-minute ES256 JWT, held only in browser memory.
- **Revocation:** `app.session_is_active()`, called by every RLS helper, rejects revoked sessions immediately.

## 7. JWT Signing / Supabase Trust

- **ES256** (CLI-recommended; the signing-keys system supports RSA, EC and shared secrets).
- The private JWK is server only (`JQ_JWT_PRIVATE_JWK`).
- **Claims:** `sub`, `role = authenticated`, `aud = authenticated`, `iss = jobquest-api`, `iat`, `exp`, `jti`, `session_id`. There are no workspace roles.
- **Local trust:** `[auth] signing_keys_path` with a generated, gitignored key. **Proven.**
- **Hosted trust (`jobquest-dev`):**
  - Generated ES256 key pair (`kid: a73390b9-56bf-4d1a-a642-efd4479ca0b3`).
  - Stored private JWK server-only in `.env.local` (`JQ_JWT_PRIVATE_JWK`).
  - Imported via Management API `POST /v1/projects/xpnkasclquplmrcmhsif/config/auth/signing-keys` with status `standby`.
  - Rotated via Management API `PATCH /v1/projects/xpnkasclquplmrcmhsif/config/auth/signing-keys/a73390b9-56bf-4d1a-a642-efd4479ca0b3` to `in_use`.
  - Prior key `e520372b-f578-4d04-bee6-46cbf5a52ae8` preserved in `previously_used` state as trusted; **not revoked**.
  - Verified via public JWKS endpoint.

## 8. Direct PostgREST Architecture

The Gate 03 hybrid model (ADR-042) is **kept**:
- The browser uses `createClient(url, publishableKey, { accessToken })`. The `auth` namespace is disabled by supabase-js.
- The service role is **never** used for user CRUD. A static unit test confirms `admin()` appears only in the auth routes, the rate limiter and its own module, and that the auth routes never touch business tables.
- **Evidence:** B11/B12 (integration on local and hosted `jobquest-dev`) plus Chromium `GET /rest/v1/applications|workspace_members|workflow_definitions` and `POST` + `PATCH /rest/v1/applications`.

## 9. auth.uid() Result

**PASS (Local, CI, and Hosted `jobquest-dev`).**
`auth.uid()` = JWT `sub` = `user_accounts.user_id`. Proven three ways:
- the own-profile RLS row
- `rpc_create_workspace.created_by`
- a forged-owner insert returning 42501

All of this held while `auth.admin.getUserById(sub)` returned **no user** (`auth_users_row_for_sub: "none"`).

## 10. /auth/v1/user Leak Test (B25 CRITICAL)

**PASS (Local, CI, and Hosted `jobquest-dev`).**
- The original M1 attack, repeated with the Option B token against hosted `jobquest-dev`, returned **403 `{"code":403,"error_code":"user_not_found","msg":"User not found"}`**: no email, no username.
- The same result came from the in-page Chromium probe.
- GoTrue signup returned 422 and password grant returned 400.
- There are 0 `auth.users` rows for test accounts.
- The result does not depend on hiding anything: there is no Supabase Auth identity.

## 11. RLS Results

**PASS (Local, CI, and Hosted `jobquest-dev`).**

| Test | Scenario | Local Result | Hosted `jobquest-dev` Result |
|---|---|---|---|
| B06 | USER, own rows | Visible and editable | Own rows visible; own insert & update allowed |
| B07 | USER, peer rows | 0 rows; update 0; insert 42501; add member 42501 | Peer visible 0; peer update 0; insert 42501; add member 42501 |
| B08 | Cross-workspace outsider | 0 / 42501 / 0 | 0 / 42501 / 0 / 0 |
| B09 | MANAGER, same workspace | Sees A and B; updates and inserts for members | Sees A and B; update 1; insert allowed |
| B10 | MANAGER, foreign workspace | 0 / 0 / 42501 / 42501; last-manager demotion blocked | Foreign rows 0; update 0; insert 42501; last manager demotion blocked |
| SEC | User token against 6 auth tables and 4 privileged RPCs | All 42501 | All 42501 |

## 12. Refresh Rotation / Replay

**PASS (Local, CI, and Hosted `jobquest-dev`).**
- B15: rotation issues a new cookie and a new JWT; old verifier is consumed; child links to parent; missing CSRF token gets 403; foreign origin gets 403.
- B16: immediate replay of consumed token returns 401 `REFRESH_REUSED`; session is revoked (`REFRESH_REUSE`); legitimate holder gets 401; data rows are 0.
- Concurrency: 5 simultaneous refreshes produced `[200, 401, 401, 401, 401]`.
- **Grace window: none** (justified in amendment §6). The SPA serializes refresh with Web Locks.
- This structurally fixes M1 T07.

## 13. Password Change

**PASS (Local, CI, and Hosted `jobquest-dev`).** Policy: **current session kept and all other sessions revoked** (`rpc_change_password`, atomic).
- B18: wrong current password 401; missing CSRF 403; change 200 (3 others revoked); old password 401 / new 200; current session rows 1 and refresh 200; other session 0 rows / refresh 401.
- The M1 T09 defect is not inherited.

## 14. Recovery

**PASS (Local, CI, and Hosted `jobquest-dev`).**
- B19: weak new password is rejected **before** any code is consumed; recovery succeeds (9 codes left); code replay gets 401; old password 401 / new 200; regeneration invalidates old set (old code 401, new code 200).
- B20: all 3 prior sessions were revoked; recovering client received a fresh session.

## 15. Rate Limiting

**PASS (Local, CI, and Hosted `jobquest-dev`).**
- B21, per account (durable, Postgres): logins `[401×5, 429]`; locked even with correct password; recovery `[401×3, 429]`.
- B22, per IP: **shared Postgres limiter** (`auth_rate_limits` / `rpc_rate_limit_hit`, SHA-256 keys) gives 21st request 429; another IP unaffected; counter shared across independent clients.
- **Proven now:** distributed-correct limiting across instances.
- **Required before production:** Vercel edge/WAF limits, bucket cleanup, and capacity test (OQ-030).

## 16. Supabase Dev Configuration Restoration

During M1, an unintended broad configuration push changed several development settings. M1B restored the verified pre-M1 settings using targeted Management API calls (`PATCH /v1/projects/{ref}/config/auth`), avoiding broad configuration pushes.

| Setting | Verified prior value | Drifted value on hosted | Restored value & method |
|---|---|---|---|
| `auth.mfa.totp.enroll_enabled` | true | false | **true** (via Management API `PATCH /config/auth`) |
| `auth.mfa.totp.verify_enabled` | true | false | **true** (via Management API `PATCH /config/auth`) |
| `auth.email.otp_length` | 8 | 6 | **8** (via Management API `PATCH /config/auth`) |
| `auth.email.max_frequency` | `1m0s` | `1s` | **1m0s** (`smtp_max_frequency: 60`, via `PATCH /config/auth`) |
| `storage.analytics.enabled` | true | false | Blocked by platform tier (`Please upgrade the project to a paid tier to enable iceberg catalog`). Explains why setting drifted on free tier. |

## 17. Option A Test Identity Cleanup

All leftover synthetic identities created during M1 Option A test runs were inventoried and cleaned up from `jobquest-dev`:
- 20 synthetic accounts matching `id_<uuid>@auth.jobquest.internal` inventoried in `migration-upgrade/m1b/evidence/option-a-users-inventory.json`.
- Associated test data removed from public tables (`applications`, `workspace_members`, `workspaces`, `profiles`, `user_accounts`).
- All 20 accounts permanently deleted from `auth.users` via GoTrue admin API.
- Zero Option A test accounts remain.

## 18. Missing JobQuest2.0 Project Investigation

**CAUSE UNKNOWN.** Evidence:
- `JobQuest2.0` (`tezddimqfpyljhsaucmx`, org `fisaxwdkkdpbamvwkvnm`) was listed at 18:52:29 and absent at 18:55:37, both listings being for the same org.
- The agent created `jobquest-dev` in between.
- No agent command deleted, paused or transferred any project.
- Left as **CAUSE UNKNOWN** without destructive changes.

## 19. Secret Scanner Correction

- `scripts/lib/secret-scan.mjs` + `scripts/check-bundle.mjs`, with modes `bundle` and `--tracked`.
- Replaces bare substrings with structural AST and regex rules.
- Scanner tests prove true fixtures FAIL and harmless literals PASS.
- Results: `check:bundle` 0 findings; `check:secrets` 0 findings across all 188 tracked files.

## 20. CI Results

| Run | Commit | Static job | Database job | Notes |
|---|---|---|---|---|
| `36042112818` | `c5d8dc6` (M1) | FAIL (`check:bundle` false positive) | FAIL (stale config) | Not authoritative |
| `36046698484` | `cafd82c` (M1) | FAIL: `/sb_secret_/` false positive only | FAIL, 8/13: T03, T07, T09, T11, plus T12 | Option A record |
| **`36053855534`** | **`6e17efc` (M1B)** | **PASS**: lint, typecheck, unit (37), build, `check:bundle`, `check:secrets`, no committed env/key files | **PASS**: migrations, 17/17 integration, Chromium e2e | Disposable local stack in CI |

## 21. Full M1B Test Matrix

| ID | Test | Local Stack | CI `36053855534` | Hosted `jobquest-dev` |
|---|---|---|---|---|
| B01 | Credential provisioning | PASS | PASS | PASS (`integration-hosted-dev-56ede5.json`) |
| B02 | Username/password login | PASS | PASS | PASS (`integration-hosted-dev-56ede5.json`) |
| B03 | No synthetic/private identity leak | PASS | PASS | PASS (`e2e-browser-hosted-dev-593c4b.json`) |
| B04 | Custom JWT accepted by the Data API | PASS | PASS | PASS (ES256, valid 200, attacks 401) |
| B05 | `auth.uid()` resolves | PASS | PASS | PASS (`sub` matches `user_id`, no `auth.users` row) |
| B06 | USER own-record RLS | PASS | PASS | PASS (own rows visible and editable) |
| B07 | Peer USER denial | PASS | PASS | PASS (0 rows, insert/member add 42501) |
| B08 | Cross-workspace denial | PASS | PASS | PASS (0 rows, insert 42501) |
| B09 | MANAGER same-workspace access | PASS | PASS | PASS (sees all, updates/inserts members) |
| B10 | MANAGER cross-workspace denial | PASS | PASS | PASS (0 rows, insert 42501, demotion blocked) |
| B11 | Direct browser Data API read | PASS | PASS | PASS (supabase-js + browser Chromium) |
| B12 | Direct browser Data API write | PASS | PASS | PASS (POST/PATCH allowed, DELETE denied) |
| B13 | Session creation | PASS | PASS | PASS (30-day, verifier SHA-256, IP SHA-256) |
| B14 | Access-token expiry | PASS | PASS | PASS (Node 401; Data API 401 at +32.5s) |
| B15 | Refresh rotation | PASS | PASS | PASS (new token/cookie, CSRF/origin 403) |
| B16 | Old refresh replay rejection | PASS | PASS | PASS (replay 401, session revoked, 1 of 5 wins) |
| B17 | Logout / revocation | PASS | PASS | PASS (local & global session revocation) |
| B18 | Password change | PASS | PASS | PASS (current kept; other 3 revoked) |
| B19 | Recovery-code reset | PASS | PASS | PASS (weak password rejected, single-use, regeneration) |
| B20 | Global invalidation after recovery | PASS | PASS | PASS (all 3 prior sessions revoked) |
| B21 | Rate limiting: account | PASS | PASS | PASS (5 failures → 6th 429 durable in Postgres) |
| B22 | Rate limiting: IP abstraction | PASS | PASS | PASS (21st 429, shared across instances) |
| B23 | Service role absent from the bundle | PASS | PASS | PASS (0 findings with 4 real secrets) |
| B24 | Bundle secret scan | PASS | PASS | PASS (188 tracked files clean; bundle clean) |
| B25 | `/auth/v1/user` with an Option B token | PASS | PASS | PASS (403 `user_not_found`, zero identity exposed) |
| B26 | Canonical workflow retrieval | PASS | PASS | PASS (8 stages, 5 outcomes, client update denied) |
| SEC | Privilege boundary | PASS | PASS | PASS (6 auth tables + 4 RPCs return 42501) |

## 22. Security Findings

1. **(High, new asset)** The JWT signing key can mint any role, including `service_role`, so it is root-equivalent. Mitigations: server-only custody (`JQ_JWT_PRIVATE_JWK`), secret scanner, claim-contract test, documented rotation procedure. Production custody (KMS) is tracked in OQ-029.
2. **(Medium)** The Data API accepts expired tokens for a short leeway (measured between 2.5 s and 32.5 s). Node uses zero leeway. The effect is bounded by RLS session checks for revoked sessions.
3. **(Medium)** Revocation relies on RLS calling `app.session_is_active()`. Future Storage and Realtime policies must do the same.
4. **(Resolved)** Dev auth settings restored (TOTP enroll/verify, OTP length, email interval); storage analytics explained.
5. **(Resolved)** CLI authenticated to correct account (`goutam.krapa11@gmail.com`).
6. **(Resolved)** 20 leftover Option A test identities purged from `jobquest-dev`.
7. **(Fixed)** A committed secret-shaped placeholder in a unit test; scanner false positives resolved.
8. **(Info)** Denied reads return 200 `[]` (PostgREST RLS semantics), not 401.

## 23. Schema Changes

Migration `supabase/migrations/20260924200000_m1b_option_b_auth.sql` applied to local stack, CI, and hosted `jobquest-dev`.
- **New tables:** `user_credentials`, `auth_sessions`, `auth_refresh_tokens`, `auth_rate_limits`. All have RLS on, no policies, no anon/authenticated privileges.
- **Changed:**
  - `user_accounts.user_id`: FK to `auth.users` dropped; now `default gen_random_uuid()`.
  - `app.session_is_active()` reads `auth_sessions`.
- **New service-role RPCs (11):** register, create_session, rotate_refresh_token, session_for_refresh, revoke_sessions, session_is_live, change_password, recover_account, record_auth_failure, clear_login_failures, rate_limit_hit.
- **Removed:** `custom_access_token_hook`, `rpc_bootstrap_account`.

## 24. Gate 03 Deviations

- 4 auth tables added (`user_credentials`, `auth_sessions`, `auth_refresh_tokens`, `auth_rate_limits`).
- Password verifiers in application database.
- Upstash replaced by PostgreSQL database limiter (`auth_rate_limits`, ADR-046).
- Refresh-token cookie `jq_rt` instead of `sb-refresh-token`.
- Supabase Auth no longer used for JobQuest identities (ADR-043).

## 25. Files Created/Modified

**On `feature/m1b-option-b-auth-spike`:**
- Implementation and tests carried forward from commits `073a356` and `6e17efc`.
- Hosted evidence added:
  - `migration-upgrade/m1b/evidence/integration-hosted-dev-56ede5.json`
  - `migration-upgrade/m1b/evidence/e2e-browser-hosted-dev-593c4b.json`
  - `migration-upgrade/m1b/evidence/option-a-users-inventory.json`
- Authoritative documentation updated:
  - `migration-upgrade/m1b/M1B_INFRASTRUCTURE.md`
  - `migration-upgrade/m1b/M1B_TEST_RESULTS.md`
  - `migration-upgrade/m1b/M1B_AUTH_OPTION_B_RESULT.md`
  - `migration-upgrade/m1b/M1B_COMPLETION_REPORT.md`
  - `migration-upgrade/m1b/NEXT_AGENT_HANDOFF.md`
  - `migration-upgrade/gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md`
  - `migration-upgrade/DECISIONS.md`, `migration-upgrade/CHANGE_REQUESTS.md`, `migration-upgrade/OPEN_QUESTIONS.md`
- **Never committed (gitignored):** `.env.local`, `.env.m1b-local`, `supabase/signing_keys.json`, `test-results/`.

## 26. Git Status

- Working branch: `feature/m1b-option-b-auth-spike`.
- Commits `073a356`, `6e17efc`, `1f9047f` preserved.
- Nothing merged to `development` or `main`. No PR opened. No history rewritten.

## 27. Remaining Open Questions

- **OQ-025:** RESOLVED (Option B signing key imported and rotated to `in_use` on `jobquest-dev`).
- **OQ-026:** RESOLVED (CLI authenticated to `goutam.krapa11@gmail.com`).
- **OQ-027:** RESOLVED (Verified dev settings restored; storage analytics tier constraint documented).
- **OQ-028:** RESOLVED (20 synthetic Option A test accounts purged from `jobquest-dev`).
- **OQ-029:** Signing-key custody for production (env vs KMS / secrets manager) — reserved for production hardening.
- **OQ-030:** Edge/WAF limits and limiter bucket cleanup before production scaling.
- **OQ-031:** Vanished `JobQuest2.0` project (CAUSE UNKNOWN).

## 28. Next Step

Option B is **conclusively proven and passed across Local, CI, and Hosted `jobquest-dev`**.

**Do NOT start M2. Do NOT merge to development or main.** Await explicit user review.

