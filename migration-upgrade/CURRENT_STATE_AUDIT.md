# Current State Audit — JobQuest 1.0

STATUS: CONFIRMED unless otherwise marked. Read-only discovery pass over the repository
at `C:\Users\krapa\Documents\Job Search\JobTrackerProjects\jobquest-adaptation-workspace\JobQuest1.0`,
branch `main` @ `9eebfe8`, date 2026-09-23. This supersedes nothing at the repo root —
the root `CURRENT_STATE_AUDIT.md` (dated 2026-09-14, Phase 0 of the *previous* revamp
planning effort) is a valid earlier snapshot; this document restates and extends it
with a full source-level inventory as of V2.1's actual shipped state (10 product
rounds + the browser extension, all merged to `main`).

## 1. Repository shape

```
JobQuest1.0/
├── backend/            Node.js 24 HTTP service (no framework), tests, migrations runner
│   ├── src/            17 source files — server, business logic, db, security, migration tooling
│   ├── jobsearch/migrations/   13 versioned SQL migration files (001–013)
│   ├── test/           node --test suites (app, frontend-logic, migration)
│   ├── e2e/             Playwright specs (jobquest.spec.js, extension.spec.js) + *-snapshots/
│   ├── data/            local dev data dir (gitignored contents)
│   └── venv/            broken/unused Python venv, ignored, not part of the app
├── frontend/           Vite-built vanilla JS SPA
│   ├── src/            app.js (shell + views), application-table.js, application-preview.js,
│   │                   dashboard-config.js, ui-utils.js, icons.js, features/*/format.js
│   ├── public/          static assets
│   └── dist/            build output (served by backend, not committed to be relied on)
├── extension/          Manifest V3 browser extension ("JobQuest Capture")
│   ├── api/jobquest.js, background.js, content.js, popup.*, options.*
│   ├── extractors/     jsonld, greenhouse, lever, indeed, generic, index (orchestrator)
│   ├── fixtures/        HTML test fixtures for extractor unit tests
│   └── tests/           extractor.test.js, api.test.js
├── docs/               ~24 product/architecture/security/test/release docs (see §6)
├── brain/              PROJECT_STATE.md, DECISIONS.md, AGENT_HANDOFF_LOG.md (recovery layer)
├── tasks/              CURRENT_TASK.md, BACKLOG.md
├── .github/workflows/ci.yml   5-job CI pipeline
├── render.yaml         single-service Render deployment config
├── .env.example        documented env var names, no values
├── AGENTS.md           operating instructions for coding agents (this file's own rules)
├── DESIGN.md           authoritative UI/design-token contract
└── README.md           stack + run/seed/command reference
```

Root also has several **untracked, git-ignored "mega-prompt" planning `.md` files**
(`JOBSEARCH_MANAGER_*`, `Feature_Upgrade_2_Codex_Prompt.md`, `HEADROOM.md`,
`JobQuestExtensionV1.md`, `JobQuest1.0.code-workspace`, `package-lock.json` at root) —
these are the user's own historical working drafts, not committed product
documentation, and are not treated as source-of-truth here.

## 2. Runtime & frameworks — CONFIRMED

- **Backend**: plain Node.js ≥24 (`"type": "module"`), **no framework** — no Express,
  Fastify, Koa, Nest. Hand-rolled HTTP routing via manual path/method matching in
  `backend/src/server.js`.
- **Frontend**: vanilla HTML/CSS/JavaScript, **no UI framework** (no React, Vue,
  Svelte), built with **Vite** (`frontend/vite.config.js`, `vite: ^8.3.0`) into
  `frontend/dist`, served as static files by the backend. No TypeScript anywhere in
  the codebase — this is a pure-JavaScript project throughout (backend, frontend, and
  extension).
- **Extension**: Manifest V3, vanilla JS, no bundler (loaded unpacked, no build step
  for the extension itself).
