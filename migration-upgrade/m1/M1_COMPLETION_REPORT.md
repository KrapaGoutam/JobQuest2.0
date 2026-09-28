# JobQuest 2.0 — M1 Completion Report

## 1. M1 Status

**COMPLETE — OPTION A FAIL.** The spike ran to a decision. The T03 hard-fail invariant (no synthetic identity reaches the browser) is violated. Option A product implementation is stopped. M1 is awaiting user review.

## 2. Executive Summary

M1 built the 7-table foundation with RLS, a Hono façade and a browser harness, then tested Auth Option A (username/password in front of Supabase Auth, using random internal alias emails) against a new dev Supabase project.

Most of the architecture worked: RLS with `auth.uid()`, role and tenant isolation, workspace bootstrap, the last-manager trigger, recovery codes, canonical workflow, CSRF, lockouts and logout revocation.

The **hard fail** is structural. Direct PostgREST access means the browser holds a GoTrue-issued access token, and GoTrue's public `GET /auth/v1/user` returns the alias email for that token. I reproduced this in integration tests and in a real browser. It cannot be fixed without breaking another Gate 03 requirement, so the recommendation is to **evaluate Option B (Node-minted JWTs, no GoTrue identity)**. Option B has not been implemented and awaits user approval.

Tests: 9 PASS, 4 FAIL (T03 hard; T07 refresh reuse window; T09 password-change session bug; T11/SEC as a cascade of T09).

## 3. Git / Branch State

- Gate 03 docs were committed on `docs/gate-03-db-auth-rls`, pushed, and merged into `development` (`--no-ff`); pushed.
- All M1 work is on `feature/m1-foundation-auth-spike`. Foundation commit `c5d8dc6`, then a follow-up commit with the config fixes, harness fixes and these docs (see §28).
- Nothing was merged to `main` or `development`. No rebase, reset or force push. No PR opened.

## 4. Infrastructure Created

- Supabase: new account; org `fisaxwdkkdpbamvwkvnm`; project **`jobquest-dev`** (ref `xpnkasclquplmrcmhsif`, us-west-2, DEV).
- Vercel: new account; team `one-piece-5779`. **No project or preview created** (stopped by the hard fail).
- No production resources. Nothing linked to JobQuest1.0.
- Details and config-push side effects: `M1_INFRASTRUCTURE.md`.

## 5. Project Structure

pnpm monorepo:

- `apps/api` (Hono façade)
- `apps/web` (Vite/React harness)
- `api/index.ts` (Vercel entry)
- `supabase/` (config and migration)
- `tests/unit`, `tests/integration`, `e2e/`
- `scripts/check-bundle.mjs`
- `.github/workflows/m1-ci.yml`

See `M1_IMPLEMENTATION_NOTES.md`.

## 6. Seven-Table Foundation

The tables are `user_accounts`, `profiles`, `auth_recovery_codes`, `workspaces`, `workspace_members`, `applications` and `workflow_definitions`, all with `gen_random_uuid()` IDs.

- Constraints: username format and case, one PERSONAL workspace per user, role USER/MANAGER, 8 stage values, status/outcome checks, WITHDRAWN requires `closure_reason`, and a single default workflow.
- Migration: `supabase/migrations/20260924120000_m1_foundation.sql`, applied to `jobquest-dev`.

## 7. Authentication Implementation

Option A as specified:

- Admin-created GoTrue users with random alias emails.
- A façade handles register, login, refresh, logout, me, password, recover and regenerate-codes.
- The refresh token is in an HttpOnly cookie; the access token is held in memory.
- An access token hook strips identity claims.
- GoTrue public sign-up is disabled.

See `M1_IMPLEMENTATION_NOTES.md`.

## 8. Synthetic Identity Leak Test

**T03 — FAIL (hard).**

- Clean surfaces: the façade (103 responses), JWT claims, localStorage, sessionStorage, cookies, DOM, React state and console.
- Leak: GoTrue `/auth/v1/user`, called from the browser with the user's own token, returns the alias.

Evidence: `evidence/integration-191a31.json` and `evidence/e2e-leak-local-7e830d.json`. Full analysis: `M1_AUTH_OPTION_A_RESULT.md`.

## 9. RLS Implementation

