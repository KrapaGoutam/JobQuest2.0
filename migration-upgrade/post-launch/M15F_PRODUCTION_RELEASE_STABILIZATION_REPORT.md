# M15-F Production Release + Stabilization Report

Timestamp: `2026-10-04T09:30:00-05:00`

Status: **M15-F READY FOR PRODUCTION CUTOVER APPROVAL**

This is pre-cutover certification only. Production mutation remains unauthorized and none was performed. `main`, the Production application, the Production database, Production auth, Vercel aliases, and Vercel environment variables remain unchanged.

## Release identity

| Item | Evidence |
| --- | --- |
| Feature branch | `feature/m15f-production-stabilization` |
| Release development SHA | `50a1a13d291da20ada18e4b4bbaaadc9fd54401b` |
| Development CI | `37182554528` — PASS for the exact release SHA |
| Exact release Preview | `dpl_EohU8BbxzuYLKUFSn6EUppPghpqS` — READY, `development`, exact release SHA |
| Initial blocker-report commit / CI | `d7c593388c896512f4b689c814c50a35763c49ed` / `37206201108` — PASS, governance-only |
| Main SHA | `bfa82eb557c5e748ba5d7c91fe122fb8294d2313` — unchanged |
| Production Supabase | `jobquest-prod` / `kqsxdothjxtcktyirpux` / `us-east-1` / `ACTIVE_HEALTHY` / PostgreSQL `17.6` |
| Development Supabase | `jobquest-dev` / `xpnkasclquplmrcmhsif`; primary repository link unchanged |
| Pending Production migration | `20261022100000_pl4c_goals_task_templates_recurrence.sql` only |

The audited application delta and migration compatibility conclusions from the blocker report remain valid. No release branch or Production baseline drift invalidated Stages 0–6.

## Stage 7 — backup and restore certification

### Fresh logical backup

Backup status: **READY**

Method: Supabase CLI `db dump` over the Production session-pooler connection, using the installed supported flags and separate logical components:

1. role-only dump;
2. application schema dump;
3. data-only COPY dump, excluding the documented Storage vector tables;
4. separate `supabase_migrations` schema dump;
5. separate `supabase_migrations` data dump.

Backup timestamp: `2026-10-04T14:11:32Z` through `2026-10-04T14:12:27Z`.

