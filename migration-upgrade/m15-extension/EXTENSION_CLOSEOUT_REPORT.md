# M15-E Extension — Closeout Report (Phase A/B only; blocked at Phase C)

**Branch:** `fix/m15e-extension-connection-ui`
**Base:** `fix/m15e-site-functional-remediation` @ `0a534b45` (site remediation, already
passed operator manual Preview QA)
**HEAD:** `20943423` (pushed; matches origin)

## What this branch does

Phases A and B only. Phase C (Claude Design import) is blocked — see below — so
Phases D through J (persistent Side Panel, Dashboard, Analytics, Settings redesign,
packaging for the new UI, Preview/dev QA of the new UI, and the final Opus release
review) have not started.

### Phase A — Extension architecture audit (read-only)

Confirmed via `repo-auditor`, then independently verified directly against source:
- Current UI model is popup-based (`action` + `default_popup`), no `side_panel`
  manifest config or `chrome.sidePanel` usage anywhere.
- Zero hardcoded workflow stages anywhere in `apps/extension/**` — stages are
  always loaded live from `GET /ext/v1/workflow`. No "Bookmarked" or other
  unsupported stage exists.
- Extension bearer-token auth (`jqx_dev_`/`jqx_live_`, HMAC-SHA256 hashed at rest)
  is fully independent of the web session's refresh cookie.
- Existing API surface: `GET /me`, `GET /workflow`, `GET /documents?kind=resume`,
  `POST /duplicates/check`, `POST /captures` — all bearer-authenticated, scoped,
  per-token rate-limited.
- Existing test coverage: `apps/extension/tests/{manifest,api,extractor}.test.js`,
  `tests/unit/m11-extension.test.ts`, `tests/integration/m11-extension.test.ts`
  (token isolation, identity/workflow/resumes, duplicate classification, atomic
  capture, ownership/scope/expiry/revocation, rate limiting), and the real-browser
  `e2e/m11-extension.spec.ts` (setup, extraction, capture, duplicate, rotation,
  revocation, theme, a11y, timing).

### Phase B — Connection flow repair

Three confirmed, fixed defects (detail in `EXTENSION_CONNECTION_AUDIT.md`):
1. Save and Test were conflated — a successful save followed by a failed live
   test looked identical to a failed save.
2. The full raw stored token was written back into the visible options-page
   input field on every load, regardless of `type="password"` visually masking
   keystrokes.
3. The standalone Test Connection button read the token untrimmed while Save
   already trimmed it, so identical pasted input could pass one path and fail
   the other.

Also fixed, found during the connection functional gate's real E2E/a11y run
(not assumed): the dark-theme primary button (`#4d72f5` background, white text)
failed WCAG AA contrast at 4.16:1 (needs 4.5:1). Reused the theme's own existing
hover shade as the new primary (~5.3:1, verified via a real re-scan), and the
light theme's existing hover as the new dark-mode hover.

Environment-mismatch detection ("where detectable") was deliberately **not**
implemented: production Vercel doesn't set `EXTENSION_TOKEN_ENV`, so production
tokens carry the `jqx_dev_` prefix — a client-side prefix heuristic would
actively mislead operators there. Documented in `EXTENSION_CONNECTION_AUDIT.md`
rather than fabricated.

## Phase C — BLOCKED

No `claude_design` MCP server or equivalent tool is connected in this session.
Exhaustively searched; nothing can read
`https://claude.ai/design/p/24b6a249-3de5-448f-a103-a63129dc926c?file=JobQuest+Side+Panel.dc.html`
or its `support.js` dependency. Per explicit instruction, this task does not
proceed with an inferred or reconstructed design, and does not substitute the
earlier textual UI description for the actual approved mockup.

**Operator action required:** run `/design-login` to reconnect the `claude_design`
MCP, then resume this branch from Phase C (design import → implementation map →
Side Panel → Capture tab → Dashboard → Analytics → Settings/theme).

## Test results

- Extension unit: 30/30 PASS (`pnpm --filter @jobquest/extension test`)
- Extension typecheck: PASS
- Full web/API unit: 163/163 PASS
- Full integration: 182/182 PASS (unaffected — no `apps/api/**` code touched this phase)
- Full E2E: 20/20 PASS, including the real browser-extension test
  (`e2e/m11-extension.spec.ts`) and two new assertions proving, in a real
  browser, that the token is never re-displayed and that the connection state
  genuinely persists across a page close/reopen (`chrome.storage.local`, not
  in-memory)
