# Product Requirements Document — JobQuest 2.0 Migration

This PRD describes the product JobQuest 1.0 already is (CURRENT STATE) and the
product JobQuest 2.0 should be after migration (TARGET MIGRATION STATE — feature
parity plus the explicitly approved changes in `CHANGE_REQUESTS.md`). It is not a
new product vision — see the philosophy note in `README.md` §Important migration
philosophy.

## 1. Product Overview

JobQuest is a secure, multi-user job-search manager for manually recording
applications already submitted. It tracks the full application pipeline
(13-stage workflow), activity/timeline history, interviews, rejections,
follow-ups, networking contacts, resumes with revision history, daily/weekly
goals, tasks, habits, journal/notes, analytics, and a user + manager dashboard —
plus a Manifest V3 browser extension for one-click capture from any job posting
page. **It does not scrape job boards, discover jobs, or apply on a user's
behalf** — every record is manually entered or explicitly captured by the user,
never automated. Primary users: individual job seekers tracking their own search;
a `MANAGER` role exists for oversight (e.g. a career coach or bootcamp advisor
tracking multiple job seekers' progress), not for team/enterprise administration.

## 2. User Personas

- **Active job seeker**: applies to multiple roles per week, needs fast capture
  (manual + extension), reliable follow-up reminders, and a clear pipeline view.
- **Networking-focused job seeker**: leans heavily on the Networking/Contacts and
  Follow-ups features, tracks referral requests and relationship stages.
- **Power user tracking many applications**: relies on Kanban grouping, saved
  views, advanced filters, and analytics to manage a large, aging pipeline.
- **Career coach / manager**: oversees multiple job seekers' accounts, drills
  into individual users' pipelines, never edits their data directly, relies on
  the audit log for accountability.

No enterprise/team-admin persona exists or is implied by current behavior — do
not invent one for the migration without an explicit product decision.

## 3. User Problems

- "I apply to jobs everywhere and lose track of what I already applied to" →
  duplicate detection (import + extension), search/filter.
- "I forget to follow up after applying or interviewing" → follow-up suggestions,
  reminders, calendar.
- "I don't know if my resume tailoring is working" → per-resume analytics.
- "I don't know if my search is actually going well" → dashboard, analytics,
  aging report, stage-duration analytics.
- "Logging an application I just saw on a job board takes too long" → browser
  extension capture.
- "I want a lightweight place to also track my daily habits/tasks/reflections
  during the job search, without a whole separate app" → Tasks, Habits, Journal.

## 4. Product Goals

Preserve every existing capability with zero silent behavior loss; modernize the
technology stack (React/TypeScript/Supabase/Vercel); improve genuinely
substandard UX found during this audit (PIN-change stub, non-functional detail
tabs, orphaned nav item — see `CHANGE_REQUESTS.md`) only via explicit, approved
change requests, never incidentally.

## 5. Product Principles

Fast capture; low-friction tracking; single source of truth for a user's
application history; searchable job history; reliable follow-up; clear workflow
visibility (the 13-stage model, always); data portability (import/export, never
locking a user's data in); privacy (owner-scoped by default, manager access
always explicit, never blanket).

## 6. Complete Feature List

Every feature below has a full entry in `FEATURE_CATALOG.md` (`FEATURE-<ID>`).
Priority describes **migration criticality**, not feature quality — a P3 feature
is not "less good," it is simply safer to sequence later.

| Feature | ID | Migration priority | Dependencies |
|---|---|---|---|
| Authentication (PIN + legacy transition) | FEATURE-AUTH-001 | P0 | — |
| Application CRUD & 13-stage workflow | FEATURE-APP-001 | P0 | Auth |
| Applications Table + Kanban, filter/sort/search/pagination | FEATURE-APP-002 | P0 | Application CRUD |
| Duplicate detection (import) | FEATURE-APP-003 | P1 | Application CRUD |
| Application Checklist | FEATURE-CHK-001 | P1 | Application CRUD |
| Interviews/Rejections/Follow-ups | FEATURE-INT-001 | P1 | Application CRUD |
| Networking/Contacts | FEATURE-NET-001 | P1 | Application CRUD |
| Resumes & Revision History | FEATURE-RES-001 | P1 | Application CRUD |
| Goals (daily/weekly, settings, snapshots) | FEATURE-GOAL-001 | P1 | Application CRUD |
| Dashboard (user + manager) | FEATURE-DASH-001 | P0 | Applications, Goals, Interviews, Follow-ups |
| Import / Export | FEATURE-IMPEXP-001 | P1 | Application CRUD |
| Task Management | FEATURE-TASK-001 | P2 | Auth |
| Habit Tracker | FEATURE-HABIT-001 | P2 | Auth |
| Journal / Notes | FEATURE-NOTE-001 | P2 | Auth (optional Application link) |
| Analytics | FEATURE-ANALYTICS-001 | P1 | Application CRUD, Resumes |
| Calendar | FEATURE-CAL-001 | P1 | Interviews, Follow-ups, Networking, Reminders, Goals |
| Reminders & Reminder Categories | FEATURE-REM-001 | P1 | Application CRUD |
| Browser Extension — Auth | FEATURE-EXT-001 | P2 | Auth |
| Browser Extension — Extraction | FEATURE-EXT-002 | P2 | Extension Auth |
| Browser Extension — Duplicate Detection | FEATURE-EXT-003 | P2 | Extension Auth, Application CRUD |
| Browser Extension — Canonical Stage Sync | FEATURE-EXT-004 | P2 | Extension Auth |
| Browser Extension — Deep-Linking | FEATURE-EXT-005 | P3 | Extension Duplicate Detection |
| Manager Oversight | FEATURE-MGR-001 | P1 | Auth, Applications |
| Settings + Profile | FEATURE-SET-001 | P1 | Auth |

P0 = application cannot function without it. P1 = core user functionality.
P2 = important enhancement. P3 = optional/future improvement (here: deep-linking
is P3 because the extension is fully usable without it, just less convenient).

## 7. Functional Requirements

- **FR-001**: Users must authenticate before accessing any application data.
- **FR-002**: Every application record must be scoped to exactly one owning user.
- **FR-003**: Application stage must be one of the 13 canonical values, enforced
  identically for web UI, import, and extension capture.
- **FR-004**: The system must detect and warn about likely duplicate applications
  during both bulk import and browser-extension capture, using their respective
  documented algorithms (BL-002, BL-003) — these must remain distinct.
- **FR-005**: A `MANAGER` role user may view/act on another user's data only
  through an explicit target-user parameter, never implicitly.
- **FR-006**: Every mutating action must be attributable (actor vs. owner) for
  audit purposes.
- **FR-007**: Users must be able to export their complete data in a portable
  format (CSV per domain + one full JSON export) at any time.
- **FR-008**: Every analytics rate must display its numerator/denominator, never
  a bare percentage, and must show "No data" rather than 0%/NaN for an empty
  sample.
- **FR-009**: The browser extension must never submit a stage value the backend
  doesn't recognize — it must fetch the canonical stage list live, not hardcode
  it.
- **FR-010**: Deleting an application must cascade its dependent records
  (activities, stage history, timeline, checklist, tags) and null out optional
  links (contacts, tasks, notes) rather than blocking or silently orphaning them.
- **FR-011**: A failed duplicate/network check on the extension must never be
  presented as either "duplicate found" or "no duplicate" — it must show a
  distinct, honest error state.
- **FR-012**: Every CSV/XLSX export cell must be protected against
  spreadsheet-formula injection.
- **FR-013**: `job_url` (and any equivalent URL field) must reject non-http(s)
  schemes across every entry path (manual, import, extension).

## 8. Non-Functional Product Requirements

- **Performance**: no user-facing operation should exceed the responsiveness a
  user would tolerate from a single-page app on a cold-start free-tier host
  (today's Render/Neon-cold-start reality) — the migrated system should be at
  least as responsive, ideally better given Vercel/Supabase's typically faster
  cold starts.
- **Responsiveness**: full support at desktop, tablet, and mobile breakpoints —
  no page may create viewport-level horizontal overflow (existing `DESIGN.md`
  rule, carried forward).
- **Accessibility**: WCAG 2.2 AA, matching the already-achieved zero-violation
  bar across every audited page.
- **Reliability**: no data loss on any create/update/delete path; every
  destructive action requires either confirmation (consequential stage moves) or
  is soft (archive, not immediate hard-delete, for applications).
- **Security**: see `SECURITY_AUTHORIZATION.md` in full — this is a
  security-conscious application today and the migration must not regress it.
- **Usability**: preserve the existing keyboard shortcuts and accessible
  interaction patterns (drag+keyboard parity, focus management).
- **Data portability**: full import/export must remain available at all times,
  including during any transitional dual-running period.
- **Browser support**: Chromium-based browsers at minimum (the extension is
  Chrome/Edge only, Manifest V3) — the web app itself has no confirmed
  browser-support ceiling narrower than "modern evergreen browsers."

## 9. Success Metrics

Define targets separately from current values — no current baseline metrics are
instrumented today (no APM/analytics-of-the-analytics exists), so "current" values
below are honestly marked as not measured.

| Metric | Current value | Target |
|---|---|---|
| Application creation success rate | Not measured | ≥99.9% of well-formed submissions succeed |
| Search/filter query latency | Not measured | p95 < 500ms against a realistic dataset size |
| Page load performance | Not measured (small bundle: ~136KB JS/~38KB gzipped as of V2.1) | No regression vs. this baseline after the React rewrite, ideally improved |
| API error rate | Not measured | < 0.1% 5xx rate under normal load |
| Extension capture success rate | Not measured (34-scenario manual+automated test matrix exists, but no production telemetry) | ≥95% of attempted captures on supported sites produce a usable, editable form |
| Duplicate detection accuracy | Not measured in production; extensively unit/E2E tested | Zero false "duplicate" blocks on genuinely distinct roles (COMPANY_ONLY must never escalate to blocking) |
| Mobile usability | Covered by existing Playwright mobile/small-mobile viewport suite | Zero new accessibility violations at mobile viewports post-migration |
| Import success rate | Not measured | Preserve exact current validation/duplicate-handling behavior; no regression in the parity test suite |

## 10. Out of Scope

- Any product feature not already present in JobQuest 1.0, unless explicitly
  approved via `CHANGE_REQUESTS.md`.
- Job scraping, job discovery, or auto-apply of any kind — this is a permanent
  product boundary, not a migration-phase omission.
- Native mobile applications.
- AI features (resume-matching AI, auto-fill-from-AI, etc.) unless separately
  approved.
- Team/enterprise multi-tenant administration beyond the existing single-manager
  oversight model.
- Destructive database restructuring not required by the migration itself.
- A complete visual redesign disconnected from the migration's own needs — the
  new design system (`docs/UI_UX_DESIGN_BRIEF.md`) should feel like JobQuest,
  informed by `DESIGN.md`, not an unrelated rebrand.

## 11. Known Product Risks

- PIN-as-primary-auth has no direct Supabase equivalent (OQ-001) — risk of a
  rushed, worse-than-current auth UX if not designed deliberately.
- The manager-oversight authorization model doesn't map cleanly onto RLS alone
  (OQ-003) — risk of either broken manager features or accidental over-grant.
- Two known "silently different from what a description implies" areas
  (Application Detail's non-functional tabs, the orphaned Import History nav
  item) could get faithfully "ported" as bugs unless explicitly flagged — this
  document does flag them (`CHANGE_REQUESTS.md` CR-003, CR-004).
- Analytics/dashboard rate formulas are subtle (exact denominator scoping,
  "No data" vs. 0% handling) — a rewrite that "simplifies" these risks silently
  shipping misleading numbers.

## 12. Acceptance Criteria

- Every P0/P1 feature in §6 has a passing parity test (`TESTING_STRATEGY.md`).
- Every business rule in `BUSINESS_LOGIC_CATALOG.md` is either reproduced exactly
  or has an approved `CHANGE_REQUESTS.md` entry documenting the intentional
  change.
- Zero new accessibility violations vs. the pre-migration baseline.
- Every `OPEN_QUESTIONS.md` item is resolved to an explicit decision before the
  milestone it blocks begins.
- All 8 `APPROVAL_GATES.md` gates are passed in order before legacy retirement.

## 13. Gate 01 Target Requirement Changes (PROPOSED, 2026-09-23)

The Gate 01 prompt adds or changes these target requirements. Designs:
[`../GATE_01_ARCHITECTURE_PROPOSAL.md`](../GATE_01_ARCHITECTURE_PROPOSAL.md).
They override §10's "no team/multi-tenant administration beyond the existing
single-manager model" exclusion for **workspaces only**.

- **FR-014** Username + password login; email and phone optional; self-service
  registration; PIN retired (CR-007).
- **FR-015** Multiple independent workspaces. Registration creates a personal
  workspace owned by the user as MANAGER. Users can create or join additional
  workspaces (CR-008).
- **FR-016** Roles USER / MANAGER, scoped per workspace. A manager of one
  workspace never gains access to another (CR-008).
- **FR-017** Current application state **and** a full event history; stage,
  status and action are distinct concepts from one canonical workflow (CR-009,
  CR-010).
- **FR-018** Preserve job-posting snapshots at capture time (CR-011).
- **FR-019** Duplicate detection warns (strong/probable/possible) and shows the
  existing application (CR-012).
- **FR-020** Next action, next-action date, priority, last activity, and days
  since activity on active applications. The dashboard surfaces what needs
  attention.
- **FR-021** Archive-first deletion; hard delete is explicit and audited.
- **FR-022** Light, dark and system themes with a persistent manual override;
  WCAG 2.2 AA in both themes (CR-013).
- **FR-023** Extension authentication is separate from the user's password:
  scoped, revocable, expiring, hashed, auditable (CR-012).
- **FR-024** Audit logging for sensitive and privileged actions.
