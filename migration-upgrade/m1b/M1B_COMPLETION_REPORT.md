# JOBQUEST2.0 — M1B OPTION B COMPLETION REPORT

## 1. Status

**NOT COMPLETE**

- Option B passes all 26 B-tests plus the SEC boundary test, with evidence, on a real **local Supabase stack**, both on the developer machine and in GitHub Actions.
- No Option B hard-fail condition was observed.
- The **hosted `jobquest-dev` run has not happened.** It needs a signing-key import and rotation, which is a key-state change reserved for explicit user approval (M1B §30). The Supabase CLI is also currently logged in to a different Supabase account that cannot access `jobquest-dev`.
- A final `OPTION B — PASS` is therefore **not** declared.

## 2. Executive Summary

- **Option A** (M1) failed permanently. Supabase Auth's `/auth/v1/user` returned the synthetic email to the browser-held token.
- **What M1B built:** a narrowly scoped Option B.
  - The Node API owns credentials (Argon2id) and sessions (app-owned session rows plus single-use rotating refresh tokens).
  - It mints 15-minute ES256 access JWTs.
  - The browser passes them to supabase-js (`accessToken` option) and calls the Data API directly under the unchanged M1 RLS policies.
- **What the local Supabase stack proved:**
  - the Data API accepts the Node-minted token and rejects forged, tampered and `alg:none` tokens
  - `auth.uid()` equals the JWT `sub` with **no `auth.users` row**
  - all USER / peer / cross-workspace / MANAGER boundaries hold
  - direct browser reads and writes work
  - `/auth/v1/user` returns 403 `user_not_found`, so there is no identity to leak
  - replayed refresh tokens are rejected and the session is revoked (exactly 1 of 5 concurrent refreshes wins)
  - a password change keeps the current session and revokes the others
  - recovery revokes all sessions
  - account and shared per-IP limits work
  - the new structure-aware secret scanner finds nothing in the bundle or in any tracked file
- **Housekeeping done:**
  - Option A formally closed.
  - Evidence errata recorded.
  - CI repaired and green.
  - Scanner corrected, with tests.
  - Config drift investigated. Five verified values are ready to restore, but blocked by account access.
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

`../gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md` (PROPOSED) formally amends authentication only. It covers:
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
- `../DECISIONS.md`: ADR-043 to ADR-047 (PROPOSED).
- `../CHANGE_REQUESTS.md`: CR-030 to CR-032.
- `../OPEN_QUESTIONS.md`: OQ-025 to OQ-031.
- Notes added in `../gate-03/TARGET_SCHEMA.md` and `../gate-03/M1_SPIKE_PLAN.md`.

## 5. Credential Architecture

- `public.user_credentials` (`user_id`, `password_hash` as a PHC string, `password_algorithm = argon2id`, `password_version`, `password_changed_at`, timestamps) is separate from `user_accounts`.
- Argon2id with m = 19456 KiB, t = 2, p = 1 (OWASP baseline), configured centrally in `apps/api/src/env.ts`, with automatic rehash on login.
- The password policy is unchanged.
- Unknown usernames cost the same Argon2 work, and failures have a response-time floor.
- Plaintext is never stored. B01 verified the PHC prefix and the absence of plaintext.

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
- **Hosted trust (official docs):** import the private key as a **standby** key, then **Rotate**. The documented state table says a new standby key's signatures are **not accepted** ("Current key only"), so rotation is required. Rotation keeps the previous key trusted, and every step except deletion is reversible.
- The generic "third-party / custom issuer" path is **not documented** for hosted projects (only Clerk, Firebase, Auth0, Cognito and WorkOS are), so it was not used.
- Key generation, custody and rotation are in `M1B_INFRASTRUCTURE.md` §3 and amendment §7.

## 8. Direct PostgREST Architecture

The Gate 03 hybrid model (ADR-042) is **kept**:
- The browser uses `createClient(url, publishableKey, { accessToken })`. The `auth` namespace is disabled by supabase-js.
- The service role is **never** used for user CRUD. A static unit test confirms `admin()` appears only in the auth routes, the rate limiter and its own module, and that the auth routes never touch business tables.
- **Evidence:** B11/B12 (integration) plus Chromium `GET /rest/v1/applications|workspace_members|workflow_definitions` and `POST` + `PATCH /rest/v1/applications`.