- Build: PASS
- Extension package: `apps/extension/dist/jobquest-capture-dev/` (+ `.zip`), built via
  `pnpm --filter @jobquest/extension package:dev`
- Secret scans: tracked repo 912 files/0 findings, web bundle 3 files/0 findings,
  **extension bundle 40 files/0 findings** (scanned the actual built artifacts,
  not just source)
- Artifact hygiene: PASS (clean tree after every run; `dist/` is gitignored)

One real, non-code E2E failure was investigated and resolved during this phase:
`e2e/m2-shell.spec.ts`'s theme-sync test failed reproducibly, traced (via
`test-debugger`, then independently confirmed by a direct read-only Postgres
query) to the **local** `register-ip` rate-limit bucket for this dev machine
having accumulated 21 hits against a 3/hour limit, from many hours of repeated
manual full-suite E2E runs earlier today — not a code regression, and not
`apps/web`-related (untouched on this branch). Cleared by deleting that single
exhausted bucket row in the local-only Supabase Docker Postgres instance (no
production or Preview data involved); confirmed the test passes cleanly
afterward and is not a code defect.

## CI

Run `36561875844`, exact SHA `20943423`, pushed via `git push` and triggered via
`workflow_dispatch` (this repo's CI only auto-triggers on `feature/**`,
`development`, `main` — not `fix/**`, as established in the prior site-remediation
round). Result: **PASS** — both `static` and `database` jobs `completed/success`,
independently confirmed against the exact pushed SHA.

## Release security review

Not invoked. Per instruction, `release-security-reviewer` runs once, only after
implementation is complete AND Preview/dev automated extension QA is green.
Implementation is not complete (Phases D/E blocked on Phase C), so this gate is
correctly still pending.

## Not yet done

- Claude Design import, implementation map, Side Panel, Capture tab redesign,
  Mini Dashboard, compact Analytics, Settings/theme redesign, extension
  Dashboard/Analytics API endpoints (if needed), Preview/dev extension QA of the
  new UI, and the final Opus `release-security-reviewer` pass — all blocked on
  Phase C.

## Unchanged

Development: UNCHANGED. Main: UNCHANGED. Production: UNCHANGED. No production
claim-code reissue. No production extension token configuration. No merges
performed or attempted.

---

## Step 12 — Preview/Dev Automated Extension QA (COMPLETE — PASS)

- **Branch:** `fix/m15e-extension-connection-ui`
- **HEAD:** `cb9418fe052d65cf4a55ac7a4d6fbea197fd4423` (pushed, matches origin)
- **Vercel Preview Deployment:**
  - Deployment ID: `dpl_FokMNZnRPj6JwKqTWVdhXXvrLa4a`
  - URL: `https://jobquest2-jtp7jvwkl-one-piece-5779.vercel.app`
  - Target: `null` (Preview, not production)
  - Git SHA: `cb9418fe052d65cf4a55ac7a4d6fbea197fd4423`
  - Backend: `jobquest-dev` (`xpnkasclquplmrcmhsif`, AWS `us-west-2`). `PREVIEW_BACKEND_IS_PRODUCTION = false`.
- **Environment Configuration:**
  - `REGISTER_IP_MAX_PER_HOUR=20` verified on Vercel for `Preview` and `Development` scopes ONLY.
  - Production `REGISTER_IP_MAX_PER_HOUR` remains unchanged.
- **QA Results Against Live Preview:**
  - `e2e/m11-extension.spec.ts`: PASS (51.9s)
  - `e2e/m15e-extension-sidepanel.spec.ts`: PASS (27.1s)
- **Verified Capabilities:**
  - **Connection:** Save connection, Test connection, connected status, masked token (`jqx_dev_••••{last4}`), reload persistence, invalid token error handling.
  - **Side Panel Shell:** MV3 Side Panel (`sidepanel.html`), persistent focus behavior, roving tablist navigation, embedded Setup screen.
  - **Capture:** Real JSON-LD extraction, dynamic workflow stages (never "Bookmarked"), atomic capture to `/api/ext/v1/captures`, duplicate detection mapping (`strong`/`probable`/`saved`/`possible`), success card + toast + deep link.
  - **Mini Dashboard:** Real stats from `GET /ext/v1/stats`, Today/Yesterday cards, goal progress.
  - **Analytics:** Real metrics from `GET /ext/v1/stats`, loading state, empty state handling.
  - **Settings:** Workspace display, connection diagnostics, environment info, masked token safety, return navigation to triggering tab.
  - **Themes:** Light, Dark, System; native selects/options readability and WCAG AA contrast.
  - **Responsive:** 360px, 430px, 480px single-column layout without horizontal page overflow (`scrollWidth === clientWidth`).
  - **Active Tab Tracking:** Dynamic re-extraction on tab switch (Job A → Job B), state preservation when switching to non-job tabs.
  - **Restart Persistence:** `chrome.storage.local` persistence across context close/reopen; raw token never exposed.
