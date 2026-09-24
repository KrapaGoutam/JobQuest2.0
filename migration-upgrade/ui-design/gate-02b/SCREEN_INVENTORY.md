# JobQuest 2.0 · Gate 02B Screen Inventory & Coverage Audit

| | |
|---|---|
| **Status** | **PROPOSED** — Awaiting review and approval |
| **Audit Date** | 2026-09-24 |
| **Authoritative Baseline** | Direction D · JobQuest Hybrid (`../approved/`) |
| **Coverage Scope** | 100% of P0 and P1 product capabilities; complete responsive viewports |

---

## 1. Definitive Feature & Route Coverage Matrix

This matrix cross-references `FEATURE_CATALOG.md`, `ROUTE_SCREEN_INVENTORY.md`, `docs/PRD.md`, `docs/APP_FLOW.md`, `BUSINESS_LOGIC_CATALOG.md`, and `GATE_01_ARCHITECTURE_PROPOSAL.md` against the Gate 02B mockups and specifications.

### Classification Key
- **DESIGNED:** Fully rendered in high-fidelity interactive mockups and verified with screenshots.
- **SPECIFIED:** Detailed interaction, form, state, and responsive behavior formally specified in Gate 02B specs.
- **DEFERRED:** Explicitly postponed to post-migration milestones (P2/P3) with documented rationale.
- **BLOCKED:** Blocked on external decisions or infrastructure (none currently blocking Gate 02B).
- **NOT REQUIRED:** Replaced by newer architectural models (e.g. legacy PIN auth retired by ADR-008).

### P0 / P1 Core Feature Audit

