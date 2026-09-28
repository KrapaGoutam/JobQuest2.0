# AUTH OPTION B RESULT

Status:

# PASS

**FINAL RESULT: PASS across Local Supabase stack, GitHub Actions CI, and hosted Supabase `jobquest-dev`.**

- Every B01–B26 criterion and the SEC boundary passed with verifiable, sanitized evidence on the local developer environment, CI, and hosted `jobquest-dev`.
- No hard-fail condition was observed in any environment.
- The hosted `jobquest-dev` project was verified after importing and activating the approved Option B ES256 signing key (`a73390b9-56bf-4d1a-a642-efd4479ca0b3`). The previous signing key (`e520372b-f578-4d04-bee6-46cbf5a52ae8`) was preserved in `previously_used` state as trusted and was **not revoked**.
- Unintended M1 configuration drift was restored on hosted dev (MFA TOTP, OTP length, auth email max frequency).
- Leftover Option A synthetic test identities in `jobquest-dev` were inventoried (20 users) and completely purged.
- B25 critical security test passed against hosted GoTrue `/auth/v1/user` with 403 `user_not_found`, zero identity or credential leaked.

## Summary of Results by Environment

| Category | Local Stack | GitHub Actions CI (Run 36053855534) | Hosted `jobquest-dev` |
|---|---|---|---|
| B01 Credential Provisioning | PASS | PASS | PASS (`integration-hosted-dev-56ede5.json`) |
| B02 Login & HttpOnly Cookie | PASS | PASS | PASS (`integration-hosted-dev-56ede5.json`) |
| B03 Identity Leak Scan | PASS | PASS | PASS (`e2e-browser-hosted-dev-593c4b.json`) |
| B04 Custom JWT Data API Validation | PASS | PASS | PASS (ES256, Data API 200, forged 401) |
| B05 `auth.uid()` RLS Resolution | PASS | PASS | PASS (`sub` matches `user_id`, no `auth.users` row) |
| B06–B10 RLS Enforcement Matrix | PASS | PASS | PASS (USER own rows, peer denial, workspace isolation) |
| B11/B12 Direct PostgREST Read/Write | PASS | PASS | PASS (supabase-js + browser Chromium, no proxy) |
| B13 Session Creation & Hashing | PASS | PASS | PASS (SHA-256 verifier, raw token/IP not stored) |
| B14 Access Token Expiry & Leeway | PASS | PASS | PASS (Node 401 immediately; Data API 401 at +32.5s) |
| B15/B16 Refresh Rotation & Replay Rejection | PASS | PASS | PASS (single-use, immediate replay 401 + revocation) |
| B17 Logout & Revocation | PASS | PASS | PASS (local & global session revocation) |
| B18 Password Change | PASS | PASS | PASS (current kept; other 3 sessions revoked) |
| B19/B20 Recovery Codes & Global Revocation | PASS | PASS | PASS (single-use, weak password rejected, all sessions dead) |
| B21 Per-Account Lockout | PASS | PASS | PASS (5 failures → 6th 429 durable in Postgres) |
| B22 Distributed IP Rate Limiter | PASS | PASS | PASS (shared `auth_rate_limits` table in Postgres) |
| B23 Service Role Absence from Bundle | PASS | PASS | PASS (0 findings with 4 real secrets) |
| B24 Secret Scanner | PASS | PASS | PASS (188 tracked files clean; bundle clean) |
| B25 `/auth/v1/user` Probe (CRITICAL) | PASS | PASS | PASS (403 `user_not_found`, zero identity exposed) |
| B26 Canonical Workflow Engine | PASS | PASS | PASS (8 stages, 5 outcomes, client update denied) |
| SEC Privilege Boundary | PASS | PASS | PASS (6 auth tables + 4 RPCs return 42501) |
| Overall Evaluation | **PASS** | **PASS** | **PASS** |

## Architecture tested

Node-controlled username/password with app-owned sessions, plus externally minted short-lived JWTs, plus the Supabase Data API with native RLS. No Supabase Auth identities; no synthetic email.

See `../gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md`.

## JWT signing mechanism

- ES256 JWTs minted by the Node API with `jose`.
- Header `kid` = `a73390b9-56bf-4d1a-a642-efd4479ca0b3`.
- Claims: `sub`, `role=authenticated`, `aud=authenticated`, `iss=jobquest-api`, `iat`, `exp` (+900 s), `jti`, `session_id`.
- The private key is server only (`JQ_JWT_PRIVATE_JWK`).
- Supabase trusts the public half:
  - **Local:** `[auth] signing_keys_path` (proven).
  - **Hosted:** Management API imported as `standby` and rotated to `in_use` (proven on `jobquest-dev`).