Safe location: `C:\Users\<operator>\Documents\JobQuest-Backups\jobquest-prod\2026-10-04-pre-m15f\`.

The location is outside the repository and is not Git-tracked. No credential, connection URL, token, private key, or row content is present in this report or the checksum manifest.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `roles.sql` | 370 | `168a95a9c745af5ed4679751f90419ac9dc434240a213b03e32a06d5664c2308` |
| `schema.sql` | 313,181 | `4b84ae0d7af81609b0e7e1761762502a20a291ff2571f4a7bae9bae5088e30ac` |
| `data.sql` | 669,620 | `d9494cc600336860d9e16738feb2ad713e3e5a23a1e00af0dda01e07fcd47b10` |
| `migrations-schema.sql` | 1,116 | `ae56295c7e66a8b46ab50df6f00cf57f7866f2478a17fbe3910d9def39e836ab` |
| `migrations-data.sql` | 351,874 | `a615882829cc6a3760b96ccbd4f5d3f0f67139c5de5d2e0fbb632178c1ba8732` |
| `restore-validation.json` | 4,538 | `cedc3428c3152484f8a26adc6c56f07ce20b9ce70fad7e2252768861477039fa` |
| `manifest.csv` | 790 | `596639fbf094bcd5b469f99f6d867ea02d80b8c913a11c511fc289c826c00734` |

Catalog validation passed:

- 34 public application tables were represented, including applications, contacts, tasks, interviews, goals, workspaces, memberships, auth-session support tables, resumes, and extension tokens.
- The schema contained 75 public functions and 58 RLS policies.
- The data dump contained all 34 public COPY sections and non-empty application data.
- Migration history contained 19 rows through `20261021100000`; `20261022100000` was absent as required.
- `task_templates` was absent, correctly proving the backup is the pre-PL-4C Production state.
- No credential-bearing PostgreSQL URL marker was found in the dump components.
- Auth and Storage data were included by the supported data dump. No custom managed Auth/Storage DDL was required; restore used a current clean Supabase stack to supply the managed schemas.

### Disposable restore

Restore status: **VERIFIED**

Target: a disposable local Supabase stack backed by PostgreSQL `17.11`, the same PostgreSQL major version as Production. It was isolated under `C:\tmp`, never linked to Production, and never used jobquest-dev.

Final restore sequence:

1. start a clean local Supabase stack with CLI `2.119.0` so its managed Auth schema contains every table referenced by the current cloud dump;
2. restore as the local stack's built-in `supabase_admin` role;
3. execute roles, application schema, data, migration schema, and migration data in one transaction;
4. enable `ON_ERROR_STOP=1`;
5. set `session_replication_role = replica` only for the data load, then return it to `origin`;
6. commit only after every component succeeds.

Two diagnostic attempts rolled back atomically and caused no persistent change: the local non-superuser `postgres` role could not grant a server parameter, and the older CLI `2.117.0` local Auth image lacked three current managed Auth tables. The clean current stack resolved both compatibility issues. The final restore transaction committed with no unresolved error.

The disposable containers, volume, temporary work directory, copied SQL files, and DPAPI credential file were removed after evidence capture. The verified backup and manifest were retained.

### Row-count reconciliation

Row-count reconciliation: **PASS — 37/37 tables matched, zero mismatches**.

| Representative table | Production | Restored |
| --- | ---: | ---: |
| `auth.users` | 0 | 0 |
| `public.workspaces` | 1 | 1 |
| `public.applications` | 223 | 223 |
| `public.application_events` | 349 | 349 |
| `public.contacts` | 0 | 0 |
| `public.interviews` | 0 | 0 |
| `public.tasks` | 0 | 0 |
| `public.goals` | 0 | 0 |
| `public.resumes` | 0 | 0 |
| `public.extension_tokens` | 1 | 1 |

The comparison also covered every remaining public application table plus `storage.buckets` and `storage.objects`.

### Structural reconciliation

| Check | Production | Restored | Result |
| --- | ---: | ---: | --- |
| Public tables / RLS-enabled | 34 / 34 | 34 / 34 | PASS |
| Public tables without RLS | 0 | 0 | PASS |
| Policies | 58 | 58 | PASS |
| Public routines / SECURITY DEFINER | 75 / 75 | 75 / 75 | PASS |
| Constraints / foreign keys | 213 / 68 | 213 / 68 | PASS |
| Unvalidated constraints | 0 | 0 | PASS |
| Indexes / invalid indexes | 127 / 0 | 127 / 0 | PASS |
| User triggers | 40 | 40 | PASS |
| Application-workspace orphans | 0 | 0 | PASS |
| Workspace-member orphans | 0 | 0 | PASS |

Columns, indexes, policies, routines, triggers, and migration-history SHA-256 structural fingerprints matched exactly. Constraint names, counts, validity, and 48 non-CHECK definitions matched exactly. PostgreSQL deparsed 37 of 85 CHECK expressions with equivalent cast placement after the dump round trip; after canonical cast normalization, all 85 matched and zero semantic difference remained.

Representative critical RPCs existed, remained SECURITY DEFINER, and retained explicit `search_path` configuration. Extension names and versions matched exactly: `plpgsql 1.0`, `pgcrypto 1.3`, `uuid-ossp 1.1`, `supabase_vault 0.3.1`, and `pg_stat_statements 1.11`.

Rollback status: **READY**. The backup proves a current recovery point; routine application rollback should still promote the known-good deployment and retain the additive schema. Full restore is reserved for database recovery.

## Stage 8 — Vercel Production audit

Status: **PASS**

- Authenticated account: `goutamkrapa11-8565`.
- Team: `one-piece-5779`.
- Project: `jobquest2` / `prj_0A32SVkbOH2fBI2XLFv7kSkv086d` / region `iad1`.
- Current Production deployment: `dpl_42Kq9nKyxAc1iicaMwE24NQhs3xQ`, READY, built from `main` SHA `bfa82eb557c5e748ba5d7c91fe122fb8294d2313`.
- Canonical aliases currently resolve to that deployment: `jobquest2.vercel.app`, `jobquest2-one-piece-5779.vercel.app`, and the Git `main` alias.
- Prior rollback deployment `dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK` remains READY. For the forthcoming release, the current `dpl_42...` deployment is the primary known-good rollback candidate.
- Git integration is connected to GitHub repository `KrapaGoutam/JobQuest2.0`; the Production branch is `main`, credentials are present, and deployment metadata/aliases verify automatic Git deployment behavior.
- Exact release Preview `dpl_EohU8BbxzuYLKUFSn6EUppPghpqS` is READY and mapped to the `development` branch alias.
- Live read-only probes passed: `/api/health` returned HTTP 200 with `status=ok`; the root returned HTTP 200.

No deployment, promotion, rollback, alias, project, team, or Git-integration mutation occurred.

## Stage 9 — Production configuration audit

Status: **PASS**

- Eleven Production environment entries exist and every entry is scoped only to Production.
- All nine required application variables are present: the three server Supabase variables, two client Supabase variables, signing JWK, JWT issuer, application origins, and extension token pepper.
- Server credentials and cryptographic material are stored as Vercel Sensitive variables. Values were not displayed or recorded.
- Vercel's encrypted/sensitive API payload is sealed rather than usable for plaintext comparison. The live compiled bundle independently proves the client points to `kqsxdothjxtcktyirpux`, contains no development ref, and contains no server-secret names, private-key marker, or PostgreSQL URL.
- Security headers are present: CSP, HSTS, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy.
- `EXTENSION_TOKEN_ENV` remains intentionally unset, so the cosmetic token prefix remains `jqx_dev_`; both accepted prefixes have identical authentication semantics. `EXTENSION_ORIGINS` remains optional and unset. These are the documented M15-E decisions, not cutover blockers.

No Production environment variable was added, changed, pulled to disk, or deleted.

## Stage 10 — Auth, RLS, and extension review

Status: **PASS**

- Production JWKS returned HTTP 200 with two public EC P-256 / ES256 signing keys and no private key material.
- Supabase exposes one active modern publishable key and one active legacy anon compatibility key; no key value was printed.
- The app-owned auth invariant remains `auth.users=0`.
- All 34 public tables have RLS enabled; 58 policies are present; zero public constraints are unvalidated.
- Zero business `rpc_*` SECURITY DEFINER function is executable by anon or PUBLIC. The four anon-executable helper functions are the established membership/ownership predicates required by RLS.
- The pending PL-4C migration is additive. Its SECURITY DEFINER functions set an empty search path; its business RPCs revoke broad execution and grant only intended authenticated/service roles; `task_templates` receives RLS plus owner/manager policies and explicit grants.
- There is no extension client-path delta from main to the release SHA. Production packaging defaults to `https://jobquest2.vercel.app`; both `jqx_dev_` and `jqx_live_` tokens are accepted and hashed with the server-only pepper. PL-1D remains deferred.

