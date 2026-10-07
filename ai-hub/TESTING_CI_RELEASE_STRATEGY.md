# AI Hub — Testing, CI & Release Strategy

## 1. Observed CI behavior [REPO] (`.github/workflows/m1b-ci.yml`, `scripts/classify-ci-changes.mjs`)

- Push triggers: `feature/**`, `fix/**`, `development`, `main`; PRs to development/main. **`docs/**` and `chore/**` branch pushes do not run CI** (a PR would).
- Docs-only fast path covers root `*.md` and `*.md` under `migration-upgrade/`, `docs/`, `.agents/` only. **`ai-hub/**` is not covered → full CI.** Finding F-1: a future `chore/` change should add `ai-hub/` to `isDocumentationPath` (and its self-test) so doc-only AI Hub updates are cheap. Not done in AI-0 (executable change).
- Full CI = static (lint, typecheck, unit, build, bundle secret scan) → database (local Supabase: migrations, Option B auth, RLS, browser).

## 2. Per-phase flow

```
branch from latest approved development → targeted local validation → push
→ automatic branch CI ONCE (feature/** fix/**) → phase report → merge --no-ff to development ONCE
→ automatic development CI ONCE → STOP
```
Docs-only phases on `docs/**`: no push CI; development CI after merge (full, per F-1 until fixed).
Main and production stay frozen until the operator authorizes the final release. Never merge each phase to main. Follow `CLAUDE.md` Git Safety (exact-path staging, no `add -A`, no force push).

## 3. Targeted testing by layer

| Layer | Tool/location | Required for |
|---|---|---|
| Unit | `pnpm test:unit` (vitest) — contract validator, dedupe keys, matcher, ranking, URL canonicalizer, golden fixtures | 1C, 2C, 2D, 7x, 8x |
| DB / RLS | local Supabase + existing RLS test conventions (`tests/`) — schema assertions, cross-user/cross-workspace denial, client-write denial, ingest idempotency, constraint checks | 1A, 1B, 2B, 2D, 11x |
| API/MCP | integration against Hono app with an MCP client harness — auth, scopes, rate limits, error shapes, kill switch | 3x |
| Component | vitest/RTL for AI Hub views, empty/error/disabled states | 1D, 1E, 7E, 8E |
| E2E (Playwright) | only critical journeys (flag-off ⇒ nav absent; accept suggestion happy path) | sparing |
| Security | injection canaries, oversized/malformed payloads, token replay/expiry/revoke | 3F, 11x |
| Provider | operator manual acceptance scripts recorded in phase report | 4–6 |

Run only the suites relevant to touched code locally; rely on branch CI for breadth. Do not hand-run every suite per change.

## 4. DB validation policy

Apply migrations to the **dev project only**; then run migration validation, schema assertions, RLS checks for the touched tables; compare `list_migrations` with `supabase/migrations`. Never apply from an agent to the prod ref. Rollback for dev = additive-only migrations plus an explicit down script kept in the phase report.

## 5. Flake policy

Unrelated CI failure → inspect only the failed job; use existing historical evidence; prefer failed-job-only rerun; don't rerun whole workflows repeatedly; don't fix unrelated defects in-phase; record disposition in the phase report. Respect `CLAUDE.md` GitHub polling rules (≥60 s, stop on 403/429, no credential switching).

## 6. Report/CI efficiency

Bundle the phase report with the implementation commit when practical; avoid code-commit → CI → report-commit → CI chains; do not push handoff-wording-only commits to development while an application SHA is being certified (CLAUDE.md). Keep "application/CI-tested SHA" distinct from any later docs HEAD.

## 7. Final release (operator-approved only)

final development validation → `development → main --no-ff` → main CI once → approved production migrations (in version order, after verifying dev/prod lists match) → production deployment → production smoke → manual acceptance → `AI_HUB_FINAL_RELEASE_REPORT.md`. Flags remain **off** in prod until the operator turns them on after acceptance (`AI_HUB_ENABLED`, per-workspace flags). Rollback: disable flags first (instant), then revert deployment; AI tables are additive and left in place.
