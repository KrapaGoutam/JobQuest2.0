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

---

# Gate 01 Architecture Decisions (added 2026-09-23)

All entries below are **Status: Proposed**. Full rationale, alternatives and
consequences: [`GATE_01_ARCHITECTURE_PROPOSAL.md`](GATE_01_ARCHITECTURE_PROPOSAL.md).
Where these conflict with ADR-001…006 above, these are the newer proposals.

| ADR | Decision | Proposal § | Decision ID |
|---|---|---|---|
| ADR-007 | Hybrid architecture: direct Supabase (RLS) for simple CRUD, Postgres RPC for transactional/aggregate operations, Node API (Hono on Vercel Functions, same origin) for auth, extension, import/export, membership, and secrets | §4 | D-01, D-03 |
| ADR-008 | Username + password auth: Supabase Auth as the credential/session engine behind a Node username façade (internal alias identity, HttpOnly refresh cookie, in-memory access JWT). Fallback: custom Node auth + Node-only data gateway. PIN retired. | §5 | D-02 |
| ADR-009 | Recovery without mandatory email/phone: single-use recovery codes. No manager-initiated password resets. | §5.8 | D-27 |
| ADR-010 | Workspaces from day one. Every business row carries `workspace_id` + `owner_id`. USER = own records; MANAGER = whole workspace (audited). Personal workspace auto-created on registration. | §6, §7 | D-06, D-19 |
| ADR-011 | Stage ≠ Status ≠ Action. One canonical `@jobquest/workflow` package, seeded to reference tables and served live to the extension. | §9 | D-09 |
| ADR-012 | `application_events` (append-only) replaces `activities` + `timeline_events` + `stage_history`. Stage intervals become a view. | §8.2 | D-10 |
| ADR-013 | Immutable `job_posting_snapshots`; owner-scoped `companies`; `documents` generalizes `resumes` | §8.3–8.4 | D-11, D-12, D-13 |
| ADR-014 | Frontend: React + Vite SPA, TanStack Router/Query, React Hook Form + Zod, Tailwind v4 over semantic tokens, shadcn/ui, Lucide; no global store | §3 | D-04 |
| ADR-015 | Extension: incremental migration (keep extractors/fixtures; new `/api/ext/v1`, scoped expiring peppered-hash workspace-bound tokens) | §12 | OQ-008 |
| ADR-016 | UUID primary keys + `legacy_id` traceability columns | §10 | D-07 |
| ADR-017 | Legacy data → one "JobQuest (migrated)" workspace; legacy accounts reclaimed via operator-issued claim codes; no PIN/password hash migrated | §5.12, §19 | D-17, D-18 |
| ADR-018 | Analytics use "ever reached" from event history (fixes legacy current-stage counting, finding F-2). A legacy-compatible variant is kept only for migration verification. | §0, §20 | D-15 |

---

# Gate 02B UI/UX Design Decisions (added 2026-09-24, APPROVED)

All entries below are **Status: APPROVED** following formal Gate 02B review and user sign-off. They establish the approved Direction D UI baseline and its complete screen extensions across `migration-upgrade/ui-design/gate-02b/`.

| ADR | Decision | Design Document Reference | Status |
|---|---|---|---|
| ADR-019 | Adopt Direction D · JobQuest Hybrid across all 14 mockup modules (117 frames), enforcing semantic tokens, WCAG 2.2 AA in both light & dark themes, and zero horizontal overflow across 4 viewports (Mobile, Tablet, Desktop, Wide). | `gate-02b/GATE_02B_UI_SPEC.md` §1 | APPROVED |
| ADR-020 | Application Detail architecture: 8-pip stage progress bar, Outcome pill, prominent Next Action card, 3 long-form tabs (Timeline, Job posting, Notes), and structured right rail entity cards (Tasks, Interviews, Contacts, Documents, Details). | `gate-02b/GATE_02B_UI_SPEC.md` §4.3 | APPROVED |
| ADR-021 | 3-tier duplicate detection (Strong: URL/ReqID; Probable: Co+Role; Possible: Co only) rendered as non-blocking alerts with explicit override ("Save anyway"). API check failures show honest error states, never false negatives. | `gate-02b/GATE_02B_UI_SPEC.md` §4.4 | APPROVED |
| ADR-022 | Interview model decoupling: Scheduling an interview does not mutate application stage automatically. Checklist replaced with `preparation_notes` and `questions_expected`. Outcome recording prompts for thank-you note and next action. | `gate-02b/GATE_02B_UI_SPEC.md` §7 | APPROVED |
| ADR-023 | Unified Tasks & Follow-ups queue: Consolidates next actions, follow-ups, reminders, and stand-alone tasks into one workbench with recurrence engine (Daily, Weekdays, Weekly, Monthly) and smart date chips. | `gate-02b/GATE_02B_UI_SPEC.md` §6 | APPROVED |
| ADR-024 | Browser extension popup 14-state machine: Token authentication, live canonical workflow sync from `/api/workflow`, structured extraction, duplicate prevention, and honest offline/error states. | `gate-02b/GATE_02B_UI_SPEC.md` §12 | APPROVED |
| ADR-025 | Import wizard with visual column-mapping step (CR-G2B-03), header alias auto-matching, duplicate action controls, and downloadable `import_errors.csv` (CR-016). | `gate-02b/GATE_02B_UI_SPEC.md` §13.1 | APPROVED |
| ADR-026 | Typed "DELETE" safety confirmation for permanent deletion of archived applications; routine deletion is soft-archive with 10-second undo toast. | `gate-02b/GATE_02B_UI_SPEC.md` §4.1, `INTERACTION_SPEC.md` §2.8 | APPROVED |
| ADR-027 | Inactivity review trigger set to 31+ days (aligned with Long Waiting aging band). 15–30 days surfaces aging/stale indicator. Actionable review options: Keep Active, Mark Ghosted, Archive. Zero automatic state mutations. | `gate-02b/GATE_02B_UI_SPEC.md` §4.5, `INTERACTION_SPEC.md` §2.4 | APPROVED |
| ADR-028 | Offer declined represented as Outcome `WITHDRAWN` with structured closure reason `OFFER_DECLINED` (UI displays "Offer declined"). Avoids top-level outcome proliferation; structured for Gate 03 schema design. | `gate-02b/GATE_02B_UI_SPEC.md` §4.1, `FORM_SPEC.md` §3.3 | APPROVED |
| ADR-029 | Applications preview pane defaults to OPEN on viewports ≥ 1680px. Explicit visible toggle and close controls; user open/closed preference persisted. Prohibits global Space shortcut to prevent a11y conflicts. | `gate-02b/RESPONSIVE_MATRIX.md` §2, `ACCESSIBILITY_MATRIX.md` §3 | APPROVED |

