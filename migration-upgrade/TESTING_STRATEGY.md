# Testing Strategy

CURRENT STATE + TARGET, consolidated from `docs/TEST_PLAN.md`,
`docs/EXTENSION_TEST_PLAN.md`, and direct inspection of `backend/test/`,
`backend/e2e/`, `extension/tests/`.

## Current test inventory

| Suite | Command | Tool | What it covers |
|---|---|---|---|
| Backend | `npm run test:backend` | `node --test` on `backend/test/app.test.js` | Every API domain: auth/session/lockout, applications CRUD + stage transitions, all generic trackers, tasks, habits, notes, extension endpoints, manager endpoints, ownership/IDOR checks, validation edge cases. 61+ cases as of V2.1. |
| Frontend logic | `npm run test:frontend` | `node --test` on `backend/test/frontend.test.js` | Pure formatting/validation functions in `frontend/src/features/*/format.js` (rate labels, task/habit formatting, checklist grouping, import-export formatting), themes, dashboard bulk selection, calendar math, accessible widget movement. 44 cases as of V2.1. |
| Integration | `npm run test:integration` | Same file as backend (`app.test.js`), different invocation intent | Cross-resource flows (e.g. application→interview→timeline chains) |
| E2E (API-level) | `npm run test:e2e` | Same file as backend | Authenticated end-to-end workflow exercised via API calls (not browser) |
| Extension unit | `npm run test:extension` | `node --test` on `extension/tests/{extractor,api}.test.js` | Extractor fixtures (23+ cases across JSON-LD/Greenhouse/Lever/Indeed/generic + the Tensor/JobRight hardening fixtures), API client (normalization, duplicate classification, secure URL building, canonical-stage parity) |
| Migration | `node --test test/migration.test.js` | dedicated Postgres container | SQLite→Postgres transfer tool correctness (separate from schema migrations) |
| Browser/E2E (real Chromium) | `npm run test:browser` | Playwright + `@axe-core/playwright` | Full functional flows, accessibility (axe-core) scans, responsive layout, visual regression — `backend/e2e/jobquest.spec.js` (core app) + `backend/e2e/extension.spec.js` (extension flows, capture-to-save, duplicate deep-linking) |
| Accessibility (focused) | `npm run test:accessibility` | Playwright, `--project=desktop --project=mobile` | Fast a11y-only subset (not the full suite) |
| Visual (focused) | `npm run test:visual` / `test:visual:update` | Playwright, grep-filtered to visual/theme/responsive specs | Committed baseline screenshots under `*-snapshots/` |

5 Playwright viewport projects (`playwright.config.js`): desktop, compact-desktop,
tablet, mobile, small-mobile.

## Parity test checklist — every P0/P1 feature needs a migration parity test

Use this checklist as the acceptance gate for `docs/IMPLEMENTATION_PLAN.md`
milestones — a milestone that touches a feature below is not "done" until its
row is checked and passing against the *migrated* system with real data, not just
against a mocked/seeded minimal fixture.

