# CI/CD and Deployment

## Current CI

The active workflow is `.github/workflows/m1b-ci.yml` (`M1B CI`). It runs on pushes to `feature/**`, `fix/**`, `development`, and `main`; pull requests targeting `development` or `main`; and manual `workflow_dispatch`. Historical Render-era descriptions are not the current repository contract. The application now uses the Vercel/Supabase architecture recorded in the M15 launch documentation.

## Change classification

Every run starts with a native, deny-by-default classifier. Manual dispatches, missing comparison commits, empty comparisons, classifier errors, and unknown paths all select `FULL_CI`.

`DOCS_ONLY` is selected only when every changed file is Markdown in an approved location: a root-level `*.md`, `migration-upgrade/**/*.md`, `docs/**/*.md`, or `.agents/**/*.md`. Everything else selects `FULL_CI`, including all `.github/**`, application, package, API, Supabase, script, test, E2E, dependency-lock, Playwright, TypeScript, Vite, and Vercel configuration changes. Mixed docs/code changes always receive full CI.

The static job remains a completed, recognizable check for docs-only runs. Its lightweight path checks out the repository, scans every tracked file for secrets, and rejects committed environment/key files. Confirmed docs-only changes skip dependency installation, lint, typecheck, unit tests, build, bundle scan, local Supabase, extension packaging, and Playwright.

## Full CI

For `FULL_CI`, the workflow runs:

- static: tracked-file secret scan, committed environment/key checks, frozen dependency install, lint, typecheck, unit tests, production web build, and B24 browser-bundle scan;
- database/browser: ephemeral signing key, disposable local Supabase migrations, integration suites, Chromium installation, extension unit/typecheck/package checks, full Playwright E2E (including B03/B11/B12), sanitized evidence upload, and unconditional local-stack teardown.

## Concurrency

The concurrency group is `${{ github.workflow }}-${{ github.ref }}`. `cancel-in-progress` is enabled except on `refs/heads/development` and `refs/heads/main`.

- `feature/**` and `fix/**`: a newer same-ref run cancels stale work.
- `development`: an active certification is never cancelled by a later push; the later run queues.
- `main`: an active release certification is never cancelled by a later push; the later run queues.

## Exact-SHA certification

An application SHA remains the certification target until every required job for that exact SHA is final. While an integration-branch certification is active, do not push a docs/checkpoint-only commit to that same branch. Keep temporary state in the agent response or safe local notes, then commit documentation after certification finishes.

Never create empty, timestamp, touch, or fake-source commits to trigger CI. If an unchanged SHA had a cancelled or failed infrastructure attempt, prefer `gh run rerun <RUN_ID>` when appropriate. Record application/CI-tested SHA and a later docs HEAD separately; never claim a docs-only SHA received application CI unless it did.

## GitHub Actions observation and rate limits

Use one CI observer per phase: the primary agent. Subagents, other assistants, connectors, and parallel terminals must not independently poll the same run. After a push, discover the exact run once, record its run ID and head SHA, then prefer `gh run view <RUN_ID>`. For active monitoring, use one `gh run watch <RUN_ID> --interval 60 --exit-status`; never poll more frequently than every 60 seconds. Fetch failure logs only after an actual failure.

On GitHub API HTTP 403 or 429, stop polling immediately. Check the local primary quota once with:

```text
gh api rate_limit --jq '.resources.core | {limit,remaining,used,reset}'
```

If `remaining` is zero, wait for reset. If positive, treat the result as possible secondary throttling or a different client/authentication bucket. Honor `Retry-After` when supplied; otherwise back off for 1, 2, 5, then 10 minutes. Never rotate accounts or tokens to evade a limit. If another connector is throttled while local `gh` is healthy, keep local `gh` as the sole observer.

## Branch and deployment governance

Normal implementation occurs on `feature/*` or `fix/*`, never directly on `development` or `main`. `development` is the integration branch. `main` and Production remain frozen until the separately authorized M15-F gate. Do not merge `development` to `main`, deploy Production, change Production variables, or alter production data/infrastructure without explicit operator authorization.

Schema changes remain versioned in `supabase/migrations/*.sql`, validated against the disposable local stack, and promoted only through the approved branch and release gates.
