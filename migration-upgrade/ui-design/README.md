# Handoff: JobQuest 2.0 — Approved UI (Direction D · JobQuest Hybrid)

## Overview
JobQuest is a job-application tracker for individual job seekers and for workspace managers such as career coaches. This bundle contains the **approved** UI baseline for the JobQuest 2.0 rebuild:
- 9 screens across desktop, wide desktop and mobile, drawn as 13 frames (light and dark where applicable);
- the design tokens and specs needed to implement them.

It's designed for about 600 applications per user (500–1000+) and for multiple workspaces with per-workspace roles (USER / MANAGER).

## About the design files
The files here are **design references built in HTML**. They are prototypes that show the intended look, density and behaviour. They are **not production code**: they use inline styles, fixed frame sizes and fictional data. Recreate them in the target stack. JobQuest 2.0 plans React + TypeScript (ADR-002); follow that codebase's patterns, component library and routing. Do not ship or wrap the HTML.

**Source priority** when anything conflicts:
1. explicit user-approved changes;
2. `approved/`;
3. `specs/`;
4. migration docs;
5. JobQuest 1.0 behaviour;
6. assumptions.

If a legacy feature is missing from these frames, don't drop it; flag it (see `specs/GATE_02B_DESIGN_BACKLOG.md`).

## Fidelity
**High-fidelity.** Final colours, type scale, spacing, density, copy patterns and states are shown, so recreate them pixel-close. Sample data (companies, people, counts, "today = Wed Sep 23, 2026") is fictional.

## How to view
- `approved/jobquest-approved-mockup.html` — open in any browser, offline. All 13 frames are stacked vertically.
- `approved/screenshots/*.png` — the same frames as PNGs. Desktop is 1×; mobile is 2×.
- `approved/source/Direction D.dc.html` — editable source. Serve the folder over HTTP. Props: `screen` = dashboard | applications | preview | detail | workspace | manager | m-dashboard | m-applications | m-detail; `theme` = light | dark. Sample data is in `approved/source/jq-data-d.js`.

---

## Global shell (desktop ≥ 1280)
Full-height flex row: **sidebar 240px** plus a **main column** (flex 1).

### Sidebar
- **Container:** `--color-sidebar` background, 1px right border in `--color-border`, and a **3px top border in the workspace accent colour**.
- **Workspace switcher** (padding 10px):
  - a 48px-high button with a 1px border, 8px radius and 10px horizontal padding;
  - contents: a 28×28 tile (6px radius, workspace colour, white initials 11px/700), the name (13px/600, ellipsis), the role below it (11px, muted), and a chevrons-up-down icon.
- **New application:** 34px high, full width, `--color-accent` background with `--color-on-accent` text, 7px radius, 600 weight, plus icon.
- **Nav items:**
  - 32px high, 6px radius, 10px horizontal padding, 10px gap, 15px icon, 13px label;
  - current item: `--color-accent-soft` background with accent text, weight 600;
  - count badge: 11px/600 on `--surface-3`, or `--danger` with white text for overdue.
- **Group headings:** 11px/600, uppercase, 0.05em tracking, muted, 26px high, 10px top margin.
- **Nav order:**
  - Dashboard, Applications (count), Tasks & Follow-ups (danger count), Contacts, Calendar;
  - TRACK: Interviews, Habits, Journal, Resumes;
  - INSIGHTS: Analytics;
  - WORKSPACE (manager only): Members, Import & export, Workflow, Audit history.
- **Footer:** Settings, then the user row (28px avatar, name 13px/600, email 11px muted, and a theme pill "System" with a 26px-high monitor icon).

### Header
- 52px high, `--surface`, 1px bottom border, 24px horizontal padding.
- **Breadcrumb:** an 8px workspace-colour square, the workspace name (muted), a chevron, and the page name (600).
- **Manager badge (manager only):** 22px high pill on `--surface-2` with a strong border, 11px/600, green shield-check icon, text "Manager · workspace-wide access".
- **Right side:**
  - global search: 340×34, strong border, 7px radius, search icon, placeholder "Search applications, contacts, notes", with key hints `/` and a faded `⌘K` (the command palette is P2 and not built);
  - notification bell (18px) with a red 15px count badge.

