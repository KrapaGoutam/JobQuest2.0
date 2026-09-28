# M15-C Export Manifest: Real Legacy Neon Production Export

**Milestone:** M15-C (Legacy Neon Backup, Read-Only Export, Real-Schema Reconciliation & Production Migration Pre-Flight)  
**Export Date:** `2026-09-28T11:05:00-05:00`  
**Storage Location:** Secure external directory (outside Git trees)  
**Status:** **EXPORTED, HASH-VERIFIED & INTEGRITY-TESTED**

---

## 1. Export File Specifications

| Attribute | Value | Verification Notes |
| :--- | :--- | :--- |
| **Filename** | `legacy_neon_export_20260928_110500.json` | Timestamped, isolated filename |
| **Directory** | `C:\Users\krapa\Documents\Job Search\JobTrackerProjects\_secure-backups\jobquest1\20260928_110500\` | Strictly outside JQ1 and JQ2 repos |
| **Format** | UTF-8 Formatted JSON (`JSON.stringify(..., null, 2)`) | Direct ingestion compatible |
| **File Size** | `1,819,301` bytes (~1.82 MB) | Uncompressed |
| **SHA-256 Checksum** | `4fa64c13413d2175b74a74461c3ac4418dbdc2a790c9763599bcbd074f1c9afc` | Crytographic integrity hash |
| **Source Database** | Neon Serverless PostgreSQL | PostgreSQL 18.6 (6569466) |
| **Source Schema** | Migration `013_extension_tokens.sql` | 13 migrations applied |

---

## 2. Table-by-Table Row Count Manifest

The exported JSON file contains top-level array keys for each legacy database table. Every row matches the restored database 100%:

| Top-Level JSON Key | Source Table | Exported Object Count | Migration Disposition |
| :--- | :--- | :-: | :--- |
| `users` | `users` | 1 | `MIGRATED_DIRECT` (Identity & Profiles) |
| `applications` | `applications` | 222 | `MIGRATED_DIRECT` (Applications Domain) |
| `tags` | `tags` | 49 | `MIGRATED_DIRECT` (Consolidated into array) |
| `application_tags` | `application_tags` | 158 | `MIGRATED_DIRECT` (Consolidated into array) |
| `activities` | `activities` | 226 | `MIGRATED_DIRECT` (Application Events) |
| `timeline_events` | `timeline_events` | 226 | `MIGRATED_DIRECT` (Application Events) |
| `stage_history` | `stage_history` | 224 | `MIGRATED_DIRECT` (Application Events) |
| `dashboard_preferences` | `dashboard_preferences` | 29 | `MIGRATED_DIRECT` (UI Preferences JSONB) |
| `application_view_preferences` | `application_view_preferences` | 1 | `MIGRATED_DIRECT` (UI Preferences JSONB) |
| `checklist_items` | `checklist_items` | 2,442 | `SUPERSEDED_BY_JQ2` (Intentionally Excluded) |
| `import_batches` | `import_batches` | 21 | `SUPERSEDED_BY_JQ2` (Excluded) |
| `import_rows` | `import_rows` | 218 | `SUPERSEDED_BY_JQ2` (Excluded) |
| `reminder_categories` | `reminder_categories` | 11 | `SUPERSEDED_BY_JQ2` (Excluded) |
| `audit_log` | `audit_log` | 2 | `OBSOLETE_SECURITY` (Excluded) |
| `sessions` | `sessions` | 2 | `OBSOLETE_SECURITY` (Excluded) |
| `extension_tokens` | `extension_tokens` | 2 | `OBSOLETE_SECURITY` (Excluded) |
| `daily_goals` | `daily_goals` | 0 | Empty Array `[]` |
| `export_preferences` | `export_preferences` | 0 | Empty Array `[]` |
| `follow_ups` | `follow_ups` | 0 | Empty Array `[]` |
| `goal_settings` | `goal_settings` | 0 | Empty Array `[]` |
| `goal_snapshots` | `goal_snapshots` | 0 | Empty Array `[]` |
| `habit_logs` | `habit_logs` | 0 | Empty Array `[]` |
| `habits` | `habits` | 0 | Empty Array `[]` |
| `interviews` | `interviews` | 0 | Empty Array `[]` |
| `networking_contacts` | `networking_contacts` | 0 | Empty Array `[]` |
| `notes` | `notes` | 0 | Empty Array `[]` |
| `rejections` | `rejections` | 0 | Empty Array `[]` |
| `reminders` | `reminders` | 0 | Empty Array `[]` |
| `resume_history` | `resume_history` | 0 | Empty Array `[]` |
| `resumes` | `resumes` | 0 | Empty Array `[]` |
| `saved_views` | `saved_views` | 0 | Empty Array `[]` |
| `tasks` | `tasks` | 0 | Empty Array `[]` |
| `weekly_goals` | `weekly_goals` | 0 | Empty Array `[]` |

---

## 3. Structural & Integrity Validation

1. **JSON Parser Validation:** The file was parsed using `JSON.parse()` without syntax errors.
2. **Schema Verification:** All expected fields (`company`, `position`, `stage`, `job_description`, `username`, etc.) are present and properly typed.
3. **Rehearsal Validation:** Ingested directly into the M15-C integration test suite (`tests/integration/m15c-real-data-rehearsal.test.ts`), executing dry-run and live rehearsal without errors.
4. **Git Protection:** Confirmed that neither this export nor any partial export is committed to Git or present within the workspace directory tree.