- RLS is enabled on all 7 tables. anon and authenticated have all grants revoked, then minimal grants are added back.
- Helpers are `SECURITY DEFINER` with an empty `search_path`: `is_workspace_member`, `is_workspace_manager`, `can_access_owned_record`, `app.session_is_active()`.
- T04 and T05 **PASS**: USER sees own rows, MANAGER sees the workspace, cross-workspace and removed-member access are denied.

## 10. Workspace Bootstrap

`rpc_bootstrap_account` (service role only) atomically creates the account, profile, PERSONAL workspace and MANAGER membership, and stores the 10 code hashes. T01 **PASS**. `rpc_create_workspace` covers additional workspaces.

## 11. Session Lifecycle

- Login: T02 PASS.
- Logout, local and global: T08 PASS. Revoked tokens read nothing through `app.session_is_active()`.
- Refresh rotation: T07 **FAIL**. The parent token was still accepted 12 s after rotation, beyond the 10 s reuse interval, and there is no family revocation.
- Password change: T09 **FAIL**. The current session is revoked along with the others.

## 12. Recovery Codes

- 10 codes per set, 160-bit codes (140 secret bits), hashed with Argon2id, consumed atomically and single use; regeneration replaces the set; per-account lock after 3 failures.
- Unit tests pass. The integration SEC-01/02 test failed as a cascade of T09, so single-use and regeneration are **not integration-proven** in the final run.

## 13. Canonical Workflow

The seeded default workflow (8 stages, 5 outcomes, 5 withdrawal reasons) is readable through PostgREST and `GET /api/workflow`, and mutation is denied. T06 **PASS**.

## 14. Direct PostgREST

supabase-js runs in `accessToken` mode against PostgREST under RLS. Integration tests T04 to T06 used it successfully. In the browser, the e2e harness inserted an application through direct PostgREST. The T11 integration test failed as a cascade of T09. Direct PostgREST is also the **cause** of the Option A failure, because it requires a GoTrue token in the browser.

## 15. Node Façade

Hono runs at same-origin `/api` with:

- security headers
- the alias-leak guard (0 blocks)
- origin and JSON enforcement
- CSRF
- a generic error envelope

It runs locally through `apps/api/src/server.ts`. The Vercel entry is prepared but not deployed.

## 16. Rate Limiting

- Façade per-IP limits are in memory: login 20 per 15 min, register 3 per hour, recovery 10 per hour.
- A per-account DB lockout sends 429 on the 6th failed login. Recovery locks after 3 failures.
- T10 **PASS** after raising GoTrue `sign_in_sign_ups` to 1000. GoTrue sees one façade IP, and the default limit throttled 30 of 35 valid logins.
- The in-memory limiter is not shared across serverless instances; Upstash is deferred.

## 17. Email Suppression

- Alias domain is non-routable; confirmations are off; public sign-up is off; no email flows are called.
- T12 **PASS**: 0 of 16 alias users have any mail-sent timestamp. This is weaker evidence because Supabase mail logs were not queried.

## 18. Vercel Preview

**Not deployed.** It was intentionally skipped after the T03 hard fail (the stop rule). Production is not configured.

## 19. CI/Test Results

- Local: lint, typecheck, 15 unit tests and build pass. Integration: 9 PASS / 4 FAIL. e2e: T03 FAIL (the real leak).
- CI run `36042112818` on `c5d8dc6` failed:
  - The integration job failed because that commit predates the email-provider and rate-limit config fix; T01 returns 500 and everything after it cascades.
  - `check:bundle` flags the `sb_secret_` literal inside supabase-js and the harness alias marker. No real key material is present. The scanner was not relaxed; see §25.
- The follow-up push re-triggers CI; its result was not checked before this report.

## 20. Mandatory M1 Test Matrix

| ID | Result |
|---|---|
| T01 | PASS |
| T02 | PASS |
| T03 | **FAIL (HARD)** |
| T04 | PASS |
| T05 | PASS |
| T06 | PASS |
| T07 | FAIL |
| T08 | PASS |
| T09 | FAIL |
| T10 | PASS |
| T11 | FAIL (cascade of T09; browser PostgREST insert shown in e2e) |
| T12 | PASS |
| SEC-01/02 | FAIL (cascade) |

Full Objective / Method / Expected / Actual / Evidence table: `M1_TEST_RESULTS.md`.

## 21. Auth Option A Final Decision

**OPTION A — FAIL**

## 22. Security Findings

