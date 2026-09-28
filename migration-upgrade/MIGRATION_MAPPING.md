# Migration Mapping

| Existing System | Existing File/Module | Target System | Migration Strategy | Risk |
|---|---|---|---|---|
| Hand-rolled Node HTTP routing | `backend/src/server.js` | Node.js + TypeScript REST API (Express/Fastify/Hono, per `docs/TRD.md`) | Port route-by-route using `API_INVENTORY.md` as the checklist; resolve the `PATCH .../stage` dispatch-order ambiguity to just the rich behavior | Medium — 80+ endpoints, several with subtle side effects (BL-001, BL-009) |
| `service.js`/`advanced.js`/`feature-upgrade.js` business logic | `backend/src/*.js` | Typed service layer | Port logic 1:1 first, refactor into typed modules after parity tests pass — resist the urge to "clean up" business rules during the port (see `BUSINESS_LOGIC_CATALOG.md`) | High if rushed — this is where formula/validation fidelity bugs hide |
| Raw `pg` queries, no ORM | `postgres-db.js`, `postgres-worker.js` | Supabase client (`@supabase/supabase-js`) for RLS-scoped queries; a typed query builder (Drizzle/Prisma/Kysely) or the Supabase client itself for anything needing raw SQL | Replace — do **not** port the worker-thread `SharedArrayBuffer`/`Atomics.wait` RPC bridge; it has a known, recurring correctness bug (no request-correlation ID, see `CURRENT_STATE_AUDIT.md` §9) that a normal async-per-request Postgres client eliminates by construction | Low to replace, but only if done deliberately — see `OPEN_QUESTIONS.md` |
| SQLite migration/backup tooling | `sqlite-backup.js`, `sqlite-to-postgres.js`, `migrate.js` | Not needed post-migration | Remove after the Neon→Supabase data migration is complete and verified — this tooling's job (SQLite→Postgres) is already historically done; a *new* one-time Neon→Supabase export/import tool is separate, smaller, purpose-built work | Low |
| PostgreSQL migrations (001-013, hand-written SQL) | `backend/jobsearch/migrations/*.sql` | Supabase migrations (`supabase/migrations/*.sql` or CLI-generated) | Re-author each migration for Supabase/native Postgres types + add RLS policies inline with each table's creation, rather than a blind `pg_dump` restore (see `docs/BACKEND_SCHEMA.md` §Data migration) | Medium — 23 tables, must preserve every CHECK constraint/index/FK exactly |
| Vanilla JS frontend, Vite-built | `frontend/src/*.js` | React + TypeScript + Vite (or Next.js, per `docs/TRD.md` decision) | Rebuild screen-by-screen using `ROUTE_SCREEN_INVENTORY.md`; the existing `features/*/format.js` pure-logic modules (already extracted, framework-agnostic) can port with minimal change — see `docs/ARCHITECTURE.md`'s own note about this being "the natural starting seam" | Medium — 30+ screens, several with intricate stateful UI (Kanban DnD, dashboard layout editor) |
| Custom PIN+session auth | `backend/src/security.js`, session/CSRF logic in `server.js` | Supabase Auth | **Not a mechanical port** — PIN-as-primary-credential has no native Supabase Auth flow. Needs an explicit product decision (see `OPEN_QUESTIONS.md`) before implementation starts | High — a wrong decision here reshapes the whole auth UX |
| Extension bearer tokens | `extension_tokens` table, `backend/src/extension.js` | Either: (a) same pattern, ported verbatim onto Supabase (custom table + RLS), or (b) a Supabase-native long-lived-token mechanism if one exists at migration time | Research first (see `OPEN_QUESTIONS.md`), then port the chosen approach; keep the hash-only-storage/revoke-not-delete pattern regardless | Medium |
| Manifest V3 browser extension | `extension/*` | Same extension, repointed at the new API (and, if the extension itself needs a rebuild for store publication, still vanilla JS/TS — no framework needed for a popup this size) | Repoint `extension/api/jobquest.js` at new endpoint shapes once the backend is ported; re-run every extractor fixture test unchanged (extraction logic doesn't depend on the backend rewrite at all) | Low for extraction logic, Medium for the auth/API integration points |
| Render (single service, Node) | `render.yaml` | Vercel (frontend) + Supabase (DB/backend platform) | Split into two deployables — this is a structural change, not a lift-and-shift; decide whether any server-side logic becomes Vercel Serverless/Edge Functions vs. Supabase Edge Functions (see `docs/TRD.md`) | Medium — changes the deployment topology, health-check semantics, and migration-execution hook (`preDeployCommand` has no Vercel equivalent) |
| Neon PostgreSQL | (production database) | Supabase PostgreSQL | Full data migration per `docs/BACKEND_SCHEMA.md` §Data migration — schema first (with RLS), then data, validated at every step, executed only after explicit approval (see `APPROVAL_GATES.md`) | High — irreversible without a maintained rollback window; treat with the same care `docs/NEON_MIGRATION.md` already modeled for the *previous* SQLite→Neon migration |
| GitHub Actions CI (5 jobs) | `.github/workflows/ci.yml` | GitHub Actions (kept) + Vercel preview deployments + Supabase migration validation | Extend, don't replace — add Supabase-specific validation jobs alongside the existing lint/test/security/visual jobs; keep the existing Playwright suite as the parity gate | Low |
| `node --test` unit/integration/E2E tests | `backend/test/*`, `backend/e2e/*`, `extension/tests/*` | Vitest/Jest + Playwright (kept) | Port test *intent* 1:1 (every case in `TESTING_STRATEGY.md`'s parity checklist), rewritten against the new stack's test runner | Medium — test-authoring effort is real work, not incidental |
| CSV/XLSX/JSON export | `feature-upgrade.js` (`workbook`, `safeCell`), `advanced.js` (`csvEscape`) | Same formats, new implementation | Port `safeCell`'s formula-injection logic verbatim (BL-007) — this is a security control, not incidental formatting code | Low functionally, High if the security property is dropped by accident |
| Analytics formulas | `advanced.js` (`rates()`, funnel/source/stage-duration/resume calculations) | Same formulas, new implementation | Port verbatim (BL-004, BL-005) with a parity test asserting exact values against a fixed seeded dataset, pre- and post-migration | High if silently altered — misleading analytics are worse than none |
| Manager oversight model | scattered `user_id`/`target_user_id` checks across every domain handler | Supabase RLS + `SECURITY DEFINER` RPC functions for the manager-cross-user case | Design the RPC functions before writing any manager UI — RLS alone cannot express this pattern (see `SECURITY_AUTHORIZATION.md`) | High if skipped — could accidentally grant managers blanket access via a permissive RLS policy instead of the current explicit-parameter model |

## Keep

- The 13-stage canonical workflow enum and its single-source-of-truth status
  (consumed by both web UI and extension).
- Every business rule in `BUSINESS_LOGIC_CATALOG.md` — especially the duplicate-
  detection normalization rules (BL-002, BL-003), the analytics rate formulas
  (BL-004, BL-005), and the ownership/mass-assignment invariants (BL-016, BL-017).
- The existing Playwright accessibility/visual-regression suite's *scope and
  bar* (zero violations across every audited page) as the migration's own
  acceptance gate, even though the underlying implementation will be rewritten.
- The additive-only, versioned migration policy.
- The `safeCell()`/CSV-injection protection and the `http:`/`https:`-only URL
  validation — both are security controls, not incidental code.
- The extension's generic-first, source-quality-hierarchy extraction philosophy
  (no accreting brittle per-site adapters beyond the 3 proven high-value ATSes).

## Replace

- Render → Vercel (frontend) + Supabase (backend/DB platform).
- Neon → Supabase PostgreSQL.
- Raw `pg` + hand-rolled worker-thread RPC → Supabase client / a typed query layer.
- Custom session/CSRF web auth → Supabase Auth (with an explicit design decision
  on how PIN fits in, if it's kept at all).
- No-framework vanilla JS frontend → React + TypeScript.
- `node --test` → Vitest/Jest.

## Refactor

- The two near-duplicate ownership-resolution implementations
  (`targetOwner`/`ownerId`, `advanced.js` vs. `feature-upgrade.js`) — consolidate
  into one function during the port, don't preserve the duplication.
- Schema-introspected generic-tracker CRUD (`PRAGMA table_info`-driven allow-lists)
  — make each table's writable fields explicit and typed in the new backend.
- The 11 `window.prompt()`-based quick-edit call sites — design real inline-edit
  components for the new UI (a legitimate `CHANGE_REQUESTS.md` item, not silent
  scope creep, since the current app deliberately chose this pattern for
  consistency reasons that no longer apply once a component framework exists).
- Application Detail's non-functional tab strip (`detailTabs()`) — either
  implement real panel-switching or replace with the current stacked-sections
  layout intentionally, but don't reproduce the "looks like tabs, isn't" gap.

## Remove

- SQLite migration/backup tooling, once the Neon→Supabase migration is complete
  and verified (see above — historically-done job, not ongoing infrastructure).
- The dead thin `PATCH /api/applications/:id/stage` handler in `server.js` (never
  actually reachable due to dispatch order — confirmed, not assumed).
- Nothing else is confirmed obsolete. Per this package's mandate, do not remove
  any feature merely because it appears old or unused without independently
  re-verifying (the Round 3 "callerless `GET /api/applications`" claim was false
  when checked — see `brain/AGENT_HANDOFF_LOG.md` Round 10 entry — the same
  discipline applies here).

## Gate 01 revisions (PROPOSED, 2026-09-23)

See [`GATE_01_ARCHITECTURE_PROPOSAL.md`](GATE_01_ARCHITECTURE_PROPOSAL.md) for the
full, per-table mapping (§10: all **33** legacy tables; the "23" count elsewhere
in this package is wrong) and the per-API-group classification (§11). Rows above
that change:

| Row above | Gate 01 proposal |
|---|---|
| Custom PIN+session auth → Supabase Auth | Username + password via a Node façade over Supabase Auth. PIN retired; no PIN/password hashes migrated; legacy users reclaim via claim codes. |
| Extension bearer tokens | Redesigned: workspace-bound, scoped, expiring, peppered hash, rotatable. Legacy tokens migrated as revoked history only. |
| Manager oversight → RLS + SECURITY DEFINER RPC | Managers are now **workspace-scoped**, so plain membership-based RLS expresses access. RPCs remain for multi-row operations. Cross-owner manager writes are audited by trigger. |
| Browser extension "repoint" | **Incremental migration**: keep extractors/fixtures; replace the API client, auth, workflow and duplicate integration. |
| Render → Vercel + Supabase | Single Vercel project, same origin: SPA + Node API (Hono) as Vercel Functions at `/api`. |
| Keep: 13-stage enum | Kept as vocabulary, **split** into 8 stages + statuses (Rejected/Withdrawn/Ghosted/Position Closed/Accepted become statuses). The mapping is total and reported. |

## Gate 03 revisions (APPROVED WITH REQUIRED CORRECTIONS, 2026-09-24)

Comprehensive Gate 03 database, authentication, and migration designs are codified across `migration-upgrade/gate-03/`.

1. **Full 33-Table Legacy Mapping:** See [`gate-03/LEGACY_TABLE_MAPPING.md`](gate-03/LEGACY_TABLE_MAPPING.md) for the exhaustive classification of all 33 tables:
   - **16 Keep / Modify:** Core entities adapted to target schema with `workspace_id` tenancy and UUIDv4 (`gen_random_uuid()`) primary keys.
   - **2 Split:** `users` (split into `user_accounts` + `profiles` + `workspaces`) and `applications` (split into `applications` + `job_snapshots`).
   - **11 Merge:** Redundant goal, task, tag, preference, and resume history tables consolidated into unified target entities.
   - **4 Replace / Retire:** Legacy sessions, rejections table, reminder categories, and UI preference tables replaced by native Supabase/schema constructs; legacy PIN hashes permanently eliminated.
2. **Definitive 13-Stage Decomposition:** Full deterministic state transformation specified in [`gate-03/DATA_MIGRATION_DESIGN.md`](gate-03/DATA_MIGRATION_DESIGN.md) §3, verified against legacy source code (`Saved` through `Accepted`). `Position Closed` maps to `POSITION_CLOSED`; modern candidate offer declined maps to `WITHDRAWN` + `OFFER_DECLINED`.
3. **Dedicated Migration Workspace:** OQ-012 resolved with target workspace `"JobQuest (Migrated)"` (`gate-03/DATA_MIGRATION_DESIGN.md` §2, ADR-041).
4. **Target Schema Catalog:** Complete 25 permanent target tables + 2 migration tracking tables (**27 total tables**) detailed in [`gate-03/TARGET_SCHEMA.md`](gate-03/TARGET_SCHEMA.md).
5. **M1 Foundational Baseline:** Focused 7-table baseline (`user_accounts`, `profiles`, `auth_recovery_codes`, `workspaces`, `workspace_members`, `applications`, `workflow_definitions`) detailed in [`gate-03/M1_SPIKE_PLAN.md`](gate-03/M1_SPIKE_PLAN.md).

