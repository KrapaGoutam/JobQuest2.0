# JOBQUEST2.0 — M15-A PRODUCTION PRE-FLIGHT REPORT

**Status**: **100% COMPLETE & VERIFIED — PENDING USER PRODUCTION AUTHORIZATION**  
**Milestone**: Milestone 15 — Production Launch & Cutover (Phase M15-A)  
**Branch**: `feature/m15-production-launch-cutover`  
**Base Commit on `development`**: `5b67c4c630dbd94cbcca8d13058aaa59afa87fe8` (M14 merge, CI `36432957662` **SUCCESS**)  
**Release Candidate Declaration**: **JobQuest 2.0 Release Candidate 1 (`v2.0.0-rc.1`)**  
**Vercel Preview Deployment**: [`https://jobquest2-33y9un1oa-one-piece-5779.vercel.app`](https://jobquest2-33y9un1oa-one-piece-5779.vercel.app) (`dpl_Bt72bHx6a13C1dtxmUCkWin9qshT`)

---

## 1. Status
Milestone 15 Phase A (Production Pre-Flight & User Decision Gate) is **100% complete**. All architectural reviews, operational runbooks, reconciliation specs, and decision frameworks are established. Zero production modifications, zero database mutations, and zero paid purchases have been initiated.

---

## 2. M14 Integration
Milestone 14 (`M14 — Release Candidate & Migration Rehearsal`) was fully reviewed, approved, and integrated into `development`:
- **Branch Merged**: `feature/m14-release-candidate-migration-rehearsal`
- **Merge Method**: Non-fast-forward merge (`--no-ff`)
- **Merge Commit**: `5b67c4c630dbd94cbcca8d13058aaa59afa87fe8`
- **Files Integrated**: 39 files modified/created (+5,275 lines, -42 lines) including migration engine, database schema, tests, and M14 reports.

---

## 3. Development CI
Following the push of merge commit `5b67c4c6` to `origin development`, GitHub Actions CI run **`36432957662`** executed across both workflow jobs:
- **Job 1 (Static)**: `Lint · typecheck · unit · build · secret scans` — **PASSED** in 54s (ID `108963544186`).
- **Job 2 (Database/E2E)**: `Migrations · Option B auth · RLS · browser (local Supabase)` — **PASSED** in 6m56s (ID `108963544350`).
- **Overall Result**: **SUCCESS (100% GREEN)**.

---

## 4. Release Candidate SHA
- **Release Candidate ID**: JobQuest 2.0 Release Candidate 1 (`v2.0.0-rc.1`).
- **Validated Commit SHA**: `5b67c4c630dbd94cbcca8d13058aaa59afa87fe8` (HEAD of `development`).
- **Git Tag Status**: Documentation declaration only. Git tag `v2.0.0-rc.1` is staged for creation upon user authorization at launch gate.

---

## 5. Production Authorization State
- **Production Infrastructure Creation**: **NOT GRANTED**
- **Paid Plan Purchases / Upgrades**: **NOT GRANTED**
- **Legacy Neon Read / Export**: **NOT GRANTED**
- **Production Data Migration**: **NOT GRANTED**
- **`main` Branch Merge**: **NOT GRANTED**
- **Production Vercel Deployment**: **NOT GRANTED**
- **JobQuest 1.0 Retirement**: **NOT GRANTED (DEFERRED TO POST-STABILIZATION)**

---

## 6. Hosting Plan Decisions
- **Supabase Plan Requirement**:
  - Current Assumption: Supabase Pro ($25/mo).
  - Justification: Eliminates 7-day auto-pausing on inactivity, provides continuous Point-in-Time Recovery (PITR) with daily logical backups, and delivers dedicated compute connection pooling (Supavisor).
  - Free Plan Risk: Free tier databases auto-pause after 7 days of inactivity, causing high cold-start failure rates on user return; lacks PITR.
  - Disposition: **PROPOSED — USER APPROVAL REQUIRED (`M15-D01`)**.
- **Vercel Plan Requirement**:
  - Current Assumption: Vercel Hobby ($0/mo) initially, or Vercel Pro ($20/seat/mo).
  - Justification: Hobby supports custom domains, edge routing, and serverless functions with zero upfront cost. Pro adds advanced team audit logs and enhanced WAF rate limits.
  - Disposition: **PROPOSED — USER APPROVAL REQUIRED (`M15-D02`)**.

---

## 7. Production Domain
- Analysis documented in [`migration-upgrade/m15/PRODUCTION_ORIGIN_DECISION.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_ORIGIN_DECISION.md).
- Recommended: User-specified custom domain (e.g. `https://jobquest.app`).
- Fallback: Vercel default domain (`https://jobquest2.vercel.app`).
- Disposition: **PROPOSED — USER SPECIFICATION REQUIRED (`M15-D05`)**.

---

## 8. Supabase Production Plan
- Target project: `jobquest-prod`.
- Region: AWS US West (`aws-0-us-west-2`).
- 18 database migrations applied sequentially from `supabase/migrations/*.sql`.
- Supavisor active on port 5432 (transaction pooler) and 6543 (session pooler).
- Disposition: **PROPOSED — USER APPROVAL REQUIRED (`M15-D03`)**.

---

## 9. Vercel Production Plan
- Target project: Existing `jobquest2` project (Team `one-piece-5779`).
- Production Branch: `main`.
- Deployment trigger: `vercel deploy --prod` executed only after `development` merges into `main` and passes CI.
- Disposition: **PROPOSED — USER APPROVAL REQUIRED (`M15-D04`, `M15-D14`)**.

---

## 10. Signing-Key Custody
- Algorithm: ECDSA NIST P-256 (`ES256`).
- Recommendation: Vercel Sensitive Environment Variables (`SUPABASE_JWT_PRIVATE_KEY`).
- Invariant: Private key material is marked write-only and encrypted at rest using AES-256; never exposed to browser clients.
- Public key imported into Supabase Auth settings.
- Disposition: **PROPOSED — USER APPROVAL REQUIRED (`M15-D06`)**.

---

## 11. Smoke Account
- Username: `smoke-tester`.
- Password: Strong CSPRNG password held in Vercel Sensitive Env.
- Workspace: `00000000-0000-4000-8000-000000000001` (`"Production Smoke Workspace"`).
- Role: `USER`.
- Retained post-cutover for continuous synthetic health checks.
- Disposition: **PROPOSED — USER APPROVAL REQUIRED (`M15-D07`)**.

---

## 12. Rate Limiting
- Edge: Vercel edge firewall rule configured for 10 requests / minute / IP on `/api/v1/auth/*`.
- Database: Hourly `pg_cron` schedule executing `DELETE FROM public.auth_rate_limits WHERE reset_at < now() - interval '1 hour'`.
- Disposition: **PROPOSED — USER APPROVAL REQUIRED (`M15-D08`, `M15-D09`)**.

---

## 13. Legacy Neon Backup Plan
- Procedure: Full logical backup using `pg_dump -F c` targeting Neon production instance.
- Offline verification: SHA-256 checksum calculation + test restoration into local PostgreSQL.
- Read-only constraint: Live connections enforce `SET TRANSACTION READ ONLY`.
- Disposition: **PROPOSED — USER APPROVAL REQUIRED (`M15-D10`)**.

---

## 14. Write Freeze / Delta Plan
- Approach: Brief 30-minute maintenance window on JobQuest 1.0 during data extraction.
- Rationale: Single-tenant historical data is small enough to extract in under 60 seconds; avoids complex, error-prone dual-write delta synchronization.
- Disposition: **PROPOSED — USER APPROVAL REQUIRED (`M15-D11`)**.

---

## 15. Production Migration Tool Review
- Engine: [`scripts/migrate-legacy-data.mjs`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/scripts/migrate-legacy-data.mjs).
- Safety Interlock: `assertSafeTarget()` strictly enforces `CONFIRM_PRODUCTION_MIGRATION=true` and `ALLOW_NON_REHEARSAL_WORKSPACE=true`.
- Zero PIN Migration: Guaranteed in Stage 1 projection; `pin_hashes_migrated: 0`.
- Rollback: Cascading referential purge tested and verified clean.
- Disposition: **PROPOSED — USER APPROVAL REQUIRED (`M15-D12`)**.

---

## 16. Claim Code Handling
- Plaintext claim codes generated via `crypto.randomBytes(32).toString('hex')`.
- Database stores only SHA-256 `code_hash` and masked `code_hint` (`varchar(16)`).
- Plaintext tokens output to operator console once; stored securely in operator password vault for out-of-band delivery.
- Invariant: Zero plaintext claim codes in Git, CI logs, or screenshots.

---

## 17. Production Reconciliation Plan
- Audits 8 dimensions: Row count balance, foreign key orphans, ID mappings, timestamps, content samples, workflow state, analytics formulas, and global search indexability.
- Acceptance criteria: 100% row match, 0 foreign key orphans, 0 PIN migrations.
- Plan documented in [`migration-upgrade/m15/PRODUCTION_RECONCILIATION_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_RECONCILIATION_PLAN.md).

---

## 18. Main Merge Plan
- Merge sequence: `development` → `main` via `--no-ff`.
- Gate: Triggered only after user authorizes cutover launch gate.
- Disposition: **PROPOSED — USER APPROVAL REQUIRED (`M15-D13`)**.

---

## 19. Production Deployment Plan
- Tooling: `vercel deploy --prod` executed against verified commit on `main`.
- Rollback: `vercel rollback` ready if post-deployment checks fail.
- Disposition: **PROPOSED — USER APPROVAL REQUIRED (`M15-D14`)**.

---

## 20. Extension Production Plan
- Manifest `host_permissions` bound to permanent production origin.
- Phase 1: Unpacked zip distribution for immediate cutover verification.
- Phase 2: Chrome Web Store submission for long-term store distribution.
- Plan documented in [`migration-upgrade/m15/EXTENSION_PRODUCTION_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/EXTENSION_PRODUCTION_PLAN.md).
- Disposition: **PROPOSED — USER APPROVAL REQUIRED (`M15-D15`, `M15-D16`)**.

---

## 21. Smoke Test Plan
- Execution: Automated 9-checkpoint smoke suite ([`migration-upgrade/m15/PRODUCTION_SMOKE_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_SMOKE_PLAN.md)).
- Validates health probe, login, workspace isolation, application CRUD, journal entry, global search, and extension tokens.

---

## 22. Go / No-Go Criteria
- All 18 checkpoints in [`migration-upgrade/m15/GO_NO_GO_CHECKLIST.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/GO_NO_GO_CHECKLIST.md) must be verified green.
- Final authority rests exclusively with the user (`M15-D17`).

---

## 23. Rollback Criteria
- Triggered immediately if $> 0$ count delta, $> 0$ foreign key orphans, auth failure, or health probe failure occurs.
- Procedures documented in [`migration-upgrade/m15/ROLLBACK_RUNBOOK.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/ROLLBACK_RUNBOOK.md).

---

## 24. Stabilization Plan
- 14-day concurrent standby monitoring period.
- Support legacy user claim code redemptions.
- Documented in [`migration-upgrade/m15/POST_LAUNCH_STABILIZATION_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/POST_LAUNCH_STABILIZATION_PLAN.md).

---

## 25. JobQuest 1.0 Retirement Boundary
- JobQuest 1.0 remains online in read-only standby throughout Milestone 15.
- Decommissioning is **STRICTLY FORBIDDEN** during M15 and requires separate explicit user authorization post-stabilization (`M15-D20`).

---

## 26. User Decisions Required
The user must provide explicit answers to the 20 decisions recorded in [`migration-upgrade/m15/M15_USER_DECISION_GATE.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/M15_USER_DECISION_GATE.md).

---

## 27. Exact Next Commands After Approval
```bash
# Phase M15-B: Infrastructure Provisioning
node scripts/generate-signing-key.mjs
# (User provisions Supabase project; operator applies 18 migrations)
supabase db push --db-url "$SUPABASE_PROD_DB_URL"

# Phase M15-C: Legacy Backup & Export
pg_dump -h <NEON_HOST> -U <NEON_USER> -d <NEON_DB> -F c -f backups/legacy_neon_pre_m15.dump

# Phase M15-D: Production Migration
CONFIRM_PRODUCTION_MIGRATION=true ALLOW_NON_REHEARSAL_WORKSPACE=true node scripts/migrate-legacy-data.mjs \
  --source scratch/legacy-production-export.json \
  --target "$SUPABASE_PROD_DB_URL" \
  --workspace-id "$PROD_WORKSPACE_ID"

# Phase M15-E: Deployment
git checkout main && git merge --no-ff development && git push origin main
vercel deploy --prod
```

---

## 28. Git Status
- Active Branch: `feature/m15-production-launch-cutover`
- Base Commit: `5b67c4c630dbd94cbcca8d13058aaa59afa87fe8` (synchronized with `origin/development`)
- Working tree: Clean (with M15 planning package staged)

---

## 29. Final Recommendation
The technical, architectural, and operational preparations for JobQuest 2.0 production launch are complete. All quality gates have passed. The system is fully ready for Phase M15-B infrastructure provisioning upon explicit user approval of the decision gate.