---

# Gate 03 Database, Auth & RLS Decisions (added 2026-09-24, APPROVED WITH REQUIRED CORRECTIONS)

All entries below are **Status: APPROVED WITH REQUIRED CORRECTIONS** following formal Gate 03 architectural review. They establish the target PostgreSQL schema (25 permanent tables + 2 migration tables), hybrid Supabase/Node architecture, and RLS security model across `migration-upgrade/gate-03/`.

| ADR | Decision | Design Document Reference | Status |
|---|---|---|---|
| ADR-030 | Authentication Architecture: Option A Layered Supabase Auth (Provisional subject to M1 Spike). Username + password required, email/phone optional, PIN retired. Hard-fail on any synthetic identity leak to browser; triggers Option B architectural fallback. | `gate-03/AUTHENTICATION_DESIGN.md` §2–3 | ~~APPROVED WITH CONDITION~~ → **SUPERSEDED / FAILED IN M1** (2026-09-24, see below) |
| ADR-031 | Primary Key Strategy: UUIDv4 (`gen_random_uuid()`) across all 25 permanent target tables with selective `legacy_id INTEGER` retention and centralized `migration_id_mappings`. Previous UUIDv7 proposal marked SUPERSEDED. | `gate-03/TARGET_SCHEMA.md` §2 | APPROVED (DECISION CHANGED) |
| ADR-032 | Cross-Workspace Integrity: Engine-level composite foreign keys `(parent_id, workspace_id)` referencing compound unique `(id, workspace_id)` on parent tables where they materially prevent tenant leakage. | `gate-03/GATE_03_ARCHITECTURE.md` §4 | APPROVED |
| ADR-033 | Decoupled Application State: 4-dimension normalized model (`stage`, `state`, `outcome`, `closure_reason`) with verified 13 legacy stages from source code (`Saved` through `Accepted`). `Position Closed` maps to `POSITION_CLOSED`; declined offer maps to `WITHDRAWN` + `OFFER_DECLINED`. | `gate-03/RPC_DOMAIN_OPERATIONS.md` §2 | APPROVED |
| ADR-034 | Inactivity & Aging Telemetry: Persisted `last_activity_at TIMESTAMPTZ` column updated atomically via events, with explicit `rpc_keep_application_active` reset. Zero automatic mutations. | `gate-03/RPC_DOMAIN_OPERATIONS.md` §4 | APPROVED |
| ADR-035 | Append-Only Application Event Sourcing: Immutable `application_events` table with versioned JSONB payloads powering historical funnel analytics independently of current pipeline state. | `gate-03/RPC_DOMAIN_OPERATIONS.md` §3 | APPROVED |
| ADR-036 | Last Manager Protection: Database `BEFORE DELETE OR UPDATE` trigger on `workspace_members` preventing removal or demotion of a workspace's final manager. | `gate-03/AUTHORIZATION_RLS_DESIGN.md` §6 | APPROVED |
| ADR-037 | Durable Member Removal: Access revoked by deleting `workspace_members` record; historical records retain attribution with `ON DELETE RESTRICT` foreign keys. | `gate-03/AUTHORIZATION_RLS_DESIGN.md` §5 | APPROVED |
| ADR-038 | Emergency Recovery Architecture: 10 single-use recovery codes with >=128 bits of CSPRNG entropy per code before Crockford Base32 encoding, stored as Argon2id hashes with immediate invalidation. | `gate-03/AUTHENTICATION_DESIGN.md` §6 | APPROVED WITH CORRECTION |
| ADR-039 | Legacy Account Claim Architecture: 30-day default expiry claim tokens (`jqc_live_...`) with operator reissue capability, complete retirement and zero reuse of legacy PIN values/hashes. | `gate-03/AUTHENTICATION_DESIGN.md` §7 | APPROVED WITH CORRECTION |
| ADR-040 | Browser Extension Authentication: Scoped, workspace-bound API tokens (`jqe_live_...`) stored as SHA-256 hashes, with on-demand user revocation in settings. | `gate-03/AUTHENTICATION_DESIGN.md` §8 | APPROVED |
| ADR-041 | Legacy Migration Tenant Isolation: Resolution of OQ-012 by assigning all migrated data to a dedicated `"JobQuest (Migrated)"` system team workspace while provisioning personal workspaces for new work. | `gate-03/DATA_MIGRATION_DESIGN.md` §2 | APPROVED |
| ADR-042 | Client-to-Database Boundary Contract: Strict 3-tier access routing (Direct Supabase PostgREST for reads/CRUD, Database RPCs for domain mutations, Node Façade for auth/secrets). | `gate-03/RPC_DOMAIN_OPERATIONS.md` §1, §6 | APPROVED |

