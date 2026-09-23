# Feature Catalog

CURRENT STATE. Every feature below is live, tested, and shipped on `main`. Cross-refs
use the IDs introduced here (`FEATURE-<AREA>-NNN`) so `docs/PRD.md`,
`docs/IMPLEMENTATION_PLAN.md`, and `MIGRATION_CHECKLIST.md` can point back to one
place. Source line numbers are as reported by the read-only research passes behind
`API_INVENTORY.md` and `ROUTE_SCREEN_INVENTORY.md`.

---

## FEATURE-AUTH-001: Authentication (PIN + legacy password transition)

### Purpose
Let a single person securely own a private, multi-device job-search workspace without third-party auth infrastructure.

### Entry Points
`authView()` (pre-shell screen), shown whenever no valid session exists.

### UI Components
`frontend/src/app.js` `authView()` (~line 459) — 3 modes: sign-in, create-account, legacy-password→PIN transition.

### Backend
`POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/transition-pin`, `POST /api/auth/logout`, `GET /api/auth/me`.

### Database
`users`, `sessions`.

### Business Logic
See `BUSINESS_LOGIC_CATALOG.md` §PIN hashing, session lifecycle, lockout.

### Validation
PIN: exactly 4 digits, stored as a string (leading zeros survive). Username: required, case-insensitive unique. 5 failed logins → 5-minute lockout, generic error message (no enumeration signal).

### Permissions
Public (register/login); session-only for logout/me.

### States
Loading (implicit, form disabled during submit), error (`errorBox()` inline), success (redirect via `resolveInitialRoute()`).

### Edge Cases
Legacy password accounts must run the one-time `transition-pin` flow before they can use PIN login; the raw session cookie is `HttpOnly`/`SameSite=Strict` and gains `Secure` only in production.

### Source Files
`backend/src/server.js` (register/login/logout/me handlers), `backend/src/security.js` (scrypt hashing, session token hashing), `frontend/src/app.js` (`authView`).

### Tests
`backend/test/app.test.js` (login/lockout/PIN transition cases).

### Migration Notes
Supabase Auth has no native "4-digit PIN as primary credential" — this is a real design decision, not a mechanical port. See `OPEN_QUESTIONS.md`.

---

## FEATURE-APP-001: Application CRUD & 13-stage workflow

### Purpose
The core value proposition — track every job application through a defined lifecycle.

### Entry Points
Sidebar "Add Application", "Quick Add" (global topbar + `q` shortcut), import, browser extension capture, Applications table/kanban row actions.

### UI Components
`renderAdd()`, `renderQuickAdd()`, `applicationForm()`, `renderDetail()` (app.js).

### Backend
`POST/GET/PATCH/DELETE /api/applications(/:id)`, `PATCH /api/applications/:id/stage` (rich variant, `feature-upgrade.js:489`).

### Database
`applications` (23 columns), cascades to `activities`, `stage_history`, `timeline_events`.

### Business Logic
13 canonical `STAGES` (single source of truth, also consumed by the browser extension); stage change auto-creates a `rejections` row when the new stage is `Rejected`, and writes `audit_log`; owner/actor split lets a manager act on a user's record while keeping the true owner intact. See `BUSINESS_LOGIC_CATALOG.md` §Stage transitions.

### Validation
`company`, `job_title`, `date_applied` required; `stage`/`priority`/`work_arrangement`/`employment_type` are DB-level CHECK-constrained enums, re-validated at the app layer; `job_url` must be `http:`/`https:` (rejects `javascript:`/`data:`).

### Permissions
Owner-scoped (`user_id`); manager override via explicit `user_id`/`target_user_id`, never implicit.

### States
Loading (detail page fetch), empty ("No applications match these filters" on the table), error (inline form errors; detail-page 404 redirects to the list with a toast instead of an error boundary).

### Edge Cases
Deleting an application cascades through 7 dependent tables and `SET NULL`s 3 more (`networking_contacts`, `tasks`, `notes`) — see `docs/BACKEND_SCHEMA.md`.

### Source Files
`backend/src/service.js` (`createApplication`, `changeStage`, `validateApplication`), `backend/src/feature-upgrade.js` (rich stage-change transaction), `frontend/src/app.js` (`renderAdd`, `renderDetail`, `applicationForm`).

### Tests
`backend/test/app.test.js` (30+ fixture call sites), `backend/e2e/jobquest.spec.js`.

### Migration Notes
Preserve the exact 13-stage enum and the audit/rejection side-effects of the stage-change transaction — do not silently reproduce the *dead* thin stage-change handler in `server.js:671` (see `API_INVENTORY.md` dispatch-order note).

---

## FEATURE-APP-002: Applications Table + Kanban views, filters, search, sort, pagination

### Purpose
Let users work through a growing application list efficiently, in whichever visual shape suits the moment.

### Entry Points
Sidebar "Applications", `g a` shortcut, most dashboard/report drill-throughs.

### UI Components
`renderApplications()`, `createApplicationTable()` (`application-table.js`), Kanban grouping/column logic in `ui-utils.js`.

### Backend
`GET /api/applications/query` (rich filters), `GET /api/applications/kanban`, `GET/PUT /api/application-view-preferences`, `GET/POST /api/saved-views`, `PATCH /api/applications/:id/board-order`.

