# JobQuest 2.0 · Gate 02B: Complete UI/UX Specification

| | |
|---|---|
| **Status** | **PROPOSED** — Awaiting user review and approval |
| **Document Purpose** | Master UI/UX and architectural specification for JobQuest 2.0 |
| **Design Baseline** | Direction D · JobQuest Hybrid (`../approved/`) |
| **Visual Source of Truth** | `../approved/jobquest-approved-mockup.html` |
| **Target Accessibility** | WCAG 2.2 AA (Zero automated or manual violations across Light and Dark themes) |

---

## 1. Visual Foundation & Design System

JobQuest 2.0 is designed as a professional workbench for active job seekers and career coaches. It rejects decorative vanity metrics, oversized marketing typography, and arbitrary glassmorphism in favor of high information density, clear visual hierarchy, keyboard ergonomics, and robust accessibility.

### 1.1 Color System & Tokens
All colors are defined as semantic CSS custom properties that adapt automatically between Light and Dark themes. The system never relies on color alone to communicate status, state, or urgency.

```css
:root {
  /* Surface & Background */
  --bg: #f8fafc;
  --surface: #ffffff;
  --surface-muted: #f1f5f9;
  --surface-3: #e2e8f0;
  
  /* Text & Typography */
  --fg: #0f172a;
  --muted: #475569;
  --subtle: #64748b;
  
  /* Borders */
  --border: #e2e8f0;
  --border-strong: #cbd5e1;
  
  /* Brand & Accent (Blue) */
  --primary: #2563eb;
  --primary-hover: #1d4ed8;
  --primary-soft: #eff6ff;
  --primary-fg: #ffffff;
  
  /* Focus Indicator */
  --focus: #3b82f6;
  
  /* Semantic Statuses */
  --success: #16a34a;
  --success-soft: #f0fdf4;
  --warning: #d97706;
  --warning-soft: #fffbeb;
  --danger: #dc2626;
  --danger-soft: #fef2f2;
  --info: #0284c7;
  --info-soft: #f0f9ff;
  
  /* Interactive Feedback */
  --interactive-hover: rgba(15, 23, 42, 0.04);
  --interactive-selected: #eff6ff;
}

[data-theme="dark"] {
  /* Surface & Background */
  --bg: #090d16;
  --surface: #0f172a;
  --surface-muted: #1e293b;
  --surface-3: #334155;
  
  /* Text & Typography */
  --fg: #f8fafc;
  --muted: #94a3b8;
  --subtle: #64748b;
  
  /* Borders */
  --border: #1e293b;
  --border-strong: #334155;
  
  /* Brand & Accent */
  --primary: #3b82f6;
  --primary-hover: #60a5fa;
  --primary-soft: #172554;
  --primary-fg: #ffffff;
  
  /* Focus Indicator */
  --focus: #60a5fa;
  
  /* Semantic Statuses */
  --success: #22c55e;
  --success-soft: #052e16;
  --warning: #f59e0b;
  --warning-soft: #451a03;
  --danger: #ef4444;
  --danger-soft: #450a0a;
  --info: #38bdf8;
  --info-soft: #082f49;
  
  /* Interactive Feedback */
  --interactive-hover: rgba(248, 250, 252, 0.05);
  --interactive-selected: #172554;
}
```

