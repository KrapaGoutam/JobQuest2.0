# M15-C Real Legacy Data vs M14 Rehearsal Diff

**Milestone:** M15-C (Legacy Neon Backup, Read-Only Export, Real-Schema Reconciliation & Production Migration Pre-Flight)  
**Comparison:** M14 Synthetic Fixture (`tests/fixtures/legacy-representative-export.json`) vs Real Legacy Neon Database  
**Status:** **RECONCILED & VALIDATED**

---

## 1. Executive Summary

Milestone 14 developed and validated the migration engine using a synthesized dataset (`legacy-representative-export.json`) that modeled expected legacy entities. During Milestone 15 Phase C, the live legacy Neon database was backed up, restored offline, and directly inspected.

While core domain models (`applications`, `tags`, `activities`) aligned in relational structure, critical schema and data value variances were identified between the synthetic fixture and real production data. All discrepancies have been analyzed, reconciled, and integrated into the migration transformation engine (`scripts/migrate-legacy-data.mjs`).

---

## 2. Entity-by-Entity Comparison Matrix

| Domain / Table | M14 Synthetic Fixture Assumption | Real Legacy Neon Source Reality | Reconciliation Action & Transformation |
| :--- | :--- | :--- | :--- |
| **`users.email`** | Required email address (`"user@example.com"`) | `email` is `NULL` | Fallback email generation: `jack@legacy.jobquest.local` with claim token mapping. |
| **`users.username`** | Absent or generic | Stored as `'jack'` | Mapped to `profiles.handle = 'jack'`, `profiles.full_name = 'jack'`. |
| **`users.role`** | Lowercase `'user'` | Uppercase `'MANAGER'` | Normalized to lowercase `'admin'` or `'member'` in target workspace membership. |
| **`users.ui_prefs`** | Assumed standard defaults | `theme_preference: 'dark'`, `week_start: 1` | Extracted and preserved in `profiles.ui_preferences` JSONB column. |
| **`applications.stage`** | Assumed `status` column existed | Column is named `stage` (no `status` column) | `mapLegacyStage(stage)` maps legacy stages to target `stage`, `status`, `outcome`, `closure_reason`. |
| **`applications.employment_type`** | Only standard types (`'Full-time'`, `'Contract'`) | 36 records have `'Internship'` | Target check constraint permits `('Full-time', 'Contract', 'Part-time')`. `'Internship'` preserved in `tags` array; `employment_type` set to `NULL` to satisfy DB constraint without data loss. |
| **`applications.salary_range`** | Not modeled | Text string present when `salary_min`/`max` are null | Preserved in `applications.notes` (appended as `[Salary Info: ...]`). |
| **`checklist_items`** | Assumed 25 varied items with user progress | Exactly 2,442 rows (11 boilerplate items x 222 apps, 100% `completed = 0`) | Classified as `INTENTIONALLY_NOT_MIGRATED` / `SUPERSEDED` by JobQuest 2.0 lifecycle tasks. |
| **`interviews`** | 4 synthetic interviews | 0 rows in real database | Tool gracefully handles empty array (migrated: 0). |
| **`networking_contacts`** | 8 synthetic contacts | 0 rows in real database | Handled (migrated: 0). |
| **`notes`** | 12 synthetic notes | 0 rows in real database | Handled (migrated: 0). |
| **`tasks`** | 10 synthetic tasks | 0 rows in real database | Handled (migrated: 0). |
| **`habits` & `habit_logs`** | 5 habits, 20 logs | 0 rows in real database | Handled (migrated: 0). |
| **`resumes`** | 3 synthetic resumes | 0 rows in real database | Handled (migrated: 0). |
| **`daily_goals` / `weekly_goals`** | 6 synthetic goals | 0 rows in real database | Handled (migrated: 0). |
| **`application_events`** | Assumed ~222 events | Produces 533 events in JobQuest 2.0 | 222 from creation trigger + 89 snapshot trigger + 222 lifecycle backfill events. |

---

## 3. Detailed Technical Analysis of Variances

