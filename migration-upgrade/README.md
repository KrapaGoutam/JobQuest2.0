# JobQuest Migration-Upgrade Documentation Package

## What this package is

A complete, source-verified specification of JobQuest 1.0 (the application in
this repository) intended to let a developer or AI coding agent rebuild it on a
modern stack — React + TypeScript, Node.js, Supabase, Vercel — **without
accidentally losing any feature, business rule, or edge case**. This package was
produced by reading the actual source code (backend, frontend, extension,
migrations, tests, CI/CD config) directly, not by guessing from the README or
prior planning documents. Every claim is either marked CONFIRMED (read directly
from source), or flagged `STATUS: Needs verification` where it couldn't be.

This is a **documentation and migration-preparation package only**. No
application code was modified, no migration was executed, no production system
was touched, and no files outside `migration-upgrade/` were changed to produce
it.

## Current application summary

JobQuest is a secure, multi-user job-application tracker: Node.js (no
framework) + PostgreSQL on Neon backend, vanilla HTML/CSS/JS frontend built with
Vite, deployed as one Render service — plus a Manifest V3 browser extension
("JobQuest Capture") for one-click job-posting capture. It is considerably more
feature-complete than a first glance suggests: a 13-stage application workflow,
Table+Kanban views with rich filtering, interviews/rejections/follow-ups,
networking/CRM-lite, resumes with revision history, goals/streaks, a
configurable 30-widget dashboard, calendar, reminders, import/export, tasks,
habits, journal/notes, and analytics — all live, tested, and shipped as of V2.1.
Full detail: `CURRENT_STATE_AUDIT.md`.

## Target migration

React + TypeScript + Vite (or a suitable React framework) frontend; Node.js +
TypeScript backend; Supabase (PostgreSQL, Auth, RLS, Storage where needed, Edge
Functions where genuinely useful) as the database/backend platform; Vercel
(frontend) + Supabase (backend/DB) hosting; GitHub Actions CI/CD. See
`docs/TRD.md` for the full target architecture and `MIGRATION_MAPPING.md` for
the system-by-system mapping.

## Document map

| Document | Purpose |
|---|---|
| `CURRENT_STATE_AUDIT.md` | Phase-1 discovery snapshot of the real stack |
| `FEATURE_CATALOG.md` | Every feature, cataloged with `FEATURE-ID`s |
| `BUSINESS_LOGIC_CATALOG.md` | Every non-obvious business rule (`BL-NNN`), with source citations |
| `API_INVENTORY.md` | Every backend endpoint (80+), grouped by domain |
| `ROUTE_SCREEN_INVENTORY.md` | Every frontend screen, nav structure, dashboard widget registry |
| `MIGRATION_MAPPING.md` | Keep/Replace/Refactor/Remove, system by system |
| `ENVIRONMENT_MATRIX.md` | Environments and env var names (no values) |
| `TESTING_STRATEGY.md` | Current test inventory + target strategy + parity checklist |
| `SECURITY_AUTHORIZATION.md` | Full security/auth posture, current + target |
| `CI_CD_DEPLOYMENT.md` | Current + target CI/CD and deployment pipelines |
| `MIGRATION_CHECKLIST.md` | Cross-cutting operational checklist |
| `OPEN_QUESTIONS.md` | Everything that needs a human decision before implementation |
| `APPROVAL_GATES.md` | The 8 required approval stages — read before starting any implementation |
| `CHANGE_REQUESTS.md` | Proposed intentional changes (not parity-required), tracked with PROPOSED/APPROVED/DEFERRED/REJECTED status |
| `LEGACY_SOURCE_MANIFEST.md` | Which JobQuest 1.0 source files to consult directly, and why |
| `DECISIONS.md` | ADR-style entries for this package's own proposed architectural decisions |
| `SCREENSHOT_INDEX.md` | What visual reference exists today and what to capture later |
| `docs/PRD.md` | Product requirements (current + target) |
| `docs/TRD.md` | Technical requirements (current + target) |
| `docs/UI_UX_DESIGN_BRIEF.md` | Design system, current audit + target direction |
| `docs/APP_FLOW.md` | Navigation hierarchy + 13 user-journey diagrams |
| `docs/BACKEND_SCHEMA.md` | All 23 tables, ERD, RLS proposal, data-migration plan |
| `docs/IMPLEMENTATION_PLAN.md` | 24 milestones (0-23), all status PROPOSED |
| `diagrams/*.md` | Standalone architecture/ERD/flow/deployment/migration diagrams |
| `inventory/*.md` | Flat structural indexes (files, routes, endpoints, components, env vars, migrations, tests, dependencies) |

## Recommended reading order

1. `CURRENT_STATE_AUDIT.md`
2. `docs/PRD.md`
3. `FEATURE_CATALOG.md`
4. `BUSINESS_LOGIC_CATALOG.md`
5. `docs/APP_FLOW.md`
6. `docs/BACKEND_SCHEMA.md`
7. `API_INVENTORY.md`
8. `docs/TRD.md`
9. `MIGRATION_MAPPING.md`
10. `docs/UI_UX_DESIGN_BRIEF.md`
11. `docs/IMPLEMENTATION_PLAN.md`
12. `MIGRATION_CHECKLIST.md`

Read `OPEN_QUESTIONS.md` and `APPROVAL_GATES.md` before starting *any*
implementation work, regardless of where you are in the list above.

## Important migration rules

- **Existing JobQuest 1.0 behavior is the baseline.** The migrated system may
  improve architecture and design, but any *behavior* change must be
  intentional, documented (as a `CHANGE_REQUESTS.md` entry), and approved — not
  an accidental side effect of a rewrite.
- **No implementation has started, and none is approved by this package.**
  Every milestone in `docs/IMPLEMENTATION_PLAN.md` is status PROPOSED. Approval
  happens per-gate (`APPROVAL_GATES.md`), from the JobQuest2.0 repository, and
  approving one gate/milestone never implies approval for the next.
- **`OPEN_QUESTIONS.md` is not optional reading.** Several items (PIN auth,
  manager-RLS, the API-layer-vs-direct-Supabase decision) are high-impact and
  block entire milestones until resolved.

## Source-of-truth hierarchy

1. The actual JobQuest 1.0 source code (`backend/`, `frontend/`, `extension/`,
   migrations) — always the final authority if this package and the code ever
   disagree.
2. This `migration-upgrade/` package — the organized, cross-referenced
   specification built from #1.
3. The repository's other existing docs (`docs/*.md`, `brain/*.md`,
   `tasks/*.md`, `DESIGN.md`) — primary sources this package leaned on heavily;
   consult them directly for narrative detail this package summarizes.
4. Any external "mega-prompt" planning file at the repo root — historical
   planning input only, not authoritative for current behavior.

## How to update these docs

Once copied into the JobQuest2.0 repository, treat this package the same way
the original repository treats `brain/`/`tasks/`: a living reference, updated
whenever a milestone's actual implementation reveals a documented assumption to
be wrong. When a `CHANGE_REQUESTS.md` item is approved, update the corresponding
`FEATURE_CATALOG.md`/`docs/PRD.md` entries to reflect the *target* behavior,
while keeping the CURRENT STATE description of JobQuest 1.0 unchanged (it's a
historical record of the source system, not something that should drift).

## Migration status

**Documentation phase: complete.** No implementation has begun. No approval has
been granted for anything beyond this documentation package itself (Gate 1 is
the only gate this package's completion is even eligible to satisfy — and that
approval still has to come from the project owner, not from the act of writing
these files).