### Typography
- Font stack: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif. Load no web fonts.
- Use tabular numerals everywhere.
- Desktop: base 13px/1.45, meta 12px, section titles 14px/600, page titles 22px/600 (detail title 24px/600), letter-spacing −0.01em on titles.
- Mobile: base 15px, header 17px/600, titles 21–22px/600.

### Icons
Lucide, outline style: 15px in nav, 13–14px inline. Names used include layout-dashboard, briefcase, list-checks, users, calendar-days, messages-square, repeat, notebook-pen, file-text, chart-line, settings, search, bell, triangle-alert, clock, calendar, moon, bell-ring, hourglass, circle, alarm-clock-off, flag, send, mail, calendar-check, calendar-plus, message-square, square-check, reply, pin, pencil, ellipsis, check, x, plus, table, square-kanban, chart-gantt, list-filter, sliders-horizontal, settings-2, shield-check, user-round, history, chevrons-up-down, chevron-*, arrow-up, arrow-right.

---

## Screens

### D1/D2 — Dashboard (1440, light/dark)
**Purpose:** answer "What needs attention today?"

**Layout:** main padding 20px 24px, 16px vertical gap.
1. **Title row:**
   - date (12px muted) above "What needs attention today" (22px/600);
   - inline counters on the right: "4 overdue" (danger triangle icon), "4 due today" (warning clock), "3 interviews this week", "37 to review" (moon). Each is an icon, a bold number, then muted text.
2. **Grid** `1.55fr / 1fr`, gap 16:
   - **Today's queue card**:
     - card: 8px radius, 1px border, `--surface`;
     - header: 44px high, title 14px/600, muted subtitle "Next actions and tasks, most urgent first", link "All tasks";
     - **OVERDUE · 4** band: 28px high, `--danger-soft` background, danger text 11px/700 with 0.04em tracking;
     - then 48px rows: an 18px circular checkbox, title 13px/600, a muted meta line ("Company · Stage · last activity Nd ago"), a right-aligned due text (12px/600, danger, "5d overdue"), and a 28px "Snooze" button;
     - **DUE TODAY · 4** band: `--warning-soft` background, warning text, with the same row pattern (meta on the right, e.g. "4:30 PM", "Recurring").
   - **Right column, Upcoming interviews:** rows with a 40px date tile (day 10px/700 muted, date 16px/600), the company (600), "type · with" (12px muted), and time plus mode on the right.
   - **Right column, Review quiet applications:**
     - header shows "37 · 28+ days" and "Review all";
     - 46px rows: company, an aging label in band colour with its icon ("Long Waiting · 63d"), and three 28px buttons: **Keep**, **Mark Ghosted**, **Archive**;
     - footer note: "Suggestions only. Nothing is archived automatically."
3. **Three equal cards:**
   - **Recent activity:** 34px rows with icon, text, and date on the right.
   - **Current pipeline:** "181 open, by current stage"; 21px bar rows with a 108px label, a 7px bar in accent on `--surface-2`, and the count.
   - **Historical funnel:** "Ever reached, incl. closed"; bars in `--fg` with count and %, e.g. Applied 562 100%, Recruiter Screen 71 12.6%, … Accepted 0 0%.
   - Current and historical are intentionally separate: the funnel counts from stage history, not current stage.

### D3/D4 — Applications, table (1440, light/dark)
**Layout:** main padding 16px 20px 0 24px, as a column.
- **Title row:** "Applications" (22px/600), then the muted "457 active · 600 total". On the right: Export (plus Import for managers), each a 32px outlined button.
- **Saved-view tabs** (ARIA tablist, 36px, 2px accent underline when selected, 1px bottom border on the row):
  - All active 457, Needs follow-up 7 (danger count), Interviewing 11, Saved 38, Archived 143, then "+ Save view" in accent;
  - count pills are 11px/600 on `--surface-2`.
