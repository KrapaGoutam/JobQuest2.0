# Milestone 14 — Final Migration Mapping Specification

**Document ID:** `JQ2-M14-MAPPING-001`  
**Status:** APPROVED FOR REHEARSAL  
**Parent Decision:** Gate 03 Approved Data Migration Architecture & ADR-012  
**Date:** 2026-09-28  

---

## 1. Domain Disposition & Mapping Overview

| Legacy Domain | Source Table(s) | Target Table(s) | Architecture Action | Tenancy & Ownership | ID Strategy |
|---|---|---|---|---|---|
| **Users & Auth** | `users` | `user_accounts`, `profiles`, `workspaces`, `workspace_members`, `legacy_claim_codes` | **SPLIT** | Global user UUID; assigned to `"JobQuest (Migrated)"` | `profiles.legacy_user_id` |
| **Applications** | `applications` | `applications`, `job_snapshots` | **SPLIT / MODIFY** | Workspace-scoped (`018f0000-0000-4000-8000-000000000001`), owner-scoped | `applications.legacy_id` |
| **History & Events** | `activities`, `timeline_events`, `stage_history` | `application_events` | **MERGE** | Workspace-scoped, application-linked | `application_events.legacy_id` |
| **Interviews** | `interviews` | `interviews` | **MODIFY** | Workspace-scoped, application-linked | `interviews.legacy_id` |
| **Rejections** | `rejections` | `applications` (outcome columns), `application_events` | **MERGE / RETIRE** | Folded into application outcome & events | Event payload |
| **Contacts** | `networking_contacts` | `contacts` | **MODIFY** | Workspace-scoped, owner-scoped | `contacts.legacy_id` |
| **Tasks & Reminders** | `tasks`, `reminders`, `follow_ups`, `checklist_items` | `tasks` | **MERGE** | Workspace-scoped, owner-scoped | `tasks.legacy_id` |
| **Habits & Tracking** | `habits`, `habit_logs` | `habits`, `habit_logs` | **MODIFY** | Workspace-scoped, owner-scoped | `habits.legacy_id` |
| **Notes & Journal** | `notes` | `journal_entries` | **MODIFY** | Workspace-scoped, owner-scoped | `journal_entries.legacy_id` |
| **Resumes & Docs** | `resumes`, `resume_history` | `resumes`, `resume_versions` | **SPLIT / MERGE** | Workspace-scoped, owner-scoped | `resumes.legacy_id` |
| **Goals & Metrics** | `daily_goals`, `weekly_goals`, `goal_settings`, `goal_snapshots` | `goals` | **MERGE** | Workspace-scoped, owner-scoped | `goals.legacy_id` |
| **Tags & Labels** | `tags`, `application_tags`, `reminder_categories` | `tags`, `application_tags` | **MODIFY / MERGE** | Workspace-scoped | `tags.legacy_id` |
| **Preferences** | `dashboard_preferences`, `application_view_preferences`, `export_preferences` | `profiles.ui_preferences` | **MERGE / RETIRE** | Profile JSONB payload | Embedded |
| **Import & Audit** | `import_batches`, `import_rows`, `audit_log` | `import_batches`, `import_records`, `audit_events` | **MODIFY** | Workspace-scoped, manager-auditable | `import_batches.legacy_id` |
| **Sessions** | `sessions` | None (Supabase Auth native) | **RETIRE** | N/A (Sessions reset at cutover) | N/A |

---

## 2. Definitive 13-Stage Legacy State Decomposition

Legacy JobQuest 1.0 merged current pipeline stage, terminal status, rejection, voluntary withdrawal, ghosting, and employer cancellation into a single string column `applications.stage`. JobQuest 2.0 cleanly decouples these into `(stage, state, outcome, closure_reason)`:

