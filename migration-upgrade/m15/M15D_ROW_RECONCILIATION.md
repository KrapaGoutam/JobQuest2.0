# JOBQUEST2.0 — M15-D ROW RECONCILIATION REPORT

**Audit Timestamp:** 2026-09-28T17:17:35.000Z  
**Milestone:** M15 — Production Launch & Cutover  
**Phase:** M15-D — Final Legacy Freeze, Final Backup, Live Migration & Reconciliation  
**Target Workspace:** `018f0000-0000-4000-8000-000000000001` (`JobQuest (Migrated)`)  
**Reconciliation Standard:** ZERO UNEXPLAINED DELTA  

---

## 1. Executive Summary

Every domain in the live production database (`jobquest-prod`) was audited against the source export. All eligible source records across all domains were mapped and migrated without loss. There is **ZERO UNEXPLAINED DELTA** across the entire dataset.

---

## 2. Domain-by-Domain Row Reconciliation Table

| Domain / Entity | Source Count | Eligible Count | Mapped Count | Migrated Count | Skipped Count | Error Count | Target Count | Delta | Explanation / Disposition |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Users** | 1 | 1 | 1 | 1 | 0 | 0 | 1 | 0 | Legacy user `jack` mapped to `user_accounts` & `profiles` |
| **Workspaces** | 0 | 1 | 1 | 1 | 0 | 0 | 1 | 0 | Created `JobQuest (Migrated)` workspace |
| **Workspace Members** | 0 | 1 | 1 | 1 | 0 | 0 | 1 | 0 | Added `jack` as `MANAGER` with `ACTIVE` status |
| **Applications** | 222 | 222 | 222 | 222 | 0 | 0 | 222 | 0 | Exact 1:1 migration. All 222 rows present in target |
| **Job Snapshots** | 89 | 89 | 89 | 89 | 0 | 0 | 89 | 0 | Exact 1:1 migration of job descriptions to snapshots |
| **Application Events** | 533 | 533 | 533 | 533 | 0 | 0 | 533 | 0 | Reconstructed from timeline (226), activities (226), and transitions (81) |
| **Tags** | 49 | 49 | 49 | 49 | 0 | 0 | 49 | 0 | Ingested into application tags arrays (49 distinct tags verified) |
| **Application Tags** | 158 | 158 | 158 | 158 | 0 | 0 | 158 | 0 | Preserved inside `applications.tags` array elements |
| **Checklists** | 2,442 | 0 | 0 | 0 | 2,442 | 0 | 0 | 0 | Boilerplate uncompleted items (SUPERSEDED_BY_JQ2) |
| **Contacts** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Zero source records |
| **Interviews** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Zero source records |
| **Tasks** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Zero source records |
| **Habits** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Zero source records |
| **Habit Logs** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Zero source records |
| **Journal Entries** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Zero source records |
| **Goals** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Zero source records |
| **Resumes** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Zero source records |
| **Active Sessions** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Credentials discarded (PIN retired) |
| **Extension Tokens**| 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Tokens discarded (regenerated on login) |

---

## 3. Application State & Stage Decomposition Reconciliation

In legacy JobQuest 1.0, application statuses were stored as single string fields. In JobQuest 2.0, applications are normalized into 3 orthogonal dimensions: `stage`, `status`, and `outcome`.

### 3.1 Stage Breakdown
- **APPLIED:** 185 (151 applied + 27 withdrawn + 7 rejected)
- **SAVED:** 37
- **Total Applications:** 222

### 3.2 Status Breakdown
- **OPEN:** 188 (151 active applied + 37 saved)
- **CLOSED:** 34 (27 withdrawn + 7 rejected)
- **Total Applications:** 222

### 3.3 Outcome Breakdown
- **REJECTED:** 7
- **WITHDRAWN:** 27
- **ACTIVE / OPEN (`null`):** 188
- **Total Applications:** 222

### 3.4 Special Case: Internship Preservations
- **Source Count:** 36 applications had `employment_type = 'Internship'`.
- **Target Handling:** Because JQ2 check constraint restricts `employment_type` to `('Full-time', 'Contract', 'Part-time')`, the migration engine mapped `employment_type = null` and ensured `'Internship'` was inserted into the `tags` array.
- **Reconciliation Audit:** Exactly 36 applications in `jobquest-prod` have `'Internship' = ANY(tags)`. Zero data loss.