| Feature Area | Feature ID | Priority | Legacy Route / Entry | JQ2 Status | Mockup Frame(s) | Screenshot Reference | Notes |
|---|---|---|---|---|---|---|---|
| **Authentication: Login** | `FEATURE-AUTH-001` | P0 | `authView()` | DESIGNED / SPECIFIED | A1, A2, A3, A11 | `A2-login-error-dark.png`, `A11-A13-auth-mobile.png` | Username + password; PIN retired; generic error; 5-min lockout |
| **Authentication: Registration** | `FEATURE-AUTH-001` | P0 | `authView()` | DESIGNED / SPECIFIED | A4, A12 | `A4-registration-light.png`, `A11-A13-auth-mobile.png` | 3-step wizard; username/password required; email/phone optional |
| **Authentication: Recovery Codes** | `FEATURE-AUTH-001` | P0 | New (CR-007) | DESIGNED / SPECIFIED | A5, A6, A7, A13 | `A11-A13-auth-mobile.png` | 10 single-use codes; shown once; mandatory confirmation step |
| **Authentication: Account Recovery** | `FEATURE-AUTH-001` | P0 | New (CR-007) | DESIGNED / SPECIFIED | A8, A9 | `A11-A13-auth-mobile.png` | Recovery using code + username; immediate password reset |
| **Authentication: Legacy Claim** | `FEATURE-AUTH-001` | P0 | New (ADR-017) | DESIGNED / SPECIFIED | A10 | — | Reclaim legacy account using operator claim code; set password |
| **Dashboard (User)** | `FEATURE-DASH-001` | P0 | `dashboard` | DESIGNED / SPECIFIED | Direction D (D1, D2) | `approved/screenshots/D1`, `D2` | Action-first: Overdue & Due today queue, interviews, stale review |
| **Dashboard (Manager)** | `FEATURE-DASH-001` | P0 | `manager` | DESIGNED / SPECIFIED | Direction D (D7, D8) | `approved/screenshots/D7`, `D8` | Target user filter; workspace aggregate; cross-member oversight |
| **Applications: Table View** | `FEATURE-APP-002` | P0 | `applications` | DESIGNED / SPECIFIED | Direction D (D3, D4), TB1 | `TB1-tablet-applications-light.png` | Default view; dense sortable table; virtualized scroll; bulk bar |
| **Applications: Preview Pane** | `FEATURE-APP-002` | P0 | `applications` (preview) | DESIGNED / SPECIFIED | Direction D (D4) | `approved/screenshots/D4` | 440px persistent pane (≥1680px); drawer (<1680px / tablet) |
| **Applications: Detail View** | `FEATURE-APP-001` | P0 | `detailTabs()` | DESIGNED / SPECIFIED | Direction D (D5, D6), TB2 | `TB2-tablet-detail-dark.png` | 8-pip stage bar; Timeline/Job posting/Notes tabs; structured rail |
| **Applications: Create (Full)** | `FEATURE-APP-001` | P0 | `add` | DESIGNED / SPECIFIED | C1, C2, TB3, C12 | `C1-create-application-light.png`, `C2-create-manager-dark.png` | Progressive 5-section form; only Co & Role required; snapshot |
| **Applications: Quick Add** | `FEATURE-APP-001` | P0 | `quick-add` | DESIGNED / SPECIFIED | C3 | — | Triggered by `Q` shortcut or header button; minimal modal |
| **Applications: Edit Details** | `FEATURE-APP-001` | P0 | `edit` | DESIGNED / SPECIFIED | C7 | — | In-place editing of metadata; dirty state; locked workflow |
| **Applications: Duplicate Detection** | `FEATURE-APP-003` | P1 | BL-002 / BL-003 | DESIGNED / SPECIFIED | C4, C5, C6 | `C5-duplicate-probable-dark.png` | 3 tiers: Strong (URL/ReqID), Probable (Co+Role), Possible |
| **Workflow: Stage Transitions** | `FEATURE-APP-001` | P0 | `applications` | DESIGNED / SPECIFIED | C8, C13 | `C8-move-stage-menu-light.png` | 8 pipeline stages; header dropdown; logs timeline event |
| **Workflow: Outcome Transitions** | `FEATURE-APP-001` | P0 | `CONSEQUENTIAL` | DESIGNED / SPECIFIED | C9 | `C9-close-outcome-dark.png` | 5 outcomes; mandatory confirmation; reason note; unlinks next action |
| **Workflow: Next Action (Done, Next)** | `FEATURE-APP-001` | P0 | `next-action` | DESIGNED / SPECIFIED | C10 | — | Marks current action complete; prompts immediate next step |
| **Applications: Soft Archive / Restore** | `FEATURE-APP-001` | P0 | `archive` | DESIGNED / SPECIFIED | V7 | `V8-saved-view-light.png` | Retains full history; excluded from active views; 10s undo toast |
| **Applications: Hard Delete** | `FEATURE-APP-001` | P0 | `delete` | DESIGNED / SPECIFIED | C11 | `C11-hard-delete-light.png` | Only available on archived records; typed "DELETE" confirmation |
| **Applications: Board (Kanban)** | `FEATURE-APP-002` | P0 | `applications` (board) | DESIGNED / SPECIFIED | V1, V2, V3 | `V1-board-light.png` | 15 cards/lane + show more; drag & drop + keyboard move |
| **Applications: Calendar View** | `FEATURE-CAL-001` | P1 | `calendar` | DESIGNED / SPECIFIED | V4, V5 | `V4-app-calendar-light.png`, `V5-calendar-dark.png` | Month/week grid; application events & global scheduled items |
| **Applications: Timeline View** | `FEATURE-APP-002` | P1 | `timeline` | DESIGNED / SPECIFIED | V6 | `V6-timeline-light.png` | Cross-application chronological Gantt view |
| **Contacts / Networking: List** | `FEATURE-NET-001` | P1 | `networking_contacts` | DESIGNED / SPECIFIED | N1, N2, N6 | `N2-contacts-manager-dark.png`, `N6-N7-contacts-mobile.png` | Card grid with avatars, company, roles, follow-up status |
| **Contacts: Detail View** | `FEATURE-NET-001` | P1 | `networking_contacts` | DESIGNED / SPECIFIED | N3, N4, N7 | `N3-contact-detail-light.png`, `N6-N7-contacts-mobile.png` | Activity timeline, linked applications, direct communication links |
| **Contacts: Create / Edit** | `FEATURE-NET-001` | P1 | `networking_contacts` | DESIGNED / SPECIFIED | N5 | — | Full contact creation; link to company and application |
| **Tasks & Follow-ups: Queue** | `FEATURE-TASK-001` | P2 | `tasks`, `reminders` | DESIGNED / SPECIFIED | T1, T2, T5 | `T2-tasks-panel-dark.png`, `T5-T6-tasks-mobile.png` | Unified queue: Overdue, Today, Upcoming, Backlog, Completed |
| **Tasks: Recurring Tasks** | `FEATURE-TASK-001` | P2 | New (CR-015) | DESIGNED / SPECIFIED | T3, T6 | `T3-new-recurring-task-light.png`, `T5-T6-tasks-mobile.png` | Daily, weekly, monthly intervals; automatic next-instance creation |
| **Tasks: Follow-up Reminders** | `FEATURE-REM-001` | P1 | `reminders`, `follow-ups` | DESIGNED / SPECIFIED | T4 | — | Linked to application/interview/contact; suggested dates |
| **Interviews: List & Agenda** | `FEATURE-INT-001` | P1 | `interviews` | DESIGNED / SPECIFIED | I1, I2, I5 | `I2-interview-panel-dark.png` | Date tiles; upcoming vs needs outcome; prep status pills |
| **Interviews: Schedule Dialog** | `FEATURE-INT-001` | P1 | `interviews` | DESIGNED / SPECIFIED | I3 | `I3-schedule-interview-light.png` | Date/time, format, round, prep notes, questions expected |
| **Interviews: Record Outcome** | `FEATURE-INT-001` | P1 | `interviews` | DESIGNED / SPECIFIED | I4 | `I4-record-interview-dark.png` | Result, questions asked, performance notes, thank-you prompt |
| **Habits Tracker** | `FEATURE-HABIT-001` | P2 | `habits` | DESIGNED / SPECIFIED | H1, H2, H3 | `H1-habits-light.png`, `H3-habits-mobile.png` | Today/history; boolean & counted; real edit form (CR-002) |
| **Journal / Notes** | `FEATURE-NOTE-001` | P2 | `notes` | DESIGNED / SPECIFIED | J1, J2, J3 | `J1-journal-light.png` | List + editor; 5 note types; optional application link; search |
| **Analytics: Overview & Funnel** | `FEATURE-ANALYTICS-001` | P1 | `analytics` | DESIGNED / SPECIFIED | Y1, Y2, Y5 | `Y1-analytics-light.png`, `Y2-analytics-manager-dark.png` | Historical funnel ("ever reached"); current pipeline; KPI rates |
| **Analytics: Stage Timing** | `FEATURE-ANALYTICS-001` | P1 | `stage-analytics` | DESIGNED / SPECIFIED | Y3 | `Y3-stage-timing-light.png` | Duration per stage; sample size floor; median days to response |
| **Analytics: Aging Report** | `FEATURE-ANALYTICS-001` | P1 | `aging` | DESIGNED / SPECIFIED | Y4 | — | 5 aging bands; days inactive; dashboard drill-through (CR-005) |
| **Workspace: Member Roster** | `FEATURE-MGR-001` | P1 | `users` | DESIGNED / SPECIFIED | W1, W11 | `W1-members-light.png` | Roster table; User/Manager roles; invite, suspend, remove |
| **Workspace: Invites & Creation** | `FEATURE-MGR-001` | P1 | New (CR-008) | DESIGNED / SPECIFIED | W2, W7, W8 | — | Multi-use invite codes; create workspace; join workspace modal |
| **Workspace: Safeguards** | `FEATURE-MGR-001` | P1 | New (CR-008) | DESIGNED / SPECIFIED | W3, W4 | — | Last-manager protection; explicit member deletion audit |
| **Workspace: Settings & Workflow** | `FEATURE-MGR-001` | P1 | New (ADR-011) | DESIGNED / SPECIFIED | W5, W6, W9 | `W9-workflow-concept-light.png` | Workspace rename; workflow concept (immutable keys) |
| **Workspace: Audit History** | `FEATURE-MGR-001` | P1 | `audit` | DESIGNED / SPECIFIED | W10 | — | Read-only log of sensitive & cross-user manager actions |
| **Settings: Profile & Account** | `FEATURE-SET-001` | P1 | `profile`, `settings` | DESIGNED / SPECIFIED | S1, S2, S4, S11, S12 | `S2-security-dark.png` | Display name, timezone, email/phone verification, password change |
| **Settings: Recovery Codes** | `FEATURE-SET-001` | P1 | New (CR-007) | DESIGNED / SPECIFIED | S3 | — | Regenerate recovery codes modal; invalidates previous set |
| **Settings: Appearance** | `FEATURE-SET-001` | P1 | `settings` (theme) | DESIGNED / SPECIFIED | S5 | `S5-appearance-light.png` | System / Light / Dark selector; instant theme switch |
| **Settings: Reminders & Categories** | `FEATURE-REM-001` | P1 | `settings` (reminders) | DESIGNED / SPECIFIED | S6 | — | Default follow-up intervals (5d applied, 1d interview) |
| **Settings: Extension Tokens** | `FEATURE-EXT-001` | P2 | `013_extension_tokens` | DESIGNED / SPECIFIED | S7, S8, S9, S10 | `S9-token-shown-once-dark.png` | Scoped, expiring tokens; shown once; workspace bound; revoke |
| **Browser Extension: Popup** | `FEATURE-EXT-002` | P2 | `extension/popup.html` | DESIGNED / SPECIFIED | X1–X14 | `X-extension-popup-states.png` | Full 14-state popup matrix; extraction; duplicates; offline |
| **Import: Bulk CSV/XLSX** | `FEATURE-IMPEXP-001` | P1 | `bulk` | DESIGNED / SPECIFIED | E1, E2, E3, E4, E5, E6 | `E2-import-manager-dark.png`, `E4-import-review-light.png` | 4-step wizard; column mapping; duplicate resolution; error CSV |
| **Export: Complete Data** | `FEATURE-IMPEXP-001` | P1 | `exports` | DESIGNED / SPECIFIED | E7, E8, E9, V9 | — | Domain CSVs + JSON; injection prevention; permission gating |
| **Global Search** | `FEATURE-APP-002` | P1 | New (CR-017) | DESIGNED / SPECIFIED | G1, G2, G3 | `G1-search-dropdown-light.png` | Quick search dropdown (`/`); full results page; type filters |
| **Cross-Cutting: System States** | Cross-cutting | P0 | — | DESIGNED / SPECIFIED | Q1, Q2, Q3, Q4, Q5 | `Q3-errors-dark.png`, `Q5-states-sheet-dark.png` | Skeletons, empty views, 404, offline, permission denied, sheets |
| **Career Assets: Resumes** | `FEATURE-RES-001` | P1 | `resumes` | DESIGNED / SPECIFIED | R1, R2 | `R1-resumes-light.png` | Version list; revision history; compare versions; analytics |
| **Career Assets: Goals** | `FEATURE-GOAL-001` | P1 | `goals` | DESIGNED / SPECIFIED | R3 | — | Weekly/daily targets; live actuals vs frozen weekly snapshots |
| **Responsive: Tablet** | Cross-cutting | P0 | Tablet viewport | DESIGNED / SPECIFIED | TB1, TB2, TB3 | `TB1-tablet-applications-light.png`, `TB2-tablet-detail-dark.png` | 64px icon rail; condensed table; single-column detail accordions |
| **Responsive: Mobile** | Cross-cutting | P0 | Mobile viewport | DESIGNED / SPECIFIED | A11–A13, C12–C13, N6–N7, T5–T6, I5, H3, J3, Y5, W11, S11–S12, G3, V3 | 11 mobile captures | 5-tab bar; card lists; swipeable board; bottom sheets |

