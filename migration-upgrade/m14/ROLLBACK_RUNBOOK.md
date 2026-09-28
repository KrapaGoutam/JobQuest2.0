# Milestone 14 — Rollback Runbook: Migration Rehearsal & Production Contingency

**Document ID:** `JQ2-M14-ROLLBACK-001`  
**Milestone:** M14 — Release Candidate & Migration Rehearsal  
**Scope:** Rehearsal Rollback Execution & Production Contingency Framework  
**Date:** 2026-09-28  

---

## 1. Rollback Policy & Invariants

1. **JobQuest 1.0 Authority:** JobQuest 1.0 remains the live, authoritative production system throughout M14. No production cutover is executed during M14, and JobQuest 1.0 is never retired until post-launch stabilization in M15.
2. **Zero Blast Radius:** Because all migrated legacy data is quarantined within the dedicated workspace `"JobQuest (Migrated)"` (`018f0000-0000-4000-8000-000000000001`), a rollback consists of purging this workspace and associated claim identities without impacting any pre-existing JobQuest 2.0 workspaces or users.
3. **Auditability:** Every rollback action produces a structured execution log documenting tables cleansed, row counts removed, and post-rollback foreign key integrity.

---

## 2. Rollback Triggers

An immediate rollback of the migration is triggered if any of the following occur during rehearsal or future cutover:

| Trigger ID | Failure Category | Trigger Condition | Severity |
|---|---|---|---|
| **TR-01** | **Reconciliation Failure** | Unreconciled count mismatch (> 0 unexplained missing rows) across any migrated entity. | **P0 Blocker** |
| **TR-02** | **Foreign Key Corruption** | Orphan records detected (applications, events, interviews, contacts, tasks, journal entries lacking valid parent). | **P0 Blocker** |
| **TR-03** | **Security / RLS Breach** | Cross-tenant data leakage detected via Global Search or direct RLS query tests. | **P0 Blocker** |
| **TR-04** | **Credential Leakage** | Any occurrence of legacy PIN hashes migrated into user passwords or auth credentials. | **P0 Blocker** |
| **TR-05** | **Application Parity Blocker** | Core user flows (Applications board, Journal, Contacts, Analytics) crash or fail smoke tests on migrated data. | **P0 Blocker** |
| **TR-06** | **Excessive Error Rate** | Migration script fails with unhandled exceptions on > 0.5% of source records. | **P1 Blocker** |

---

## 3. Rehearsal Rollback & Cleanup Procedure

To purge migrated rehearsal data and return the target environment to its baseline pre-migration state:

### Step 3.1: Automated Rollback Execution
Run the dedicated rollback script:
```bash
node scripts/migrate-legacy-data.mjs \
  --target "$TARGET_URL" \
  --workspace "018f0000-0000-4000-8000-000000000001" \
  --rollback \
  --confirm-non-production \
  --report "migration-upgrade/m14/evidence/rehearsal-rollback-report.json"
```

### Step 3.2: Direct SQL Purge Sequence (Verification)
If executing via SQL client or verifying manual rollback, execute in dependency order within a transaction:

```sql
BEGIN;

-- 1. Purge mapping table entries
DELETE FROM public.migration_id_mappings 
WHERE migration_run_id IN (
  SELECT batch_id FROM public.migration_batches 
  WHERE target_workspace_id = '018f0000-0000-4000-8000-000000000001'
);

-- 2. Purge migration batch records
DELETE FROM public.migration_batches 
WHERE target_workspace_id = '018f0000-0000-4000-8000-000000000001';

-- 3. Purge workspace-scoped child entities (cascaded by workspace foreign keys)
DELETE FROM public.journal_entries WHERE workspace_id = '018f0000-0000-4000-8000-000000000001';
DELETE FROM public.tasks WHERE workspace_id = '018f0000-0000-4000-8000-000000000001';
DELETE FROM public.habit_logs WHERE workspace_id = '018f0000-0000-4000-8000-000000000001';
DELETE FROM public.habits WHERE workspace_id = '018f0000-0000-4000-8000-000000000001';
DELETE FROM public.interviews WHERE workspace_id = '018f0000-0000-4000-8000-000000000001';
DELETE FROM public.contacts WHERE workspace_id = '018f0000-0000-4000-8000-000000000001';
DELETE FROM public.application_events WHERE workspace_id = '018f0000-0000-4000-8000-000000000001';
DELETE FROM public.job_snapshots WHERE workspace_id = '018f0000-0000-4000-8000-000000000001';
DELETE FROM public.applications WHERE workspace_id = '018f0000-0000-4000-8000-000000000001';
DELETE FROM public.goals WHERE workspace_id = '018f0000-0000-4000-8000-000000000001';
DELETE FROM public.tags WHERE workspace_id = '018f0000-0000-4000-8000-000000000001';

-- 4. Purge workspace memberships
DELETE FROM public.workspace_members WHERE workspace_id = '018f0000-0000-4000-8000-000000000001';

-- 5. Purge the migrated workspace
DELETE FROM public.workspaces WHERE id = '018f0000-0000-4000-8000-000000000001';

-- 6. Purge migrated claim codes and profiles
DELETE FROM public.legacy_claim_codes 
WHERE user_id IN (SELECT id FROM public.profiles WHERE legacy_user_id IS NOT NULL);

DELETE FROM public.profiles WHERE legacy_user_id IS NOT NULL;
DELETE FROM public.user_accounts WHERE id NOT IN (SELECT id FROM public.profiles);

COMMIT;
```

---

## 4. Post-Rollback Integrity Verification

Execute post-rollback queries to verify clean state:
```sql
-- Confirm zero residual rows in migrated workspace
SELECT COUNT(*) AS residual_applications FROM public.applications 
WHERE workspace_id = '018f0000-0000-4000-8000-000000000001';
-- Expected: 0

SELECT COUNT(*) AS residual_journal_entries FROM public.journal_entries 
WHERE workspace_id = '018f0000-0000-4000-8000-000000000001';
-- Expected: 0

-- Confirm pre-existing test data is completely unharmed
SELECT COUNT(*) AS standard_workspaces FROM public.workspaces 
WHERE id != '018f0000-0000-4000-8000-000000000001';
-- Expected: >= 1 (baseline preserved)
```
