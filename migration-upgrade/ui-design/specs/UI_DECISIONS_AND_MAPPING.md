# JobQuest 2.0 UI design

**Status: APPROVED.** The approved visual baseline is in `approved/`. Start with `approved/APPROVED_UI_BASELINE.md` and `approved/jobquest-approved-mockup.html`.

Folder map:
- `approved/` — the approved design (source of truth);
- `explorations/` — A/B/C history;
- `*.md` — specs: tokens, IA, responsive, accessibility, component inventory, principles;
- `GATE_02B_DESIGN_BACKLOG.md` — screens still to design.

## Source priority for UI implementation

1. Explicit user-approved UI changes
2. `migration-upgrade/ui-design/approved/`
3. Approved JobQuest2.0 UI specifications (this folder's *.md)
4. Migration documentation (`migration-upgrade/*.md`, `docs/*`)
5. Verified JobQuest1.0 UI behavior
6. Assumptions

If legacy UI differs from the approved JobQuest2.0 design: **APPROVED JOBQUEST2.0 DESIGN WINS**, unless the difference would remove required functionality. If required functionality appears absent from the approved mockup, do not silently remove it — flag it for Gate 02B (see `GATE_02B_DESIGN_BACKLOG.md`).

---

## Direction D · JobQuest Hybrid
B · Focus is the UX foundation. A · Ledger supplies the Applications table and the persistent sidebar.

The desktop shell:
- **Sidebar (240px):** the workspace switcher sits at the top and shows the name and role. The workspace colour marks the sidebar's top edge and appears in the header breadcrumb.
- **Primary actions:** a single "New application" button, then nav grouped as primary / Track / Insights / Workspace (manager only), with Settings and the user row at the bottom.
- **Header:** holds global search (`/`), with a faint `⌘K` hint marking where the P2 command palette will attach.

Screens:
- **Dashboard** answers "what needs attention today". The first viewport holds Today's queue (Overdue, then Due today, with complete and snooze), Upcoming interviews, and Review quiet applications (Keep / Mark Ghosted / Archive). Below the fold: Recent activity, Current pipeline, Historical funnel. There are no vanity KPI cards.
- **Applications**
  - Table is the default view; Board, Calendar and Timeline are alternates.
  - Views and filtering: saved-view tabs with counts, filter chips (default "Outcome: Open"), and a stale advisory banner.
  - Selection: a bulk bar appears when rows are selected.
  - Table behaviour: sticky header, rows scroll continuously (virtualized), and a result count sits in the footer next to keyboard hints.
  - Columns: Company·Role, Stage, Aging·last activity, Priority, Next action + date, and Source (non-manager) or Owner (manager).
- **Preview pane:** at 1680px and wider, a 440px pane with stage, priority, last activity, next action (Done, set next), recent timeline and contacts. It links to the full page. Below that width it becomes a drawer, and on mobile it becomes the full route.
- **Detail**
  - Header: state strip with an 8-step stage progress bar (skipped steps muted), priority, aging, and a next-action panel.
  - Main column tabs: **Timeline | Job posting | Notes**, long-form groups only. The timeline groups events by date, filters by type, collapses long histories, and can hide system events.
  - Right rail: structured records stay visible — Tasks & follow-ups, Interviews, Contacts, Documents (resume version, cover letter), and Details (source, job URL, requisition ID, salary).
- **Mobile:** a 5-item bottom tab bar, a workspace chip in the header, and a queue-first dashboard. Applications become a card list (company, role, stage, next action + date, aging, priority) with view chips, a filter and sort, and a floating new-application button. Detail has a segmented Timeline / Details / People control and a sticky action bar. All touch targets are at least 44px.

## Sources
- **From A:** the dense, sortable table as the default; the persistent grouped sidebar; the bulk-action bar; keyboard hints; saved-view tabs with counts; the stale banner; and the right-rail layout on Detail.
- **From B:** the action-first dashboard and queue; the preview pane; the stage progress indicator with a separate next-action panel; working tabs (reduced to long-form content); and the mobile-friendly master–detail approach.
- **From C:** only the location of the future ⌘K command palette (a hint in the search field), plus keyboard-first intent. Rejected as default: the sidebar-less shell, dark-first theme, board-as-default, and the large suggestion panel.

## Deferred
- Command palette: **P2**, supported by design but not required for the parity release.
- Rule-based suggestions: **P3**, future enhancement. Next action, tasks, follow-up dates, last activity, aging and stale review cover the first release.
- Timeline (Gantt) view: an alternate Applications view whose data design was explored in C5. Its UI is not specified for D yet.
- Realtime badges (CR-006 / OQ-006): unchanged, pending decision.

## Workflow mapping (13 legacy values)
| Legacy value | Current meaning | Current API usage | Current analytics usage | Extension usage | Proposed JQ2 representation |
|---|---|---|---|---|---|
| Saved | Bookmarked, not yet applied | Valid `stage` (STAGES, DB CHECK) | Counted in totals; not "applied" | Canonical value for bookmarks (`/api/extension/stages`) | STAGE |
| Preparing | Preparing materials | Valid stage | None specific | Selectable | STAGE |
| Applied | Submitted | DB default stage | Dashboard counts; funnel base | Default on submit | STAGE |
| Assessment | Take-home / test | Valid stage | Resume analytics: `stage='Assessment'` (current state) | Selectable | STAGE |
| Recruiter Screen | Recruiter call | Valid stage | Funnel pivot from `stage_history` (historical) | Selectable | STAGE |
| Interview | Interviewing | Valid stage | "interviewed" = current stage IN (Interview, Final Interview, Offer, Accepted); funnel pivot via `stage_history` | Selectable | STAGE |
| Final Interview | Final round | Valid stage | Same "interviewed" set; resume analytics `final_interviews` | Selectable | STAGE |
| Offer | Offer received | Valid stage | "offered" = current stage IN (Offer, Accepted) | Selectable | STAGE. **NEEDS DECISION:** there's no value for "offer declined" (today, probably Withdrawn). |
| Rejected | Employer declined | In `CLOSED_STAGES`; `status_group=closed` | `rejected` KPI; funnel reject pivot | Selectable | OUTCOME. JQ2 stage = last pipeline stage in `stage_history`. |
| Withdrawn | Candidate withdrew | `CLOSED_STAGES` | Closed counts | Selectable | OUTCOME |
| Ghosted | No response | `CLOSED_STAGES`; quick filter `ghosted` | `ghosted` KPI | Selectable | OUTCOME. **NEEDS DECISION:** user-set only, or also offered from the stale review? (The mockups show it only as an explicit user action.) |
| Position Closed | Role pulled | `CLOSED_STAGES` | Closed counts | Selectable | OUTCOME |
| Accepted | Candidate accepted | `CLOSED_STAGES` | Counted as interviewed + offered + accepted | Selectable | OUTCOME (positive). **NEEDS DECISION:** should Accepted also imply stage = Offer? |

Migration rule (proposed, **not applied**): for rows whose legacy stage is terminal, set JQ2 stage to the last non-terminal `new_stage` in `stage_history`. If no history exists, set stage to "Applied" and flag the row "Needs review". Legacy values are not reclassified silently; every mapped row keeps its original value in an audit column.

Current-state finding: `service.js` dashboard KPIs (`interviewed`, `offered`) are computed from *current* stage. As a result, an application that went Interview → Rejected no longer counts as interviewed. `advanced.js` funnel queries do use `stage_history` correctly. Direction D shows the two separately: "Current pipeline" (current stage of open applications) and "Historical funnel" (ever reached, including closed).

## Aging bands
**CURRENT JOBQUEST1.0 AGING BANDS** — from `frontend/src/ui-utils.js` `agingBand(days)`; `backend/src/advanced.js` `agingCategory(days)` is identical:

| Days | Band |
|---|---|
| ≤ 3 | New |
| ≤ 7 | Waiting |
| ≤ 14 | Follow-Up Recommended |
| ≤ 30 | Stale |
| > 30 | Long Waiting |

- **Input.** The Aging Report feeds this `days_inactive` (days since last activity). `backend/test/frontend.test.js` asserts `[0,5,10,20,31]` → New, Waiting, Follow-Up Recommended, Stale, Long Waiting.
- **Related, not the same.** `advanced.js` also has an application-health helper with > 14 → "Action Needed" and > 7 → "Waiting". Its other branches weren't read. The export `feature-upgrade.js` computes `aging: age(item.date_applied)`, which is days since *applied*, not days inactive. **Flag:** the same word means two different things in exports versus the Aging Report.
- **Direction D** uses the legacy bands unchanged.

**Reconciling the 28-day review.** The user-approved advisory review (Keep / Mark Ghosted / Archive) triggers at 28 days inactive. That falls inside the legacy "Stale" band (15–30), so an application can be labelled Stale for 13 days before it appears in the review.

PROPOSED JOBQUEST2.0 CHANGE (not applied — needs approval), pick one:
- **(a)** Keep bands as-is and keep the review at 28 days (current mockups).
- **(b)** Keep bands and move the review to 31+ days (= Long Waiting), so the review matches a band exactly.
- **(c)** Keep bands and trigger the review at 15+ days (= Stale), a larger review queue.

Recommendation: (b), because it ties the review to a band users already see.

## Visual validation
I opened and screenshotted every Direction D frame at 1440×960 (1680 for the preview pane) and 390×844. The screens checked were: D1–D4 light and dark, D5–D6 (dark checked), D7–D8 light and dark, D9–D11, D12 and D13. Defects found and fixed:
- **Header search:** placeholder wrapped onto two lines. Now `nowrap`.
- **Detail header:** "Log activity", "Move stage" and "Final Interview" wrapped. Now `nowrap`.
- **View switcher:** the Timeline icon (`gantt-chart`) didn't exist in the icon set. Changed to `chart-gantt`.
- **Header manager badge:** wrapped. Now `nowrap`.
- **Workspace and owner menus:** unselected rows showed a stray "–" glyph. Replaced with an invisible check placeholder.
- **Mobile Applications:** the "Next action" sort button wrapped. Now `nowrap`.
- **Mobile dashboard:** the queue overflowed below the fold. Trimmed to 2 overdue + 2 today with a "See all" link.

A/B/C inspection:
- **Found:**
  - A's 9-column table squeezes Company·Role to about 180px.
  - A's header search and filter chips wrapped.
  - B's 68px icon-only rail hides labels, which makes items hard to find.
  - B's grouped table can't sort by arbitrary columns.
  - C's split view leaves board lanes about 150px wide, so names truncate.
- **Fixed in A:** the search and chip wrapping.
- **Fixed earlier (turn 2):** the data-file collision between turn-1 and turn-2 frames.

## Remaining UI decisions (before Gate 02B)
1. Approve Stage ≠ Outcome, plus the three flagged mapping cases: offer declined, Ghosted source, Accepted → stage.
2. The 28-day review versus the legacy bands: pick (a), (b) or (c).
3. The export "aging" (days since applied) versus the report aging (days inactive): rename one?
4. Should the preview pane be default-on at ≥ 1680px, or opt-in (Space)?

Note: `GATE_01_ARCHITECTURE_PROPOSAL.md` wasn't found in the JobQuest2.0 repo on `main`, so the analytics requirement comes from the brief. The repo docs updated here are local copies under `migration-upgrade/` in this project; commit them to the repo to apply.