---

## 2. Mockup File & Frame Catalog

### `01-auth.html` · Authentication & Account Recovery (13 Frames)
- **A1**: Sign In · Default Desktop (1440px · Light)
- **A2**: Sign In · Error State (1440px · Dark) — Generic error prevents username enumeration
- **A3**: Sign In · Lockout State (1440px · Light) — 5-minute lockout after 5 consecutive failures
- **A4**: Registration · Step 1 Account Details (1440px · Light) — Username/password required, email/phone optional
- **A5**: Registration · Step 2 Recovery Codes (1440px · Light) — 10 single-use codes shown once
- **A6**: Registration · Step 2 Recovery Codes (1440px · Dark)
- **A7**: Registration · Step 3 Confirm Codes (1440px · Light) — Mandatory confirmation of saved codes
- **A8**: Account Recovery · Entry (1440px · Light) — Username + single-use recovery code
- **A9**: Account Recovery · Set New Password (1440px · Dark)
- **A10**: Claim Account · JobQuest 1.0 Migration (1440px · Light) — Operator-issued claim code
- **A11**: Sign In · Mobile Viewport (390px · Light)
- **A12**: Registration · Step 1 Mobile Viewport (390px · Light)
- **A13**: Recovery Codes · Mobile Viewport (390px · Dark)