## 9. auth.uid() Result

**PASS (local).** `auth.uid()` = JWT `sub` = `user_accounts.user_id`. It was proven three ways:
- the own-profile RLS row
- `rpc_create_workspace.created_by`
- a forged-owner insert returning 42501

All of this held while `auth.admin.getUserById(sub)` returned **no user**.

## 10. /auth/v1/user Leak Test

**PASS (local).**
- The original M1 attack, repeated with the Option B token, returned **403 `{"code","error_code":"user_not_found","msg"}`**: no email, no username.
- The same result came from the in-page Chromium probe.
- GoTrue signup returned 422 and the password grant returned 422.
- There are 0 `auth.users` rows for test accounts.

The result does not depend on hiding anything: there is no Supabase Auth identity.

## 11. RLS Results

**PASS (local).**

| Test | Scenario | Result |
|---|---|---|
| B06 | USER, own rows | Visible and editable |
| B07 | USER, peer rows | 0 rows; update 0; insert-for-peer and add-member 42501 |
| B08 | Cross-workspace outsider | 0 / 42501 / 0 |
| B09 | MANAGER, same workspace | Sees A and B; updates and inserts for members |
| B10 | MANAGER, foreign workspace | 0 / 0 / 42501 / 42501; last-manager demotion blocked |
| SEC | User token against 6 auth tables and 4 privileged RPCs | All 42501 |

## 12. Refresh Rotation / Replay

**PASS (local).**
- B15: rotation issues a new cookie and a new JWT; the old verifier is consumed; the child links to its parent; a missing CSRF token gets 403; a foreign origin gets 403.
- B16: an immediate replay of the consumed token returns 401 `REFRESH_REUSED`; the session is revoked (`REFRESH_REUSE`); the legitimate holder also gets 401; data rows are 0.
- Concurrency: 5 simultaneous refreshes produced `[200, 401, 401, 401, 401]`.
- **Grace window: none** (justified in amendment §6). The SPA serializes refresh with Web Locks.
- This structurally fixes M1 T07; no test threshold was changed.

## 13. Password Change

**PASS (local).** Policy: **the current session is kept and all other sessions are revoked** (`rpc_change_password`, atomic).
- B18: wrong current password 401; missing CSRF 403; change 200 (3 others revoked); old password 401 / new 200; current session rows 1 and refresh 200; other session 0 rows / refresh 401.
- The M1 T09 behavior (the admin update logged everyone out) is not inherited.

## 14. Recovery

**PASS (local).**
- B19: a weak new password is rejected **before** any code is consumed; recovery succeeds (9 codes left); a code replay gets 401; old password 401 / new 200; regeneration invalidates the old set (old code 401, new code 200).
- B20: all 3 prior sessions were revoked; the recovering client received a fresh session.

## 15. Rate Limiting

**PASS (local).**
- B21, per account (durable, Postgres): logins `[401×5, 429]`; locked even with the correct password; recovery `[401×3, 429]`.
- B22, per IP: the **shared Postgres limiter** (`auth_rate_limits` / `rpc_rate_limit_hit`, SHA-256 keys) gives the 21st request 429; another IP is unaffected; the counter is shared by independent clients.
- **Proven now:** distributed-correct limiting (no longer per-instance memory).
- **Required before production:** Vercel edge/WAF limits, bucket cleanup, and a capacity test (OQ-030).

## 16. Supabase Dev Configuration

- **No hosted configuration was changed in M1B.**
- `supabase/config.toml` (repo only) now:
  - sets `signing_keys_path` (local)
  - disables the Option A hook
  - disables the email provider
  - sets `sign_in_sign_ups` back to 30
  - moves local ports to 553xx (another local Supabase project occupies 543xx and was left untouched)
  - sets the five drifted values to their verified pre-M1 hosted values, so no future push can silently change them again

## 17. Unintended Config Restoration

Evidence-backed prior values come from the M1 transcript's captured diff (`../m1/M1_CLOSEOUT_INVESTIGATIONS.md` §1):

