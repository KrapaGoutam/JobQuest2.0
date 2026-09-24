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

---

# Gate 01 Change Requests (added 2026-09-23)

The requirement source for CR-007…CR-013 is the **Gate 01 prompt** (the user).
The designs are **PROPOSED** until Gate 01 is approved. Details:
[`GATE_01_ARCHITECTURE_PROPOSAL.md`](GATE_01_ARCHITECTURE_PROPOSAL.md).

**CR-001 update:** superseded by CR-007. The real "change PIN" form becomes a
password change + recovery codes (Account › Security). Status: PROPOSED
(resolved by requirement).

| CR | Change | Source | Affected | Proposal § | Status |
|---|---|---|---|---|---|
| CR-007 | Replace PIN auth with username + password (email/phone optional), recovery codes, claim flow for legacy users | Gate 01 prompt | FEATURE-AUTH-001, SET-001; `users`, `sessions` | §5 | PROPOSED |
| CR-008 | Multi-workspace model with workspace-scoped USER/MANAGER roles (replaces the global manager) | Gate 01 prompt | FEATURE-MGR-001; every table | §6, §7 | PROPOSED |
| CR-009 | Split Stage / Status / Action; canonical workflow package; the extension fetches it live | Gate 01 prompt | FEATURE-APP-001/002, EXT-004 | §9 | PROPOSED |
| CR-010 | Append-only application event history + timeline; last-activity tracking | Gate 01 prompt | `activities`, `timeline_events`, `stage_history` | §8.2 | PROPOSED |
| CR-011 | Immutable job-posting snapshots (description, requirements, skills, compensation, IDs) | Gate 01 prompt | FEATURE-EXT-002, APP-001 | §8.3 | PROPOSED |
| CR-012 | Extension tokens become workspace-bound, scoped, expiring, peppered-hash, rotatable; duplicate levels strong/probable/possible with existing-record details; `external_job_id` as a strong signal | Gate 01 prompt | FEATURE-EXT-001/003 | §12 | PROPOSED |
| CR-013 | Light + dark + system theme on semantic tokens; WCAG 2.2 AA in both themes | Gate 01 prompt | All UI | §13.5 | PROPOSED |
| CR-014 | Analytics interview/offer counts use "ever reached" from history instead of current stage (fixes finding F-2) | Gate 01 analysis | FEATURE-ANALYTICS-001, DASH-001, RES-001 | §0, §20 | PROPOSED: needs approval (D-15) |
| CR-015 | Honour `week_start` everywhere + per-user timezone | Gate 01 analysis (OQ-005) | Calendar, goals, habits | §20 | PROPOSED |
| CR-016 | Import error-report CSV + cursor pagination for tasks/notes | Gate 01 analysis | FEATURE-IMPEXP-001, TASK-001, NOTE-001 | §20 | PROPOSED |
| CR-017 | Global search across applications, contacts, notes, tasks (Postgres FTS + trigram) | Gate 01 prompt ("Global Search") | New | §23 M13 | PROPOSED |
| CR-018 | Visual column-matching step in bulk import wizard with alias auto-matching | Gate 02B design (`12-import-export.html` E3) | FEATURE-IMPEXP-001 | `gate-02b/GATE_02B_UI_SPEC.md` §13.1 | APPROVED |
| CR-019 | Keyboard "Move to stage..." modal alternative (`M` key) for Kanban drag-and-drop | Gate 02B a11y (`11-application-views.html` V1) | FEATURE-APP-002 | `gate-02b/ACCESSIBILITY_MATRIX.md` §2 | APPROVED |
| CR-020 | Split-pane master-detail view on Tasks & Follow-ups desktop workbench | Gate 02B design (`04-tasks.html` T2) | FEATURE-TASK-001 | `gate-02b/GATE_02B_UI_SPEC.md` §6 | APPROVED |
| CR-021 | Typed "DELETE" confirmation modal for permanent deletion of archived applications | Gate 02B safety (`02-application-create-edit.html` C11) | FEATURE-APP-001 | `gate-02b/INTERACTION_SPEC.md` §2.8 | APPROVED |
| CR-022 | Inactivity review trigger at 31+ days (aligned with Long Waiting aging band; advisory only; no automatic state mutations) | Gate 02B final decision (OQ-022) | FEATURE-DASH-001, APP-001 | `gate-02b/GATE_02B_UI_SPEC.md` §4.5 | APPROVED |
| CR-023 | Structured closure reason `OFFER_DECLINED` under `Withdrawn` outcome (UI displays "Offer declined"; structured for Gate 03 DB design) | Gate 02B final decision (OQ-023) | FEATURE-APP-001/002 | `gate-02b/GATE_02B_UI_SPEC.md` §4.1 | APPROVED |
| CR-024 | Applications preview pane defaults to OPEN on wide desktop (≥ 1680px) with persistent user preference and accessible keyboard controls | Gate 02B final decision (OQ-024) | FEATURE-APP-002 | `gate-02b/RESPONSIVE_MATRIX.md` §2 | APPROVED |

