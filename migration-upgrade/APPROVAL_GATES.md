# Approval Gates

This document establishes the required approval stages for the JobQuest → JobQuest2.0
migration. **Approval of one stage never implies approval of the next.** Each gate
must be explicitly, separately approved by the project owner before work proceeds
past it. An agent (human-directed AI coding assistant) must treat the absence of
explicit approval as "not approved" — silence, a prior unrelated approval, or
inferred enthusiasm do not satisfy a gate.

## Gate 1 — Documentation baseline approval

**Scope**: this entire `migration-upgrade/` package (all files listed in the
required structure) is reviewed and accepted as an accurate, sufficiently complete
representation of JobQuest 1.0's current behavior.
**Not approved by this gate**: any target architecture, UI direction, schema
design, or implementation work. This gate only certifies "the documentation is
correct and complete enough to build from."
**Exit criteria**: project owner confirms no material feature, endpoint, table, or
business rule is missing or misrepresented (or explicitly accepts a documented gap
as acceptable to proceed with regardless).

## Gate 2 — Target architecture approval

**Scope**: `docs/TRD.md`'s target architecture section, `diagrams/
SYSTEM_ARCHITECTURE.md`, `diagrams/MIGRATION_ARCHITECTURE.md`, and every
`OPEN_QUESTIONS.md` item flagged as "High" migration impact (OQ-001, OQ-003,
OQ-007 in particular) must be resolved to explicit decisions before this gate
passes.
**Not approved by this gate**: any code, schema, or UI work.
**Exit criteria**: project owner signs off on the chosen React/Node/Supabase
topology, the auth model (OQ-001), the API-layer-vs-direct-Supabase decision
(OQ-007), and the manager-RLS approach (OQ-003).

## Gate 3 — UI/UX approval

**Scope**: `docs/UI_UX_DESIGN_BRIEF.md`'s target design direction, color system,
and component behavior notes.
**Not approved by this gate**: implementation. A UI/UX approval is a direction
approval, not a per-pixel sign-off — per-screen review happens during
implementation milestones.
**Exit criteria**: project owner accepts the proposed design system approach
(and any named component library) and confirms no P0/P1 UI pattern from
`ROUTE_SCREEN_INVENTORY.md`/`FEATURE_CATALOG.md` was silently dropped or altered
without a corresponding `CHANGE_REQUESTS.md` entry.

## Gate 4 — Supabase schema/Auth/RLS approval

**Scope**: the full proposed schema (`docs/BACKEND_SCHEMA.md`'s "Target Supabase
mapping" per table), the Auth approach resolved from OQ-001, and every RLS policy
outline.
**Not approved by this gate**: actual migration execution, actual `CREATE POLICY`
statements against a real project (those happen during implementation
milestones, tested first against a throwaway/staging project).
**Exit criteria**: project owner confirms the schema preserves every constraint/
index documented in `docs/BACKEND_SCHEMA.md`, and that the RLS approach for the
manager-cross-user case (OQ-003) is acceptable.

## Gate 5 — Individual implementation milestone approval

**Scope**: each milestone in `docs/IMPLEMENTATION_PLAN.md` (Milestone 0 through
Milestone 20) requires its own approval before work begins on it — starting
Milestone 3 does not imply approval for Milestone 4, etc.
**Not approved by this gate**: any milestone other than the one explicitly named.
**Exit criteria**: project owner explicitly names the milestone(s) approved to
start, per milestone, every time.

## Gate 6 — Production data migration approval

**Scope**: executing the Neon→Supabase data migration plan in `docs/
BACKEND_SCHEMA.md` §Data migration against real production data (even into a
staging Supabase project — this gate covers touching real user data at all, not
just the final cutover).
**Not approved by this gate**: production cutover (traffic switch) — see Gate 7.
**Exit criteria**: project owner explicitly authorizes running the export/import/
validation sequence against a copy of production data, with an agreed rollback
plan already reviewed.

## Gate 7 — Production cutover approval

**Scope**: switching live traffic from the JobQuest 1.0 (Render/Neon) system to
JobQuest 2.0 (Vercel/Supabase).
**Not approved by this gate**: legacy retirement — see Gate 8. Cutover approval
explicitly does *not* authorize decommissioning the old system; both may run in
parallel (old system idle/read-only, new system live) for a retention window.
**Exit criteria**: project owner explicitly authorizes cutover, with the full
parity test suite (`TESTING_STRATEGY.md`) green against the migrated system and
Gate 6's data migration independently validated.

## Gate 8 — Legacy retirement approval

**Scope**: decommissioning Render, Neon, or any JobQuest 1.0 infrastructure/repo
access.
**Not approved by this gate**: nothing further — this is the final gate.
**Exit criteria**: project owner explicitly authorizes retirement, after an
agreed-upon post-cutover retention/observation window with no rollback need
identified.

---

**Standing rule for every gate**: approval must be explicit and gate-specific.
A statement like "looks good, keep going" in response to one deliverable does not
carry forward to the next gate. If in doubt whether something was approved, treat
it as not approved and ask.
