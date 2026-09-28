# JOBQUEST2.0 — M15-D FOREIGN KEY RECONCILIATION REPORT

**Audit Timestamp:** 2026-09-28T17:17:35.000Z  
**Milestone:** M15 — Production Launch & Cutover  
**Phase:** M15-D — Final Legacy Freeze, Final Backup, Live Migration & Reconciliation  
**Target Project:** `jobquest-prod` (`kwmnljvyvqvbvimypnmw`)  
**Target Workspace:** `018f0000-0000-4000-8000-000000000001`  

---

## 1. Executive Summary

Referential integrity across all migrated tables in `jobquest-prod` was audited by running exhaustive SQL anti-join queries. The audit confirmed that every migrated child record correctly references a valid parent record, and no orphaned entities exist anywhere in the migrated workspace.

---

## 2. Foreign Key Integrity Audit Queries & Results

### 2.1 Applications to Workspace (`applications.workspace_id -> workspaces.id`)
- **Query:**
  ```sql
  SELECT COUNT(*) FROM public.applications a
  WHERE a.workspace_id = '018f0000-0000-4000-8000-000000000001'
    AND NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = a.workspace_id);
  ```
- **Orphan Count:** **0**
- **Status:** PASS

### 2.2 Applications to Owner (`applications.user_id -> user_accounts.user_id`)
- **Query:**
  ```sql
  SELECT COUNT(*) FROM public.applications a
  WHERE a.workspace_id = '018f0000-0000-4000-8000-000000000001'
    AND NOT EXISTS (SELECT 1 FROM public.user_accounts u WHERE u.user_id = a.user_id);
  ```
- **Orphan Count:** **0**
- **Status:** PASS

### 2.3 Job Snapshots to Applications (`job_snapshots.application_id -> applications.id`)
- **Query:**
  ```sql
  SELECT COUNT(*) FROM public.job_snapshots s
  WHERE s.workspace_id = '018f0000-0000-4000-8000-000000000001'
    AND NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.id = s.application_id);
  ```
- **Orphan Count:** **0**
- **Status:** PASS

### 2.4 Application Events to Applications (`application_events.application_id -> applications.id`)
- **Query:**
  ```sql
  SELECT COUNT(*) FROM public.application_events e
  WHERE e.workspace_id = '018f0000-0000-4000-8000-000000000001'
    AND NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.id = e.application_id);
  ```
- **Orphan Count:** **0**
- **Status:** PASS

### 2.5 Profiles to User Accounts (`profiles.user_id -> user_accounts.user_id`)
- **Query:**
  ```sql
  SELECT COUNT(*) FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM public.user_accounts u WHERE u.user_id = p.user_id);
  ```
- **Orphan Count:** **0**
- **Status:** PASS

### 2.6 Workspace Members to Workspace & Users (`workspace_members -> workspaces, user_accounts`)
- **Query:**
  ```sql
  SELECT COUNT(*) FROM public.workspace_members m
  WHERE m.workspace_id = '018f0000-0000-4000-8000-000000000001'
    AND (
      NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = m.workspace_id)
      OR NOT EXISTS (SELECT 1 FROM public.user_accounts u WHERE u.user_id = m.user_id)
    );
  ```
- **Orphan Count:** **0**
- **Status:** PASS

### 2.7 Migration ID Mappings to Batch (`migration_id_mappings.batch_id -> migration_batches.batch_id`)
- **Query:**
  ```sql
  SELECT COUNT(*) FROM public.migration_id_mappings m
  WHERE NOT EXISTS (SELECT 1 FROM public.migration_batches b WHERE b.batch_id = m.batch_id);
  ```
- **Orphan Count:** **0**
- **Status:** PASS

### 2.8 Legacy Claim Codes to User Accounts (`legacy_claim_codes.user_id -> user_accounts.user_id`)
- **Query:**
  ```sql
  SELECT COUNT(*) FROM public.legacy_claim_codes c
  WHERE NOT EXISTS (SELECT 1 FROM public.user_accounts u WHERE u.user_id = c.user_id);
  ```
- **Orphan Count:** **0**
- **Status:** PASS

---

## 3. Summary

- **Total FK Relationship Tests:** 8
- **Total Orphan Records Found:** **0**
- **Referential Integrity Score:** **100% PASS**
