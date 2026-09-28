# M15-C Production Data Profile: Real Legacy Neon Database

**Milestone:** M15-C (Legacy Neon Backup, Read-Only Export, Real-Schema Reconciliation & Production Migration Pre-Flight)  
**Profile Date:** `2026-09-28`  
**Dataset Source:** Restored Real Legacy Neon Container (`jobquest1_m15c_restore_20260928_110500`)  
**Status:** **PROFILED & ANALYZED**

---

## 1. Executive Summary

This document presents the comprehensive data profiling analysis performed on the restored offline copy of the legacy Neon production database. A complete audit was conducted across all 34 tables to analyze distributions, cardinalities, null percentages, date spans, and edge cases.

The production database represents an active single-user JobQuest 1.0 instance created on August 3, 2026 and active through September 23, 2026, tracking **222 job applications**, **49 custom tags**, and **89 rich job descriptions**.

---

## 2. User Account Profile (`users`)

| Property | Value | Notes |
| :--- | :--- | :--- |
| **Total Users** | 1 | Single user instance |
| **User ID** | `1` | Source integer PK |
| **Username** | `jack` | Primary identifier in JobQuest 1.0 |
| **Email** | `NULL` | No email stored in legacy DB |
| **Role** | `MANAGER` | Uppercase enum |
| **Status** | Active (`is_active: true`) | |
| **Theme Preference** | `dark` | Preserved into JQ2 `ui_preferences` |
| **Week Start** | `1` (Monday) | Preserved into JQ2 `ui_preferences` |
| **Account Created** | `2026-08-03 22:45:55.302+00` | |
| **Last Updated** | `2026-09-03 01:08:35.061+00` | |
| **Authentication Security** | Password hash & PIN hash present | **Zero hashes migrated per Invariant 5** |

---

## 3. Applications Profile (`applications`)

### 3.1 Overview & Cardinalities
- **Total Application Records:** `222`
- **Unique Companies:** `184`
- **Unique Role Titles:** `191`
- **Earliest Created:** `2026-08-03 22:51:27.648+00`
- **Latest Created:** `2026-09-23 22:09:39.463+00`
- **Earliest `date_applied`:** `2025-04-27`
- **Latest `date_applied`:** `2026-09-23`

### 3.2 Stage Distribution
Legacy applications record lifecycle status in a single `stage` column:

| Legacy Stage | Record Count | Percentage | JobQuest 2.0 Mapping Target |
| :--- | :-: | :-: | :--- |
| `Applied` | 151 | 68.0% | `stage: 'APPLIED'`, `status: 'ACTIVE'`, `outcome: null` |
| `Saved` | 37 | 16.7% | `stage: 'SAVED'`, `status: 'ACTIVE'`, `outcome: null` |
| `Withdrawn` | 27 | 12.2% | `stage: 'WITHDRAWN'`, `status: 'ARCHIVED'`, `outcome: 'WITHDRAWN'` |
| `Rejected` | 7 | 3.1% | `stage: 'REJECTED'`, `status: 'ARCHIVED'`, `outcome: 'REJECTED'` |
| **Total** | **222** | **100.0%** | |

### 3.3 Employment Type Distribution
| Employment Type | Count | Percentage | Handling Strategy |
| :--- | :-: | :-: | :--- |
| `NULL` (Unspecified) | 176 | 79.3% | Stored as `NULL` in target DB |
| `Internship` | 36 | 16.2% | Target DB allows `('Full-time', 'Contract', 'Part-time')`. Preserved via `'Internship'` tag; column set to `NULL` |
| `Full-time` | 5 | 2.3% | Stored as `'Full-time'` |
| `Contract` | 3 | 1.4% | Stored as `'Contract'` |
| `Part-time` | 2 | 0.9% | Stored as `'Part-time'` |
| **Total** | **222** | **100.0%** | |

### 3.4 Work Arrangement Distribution
| Work Arrangement | Count | Percentage |
| :--- | :-: | :-: |
| `NULL` (Unspecified) | 210 | 94.6% |
| `Hybrid` | 10 | 4.5% |
| `Remote` | 2 | 0.9% |
| **Total** | **222** | **100.0%** |

### 3.5 Field Population & Completeness (Null Analysis)
Across all 222 application records:

| Field Name | Non-Null Count | Null Count | Completeness |
| :--- | :-: | :-: | :-: |
| `company` | 222 | 0 | **100.0%** |
| `position` | 222 | 0 | **100.0%** |
| `stage` | 222 | 0 | **100.0%** |
| `priority` | 222 | 0 | **100.0%** |
| `date_applied` | 101 | 121 | 45.5% |
| `location` | 100 | 122 | 45.0% |
| `job_description` | 89 | 133 | 40.1% |
| `job_url` | 30 | 192 | 13.5% |
| `notes` | 18 | 204 | 8.1% |
| `salary_min` / `salary_max` | 0 | 222 | 0.0% (raw columns null) |
| `salary_range` (text) | 12 | 210 | 5.4% (preserved into notes) |

---

## 4. Tags & Categorization Profile (`tags`, `application_tags`)

- **Total Distinct Tags:** `49`
- **Total Application-Tag Associations:** `158`
- **Applications with At Least One Tag:** `84` (37.8%)
- **Most Frequent Tags:**
  - `Internship` (Tag ID 97): 36 applications
  - `Remote`: 12 applications
  - `Engineering`: 10 applications
  - `Tech`: 9 applications
  - `Product`: 8 applications
- **Consolidation Target:** Migrated into native PostgreSQL text arrays (`applications.tags = text[]`).

---

## 5. Job Descriptions & Snapshots Profile

- **Applications with Job Descriptions:** `89` (40.1%)
- **Average Description Length:** 2,140 characters
- **Shortest Description:** 185 characters
- **Longest Description:** 8,924 characters
- **Target Handling:** Migrated to `public.job_snapshots` with SHA-256 payload integrity hashing.

---

## 6. Audit & Timeline Profile (`activities`, `timeline_events`, `stage_history`)

### 6.1 `activities` (226 rows)
- `application_created`: 222 events
- `application_updated`: 2 events
- `stage_changed`: 2 events

### 6.2 `timeline_events` (226 rows)
- `application_created`: 222 events
- `stage_changed`: 2 events
- `resume_changed`: 1 event
- `application_updated`: 1 event

### 6.3 `stage_history` (224 rows)
- Initial stage assignments:
  - to `Applied`: 151
  - to `Saved`: 37
  - to `Withdrawn`: 27
  - to `Rejected`: 7
- Stage transitions:
  - `Applied` → `Assessment`: 1
  - `Assessment` → `Applied`: 1

---

## 7. Checklist Profile (`checklist_items`)

- **Total Rows:** `2,442`
- **Distribution:** Exactly 11 rows for each of the 222 applications.
- **Completion Rate:** Exactly `0 / 2,442` completed (`completed = 0` on 100% of rows).
- **Disposition:** Classified as `SUPERSEDED_BY_JQ2` (intentionally excluded from migration to prevent boilerplate database bloat).

---

## 8. Bulk Import Profile (`import_batches`, `import_rows`)

- **Total Batches:** `21`
- **Total Import Rows:** `218`
- **Disposition:** Legacy upload session logging; superseded by JobQuest 2.0 direct bulk import capabilities.
