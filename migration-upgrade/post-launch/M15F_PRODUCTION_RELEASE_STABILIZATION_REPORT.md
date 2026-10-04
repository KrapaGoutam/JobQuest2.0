# M15-F Production Release + Stabilization Report

Timestamp: `2026-10-04T08:31:25-05:00`

Status: **BLOCKED — PRODUCTION BACKUP/RESTORE NOT READY**

Production mutation was not authorized and none was performed. The pre-cutover audit stopped at the mandatory backup/restore gate. Stages after that gate remain incomplete and no Production cutover approval is requested.

## Release identity

| Item | Evidence |
| --- | --- |
| Feature branch | `feature/m15f-production-stabilization` |
| Release base / development SHA | `50a1a13d291da20ada18e4b4bbaaadc9fd54401b` |
| Development CI | `37182554528` — PASS for exact SHA `50a1a13d291da20ada18e4b4bbaaadc9fd54401b` |
| Initial M15-F governance commit | `9cee870b2e1cfeecd04fecbee28266ec3e2ea636` |
| Main SHA | `bfa82eb557c5e748ba5d7c91fe122fb8294d2313` — unchanged |
| Production Supabase | `jobquest-prod` / `kqsxdothjxtcktyirpux` / `us-east-1` / `ACTIVE_HEALTHY` / PostgreSQL `17.6` |
| Development Supabase | `jobquest-dev` / `xpnkasclquplmrcmhsif` / `us-west-2` / `ACTIVE_HEALTHY` |

The primary repository remained linked to jobquest-dev. No Production link, migration, SQL write, auth/config change, deployment, alias change, data mutation, or smoke-user creation occurred.

## Git and worktree baseline

- `origin/development` matched the required release base.
- `origin/main` matched the required main baseline.
- The PL-4C merge parents are `dfa5a59b6619d12e319fe82b316be2339280f673` and `5e49b966561cdced327d33a6dd6b936bd5cec1e8`.
- The five carried-forward PL-4C closeout documents were classified as legitimate governance changes.
- The operator's `.gitignore` change remained unstaged and untouched.
- `FeatureUpgrade1` remained locally excluded.
- No unexpected application source change existed in the working tree.

## Release delta: main to development

The audited delta is 102 paths, 15,606 insertions, and 2,990 deletions. First-parent history contains the M15-E closeout and each required post-launch phase: PL-0, PL-1, PL-2, PL-3, PL-4A, PL-4B, and PL-4C.

| Area | Delta |
| --- | --- |
| Application/frontend | 47 web paths: application productivity and contact linking; dashboard/analytics redesign; duplicate/bulk/recruiter workflows; Calendar, Timeline, and Archive; configurable goals; task templates; recurrence UI and planning APIs. |
| Backend/API | Two API paths: extension statistics consume canonical goal rows; exports include canonical goal and recurrence fields. |
| Extension | No `apps/extension/**` client-path delta. Existing Production-origin/token/capture behavior is retained; the server statistics response is adapted to canonical goals. PL-1D remains deferred. |
| Database migrations | One file differs: `20261022100000_pl4c_goals_task_templates_recurrence.sql`. The M15 claim RPC migration is already present on main and Production. |
| RLS/grants | PL-4C adds owner/manager RLS for `task_templates`, explicit table grants, and authenticated/service-role-only execution for new or replaced RPCs. |
| Auth | No auth application-code delta. Existing session checks and authorization helpers are reused by PL-4C SECURITY DEFINER RPCs. |
| Configuration/CI | CI change classification, secret scanning, lint configuration, and governance instructions changed. No Production environment value was changed. |
| Tests | 17 unit/integration/E2E paths cover the post-launch features, migration compatibility, isolation, recurrence concurrency, responsive behavior, and accessibility. |
| Documentation/tools | Post-launch reports/governance and M15 reconciliation/import tooling account for the remaining change. |

## Database migration delta

Repository and jobquest-dev contain 20 migrations through `20261022100000`. Production contains 19 migrations through `20261021100000`.

Exact pending Production migration:

1. `20261022100000_pl4c_goals_task_templates_recurrence.sql`

There are no unexpected future or unknown Production migrations. Migration history was not repaired or modified.

The pending migration already passed the accepted PL-4C evidence: fresh-database, upgrade-path, RLS/grants, compatibility, recurrence concurrency, integration, application, Preview, feature, and exact development CI certification. It was not reapplied to jobquest-dev.

## Production compatibility review

The pending migration is compatible with the currently deployed application for a controlled rollout:

