# Complete Application Flow

Full per-screen detail lives in `../ROUTE_SCREEN_INVENTORY.md` — this document
covers navigation hierarchy and end-to-end user journeys built on top of it.

## Navigation hierarchy (current, from the actual sidebar structure)

```
JobQuest
│
├── Primary
│   ├── Dashboard
│   ├── Applications
│   └── Add Application
│
├── Activity
│   ├── Calendar
│   ├── Tasks
│   ├── Habits
│   ├── Notes (Journal)
│   ├── Reminders
│   ├── Interviews
│   ├── Rejections
│   ├── Follow-Ups
│   └── Networking (Contacts)
│
├── Career Assets
│   ├── Resumes
│   └── Bulk Import
│
├── Insights
│   ├── Analytics
│   ├── Goal History
│   ├── Aging Report
│   ├── Stage Analytics
│   └── Exports
│
├── Settings
│   └── Settings (Appearance, Tags, Extension Tokens; sub-links to Profile,
│       Goal Settings, Reminder Settings, Dashboard Settings)
│
├── (ungrouped — confirmed bug, see CR-004)
│   └── Import History
│
└── Manager (role-gated)
    ├── Manager Dashboard
    ├── User Management
    └── Audit History
```

Two screens have no nav entry (`profile`, `goals`) — reachable only via
in-page buttons, per `ROUTE_SCREEN_INVENTORY.md`.

## Navigation map

```mermaid
flowchart TD
    Auth[Auth: Login/Register/PIN Transition] -->|success| Dashboard

    Dashboard --> Applications
    Dashboard --> QuickAdd[Quick Add]
    Dashboard --> DashSettings[Dashboard Settings]
    Dashboard -->|drill-throughs| Applications
    Dashboard -->|drill-throughs| Reminders
    Dashboard -->|drill-throughs| Calendar

    Applications --> AppDetail[Application Detail]
    Applications --> AddApp[Add/Edit Application]
    Applications -->|Preview drawer| AppDetail

    AppDetail --> Interviews
    AppDetail --> FollowUps[Follow-Ups]
    AppDetail --> Networking
    AppDetail --> Tasks
    AppDetail --> Notes

    Bulk[Bulk Import] --> Applications
    Bulk --> ImportHistory[Import History]

    Calendar --> AppDetail
    Calendar --> Interviews
    Calendar --> FollowUps
    Calendar --> Networking
    Calendar --> Reminders
    Calendar --> Goals[Goal Settings]

    Aging[Aging Report] --> AppDetail

    Settings --> Profile
    Settings --> Goals
    Settings --> Reminders
    Settings --> DashSettings

    Manager[Manager Dashboard] --> Users[User Management]
    Manager --> Audit[Audit History]
```

## User Journeys

### Journey 1 — Create an application manually

```mermaid
flowchart LR
    A[Sidebar: Add Application] --> B[Fill multi-fieldset form]
    B --> C{Valid?}
    C -->|No| D[Inline errorBox, values preserved] --> B
    C -->|Yes| E[POST /api/applications]
    E --> F[Navigate to detail:newId]
```

### Journey 2 — Capture an application via the browser extension

```mermaid
flowchart TD
    A[Click extension icon on a job page] --> B{Configured + authenticated?}
    B -->|No| C[Open Options page]
    B -->|Yes| D[content.js extracts page data\n5-tier source-quality cascade]
    D --> E[Popup shows editable pre-filled form]
    E --> F[User reviews/edits fields]
    F --> G[User picks resume mode:\nexisting / manual / none]
    G --> H[Click Save to JobQuest]
    H --> I[GET /api/extension/duplicate-check]
    I --> J{Match type}
    J -->|NONE| K[POST /api/extension/applications]
    J -->|COMPANY_ONLY| L[Informational banner, normal save proceeds] --> K
    J -->|SAME_ROLE or EXACT_POSTING| M[Blocking banner:\nOpen Existing / Save Anyway / Cancel]
    M -->|Save Anyway| K
    M -->|Open Existing| N[buildSecureJobQuestUrl -> deep link]
    M -->|Cancel| O[Popup resets, nothing saved]
    K --> P[Success screen + link to JobQuest]
```

