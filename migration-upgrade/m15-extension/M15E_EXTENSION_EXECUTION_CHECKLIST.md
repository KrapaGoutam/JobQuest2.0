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

## Step 13B-R — B2 Residual Remediation

Status:
COMPLETE (Automated Gate PASS)

Checklist:
[x] B2-R fail-open save gate fixed
[x] stale/superseded duplicate check cannot permit save
[x] tab/context change aborts old save
[x] success render bound to originating context
[x] duplicate state reset bound to originating context
[x] warnings-disabled path still saves normally
[x] legacy popup no longer ships insecure path
[x] targeted unit tests (80/80 PASS)
[x] real-browser E2E (m15e-extension-sidepanel.spec.ts PASS 59.9s, m11-extension.spec.ts PASS 27.6s)
[x] regression (163/163 unit PASS, typecheck PASS, lint PASS)
[x] package (dev and prod packages built, popup excluded from prod)
[x] secret scan (bundle 0, tracked 0, extension 0)
[x] new exact-SHA CI (run 36646380294, exact SHA 1837debc8e12228a454492373191df8eb25e45de, both jobs PASS)
[x] fresh Preview (dpl_9ERvaJBVg5xoGKuojTAGRLTiaf3L, https://jobquest2-ae69dyczb-one-piece-5779.vercel.app)
[x] automated Preview QA (both suites PASS)
[x] operator focused retest — SKIPPED BY OPERATOR (not PASS)
[x] Step 13C Opus closure review — BLOCKED (see Step 13C below)

## Step 13C — Final Closure Review (Opus/High, invoked once)

Result:
BLOCKED — TARGETED REMEDIATION REQUIRED

Reviewed: e19e9cce...1837debc (docs HEAD 466ee5f1 has no app/e2e diff).

Verdicts: B1 CLOSED; N1 CLOSED; B2-R OPEN (CHECK_ERROR path only).
PASS: warnings-off (code), cross-tab save isolation, old-context UI protection, override timing, legacy popup prod package, package mode isolation (reviewer built dev+prod from `git archive` with planted stale files; prod cleared, no popup assets).
FAIL: save-time duplicate defense (CHECK_ERROR), real save() test coverage, race E2E adequacy.
Security regression: NONE.

BLOCKERS:
1. Failed duplicate check at save time is treated as clean. `checkDuplicate` (api/jobquest.js:210-216) never throws; failures return `match_type: 'CHECK_ERROR'` (level `error`). `onDuplicateCheckResult` accepts it (checkedKey=key, isStale=false) and `canSafelySave` only blocks strong/probable/saved, so it returns `VERIFIED_SAFE` (sidepanel-logic.js:170-175, 253-288) and `createCapture` sends `duplicate_override:false`. Must abort/render error card; allow save only after explicit "save anyway" for that exact identity. Needs unit test.
2. Test adequacy: (a) e2e/m15e-extension-sidepanel.spec.ts:468-479 B2-R step does not discriminate (identity key unchanged, screen stays "duplicate", footer is "View Existing Application" so save() never runs; old code also blocked). (b) No E2E for edit identity -> Save -> tab/identity change while recheck in flight -> assert no POST /captures and Job B UI untouched. (c) Warnings-OFF E2E (:484-496) never clicks Save; flag `b2r_warnings_disabled_save_verified` overstates. (d) No test for save-time check error. All B2-R unit tests call evaluateSaveGate/isSaveContextValid with stubs, not real save().
   Close via real Side Panel E2E (delay/intercept /duplicates/check, switch tab mid-recheck, assert no /captures; warnings-OFF click Save asserts saved; check-error save) OR operator focused manual retest of those three scenarios.

NON-BLOCKING: primary button can stall on "Saving…" after isCurrent() goes false without re-render (sidepanel.js:741-743, 759-762); no in-flight guard in save() / "Save as New Application Anyway" not disabled during save (:564-567) (pre-existing); in-flight debounce callback can re-enable footer during save (:1064-1071); saveIdentity.jobUrl fallback `none-paste-url` differs from currentCaptureIdentity (:648 vs :228); manifest.test.js:44-47 package check is string-contains on script source.

Operator focused B2-R manual retest: SKIPPED BY OPERATOR.
Automated evidence sufficient for release: NO.
Do NOT re-invoke Opus for the full review; after remediation run exact-head CI and a focused re-check limited to the above items.

## Step 13D - Final Duplicate-Protection Simplification & Remediation (COMPLETE - automated evidence PASS)

[x] "Save as New Application Anyway" and all override state removed from Side Panel (and popup)
[x] duplicate_override always false from the extension (deprecated compat field)
[x] fail-closed save gate: fresh forced check on every save; CHECK_ERROR/stale/discarded/superseded/context-changed never write
[x] "Warn on duplicates" reduced to a capture-time warning only (cannot bypass save-time verification)
[x] legacy popup: override removed, fail-closed check added; prod package excludes popup assets (dir + zip verified)
[x] unit: extension 97/97, root 163/163, integration 186/186; lint/typecheck/build/secret scans clean
[x] E2E local + Preview: m11 + m15e (scenarios A-E, check outage, warnings OFF) PASS; verified to FAIL on the pre-remediation sidepanel
[x] application SHA fa437ad6f22b8c485dca62834e45a6c68756c83e pushed; exact-SHA CI 36655655863 PASS (static + database)
[x] fresh Preview https://jobquest2-ev0q9h1us-one-piece-5779.vercel.app (dpl_BvNeBysZxeK6gN1nbowt1PL2gAc2) - backend jobquest-dev
[x] operator manual retest - SKIPPED BY OPERATOR
[ ] final independent Step 13C review - PENDING (fresh session, Opus/High, once)

### Final policy (this remediation)
- **Known duplicates are never saved from the Side Panel.** `Save as New Application Anyway` (`#footer-secondary`), `overrideKey`, `authorizeDuplicateOverride`, `isDuplicateOverriddenFor` are REMOVED. `buildCaptureDraft` always emits `duplicate_override: false` (deprecated compatibility field; the API/RPC contract is unchanged, no migration).
- **Fail-closed save gate** (`evaluateSaveGate`): every `save()` runs a fresh `POST /duplicates/check` for the exact final identity (forced, independent of debounce and of the "Warn on duplicates" preference). Only a CURRENT clean verdict (`NONE`/`COMPANY_ONLY`) writes. `EXACT_POSTING`/`SAME_ROLE` -> duplicate screen (View Existing). `CHECK_ERROR`, thrown check, stale/discarded/superseded check, identity-superseded, context-changed -> abort, "Could not verify duplicate status. Nothing was saved. Please retry." Closes Step 13C blocker 1 (`CHECK_ERROR` previously resolved to `VERIFIED_SAFE`).
- **Context binding** unchanged and re-verified: `saveSeq` + `saveTabId` + `saveIdentityKey` via `isSaveContextValid` after every await; added a same-context in-flight guard so a second `save()` cannot run concurrently.
- **Warn on duplicates (business-rule conflict, resolved to the safer reading):** the preference now ONLY controls the proactive capture-time check/warning. It no longer permits a duplicate write; with it OFF, Save still verifies and blocks known duplicates, and ordinary non-duplicate saves still work (E2E-proven). Behavior change vs 13B-R (where OFF skipped verification).
- **Authoritative duplicate contract (inspected, not changed):** server `POST /ext/v1/duplicates/check` (`apps/api/src/routes/extension.ts:278-323`): strong = normalized job URL OR (external_job_id AND same source key); `SAME_ROLE` = normalized company AND job title; `COMPANY_ONLY` informational. `location` is sent but NOT used server-side. Client identity key (company, title, url, external id, source, location) is a strict superset, so any authoritative-field edit invalidates the verdict (extra re-checks on location edits are conservative, not a gap).
- **Residual (documented, not changed - needs backend/API design):** `POST /ext/v1/captures` / `rpc_extension_capture` does NOT enforce duplicates server-side (it only stores `duplicate_override_flag`); the extension client gate is the sole control for extension writes, and a token holder can still call the API directly with `duplicate_override` true or false. Server-side enforcement would be a contract change (out of scope; STOP-and-report item for the reviewer/owner).
- **Legacy popup:** production package excludes `popup.html/css/js` (verified in dir + zip, unit + E2E); dev package keeps it for `e2e/m11-extension.spec.ts` only, with Save Anyway removed and a fail-closed save-time check added.

### Evidence
- Application/tested SHA: `fa437ad6f22b8c485dca62834e45a6c68756c83e` (parent of docs-only commits; base was `1837debc`).
- Extension unit 97/97 (was 80); root unit 163/163; integration 186/186 (18 files, incl. DB/RLS); lint 0; typecheck 0 (root, api, extension, web); build PASS; `check:bundle` 3 files/0, `check:extension` 45 files/0, `check:secrets` 922 files/0.
- Local E2E (local Supabase): `m11-extension` PASS, `m15e-extension-sidepanel` PASS (incl. Scenario E package test).
- Discrimination check: the new Side Panel spec was run against the PRE-remediation sidepanel sources and FAILED at the first discriminating assertion ("Save runs its own duplicate verification"), so it does not pass on the old implementation.
- Exact-SHA CI: run `36655655863` on `fa437ad6f22b8c485dca62834e45a6c68756c83e` - static PASS, database PASS -> overall PASS (workflow_dispatch; `fix/**` does not auto-trigger).
- Fresh Preview: `https://jobquest2-ev0q9h1us-one-piece-5779.vercel.app` (`dpl_BvNeBysZxeK6gN1nbowt1PL2gAc2`, target preview, GitHub deployment for `fa437ad6f22b8c485dca62834e45a6c68756c83e`), backend `jobquest-dev` (Preview-scoped env unchanged; `PREVIEW_BACKEND_IS_PRODUCTION=false`).
- Automated Preview QA: `m11-extension` (30.4s), `m15e-extension-sidepanel` (1.4m), production-package test - 3/3 PASS. Scenarios: A existing duplicate (no override control, View Existing works, no POST /captures, exactly 1 app), D normal save (save-time check observed), B edit-into-duplicate + immediate Save with held check ("Saving..." then blocked, no write), C Save -> switch tab mid-check (no write, Job B UI untouched, backend confirms never written), check outage (503) fails closed then retry saves, warnings OFF blocks duplicate and saves clean, E prod package.
- Operator manual retest: SKIPPED BY OPERATOR. Final independent Step 13C: PENDING. Development/Main/Production: UNCHANGED.

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

CURRENT PHASE: M15-E Step 13D (duplicate-protection final remediation) COMPLETE - awaiting final independent Step 13C review
CURRENT SUBTASK: none (stop gate)
BRANCH: fix/m15e-extension-connection-ui
APPLICATION / TESTED SHA: fa437ad6f22b8c485dca62834e45a6c68756c83e
DOCS HEAD: docs-only commit(s) after the application SHA (not CI-tested)
B1: CLOSED (override state eliminated)
B2-R: CLOSED by fail-closed current-verdict save gate
N1: CLOSED
LEGACY POPUP PACKAGE: CLOSED
DUPLICATE SAVE OVERRIDE: REMOVED
LAST GREEN TEST: unit 163, extension 97, integration 186, m11 + m15e E2E (local + Preview)
LAST CI: 36655655863 / fa437ad6f22b8c485dca62834e45a6c68756c83e / PASS
PREVIEW: https://jobquest2-ev0q9h1us-one-piece-5779.vercel.app (dpl_BvNeBysZxeK6gN1nbowt1PL2gAc2, target preview)
BACKEND: jobquest-dev (PREVIEW_BACKEND_IS_PRODUCTION = false)
OPERATOR RETEST: SKIPPED BY OPERATOR
PRODUCTION: UNCHANGED (jobquest-prod, kwmnljvyvqvbvimypnmw)
STEP 13C FINAL INDEPENDENT SECURITY REVIEW: PASS (Opus/High, once); no blockers
FINAL M15-E EXTENSION SECURITY REVIEW: PASS
AUTOMATED EVIDENCE: SUFFICIENT FOR RELEASE (operator retest SKIPPED BY OPERATOR)
NEXT EXACT ACTION: Step 15 Controlled Release Promotion (separate prompt). DO NOT merge/deploy in the review session.
