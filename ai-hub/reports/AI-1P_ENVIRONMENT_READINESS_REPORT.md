# AI-1P — Environment & Release Readiness Report

Date 2026-10-07 · Agent Claude Code (Sonnet 5.5) · Branch `feature/ai-1-foundation` from development `ab1d7589e4f8b5a9c10c5f22661d71ed268b89d1` · Docs/verification only.

## Objective
Resolve AI-0's `ARCHITECTURE RISK — ENVIRONMENT ISOLATION` (E-1…E-6) before any AI database work.

## AI-0 development CI (run 37690590350)
Workflow `M1B CI`, SHA `ab1d7589…` (development). At check time: **IN PROGRESS** — `Classify changes` success; `Lint · typecheck · unit · build · secret scans` success; `Migrations · Option B auth · RLS · browser (local Supabase)` still running. No rerun triggered. AI-0 changed docs only, so a failure would not be AI-0 related; re-check before the AI-1 merge.

## Mappings
| Environment | Supabase | Ref | Status |
|---|---|---|---|
| Local dev (`pnpm dev:api` loads `.env.local` via `--env-file-if-exists`; Vite `envDir` = repo root) | `jobquest-dev` (HOSTED) | `xpnkasclquplmrcmhsif` | **VERIFIED** (`SUPABASE_PROJECT_REF`, URL host, DB-URL pooler user, `M1B_TARGET=hosted-dev`) |
| Supabase CLI link (`supabase/.temp/project-ref`, used by `pnpm db:push`) | `jobquest-dev` | `xpnkasclquplmrcmhsif` | **VERIFIED** |
| Local stack tests (`.env.m1b-local`, ports 553xx; `m1b-local-env.mjs` refuses non-localhost) | local Docker stack | n/a | VERIFIED |
| CI | ephemeral local Supabase in Actions | n/a | VERIFIED (no deploy/migration steps in `m1b-ci.yml`) |
| Vercel Preview | unknown | – | **UNVERIFIED — OPERATOR ACTION REQUIRED** |
| Vercel Production | expected `jobquest-prod` `kqsxdothjxtcktyirpux` | – | **UNVERIFIED (Vercel side)**; both Supabase projects exist, ACTIVE_HEALTHY, 20 identical migrations |
| Development (integration branch) | `jobquest-dev` | – | by convention/docs; no deployed env verified |

Vercel access: project `jobquest2` (`prj_0A32SVkbOH2fBI2XLFv7kSkv086d`, team `team_lsStfTKp3LGQEWGYRM0BJ4Pb`, from `.vercel/repo.json`). One method tried (Vercel MCP): `list_deployments` → 403, `filter_project_envs` → 404. Not retried.

## Production deployment
Deployment ID / SHA / source branch: **NEEDS OPERATOR VERIFICATION** (last documented `dpl_HEq1S4qL2PMPoWzvewEXxxLpPwMY`, main `6396f361…`; main is now `26e517ea…`). Non-blocking for AI-1A.

## `.env.production.local` — HIGH ENVIRONMENT RISK (build-time; not a prod-write path)
- Git-ignored (`.gitignore:32 .env*`), untracked. Not touched.
- It is a `vercel env pull --environment production` snapshot (`VERCEL_ENV=production`), dated 2026-09-30, i.e. around/before `jobquest-prod` was created (2026-09-30T02:27Z).
- Its `SUPABASE_URL`/`VITE_SUPABASE_URL` host ref is **`kwmnljvyvqvbvimypnmw`** — neither jobquest-dev nor jobquest-prod, and not in the accessible Supabase org. Likely a retired/earlier project (stale). It does NOT contain `kqsxdothjxtcktyirpux`.
- Loading: the API dev server loads only `.env.local`. Vite (`envDir` = repo root) auto-loads `.env.production.local` for `vite build` (production mode), so a local `pnpm build` would bake the stale project URL into the bundle. `vite dev` does not load it.
- Guardrail (future, operator): move it out of the repo directory or delete it after confirming nothing needs it; never ship a locally built bundle (Vercel builds with Vercel env). Also note `.env.local` holds `VERCEL_OIDC_TOKEN` and `LEGACY_DATABASE_URL` (names only) — keep out of AI work.

## Deployment flow (repo-derived)
```
feature/**, fix/**  push  → M1B CI   (docs/** branches: none)
development push / PR     → M1B CI   (FULL_CI for ai-hub/ — classifier finding F-1)
main push / PR            → M1B CI
deployment                → Vercel Git integration (not GitHub Actions); Production branch unverified, expected main
migrations                → MANUAL only (`pnpm db:push` = `supabase db push` on the CLI-linked project). No CI/CD step applies migrations.
```
Wrong-DB capability: `supabase db push` follows the local link (currently dev) or an explicit `--db-url`; agent MCP `apply_migration` takes an explicit project id and can reach prod. No automated pipeline can.

