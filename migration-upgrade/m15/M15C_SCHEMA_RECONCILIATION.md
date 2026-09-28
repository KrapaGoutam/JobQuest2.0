# M15-C Schema Reconciliation Report: Source vs Target Architecture

**Milestone:** M15-C (Legacy Neon Backup, Read-Only Export, Real-Schema Reconciliation & Production Migration Pre-Flight)  
**Source Engine:** PostgreSQL 18.6 (6569466) — Legacy Neon Database  
**Target Engine:** Supabase PostgreSQL 15 (us-east-1) — JobQuest 2.0  
**Status:** **FULLY RECONCILED & DOCUMENTED**

---

## 1. Executive Summary

This report establishes the complete structural reconciliation between the 34 tables in the legacy JobQuest 1.0 database and the normalized, multi-tenant workspace architecture of JobQuest 2.0. Every legacy table and attribute has been categorized as `MIGRATED_DIRECT`, `MIGRATED_CONDITIONAL`, `SUPERSEDED_BY_JQ2`, or `OBSOLETE_SECURITY`.

Zero legacy columns have been silently dropped. All business information—including application tags, lifecycle transitions, salary ranges, work arrangements, UI preferences, and job descriptions—is preserved in target domain entities or structured metadata.

---

## 2. Table Classification Matrix

