# Milestone 15 — Implementation Plan: Production Launch & Cutover

**Status**: **PHASE M15-A (PRE-FLIGHT) COMPLETE — AWAITING USER AUTHORIZATION**  
**Milestone**: Milestone 15 — Production Launch & Cutover  
**Branch**: `feature/m15-production-launch-cutover`  
**Base Commit**: `5b67c4c630dbd94cbcca8d13058aaa59afa87fe8` (M14 merge into `development`, CI Run `36432957662` **SUCCESS**)  
**Release Candidate**: `v2.0.0-rc.1`

---

## 1. Overview & Multi-Phase Architecture

Milestone 15 governs the live production release of JobQuest 2.0. Unlike development milestones, execution is strictly partitioned into six sequential phases with mandatory hold gates between each phase.

```
┌─────────────────────────────────────────────────────────────┐
│ Phase M15-A: Pre-Flight & User Decision Gate (CURRENT)      │
│ - Author pre-flight package & decision gates                │
│ - HOLD: Await explicit user production authorizations        │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase M15-B: Production Infrastructure Provisioning         │
│ - Provision Supabase Prod & apply 18 migrations             │
│ - Import production ES256 key; set Vercel sensitive env     │
│ - Pre-provision "JobQuest (Migrated)" & Smoke workspaces    │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase M15-C: Legacy Backup & Read-Only Export               │
│ - Execute verified pg_dump on JobQuest 1.0 Neon DB          │
│ - Enforce 30-min write freeze / extraction window           │
│ - Export clean legacy dataset to secure runtime container   │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase M15-D: Production Data Migration & Reconciliation     │
│ - Run scripts/migrate-legacy-data.mjs (Prod parameters)     │
│ - Verify dual reconciliation (100% rows, 0 orphans, 0 PINs) │
│ - Securely extract single-use claim codes for operator      │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase M15-E: Production Deployment & Cutover                │
│ - Merge development -> main; verify main SHA CI             │
│ - Deploy vercel --prod; bind production domain              │
│ - Execute production smoke suite; user Cutover Go/No-Go     │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase M15-F: Post-Launch Stabilization                      │
│ - 14-day concurrent standby monitoring                      │
│ - Distribute claim codes; assist user onboarding            │
│ - HOLD: Separate user authorization for JobQuest1 retirement│
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Phase-by-Phase Execution Specifications

### Phase M15-A: Pre-Flight & Decision Gate (Current Phase)
- **Objective**: Author all governance, operational, and architectural documentation; classify all production decisions; confirm zero production changes occurred.
- **Entry Gate**: M14 merged into `development`; development CI `36432957662` is **SUCCESS**.
- **Exit Gate**: All 18 M15 planning documents authored and committed on `feature/m15-production-launch-cutover`; user explicitly reviews and answers decision items in [`M15_USER_DECISION_GATE.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/M15_USER_DECISION_GATE.md).

---

### Phase M15-B: Production Infrastructure Provisioning
- **Objective**: Establish the production database, auth configuration, and cloud environment.
- **Prerequisite**: Explicit user approval of `M15-D01` (Supabase Pro) and `M15-D03` (Project creation).
- **Execution Steps**:
  1. Create Supabase project `jobquest-prod` via Supabase Dashboard / CLI in designated AWS region (`aws-0-us-west-2`).
  2. Generate fresh production ES256 key pair (`scripts/generate-signing-key.mjs`).
  3. Import public key into `jobquest-prod` auth configuration.
  4. Store private key in Vercel Sensitive Environment Variables (`SUPABASE_JWT_PRIVATE_KEY`).
  5. Apply all 18 database migrations sequentially (`supabase/migrations/*.sql`) through `20261020100000_m14_legacy_migration_rehearsal.sql`.
  6. Pre-provision production `"JobQuest (Migrated)"` workspace and isolated smoke workspace (`00000000-0000-4000-8000-000000000001`).