- **Test Fix Summary (TEST_BUG):**
  - `e2e/m11-extension.spec.ts`: line 244 updated to assert `not.toContainText('Loading canonical stages')` and `option:not([value=""])` so Playwright properly awaits async workflow population rather than immediately resolving against the static placeholder option.
  - `playwright.config.ts`: added `expect: { timeout: 15_000 }` to accommodate remote cross-country network round-trip latency to Vercel/Supabase.
  - No product code was altered.
- **Exact-Head CI:**
  - Run: `36621437672`
  - SHA: `cb9418fe052d65cf4a55ac7a4d6fbea197fd4423`
  - Result: **PASS** — `static` (51s) and `database` (7m18s) jobs both completed successfully.
- **Next Step:**
  - Proceeded to Step 12A for manual capture fallback / parity remediation.

---

## Step 12A — Manual Capture Fallback / Parity Fix (COMPLETE — PASS)

- **Branch:** `fix/m15e-extension-connection-ui`
- **HEAD:** `e90ef9afc15938b8ae1309b8689475de68117d12` (pushed, matches origin)
- **Commits:**
  - `0563d033f7f868d952f110d719a38afe11667197`: `fix(extension): restore manual review and edit capture fallback in sidepanel (Step 12A)`
  - `e90ef9afc15938b8ae1309b8689475de68117d12`: `fix(extension): guard initial view switch against overwriting active user tab`
- **Problem Resolved:**
  - The previous extension allowed the operator to manually edit job fields before saving.
  - The initial Side Panel release relied purely on automatic extraction, leaving operators unable to manually correct or complete job information when extraction was incomplete, erroneous, or empty.
- **Solution Delivered:**
  - Added `#edit-details-card` with an accessible expandable toggle `#edit-toggle-btn` ("Review & Edit details") in `apps/extension/sidepanel.html`.
  - Comprehensive form `#edit-fields-section` providing inputs for:
    - Company (required)
    - Job Title (required)
    - Location
    - Work Arrangement (Remote, Hybrid, Onsite, Unspecified)
    - Employment Type (Full-time, Part-time, Contract, Internship, Temporary, Other)
    - Salary Range
    - Date Applied (defaults to current date, editable)
    - Job URL
    - Source / Board
    - Tailored Resume selector with three modes:
      - Existing: dropdown populated dynamically from `GET /api/ext/v1/documents?kind=resume`
      - Manual: text input for resume filename/label
      - None: capture without tailored resume
    - Notes (multiline textarea)
  - Interactive live updates:
    - Changing Company or Title live-updates the top `.job-card` title, company, and company avatar.
    - Completeness bar recalculates dynamically as fields are filled.
    - Debounced duplicate detection re-checks against newly entered Company & Title.
  - Active Tab Draft Isolation:
    - Switching tabs re-extracts the newly active tab and resets the edit inputs.
    - Prevents manual draft edits from leaking between tabs.
  - Asynchronous View Switch Race Guard:
    - Guarded `initialize()` line 1313 (`if (currentView === 'capture')`) to prevent background initialization from kicking the user out of Dashboard or Analytics if they navigated away while resumes were loading.
- **Vercel Preview Deployment:**
  - Deployment ID: `dpl_GawFiRmFBswMeSQjev5MdMrjwUDX`
  - URL: `https://jobquest2-ns7438ypn-one-piece-5779.vercel.app`
  - Target: `null` (Preview, not production)
  - Git SHA: `e90ef9afc15938b8ae1309b8689475de68117d12`
  - Backend: `jobquest-dev` (`xpnkasclquplmrcmhsif`, AWS `us-west-2`). `PREVIEW_BACKEND_IS_PRODUCTION = false`.