| Setting | Verified prior value → M1 value |
|---|---|
| TOTP enroll | true → false |
| TOTP verify | true → false |
| OTP length | 8 → 6 |
| Email `max_frequency` | `1m0s` → `1s` (additional unintended change found in the diff) |
| Storage analytics | true → false |

- **Restoration: NOT PERFORMED, blocked.** The current CLI and connector account gets "Access denied" on `jobquest-dev`.
- Any settings the truncated M1 diff did not show remain unknown and were not guessed.
- **Before / after is recorded as:** before-M1 = verified values above; current = M1-pushed values; restored = none yet.

## 18. Missing JobQuest2.0 Project Investigation

**CAUSE UNKNOWN.** Evidence:
- `JobQuest2.0` (`tezddimqfpyljhsaucmx`, org `fisaxwdkkdpbamvwkvnm`) was listed at 18:52:29 and absent at 18:55:37, both listings being for the same org.
- The agent created `jobquest-dev` in between.
- No agent command deleted, paused or transferred any project.
- The currently authenticated account cannot see that org at all.

This rules out the agent deleting it and a listing from a different org. It cannot distinguish a user or dashboard deletion, a transfer, or a listing issue. The owning account's audit log would settle it (OQ-031).

## 19. Secret Scanner Correction

- `scripts/lib/secret-scan.mjs` + `scripts/check-bundle.mjs`, with modes `bundle` and `--tracked`.
- **Replaces** M1's bare substrings with complete-structure rules:
  - Supabase secret keys (prefix + ≥ 20-character body)
  - decoded JWTs with privileged roles
  - PEM private keys
  - JWKs with a private `d`
  - DB URLs with real passwords (placeholders ignored)
  - Supabase PATs, GitHub tokens, JobQuest refresh / extension / claim tokens
  - server-secret env **names** (bundle only)
  - **exact known secret values** from the environment
- An **exact-string allowlist** with reasons (empty); no directory exemptions.
- **Both M1 false positives resolved at the source:** the supabase-js `sb_secret_` literal no longer matches, and the harness alias marker was removed with Option A.
- **One real-shaped committed placeholder was found and fixed:** `tests/unit/security.test.ts` had a 30-character `sb_secret_…` value. It now uses a short placeholder.
- **Tests (16):** true fixtures FAIL (secret key, service_role JWT, PEM, private JWK, DB URL with password, PAT, GitHub, refresh and extension tokens, known values); harmless literals PASS. Fixtures are generated at runtime, so no secret-shaped literal is committed.
- **Results:** `check:bundle` 0 findings; `check:secrets` 0 findings over all tracked files; B23 scan with 4 real secret values 0 findings.

## 20. CI Results

| Run | Commit | Static job | Database job | Notes |
|---|---|---|---|---|
| `36042112818` | `c5d8dc6` (M1) | FAIL (`check:bundle` false positive) | FAIL (stale config) | Not authoritative |
| `36046698484` | `cafd82c` (M1) | FAIL: `/sb_secret_/` false positive only | FAIL, 8/13: T03, T07, T09, T11, plus T12 (harness forced SSL on the local DB) | Option A record |
| **`36053855534`** | **`6e17efc` (M1B)** | **PASS**: lint, typecheck, unit (37), build, `check:bundle`, `check:secrets`, no committed env or key files | **PASS**: migrations, 17/17 integration, Chromium e2e | Evidence artifact kept in `evidence/ci-36053855534/` |

CI changes (`.github/workflows/m1b-ci.yml`):
- An ephemeral per-run signing key.
- The integration suite plus Playwright.
- The new tracked-file secret scan.
- A check for committed env and key files.

No security job was removed.

## 21. Full M1B Test Matrix