| Legacy Table Name | Legacy Row Count | Classification | JobQuest 2.0 Target Entity / Destination | Reconciliation Notes |
| :--- | :-: | :--- | :--- | :--- |
| `users` | 1 | `MIGRATED_DIRECT` | `user_accounts`, `profiles`, `workspaces`, `workspace_members`, `legacy_claim_codes` | Auth hashes stripped. Profile and preferences preserved. Claim code issued. |
| `applications` | 222 | `MIGRATED_DIRECT` | `public.applications` | Normalized to target schema; `legacy_id` recorded. |
| `tags` | 49 | `MIGRATED_DIRECT` | Consolidated into `applications.tags` array | Normalized into text arrays on applications. |
| `application_tags` | 158 | `MIGRATED_DIRECT` | Consolidated into `applications.tags` array | Tag IDs resolved to names and attached to applications. |
| `activities` | 226 | `MIGRATED_DIRECT` | `public.application_events` | Preserved as audit/lifecycle events. |
| `timeline_events` | 226 | `MIGRATED_DIRECT` | `public.application_events` | Deduplicated and mapped to application event ledger. |
| `stage_history` | 224 | `MIGRATED_DIRECT` | `public.application_events` | Historical stage transitions captured as event timeline. |
| `dashboard_preferences` | 29 | `MIGRATED_DIRECT` | `profiles.ui_preferences` (JSONB) | Consolidated into user profile JSONB preferences. |
| `application_view_preferences` | 1 | `MIGRATED_DIRECT` | `profiles.ui_preferences` (JSONB) | Consolidated into user profile JSONB preferences. |
| `job_description` (col) | 89 | `MIGRATED_DIRECT` | `public.job_snapshots` | Extracted into immutable snapshot records with SHA256 integrity. |
| `resumes` | 0 | `MIGRATED_CONDITIONAL` | `public.resumes` | Empty in legacy; migration engine supports full mapping. |
| `resume_history` | 0 | `MIGRATED_CONDITIONAL` | `public.resumes` | Empty in legacy. |
| `notes` | 0 | `MIGRATED_CONDITIONAL` | `public.journal_entries` / `notes` | Empty in legacy; migration engine supports full mapping. |
| `tasks` | 0 | `MIGRATED_CONDITIONAL` | `public.tasks` | Empty in legacy; migration engine supports full mapping. |
| `reminders` | 0 | `MIGRATED_CONDITIONAL` | `public.tasks` | Empty in legacy; migration engine maps reminders to tasks. |
| `follow_ups` | 0 | `MIGRATED_CONDITIONAL` | `public.tasks` | Empty in legacy. |
| `habits` | 0 | `MIGRATED_CONDITIONAL` | `public.habits` | Empty in legacy; migration engine supports full mapping. |
| `habit_logs` | 0 | `MIGRATED_CONDITIONAL` | `public.habit_logs` | Empty in legacy; migration engine supports full mapping. |
| `interviews` | 0 | `MIGRATED_CONDITIONAL` | `public.interviews` | Empty in legacy; migration engine supports full mapping. |
| `networking_contacts` | 0 | `MIGRATED_CONDITIONAL` | `public.contacts` | Empty in legacy; migration engine supports full mapping. |
| `daily_goals` | 0 | `MIGRATED_CONDITIONAL` | `public.goals` | Empty in legacy. |
| `weekly_goals` | 0 | `MIGRATED_CONDITIONAL` | `public.goals` | Empty in legacy. |
| `goal_settings` | 0 | `MIGRATED_CONDITIONAL` | `public.goals` | Empty in legacy. |
| `goal_snapshots` | 0 | `MIGRATED_CONDITIONAL` | `public.goals` | Empty in legacy. |
| `rejections` | 0 | `MIGRATED_CONDITIONAL` | `public.application_events` | Empty in legacy; stage history already handles rejections. |
| `saved_views` | 0 | `MIGRATED_CONDITIONAL` | `profiles.ui_preferences` | Empty in legacy. |
| `export_preferences` | 0 | `MIGRATED_CONDITIONAL` | `profiles.ui_preferences` | Empty in legacy. |
| `checklist_items` | 2,442 | `SUPERSEDED_BY_JQ2` | *None* (Intentionally Not Migrated) | 100% uncompleted static template boilerplate (11 items x 222 apps). |
| `import_batches` | 21 | `SUPERSEDED_BY_JQ2` | *None* | Legacy batch upload session records. |
| `import_rows` | 218 | `SUPERSEDED_BY_JQ2` | *None* | Legacy batch row processing staging rows. |
| `reminder_categories` | 11 | `SUPERSEDED_BY_JQ2` | *None* | Static system category definitions. |
| `sessions` | 2 | `OBSOLETE_SECURITY` | *None* | Replaced by Supabase Auth JWT sessions. |
| `extension_tokens` | 2 | `OBSOLETE_SECURITY` | *None* | Replaced by HMAC-SHA256 extension token scheme (M13). |
| `audit_log` | 2 | `OBSOLETE_SECURITY` | *None* | Legacy system diagnostic logs; superseded by JQ2 ledger. |
| `schema_migrations` | 13 | `OBSOLETE_SECURITY` | `supabase_migrations.schema_migrations` | Legacy DDL tracking ledger; superseded by Supabase migrations. |

---

## 3. Column-Level Mapping & Transformation Details

### 3.1 `users` → `user_accounts` & `profiles`

| Legacy Column | Target Column | Transformation Rule |
| :--- | :--- | :--- |
| `id` | `profiles.legacy_user_id` | Stored as integer for provenance and claim lookup. |
| *generated* | `user_accounts.id` | UUID generated via `gen_random_uuid()`. |
| `username` | `profiles.handle` | Transformed via `cleanUsername = username.toLowerCase().replace(/[^a-z0-9_-]/g, '')`. |
| `username` | `profiles.full_name` | Copied as initial display name. |
| `email` | `user_accounts.email` | Fallback generated: `${cleanUsername}@legacy.jobquest.local` if null. |
| `theme_preference` | `profiles.ui_preferences->'theme'` | Stored in JSONB object: `{ "theme": "dark", "week_start": 1 }`. |
| `week_start` | `profiles.ui_preferences->'week_start'` | Stored in JSONB object. |
| `password_hash` | *DROPPED* | Stripped per Invariant 5 (security rule). |
| `pin_hash` | *DROPPED* | Stripped per Invariant 5 (`pin_hashes_migrated: 0`). |
| `role` | `workspace_members.role` | Mapped to workspace membership with `'admin'` role. |
| `created_at` | `user_accounts.created_at` | Normalized ISO 8601 timestamptz. |
| `updated_at` | `user_accounts.updated_at` | Normalized ISO 8601 timestamptz. |