- **Quality Gates:**
  - Unit Tests: Web/API 163/163 PASS, Extension 59/59 PASS (`apps/extension/tests/sidepanel-logic.test.js` added 1 new unit test for manual override snapshot assembling).
  - TypeScript: `pnpm typecheck` PASS (0 errors).
  - Lint: `pnpm lint` PASS (0 warnings).
  - Secret Scan: 48 extension bundle files scanned, 0 findings.
  - Exact-head CI: GitHub Actions run `36631704633` (PASS, `static` 53s, `database` 7m18s).
  - Automated Preview QA:
    - `e2e/m15e-extension-sidepanel.spec.ts`: PASS (32.5s)
    - `e2e/m11-extension.spec.ts`: PASS (27.7s)
- **Next Exact Steps:**
  - Awaiting Operator manual verification of unpacked extension (`apps/extension/dist/jobquest-capture-dev`) against Preview.
  - Step 13 (Independent Security & Release Review by Claude Opus) will follow operator manual PASS.

---

## Step 13 — Final Security / Release Review (BLOCKED)

- **Reviewer:** `release-security-reviewer`, Opus / High, invoked ONCE (do not re-invoke automatically).
- **Review range:** `origin/fix/m15e-site-functional-remediation...f656d2e846864b95e139bd7c0895dd27407bf745` (merge-base `0a534b45`, 26 files, +5227/-62).
- **Application/tested SHA:** `e90ef9afc15938b8ae1309b8689475de68117d12` — CI run `36631704633` PASS (static + database). Current docs HEAD `f656d2e8…` differs only by 3 docs files and was not itself application-tested. (Earlier docs mistyped the tested SHA as `e90ef9af66d4…8959`; corrected.)
- **Verdict: BLOCKED.** Server-side token security/validation, workspace/tenant isolation, manifest/permissions, content/XSS, URL safety, API authorization, Dashboard/Analytics isolation, workflow integrity, active-tab concurrency, settings/token UI, environment isolation and secret leakage all PASS. Production changes detected: NO.
- **B1:** duplicate override (`bypassDuplicate`, `apps/extension/sidepanel.js:540`) persists across jobs; only reset in `scheduleDuplicateCheck` (`:240`), never in `runCaptureFlow` (`:364-383`). After one "Save anyway", later jobs get no duplicate warning and `save()` sends `duplicate_override: true` (`:644`). Server duplicate enforcement is advisory only (`rpc_extension_capture` stores the flag), so the client check is the only control. Introduced by the persistent Side Panel (popup state was discarded on close).
- **B2:** editing Company/Title/URL after the duplicate check (`:948-953`) never recomputes `currentCaptureScreen`, so the primary button stays "Save to JobQuest" for a job edited into a strong duplicate; `save()` (`:590-662`) does not re-check at save time or wait for the 350 ms pending check.
- **Test adequacy FAIL:** no E2E for "edit into a duplicate then save" or "Save anyway on Job A, then switch to Job B".
- **Non-blocking:** N1 late duplicate timer vs tab switch (resolved by B1 timer clear); N2 reconnect leaves cached stats/resumes/capture state (display only); N3 manual Job URL / `captureSchema.job_url` scheme unchecked (pre-existing, mitigated by React 19 + CSP); N4 setup token input not cleared after setup/Disconnect.
- **Next:** separate targeted security-remediation prompt (client-only fix in `sidepanel.js` + two E2E tests, targeted → full regression → new SHA → exact-head CI → new Preview → QA; decide on a focused re-review). Step 15 promotion is NOT authorized until then. Development/Main/Production UNCHANGED.

---

## Step 13A — Security Remediation (Targeted Duplicate Lifecycle Hardening) (COMPLETE — PASS)

- **Branch:** `fix/m15e-extension-connection-ui`
- **Application HEAD:** `e19e9ccea4f8276ccdb9736ac5f7fa206a9c3649` (pushed, matches origin)
- **Commits:**
  - `e19e9ccea4f8276ccdb9736ac5f7fa206a9c3649`: `fix(extension): harden duplicate state lifecycle`
