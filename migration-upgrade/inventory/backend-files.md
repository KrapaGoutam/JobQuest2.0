# Backend Files

All paths relative to `backend/`. Full behavioral detail in `../API_INVENTORY.md`
and `../BUSINESS_LOGIC_CATALOG.md`; this is a structural index only.

| File | Lines (approx) | Purpose |
|---|---|---|
| `src/server.js` | ~984 | Main HTTP router, auth routes, generic tracker CRUD, static file serving, CSP headers |
| `src/service.js` | ~813 | Core validation, `STAGES`/`PRIORITIES`/etc. constants, application CRUD, import/duplicate logic, dashboard summary |
| `src/advanced.js` | ~1672 | Timeline, checklist, tags, saved views, resumes-analytics, reminders, goals, calendar, exports, analytics dispatch, manager audit |
| `src/feature-upgrade.js` | ~814 | Rich stage-change transaction, applications query/Kanban engine, XLSX export, resume clone/history/compare, navigation preferences, goal progress-series |
| `src/tasks.js` | ~321 | Tasks domain (CRUD, recurrence) |
| `src/habits.js` | ~361 | Habits domain (CRUD, streaks, idempotent progress) |
| `src/notes.js` | ~248 | Notes/journal domain (CRUD, search) |
| `src/extension.js` | ~325 | Extension bearer-token management + capture endpoints (duplicate-check, stages, applications) |
| `src/security.js` | — | Scrypt PIN hashing, session token hashing, lockout logic |
| `src/db.js` | — | SQLite access layer (used for `migrate:check` and legacy compatibility tests, not the runtime Postgres path) |
| `src/postgres-db.js` | — | Pooled Postgres connection management |
| `src/postgres-worker.js` | — | Worker-thread RPC bridge for Postgres access (see `../CURRENT_STATE_AUDIT.md` §9 — do not port) |
| `src/postgres-migrate.js` | — | Production-safe migration runner (`resolveMigrationDatabaseUrl`, `isProductionMigrationAllowed`) |
| `src/migrate.js` | — | SQLite-based migration/schema-validation tool (`migrate:check`) |
| `src/seed.js` | — | Manager account seed script (env-var-driven) |
| `src/sqlite-backup.js` | — | Legacy SQLite backup/validation tool (historical, one-time use) |
| `src/sqlite-to-postgres.js` | — | Legacy SQLite→Postgres transfer tool (historical, one-time use) |
| `jobsearch/migrations/001`-`013*.sql` | — | Full schema history — see `inventory/migrations.md` and `../docs/BACKEND_SCHEMA.md` |
| `test/app.test.js` | — | Primary backend/API/integration/e2e-via-API test suite |
| `test/frontend.test.js` | — | Frontend pure-logic tests (run via the backend's `node --test`) |
| `test/migration.test.js` | — | SQLite→Postgres migration-tool test |
| `e2e/jobquest.spec.js` | — | Playwright suite: core app functional/a11y/visual/responsive |
| `e2e/extension.spec.js` | — | Playwright suite: browser extension flows |
| `package.json` | — | Scripts, 2 runtime deps (`exceljs`, `pg`), 3 devDeps |

`backend/data/` (gitignored local dev data), `backend/venv/` (broken/unused
Python venv, explicitly not part of the app per `README.md`), `backend/
playwright-report/`, `backend/test-results/` are build/output artifacts, not
source.