| # | Legacy Stage String | Target `stage` | Target `state` | Target `outcome` | Target `closure_reason` | Initial Event Backfilled | Rule Notes |
|:---:|:---|:---|:---|:---|:---|:---|:---|
| 1 | `Saved` | `BOOKMARK` | `OPEN` | `NULL` | `NULL` | `CAPTURED` | Bookmark stage; no applied date required. |
| 2 | `Preparing` | `BOOKMARK` | `OPEN` | `NULL` | `NULL` | `CREATED` | Draft in progress; bookmark stage. |
| 3 | `Applied` | `APPLIED` | `OPEN` | `NULL` | `NULL` | `APPLIED` | Submission confirmed; `date_applied` populated. |
| 4 | `Assessment` | `SCREENING` | `OPEN` | `NULL` | `NULL` | `STAGE_CHANGED` | Assessment sub-stage preserved in event payload. |
| 5 | `Recruiter Screen`| `SCREENING` | `OPEN` | `NULL` | `NULL` | `STAGE_CHANGED` | Screening phone/video call. |
| 6 | `Interview` | `INTERVIEWING`| `OPEN` | `NULL` | `NULL` | `STAGE_CHANGED` | Core interview process. |
| 7 | `Final Interview` | `INTERVIEWING`| `OPEN` | `NULL` | `NULL` | `STAGE_CHANGED` | Final round; sub-stage preserved in event. |
| 8 | `Offer` | `OFFER` | `OPEN` | `NULL` | `NULL` | `STAGE_CHANGED` | Active offer received and pending candidate response. |
| 9 | `Accepted` | `OFFER` | `CLOSED` | `ACCEPTED` | `NULL` | `OUTCOME_CHANGED` | Candidate accepted offer; terminal success. |
| 10 | `Rejected` | *Last Stage* | `CLOSED` | `REJECTED` | `NULL` | `OUTCOME_CHANGED` | Rejection by employer. Stage preserved from history or defaults to `APPLIED`. |
| 11 | `Withdrawn` | *Last Stage* | `CLOSED` | `WITHDRAWN` | `CANDIDATE_WITHDREW` | `OUTCOME_CHANGED` | Voluntary withdrawal. If offer was declined, `closure_reason = OFFER_DECLINED`. |
| 12 | `Ghosted` | *Last Stage* | `CLOSED` | `GHOSTED` | `NULL` | `OUTCOME_CHANGED` | Employer ceased communication after active contact. |
| 13 | `Position Closed`| *Last Stage* | `CLOSED` | `POSITION_CLOSED` | `NULL` | `OUTCOME_CHANGED` | Employer cancelled the requisition/headcount. |

---

## 3. Detailed Field Transformation Specifications

### 3.1 Users & Authentication (`users` $\rightarrow$ `user_accounts`, `profiles`, `workspaces`, `legacy_claim_codes`)

* **Legacy Source:** `users` (`id`, `full_name`, `email`, `pin_hash`, `role`, `is_active`, `created_at`, `updated_at`)
* **Transform Rules:**
  1. Generate UUID `user_id = gen_random_uuid()` deterministically or via mapping table.
  2. Insert into `public.user_accounts` (or `auth.users` in Option B): `id = user_id`, `email = LOWER(TRIM(source.email))`.
  3. Insert into `public.profiles`:
     - `id = user_id`
     - `full_name = source.full_name`
     - `role = CASE WHEN source.role = 'manager' THEN 'MANAGER' ELSE 'USER' END`
     - `legacy_user_id = source.id`
     - `created_at = source.created_at::TIMESTAMPTZ`
  4. **PIN Retirement & Claim Codes:**
     - Generate single-use, cryptographically secure 32-character claim token.
     - Insert into `public.legacy_claim_codes`:
       - `user_id = user_id`
       - `claim_code_hash = SHA256(claim_token)`
       - `expires_at = NOW() + INTERVAL '90 days'`
       - `claimed_at = NULL`
     - **DO NOT MIGRATE `pin_hash` AS PASSWORD.**

### 3.2 Applications & Job Snapshots (`applications` $\rightarrow$ `applications`, `job_snapshots`)

* **Legacy Source:** `applications` (44 columns)
* **Transform Rules:**
  1. Assign `workspace_id = '018f0000-0000-4000-8000-000000000001'` (`"JobQuest (Migrated)"`).
  2. Resolve `user_id` from `profiles.legacy_user_id = source.user_id`.
  3. Decompose `source.stage` into `(target.stage, target.state, target.outcome, target.closure_reason)` per Section 2.
  4. Populate `applications`:
     - `id = gen_random_uuid()`
     - `legacy_id = source.id`
     - `company_name = source.company`
     - `job_title = source.job_title`
     - `date_applied = source.date_applied`
     - `salary_min = source.salary_min`, `salary_max = source.salary_max`, `salary_currency = COALESCE(source.salary_currency, 'USD')`
     - `employment_type = UPPER(source.employment_type)`
     - `work_mode = UPPER(source.work_mode)`
     - `location = source.location`
     - `priority = UPPER(source.priority)`
     - `job_url = source.job_url`
     - `created_at = source.created_at::TIMESTAMPTZ`, `updated_at = source.updated_at::TIMESTAMPTZ`
  5. If `source.job_description` is non-empty:
     - Insert into `public.job_snapshots`:
       - `id = gen_random_uuid()`
       - `application_id = target_application_id`
       - `workspace_id = target_workspace_id`
       - `description_raw = source.job_description`
       - `source_url = source.job_url`
       - `created_at = source.created_at::TIMESTAMPTZ`

