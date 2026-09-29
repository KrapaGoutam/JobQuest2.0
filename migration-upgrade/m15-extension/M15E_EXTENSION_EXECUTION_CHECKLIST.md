# M15-E Extension Execution Checklist

## Phase 1 — Site prerequisite
[x] Site remediation complete
[x] Site manual Preview QA PASS

## Phase 2 — Extension branch
[x] Branch created
[x] Correct base verified

## Phase 3 — Extension audit
[x] Existing extension audited

## Phase 4 — Connection remediation
[x] Save/Test separation
[x] token masking
[x] whitespace normalization
[x] connection regression tests

## Phase 5 — Claude Design
[x] Design imported
[x] implementation map created

## Phase 6 — Side Panel shell
[x] MV3 Side Panel
[x] navigation
[x] persistent behavior

## Phase 7 — Capture
[x] extraction
[x] duplicate detection
[x] dynamic workflow
[x] capture success/error states

## Phase 8 — Dashboard / Analytics / Settings
[x] Dashboard
[x] Analytics
[x] Settings
[x] Theme

## Phase 9 — Local validation
[x] lint
[x] typecheck
[x] unit
[x] integration
[x] E2E
[x] build
[x] package
[x] bundle secret scan

## Phase 10 — Branch CI
[x] exact SHA pushed
[x] exact SHA CI PASS

CI:
36621437672 (previous: 36604010935)

SHA:
cb9418fe052d65cf4a55ac7a4d6fbea197fd4423

## Phase 11 — Preview environment
[x] Preview/development backend
[x] REGISTER_IP_MAX_PER_HOUR=20 Preview/Development only
[x] Production unchanged
[x] fresh deployment with new env configuration

## Phase 12 — Automated Preview/dev Extension QA
[x] redeploy exact SHA
[x] verify Preview backend
[x] m11-extension E2E
[x] m15e-extension-sidepanel E2E
[x] Connection QA
[x] persistent Side Panel
[x] Capture
[x] duplicate detection
[x] workflow stages
[x] Dashboard
[x] Analytics
[x] Settings
[x] Light/Dark/System
[x] responsive 360/430/480
[x] active-tab changes
[x] restart persistence
[x] artifact hygiene

## Step 12A — Manual Capture Fallback / Parity Fix

Status:
COMPLETE — PASS

Reason:
Operator manual Preview QA found a parity regression:
auto-extraction had no adequate manual edit/fill fallback for fields
that were editable in the previous extension.

Checklist:

[x] audit previous editable capture fields
[x] map fields to current capture API
[x] design minimal Side Panel edit/fill interaction
[x] preserve automatic extraction
[x] missing fields manually fillable
[x] detected values manually correctable
[x] manual values use existing capture payload
[x] duplicate detection respects edited values
[x] workflow stages remain canonical/dynamic
[x] active-tab changes cannot leak manual Job A values into Job B
[x] accessibility
[x] targeted unit tests
[x] targeted E2E
[x] full required regression
[x] package
[x] secret scan
[x] exact-head CI
[x] fresh Preview/dev deployment/package
[x] automated Preview QA
[x] operator manual retest — PASS (operator-reported, against tested SHA e90ef9af; see Phase 14)

## Phase 13 — Final Security Review
[x] Claude Opus / High independent review — invoked ONCE, complete extension delta reviewed
[ ] PASS — NOT ACHIEVED (BLOCKED on B1, B2)

## Step 13A — Security Remediation

Status:
COMPLETE (Automated Gates 1-9 PASS; Operator Retest & Step 13B Pending)

Source:
Claude Opus / High Step 13 review

Blockers:
[x] B1 duplicate_override leakage across capture contexts — RESOLVED & TESTED
[x] B2 stale duplicate state after Company/Title/URL edits — RESOLVED & TESTED

Directly related:
[x] N1 late duplicate timer context safety, if fixed with same mechanism — RESOLVED & TESTED

