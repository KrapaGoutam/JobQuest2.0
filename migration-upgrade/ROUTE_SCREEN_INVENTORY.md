# Route / Screen Inventory

CURRENT STATE. Source: full read of `frontend/src/app.js` (3,671 lines, confirmed
complete), `application-table.js`, `application-preview.js`, `dashboard-config.js`,
`ui-utils.js`, `icons.js`, and every `features/*/format.js` module. STATUS: CONFIRMED.

## Navigation model (important context before reading the table below)

There is **no URL-based router**. `go(page)` sets `state.page` and dispatches through
an in-memory `routes` object keyed by page id, each a render function. The only
deep-link exceptions, handled by `resolveInitialRoute()`, evaluated in this order:

1. `?application=<id>` or `?id=<id>` (digits only) → `detail:<id>`
2. `?page=<name>` → returned as-is
3. URL hash `#detail:<id>` or `#application-<id>` → `detail:<id>`
4. Fallback: `"dashboard"`

`resolveInitialRoute()` is called from the app bootstrap (after `GET /api/auth/me`
succeeds) and from the post-login/register/PIN-transition success handler — this is
how the browser extension's "Open Existing" deep link survives an unauthenticated
session (login first, then land on the target application).

Unknown page ids throw `"Page not found"`, caught by `go()`'s own try/catch — the
app's *only* page-level error boundary.

## Sidebar navigation structure

Declared once as a flat `nav` array, then re-grouped into collapsible `<details>`
sections (open state persisted per-section to `localStorage`):

| Group | Items |
|---|---|
| Primary (open by default) | Dashboard, Applications, Add |
| Activity | Calendar, Tasks, Habits, Notes, Reminders, Interviews, Rejections, Follow-Ups, Networking |
| Career Assets | Resumes, Bulk Import |
| Insights | Analytics, Goal History, Aging, Stage Analytics, Exports |
| Settings | Settings |
| Manager (role-gated, non-collapsible) | Manager Dashboard, User Management, Audit History |

**CONFIRMED GAP**: `imports` ("Import History") is declared in the flat `nav` array
but is not listed in *any* group's id array — it renders as a stray, un-sectioned
button, not inside a `<details>` group. Flag for the migration's nav model (either
fix the grouping or make it intentional).

**Two screens have no nav entry at all**, reachable only by button/deep link:
`profile` (via Settings → "Profile") and `goals` (via Settings → "Goal Settings", or
a Calendar goal-event click).

Topbar: mobile hamburger (opens a drawer with focus trap), desktop collapse toggle
(persisted via `PATCH /api/navigation/preferences`), page title, global "Quick Add"
button. Nav badges populated from `GET /api/navigation/counts`. Keyboard shortcuts:
`/` (focus search, applications page only), `q` (quick-add), `g d`/`g a`/`g c`
(chorded nav to dashboard/applications/calendar), `Escape` (close drawer/dialog).

## Dashboard widget registry (30 widgets, `dashboard-config.js`)

| id | Name | Kind | Tier |
|---|---|---|---|
| applications-today | Applications Today | kpi | pipeline |
| applications-week | Applications This Week | kpi | pipeline |
| applications-month | Applications This Month | kpi | pipeline |
| active-applications | Active Applications | kpi | pipeline |
| follow-ups-due | Follow-Ups Due | kpi | actions |
| overdue-follow-ups | Overdue Follow-Ups | kpi | actions |
| upcoming-interviews | Upcoming Interviews | kpi | actions |
| responses | Responses | kpi | pipeline |
| rejections | Rejections | kpi | pipeline |
| ghosted | Ghosted | kpi | pipeline |
| offers | Offers | kpi | pipeline |
| acceptances | Acceptances | kpi | pipeline |
| daily-goals | Daily Goal Progress | goal | pipeline |
| daily-goal-chart | Daily Target vs Actual | chart | pipeline |
| weekly-goals | Weekly Goal Progress | goal | pipeline |
| goal-comparison | Goal Achievement Comparison | goal | pipeline |
| activity-chart | Application Activity Chart | chart | context |
| job-funnel | Job Funnel | chart | pipeline |
| applications-stage | Applications by Stage | chart | pipeline |
| applications-source | Applications by Source | insight | context |
| applications-work-arrangement | Applications by Work Arrangement | insight | context |
| resume-performance | Resume Performance | insight | context |
| goal-trends | Goal Trends | goal | context |
| reminder-center | Reminder Center | action | actions |
| aging-applications | Aging Applications | insight | context |
| stage-duration | Stage-Duration Summary | insight | context |
| recent-activity | Recent Activity | activity | context |
| pinned-applications | Pinned Applications | action | actions |
| health-summary | Application Health Summary | insight | actions |
| calendar-preview | Calendar Preview | action | actions |

Drill-through-enabled widgets (11 of 30, `DASHBOARD_DRILL` map): applications-today,
active-applications, follow-ups-due, overdue-follow-ups, upcoming-interviews,
rejections, ghosted, offers, acceptances, reminder-center, calendar-preview. Notably
**`aging-applications` has no drill-through** despite the standalone Aging Report
page covering the same data — a gap worth closing in the migrated UI.