### 3.3 Historical Event Backfill (`activities`, `timeline_events`, `stage_history` $\rightarrow$ `application_events`)

* **Transform Rules:**
  1. Unify legacy activity logs, timeline events, and stage transitions.
  2. Deduplicate overlapping records based on `(application_id, created_at, event_type)`.
  3. Insert into `public.application_events`:
     - `id = gen_random_uuid()`
     - `application_id = mapped_application_id`
     - `workspace_id = target_workspace_id`
     - `user_id = mapped_user_id`
     - `event_type = UPPER(mapped_event_type)`
     - `from_stage = mapped_from_stage`, `to_stage = mapped_to_stage`
     - `notes = source.note / source.description`
     - `created_at = source.created_at::TIMESTAMPTZ`

### 3.4 Notes $\rightarrow$ Journal Entries (`notes` $\rightarrow$ `journal_entries`)

* **Legacy Source:** `notes` (`id`, `user_id`, `application_id`, `title`, `body`, `note_type`, `entry_date`, `pinned`, `created_at`, `updated_at`)
* **Transform Rules:**
  - `id = gen_random_uuid()`
  - `legacy_id = source.id`
  - `workspace_id = target_workspace_id`
  - `user_id = mapped_user_id`
  - `application_id = mapped_application_id (NULL if no link)`
  - `title = COALESCE(source.title, 'Untitled Note')`
  - `content_markdown = source.body`
  - `entry_type = CASE source.note_type WHEN 'daily_journal' THEN 'DAILY_JOURNAL' WHEN 'interview' THEN 'INTERVIEW_PREP' WHEN 'company_research' THEN 'COMPANY_RESEARCH' WHEN 'reflection' THEN 'WEEKLY_REFLECTION' ELSE 'GENERAL' END`
  - `is_pinned = (source.pinned = 1)`
  - `created_at = source.created_at::TIMESTAMPTZ`, `updated_at = source.updated_at::TIMESTAMPTZ`

### 3.5 Tasks & Reminders (`tasks`, `reminders`, `follow_ups`, `checklist_items` $\rightarrow$ `tasks`)

* **Transform Rules:**
  - Consolidate all legacy task-like entities into unified `tasks` table.
  - Set `task_type`:
    - From `tasks` $\rightarrow$ `'TASK'`
    - From `reminders` $\rightarrow$ `'REMINDER'`
    - From `follow_ups` $\rightarrow$ `'FOLLOW_UP'`
    - From `checklist_items` $\rightarrow$ `'CHECKLIST'`
  - Status mapping: `'open'` / `'Due'` / `'Upcoming'` $\rightarrow$ `'OPEN'`; `'completed'` / `'Completed'` $\rightarrow$ `'COMPLETED'`.
  - Recurrence: normalize `'daily'`, `'weekdays'`, `'weekly'`, `'monthly'`.

### 3.6 Habits & Habit Logs (`habits`, `habit_logs` $\rightarrow$ `habits`, `habit_logs`)

* **Transform Rules:**
  - `habits`: `id = gen_random_uuid()`, `legacy_id = source.id`, `workspace_id = target_workspace_id`, `user_id = mapped_user_id`, `title = source.name`, `frequency = UPPER(source.frequency)`, `target_count = source.target_count`, `is_active = (source.active = 1)`.
  - `habit_logs`: `id = gen_random_uuid()`, `habit_id = mapped_habit_id`, `workspace_id = target_workspace_id`, `user_id = mapped_user_id`, `log_date = source.completion_date`, `count_value = source.value`.

### 3.7 Contacts & Interviews (`networking_contacts`, `interviews` $\rightarrow$ `contacts`, `interviews`)

* **Contacts:** `id = gen_random_uuid()`, `legacy_id = source.id`, `name = source.contact_name`, `company = source.company`, `job_title = source.job_title`, `email = source.email`, `phone = source.phone`, `linkedin_url = source.linkedin_url`.
* **Interviews:** `id = gen_random_uuid()`, `legacy_id = source.id`, `application_id = mapped_application_id`, `scheduled_at = source.scheduled_at::TIMESTAMPTZ`, `round_name = source.interview_round`, `interview_type = source.interview_type`, `meeting_link = source.meeting_link`, `notes = source.notes`.
