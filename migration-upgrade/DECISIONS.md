# Architectural Decisions (Migration-Upgrade Package)

ADR-style entries for decisions proposed by this documentation package. All are
**Status: Proposed** — none are implemented, none are approved (see
`APPROVAL_GATES.md`). This is distinct from `brain/DECISIONS.md`, which records
decisions already made and implemented for JobQuest 1.0 itself.

## ADR-001 — Adopt Supabase (Auth + PostgreSQL + RLS) as the backend platform

### Status
Proposed

### Context
JobQuest 1.0 uses hand-rolled session auth + raw `pg` against Neon. The requested
target stack specifies Supabase for Auth/DB/RLS/Storage/Edge Functions.

### Decision
Adopt Supabase as specified, with RLS as the primary authorization mechanism for
owner-scoped tables, supplemented by `SECURITY DEFINER` RPC functions for the
manager-cross-user access pattern that RLS alone cannot express (see OQ-003).

### Alternatives
Keep a custom Postgres + custom auth stack on a different host (rejected — the
migration's stated target is explicitly Supabase); use Supabase only for the
database, keeping custom auth (rejected unless OQ-001 resolves toward keeping
PIN-as-primary, in which case a hybrid is likely necessary anyway).

### Consequences
Real, non-mechanical design work is needed for PIN auth (OQ-001) and extension
bearer tokens (OQ-002) — this is not a drop-in replacement for either.

## ADR-002 — Use React + TypeScript + Vite (or Next.js) for the frontend

### Status
Proposed

### Context
Current frontend is vanilla JS + Vite, already well-modularized (`features/*/
format.js` are pure and framework-agnostic). Target stack specifies React +
TypeScript.

### Decision
Rebuild the frontend in React + TypeScript, reusing every `features/*/format.js`
module with minimal change (typed, not rewritten), and treating `frontend/src/
app.js`'s render/event-wiring code as the part that needs a genuine rewrite into
components.

### Alternatives
Next.js instead of plain Vite+React (worth evaluating in `docs/TRD.md` based on
whether SSR/routing needs justify it — the current app has no SEO requirement
since it's an authenticated single-user-per-account workspace, which weakens the
case for SSR specifically).

### Consequences
30+ screens need individual component design (`docs/UI_UX_DESIGN_BRIEF.md`,
`ROUTE_SCREEN_INVENTORY.md`); several screens have non-trivial stateful UI
(Kanban DnD, dashboard layout editor) that need careful component boundaries.

## ADR-003 — Introduce a real router (React Router or Next.js routing)

### Status
Proposed

### Context
JobQuest 1.0 has no URL-based router at all — `go(page)` is an in-memory state
switch, with only 3 narrow deep-link exceptions (`?application=`, `?id=`,
`#detail:`).

### Decision
Adopt real URL-based routing in the migrated frontend — every screen gets a real
route (e.g. `/applications`, `/applications/:id`, `/settings/tags`), which is a
genuine improvement (bookmarkable URLs, browser back/forward support that
doesn't exist today) rather than a strict parity requirement.

### Alternatives
Preserve the exact current single-page, no-router model (rejected — this is
gratuitous fidelity to an implementation detail that provides no user value and
actively limits basic browser navigation expectations).

### Consequences
This is an intentional, documented behavior *improvement*, not a silent change —
record it as such rather than pretending it's a 1:1 port. Every internal link/
`go()` call site in the current app needs an explicit route-mapping decision
during the port.

## ADR-004 — Keep the browser extension as vanilla JS/Manifest V3, repointed at the new API

### Status
Proposed (pending OQ-008)

### Context
The extension's extraction logic is backend-agnostic; only its API client
depends on endpoint shapes.

### Decision
Do not rewrite the extension's core logic. Repoint `extension/api/jobquest.js` at
the new API surface once it stabilizes; keep every extractor and its fixture
tests unchanged.

### Alternatives
Full extension rewrite in TypeScript with a build step (viable, but adds scope
with no clear user-facing benefit unless Chrome Web Store publication becomes a
goal, which is explicitly out of scope per the original Round 11 brief).

### Consequences
Minimal risk to the extension's proven extraction heuristics (BL-014); the only
real work is the auth/API integration surface.

## ADR-005 — Testing strategy: carry forward Playwright + axe-core as the parity gate

### Status
Proposed

### Context
The existing Playwright suite (functional + accessibility + visual regression,
5 viewports) is mature and already the de facto quality bar for this codebase.

### Decision
Treat "the existing Playwright suite's scope, retargeted at the new frontend,
passes with zero new accessibility violations" as the migration's primary
functional-parity acceptance gate, supplementing rather than replacing it with
new unit/RLS tests as described in `TESTING_STRATEGY.md`.

### Alternatives
Write an entirely new E2E suite from scratch (rejected — throws away a mature,
already-tuned test suite and its documented flake-class knowledge for no
benefit).

### Consequences
Visual-regression baselines will need a full, human-reviewed reset once the UI
is rebuilt in React (expected — a new UI necessarily produces new pixels), but
the *scenarios* tested and the accessibility bar (zero violations) carry forward
unchanged.

## ADR-006 — Do not port the worker-thread Postgres RPC bridge

### Status
Proposed

### Context
`postgres-db.js`/`postgres-worker.js` has a confirmed, recurring correctness gap
(see `CURRENT_STATE_AUDIT.md` §9, OQ-004).

### Decision
The migrated backend uses a standard async-per-request Postgres client (via the
Supabase client library or a typed query builder), not a worker-thread/
`SharedArrayBuffer` RPC bridge.

### Alternatives
Port it for "familiarity" (rejected — carries forward a known bug for no
benefit; the only reason this pattern existed originally was to present a
synchronous-looking API to the rest of a codebase that predates modern
async/await ergonomics, which is not a constraint in a fresh TypeScript
codebase).

### Consequences
None negative identified — this is a strict improvement with no migration risk,
provided it's a deliberate decision rather than an accidental copy-paste.