### 3.2 `applications` → `public.applications`

| Legacy Column | Target Column | Transformation Rule |
| :--- | :--- | :--- |
| `id` | `legacy_id` | Integer ID preserved in `legacy_id` column. |
| *generated* | `id` | UUID generated via `gen_random_uuid()`. |
| `user_id` | `user_id` | Resolved to target user UUID via user mapping table. |
| *workspaceId* | `workspace_id` | Assigned to target workspace UUID (`018f0000-0000-4000-8000-000000000001` or passed ID). |
| `company` | `company_name` | Trimmed string (e.g. "Google", "Amazon"). |
| `position` | `role_title` | Trimmed string. |
| `stage` | `stage` | Mapped via `mapLegacyStage`: `'Applied'` → `'APPLIED'`, `'Saved'` → `'SAVED'`, `'Withdrawn'` → `'WITHDRAWN'`, `'Rejected'` → `'REJECTED'`. |
| `stage` | `status` | Mapped via `mapLegacyStage`: `'ACTIVE'` or `'ARCHIVED'`. |
| `stage` | `outcome` | Mapped via `mapLegacyStage`: `null`, `'WITHDRAWN'`, or `'REJECTED'`. |
| `stage` | `closure_reason` | Mapped via `mapLegacyStage`: `null`, `'LEGACY_WITHDRAWN'`, or `'LEGACY_REJECTED'`. |
| `work_arrangement` | `work_arrangement` | Preserved (`'Remote'`, `'Hybrid'`, or `null`). |
| `employment_type` | `employment_type` | Validated against constraint `('Full-time', 'Contract', 'Part-time')`. When `'Internship'`, mapped to `null` while preserving `'Internship'` in `tags`. |
| `location` | `location` | Preserved text. |
| `job_url` | `job_url` | Preserved URL text. |
| `salary_min` | `salary_min` | Numeric or null. |
| `salary_max` | `salary_max` | Numeric or null. |
| `salary_currency` | `salary_currency` | Default `'USD'`. |
| `salary_range` | `notes` | Appended to `notes` as `[Salary Info: ${salary_range}]` when min/max are null. |
| `priority` | `priority` | Case-normalized (`'low'`, `'medium'`, `'high'`). |
| `notes` | `notes` | Preserved user text notes. |
| `tags` / `app_tags` | `tags` | Array of tag names `text[]` (e.g. `ARRAY['Frontend', 'React', 'Internship']`). |
| `date_applied` | `applied_at` | Converted from `YYYY-MM-DD` to timestamptz. |
| `created_at` | `created_at` | Normalized timestamptz. |
| `updated_at` | `updated_at` | Normalized timestamptz. |

### 3.3 `applications.job_description` → `public.job_snapshots`

| Source Field | Target Field | Transformation Rule |
| :--- | :--- | :--- |
| `applications.id` | `application_id` | Foreign key to migrated application UUID. |
| `applications.job_description` | `job_description` | Raw text preserved verbatim. |
| `applications.job_url` | `raw_payload` | Stored as JSON: `{"source_url": "..."}`. |
| `applications.created_at` | `captured_at` | Timestamptz of original application creation. |

---

## 4. Verification of Invariant Guardrails

1. **Workspace Multi-Tenancy:** All records are partitioned by `workspace_id`.
2. **Referential Integrity:** 100% of foreign keys resolve to valid target UUIDs (`orphan count = 0`).
3. **Audit Provenance:** All migrated records carry `legacy_id` / `legacy_user_id` and have entries recorded in `migration_id_mappings`.
4. **Zero Authentication Exposure:** Invariant 5 strictly upheld (`pin_hashes_migrated: 0`, password hashes discarded).