- **Filter row** (padding 10px 0, gap 6):
  - a "Filter this view" input, 200×32;
  - an active chip, e.g. "Outcome: Open ×" (accent border, accent-soft background, accent text);
  - dashed "+ Stage", "+ Priority", "+ Aging" chips, and "More";
  - manager only: the "Owner: All members ▾" chip;
  - right side: a **view switcher** radiogroup (Table [icon + label, selected] | Board | Calendar | Timeline icons, 30px, strong border, 7px radius) and a columns/density icon button.
- **Stale banner:** 36px, `--surface-2`, 7px radius, 12px text. Text: "37 applications have had no activity for 28+ days. Review", with "Nothing is archived automatically" on the right and a dismiss ×.
- **Grid** (ARIA grid, `aria-rowcount`): 8px top radius, 1px border.
  - **Bulk bar** (only when rows are selected): 40px, inverted (`--fg` background, `--bg` text). Contents: "2 selected", action chips (Move stage, Priority, Tag, Follow-up, Archive, Export) on a translucent background, "Select all 457" and ×.
  - **Header row:** 34px, `--surface-2`, 12px/600 muted, sticky.
  - **Columns** (gap 12, padding 0 12):
    - checkbox (16px);
    - **Company · Role** (flex; 26px initial tile with 6px radius on `--surface-3`; company 13px/600; role 12px muted; ellipsis);
    - **Stage** (156px; 5 pips, each 7×4 with 1px radius, accent for reached, strong border otherwise, plus a label);
    - **Aging · last activity** (196px; icon and band label in band colour, then muted "· 16d");
    - **Priority** (64px; three bars 3px wide at 6/9/12px heights, filled in `--fg`, plus a label);
    - **Next action ↑** (270px, sorted; text ellipsis plus a due chip with icon — "5d overdue" danger/600, "Today" warning/600, "Tomorrow" or a date muted; "No next action" is shown italic and muted);
    - **Source** (92px) for users, or **Owner** (84px; 22px avatar plus first name) for managers.
  - **Rows:** 44px, 1px bottom border, with a 3px left border reserved for the preview-active state. Selected rows get the `--accent-soft` background and a checked box.
  - **Footer:** 34px, "Rows 1–16 of 457 · scrolls continuously" (a live region), with key hints on the right: ↑↓ move, X select, Space preview, ↵ open.
- **Virtualize the rows.** Show continuous scroll, with a result count rather than pagination.

### D5/D6 — Applications + preview pane (wide 1680, light/dark)
The same as D3, with:
- Priority and Source columns hidden;
- the aging column at 140px with short labels ("Follow-up rec.");
- the next-action column at 250px;
- the preview-active row using the accent-soft background plus a 3px accent left border.

The **preview pane** is 440px, `--surface`, with a 1px left border.
- **Header:** 44px, "PREVIEW" (700, 0.05em), "5 of 457", prev/next/close.
- **Identity:** a 44px tile, the role (17px/600), and "Company · Location".
- **Stats:** a 3-cell grid (Stage, Priority, Last activity) inside an 8px-radius border.
- **Next action card:**
  - `--warning-soft` background with a warning 30% border and 8px radius;
  - label "NEXT ACTION · DUE TODAY" (11px/700 warning);
  - the action (14px/600);
  - buttons: **Done, set next** (primary, flex) and **Reschedule**.
- **Recent timeline:** 5 rows, 32px each.
- **Contacts:** chips, 28px high.
- **Footer:** "Open full application →" and "Log".

Below 1680px the preview is a drawer; on mobile it is a full route.

### D7/D8 — Application detail (1440, light/dark)
**Header block** (`--surface`, padding 14px 24px 0):
- **Top line:** back link "Applications / JQ-1042" (mono ID), with "5 of 457 in view" and prev/next on the right.
- **Identity:** a 48px tile, the role (24px/600), and "**Company** · Location · Hybrid · Full-time · Applied Sep 01".
- **Actions:** pin (pressed, accent), Log activity, Edit, and more (archive, delete, export timeline).
- **State strip**: a 4-column grid (`1.9fr .8fr .9fr 1.9fr`) with a top border.
  - **STAGE:** "Outcome: Open" on the right; an 8-step progress bar (5px segments with short labels; current = accent at 700; done = accent 55%; skipped = strong border, muted); then "Final Interview · since Sep 18 · 5 days" and a **Move stage ▾** button.
  - **PRIORITY:** bars plus "High".
  - **AGING:** icon plus band, and "Last activity yesterday".
  - **NEXT ACTION · DUE TODAY:** full-bleed `--warning-soft` background; action 15px/600; **Done, set next** and **Reschedule**.

