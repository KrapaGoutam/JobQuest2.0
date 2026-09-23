# Migrations

Full column-level detail: `../docs/BACKEND_SCHEMA.md`. This is the ordered index.

| # | File | Summary |
|---|---|---|
| 001 | `001_jobsearch.sql` | Initial schema: `users`, `applications`, `activities`, `interviews`, `rejections`, `networking_contacts`, `follow_ups`, `daily_goals`, `weekly_goals`, `import_batches`, `import_rows`, `audit_log` |
| 002 | `002_sessions.sql` | `sessions` table |
| 003 | `003_complete_manager.sql` | User preference columns; application flags (`resume_id`, `pinned`, `important`, `favorite`, `archived_at`); `timeline_events`, `stage_history`, `resumes`, `reminder_categories` (+11 seed rows), `reminders`, `goal_settings`, `goal_snapshots`, `dashboard_preferences`, `saved_views`, `tags`, `application_tags`, `checklist_items`; data backfills |
| 004 | `004_followup_completion.sql` | `follow_ups.suggested_date`/`completed_at` + index |
| 005 | `005_four_digit_pin.sql` | `users.pin_hash`, `users.auth_method` |
| 006 | `006_feature_upgrade_one.sql` | View/navigation preferences; `applications.board_order`; resume revision columns; `resume_history`; `application_view_preferences`; `export_preferences` |
| 007 | `007_feature_ui_upgrade_1_1.sql` | Kanban grouping/density/pagination preferences; `users.dashboard_visualization_json` |
| 008 | `008_manual_application_resume_version.sql` | Data-only backfill (legacy resume name → `resume_version`) |
| 009 | `009_task_management.sql` | `tasks` (net-new domain) |
| 010 | `010_habit_tracker.sql` | `habits`, `habit_logs` (net-new domain) |
| 011 | `011_journal_notes.sql` | `notes` (net-new domain) |
| 012 | `012_final_performance_indexes.sql` | `idx_import_rows_batch_row` (index only, no schema change) |
| 013 | `013_extension_tokens.sql` | `extension_tokens` (browser extension auth) |

All 13 are additive/forward-only — no destructive `ALTER`/`DROP` in any file
(confirmed by direct read). Applied via `backend/src/postgres-migrate.js` in
production (`npm run migrate:postgres`), and via `backend/src/migrate.js` for
the fast SQLite-based `migrate:check` CI validation.
