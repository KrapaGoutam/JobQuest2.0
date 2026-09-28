# JOBQUEST2.0 - CURRENT AGENT STATE

## Current Milestone
Milestone 14 — Release Candidate & Migration Rehearsal (IN PROGRESS)

## Feature Freeze Notice
FEATURE FREEZE IS IN EFFECT. No ordinary new features are permitted. Allowed changes are strictly: release blockers, security defects, migration defects, P0/P1 parity failures, production-readiness defects, performance defects materially threatening launch, and accessibility defects materially blocking launch. All other items belong in POST_LAUNCH_DEFERRED.md.

## Current Branch
`feature/m14-release-candidate-migration-rehearsal`

## Current HEAD
`93ba287fbbe3b70e94930ea8b2bf065b145768d8` (M13 merge commit)

## Working Tree State
Clean; synchronized with `origin/feature/m14-release-candidate-migration-rehearsal`.

## Last Completed Step
- M13 merged into `development` via `--no-ff` (`93ba287fbbe3b70e94930ea8b2bf065b145768d8`).
- Verified `development` GitHub Actions CI run `36421640993` completed with **SUCCESS** (both jobs green).
- Created feature branch `feature/m14-release-candidate-migration-rehearsal` and pushed to origin.
- Read-only audit of legacy JobQuest 1.0 backend (`../JobQuest1.0/backend/jobsearch/migrations/` 001–013). Confirmed 33 legacy tables; confirmed production runs PostgreSQL on Neon with Node+pg raw parameterized SQL, while SQLite was used only for tests/backups.
- Confirmed absence of duplicate migration tooling in `scripts/`.

## Current Step
- Authoring M14 Planning Package across `migration-upgrade/m14/`.

## Next Exact Step
1. Create `migration-upgrade/m14/` planning package:
   - `README.md`
   - `IMPLEMENTATION_PLAN.md`
   - `TEST_PLAN.md`
   - `ACCEPTANCE_CRITERIA.md`
   - `MIGRATION_SOURCE_AUDIT.md`
   - `MIGRATION_MAPPING_FINAL.md`
   - `REHEARSAL_RUNBOOK.md`
   - `ROLLBACK_RUNBOOK.md`
   - `PRODUCTION_READINESS_CHECKLIST.md`
   - `RECONCILIATION_SPEC.md`
   - `SMOKE_TEST_PLAN.md`
2. Build safe, dry-run capable, non-destructive migration script `scripts/migrate-legacy-data.mjs` targeting isolated rehearsal environment only.
3. Generate representative legacy dataset adhering to audited Neon/PostgreSQL schema.
4. Run rehearsal, reconcile row counts and foreign keys, verify Option B claim codes, verify timestamps and search index.
5. Rehearse rollback/cleanup.
6. Execute full regression, security review, a11y sweep, performance check, secret scans, Vercel preview RC deploy.

## Database State
- 17 migrations applied through `20261015100000_m13_global_search_journal.sql`.

## Supabase State
- Hosted development: `jobquest-dev` (`xpnkasclquplmrcmhsif`), all 17 migrations applied.
- Local Supabase: Docker stack active and clean.

## Vercel State
- Active M13 Preview: `https://jobquest2-qyo2zi4nx-one-piece-5779.vercel.app` (READY).
- Team: `one-piece-5779`, Project: `jobquest2`.
- Production: Untouched.

## Decisions
- ADR-048: Multi-domain global search RPC (`rpc_global_search`) with workspace and role enforcement.
- ADR-049: Career Journal workbench and note resolution (`journal_entries` table, 5 entry types).
- Gate 03 Architecture: 33 legacy tables mapped to JobQuest 2.0; legacy tenant hosted in `"JobQuest (Migrated)"`; PINs permanently retired; Option B claim architecture.

## Do Not Repeat / Strict Guardrails
- DO NOT start M15.
- DO NOT deploy Production or run Vercel `--prod`.
- DO NOT create or touch Production Supabase.
- DO NOT migrate real production data.
- DO NOT connect to live Neon production DB without explicit user approval.
- DO NOT merge M14 into development or main (STOP WITH M14 UNMERGED).
- DO NOT edit `../JobQuest1.0/` (strictly READ ONLY).
- DO NOT retire JobQuest 1.0.