**Body grid** `1fr / 380px`:
- **Main column:**
  - **Tabs** (real ARIA tabs, 42px, 14px): **Timeline 19 | Job posting | Notes 4**. Filter chips sit on the right of the tab row: All (inverted when on), Stage, Interviews, Contacts, Notes, System.
  - **Composer:** 36px, strong border. "Add a note or log a call, email, interview…" with mail, phone and calendar-plus icons.
  - **Timeline:** date groups in a `52px / 1fr` grid with a top border.
    - Day number is 18px/600 with the month (10px/700 muted) below.
    - Events use a `22px / 1fr / auto` grid: a 22px round icon on `--surface-2`, a bold title, and the detail.
    - Stage changes render as `from` (muted pill) → `to` (accent-soft pill).
    - Notes render as a bordered card.
    - Actor and time sit on the right (11px muted).
    - Footer: "Show 9 earlier events · Aug 30 – Sep 04", with "2 system events hidden" on the right.
- **Right rail** (`--surface`): sections separated by 1px borders, padding 12px 20px, titles 13px/600.
  - **Tasks & follow-ups** ("2 open", +): 28px rows; done items are struck through.
  - **Interviews** (3): success check icon and date.
  - **Contacts** (3): 24px avatar, name and role, and a type pill.
  - **Documents:** resume version and cover letter.
  - **Details:** a key/value list with 96px keys — Source, Job URL, Requisition ID, Salary, Type, Captured.

### D9 — Mobile dashboard (390×844)
- **Status bar:** 44px.
- **Header:** 52px with a 3px workspace-colour top border.
  - Workspace chip: 32px pill with a 24px avatar, "Personal" and ▾.
  - Title "Today".
  - Search and bell, each a 44px target.
- **Body** (padding 14px 16px, gap 14):
  - date and "Needs attention" (22px/600);
  - 3 count tiles: Overdue (danger-soft), Due today (warning-soft), Interviews — number 22px/700, 10px radius;
  - **queue card** (12px radius): OVERDUE and TODAY bands; rows at least 60px with a 44px checkbox target; "See all 8 in Tasks & Follow-ups";
  - next-interview card (date tile, chevron);
  - quiet-applications card.
- **Tab bar:** 78px including a 22px safe area, 5 columns: Today (badge), Apps, Tasks, Contacts, More. Icons 21px, labels 11px. The current tab is accent.

### D10 — Mobile applications
- **Sticky top:**
  - view chips (34px pills; selected is inverted) — Active 457, Follow-up 7, Interviewing 11, Saved 38;
  - then Filter (36px, with a count badge), a sort button "Next action", and a count on the right.
- **Card list rows** (padding 11px 16px, gap 5):
  - line 1: company (600, ellipsis) and priority bars;
  - line 2: "role · **stage**";
  - line 3: due icon, next action (ellipsis), and a bold due label;
  - line 4: aging icon, band and days, in band colour.
- **FAB:** 56px, 16px radius, accent, placed 96px from the bottom. Filters open as a bottom sheet; bulk select starts with a long-press.

### D11 — Mobile application detail (dark shown)
- **Header:** back (44px), title "Application", search, bell.
- **Summary** (`--surface`): company · location, role (21px/600), pills (stage in accent-soft, "High priority", "Open"), and a next-action card with 44px **Done, set next** and **Reschedule** buttons.
- **Segmented control:** Timeline | Details | People, 36px segments on `--surface-3`.
- **Timeline rows:** 28px icon, title 14px/600 with the date on the right, summary 13px muted.
- **Sticky action bar:** Log activity | Move stage | ⋯, each 44px.

