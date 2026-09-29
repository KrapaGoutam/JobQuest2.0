# JOBQUEST2.0 - CURRENT AGENT STATE

## Current Milestone
Milestone 15 — Production Launch & Cutover
**Phase M15-E: Extension Step 13 Final Security Review (Claude Opus/High) — BLOCKED. Two client-side duplicate-protection blockers (B1, B2) require targeted remediation before Step 15 promotion.**
**Gate Status: Site branch — local quality gate PASS, exact-head CI PASS, Preview deployed and automated-smoked, operator manual re-test PASS. Extension branch — implementation + Step 12A complete, local gate PASS, exact-head CI PASS (run 36631704633, tested SHA e90ef9afc15938b8ae1309b8689475de68117d12), Preview automated QA PASS, operator manual QA PASS (operator-reported), Opus security review BLOCKED (server auth/tenant isolation PASS). NOT merged. Development/Main/Production UNCHANGED.**

## Branch: fix/m15e-site-functional-remediation (site remediation)
- **Branch HEAD:** `0a534b45` (pushed; matches origin)
- **Exact-head CI:** PASS (both `static` and `database` jobs, triggered via `workflow_dispatch` since this repo's CI only auto-triggers on `feature/**`/`development`/`main`, not `fix/**`)
- **Vercel Preview (current):** `https://jobquest2-51ktgo1ku-one-piece-5779.vercel.app`, deployment `dpl_E7CvzzPZgYbEsTVBDZyK4ZHuRLuQ`, exact SHA `8b0376a6a0aeee9f9f75a983f463335927cc34b8` (parent of the docs-only `0a534b45` HEAD — the app code deployed and tested is unchanged by that docs commit), `target: null` (Preview, not production). Backend confirmed preview/development-scoped (env var names/targets only checked, no values read).
- **Site Manual Preview QA: PASS** — operator has explicitly confirmed the focused
  re-test (Calendar Future Feature page, dark/light dropdown, everything else
  already covered by the prior full round) passed on this exact-SHA Preview.
- **Cutover Status:** Site remediation manual QA complete. Still PAUSED before
  any merge/production action: jack's claim-code reissue, then
  `fix -> development -> main -> production` promotion gates all remain
  separately authorized steps, not yet executed.

## Branch: fix/m15e-extension-connection-ui (extension remediation — Step 12 & Step 12A COMPLETE)
- **Base:** `fix/m15e-site-functional-remediation` @ `0a534b45` (confirmed via `git merge-base`)
- **Branch HEAD:** `f656d2e846864b95e139bd7c0895dd27407bf745` (docs-only, pushed; matches origin before the Step 13 docs commit). **Application/tested code SHA:** `e90ef9afc15938b8ae1309b8689475de68117d12` (CI run `36631704633` ran on this exact SHA; the later HEAD differs only by 3 `migration-upgrade/*.md` files). Note: earlier docs showed this SHA mistyped as `e90ef9af66d4…8959`; corrected here.
- **Phase A (audit):** DONE, read-only.
- **Phase B (connection repair):** DONE. Fixed Save/Test message conflation, token masking, whitespace normalization, WCAG AA button contrast.
- **Phase C (Claude Design import):** DONE. Imported from Claude Design mockup (`cbb3d92b`).
- **Phase D (Side Panel & Capture):** DONE. Persistent MV3 Side Panel (`sidepanel.html`/`sidepanel.js`), active-tab tracking, dynamic workflow stages, duplicate detection levels (`11d22429`).
- **Phase E (Dashboard, Analytics, Settings):** DONE. Compact Mini Dashboard, Analytics, GET `/ext/v1/stats`, Settings return navigation, theme sync (`8c8bfc73`, `f4f8eecc`, `572b531f`, `71d99557`).
- **Phase 11 (Preview Environment):**
  - `REGISTER_IP_MAX_PER_HOUR=20` configured on Vercel for `preview` and `development` scopes ONLY. Production remains unchanged.
  - Preview backend verified: `xpnkasclquplmrcmhsif` (`jobquest-dev`), AWS `us-west-2`. `PREVIEW_BACKEND_IS_PRODUCTION = false`.
- **Phase 12 (Automated Preview/Dev Extension QA): COMPLETE — PASS**
  - Deployed SHA `cb9418fe052d65cf4a55ac7a4d6fbea197fd4423` to Vercel Preview (`dpl_FokMNZnRPj6JwKqTWVdhXXvrLa4a`); exact-head CI run `36621437672` confirmed on that SHA.
  - Test synchronization fix: `e2e/m11-extension.spec.ts` line 244 updated to await canonical stages and `playwright.config.ts` timeout set to 15s.
  - Verified: Connection save/test, persistent Side Panel, Capture extraction/save, duplicate detection (strong/probable/possible), dynamic workflow stages, Mini Dashboard stats, compact Analytics stats, Settings masked token & return navigation, Light/Dark/System themes, responsive widths (360/430/480 zero overflow), active-tab changes, browser restart persistence.
- **Phase 12A (Manual Capture Fallback / Parity Fix): COMPLETE — PASS**
  - Restored full manual review and editing capabilities in the persistent Side Panel (`apps/extension/sidepanel.html`, `sidepanel.js`, `sidepanel.css`, `sidepanel-logic.js`).
  - Added `#edit-details-card` with an expandable toggle button (`#edit-toggle-btn`) and full editing form (`#edit-fields-section`) covering Company, Job Title, Location, Work Arrangement, Employment Type, Salary Range, Date Applied, Job URL, Source/Board, Tailored Resume (existing, manual, none mode selector), and Notes.
  - Interactive live updates: editing company, title, or job URL updates top `.job-card`, avatar, chips, completeness progress bar, and re-triggers debounced `scheduleDuplicateCheck()`.
  - Maintained strict tab draft isolation: switching tabs re-extracts and resets inputs, preventing draft leakage across tabs.
  - Guarded asynchronous `initialize()` against overwriting the active view if the user navigated to Dashboard/Analytics (`e90ef9af`).
  - Local verification: unit tests (163/163 web/api, 59/59 extension), lint & typecheck PASS, package dev & bundle secret scan (48 files, 0 findings).
  - Exact-head CI: PASS — run `36631704633`, SHA `e90ef9afc15938b8ae1309b8689475de68117d12`, `static` (53s) and `database` (7m18s) jobs `completed/success`.
  - Fresh Vercel Preview: deployment `dpl_GawFiRmFBswMeSQjev5MdMrjwUDX`, URL `https://jobquest2-ns7438ypn-one-piece-5779.vercel.app`, target: `null` (Preview).
  - Automated Preview QA: `e2e/m15e-extension-sidepanel.spec.ts` PASS (32.5s) and `e2e/m11-extension.spec.ts` PASS (27.7s) against live Preview.
- **Phase 14 (Operator Manual Extension QA):** PASS (operator-reported) against tested SHA `e90ef9af` on the Preview above. The duplicate flows change in remediation, so re-verify them on the remediated Preview.
- **Phase 13 (Release Security Review): BLOCKED.** `release-security-reviewer` (Opus/High) invoked ONCE over `origin/fix/m15e-site-functional-remediation...f656d2e8` (26 files, +5227/-62). **Do not re-invoke automatically.** Blockers (verified against source by the main session):
  - **B1** — `bypassDuplicate` set by "Save as New Application Anyway" (`apps/extension/sidepanel.js:540`) is only reset in `scheduleDuplicateCheck` (`:240`), never in `runCaptureFlow` (`:364-383`); after one override, later jobs get no duplicate warning and `save()` sends `duplicate_override: true` (`:644`). Server duplicate enforcement is advisory only, so the client check is the sole control.
  - **B2** — editing Company/Title/URL after the duplicate check (`:948-953`) redraws the duplicate card but never recomputes `currentCaptureScreen`, so the primary button stays "Save to JobQuest"; `save()` (`:590-662`) does not re-check duplicates at save time. Tests do not cover either path (Test Adequacy FAIL).
  - Non-blocking: N1 late 350 ms duplicate timer can redraw on another tab (fixed by B1's timer clear); N2 reconnect leaves cached stats/resumes/capture state (display staleness only); N3 manual Job URL / `captureSchema.job_url` not scheme-checked (pre-existing; mitigated by React 19 + CSP); N4 setup token input not cleared after setup/Disconnect.
  - All other areas PASS: token security/validation, workspace/tenant isolation, manifest/permissions, content/XSS, URL safety, API authorization, Dashboard/Analytics isolation, workflow integrity, active-tab concurrency, settings/token UI, environment isolation, secret leakage. Production changes detected: NO.
  - Full detail: `migration-upgrade/m15-extension/M15E_EXTENSION_EXECUTION_CHECKLIST.md` (Phase 13).


## Cross-cutting / unchanged by either branch
- **Main HEAD Commit:** Pending PR Merge
- **Vercel Production Deployment:** unchanged this session.
- **Production Supabase DB:** `jobquest-prod` (`kwmnljvyvqvbvimypnmw`, AWS `us-east-1`)
  - Target Migrations: 18/18 applied cleanly through M14. The site branch adds a
    19th (`20261021100000_m15_legacy_claim_rpc.sql`), NOT YET applied to production.
  - Data Parity: 222 apps, 89 snapshots, 533 events, 49 tags (0 deltas)
- **Legacy Source:** READ-ONLY STANDBY (Neon `SHOW transaction_read_only = on`)
- **JobQuest 1.0 Retirement:** STRICTLY NOT AUTHORIZED (Preserved for 14-day stabilization)
- **Claim Code (`jack`): STILL STALE — MUST BE REISSUED BEFORE CUTOVER.** Unchanged
  from the prior entry: the vaulted code was generated by the OLD `generateClaimCode()`
  format and cannot be verified by `/auth/claim` as it now exists. Reissuing it is a
  production write requiring explicit operator authorization; NOT performed this
  session. Do not attempt the claim with the currently-vaulted code.
- **Register rate limit on Preview/dev:** `REGISTER_IP_MAX_PER_HOUR=20` is now set
  for the Vercel `preview` and `development` scopes ONLY (Phase 11, operator-authorized;
  supersedes the earlier "3/hour default" note). Production value unchanged. This
  session's Step 13 could not independently re-read Vercel env (MCP disconnected);
  it relies on the Phase 11 record. (Distinct from the local dev-only rate-limit
  bucket cleared earlier, which only affected this machine's local Docker Supabase.)

## Feature Freeze Notice
FEATURE FREEZE IS IN EFFECT. No ordinary new features are permitted. Allowed changes are strictly: launch blockers, security defects, migration defects, production configuration defects, critical P0/P1 regressions, critical accessibility defects, and critical performance defects materially threatening launch.

## Manual QA History
**Round 1 (prior Preview, SHA `d43dfceb`):** Sign In, Create Account, Forgot Password,
Claim UI, registration, recovery codes, Dashboard, Applications CRUD/stage/archive,
Search, Contacts, Interviews, Tasks, Habits, Resumes, Settings tabs, password change,
recovery-code regeneration, logout+refresh, mobile 390x844, `/workspace/workflow`
redirect, manager Workspace Settings, Members, invite, role changes, tenant isolation
— all PASS. Calendar Future Feature was reported visible/passing by the operator, but
the committed code at that SHA had no Calendar nav entry at all (`/calendar` silently
redirected to `/interviews`) — this mismatch was the trigger for this round's work.
Only defect found: dark-mode dropdown text/color not fully in sync with the theme.

**Round 2 (this session, SHA `8b0376a6`):** Implemented the Calendar Future Feature
placeholder (previously did not exist in code) and centralized the option/optgroup
theming fix for the dropdown defect. Full local gate + exact-head CI + a fresh
Preview + automated smoke all PASS (see below). Manual re-test now needed, but it
only needs to be a focused pass — see "Next Exact Step".

## This Session's Work (continuation)
Starting point: HEAD `d43dfceb`, clean, matching origin exactly (verified — no
uncommitted or unpushed Calendar work existed anywhere; the Calendar feature had
to be built from scratch, not recovered). Commits added, in order:
- `3e0780b6` feat(ui): restore Calendar as a visible Future Feature placeholder —
  nav entries in Sidebar + MobileNav, `/calendar` renders `PlaceholderView` instead
  of redirecting to `/interviews`. No calendar business logic, DB, or API added.
  `/workspace/workflow` -> `/workspace/settings` redirect and Workflow's absence
  from navigation are both unchanged.
- `2a4bb1bc` fix(theme): centralized `option`/`optgroup` theming in `globals.css`.
  Root cause: every raw `<select>` styled its own closed control with theme tokens,
  but no `<option>`/`<optgroup>` anywhere had explicit background/color, so the
  native popup fell back to generic browser dark/light rendering instead of the
  app's exact palette. One small rule fixes every select in the app.
- `8b0376a6` test(ui): added two new E2E cases to `m2-shell.spec.ts` — Calendar
  nav/routing (visible, opens Future Feature copy, never redirects; Workflow stays
  absent; workspace/workflow redirect unchanged) and select/option color parity
  across light -> dark -> light (proves the fix, not just that it builds).

Full local gate: lint PASS, typecheck PASS, unit 163/163 PASS, integration 182/182
PASS (claim suite unchanged at 13/13), full E2E 20/20 PASS (18 prior + 2 new),
build PASS, clean-tree gate PASS. Did not re-run the Opus release-security-reviewer
per explicit instruction, since no auth/security/migration/session/claim code
changed in this round.

Exact-head CI (SHA `8b0376a6`, run `36525184776`, triggered via `workflow_dispatch`):
both `static` and `database` jobs PASS.

New Preview deployed from that exact SHA and automated-smoked directly (Playwright,
real browser, synthetic account `m15e_final_qa_1` on the preview/dev backend, no
production data touched): Sign In default confirmed, Calendar visible in nav and
`/calendar` renders the Future Feature page without redirecting, `/workspace/workflow`
still redirects to `/workspace/settings`, dark-mode select/option colors now match
exactly (`rgb(18,24,39)`/`rgb(237,241,247)`), light-mode select/option colors match
exactly (`rgb(255,255,255)`/`rgb(23,32,51)`), logout returns to Sign In, and 390x844
has zero page-level horizontal overflow (`scrollWidth === 390`).

## Next Exact Step
**SECURITY REMEDIATION REQUIRED (Step 13 BLOCKED).** A separate remediation prompt should: fix B1/B2 (+N1, optionally N2/N4; N3 server-side http/https check is a pre-existing gap and needs an explicit scope decision) in `apps/extension/sidepanel.js`; add E2E coverage for "edit into a duplicate identity, then save" and "Save anyway on Job A, then switch to Job B"; run targeted then full regression; push a new application SHA; exact-head CI; new Preview; QA; and decide whether a focused re-review of the fix commit is required. No merge to development/main, no production action until then.

*(Historical — the operator manual scenarios below were already executed and reported PASS against `e90ef9af`; re-run only the duplicate scenarios after remediation.)*
Operator manual extension test of the unpacked extension against the Preview:
- **Preview Deployment:** `https://jobquest2-ns7438ypn-one-piece-5779.vercel.app` (`dpl_GawFiRmFBswMeSQjev5MdMrjwUDX`)
- **Unpacked Extension Path:** `apps/extension/dist/jobquest-capture-dev`
- **Verification Scenarios:**
  1. Load unpacked extension in `chrome://extensions` with Developer Mode enabled.
  2. Open Side Panel and verify connection to the Preview URL with valid extension token.
  3. Navigate to a job listing (e.g. LinkedIn / Indeed / Test job fixture).
  4. Confirm automatic extraction populates the job card and draft fields.
  5. Expand the "Review & Edit details" card (`#edit-toggle-btn`).
  6. Verify all editable fields are present: Company, Title, Location, Work Arrangement, Employment Type, Salary Range, Date Applied, Job URL, Source/Board, Tailored Resume, Notes.
  7. Edit Company / Title and verify:
     - The top `.job-card` title/company and avatar update dynamically in real time.
     - Completeness progress bar recalculates.
     - Debounced duplicate detection re-checks against the edited company and title.
  8. Change Tailored Resume mode (Existing resume dropdown, Manual filename/label, or None).
  9. Add custom Notes and click "Save to JobQuest".
  10. Verify capture succeeds, status shows "Saved", and application appears on the Preview Dashboard with the edited values and notes.
  11. Switch browser tabs to a different job / non-job tab and verify active-tab draft isolation (Job A inputs do not leak into Job B).

Only after the operator confirms PASS on this manual extension test does the workflow proceed to:
- **Step 13:** Final Security Review by Claude Opus (read-only independent review).
- **Promotion & Cutover:** Merges to `development` and `main`, production deployment, and production verification remain strictly paused until separately authorized.
