# API Inventory

CURRENT STATE. Source: direct, full read of `backend/src/server.js`, `service.js`,
`advanced.js`, `feature-upgrade.js`, `tasks.js`, `habits.js`, `notes.js`,
`extension.js`. STATUS: CONFIRMED for every route below (read from source, not
inferred from docs).

## Dispatch order (important for migration correctness)

`server.js` (`createRequestHandler`, ~line 426) tries handlers in this order per
request: inline auth routes → `handleFeatureUpgrade` (feature-upgrade.js:606) →
`handleAdvanced` (advanced.js:615) → `handleTasks` (619) → `handleHabits` (623) →
`handleNotes` (627) → `handleExtension` (631) → inline `/api/applications` CRUD →
inline import routes → inline dashboard/manager routes → inline tracker routes
(interviews/rejections/follow_ups/networking_contacts/daily_goals/weekly_goals) →
404 for unmatched `/api/*` → static file serving.

**Notable overlap — carry this behavior forward deliberately, don't lose it**:
`PATCH /api/applications/:id/stage` is defined in BOTH `feature-upgrade.js:489`
(richer: wraps in a transaction, auto-creates a `rejections` row when stage becomes
"Rejected", writes an `audit_log` entry) and `server.js:671` (thin: just calls
`changeStage`). Because `handleFeatureUpgrade` runs first and always matches this
path/method, **the feature-upgrade.js version always wins** — the `server.js` stage
handler is effectively dead code for this specific route today. A migration should
implement only the richer (transactional, audit-logging, auto-rejection-row)
behavior, and should either delete or explicitly document the dead thin variant
rather than silently reproducing the ambiguity.

## Canonical constants and shared helpers

- **`STAGES`** (canonical workflow stages, single source of truth for both web UI and
  browser extension): `backend/src/service.js` lines 3–17 — `["Saved","Preparing",
  "Applied","Assessment","Recruiter Screen","Interview","Final Interview","Offer",
  "Rejected","Withdrawn","Ghosted","Position Closed","Accepted"]`.
- Also in `service.js`: `PRIORITIES` (line 18), `WORK_ARRANGEMENTS` (19),
  `EMPLOYMENT_TYPES` (20–27), `IMPORT_MODES` (28), `DUPLICATE_ACTIONS` (29),
  `APPLICATION_FIELDS` (31–61, the full allow-list for application create/update).
- **`safeCell()`** (`feature-upgrade.js:358-361`): neutralizes spreadsheet-formula
  injection (CSV/XLSX) by prefixing a leading `=`, `+`, `-`, or `@` with an
  apostrophe. Re-exported into `advanced.js` (line 3) wrapped as `csvEscape()`
  (advanced.js:76-77) and used by every CSV export path.
- Ownership resolution has **two near-duplicate implementations** —
  `targetOwner(db, actor, input)` (writes, `server.js:116`) and `ownerId(actor,
  query)` (reads; separately re-implemented in both `advanced.js:66` and
  `feature-upgrade.js:94`, one non-throwing, one throwing 404 on mismatch). A
  migration should consolidate these into one ownership-resolution function.
- Generic tracker CRUD (interviews/rejections/follow_ups/networking_contacts/
  daily_goals/weekly_goals) derives its writable-field allow-list via `PRAGMA
  table_info` at request time (schema-introspected, not hardcoded per table). A
  typed migration (Express/TypeScript + ORM) will need to make this explicit,
  per-table.

## 1. Auth / Session

