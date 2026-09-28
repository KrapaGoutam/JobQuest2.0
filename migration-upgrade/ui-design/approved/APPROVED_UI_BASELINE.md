# JobQuest2.0 Approved UI Baseline

## Status
```text
APPROVED
```

## Purpose
This folder is the approved visual source of truth for JobQuest2.0. It is the reference for Gate 02B, frontend implementation, responsive and light/dark implementation, accessibility verification, and visual regression baselines.

## Approval
The user explicitly approved the consolidated UI direction ("Direction D · JobQuest Hybrid") in chat, after reviewing explorations A, B and C and the Direction D candidate. No approval timestamp was recorded, so none is given here. The packaging was done on 2026-09-24.

## Design foundation
- **Primary UX foundation:** Focus-style (Direction B) action-oriented workflow. The dashboard answers "What needs my attention today?" with a single urgency queue (Overdue, then Due today), upcoming interviews, and a review list for quiet applications.
- **Applications:** Ledger-style (Direction A) dense table, with a persistent grouped sidebar and bulk actions.
- **Preview:** B's preview pane — inline at ≥1680px, a drawer when narrower. It never replaces the full Application Detail page.
- **Application Detail:** a header strip (stage progress, priority, aging, next action). Tabs are limited to long-form groups (Timeline, Job posting, Notes). Structured records stay visible in a right rail. The timeline is date-grouped, filterable, and collapses long histories.
- **Workbench (Direction C) concepts:**
  - Command palette: DEFERRED P2. Only a ⌘K hint appears in the search field.
  - Rule-based suggestions: DEFERRED P3.
  - The sidebar-less shell, dark-first theme and board-as-default are NOT adopted.

## Theme
```text
Default:   SYSTEM
Fallback:  LIGHT
Available: SYSTEM · LIGHT · DARK
```
An explicit selection is persisted per user.

## Application view
```text
Default:   TABLE
Alternate: BOARD · CALENDAR · TIMELINE
```
Board, Calendar and Timeline appear in the view switcher. Their detailed layouts are Gate 02B work.

## Large dataset requirement
Application tracking must support roughly **500–1000+ records per user** (the mockups show 457 active of 600, and 5,380 in a manager workspace). It must not rely on oversized card layouts. Required:
- dense 44px rows and a virtualized table;
- saved views with counts, filters, sort, and bulk selection with bulk actions;
- keyboard navigation and result counts.

## Workflow and aging (as shown in the mockups)
- **Stage and Outcome:** shown in the proposed JQ2 form, Stage (8 pipeline values) separate from Outcome (Open, Rejected, Withdrawn, Ghosted, Position Closed, Accepted). The legacy data mapping still has items flagged NEEDS DECISION (see `../README.md`, CR-007 and OQ-011).
- **Aging labels:** the exact JobQuest1.0 `agingBand()` thresholds — ≤3 New, ≤7 Waiting, ≤14 Follow-Up Recommended, ≤30 Stale, >30 Long Waiting.
- **Stale review:** advisory only (Keep / Mark Ghosted / Archive). Nothing is archived automatically. Its threshold versus the bands is still open (OQ-012).

## Manager UX
```text
USER    → permitted records inside the active workspace
MANAGER → full workspace access when membership role = MANAGER
```
Managers use the same application, with a few additions:
- an Owner filter and Owner column;
- a "Manager · workspace-wide access" header badge;
- a Workspace nav group (Members, Import & export, Workflow, Audit history);
- an audit notice. Edits to another member's records are audited.

The active workspace and role are always visible: in the sidebar switcher, the workspace colour on the sidebar edge, and the header breadcrumb.

## Responsive
Mobile designs are purpose-built, not compressed desktop tables:
- a card list for Applications;
- a 5-tab bottom bar;
- a segmented Timeline / Details / People control on Detail;
- a sticky action bar;
- touch targets of at least 44px.

See `../RESPONSIVE_SPEC.md`.

## Light / Dark
Both themes are required for every screen. Both come from the same semantic tokens (`../DESIGN_TOKENS.md`).

## Accessibility
```text
WCAG 2.2 AA target (both themes)
```
See `../ACCESSIBILITY_SPEC.md`.

## Implementation rule
```text
Implementation agents must use this approved folder as
the visual baseline.

Do not redesign approved screens during implementation.

Any intentional visual departure must be recorded as a
change request and approved before implementation.
```

## Source priority for UI implementation

1. Explicit user-approved UI changes
2. `migration-upgrade/ui-design/approved/`
3. Approved JobQuest2.0 UI specifications (this folder's *.md)
4. Migration documentation (`migration-upgrade/*.md`, `docs/*`)
5. Verified JobQuest1.0 UI behavior
6. Assumptions

If legacy UI differs from the approved JobQuest2.0 design: **APPROVED JOBQUEST2.0 DESIGN WINS**, unless the difference would remove required functionality. If required functionality appears absent from the approved mockup, do not silently remove it — flag it for Gate 02B (see `GATE_02B_DESIGN_BACKLOG.md`).
