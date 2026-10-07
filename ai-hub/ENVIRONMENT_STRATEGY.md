# AI Hub — Environment Strategy

## 1. Verified facts [REPO/LIVE] (details: `CURRENT_STATE_AUDIT.md`)

- Dev = Supabase `jobquest-dev` (`xpnkasclquplmrcmhsif`, us-west-2). Prod = Supabase `jobquest-prod` (`kqsxdothjxtcktyirpux`, us-east-1). Separate projects, identical migration list (head `20261022100000`).
- Local = Supabase CLI stack (`supabase/config.toml`, ports 553xx); CI = local Supabase in GitHub Actions.
- Env var names: browser `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; server `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `JQ_JWT_PRIVATE_JWK`, `APP_ORIGINS`, `EXTENSION_TOKEN_PEPPER`, `EXTENSION_ORIGINS`, optional rate-limit/TTL overrides. Real values live in `.env*.local` (gitignored; CI blocks committed env/key files).
- Extension tokens carry an environment prefix (`jqx_dev_`/`jqx_live_`) — a good existing anti-cross-environment pattern.

## 2. Decision: one logical schema, two projects

Same migration files, applied to dev first, prod only at an approved final release. **No** `ai_dev_*`/`ai_prod_*` tables. AI Hub adds no environment-specific schema.

## 3. ARCHITECTURE RISK — ENVIRONMENT ISOLATION (open, not fixed in AI-0)

| # | Risk | Evidence | Status |
|---|---|---|---|
| E-1 | Vercel Preview/Development env var → which Supabase project is unknown; a Preview of a feature branch might point at prod | Vercel MCP 403; no `vercel env` inspection possible in AI-0 | **NEEDS OPERATOR VERIFICATION** |
| E-2 | `.env.production.local` exists on the operator machine; a local run or migration command could target prod | file present (gitignored) | Operational risk |
| E-3 | The agent tooling (Supabase MCP) can reach both projects, including `apply_migration`/`execute_sql` | observed in session | Mitigate by rule: agents apply AI migrations to **dev ref only**; prod ref never written by agents |
| E-4 | No documented/automated prod migration procedure post-Render (old `CONFIRM_PRODUCTION_MIGRATION` gate belongs to retired backend) | `migration-upgrade/CI_CD_DEPLOYMENT.md` stale | Document in AI-1P |
| E-5 | AI provider connectors (Claude/Gemini/ChatGPT) point at one MCP base URL each; a dev connector pointed at prod URL would write prod | design | Require distinct token prefixes + `MCP env tag` check (see §5) |
| E-6 | Prod and dev share one Supabase organization | `list_projects` | Accept; use separate keys |

**Prerequisite phase `AI-1P` (operator-assisted, no code):** confirm Vercel env mapping per environment (Production/Preview/Development), record in this file, confirm prod migration procedure, add agent rule E-3 to `.agents/`. AI-1A may not start until AI-1P is COMPLETE.

## 4. Migration policy (as required)

```
migration on feature branch → apply to DEV project only → targeted DB validation
→ feature implementation → branch CI → development
… final approved release only: prod migration → prod deploy → manual acceptance
```
Migration files are the sole source of truth; never hand-edit either project's schema. Verify with `list_migrations` equality before/after.

## 5. Future AI variables (names only; none created in AI-0)

| Variable | Scope | Dev | Prod |
|---|---|---|---|
| `AI_HUB_ENABLED` | server | `true` | `false` until release |
| `VITE_AI_HUB_ENABLED` | build | `true` | `false` until release |
| `JOBQUEST_MCP_BASE_URL` | docs/operator config for connectors | dev origin + `/api/mcp` | `https://jobquest2.vercel.app/api/mcp` |
| `AI_CONNECTOR_TOKEN_PEPPER` | server secret (distinct from extension pepper) | dev value | prod value |
| `AI_TOKEN_ENV` | server (`dev`/`live`) → token prefix `jqa_dev_`/`jqa_live_` | `dev` | `live` |
| `MCP_OAUTH_*` (issuer, client settings) | server | dev | prod — only if OAuth path chosen (AI-3B) |

Never in the browser: service-role/secret key, DB passwords, connector token pepper, provider refresh tokens, MCP signing keys. A token whose prefix mismatches `AI_TOKEN_ENV` is rejected before any DB lookup.

## 6. Seed / test data

Dev: synthetic fixtures only (no real email content). Tests use the local Supabase stack; the AI contract gets golden-file fixtures (valid, unknown-field, oversize, injection-text) committed under `tests/`. Prod is never seeded.

## 7. AI-1P findings (2026-10-07) — see `reports/AI-1P_ENVIRONMENT_READINESS_REPORT.md`

- **Local dev** → hosted `jobquest-dev` (`xpnkasclquplmrcmhsif`) via `.env.local` — VERIFIED. Supabase CLI link (`supabase/.temp/project-ref`) → dev — VERIFIED. Local Docker stack (`.env.m1b-local`) is test-only.
- **Vercel Preview / Production** env → Supabase mapping: **UNVERIFIED — OPERATOR ACTION REQUIRED** (Vercel MCP 403/404). Production deployment ID/SHA unverified (non-blocking).
- **E-2 `.env.production.local`**: HIGH ENVIRONMENT RISK (build-time only): stale Vercel pull pointing at unknown ref `kwmnljvyvqvbvimypnmw`; Vite auto-loads it on `vite build`. Not jobquest-prod. Do not delete/modify without operator.
- **Migrations are manual** (`pnpm db:push` → CLI-linked project, or MCP `apply_migration` with explicit ref). No CI/CD step applies migrations; CI does not deploy (Vercel Git integration does).
- **Dev / prod procedures and target guard**: see report (create → verify ref == dev → `list_migrations` → apply → verify → targeted tests; prod only at approved release: verify prod ref → main CI → apply once → verify history → deploy → smoke).
- **Preview write-safety**: UNVERIFIED RISK. If Preview = prod → BLOCKER FOR AI WRITE DEVELOPMENT.

### Permanent agent database rule
Development phases may use **only** `jobquest-dev` (`xpnkasclquplmrcmhsif`). `jobquest-prod` (`kqsxdothjxtcktyirpux`) is forbidden for agents (read, `execute_sql`, `apply_migration`) unless the current prompt explicitly approves a production release/verification step. Every migration command must first verify the target ref. Do not push `feature/ai-1-foundation` (it triggers a Vercel Preview build) until the operator confirms Preview → `jobquest-dev`.
