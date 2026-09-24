# Gate 02B — Design Backlog & Resolution Audit

| | |
|---|---|
| **Status** | **AUDITED & RESOLVED** (Gate 02B completion audit) |
| **Audit Date** | 2026-09-24 |
| **Classification Key** | `RESOLVED` · `P2` · `P3` · `GATE 03 DEPENDENCY` · `USER DECISION REQUIRED` |

---

## 1. Resolution of Gate 02B Backlog Items

Every screen, state, and workflow item identified in the initial Gate 02B planning backlog has been audited, designed, and specified in the Gate 02B deliverables (`mockups/01–14.html`, `screenshots/`, and `gate-02b/*.md`).

| Area | Screens / States | Status | Mockup Frame(s) | Resolution Summary |
|---|---|---|---|---|
| **Auth** | Login (PIN-primary vs Supabase — OQ-001), Registration, PIN transition, Recovery codes, Account recovery | **RESOLVED** | A1–A13 | Username + password required; PIN retired (ADR-008); 3-step registration wizard; 10 single-use recovery codes (A5–A7); legacy account claim flow (A10). |
| **Applications** | Create application (full form), Edit application, Quick Add, Board view, Calendar view, Timeline (Gantt) view, advanced-filter dialog, export dialog (CSV/XLSX/JSON), stage-move and outcome confirmation dialogs, archive/restore, hard-delete confirmation | **RESOLVED** | C1–C13, V1–V9 | Progressive 5-section create form (C1/C2); Quick Add modal (`Q` shortcut, C3); Edit details (C7); 8-stage move menu (C8); 5-outcome confirm dialog (C9); Done/Next dialog (C10); Typed hard-delete (C11); Board (V1–V3); Calendar (V4/V5); Timeline (V6); Archive view (V7); Saved views (V8); Export dialog (V9). |
| **Duplicate detection** | Import duplicates, extension duplicate states (exact posting / same company-role / different role) | **RESOLVED** | C4–C6, X9–X12, E4 | 3-tier duplicate engine: Strong (URL/ReqID), Probable (Co+Role), Possible (Co match). Non-blocking with explicit override; honest error on check failure. |
| **Contacts / Networking** | Contacts list, Contact detail, Contact create | **RESOLVED** | N1–N7 | Contacts card grid (N1); Manager view with owner filter (N2); 540px detail drawer (N3/N4); Create contact modal (N5); Mobile one-tap communication (N6/N7). |
| **Trackers** | Interviews, Rejections, Follow-Ups (with suggestion), Reminders + Categories | **RESOLVED** | I1–I5, T1–T6, S6 | Interviews list & detail panel (I1/I2); Schedule dialog with stage recommendation (I3); Record outcome dialog (I4); Unified task & follow-up queue (T1/T2); Follow-up default intervals (S6). |
| **Tasks & Follow-ups** | Today / Upcoming / Backlog / Completed views | **RESOLVED** | T1–T6 | Unified queue grouping overdue, today, upcoming, and completed items; recurring task modal (T3) supporting daily, weekly, monthly recurrence rules. |
| **Habits** | Today / All / History, real edit form (CR-002) | **RESOLVED** | H1–H3 | Daily/weekdays/weekly habits; boolean & counted targets; streaks; real modal edit form (H2) eliminating legacy `window.prompt()` chain. |
| **Journal & Notes** | List, editor, search | **RESOLVED** | J1–J3 | Plain-text markdown editor (J2); 5 note types; optional company/application link; reading view (J1); mobile editor (J3). |
| **Calendar** | Month / Week / Agenda | **RESOLVED** | V4, V5 | Applications-specific calendar (V4); Global master calendar with day agenda rail (V5) displaying all dated tasks, interviews, and follow-ups. |
| **Resumes** | List, revision history, compare, analytics | **RESOLVED** | R1, R2 | Version list with revision histories (R1); Side-by-side text diff compare view (R2); Per-version application conversion analytics. |
| **Goals** | Goal settings, Goal history | **RESOLVED** | R3 | Consolidated under Analytics › Goals (R3); Weekly application targets; Live actuals vs. frozen weekly snapshot historical records. |
| **Analytics** | Analytics (funnel, source, resume), Aging report (CR-005 drill-through), Stage analytics, Exports | **RESOLVED** | Y1–Y5, E7–E9 | Overview with rates as numerator/denominator (Y1/Y2); Historical funnel ("ever reached", ADR-018); Current pipeline; Stage timing duration report (Y3); Aging report (Y4); Complete export center (E7–E9). |
| **Dashboard** | Customize dashboard, manager dashboard (user scope) | **RESOLVED** | Direction D (D1/D2, D7/D8) | Action-first queue replaces vanity grid; Overdue & Due today items; Upcoming interviews; Stale review; Manager target member filter. |
| **Workspace** | Workspace settings, Member management (roles; last-manager safeguard), Invite member, Create workspace, Audit history, Workflow configuration | **RESOLVED** | W1–W11 | Member roster with User/Manager roles (W1); Multi-use invite code modal (W2); Member removal with retention disclosure (W3); Last-manager safeguard alert (W4); Workspace settings (W5/W6); Create/Join modals (W7/W8); Workflow settings concept (W9); Audit history log (W10). |
| **Import / Export** | Bulk import (preview → import), Import history (CR-004 placement), Export | **RESOLVED** | E1–E9 | 4-step wizard with explicit column matching (E3, CR-G2B-03); Review table with duplicate controls (E4/E5); Downloadable error CSV (E6, CR-016); Export center (E7/E8); Permission scope handling (E9). |
| **Settings** | Profile, Account settings, change PIN/credential (CR-001), Theme settings, Tags, Extension token management | **RESOLVED** | S1–S12 | Profile (S1); Security with password change (S2); Recovery codes regeneration (S3); Email/phone verification (S4); Appearance theme selector (S5); Follow-up defaults (S6); Extension token manager with one-time reveal (S7–S10). |
| **Browser extension** | Popup: connect, capture form, duplicate warning, success, error | **RESOLVED** | X1–X14 | Complete 14-state popup matrix; extraction hierarchy; live canonical workflow sync; duplicate detection; honest error states on network/check failure. |
| **Cross-cutting states** | Empty, loading (skeleton for virtualized table), error (page and inline), permission denied / role-gated, offline, archive/restore, undo toasts, 404 | **RESOLVED** | Q1–Q5 | Table skeleton shimmer (Q1); True empty vs. zero search results (Q2); 404, 403, and offline cards (Q3); Master component state sheet in Light (Q4) and Dark (Q5). |