| Method | Path | Purpose | Auth | Key Request Fields | Key Response Fields | Tables | Source |
|---|---|---|---|---|---|---|---|
| GET | `/api/health` | Liveness probe | public | — | `{status:"ok"}` | — | server.js:436 |
| GET | `/api/ready` | Readiness probe (DB check) | public | — | `{status:"ready",database:"available"}` | — | server.js:438 |
| POST | `/api/auth/register` | Create user account (username+4-digit PIN) | public | `username, pin, confirm_pin, full_name, email?, phone?` | `{user, csrf_token}` + Set-Cookie `jobquest_session` | users | server.js:442 |
| POST | `/api/auth/login` | Login with username+PIN | public | `username, pin` | `{user, csrf_token}` + Set-Cookie | users, sessions | server.js:502 |
| POST | `/api/auth/transition-pin` | One-time legacy-password→PIN migration | public (requires current_password) | `username, current_password, pin, confirm_pin` | `{user, csrf_token}` + Set-Cookie | users, sessions | server.js:540 |
| POST | `/api/auth/logout` | End session | session+CSRF | — | `{message}` + cookie cleared | sessions | server.js:582 |
| GET | `/api/auth/me` | Current user + CSRF token | session | — | `{user, csrf_token}` | users | server.js:598 |
| GET/PATCH | `/api/settings` | Get/update per-user prefs (theme, week_start, follow-up delays) | session (PATCH+CSRF) | `theme, week_start, first_follow_up_delay, second_follow_up_delay, follow_up_day_type, default_reminder_time, auto_create_follow_up_reminder` | settings object / `{message}` | users | advanced.js:341 |

Auth model: opaque session token (SHA-256 hashed, cookie `jobquest_session`,
HttpOnly/SameSite=Strict, 12h expiry) + a separate CSRF token returned to the client
and required via the `x-csrf-token` header on mutating requests
(`requireAuth(context,{csrf:true})`, server.js:103-114). Lockout: 5 failed attempts
→ 5-minute lock (server.js:33-35, 507-528).

## 2. Applications (CRUD, search/filter/sort, bulk, stage, checklist, tags, saved views)

| Method | Path | Purpose | Auth | Key Request Fields | Key Response Fields | Tables | Source |
|---|---|---|---|---|---|---|---|
| GET | `/api/applications` | List (basic filter/sort/paginate) | session | query: stage, priority, archived, pinned, source, work_arrangement, employment_type, date_from/to, tag_id, search, sort, direction, page, page_size, user_id (manager) | `{items,total,page,page_size,pages}` | applications, users, application_tags, tags, timeline_events | server.js:634 / service.js:536 |
| POST | `/api/applications` | Create application | session+CSRF | company, job_title, date_applied, stage?, priority?, salary_*, job_url, resume_id?, tags[]... | `{id}` or `{errors}` | applications, activities, stage_history, timeline_events, checklist_items, tags | server.js:644 / service.js:414 |
| GET | `/api/applications/:id` | Get one application | session | — | full application row | applications | server.js:680 |
| PATCH | `/api/applications/:id` | Update application fields | session+CSRF | any APPLICATION_FIELDS subset, incl. `stage` (triggers changeStage) | `{id}` or `{errors}` | applications, activities, timeline_events | server.js:682 / service.js:433 |
| DELETE | `/api/applications/:id` | Delete application | session+CSRF | — | `{message}` | applications (cascades) | server.js:691 |
| GET | `/api/applications/:id/activity` | Activity log for one app | session | — | array of activities rows | activities | server.js:660 |
| PATCH | `/api/applications/:id/stage` | Change stage — **thin variant, dead/superseded, see dispatch note above** | session+CSRF | `{stage}` | `{id, previous_stage, stage}` or `{errors}` | applications, activities, stage_history, timeline_events | server.js:671 |
| PATCH | `/api/applications/:id/stage` | Change stage — **rich variant, always wins** | session+CSRF | `{stage, reason?, note?}` | `{id, previous_stage, stage}` | applications, activities, stage_history, timeline_events, rejections, audit_log | feature-upgrade.js:489 |
| GET | `/api/applications/:id/detail` | Full detail bundle (app+tags+timeline+stage_history+interviews+follow_ups+networking+checklist+tasks+notes+related+audit for managers) | session | — | large composite object | applications, tags, timeline_events, stage_history, interviews, follow_ups, networking_contacts, checklist_items, tasks, notes, audit_log | advanced.js:380 |
| GET | `/api/applications/query` | Advanced query (rich filters: search, enum/text/date column_filters, status_group, tags) | session | query params + `filters`/`column_filters` JSON, sort, page, page_size | `{items,total,page,page_size,pages}` | applications, users, resumes, application_tags, tags | feature-upgrade.js:550 |
| GET | `/api/applications/kanban` | Kanban board view grouped by stage | session | same as query + `limit` | `{columns:[{stage,total,items}],total,has_more}` | applications (via queryApplications) | feature-upgrade.js:561 |
| PATCH | `/api/applications/:id/board-order` | Set manual kanban ordering | session+CSRF | `{board_order}` | `{id,board_order}` | applications | feature-upgrade.js:584 |
| GET/PUT | `/api/application-view-preferences` | Get/save saved table/kanban view prefs (view type, sort, density, columns, filters) | session (PUT+CSRF) | `preferred_view, visible_columns, collapsed_columns, board_sort, filters, kanban_grouping, collapsed_groups, table_density, cards_per_group` | preference object | application_view_preferences, users | feature-upgrade.js:533 |
| POST | `/api/applications/:id/archive` | Archive application | session+CSRF | — | `{message}` | applications, timeline_events, audit_log | advanced.js:583 |
| POST | `/api/applications/:id/restore` | Un-archive | session+CSRF | — | `{message}` | applications, timeline_events, audit_log | advanced.js:583 |
| POST | `/api/applications/:id/pin` | Toggle pinned | session+CSRF | `{pinned}` | `{message}` | applications | advanced.js:583 |
| POST | `/api/applications/:id/next-action` | Mark next action complete + set new one | session+CSRF | `{next_action?, next_action_date?}` | `{message}` | applications, timeline_events | advanced.js:583 |
| POST | `/api/applications/:id/checklist` | Add custom checklist item | session+CSRF | `{label}` | `{message}` | checklist_items | advanced.js:583 |
| PATCH/DELETE | `/api/applications/:id/checklist/:itemId` | Update (label/completed/note) or delete a checklist item | session+CSRF | `{label?, completed?, note?}` | `{message}` | checklist_items | advanced.js:583 |
| PATCH | `/api/applications/:id/checklist/:itemId/move` | Reorder checklist item up/down (adjacent position swap) | session+CSRF | `{direction:"up"|"down"}` | `{message}` | checklist_items | advanced.js:668 |
| GET/POST | `/api/tags` | List / create tags | session (POST+CSRF) | POST: `{name, color?}` | tag rows / `{id}` | tags | advanced.js:698 |
| PATCH/DELETE | `/api/tags/:id` | Update/delete tag | session+CSRF | `{name?,color?}` | `{message}` | tags | advanced.js:818 |
| GET/POST | `/api/saved-views` | List / create saved views (table/kanban filter presets) | session (POST+CSRF) | POST: `{view_type, name, filters, sorting, columns, is_default}` | view rows / `{id}` | saved_views | advanced.js:698 |
| PATCH/DELETE | `/api/saved-views/:id` | Update/delete saved view | session+CSRF | — | `{message}` | saved_views | advanced.js:818 |