### Journey 3 — Detect a duplicate application (import path)

```mermaid
flowchart TD
    A[Bulk Import: paste/select JSON/CSV/structured text] --> B[POST /api/import/preview]
    B --> C[duplicate() checks owner+company+title+date+URL]
    C --> D[Preview table shows per-row: valid/invalid/duplicate]
    D --> E{User confirms import}
    E --> F[POST /api/import with duplicate_action:\nskip / import_anyway / update_existing]
    F --> G[Transactional or valid-rows-only commit]
    G --> H[import_batches + import_rows written,\nviewable later in Import History]
```

### Journey 4 — Move an application through the workflow/status pipeline

```mermaid
flowchart TD
    A[Applications: Table or Kanban] --> B{Interaction}
    B -->|Kanban drag| C[Drop on new stage column]
    B -->|Table Move dialog| D[Select new stage]
    B -->|Detail page stage select| D
    C --> E{Consequential stage?\nAccepted/Rejected/Withdrawn/Ghosted/Position Closed}
    D --> E
    E -->|Yes| F[confirm dialog]
    E -->|No| G[PATCH /api/applications/:id/stage]
    F -->|Confirmed| G
    F -->|Cancelled| A
    G --> H[Transaction: applications.stage,\nactivities, stage_history, timeline_events,\n+ auto-create rejections row if -> Rejected,\n+ audit_log]
    H --> I[UI reflects new stage;\ndashboard/analytics update on next fetch]
```

### Journey 5 — Search for existing applications

```mermaid
flowchart LR
    A[Applications page] --> B[Type in search box\ndebounced 300ms]
    B --> C[GET /api/applications/query?search=...]
    C --> D[Server-side text match across indexed fields]
    D --> E[Table/Kanban re-renders with matches]
    E -->|No matches| F["No applications match these filters"]
```

### Journey 6 — Filter and sort applications

```mermaid
flowchart TD
    A[Applications page] --> B{Filter type}
    B -->|Quick filter| C[Applied Today/Week/Month,\nRecently Updated, Active, Closed]
    B -->|Advanced filter dialog| D[Per-column operator:\ntext/enum/date-range/numeric]
    B -->|Saved view| E[Load filters_json/sorting_json/columns_json]
    C --> F[URLSearchParams built]
    D --> F
    E --> F
    F --> G[GET /api/applications/query or /kanban]
    G --> H[Optionally: POST /api/saved-views to persist]
```

### Journey 7 — Import applications

See Journey 3 (duplicate detection is part of the same flow, not a separate one).
Additional detail: format selection (JSON/CSV/structured text) determines parsing
path; `import_mode` (`valid_rows_only` vs `all_or_nothing`) determines whether a
partial failure commits the valid subset or rolls back everything.

### Journey 8 — Export applications

```mermaid
flowchart LR
    A{Export entry point} -->|Applications page inline dialog| B[Filtered CSV/XLSX/JSON\nwith current filter state applied]
    A -->|Exports page| C[Static links: one per domain type + full JSON backup]
    B --> D[GET /api/exports/... or applications.xlsx]
    C --> D
    D --> E[Every cell passed through safeCell/csvEscape]
    E --> F[Browser downloads file]
```

### Journey 9 — Create and manage tasks

```mermaid
flowchart TD
    A[Sidebar: Tasks, or Detail page Add Task] --> B[Fill title + optional notes/priority/due_date/application_id/recurrence]
    B --> C[POST /api/tasks]
    C --> D[Appears in the relevant view: today/upcoming/backlog]
    D --> E{User marks complete}
    E -->|Non-recurring| F[PATCH status=completed]
    E -->|Recurring| G[PATCH status=completed\n-> server creates next occurrence row]
    F --> H[Moves to Completed view]
    G --> H
```

### Journey 10 — Contacts / networking