### `02-application-create-edit.html` · Application CRUD & Workflow (13 Frames)
- **C1**: New Application · Personal Workspace (1440px · Light) — Progressive 5-section form
- **C2**: New Application · Manager Workspace (1440px · Dark) — Explicit member assignment
- **C3**: Quick Add Application (1440px · Light) — Keyboard shortcut modal (`Q`)
- **C4**: Strong Duplicate Warning (1440px · Light) — Same Job URL + Requisition ID match
- **C5**: Probable Duplicate Warning (1440px · Dark) — Same Company + Role match
- **C6**: Possible Duplicate Notice (1440px · Light) — Same Company, different role
- **C7**: Edit Application Details (1440px · Light) — In-place form, dirty tracking, validation
- **C8**: Move Stage Dropdown (1440px · Light) — 8-stage pipeline selector
- **C9**: Close with Outcome Confirmation (1440px · Dark) — Outcome selection + reason note
- **C10**: Done, Set Next Action Dialog (1440px · Light) — Mark action done and schedule next
- **C11**: Hard Delete Confirmation (1440px · Light) — Requires typing "DELETE" on archived item
- **C12**: Quick Create · Mobile Viewport (390px · Light) — Bottom sheet minimal capture
- **C13**: Move Stage Sheet · Mobile Viewport (390px · Dark) — Bottom sheet stage picker

