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
[ ] PASS — NOT ACHIEVED

Result:
BLOCKED (2 blockers, both client-side duplicate protection; server-side
token/authorization/tenant isolation all PASS)

Review range: origin/fix/m15e-site-functional-remediation...f656d2e8
(merge-base 0a534b45, 26 files, +5227/-62)

BLOCKERS (verified against source by the main session before recording):

B1. Duplicate override from one job persists into later jobs.
    apps/extension/sidepanel.js:540 sets `bypassDuplicate = true` ("Save as New
    Application Anyway"). The only reset is `scheduleDuplicateCheck` (:240),
    reached only when the user edits an identity field. `runCaptureFlow`
    (:364-383) never resets it, and `runDuplicateCheck` (:226) early-returns
    while it is true. After one "Save anyway", later tab switches/re-scans show
    no duplicate warning, and `save()` sends `duplicate_override: true` (:644).
    Server duplicate enforcement is advisory only (rpc_extension_capture just
    stores the flag), so the client check is the only control.
    Fix: reset `bypassDuplicate = false` and clear `duplicateTimer` at the start
    of `runCaptureFlow`.

B2. Editing Company/Title/URL after the duplicate check skips the
    "Save anyway" confirmation.
    The edit callback (:948-953) re-runs the duplicate check and redraws the
    card/footer but never recomputes `currentCaptureScreen` (only `renderCapture`
    does), so `renderFooter` keeps the primary "Save to JobQuest" button for a
    job edited into a strong duplicate. `save()` (:590-662) does not re-check
    duplicates at save time and does not wait for the 350 ms pending check.
    Fix: (1) in the edit callback call
    `renderCapture(resolveCaptureScreen(classifyExtraction(captured), duplicateInfo.level))`
    without overwriting the edit fields; (2) in `save()`, when not bypassing,
    await/re-run the duplicate check on final company/title/URL and route to the
    duplicate screen on a match; (3) add E2E tests: "edit to a duplicate identity,
    then save" and "Save anyway on Job A, then switch to Job B".

TEST ADEQUACY was also marked FAIL by the reviewer solely because no test
covers the two paths above.

NON-BLOCKING (fix with the remediation where cheap):
N1. 350 ms edit-triggered duplicate timer is not cleared / not tied to
    `captureRequestSeq`; a late Job A result can redraw duplicate state on Job B
    (sidepanel.js:241-244). Resolved by the B1 fix (clear timer in runCaptureFlow).
N2. Reconnect from Settings/Setup does not clear cached stats/resumes/captured
    state (sidepanel.js:1100-1113, 1213-1229, 683-698): Dashboard/Analytics may
    briefly show the previous workspace's counts. Display staleness only; server
    isolation holds.
N3. Manually entered Job URL not scheme-checked client-side, and
    `captureSchema.job_url` (apps/api/src/routes/extension.ts:329) is a plain
    string. Pre-existing server gap; mitigated by React 19 javascript: blocking
    and web CSP script-src 'self'. Recommend http/https-only check server-side.
N4. Setup token input not cleared after successful setup / Disconnect
    (sidepanel.js:1197-1229). Extension-page DOM only; gone on reload.

All other review areas PASS: token security, token validation, workspace/tenant
isolation, manifest/permissions, content/XSS safety, URL safety, extension API
authorization, Dashboard/Analytics isolation, workflow integrity, active-tab
concurrency, settings/token UI, environment isolation, secret leakage.
PRODUCTION CHANGES DETECTED: NO.

The reviewer must NOT be re-invoked automatically. A separate remediation prompt
decides scope, targeted tests, full regression, new application SHA, exact-head
CI, new Preview, QA, and whether a focused re-review of the fix commit is needed.

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

CURRENT PHASE: M15-E Step 13 — Final Security Review: BLOCKED
CURRENT SUBTASK: Targeted security remediation required (blockers B1, B2 above)
BRANCH: fix/m15e-extension-connection-ui
APPLICATION / TESTED SHA: e90ef9afc15938b8ae1309b8689475de68117d12
DOCS HEAD (before this docs commit): f656d2e846864b95e139bd7c0895dd27407bf745 (docs-only vs tested SHA)
REMOTE HEAD: f656d2e846864b95e139bd7c0895dd27407bf745 (before this docs commit)
WORKING TREE: docs-only changes pending commit
LAST COMPLETED ACTION: Opus/High release-security-reviewer invoked once — VERDICT BLOCKED
LAST GREEN TEST: unit 163/163, integration 186/186, extension 59/59, m11-extension + m15e-extension-sidepanel E2E PASS on Preview; operator manual QA PASS (operator-reported)
LAST CI: 36631704633 / e90ef9afc15938b8ae1309b8689475de68117d12 / PASS (both jobs)
PREVIEW: https://jobquest2-ns7438ypn-one-piece-5779.vercel.app (dpl_GawFiRmFBswMeSQjev5MdMrjwUDX, target: preview, SHA e90ef9af)
BACKEND: jobquest-dev (ref: xpnkasclquplmrcmhsif, PREVIEW_BACKEND_IS_PRODUCTION = false)
OPUS REVIEW INVOKED: YES — DO NOT RE-INVOKE automatically
OPUS REVIEW RESULT: BLOCKED
BLOCKERS: B1 (duplicate override persists across jobs), B2 (post-check edit skips "Save anyway" confirmation / no save-time re-check) — details in Phase 13
DEVELOPMENT: UNCHANGED (origin/development 99bb9b8f; contains neither branch)
MAIN: UNCHANGED (origin/main 99bb9b8f; contains neither branch)
PRODUCTION: UNCHANGED (jobquest-prod, kwmnljvyvqvbvimypnmw, AWS us-east-1)
NEXT EXACT ACTION: Separate security-remediation prompt: fix B1/B2 (+N1) in apps/extension/sidepanel.js, add the two E2E tests, targeted tests -> full regression -> new SHA -> exact-head CI -> new Preview -> QA; decide whether a focused re-review is required