## 3. Activities / Timeline / Stage History

| Method | Path | Purpose | Auth | Key Request Fields | Key Response Fields | Tables | Source |
|---|---|---|---|---|---|---|---|
| GET | `/api/applications/:id/activity` | Chronological activity feed for an app | session | — | array of activities | activities | server.js:660 |
| GET | `/api/applications/:id/timeline` | List timeline events (filterable) | session | query: category, date_from, date_to, sort | array of timeline_events | timeline_events | advanced.js:474 |
| POST | `/api/applications/:id/timeline` | Add manual timeline event (may also change stage / set next action) | session+CSRF | `event_date, title, description?, category?, event_type?, stage?, contact_person?, next_action?, next_action_date?` | `{id}` | timeline_events, applications | advanced.js:474/481 |
| GET | `/api/applications/:id/timeline/json` | Export one app's timeline as a JSON file | session | query filters | file download | timeline_events | advanced.js:474/527 |
| GET | `/api/applications/:id/timeline/csv` | Export one app's timeline as a CSV file | session | query filters | file download | timeline_events | advanced.js:474/552 |

Stage history is written automatically (no dedicated write endpoint) by
`changeStage()` (service.js:493) into `stage_history`, surfaced read-only inside
`/api/applications/:id/detail` and `/api/analytics/stage-duration`.

## 4. Interviews / Rejections / Follow-ups

Generic "tracker" CRUD is one shared block (`trackerMatch`, server.js:861) covering
`interviews`, `rejections`, `follow_ups`, `networking_contacts`, `daily_goals`,
`weekly_goals`. Required fields per table are defined in `trackerConfig`
(service.js:143-170).