---

# M1 Outcome: ADR-030 status change (added 2026-09-24)

**ADR-030 (Auth Option A): SUPERSEDED / FAILED IN M1.** The original ADR-030 row above is preserved; only its status changed.

- **Evidence:** `m1/M1_AUTH_OPTION_A_RESULT.md`, `m1/evidence/integration-191a31.json` (T03) and `m1/evidence/e2e-leak-local-7e830d.json` (real Chromium).
- **Failed invariant:** a Supabase Auth user's access token, held by the browser for direct Data API access, can call `GET /auth/v1/user`, which returns the internal synthetic email.
- **Consequence:** per ADR-030's own condition, the architectural fallback is Option B. It is evaluated in the M1B spike (`m1b/`) and becomes binding only after that spike passes and the user approves it.

---

# M1B Auth Option B decisions (added 2026-09-24, VERIFIED & APPROVED based on M1B proof)

| ADR | Decision | Reference | Status |
|---|---|---|---|
| ADR-043 | Authentication Option B: the Node API owns credentials (Argon2id, `user_credentials`) and sessions (`auth_sessions` plus single-use rotating refresh tokens), and mints 15-minute ES256 access JWTs (`sub`, `role=authenticated`, `session_id`). The Supabase Data API verifies them through an imported signing key. No Supabase Auth user identities; no synthetic email. Replaces ADR-030. | `gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md` | **APPROVED BASED ON M1B PROOF** (PASS across local stack, CI, and hosted `jobquest-dev`) |
| ADR-044 | Refresh-token replay policy: strictly single use with **no grace window**. Reuse of a consumed token revokes the whole session. The SPA serializes refresh across tabs with the Web Locks API. | Amendment §6 | **APPROVED BASED ON M1B PROOF** |
| ADR-045 | Password change keeps the current session and revokes all others. Recovery-code reset revokes every session. | Amendment §11 | **APPROVED BASED ON M1B PROOF** |
| ADR-046 | Per-IP and per-user auth rate limits use a shared Postgres fixed-window limiter (`auth_rate_limits` / `rpc_rate_limit_hit`), replacing the per-instance in-memory store. Edge/WAF limits are still required before production. | Amendment §12 | **APPROVED BASED ON M1B PROOF** |
| ADR-047 | Workspace roles are never placed in access tokens. MANAGER authority is always read from `workspace_members` at query time. | Amendment §8 | **APPROVED BASED ON M1B PROOF** |

ADR-030 remains **SUPERSEDED / FAILED IN M1** (see above). ADR-038 (recovery codes) and ADR-042 (3-tier boundary) are unchanged and re-verified under Option B.

### Reconciled Target Schema & Implemented Baseline
With Option B approved (ADR-043, CR-031), the target PostgreSQL catalog is reconciled:
- **Permanent Production Tables:** 29 tables (25 Gate 03 baseline + `user_credentials`, `auth_sessions`, `auth_refresh_tokens`, `auth_rate_limits`).
- **Migration-Tracking Tables:** 2 tables (`migration_batches`, `migration_id_mappings`).
- **Total Schema Tables:** 31 tables (29 production + 2 migration).
- **M1/M1B Implemented Baseline:** 11 tables (`user_accounts`, `profiles`, `auth_recovery_codes`, `workspaces`, `workspace_members`, `applications`, `workflow_definitions`, `user_credentials`, `auth_sessions`, `auth_refresh_tokens`, `auth_rate_limits`).
- **Functions / Triggers / RPCs:** 0 views, 5 internal `app` schema helpers, 1 domain RPC (`rpc_create_workspace`), 1 trigger function (`trg_protect_last_manager`), 11 service-role auth RPCs.