| ID | Test | Local + CI | Hosted dev |
|---|---|---|---|
| B01 | Credential provisioning | PASS | not run |
| B02 | Username/password login | PASS | not run |
| B03 | No synthetic/private identity leak | PASS | not run |
| B04 | Custom JWT accepted by the Data API | PASS | not run |
| B05 | `auth.uid()` resolves | PASS | not run |
| B06 | USER own-record RLS | PASS | not run |
| B07 | Peer USER denial | PASS | not run |
| B08 | Cross-workspace denial | PASS | not run |
| B09 | MANAGER same-workspace access | PASS | not run |
| B10 | MANAGER cross-workspace denial | PASS | not run |
| B11 | Direct browser Data API read | PASS | not run |
| B12 | Direct browser Data API write | PASS | not run |
| B13 | Session creation | PASS | not run |
| B14 | Access-token expiry | PASS (Data API leeway between 2.5 s and 32.5 s) | not run |
| B15 | Refresh rotation | PASS | not run |
| B16 | Old refresh replay rejection | PASS | not run |
| B17 | Logout / revocation | PASS | not run |
| B18 | Password change | PASS | not run |
| B19 | Recovery-code reset | PASS | not run |
| B20 | Global invalidation after recovery | PASS | not run |
| B21 | Rate limiting: account | PASS | not run |
| B22 | Rate limiting: IP abstraction | PASS | not run |
| B23 | Service role absent from the bundle | PASS | n/a (build artifact) |
| B24 | Bundle secret scan | PASS | n/a |
| B25 | `/auth/v1/user` with an Option B token | PASS | not run |
| B26 | Canonical workflow retrieval | PASS | not run |
| SEC | Privilege boundary | PASS | not run |

Details and evidence files: `M1B_TEST_RESULTS.md`.

## 22. Security Findings

1. **(High, new asset)** The JWT signing key can mint any role, including `service_role`, so it is root-equivalent. Mitigations: server-only custody, scans, the claim-contract test, rotation procedure. Production custody (KMS) is open (OQ-029).
2. **(Medium)** The Data API accepts expired tokens for a short leeway (measured between 2.5 s and 32.5 s). Node uses zero leeway. The effect is bounded by RLS session checks for revoked sessions.
3. **(Medium)** Revocation relies on RLS calling `app.session_is_active()`. Future Storage and Realtime policies must do the same.
4. **(Medium, open)** Five dev auth and storage settings are still in their unintended M1 state (restoration blocked by account access).
5. **(Low)** The CLI and connector are authenticated to a different Supabase account. Every remote step must re-verify account and project ownership.
6. **(Low)** Option A test identities remain in the hosted dev `auth.users` (OQ-028). The migration drops the hook they would need, and the email provider will be disabled.
7. **(Fixed)** A committed secret-shaped placeholder in a unit test; the scanner false positives.
8. **(Info)** Denied reads return 200 `[]` (PostgREST RLS semantics), not 401.

## 23. Schema Changes

Migration `supabase/migrations/20260924200000_m1b_option_b_auth.sql`. It is applied to the local stack and CI, and **not** to `jobquest-dev`.
- **New tables:** `user_credentials`, `auth_sessions`, `auth_refresh_tokens`, `auth_rate_limits`. All have RLS on, no policies, no anon/authenticated privileges.
- **Changed:**
  - `user_accounts.user_id`: FK to `auth.users` dropped; now `default gen_random_uuid()`.
  - `app.session_is_active()` reads `auth_sessions`.
- **New service-role RPCs (11):** register, create_session, rotate_refresh_token, session_for_refresh, revoke_sessions, session_is_live, change_password, recover_account, record_auth_failure, clear_login_failures, rate_limit_hit.
- **Removed:** `custom_access_token_hook`, `rpc_bootstrap_account`.
- The full 25-table schema was **not** implemented.

## 24. Gate 03 Deviations

**Carried from M1 (unchanged):**
- stage names per the TARGET_SCHEMA DDL
- access token in memory (not an `sb-access-token` cookie)
- extra recovery-lock columns
- `profiles` owner-only
- no DELETE on `applications`
- 32-character recovery codes
- no `audit_events` table

**New in M1B:**
- 4 auth tables (CR-031; permanent-table count would become 29 if approved)
- password verifiers in the application database
- the Gate 03 "Upstash" limiter replaced by a Postgres limiter (ADR-046)
- refresh-token cookie `jq_rt` instead of `sb-refresh-token`
- Supabase Auth no longer used for JobQuest identities (ADR-043)

## 25. Files Created/Modified