- **Blockers Remediated:**
  - **B1 (Duplicate Override State Leakage across Jobs/Tabs):**
    - Root cause: `bypassDuplicate` in `sidepanel.js` was a persistent module-level boolean set by "Save as New Application Anyway" and never cleared in `runCaptureFlow()`, causing subsequent tab switches to inherit the bypass and silently send `duplicate_override: true` to the backend.
    - Resolution: Replaced boolean flag with isolated `duplicateState` managed through `initDuplicateContext(seq)` in `apps/extension/sidepanel-logic.js` and `sidepanel.js`.
    - Every capture flow / tab switch initializes a fresh context with `overrideKey = null`.
    - Authorization (`authorizeDuplicateOverride`) is fingerprinted strictly to the candidate's normalized identity (`computeDuplicateIdentityKey`).
    - Override is cleared immediately upon successful save.
  - **B2 (Stale Duplicate State after Editing Identity Fields):**
    - Root cause: Post-duplicate edit in `#edit-fields-section` triggered debounced check, but never recomputed `currentCaptureScreen` to `'duplicate'`, leaving the primary button as "Save to JobQuest". Furthermore, `save()` did not verify freshness against the edited identity.
    - Resolution: `onIdentityChange(state, nextIdentity)` immediately marks duplicate state stale, clears existing overrides, and hides stale duplicate cards.
    - `save()` performs a two-tier defense: checks `canSafelySave(state, identity)`. If `NEEDS_CHECK`, it awaits an inline recheck. If `BLOCKED_DUPLICATE`, it halts the save, sets `currentCaptureScreen = 'duplicate'`, and redraws the duplicate alert UI.
  - **N1 (Late Debounce Timer Concurrency):**
    - Root cause: A pending ~350 ms timer was not cleared on tab navigation and responses lacked sequence correlation.
    - Resolution: `runCaptureFlow()` clears any active `duplicateTimer`. `onDuplicateCheckResult` discards results matching superseded context sequence or check sequence.
- **Verification & Test Results:**
  - **Unit Tests:**
    - `apps/extension/tests/sidepanel-logic.test.js`: Added 10 targeted unit tests covering B1 (context isolation, identity mismatch, override revocation), B2 (invalidation on edit, save-time blocking, safe save transitions), N1 (sequence rejection), and identity fingerprinting.
    - Result: 69/69 extension unit tests PASS (`pnpm --filter @jobquest/extension test`).
    - Full suite: 163/163 web/api unit tests PASS (`pnpm test:unit`).
  - **TypeScript & Lint:**
    - `pnpm typecheck`: PASS (0 errors across api, extension, web).
    - `pnpm lint`: PASS (0 errors, 0 warnings).
  - **Extension Packaging & Secret Scans:**
    - Dev and Prod bundles packaged cleanly: `apps/extension/dist/jobquest-capture-dev` and `.zip`.
    - Secret scan: 48 extension bundle files scanned with 0 findings (`pnpm check:extension`), 922 tracked repository files scanned with 0 findings (`pnpm check:secrets`).
  - **Exact-Head CI:**
    - GitHub Actions Run: `36637796079`
    - Commit SHA: `e19e9ccea4f8276ccdb9736ac5f7fa206a9c3649`
    - Static Job: PASS (56s)
    - Database Job: PASS (7m52s)
  - **Vercel Preview Deployment:**
    - Deployment ID: `dpl_HLLKNFCYgLJ6sGa2C93RURNR2Bhn`
    - Preview URL: `https://jobquest2-ccdu7i7a3-one-piece-5779.vercel.app`
    - Target: `preview`
    - Backend: `jobquest-dev` (`xpnkasclquplmrcmhsif`, AWS `us-west-2`), `PREVIEW_BACKEND_IS_PRODUCTION = false`.
  - **Automated Preview QA:**
    - `e2e/m15e-extension-sidepanel.spec.ts`: PASS (54.0s) against live Preview (including real-browser assertions for B1 cross-tab override isolation, B2 post-edit duplicate blocking, and N1 rapid tab switch timer cancellation).
    - `e2e/m11-extension.spec.ts`: PASS (24.9s) against live Preview.
- **Next Steps:**
  - Operator manual re-test of duplicate flows on Preview with unpacked extension.
  - Step 13B focused Opus / High security review for blocker closure verification.

---

## Step 13B — Focused Blocker-Closure Review (BLOCKED)

