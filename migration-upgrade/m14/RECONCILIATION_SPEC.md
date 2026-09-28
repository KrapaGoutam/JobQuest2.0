# Milestone 14 — Data Reconciliation Specification

**Document ID:** `JQ2-M14-REC-001`  
**Milestone:** M14 — Release Candidate & Migration Rehearsal  
**Scope:** Authoritative Mathematical Reconciliation Rules & Foreign Key Sweeps  
**Date:** 2026-09-28  

---

## 1. Mathematical Row Count Balance Equations

Every migrated domain must satisfy the fundamental conservation equation:

$$\mathbf{TargetCount} = \mathbf{SourceEligible} - \mathbf{Skipped} - \mathbf{Errors} + \mathbf{PreExisting}$$

Where:
* **$\mathbf{SourceCount}$**: Total row count extracted from legacy JobQuest 1.0 source table.
* **$\mathbf{SourceEligible}$**: Records meeting architectural migration criteria (e.g., non-corrupted rows, active tenant records).
* **$\mathbf{MigratedCount}$**: Records successfully inserted into the target JobQuest 2.0 table.
* **$\mathbf{SkippedCount}$**: Records intentionally skipped with documented architectural justification (e.g., duplicate tokens, obsolete sessions).
* **$\mathbf{ErrorCount}$**: Records that failed transformation or insertion (must be **0** for successful sign-off).
* **$\mathbf{Difference}$**: $(\mathbf{SourceEligible} - \mathbf{Skipped} - \mathbf{Errors}) - \mathbf{MigratedCount}$. Must strictly equal **0**.

### 1.1 Domain Reconciliation Balance Table

| Domain Index | Legacy Source Table | Target Destination Table | Expected Balance Invariant | Architectural Skipped / Filter Rationale |
|---|---|---|---|---|
| **D-01** | `users` | `profiles` | `Source = Target` | All users migrated; passwords replaced with claim codes. |
| **D-02** | `applications` | `applications` | `Source = Target` | 100% of legacy applications preserved. |
| **D-03** | `applications` (with description) | `job_snapshots` | `SourceDescriptions = Target` | Raw descriptions preserved as immutable snapshots. |
| **D-04** | `activities` + `stage_history` + `timeline_events` | `application_events` | `SourceEligible = Target` | Deduped composite events backfilled. |
| **D-05** | `networking_contacts` | `contacts` | `Source = Target` | All contacts migrated to workspace. |
| **D-06** | `interviews` | `interviews` | `Source = Target` | All rounds and notes preserved. |
| **D-07** | `tasks` + `reminders` + `follow_ups` + `checklist_items` | `tasks` | $\sum \text{Source} = \text{Target}$ | Consolidated into unified task queue. |
| **D-08** | `habits` | `habits` | `Source = Target` | All active and inactive habits preserved. |
| **D-09** | `habit_logs` | `habit_logs` | `Source = Target` | Daily completion logs preserved. |
| **D-10** | `notes` | `journal_entries` | `Source = Target` | All notes mapped to career journal. |
| **D-11** | `resumes` | `resumes` | `Source = Target` | All resume metadata preserved. |
| **D-12** | `daily_goals` + `weekly_goals` | `goals` | $\sum \text{Source} = \text{Target}$ | Normalized into unified goals model. |
| **D-13** | `tags` | `tags` | `Source = Target` | Workspace tag taxonomy. |
| **D-14** | `application_tags` | `application_tags` | `Source = Target` | Tag-to-application associations. |
| **D-15** | `extension_tokens` | `extension_tokens` | `Source = Target` | Active tokens preserved; expired tokens migrated as revoked. |

---

## 2. Foreign Key Integrity Queries (Zero-Orphan Invariant)

Post-migration validation executes the following SQL queries against the target database. Every query must return **0 rows**:

```sql
-- 1. Applications without a valid Workspace
SELECT id, legacy_id, company_name FROM public.applications 
WHERE workspace_id NOT IN (SELECT id FROM public.workspaces);
-- REQUIREMENT: 0 rows

-- 2. Applications without a valid Profile / Owner
SELECT id, legacy_id, company_name FROM public.applications 
WHERE user_id NOT IN (SELECT id FROM public.profiles);
-- REQUIREMENT: 0 rows

-- 3. Job Snapshots without a valid Application
SELECT id, application_id FROM public.job_snapshots 
WHERE application_id NOT IN (SELECT id FROM public.applications);
-- REQUIREMENT: 0 rows

-- 4. Application Events without a valid Application
SELECT id, application_id, event_type FROM public.application_events 
WHERE application_id NOT IN (SELECT id FROM public.applications);
-- REQUIREMENT: 0 rows

-- 5. Contacts without a valid Workspace
SELECT id, legacy_id, name FROM public.contacts 
WHERE workspace_id NOT IN (SELECT id FROM public.workspaces);
-- REQUIREMENT: 0 rows

-- 6. Interviews without a valid Application
SELECT id, legacy_id, application_id FROM public.interviews 
WHERE application_id NOT IN (SELECT id FROM public.applications);
-- REQUIREMENT: 0 rows

-- 7. Tasks with invalid Application references (when application_id is populated)
SELECT id, legacy_id, title FROM public.tasks 
WHERE application_id IS NOT NULL 
  AND application_id NOT IN (SELECT id FROM public.applications);
-- REQUIREMENT: 0 rows

-- 8. Habit Logs without a valid Habit parent
SELECT id, habit_id, log_date FROM public.habit_logs 
WHERE habit_id NOT IN (SELECT id FROM public.habits);
-- REQUIREMENT: 0 rows

-- 9. Journal Entries with invalid Application references (when application_id is populated)
SELECT id, legacy_id, title FROM public.journal_entries 
WHERE application_id IS NOT NULL 
  AND application_id NOT IN (SELECT id FROM public.applications);
-- REQUIREMENT: 0 rows

-- 10. Goals without a valid User Profile
SELECT id, legacy_id, category FROM public.goals 
WHERE user_id NOT IN (SELECT id FROM public.profiles);
-- REQUIREMENT: 0 rows
```

---

## 3. Critical Content & Timestamp Sampling Specification

To verify data fidelity without printing sensitive user data to committed evidence:

1. **Deterministic Checksum Comparison:**
   - Compute SHA-256 hashes of concatenated core fields `(company_name, job_title, date_applied, salary_range)` for source vs. target.
2. **Timestamp Semantics Verification:**
   - Check that date values (e.g. `2026-03-15`) do not drift across UTC/local day boundaries.
   - Assert `target.created_at::DATE = source.created_at::DATE`.
3. **Markdown Body Preservation:**
   - Verify that markdown headers, bullet points, and code formatting in legacy notes match byte-for-byte in `journal_entries.content_markdown`.
4. **Redacted Evidence Output:**
   - All sample logs published in `M14_RECONCILIATION_REPORT.md` must truncate emails (e.g. `u***@example.com`) and omit private compensation details.
