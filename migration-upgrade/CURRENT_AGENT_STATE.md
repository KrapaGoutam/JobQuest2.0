# JOBQUEST2.0 - CURRENT AGENT STATE

## Current Milestone

M11 - Browser Extension Migration

## Current Branch

`feature/m11-browser-extension`

## Current HEAD

`6784fc59bde7cc77fb74a917b1c75d8e301e0b0e`

## Last Pushed Commit

`6784fc59bde7cc77fb74a917b1c75d8e301e0b0e` on `origin/feature/m11-browser-extension` (`feat(m11): migrate manifest v3 extension and token settings ui`). First API/security checkpoint: `717e33dcae9aa57ef26a40e7d7382761d8b66108`.

## Development Base

`60ec9dff05588243ae95fb643b31a81fb295e1fb`; M10 is in M11 history. Do not merge this branch.

## Working Tree State

Both implementation slices are committed and pushed. The remaining dirty tree contains only recovery documentation and generated local integration evidence from M1B-M11 regression runs. No pre-existing user changes were discarded.

## Last Completed Step

- Committed and pushed the extension-token migration, HMAC bearer-token primitives, lifecycle RPCs, dedicated `/api/ext/v1` facade, fixed scopes, duplicate classifier, atomic capture RPC, and focused coverage as checkpoint `717e33dc`.
- Implemented owner-private Settings token management with one-time reveal, revoke, rotate, expiry, and safe metadata.
- Imported the verified read-only legacy extraction sources, all six fixture files, and all 11 named extractor cases into `apps/extension`.
- Added the MV3 manifest, local token/origin storage client, options UI, popup X1-X14 state behavior, dynamic canonical workflow, resumes, duplicate warnings, atomic capture, strict CSP, and safe deep links.
- Added web routing for `/w/:workspaceId/applications/:id`, including opening the application drawer and recovering safely when a record is unavailable.
- Copied the three legacy PNG icons read-only and verified source/destination SHA-256 equality.
- Added dev/prod extension packaging source and a root extension-test command.
- Focused web typecheck, focused API typecheck, changed-file lint, token/security unit tests, and static extension syntax/manifest checks have passed.
- Committed and pushed the web Settings/deep-link and Manifest V3 extension slice as checkpoint `6784fc59` after adding persisted System/Light/Dark themes, complete X1-X14 mapping, and manifest/CSP/content integrity tests.

## Current Step

Review and checkpoint the fully green local browser and quality gate.

## Next Exact Step

1. Review intended browser/salary/a11y source, exact-current PASS evidence, screenshots, and generated integration evidence.
2. Commit and push the coherent browser verification checkpoint.
3. Continue to hosted dev and Preview only after the checkpoint is pushed.

## Supabase State

Local Supabase reset succeeds through all 15 migrations with the final safe-column grant hardening. Authenticated direct `token_hash` selection is denied and targeted M11 integration passes 7/7. Hosted dev has not been changed.

## Applied / Pending Migrations

- M1-M10: previously verified locally and in hosted dev.
- `20261005100000_m11_extension_tokens.sql`: applied successfully to local in its committed form; never applied remotely.

## Vercel Preview State

No M11 Preview deployment exists. Allowed target later is Preview only for team `one-piece-5779`, project `jobquest2`. Never use `--prod`.

## Last CI Run

Historical development CI `36252789930` on `60ec9dff` was successful. No M11 CI run has started.

## Local Test State

- Focused API TypeScript: PASS.
- Focused web TypeScript after Settings/deep-link work: PASS.
- Focused ESLint over changed API/web files: PASS.
- Token/security unit set: PASS, 29/29.
- M11 integration with verifier-column denial and notes/applied-date persistence: PASS, 7/7.
- Full integration regression: PASS, 134/134.
- Root unit: PASS, 116/116; root typecheck and lint: PASS.
- Database lint: PASS exit status with one pre-existing M10 volatility warning and no M11 finding.
- Extension tests: PASS, 27/27 across 11 legacy extractor cases, 12 API-client/theme/salary cases, and 4 manifest/CSP/content integrity cases.
- Extension typecheck: PASS.
- Extension dev/prod packaging: PASS; production preset intentionally has no hard-coded origin.
- Extension bundle secret scan: PASS, 40 files and 0 findings.
- Full local gate so far: root lint PASS; root/workspace typecheck PASS; unit 116/116; integration 134/134 across 11 files; extension 27/27; web production build PASS; dev/prod extension packages PASS; database lint exit 0 with only the pre-existing M10 `app.try_import_date` volatility warning; web bundle scan 3 files/0 findings; extension bundle scan 40 files/0 findings; tracked scan 649 files/0 findings.
- Exact-current clean-reset Chromium rerun: PASS, 1/1.

## Hosted Test State

No M11 hosted database or Preview tests have run.

## Extension Fixture State

Six legacy HTML fixtures are present and all 11 named legacy extractor tests pass in JobQuest2. The full extension suite passes 27/27.

## Extension Browser Test State