### Database
`applications`, `application_view_preferences`, `saved_views`, `tags`/`application_tags`.

### Business Logic
Per-column operator-based filtering (`column_filters` JSON: text operators, enum multiselect, date ranges, numeric comparisons), `status_group` quick-filter param, 5 Kanban grouping modes with independently-collapsible, per-user-persisted group state, capped initial render (15 cards/group) with "Show more".

### Validation
Sort/filter field names are drawn from a hardcoded whitelist server-side (never raw user input interpolated into SQL — confirmed by the Round 10 security audit).

### Permissions
Owner-scoped; manager override via `user_id`.

### States
Empty ("No applications match these filters" / "No applications" per Kanban group), loading (initial fetch), consequential-stage-move confirmation dialog (Accepted/Rejected/Withdrawn/Ghosted/Position Closed).

### Edge Cases
Missing dates/salary must not error (a non-negotiable carried from the original Round 3 brief, confirmed still honored); drag-and-drop always has a keyboard/button alternative.

### Source Files
`frontend/src/application-table.js`, `frontend/src/features/applications/quick-filters.js`, `backend/src/feature-upgrade.js` (`buildApplicationWhere`, `queryApplications`).

### Tests
`backend/e2e/jobquest.spec.js` (visual regression + accessibility across 5 viewports).

### Migration Notes
The column-filter operator system is richer than a typical CRUD table filter — enumerate every operator before assuming a simpler filter UI suffices (see `docs/FEATURE_UPGRADE_3.md` for the full reconciliation this was already audited against once).

---

## FEATURE-APP-003: Duplicate detection (import pipeline)

### Purpose
Prevent accidentally re-logging the same application twice during bulk import.

### Entry Points
`POST /api/import/preview`, `POST /api/import`.

### UI Components
Bulk Import preview table (`previewRowMessage()`).

### Backend
`duplicate()` in `service.js:292`.

### Database
`applications` (read-only match), `import_batches`/`import_rows` (write).

### Business Logic
Normalized identity = owner + company + title + date_applied, with normalized URL comparison when a URL is present. Actions: `skip`, `import_anyway`, `update_existing`. **Distinct algorithm from the extension's duplicate-check (FEATURE-EXT-003) — do not merge them.**

### Validation
Import modes: `valid_rows_only` (partial commit) vs. `all_or_nothing` (transactional).

### Permissions
Owner-scoped.

### States
Preview (no writes) vs. commit; every row's outcome (`messages_json`) is retained, viewable via `GET /api/import/history/:id/rows`.

### Edge Cases
Never silently overwrites a record — `update_existing` is an explicit per-row choice, not a default.

### Source Files
`backend/src/service.js` (`duplicate`, `importRows`).

### Tests
`backend/test/app.test.js` (malformed/partial-failure fixtures).

### Migration Notes
Keep as a separate function/module from any extension-side duplicate logic in the target system.

---

## FEATURE-CHK-001: Application Checklist

### Purpose
Give each application a lightweight, stage-agnostic task list ("send thank-you note", "follow up in a week").

### Entry Points
Application Detail page's Checklist panel (the one tab that's actually wired up — see `ROUTE_SCREEN_INVENTORY.md` known gaps).

### UI Components
`checklistItemHtml`/`checklistView`/`bindChecklist` (app.js ~1878-1987).

### Backend
`POST /api/applications/:id/checklist`, `PATCH/DELETE .../checklist/:itemId`, `PATCH .../checklist/:itemId/move`.

### Database
`checklist_items` (position-ordered).

### Business Logic
Reorder is an **adjacent position swap** (`direction: up|down`), not free-form drag-and-drop or a client-supplied position — deliberately chosen because a server-side adjacent swap can never produce a colliding position. Read-time grouping into 5 lifecycle buckets (`features/checklist/groups.js`) is label-based, not stored — cross-group reordering has no visible effect (a documented, accepted quirk, not a bug).

### Validation
`label` required for custom items.

### Permissions
Owner-scoped via the parent application.

### States
Optimistic UI: checkbox toggles immediately, rolls back + toasts on failure.

### Edge Cases
Stage-aware item *generation* (varying defaults by current stage) was evaluated and explicitly deferred — real duplicate-generation risk without a schema change (`stage_hint` column). Today's grouping is display-only, read-time.

### Source Files
`backend/src/advanced.js` (checklist routes), `frontend/src/app.js`, `frontend/src/features/checklist/groups.js`.

### Tests
`backend/test/app.test.js`, dedicated Playwright E2E spec (added in Round 4).

### Migration Notes
If stage-aware generation is ever built, it needs a schema change first (a `stage_hint` column) — don't attempt label-matching.

---

## FEATURE-INT-001: Interviews, Rejections, Follow-ups (generic tracker domain)

### Purpose
Track scheduled interviews, structured rejection reasons/lessons, and outbound follow-up communications, each optionally linked to an application, interview, or contact.

### Entry Points
Sidebar (Activity group); Application Detail quick-actions ("Add Interview", "Add Follow-Up", "Mark Rejected"); Calendar event clicks.

### UI Components
`renderTracker(type)`, shared `trackerMeta` field-metadata table (app.js).