## Screen-by-screen inventory

| Screen | `go()` id | Entry point(s) | Render fn (app.js) | Key API calls | Notes |
|---|---|---|---|---|---|
| Auth (login/register/PIN transition) | none (pre-auth) | Bootstrap when `/api/auth/me` fails; `logout()` | `authView()` | `POST /api/auth/login`, `/register`, `/transition-pin`, `/logout`, `GET /api/auth/me` | 3 modes toggled in place; PIN auto-submits at 4 digits |
| Dashboard (User) | `dashboard` | Default landing; sidebar; `g d`; drill-throughs | `renderDashboard(false)` | `GET /api/dashboard/layout`, `/api/dashboard`, `/api/analytics/{aging,stage-duration,source,activity}`, `/api/resumes/analytics`, `/api/reminders`, `/api/calendar`, `/api/goals/{comparison,progress-series}` (parallel `Promise.all`) | Tiered widget grid (actions/pipeline/context); date-range selector |
| Dashboard (Manager) | `manager` | Manager nav section; dashboard view-switcher | `renderDashboard(true)` (via `renderManager()`) | same + `GET /api/manager/dashboard`, `/api/manager/users` | User-scope selector filters all widgets |
| Dashboard Settings (Customize) | n/a (in-place) | "Customize Dashboard" button on either dashboard | `renderDashboardSettings()` | `PUT /api/dashboard/layout` | Drag+keyboard (`Alt+Arrow`) reorder; Select All/indeterminate |
| Applications (Table + Kanban) | `applications` | Sidebar; `g a`; most drill-throughs | `renderApplications(params)` | `GET /api/application-view-preferences`, `/api/applications/kanban` or `/query`, `/api/saved-views`, `/api/dashboard`; `PUT` view prefs; `PATCH .../stage`; `GET .../detail` (preview) | 14-column table; quick filters; advanced filter dialogs; saved views; CSV/XLSX/JSON export dialog |
| Application Preview (drawer) | n/a (dialog overlay) | "Preview" button on a row/card | `createApplicationPreview()` (application-preview.js) | (reuses fetched detail) | "Edit" → `add` route; "Open full record" → `detail:id` |
| Add / Edit Application | `add` | Sidebar; preview drawer "Edit"; detail page inline edit | `renderAdd()` / `applicationForm()` | `POST /api/applications`, `PATCH /api/applications/:id`, `GET /api/manager/users` | Multi-fieldset form |
| Quick Add | `quick-add` | Global topbar button; `q` shortcut | `renderQuickAdd()` | `POST /api/applications` | Minimal field subset; navigates to new detail on success |
| Application Detail | `detail:<id>` (special-cased, not in `routes` map) | Any row/card click, drill-throughs, deep links | `renderDetail(id)` + many sub-renderers | `GET .../detail`, `POST .../pin|archive|restore|next-action`, `DELETE`, `PATCH .../stage`, `GET/POST .../timeline`, checklist CRUD, tasks/notes panels | **Known gap: `detailTabs()` renders an 8-item `role="tablist"` but only Checklist is actually panel-switched — the rest are inert buttons over stacked sections.** Unique 404 handling: redirects to Applications + toast instead of the generic error boundary |
| Bulk Import | `bulk` | Sidebar (Career Assets) | `renderBulk()` | `POST /api/import/preview`, `POST /api/import`, `GET /api/manager/users` | Import button disabled until preview finds ≥1 valid row |
| Import History | `imports` | Sidebar (ungrouped — see nav gap) | `renderImports()` | `GET /api/import/history`, `/api/import/history/:id/rows` | |
| Interviews / Rejections / Follow-Ups / Networking (generic tracker) | `interviews`, `rejections`, `follow_ups`, `networking_contacts` | Sidebar (Activity); Detail page quick-actions; Calendar clicks | `renderTracker(type)` | `GET/POST/PATCH/DELETE /api/{type}`, `GET /api/applications?page_size=100&archived=all` (app picker), `GET /api/follow-ups/suggest` (follow-ups only) | Shared field-metadata table (`trackerMeta`); `relationship_type` is a `<datalist>`, not a hard enum |
| Resumes | `resumes` | Sidebar (Career Assets) | `renderResumes()` | `GET /api/resumes`, `/api/resumes/analytics`, `POST /api/resumes`, `PATCH .../:id`, `POST .../:id/clone`, `GET .../compare` | No file upload — "secure metadata only" |
| Tasks | `tasks` | Sidebar (Activity); Detail page "Add Task" | `renderTasks()` | `GET /api/tasks?view=`, `POST`, `PATCH` (toggle), `DELETE` | 4 view tabs: today/upcoming/backlog/completed |
| Habits | `habits` | Sidebar (Activity) | `renderHabits()` | `GET /api/habits?view=`, `.../:id/history`, `PUT .../progress`, `PATCH`, `DELETE` | 3 sub-views (today/all/history); **edit uses chained native `prompt()` dialogs, no real form** |
| Journal & Notes (list + editor) | `notes` | Sidebar (Activity); Detail page "Add Note" | `renderNotes()` / `renderNoteEditor()` | `GET /api/notes`, `GET .../:id`, `POST`, `PATCH`, `DELETE` | Search debounced 300ms; plain-text only |
| Reminder Center + Categories | `reminders` | Sidebar (Activity); Calendar clicks | `renderReminders()` / `renderCategories()` | `GET/POST/PATCH/DELETE /api/reminders`, `/api/reminder-categories` | Categories reached only via in-page button, not its own route |
| Calendar | `calendar` | Sidebar (Activity); `g c` | `renderCalendar()` | `GET /api/calendar?view=` | Month/week/agenda views; event click routes by type |
| Goal Settings | `goals` (no nav entry) | Settings page; Calendar goal-event click | `renderGoals()` | `GET/POST /api/goals/settings` | Effective-dated targets |
| Goal History | `goal-history` | Sidebar (Insights) | `renderGoalHistory()` | `GET /api/goals/history`, `/api/goals/comparison` | Streaks, achievement-rate summary |
| Aging Report | `aging` | Sidebar (Insights) | `renderAging()` | `GET /api/analytics/aging` | 5 aging bands; rows link to `detail:id` |
| Stage Analytics | `stage-analytics` | Sidebar (Insights) | `renderCompleteStageAnalytics()` | `GET /api/analytics/stage-duration`, `/stage-transitions` | Per-stage duration chart + lifecycle transition metrics |
| Analytics | `analytics` | Sidebar (Insights) | `renderAnalytics()` | `GET /api/analytics/funnel`, `/source`, `/resume` | Rates always shown as `n/d (pct%)`, never bare percentage |
| Exports | `exports` | Sidebar (Insights) | `renderExports()` | none (static download links) | Links to 13 CSV endpoints + 1 JSON endpoint |
| Settings | `settings` | Sidebar (own group) | `renderSettings()` | `GET/PATCH /api/settings`, `GET/POST/PATCH /api/tags`, `GET/POST/DELETE /api/extension/tokens` | **"PIN & Security" tab has no real form — just a toast.** Extension token UI embedded here |
| Profile | `profile` (no nav entry) | Settings → "Profile" | `renderProfile()` | none (reads `state.user`) | Read-only |
| User Management | `users` | Manager nav section | `renderUsers()` | `GET /api/manager/users`, `PATCH .../:id` | Promote/demote, activate/deactivate (last-manager safeguard server-side) |
| Audit History | `audit` | Manager nav section | `renderAudit()` | `GET /api/manager/audit` | Read-only |

