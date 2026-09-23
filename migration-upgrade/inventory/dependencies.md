# Dependencies

## `backend/package.json`

**Runtime**:
- `exceljs` `^4.4.0` — XLSX export generation
- `pg` `^8.22.0` — PostgreSQL driver

**Dev**:
- `@axe-core/playwright` `^4.12.1` — accessibility scanning in Playwright specs
- `@playwright/test` `^1.62.1` — browser E2E testing
- `linkedom` `^0.18.13` — lightweight DOM parsing for extractor unit tests

## `frontend/package.json`

**Dev**:
- `vite` `^8.3.0` — build tool (the only frontend dependency of any kind)

## `extension/`

No `package.json` — the extension has zero dependencies (pure vanilla JS,
Manifest V3 APIs only). Its tests run via the backend's `node --test` against
files under `../extension/`.

## Notable absences (confirmed, not assumed)

- No React/Vue/Svelte, no Express/Fastify/Koa/Nest, no ORM (Prisma/Drizzle/Knex/
  Sequelize/TypeORM), no TypeScript, no CSS framework (Tailwind/Bootstrap), no
  state-management library (Redux/Zustand/MobX), no charting library, no HTTP
  client library (uses native `fetch`), no date library (uses native `Date`),
  no testing framework beyond Node's built-in runner + Playwright, no logging/
  APM SaaS dependency.

## Known dependency security debt

One tracked, accepted MODERATE `npm audit` advisory: `uuid` (transitive, via
`exceljs`), only reachable via a breaking `exceljs` downgrade — below the CI
`--audit-level=high` gate, documented rather than silently ignored (see
`../SECURITY_AUTHORIZATION.md` §Dependency security).
