# Environment Matrix

CURRENT STATE. Source: `render.yaml`, `.env.example`, `docs/NEON_MIGRATION.md`,
`README.md`. No secret values are reproduced anywhere in this document — names only.

## Environments

| Environment | Frontend URL | Backend URL | Database | Auth | Deployment source | Branch | Logging |
|---|---|---|---|---|---|---|---|
| Local dev | `http://127.0.0.1:3000` (backend serves `frontend/dist`) | same (single service) | local PostgreSQL instance (`DATABASE_URL` in `.env.example` points at `127.0.0.1:5432`, **not** Neon) | same PIN/session auth as production | manual (`npm run dev`) | any | console (stdout), no external log sink |
| Test (CI) | n/a (headless) | n/a (headless, Playwright drives it) | ephemeral `postgres:17-alpine` GitHub Actions service container per job, `TEST_DATABASE_URL`, DB name always suffixed `_test`/`_browser_test`/`migration_test` | same code path, disposable users | GitHub Actions | any PR/push to `development`/`main`/`master` (+ `feature/upgrade-lovable-ui-reference` on push only) | GitHub Actions job logs; `playwright-report`/`test-results` uploaded as artifacts on failure |
| Production | same origin as backend (one Render web service) | Render-assigned URL | Neon PostgreSQL (`DATABASE_URL` pooled at runtime, `DIRECT_URL` for migrations) | same PIN/session/CSRF/bearer-token model | Render, triggered by push/merge to `main` (per `render.yaml`, `rootDir: backend`) | `main` | Render's platform log stream; no external APM/error-tracking service integrated (STATUS: confirmed absent from `package.json` dependencies and source — no Sentry/Datadog/etc.) |

STATUS: Needs verification — whether a separate "staging"/"preview" environment
exists on Render beyond the single production service described in `render.yaml`.
Nothing in the repository configures one; `docs/FINAL_MAIN_INTEGRATION_PLAN.md`
refers to local full-suite validation as the pre-merge gate, not a hosted staging
tier. Treat "no staging environment exists today" as CONFIRMED unless the user
states otherwise.

## Environment variables (names only — see `.env.example` for the authoritative list)

| Variable | Purpose | Required | Where used | Target (Vercel/Supabase) equivalent |
|---|---|---|---|---|
| `HOST` | Bind address for local dev server | local only | `backend/src/server.js` | n/a (Vercel manages this) |
| `PORT` | Bind port for local dev server | local only | `backend/src/server.js` | n/a (Vercel manages this) |
| `DATABASE_URL` | Pooled Postgres connection string (Neon, runtime) | yes (prod+local) | `backend/src/postgres-db.js`, `postgres-migrate.js` | Supabase connection string / pooler URL |
| `DIRECT_URL` | Direct (non-pooled) Postgres connection, used for migrations | yes (prod migrations, local dev optional) | `backend/src/postgres-migrate.js` | Supabase direct connection string (for migration tooling) |
| `TEST_DATABASE_URL` | Isolated test database (name must end `_test`) | CI/local test runs | `backend/test/*`, CI workflow | ephemeral Supabase branch or local test Postgres |
| `SQLITE_SOURCE_PATH` | Path to the legacy SQLite source file for one-time migration tooling | migration-only, never runtime | `backend/src/sqlite-backup.js`, `sqlite-to-postgres.js` | n/a — retired after the Neon migration completed; **do not** carry into the Supabase migration's env surface, this was already a one-time historical tool |
| `MANAGER_USERNAME` / `MANAGER_PIN` / `MANAGER_FULL_NAME` | One-time manager account seed inputs | only while running `npm run seed` | `backend/src/seed.js` | equivalent seed script against Supabase Auth + `profiles` table |
| `NODE_ENV` | Standard Node environment flag; `production` toggles `Secure` cookie flag and production migration gating | yes (Render sets `production`) | `backend/src/server.js`, `postgres-migrate.js` | n/a (framework-level env, e.g. `VERCEL_ENV`) |
| `RENDER` | Presence alone is used as a signal that migrations may run in "production mode" (Render sets this automatically) | implicit, Render-provided | `backend/src/postgres-migrate.js` | n/a — Vercel-equivalent signal (e.g. `VERCEL`) would need the same treatment if this pattern is kept |
| `CONFIRM_PRODUCTION_MIGRATION` | Explicit opt-in string (`yes-migrate-jobquest`) required to run migrations against a non-`_test` database outside `NODE_ENV=production`/`RENDER` | manual/manual-override only | `backend/src/postgres-migrate.js` | keep this safety gate in whatever migration tool replaces `postgres-migrate.js` |

Also referenced, not in `.env.example` (STATUS: needs verification against the live
Render dashboard, not inspected here): none found beyond the above during this
audit — a full `grep -r "process.env\."` across `backend/src/*.js` during Round 10's
own audit found no undocumented `process.env.*` references (confirmed in
`brain/AGENT_HANDOFF_LOG.md`'s Round 10 entry). Frontend build uses no
`import.meta.env`/`VITE_*` variables at all (confirmed absence — no client-side
secret-exposure surface).

## Target environment variables (Supabase/Vercel — proposed, not yet created)

| Variable | Purpose | Server/Browser |
|---|---|---|
| `SUPABASE_URL` | Project API URL | both (browser: publishable) |
| `SUPABASE_ANON_KEY` | Publishable/anon key for client-side Supabase Auth + RLS-scoped queries | browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for any RPC/admin operation (manager cross-user actions, seed scripts) | server only, never bundled to the browser |
| `DATABASE_URL` (Supabase Postgres) | Direct/pooled connection for any server-side query layer not going through the Supabase client | server only |
| A bearer-token-equivalent secret/config for the browser extension | Extension auth (see `OPEN_QUESTIONS.md` — Supabase has no first-class long-lived external API token primitive) | extension-local storage only |

Never copy real values into this file, `.env.example`, issues, logs, fixtures, or
test output — matches the existing project rule already documented in
`docs/NEON_MIGRATION.md` §Secret handling.
