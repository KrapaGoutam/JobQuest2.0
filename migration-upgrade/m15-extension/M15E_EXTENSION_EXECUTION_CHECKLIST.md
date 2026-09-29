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
COMPLETE (Automated Gates PASS; operator retest PASS) — but Step 13B found residual B2-R; see Step 13B

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
[x] operator focused manual retest — PASS (operator-reported via Step 13B prompt; does not exercise the B2-R race)
[x] Step 13B focused Opus blocker-closure review — invoked ONCE, result BLOCKED (see below)

## Step 13B — Focused Blocker-Closure Review

Status:
BLOCKED

[x] Claude Opus / High focused review (ONCE — do not re-invoke automatically)
[x] B1 closure verified — CLOSED
[ ] B2 closure verified — OPEN (residual B2-R)
[x] N1 disposition verified — CLOSED
[x] regression impact reviewed — no security regression found
[x] tests reviewed — Test Adequacy FAIL (gaps below)

Tested SHA: e19e9ccea4f8276ccdb9736ac5f7fa206a9c3649 / CI 36637796079 PASS
Range: e90ef9afc15938b8ae1309b8689475de68117d12...e19e9ccea4f8276ccdb9736ac5f7fa206a9c3649

BLOCKER:
B2-R. Save-time gate fails open on an unresolved duplicate check
(apps/extension/sidepanel.js:659-675, verified by the main session). save() reruns
runDuplicateCheck on NEEDS_CHECK but stops only on BLOCKED_DUPLICATE. When
onDuplicateCheckResult discards the recheck (CONTEXT_SUPERSEDED on a tab change,
CHECK_SUPERSEDED from the 350 ms edit timer or runCaptureFlow), canSafelySave still
returns NEEDS_CHECK and save proceeds to createCapture with duplicate_override:false
and no accepted verdict. Server duplicate enforcement is advisory, so this is a silent
duplicate write. Repro: edit Company/Title, click Save inside the debounce window,
switch tabs before the recheck responds. Side effects: :709 resets duplicateState
unconditionally (clobbers Job B's state/in-flight check) and :711 renders 'saved' on
Job B's context — save() is not bound to its originating capture context.
Constraint: "Warn on duplicates" = off must keep saving (runDuplicateCheck returns
early, :234).
Fix: record saveSeq = captureRequestSeq at save() start; after recheck abort/re-render
if captureRequestSeq !== saveSeq or (warnOnDuplicates && !safetyCheck.canSave); reset
duplicateState at :709 only if context unchanged; add save-path regression test.

NON-BLOCKING:
- Override can be granted for an identity that was never checked within a <=350 ms
  window (sidepanel-logic.js:186-197; sidepanel.js:1022-1028, :563). Fix: ignore results
  whose key != current identity key; grant only if !isStale && checkedKey == key(current).
- Blocked-save primary label overwritten to "Save to JobQuest" (sidepanel.js:670);
  fails safe (onclick still opens the existing application).
- Test gaps: unit tests cover only pure helpers, not save() wiring; nothing covers
  "edit then Save in debounce window" or an edit/tab switch during the save recheck;
  N1 E2E assertion (e2e/m15e-extension-sidepanel.spec.ts:449-459) is vacuous (also passes
  on old code). B1 (:398-422) and B2 (:425-446) E2E genuinely fail on old behavior.
- Legacy popup: popup.js:44,142,322,330 keeps a module-level bypassDuplicate that
  "Capture Another" does not reset; popup.html still packaged (scripts/package.mjs:20)
  though the manifest has no default_popup. Before release remove from package or fix.

INFORMATIONAL: fingerprint (sidepanel-logic.js:40-67) covers the six checkDuplicate
fields; '::' join collision unreachable in practice (JSON.stringify would remove it);
CHECK_ERROR -> VERIFIED_SAFE is pre-existing behavior.

NEXT: targeted remediation of B2-R (+ override-grant window; popup packaging before
release) -> targeted tests -> regression -> new SHA -> exact-head CI -> new Preview ->
operator retest. Do NOT re-invoke Opus automatically; a separate prompt decides whether
a further focused review is required.

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

CURRENT PHASE: M15-E Step 13B — Focused Blocker-Closure Review: BLOCKED
CURRENT SUBTASK: Targeted remediation required (B2-R, save-time gate fails open)
BRANCH: fix/m15e-extension-connection-ui
APPLICATION / TESTED SHA: e19e9ccea4f8276ccdb9736ac5f7fa206a9c3649
DOCS HEAD (before this docs commit): 9130ec909667ec704da9cffb2496396be70346fa (docs-only vs tested SHA)
REMOTE HEAD: 9130ec909667ec704da9cffb2496396be70346fa (before this docs commit)
WORKING TREE: docs-only changes pending commit
LAST GREEN TEST: unit 163/163, extension 69/69, m11-extension + m15e-extension-sidepanel E2E PASS on Preview; CI PASS; operator retest PASS (operator-reported)
LAST CI: 36637796079 / e19e9ccea4f8276ccdb9736ac5f7fa206a9c3649 / PASS (both jobs)
PREVIEW: https://jobquest2-ccdu7i7a3-one-piece-5779.vercel.app (dpl_HLLKNFCYgLJ6sGa2C93RURNR2Bhn, target: preview, SHA e19e9cce)
BACKEND: jobquest-dev (ref: xpnkasclquplmrcmhsif, PREVIEW_BACKEND_IS_PRODUCTION = false)
B1: CLOSED
B2: OPEN (residual B2-R: save-time gate saves when the recheck result is discarded)
N1: CLOSED
OPERATOR RETEST: PASS (operator-reported; does not exercise the B2-R race)
STEP 13B OPUS REVIEW: INVOKED ONCE — BLOCKED. DO NOT RE-INVOKE automatically.
BLOCKERS: B2-R (apps/extension/sidepanel.js:659-675, :709-711) — details in Step 13B section above
DEVELOPMENT: UNCHANGED (origin/development 99bb9b8f)
MAIN: UNCHANGED (origin/main 99bb9b8f)
PRODUCTION: UNCHANGED (jobquest-prod, kwmnljvyvqvbvimypnmw, AWS us-east-1)
NEXT EXACT ACTION: Separate remediation prompt: fix B2-R in apps/extension/sidepanel.js (bind save() to its originating captureRequestSeq; fail closed on unresolved NEEDS_CHECK while keeping warnOnDuplicates=false working; reset duplicateState at :709 only if context unchanged), close the <=350 ms override-grant window, remove/fix packaged legacy popup before release, add save-path tests, then regression -> new SHA -> exact-head CI -> new Preview -> operator retest
