# Implementation Plan

> **Gate 01 note (2026-09-23):** a revised, PROPOSED milestone roadmap (M1–M16) is in
> [`../GATE_01_ARCHITECTURE_PROPOSAL.md`](../GATE_01_ARCHITECTURE_PROPOSAL.md) §23–§24.
> This file stays as the pre-Gate-01 baseline. Nothing in either plan is approved.

All milestones below have status **PROPOSED**. None are approved. The user
approves each milestone individually, from the JobQuest2.0 repository, per
`../APPROVAL_GATES.md` Gate 5 — approval of one milestone never implies approval
of the next. Do not begin implementation on any milestone without that
milestone's own explicit approval.

Related documentation for the whole plan:
- [Feature Catalog](../FEATURE_CATALOG.md)
- [Business Logic Catalog](../BUSINESS_LOGIC_CATALOG.md)
- [API Inventory](../API_INVENTORY.md)
- [Route/Screen Inventory](../ROUTE_SCREEN_INVENTORY.md)
- [Backend Schema](BACKEND_SCHEMA.md)
- [Migration Mapping](../MIGRATION_MAPPING.md)
- [Open Questions](../OPEN_QUESTIONS.md)

---

## Milestone 0 — Baseline and documentation

**Status**: PROPOSED (this package itself)
**Objective**: establish the source-of-truth documentation baseline (this
package) before any code is written.
**Dependencies**: none.
**Source functionality**: all of JobQuest 1.0.
**Files/features affected**: none (documentation only).
**Tasks**: (complete as of this package) repository discovery, feature/business-
logic cataloging, API/schema/route inventories, target-architecture proposal.
**Database migrations**: none.
**Backend/Frontend work**: none.
**Tests**: none.
**Acceptance criteria**: `../APPROVAL_GATES.md` Gate 1 passed.
**Rollback strategy**: n/a (no code changed).
**Risks**: a missed feature/endpoint/table surfaces later, more expensively —
mitigated by the exhaustiveness checks in `../MIGRATION_CHECKLIST.md`.
**Completion criteria**: Gate 1 approval obtained.

## Milestone 1 — New repository/application shell

**Objective**: stand up the JobQuest2.0 repository with the chosen frontend/
backend scaffolding, CI skeleton, and no product code yet.
**Dependencies**: Milestone 0 (Gate 1), Gate 2 (target architecture approval)
for the scaffolding choices themselves.
**Source functionality**: none directly — infrastructure only.
**Tasks**: initialize repo, choose exact frontend tool (Vite+React vs. Next.js —
resolve during Gate 2), set up TypeScript config, set up linting/formatting, set
up the GitHub Actions skeleton (`../CI_CD_DEPLOYMENT.md` target pipeline shape).
**Database migrations**: none.
**Tests**: CI pipeline runs successfully on an empty scaffold.
**Acceptance criteria**: a "hello world" deploy succeeds on Vercel preview.
**Rollback strategy**: delete the repository (nothing depends on it yet).
**Risks**: low.

## Milestone 2 — Design system