```mermaid
flowchart TD
    A[Application Detail: Link Contact] --> B[renderTracker networking_contacts,\napplication_id pre-filled]
    B --> C[POST /api/networking_contacts]
    C --> D[Contact appears on Application Detail's\nnetworking panel]
    D --> E[Set next_follow_up_date]
    E --> F[Surfaces in Calendar + Follow-ups]
```

### Journey 11 — Analytics

```mermaid
flowchart TD
    A[Sidebar: Analytics] --> B[Select date range: 30/90/180/365d]
    B --> C[Parallel fetch: funnel, source, resume]
    C --> D[Overview: applications count +\nresponse/interview/offer rate,\nalways shown as n/d pct%]
    C --> E[Pipeline: funnel bar chart]
    C --> F[By Source table]
    C --> G[By Resume Version table]
    D & E & F & G --> H{Sample too small?}
    H -->|Yes| I["Insufficient data" / "No data"\nnever a misleading bare percentage]
    H -->|No| J[Render real values]
```

## Additional journeys worth documenting explicitly

### Journey 12 — Habit tracking (daily check-in)

```mermaid
flowchart LR
    A[Sidebar: Habits, Today view] --> B{Habit type}
    B -->|Boolean| C[Checkbox toggle]
    B -->|Count| D[+/- counter]
    C --> E[PUT /api/habits/:id/progress\nidempotent upsert]
    D --> E
    E --> F[Streak recomputed at read time]
    F -->|failure| G[Rollback UI + toast]
```

### Journey 13 — Extension deep-link back into JobQuest

```mermaid
flowchart TD
    A[Extension: Open Existing on a duplicate] --> B[buildSecureJobQuestUrl:\norigin-validated /?application=id]
    B --> C{Web session valid?}
    C -->|No| D[authView renders]
    D --> E[User logs in with PIN]
    E --> F[resolveInitialRoute reads ?application=id]
    C -->|Yes| F
    F --> G{Application exists?}
    G -->|Yes| H[renderDetail(id)]
    G -->|No, deleted| I[Redirect to Applications\n+ toast: could not be found]
```

### Journey 14 — Workspace Switching & Member Administration (Gate 02B)

```mermaid
flowchart TD
    A[Sidebar Top: Workspace Switcher] --> B[Dropdown: Active Memberships + Role Badges]
    B -->|Select Workspace| C[Context Switch: Theme Accent + Data Scope Updated]
    B -->|Manager Role| D[Workspace Management Nav Group Visible]
    D --> E[Members Roster W1]
    E --> F[Invite Members W2: Multi-use Code Generated]
    E --> G[Role Change: User <-> Manager]
    G --> H{Last Manager?}
    H -->|Yes| I[Last-Manager Safeguard W4: Blocked]
    H -->|No| J[Role Updated + audit_events logged]
    E --> K[Remove Member W3: Disclose Records Stay in Workspace]
```

### Journey 15 — Account Recovery via Single-Use Codes (Gate 02B)

```mermaid
flowchart TD
    A[Sign In Screen A1] --> B[Click "Forgot password?"]
    B --> C[Account Recovery Screen A8]
    C --> D[Enter Username + 12-char Single-Use Recovery Code]
    D --> E{Valid Code?}
    E -->|No| F[Generic Error: Invalid or Used Code]
    E -->|Yes| G[Code Burned / Consumed]
    G --> H[Set New Password Form A9]
    H --> I[Password Updated + Fresh Recovery Code Set Issued]
    I --> J[Redirect to Dashboard D1]
```

### Journey 16 — Bulk Import Wizard with Column Matching (Gate 02B)

```mermaid
flowchart TD
    A[Sidebar: Bulk Import E1] --> B[Upload CSV or XLSX]
    B --> C[Step 2: Match Columns E3]
    C --> D[Header Alias Auto-Matching]
    D --> E{Required Fields Mapped?}
    E -->|No| F[Prompt User to Map Company and Role]
    E -->|Yes| G[Step 3: Review & Duplicates E4]
    G --> H[Select Duplicate Strategy: Skip / Update / As New]
    H --> I[Step 4: Commit Batch Transaction]
    I --> J[Summary Screen E6 + Download import_errors.csv]
```

