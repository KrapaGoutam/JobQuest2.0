# Tests

Full strategy and parity checklist: `../TESTING_STRATEGY.md`. This is the flat
file index.

| File | Runner | Scope |
|---|---|---|
| `backend/test/app.test.js` | `node --test` | Backend API, integration, and API-level E2E (all 3 npm scripts point at this one file) — 60+ cases |
| `backend/test/frontend.test.js` | `node --test` | Frontend pure-logic unit tests — 44 cases |
| `backend/test/migration.test.js` | `node --test` | SQLite→Postgres migration tool correctness |
| `backend/e2e/jobquest.spec.js` | Playwright | Core app functional/accessibility/responsive/visual regression, 5 viewport projects |
| `backend/e2e/extension.spec.js` | Playwright | Browser extension end-to-end flows (capture, duplicate detection, deep-linking) |
| `extension/tests/extractor.test.js` | `node --test` (invoked from `backend/`) | Job-extraction fixtures (JSON-LD, Greenhouse, Lever, Indeed, generic, incl. Tensor/JobRight hardening) — 16+ cases |
| `extension/tests/api.test.js` | `node --test` (invoked from `backend/`) | Extension API client (normalization, duplicate classification, secure URL building, stage parity) — 23+ cases |
| `extension/fixtures/*.html` | (fixtures, not tests) | Real-world captured HTML used by `extractor.test.js` |
| `backend/e2e/*-snapshots/` | (baselines, not tests) | Committed visual-regression baseline screenshots |

CI wiring: `.github/workflows/ci.yml`'s `tests` job matrix covers
`backend`/`frontend`/`integration`/`e2e`/`extension`; `sqlite-postgres-migration`
and `browser-and-visual` are separate dedicated jobs. See `../CI_CD_DEPLOYMENT.md`.