| Method | Path | Purpose | Auth | Key Request Fields | Key Response Fields | Tables | Source |
|---|---|---|---|---|---|---|---|
| GET | `/api/interviews` | List interviews (own, or via `user_id` if manager) | session | query: user_id (manager) | array (+owner_username) | interviews, users | server.js:861-877 |
| POST | `/api/interviews` | Schedule interview | session+CSRF | `application_id, interview_round, interview_type, scheduled_at, ...` | full created row | interviews, activities, timeline_events | server.js:878 |
| PATCH | `/api/interviews/:id` | Update interview (status/result changes also log timeline) | session+CSRF | any interviews column | full updated row | interviews, timeline_events | server.js:892 |
| DELETE | `/api/interviews/:id` | Delete interview | session+CSRF | — | `{message}` | interviews | server.js:901 |
| GET/POST/PATCH/DELETE | `/api/rejections(/:id)` | Same CRUD pattern for rejections | session(+CSRF) | `application_id, rejection_date, stage_at_rejection, rejection_reason?, notes?` | rows | rejections, activities, timeline_events, applications (auto stage→Rejected) | server.js:861 |
| GET/POST/PATCH/DELETE | `/api/follow_ups(/:id)` | Same CRUD pattern (auto-suggests due_date from user's follow-up-delay settings; can auto-create a reminder) | session(+CSRF) | `follow_up_type, due_date, application_id?, status?, notes?` | rows | follow_ups, activities, timeline_events, reminders | server.js:861, createTracker (service.js:238) |
| GET | `/api/follow-ups/suggest` | Suggest 1st/2nd follow-up dates for an application | session | query: application_id | `{date_applied, suggested_first_follow_up, suggested_second_follow_up, day_type}` | applications, users | advanced.js:964 |

## 5. Networking / Contacts

| Method | Path | Purpose | Auth | Key Request Fields | Key Response Fields | Tables | Source |
|---|---|---|---|---|---|---|---|
| GET/POST/PATCH/DELETE | `/api/networking_contacts(/:id)` | CRUD for recruiter/networking contacts, linkable to an application | session(+CSRF) | `contact_name` (required), `application_id?, connection_request_date?, first_message_sent?, next_follow_up_date?, ...` | rows | networking_contacts, activities, timeline_events | server.js:861 |

## 6. Resumes / Resume History

| Method | Path | Purpose | Auth | Key Request Fields | Key Response Fields | Tables | Source |
|---|---|---|---|---|---|---|---|
| GET/POST | `/api/resumes` | List / create resume versions | session (POST+CSRF) | POST: `version_name` (required), `revision_label?, parent_resume_id?, target_role?, job_category?, file_name?, resume_date?, is_active?, is_default?, notes?, change_summary?` | rows / `{id}` | resumes, resume_history | advanced.js:698 |
| PATCH/DELETE | `/api/resumes/:id` | Update (incl. archive) / delete resume; delete blocked if linked to applications | session+CSRF | any resumes column | `{message}` | resumes, resume_history | advanced.js:818 |
| GET | `/api/resumes/analytics` | Per-resume performance metrics (response/interview/offer rates) | session | query: user_id (manager) | array of metrics | resumes, applications | advanced.js:874 |
| GET | `/api/resumes/:id/history` | Audit trail of changes/clones for one resume | session | — | resume_history rows | resume_history, users | feature-upgrade.js:647/657 |
| POST | `/api/resumes/:id/clone` | Create a new revision derived from an existing resume | session+CSRF | `version_name?, revision_label?, change_summary?` | `{id}` | resumes, resume_history | feature-upgrade.js:647/671 |
| GET | `/api/resumes/compare` | Side-by-side metadata+performance comparison of 2 resumes | session | query: left, right (resume ids) | `{comparison_type, left, right}` | resumes, applications | feature-upgrade.js:708 |
| GET | `/api/exports/applications.xlsx` | XLSX export of applications (with per-resume aggregation in summary sheet) | session | query: same as applications/query filters | binary .xlsx download | applications, resumes, users, tags | feature-upgrade.js:788 |

## 7. Goals (daily/weekly settings, snapshots, comparison)

| Method | Path | Purpose | Auth | Key Request Fields | Key Response Fields | Tables | Source |
|---|---|---|---|---|---|---|---|
| GET/POST/PATCH/DELETE | `/api/daily_goals(/:id)` | CRUD daily goal records | session(+CSRF) | `goal_date` (required) + goal fields | rows | daily_goals | server.js:861 |
| GET/POST/PATCH/DELETE | `/api/weekly_goals(/:id)` | CRUD weekly goal records | session(+CSRF) | `week_start, week_end` (required) | rows | weekly_goals | server.js:861 |
| GET/POST | `/api/goals/settings` | Get/create goal targets per category+period (daily/weekly), effective-dated | session (POST+CSRF) | POST: `period_type, category, target, enabled?, effective_date?, end_date?` | rows / `{id}` | goal_settings | advanced.js:1104 |
| GET | `/api/goals/history` | Recalculated goal snapshots for a date range (daily/weekly/monthly rollup) | session | query: period_type, date_from/to, category, user_ids (manager, comma list) | `{items,summary}` or `{users,summary}` | goal_settings, goal_snapshots, applications, follow_ups, networking_contacts, daily_goals | advanced.js:1158 |
| GET | `/api/goals/comparison` | Same handler as `/goals/history` (achievement stats: streaks, avg above/below target) | session | same as above | same shape | goal_snapshots | advanced.js:1158 |
| GET | `/api/goals/progress-series` | Time series of one goal metric for charting | session | query: metric, date_from/to, aggregation (daily/weekly), user_id (manager) | `{metric,start,end,items,summary}` | goal_snapshots | feature-upgrade.js:741 |

## 8. Dashboard / Dashboard Preferences

| Method | Path | Purpose | Auth | Key Request Fields | Key Response Fields | Tables | Source |
|---|---|---|---|---|---|---|---|
| GET | `/api/dashboard` | Personal dashboard summary (today/perf/pipeline/recent activity) | session | — | `{today, performance, pipeline, recent_activity}` | applications, activities, follow_ups | server.js:759 / service.js:754 |
| GET | `/api/manager/dashboard` | Org-wide dashboard (or drill into one user via `user_id`) | manager | query: user_id? | `{users, applications, applications_by_user, recent_imports, actor}` | users, applications, import_batches | server.js:761 |
| GET/PUT/DELETE | `/api/dashboard/layout` | Get/save/reset customizable widget layout (user or manager dashboard type) | session (PUT/DELETE+CSRF) | GET: query `type`; PUT: `{widgets:[{widget_id,enabled,position,width,height,settings}]}` | `{dashboard_type,widgets,defaults}` / `{message}` / `{widgets}` | dashboard_preferences | advanced.js:1223 |
| GET/PUT | `/api/navigation/preferences` | Get/save sidebar collapsed state + group expand/collapse | session (PUT+CSRF) | PUT: `{collapsed, groups}` | `{collapsed, groups}` / `{message}` | users | feature-upgrade.js:625 |
| GET | `/api/navigation/counts` | Badge counts for nav (due reminders, overdue follow-ups, upcoming interviews, tasks due, habits due) | session | query: user_id (manager) | counts object | reminders, follow_ups, interviews, tasks, habits, habit_logs | feature-upgrade.js:596 |

## 9. Reminders / Reminder Categories

| Method | Path | Purpose | Auth | Key Request Fields | Key Response Fields | Tables | Source |
|---|---|---|---|---|---|---|---|
| GET/POST | `/api/reminders` | List (with computed `calculated_status`) / create reminder | session (POST+CSRF) | POST: `title, due_date, category_id` (required) + `related_record_type?, related_record_id?, description?, due_time?, priority?` | rows / `{id}` | reminders, reminder_categories | advanced.js:698 |
| PATCH/DELETE | `/api/reminders/:id` | Update / delete reminder | session+CSRF | any reminders column | `{message}` | reminders | advanced.js:818 |
| GET/POST | `/api/reminder-categories` | List built-in+custom categories (with reminder_count) / create custom category | session (POST+CSRF) | POST: `{name, color?, icon?, is_default?}` | rows / `{id}` | reminder_categories, reminders | advanced.js:898 |
| PATCH | `/api/reminder-categories/:id` | Rename/recolor/archive/restore a custom category (built-ins immutable) | session+CSRF | `{name?, color?, icon?, archived?, restore?}` | `{message}` | reminder_categories | advanced.js:898/931 |
| DELETE | `/api/reminder-categories/:id` | Delete custom category (must reassign reminders first via `reassign_to`) | session+CSRF | `{reassign_to?}` | `{message}` | reminder_categories, reminders | advanced.js:898/947 |

## 10. Import / Export

| Method | Path | Purpose | Auth | Key Request Fields | Key Response Fields | Tables | Source |
|---|---|---|---|---|---|---|---|
| POST | `/api/import/preview` | Dry-run parse+validate bulk import (csv/json/structured_text) without writing | session+CSRF | `{format, text}` | `{rows:[{row_number,data,errors,valid,duplicate,duplicate_id,result}]}` | applications (read-only dup check) | server.js:696 / service.js:308 |
| POST | `/api/import` | Execute import (create/update/skip per row, transactional) | session+CSRF | `{format, text, import_mode:"valid_rows_only"|"all_or_nothing", duplicate_action:"skip"|"import_anyway"|"update_existing"}` | batch summary `{import_batch_id, created_rows, updated_rows, skipped_rows, rejected_rows, created_application_ids, row_errors, status}` | applications, import_batches, import_rows, activities, stage_history, timeline_events, checklist_items, tags | server.js:704 / service.js:628 |
| GET | `/api/import/history` | List past import batches | session | — | rows (all batches if manager) | import_batches | server.js:710 |
| GET | `/api/import/history/:id/rows` | Per-row detail/messages for one import batch | session | — | rows with parsed `messages` | import_rows | server.js:732 |
| GET | `/api/exports/json` | Full personal data export as one JSON file (all owned tables) | session | query: user_id (manager) | JSON file download | applications, timeline_events, stage_history, interviews, rejections, follow_ups, networking_contacts, resumes, reminders, reminder_categories, goal_settings, goal_snapshots, dashboard_preferences, saved_views, tags, tasks, habits, habit_logs, notes | advanced.js:1437/1442 |
| GET | `/api/exports/:type` | CSV export per table: applications, interviews, rejections, follow_ups, networking, reminders, goals, tasks, habits, notes, resume-analytics, aging, stage-duration | session | query: user_id (manager) | CSV file download | varies per type (advanced.js:1537) | advanced.js:1437 |
| GET | `/api/exports/applications.xlsx` | Excel export of filtered applications with summary sheet | session | query: full applications/query filter set | .xlsx download | applications, resumes, users, tags | feature-upgrade.js:788 |

## 11. Tasks

| Method | Path | Purpose | Auth | Key Request Fields | Key Response Fields | Tables | Source |
|---|---|---|---|---|---|---|---|
| GET | `/api/tasks` | List tasks by view (today/backlog/upcoming/all/completed) | session | query: view, application_id, user_id (manager) | array of tasks | tasks | tasks.js:191 |
| POST | `/api/tasks` | Create task (optionally linked to an application, optionally recurring) | session+CSRF | `title` (required), `notes?, priority?, due_date?, application_id?, recurrence?("daily"|"weekdays"|"weekly"|"monthly")` | full created row | tasks | tasks.js:203 |
| PATCH | `/api/tasks/:id` | Update content and/or complete/reopen (completing a recurring task auto-creates the next occurrence) | session+CSRF | any TASK_FIELDS + `status:"open"|"completed"` | updated row + `created_next_task_id` | tasks | tasks.js:236/247 |
| DELETE | `/api/tasks/:id` | Delete task | session+CSRF | — | `{message}` | tasks | tasks.js:236/242 |

## 12. Habits

| Method | Path | Purpose | Auth | Key Request Fields | Key Response Fields | Tables | Source |
|---|---|---|---|---|---|---|---|
| GET | `/api/habits` | List habits with computed streak/period progress | session | query: view("today"/"all"), active, user_id (manager) | array with `period_start/end, period_value, completed, streak` | habits, habit_logs | habits.js:256 |
| POST | `/api/habits` | Create habit | session+CSRF | `name` (required), `description?, frequency("daily"|"weekdays"|"weekly")` (required), `target_count?, active?` | full created row | habits | habits.js:268 |
| GET | `/api/habits/:id/history` | Log history for one habit (default 30 days, max 365) | session | query: days | array `{completion_date, value}` | habit_logs | habits.js:292 |
| PUT | `/api/habits/:id/progress` | Log/update progress for a specific date (idempotent upsert) | session+CSRF | `{completion_date, value}` | summarized habit object | habit_logs | habits.js:310 |
| PATCH | `/api/habits/:id` | Update habit fields | session+CSRF | any HABIT_FIELDS | updated row | habits | habits.js:333/344 |
| DELETE | `/api/habits/:id` | Delete habit | session+CSRF | — | `{message}` | habits | habits.js:333/339 |

## 13. Notes / Journal

| Method | Path | Purpose | Auth | Key Request Fields | Key Response Fields | Tables | Source |
|---|---|---|---|---|---|---|---|
| GET | `/api/notes` | List notes (with `body_preview` instead of full body) | session | query: type, application_id, pinned, search, user_id (manager) | array (max 100) | notes, applications | notes.js:165 |
| POST | `/api/notes` | Create note (general/daily_journal/interview/company_research/reflection) | session+CSRF | `title?` or `body?` (one required), `note_type?, application_id?, entry_date?, pinned?` | full created note | notes, applications | notes.js:177 |
| GET | `/api/notes/:id` | Get full note (with body) | session | — | full note | notes, applications | notes.js:208/214 |
| PATCH | `/api/notes/:id` | Update note | session+CSRF | any NOTE_FIELDS | full updated note | notes | notes.js:208/222 |
| DELETE | `/api/notes/:id` | Delete note | session+CSRF | — | `{message}` | notes | notes.js:208/217 |

## 14. Analytics

| Method | Path | Purpose | Auth | Key Request Fields | Key Response Fields | Tables | Source |
|---|---|---|---|---|---|---|---|
| GET | `/api/analytics/stage-transitions` | Avg days between key stage transitions | session | query: user_id (manager) | metrics object + note | stage_history, applications | advanced.js:324 |
| GET | `/api/analytics/aging` | Applications grouped by inactivity band (New/Waiting/Follow-Up/Stale/Long Waiting) with health status | session | query: user_id (manager) | `{items, summary}` | applications, timeline_events | advanced.js:1290/1296 |
| GET | `/api/analytics/stage-duration` | Avg/median/min/max days per stage; stalled applications | session | query: date_from/to, user_id (manager) | `{stages, stalled, insufficient_data}` | stage_history, applications | advanced.js:1290/1323 |
| GET | `/api/analytics/source` | Per-source funnel metrics (response/interview/offer rates) | session | query: date_from/to, user_id (manager) | array | applications | advanced.js:1290/1365 |
| GET | `/api/analytics/resume` | Per-resume interactive performance (same formula as `/resumes/analytics`) | session | query: date_from/to, user_id (manager) | array | resumes, applications | advanced.js:1290/1374 |
| GET | `/api/analytics/funnel` | Stage-by-stage funnel counts/percentages | session | query: date_from/to, user_id (manager) | `{total, stages:[{stage,count,percentage}]}` | applications | advanced.js:1290/1388 |
| GET | `/api/analytics/activity` | Time-bucketed event activity (day/week/month) | session | query: group, date_from/to, user_id (manager) | array `{period, events, interviews, follow_ups, rejections}` | timeline_events | advanced.js:1290/1414 |
| GET | `/api/calendar` | Unified calendar feed (applications, interviews, follow-ups, networking, reminders, next-actions, goal checkpoints) | session | query: date_from/to, view, completed, user_id (manager) | `{view,start,end,events[]}` | applications, interviews, follow_ups, networking_contacts, reminders, goal_settings | advanced.js:993 |

## 15. Extension API

Bearer-token auth (`Authorization: Bearer <raw>`, hashed + looked up in
`extension_tokens`) is separate from session/CSRF auth. Token *management* endpoints
use session+CSRF (called from the web Settings page); the extension-facing endpoints
use the bearer token.

| Method | Path | Purpose | Auth | Key Request Fields | Key Response Fields | Tables | Source |
|---|---|---|---|---|---|---|---|
| POST | `/api/extension/tokens` | Generate a new extension bearer token (raw shown once) | session+CSRF | `{label?}` | `{id, label, token, created_at}` | extension_tokens | extension.js:87 |
| GET | `/api/extension/tokens` | List own tokens' metadata (no raw token) | session | — | array `{id,label,created_at,last_used_at,revoked_at}` | extension_tokens | extension.js:113 |
| DELETE | `/api/extension/tokens/:id` | Revoke a token | session+CSRF | — | `{message}` | extension_tokens | extension.js:125 |
| GET | `/api/extension/me` | Verify bearer auth, return identity | extension bearer | — | `{id,username,full_name,role}` | extension_tokens, users | extension.js:145 |
| GET | `/api/extension/resumes` | List active (non-archived) resumes for popup selection | extension bearer | — | array `{id,version_name,target_role,job_category,resume_date}` | resumes | extension.js:159 |
| GET | `/api/extension/stages` (alias `/api/extension/workflow-actions`) | Canonical stage list + display labels | extension bearer | — | `{stages, default, workflow_actions}` | — (STAGES constant) | extension.js:171 |
| GET | `/api/extension/duplicate-check` | Check for an existing/duplicate application by URL/company/title (company-first classification) | extension bearer | query: job_url, company, job_title | `{match_type, has_duplicate, matches[]}` | applications | extension.js:196 |
| POST | `/api/extension/applications` | Create application from the browser extension | extension bearer | same shape as `POST /api/applications` | full created application row or `{errors}` | applications (+ side tables via createApplication) | extension.js:304 |

## 16. Manager-only Endpoints

(Also cross-listed above where the endpoint is manager-gated in context.)

| Method | Path | Purpose | Auth | Key Request Fields | Key Response Fields | Tables | Source |
|---|---|---|---|---|---|---|---|
| GET | `/api/manager/dashboard` | Org dashboard / drill into a specific user | manager-only | query: user_id? | aggregate stats | users, applications, import_batches | server.js:761 |
| GET | `/api/manager/users` | Search/list all users with rollup counts | manager-only | query: search | array of user summaries | users, applications, interviews, follow_ups, activities | server.js:795 |
| PATCH | `/api/manager/users/:id` | Change a user's role/active status (blocks demoting the last active manager) | manager-only+CSRF | `{role?, is_active?}` | `{user}` | users, audit_log | server.js:809 |
| GET | `/api/manager/audit` | Global audit log (last 500 entries) | manager-only | — | array of audit_log rows | audit_log, users | advanced.js:1602 |

Note: nearly every "own data" endpoint above also supports an implicit manager
override via `?user_id=` (or `target_user_id` on writes), resolved through
`targetOwner()`/`ownerId()` — managers are not restricted to a distinct URL space for
most reads.

## 17. Static File Serving

`server.js` (~lines 915–943): any unmatched `/api/*` path returns 404. All other
paths are served from `frontend/dist` (Vite build output — never `frontend/src`,
`node_modules`, or `package.json`). `/` maps to `index.html`. Path traversal (`..`)
is rejected. Content-Type is inferred from extension with security headers
(`X-Content-Type-Options: nosniff`, the CSP). If the requested file isn't found,
falls back to `index.html` with a 200 (SPA-style catch-all, used only for the
extension's `?application=<id>` deep-link case, since the app has no other
URL-based routing).

## Cross-cutting notes for migration

1. **Ownership model**: almost every handler resolves the effective owner via
   `targetOwner(db, actor, input)` (writes) or `ownerId(actor, query)` (reads — two
   near-duplicate implementations, see above). A `MANAGER` can act on behalf of any
   user via `user_id`/`target_user_id`; a regular `USER` is hard-blocked from
   setting those fields.
2. **Generic tracker CRUD** is schema-introspected at request time (see above) — a
   migration to a typed backend needs one explicit typed handler per table instead.
3. **Two separate duplicate-detection algorithms exist and should stay separate**:
   the import pipeline's `duplicate()` (service.js:292, matches on
   company+title+date+URL) vs. the extension's `normalizeJobUrl`/`normalizeText`
   company-first classification (extension.js) — different purposes (import
   de-dup vs. real-time capture warning), not a single shared function today.
4. **CSRF**: every mutating session-authenticated request requires header
   `x-csrf-token` matching the session's stored `csrf_token`; GETs never require it.
   Extension bearer-token requests never use CSRF (stateless bearer auth).
5. **Every CSV/XLSX export cell passes through `safeCell()`/`csvEscape()`** for
   formula-injection protection — do not drop this in a rewritten export path.