### D12 — Workspace switcher (menu open over the dashboard)
- The page scrim is `--scrim`.
- **Menu:** 340px wide, 10px from the left, 62px from the top. 10px radius, strong border, popover shadow.
  - search field (focused, with a focus ring);
  - "YOUR WORKSPACES" label;
  - 52px rows: tile, name, meta ("600 applications" / "12 members · 7,214 applications"), a role pill ("Manager" in success outline, "User" in muted outline), and a check on the current workspace, whose row also gets the accent-soft background;
  - then "Personal workspace settings" and "Create workspace";
  - footnote: "Switching reloads the app in the chosen workspace…".
- `role="menu"` with `menuitemradio` items.

### D13 — Manager context, Owner filter open
- **Context:** workspace "Career Lab · Cohort 7" with a green accent. The header shows the manager badge. The sidebar shows the WORKSPACE group. The count reads "5,380 active · 12 members", and the table has an **Owner** column.
- **Owner listbox:** 300px, anchored under the Owner chip.
  - search field, then options (38px): "All members 7,214" (selected), then each member with avatar and count;
  - footnote: "You can edit, archive and delete any member's records here. Changes to another member's records are written to Audit history."

---

## Interactions and behaviour
- **Theme:** System by default (follows `prefers-color-scheme` live); Light if unavailable; the user can pick System, Light or Dark and the choice is persisted.
- **Keyboard:**
  - `/` focuses search;
  - in the table, ↑/↓ move, X selects, Shift+X selects a range, Space toggles the preview, Enter opens the application;
  - `Esc` closes menus, drawers and the preview;
  - ⌘K is reserved (P2) and not required.
- **Table:** virtualized; sortable headers with `aria-sort`; a sticky header; selecting rows shows the bulk bar; the result count sits in a polite live region.
- **Preview:** a row click or Space opens it. Its prev/next steps through the current view's order. "Open full application" goes to `/applications/:id`.
- **Next action:** "Done, set next" completes the current action, adds a timeline event, and prompts for the next one (action text + date). "Reschedule" asks for a date.
- **Stale review:**
  - Keep resets the review for that application.
  - Mark Ghosted sets Outcome = Ghosted.
  - Archive archives the application.
  - All are explicit, with a 10-second undo toast. Archive can be restored. **Never auto-archive.**
- **Stage move:** stage and outcome changes append to the timeline. Moving to a closed outcome asks for confirmation.
- **Workspace switch:** reloads data scoped to the chosen workspace. The workspace colour, name and role update everywhere.
- **Manager:** the Owner filter applies to lists and counts. Mutations on another member's record are audited (actor vs owner).
- **Responsive:** see `specs/RESPONSIVE_SPEC.md`.
  - Breakpoints: <768 mobile, 768–1279 tablet, 1280–1679 desktop, ≥1680 wide.
  - Tablet collapses the sidebar to a 64px rail; the right rail becomes accordions.
  - The table is never shrunk onto mobile; use the card list.
- **Not designed yet** (Gate 02B): loading, empty and error states. Use a skeleton for table rows, a toast for action failures with optimistic rollback (legacy pattern), and redirect to the list with a toast on a detail 404.

## State (suggested)
- `activeWorkspace {id, name, color, role}` and `themePreference`
- Applications list:
  - query state: `savedViewId`, `filters[]`, `sort`, `viewMode (table|board|calendar|timeline)`, `ownerFilter`
  - selection state: `selection Set`, `previewId`
  - density
- Application detail:
  - data: `application`, `timeline (paged)`, `tasks`, `interviews`, `contacts`, `documents`
  - view state: `activeTab`, `timelineFilter`, `showSystemEvents`
- Dashboard: `queue (overdue, dueToday)`, `interviews`, `quietReview`, `activity`, `pipelineCurrent`, `funnelHistorical`