## Stage 11 — release security review

Status: **PASS WITH DOCUMENTED BACKLOG**

- The live Production bundle contained the Production project ref, excluded the development ref, and contained no service-key name, private-JWK name, pepper name, private-key marker, or database URL.
- The exact development CI already passed tracked-file, committed-key, application-bundle, and extension-bundle secret gates.
- Current Supabase security advisors report the same documented categories: eight deny-by-default RLS tables with no direct policies, eight mutable-search-path trigger/helper functions, four anon-executable RLS predicate helpers, and expected authenticated execution on business SECURITY DEFINER RPCs.
- Current performance advisors remain the documented hardening backlog: unindexed foreign keys, RLS init-plan optimization, and unused indexes.
- None of these findings was introduced by a Production change in M15-F; no Production DDL was applied.

## Stage 12 — final release test strategy

Status: **PASS**

No redundant application suites were rerun for the backup operation. The exact release SHA remains certified by development CI `37182554528`, which passed lint, typecheck, unit, integration, extension, build, migrations, browser E2E, axe, secret scanning, evidence upload, and disposable-stack cleanup. The matching Vercel Preview remains READY.

The new evidence added by M15-F is database-specific: fresh logical backup, checksum/catalog validation, clean restore, complete aggregate count reconciliation, structural fingerprinting, live Production health/configuration checks, and current Vercel/Supabase control-plane audits.

