# M15-E Final GO / NO-GO Decision (2026-09-30)

**Decision: GO** (read-only verification gate; no production mutation performed)

**CK-18: OPERATOR APPROVED** (2026-09-30) - the operator accepted this decision and authorized formal closeout.
**M15-E: FORMALLY CLOSED.** **NEXT: M15-F - Production Stabilization** (not started; requires explicit operator authorization). JobQuest1 retirement remains NOT authorized.

## 1. Release under review

| Item | Value |
| --- | --- |
| Main SHA | bfa82eb557c5e748ba5d7c91fe122fb8294d2313 (origin/main verified) |
| origin/development | 1ed8fdd1fccdbdd8febeb3e071d0f316161df542 |
| Handoff branch | fix/m15e-extension-connection-ui @ 5afa6b55 (origin = local, tree clean); app code identical to main (`git diff origin/main..HEAD -- apps packages supabase e2e` empty) |
| Production deployment | dpl_42Kq9nKyxAc1iicaMwE24NQhs3xQ, https://jobquest2.vercel.app |
| Production Supabase | jobquest-prod `kqsxdothjxtcktyirpux`, ACTIVE_HEALTHY, us-east-1, 19/19 migrations |
| Rollback target | dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK (not consumed) |

## 2. Fresh read-only evidence gathered in this gate

- **Live health:** `/` 200, `/api/health` 200 `{"status":"ok"}` x4; TTFB 0.25-0.47 s from the operator workstation (see L4). Live bundle `index-DbUcxJVN.js`: contains `kqsxdothjxtcktyirpux` only; `kwmnl...` 0, `xpnk...` 0, no `sb_secret_<value>`, no private key, no JWT. The single `sb_secret_` string is the supabase-js prefix check (`startsWith`), not a key.
- **DB reconciliation (SQL, SELECT only):** applications 223, job_snapshots 90, application_events 349, application_documents 122, extension_tokens 1, user_accounts 1 (conan), workspaces 1, workspace_members 1 (MANAGER). 0 applications owned by anyone/any workspace other than Conan/fbd661ef-...; 0 `duplicate_override_flag=true`; 0 orphan snapshots/events/documents; 0 workspace mismatches; 0 smoke/e2e-named rows; exactly one row without `legacy_id` (the CVP smoke capture, created 13:13:33Z); exactly one `CVP ... QA Tester` row; 0 public tables without RLS.
- **Token row:** `OP-Prod`, prefix `jqx_dev_`, scopes exactly workflow:read, documents:read, applications:duplicate_check, applications:create, profile:read; expires 2026-12-29; last_used 13:16:05Z; revoked_at NULL; owner Conan; workspace fbd661ef-.... Only the hash is stored; the value was never recorded.
- **Production extension package (local `apps/extension/dist/jobquest-capture-prod`):** preset `prod` -> `https://jobquest2.vercel.app`; no popup files; no `Bookmarked`; no `Save as New Application Anyway`; no jobquest-dev / xpnk reference; no source maps; no secret/token patterns. `pnpm --filter @jobquest/extension test`: **97/97 PASS** (re-run now).
- **Supabase gateway logs (now queryable via `query_logs`, last 24 h):** edge_logs 423 requests, all 200/204/206, **zero 4xx/5xx**. Postgres ERROR/FATAL rows (20) are all non-application: provisioning-time platform restarts at 02:30Z, and management-API/operator SQL (rehearsal notices, RLS probe messages, and column-name typos). No `authenticator`/service-role application errors. This closes the Step 16B "gateway logs unavailable" limitation.
- **Advisors (security):** INFO/WARN set only, unchanged from 16A-2 (RLS-no-policy on auth/system tables by design; SECURITY DEFINER RPC executability = the known M14 authenticated-privilege finding, post-launch database-grant hardening). No ERROR-level lint.
- **Old systems:** not touched by this gate (no calls made to kwmnl..., jobquest-dev, Neon, or JobQuest1).

## 3. Release-criteria authority and how it applies