PASS. Playwright loaded the unpacked MV3 dev package in persistent headless Chromium and verified X1 setup, token creation through the real Settings UI, options/local storage persistence, live content-script extraction, X5 dark ready state, canonical workflow, atomic capture, authenticated deep link, X9 exact duplicate, and X2 revoked-token rejection. Six axe contexts reported 0 critical and 0 serious findings after correcting the dark primary-button contrast. Exact-current timings: extraction 20 ms, popup ready 255 ms, duplicate API 61 ms, capture API 249 ms, duplicate popup 857 ms. Evidence: `migration-upgrade/m11/evidence/browser-local-0df44867.json` and six screenshots under `migration-upgrade/m11/screenshots/`.

## Background Processes

- API listener PID `2596` is healthy on 8787 and web listener PID `52920` is healthy on 5173; both were reused by the browser run.
- Local Supabase is running on 55321 after a clean reset through `20261005100000_m11_extension_tokens.sql`.
- The browser test closes Chromium and removes its temporary persistent profile after every run; no raw extension token remains in test artifacts.

## Modified Files

Only `migration-upgrade/CURRENT_AGENT_STATE.md` and `migration-upgrade/m11/NEXT_AGENT_HANDOFF.md` are modified after the two pushed implementation checkpoints.

## Untracked Classification

- Intended M11 evidence: `migration-upgrade/m11/evidence/integration-local-*.json` (secret-safe structured results; review before staging).
- Generated regression evidence from the successful full integration run also exists untracked under the prior M1B, M3-M10 evidence directories. It is test output from this execution, not unknown user work; decide explicitly whether to retain it in the evidence checkpoint.

## Known Failures

- The first integration attempt exposed an embedded PostgREST relationship assumption in extension actor lookup; fixed by separate account/membership queries.
- The first binary hash display command used the wrong PowerShell argument shape; the copy itself succeeded and a corrected per-file hash verification proved all three icons identical.
- The first extension run exposed URL-scheme normalization and Windows shell-glob typecheck issues; both were fixed.
- A staged test placeholder initially matched the complete Supabase secret pattern; it was shortened to the repository-safe placeholder and the staged tracked scan passed with 0 findings.
- The live browser run exposed comma-separated salary parsing (`195,000` was previously split into `195` and `0`); the parser now preserves thousands separators and has focused regression coverage.
- The first full axe pass exposed 4.16:1 white-on-blue popup buttons in dark mode; the corrected primary palette now passes all six contexts with zero serious/critical findings.
- No active code failure is known. Full local gate and hosted verification remain pending.

## Decisions

- Later Gate 01 authority wins: `jqx_<env>_<random>`, HMAC-SHA256 with `EXTENSION_TOKEN_PEPPER`, fixed five scopes, 90-day default, 365-day maximum.
- Extension bearer auth is separate from web JWT/session auth and rechecks account plus live workspace membership on every request.
- Token rows retain only an operational prefix and HMAC verifier; raw tokens are shown once and never persisted server-side.
- Token metadata uses a 12-character prefix containing the environment marker plus four non-secret random discriminator characters.
- Capture is self-owned and transactional: application, immutable snapshot, database-generated events, and optional resume association.
- Current workflow is loaded from JobQuest; popup labels never become arbitrary database stages.
- Temporary Preview origins will never be hard-coded into the production package. Production packaging remains unbound until a reviewed permanent origin exists.
- JobQuest1.0 remains read-only.

## Unresolved Questions

- The permanent production JobQuest origin is intentionally unknown and not required for M11 Preview validation.
- Real Chromium extension automation feasibility and exact CI integration still need to be proven after the local package is green.
- Hosted dev and Preview credentials/authentication must be checked only after the complete local gate passes.

## Do Not Repeat

- Do not restart M11, reset/rebase/force-push, merge M11, touch `main`, or start M12.
- Do not edit `../JobQuest1.0`.
- Do not claim 16 fixture files; the verified source has six fixture files and 11 named extractor tests.
- Do not map presentation labels such as `Bookmarked` to stages.
- Do not collapse `CHECK_ERROR` into `NONE`.
- Do not apply the migration outside `jobquest-dev` (`xpnkasclquplmrcmhsif`) or deploy beyond Vercel Preview.
- Do not re-open the `token_hash` privilege issue unless later code changes touch the migration/security path; the committed test proves verifier-column denial.
- Do not run another long operation without refreshing this file and the M11 handoff first.

## Safe Resume Commands

```powershell
git status --short --branch
git rev-parse HEAD
pnpm.cmd test:extension
pnpm.cmd --filter @jobquest/extension typecheck
pnpm.cmd --filter @jobquest/web typecheck
pnpm.cmd check:extension
```

## Next Agent Instructions

Continue M11 from pushed web/extension checkpoint `6784fc59`. The complete local gate and exact-current Chromium spec are green. Review, commit, and push the coherent browser/salary/a11y checkpoint, then proceed to hosted dev/Preview. Keep M11 unmerged.