**On `feature/m1-foundation-auth-spike` (commit `05e3438`):**
- `migration-upgrade/m1/M1_TEST_RESULTS.md` (errata)
- `migration-upgrade/m1/M1_AUTH_OPTION_A_RESULT.md` (closure)
- `migration-upgrade/m1/M1_CLOSEOUT_INVESTIGATIONS.md` (new)
- `migration-upgrade/DECISIONS.md`, `migration-upgrade/OPEN_QUESTIONS.md`, `migration-upgrade/gate-03/AUTHENTICATION_DESIGN.md`

**On `feature/m1b-option-b-auth-spike`:**
- Foundation carried from `05e3438` (commit `073a356`).
- **New:**
  - `apps/api/src/lib/{tokens,passwords,db}.ts`
  - `apps/api/src/routes/auth.ts` (Option B)
  - `supabase/migrations/20260924200000_m1b_option_b_auth.sql`
  - `scripts/lib/secret-scan.mjs`, `scripts/secret-scan-allowlist.json`, `scripts/gen-local-signing-key.mjs`, `scripts/m1b-local-env.mjs`
  - `tests/integration/m1b.test.ts`, `tests/unit/{secretScan,tokens}.test.ts`
  - `.github/workflows/m1b-ci.yml` (renamed from `m1-ci.yml`)
  - `migration-upgrade/gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md`
  - `migration-upgrade/m1b/*` and `migration-upgrade/m1b/evidence/*`
- **Modified:**
  - `.env.example`, `.gitignore`, `package.json`, `pnpm-lock.yaml` (`jose`), `playwright.config.ts`
  - `apps/api/package.json`, `apps/api/src/{app,env}.ts`, `apps/api/src/lib/{rateLimit,security}.ts`, `apps/api/src/routes/workflow.ts`
  - `apps/web/src/App.tsx`, `e2e/leak.spec.ts`
  - `scripts/check-bundle.mjs`
  - `supabase/config.toml`, `supabase/.gitignore`
  - `tests/integration/harness.ts`, `tests/unit/security.test.ts`
  - `migration-upgrade/{DECISIONS,CHANGE_REQUESTS,OPEN_QUESTIONS}.md`, `migration-upgrade/gate-03/{AUTHENTICATION_DESIGN,TARGET_SCHEMA,M1_SPIKE_PLAN}.md`
- **Never committed (gitignored):** `.env.local`, `.env.m1b-local`, `supabase/signing_keys.json`, `test-results/`.

## 26. Git Status

- `feature/m1-foundation-auth-spike`: `cafd82c` → `05e3438` (M1 closeout), pushed; intact.
- `feature/m1b-option-b-auth-spike` (from `development` @ `5465d2a`): `073a356` (carry foundation) → `6e17efc` (Option B spike, CI green) → the M1B documentation commit, pushed.
- Nothing was merged into `development` or `main`. No PR. No rebase, reset or force push.
- JobQuest1.0 untouched.

## 27. Remaining Open Questions

- **OQ-025:** approve the `jobquest-dev` signing-key import and rotation (checkpoint in `M1B_INFRASTRUCTURE.md` §3)?
- **OQ-026:** re-authenticate the Supabase CLI to the JobQuest2.0 account.
- **OQ-027:** restore the five drifted dev settings (verified values)?
- **OQ-028:** delete the Option A test identities in hosted dev `auth.users`?
- **OQ-029:** signing-key custody for production (env vs KMS).
- **OQ-030:** edge/WAF limits and limiter bucket cleanup before production.
- **OQ-031:** vanished `JobQuest2.0` project (cause unknown).
- **Approval of the Gate 03 amendment and ADR-043 to ADR-047.**

## 28. Recommended Next Step

**M1B hosted verification (not started):**
1. The user re-logs the CLI to the JobQuest2.0 account.
2. The user approves the checkpoint.
3. Record the signing-key state.
4. Import and rotate (no revocation).
5. Push the M1B migration to `jobquest-dev` after the branch, ref and DEV checks.
6. Restore the five verified settings narrowly.
7. Run the unchanged suite with `M1B_ENV_FILE=.env.local`, plus the e2e spec.
8. Then declare **OPTION B — PASS or FAIL**.

A Vercel Preview comes only after that, and only if still required. **M2 must not start** until Option B is final and the amendment is approved. This next step was **not** started.