### 1.2 Typography & Scale
- **Font Stack:** System UI font stack (`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`) with tabular numerals enabled (`font-variant-numeric: tabular-nums`) for all metrics, tables, and dates.
- **Monospace Stack:** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` for IDs, recovery codes, tokens, and technical data.
- **Type Scale:**
  - `Display / Page Title`: 22–24px, weight 600, tracking -0.02em.
  - `Section Title (H2)`: 17–18px, weight 600, tracking -0.01em.
  - `Card / Modal Heading (H3)`: 14–15px, weight 600.
  - `Body / Primary Content`: 13–14px, line-height 1.45.
  - `Small / Metadata`: 12px, line-height 1.4.
  - `Extra Small (Micro)`: 10–11px, weight 600, uppercase letter-spacing +0.05em for category headers and status badges.

### 1.3 Layout & Shell Architecture
1. **Desktop Shell (≥1024px):**
   - **Persistent Left Sidebar (240px fixed):** Holds the Workspace Switcher at top, Primary Action button ("+ New application"), four grouped navigation lists (Primary, Track, Insights, Workspace), and Settings/Profile pinned to the bottom.
   - **Top Navigation Bar (52px fixed):** Contains hierarchical breadcrumbs (`Workspace › Section › Entity`), Global Search input (`/` shortcut with `⌘K` visual prompt), and notifications counter.
   - **Main Canvas:** Fluid layout with max-width constraints on document/editor views (e.g. 980px) and full-width edge-to-edge grids for tables and boards.
2. **Tablet Shell (768px–1023px):**
   - Sidebar collapses to a **64px icon rail** with flyout tooltips on hover and touch.
   - Master-detail views stack into single-column layouts with accordion sections.
3. **Mobile Shell (<768px):**
   - **Bottom Tab Bar (5 items):** Dashboard, Applications, Tasks, Search, More.
   - **Top Header:** Includes a compact Workspace Chip dropdown and contextual action icon buttons.
   - Modal views transform into slide-up bottom sheets with gesture grabbers.

---

## 2. Information Architecture & Navigation

### 2.1 Navigation Structure

```
JobQuest 2.0
├── Workspace Switcher (Top of Sidebar)
│   ├── [Current Workspace Name + Role Badge]
│   ├── Create Workspace (Modal)
│   └── Join Workspace (Modal)
│
├── Primary Action
│   └── + New application (C1/C2 full form; Q shortcut for C3 Quick Add)
│
├── PRIMARY NAV GROUP
│   ├── Dashboard (D1/D2 User, D7/D8 Manager)
│   ├── Applications (D3/D4 Table, V1 Board, V4 Calendar, V6 Timeline, V7 Archive)
│   ├── Tasks & Follow-ups (T1 Unified Queue, T2 Panel)
│   ├── Contacts (N1/N2 List, N3/N4 Detail Drawer)
│   └── Calendar (V5 Master Dated View)
│
├── TRACK NAV GROUP
│   ├── Interviews (I1 List, I2 Panel, I3 Schedule, I4 Outcome)
│   ├── Habits (H1 Today/Streak Tracker, H2 Edit Modal)
│   ├── Journal (J1 Viewer, J2 Editor)
│   └── Resumes (R1 Versions, R2 Compare)
│
├── INSIGHTS NAV GROUP
│   ├── Analytics (Y1 Overview, Y2 Manager Overview)
│   ├── Stage Timing (Y3 Duration Analysis)
│   ├── Aging Report (Y4 Stale/Waiting Bands)
│   └── Goals (R3 Target Settings & Weekly History)
│
├── WORKSPACE NAV GROUP (Role-gated: visible only to MANAGER role)
│   ├── Members (W1 Roster, W2 Invite, W3 Remove, W4 Role Safeguard)
│   ├── Import & export (E1–E6 Import Wizard, E7–E9 Data Portability)
│   ├── Workflow (W9 Status/Stage Configuration Concept)
│   └── Audit history (W10 Privileged Action Log)
│
└── FOOTER NAV GROUP
    ├── Settings (S1 Profile, S2 Security, S4 Contacts, S5 Theme, S6 Defaults, S7 Tokens)
    └── Current User Profile Card
