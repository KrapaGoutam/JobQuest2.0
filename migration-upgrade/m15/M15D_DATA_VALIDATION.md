# JOBQUEST2.0 — M15-D DATA VALIDATION REPORT

**Audit Timestamp:** 2026-09-28T17:19:42.000Z  
**Milestone:** M15 — Production Launch & Cutover  
**Phase:** M15-D — Final Legacy Freeze, Final Backup, Live Migration & Reconciliation  
**Target Project:** `jobquest-prod` (`kwmnljvyvqvbvimypnmw`)  
**Target Workspace:** `018f0000-0000-4000-8000-000000000001`  

---

## 1. Executive Summary

This report documents functional validation of the migrated data in `jobquest-prod` across Global Search, Pipeline Analytics, Dashboard KPIs, and rich application metadata. All tests verify that the migrated dataset correctly drives backend business logic without errors, crashes, or schema conflicts.

---

## 2. Global Search Backend Validation

A representative set of search queries was executed against `public.applications` in `jobquest-prod` to verify query execution and text search indices:

### 2.1 Keyword Query: `engineer` / `developer`
- **Query:**
  ```sql
  SELECT id, company_name, role_title, stage, status 
  FROM public.applications 
  WHERE workspace_id = '018f0000-0000-4000-8000-000000000001' 
    AND (company_name ILIKE '%engineer%' OR role_title ILIKE '%engineer%' OR role_title ILIKE '%developer%');
  ```
- **Matching Records Found:** Multiple matches (sample retrieved: 5 records).
- **Behavior:** Query executes in `< 15 ms`. Text search correctly matches roles and company names.
- **Privacy Notice:** Specific company and candidate details are omitted to comply with privacy rules.
- **Status:** **PASS**

---

## 3. Analytics & Funnel Validation

Pipeline analytics queries were executed against the migrated dataset to test aggregation logic:

### 3.1 Funnel Aggregations
- **Total Applications:** 222
- **Active Pipeline (`status = 'OPEN'`):** 188
- **Closed Applications (`status = 'CLOSED'`):** 34
  - **Withdrawn:** 27
  - **Rejected:** 7
- **Stage Distribution:**
  - **APPLIED:** 185
  - **SAVED:** 37
- **Data Sanity Checks:**
  - `open_apps + closed_apps = total_apps` (`188 + 34 = 222`) -> MATCH
  - `withdrawn + rejected = closed_apps` (`27 + 7 = 34`) -> MATCH
  - No negative totals.
  - No null stages or statuses.
- **Status:** **PASS**

---

## 4. Dashboard Query Validation

The core dashboard data metrics were queried against `jobquest-prod`:

| Dashboard Metric | Target Value in Production | Verification Rule | Status |
| :--- | :--- | :--- | :--- |
| **Total Applications** | 222 | Must equal source count | PASS |
| **Active Applications** | 188 | `status = 'OPEN'` | PASS |
| **Saved Applications** | 37 | `stage = 'SAVED'` | PASS |
| **Job Description Snapshots** | 89 | Must equal source snapshots | PASS |
| **Historical Events** | 533 | Must equal reconstructed events | PASS |
| **User Profile Theme** | `dark` | Preserved from legacy source | PASS |
| **Week Start Preference** | `1` (Monday) | Preserved from legacy source | PASS |

---

## 5. Application Metadata & Tags Validation

- **Internship Tag Preservation:** 36 applications have `'Internship'` in their `tags` array.
- **Work Arrangements:** `Remote`, `Hybrid`, and `Onsite` values accurately populated.
- **Salary Information:** Explicit `salary_min` and `salary_max` preserved; legacy textual `salary_range` preserved in notes.
- **Job Description Snapshots:** All 89 snapshots have valid SHA-256 payload hashes and link to existing applications.

---

## 6. Conclusion

The migrated data in `jobquest-prod` is structurally sound, fully indexed, and ready to power the JobQuest 2.0 user experience upon cutover.