- **Exit Gate**: Automated migration check confirms 18 migrations applied; RLS verified active on all tables; dummy JWT signed with private key validates against Supabase PostgREST.

---

### Phase M15-C: Legacy Backup & Read-Only Export
- **Objective**: Capture an immutable snapshot of legacy JobQuest 1.0 Neon database and extract migration data cleanly.
- **Prerequisite**: Explicit user approval of `M15-D10` (Neon Backup) and `M15-D11` (Write Freeze).
- **Execution Steps**:
  1. Schedule and announce 30-minute maintenance window.
  2. Execute `pg_dump` on Neon PostgreSQL database:
     ```bash
     pg_dump -h <neon-host> -U <neon-user> -d <neon-db> --clean --if-exists -F c -f legacy_backup_pre_m15.dump
     ```
  3. Compute and record SHA-256 checksum of `legacy_backup_pre_m15.dump`.
  4. Query and extract source tables in read-only transaction (`SET TRANSACTION READ ONLY`).
- **Exit Gate**: Backup file verified restorable on local sandbox; checksum logged; export record counts match live database table counts exactly.

---

### Phase M15-D: Production Data Migration & Reconciliation
- **Objective**: Migrate historical data into `"JobQuest (Migrated)"` with 100% reconciliation and zero security violations.
- **Prerequisite**: Phase M15-B and M15-C exit gates passed; user approval of `M15-D12`.
- **Execution Steps**:
  1. Execute production migration engine:
     ```bash
     CONFIRM_PRODUCTION_MIGRATION=true ALLOW_NON_REHEARSAL_WORKSPACE=true node scripts/migrate-legacy-data.mjs \
       --source <verified-export.json> \
       --target <jobquest-prod-pooler-url> \
       --workspace-id <prod-migrated-workspace-id>
     ```
  2. Verify 13 migration stages complete with 0 errors.
  3. Run comprehensive reconciliation suite:
     - 100% row balance across all 12 domains.
     - 0 foreign key orphans.
     - 0 legacy PIN hashes migrated (`pin_hashes_migrated: 0`).
  4. Collect plaintext Option B single-use claim codes and deliver securely to operator vault for out-of-band distribution.
- **Exit Gate**: Automated reconciliation report confirms 0 deltas and 0 orphans; claim codes securely archived outside git/logs.

---

### Phase M15-E: Production Deployment & Cutover
- **Objective**: Deploy JobQuest 2.0 to production, bind domain, and execute smoke validation.
- **Prerequisite**: Phase M15-D exit gate passed; user approval of `M15-D13`, `M15-D14`, and `M15-D17`.
- **Execution Steps**:
  1. Checkout `main` and merge `development` with verified commit SHA.
  2. Wait for exact-SHA GitHub Actions CI on `main` to pass (100% green).
  3. Execute production deployment: `vercel deploy --prod`.
  4. Bind primary production domain in Vercel.
  5. Run production smoke suite ([`migration-upgrade/m15/PRODUCTION_SMOKE_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_SMOKE_PLAN.md)).
  6. Review Go/No-Go criteria with user; obtain formal cutover signoff (`M15-D17`).
- **Exit Gate**: `/api/health` returns `200 OK`; smoke test passes; user issues formal GO.

---

### Phase M15-F: Post-Launch Stabilization
- **Objective**: Monitor live production traffic, assist legacy users with claim code onboarding, and maintain dual-system safety.
- **Prerequisite**: Successful cutover in Phase M15-E.
- **Execution Steps**:
  1. Monitor error rates, Vercel edge logs, and Supabase database connection pool metrics.
  2. Support legacy user claim code redemptions.
  3. Maintain JobQuest 1.0 in read-only standby throughout the 14-day stabilization window.
- **Exit Gate**: 14-day stabilization period concludes with zero critical defects; user is prompted for separate post-launch JobQuest 1.0 retirement authorization (`M15-D20`).