## Stages 13–14 — preflight and release-candidate certification

Status: **PASS**

- Release development SHA is exact and unchanged.
- Main and current Production are exact and unchanged.
- Exactly one Production migration is pending and its compatibility review is complete.
- Backup is READY and restore is VERIFIED.
- Current Production and rollback deployments are READY.
- Required Production configuration is present and isolated.
- Auth, RLS, extension, and security reviews pass with only documented non-blocking backlog.
- No unresolved P0/P1 release blocker remains.

The docs-only CI `37206201108` certifies only the earlier governance commit. Final application certification remains development CI `37182554528` for the exact release SHA; no new application artifact was created by this report.

## Stage 15 — exact Production cutover plan

Cutover remains unauthorized. After explicit approval, execute in this order:

1. Reconfirm `development=50a1a13d291da20ada18e4b4bbaaadc9fd54401b`, `main=bfa82eb557c5e748ba5d7c91fe122fb8294d2313`, current aliases, Production health, and the single pending migration.
2. Confirm the retained backup/manifest are readable and hashes still match. If Production row counts or migration state changed after this backup, capture and verify a new pre-mutation backup before continuing.
3. Preserve `dpl_42Kq9nKyxAc1iicaMwE24NQhs3xQ` as the primary application rollback target and `dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK` as the secondary historical fallback.
4. Apply only `20261022100000_pl4c_goals_task_templates_recurrence.sql` to `kqsxdothjxtcktyirpux`; observe locks/errors; stop immediately unless migration history becomes exactly 20 rows through `20261022100000` and post-migration RLS/grants/catalog checks pass.
5. Because the current application is backward-compatible with the additive schema, keep the old Production deployment serving during the migration.
6. Merge the certified development SHA to `main` only after the database gate passes, push `main`, and let the verified Git integration create the Production deployment. Do not run an additional manual `vercel --prod` deployment unless the approved plan is explicitly changed.
7. Require main CI success for the exact merge SHA and require the Vercel deployment metadata to reference that same SHA before accepting canonical alias movement.
8. Run focused Production smoke: health, login/session, workspace isolation, representative application CRUD/stage transition, goals, task template application, recurrence completion, search/analytics, extension `/me` and capture, logout/login, and security headers. Do not create or retire identities outside the approved smoke procedure.
9. Observe Vercel errors and Supabase database/auth logs through the stabilization window; reconcile representative counts and migration history; then declare GO.
10. On application regression, promote `dpl_42...` and retain the compatible additive schema. On migration failure, rely on the migration transaction rollback and do not merge main. Use the verified logical backup only for actual database corruption/data-loss recovery; do not improvise destructive down SQL.
11. Keep PL-5 deferred until M15-F cutover and stabilization are complete. Legacy retirement remains separately authorized.

## Decision

- M15-F: **READY FOR PRODUCTION CUTOVER APPROVAL**
- Backup: **READY**
- Restore: **VERIFIED**
- Rollback: **READY**
- Production mutation: **NONE**
- Main: **UNCHANGED**
- Production application: **UNCHANGED**
- Production database: **UNCHANGED**
- PL-5: **DEFERRED UNTIL AFTER M15-F**
- Legacy retirement: **NOT AUTHORIZED**
- Next action: explicit Production cutover approval.

STOP. Do not merge `development` to `main`, push `main`, apply the Production migration, deploy/promote Production, change aliases or environment variables, or retire legacy systems without explicit authorization.