### `03-contacts.html` · Contacts & Networking (7 Frames)
- **N1**: Contacts List · User View (1440px · Light) — Grid of contacts with avatars & tags
- **N2**: Contacts List · Manager View (1440px · Dark) — Includes Owner filter & column
- **N3**: Contact Detail Drawer (1440px · Light) — Activity, linked applications, quick actions
- **N4**: Contact Detail Drawer (1440px · Dark)
- **N5**: New Contact Modal (1440px · Light) — Create from application or global
- **N6**: Contacts List · Mobile Viewport (390px · Light)
- **N7**: Contact Detail · Mobile Viewport (390px · Dark) — One-tap dial, email, LinkedIn

### `04-tasks.html` · Tasks, Follow-ups & Reminders (6 Frames)
- **T1**: Tasks Queue · Today View (1440px · Light) — Overdue, Today, Upcoming grouped list
- **T2**: Tasks with Detail Panel (1440px · Dark) — Selected task details, linked records
- **T3**: New Recurring Task Modal (1440px · Light) — Cadence rules (Daily, Weekly, Monthly)
- **T4**: New Follow-up Modal (1440px · Dark) — Application follow-up with smart date chips
- **T5**: Tasks Queue · Mobile Viewport (390px · Light)
- **T6**: New Task Sheet · Mobile Viewport (390px · Dark)

### `05-interviews.html` · Interviews Management (5 Frames)
- **I1**: Interviews List & Agenda (1440px · Light) — Date tiles, status badges, prep indicators
- **I2**: Interview Detail Panel (1440px · Dark) — Participants, prep notes, expected questions
- **I3**: Schedule Interview Modal (1440px · Light) — Date/time, format, round, stage move option
- **I4**: Record Interview Outcome Modal (1440px · Dark) — Result, questions asked, thank-you note
- **I5**: Interview Day-of View · Mobile Viewport (390px · Light) — One-tap join video & review notes

### `06-habits-journal.html` · Habits & Journal (6 Frames)
- **H1**: Habits Tracker · Today View (1440px · Light) — Daily/weekly progress, streaks, check-in
- **H2**: Edit Habit Modal (1440px · Dark) — Replaces `prompt()` with real modal (CR-002)
- **H3**: Habits · Mobile Viewport (390px · Light)
- **J1**: Journal Entry Open (1440px · Light) — Reading view, entry metadata, linked application
- **J2**: Journal New Entry Editor (1440px · Dark) — Markdown editor, entry type selector
- **J3**: Journal Entry · Mobile Viewport (390px · Dark)

