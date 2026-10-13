# AI Hub — Current-State Audit (AI-0A / AI-0B baseline)

Frozen 2026-10-07. Do not edit the baseline; append a dated addendum if reality changes.
Labels: **[REPO]** observed in JobQuest · **[LIVE]** observed via read-only Supabase MCP · **[NOT DISCOVERABLE]** could not be verified in AI-0.

## 1. Baseline

| Item | Value | Source |
|---|---|---|
| development SHA (AI-0 start) | `c46392e13d4a85878e782439f8c01b11c0c2c92e` ("test: revert E2E tests to match legacy extension schema") | [REPO] `git rev-parse origin/development` |
| main SHA | `26e517ea7cd8e6be421ad2c2188d8ceee4bfb224` ("Merge branch 'development' into main", 2026-10-07) | [REPO] |
| main vs development | main is a merge of development up to `db3bb366`; development is ahead by `c46392e1` only | [REPO] |
| Production URL | `https://jobquest2.vercel.app` | [REPO] `CURRENT_AGENT_STATE.md` |
| Production SHA / deployment ID | **[NOT DISCOVERABLE]** — Vercel MCP returned 403 (team scope). Last *documented* promotion: main `6396f361…`, deployment `dpl_HEq1S4qL2PMPoWzvewEXxxLpPwMY` (2.1-PA, 2026-10-06). main has moved since (2.1-PC merge); the current deployment ID must be confirmed by the operator before any release. | [REPO] doc |
| Dev Supabase | project `jobquest-dev`, ref `xpnkasclquplmrcmhsif`, us-west-2, Postgres 17, ACTIVE_HEALTHY | [LIVE] |
| Prod Supabase | project `jobquest-prod`, ref `kqsxdothjxtcktyirpux`, us-east-1, Postgres 17, ACTIVE_HEALTHY | [LIVE] |
| Migration head — dev | `20261022100000_pl4c_goals_task_templates_recurrence` (20 migrations) | [LIVE] |
| Migration head — prod | identical list, same head `20261022100000` | [LIVE] |
| Migration files in repo | 20 files in `supabase/migrations/`, same head | [REPO] |
| CI | single workflow `.github/workflows/m1b-ci.yml` (see §5) | [REPO] |
| 2.1-G | CLOSED AND SHELVED; branch `feature/2.1g-legacy-db-reconciliation` preserved, not merged | operator |

Dev and prod schemas are in lockstep today: no drift at the migration-list level. (Table-level drift was not diffed.)

## 2. Stack [REPO]

- Monorepo (pnpm): `apps/web` (Vite + React SPA, hand-rolled path switch in `App.tsx`, no router lib), `apps/api` (Hono, mounted at `/api`), `apps/extension` (Chrome MV3 capture extension), `supabase/` (migrations, local stack config), `api/index.ts` (Vercel Function entry; `vercel.json` rewrites `/api/*` to it, everything else to the SPA).
- Same-origin SPA + API on Vercel. CSP `connect-src 'self' https://*.supabase.co`.
- Legacy docs in `migration-upgrade/ENVIRONMENT_MATRIX.md` still describe Render/Neon — **stale**; do not use for environment facts.

## 3. Auth & tenancy model ("Auth Option B") [REPO]

- Custom auth in `apps/api/src/routes/auth.ts`: JobQuest-owned credentials (argon2), sessions + rotating refresh tokens in Postgres, access tokens are ES256 JWTs signed with `JQ_JWT_PRIVATE_JWK` that Supabase trusts (`signing_keys.json` in `supabase/`). It is **not** Supabase Auth password login and there is **no OAuth authorization server**.
- RLS helpers (`20260924120000_m1_foundation.sql`): `app.session_is_active()`, `public.is_workspace_member(ws)`, `is_workspace_manager(ws)`, `can_access_owned_record(ws, owner)` — all `SECURITY DEFINER`, `search_path=''`, executable only by `authenticated`/`service_role`.
- Every domain table carries `workspace_id` + `user_id`; roles are `MANAGER` / member. Managers can see all workspace rows.
- Mutations go through `rpc_*` SECURITY DEFINER functions (~60 exist); sensitive ones are service-role-only and called from the Node facade.
- Audit: `audit_events` table + `rpc_list_workspace_audit_events`; surfaced at `/workspace/audit`.
- Server secrets (names only): `SUPABASE_SECRET_KEY`, `JQ_JWT_PRIVATE_JWK`, `EXTENSION_TOKEN_PEPPER`; browser-safe: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. CI scans the browser bundle and tracked files for secrets (`scripts/check-bundle.mjs`).