1. **(Critical, architectural)** GoTrue `/auth/v1/user` exposes the alias to anyone who holds the access token. This is the root cause of the Option A failure.
2. **(High)** GoTrue rate limits are keyed on the façade IP, because it ignores X-Forwarded-For. The mitigation (a higher limit plus façade limits) moves brute-force protection entirely to the façade. The GoTrue password grant is public, so the alias must stay secret for the façade limits to mean anything, and the T03 leak undermines that.
3. **(Medium)** The refresh reuse window accepted a parent token after the configured interval, with no family revocation (T07).
4. **(Medium)** The password change revokes the current session (T09). This is a façade defect.
5. **(Low)** Denied RLS reads return 200 with `[]` rather than an error (T08/T05). This is expected PostgREST behaviour; clients must not treat it as success.
6. **(Low)** The in-memory limiter is per instance on serverless.
7. **(Info)** `supabase config push` applied unintended settings (MFA TOTP off, OTP length 6, storage analytics off) to dev.
8. **(Info)** The hosted `[auth.email] enable_signup = false` disables email password login.

## 23. Deviations From Gate 03

- Stage names follow the TARGET_SCHEMA DDL (SAVED…OFFER), not the final report's BOOKMARK/SCREENING wording.
- The access token is held in memory rather than an HttpOnly cookie, because direct PostgREST needs it.
- Per-IP limiting is in memory; Upstash is deferred.
- `user_accounts` gained `failed_recovery_count` and `recovery_locked_until`.
- `profiles` is owner-only.
- There is no DELETE on `applications`.
- Recovery codes are 32 characters (160 bits, 140 of them secret).
- No `audit_events` table in M1.

## 24. Files Created/Modified

- **Created:** `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.gitignore`, `.env.example`, `tsconfig*.json`, `eslint.config.mjs`, `vitest.config.mts`, `playwright.config.ts`, `vercel.json`, `api/index.ts`, `apps/api/**`, `apps/web/**`, `supabase/config.toml`, `supabase/migrations/20260924120000_m1_foundation.sql`, `scripts/check-bundle.mjs`, `.github/workflows/m1-ci.yml`, `tests/unit/**`, `tests/integration/**`, `e2e/leak.spec.ts`, and `migration-upgrade/m1/**` (docs and sanitized evidence).
- **Modified after `c5d8dc6`:** `supabase/config.toml` (email provider, rate limit), `tests/integration/m1.test.ts`, `e2e/leak.spec.ts`, `apps/web/src/App.tsx` (harness fixes).
- **Not committed:** `.env.local`, `supabase/.temp/`, `test-results/`, `.playwright-mcp/`.

## 25. Open Questions

1. Approve evaluating Option B (Node-minted JWTs with an imported signing key or Supabase third-party auth)? This would require a Gate 03 amendment for a credential/session table.
2. Alternatively, accept a Gate 03 change that drops direct PostgREST so all data goes through Node, which would let a GoTrue identity stay server-side only?
3. `check:bundle` currently fails on the supabase-js `sb_secret_` literal and the harness marker. Should the scanner match only real key material and exclude the harness marker? This was deliberately **not** changed without your approval.
4. What happened to the previously listed `JobQuest2.0` Supabase project (`tezddimqfpyljhsaucmx`)?
5. Should the dev auth settings changed by `config push` (MFA TOTP, OTP length, storage analytics) be restored?

## 26. Deferred Work

- Vercel project and preview.
- Upstash/shared rate limiter.
- Fix for T09 (password change).
- T07 refresh reuse hardening.
- `audit_events`.
- Querying Supabase mail logs for T12.
- Re-running CI green.
- All M2+ product features.

## 27. Recommended Next Milestone

**Not M2.** Next is an **Option B architecture review and spike (M1b)**, after user approval:

- Node-minted JWTs verified by PostgREST.
- No GoTrue identity.
- Re-run T01 to T12 with the same harness; T03 must pass, including the `/auth/v1/user` probe.

## 28. Git Status

- Branch `feature/m1-foundation-auth-spike`, pushed to origin.
- Commits: `c5d8dc6` (foundation), then the M1 results commit containing the config and harness fixes and these docs.
- Working tree is clean apart from gitignored local files.
- Nothing merged; no PR.

## 29. Final Recommendation

**OPTION A — FAIL. Stop Option A. Evaluate Option B, pending explicit user approval.** Do not merge, do not start M2, do not deploy.