### `07-analytics.html` · Analytics & Reports (5 Frames)
- **Y1**: Analytics Overview · User (1440px · Light) — Funnel ("ever reached"), pipeline, rates
- **Y2**: Analytics Overview · Manager (1440px · Dark) — Workspace aggregate + member filter
- **Y3**: Stage Timing Report (1440px · Light) — Median durations, sample size thresholds
- **Y4**: Aging Report (1440px · Dark) — 5 aging bands, inactive application breakdown
- **Y5**: Analytics Summary · Mobile Viewport (390px · Light) — Responsive cards & funnels

### `08-workspace.html` · Workspace Management & Governance (11 Frames)
- **W1**: Members Roster · Manager View (1440px · Light) — Role assignment, member row menu
- **W2**: Invite Members Modal (1440px · Light) — Multi-use invite code generation
- **W3**: Remove Member Confirmation (1440px · Dark) — Retention disclosure (records stay)
- **W4**: Last-Manager Safeguard Alert (1440px · Light) — Prevents demoting sole manager
- **W5**: Workspace Settings · Shared Workspace (1440px · Light) — Rename, branding, policies
- **W6**: Workspace Settings · Personal Workspace (1440px · Dark)
- **W7**: Create Workspace Modal (1440px · Dark)
- **W8**: Join Workspace Modal (1440px · Light) — Enter invite code
- **W9**: Workflow Settings Concept (1440px · Light) — Immutable keys, custom display labels
- **W10**: Audit History View (1440px · Dark) — Sensitive & cross-user manager action log
- **W11**: Members List · Mobile Viewport (390px · Light)

### `09-settings.html` · Account Settings & Tokens (12 Frames)
- **S1**: Profile Settings (1440px · Light) — Display name, timezone selection, dirty state
- **S2**: Security Settings (1440px · Dark) — Password change, recovery codes status
- **S3**: Regenerate Recovery Codes Modal (1440px · Light) — Invalidation warning
- **S4**: Email & Phone Settings (1440px · Light) — Optional contact methods & verification
- **S5**: Appearance Settings (1440px · Light) — System / Light / Dark theme selector
- **S6**: Follow-ups & Reminders Preferences (1440px · Dark) — Default interval settings
- **S7**: Browser Extension Tokens List (1440px · Light) — Active tokens, scopes, expiration
- **S8**: Connect Browser Step 1 (1440px · Light) — Name, workspace scope, lifetime
- **S9**: Token Shown Once Step 2 (1440px · Dark) — Raw token revealed once with copy
- **S10**: Revoke Token Confirmation (1440px · Light)
- **S11**: Settings Index · Mobile Viewport (390px · Light)
- **S12**: Security Settings · Mobile Viewport (390px · Dark)

### `10-extension.html` · Browser Extension Popup (14 Frames)
- **X1**: Connection · Not Connected (380px · Light) — Token entry & workspace setup
- **X2**: Connection · Expired / Revoked (380px · Dark)
- **X3**: Connection · API Unavailable (380px · Light) — Network/server failure
- **X4**: Capture · Job Detected Ready (380px · Light) — Greenhouse structured data match
- **X5**: Capture · Job Detected Ready (380px · Dark)
- **X6**: Capture · Partially Detected (380px · Light) — Required field missing prompt
- **X7**: Capture · Unsupported Page (380px · Dark) — No job detected, manual entry link
- **X8**: Capture · Success Confirmation (380px · Light) — Direct link to application
- **X9**: Duplicate · Strong Duplicate (380px · Light) — URL & Requisition ID match
- **X10**: Duplicate · Probable Duplicate (380px · Dark) — Company & Role match
- **X11**: Duplicate · Possible Duplicate (380px · Light) — Company match, different role
- **X12**: Duplicate · Already Saved (380px · Light) — Posting already in Saved list
- **X13**: Error · Duplicate Check Failed (380px · Dark) — Honest failure state
- **X14**: Error · Workflow Load Failed (380px · Light) — Save disabled to prevent corrupt stages

### `11-application-views.html` · Alternate Views & Exports (9 Frames)
- **V1**: Board View · Kanban (1440px · Light) — Sticky stage columns, keyboard drag indicator
- **V2**: Board View · Manager View (1440px · Dark) — Member avatars on cards
- **V3**: Board View · Mobile Viewport (390px · Dark) — Single stage swipeable view
- **V4**: Applications Calendar View (1440px · Light) — Filtered to application milestones
- **V5**: Global Calendar View (1440px · Dark) — All tasks, interviews, follow-ups + agenda
- **V6**: Applications Timeline View (1440px · Light) — Gantt-style stage duration spans
- **V7**: Archived Applications View (1440px · Light) — Filtered table with restore actions
- **V8**: Saved Views Manager (1440px · Light) — Save filter/column configurations
- **V9**: Export Applications Dialog (1440px · Dark) — Format (CSV/JSON), scope, fields