- Goals: adds `goal_type`, `target_value`, and `is_enabled`; retains `target_applications` and `target_outreach`; replaces existing RPC signatures in place and keeps their authenticated execution contract.
- Tasks: adds recurrence columns with backward-compatible defaults; replaces the existing guard and completion RPC in place; existing task inserts remain valid.
- Templates: creates a new owner-scoped table, policies, triggers, grants, and apply RPC; older code does not reference it.
- Security: all new SECURITY DEFINER functions use an empty `search_path`, check active authentication and membership/manager or owned-record authorization, revoke PUBLIC/anon execution, and grant only the intended roles.
- Production cardinality at audit time: `goals=0`, `tasks=0`, `contacts=0`, `interviews=0`, `applications=223`; `goals` is 32 KiB and `tasks` is 88 KiB. Data backfill and constraint/index validation therefore have negligible current data volume.
- Locking: `ALTER TABLE`, validated CHECK/UNIQUE constraints, and non-concurrent index creation take normal DDL locks and briefly block writes. The tiny/empty affected tables make a long lock unlikely, but migration execution must still be observed.
- Table rewrite: PostgreSQL 17 constant defaults are metadata-friendly; no destructive column removal or type rewrite occurs. Existing goals would be updated/cloned, but Production currently has none.
- Rollback: the schema is additive and the old app remains compatible, so the preferred rollback is application promotion to the prior known-good deployment while retaining the compatible schema. Destructive down SQL is not authorized.

Read-only catalog verification found zero public tables without RLS, zero unvalidated public constraints, and no PUBLIC/anon execution on the sampled critical SECURITY DEFINER RPCs. Existing Supabase advisor findings are the previously documented RLS-no-policy system-table informational findings and mutable-search-path/performance hardening backlog; no new migration was applied during this audit.

## Backup and restore readiness — blocking

`jobquest-prod` belongs to the Supabase Free organization tier. Supabase's supported backup documentation states that managed daily backups are available on paid plans and recommends manual CLI logical exports for Free projects.

Observed recovery evidence:

- No managed backup could be verified for the current project.
- The local Supabase Management API token is no longer authorized, so it could not list backup metadata; this does not change the Free-tier limitation reported by the authenticated project/organization inspection.
- The only file under the documented secure `jobquest-prod` backup location is `20260928_122000/jobquest_prod_post_migration_20260928_122000.dump` (869,912 bytes). It predates creation of the current `kqsxdothjxtcktyirpux` project on 2026-09-30 and belongs to the superseded target.
- The M15-E final decision already records backup/restore rehearsal for the current jobquest-prod project as outstanding.
- No current Production database password or supported logical dump is available in the authorized local configuration.
- No restore of a current-project backup has been rehearsed against a disposable non-Production target.
- Operator access to perform and validate a current-project restore is not verified.

Consequently there is no current, credible recovery point for the live 223-application database. The additive migration lowers rollback risk but does not replace a recoverable backup.

Required remediation before this preflight can resume:

1. Obtain operator-authorized Production database access through a non-repository secret channel.
2. Create a fresh logical backup of `kqsxdothjxtcktyirpux` with the supported Supabase CLI/`pg_dump` workflow immediately before cutover.
3. Store it outside the repository in the secure backup area, record size/time and SHA-256 without exposing data or credentials, and verify the archive catalog.
4. Restore that backup into an isolated disposable non-Production database and reconcile schema plus non-sensitive row counts.
5. Document the exact restore sequence, responsible operator access, expected downtime/RPO, and secure retention location.
6. Re-run the M15-F audit from the backup gate; if release branches or remote state drift, re-audit from baseline.

## Gates not reached

Because the backup gate requires an immediate stop, these stages were not completed in this run and must not be treated as passes:

- current Vercel team/project/deployment/alias and rollback-candidate verification;
- current Git-integration auto-deploy behavior verification (prior repository evidence says a main push auto-deployed, but Stage 8 must reverify it);
- Production variable-name/presence and dev-reference audit;
- final auth/RLS/extension release review beyond the database compatibility checks above;
- final release security review beyond the passing tracked-secret scan (`961` files, zero findings) and targeted RPC/catalog checks;
- final M15-F feature-head CI certification;
- exact final cutover order and Production mutation list;
- main merge/CI, Production migration/deployment, smoke, observability, and stabilization.

The previously recorded Production deployment `dpl_42Kq9nKyxAc1iicaMwE24NQhs3xQ` and prior rollback deployment `dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK` are historical evidence only; their current status was not revalidated after the backup hard stop.

## Provisional cutover policy

No cutover is approved or scheduled. Once backup/restore is ready and all later audit stages pass, the real Vercel deployment mechanism must determine the exact order. The cutover must freeze the approved SHA, capture the fresh backup, preserve the current known-good deployment, use exact-main CI, apply only the single approved migration after a matching dry run, deploy/promote only the exact certified main SHA, reconcile database/app/alias state, run focused Production smoke and security checks, observe stabilization, and declare GO or execute the documented application-first rollback.

Rollback triggers remain: persistent load/health failure, broken authentication, workspace/RLS isolation failure, major CRUD failure, critical extension failure, migration incompatibility, widespread 5xx, or any P0/P1 security regression. No destructive database rollback may be improvised.

## Decision

- M15-F: **BLOCKED AT PRE-CUTOVER BACKUP/RESTORE GATE**
- Production mutation: **NONE**
- Main: **UNCHANGED**
- PL-5: **DEFERRED UNTIL AFTER M15-F / NOT STARTED**
- PL-1D: **DEFERRED / TBD**
- Legacy retirement: **NOT AUTHORIZED**
- Next action: prepare and verify a current `jobquest-prod` logical backup/restore path, then resume the M15-F read-only audit at Stage 7. Do not approve or execute cutover yet.