## Domain rules the UI depends on
- **Stage** has 8 pipeline values: Saved, Preparing, Applied, Assessment, Recruiter Screen, Interview, Final Interview, Offer.
- **Outcome:** Open, Rejected, Withdrawn, Ghosted, Position Closed, Accepted.
  - This split is the approved *proposal* (CR-007); some legacy-mapping cases are still pending (see `specs/UI_DECISIONS_AND_MAPPING.md`).
  - JobQuest 1.0 stores all 13 values in a single `stage` field.
- **Aging bands:** use JobQuest 1.0 `agingBand(days since last activity)` exactly — ≤3 New, ≤7 Waiting, ≤14 Follow-Up Recommended, ≤30 Stale, >30 Long Waiting. Colours:
  - New and Waiting: muted;
  - Follow-Up Recommended: warning;
  - Stale and Long Waiting: danger.
- **Quiet-review threshold:** 28 days (OQ-012 is still open).
- **Activity** means any meaningful timeline event.

## Design tokens
See `specs/DESIGN_TOKENS.md` for the full light and dark table. Core values:

| Token | Light | Dark |
|---|---|---|
| canvas | #f6f7f9 | #090d16 |
| sidebar | #ffffff | #0d1220 |
| surface-1 | #ffffff | #121827 |
| surface-2 | #f1f3f6 | #171f30 |
| surface-3 | #e8ebf0 | #202a3d |
| text | #172033 | #edf1f7 |
| text-muted | #5f6b7e | #b1bbca |
| border | #dfe3ea | #273247 |
| border-strong | #c7ced9 | #35425a |
| accent | #3157d5 | #8098ff |
| accent-hover | #2849b8 | #9aacff |
| on-accent | #ffffff | #0b1030 |
| accent-soft | #e9edff | #202b58 |
| focus | #5076f2 | #9ab0ff |
| success | #147a55 | #54c89a |
| warning | #9a5b08 | #edb457 |
| danger | #ba3341 | #ff7f8c |
| info | #246b9f | #75b8e7 |

- **Derived:** warning-soft = color-mix(warning 9%, surface); danger-soft = color-mix(danger 7%, surface).
- **Scrim:** light rgba(23,32,51,.32), dark rgba(3,6,12,.6).
- **Popover shadow:** light 0 12px 32px rgba(23,32,51,.16), dark 0 16px 40px rgba(0,0,0,.5).
- **Spacing:** 4px base (4, 6, 8, 10, 12, 14, 16, 20, 24).
- **Radius:** 6–7px controls, 8px cards and table, 10px menus, 12px mobile cards.
- **Heights:** controls 32–36px desktop; rows 44px; mobile targets ≥44px.
- **Focus:** 2px `--focus` ring with 2px offset.

## Accessibility (target: WCAG 2.2 AA in both themes)
- Never rely on colour alone. Stage = pips + label; aging = icon + label; priority = bars + label; overdue = icon + text.
- Use real ARIA patterns:
  - grid for the table, tabs for views and detail tabs, toolbar for the bulk bar;
  - `menuitemradio` for the workspace switcher, listbox for the owner filter;
  - focus-trapped drawers and menus.
- Details are in `specs/ACCESSIBILITY_SPEC.md`.

## Assets
- **No images.** Icons are Lucide (open source, ISC): use `lucide-react` in the app. The mockup loads `lucide-static@0.469.0`.
- **Initials tiles** stand in for company logos. Avatars are initials.

## Files
- `approved/jobquest-approved-mockup.html` — authoritative visual (offline).
- `approved/screenshots/` — 13 PNGs:
  - dashboard-desktop-light/dark;
  - applications-desktop-light/dark;
  - applications-preview-desktop (plus -dark);
  - application-detail-desktop-light/dark;
  - dashboard-mobile, applications-mobile, application-detail-mobile;
  - workspace-switcher, manager-owner-filter.
- `approved/APPROVED_UI_BASELINE.md` — approval record and the implementation rule: *do not redesign; record any visual departure as a change request*.
- `approved/source/` — editable mockup source and sample data.
- `specs/` — tokens, IA and routes, responsive, accessibility, component inventory, principles, the Gate 02B backlog (screens not yet designed), and `UI_DECISIONS_AND_MAPPING.md` (13-stage mapping, aging-band source, open decisions).
