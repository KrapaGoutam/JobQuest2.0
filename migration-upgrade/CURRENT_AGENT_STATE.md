# JOBQUEST2.0 - CURRENT AGENT STATE

## Current Milestone

M11 - Browser Extension Migration

## Current Branch

`feature/m11-browser-extension`

## Current HEAD

`e4799e01067a88c8c1eecd46595ab64c13dc3330`

## Last Pushed Commit

`e4799e01067a88c8c1eecd46595ab64c13dc3330` on `origin/feature/m11-browser-extension` (`test(m11): verify hosted extension lifecycle`). First API/security checkpoint: `717e33dcae9aa57ef26a40e7d7382761d8b66108`; web/extension checkpoint: `6784fc59bde7cc77fb74a917b1c75d8e301e0b0e`; initial browser checkpoint: `3b9b3970fa579269852ab42b561a04b26d46b4fd`.

## Development Base

`60ec9dff05588243ae95fb643b31a81fb295e1fb`; M10 is in M11 history. Do not merge this branch.

## Working Tree State

The CI workflow/package fix, M10 date-fixture repair, refreshed M10/M11 local evidence, final `e4799e01` Preview evidence, and recovery notes are locally verified and ready for a scoped checkpoint commit. No pre-existing user changes were discarded.

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
- Committed and pushed exact-current unpacked Chromium verification, salary parsing repair, dark-mode contrast repair, final local integration/browser evidence, and six screenshots as checkpoint `3b9b3970`.
- Committed and pushed target-aware local/Preview lifecycle verification, rotation invalidation, reconnect/revocation evidence, hosted integration evidence, and Preview auth/privacy regression evidence as final executable checkpoint `e4799e01`.

## Current Step

Commit and push the locally verified CI hardening changes on top of `e4799e01`.

## Next Exact Step

1. Commit and push the CI hardening checkpoint, then verify GitHub Actions on that new executable SHA.
2. Deploy that exact SHA Preview-only, validate health/M11, then finalize reports and recovery docs.

## Supabase State

Local Supabase reset succeeds through all 15 migrations with the final safe-column grant hardening. Hosted target was verified as `jobquest-dev` / `xpnkasclquplmrcmhsif`; dry-run showed only M11 pending, and `20261005100000_m11_extension_tokens.sql` was applied successfully. Hosted focused M11 integration passes 7/7 with verifier-column denial.

## Applied / Pending Migrations

- M1-M10: previously verified locally and in hosted dev.
- `20261005100000_m11_extension_tokens.sql`: applied successfully to local and hosted dev; migration ledger verification is pending after push.

## Vercel Preview State

M11 Preview is READY: `https://jobquest2-3pxm8abn9-one-piece-5779.vercel.app`, deployment `dpl_9DiSCVyCkYAV1Et2yrzPCcXLogPi`, target `preview`, build duration 42s. Project/team: `one-piece-5779/jobquest2`. Required `EXTENSION_TOKEN_PEPPER` is a cryptographically random Secret scoped to Preview only; Production was not changed. Health is 200. Never use `--prod`.

## Last CI Run

M11 run `36317760917` on `e4799e01` completed: static job `108615594200` passed; database/browser job `108615594118` failed. Root causes are verified: the workflow did not package the unpacked extension before M11 Playwright, and M10 hard-coded `2026-09-26` while its seed application used the database's current date (`2026-09-27`). Both fixes pass the focused local M10 + M11 browser reproduction.

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
- Post-CI-fix focused browser reproduction: PASS, M10 + M11 2/2 in 24.8 seconds. Latest local M11 evidence: `browser-local-f719491e.json`.

## Hosted Test State

Hosted dev M11 integration: PASS, 7/7. Evidence: `migration-upgrade/m11/evidence/integration-hosted-dev-9ba597.json`. Preview unpacked-extension flow including one-time token reveal, storage, workflow, extraction, capture, exact duplicate, deep link, rotation invalidation, reconnect, revocation, dark mode, and six axe contexts: PASS with 0 critical/serious findings (`browser-vercel-preview-4b974939.json`). Option B privacy/auth plus M2 shell regression: PASS, 5/5 (`e2e-browser-vercel-preview-a98515.json`).

## Extension Fixture State

Six legacy HTML fixtures are present and all 11 named legacy extractor tests pass in JobQuest2. The full extension suite passes 27/27.

## Extension Browser Test State

PASS. Playwright loaded the unpacked MV3 dev package in persistent headless Chromium and verified X1 setup, token creation through the real Settings UI, options/local storage persistence, live content-script extraction, X5 dark ready state, canonical workflow, atomic capture, authenticated deep link, X9 exact duplicate, and X2 revoked-token rejection. Six axe contexts reported 0 critical and 0 serious findings after correcting the dark primary-button contrast. Exact-current timings: extraction 20 ms, popup ready 255 ms, duplicate API 61 ms, capture API 249 ms, duplicate popup 857 ms. Evidence: `migration-upgrade/m11/evidence/browser-local-0df44867.json` and six screenshots under `migration-upgrade/m11/screenshots/`.

## Background Processes

- Local API/web listeners are healthy on 8787/5173 and the disposable Supabase stack was clean-reset through M11 on 55321/55322.
- The extension CI gate has been reproduced locally: 27/27 tests, typecheck, dev package, and bundle scan with 40 files/0 findings.
- The browser test closes Chromium and removes its temporary persistent profile after every run; no raw extension token remains in test artifacts.

## Modified Files

The scoped CI workflow/test fixes, refreshed M10/M11 test evidence/screenshots, final `e4799e01` Preview evidence, and these recovery notes are modified/untracked for the next coherent checkpoint.

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
- M11 CI on `e4799e01` exposed two test-infrastructure defects: no extension package step before browser E2E, and a date-sensitive M10 duplicate fixture. Both root-cause fixes are now in the working tree.

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

Continue M11 from pushed checkpoint `e4799e01`. Commit/push the locally green CI hardening diff, require green CI on that new executable SHA, deploy/validate that exact SHA Preview-only, and finalize reports. Keep M11 unmerged.