## Development migration procedure (canonical)
1. Create: `supabase migration new <name>` (timestamp > `20261022100000`).
2. Verify target: `supabase/.temp/project-ref` == `xpnkasclquplmrcmhsif`; MCP calls use `project_id=xpnkasclquplmrcmhsif` only; `list_projects` confirms name `jobquest-dev`.
3. Pre-check `list_migrations` (dev) head `20261022100000`.
4. Apply: `pnpm db:push` (CLI) or MCP `apply_migration` on the dev ref — never both for one file.
5. Post-check `list_migrations` (dev) shows the new version matching the repo file.
6. Targeted validation: schema assertions, RLS/grant tests (cross-user, cross-workspace), `get_advisors`.
7. Rollback: no down-migrations; forward-fix with a new migration; destructive resets need operator approval.
8. Credentials: Supabase CLI login/DB password for dev (`.env.local`) or MCP connector; never prod.

## Production migration procedure (proposed)
Never during feature work. Preconditions: migration committed and reviewed; applied and validated on dev; development gate + exact-head CI green; explicit operator approval naming the prod ref.
```
final development approval
→ verify prod ref kqsxdothjxtcktyirpux (list_projects name=jobquest-prod); list_migrations(prod) == pre-release baseline
→ development → main (--no-ff) → main CI green (exact SHA)
→ PRODUCTION MIGRATION GATE: apply approved migrations once (additive only)
→ list_migrations(prod) verified, equals dev
→ production deployment (AI flags default off)
→ smoke / manual acceptance
```
Migrate-before-deploy is chosen because AI migrations are additive (new tables/RPCs) that old code ignores, so rollback = redeploy previous build with no schema rollback. Breaking changes require expand/contract. Operator to confirm Supabase backup/PITR availability before release.

## Migration safety guard (future prerequisite, NOT implemented)
`scripts/assert-migration-target.mjs --expect dev|prod`: reads the CLI-linked/target ref, compares to hard-coded `xpnkasclquplmrcmhsif` (dev) / `kqsxdothjxtcktyirpux` (prod), prints it, exits non-zero on mismatch; prod also needs `--confirm-prod`. A `db:push:dev` wrapper uses it. Registered as AI-1P-G.

## Preview policy (recommended)
Local → jobquest-dev; Feature Preview → jobquest-dev (or isolated preview DB); development → jobquest-dev; main/Production → jobquest-prod only. Prod keys scoped to the Production target only; Preview vars set explicitly to dev. **Classification now: UNVERIFIED RISK.** If the operator finds Preview = prod → BLOCKER FOR AI WRITE DEVELOPMENT.

## Agent guardrail
Development phases: allowed DB `jobquest-dev` only; `jobquest-prod` forbidden unless an operator-approved production release step. Permanent rule in `ENVIRONMENT_STRATEGY.md` §7.

## Risks / blockers
- R1 Vercel Preview/Production env mapping unverified (no impact until a branch is pushed and a Preview builds).
- R2 `.env.production.local` stale, unknown ref, auto-loaded by `vite build` (HIGH, local only).
- R3 No executable target guard yet (AI-1P-G).
- R4 AI-0 dev CI db job still running at check time.
- R5 Production deployment/SHA unverified.
- No hard blocker for AI-1A **provided `feature/ai-1-foundation` is not pushed (no Preview build) until the operator confirms Preview mapping**.

## Operator actions
1. Vercel → Project `jobquest2` → Settings → Environment Variables: for `SUPABASE_URL` and `VITE_SUPABASE_URL` (also confirm `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `JQ_JWT_PRIVATE_JWK`, `EXTENSION_TOKEN_PEPPER`, `APP_ORIGINS`) state which project each of **Production / Preview / Development** uses (ref = URL host prefix). Reply as `Preview → jobquest-dev`, `Production → jobquest-prod`, etc. Do not send values.
2. Vercel → Settings → Git: confirm Production Branch (expected `main`).
3. Vercel → Deployments → Production (Current): record deployment ID + commit SHA.
4. Decide on `.env.production.local` (stale, ref `kwmnljvyvqvbvimypnmw`): relocate or delete.
5. Re-check CI run 37690590350 final result.

## Files changed
`ai-hub/ENVIRONMENT_STRATEGY.md`, `CURRENT_STATE_AUDIT.md` (addendum), `ROADMAP.md`, `PHASE_REGISTRY.md`, `CURRENT_AGENT_STATE.md`, `HANDOFF.md`, `reports/AI-1P_ENVIRONMENT_READINESS_REPORT.md`.

DB changes: NONE · Migrations: NONE · App code: NONE · Tests/CI: not run.

## Decision
**GO FOR AI-1A** (conditional: dev DB only; do not push the feature branch before the operator confirms Preview mapping). Next: AI-1A.