---

# Gate 03 Database, Auth & RLS Change Requests (added 2026-09-24, APPROVED)

The requirement source for CR-025…CR-029 is the **Gate 03 prompt and architecture design**.
All items below are **APPROVED WITH REQUIRED CORRECTIONS** following formal Gate 03 review.

| CR | Change | Source | Affected | Proposal § | Status |
|---|---|---|---|---|---|
| CR-025 | Dedicated system workspace `"JobQuest (Migrated)"` for legacy single-tenant data isolation and coherent multi-user history (OQ-012 resolution) | Gate 03 prompt | Tenancy model; all migrated tables | `gate-03/DATA_MIGRATION_DESIGN.md` §2 | APPROVED |
| CR-026 | Canonical UUIDv4 (`gen_random_uuid()`) primary keys across all 25 permanent target tables with selective `legacy_id INTEGER` retention for deterministic audit (UUIDv7 proposal SUPERSEDED) | Gate 03 review | All 25 target tables | `gate-03/TARGET_SCHEMA.md` §2 | APPROVED (DECISION CHANGED) |
| CR-027 | Engine-enforced composite foreign keys `(id, workspace_id)` on child tables to prevent cross-workspace reference leakage at the DB level | Gate 03 analysis | All workspace-scoped child tables | `gate-03/GATE_03_ARCHITECTURE.md` §4 | APPROVED |
| CR-028 | Persisted `last_activity_at TIMESTAMPTZ` column on applications maintained atomically by domain RPCs, with explicit `rpc_keep_application_active` | Gate 03 analysis | `applications`, `application_events` | `gate-03/RPC_DOMAIN_OPERATIONS.md` §4 | APPROVED |
| CR-029 | Database trigger `trg_protect_last_manager` on `workspace_members` preventing accidental or malicious removal/demotion of a workspace's final manager | Gate 03 prompt | `workspace_members` | `gate-03/AUTHORIZATION_RLS_DESIGN.md` §6 | APPROVED |

---

# M1B Change Requests (added 2026-09-24, APPROVED based on M1B proof)

| CR | Change | Source | Affected | Reference | Status |
|---|---|---|---|---|---|
| CR-030 | Replace Auth Option A with Option B: app-owned credentials and sessions, Node-minted ES256 access JWTs trusted by the Supabase Data API, no Supabase Auth identities | M1 T03 hard fail (Option A leaked the synthetic email through `/auth/v1/user`) | `AUTHENTICATION_DESIGN.md`; ADR-030 → ADR-043 | `gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md` | **APPROVED BASED ON M1B PROOF** |
| CR-031 | Add auth system tables `user_credentials`, `auth_sessions`, `auth_refresh_tokens`, `auth_rate_limits`; drop the `user_accounts.user_id → auth.users` FK | Option B | `TARGET_SCHEMA.md` (25 → 29 permanent tables once approved) | Amendment §14 | **APPROVED BASED ON M1B PROOF** |
| CR-032 | Import a JobQuest ES256 signing key into each Supabase project and rotate to it (key-management procedure) | Option B trust configuration | Infrastructure, environments, secrets | Amendment §7 | **APPROVED & EXECUTED ON DEV** (`jobquest-dev` rotated; production pending launch) |