- [ ] Auth: register, PIN login, lockout, legacy-password transition
- [ ] Application create/edit/delete/archive/restore/pin
- [ ] Application stage transitions (all 13 stages; auto-rejection-row side effect on `Rejected`)
- [ ] Applications search/filter/sort/pagination (every column-filter operator)
- [ ] Applications Kanban (all 5 grouping modes, drag+keyboard move, consequential-stage confirmation)
- [ ] Saved views (create/apply/default)
- [ ] Checklist CRUD + adjacent-swap reorder + lifecycle grouping
- [ ] Tags CRUD + application tagging
- [ ] Interviews / Rejections / Follow-ups CRUD + follow-up date suggestion
- [ ] Networking/Contacts CRUD + application linking
- [ ] Resumes CRUD + revision history/clone/compare + per-resume analytics
- [ ] Daily/Weekly Goals + Goal Settings + Goal History/Comparison/Progress-series
- [ ] Dashboard (user + manager) — every one of the 30 widgets renders, every drill-through navigates correctly
- [ ] Dashboard layout customization (enable/position/size, drag + keyboard reorder, restore defaults)
- [ ] Reminders + Reminder Categories (builtin immutability, reassign-on-delete)
- [ ] Calendar (month/week/agenda, every event type's click-through)
- [ ] Import (preview + commit, both modes, all 3 duplicate actions, alias table)
- [ ] Export (every CSV type, XLSX, full JSON) — formula-injection protection verified on a `=cmd`-prefixed field
- [ ] Tasks (4 views, recurrence, application linking)
- [ ] Habits (3 frequencies, streak calc, idempotent progress upsert under simulated retry)
- [ ] Notes/Journal (5 types, search, application linking, XSS-shaped content stays inert)
- [ ] Analytics (funnel, source, resume, stage-duration/transitions, aging) — rate formulas match exactly against a fixed seeded dataset
- [ ] Extension: token generate/list/revoke
- [ ] Extension: capture across all 5 extraction tiers (JSON-LD, Greenhouse, Lever, Indeed, generic) using the existing fixtures
- [ ] Extension: duplicate detection (all 4 states) + deep-linking (all 3 match tiers + deleted-target fallback + unauthenticated-then-login preservation)
- [ ] Extension: canonical stage sync (parity + "Bookmarked"-style forgery rejection)
- [ ] Manager: dashboard, user management (role/active toggle, last-manager safeguard), audit log
- [ ] Settings: appearance/preferences, tag management, extension token management
- [ ] Ownership/IDOR: every domain returns 404 (not 403, not empty-with-200) for another user's ID
- [ ] Mass-assignment: every create/update rejects client-supplied `user_id`/`target_user_id`/`owner_id`

## Target testing requirements (new stack)

| Layer | Current | Target |
|---|---|---|
| Unit tests | `node --test` | Vitest/Jest (TypeScript-native) |
| Integration tests | `node --test` against real Postgres | Same tool, against a Supabase local/branch instance |
| API tests | `node --test` against the hand-rolled server | Same coverage, against whatever new API layer is chosen |
| Database tests | `migrate:check` (SQLite-based fast validation) + `migration.test.js` | Supabase migration dry-run validation in CI |
| RLS tests | none exist today (no RLS exists today) | **New requirement** — every table's RLS policy needs an explicit positive (owner can access) and negative (non-owner cannot) test, run against a real Supabase instance, not mocked |
| Component tests | none (no component framework exists today) | React Testing Library (or equivalent) for the new component layer |
| Playwright E2E | `backend/e2e/*.spec.js`, 5 viewport projects | Carry forward, retarget at the new frontend; keep the same 5 viewport matrix |
| Browser-extension tests | `extension/tests/*.test.js` | Carry forward unless the extension itself is rebuilt; if rebuilt, re-derive fixtures from the same source-quality hierarchy (BL-014) |
| Accessibility tests | axe-core via Playwright | Carry forward unchanged — this is tooling-agnostic and the existing baseline (zero violations across 8 audited pages, confirmed in Round 10) is the parity bar |
| Migration tests | `migration.test.js` (SQLite→Postgres) | New: Neon→Supabase data-migration validation tests (row counts, FK integrity, spot-check business rules — see `docs/BACKEND_SCHEMA.md` §Data migration steps 6-15) |
| Production smoke tests | manual, per `docs/FINAL_MAIN_INTEGRATION_PLAN.md`'s existing pattern | Automate as a post-deploy Vercel/Supabase smoke check (health endpoint + one authenticated read) |

## Known flake classes to expect (don't mistake these for migration-introduced bugs)

- Mobile-nav CSS-transition timing race (root-caused, mostly fixed, rare residual).
- Toast auto-hide (2600ms) racing an axe scan or a `toBeVisible` assertion under
  heavy sequential E2E load (root-caused, `toastSettled()` helper mitigates it).
- Neither flake is a data-correctness bug — both are E2E test-timing artifacts of
  the current app's async render patterns (BL-004's dashboard note, and the
  unawaited `renderTasks()` call specifically). A migrated frontend built with
  proper `await`ed state updates (e.g. React's own render scheduling) may simply
  not reproduce this flake class at all — don't spend migration effort "porting" it.
