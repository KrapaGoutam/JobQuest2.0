# Database Files

| File | Purpose |
|---|---|
| `backend/jobsearch/migrations/001_jobsearch.sql` through `013_extension_tokens.sql` | The 13-file versioned migration history — see `inventory/migrations.md` for the per-file summary and `../docs/BACKEND_SCHEMA.md` for full table-by-table detail |
| `backend/src/db.js` | SQLite access layer (used by `migrate:check` and historical compatibility tooling — not the production runtime path) |
| `backend/src/postgres-db.js` | Pooled Postgres connection management (production runtime path) |
| `backend/src/postgres-worker.js` | Worker-thread RPC bridge to the pooled connection (do not port — see `../CURRENT_STATE_AUDIT.md` §9) |
| `backend/src/postgres-migrate.js` | Migration execution + production-safety gating |
| `backend/src/migrate.js` | SQLite-based fresh-schema validation tool (`npm run migrate:check`) |
| `backend/src/sqlite-backup.js` | Historical: SQLite source validation/backup for the one-time SQLite→Neon migration |
| `backend/src/sqlite-to-postgres.js` | Historical: SQLite→Postgres data transfer tool |
| `backend/test/migration.test.js` | Tests the SQLite→Postgres migration tool's correctness |

No ORM schema/model files exist (no Prisma schema, no Sequelize models, etc.) —
the SQL migration files themselves are the only schema definition, and
`backend/src/*.js` handler modules query them directly via raw parameterized SQL.
