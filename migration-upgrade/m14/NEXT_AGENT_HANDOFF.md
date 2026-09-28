# Next Agent Handoff: Milestone 15 — Production Launch & Cutover

**Current State**: Milestone 14 is **100% COMPLETE & VERIFIED** on branch `feature/m14-release-candidate-migration-rehearsal`.  
**Current HEAD**: Commit on `feature/m14-release-candidate-migration-rehearsal`.  
**Release Candidate**: **JobQuest 2.0 Release Candidate 1 (`v2.0.0-rc.1`)**  

---

## 1. Prerequisites Before Beginning Milestone 15

**DO NOT begin Milestone 15 until all of the following conditions are met:**
1. The user has reviewed and manually merged `feature/m14-release-candidate-migration-rehearsal` into `development`.
2. The GitHub Actions CI run on `development` completes with **SUCCESS**.
3. The user has authorized the merge from `development` into `main`.
4. The user has authorized production infrastructure provisioning and real data migration.

---

## 2. Milestone 15 Scope & Execution Sequence

Milestone 15 is the final **Production Launch & Cutover** milestone. Its sequential phases are:

### Phase 1: Production Infrastructure Provisioning
1. **Supabase Production Project**:
   - Provision a dedicated Supabase Pro project (e.g. `jobquest-prod`) to avoid pause-on-inactivity and enable daily point-in-time recovery (`OQ-016`).
   - Run all 18 database migrations sequentially (`supabase/migrations/*.sql`) through `20261020100000_m14_legacy_migration_rehearsal.sql`.
   - Confirm table structures, indexes, RLS policies, triggers, and RPC procedures.
2. **Production ES256 Signing Key Pair Generation**:
   - Generate a fresh, production-only NIST P-256 key pair for Option B authentication.
   - Import the public key into the Supabase production project.
   - Secure the private key in Vercel Sensitive Environment Variables (`SUPABASE_JWT_PRIVATE_KEY`) (`OQ-029`).
3. **Production Workspace Pre-Provisioning**:
   - Provision `"JobQuest (Migrated)"` workspace (`018f0000-0000-4000-8000-000000000001` or new production UUID).
   - Provision isolated smoke test workspace (`00000000-0000-4000-8000-000000000001`) with dedicated smoke user (`OQ-021`).

### Phase 2: Live Legacy Data Migration & Reconciliation
1. **Pre-Migration Neon Database Snapshot**:
   - Take a full, verified logical backup (`pg_dump`) of the JobQuest 1.0 Neon PostgreSQL database before touching any records.
2. **Read-Only Data Extraction**:
   - Query legacy tables from Neon in strictly read-only mode (`SET TRANSACTION READ ONLY`).
   - Export source data to secure, uncommitted JSON fixture or stream directly into the migration engine.
3. **Migration Engine Execution**:
   - Run `scripts/migrate-legacy-data.mjs` against the production database with:
     ```bash
     CONFIRM_PRODUCTION_MIGRATION=true ALLOW_NON_REHEARSAL_WORKSPACE=true node scripts/migrate-legacy-data.mjs --workspace-id <prod-workspace-id>
     ```
   - Verify zero legacy PIN hashes were migrated (`pin_hashes_migrated: 0`).
   - Collect and securely store the generated Option B claim codes for distribution to legacy users.
4. **Dual Reconciliation & Foreign Key Audit**:
   - Verify 100% row count balance across all domains.
   - Verify 0 foreign key orphans.
   - Verify exact timestamp preservation.

### Phase 3: Production Vercel Deployment & Cutover
1. **Deploy Production Release Candidate**:
   - Execute production deployment to Vercel (`vercel deploy --prod`) from the verified commit on `main`.
   - Bind primary production domain (e.g. `jobquest.app` or user-designated production domain).
2. **Post-Cutover Smoke Testing**:
   - Execute production smoke tests using the dedicated smoke test user in the isolated smoke workspace (`migration-upgrade/m14/SMOKE_TEST_PLAN.md`).
   - Verify health probe (`/api/health`), authentication, application creation, and global search.
3. **Retire JobQuest 1.0**:
   - Place JobQuest 1.0 frontend into read-only mode with banner directing users to JobQuest 2.0 claim code redemption.
   - Retain JobQuest 1.0 Neon database in read-only standby for 30 days.

---

## 3. Key Files & Artifacts for M15

- `scripts/migrate-legacy-data.mjs`: Production migration engine.
- `migration-upgrade/m14/M14_RECONCILIATION_REPORT.md`: Baseline rehearsal reconciliation.
- `migration-upgrade/m14/PRODUCTION_READINESS_CHECKLIST.md`: Launch checklist.
- `migration-upgrade/m14/REHEARSAL_RUNBOOK.md`: Operational execution steps.
- `migration-upgrade/m14/ROLLBACK_RUNBOOK.md`: Disaster recovery and rollback procedures.
- `migration-upgrade/m14/SMOKE_TEST_PLAN.md`: Production smoke test specifications.
- `migration-upgrade/m14/M14_SECURITY_REVIEW.md`: Security invariants & Option B reference.

---

## 4. Strict Rules & Constraints for the Next Agent

- **DO NOT start M15 until M14 is merged into `development` and CI passes**.
- **NEVER execute real data migration without taking a prior backup of the legacy Neon database**.
- **NEVER use `git add .`** — always stage files explicitly by relative path.
- **NEVER mutate JobQuest 1.0 repository files**.
- **Preserve Option B invariant**: Legacy PIN hashes must NEVER be imported under any circumstance.