## Credential model

- `public.user_credentials` holds Argon2id PHC verifiers (m=19456, t=2, p=1; centrally configured; rehash on login).
- It is separate from `user_accounts`.
- Unknown usernames pay the same Argon2 cost.

## Session model

- `public.auth_sessions`: 30-day absolute lifetime, revocable, SHA-256 IP only.
- `public.auth_refresh_tokens`: 256-bit opaque token in an HttpOnly cookie, SHA-256 verifier, single-use rotation, parent links.
- `app.session_is_active()` gates every RLS helper, so revocation is immediate for the Data API.

## Custom token evidence

B04:
- The valid token returns 200 with rows.
- A token signed with another key, a tampered `sub`, and `alg:none` all return 401 (PGRST301).
- Hosted probe on `jobquest-dev`: Node-minted token accepted; forged key rejected with 401.

## `/auth/v1/user` evidence (B25 CRITICAL)

B25:
- **403 `{"code":403,"error_code":"user_not_found","msg":"User not found"}`**, with no email or username.
- 0 `auth.users` rows for the test accounts.
- GoTrue signup 422 and password grant 400.
- Chromium browser probe against hosted `jobquest-dev` confirmed 403 `user_not_found`.
- This is structural: no Supabase Auth identity exists to reveal.

## `auth.uid()` evidence

B05:
- `auth.uid()` = JWT `sub` = `user_accounts.user_id`, shown through the own-profile RLS row and `rpc_create_workspace.created_by`.
- A forged-owner insert returned 42501.
- `auth.admin.getUserById(sub)` returns no user.

## RLS evidence

B06–B10:
- USER sees own rows.
- A peer is denied (0 rows / 0 rows / 42501 / 42501).
- A cross-workspace outsider is denied.
- MANAGER sees and edits the whole workspace.
- MANAGER is denied in foreign workspaces.
- The last-manager trigger holds.
- SEC: all 6 auth system tables and 4 privileged RPCs return 42501 to user tokens.

## Direct Data API evidence

- B11/B12: supabase-js `accessToken` client.
- Chromium: `GET /rest/v1/applications|workspace_members|workflow_definitions`, `POST` + `PATCH /rest/v1/applications`, with no Node proxy.
- The service role is used only by the auth routes and the rate limiter; a static test enforces this.

## Refresh / replay evidence

- B15: rotation; old verifier is consumed; child links to parent; CSRF and origin checks are enforced.
- B16: immediate replay → 401 `REFRESH_REUSED`; session is revoked; legitimate holder is also logged out (as designed); 5 concurrent refreshes produced exactly 1 winner. **No grace window**; the SPA serializes refresh with Web Locks.

## Password-change evidence

B18: current session is kept (rows + refresh 200); 3 other sessions were revoked; old password 401, new password 200. The M1 T09 defect is not inherited.

## Recovery evidence

- B19: weak new password is rejected before any code is consumed; code is single use; 9 codes remain; regeneration invalidates old set.
- B20: all 3 prior sessions were revoked; recovering client got a fresh session.

## Rate-limit evidence

- B21: `[401×5, 429]`; locked even with correct password; recovery `[401×3, 429]`. Stored durably in Postgres.
- B22: 21st request from one IP gets 429; another IP is unaffected; counter is shared across independent clients (`auth_rate_limits`, SHA-256 keys).
- Proven on hosted dev: distributed-correct DB limiter (`auth_rate_limits` table in Postgres via `rpc_rate_limit_hit`).

## Secret-scan evidence

- B23: built bundle scanned with real secret values as known secrets (local secret key, signing-key `d`, hosted-dev secret key, hosted-dev DB password): 0 findings.
- B24: `check:bundle` and `check:secrets` (all 188 tracked files) report 0 findings. Scanner tests prove true fixtures FAIL and harmless literals PASS.

## Known limitations & production considerations

1. The Data API accepts an expired token for a short clock-skew leeway (between 2.5 s and 32.5 s after `exp`). Node uses zero leeway.
2. A revoked session's unexpired JWT still verifies at the gateway; isolation relies on RLS calling `app.session_is_active()`, which future Storage and Realtime policies must also include.
3. The signing key can mint any role and is root-equivalent. Production custody is open (OQ-029).
4. No grace window: a client racing two refreshes is logged out (secure by design).
5. Rate limiting: edge/WAF rate limiting should complement the DB limiter before production scaling.

## Final Decision

**OPTION B — PASS**

Auth Option B is conclusively proven on local Supabase stack, GitHub Actions CI, and hosted Supabase `jobquest-dev`. All 26 B-tests passed with zero hard-fail conditions. Option B is recommended for formal Gate 03 approval.