- **Reviewer:** `release-security-reviewer`, Opus / High, invoked ONCE (do not re-invoke automatically).
- **Review range:** `e90ef9afc15938b8ae1309b8689475de68117d12...e19e9ccea4f8276ccdb9736ac5f7fa206a9c3649` (source: `sidepanel.js`, `sidepanel-logic.js`, `tests/sidepanel-logic.test.js`, `e2e/m15e-extension-sidepanel.spec.ts`).
- **Application/tested SHA:** `e19e9ccea4f8276ccdb9736ac5f7fa206a9c3649`, CI `36637796079` PASS (static + database), verified on the exact SHA. **Current docs HEAD (before this docs commit):** `9130ec909667ec704da9cffb2496396be70346fa` (docs-only vs the tested SHA; the prompt's full SHA was mistyped past the `9130ec90` prefix). CI did not run on any docs-only commit.
- **Operator focused manual retest:** PASS (operator-reported via the Step 13B prompt) — B1/B2/N1 and normal capture. It does not exercise the race below.
- **Verdict: BLOCKED.** No security regression (auth, workspace binding, same `POST /captures` path, XSS-safe rendering, secrets all unchanged).
- **B1 duplicate override leakage: CLOSED.** Override is identity-keyed, state recreated on every `runCaptureFlow` trigger and after a successful save; `duplicate_override` comes only from `canSafelySave`'s OVERRIDDEN outcome; only the explicit secondary click grants an override.
- **N1 late duplicate timer: CLOSED.** Timer cleared in `runCaptureFlow` and `save`; context and check sequences enforced.
- **B2 stale duplicate state: OPEN (residual, tracked as B2-R).** The original deterministic path is closed, but the new save-time gate fails open on an unresolved check.
- **B2-R — save-time gate saves when the recheck result is discarded** (`apps/extension/sidepanel.js:659-675`; verified against source by the main session). `save()` reruns `runDuplicateCheck` on `NEEDS_CHECK` but only stops on `BLOCKED_DUPLICATE`. If `onDuplicateCheckResult` discards the result (`CONTEXT_SUPERSEDED` when the tab changes mid-recheck; `CHECK_SUPERSEDED` when the 350 ms edit timer or `runCaptureFlow` starts another check), `canSafelySave` still returns `NEEDS_CHECK` and the code proceeds to `createCapture` with `duplicate_override:false` and no accepted duplicate verdict. Server duplicate enforcement is advisory only, so this is a silent duplicate write. Repro: edit Company/Title, click Save inside the debounce window, switch tabs before the recheck responds.
  - Same flaw side effects: `save()` completion runs `duplicateState = initDuplicateContext(captureRequestSeq)` unconditionally (`:709`), resetting Job B's state and dropping Job B's in-flight check if the context already moved; `renderCapture('saved')` (`:711`) then draws on Job B's context. So `save()` is not bound to the capture context it started in.
  - Constraint on the fix: the fall-through currently also makes saving work when "Warn on duplicates" is off (`runDuplicateCheck` returns early, `:234`); that preference must keep working.
  - Suggested fix: record `const saveSeq = captureRequestSeq` at the start of `save()`; after the recheck abort (re-render, ask the user to retry) if `captureRequestSeq !== saveSeq` or if `capturePreferences.warnOnDuplicates && !safetyCheck.canSave`; only reset `duplicateState` at `:709` when the context is unchanged; add a save-path regression test driving the gate with a superseded/ignored recheck.
- **Non-blocking:**
  - An override can be granted for an identity that was never checked, within a ≤350 ms UI window (`sidepanel-logic.js:186-197` accepts a result for a no-longer-current identity if `checkSeq` matches; `sidepanel.js:1022-1028`, `:563`). Same context, needs an explicit click. Fix: ignore results whose key differs from the current identity key; only allow the override grant when `!state.isStale && state.checkedKey === key(current)`.
  - After a blocked save, `sidepanel.js:670` overwrites the "View Existing Application" label with "Save to JobQuest" (fails safe; onclick still opens the existing application).
  - Test gaps: the 10 new unit tests only cover pure state helpers, not the `save()` wiring; nothing tests "edit then Save inside the debounce window" or an edit/tab switch during the save's recheck; the N1 E2E assertion (`e2e/m15e-extension-sidepanel.spec.ts:449-459`) only checks `#job-company`/`#job-title` text and would also pass on the old code. The B1 (`:398-422`) and B2 (`:425-446`) E2E tests genuinely fail on the old behavior.
  - Legacy popup: `apps/extension/popup.js:44,142,322,330` still uses a module-level `bypassDuplicate` that "Capture Another" does not reset. The popup is no longer the action UI (manifest has no `default_popup`; `background.js:8` opens the side panel) but `popup.html` is still packaged (`scripts/package.mjs:20`). Before release, remove it from the package or apply the same fix.
- **Informational:** fingerprint (`sidepanel-logic.js:40-67`) covers exactly the six fields `checkDuplicate` sends and lowercases all but `externalJobId`; the `'::'` join can collide in theory but is unreachable in practice (every intermediate edit changes the key and revokes the override); `JSON.stringify` of the tuple would remove the ambiguity. A `CHECK_ERROR` result maps to level `error`, which `canSafelySave` treats as VERIFIED_SAFE (pre-existing behavior). Extension unit tests 69/69 pass.
- **Next:** targeted remediation of B2-R (plus the ≤350 ms override-grant window and, before release, the packaged legacy popup), then targeted tests → regression → new SHA → exact-head CI → new Preview → operator retest, and a decision on whether a further focused review is required. Step 15 promotion is NOT authorized. Development/Main/Production UNCHANGED.

---

## Step 13B-R — Targeted Security Remediation (B2-R & Legacy Popup Package)

- **Remediation Target:** B2-R residual save-time duplicate race, in-flight debounce override grant window, save context isolation across tabs, and legacy popup packaging cleanup.
- **Application/tested SHA:** `1837debc8e12228a454492373191df8eb25e45de`.
- **Exact-head CI:** PASS — run `36646380294` on exact SHA `1837debc`, static (35s) and database (6m30s) jobs both green.
- **Vercel Preview Deployment:**
  - Deployment ID: `dpl_9ERvaJBVg5xoGKuojTAGRLTiaf3L`
  - URL: `https://jobquest2-ae69dyczb-one-piece-5779.vercel.app`
  - Target: `preview` (backend: `jobquest-dev` `xpnkasclquplmrcmhsif`, AWS us-west-2, `PREVIEW_BACKEND_IS_PRODUCTION = false`).
- **Automated Preview QA:**
  - `e2e/m15e-extension-sidepanel.spec.ts`: PASS (59.9s) against live Preview (real-browser verification of B1 override isolation, B2 identity edit duplicate re-evaluation, N1 late timer safety, B2-R debounce save fail-closed recheck, and B2-R warn on duplicates = off).
  - `e2e/m11-extension.spec.ts`: PASS (27.6s) against live Preview.
- **Key Changes Implemented:**
  1. **Fail-Closed Save Gate (`sidepanel-logic.js` & `sidepanel.js`):**
     - Centralized in `evaluateSaveGate`: When duplicate checking is required, evaluates safety. If check is stale or in progress, awaits check.
     - If check result is discarded, superseded, or fails to resolve, save is blocked (`abort: true`) and warning banner is displayed ("Could not verify duplicate status. Please retry."). Unverified writes are strictly prohibited (`createCapture` is never called).
     - When `warnOnDuplicates: false`, save proceeds immediately without duplicate check freshness requirement.
  2. **Context-Bound Save Isolation (`isSaveContextValid`):**
     - `save()` snapshots immutable context token (`saveSeq`, `saveTabId`, `saveIdentityKey`).
     - Re-verifies context before and after asynchronous API operations.
     - If user switched tabs or edited fields during save, write completion is discarded, UI is not mutated, and Job B's duplicate state is not reset.
  3. **Timing Window Closure (`authorizeDuplicateOverride`):**
     - Override authorization now requires `!state.isStale && state.checkedKey === computeDuplicateIdentityKey(identity)`, preventing override grant during the ≤350 ms in-flight debounce window.
  4. **Legacy Popup Hardening & Exclusion (`popup.js` & `scripts/package.mjs`):**
     - Replaced module-level boolean `bypassDuplicate` in `apps/extension/popup.js` with identity-keyed `overrideIdentityKey`, reset on initialization, save completion, and "Capture Another".
     - Updated `apps/extension/scripts/package.mjs` so production bundle (`jobquest-capture-prod`) completely excludes `popup.html`, `popup.css`, and `popup.js`, while retaining them in `jobquest-capture-dev` for backward-compatible E2E test coverage.
- **Status of Findings:**
  - B1: CLOSED
  - B2-R: CLOSED
  - N1: CLOSED
  - Legacy Popup Package: CLOSED
- **Next Steps:**
  - Operator manual re-test of B2-R duplicate scenarios on Preview with unpacked extension.
  - Step 13C Claude Opus blocker-closure review (pending operator invocation).
  - DO NOT merge development or main; DO NOT deploy production.

---

## Step 13C — Final Closure Review (BLOCKED)

- **Reviewer:** `release-security-reviewer` (Opus/High), invoked once, range `e19e9cce...1837debc` (application/tested SHA `1837debc8e12228a454492373191df8eb25e45de`; CI run `36646380294` PASS; Preview `https://jobquest2-ae69dyczb-one-piece-5779.vercel.app`).
- **Verdict:** BLOCKED. B1 CLOSED, N1 CLOSED, **B2-R OPEN (CHECK_ERROR path)**. Warn-on-duplicates OFF, cross-tab save isolation, old-context UI protection, override timing, legacy popup production package, package mode isolation: PASS (code inspection / reviewer-built packages). Security regression: NONE.
- **Blocker 1:** A failed save-time duplicate check (`CHECK_ERROR`, level `error`) resolves to `VERIFIED_SAFE` and the write proceeds with `duplicate_override:false` (`sidepanel-logic.js:170-175, 253-288`; `api/jobquest.js:210-216`). Must fail closed.
- **Blocker 2:** No discriminating coverage of real `save()` wiring or the race. The B2-R "save during debounce" E2E step (`e2e/m15e-extension-sidepanel.spec.ts:468-479`) passes on the vulnerable code; no E2E for tab/identity change mid-recheck; warnings-OFF E2E never clicks Save; no check-error save test.
- **Operator focused B2-R manual retest:** SKIPPED BY OPERATOR. Automated evidence sufficient for release: NO.
- **Non-blocking:** see checklist Step 13C.
- **Development / Main / Production:** UNCHANGED.
- **Next:** Targeted remediation required (fail-closed CHECK_ERROR + real-browser E2E or operator manual retest for the three scenarios), exact-head CI, focused re-check. Step 15 NOT started.

---

## Step 13D — Final Duplicate-Protection Remediation (COMPLETE — automated evidence PASS)

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
- Operator manual retest: SKIPPED BY OPERATOR. Final independent Step 13C: PASS (see below). Development/Main/Production: UNCHANGED.

### Step 13C - Final Independent Duplicate-Protection Security Review: PASS
Reviewer: Claude Opus / High (release-security-reviewer, invoked once). Tested SHA `fa437ad6f22b8c485dca62834e45a6c68756c83e`; CI run `36655655863` PASS; docs commits after it touch only `migration-upgrade/*`.
- Duplicate override UI: REMOVED. Supported `duplicate_override=true` path: REMOVED (payload always false). Known duplicate save: BLOCKED.
- Fail-closed save, edit invalidation, save-during-debounce, superseded/discarded check, cross-tab isolation, normal non-duplicate save, duplicate identity consistency, warn-on-duplicates semantics, legacy popup production package, real save wiring coverage, race E2E adequacy: all PASS. Security regression: NONE. Blockers: none.
- B1 class ELIMINATED; B2-R CLOSED; N1 CLOSED. Operator manual retest: SKIPPED BY OPERATOR (not counted as PASS). Automated evidence: SUFFICIENT FOR RELEASE.
- Non-blocking: (1) client identity key lowercases URL query values while backend `normalizeJobUrl` is case-sensitive there; gate accepts any current verdict with matching key (theoretical; optional hardening: accept only own-checkSeq verdict). (2) Server does not enforce duplicates on `POST /captures`; client is the sole enforcement point (pre-existing design).
- Informational: dev-only `popup.js` save() lacks a post-await context guard (excluded from prod package); debounce `onDone` during tab switch may briefly redraw footer, but any save still runs a fresh check.
- Next: Step 15 Controlled Release Promotion.

---

## Future Scope Log (Post-M15) — all DEFERRED, NON-BLOCKING for M15-E

Corrected to the agreed feature definitions. Do not implement during M15-E.

- **[F01] Structured Application Documents:** choose an existing document; create a new Plain Text document; create structured JSON document data; future structured parsing/rendering; equivalent create/link behavior for other document types.
- **[F02] Default Application Tasks & Follow-ups:** Settings-level generic task templates; follow-up templates; optional automatic creation for new applications; future relative due-date behavior; optional future stage-trigger behavior.
- **[F03] Application Contact Linking UX:** select an existing contact from an Application; create a contact from an Application; automatically link the contact to the application; preserve the company/application relationship.

### Separate backlog ideas (previously mislabeled as F01–F03; retained, not scheduled)

- **[B01] Custom theme palettes:** themes beyond Light / Dark / System (custom branding, high-contrast modes).
- **[B02] Side Panel auto-open on supported job listings:** note that an auto-detect *rescan* preference (`autoDetectJobPages`) already ships in Settings > Capture Preferences; B02 only concerns automatically opening the panel.
- **[B03] Direct resume upload from the Side Panel:** currently supports selecting an existing uploaded resume or a manual label/filename.




## Step 15 Promotion Result

Development 1ed8fdd1 (CI 36659089688 PASS); main bfa82eb5 (CI 36659797562 PASS). Tested application SHA fa437ad6. Production unchanged. Next: Step 16 (needs operator authorization).