### Backend
Generic `trackerMatch` block (`server.js:861`) for `interviews`, `rejections`, `follow_ups` (and `networking_contacts`, `daily_goals`, `weekly_goals` — same mechanism). `GET /api/follow-ups/suggest` for auto-suggested follow-up dates.

### Database
`interviews`, `rejections` (`UNIQUE(application_id, rejection_date)`), `follow_ups` (polymorphic parent: application_id OR interview_id OR networking_contact_id, CHECK-enforced at least one).

### Business Logic
Follow-up due-date suggestion reads the user's `first_follow_up_delay`/`second_follow_up_delay`/`follow_up_day_type` (calendar vs. business days) settings. Writable-field allow-list per table is derived from live schema introspection (`PRAGMA table_info`), not hardcoded — a migration to a typed backend must make each table's fields explicit.

### Validation
Required fields vary per table (`trackerConfig`, `service.js:143-170`); a rejection is unique per (application, date).

### Permissions
Owner-scoped; related-record ownership independently re-checked (a Follow-up's `interview_id`/`networking_contact_id` must belong to the same user, not inferred from the parent alone).

### States
Standard CRUD list/empty/error states; checkbox omission-from-FormData handled explicitly for boolean columns.

### Edge Cases
`relationship_type` (networking) is a `<datalist>`, not a locked enum, specifically to avoid misrepresenting pre-existing free-text values.

### Source Files
`backend/src/server.js` (`trackerMatch`, `trackerConfig`), `backend/src/service.js` (`createTracker`), `frontend/src/app.js` (`renderTracker`, `trackerMeta`).

### Tests
`backend/test/app.test.js`.

### Migration Notes
The schema-introspected allow-list pattern is a genuine "how did this even work" migration risk if copied naively into a typed ORM — enumerate every field per table explicitly instead (this document + `docs/BACKEND_SCHEMA.md` already do that).

---

## FEATURE-NET-001: Networking / Contacts (CRM-lite)

### Purpose
Track recruiter/networking relationships and connect them back to specific applications.

### Entry Points
Sidebar (Activity); Application Detail "Link Contact".

### UI Components
Shares `renderTracker("networking_contacts")`.

### Backend
Same generic tracker mechanism as FEATURE-INT-001.

### Database
`networking_contacts` (optional `application_id`, `SET NULL` on app delete).

### Business Logic
Contact search/filter/sort and duplicate-contact detection were evaluated and explicitly deferred (no evidence of need at current scale) — see `tasks/BACKLOG.md`.

### Validation
`contact_name` required.

### Permissions
Owner-scoped.

### States
Standard CRUD.

### Edge Cases
The "Link Contact" flow historically had a real bug (missing field in the type's field list broke the link path entirely) — fixed in Round 5; worth a dedicated regression test in any migrated system given how easy this class of bug is to reintroduce.

### Source Files
`backend/src/server.js`, `frontend/src/app.js`.

### Tests
`backend/test/app.test.js`.

### Migration Notes
None beyond FEATURE-INT-001's.

---

## FEATURE-RES-001: Resumes & Resume Revision History

### Purpose
Track resume versions (metadata only, no file upload) and measure which version performs best.

### Entry Points
Sidebar (Career Assets).

### UI Components
`renderResumes()`.

### Backend
`GET/POST /api/resumes`, `PATCH/DELETE /api/resumes/:id`, `GET /api/resumes/analytics`, `GET .../:id/history`, `POST .../:id/clone`, `GET .../compare`.

### Database
`resumes` (with `parent_resume_id` self-reference for revision chains), `resume_history` (immutable audit trail).

### Business Logic
Per-resume performance = response/interview/offer counts and rates against applications linking to it (same `rates()` formula the Analytics module reuses). Deleting a resume linked to applications is blocked.

### Validation
`version_name` required, unique per user.

### Permissions
Owner-scoped.

### States
Standard CRUD; comparison view side-by-side.

### Edge Cases
Explicitly no file upload — "secure metadata only", by design, not a missing feature.

### Source Files
`backend/src/advanced.js`, `backend/src/feature-upgrade.js` (clone/history/compare).

### Tests
`backend/test/app.test.js`.

### Migration Notes
If a future round adds actual file storage, Supabase Storage is the natural target — explicitly out of this migration's scope unless requested (see `docs/PRD.md` Out of Scope).

---

## FEATURE-GOAL-001: Daily/Weekly Goals, Goal Settings, Snapshots, Streaks

### Purpose
Give users a target-vs-actual view of their job-search effort, with historical accountability.

### Entry Points
Dashboard widgets; Settings → "Goal Settings"; sidebar "Goal History".

### UI Components
`renderGoals()`, `renderGoalHistory()`, dashboard goal widgets.

### Backend
`GET/POST /api/goals/settings`, `GET /api/goals/history`, `/comparison`, `/progress-series`; legacy `daily_goals`/`weekly_goals` generic-tracker CRUD.

### Database
`daily_goals`, `weekly_goals` (fixed-shape legacy targets), `goal_settings` (extensible, effective-dated targets), `goal_snapshots` (immutable point-in-time target-vs-actual).

### Business Logic
Actuals are **never stored** in `goal_settings` — computed live from `applications`/`follow_ups`/etc. (`actualFor()`). Snapshots are frozen once a period completes, so historical comparisons are stable even if live data changes later.

### Validation
`period_type` CHECK (daily/weekly); `category` CHECK (5 fixed categories).

### Permissions
Owner-scoped; manager can view comma-separated `user_ids` rollups.

### States
Insufficient-data messaging when a range has no snapshots yet.

### Edge Cases
`users.week_start` is stored but **inconsistently honored** — only Habits (Round 8) actually reads it; the calendar week view and the weekly-snapshot walker hardcode Monday-first. Flagged as `MOVE TO V2.1` debt, not fixed.

### Source Files
`backend/src/advanced.js`, `backend/src/feature-upgrade.js` (`progress-series`).

### Tests
`backend/test/app.test.js`.

### Migration Notes
Decide explicitly whether the migrated system honors `week_start` everywhere or removes it — don't let the inconsistency migrate silently.

---

## FEATURE-DASH-001: Dashboard (User + Manager), configurable widget layout

### Purpose
A single-glance view of pipeline health, today's priorities, and trends, customizable per user.

### Entry Points
Default landing route; Manager nav section (role-gated).

### UI Components
`renderDashboard()`, `renderDashboardSettings()`, 30-widget registry (`dashboard-config.js`), 3-tier grouping (`features/dashboard/tiers.js`).

### Backend
`GET /api/dashboard`, `/api/manager/dashboard`, `GET/PUT/DELETE /api/dashboard/layout`.

### Database
`dashboard_preferences` (per-widget enable/position/size/settings).

### Business Logic
Dashboard rate formulas (response/interview/rejection/offer/acceptance) always use **all tracked applications as the denominator**, returning 0 for an empty dataset — never `NaN`/undefined. See `BUSINESS_LOGIC_CATALOG.md`.

### Validation
Widget width/height CHECK-constrained 1–3 grid units.

### Permissions
`dashboard_type` CHECK (user/manager); manager dashboard is role-gated.

### States
"Loading widgets…" during the initial parallel fetch; per-widget empty states (e.g., "No source data").

### Edge Cases
Several `toast(); render*();` call sites don't `await` — real, documented debt causing rare E2E timing flakes; not a data-correctness bug.

### Source Files
`frontend/src/dashboard-config.js`, `frontend/src/features/dashboard/tiers.js`, `frontend/src/app.js` (`renderDashboard`, `widgetContent`, `dashboardData`).

### Tests
`backend/e2e/jobquest.spec.js` (visual regression across viewports/themes).

### Migration Notes
Preserve every widget id/type verbatim — a non-negotiable carried from the original Round 3 brief ("no dashboard widget name/type-ID changes").

---

## FEATURE-IMPEXP-001: Import / Export

### Purpose
Data portability in and out of JobQuest — CSV/JSON/structured-text import, CSV/XLSX/JSON export.

### Entry Points
Sidebar "Bulk Import" / "Import History" / "Exports"; inline export dialog on the Applications page.

### UI Components
`renderBulk()`, `renderImports()`, `renderExports()`.

### Backend
`POST /api/import/preview`, `POST /api/import`, `GET /api/import/history(/:id/rows)`, `GET /api/exports/:type`, `GET /api/exports/applications.xlsx`, `GET /api/exports/json`.

### Database
`import_batches`, `import_rows`; reads across nearly every domain table for exports.

### Business Logic
Canonical field list + aliases (`company_name→company`, `title|role→job_title`, etc.) — see `BUSINESS_LOGIC_CATALOG.md` §Import normalization. Every CSV/XLSX cell passes through `safeCell()`/`csvEscape()` for formula-injection protection.

### Validation
Unknown fields and ownership/authorization fields in import payloads are hard errors — nothing silently discarded.

### Permissions
Owner-scoped; manager can export another user's data via `user_id`.

### States
Preview-before-commit; every import attempt and row outcome retained (no raw input/secrets stored).

### Edge Cases
No restore path exists for the full-workspace JSON export — a real, deliberately deferred gap (14+ FK-related tables makes safe restore genuinely separate work).

### Source Files
`backend/src/service.js` (import/export core), `backend/src/advanced.js` (CSV export dispatch), `backend/src/feature-upgrade.js` (XLSX export, `safeCell`).

### Tests
`backend/test/app.test.js` (malformed/partial-failure fixtures), migration test suite for the separate SQLite→Postgres tooling (not the same thing as this feature, but shares the "import" vocabulary — don't conflate the two in migration planning).

### Migration Notes
JSON-restore and a downloadable import error-report CSV are both real, scoped, not-yet-built features — legitimate `CHANGE_REQUESTS.md` candidates for the new system rather than debt to silently carry forward.

---

## FEATURE-TASK-001: Task Management

### Purpose
General-purpose, optionally-dated task tracking — distinct from Reminders (which always have a due date).

### Entry Points
Sidebar (Activity); Application Detail "Add Task".

### UI Components
`renderTasks()`, shared `taskRowHtml`/`bindTaskActions`.

### Backend
`GET /api/tasks?view=`, `POST`, `PATCH`, `DELETE /api/tasks/:id`.

### Database
`tasks` (nullable `due_date` — the structural reason this domain exists separately from `reminders`).

### Business Logic
Completing a recurring task (`daily|weekdays|weekly|monthly`) creates the **next occurrence as a new row** — no per-row history, no streak concept (that's Habits' job).

### Validation
`title` required.

### Permissions
Owner-scoped; `application_id` link ownership independently re-checked.

### States
4 views: today/upcoming/backlog/completed (server-capped at 100 rows, no pagination UI — accepted debt at current scale).

### Edge Cases
The "Add task" submit handler calls `toast(); renderTasks();` without awaiting the render — real, confirmed debt (causes a rare E2E mobile-nav race), not a data bug.

### Source Files
`backend/src/tasks.js`.

### Tests
`backend/test/app.test.js`, dedicated Playwright spec.

### Migration Notes
Task tags and subtasks were evaluated and explicitly deferred (no evidence of need) — don't build them speculatively in the migration either.

---

## FEATURE-HABIT-001: Habit Tracker

### Purpose
Daily/weekdays/weekly habit tracking with streaks, distinct from Goals (computed KPIs) and Tasks (no repetition/streak concept).

### Entry Points
Sidebar (Activity).

### UI Components
`renderHabits()` (today/all/history sub-views).

### Backend
`GET /api/habits`, `POST`, `GET .../:id/history`, `PUT .../:id/progress`, `PATCH`, `DELETE`.

### Database
`habits`, `habit_logs` (one row per habit+date storing an absolute value — not one row per action; `UNIQUE(habit_id, completion_date)` makes the progress upsert idempotent under retry).

### Business Logic
One unified model covers both boolean habits (`target_count=1`) and count habits (`target_count=5`). Streaks are derived at read time, reusing the same computational shape as the Goals `comparison()` streak helper. Streak lookback bounded at 365 days.

### Validation
`frequency` CHECK (daily/weekdays/weekly); `target_count` > 0.

### Permissions
Owner-scoped.

### States
Optimistic checkbox/counter with rollback+toast on failure.

### Edge Cases
`habits_due_today` nav badge undercounts weekdays/weekly habits (no safe cross-dialect weekday SQL function) — accepted, documented debt. **Habit editing is a chain of native `prompt()` dialogs, not a real form** — a genuine UX gap to fix in the migrated UI, not to reproduce.

### Source Files
`backend/src/habits.js`.

### Tests
`backend/test/app.test.js`, `frontend/src/features/habits/format.js` unit tests, dedicated Playwright spec.

### Migration Notes
Design a real edit form/modal for habits in the target UI — this is one of 11 `prompt()` call sites app-wide, and habits is as good a place as any to finally replace the pattern (see `docs/UI_UX_DESIGN_BRIEF.md`).

---

## FEATURE-NOTE-001: Journal / Notes

### Purpose
Structured freeform notes (daily journal, interview notes, company research, reflections), optionally linked to an application — deliberately independent from the 8 other notes-like fields already embedded elsewhere in the schema.

### Entry Points
Sidebar (Activity); Application Detail "Add Note".

### UI Components
`renderNotes()` (list), `renderNoteEditor()` (create/edit).

### Backend
`GET /api/notes`, `POST`, `GET/PATCH/DELETE .../:id`.

### Database
`notes` (nullable `title`, plain-text `body`, 5-value `note_type` enum, nullable `application_id` `SET NULL` on delete).

### Business Logic
Search reuses the exact `lower(field) LIKE lower(?)` pattern Applications search already uses (cross-dialect, no Postgres-only `ILIKE`). List responses return a truncated `body_preview`; full body only via the single-note GET.

### Validation
At least one of title/body required.

### Permissions
Owner-scoped; `application_id` link ownership independently re-checked.

### States
100-row server cap, no pagination UI (accepted debt).

### Edge Cases
Plain text only — deliberately no Markdown/rich-text/sanitizer dependency; safety comes entirely from the shared `esc()`-equivalent escaping plus CSS `white-space: pre-wrap`. Explicitly tested against `<script>`/`<img onerror>`-shaped content and confirmed inert.

### Source Files
`backend/src/notes.js`.

### Tests
`backend/test/app.test.js`, dedicated Playwright spec (including XSS-shaped content).

### Migration Notes
If rich text is ever wanted, that's a deliberate, separate product decision — not implied by anything in this migration.

---

## FEATURE-ANALYTICS-001: Analytics (Funnel, Source, Resume Performance, Stage Duration/Transitions, Aging, Activity)

### Purpose
Turn the accumulated application/stage-history data into actionable trend and performance views.

### Entry Points
Sidebar (Insights): Analytics, Goal History, Aging, Stage Analytics.

### UI Components
`renderAnalytics()`, `renderAging()`, `renderCompleteStageAnalytics()`.

### Backend
`GET /api/analytics/{aging,stage-duration,stage-transitions,source,resume,funnel,activity}`.

### Database
Reads `applications`, `stage_history`, `timeline_events`, `resumes` — no dedicated analytics tables; everything is computed on read.

### Business Logic
Every rate is `numerator/denominator` scoped to the same `date_applied` range on both sides (a response outside the range never counts against an in-range application). `rateLabel()` shows "No data" rather than `0%`/`NaN%` for a zero denominator — rates are **never shown as a bare percentage**, always `n/d (pct%)`, so sample size is always visible. Response = `last_response_date IS NOT NULL`; interview = ever reached Interview/Final Interview/Offer/Accepted; offer = ever reached Offer/Accepted.

### Validation
Date-range presets (30/90/180/365 days).

### Permissions
Owner-scoped; manager via `user_id`.

### States
"Insufficient data" messaging below a meaningful-sample threshold (aging/stage-duration/transitions).

### Edge Cases
The `funnel` endpoint existed for a full round before this module gave it a real caller (previously the Dashboard computed its own funnel client-side from already-fetched data). No new chart dependency was added — reuses existing dependency-free SVG primitives (`hBar`/`vBars`/`areaLineChart`/`radialProgress`).

### Source Files
`backend/src/advanced.js` (analytics dispatch + formulas), `frontend/src/features/analytics/format.js` (`rateLabel`, `summarizeRates`).

### Tests
`backend/test/app.test.js` (rate-math + ownership scoping), `frontend/src/features/analytics/format.js` unit tests, dedicated Playwright spec.

### Migration Notes
Reimplement the exact numerator/denominator/date-scoping rules verbatim — this is exactly the kind of subtle business rule a naive rewrite silently changes. Never let a UI show a bare percentage without its sample size.

---

## FEATURE-CAL-001: Calendar

### Purpose
A unified date-oriented view across applications, interviews, follow-ups, networking, reminders, and goal checkpoints.

### Entry Points
Sidebar (Activity); `g c` shortcut.

### UI Components
`renderCalendar()` (month/week/agenda views).

### Backend
`GET /api/calendar?view=&date_from=&date_to=`.

### Database
Reads across `applications`, `interviews`, `follow_ups`, `networking_contacts`, `reminders`, `goal_settings` — no dedicated table.

### Business Logic
Week view hardcodes Monday-first (does not honor `users.week_start` — a known inconsistency, see FEATURE-GOAL-001).

### Validation
n/a (read-only feed).

### Permissions
Owner-scoped; manager via `user_id`.

### States
"No events" (week view empty day), "No events in this period" (agenda view).

### Edge Cases
Event click routing differs by type: application events → `detail:id`; everything else → `go(eventType + "s")` (e.g. `interview` → `interviews`).

### Source Files
`backend/src/advanced.js` (`GET /api/calendar`).

### Tests
`backend/e2e/jobquest.spec.js`.

### Migration Notes
Decide `week_start` handling app-wide before or during this feature's migration (see FEATURE-GOAL-001).

---

## FEATURE-REM-001: Reminders & Reminder Categories

### Purpose
A general notification/to-do system with always-present due dates (contrast Tasks, which allows no due date).

### Entry Points
Sidebar (Activity); Calendar clicks; auto-created by the Follow-ups feature when `auto_create_follow_up_reminder` is enabled.

### UI Components
`renderReminders()`, `renderCategories()`.

### Backend
`GET/POST /api/reminders`, `PATCH/DELETE .../:id`, `GET/POST /api/reminder-categories`, `PATCH/DELETE .../:id`.

### Database
`reminder_categories` (11 seeded builtins + user-created custom), `reminders` (`due_date NOT NULL`).

### Business Logic
Deleting a custom category requires reassigning its reminders first (`reassign_to` param); built-in categories are immutable (no rename/delete).

### Validation
`title`, `due_date`, `category_id` required.

### Permissions
Owner-scoped; builtin categories visible to all (`user_id IS NULL`).

### States
Snooze (1 day / 1 week), Complete, category filter (client-side toggle, no re-fetch).

### Edge Cases
`reminders.due_date` being `NOT NULL` by design is the entire reason Tasks (FEATURE-TASK-001) exists as a separate domain rather than an extension of this one — a real, deliberate product-direction decision, not an oversight.

### Source Files
`backend/src/advanced.js`.

### Tests
`backend/test/app.test.js`.

### Migration Notes
Do not merge Tasks and Reminders in the target system without a fresh, explicit product decision — they were deliberately kept separate here for a structural reason that still applies.

---

## FEATURE-EXT-001: Browser Capture Extension — Authentication

### Purpose
Let a browser extension authenticate to a user's JobQuest account without reusing web session cookies (which extensions can't safely access cross-origin).

### Entry Points
Settings → "Browser Extension" (token generation, in the web app); Extension Options page (token entry, in the extension).

### UI Components
Web: Settings page token manager. Extension: `options.html`/`options.js`.

### Backend
`POST/GET /api/extension/tokens`, `DELETE .../:id`, `GET /api/extension/me`.

### Database
`extension_tokens` (SHA-256 hash only, `revoked_at` keeps history rather than deleting).

### Business Logic
Raw token shown exactly once at generation; every subsequent extension request sends `Authorization: Bearer <raw>`, hashed and matched server-side; revocation is instant (`revoked_at` check on every call, plus `last_used_at` bumped on success).

### Validation
n/a beyond standard auth.

### Permissions
Token generation requires an active web session + CSRF; the token itself scopes every subsequent call to its owning `user_id`.

### States
Token list shows metadata only (never the raw value again after first display).

### Edge Cases
Never stored in `chrome.storage.sync` (would leak across devices via Chrome sync) — always `chrome.storage.local`.

### Source Files
`backend/src/extension.js`, `extension/options.js`, `extension/api/jobquest.js`.

### Tests
`backend/test/app.test.js`, `extension/tests/api.test.js`.

### Migration Notes
Supabase has no first-class "long-lived scoped external API token" primitive out of the box — this needs a genuine design decision, not a direct port (see `OPEN_QUESTIONS.md`).

---

## FEATURE-EXT-002: Browser Capture Extension — Multi-tier Job Extraction

### Purpose
Pull structured job-posting data out of an arbitrary web page with minimal user typing.

### Entry Points
Clicking the extension icon on any job posting page.

### UI Components
`extension/popup.html`/`popup.js` (editable pre-filled form).

### Backend
None directly (extraction is client-side); the extracted object maps onto the same `POST /api/extension/applications` payload as any other captured application.

### Database
n/a (extraction itself is stateless).

### Business Logic
5-tier source-quality cascade: (1) schema.org `JobPosting` JSON-LD, (2) site adapters (Greenhouse, Lever, Indeed), (3) semantic rendered DOM headings (scored, scope-aware, excludes hidden/nav/footer/modal elements), (4) page `<meta>` tags (subject to `isGenericTitle()` marketing-slogan/generic-word rejection), (5) low-confidence fallbacks (`document.title`, direct-employer hostname brand only). Never fabricates a missing field. Aggregator/board domains (`AGGREGATOR_AND_BOARD_DOMAINS`) never have their platform branding assigned as `company`; direct employer domains may have their clean domain name attributed as `company` when nothing more specific is found. Title/company collision guard (if title === company, replace title with the dominant DOM heading). Multi-location values are joined with `"; "`. Dual-suffix salary parsing (`$120K/yr - $140K/yr`).

### Validation
n/a (extraction only; the resulting payload is validated identically to any other application create).

### Permissions
n/a.

### States
Blank fields remain blank/null in the popup — user fills them in, never auto-guessed.

### Edge Cases
JobRight.ai is explicitly **not** given a dedicated adapter — it's handled entirely by the hardened generic fallback, by deliberate decision (deferred to a later round pending real telemetry).

### Source Files
`extension/content.js`, `extension/extractors/{jsonld,greenhouse,lever,indeed,generic,index}.js`.

### Tests
`extension/tests/extractor.test.js` (16 cases against HTML fixtures), `extension/fixtures/*.html`.

### Migration Notes
No hardcoded company names or dedicated per-site adapters beyond the 3 named ATSes — preserve this "generic-first, adapter-only-for-proven-high-value-sites" philosophy rather than accreting a long tail of brittle site-specific scrapers.

---

## FEATURE-EXT-003: Browser Capture Extension — Company-First Duplicate Detection

### Purpose
Warn the user before they accidentally log the same posting or role twice via the extension, without penalizing the very common case of applying to multiple distinct roles at the same company.

### Entry Points
Automatically runs on every capture, before the Save action commits.

### UI Components
`extension/popup.js` duplicate banner (info/warning/danger severities).

### Backend
`GET /api/extension/duplicate-check`.

### Database
`applications` (read-only, scoped to `user_id` from the bearer token — cross-user leakage is architecturally impossible).

### Business Logic
4-state classification, evaluated company-first: `EXACT_POSTING` (normalized URL match, blocking), `SAME_ROLE` (normalized company+title match, blocking), `COMPANY_ONLY` (same company, different role — informational only, non-blocking), `NONE`. URL normalization strips `utm_*` params, sorts remaining params, lowercases, strips trailing slash. Text normalization trims/lowercases/collapses whitespace/normalizes unicode hyphens and curly quotes, but **deliberately never collapses seniority or role variants** ("QA Engineer" vs "Senior QA Engineer" stay distinct). Matches bounded to the 3 most recent. A failed check (`CHECK_ERROR`) is always distinguishable from "no duplicate found" — never misrepresented as a clean result.

### Validation
n/a.

### Permissions
Bearer-token-scoped to the calling user only.

### States
`EXACT_POSTING`/`SAME_ROLE` → `[Open Existing] [Save Anyway] [Cancel]`; `COMPANY_ONLY` → informational, normal save proceeds; `NONE` → no banner; `CHECK_ERROR` → non-blocking notice, never blocks save.

### Edge Cases
This is a **different algorithm from the import pipeline's `duplicate()`** (FEATURE-APP-003) — different purpose (real-time capture warning vs. bulk-import de-dup), kept intentionally separate.

### Source Files
`backend/src/extension.js` (classification logic), `extension/popup.js` (banner UI).

### Tests
`backend/test/app.test.js`, `extension/tests/api.test.js` (normalization unit tests), `backend/e2e/extension.spec.js`.

### Migration Notes
Do not attempt to unify this with FEATURE-APP-003's duplicate logic — they solve different problems with different tolerances for false positives.

---

## FEATURE-EXT-004: Browser Capture Extension — Canonical Stage Synchronization

### Purpose
Ensure the extension's stage picker can never submit a stage value the backend doesn't recognize.

### Entry Points
Extension popup's stage `<select>`, populated at popup init.

### Backend
`GET /api/extension/stages` (alias `/api/extension/workflow-actions`).

### Business Logic
The extension has **no independent stage enum** — it fetches `STAGES` live from the backend on every popup open and disables the Save button with an explanatory banner if that fetch fails, rather than falling back to a stale/guessed list. Default stage: `Applied`; pre-application bookmarking uses the canonical `Saved` stage (an earlier, since-fixed defect invented a non-existent `"Bookmarked"` stage that the backend correctly rejected with HTTP 400).

### Source Files
`backend/src/extension.js` (`GET /api/extension/stages`), `backend/src/service.js` (`STAGES` — the single source of truth), `extension/popup.js` (`loadWorkflowStages()`).

### Tests
`backend/test/app.test.js`, `extension/tests/api.test.js` (parity + "Bookmarked" regression tests), `backend/e2e/extension.spec.js`.

### Migration Notes
Any migrated extension (or any second client of any kind) must fetch stages live, never hardcode them — this exact defect class (an invented, out-of-sync client-side enum) already happened once in this codebase's history.

---

## FEATURE-EXT-005: Browser Capture Extension — Duplicate Deep-Linking

### Purpose
When a duplicate is found, take the user directly to the matched application rather than dumping them on the Dashboard.

### Entry Points
"Open Existing" / "View Existing Application" buttons on the duplicate banner.

### Backend
Duplicate-check responses include a stable `id`/`application_id` on every match tier.

### Business Logic
`buildSecureJobQuestUrl(instanceUrl, pathAndQuery)` validates the instance URL is `http:`/`https:` and binds navigation strictly to that URL's own origin — rejects `javascript:`, `data:`, and `//host`-style open-redirect escapes. Produces `${origin}/?application=${id}`. The web app's `resolveInitialRoute()` (see `ROUTE_SCREEN_INVENTORY.md`) picks this up on load or immediately post-login, and `renderDetail()` falls back gracefully (toast + redirect to Applications) if the target was deleted.

### Source Files
`extension/api/jobquest.js` (`buildSecureJobQuestUrl`), `frontend/src/app.js` (`resolveInitialRoute`, `renderDetail`'s 404 handling), `backend/src/extension.js` (stable ID exposure).

### Tests
`extension/tests/api.test.js`, `backend/e2e/extension.spec.js` (exact/same-role/company-only navigation, unauthenticated deep-link preservation through PIN login, deleted-target fallback).

### Migration Notes
The open-redirect protection (`buildSecureJobQuestUrl`'s origin binding) is a real security control, not incidental — reproduce it exactly in any migrated extension/deep-link mechanism.

---

## FEATURE-MGR-001: Manager Oversight (Dashboard, User Management, Audit)

### Purpose
Let a `MANAGER` role account view aggregate/individual user activity for oversight purposes, without silently gaining blanket access to any user's data.

### Entry Points
Manager-only nav section (role-gated).

### UI Components
`renderDashboard(true)` (Manager Dashboard), `renderUsers()`, `renderAudit()`.

### Backend
`GET /api/manager/dashboard`, `GET/PATCH /api/manager/users(/:id)`, `GET /api/manager/audit`.

### Database
Reads across `users`, `applications`, `import_batches`; writes `audit_log` on role/status changes.

### Business Logic
A manager only ever acts on another user's data through an **explicit** `user_id`/`target_user_id` parameter — never implicitly, never via a "manager sees everything" blanket query. The last active manager cannot be deactivated or demoted (a hard server-side safeguard, not just a UI affordance).

### Validation
Role escalation only through this endpoint or the environment-variable-driven seed script — never client-settable elsewhere.

### Permissions
Manager-only for all 4 endpoints.

### States
Standard list/detail; audit log is read-only, no client-side write path exists at all.

### Edge Cases
None beyond the last-manager safeguard above.

### Source Files
`backend/src/server.js` (`/api/manager/dashboard`, `/api/manager/users`), `backend/src/advanced.js` (`/api/manager/audit`).

### Tests
`backend/test/app.test.js`.

### Migration Notes
The "manager cross-user access via explicit parameter only" pattern does not map cleanly onto RLS alone — needs a `SECURITY DEFINER` function or equivalent server-side check in the migrated system (see `docs/BACKEND_SCHEMA.md` §Supabase RLS).

---

## FEATURE-SET-001: Settings (Appearance, Tags, Extension Tokens) + Profile

### Purpose
Per-user preference management and account overview.

### Entry Points
Sidebar "Settings"; Settings → "Profile".

### UI Components
`renderSettings()`, `renderProfile()`.

### Backend
`GET/PATCH /api/settings`, `GET/POST/PATCH /api/tags`, extension token endpoints (see FEATURE-EXT-001).

### Database
`users` (preference columns), `tags`.

### Business Logic
Settings sub-nav routes some items to their own full pages (Dashboard Settings, Goal Settings, Reminder Settings) rather than rendering them inline.

### Validation
Theme/week-start/follow-up-delay fields are CHECK-constrained enums at the DB layer.

### Permissions
Owner-scoped (own settings only).

### States
Newly-generated extension token shown exactly once with a copy button (clipboard API with an `execCommand` fallback).

### Edge Cases
**"PIN & Security" tab has no real change-PIN form — it only shows a toast message.** This is a genuine functional gap, not a design choice, and is a strong `CHANGE_REQUESTS.md` candidate for the migrated system.

### Source Files
`frontend/src/app.js` (`renderSettings`, `renderProfile`).

### Tests
`backend/test/app.test.js` (settings PATCH), `backend/e2e/jobquest.spec.js` (settings/forms/reports visual regression).

### Migration Notes
Build a real PIN-change flow in the migrated system rather than porting the toast-only stub.
