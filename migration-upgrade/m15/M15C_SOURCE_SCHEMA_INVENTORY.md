# M15-C Source Schema Inventory: Legacy Neon

**Milestone:** M15-C (Legacy Neon Backup, Read-Only Export, Real-Schema Reconciliation & Production Migration Pre-Flight)  
**Database Engine:** PostgreSQL 18.6 (6569466)  
**Migration Head:** `013_extension_tokens.sql` (13 applied migrations)  
**Total Tables:** 34  
**Total Constraints:** 34 PKs, 62 FKs, 16 Unique Constraints, 89 Indexes  

---

## 1. Schema Migration History (`schema_migrations`)

The legacy Neon database recorded exactly 13 schema migration scripts applied between August 3, 2026 and September 21, 2026:

| # | Migration File | Applied At (UTC) | Scope & Purpose |
| :-: | :--- | :--- | :--- |
| 1 | `001_jobsearch.sql` | 2026-08-03 22:25:22.581 | Initial core tables (`users`, `applications`, `tags`, `activities`) |
| 2 | `002_sessions.sql` | 2026-08-03 22:25:22.705 | Session state tracking |
| 3 | `003_complete_manager.sql` | 2026-08-03 22:25:22.718 | Managerial & interview workflow tables |
| 4 | `004_followup_completion.sql` | 2026-08-03 22:25:22.823 | Follow-up and reminder completion timestamps |
| 5 | `005_four_digit_pin.sql` | 2026-08-03 22:25:22.832 | 4-digit PIN authentication support |
| 6 | `006_feature_upgrade_one.sql` | 2026-08-04 00:32:17.025 | Checklist items, contacts, goals, and notes |
| 7 | `007_feature_ui_upgrade_1_1.sql` | 2026-08-04 02:37:16.078 | UI preferences and stage history tracking |
| 8 | `008_manual_application_resume_version.sql` | 2026-08-04 03:07:29.597 | Resume version tagging on applications |
| 9 | `009_task_management.sql` | 2026-09-18 13:20:10.831 | Task management domain tables |
| 10 | `010_habit_tracker.sql` | 2026-09-18 13:20:10.956 | Habit tracking domain tables |
| 11 | `011_journal_notes.sql` | 2026-09-18 13:20:10.991 | Journaling and rich notes tables |
| 12 | `012_final_performance_indexes.sql` | 2026-09-18 13:20:11.015 | Composite and search indexes |
| 13 | `013_extension_tokens.sql` | 2026-09-21 17:45:05.280 | Chrome Extension auth tokens |

---

## 2. Table-by-Table Inventory & Row Counts

| Category | Table Name | Row Count | Primary Key | Critical Foreign Keys |
| :--- | :--- | :-: | :--- | :--- |
| **Auth & Users** | `users` | 1 | `id` (INTEGER) | None |
| | `sessions` | 2 | `id` (INTEGER) | `user_id → users(id)` |
| | `extension_tokens` | 2 | `id` (INTEGER) | `user_id → users(id)` |
| | `audit_log` | 2 | `id` (INTEGER) | `user_id → users(id)` |
| **Applications Core** | `applications` | 222 | `id` (INTEGER) | `user_id → users(id)` |
| | `checklist_items` | 2,442 | `id` (INTEGER) | `application_id → applications(id)` |
| | `tags` | 49 | `id` (INTEGER) | `user_id → users(id)` |
| | `application_tags` | 158 | `(application_id, tag_id)` | `app_id → apps, tag_id → tags` |
| | `activities` | 226 | `id` (INTEGER) | `application_id → applications(id)` |
| | `timeline_events` | 226 | `id` (INTEGER) | `application_id → applications(id)` |
| | `stage_history` | 224 | `id` (INTEGER) | `application_id → applications(id)` |
| **Preferences & View** | `dashboard_preferences` | 29 | `id` (INTEGER) | `user_id → users(id)` |
| | `application_view_preferences` | 1 | `id` (INTEGER) | `user_id → users(id)` |
| **Bulk Import** | `import_batches` | 21 | `id` (INTEGER) | `user_id → users(id)` |
| | `import_rows` | 218 | `id` (INTEGER) | `batch_id → import_batches(id)` |
| **Reminders Meta** | `reminder_categories` | 11 | `id` (INTEGER) | `user_id → users(id)` |
| **Empty Domain Tables** | `daily_goals` | 0 | `id` | `user_id → users(id)` |
| | `export_preferences` | 0 | `id` | `user_id → users(id)` |
| | `follow_ups` | 0 | `id` | `application_id → applications(id)` |
| | `goal_settings` | 0 | `id` | `user_id → users(id)` |
| | `goal_snapshots` | 0 | `id` | `user_id → users(id)` |
| | `habit_logs` | 0 | `id` | `habit_id → habits(id)` |
| | `habits` | 0 | `id` | `user_id → users(id)` |
| | `interviews` | 0 | `id` | `application_id → applications(id)` |
| | `networking_contacts` | 0 | `id` | `user_id → users(id)` |
| | `notes` | 0 | `id` | `application_id → applications(id)` |
| | `rejections` | 0 | `id` | `application_id → applications(id)` |
| | `reminders` | 0 | `id` | `user_id → users(id)` |
| | `resume_history` | 0 | `id` | `user_id → users(id)` |
| | `resumes` | 0 | `id` | `user_id → users(id)` |
| | `saved_views` | 0 | `id` | `user_id → users(id)` |
| | `tasks` | 0 | `id` | `user_id → users(id)` |
| | `weekly_goals` | 0 | `id` | `user_id → users(id)` |