```

---

## 3. Authentication & Account Recovery

### 3.1 Principles & Requirements
- **Username + Password Required:** Replaces legacy 4-digit PIN authentication (ADR-008, FR-014).
- **Email & Phone Optional:** Email and phone are not mandatory for account creation. Users may optionally provide them for account recovery (FR-014).
- **Single-Use Recovery Codes:** For users without verified contact info, 10 cryptographically random single-use recovery codes (formatted as `XXXX-XXXX-XXXX`) are generated upon registration (A5/A6, S3).
- **Legacy Account Claim:** Legacy JobQuest 1.0 accounts are migrated without credentials. Legacy users claim accounts using an operator-issued claim code and establish their new username and password (A10, ADR-017).

### 3.2 Visual & Functional States
- **A1/A2/A3 Login:** Standard form with Username, Password (show/hide toggle), "Keep me signed in" checkbox. Failed attempts return a generic error message ("Username or password is incorrect") to prevent username enumeration. 5 failed attempts trigger a 5-minute lockout (A3) with a direct link to recovery.
- **A4/A5/A6/A7 Registration Wizard:**
  - *Step 1 (Account):* Username (real-time availability check, 3–32 chars), Password (strength indicator: ≥12 chars, not common, matching), optional Display Name, optional Email, optional Phone.
  - *Step 2 (Recovery Codes):* Displays 10 single-use codes with Copy and Download options.
  - *Step 3 (Confirmation):* User must enter one random code from their generated set (e.g., "Enter code #4") before account activation completes.
- **A8/A9 Account Recovery:** Requires Username + single-use recovery code. Upon validation, the user immediately sets a new password and is issued a fresh recovery code set.

---

## 4. Application Domain & Workflow Engine

### 4.1 The Stage ≠ Outcome ≠ Action Model
JobQuest 1.0 combined pipeline progress, terminal outcomes, and follow-up flags into a single 13-value `stage` column. JobQuest 2.0 enforces a strict architectural split (ADR-011, CR-009):

1. **Pipeline Stage (8 Canonical Values):**
   - `Saved`: Bookmarked role; not yet submitted.
   - `Preparing`: Tailoring resume, cover letter, or application materials.
   - `Applied`: Application officially submitted (default starting state).
   - `Assessment`: Take-home exam, coding test, or pre-screen questionnaire.
   - `Recruiter Screen`: Initial HR or talent scout phone/video screen.
   - `Interview`: Technical, domain, or behavioral interview rounds.
   - `Final Interview`: Final round panel, presentation, or executive conversation.
   - `Offer`: Formal or informal offer received.
2. **Outcome / Status (5 Terminal Values):**
   - `Accepted`: User accepted the offer (positive terminal outcome).
   - `Rejected`: Employer declined the candidacy.
   - `Withdrawn`: Candidate voluntarily withdrew from consideration. Structured closure reasons distinguish:
     - `OFFER_DECLINED`: Candidate declined a formal or informal job offer (UI displays `"Offer declined"`, ADR-028, per OQ-023).
     - `GENERAL_WITHDRAWAL`: General withdrawal (e.g. accepted another offer earlier, role no longer relevant).
     - `COMPENSATION_MISMATCH`: Compensation or benefits did not meet expectations.
     - `LOCATION_UNSUITABLE`: Commute, relocation, or remote policy mismatch.
     - `OTHER`: Other reasons with optional explanatory note.
     *Design Invariant:* Structured closure reasons ensure analytics can report on declined offers without proliferating top-level pipeline outcomes; designed as a direct input for Gate 03 schema design.
   - `Ghosted`: Employer ceased communications after reasonable interval.
   - `Position Closed`: Employer cancelled or froze the job opening.
3. **Scheduled Next Action:** Independent task entity (`next_action` string + `next_action_date`) scheduled on the application timeline.

### 4.2 Application Views
- **Table View (Default, D3/D4):** Virtualized rows capable of smooth rendering for 1,000+ applications. Sticky headers, sortable columns, customizable visible columns (Company·Role, Stage, Aging/Last Activity, Priority, Next Action + Date, Source/Owner). Range selection (Shift+Click or Shift+X), bulk action toolbar (Move stage, Tag, Archive, Export).
  - **Preview Pane Behavior (D4, ADR-029, OQ-024):**
    - At viewport widths **≥ 1680px**, the 440px persistent preview pane defaults to **OPEN**, shrinking table canvas width to 65%.
    - Users may toggle, close (`×`), or reopen it via an explicit visible "Preview" toolbar control or context-safe keyboard shortcut (`P` when a table row has grid focus).
    - The user's explicit open/closed preference is persisted in client preferences.
    - The preview pane is **never required** (closing it expands the table to 100% canvas width).
    - **A11y & Keyboard Safety:** A global `Space` shortcut is strictly prohibited for preview toggling, as `Space` directly conflicts with vertical scrolling, table row/checkbox selection, screen-reader interaction, and native browser behavior.
- **Board / Kanban View (V1/V2):** Columns represent the 8 active pipeline stages. Each column displays total count and stage aggregate. Cards show Company, Role, Priority indicator, Aging chip, and Next Action due date. Drag-and-drop support paired with keyboard move shortcuts (`M` key menu).
- **Calendar View (V4/V5):** Displays application milestones (Applied dates, Interview rounds, Offer deadlines) alongside scheduled tasks.
- **Timeline / Gantt View (V6):** Visualizes duration spent across each pipeline stage per application.

### 4.3 Application Detail Layout (D5/D6, TB2)
- **Top Header Strip:**
  - Company name, Role title, Location, Work arrangement.
  - Interactive **8-pip stage progress bar** (skipped stages rendered with subtle borders; active stage highlighted; future stages muted).
  - Outcome pill ("Open" or terminal outcome).
  - Prominent **Next Action Card** with "Done, set next" and "Reschedule" triggers.
- **Main Left Canvas (Long-Form Tabs):**
  - `Timeline Tab`: Unified chronological history combining stage transitions, interview milestones, notes, emails, and system audit events. Filterable by event type.
  - `Job Posting Tab`: Immutable snapshot captured at application creation (description, requirements, compensation, requisition ID).
  - `Notes Tab`: Rich text journal and unstructured notes tied to the company.
- **Right Rail (Structured Entities):**
  - `Tasks & Follow-ups`: Active and completed checklist items.
  - `Interviews`: Scheduled rounds and recorded outcome summaries.
  - `Contacts`: Recruiters, interviewers, and referrals linked to this role.
  - `Documents`: Tailored resume version, cover letter link, and attachments.
  - `Details`: Compensation range, source channel, job requisition ID, application link.

### 4.4 Duplicate Detection Engine
Runs in real-time during manual entry, bulk import, and browser extension capture (BL-002, BL-003, FR-019). Evaluates three confidence tiers:
- **Strong Duplicate (C4, X9):** Exact match on Job URL OR Requisition ID. Shows full details of existing application. Action: "View Existing", "Cancel", or explicit "Save Anyway" (creates separate tracked application).
- **Probable Duplicate (C5, X10):** Exact match on Company name AND Role title. Non-blocking warning banner detailing differences (e.g. location, application date).
- **Possible Duplicate (C6, X11):** Match on Company name only with different role. Informational alert ("You have 2 other active applications at this company").

### 4.5 Aging Bands & Inactivity Advisory Review (ADR-027, OQ-022)
- **Aging Bands:**
  - `New`: ≤ 3 days since last timeline activity.
  - `Waiting`: 4–7 days.
  - `Follow-Up Recommended`: 8–14 days.
  - `Stale`: 15–30 days (amber aging chip displayed on row/card).
  - `Long Waiting`: 31+ days (triggers actionable advisory review).
- **Inactivity Advisory Review Trigger (31+ Days):**
  - Applications with no activity for **31+ days** surface in the dashboard "Review quiet applications" queue (D1, Y4).
  - Aligned 100% with the Long Waiting aging band instead of triggering prematurely within the 15–30d Stale band.
  - Actionable review options:
    - `Keep Active`: Logs a "Reviewed application" timeline note and resets the inactivity timer.
    - `Mark Ghosted`: Closes application with terminal outcome `Ghosted` (prompts for follow-up cancellation).
    - `Archive`: Soft-archives the application (10-second undo toast).
  - **Zero Automatic Mutation:** Nothing is ever automatically ghosted, archived, closed, or changed. All state mutations require explicit user action.


---

## 5. Contacts & Networking

### 5.1 Architecture & Relationships
- Contacts (`networking_contacts`) are first-class records belonging to the workspace.
- A contact can be linked to multiple applications and companies with specific relational roles: `Recruiter`, `Hiring Manager`, `Referral`, `Interviewer`, `Peer / Contact`.
- Tracks key networking attributes: relationship strength, outreach status, last contact date, and next scheduled follow-up.

### 5.2 Interface Specifications (N1–N7)
- **List View (N1/N2):** Card grid with member initials/avatar, full name, company, title, relationship pill, and follow-up alert. Manager view includes owner filter and column.
- **Detail Drawer (N3/N4):** Slides out from right (540px width). Contains contact info (one-tap mailto, tel, LinkedIn links), linked application cards, scheduled reminders, and complete communication log.
- **Create Modal (N5):** Fast creation from application rail or global navigation.

---

## 6. Tasks, Follow-ups & Reminders

### 6.1 Unified Task Queue (T1–T6)
Consolidates four distinct legacy domains into a single high-efficiency workbench:
1. `Application Next Actions`: Critical pipeline drivers tied directly to an application's current stage.
2. `Follow-up Reminders`: Scheduled check-ins after submitting an application or completing an interview.
3. `Stand-alone Tasks`: Ad-hoc to-do items with optional due dates.
4. `Recurring Tasks`: Cadence-driven job-search habits (daily applications, weekly outreach, monthly resume review).

### 6.2 Recurrence Engine (T3)
- Supports Daily, Weekdays, Weekly, Bi-weekly, and Monthly recurrence rules.
- Checking off a recurring task marks the current instance `completed` and automatically computes and instantiates the next occurrence without cluttering future backlog views.

---

## 7. Interviews

### 7.1 Data Integrity & Stage Decoupling
- **No Automatic Stage Mutation:** Scheduling an interview does **not** automatically mutate the application's stage (Section 10 handoff rule). The scheduling modal explicitly prompts: *"Keep at Recruiter Screen"* or *"Move to Interview"*.
- **Structured Fields:** Replaces legacy freeform checklist with two dedicated, searchable text fields:
  - `preparation_notes`: Personal strategy, target salary range, questions to ask interviewers.
  - `questions_expected`: Anticipated technical questions, scenario challenges, and behavioral prompts.

### 7.2 Interview Workflow (I1–I5)
- **Schedule Interview Modal (I3):** Captures Application link, Interview type (Recruiter Screen, Technical, Hiring Manager, Panel, Executive), Round number, Date/Time, Format (Video, Phone, On-site), Meeting link, and Participants.
- **Record Outcome Modal (I4):** Triggered after interview completion. Captures Result (Completed/Waiting, Advanced, Rejected, Cancelled), Questions asked by interviewers, Impressions/Notes, Thank-you note status (Not needed, To send, Sent), and prompts for an updated Next Action.

---

## 8. Habits & Journal

### 8.1 Habit Tracker (H1–H3)
- **Cadence Options:** Daily, Weekdays only, or Weekly target count.
- **Measurement Types:**
  - *Boolean:* Completed / Not completed (e.g. "Review daily job boards").
  - *Counted:* Numerical target (e.g. "Reach out to 3 recruiters").
- **Edit Modal (H2):** Replaces legacy `window.prompt()` chain with a standardized form component (CR-002).
- **Streak Calculation:** Dynamically derived at query time based on user's timezone; resilient to weekend skips for weekday habits.

### 8.2 Journal / Notes (J1–J3)
- **Note Types:** Reflection, Strategy, Interview Prep, Meeting Note, Post-Mortem.
- **Association:** Optional link to specific Company and Application.
- **Editor:** Plain-text markdown editor with real-time word count and search indexing.

---

## 9. Analytics & Insights

### 9.1 Historical Funnel Fidelity ("Ever Reached")
- **The Finding F-2 Correction:** Legacy JobQuest computed funnel counts using current application stage, causing applications that progressed to Interview and were subsequently Rejected to vanish from interview rate metrics.
- **JobQuest 2.0 Metric Rules (ADR-018, CR-014):**
  - `Current Pipeline`: Shows current stage distribution of open applications.
  - `Historical Funnel`: Computes "ever reached" milestones from immutable `application_events`. Any application that reached Interview counts toward interview conversion rates, regardless of ultimate outcome.
- **Rate Display Standard:** All analytical ratios display explicit numerator and denominator alongside percentage: `402 / 1,684 (23.9%)`.
- **Sample Thresholds:** Ratios with denominators < 5 display *"Insufficient data"* rather than misleading 0% or 100% figures (BL-004, BL-005).

### 9.2 Analytics Modules (Y1–Y5)
- **Overview (Y1/Y2):** Key conversion rates (Response rate, Interview rate, Offer rate), Response pacing chart, Historical funnel, Source effectiveness table, Resume version performance table. Manager view allows filtering by all or individual workspace members.
- **Stage Timing Report (Y3):** Median and average calendar days spent in each stage. Highlights pipeline bottlenecks.
- **Aging Report (Y4):** Categorizes inactive applications across 5 standard bands: New (≤3d), Waiting (≤7d), Follow-Up Recommended (≤14d), Stale (≤30d), Long Waiting (>30d).

---

## 10. Workspace Management & Collaboration

### 10.1 Multi-Workspace Architecture
- Every user belongs to at least one workspace. Registration auto-creates an isolated "Personal" workspace where the user is `MANAGER` (ADR-010, FR-015).
- Users can belong to multiple workspaces with distinct roles:
  - `USER`: Can view, create, edit, and export only their own permitted records within the active workspace.
  - `MANAGER`: Full read, edit, archive, and delete access across all member records within that specific workspace; can invite/manage members and configure workspace settings.
- Manager access is strictly workspace-scoped. Cross-user manager modifications generate an immutable entry in `audit_events`.

### 10.2 Governance & Administration (W1–W11)
- **Member Roster (W1):** Displays all workspace members, roles, status (Active, Suspended), total applications tracked, and last active timestamp.
- **Invites (W2):** Generates scoped, multi-use or single-use invitation tokens with configurable expiration (e.g. 7 days, 30 days).
- **Last-Manager Safeguard (W4):** Prevents a manager from demoting themselves or leaving a workspace if they are the sole remaining manager.
- **Member Removal (W3):** Discloses data retention policy: existing member applications remain in the workspace, attributed to their original owner, but the member's login access to that workspace is revoked.
- **Audit History (W10):** Read-only log of sensitive administrative events: member invitations, role changes, member removals, cross-user record edits, and bulk exports.

---

## 11. Account Settings & Security

### 11.1 Settings Architecture (S1–S12)
Organized into clean, dedicated sub-views rather than an endless single-page scroll:
1. `Profile (S1)`: Display name, preferred timezone (critical for "today" task and reminder calculations), avatar.
2. `Security (S2)`: Password change form (requires current password verification), active session list, sign out all devices.
3. `Recovery Codes (S3)`: View remaining code count; regenerate new set (requires password verification; invalidates prior set).
4. `Email & Phone (S4)`: Optional contact info management with verification OTP flows.
5. `Appearance (S5)`: Theme switcher (System default, Light, Dark).
6. `Follow-up Defaults (S6)`: Configure automatic follow-up reminder intervals (e.g. 5 days after applied, 1 day after interview).
7. `Browser Extension Tokens (S7–S10)`: Scoped personal access token management for the browser extension.

### 11.2 Extension Token Architecture (ADR-015, CR-012)
- Tokens are bound to a specific workspace and expire after a configurable duration (30 days, 90 days, 1 year).
- Tokens are hashed with a cryptographic pepper before storage in PostgreSQL. The raw token (`jqx_live_...`) is displayed **exactly once** upon generation (S9).
- Revocation (S10) immediately terminates extension access for that token.

---

## 12. Browser Extension Popup & Capture

### 12.1 Capture Experience (X1–X14)
Built with vanilla JavaScript and Manifest V3, communicating with the versioned `/api/ext/v1` backend endpoints.
- **Popup Dimensions:** 380px width, styled using identical design tokens, colors, and typography as the web application.
- **Automatic Extraction:** Evaluates 5-tier extraction hierarchy across supported job boards (LinkedIn, Greenhouse, Lever, Workday, Indeed, etc.) without fabricating data.
- **Live Workflow Sync:** Fetches canonical stages directly from `/api/workflow` to ensure 100% stage validity.
- **Duplicate Prevention:** Immediately evaluates URL, Requisition ID, and Company/Role against active workspace applications and surfaces Strong, Probable, or Possible banners.
- **Honest Error Handling:** If network or API checks fail, the extension explicitly states *"Couldn't check for duplicates"* rather than presenting a false "no duplicate" message (X13).

---

## 13. Import & Export System

### 13.1 Bulk Import Wizard (E1–E6)
- **Step 1 (Choose File):** Supports CSV and XLSX drag-and-drop. Managers select target member owner (E2).
- **Step 2 (Match Columns):** Visual mapping wizard matching source spreadsheet headers against canonical JobQuest fields (`Company`, `Role`, `Job URL`, `Stage`, `Date Applied`, `Notes`, `Salary`). Known aliases are matched automatically (CR-G2B-03).
- **Step 3 (Review & Validate):** Comprehensive preview detailing valid rows, warning rows, invalid error rows, and duplicate rows. Allows toggling duplicate action: *Skip duplicates*, *Update existing*, or *Import as new*.
- **Step 4 (Completion & Error Reporting):** Summary of committed records. Provides a direct download of an `import_errors.csv` file containing failed rows and exact validation failure reasons for easy re-submission (CR-016).

### 13.2 Data Portability & Export (E7–E9, V9)
- **Formats:** Full JSON archive (complete relational tree) and modular CSV files per entity (Applications, Contacts, Tasks, Interviews, Notes).
- **Injection Protection:** Formula injection mitigation applied to all CSV/XLSX exports by prefixing formula trigger characters (`=`, `+`, `-`, `@`) with a single quote (FR-012).
- **Role Scoping:** Non-manager users export their own records; managers can export entire workspace datasets (E8).

---

## 14. Global Search & Cross-Cutting States

### 14.1 Global Search (G1–G3)
- Focusable instantly from anywhere via the `/` key.
- **Dropdown Popover (G1):** Instant typeahead search returning categorized results (Applications, Contacts, Notes, Tasks) with matching field indicators (e.g. *"Matched on Requisition ID"*).
- **Full Results Page (G2):** Dedicated `/search` route supporting faceted filtering by entity type, stage, date range, and workspace member.

### 14.2 System & Async States (Q1–Q5)
- **Loading:** Virtualized skeleton shimmers for table layouts (Q1) and pulse loaders for cards.
- **Empty States:** Clear separation between true initial empty states ("No applications yet — create your first application") and zero filter results ("No applications match your active filters — Clear filters") (Q2).
- **Errors & Offline:** User-friendly full-page and banner error states (404 Not Found, 403 Permission Denied, Network Offline) with actionable recovery triggers (Q3).
- **Component State Sheet (Q4/Q5):** Authoritative light and dark visual verification matrix proving contrast and state equivalence for all buttons, inputs, pills, tabs, switches, and alert banners.