### `12-import-export.html` · Import Wizard & Portability (9 Frames)
- **E1**: Import Wizard · Step 1 Choose File (1440px · Light) — Drag CSV/XLSX
- **E2**: Import Wizard · Step 1 Manager View (1440px · Dark) — Select target member
- **E3**: Import Wizard · Step 2 Column Mapping (1440px · Light) — Match header aliases (CR-G2B-03)
- **E4**: Import Wizard · Step 3 Review & Duplicates (1440px · Light) — Error/warning preview
- **E5**: Import Wizard · Step 3 Review (1440px · Dark)
- **E6**: Import Wizard · Step 4 Done (1440px · Light) — Summary + Download error CSV
- **E7**: Export Data Center (1440px · Light) — Complete user exports (CSV + JSON)
- **E8**: Export Data Center · Manager (1440px · Dark) — Workspace-wide data bundle
- **E9**: Export Permissions Notice · User Role (1440px · Light) — Scope explanation

### `13-search-states.html` · Search & System States (8 Frames)
- **G1**: Global Search Dropdown (1440px · Light) — Quick results for applications, contacts, notes
- **G2**: Search Results Full Page (1440px · Dark) — Paginated results with facet filters
- **G3**: Global Search · Mobile Viewport (390px · Light)
- **Q1**: Table Skeleton Loading State (1440px · Light) — Virtualized shimmer placeholders
- **Q2**: Empty States Collection (1440px · Light) — Initial empty vs zero search matches
- **Q3**: System Error & Offline States (1440px · Dark) — 404, 403, and network disconnected
- **Q4**: Master Component State Sheet (1440px · Light) — Full interactive control states
- **Q5**: Master Component State Sheet (1440px · Dark)

### `14-resumes-goals-tablet.html` · Resumes, Goals & Tablet (6 Frames)
- **R1**: Resumes List & Versions (1440px · Light) — Version history, clone, linked apps
- **R2**: Resume Compare Versions (1440px · Dark) — Side-by-side text diff
- **R3**: Goals Tracking View (1440px · Light) — Weekly targets, progress, historical snapshots
- **TB1**: Applications Table · Tablet (1024×768px · Light) — 64px icon rail, condensed columns
- **TB2**: Application Detail · Tablet (1024×768px · Dark) — Single-column layout with accordions
- **TB3**: New Application Form · Tablet (1024×768px · Light) — Horizontal section pill navigation

---

## 3. Screenshot Verification Inventory

All 44 screenshot files located under `migration-upgrade/ui-design/gate-02b/screenshots/` have been verified for pixel fidelity, theme consistency, and design contract compliance:

| Screenshot File | Associated Frames | Resolution | Theme | Key Features Verified |
|---|---|---|---|---|
| `A2-login-error-dark.png` | A2 | 1440×960 | Dark | Error banner, password show/hide, subtle links |
| `A4-registration-light.png` | A4 | 1440×960 | Light | 3-step indicator, password checklist, optional tags |
| `A11-A13-auth-mobile.png` | A11, A12, A13 | 1170×844 | Light/Dark | Mobile login, registration step 1, 10 recovery codes |
| `C1-create-application-light.png` | C1 | 1440×960 | Light | 5-section side nav, snapshot tip, auto-save status |
| `C2-create-manager-dark.png` | C2 | 1440×960 | Dark | Member assignment header, audit logging notice |
| `C5-duplicate-probable-dark.png` | C5 | 1440×960 | Dark | Warning banner, existing record card, non-blocking |
| `C8-move-stage-menu-light.png` | C8 | 1440×960 | Light | 8 pipeline stages, radio indicators, timeline note |
| `C9-close-outcome-dark.png` | C9 | 1440×960 | Dark | 5 outcome options, reason input, consequence note |
| `C11-hard-delete-light.png` | C11 | 1440×960 | Light | Destructive modal, typed "DELETE" confirmation |
| `C12-C13-create-mobile.png` | C12, C13 | 780×844 | Light/Dark | Mobile FAB create form, mobile move stage sheet |
| `N2-contacts-manager-dark.png` | N2 | 1440×960 | Dark | Member owner column, filter bar, quick contact pill |
| `N3-contact-detail-light.png` | N3 | 1440×960 | Light | Drawer layout, interaction history, application cards |
| `N6-N7-contacts-mobile.png` | N6, N7 | 780×844 | Light/Dark | Mobile contacts list, one-tap communication buttons |
| `T2-tasks-panel-dark.png` | T2 | 1440×960 | Dark | Right rail task detail, type badges, due date chips |
| `T3-new-recurring-task-light.png` | T3 | 1440×960 | Light | Recurrence rules, interval picker, linked entity |
| `T5-T6-tasks-mobile.png` | T5, T6 | 780×844 | Light/Dark | Mobile queue, swipe actions, new task bottom sheet |
| `I2-interview-panel-dark.png` | I2 | 1440×960 | Dark | Preparation notes, questions expected, prep status |
| `I3-schedule-interview-light.png` | I3 | 1440×960 | Light | Date/time, format segments, suggested stage move |
| `I4-record-interview-dark.png` | I4 | 1440×960 | Dark | Result segment, questions asked, thank-you note |
| `H1-habits-light.png` | H1 | 1440×960 | Light | Weekday calendar strip, streak counts, completion |
| `H3-habits-mobile.png` | H3 | 390×844 | Light | Touch targets, habit check-off, streak display |
| `J1-journal-light.png` | J1 | 1440×960 | Light | Entry reader, 5 note types, linked application card |
| `Y1-analytics-light.png` | Y1 | 1440×960 | Light | Funnel ("ever reached"), pipeline, rate formulas |
| `Y2-analytics-manager-dark.png` | Y2 | 1440×960 | Dark | Workspace aggregate, member owner dropdown |
| `Y3-stage-timing-light.png` | Y3 | 1440×960 | Light | Stage duration bars, sample size warning banner |
| `W1-members-light.png` | W1 | 1440×960 | Light | Role badges, member row action dropdown menu |
| `W9-workflow-concept-light.png` | W9 | 1440×960 | Light | Immutable stage keys, custom labels, reorder |
| `S2-security-dark.png` | S2 | 1440×960 | Dark | Password form, recovery codes status, claim flow |
| `S5-appearance-light.png` | S5 | 1440×960 | Light | System / Light / Dark cards with preview accents |
| `S9-token-shown-once-dark.png` | S9 | 1440×960 | Dark | One-time token reveal modal, copy button, security tip |
| `X-extension-popup-states.png` | X1–X14 | 1600×2400 | Multi | 14 distinct states in one master composite capture |
| `V1-board-light.png` | V1 | 1440×960 | Light | Kanban board, keyboard drag focus ring, stage header |
| `V4-app-calendar-light.png` | V4 | 1440×960 | Light | Monthly calendar filtered to application events |
| `V5-calendar-dark.png` | V5 | 1440×960 | Dark | Full calendar with tasks, follow-ups, day agenda rail |
| `V6-timeline-light.png` | V6 | 1440×960 | Light | Chronological Gantt chart of active application stages |
| `V8-saved-view-light.png` | V8 | 1440×960 | Light | Saved view modal, filter configuration, shared flag |
| `E2-import-manager-dark.png` | E2 | 1440×960 | Dark | Step 1 file drop with member selection dropdown |
| `E4-import-review-light.png` | E4 | 1440×960 | Light | Step 3 review table, duplicate action segment |
| `G1-search-dropdown-light.png` | G1 | 1440×960 | Light | Top search popover with grouped entity results |
| `Q3-errors-dark.png` | Q3 | 1440×960 | Dark | 404, 403, and network offline full-page cards |
| `Q5-states-sheet-dark.png` | Q5 | 1440×960 | Dark | Comprehensive UI component state matrix |
| `R1-resumes-light.png` | R1 | 1440×960 | Light | Resume cards, revision histories, performance KPIs |
| `TB1-tablet-applications-light.png` | TB1 | 1024×768 | Light | 64px icon rail, condensed 5-column applications table |
| `TB2-tablet-detail-dark.png` | TB2 | 1024×768 | Dark | Single-column detail layout, accordion right rail |
