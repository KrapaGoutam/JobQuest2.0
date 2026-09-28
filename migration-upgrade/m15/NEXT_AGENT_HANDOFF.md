# Next Agent Handoff: Milestone 15 — Production Launch Execution

**Current State**: Milestone 15 Phase C (Legacy Neon Backup, Read-Only Export, Real-Schema Reconciliation & Production Pre-Flight) is **100% COMPLETE & VERIFIED**.  
**Current Branch**: `feature/m15-production-launch-cutover`  
**Base Commit on `development`**: `5b67c4c630dbd94cbcca8d13058aaa59afa87fe8` (M14 merge, CI `36432957662` **SUCCESS**)  
**Production Authorization Status**: **PHASE M15-C COMPLETE — AWAITING EXPLICIT USER APPROVAL FOR PHASE M15-D LIVE MIGRATION**  
**Production Mutation Status**: **ZERO LIVE PRODUCTION MUTATIONS (ONLY READ-ONLY PRE-FLIGHT EXECUTED ON PROD)**

---

## 1. Critical Operational Guardrail for the Next Agent

> [!CAUTION]
> **DO NOT PROCEED TO PHASE M15-D LIVE DATA INGESTION UNTIL THE USER EXPLICITLY REPLIES TO AUTHORIZE LIVE MIGRATION.**
> - You MUST inspect the user's latest response for explicit authorization to execute live production data migration (`M15-D`).
> - **NEVER** merge into `main` without explicit approval (`M15-D13`).
> - **NEVER** run `vercel deploy --prod` without explicit approval (`M15-D14`).
> - **NEVER** mutate legacy Neon (`default_transaction_read_only=on` strictly enforced).
> - **NEVER** edit files in `../JobQuest1.0/` or retire JobQuest 1.0 (`M15-D20`).
> - **NEVER** echo, print, or commit passwords, tokens, or connection strings into Git, logs, or markdown.

---

## 2. Completed Phase Deliverables (M15-A, M15-B, M15-C)

### 2.1 Phase M15-A: Pre-Flight & Planning (100% Complete)
- Pre-flight audit, runbooks, checklists, and user decision gate documented in `migration-upgrade/m15/`.

### 2.2 Phase M15-B: Infrastructure Provisioning (100% Complete)
- **Supabase Project:** `jobquest-prod` (`kwmnljvyvqvbvimypnmw`, AWS `us-east-1`, Org `OnePiece`).
- **Database Migrations:** 18/18 migrations through `20261020100000_m14_legacy_migration_rehearsal.sql` applied cleanly.
- **Option B Signing Key:** Active ES256 key registered in Supabase JWKS; private key vaulted in Vercel.
- **Production Smoke Account:** `smoke-tester` & workspace `00000000-0000-4000-8000-000000000001`.
- **Vercel Prod Environment:** 10 environment variables configured on `jobquest2`.

### 2.3 Phase M15-C: Legacy Backup, Export & Pre-Flight (100% Complete)
- **Verified Backups (Stored Outside Repos):**
  - Location: `C:\Users\krapa\Documents\Job Search\JobTrackerProjects\_secure-backups\jobquest1\20260928_110500\`
  - `legacy_neon_schema_20260928_110500.sql` (67,048 bytes, SHA256: `e04dc17b194b16fbf2f137b55f5cbc7e8e5f81093dd9367906f5e155f8509268`)
  - `legacy_neon_data_20260928_110500.dump` (261,376 bytes, SHA256: `4c3d0dc9b2d2def3337f8f9b7d751694f753fb6008894018c340fb22f62f5e52`)
- **Offline Docker Restore:** Container `jobquest1_m15c_restore_20260928_110500` (PG 18.6, 999ms, 0 errors, 34 tables, 62 FKs, 0 orphans).
- **Export Artifact:** `legacy_neon_export_20260928_110500.json` (1,819,301 bytes, SHA256: `4fa64c13413d2175b74a74461c3ac4418dbdc2a790c9763599bcbd074f1c9afc`).
- **Schema Reconciliation:** Handled `users.email: null`, `users.role: 'MANAGER'`, `users.theme_preference: 'dark'`, applications `stage`, 36 `'Internship'` applications via native tags, and `salary_range` notes.
- **Migration Tooling:** Pure transformation layer added to `scripts/migrate-legacy-data.mjs` and typed in `scripts/migrate-legacy-data.d.ts` / `tests/ambient.d.ts`.
- **Rehearsal Tests:** 13 unit tests + 4 integration tests + 331 full repo tests pass cleanly.
- **Production Preflight:** Strictly read-only audit executed against `jobquest-prod` (`kwmnljvyvqvbvimypnmw`) — all 6 checks PASS.

---

## 3. Sequential Execution Workflow Once User Authorizes Phase M15-D

Once the user approves starting live production data migration:

### Phase M15-D: Production Data Migration & Reconciliation
1. Follow [`migration-upgrade/m15/PRODUCTION_MIGRATION_RUNBOOK.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_MIGRATION_RUNBOOK.md).
2. Execute live migration using the verified export file:
   ```bash
   node scripts/migrate-legacy-data.mjs \
     --source "C:/Users/krapa/Documents/Job Search/JobTrackerProjects/_secure-backups/jobquest1/20260928_110500/legacy_neon_export_20260928_110500.json" \
     --target "$PROD_DATABASE_URL" \
     --workspace "018f0000-0000-4000-8000-000000000001" \
     --report "migration-upgrade/m15/M15D_MIGRATION_REPORT.json"
   ```
3. Follow [`migration-upgrade/m15/PRODUCTION_RECONCILIATION_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_RECONCILIATION_PLAN.md).
4. Verify 100% row balance (222 applications, 89 snapshots, 533 events), 0 foreign key orphans, and exactly 0 legacy PIN hashes migrated (`pin_hashes_migrated: 0`).
5. Securely vault claim codes outside Git.

### Phase M15-E: Production Deployment & Cutover
1. Follow [`migration-upgrade/m15/CUTOVER_RUNBOOK.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/CUTOVER_RUNBOOK.md).
2. Merge `development` into `main`. Wait for exact-SHA CI on `main` to pass.
3. Deploy to production: `vercel deploy --prod`.
4. Follow [`migration-upgrade/m15/PRODUCTION_SMOKE_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_SMOKE_PLAN.md) and execute 9 smoke checkpoints.
5. Present Go / No-Go checklist to user for final cutover signoff (`M15-D17`).

### Phase M15-F: Post-Launch Stabilization
1. Follow [`migration-upgrade/m15/POST_LAUNCH_STABILIZATION_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/POST_LAUNCH_STABILIZATION_PLAN.md).
2. Monitor production error rates, connection pools, and claim code redemptions for 14 days.
3. Maintain JobQuest 1.0 in read-only standby.
4. Prompt user for separate post-stabilization retirement authorization (`M15-D20`).
