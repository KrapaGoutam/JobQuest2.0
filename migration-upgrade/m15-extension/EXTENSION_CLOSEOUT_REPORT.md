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
- **Verification note:** the main session re-read the cited source lines and confirmed B1's mechanism and B2's edit-callback behavior before recording.
- **Next:** separate targeted security-remediation prompt (client-only fix in `sidepanel.js` + two E2E tests, targeted → full regression → new SHA → exact-head CI → new Preview → QA; decide on a focused re-review). Step 15 promotion is NOT authorized until then. Development/Main/Production UNCHANGED.

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


