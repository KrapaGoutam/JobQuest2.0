# Milestone 15 — Production Launch & Cutover: Pre-Flight Package

**Status**: **M15-A PRODUCTION PRE-FLIGHT COMPLETE — PENDING EXPLICIT USER PRODUCTION AUTHORIZATION**  
**Milestone**: Milestone 15 — Production Launch & Cutover (Phase M15-A)  
**Branch**: `feature/m15-production-launch-cutover`  
**Base Commit**: `5b67c4c630dbd94cbcca8d13058aaa59afa87fe8` (M14 merge into `development`, CI Run `36432957662` **SUCCESS**)  
**Release Candidate Declaration**: **JobQuest 2.0 Release Candidate 1 (`v2.0.0-rc.1`)**  
**Preview Deployment**: [`https://jobquest2-33y9un1oa-one-piece-5779.vercel.app`](https://jobquest2-33y9un1oa-one-piece-5779.vercel.app) (`dpl_Bt72bHx6a13C1dtxmUCkWin9qshT`)

---

## 1. Milestone Overview & Multi-Gate Sequencing

Milestone 15 represents the culmination of the JobQuest 2.0 modernization project. It transitions the validated Release Candidate (`v2.0.0-rc.1`) from non-production rehearsal into live production operation.

To ensure absolute operational safety, data preservation, and zero unintended downtime or data loss, Milestone 15 is strictly partitioned into six sequential, independently gated execution phases:

```
[M15-A: Pre-Flight & Decisions] (CURRENT PHASE)
  │
  ├──► [User Explicit Production Authorization Gate]
  │
[M15-B: Infrastructure Provisioning] (Supabase Prod, Vercel Prod, ES256 Keys)
  │
[M15-C: Legacy Backup & Read-Only Export] (Neon pg_dump, Read-Only Extraction)
  │
[M15-D: Production Migration & Reconciliation] (migrate-legacy-data.mjs, 100% Match)
  │
[M15-E: Production Deployment & Cutover] (main merge, Vercel --prod, Smoke Validation)
  │
[M15-F: Post-Launch Stabilization] (7-14 day monitoring, Option B claim claims)
  │
  └──► [POST-M15: Separate User Authorization for JobQuest 1.0 Retirement]
```

---

## 2. Strict Negative Boundaries for Phase M15-A

Phase M15-A is strictly **PLANNING, AUDIT, AND PRE-FLIGHT ONLY**.

Under Phase M15-A, the following actions are **STRICTLY PROHIBITED**:
- **NO** Supabase production project creation or API provisioning.
- **NO** paid plan purchases or upgrades (Supabase Pro, Vercel Pro).
- **NO** production database mutations or writes.
- **NO** live legacy Neon database connections, exports, or dumps.
- **NO** live legacy data migration execution.
- **NO** Vercel `--prod` production deployments.
- **NO** merge of `development` into `main`.
- **NO** DNS record modifications or domain registrations.
- **NO** Chrome Web Store extension publication.
- **NO** modifications to JobQuest 1.0 source code or Render services (JobQuest 1.0 is **STRICTLY READ-ONLY**).
- **NO** retirement or deprecation of JobQuest 1.0.

---

## 3. Directory Manifest

| Document | Purpose |
| --- | --- |
| [`README.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/README.md) | Overview of M15 structure, phases, and negative boundaries |
| [`M15_USER_DECISION_GATE.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/M15_USER_DECISION_GATE.md) | Exhaustive decision register (M15-D01 through M15-D20) requiring user signoff |
| [`IMPLEMENTATION_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/IMPLEMENTATION_PLAN.md) | Detailed phase-by-phase execution plan for M15-B through M15-F |
| [`PRODUCTION_ARCHITECTURE.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_ARCHITECTURE.md) | Production network topology, auth architecture, and service boundaries |
| [`PRODUCTION_ENVIRONMENT_MATRIX.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_ENVIRONMENT_MATRIX.md) | Local, Hosted Dev, Preview, and Production environment definitions |
| [`PRODUCTION_SECRETS_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_SECRETS_PLAN.md) | Secret custody, key rotation, and environment variable management |
| [`BACKUP_EXPORT_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/BACKUP_EXPORT_PLAN.md) | Legacy Neon pre-migration snapshot, checksum validation, and retention |
| [`PRODUCTION_MIGRATION_RUNBOOK.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_MIGRATION_RUNBOOK.md) | Step-by-step operator commands for executing real legacy data migration |
| [`PRODUCTION_RECONCILIATION_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_RECONCILIATION_PLAN.md) | Dual reconciliation queries, foreign key audits, and timestamp verification |
| [`CUTOVER_RUNBOOK.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/CUTOVER_RUNBOOK.md) | Cutover timeline, deployment sequence, and traffic redirection steps |
| [`ROLLBACK_RUNBOOK.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/ROLLBACK_RUNBOOK.md) | Immediate abort criteria, disaster recovery, and data restoration |
| [`PRODUCTION_SMOKE_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_SMOKE_PLAN.md) | Post-deployment smoke test specifications using dedicated smoke identity |
| [`EXTENSION_PRODUCTION_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/EXTENSION_PRODUCTION_PLAN.md) | Extension origin repointing, packaging, and distribution plan |
| [`POST_LAUNCH_STABILIZATION_PLAN.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/POST_LAUNCH_STABILIZATION_PLAN.md) | Stabilization monitoring, claim code assistance, and operational runbook |
| [`GO_NO_GO_CHECKLIST.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/GO_NO_GO_CHECKLIST.md) | Final binary checklist required prior to traffic cutover |
| [`PRODUCTION_ORIGIN_DECISION.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/PRODUCTION_ORIGIN_DECISION.md) | Production origin, custom domain, CORS, and CSRF configuration analysis |
| [`NEXT_AGENT_HANDOFF.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/NEXT_AGENT_HANDOFF.md) | Precise instructions for agent continuing after user authorization |
| [`M15A_PRE_FLIGHT_REPORT.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/M15A_PRE_FLIGHT_REPORT.md) | Comprehensive Phase M15-A completion report with user decision table |

---

## 4. Current State & Stop Notice

Milestone 15 Phase A is complete. All pre-flight analyses, runbooks, and decision gates have been authored.

**EXECUTION IS STOPPED.** The agent is awaiting explicit user production authorization and resolution of the decisions recorded in [`M15_USER_DECISION_GATE.md`](file:///C:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/m15/M15_USER_DECISION_GATE.md).