## 4. Reusable pieces for AI Hub [REPO]

| Existing | Reuse for |
|---|---|
| `extension_tokens` (M11): scoped, expiring, hashed (HMAC with pepper), revocable, prefix `jqx_dev_`/`jqx_live_` encoding environment, `/api/ext/v1/*` bearer surface | Template for AI connector tokens and for the MCP bearer/scope model |
| `rpc_get_goal_progress`, `rpc_get_analytics_overview`, `rpc_get_stage_timing` | Daily Brief goal/pipeline context |
| `rpc_check_application_duplicate`, `extensionV1 /duplicates/check` | Job-lead and application dedupe |
| `rpc_list_workspace_audit_events` / `audit_events` | AI accept/ignore audit trail |
| Rate limiting (`lib/rateLimit.ts`, `auth_rate_limits`) | MCP/ingest rate limits |
| `requireSameOriginJson`, `securityHeaders` (`lib/security.ts`) | Pattern; MCP needs a **separate** non-same-origin route group |
| Dashboard preferences (M9), global search (M13) | Dashboard AI strip; search over findings (later) |

No `ai_*` tables, no `/api/mcp`, no OAuth server, no feature-flag mechanism exist today. Verified by migration list and `app.route(...)` list in `apps/api/src/app.ts` (`auth, workflow, import, exports, extension, ext/v1`).

## 5. CI / release behavior [REPO]

- Triggers: **push** to `feature/**`, `fix/**`, `development`, `main`; **pull_request** to `development`/`main`; manual dispatch.
- **`docs/**` branches do not trigger push CI.** AI-0's branch push triggers nothing (unless a PR is opened).
- `scripts/classify-ci-changes.mjs` treats as DOCS_ONLY only: root `*.md`, and `*.md` under `migration-upgrade/`, `docs/`, `.agents/`. **`ai-hub/**.md` is NOT docs-only** → merging AI-0 to `development` will run FULL_CI once. **Finding F-1:** recommend a later `chore/` change extending the classifier to `ai-hub/`; not done in AI-0 (executable change).
- Full CI jobs: static (lint, typecheck, unit, build, bundle secret scan) → database (local Supabase: migrations, Option B auth, RLS, browser E2E).
- Promotion rules: see `CLAUDE.md` (main/production frozen pending separately authorized gate).

## 6. UI shell [REPO]

Sidebar groups (`components/shell/Sidebar.tsx`): Dashboard, Applications, Tasks & Follow-ups, Contacts · Calendar, Interviews, Habits, Journal, Resumes · Analytics · Workspace (settings, Import & Export, Members, Audit History) · Settings, Design System. Mobile nav in `MobileNav.tsx`. Routing is a `switch(currentPath)` in `App.tsx`. Settings has `/settings` and `/settings/extension`. There is no "Settings → AI & Automation" yet.

## 7. Environment findings

- **Verified:** two separate Supabase projects (different regions), identical migrations.
- **Not verified / risks:** see `ENVIRONMENT_STRATEGY.md` §3 — `ARCHITECTURE RISK — ENVIRONMENT ISOLATION` is recorded (Vercel Preview/Development env var mapping not discoverable; local `.env.production.local` exists; agent tooling can reach both projects).

## 8. Working inventory (AI-0 efficiency log)

- FILES INSPECTED: CLAUDE.md, `.agents/AGENTS.md` (head), `CURRENT_AGENT_STATE.md` (head), `.env.example` (names only), `vercel.json`, workflow + classifier, `apps/api/src/app.ts`, `api/index.ts`, Sidebar/App route lists, migration headers (foundation, M11), `extension.ts` route list.
- DECISIONS: see `ARCHITECTURE.md`. QUESTIONS RESOLVED / OPEN: see `OPEN_QUESTIONS.md`.
- Subagents used: 0 (all questions answerable by narrow grep).

## Addendum 2026-10-07 (AI-1P)
- Local dev uses HOSTED `jobquest-dev`; CLI link → dev (VERIFIED). `.env.production.local` is a stale Vercel pull pointing at unknown ref `kwmnljvyvqvbvimypnmw`. Vercel Preview/Production mapping and production deployment still unverified (connector 403). Migrations are manual; no CI deploy/migrate. AI-0 dev CI `37690590350` db job still in progress at check time. Details: `reports/AI-1P_ENVIRONMENT_READINESS_REPORT.md`.
