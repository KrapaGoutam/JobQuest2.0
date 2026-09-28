# Next Agent Handoff: Milestone 15 — Production Launch Execution

**Current State**: Milestone 15 Phase A (Pre-Flight) is **100% COMPLETE**.  
**Current Branch**: `feature/m15-production-launch-cutover`  
**Base Commit on `development`**: `5b67c4c630dbd94cbcca8d13058aaa59afa87fe8` (M14 merge, CI `36432957662` **SUCCESS**)  
**Production Authorization Status**: **AWAITING USER DECISION GATE RESPONSES**  
**Production Mutation Status**: **ZERO PRODUCTION MUTATIONS EXECUTED**

---

## 1. Critical Operational Guardrail for the Next Agent

> [!CAUTION]
> **DO NOT PROCEED TO PHASE M15-B UNTIL THE USER EXPLICITLY REPLIES TO THE DECISION GATE.**
> - You MUST inspect the user's latest response for explicit authorizations to the decisions in [`M15_USER_DECISION_GATE.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/M15_USER_DECISION_GATE.md).
> - If the user has not authorized Supabase Pro (`M15-D01`), project creation (`M15-D03`), Neon backup (`M15-D10`), or migration (`M15-D12`), **STOP** and ask for those specific decisions.
> - **NEVER** merge into `main` without explicit approval (`M15-D13`).
> - **NEVER** run `vercel deploy --prod` without explicit approval (`M15-D14`).
> - **NEVER** edit files in `../JobQuest1.0/`.

---

## 2. Sequential Execution Workflow Once User Authorizes

Once the user approves the decision gate, execute the phases in exact sequence:

### Phase M15-B: Infrastructure Provisioning
1. Follow [`migration-upgrade/m15/IMPLEMENTATION_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/IMPLEMENTATION_PLAN.md) §Phase M15-B.
2. Generate fresh production ES256 key pair (`scripts/generate-signing-key.mjs`).
3. Store private key in Vercel Sensitive Environment Variables (`SUPABASE_JWT_PRIVATE_KEY`).
4. Provision `jobquest-prod` Supabase project and import public key.
5. Apply all 18 database migrations (`supabase/migrations/*.sql`).
6. Pre-provision `"JobQuest (Migrated)"` and smoke workspace (`00000000-0000-4000-8000-000000000001`).

### Phase M15-C: Legacy Backup & Read-Only Export
1. Follow [`migration-upgrade/m15/BACKUP_EXPORT_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/BACKUP_EXPORT_PLAN.md).
2. Execute `pg_dump` against JobQuest 1.0 Neon instance. Record SHA-256 checksum.
3. Validate offline restore into test sandbox.
4. Extract 33 tables in read-only transaction into `scratch/legacy-production-export.json`.

### Phase M15-D: Production Data Migration & Reconciliation
1. Follow [`migration-upgrade/m15/PRODUCTION_MIGRATION_RUNBOOK.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_MIGRATION_RUNBOOK.md).
2. Execute migration dry-run, then live migration with `CONFIRM_PRODUCTION_MIGRATION=true`.
3. Follow [`migration-upgrade/m15/PRODUCTION_RECONCILIATION_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_RECONCILIATION_PLAN.md).
4. Verify 100% row balance (0 delta), 0 foreign key orphans, and 0 legacy PIN hashes migrated.
5. Securely vault plaintext claim codes outside Git.

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