- **Package manager**: npm, three independent `package.json`/lockfile pairs
  (`backend/`, `frontend/`; the extension has no `package.json` — its tests run via
  the backend's `node --test` against files under `../extension/`).

## 3. Database & data layer — CONFIRMED

- **Production & local dev**: PostgreSQL, hosted on **Neon** in production. Accessed
  via `pg` (node-postgres) directly — **no ORM** (no Prisma, Drizzle, Knex, Sequelize,
  TypeORM). All queries are raw parameterized SQL.
- **Migrations**: 13 hand-written, sequentially numbered SQL files in
  `backend/jobsearch/migrations/001` → `013`, applied by
  `backend/src/postgres-migrate.js` (`npm run migrate:postgres`). A separate
  SQLite-oriented `migrate.js` also exists for the SQLite-based test/migration-check
  path (`npm run migrate:check`).
- **SQLite**: retained *exclusively* as a migration-source/backup format
  (`sqlite-backup.js`, `sqlite-to-postgres.js`) and for local schema-validation tests
  (`migrate.js --check` runs against an in-memory/temp SQLite DB to validate the
  migration chain's FK integrity cheaply). **Never a production runtime fallback** —
  confirmed by `postgres-migrate.js`'s URL resolution (`DIRECT_URL || DATABASE_URL ||
  TEST_DATABASE_URL`, never `DATABASE_PATH`) and by README's explicit statement.
- **Connection handling**: `postgres-db.js` + `postgres-worker.js` implement a
  worker-thread-based pooled connection with a `SharedArrayBuffer` + `Atomics.wait`
  synchronous RPC bridge back to the main thread (needed because the rest of the
  codebase's data-access calls are written as synchronous-looking calls). This is a
  **known architectural risk** — see Known Risks §9.

## 4. Data model — CONFIRMED (from migrations 001–013; full detail in `docs/BACKEND_SCHEMA.md`)

23 tables across 8 domains: Identity/Session (`users`, `sessions`, `extension_tokens`),
Applications core (`applications`, `activities`, `stage_history`, `timeline_events`,
`checklist_items`, `tags`, `application_tags`), Interviews/Outcomes (`interviews`,
`rejections`, `follow_ups`), Networking (`networking_contacts`), Documents
(`resumes`, `resume_history`), Goals/Reminders (`daily_goals`, `weekly_goals`,
`goal_settings`, `goal_snapshots`, `reminder_categories`, `reminders`), View/Dashboard
preferences (`saved_views`, `dashboard_preferences`, `application_view_preferences`,
`export_preferences`), Import (`import_batches`, `import_rows`), Audit
(`audit_log`), Productivity net-new domains (`tasks`, `habits`, `habit_logs`,
`notes`). No task/habit/journal domain existed before Rounds 7–9 of the 2026-09
revamp; all three are now live.

## 5. Auth & authorization — CONFIRMED

- Opaque random session tokens; only SHA-256 hashes stored (`sessions.token_hash`);
  12-hour expiry; `HttpOnly`/`SameSite=Strict` cookies, `Secure` added when
  `NODE_ENV=production`.
- 4-digit numeric PIN login (kept as a string so leading zeros survive), salted
  **scrypt** hashing, 5-failed-attempt lockout for 5 minutes, generic error messages
  (no user-enumeration signal).
- CSRF: a token bound to the session row, required (`requireAuth(context, {csrf:
  true})`) on every mutating route.
- Two roles: `USER`, `MANAGER`. Role escalation only via a protected endpoint or the
  env-var-driven `npm run seed` script — never client-settable.
- Row-level ownership enforced at the query layer (`WHERE user_id = ?` everywhere);
  cross-user access returns `404`, never `403` (avoids leaking record existence).
  Managers act cross-user only through an explicit `user_id`/`target_user_id` param.
- Extension auth is a **separate, parallel mechanism**: bearer tokens
  (`extension_tokens`, SHA-256-hashed, revocable, `Authorization: Bearer <token>`),
  deliberately not session-cookie reuse (cross-origin extension contexts can't safely
  access `HttpOnly` cookies without broad permissions).
- CSP is set server-side (`server.js`):
  `default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:;
  connect-src 'self'; frame-ancestors 'none'` — no `unsafe-inline`, no external hosts.

## 6. Hosting / deployment — CONFIRMED (protected infrastructure, do not change without approval)

- **Render** (`render.yaml`): one `web` service, `runtime: node`, `rootDir: backend`.
  `buildCommand: npm ci && npm run build:frontend` (builds the Vite frontend into
  `frontend/dist` as part of the Render build, not at container start).
  `preDeployCommand: npm run migrate:postgres` — migrations run automatically before
  every deploy. `healthCheckPath: /api/health` (fast, DB-independent, so it never
  false-fails during a Neon suspend/reconnect cycle). Env vars `DATABASE_URL` /
  `DIRECT_URL` are Render-dashboard secrets (`sync: false`), never in the repo.
- **Neon**: sole database, in production and local dev alike (`.env.example`'s
  `DATABASE_URL` points at a local Postgres instance for dev, not SQLite). Neon
  autosuspends on idle; the pg pool has already been hardened against the resulting
  disconnects (a real, previously-shipped production incident fix).
- Also: a **production hotfix** (V2.1, commit `dfea126`) added a **startup migration
  runner** directly in `server.js` (in addition to `preDeployCommand`), because Render
  did not reliably invoke `preDeployCommand` for one deploy, which caused a missing
  `extension_tokens` table in production. Both migration paths are now active
  simultaneously — worth knowing for a future platform migration, since most
  serverless/edge platforms don't have an equivalent "run this before traffic" hook
  and idempotent startup-migration may become the *primary* mechanism, not a backup.
- No containerization (no `Dockerfile`), no separate frontend host — one deployable
  unit for both the API and static frontend.

## 7. Testing & CI — CONFIRMED

- `node --test` (Node's built-in runner) for backend/API tests (`app.test.js`),
  frontend pure-logic tests (`frontend.test.js`), and a dedicated SQLite→Postgres
  migration test (`migration.test.js`).
- **Playwright** (`@playwright/test` + `@axe-core/playwright`) for real-Chromium
  functional, accessibility (axe-core), responsive (5 viewport projects: desktop,
  compact-desktop, tablet, mobile, small-mobile), and visual-regression testing, with
  committed baseline screenshots under `*-snapshots/` directories.
- GitHub Actions (`.github/workflows/ci.yml`), 5 parallel jobs on every push/PR to
  `development`/`main`/`master` (+ `feature/upgrade-lovable-ui-reference` on push):
  `static-quality` (migrate:check, lint, typecheck, build, build:frontend),
  `tests` (matrix: backend/frontend/integration/e2e/extension, real Postgres 17
  service container), `security` (npm audit ×2 + committed-secret/DB grep gate),
  `sqlite-postgres-migration` (dedicated Postgres container + `migration.test.js`),
  `browser-and-visual` (full Playwright suite, real Chromium, artifact upload on
  failure). This is a mature, already-comprehensive pipeline.

## 8. Existing documentation — CONFIRMED (do not duplicate; this package cites and extends)

`README.md`, `DESIGN.md`, `AGENTS.md`, `CURRENT_STATE_AUDIT.md` (root),
`docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/TEST_PLAN.md`,
`docs/NEON_MIGRATION.md`, `docs/EXTENSION_ARCHITECTURE.md`,
`docs/EXTENSION_SECURITY.md`, `docs/EXTENSION_TEST_PLAN.md`,
`docs/EXTENSION_INSTALLATION.md`, `docs/FEATURE_UPGRADE_1.md` through
`docs/FEATURE_UPGRADE_11_BROWSER_EXTENSION.md` (11 per-round docs, one is the
combined `10_FINAL`), `docs/FEATURE_UI_UPGRADE_1_1.md`,
`docs/FINAL_MAIN_INTEGRATION_PLAN.md`, `docs/RELEASE_NOTES_V2.md`,
`brain/PROJECT_STATE.md`, `brain/DECISIONS.md`, `brain/AGENT_HANDOFF_LOG.md`,
`tasks/CURRENT_TASK.md`, `tasks/BACKLOG.md`. These are unusually thorough for a
project this size and are treated as primary sources throughout this package —
this package's job is to *reorganize and cross-reference* that material into the
migration-specification shape requested, and to fill source-level gaps (exact table
columns, exact endpoint signatures) that the narrative docs summarize rather than
enumerate.

## 9. Known architectural risks / debt — CONFIRMED from `brain/`, `docs/FEATURE_UPGRADE_10_FINAL.md`

- **Postgres worker RPC has no request-correlation ID** (`postgres-db.js` /
  `postgres-worker.js`): a synchronous cross-thread RPC bridge using a shared buffer
  and `Atomics.wait`, with no correlation ID between a request and its response. A
  timed-out caller can move on while the worker keeps processing, and a late response
  can be read by an unrelated later call. Confirmed recurring (2 independent CI
  occurrences on different query paths, never reproduced locally). **Not fixed** —
  flagged as a priority item for whoever builds the equivalent data layer in the
  migrated system; this is exactly the kind of implicit-correctness risk a
  request/response-per-connection model (e.g. a normal async Postgres client per
  request, as almost any Node/TypeScript backend framework would use) eliminates by
  construction.
- **Several `toast(); render*();` call sites in `frontend/src/app.js` don't `await`
  the re-render** — confirmed, real, causes rare E2E timing flakes; not a data-
  correctness bug, but a pattern a rewrite should not reproduce.
- **`uuid` transitive advisory** (via `exceljs`, MODERATE, below the CI HIGH gate) —
  accepted, tracked debt, not release-blocking.
- **`users.week_start` is inconsistently honored** — Habits (Round 8) is the only
  feature that reads it; the calendar week view and the goal-snapshot weekly walker
  both hardcode Monday-first. A migration should either honor `week_start`
  everywhere or make an explicit, documented product decision to remove it.
- **`prompt()`-based quick-edit UI** is used in 11 places (habit edit, saved-view
  naming, checklist item edit, resume rename, category/tag rename, etc.) — a
  deliberate, consistent, dependency-free pattern in the current app, but native
  `window.prompt()` has no equivalent in most modern frameworks and no accessible
  affordances beyond the browser's own; the target UI should design real modal/inline
  forms for each of these 11 call sites rather than porting the pattern.
- **Rare E2E timing flakes** (mobile-nav transition race, toast-vs-assertion race
  under heavy sequential load) — both root-caused, both rare, neither eliminated.
  Documented so a migration's own E2E suite isn't surprised by the same flake class.

## 10. Feature completeness — CONFIRMED

JobQuest is **not** the minimal tracker its README's one-line description implies. As
of V2.1 (`main` @ `dfea126`), the shipped surface area includes: full application
CRUD with 13-stage workflow, Table + Kanban views (with date/status grouping,
collapsible groups, drag+keyboard+mobile stage movement), advanced filter/sort/
search/pagination, saved views, tags, checklist templates, interviews, rejections,
follow-ups (with suggested/completed dates), networking/contacts CRM-lite, resumes
with revision history, daily/weekly goals with snapshot history and streaks, a
reminder system with categories, a calendar (month/week/agenda), CSV/XLSX/JSON
import and export (with duplicate detection and formula-injection protection),
tasks (recurring, application-linked), habits (streaks, daily/weekdays/weekly),
journal/notes, an analytics module (funnel, source, stage-duration/transitions,
resume performance, all with rates and sample-size caveats), a user + manager
dashboard with configurable/persisted widget layouts, and a Manifest V3 browser
capture extension with multi-tier job-page extraction, company-first duplicate
detection, and canonical-stage-synchronized capture. This is the single most
important fact for a migration scope estimate: **there is no small, "MVP-only"
version of this application already implemented that a migration could target as a
smaller first slice** — everything listed above is live, tested, and in production
use today, and per this package's own preservation mandate, all of it is in scope.

## 11. STATUS: Needs verification

- Whether the `ui-upgrade` branch (mentioned in `brain/PROJECT_STATE.md`, unmerged
  status "unconfirmed, low priority, carried over unresolved across rounds") contains
  anything not already superseded by later rounds. Not inspected in this pass —
  recommend a `git log ui-upgrade --not main` check before treating `main` as fully
  complete relative to all historical branches.
- Whether the actual Render production database currently matches migration `013`
  exactly (the hotfix commit `dfea126` addressed a specific missing-table incident;
  no live production schema introspection was performed in this documentation pass —
  by design, this task is read-only and does not touch any live system).
- Exact current values of any Render environment variables beyond the names in
  `render.yaml`/`.env.example` (deliberately not inspected — see Security rules).