Related: [UI/UX Design Brief](UI_UX_DESIGN_BRIEF.md), Gate 3.
**Objective**: implement design tokens, base components (button, input, table,
dialog, drawer, toast, tabs — real ones, per CR-003), and the app shell
(sidebar/topbar/nav) with no data-bound pages yet.
**Dependencies**: Milestone 1, Gate 3.
**Source functionality**: `FEATURE-*` navigation/shell behavior described in
`../ROUTE_SCREEN_INVENTORY.md` §Navigation.
**Tasks**: port color/typography/spacing tokens; build the nav shell (fixing
CR-004's orphaned-item bug from the start, not porting it); build the shared
inline-edit component (CR-002) once, for reuse across every later milestone that
needs it; resolve the light/dark-default discrepancy noted in
`UI_UX_DESIGN_BRIEF.md`.
**Tests**: visual-regression baseline established for the shell alone (nav open/
closed, mobile drawer, light/dark themes).
**Acceptance criteria**: shell renders and is keyboard/screen-reader navigable;
zero accessibility violations.
**Rollback strategy**: revert the design-system PR; no data-layer dependency.
**Risks**: getting the token/theme decision wrong here is expensive to unwind
later — don't skip resolving the light/dark-default question first.

## Milestone 3 — Supabase foundation

Related: Gate 4, [Backend Schema](BACKEND_SCHEMA.md).
**Objective**: create the Supabase project (staging first), author the full
schema migration set (23 tables, all constraints/indexes from
`BACKEND_SCHEMA.md`), no data yet.
**Dependencies**: Milestone 1, Gate 4.
**Database migrations**: the full re-authored migration set (Supabase-native
equivalents of `001`-`013`).
**Tasks**: author migrations table-by-table against `BACKEND_SCHEMA.md`; do not
enable RLS yet (that's explicit in this milestone's scope so schema correctness
can be validated independently of policy correctness).
**Tests**: migration applies cleanly to a fresh Supabase branch; every
constraint/index present matches `BACKEND_SCHEMA.md` exactly (a scripted diff,
not manual eyeballing).
**Acceptance criteria**: schema-only parity confirmed against the documented
schema.
**Rollback strategy**: drop the Supabase branch/project; no production impact.
**Risks**: Medium — 23 tables is a lot of surface area for a transcription
error; the scripted-diff test above is the mitigation.

## Milestone 4 — Authentication

Related: [FEATURE-AUTH-001](../FEATURE_CATALOG.md#feature-auth-001-authentication-pin--legacy-password-transition), OQ-001, OQ-002.
**Objective**: implement the auth model resolved by OQ-001 (Supabase Auth,
possibly with a custom PIN layer) and OQ-002 (extension token mechanism).
**Dependencies**: Milestone 3, OQ-001 and OQ-002 resolved.
**Database migrations**: `extension_tokens`-equivalent table + RLS, plus
whatever OQ-001's resolution requires (e.g. a `profiles` table).
**Tests**: register, login (whatever the resolved flow is), lockout-equivalent
behavior if kept, extension token generate/list/revoke, RLS positive/negative
tests for both tables.
**Acceptance criteria**: parity-test checklist's Auth section passes.
**Rollback strategy**: auth is foundational — test exhaustively on staging
before this milestone is considered complete; a rollback here blocks every
later milestone.
**Risks**: High — see OQ-001.

## Milestone 5 — Application data model

Related: [Backend Schema — `applications` and related tables](BACKEND_SCHEMA.md#applications).
**Objective**: enable RLS on `applications` and its directly dependent tables
(`activities`, `stage_history`, `timeline_events`, `checklist_items`, `tags`,
`application_tags`); no UI yet, API/RPC layer only.
**Dependencies**: Milestone 4.
**Database migrations**: RLS policy migrations for these tables.
**Tests**: RLS positive/negative tests; cascade-delete behavior test (matches
`BACKEND_SCHEMA.md`'s documented cascade/SET NULL behavior exactly).
**Acceptance criteria**: an authenticated user can CRUD only their own
applications via the Supabase client directly (no UI needed to verify this).

## Milestone 6 — Application CRUD (UI)

Related: [FEATURE-APP-001](../FEATURE_CATALOG.md#feature-app-001-application-crud--13-stage-workflow), [FEATURE-APP-002](../FEATURE_CATALOG.md#feature-app-002-applications-table--kanban-views-filters-search-sort-pagination), [Application Flow](APP_FLOW.md#journey-1--create-an-application-manually), CR-003.
**Objective**: build Add/Edit/Detail/Table/Kanban screens.
**Dependencies**: Milestone 5, Milestone 2.
**Tasks**: port the 13-stage workflow and its transactional side effects
(BL-001) as a server function/RPC, not client-side logic; implement real
tab-panel switching on Application Detail (CR-003); implement Kanban
grouping/DnD with keyboard parity.
**Tests**: full parity-checklist rows for Applications; visual regression at
all 5 viewports.
**Acceptance criteria**: every quick filter, advanced filter operator, and
saved-view behavior from `ROUTE_SCREEN_INVENTORY.md` works identically.

## Milestone 7 — Search/filter/sort

(Folded into Milestone 6 above in practice, since the current app's filter
system is inseparable from the Applications screen itself — listed separately
here only because the original phase template calls it out; do not build it as
a distinct, disconnected effort.)

## Milestone 8 — Workflow/status management

(Also substantially covered by Milestone 6's stage-transition work — the
separate listing exists to make sure BL-001's transactional/audit/auto-rejection
side effects get their own explicit test coverage, not just "the stage select
works in the UI.")

## Milestone 9 — Contacts

Related: [FEATURE-NET-001](../FEATURE_CATALOG.md#feature-net-001-networking--contacts-crm-lite).
**Objective**: port Networking/Contacts CRUD and its application-linking flow
(historically buggy once — see Round 5's real defect in
`../brain/AGENT_HANDOFF_LOG.md` — write a regression test for the link flow
specifically).
**Dependencies**: Milestone 6.

## Milestone 10 — Tasks

Related: [FEATURE-TASK-001](../FEATURE_CATALOG.md#feature-task-001-task-management).
**Objective**: port Tasks (4 views, recurrence-to-new-row logic per BL-011).
**Dependencies**: Milestone 6 (for optional application linking).

## Milestone 11 — Habits

Related: [FEATURE-HABIT-001](../FEATURE_CATALOG.md#feature-habit-001-habit-tracker), BL-012, CR-002.
**Objective**: port Habits, including the idempotent progress-upsert model and
streak calculation; build a real edit form (CR-002) instead of the current
`prompt()` chain.
**Dependencies**: Milestone 4.

## Milestone 12 — Journal / Notes

Related: [FEATURE-NOTE-001](../FEATURE_CATALOG.md#feature-note-001-journal--notes).
**Objective**: port Notes (5 types, search, optional application link, plain-
text-safe rendering — explicitly re-test XSS-shaped content).
**Dependencies**: Milestone 6 (optional application linking).

## Milestone 13 — Analytics

Related: [FEATURE-ANALYTICS-001](../FEATURE_CATALOG.md#feature-analytics-001-analytics-funnel-source-resume-performance-stage-durationtransitions-aging-activity), BL-004, BL-005, CR-005.
**Objective**: port every analytics formula with parity tests against a fixed
seeded dataset (exact-value assertions, not just "renders without error").
Include Interviews/Rejections/Follow-ups, Resumes, Goals, Reminders, and
Calendar in this milestone's scope as well, since they feed or are fed by
analytics/dashboard data — sequence sub-tasks as needed, but land them together
so the Dashboard milestone (14) has real data to render against. Close CR-005
(Aging widget drill-through) here.

## Milestone 14 — Dashboard

Related: [FEATURE-DASH-001](../FEATURE_CATALOG.md#feature-dash-001-dashboard-user--manager-configurable-widget-layout).
**Objective**: port all 30 widgets, 3-tier grouping, 11 drill-throughs, and the
layout customization editor (drag + keyboard).
**Dependencies**: Milestone 13 (needs Analytics/Goals/Interviews/Follow-ups data
to render against meaningfully).
**Acceptance criteria**: every widget id/type from `ROUTE_SCREEN_INVENTORY.md`'s
registry is present, verbatim (a non-negotiable parity requirement).

## Milestone 15 — Import/export

Related: [FEATURE-IMPEXP-001](../FEATURE_CATALOG.md#feature-impexp-001-import--export), BL-006, BL-007.
**Objective**: port import (preview/commit, alias table, 3 duplicate actions)
and export (13 CSV types + XLSX + full JSON) with formula-injection protection
verified on every path.
**Dependencies**: Milestone 6 (needs Applications data model complete).

## Milestone 16 — Browser extension compatibility

Related: FEATURE-EXT-001 through 005, OQ-002, OQ-008.
**Objective**: repoint (or rebuild, per OQ-008) the extension against the new
API; re-verify every extractor fixture, duplicate-detection state, canonical-
stage sync, and deep-link security check.
**Dependencies**: Milestone 4 (auth), Milestone 6 (applications), Milestone 15's
duplicate-check-adjacent logic is separate (BL-003 vs BL-002 — don't conflate).

## Milestone 17 — Manager oversight

Related: [FEATURE-MGR-001](../FEATURE_CATALOG.md#feature-mgr-001-manager-oversight-dashboard-user-management-audit), OQ-003.
**Objective**: implement the `SECURITY DEFINER` RPC-function approach for
manager cross-user access (resolved in OQ-003 during Gate 4), the User
Management screen (with the last-manager-safeguard), and the read-only Audit
History screen.
**Dependencies**: Milestone 6, OQ-003 resolved.
**Risks**: High if the RPC approach is skipped in favor of a permissive RLS
policy — re-read `SECURITY_AUTHORIZATION.md` before implementing.

## Milestone 18 — Settings & Profile

Related: [FEATURE-SET-001](../FEATURE_CATALOG.md#feature-set-001-settings-appearance-tags-extension-tokens--profile), CR-001.
**Objective**: port Settings (appearance/preferences, tag management, extension
token management) and Profile; close CR-001 (real PIN/credential-change form)
if approved.
**Dependencies**: Milestone 4, Milestone 16 (extension tokens).

## Milestone 19 — Production data migration

Related: [Backend Schema §Data migration](BACKEND_SCHEMA.md#data-migration-neon--supabase--plan-only-not-executed), Gate 6.
**Objective**: execute the full Neon→Supabase data migration against staging,
then (after separate approval) production.
**Dependencies**: every prior milestone functionally complete and tested against
an empty/synthetic Supabase database; Gate 6 approval before touching any real
data.
**Tasks**: the 18-step sequence in `BACKEND_SCHEMA.md` §Data migration, executed
in order, every step validated before proceeding to the next.
**Rollback strategy**: Neon remains untouched and authoritative until Gate 7;
staging migration failures are cost-free to retry.

## Milestone 20 — Testing and parity validation

Related: [Testing Strategy](../TESTING_STRATEGY.md), [Migration Checklist](../MIGRATION_CHECKLIST.md).
**Objective**: run the complete parity-test checklist against the migrated
system with migrated (staging) data; run the full Playwright suite; confirm
zero new accessibility violations.
**Dependencies**: Milestone 19 (staging data migration complete).
**Acceptance criteria**: every checkbox in `../TESTING_STRATEGY.md`'s parity
checklist and `../MIGRATION_CHECKLIST.md` is checked.

## Milestone 21 — Vercel production deployment

**Objective**: deploy the frontend (and any API layer) to Vercel production,
pointed at the production Supabase project (schema + RLS live, data not yet
cut over — this milestone is infrastructure-ready, not traffic-live).
**Dependencies**: Milestone 20.

## Milestone 22 — Cutover

Related: Gate 7.
**Objective**: switch live traffic from Render/Neon to Vercel/Supabase.
**Dependencies**: Milestone 21, Gate 6's production data migration complete and
validated, Gate 7 approval.
**Rollback strategy**: revert DNS/traffic routing to the old system; Neon/Render
remain intact through the retention window (Gate 8 not yet passed).

## Milestone 23 — Legacy retirement

Related: Gate 8.
**Objective**: decommission Render and Neon.
**Dependencies**: Gate 8 approval, an agreed observation window post-cutover
with no rollback need identified.

---

**Numbering note**: this plan uses 24 milestones (0-23) rather than the
originally suggested 20, because Applications' search/filter/sort/workflow
concerns (originally suggested as separate milestones 7-8) are inseparable from
Application CRUD (Milestone 6) in this codebase's actual architecture, and two
additional milestones (Manager Oversight, Settings) needed their own explicit
slots that weren't in the original template. This is a deliberate adaptation to
the real feature set, not a deviation to flag as a problem — see
`../CURRENT_STATE_AUDIT.md` §10 on why there is no smaller "MVP slice" to target
first.

---

## Gate 03 & M1/M1B Architecture Alignment (UPDATED POST-M1B OPTION B ADOPTION, 2026-09-24)

Based on approved Gate 03 specifications and the completed M1B Auth Option B adoption:

1. **Milestone 1 (M1) Spike Execution & Option B Adoption:**
   - Option A was evaluated under [`../gate-03/M1_SPIKE_PLAN.md`](../gate-03/M1_SPIKE_PLAN.md) and FAILED due to synthetic identity exposure via `/auth/v1/user` (T03 hard-fail invariant).
   - Option B was evaluated and passed all 26 test conditions with sanitized evidence across Local Supabase, CI, and Hosted `jobquest-dev`. Formally APPROVED in [`../gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md`](../gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md) and [`../m1b/M1B_FINAL_APPROVAL_REPORT.md`](../m1b/M1B_FINAL_APPROVAL_REPORT.md).
   - Reconciled target database catalog: **29 permanent production tables + 2 migration tracking tables = 31 total target tables** (Option B added `user_credentials`, `auth_sessions`, `auth_refresh_tokens`, `auth_rate_limits`).
   - M1/M1B Implemented Baseline: 11 tables (`user_accounts`, `profiles`, `auth_recovery_codes`, `workspaces`, `workspace_members`, `applications`, `workflow_definitions`, `user_credentials`, `auth_sessions`, `auth_refresh_tokens`, `auth_rate_limits`).
2. **Next Milestone Alignment:**
   - **Milestone 2:** Design System & App Shell (Gate 02B Direction D tokens, base themed components, navigation shell, visual regression baseline, and Vercel preview project initialization).
   - **Milestone 3:** Full Supabase Schema Migration (authoring all remaining target tables).
3. **Milestone 19 (Data Migration) Alignment:**
   - Detailed in [`../gate-03/DATA_MIGRATION_DESIGN.md`](../gate-03/DATA_MIGRATION_DESIGN.md).
   - Follows 10-phase execution plan targeting dedicated `"JobQuest (Migrated)"` system team workspace (OQ-012 resolution) using canonical UUIDv4 (`gen_random_uuid()`) primary keys.
   - Enforces deterministic 13-stage legacy state decomposition into 4 decoupled dimensions (`stage`, `state`, `outcome`, `closure_reason`) verified directly against legacy source code (`Saved` through `Accepted`) and backfilled append-only event sourcing.