---

## 3. Populated Table Schemas & Column Details

### 3.1 `users` (1 row)
- `id` (integer, PK)
- `username` (varchar(50), NOT NULL) — Value: `'jack'`
- `email` (varchar(255), NULL) — Value: `NULL`
- `password_hash` (varchar(255), NOT NULL) — Argon2/bcrypt hash (NOT MIGRATED)
- `pin_hash` (varchar(255), NULL) — 4-digit PIN hash (NOT MIGRATED per Invariant 5)
- `role` (varchar(20), NOT NULL) — Value: `'MANAGER'` (Uppercase)
- `is_active` (boolean, DEFAULT true) — Value: `true`
- `created_at` (timestamptz) — `2026-08-03 22:45:55.302561+00`
- `updated_at` (timestamptz) — `2026-09-03 01:08:35.061961+00`
- `theme_preference` (varchar(20), DEFAULT 'light') — Value: `'dark'`
- `week_start` (integer, DEFAULT 1) — Value: `1` (Monday)

### 3.2 `applications` (222 rows)
- `id` (integer, PK)
- `user_id` (integer, FK to users)
- `company` (varchar(255), NOT NULL)
- `position` (varchar(255), NOT NULL)
- `location` (varchar(255), NULL)
- `job_url` (text, NULL)
- `stage` (varchar(50), NOT NULL) — Values: `'Applied'` (151), `'Saved'` (37), `'Withdrawn'` (27), `'Rejected'` (7)
- `date_applied` (date, NULL) — Formats: `YYYY-MM-DD`
- `priority` (varchar(20), DEFAULT 'medium') — Values: `'low'`, `'medium'`, `'high'`
- `notes` (text, NULL)
- `salary_min` (numeric, NULL)
- `salary_max` (numeric, NULL)
- `salary_currency` (varchar(10), DEFAULT 'USD')
- `salary_period` (varchar(20), DEFAULT 'yearly')
- `salary_range` (varchar(100), NULL) — Formatted text string when min/max absent
- `work_arrangement` (varchar(50), NULL) — Values: `'Remote'`, `'Hybrid'`, `NULL`
- `employment_type` (varchar(50), NULL) — Values: `'Internship'` (36), `'Full-time'` (5), `'Contract'` (3), `'Part-time'` (2), `NULL` (176)
- `job_description` (text, NULL) — 89 rows contain rich job description text
- `archived` (boolean, DEFAULT false)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### 3.3 `checklist_items` (2,442 rows)
- `id` (integer, PK)
- `application_id` (integer, FK to applications)
- `text` (varchar(255), NOT NULL)
- `completed` (integer/boolean, DEFAULT 0) — **All 2,442 rows have `completed = 0`**
- Structure: Exactly 11 boilerplate default template items per application across 222 applications.

### 3.4 `tags` (49 rows) & `application_tags` (158 rows)
- `tags`: `id` (PK), `user_id` (FK), `name` (varchar(50)), `color` (varchar(20))
- `application_tags`: `application_id` (PK, FK), `tag_id` (PK, FK)
- Tag `#97` has name `'Internship'` with 36 applications tagged.

### 3.5 `activities` (226 rows) & `timeline_events` (226 rows)
- `activities`: `id`, `application_id`, `activity_type`, `description`, `created_at`
- `timeline_events`: `id`, `application_id`, `event_type`, `title`, `description`, `event_date`, `created_at`
- Represents legacy lifecycle events: 222 application creations, 2 stage changes, 2 updates.

### 3.6 `stage_history` (224 rows)
- `id`, `application_id`, `from_stage`, `to_stage`, `changed_at`
- Contains transition history: 151 to Applied, 37 to Saved, 27 to Withdrawn, 7 to Rejected, 2 bidirectional transitions (Applied ↔ Assessment).

---

## 4. Key Structural Observations

1. **User Identity:** Legacy user does not have an email address populated (`email: NULL`). The unique handle is `username: 'jack'`. Role is stored as uppercase `'MANAGER'`.
2. **Application Status vs Stage:** Legacy applications store progression in a single `stage` column (`'Applied'`, `'Saved'`, `'Withdrawn'`, `'Rejected'`). There is no separate `status` or `outcome` column.
3. **Internship Employment Type:** 36 applications have `employment_type = 'Internship'`. The target JobQuest 2.0 schema restricts `employment_type` via check constraint to `('Full-time', 'Contract', 'Part-time')`. These 36 records already possess the `'Internship'` tag in `application_tags`.
4. **Boilerplate Checklists:** All 2,442 checklist items are uncompleted boilerplate template items (`completed = 0`).
5. **No Domain Data in 17 Tables:** Interviews, contacts, notes, tasks, habits, and resumes were unused in this legacy instance.