## Cross-cutting frontend patterns (relevant to a React/TS rebuild)

- **Global API wrapper** (`api()`): attaches CSRF header, throws on non-2xx using
  `error`/`errors.join(", ")`/`"Request failed"` in that priority order.
- **Error handling layers**: (1) `go()`'s try/catch = page-level boundary; (2)
  per-form inline `errorBox()` divs; (3) `toast()` for transient/optimistic-action
  failures with UI rollback; (4) Application Detail's unique 404-redirect-to-list
  behavior.
- **Optimistic UI + rollback**: checklist toggles, task toggles, habit
  toggles/increments — always roll back and toast on failure, never silently fail.
- **Accessibility patterns to preserve**: `aria-pressed` on toggle-button groups,
  `aria-expanded` on collapsibles, `aria-sort` on sortable headers, `aria-checked=
  "mixed"` for indeterminate selects, `role="status" aria-live="polite"` on dynamic
  counters, explicit `tabindex="0"` on the shared table wrapper (a deliberate WCAG
  2.1.1/2.1.3 fix, not an oversight).
- **Drag-and-drop**: Kanban cards between stage columns; Dashboard Settings widget
  rows — both have an accessible keyboard/button alternative, never DnD-only.
- **CSP constraint**: no inline `style="..."` attributes anywhere — all
  value-driven bars/charts are raw SVG geometry attributes, not CSS. A migration
  should either preserve this CSP posture or make relaxing it an explicit decision.

## Known functional gaps (carry into `IMPLEMENTATION_PLAN.md` / `OPEN_QUESTIONS.md`)

1. `imports` nav item is ungrouped/orphaned in the sidebar.
2. Application Detail's tab strip is visually a tablist but only "Checklist" is
   actually panel-switched — everything else is stacked, not tabbed.
3. Settings → "PIN & Security" has no real change-PIN UI, only a toast message.
4. Habit editing is a chain of native `prompt()` dialogs, not a form.
5. `aging-applications` dashboard widget has no drill-through to the Aging Report.

These are pre-existing UX gaps in the current app, not migration-introduced defects
— documented here so the migrated system either intentionally fixes them (a
`CHANGE_REQUESTS.md` candidate) or intentionally reproduces them, but never loses
track of the decision either way.