Required gates:
[x] implementation (apps/extension/sidepanel-logic.js & apps/extension/sidepanel.js)
[x] targeted unit tests (apps/extension/tests/sidepanel-logic.test.js: 10 new tests, 69/69 PASS)
[x] targeted E2E (e2e/m15e-extension-sidepanel.spec.ts: B1/B2/N1 assertions PASS)
[x] full relevant regression (pnpm lint, pnpm typecheck, pnpm test:unit 163/163 PASS)
[x] extension package (pnpm --filter @jobquest/extension package:dev & package:prod)
[x] bundle secret scan (pnpm check:extension 48 files, check:secrets 922 tracked files — 0 findings)
[x] exact-head CI (run 36637796079, SHA e19e9ccea4f8276ccdb9736ac5f7fa206a9c3649 — PASS static & database)
[x] fresh Preview (dpl_HLLKNFCYgLJ6sGa2C93RURNR2Bhn, https://jobquest2-ccdu7i7a3-one-piece-5779.vercel.app)
[x] automated Preview duplicate QA (e2e/m15e-extension-sidepanel.spec.ts PASS 54.0s, e2e/m11-extension.spec.ts PASS 24.9s)
[ ] operator focused manual retest
[ ] Step 13B focused Opus blocker-closure review

## Phase 14 — Operator Manual Extension QA
Status: operator reported PASS against tested SHA e90ef9af (Preview
jobquest2-ns7438ypn). NOTE: the duplicate flows B1/B2 change in remediation, so
the operator should re-verify "Save anyway then switch job" and "edit into a
duplicate then save" on the remediated Preview.
[x] operator install
[x] persistent Side Panel
[x] real job capture
[x] duplicate capture
[x] Dashboard
[x] Analytics
[x] Settings
[x] themes
[x] active-job switch
[x] browser restart

## Phase 15 — Release Promotion
[ ] extension branch → development
[ ] site branch included
[ ] development CI
[ ] development → main
[ ] main CI

## Phase 16 — Production Change Window
[ ] production DB migration(s)
[ ] legacy claim-code reissue
[ ] production extension configuration
[ ] production site deployment
[ ] production extension package

## Phase 17 — Production Smoke
[ ] site
[ ] extension
[ ] tenant isolation
[ ] auth
[ ] capture

## Phase 18 — M15-E GO
[ ] GO approved

## Phase 19 — M15-F Stabilization
[ ] 14-day stabilization begins

---

CURRENT PHASE: M15-E Step 13A COMPLETE -> Operator Manual Retest & Step 13B
CURRENT SUBTASK: Operator focused manual retest of duplicate remediation on Preview
BRANCH: fix/m15e-extension-connection-ui
APPLICATION / TESTED SHA: e19e9ccea4f8276ccdb9736ac5f7fa206a9c3649
DOCS HEAD: e19e9ccea4f8276ccdb9736ac5f7fa206a9c3649 (docs commit pending)
REMOTE HEAD: e19e9ccea4f8276ccdb9736ac5f7fa206a9c3649
WORKING TREE: checklist & docs updated
LAST GREEN TEST: unit 163/163, extension 69/69, m11-extension + m15e-extension-sidepanel E2E PASS on Preview; CI PASS
LAST CI: 36637796079 / e19e9ccea4f8276ccdb9736ac5f7fa206a9c3649 / PASS (both jobs)
PREVIEW: https://jobquest2-ccdu7i7a3-one-piece-5779.vercel.app (dpl_HLLKNFCYgLJ6sGa2C93RURNR2Bhn, target: preview, SHA e19e9cce)
BACKEND: jobquest-dev (ref: xpnkasclquplmrcmhsif, PREVIEW_BACKEND_IS_PRODUCTION = false)
B1: RESOLVED IN APPLICATION CODE & TESTED
B2: RESOLVED IN APPLICATION CODE & TESTED
N1: RESOLVED IN APPLICATION CODE & TESTED
OPERATOR RETEST: PENDING
STEP 13B OPUS REVIEW: PENDING
PRODUCTION: UNCHANGED (jobquest-prod, kwmnljvyvqvbvimypnmw, AWS us-east-1)
NEXT EXACT ACTION: Operator focused manual duplicate retest on Preview using unpacked extension apps/extension/dist/jobquest-capture-dev; followed by Step 13B Claude Opus focused review
