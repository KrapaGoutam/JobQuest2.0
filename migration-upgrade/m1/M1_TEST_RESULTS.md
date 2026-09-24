# M1 — Test Results

**Target:** Supabase dev project `jobquest-dev`, driven from the local Node façade (in-process `app.request`) and a local Vite and Chromium browser. No Vercel Preview exists: it was not deployed because of the T03 hard-fail stop.

**Evidence** (sanitized: no tokens, keys or alias strings) is in `migration-upgrade/m1/evidence/`:

- Authoritative integration run: `integration-191a31.json`. `integration-078461.json` and `integration-b1605b.json` are earlier runs from before the config fixes described below.
- Authoritative browser run: `e2e-leak-local-7e830d.json`. The other e2e files are superseded false-positive runs; see `M1_AUTH_OPTION_A_RESULT.md`.

**Summary:** 9 PASS, 4 FAIL (T03 hard fail; T07; T09; T11 plus SEC-01/02 as a cascade of T09).

| Test ID | Objective | Method | Expected | Actual | PASS/FAIL | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| T01 | Username account provisioning | `POST /api/auth/register`; service-role reads of the 7 tables; direct GoTrue `/auth/v1/signup` attempt | Account, profile and PERSONAL workspace are created with the user as MANAGER, plus 10 hashed codes; GoTrue public sign-up is rejected | As expected; direct sign-up is rejected (signups disabled) | **PASS** | integration-191a31 `T01` | |
| T02 | Username/password login | `POST /api/auth/login` | 200; `jq_rt` is HttpOnly/Secure/SameSite=Strict; no alias in the body | As expected | **PASS** | `T02` | |
| T03 | Zero synthetic identity leakage (hard fail) | Scan all 103 façade responses; decode JWT claims; call GoTrue `/auth/v1/user` with the user's token; Playwright scan of browser surfaces and network | Alias found nowhere | Façade, JWT and browser storage/cookies/DOM/console are clean. **GoTrue `/auth/v1/user` returns the alias** (integration and real browser network) | **FAIL (HARD)** | `T03`; e2e-leak-local-7e830d | Option A fails. See `M1_AUTH_OPTION_A_RESULT.md` |
| T04 | `auth.uid()` under RLS | Direct PostgREST as the user | Own rows visible; `auth.uid()` equals `user_accounts.id` | As expected | **PASS** | `T04` | |
| T05 | RLS roles and tenancy | USER vs peer vs MANAGER; cross-workspace access; removed member; delete the last MANAGER | USER sees own rows, MANAGER sees all, cross-workspace access is denied, the removed member loses access, deleting the last manager is blocked | As expected | **PASS** | `T05` | Denied reads return 200 with `[]` (RLS filtering), not 401 |
| T06 | Canonical workflow | PostgREST `workflow_definitions` plus `GET /api/workflow`; attempt an update | 8 stages / 5 outcomes, same through both paths; mutation denied | As expected | **PASS** | `T06` | |
| T07 | Refresh rotation | `POST /api/auth/refresh`, then replay the old refresh token | New token issued; old token rejected | Rotation works, but the **immediate parent token was still accepted 12 s after rotation** (configured reuse interval is 10 s). A grandparent token was rejected after 75 s; no family revocation | **FAIL** | `T07` | GoTrue reuse-window semantics; see Security Findings |
| T08 | Logout revocation | `POST /api/auth/logout` local and global; reuse the old tokens | Old access token gets no data; refresh fails | PostgREST 200 `[]` (via `app.session_is_active()`), GoTrue 403, the other session's refresh 401 | **PASS** | `T08` | |
| T09 | Password change | `POST /api/auth/password` | Old password rejected, other sessions revoked, **current session kept** | The admin password update revoked **all** sessions, including the current one | **FAIL** | `T09` | Façade bug (it should reissue a session after the change). Not fixed because of the stop rule |
| T10 | Rate limiting | 6 bad logins, then the per-IP limit, then the recovery lockout; 35 valid logins through the façade from different client IPs | 6th → 429; IP limit enforced; recovery locked after 3; **no global throttling of valid users** | As expected after the config fix (`sign_in_sign_ups = 1000`). The first run had 30 of 35 valid logins throttled by Supabase | **PASS** (rerun) | `T10` | GoTrue ignores X-Forwarded-For from the façade, so all users share its IP |
| T11 | Direct PostgREST CRUD | Insert, select and update `applications` with the browser-equivalent client | CRUD works under RLS | Integration run failed with 42501 (anon), a cascade of T09's revoked session. **The browser e2e run inserted through direct PostgREST successfully** | **FAIL** (integration) | `T11`; e2e-leak-local-7e830d | The capability itself was demonstrated in the browser |
| T12 | No email to synthetic identities | Service-role scan of `auth.users` mail timestamps and `auth.audit_log_entries` | No mail sent | 16 alias identities, 0 with any mail-sent timestamp; audit log empty | **PASS** | `T12` | Weaker evidence: Supabase mail logs were not queried |
| SEC-01/02 | Recovery code single use and regeneration | Recover with a code, reuse it, regenerate, try an old code | Single use; sessions revoked; the old set is invalid | Failed as a cascade of T09 (stale password/session) | **FAIL** (cascade) | `SEC-01/02` | Unit tests cover generation, entropy and normalization (15/15 pass) |

## Static / CI

| Check | Local | CI (`M1 CI` run 36042112818, commit `c5d8dc6`) |
|---|---|---|
| lint, typecheck, unit (15 tests), build | pass (last run before the final harness edits) | pass |
| `check:bundle` | **fail** | **fail** |
| integration against a local Supabase stack | n/a | **fail**: 13/13. That commit predates the `config.toml` fix for `[auth.email] enable_signup` and the rate limit (register returns 500, and everything after it cascades) |

The `check:bundle` failure is a scanner hit on (a) the string `sb_secret_` inside supabase-js's own key-type check, and (b) the harness's alias detection marker, which the minifier folds into a literal. The hit contains **no real key material**; I checked this with masked output. The scanner was **not** relaxed. That is a decision for the user (see `M1_COMPLETION_REPORT.md` §25).

The last harness edits (`apps/web/src/App.tsx`, `e2e/leak.spec.ts`) were exercised by the authoritative Playwright run (which ran to completion and reported the T03 leak) but have not been re-linted or re-typechecked locally.