- `migration-upgrade/m15/GO_NO_GO_CHECKLIST.md` (CK-01..CK-18) and `M15E_GO_NO_GO_REPORT.md` are the **pre-cutover checklist written for the superseded kwmnl... target** (533 events, key 48e903e8, smoke-tester, 49 tags). Step 16A-2/16A-3 replaced that target with a new database; counts and key in CK-06/CK-10/CK-14 are historical. Current numbers are in Section 2 and in `STEP16A2_NEW_PRODUCTION_DATABASE_REPORT.md`. **CK-18 (user Go/No-Go authority) is satisfied only by the operator's explicit `GO`**; this document is the recommendation supporting it.
- Neither that checklist nor `m13/P0_P1_LAUNCH_CHECKLIST.md` requires a Production Side Panel visual observation of the duplicate verdict or a Production manual edit-invalidation test.
- `EXTENSION_CLOSEOUT_REPORT.md` (Step 13D / 13C final independent review, Opus): "Operator manual retest: SKIPPED BY OPERATOR (not counted as PASS). **Automated evidence: SUFFICIENT FOR RELEASE**", Blockers: none. The 16B plan lists the operator UI checks as *optional*.

## 4. Documented evidence limitations (required by the gate)

| # | Limitation | Compensating evidence | Classification |
| --- | --- | --- | --- |
| L1 | **Duplicate Side Panel visual observation** in Production was not independently observed by the agent (no token may be given to the agent; the blocked-second-save verdict is only visible in the operator's panel). | Prod DB: exactly one application for the captured URL and one for the company/title identity; `duplicate_override_flag=false` on 223/223. Prod logs: one `POST /captures` 201, no second capture, three later `duplicates/check` 200. Package: no override control, `duplicate_override` hard-coded false. Unit tests 97/97 (fail-closed save gate, identity-keyed state). Preview E2E (`m15e-extension-sidepanel`, incl. no POST /captures for an existing duplicate). Independent Opus review: known-duplicate save BLOCKED. | **NON-BLOCKING** - existing criteria accept automated evidence for release (Step 13C final review); no criterion demands Production visual observation. |
| L2 | **Edit invalidation Production manual test** not exercised (no Company/Title edit after the duplicate verdict). | 97/97 unit tests (`onIdentityChange`, stale-verdict NEEDS_CHECK, checkedKey/identity-key match); Preview E2E covering edit-into-duplicate + immediate Save (blocked, no write); Opus review: "edit invalidation ... PASS"; the shipped prod package is built from code identical to the reviewed SHA. | **NON-BLOCKING** - same authority. Optional operator check remains available: edit Company/Title in "Review & Edit details" and confirm a new `POST /api/ext/v1/duplicates/check` in logs. Do not perform another production write merely to obtain evidence. |
| L3 | **No dedicated stranger/anon Production RLS probe in 16B.** | 16A-2 rolled-back probe (stranger 0 rows, anon 42501, Conan denied `user_credentials`/`auth_recovery_codes`); 16A-3 functional proof (Conan reads 222 applications through user-JWT + RLS); 0 tables without RLS; 24 h gateway logs show no 401/PGRST301; the Supabase project has exactly one user. | **NON-BLOCKING** - functional verification plus prior explicit isolation probe; no criterion requires a fresh probe. |
| L4 | **Health latency:** runbook target `< 150 ms` was recorded at ~68 ms in the earlier deployment; measured now at 0.25-0.47 s TTFB (Vercel serverless, remote workstation, includes TLS). | Zero 5xx, all 200. | **NON-BLOCKING** - no critical performance failure; belongs to the performance-baseline backlog item. Not treated as a release criterion because the 150 ms figure was an edge probe from the prior deployment. |
| L5 | JWT `kid` decoding of a live token not performed. | Functional evidence: Conan session + protected reads through the new backend; JWKS on the new project lists kid 6434f760-... (16A-2). | **NON-BLOCKING** - recorded as FUNCTIONALLY VERIFIED, not decoded. |
| L6 | Vercel runtime-errors API returns 403 through the MCP; CLI log review from 16B used (20 entries, no 4xx/5xx). | Supabase gateway logs clean (above). | **NON-BLOCKING**. |

## 5. Finding classification

**BLOCKER:** none. P0: 0. P1: 0.

**NON-BLOCKING LIMITATION / HYGIENE (documented, not promoted):**
- L1-L6 above.
- **H1 - stale credential committed to `main` docs:** `migration-upgrade/m15/M15E_GO_NO_GO_REPORT.md:56` and `NEXT_AGENT_HANDOFF.md:61` contain the plaintext password of the old `smoke-tester` account (old/disputed kwmnl... project, "Production Smoke Workspace"). It does **not** exist in jobquest-prod (1 user: conan), so it cannot authenticate to the live production database; repo secret scans (922 files) did not flag it. Not a live-production secret leak, but it should be cleaned up post-launch: confirm the account is deleted/rotated wherever it still exists (old Supabase / JobQuest1-era environments), and scrub it from the docs (history will retain it).
- **H2 - stale checklist figures** (CK-06/10/14 refer to the superseded target): annotate, do not rewrite history.
- Smoke application (CVP QA Tester) and token `OP-Prod` intentionally retained; operator decides whether to archive the application later (an archive is a production write and was not performed).
- Server does not enforce duplicates on `POST /captures` (client-only gate) - documented residual, accepted by the Step 13C final review.
- Prod tokens carry the `jqx_dev_` prefix (`EXTENSION_TOKEN_ENV` unset): cosmetic, both prefixes accepted, authentication hashes the whole token.

**ALREADY RESOLVED:** claim RPC/legacy claim path no longer applies (no legacy users in jobquest-prod); B1/B2/B2-R/N1/legacy popup/CHECK_ERROR fail-open (closed by fa437ad6, Opus PASS); production backend target (frontend and server both kqsx..., verified 16A-3); ES256 key registered and functionally accepted; duplicate override removed; secrets absent from live bundle and prod package; data parity (Section 2); rollback preserved.

## 6. Post-launch backlog (deferred, NOT release blockers; nothing implemented in this gate)

Recorded here because `m13/POST_LAUNCH_DEFERRED.md` (DEF-01..07) predates M15 and does not list them:

1. Server-side duplicate enforcement in `POST /ext/v1/captures` / `rpc_extension_capture` (contract change; today client-only gate).
2. URL normalization edge-case hardening (client identity key lowercases URL query values; backend `normalizeJobUrl` is case-sensitive there; optionally accept only the verdict from the own `checkSeq`).
3. Realtime subscriptions (existing DEF-01).
4. Browser-extension store publication (unpacked distribution only for now).
5. Managed/KMS custody of the ES256 signing key (private JWK held by the operator and in Vercel).
6. Observability/alerting (Supabase + Vercel; log-drain/alert thresholds per `POST_LAUNCH_STABILIZATION_PLAN.md`).
7. Backup/restore rehearsal for jobquest-prod (only the older dump of the superseded target is verified).
8. Database-grant hardening (M14 authenticated-privilege finding; SECURITY DEFINER RPC EXECUTE grants, mutable search_path on `app.*` trigger functions).
9. Performance baseline (Core Web Vitals and API latency on production traffic).
10. Production stabilization work (M15-F: 14-day monitoring window).
11. Hygiene: scrub/rotate the stale `smoke-tester` credential (H1); `EXTENSION_TOKEN_ENV=live` (cosmetic, needs env change + redeploy); decide whether to archive the CVP smoke application.
12. Existing future-scope items F01-F03, B01-B03 (`EXTENSION_CLOSEOUT_REPORT.md`) and DEF-02..07 unchanged.

## 7. GO conditions check (Section 17 rule)

No P0/P1 blocker - YES | core application healthy - YES | database healthy - YES | auth - YES (functional) | RLS - YES (functional + prior probe) | extension connects - YES | capture succeeds - YES | duplicate-protection evidence meets existing criteria - YES (L1) | data reconciliation - YES | no secret leakage in production artifacts - YES (H1 is a stale credential for an account absent from prod) | no critical runtime errors - YES | rollback available - YES (previous deployment untouched, no redeploy since).

## 8. State after this gate

Production: unchanged. Preview/Development: unchanged. Old Supabase kwmnl... / jobquest-dev: not touched. JobQuest1 and Neon: retained, no retirement authorized. main/development: untouched. No merge, push, deploy, token creation/revocation, or data write occurred in this gate. M15-F: NOT STARTED (requires explicit operator authorization).