### 3.1 User Identity Reconciliation
- **The Issue:** JobQuest 2.0 requires an email address for Supabase Auth accounts and profile records. The legacy database stored `email: null` and authenticated via `username: 'jack'` and Argon2/PIN hashes.
- **The Fix:**
  - `mapLegacyUser(u)` generates a deterministic legacy email fallback: `${cleanUsername}@legacy.jobquest.local`.
  - Generates a secure, 32-character migration claim token stored in `legacy_claim_codes` with the user's legacy ID `1`.
  - When the real user claims the account in JobQuest 2.0 via Supabase Auth, their verified email will link directly to their legacy profile and workspace.
  - Zero password hashes or PIN hashes are transferred (Invariant 5 maintained: `pin_hashes_migrated = 0`).

### 3.2 Application Stage Mapping
- **The Issue:** Legacy applications only had a single `stage` column with 4 distinct values:
  - `'Applied'`: 151
  - `'Saved'`: 37
  - `'Withdrawn'`: 27
  - `'Rejected'`: 7
- **The Fix:**
  - In JobQuest 2.0, applications have a decoupled state model: `stage` (`SAVED`, `APPLIED`, `INTERVIEWING`, `OFFERED`, `REJECTED`, `WITHDRAWN`), `status` (`DRAFT`, `ACTIVE`, `ACCEPTED`, `ARCHIVED`), `outcome` (`ACCEPTED`, `REJECTED`, `WITHDRAWN`), and `closure_reason`.
  - Mapping rule:
    - `'Applied'` → `stage: 'APPLIED'`, `status: 'ACTIVE'`, `outcome: null`, `closure_reason: null`, `eventType: 'APPLIED'`
    - `'Saved'` → `stage: 'SAVED'`, `status: 'ACTIVE'`, `outcome: null`, `closure_reason: null`, `eventType: 'CAPTURED'`
    - `'Withdrawn'` → `stage: 'WITHDRAWN'`, `status: 'ARCHIVED'`, `outcome: 'WITHDRAWN'`, `closure_reason: 'LEGACY_WITHDRAWN'`, `eventType: 'OUTCOME_CHANGED'`
    - `'Rejected'` → `stage: 'REJECTED'`, `status: 'ARCHIVED'`, `outcome: 'REJECTED'`, `closure_reason: 'LEGACY_REJECTED'`, `eventType: 'OUTCOME_CHANGED'`

### 3.3 Employment Type Constraint vs Data Integrity
- **The Issue:** The target database migration `20261011120000_core_tables.sql` enforces:
  ```sql
  CONSTRAINT chk_app_employment_type CHECK (
    employment_type IS NULL OR employment_type IN ('Full-time', 'Contract', 'Part-time')
  )
  ```
  In the real legacy database, 36 applications have `employment_type = 'Internship'`. Attempting to insert `'Internship'` directly causes a Postgres check constraint violation (`23514`).
- **The Resolution:**
  - In the legacy database, all 36 of these applications were already associated with Tag #97 (`'Internship'`) in `application_tags`.
  - The migration engine ensures `'Internship'` is added to the application's `tags` array (`applications.tags = ARRAY['Internship', ...]`).
  - Sets `employment_type = NULL` for these 36 records.
  - Result: 100% of the semantic classification is preserved, searchable, and filterable in JobQuest 2.0 without violating the strict database constraint.

### 3.4 Checklist Items Treatment
- **The Issue:** `checklist_items` in legacy contains 2,442 rows. Every application has identical 11 items created on application insert:
  1. "Review job description"
  2. "Tailor resume"
  3. "Write cover letter"
  4. "Submit application"
  5. "Send follow-up"
  6. "Connect with recruiter"
  7. "Research company culture"
  8. "Prepare talking points"
  9. "Review technical requirements"
  10. "Send thank you note"
  11. "Log interview feedback"
  Every single row has `completed = 0`.
- **The Decision:**
  - In JobQuest 2.0, application progress is driven by rich lifecycle events (`application_events`), dedicated interactive tasks (`tasks`), and timeline milestones.
  - Migrating 2,442 uncompleted static template rows would create unnecessary database bloat without providing user value.
  - Formally categorized as **`INTENTIONALLY_NOT_MIGRATED / SUPERSEDED`**.

---

## 4. Summary of Test Coverage

Two dedicated test suites were implemented and executed to prove reconciliation:
1. `tests/unit/m15c-real-schema-transforms.test.ts` (13 tests): Validates transformation functions with real data payloads.
2. `tests/integration/m15c-real-data-rehearsal.test.ts` (4 integration tests): Executes dry-run and live migration into a local Supabase test workspace using the exact 1.8MB real legacy export JSON.
All 17 tests passed with zero failures.
