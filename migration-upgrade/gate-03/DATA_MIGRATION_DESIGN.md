# JOBQUEST 2.0 — DATA MIGRATION DESIGN SPECIFICATION
**Document ID:** `JQ2-GATE03-MIG-001`  
**Gate:** `Gate 03 — Database + Authentication + Authorization/RLS Design`  
**Status:** `PROPOSED`  
**Related Documents:** [LEGACY_TABLE_MAPPING.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/LEGACY_TABLE_MAPPING.md), [TARGET_SCHEMA.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/TARGET_SCHEMA.md), [RPC_DOMAIN_OPERATIONS.md](file:///c:/Users/krapa/Documents/Job%20Search/JobTrackerProjects/JobQuest2.0/migration-upgrade/gate-03/RPC_DOMAIN_OPERATIONS.md)

---

## 1. Executive Summary & Migration Scope

The JobQuest migration transitions all historical data from the legacy Neon/Postgres database (33 tables) to the JobQuest 2.0 Supabase/Postgres database (25 permanent target tables plus 2 dedicated migration tracking tables: migration_batches and migration_id_mappings, totaling 27 tables).

### Core Migration Principles:
1. **Zero Data Loss:** Every active and archived record across all 33 legacy tables is accounted for, mapped, and verified.
2. **Deterministic Idempotency:** The migration script can be run repeatedly in staging without producing duplicate records or corrupted foreign keys.
3. **Auditability & Traceability:** Target records retain their original `legacy_id` as a nullable column alongside a dedicated reconciliation mapping table `migration_id_mappings`.
4. **Decoupled Application State:** Legacy 13-stage strings are cleanly decomposed into modern `(stage, state, outcome, closure_reason)` dimensions with backfilled event histories.
5. **Safe Tenant Isolation (OQ-012 Resolution):** Legacy single-tenant data is safely housed inside a dedicated, pre-provisioned workspace: **`"JobQuest (Migrated)"`**.

---

## 2. OQ-012 Resolution: Legacy Tenant Mapping Strategy

### Evaluation of Recommended Workspace: `"JobQuest (Migrated)"`
In JobQuest 1.0, data was partitioned only by `user_id` without workspace concepts. Placing legacy data directly into personal individual workspaces would fracture team collaboration and make cross-user historical comparison impossible.

### Approved Migration Tenant Design:
1. A shared system workspace is provisioned during migration:
   * **Workspace Name:** `"JobQuest (Migrated)"`
   * **Workspace Type:** `TEAM` (or `SYSTEM_MIGRATED`)
   * **Workspace ID:** Deterministic UUID `018f0000-0000-4000-8000-000000000001`
2. **Membership Provisioning:**
   * Every active legacy user is added to `"JobQuest (Migrated)"` with the `USER` role.
   * The primary legacy administrative user is assigned the `MANAGER` role.
3. **Personal Workspace Provisioning:**
   * In addition, each migrated user is provisioned their own independent `"Personal Workspace"`.
   * Migrated historical applications remain in `"JobQuest (Migrated)"` so all historical links and shared assets stay coherent, but users may move individual applications to their personal workspace post-claim if desired.

---

## 3. Definitive 13-Stage Legacy State Decomposition (Verified from JobQuest 1.0 Source)

Legacy JobQuest 1.0 merged pipeline stage, terminal status, and rejection reasons into a single overloaded 13-value `status` column (verified from `001_jobsearch.sql` line 22, `frontend/src/ui-utils.js` line 1, and `backend/src/service.js` line 3). JobQuest 2.0 transforms every verified legacy status into decoupled dimensions:

| # | Verified Legacy Value | Legacy Meaning | Target Stage | Target State | Target Outcome | Target Closure Reason | Migration Event Generated | Special Business Rule |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `Saved` | Saved job link | `BOOKMARK` | `OPEN` | `NULL` | `NULL` | `CAPTURED` | Initial saved opportunity / bookmark. |
| 2 | `Preparing` | In draft/materials prep | `BOOKMARK` | `OPEN` | `NULL` | `NULL` | `CREATED` | Application materials in preparation / draft. |
| 3 | `Applied` | Submitted to employer | `APPLIED` | `OPEN` | `NULL` | `NULL` | `APPLIED` | Application submitted; sets `applied_at` timestamp. |
| 4 | `Assessment` | Take-home/test | `SCREENING` | `OPEN` | `NULL` | `NULL` | `STAGE_CHANGED` | Assessment sub-stage preserved in event payload. |
| 5 | `Recruiter Screen`| Initial phone/HR screen | `SCREENING` | `OPEN` | `NULL` | `NULL` | `STAGE_CHANGED` | Initial screening call. |
| 6 | `Interview` | Hiring manager/team | `INTERVIEWING` | `OPEN` | `NULL` | `NULL` | `STAGE_CHANGED` | Standard interview rounds. |
| 7 | `Final Interview` | Executive/onsite round | `INTERVIEWING` | `OPEN` | `NULL` | `NULL` | `STAGE_CHANGED` | Final round interview. Sub-stage in event payload. |
| 8 | `Offer` | Formal offer extended | `OFFER` | `OPEN` | `NULL` | `NULL` | `STAGE_CHANGED` | Active offer extended and under review. |
| 9 | `Accepted` | Offer accepted | `OFFER` | `CLOSED` | `ACCEPTED` | `NULL` | `OUTCOME_CHANGED` | Terminal success state. |
| 10 | `Rejected` | Employer rejected candidate | Last Stage* | `CLOSED` | `REJECTED` | `NULL` | `OUTCOME_CHANGED` | *Stage preserved from stage history (default `APPLIED`). |
| 11 | `Withdrawn` | Candidate voluntarily withdrew | Last Stage* | `CLOSED` | `WITHDRAWN` | `CANDIDATE_WITHDREW` | `OUTCOME_CHANGED` | Candidate withdrew before offer. *Note: Modern candidate declined offer maps to `OUTCOME = WITHDRAWN` and `CLOSURE_REASON = OFFER_DECLINED`.* |
| 12 | `Ghosted` | Employer ceased contact | Last Stage* | `CLOSED` | `GHOSTED` | `NULL` | `OUTCOME_CHANGED` | Preserves last active stage. |
| 13 | `Position Closed`| Employer cancelled/closed role | Last Stage* | `CLOSED` | `POSITION_CLOSED` | `NULL` | `OUTCOME_CHANGED` | Role cancelled or closed by employer without candidate rejection or candidate withdrawal. Distinct business event. |

*Note on Declined Offers vs. Position Closed:*
* `declined` was NOT an actual stage string in JobQuest 1.0 (it was a UX concept). In JobQuest 2.0, when a candidate declines an offer, it is recorded as `OUTCOME = WITHDRAWN` with structured `CLOSURE_REASON = OFFER_DECLINED`.
* `Position Closed` WAS an actual legacy stage in JobQuest 1.0, representing an employer closing or cancelling the opening. In JobQuest 2.0, this maps to `OUTCOME = POSITION_CLOSED`.

---

## 4. Legacy ID Mapping Strategy (Dual-Storage Architecture)

To maximize query performance, debugging transparency, and audit verification:

1. **Embedded In-Table Columns (`legacy_id`):**
   * Every target table that absorbs legacy data contains a column: `legacy_id INTEGER NULL`.
   * Enables immediate, indexable lookups: `SELECT * FROM applications WHERE legacy_id = 452;`.
2. **Dedicated ID Mapping Table (`migration_id_mappings`):**
   * A centralized registry stores all cross-system identifiers:
   ```sql
   CREATE TABLE public.migration_id_mappings (
     mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     migration_run_id UUID NOT NULL REFERENCES public.migration_batches(batch_id),
     source_table VARCHAR(64) NOT NULL,
     legacy_id INTEGER NOT NULL,
     target_table VARCHAR(64) NOT NULL,
     target_id UUID NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT uq_migration_source UNIQUE(source_table, legacy_id)
   );
   CREATE INDEX idx_migration_lookup ON public.migration_id_mappings(target_table, target_id);
   ```

---

## 5. End-to-End 10-Phase Migration Execution Plan

```
[ Phase 1: Target Schema & Presets ]
         |
[ Phase 2: Tenant & Staging Workspaces ("JobQuest (Migrated)") ]
         |
[ Phase 3: Identity Staging & Claim Codes (PINs Retired) ]
         |
[ Phase 4: Companies, Contacts & Interactions ]
         |
[ Phase 5: Applications & Job Snapshots Migration ]
         |
[ Phase 6: Stage/Outcome Decomposition & Event Sourcing Backfill ]
         |
[ Phase 7: Interviews, Tasks & Reminders Consolidation ]
         |
[ Phase 8: Habits, Habit Logs, Daily/Weekly Goals & Journal ]
         |
[ Phase 9: Resumes & Document Text Extracts ]
         |
[ Phase 10: Reconciliation, Integrity Checks & Parity Audit ]
```

### Phase Details:

* **Phase 1: Target Schema & Reference Data Initialization**
  * Execute target schema DDL. Seed standard system workflow presets (`public.workflow_definitions`).
* **Phase 2: Tenant & Workspace Provisioning**
  * Provision workspace `"JobQuest (Migrated)"`.
* **Phase 3: Identity Staging & Claim Codes**
  * Migrate legacy `users` to `public.user_accounts` (status = `STAGED`).
  * Legacy PIN hashes are **strictly discarded**.
  * Generate 30-day default secure claim tokens into `public.legacy_claim_codes` (with operator reissue capability).
* **Phase 4: Companies & Contacts**
  * Deduplicate legacy company names and insert into `public.companies` (workspace shared reference table).
  * Migrate `networking_contacts` -> `public.contacts` (owner scoped, manager override).
  * Migrate `follow_ups` notes -> `public.contact_interactions` (owner scoped, manager override).
* **Phase 5: Applications & Job Snapshots**
  * Extract title, company, description, URL, and salary from legacy `applications` into `public.job_snapshots` (inherits application owner scope, manager override).
  * Insert application records into `public.applications` bound to workspace `"JobQuest (Migrated)"`.
* **Phase 6: Stage Decomposition & Event Sourcing Backfill**
  * Execute 13-stage mapping logic for all 13 verified legacy stages.
  * Reconstruct historical timeline from legacy `stage_history`, `timeline_events`, and `activities`.
  * Insert chronologically sorted records into `public.application_events`.
  * Compute and persist initial `last_activity_at` timestamp.
* **Phase 7: Interviews & Tasks Consolidation**
  * Migrate legacy `interviews` -> `public.interviews` (preserving `preparation_notes` and `questions_expected`).
  * Consolidate legacy `tasks`, `follow_ups`, and `reminders` into `public.tasks` (preserving recurrence rules).
* **Phase 8: Habits, Goals & Journal**
  * Migrate `habits` and `habit_logs` -> `public.habits` and `public.habit_logs` (preserving `week_start`).
  * Consolidate `daily_goals`, `weekly_goals`, `goal_settings`, and `goal_snapshots` -> `public.goals`.
  * Migrate personal `notes` -> `public.journal_entries` (OWNER SCOPED / MANAGER OVERRIDE, manager access audited).
* **Phase 9: Resumes & Document Extracts**
  * Migrate `resumes` and `resume_history` -> `public.resumes`.
* **Phase 10: Comprehensive Reconciliation & Integrity Audit**
  * Run programmatic reconciliation queries comparing source Neon row counts to target Supabase row counts.

---

## 6. Migration Idempotency & Checkpointing

The migration runner is implemented in Node.js/TypeScript using transactional batching:

1. **Batch Tracking:**
   * Each execution registers a record in `public.migration_batches` (`batch_id`, `status`, `started_at`).
2. **Re-Run Safety:**
   * All inserts use `ON CONFLICT (legacy_id) DO NOTHING` or query `migration_id_mappings` prior to insertion.
   * If a phase fails midway, re-running the migration runner safely skips previously committed records.
3. **Transactional Isolation:**
   * Each entity phase runs inside an isolated transaction. If Phase 6 fails, Phase 1–5 remain valid and do not require re-execution.

---

## 7. Verification, Validation & Acceptance Criteria

Before declaring migration success, the runner executes automated verification checks:

| Validation Check | Target Metric | Action on Failure |
| :--- | :--- | :--- |
| **Row Count Parity** | 100% match across all 33 legacy tables | Abort; inspect skipped records log |
| **Foreign Key Integrity** | 0 orphaned foreign keys | Abort; trace missing parent IDs |
| **Stage Decomposition** | 100% of applications have non-null `stage` and `state` | Abort; check unmapped status strings |
| **Offer Declined Invariant** | All declined offers have `outcome = 'WITHDRAWN'` and `closure_reason = 'OFFER_DECLINED'` | Abort; correct mapping rule |
| **Tenant Isolation** | 100% of migrated records belong to `"JobQuest (Migrated)"` | Abort; inspect workspace assignment |
| **PIN Hash Elimination** | 0 legacy PIN values or hashes present in target schema | Abort; security violation |
| **Event History Continuity** | Every application has at least 1 event (`CREATED` or `APPLIED`) | Abort; backfill initial event |
