# Change Requests

Structured log of new ideas introduced during the JobQuest 2.0 migration that go
beyond straightforward feature-parity porting. Every entry must record all fields
below. Statuses: `PROPOSED`, `APPROVED`, `DEFERRED`, `REJECTED`. Nothing here is
pre-approved — creating an entry documents an idea, it does not authorize it (see
`APPROVAL_GATES.md`).

---

## CR-001: Real change-PIN / change-credential flow in Settings

- **Requested change**: build an actual PIN/credential-change form in the migrated
  Settings screen, replacing the current toast-only stub.
- **Reason**: `FEATURE-SET-001` documents that today's "PIN & Security" tab shows
  only a message ("PIN changes require current credential verification") with no
  real form — a genuine functional gap, not a design choice.
- **Affected requirements**: none in the current PRD; would be a new FR in the
  migrated system's `docs/PRD.md`.
- **Affected features**: FEATURE-SET-001, FEATURE-AUTH-001.
- **Affected APIs**: a new authenticated credential-change endpoint (doesn't exist
  today in any form).
- **Affected database entities**: `users` (or the Supabase Auth equivalent).
- **Affected screens**: Settings → PIN & Security.
- **Affected milestones**: Milestone 4 (Authentication) or a later Settings
  milestone.
- **Architecture impact**: low — additive endpoint + form.
- **Migration impact**: none (doesn't block any parity requirement).
- **Testing impact**: new test coverage required (didn't exist before, since the
  feature didn't exist before).
- **Status**: PROPOSED

## CR-002: Replace `window.prompt()`-based quick edits with real inline-edit components

- **Requested change**: design proper inline-edit forms/modals for the 11 current
  `prompt()`-based flows (habit editing, saved-view naming, checklist item edit,
  resume rename, category/tag rename, next-action note, etc.), rather than
  reproducing native browser prompts in the new UI.
- **Reason**: `CURRENT_STATE_AUDIT.md` §9 and `docs/FEATURE_UPGRADE_10_FINAL.md`'s
  Refactoring Audit both document this as accepted debt *specifically because* no
  shared modal/form component existed in the vanilla-JS app. A React rebuild
  removes that constraint entirely.
- **Affected requirements**: usability/accessibility non-functional requirements.
- **Affected features**: FEATURE-HABIT-001 (most visibly), plus 10 other call
  sites across the app.
- **Affected APIs**: none — same endpoints, different UI.
- **Affected database entities**: none.
- **Affected screens**: Habits, Settings (tags), Resumes, Reminder Categories,
  Applications (saved views), Application Detail (checklist item, next-action
  note).
- **Affected milestones**: touches most product-domain milestones (7 through 13)
  — recommend a shared "inline edit" component built once during the Design
  System milestone (Milestone 2) and reused everywhere.
- **Architecture impact**: low — a shared component, not a new pattern.
- **Migration impact**: none.
- **Testing impact**: existing Playwright specs asserting `prompt()`-driven flows
  need rewriting against the new component's DOM shape — real but bounded effort.
- **Status**: PROPOSED

## CR-003: Real tab-panel switching on Application Detail

- **Requested change**: either implement genuine ARIA tab-panel switching for
  Application Detail's `detailTabs()` (currently a visual tablist over stacked,
  always-rendered sections, with only Checklist actually wired to anything), or
  deliberately redesign the page layout and drop the tablist markup entirely.
- **Reason**: documented gap in `ROUTE_SCREEN_INVENTORY.md` — the current
  markup implies functionality (`role="tablist"`, labelled counts) that doesn't
  exist, which is worse for accessibility than not having a tablist at all.
- **Affected requirements**: WCAG 2.2 AA (ARIA tab pattern correctness).
- **Affected features**: FEATURE-APP-001 (Application Detail).
- **Affected APIs**: none.
- **Affected database entities**: none.
- **Affected screens**: Application Detail.
- **Affected milestones**: Milestone 6 (Application CRUD) or the UI/UX capstone
  milestone.
- **Architecture impact**: low.
- **Migration impact**: none — this is a UI correctness fix, not a behavior change
  users depend on today (the "tabs" have never actually worked as tabs).
- **Testing impact**: new accessibility test asserting real tab-panel behavior.
- **Status**: PROPOSED

## CR-004: Fix the orphaned "Import History" nav item grouping

- **Requested change**: place "Import History" into a proper nav group (e.g.
  "Career Assets" alongside "Bulk Import", or its own placement decision) instead
  of leaving it as a stray, ungrouped sidebar button.
- **Reason**: confirmed nav-structure bug in `ROUTE_SCREEN_INVENTORY.md` — not a
  deliberate design choice, an artifact of the `groupedNavigation` id arrays
  simply never including `imports`.
- **Affected requirements**: none functional; navigation consistency only.
- **Affected features**: FEATURE-IMPEXP-001.
- **Affected APIs**: none.
- **Affected database entities**: none.
- **Affected screens**: sidebar navigation (global).
- **Affected milestones**: Design System (Milestone 2) or the capstone pass.
- **Architecture impact**: none.
- **Migration impact**: none.
- **Testing impact**: trivial.
- **Status**: PROPOSED

## CR-005: Aging Report drill-through from the Dashboard's "Aging Applications" widget

- **Requested change**: add `aging-applications` to the dashboard's drill-through
  map (`DASHBOARD_DRILL`), linking to the standalone Aging Report page, matching
  the pattern every other insight widget already follows.
- **Reason**: confirmed gap — the widget and the full report cover the same data
  but have no connection today.
- **Affected requirements**: none functional; consistency/usability only.
- **Affected features**: FEATURE-DASH-001, FEATURE-ANALYTICS-001.
- **Affected APIs**: none (both already call `GET /api/analytics/aging`).
- **Affected database entities**: none.
- **Affected screens**: Dashboard.
- **Affected milestones**: Milestone 13 (Analytics) or the capstone pass.
- **Architecture impact**: none.
- **Migration impact**: none.
- **Testing impact**: trivial.
- **Status**: PROPOSED

## CR-006: Real-time dashboard/nav-badge updates via Supabase Realtime

- **Requested change**: subscribe to live updates for dashboard KPIs and nav
  badge counts instead of fetch-on-navigate only, now that Supabase Realtime
  makes this materially cheaper than it would have been on the current stack.
- **Reason**: raised as `OPEN_QUESTIONS.md` OQ-006 — genuinely new capability,
  not a parity requirement, and therefore requires an explicit decision before
  being treated as in-scope.
- **Affected requirements**: would add new NFRs (staleness/latency targets) to
  the migrated `docs/PRD.md`.
- **Affected features**: FEATURE-DASH-001 and the nav badge system broadly.
- **Affected APIs**: replaces/supplements `GET /api/navigation/counts` and
  dashboard polling with subscriptions.
- **Affected database entities**: none structurally; affects how data is read.
- **Affected screens**: Dashboard, global nav.
- **Affected milestones**: would be a distinct milestone, likely after core CRUD
  (Milestone 6+) is stable.
- **Architecture impact**: Medium — introduces a new runtime dependency
  (Realtime subscriptions) and a new class of client-side state management.
- **Migration impact**: none if deferred; adds real scope if approved.
- **Testing impact**: new test category (subscription behavior, reconnect
  handling) that doesn't exist in the current test suite at all.
- **Status**: PROPOSED — explicitly gated on the product owner's answer to
  OQ-006 before this can move to APPROVED.
