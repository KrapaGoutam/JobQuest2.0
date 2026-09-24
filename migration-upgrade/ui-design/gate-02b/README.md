# JobQuest 2.0 · Gate 02B: Complete UI/UX Design & Specification

| | |
|---|---|
| **Status** | **APPROVED** — Formally approved with final user decisions (OQ-022, OQ-023, OQ-024) |
| **Gate** | Gate 02B: Complete UI/UX Design & Remaining Mockups |
| **Baseline** | Direction D · JobQuest Hybrid (`../approved/`) |
| **Visual Source of Truth** | `../approved/jobquest-approved-mockup.html` |
| **Interactive Landing Page** | `mockups/index.html` |
| **Screenshots Inventory** | `screenshots/` (44 verified captures) |

---

## 1. Overview & Objectives

Gate 02B extends the approved Direction D visual baseline (`migration-upgrade/ui-design/approved/`) into a complete, exhaustive UI/UX design and technical specification for JobQuest 2.0. Every screen, state, modal, drawer, responsive adaptation, and user flow required for the JobQuest 2.0 migration is designed, verified, and specified.

### Core Architectural Decisions Enforced
1. **Authentication:** Username + password required; email and phone optional; self-service registration; PIN-based authentication retired; single-use recovery codes for credential recovery; legacy account claim flow.
2. **Workspaces & Roles:** Multi-workspace architecture from day one; Personal workspace auto-created on registration; workspace-scoped roles (`USER` = access to permitted own records; `MANAGER` = workspace-wide oversight, cross-user write auditing, member administration).
3. **Stage ≠ Status ≠ Action:** Complete decoupling of pipeline stage (8 stages) from terminal outcome (5 statuses) and scheduled next action. Preserves historical funnel fidelity ("ever reached"). Declined offers are classified as Outcome `WITHDRAWN` with structured closure reason `OFFER_DECLINED` (displayed as "Offer declined", ADR-028).
4. **Action-First Dashboard:** Focuses on "what needs my attention today" (overdue tasks, today's queue, upcoming interviews, and 31+ days inactivity advisory review; zero automatic mutations, ADR-027).
5. **Applications Workbench:** Sortable virtualized table default, with Board (Kanban), Calendar, and Timeline as alternate views; advanced filtering, saved views, and bulk actions. At ≥1680px, preview pane defaults to OPEN with persisted user preference and accessible keyboard controls (ADR-029).
6. **Data Integrity & Safety:** Soft-archive first; hard-delete is explicit, typed, and audited; draft auto-save; formula-injection protection on all exports.
7. **Extension Integration:** Versioned `/api/ext/v1` client; scoped, expiring, hashed, workspace-bound tokens; live workflow synchronization; 3-tier duplicate detection (Strong / Probable / Possible).
8. **Accessibility & Design System:** Strict WCAG 2.2 AA compliance across Light and Dark themes; semantic CSS tokens; never communicating status by color alone; full keyboard and screen-reader accessibility.

---

## 2. Directory Structure

```
migration-upgrade/ui-design/gate-02b/
├── README.md                      # This document (executive overview & navigation)
├── GATE_02B_UI_SPEC.md            # Master UI/UX and architectural specification
├── SCREEN_INVENTORY.md            # Complete screen coverage audit & frame catalog
├── INTERACTION_SPEC.md            # Interaction triggers, validation, confirmation & audit
├── FORM_SPEC.md                   # Form fields, validation rules, dirty states & errors
├── STATE_SPEC.md                  # Interactive, data, async, security & extension states
├── RESPONSIVE_MATRIX.md           # Breakpoint behaviors (Mobile, Tablet, Desktop, Wide)
├── ACCESSIBILITY_MATRIX.md        # WCAG 2.2 AA compliance rules & keyboard navigation
├── mockups/                       # Complete interactive HTML mockups
│   ├── index.html                 # Mockup landing gallery (standalone offline review)
│   ├── assets/                    # Shared tokens (jq.css), runtime (jq.js), icons (lucide)
│   ├── 01-auth.html               # A1–A13: Sign in, registration, recovery codes, claim
│   ├── 02-application-create-edit.html # C1–C13: Create, quick add, duplicates, edit, stage moves
│   ├── 03-contacts.html           # N1–N7: Contacts list, manager view, detail, create
│   ├── 04-tasks.html              # T1–T6: Unified queue, detail panel, recurring task
│   ├── 05-interviews.html         # I1–I5: List, detail, schedule, record outcome
│   ├── 06-habits-journal.html     # H1–H3, J1–J3: Habits tracker & Journal entry editor
│   ├── 07-analytics.html          # Y1–Y5: Funnel, pipeline, stage timing, aging report
│   ├── 08-workspace.html          # W1–W11: Members, invites, safeguards, settings, audit
│   ├── 09-settings.html           # S1–S12: Profile, security, appearance, tokens
│   ├── 10-extension.html          # X1–X14: Capture popup, extraction states, duplicates
│   ├── 11-application-views.html  # V1–V9: Board, calendar, timeline, archive, export
│   ├── 12-import-export.html      # E1–E9: CSV/XLSX import wizard, column matching, exports
│   ├── 13-search-states.html      # G1–G3, Q1–Q5: Global search & component state sheet
│   └── 14-resumes-goals-tablet.html # R1–R3, TB1–TB3: Resumes, goals, tablet layouts
└── screenshots/                   # 44 rendered visual verification screenshots
```

---

## 3. How to Inspect & Review Mockups

All mockups are self-contained, fully offline-compatible HTML/CSS/JS artifacts that utilize local embedded Lucide SVG icon fonts and shared design tokens.

### Method 1: Local HTTP Server (Recommended)
From the repository root:
```bash
# Using Node / npx
npx serve migration-upgrade/ui-design/gate-02b/mockups

# Or using Python
python -m http.server 8080 --directory migration-upgrade/ui-design/gate-02b/mockups
```
Navigate to `http://localhost:8080/index.html` to access the master mockup navigation index.

### Method 2: Direct File Viewing
Open `migration-upgrade/ui-design/gate-02b/mockups/index.html` directly in any modern Chromium, Firefox, or Safari browser. Every link resolves relative paths locally.

### Method 3: Visual Screenshot Audit
Review the 44 high-fidelity reference captures located under `screenshots/`. Each capture corresponds directly to the standardized Frame IDs documented in `SCREEN_INVENTORY.md`.

---

## 4. Mockup & Specification Index

| Domain | Mockup File | Frames | Key Screenshots | Specification Reference |
|---|---|---|---|---|
| **Authentication** | `01-auth.html` | A1–A13 | `A2`, `A4`, `A11–A13` | [GATE_02B_UI_SPEC.md §3](GATE_02B_UI_SPEC.md#3-authentication--account-recovery) |
| **Application CRUD & Workflow** | `02-application-create-edit.html` | C1–C13 | `C1`, `C2`, `C5`, `C8`, `C9`, `C11`, `C12–C13` | [GATE_02B_UI_SPEC.md §4](GATE_02B_UI_SPEC.md#4-application-domain--workflow-engine) |
| **Contacts & Networking** | `03-contacts.html` | N1–N7 | `N2`, `N3`, `N6–N7` | [GATE_02B_UI_SPEC.md §5](GATE_02B_UI_SPEC.md#5-contacts--networking) |
| **Tasks & Follow-ups** | `04-tasks.html` | T1–T6 | `T2`, `T3`, `T5–T6` | [GATE_02B_UI_SPEC.md §6](GATE_02B_UI_SPEC.md#6-tasks-follow-ups--reminders) |
| **Interviews** | `05-interviews.html` | I1–I5 | `I2`, `I3`, `I4` | [GATE_02B_UI_SPEC.md §7](GATE_02B_UI_SPEC.md#7-interviews) |
| **Habits & Journal** | `06-habits-journal.html` | H1–H3, J1–J3 | `H1`, `H3`, `J1` | [GATE_02B_UI_SPEC.md §8](GATE_02B_UI_SPEC.md#8-habits--journal) |
| **Analytics & Insights** | `07-analytics.html` | Y1–Y5 | `Y1`, `Y2`, `Y3` | [GATE_02B_UI_SPEC.md §9](GATE_02B_UI_SPEC.md#9-analytics--insights) |
| **Workspace Management** | `08-workspace.html` | W1–W11 | `W1`, `W9` | [GATE_02B_UI_SPEC.md §10](GATE_02B_UI_SPEC.md#10-workspace-management--collaboration) |
| **Settings & Security** | `09-settings.html` | S1–S12 | `S2`, `S5`, `S9` | [GATE_02B_UI_SPEC.md §11](GATE_02B_UI_SPEC.md#11-account-settings--security) |
| **Browser Extension** | `10-extension.html` | X1–X14 | `X-extension-popup-states.png` | [GATE_02B_UI_SPEC.md §12](GATE_02B_UI_SPEC.md#12-browser-extension-popup--capture) |
| **Applications Views** | `11-application-views.html` | V1–V9 | `V1`, `V4`, `V5`, `V6`, `V8` | [GATE_02B_UI_SPEC.md §4.2](GATE_02B_UI_SPEC.md#42-alternate-views) |
| **Import & Export** | `12-import-export.html` | E1–E9 | `E2`, `E4` | [GATE_02B_UI_SPEC.md §13](GATE_02B_UI_SPEC.md#13-import--export-system) |
| **Search & System States** | `13-search-states.html` | G1–G3, Q1–Q5 | `G1`, `Q3`, `Q5` | [GATE_02B_UI_SPEC.md §14](GATE_02B_UI_SPEC.md#14-global-search--cross-cutting-states) |
| **Resumes, Goals, Tablet** | `14-resumes-goals-tablet.html` | R1–R3, TB1–TB3 | `R1`, `TB1`, `TB2` | [GATE_02B_UI_SPEC.md §15](GATE_02B_UI_SPEC.md#15-career-assets--tablet-adaptations) |

---

## 5. Specification Document Map

- **[GATE_02B_UI_SPEC.md](GATE_02B_UI_SPEC.md)**: Master architectural, domain, and UI specification.
- **[SCREEN_INVENTORY.md](SCREEN_INVENTORY.md)**: Exhaustive route, feature, and mockup frame coverage audit.
- **[INTERACTION_SPEC.md](INTERACTION_SPEC.md)**: Complete interaction catalog (triggers, feedback, permissions, audits).
- **[FORM_SPEC.md](FORM_SPEC.md)**: Field-by-field validation, label standards, error patterns, and dirty state management.
- **[STATE_SPEC.md](STATE_SPEC.md)**: Comprehensive state machine for components, async views, and extension popups.
- **[RESPONSIVE_MATRIX.md](RESPONSIVE_MATRIX.md)**: Viewport-specific layout transformations across Mobile, Tablet, and Desktop.
- **[ACCESSIBILITY_MATRIX.md](ACCESSIBILITY_MATRIX.md)**: Detailed WCAG 2.2 AA audit, keyboard maps, and screen-reader semantics.

---

## 6. Final Gate 02B Approval Decisions (2026-09-24)

Gate 02B was reviewed and formally **APPROVED** with three final product decisions:
1. **OQ-022 (Inactivity Review Trigger at 31+ Days, ADR-027):** Actionable review trigger set to 31+ days to align with the Long Waiting aging band instead of inside the 15–30d Stale band. Review options: `Keep Active`, `Mark Ghosted`, `Archive`. Zero automatic mutations.
2. **OQ-023 (Declined Offer Structured Closure Reason, ADR-028):** Outcome remains `WITHDRAWN` with structured closure reason `OFFER_DECLINED` (displayed as "Offer declined"). Designed as a formal input for Gate 03 schema design without proliferating top-level statuses.
3. **OQ-024 (Wide Desktop Preview Pane Default & Safe A11y, ADR-029):** On viewports ≥1680px, preview pane defaults to OPEN with user preference persistence. Global Space shortcut is strictly prohibited to prevent interference with scrolling, selection, and screen readers; explicit visible controls and context-safe shortcuts (`P`) are provided.