---

## 2. Legacy Functionality Verification (Zero Feature Loss)

| Legacy Feature | Status in Gate 02B | Evidence & Location in Specs |
|---|---|---|
| **Pinned Applications** | **RESOLVED** | Supported in Applications table via pin icon action and pinned sort group (`GATE_02B_UI_SPEC.md` §4.2). |
| **Application Tags** | **RESOLVED** | Displayed on Application detail, filterable in table, and assignable via bulk actions (`GATE_02B_UI_SPEC.md` §4.2). |
| **Application Checklist** | **RESOLVED** | Structured in Right Rail under Tasks & Follow-ups on Detail view (`GATE_02B_UI_SPEC.md` §4.3). |
| **14-Column Table Set** | **RESOLVED** | Column chooser dropdown in table header enables all 14 legacy columns (`GATE_02B_UI_SPEC.md` §4.2). |
| **Date-Range Selector** | **RESOLVED** | Present on Analytics Overview (Y1/Y2) with 30d, 90d, 180d, 1y, and Custom picker options. |
| **Goal Progress** | **RESOLVED** | Consolidated into Analytics › Goals (R3) with weekly target pacing. |
| **Legacy Keyboard Shortcuts** | **RESOLVED** | `g d` (Dashboard), `g a` (Applications), `g c` (Contacts), `q` (Quick Add), `/` (Search) fully specified in `ACCESSIBILITY_MATRIX.md` §3.1. |
| **CSP Posture** | **RESOLVED** | Target React implementation eliminates all inline styles in production bundle (`TRD.md`). |

---

## 3. Classification of Remaining Deferred Items

### Priority 2 (P2) — Scheduled Post-Migration Enhancements
1. **⌘K Command Palette:**
   - *Status:* **P2 (Architecture & UI Ready)**.
   - *Design Reference:* Search input in top header includes faint `⌘K` visual prompt (`UI_DECISIONS_AND_MAPPING.md` §Direction D).
   - *Scope:* Advanced keyboard modal for rapid fuzzy jumping across actions, entities, and settings. Not required for MVP parity.
2. **Supabase Realtime Nav & Dashboard Badges (OQ-006 / CR-006):**
   - *Status:* **P2 / Post-MVP**.
   - *Scope:* Live websocket subscription updates for badge counts and dashboard metrics. The system functions correctly with fetch-on-navigate and optimistic cache invalidation.

### Priority 3 (P3) — Future Capabilities
1. **Rule-Based Job Search Suggestions:**
   - *Status:* **P3**.
   - *Scope:* Heuristic automated suggestions (e.g. *"You applied 7 days ago with no response; send outreach to Recruiter Dana Cole"*). Standard follow-up dates and stale review sufficiently cover MVP.
2. **Custom Workflow Stage Key Extensions:**
   - *Status:* **P3 (Concept Designed in W9)**.
   - *Scope:* Allowing organizations to define custom pipeline stages. Requires immutable key constraints to prevent historical analytics corruption.

### Gate 03 Dependencies (Backend / Schema / RLS)
1. **PostgreSQL Schema & Tables:** DDL for all 33 migrated tables + new `workspaces`, `workspace_memberships`, `application_events`, `job_posting_snapshots`, `extension_tokens`, and `recovery_codes`.
2. **Row-Level Security (RLS) Policies:** Workspace membership checking + record owner filtering.
3. **Transactional RPC Functions:** Atomic operations for stage transitions, outcome closure, member role safeguards, and analytics aggregations.
4. **Node Auth Façade:** Username to internal Supabase Auth identity translation, HttpOnly refresh cookie handling, and single-use recovery code hashing.

### User Decisions Required (Pending Product Owner Input)
1. **Aging Band Alignment vs. Stale Review:**
   - *Option A:* Keep review at 28 days inactive (falls inside legacy 15–30d Stale band).
   - *Option B (Recommended):* Align review with Long Waiting band (31+ days inactive) for 100% vocabulary consistency.
   - *Option C:* Trigger review at 15+ days inactive (matches start of Stale band; larger queue).
2. **Offer Declined Outcome Classification:**
   - Confirm whether declining an offer is categorized as `Withdrawn` (legacy convention) or should be granted an explicit outcome status (`Offer Declined`).
3. **Wide Desktop Preview Pane Default:**
   - Confirm whether the 440px preview pane should be default-on at viewports ≥1680px, or require user opt-in (`Space` key / toggle).
