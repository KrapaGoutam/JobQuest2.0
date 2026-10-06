## >>> JOBQUEST 2.1 — FINAL APPLICATION RELEASE (2026-10-06) <<<

RELEASE: JobQuest 2.1 Application Feature Release (Phases 2.1-A through 2.1-F)
STATUS: DEPLOYED TO PRODUCTION — READY FOR OPERATOR ACCEPTANCE

PROMOTION & DEPLOYMENT EVIDENCE:
- Base Development SHA: `87525ba100065515aa0e7ba1ab60c47eb47fdc7d` | Development CI: `37483333711` (PASS)
- Main Before Merge: `c5eaaafc98b70b36d83f64038338b73c464cfd3b`
- Merge Action: `git merge --no-ff development` -> `4dcda58f7283865a6d4b9fe1e6615f6b71a1ff5b`
- Main After Merge: `4dcda58f7283865a6d4b9fe1e6615f6b71a1ff5b` | Main CI: `37485901187` (PASS across all 3 jobs)
- Production Deployment: `dpl_FHvf1caqSd8Rc3nskTz1aeh7dm4L` (READY)
- Production URL: `https://jobquest2.vercel.app` (HTTP 200, `/api/health` 200)
- Deployed Client Bundle: `/assets/index-B949OcUu.js` (Verified containing 2.1-A through 2.1-F markers)

PHASES INCLUDED:
- 2.1-A: Resume Version Visibility
- 2.1-B: Dashboard Goal + Daily Metrics
- 2.1-C: Application Grouping
- 2.1-D: Tasks & Follow-ups
- 2.1-E: Extension Capture + AI Job JSON
- 2.1-F: Analytics Goal Trends

DATABASE / MIGRATION IMPACT: NONE (0 migrations across entire 2.1 feature set).

EXTENSION RELEASE STATUS:
- CI bundle & unit tests PASS.
- Production package buildable via `node apps/extension/scripts/package.mjs prod`.
- Manual reload required in `chrome://extensions` for unpacked extension instances. No store publish required.

POST-RELEASE PHASES:
- Phase 2.1-G (Legacy DB Reconciliation): NOT STARTED
- Phase 2.1-H (AI Connectivity Research): NOT STARTED

NEXT EXACT ACTION: Operator performs consolidated JobQuest 2.1 production acceptance. After acceptance, formally close the application release and proceed separately to 2.1-G.

Report: `feature-upgrade-2.1/2.1_FINAL_RELEASE_REPORT.md`.

## >>> JOBQUEST 2.1-F — ANALYTICS GOAL TRENDS (2026-10-06) <<<

PHASE: 2.1-F | STATUS: IMPLEMENTED ON FEATURE BRANCH — READY FOR COMMIT & BRANCH CI

FEATURE BRANCH: `feature/2.1f-analytics-goal-trends` | BASE DEVELOPMENT SHA: `cda70cf4e282856ae6028b484747f72eb2cc8f97`

IMPLEMENTATION: Added Goal Trends capability to Analytics. Implemented `GoalTrendChart` vector visualization with Target vs Actual series, uncapped completion percentages, tooltips, accessible legend, and screen-reader data table. Added 4 high-value summary metrics (`Goal Reached`, `Success Rate`, `Average Daily`, `Current Streak`) powered by `calculateGoalTrends`. Connected date range toolbar controls (`30d`, `90d`, `180d`, `1y`) and profile timezone semantics. Backend audits confirmed `public.goals` and `rpc_get_goal_progress` already preserve historical targets per effective period window without rewriting prior targets.

LOCAL EVIDENCE: Typecheck PASS; 25/25 test files PASS, 223/223 unit tests PASS (including 20 targeted unit tests in `tests/unit/m8-goal-trends.test.ts` covering scenarios A through H and Section 22 UI behavior); production build PASS (369ms).

DATABASE / MIGRATION IMPACT: NONE. 100% reuse of existing backend tables (`public.goals`) and RPCs (`rpc_get_goal_progress`).

NEXT EXACT ACTION: Stage exact paths, commit and push feature branch `feature/2.1f-analytics-goal-trends`, observe branch CI, merge to development, observe development CI, and stop.

Report: `feature-upgrade-2.1/2.1-F_IMPLEMENTATION_REPORT.md`.

## >>> JOBQUEST 2.1-C — APPLICATION GROUPING (2026-10-06) <<<

PHASE: 2.1-C | STATUS: IMPLEMENTED ON FEATURE BRANCH — PENDING COMMITS & CI VERIFICATION

FEATURE BRANCH: `feature/2.1c-application-date-grouping` | BASE DEVELOPMENT SHA: `75a80488841c657b6f6849bd160b136eb42f79c3`

IMPLEMENTATION: Added Day-level grouping ("Group by Date") alongside "Group by Month". Extended toolbar controls with mutually exclusive grouping (None, Date, Month). Implemented `groupApplicationsByDate`, `getApplicationGroupingDate`, and hardened `groupApplicationsByMonth` with missing-date fallback ("No application date"). Preserved pagination, filters, active sort, and timezone semantics.

LOCAL EVIDENCE: Typecheck PASS; unit tests 203/203 PASS (including targeted 10 new tests in `m3-applications.test.ts`); build PASS.

DATABASE / MIGRATION IMPACT: NONE. 100% frontend reuse of existing application records and `created_at` / `applied_at` date semantics.

NEXT EXACT ACTION: Stage exact paths, commit and push feature branch `feature/2.1c-application-date-grouping`, observe branch CI, merge to development, observe development CI, and stop.

Report: `feature-upgrade-2.1/2.1-C_IMPLEMENTATION_REPORT.md`.

## >>> JOBQUEST 2.1-B — DASHBOARD GOAL + DAILY METRICS (2026-10-06) <<<

PHASE: 2.1-B | STATUS: IMPLEMENTED ON FEATURE BRANCH — PENDING COMMITS & CI VERIFICATION

FEATURE BRANCH: `feature/2.1b-dashboard-goal-metrics` | BASE DEVELOPMENT SHA: `b4400f06acc34bc74ce71af3d7adf397ab32b2c9`

IMPLEMENTATION: Added Daily Goal Card to SearchPulse zone, enhanced GoalProgress widget, wrapped Today's queue in a contained scroll container with sticky header, implemented timezone-safe date subtraction (`previousDayKey`) and goal metrics calculation (`calculateDailyGoalMetrics`).

LOCAL EVIDENCE: Typecheck PASS; unit tests 193/193 PASS (including targeted 13/13 in `m9-dashboard.test.ts`); build PASS.

DATABASE / MIGRATION IMPACT: NONE. 100% reuse of existing backend RPCs and queries (`rpc_get_goal_progress`, `rpc_get_analytics_overview`, `fetchDashboardApplications`).

NEXT EXACT ACTION: Review diff, stage exact paths, commit and push feature branch `feature/2.1b-dashboard-goal-metrics`, observe branch CI, merge to development, observe development CI, and stop.

Report: `feature-upgrade-2.1/2.1-B_IMPLEMENTATION_REPORT.md`.

## >>> JOBQUEST 2.1-A — RESUME VERSION / ATTACHED DOCUMENT FIX (2026-10-05) <<<

PHASE: 2.1-A | STATUS: PROMOTED TO MAIN & DEPLOYED TO PRODUCTION — AWAITING OPERATOR MANUAL ACCEPTANCE

FIX BRANCH: `fix/2.1a-resume-version-visibility` (retained) | FIX SHA: `b3412bb9c964972b55bf970de6d9213548ae1d59` | FIX CI: `37408524474` (PASS)
DEVELOPMENT SHA: `b4400f06acc34bc74ce71af3d7adf397ab32b2c9` | DEV CI: `37409345201` (rerun PASS)
MAIN BEFORE: `74e9d225ebb739a9ddb5348f7548cca9fbe6f7ba` | MAIN SHA: `c5eaaafc98b70b36d83f64038338b73c464cfd3b` | MAIN CI: `37411431957` (PASS)
PRODUCTION DEPLOYMENT: `dpl_6xU9HwNM58tM11nZdBaEx14XPTjo` (READY) | URL: `https://jobquest2.vercel.app`

IMPLEMENTATION: Added `label` to `ApplicationDocumentRecord` in `types/documents.ts` and updated `ApplicationDocumentsSection.tsx` to display `item.label` (if present) over `resume.name`, defaulting to "Attached Document" as a final fallback.

VERIFICATION: Client bundle `/assets/index-BJxPZYzx.js` verified serving updated label logic. Production HTTP 200. No schema/migration changes.

NEXT EXACT ACTION: Operator conducts manual acceptance in production. Upon acceptance, formally close Phase 2.1-A and begin Phase 2.1-B in a new session.

Report: `feature-upgrade-2.1/2.1-A_IMPLEMENTATION_REPORT.md`.

## >>> M15-F PRODUCTION LIVE / APPLICATIONS DENSITY HOTFIX IN PROGRESS (2026-10-04) <<<

M15-F Production cutover is live but **not formally closed**. Main is `8c06353ba373efe3306dd34ca126d5360994b6f1`; exact main CI `37212272157` passed; Vercel deployment `dpl_6aAYeZrJCoHDKj8QJGqonZ4tS6rG` is READY at `https://jobquest2.vercel.app`. The Production database has 20 migrations through `20261022100000_pl4c_goals_task_templates_recurrence.sql`; post-migration catalog, RLS, grants, constraints, and representative data reconciliation passed.

Before formal operator acceptance, the operator identified one narrow Applications-page density issue: the direct quick-action/suggestion surface renders every application above the canonical table. Authorized branch `fix/m15f-applications-suggestion-density` starts from certified development `50a1a13d291da20ada18e4b4bbaaadc9fd54401b` and changes only frontend display state, accessibility semantics, and focused tests. Default target is 3 suggestions on desktop and 2 on mobile, with one accessible expand/collapse control. Existing order, content, handlers, and business logic remain unchanged.

NON-CHANGES: no database, migration, Supabase config, RLS, grant, auth, API, environment, dependency, Production data, PL-1D, PL-5, or legacy-retirement change. The pre-cutover backup remains READY and restore VERIFIED; neither is rerun. The operator-owned `.gitignore` edit remains unstaged and untouched.

NEXT EXACT ACTION: finish the narrow fix, targeted tests, fix-branch CI, authorized no-ff development/main promotion, exact CI gates, Git-triggered Vercel deployment, and focused Applications desktop/mobile Production verification. Then stop for operator manual acceptance; do not mark M15-F formally closed.

Report: `migration-upgrade/post-launch/M15F_PRODUCTION_RELEASE_STABILIZATION_REPORT.md`.

## >>> PL-4C FEATURE CERTIFIED / OPERATOR APPROVAL REQUIRED (2026-10-04) <<<

PL-0: FORMALLY CLOSED | PL-1: FORMALLY CLOSED | PL-2: FORMALLY CLOSED | PL-3: FORMALLY CLOSED | PL-4A: FORMALLY CLOSED | PL-4B: FORMALLY CLOSED | PL-4C: FEATURE CERTIFIED / DEVELOPMENT PROMOTION NOT AUTHORIZED | PL-1D: DEFERRED / TBD.

CURRENT BRANCH: `feature/pl4c-goals-task-templates-recurrence` | DEVELOPMENT BASE/UNCHANGED: `dfa5a59b6619d12e319fe82b316be2339280f673` | MAIN BASELINE/UNCHANGED: `bfa82eb557c5e748ba5d7c91fe122fb8294d2313`.

IMPLEMENTATION: independently configurable/effective-dated goal metrics; owner-scoped global task templates that produce independent canonical tasks; configurable recurrence intervals, ISO weekdays, end dates, and occurrence limits. Legacy goal/RPC compatibility, existing recurrence presets, parent uniqueness, concurrency/undo safety, and canonical tasks remain intact.

LOCAL EVIDENCE REUSED: lint PASS; typecheck PASS; unit `179/179`; integration `192/192`; extension `97/97`; full browser E2E + axe `23/23`; build, fresh/upgrade migrations, RLS/grants, concurrency, responsive/accessibility, compatibility, and secret scans PASS. No source/test/migration change followed authorization, so these were not redundantly rerun.

JOBQUEST-DEV: authorized M15 predecessor `20261021100000` and PL-4C `20261022100000` applied in order to `xpnkasclquplmrcmhsif`; migration history aligned. Focused remote integration `5/5` and read-only RLS/grant/catalog verification PASS. Production/jobquest-prod untouched.

APPLICATION/TEST CANDIDATE: `eff714e2564391953638e7a7fa2cf7ed729ed71a` | CI `37181003327` PASS. Matching Preview `dpl_4oRca2xD5zSdq5TccycvD71gxTNp` at `https://jobquest2-gnmajdb53-one-piece-5779.vercel.app` is READY, healthy, and bound only to jobquest-dev. Focused authenticated goals/templates/recurrence acceptance `2/2` PASS, including mobile and axe coverage.

PROTECTION STATE: no development/main merge and no Production migration, auth, environment, or deployment change. The operator's `.gitignore` modification remains unstaged and untouched. PL-1D remains deferred; PL-5 was not started.

NEXT EXACT ACTION: certify the documentation-only feature tip, then stop for explicit operator approval before PL-4C → development. Do not merge development to main or touch Production.

Report: `migration-upgrade/post-launch/PL4C_GOALS_TASK_TEMPLATES_RECURRENCE_REPORT.md`.

## >>> PL-4B FORMALLY CLOSED / DEVELOPMENT CI PASS (2026-10-03) <<<

PL-0: FORMALLY CLOSED | PL-1: FORMALLY CLOSED | PL-2: FORMALLY CLOSED | PL-3: FORMALLY CLOSED | PL-4A: FORMALLY CLOSED | PL-4B: FORMALLY CLOSED | PL-4C: NEXT / NOT STARTED | PL-1D: DEFERRED / TBD.

CURRENT BRANCH: `development` | PL-4B BASE: `80076446a120388fe2b05f7d36ccc131bb72d538` | FINAL FEATURE SHA / CI: `8ee3dcaa024ae9780ca395d246e61667a09dc580` / `37128248294 PASS` | DEVELOPMENT MERGE SHA / CI: `dfa5a59b6619d12e319fe82b316be2339280f673` / `37128826840 PASS` | MAIN BASELINE: `bfa82eb557c5e748ba5d7c91fe122fb8294d2313`.

IMPLEMENTATION: real timezone-aware Calendar month/agenda; cross-application event and defensible-duration Timeline/Gantt; consolidated recovery-only Archive Center for applications, contacts, habits, and documents. Existing canonical tables, RLS, manager visibility, source navigation, and restore RPCs are retained. No migration, schema, API contract, RLS, auth, dependency, workflow, Production, or PL-1D change.

RECOVERY: original SHA `3c7ecb7bd12549b51ccbef9318df045dd6c76fb5` failed CI run `37101076139` at TypeScript `TS2367` because a test compared `Animation.playState` with impossible value `pending`. The semantic correction uses `!animation.pending`; intermediate SHA `a7aeeb4172d77befd8f3677384afb0e23a4a930b` passed exact CI `37126669497`. Preview synchronization now waits for both `user.id` and workspace readiness; explicit tablet acceptance was added.

LOCAL EVIDENCE: lint PASS; typecheck PASS; unit `179/179`; integration `187/187`; build PASS; extension `97/97`; full browser E2E + axe `23/23`; tracked secret scan 955 files / zero findings; browser and extension bundle scans zero findings. Focused PL-4B Preview acceptance passes ten axe contexts and desktop/tablet/mobile with zero horizontal overflow.

FINAL APPLICATION/TEST CANDIDATE: `f8890b4d33bb8470ed3564951436cab869135389` | CI `37127378593` PASS. Matching Preview `dpl_AHAeH26jLYdd2AgMSafhHAdFjWvV` at `https://jobquest2-pb0szhpwp-one-piece-5779.vercel.app` is READY, healthy, and bound only to jobquest-dev.

DEVELOPMENT INTEGRATION: operator-approved no-ff merge `dfa5a59b6619d12e319fe82b316be2339280f673` has parents `80076446a120388fe2b05f7d36ccc131bb72d538` and `8ee3dcaa024ae9780ca395d246e61667a09dc580`. Exact development CI `37128826840` passed classification, lint, typecheck, unit, build, secret scans, migrations, integration, extension validation, browser E2E, axe, evidence upload, and disposable-stack cleanup.

PROTECTION STATE: main remains `bfa82eb557c5e748ba5d7c91fe122fb8294d2313`; Production/jobquest-prod and PL-1D are unchanged. The operator's `.gitignore` modification remains unstaged and untouched; `FeatureUpgrade1` remains locally excluded.

POST-DEVELOPMENT-CI DOCUMENTATION: this formal closeout metadata is intentionally unstaged so no new untested development SHA is created.

NEXT EXACT ACTION: PL-4C — Goals + Task Templates + Recurrence Enhancements, in a separate controlled task with explicit authorization. Do not start automatically, merge development to main, touch Production, implement PL-1D, execute M15-F, or retire legacy systems.

Report: `migration-upgrade/post-launch/PL4B_CALENDAR_TIMELINE_ARCHIVE_REPORT.md`.

## >>> PL-4A FORMALLY CLOSED / DEVELOPMENT CI PASS (2026-10-02) <<<

PL-0: FORMALLY CLOSED | PL-1: FORMALLY CLOSED | PL-2: FORMALLY CLOSED | PL-3: FORMALLY CLOSED | PL-4A: FORMALLY CLOSED | PL-4B: NEXT / NOT STARTED | PL-1D: DEFERRED / TBD.

FEATURE BRANCH: `feature/pl4a-duplicate-bulk-recruiter` | FINAL FEATURE SHA / CI: `89d6764015e96bc4639158fe74a0f5a89e25a032` / `37034644123 PASS` | FULL APPLICATION CI: `cc240dc4948ac9e34a61ccc516686cf2c5e830f1` / `37033042789 PASS`.

DEVELOPMENT INTEGRATION: operator-approved no-ff merge `80076446a120388fe2b05f7d36ccc131bb72d538` has parents `11116ca2a577c70e18b4bcfac796dfa6260bda15` and `89d6764015e96bc4639158fe74a0f5a89e25a032`. Exact development CI `37050583184` passed classification, lint, typecheck, `174/174` unit tests, build, secret scans, migrations, `187/187` integration tests, extension validation, `22/22` browser E2E plus axe, evidence upload, and disposable-stack cleanup.

PREVIEW EVIDENCE: final feature Preview `dpl_6nKw3dbtH4nGhKptGrTt99HMCugr` at `https://jobquest2-jbb8az212-one-piece-5779.vercel.app` is READY, healthy, and targets only jobquest-dev. Focused authenticated Applications and Contacts Preview suites passed with eleven axe contexts, zero blocking violations, and zero mobile overflow.

PROTECTION STATE: `main` remains `bfa82eb557c5e748ba5d7c91fe122fb8294d2313`; Production/jobquest-prod and PL-1D are unchanged. The operator's `.gitignore` modification remains unstaged and untouched; `FeatureUpgrade1` remains locally excluded.

POST-DEVELOPMENT-CI DOCUMENTATION: this formal closeout metadata is intentionally unstaged so no new untested development SHA is created.

NEXT EXACT ACTION: PL-4B — Calendar / Timeline-Gantt / Archive, in a separate controlled task with explicit authorization. Do not start automatically, merge development to main, touch Production, implement PL-1D, execute M15-F, or retire legacy systems.

Report: `migration-upgrade/post-launch/PL4A_DUPLICATE_BULK_RECRUITER_REPORT.md`.

## >>> PL-4A FEATURE CERTIFIED / OPERATOR APPROVAL REQUIRED (2026-10-02) <<<

PL-0: FORMALLY CLOSED | PL-1: FORMALLY CLOSED | PL-2: FORMALLY CLOSED | PL-3: FORMALLY CLOSED | PL-4A: FEATURE CERTIFIED / DEVELOPMENT PROMOTION NOT AUTHORIZED | PL-1D: DEFERRED / UNCHANGED.

CURRENT BRANCH: `feature/pl4a-duplicate-bulk-recruiter` | DEVELOPMENT BASE: `11116ca2a577c70e18b4bcfac796dfa6260bda15` | MAIN BASELINE: `bfa82eb557c5e748ba5d7c91fe122fb8294d2313`.

DISCOVERY: Duplicate UX `PARTIAL`; bulk selection `PARTIAL`; bulk actions `PARTIAL`; recruiter tracking `PARTIAL`; application-contact association `EXISTING`; recruiter search/filter/detail `PARTIAL`.

IMPLEMENTATION: race-safe duplicate checks, multi-match navigation/metadata, mobile and page-scoped application selection, mixed-state bulk eligibility, confirmation/pending/partial-failure handling, canonical contact deep links, exact facets, 50-row contact pagination, searchable linking, and accessible contact table/drawer behavior. Existing duplicate/contact/RPC architecture remains canonical.

LOCAL EVIDENCE: lint PASS; typecheck PASS; unit `174/174`; integration `187/187`; build PASS; full browser E2E + axe `22/22`; extension `97/97` plus typecheck/package; tracked-source, browser-bundle, and extension secret scans all report zero findings. Focused PL-4A and contact evidence report zero axe violations and zero mobile overflow.

NON-CHANGES: no migration, schema, RLS, auth, dependency, workflow, external API contract, main, Production, jobquest-prod, or PL-1D change. The operator's pre-existing `.gitignore` edit remains unstaged and untouched.

REMOTE EVIDENCE: exact feature CI `37033042789` PASS for application/evidence SHA `cc240dc4948ac9e34a61ccc516686cf2c5e830f1`. Matching Preview `dpl_H6nWmXctR1oGB7mXpEah4jYK9nRt` at `https://jobquest2-dx21j0l5o-one-piece-5779.vercel.app` is READY, healthy, and bound only to jobquest-dev. Focused authenticated Applications and Contacts Preview suites passed with eleven axe contexts, zero blocking violations, and zero mobile overflow.

NEXT EXACT ACTION: certify the docs-only closeout tip, then stop for explicit operator approval before any development merge. Do not touch main, Production, jobquest-prod, or PL-1D.

Report: `migration-upgrade/post-launch/PL4A_DUPLICATE_BULK_RECRUITER_REPORT.md`.

## >>> PL-3 DIRECTION C — FORMALLY CLOSED / DEVELOPMENT CI PASS (2026-10-02) <<<

PL-0: FORMALLY CLOSED | PL-1: FORMALLY CLOSED | PL-2: FORMALLY CLOSED | PL-3: FORMALLY CLOSED | PL-4A: NEXT / NOT STARTED | PL-1D: DEFERRED / TBD.

CURRENT BRANCH: `development` | IMPLEMENTATION BASE: `5dfce2086f04abd26efb1a3a36ebd73132bda986` | FINAL FEATURE SHA / CI: `2745abb7ac3c70f7877e4d2a304c53e54215cce5` / `36973633143 PASS` | DEVELOPMENT MERGE SHA / CI: `11116ca2a577c70e18b4bcfac796dfa6260bda15` / `37012301480 PASS` | MAIN BASELINE: `bfa82eb557c5e748ba5d7c91fe122fb8294d2313`.

DESIGN: Direction C — Job Search Cockpit. Handoff `FeatureUpgrade1/JobQuest-PL3-ClaudeCode-Handoff` validated as local reference input and remains excluded/untracked. Directions A/B and Analytics All Sections were not implemented.

IMPLEMENTATION: canonical Dashboard hierarchy, Week-default Search Pulse, Today’s Work, Progress, Your Widgets, enhanced 30-widget customization, and four-tab Analytics redesign. Offers and Aging Applications are represented in new user defaults. All 30 widget IDs remain accounted for. No schema, RLS, auth, API contract, shell, main, or Production change.

CERTIFICATION EVIDENCE: lint PASS; typecheck PASS; unit `171/171`; integration `187/187`; build PASS; tracked-secret scan `944` files / `0` findings; full browser E2E `22/22 PASS`. Original SHA `012fc37eddd10783b9b1df2d7edf80d50e979f0f` failed CI `36966023286` only because a screen-reader-only pace-chart table created 9px Linux Chromium overflow at 390px. The table is now contained by a clipped wrapper without removing table semantics. Exact application-fix CI `36972469514` passed for `fda08f2ec465fbfbe961ecc5bd40e98269ca7674`.

PREVIEW EVIDENCE: `https://jobquest2-kmyr2pq0v-one-piece-5779.vercel.app` (`dpl_62fhBQL3Jd6iuPy5YS7sKXvRqnea`) is READY for exact application SHA `fda08f2ec465fbfbe961ecc5bd40e98269ca7674`. Health returned 200; the bundle targets only `jobquest-dev`; focused Dashboard and Analytics Preview suites passed with 30/30 widgets, zero mobile overflow, and zero axe violations.

DEVELOPMENT INTEGRATION: operator-approved no-ff merge `11116ca2a577c70e18b4bcfac796dfa6260bda15` has parents `5dfce2086f04abd26efb1a3a36ebd73132bda986` and `2745abb7ac3c70f7877e4d2a304c53e54215cce5`. Exact development CI `37012301480` passed classification, lint, typecheck, unit, build, secret scans, disposable-Supabase integration, extension validation, browser E2E, and axe.

PROTECTION STATE: `.gitignore` and the PL-2 report update remain unstaged and untouched. `development` is integrated and certified at `11116ca2a577c70e18b4bcfac796dfa6260bda15`; `main` remains `bfa82eb557c5e748ba5d7c91fe122fb8294d2313`; Production is unchanged.

POST-CI WORKING TREE: this final PL-3 closeout metadata is intentionally unstaged so no new untested development SHA is created.

NEXT EXACT ACTION: PL-4A, in a separate controlled task with explicit authorization. Do not start automatically, merge development to main, touch Production, implement PL-1D, execute M15-F, or retire legacy systems.

Report: `migration-upgrade/post-launch/PL3_DASHBOARD_ANALYTICS_REPORT.md`.

## >>> PL-2 APPLICATION PRODUCTIVITY — FORMALLY CLOSED / DEVELOPMENT CI PASS (2026-10-01) <<<

PL-0: FORMALLY CLOSED | PL-1: FORMALLY CLOSED | PL-2: FORMALLY CLOSED | PL-3: NEXT / NOT STARTED | PL-1D: DEFERRED / TBD | HISTORICAL CLASSIFICATION: UNKNOWN.

CURRENT BRANCH: `development` | PL-2 BASE: `1086bcb41d1b0ab25959d182ec388a0f6da53042` | IMPLEMENTATION COMMIT: `526b0318` | CERTIFIED FEATURE SHA / CI: `298d112d4379dedf6930572015d6f7498feff4ea` / `36918359854 PASS` | DEVELOPMENT MERGE SHA / CI: `5dfce2086f04abd26efb1a3a36ebd73132bda986` / `36960378949 PASS`.

PL-2 DISCOVERY: Date Added filter `MISSING`; sort direction `PARTIAL`; group by month `MISSING`; suggestion area `PARTIAL`; application contact UX `PARTIAL`. Canonical Date Added is `applications.created_at`. No migration is required.

EVIDENCE: lint PASS; full typecheck PASS; unit `170/170`; integration `187/187`; build PASS; tracked-secret scan `941` files / `0` findings; two targeted local browser scenarios wrote PASS evidence with zero PL-2 axe findings and zero mobile overflow. Final feature CI run `36918359854` passed for `298d112d4379dedf6930572015d6f7498feff4ea`. Matching Preview `dpl_3PcsXLanZhRMww5bTdfjXSTtux87` at `https://jobquest2-86tuv7yxd-one-piece-5779.vercel.app` is READY and targets only `jobquest-dev`. Exact development CI run `36960378949` passed for merge SHA `5dfce2086f04abd26efb1a3a36ebd73132bda986`, including classification, lint, typecheck, unit, build, both secret scans, disposable-Supabase integration, extension validation, browser E2E, and axe.

PRODUCTION: UNCHANGED/FROZEN | MAIN: UNCHANGED (`bfa82eb557c5e748ba5d7c91fe122fb8294d2313`) | DEVELOPMENT: PL-2 INTEGRATED AND CERTIFIED (`5dfce2086f04abd26efb1a3a36ebd73132bda986`) | AUTH SYSTEMS: UNCHANGED | DB SCHEMA: UNCHANGED.

POST-CI WORKING TREE: this closeout metadata is intentionally unstaged so no new untested development SHA is created; the pre-existing `.gitignore` operator change remains unstaged and untouched.

NEXT EXACT ACTION: PL-3 — Dashboard + Analytics redesign, in a separate controlled task. Do not start automatically, merge main, touch Production, implement PL-1D, execute M15-F, or retire legacy systems.

Report: `migration-upgrade/post-launch/PL2_APPLICATION_PRODUCTIVITY_REPORT.md`.

## >>> PL-1 FORMALLY CLOSED — DEVELOPMENT INTEGRATION CI PASS (2026-10-01) <<<

PL-0: FORMALLY CLOSED | PL-1: FORMALLY CLOSED | PL-2: NEXT / NOT STARTED | HISTORICAL CLASSIFICATION: UNKNOWN.

CURRENT BRANCH: `development` | DEVELOPMENT HEAD/REMOTE: `1086bcb41d1b0ab25959d182ec388a0f6da53042` | DEVELOPMENT CI: `36903888076` PASS | CLOSEOUT FEATURE SHA: `bc515986f8aad691298d7661912fa178f84c8cee` | CLOSEOUT FEATURE CI: `36898779897` PASS.

WORKSTREAMS: PL-1A `CLOSED`; PL-1B `NOT EXECUTED / CONDITIONAL`; PL-1C `CLOSED WITH LIVE-EVIDENCE LIMITATION`; PL-1D `ASSESSED / DEFERRED / TBD`.

PL-1C EVIDENCE: implementation review plus extension tests `97/97 PASS`; read-only Preview `dpl_7d64jmpkzzEchdPkNJPBT6ktpSek` at `https://jobquest2-d0vixbma7-one-piece-5779.vercel.app` targeted `jobquest-dev`; health returned 200 and `/api/ext/v1/me` with a synthetic invalid token returned 401 `EXTENSION_TOKEN_INVALID`. Successful live stored-token authentication was not independently exercised because no authorized Preview token was available; no credential/account was created solely for verification.

PL-1D EVIDENCE: server duplicate enforcement risk, `duplicate_override` residue, and URL-normalization mismatch are confirmed and remain deferred; stale/out-of-order verdict handling is mitigated. Focused tests: side panel `63/63 PASS`; normalization `3/3 PASS`. No PL-1D implementation occurred.

PRODUCTION: UNCHANGED/FROZEN | MAIN: UNCHANGED (`bfa82eb557c5e748ba5d7c91fe122fb8294d2313`) | DEVELOPMENT: PL-1 CLOSEOUT INTEGRATED | AUTH SYSTEMS: UNCHANGED.

LAST COMPLETED: certified closeout feature SHA `bc515986f8aad691298d7661912fa178f84c8cee` in CI run `36898779897`; merged it into development with no-ff merge `1086bcb41d1b0ab25959d182ec388a0f6da53042`; pushed development only; and certified exact development CI run `36903888076` PASS. The development merge was classified docs-only; tracked-secret and committed-key checks passed and application jobs were skipped. Historical credential validity remains `UNKNOWN`; it was not tested or reused. Report: `migration-upgrade/post-launch/PL1_CLOSEOUT_REPORT.md`.

POST-CI WORKING TREE: these final handoff updates are intentionally unstaged so no new untested development SHA is created; the pre-existing `.gitignore` operator change remains unstaged and untouched.

NEXT EXACT ACTION: PL-2 — Application Productivity, in a separate controlled task. Do not start automatically, merge main, touch Production, execute M15-F, or retire legacy systems.

## >>> PL-0 FORMALLY CLOSED — GOVERNANCE INTEGRATION + CLOSEOUT (2026-09-30) <<<

PHASE: PL-0 | STATUS: FORMALLY CLOSED.

M15-E: CLOSED | PL-0A: CLOSED | PL-0B-1: CLOSED | PL-0B-R1: CLOSED | PL-0B-R2: CLOSED | PL-0B-2: CLOSED | PL-0B-3: CLOSED.

FINAL CERTIFIED DEVELOPMENT SHA: `24c0b40d2c8fe4e5f452ccdf8c9fd903a7dae2c0` | CI: `36783308738` | RESULT: PASS.

GOVERNANCE INTEGRATION: `feature/pl-0-governance` (`d75d63f1d641063d5276acd0cfd2bbbf7bb847fd`) merged into development with no application, schema, configuration, workflow, environment, data, deployment, main, Production, jobquest-prod, or jobquest-dev changes. The exact development CI classified the merge as docs-only; classification and lightweight tracked-secret/committed-key checks passed, while install/lint/typecheck/unit/build/browser-bundle and migration/browser work were skipped.

CLOSEOUT BRANCH: `docs/pl-0-closeout` | BASE: `24c0b40d2c8fe4e5f452ccdf8c9fd903a7dae2c0`. This branch records formal closeout only and must receive exact branch CI before its authorized no-ff integration into development. Main and Production remain unchanged.

NEXT: after this closeout branch and its final development integration are certified, stop. The next phase is PL-1 — Critical Security + Extension Reliability; its first priority is plaintext smoke-tester credential hygiene. PL-1 requires a new session and explicit operator authorization.

## >>> PL-0B-2 — PERMANENT POST-LAUNCH GOVERNANCE / ROADMAP IMPLEMENTATION (2026-09-30) <<<

PHASE: PL-0B-2 | STATUS: IN PROGRESS — governance documentation branch created; no development merge authorized.

M15-E: FORMALLY CLOSED | PL-0A: CLOSED | PL-0B-1: CLOSED | PL-0B-R1: CLOSED | PL-0B-R2: CLOSED.

CERTIFIED DEVELOPMENT SHA: `fcadb2ff77f0850450242a1caf9c2143a08ceef4` | CI: `36768885326` | RESULT: PASS.

CURRENT BRANCH: `feature/pl-0-governance` | BASE: `fcadb2ff77f0850450242a1caf9c2143a08ceef4` | MAIN: `bfa82eb557c5e748ba5d7c91fe122fb8294d2313`.

WORK: canonical post-launch roadmap, permanent backlog, execution checklist, handoff template, implementation report, and historical-register pointer. No product code, migrations, workflow changes, development/main merge, deployment, Production change, jobquest-prod change, or jobquest-dev change.

NEXT: review docs, run canonical secret scan, commit/push only this branch, and certify its exact docs-only CI. After operator-approved integration and exact development CI, PL-1 is next. Do not claim PL-0 fully closed before that integration gate.

## >>> PL-0B-R1 — CI / E2E / GITHUB GOVERNANCE REMEDIATION (2026-09-30) <<<

PHASE: PL-0B-R1 | STATUS: LOCAL REMEDIATION COMPLETE; AWAITING EXACT BRANCH CI

BRANCH: `fix/pl0-ci-e2e-governance` | BASE: `dee10faaecb1d8e69a6259c2f19a111ef2130a55`

ORIGINAL CANCELLED RUN: `36752994633` | SUBSEQUENT FAILED RUN: `36753339403`

E2E FAILURE: `e2e/leak.spec.ts` timed out waiting for the Diagnostics button. The sanitized CI failure snapshot proved that the browser was on Sign in, not Settings. ROOT CAUSE: the test performed consecutive hard page navigations immediately after creating/adopting an authenticated session. On slower CI timing, a hard navigation could abort refresh-token rotation; the next reload then used the invalidated prior cookie and returned to Sign in. Diagnostics itself remained present and supported. A second existing M2 helper used the same unsafe authenticated hard-navigation pattern.

REMEDIATION: SYNC_READINESS / TEST_ONLY. Authenticated test transitions now use the application's supported hash-router navigation and reused-account login waits for the Sign in form to unmount. B03/B11/B12 exposure, direct Data API read/write, session, cookie, network, DOM, storage, and credential assertions remain unchanged.

CI CHANGES: `fix/**` push coverage; feature/fix stale-run cancellation retained; development/main cancellation disabled so later runs queue; native deny-by-default docs-only classifier; lightweight tracked-secret and committed-key checks for confirmed Markdown-only changes; full CI for code/config/mixed/unknown/manual cases; exact-SHA, single-observer, and API rate-limit/backoff policy documented.

LOCAL VERIFICATION: lint PASS; typecheck PASS; unit 163/163 PASS; integration 186/186 PASS; extension 97/97 PASS plus typecheck/package/bundle scan; focused leak E2E PASS twice after the primary fix and PASS again after the shared helper fix; full E2E 22/22 PASS; build PASS; browser-bundle and 928-tracked-file secret scans PASS; workflow YAML parse and 11-case classifier self-test PASS.

PRODUCTION: UNTOUCHED | JOBQUEST-PROD: UNTOUCHED | JOBQUEST-DEV: UNTOUCHED | PREVIEW: NOT REQUIRED (workflow/tests/docs only)

NEXT: commit and push only `fix/pl0-ci-e2e-governance`, then certify its exact HEAD with the single local `gh` observer. Operator review is required before any development merge.

## >>> PL-0B-1 — INTERRUPTED: SAFE TO RESUME CI GATE (2026-09-30) <<<

PHASE: PL-0B-1 | STATUS: INTERRUPTED — SAFE TO RESUME PL-0B-1

DEVELOPMENT BEFORE: `1ed8fdd1fccdbdd8febeb3e071d0f316161df542` | MAIN BASELINE: `bfa82eb557c5e748ba5d7c91fe122fb8294d2313` | M15-E HANDOFF: `a2c1720564b5dd8f868a2c92ecfbb2c422e5b9a4`

MAIN FAST-FORWARD: COMPLETE — development fast-forwarded to `bfa82eb5`; tree ID matched main (`02c41e4908ece43bafcab788ee08d645149a1d1e`). M15-E HANDOFF MERGE: COMPLETE — merge commit `e96e67187c282b9caa069673bbf10fd5e0210a28` (`merge: integrate M15-E production closeout into development`). Application code delta from main: NONE. Handoff content was limited to migration closeout/operational material; no delta under application directories or `supabase/migrations/`. Repository secret scan: PASS (928 tracked files, 0 findings).

PUSH: COMPLETE — only `development` pushed at `e96e67187c282b9caa069673bbf10fd5e0210a28`. CI: RUNNING/UNVERIFIED — GitHub Actions M1B CI run `36752994633`, SHA `e96e67187c282b9caa069673bbf10fd5e0210a28`. Static job (`Lint · typecheck · unit · build · secret scans`) PASS. Database/browser job (`Migrations · Option B auth · RLS · browser (local Supabase)`) was in progress at last successful lookup. Subsequent exact-run lookups returned GitHub API HTTP 403 rate-limit errors, so do not infer a result.

CURRENT BRANCH: `development` | APPLICATION / CI-TESTED SHA: `e96e67187c282b9caa069673bbf10fd5e0210a28` | CURRENT DOCS HEAD: pending this checkpoint commit. MAIN: unchanged. PRODUCTION: untouched. JOBQUEST-PROD: untouched. JOBQUEST-DEV: untouched.

LAST COMPLETED ACTION: pushed the merge SHA and confirmed its static CI job passed. NEXT EXACT ACTION: verify GitHub Actions run `36752994633` for exact SHA `e96e67187c282b9caa069673bbf10fd5e0210a28`; if all required jobs are green, amend this state record only as necessary, commit/push only that exact file, then stop before PL-0B-2. Do not start PL-0B-2 or PL-1.

## >>> M15-E FORMALLY CLOSED (2026-09-30): FINAL DECISION = GO | CK-18 = OPERATOR APPROVED | NEXT = M15-F PRODUCTION STABILIZATION (not started) <<<

M15-E FINAL DECISION: GO | CK-18: OPERATOR APPROVED (operator accepted the GO and authorized formal closeout) | M15-E: FORMALLY CLOSED | NEXT: M15-F — PRODUCTION STABILIZATION (requires its own explicit operator authorization).
CLOSEOUT ACTIONS: docs-only commit on fix/m15e-extension-connection-ui, pushed to that branch only. development/main NOT merged; Production NOT redeployed; Production variables NOT modified; JobQuest1 NOT retired; old Supabase NOT deleted/paused.

## >>> M15-E FINAL GO / NO-GO (2026-09-30): DECISION = GO (read-only gate) <<<

PRODUCTION: dpl_42Kq9nKyxAc1iicaMwE24NQhs3xQ @ https://jobquest2.vercel.app | MAIN bfa82eb5 | PROD DB jobquest-prod kqsxdothjxtcktyirpux | P0: 0 | P1: 0 | BLOCKERS: 0
RE-VERIFIED READ-ONLY: DB 223 apps / 90 snapshots / 349 events / 122 docs / 1 token; all apps Conan + fbd661ef-…; 0 orphans; 0 tables without RLS; 24 h Supabase edge_logs 423 requests, zero 4xx/5xx (gateway logs now queryable); live bundle kqsx-only, no secrets; prod package clean; extension tests 97/97.
EVIDENCE LIMITATIONS (both NON-BLOCKING per Step 13C "automated evidence sufficient for release"): L1 duplicate Side Panel visual observation not seen by agent; L2 edit-invalidation not exercised in Production. Others: no fresh stranger/anon prod RLS probe; JWT kid not decoded; health TTFB 0.25–0.47 s.
HYGIENE: H1 plaintext `smoke-tester` password from the superseded kwmnl… target is committed in main docs (M15E_GO_NO_GO_REPORT.md:56, NEXT_AGENT_HANDOFF.md:61); account absent from jobquest-prod; scrub/rotate post-launch. H2 GO_NO_GO_CHECKLIST CK-06/10/14 figures are stale (superseded by 16A-2/3).
FULL DECISION + BACKLOG: migration-upgrade/m15/M15E_FINAL_GO_NO_GO_DECISION.md
UNCHANGED: Production, Preview/Dev, old Supabase, jobquest-dev, JobQuest1/Neon, main/development. NO merge/push/deploy/token/data write performed. Rollback dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK AVAILABLE.
NEXT: M15-F — PRODUCTION STABILIZATION (needs explicit operator authorization). JobQuest1 retirement NOT authorized.

## >>> STEP 16B — PASS WITH ONE EVIDENCE CAVEAT (2026-09-30 ~13:25Z): PRODUCTION EXTENSION ACTIVATED; STOPPED BEFORE M15-E FINAL GO/NO-GO <<<

PRODUCTION: dpl_42Kq9nKyxAc1iicaMwE24NQhs3xQ @ https://jobquest2.vercel.app | REDEPLOY/ENV CHANGE DURING 16B: NO | EXTENSION_TOKEN_ENV: NOT_REQUIRED (prefix jqx_dev_, cosmetic) | 2nd TOKEN CREATED: NO | M15-F: NOT STARTED
TOKEN: 1 token "OP-Prod" (id 195a68fe-…), created 13:07:05Z by operator in-app, VALUE NOT RECORDED. Workspace fbd661ef-… (Conan's) PASS | user e5df8d69-… PASS | scopes exactly workflow:read, documents:read, applications:duplicate_check, applications:create, profile:read PASS (no edit/delete) | expires 2026-12-29 | last_used_at 13:16:05Z (updated) PASS | revoked_at null (ACTIVE) PASS. Kept, not revoked.
CAPTURE: PASS (operator). One new application 05c0bf52-… "CVP (Customer Value Partners)" / "[Remote] QA Tester", stage SAVED, source jobright.ai, created 13:13:33Z, user+workspace = Conan/fbd661ef-… (0 rows with a different owner/workspace), duplicate_override_flag=false (0 true across all 223). Kept as the smoke application (real posting; operator may archive/delete later — not cleaned up).
DB (read-only): applications 222 -> 223 (+1) | job_snapshots 89 -> 90 (+1, snapshot a13aabcf-…) | application_events 347 -> 349 (+2: CREATED + CAPTURED) | application_documents 122 (unchanged; capture did not create one) | extension_tokens 0 -> 1 | auth_sessions 2 (unchanged).
DUPLICATE PROTECTION: PASS on server/package evidence; UI verdict NOT independently witnessed. Evidence: exactly one row for that URL and for company+title (same_url=1, same_company_role=1); production log shows capture POST /api/ext/v1/captures 201 once (13:13:32Z) and NO second capture; 3 post-capture POST /api/ext/v1/duplicates/check 200 (13:13:37, 13:13:43, 13:16:05Z) = the operator re-checking the same posting; extension unit tests 97/97 PASS (fail-closed save gate, identity-keyed state); package has no "Save as New Application Anyway" and duplicate_override hard-coded false; DB flag false. The API itself does NOT enforce duplicates on POST /captures (client-only gate, documented residual), so "second Save BLOCKED" can only be seen in the operator's side panel. An agent cannot drive it: no token was (or may be) given to the agent.
EDIT INVALIDATION: NOT DIRECTLY EXERCISED ON PRODUCTION (needs the operator's side panel). Covered by automated evidence: extension tests 97/97 (onIdentityChange invalidation, stale-verdict NEEDS_CHECK, checkedKey/identity-key match) + Preview E2E (m15e-extension-sidepanel) from Steps 13A-13C. Optional operator check: open the same posting, edit Company/Title in "Review & Edit details" -> a fresh duplicate check must fire (a new POST /api/ext/v1/duplicates/check appears in logs) and Save stays blocked/re-verified.
RUNTIME LOGS (vercel logs, 12h window, 20 entries 12:51–13:19Z): all info, ZERO 4xx/5xx; no 401/403, no extension-token errors, no duplicate API failures, no 500s, host jobquest2.vercel.app only (correct backend). Sequence: token create 201 -> /me x4, /workflow, /documents 200 -> duplicates/check x5 200 -> captures 201. Vercel MCP runtime logs API returns 403; used the CLI. Supabase logs not queried (edge_logs unavailable via connector). Security advisors unchanged from 16A-2 (INFO/WARN set only).
NOTE ON POSTING: smoke used a real jobright.ai posting chosen by the operator instead of the planned local scratch page (smoke16b/job.html); no scratch page was used.
PREVIEW/DEV: UNCHANGED | OLD SUPABASE (kwmnl…) / jobquest-dev: UNTOUCHED | ROLLBACK: AVAILABLE (dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK; DB rollback = the smoke rows/token are additive only).
GIT: docs-only commit(s) on fix/m15e-extension-connection-ui; main/development untouched.
NEXT: M15-E FINAL GO / NO-GO (needs explicit operator authorization). Open items for that decision: (1) operator to confirm the UI-level duplicate-blocked and edit-invalidation observations (or accept the automated evidence); (2) decide whether to keep or archive the smoke application; (3) post-launch hardening candidates unchanged (server-side duplicate enforcement, EXTENSION_TOKEN_ENV=live, M14 authenticated-privilege finding).

## >>> STEP 16B CHECKPOINT 1 (2026-09-30): PACKAGE BUILT + TOKEN-ENV DECISION = A (NOT_REQUIRED); AWAITING OPERATOR TOKEN/INSTALL <<<

STATUS: INTERRUPTED — SAFE TO RESUME at the operator token checkpoint. STEP 16A-3: PASS. STEP 16B: IN PROGRESS.
HANDOFF DOCS: branch fix/m15e-extension-connection-ui pushed (05c1a942..bc123a84, secret scan clean); main/development untouched.
SOURCE: app code on the branch is byte-identical to main bfa82eb5 (git diff bfa82eb5..HEAD over apps/packages/supabase/e2e = empty); tested lineage fa437ad6.
TOKEN ENV DECISION: A — NOT_REQUIRED. Source: EXTENSION_TOKEN_ENV (apps/api/src/env.ts:41, enum dev|live, default dev) only chooses the `jqx_<env>_` prefix in mintExtensionSecret (extensionTokens.ts:58). TOKEN_PATTERN /^jqx_(dev|live)_.../ and DB chk_extension_token_prefix ^jqx_(dev|live)_ accept both; auth = HMAC-SHA256(EXTENSION_TOKEN_PEPPER, whole token) lookup, so no routing/validation/security difference. Unset => dev prefix, cosmetic. No Vercel change, no redeploy. Cosmetic hardening (set live + redeploy) documented separately; NOT done. EXTENSION_ORIGINS unset => no origin restriction (extension uses host_permissions <all_urls>; CORS not needed). EXTENSION_TOKEN_PEPPER already set in Production (names only). No other Production env var required.
TOKEN CONTRACT (source): created in-app Settings -> Browser Extension (/settings/extension) "Connect a browser" -> POST /api/extension/tokens (CSRF, web session). Bound to ONE workspace (active workspace; rpc_create_extension_token checks membership). Fixed least-privilege scopes: workflow:read, documents:read, applications:duplicate_check, applications:create, profile:read (no edit/delete). Expiry choice 30/90/365 days (default 90; DB check <= 365d). Revoke: UI "Revoke" -> rpc_revoke_extension_token (immediate; extensionActor also fails on expiry, suspended user, removed membership). Replace = rotate. Raw token returned once, only the HMAC hash stored.
PACKAGE: `node apps/extension/scripts/package.mjs prod` (package:prod) built from HEAD bc123a84 (app code == main). Output apps/extension/dist/jobquest-capture-prod (+ .zip, git-ignored). zip SHA-256 3c9c7f7836aae5ed67a907e7848bec6dc7cbee11859759d737ce3fbeecb92b7e (61674 bytes). instance-preset.json = {environment: prod, instanceUrl: https://jobquest2.vercel.app}. PACKAGE SCAN: no popup.* files/manifest refs, no source maps, no token/secret/JWK/DB URL/preview or dev-project refs, no "Bookmarked", no "Save as New Application Anyway"; duplicate_override hard-coded false (sidepanel-logic.js:415). Only localhost strings are placeholder/help text and a Preview-label heuristic.
DB BASELINE (kqsx…, read-only): applications 222 | job_snapshots 89 | application_events 347 | application_documents 122 | extension_tokens 0 | 4 extension RPCs present.
PRODUCTION REDEPLOY DURING 16B: NO | ROLLBACK: AVAILABLE (dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK) | PREVIEW/DEV, OLD SUPABASE: UNCHANGED.
NEXT EXACT ACTION: operator creates the token in the Production UI, loads unpacked apps/extension/dist/jobquest-capture-prod, pastes token in extension Settings, tests connection, returns TOKEN CREATED / EXTENSION INSTALLED / CONNECTION TEST. Agent then verifies read-only (token row workspace/scopes/last_used_at) and drives capture smoke against a local unique posting (scratchpad smoke16b/job.html, company "JQSmoke16B Co", title "JQ Smoke Test Engineer 16B").

## >>> STEP 16A-3 — PASS (2026-09-30 ~07:25Z): PRODUCTION CUTOVER COMPLETE; STOPPED BEFORE STEP 16B <<<

PRODUCTION: dpl_42Kq9nKyxAc1iicaMwE24NQhs3xQ (READY, production, main @ bfa82eb557c5e748ba5d7c91fe122fb8294d2313) on https://jobquest2.vercel.app | PROD SUPABASE: jobquest-prod kqsxdothjxtcktyirpux | ES256 kid 6434f760-580a-4945-aaa5-c161f568120a
SIX PROD VARS: 6/6 updated by operator | PREVIEW/DEV: UNCHANGED | OLD SUPABASE + jobquest-dev: UNTOUCHED | EXTENSION: NOT ACTIVATED
FRONTEND TARGET: PASS | SERVER TARGET: PASS — the server wrote Conan's login sessions into kqsx… auth_sessions (2 rows for user e5df8d69-…, created 07:14Z and 07:16:53Z = the two POST /api/auth/login calls at 02:14/02:16 CDT; one revoked by the logout at 02:16:31 CDT, one active).
CONAN LOGIN: PASS (operator manual; login, logout, login again) | WORKSPACE fbd661ef-…: PASS, MANAGER | APPLICATIONS visible in UI: 222 PASS; detail/search/filter/stage labels PASS; no dev/E2E workspaces.
JWT: PASS — app-minted ES256 token accepted by the new project (Conan's UI reads 222 applications through user-JWT + RLS; an unaccepted signature would return 401/0 rows). Exact kid used is inferred from the only key config that can work, not from a token dump.
RLS: PASS — Conan sees own workspace data through the app; stranger 0 rows / anon 42501 / Conan denied user_credentials proven in the 16A-2 rolled-back probe (no new mutating probe run). Supabase gateway logs not queryable via the connector (edge_logs table unavailable), so no direct 401/PGRST301 log check.
DB COUNTS (read-only, post-smoke): applications 222 | snapshots 89 | events 347 | documents 122 | 1 user | 1 workspace | 2 sessions.
RUNTIME ERRORS: NONE CRITICAL — Vercel logs for the deployment: only info entries (health, refresh, login, logout); Vercel runtime-errors API 403 (not permitted).
ROLLBACK: AVAILABLE (dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK immediate previous production deployment, rollbackCandidate=true; not used).
GIT: docs-only commits on fix/m15e-extension-connection-ui, local/unpushed; main/development untouched.
NEXT: STEP 16B — PRODUCTION EXTENSION ACTIVATION (needs separate operator authorization). Do not redeploy or change Production env vars meanwhile (keep rollback intact).

## >>> STEP 16A-3 CHECKPOINTS D-G (2026-09-30 ~07:00Z): NEW DEPLOYMENT READY; FRONTEND TARGET PASS; AWAITING OPERATOR CONAN LOGIN <<<

STATUS: INTERRUPTED — SAFE TO RESUME STEP 16A-3 at the Conan login/JWT/RLS/application smoke (operator signs in manually). No further redeploy, env change or push to main is permitted.
NEW DEPLOYMENT ID: dpl_42Kq9nKyxAc1iicaMwE24NQhs3xQ | URL: https://jobquest2-i3ps9a3y7-one-piece-5779.vercel.app | target production | READY | source "redeploy" of gitSource github main sha bfa82eb557c5e748ba5d7c91fe122fb8294d2313 | created 2026-09-30T06:45:07Z (01:45 CDT). Exactly ONE new production deployment (the only production entry newer than dpl_HFVT…).
DEPLOYMENT METADATA: PASS. PRODUCTION ALIAS: PASS (jobquest2.vercel.app, jobquest2-one-piece-5779, jobquest2-git-main-… all on the new deployment).
FRONTEND TARGET: PASS — live bundle assets/index-DbUcxJVN.js embeds ONLY kqsxdothjxtcktyirpux.supabase.co + the expected sb_publishable key; kwmnljvyvqvbvimypnmw ABSENT; xpnkasclquplmrcmhsif ABSENT; no literal sb_secret_ key, no JWT-shaped strings. (An earlier scan that showed both hosts was contaminated by stale local temp files and a malformed URL; the clean re-scan above is authoritative.)
BASIC HEALTH: PASS — GET / 200, JS/CSS assets 200, /api/health 200 {"status":"ok"} (/health is the SPA shell path; API is /api/health). Runtime logs for the new deployment: 3 info entries (health + 2 POST /api/auth/refresh from the operator browser), no errors. Vercel MCP runtime-errors 403 (not permitted).
SERVER TARGET: NOT YET PROVEN — no unauthenticated DB-backed route exists; proof = successful Conan login (server must read Conan's row in kqsx… with the new secret key and sign with the new JWK) + JWT accepted by RLS.
ES256/JWT/RLS/CONAN LOGIN/APPLICATIONS/SESSION: NOT YET RUN.
PREVIEW/DEV: UNCHANGED (11 non-production env rows, latest updatedAt 2026-09-29T17:43Z = pre-existing REGISTER_IP_MAX_PER_HOUR). Only the six Production variables were updated after 06:00Z.
ROLLBACK: AVAILABLE — dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK READY, isRollbackCandidate=true, immediate previous production deployment. Command: vercel rollback dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK --scope one-piece-5779 (Hobby: previous deployment only). After a rollback auto-assign is off; undo with `vercel promote`.
PRODUCTION EXTENSION: NOT ACTIVATED | OLD SUPABASE / jobquest-dev: UNTOUCHED
LOCAL DOC COMMIT 89fb09fb (checkpoint C+) is local/unpushed; this checkpoint is committed on top; nothing pushed to main/development.
NEXT EXACT ACTION: operator opens https://jobquest2.vercel.app, signs in as Conan manually, reports result; agent then verifies session/JWT/RLS via Supabase logs + read-only SQL, application smoke (222/89/347/122), logout/login.

## >>> STEP 16A-3 CHECKPOINT C+ (2026-09-30 ~06:45Z): SIX PROD VARS UPDATED BY OPERATOR; REDEPLOY SOURCE VERIFIED; AWAITING OPERATOR REDEPLOY <<<

STATUS: INTERRUPTED — SAFE TO RESUME STEP 16A-3 (waiting for the operator's single Production redeploy). Supersedes the "env cutover NOT STARTED" line below.
SIX ENV VARS: UPDATED by operator (Dashboard) — Vercel API metadata (values filtered) shows Production updatedAt: SUPABASE_URL 06:27:23Z, VITE_SUPABASE_URL 06:27:50Z, SUPABASE_PUBLISHABLE_KEY 06:28:26Z, VITE_SUPABASE_PUBLISHABLE_KEY 06:28:49Z, SUPABASE_SECRET_KEY 06:30:19Z, JQ_JWT_PRIVATE_JWK 06:32:43Z. The four now-`sensitive` values cannot be read back (by design) => their correctness is proven only by the post-redeploy smoke. Value-verified via clean `vercel env run`: VITE_SUPABASE_URL host = kqsxdothjxtcktyirpux.supabase.co; VITE_SUPABASE_PUBLISHABLE_KEY = the expected new sb_publishable key. No other Production variable changed; all other rows untouched.
PREVIEW/DEV: UNCHANGED (rows last updated 2026-09-24/27; separate Preview,Development entries).
REDEPLOY SOURCE: VERIFIED — dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK: target production, READY, source git, github main, sha bfa82eb557c5e748ba5d7c91fe122fb8294d2313, created 2026-09-30T02:25:44Z, serves jobquest2.vercel.app (+ jobquest2-one-piece-5779, jobquest2-git-main-…), isRollbackCandidate=true, newest production deployment. origin/main re-verified = bfa82eb5.
ROLLBACK: AVAILABLE (dpl_HFVT… stays the immediate predecessor only if exactly ONE new production deployment is created; no push to main).
NEW DEPLOYMENT: NOT YET CREATED | FRONTEND/SERVER TARGET: not yet verified | CONAN LOGIN / JWT / RLS / APPLICATIONS: not yet run | PRODUCTION EXTENSION: NOT ACTIVATED
NEXT EXACT ACTION: operator redeploys dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK to Production ONCE (Dashboard; build cache OFF) and returns "NEW DEPLOYMENT ID: <id> / STATUS: READY"; then agent verifies target/SHA/alias, bundle (kqsx…), server target, health, and runs the Conan smoke with the operator signing in manually.

## >>> STEP 16A-3 (Vercel Production Cutover) — INTERRUPTED BEFORE ENV MUTATION; SAFE TO RESUME <<<

STATUS: INTERRUPTED — SAFE TO RESUME STEP 16A-3 (2026-09-30). No Vercel variable changed, no redeploy started.
LAST COMPLETED CHECKPOINTS: A (rollback verified) + B (env snapshot) + pre-cutover DB/JWKS/owner verification.
PRODUCTION DEPLOYMENT: dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK (old, unchanged; jobquest2.vercel.app alias; bundle embeds kwmnljvyvqvbvimypnmw + sb_publishable_ key form)
PRODUCTION SHA: bfa82eb557c5e748ba5d7c91fe122fb8294d2313 (origin/main re-verified; origin/development 1ed8fdd1)
PROD SUPABASE REF (target): kqsxdothjxtcktyirpux — ACTIVE_HEALTHY; 19 migrations; 222 apps / 89 snapshots / 347 events / 122 docs; JWKS lists kid 6434f760-580a-4945-aaa5-c161f568120a (ES256/EC/P-256, no private member)
OWNER: user_accounts.user_id = e5df8d69-9a8a-4fe1-a81d-af996c67bac6 (Conan, ACTIVE) = workspace_members.user_id (MANAGER, ws fbd661ef-…) = owner of all 222 applications. NOTE: user_accounts.id (db552c5c-…) is the row PK, NOT the user id; an earlier session misread it as a conflict. Docs were correct.
ROLLBACK (Checkpoint A): PROVEN from Vercel docs (instant-rollback): rollback restores the previous build; "Vercel won't update environment variables if you change them in project settings"; env vars remain in original state. Old Secret values therefore need not be readable. HOBBY PLAN CONSTRAINT: only the IMMEDIATELY PREVIOUS production deployment is rollback-eligible => the cutover must create exactly ONE new production deployment (dpl_HFVT… must stay its predecessor). Never push to main during the window. After rollback, auto-assign of production domains is OFF (undo via `vercel promote <id>`).
   Rollback command: `vercel rollback dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK --scope one-piece-5779` (or Dashboard Instant Rollback). Also revert the six Production vars (old secret values only if operator has vault copies) so a later redeploy is not silently on the new project.
ENV SNAPSHOT (Checkpoint B, via `vercel env ls`, names/types only; project prj_0A32SVkbOH2fBI2XLFv7kSkv086d, team team_lsStfTKp3LGQEWGYRM0BJ4Pb / one-piece-5779):
   Production-only entries (separate rows from Preview/Development): JQ_JWT_PRIVATE_JWK Secret; SUPABASE_URL Secret; SUPABASE_SECRET_KEY Secret; SUPABASE_PUBLISHABLE_KEY Secret; VITE_SUPABASE_URL Config; VITE_SUPABASE_PUBLISHABLE_KEY Config; also (NOT part of cutover, untouched) REGISTER_IP_MAX_PER_HOUR Secret, EXTENSION_TOKEN_PEPPER Secret, NODE_OPTIONS/APP_ORIGINS/JQ_JWT_ISSUER Config.
   Preview/Development-only rows (unchanged; jobquest-dev): the same six names as separate Preview,Development entries.
   Old readable non-secret facts: frontend host kwmnljvyvqvbvimypnmw.supabase.co (from live bundle index-CGS7DZPG.js).
ENV CUTOVER: NOT STARTED. Attempt to run `vercel env update <name> production` from the agent shell for the 4 non-secret vars (SUPABASE_URL, VITE_SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PUBLISHABLE_KEY) was DENIED by the session permission classifier ("Production Deploy"); not retried by another route.
REDEPLOY: NOT STARTED | FRONTEND TARGET: old (kwmnl…) | SERVER TARGET: unverified/old | AUTH SMOKE / APPLICATION SMOKE: NOT RUN | PRODUCTION EXTENSION: NOT ACTIVATED
NEXT EXACT ACTION: operator either (a) grants the agent permission for Production env updates + `vercel deploy`/redeploy of the exact main SHA, or (b) performs them: set six Production-only vars (URL/publishable values = new project; SUPABASE_SECRET_KEY and JQ_JWT_PRIVATE_JWK entered by operator only) -> exactly one production redeploy of bfa82eb5 -> agent resumes at frontend/server target verification and smoke.

## >>> STEP 16A-2 (Build New Production DB + Application-Domain Import) — COMPLETE; ES256 READY_NEW_KEY; STEP 16A-3 READY (not started) <<<

STATUS: STEP 16A-2 COMPLETE (2026-09-30). The clean production database is built, imported, verified and reconciled. Vercel cutover (Step 16A-3) has NOT started and is BLOCKED on one operator Dashboard action (ES256 key, below). Full report: migration-upgrade/m15/STEP16A2_NEW_PRODUCTION_DATABASE_REPORT.md
NEW PROD PROJECT: jobquest-prod | REF: kqsxdothjxtcktyirpux | REGION: us-east-1 | ORG: OnePiece2.0 (fisaxwdkkdpbamvwkvnm)
OWNER: Conan (operator-created via bootstrap-prod-owner.ts; password/recovery codes never seen by the agent) | OWNER USER ID: e5df8d69-9a8a-4fe1-a81d-af996c67bac6 | WORKSPACE ID: fbd661ef-36ef-4c19-aae1-e4a477ac79a5 (PERSONAL, Conan = ACTIVE MANAGER)
SCHEMA: 19/19 migrations | RLS: 0 public tables without RLS, 0 unvalidated public constraints | SECURITY ADVISORS: same set as jobquest-dev (INFO/WARN only; M14 authenticated-privilege finding remains a post-launch hardening candidate)
IMPORT STATUS: COMPLETE. SOURCE 222 | IMPORTED 222 | SNAPSHOTS 89 | EVENTS 347 (CREATED 222, CAPTURED 89, STAGE_CHANGED 2, OUTCOME_CHANGED 34) | LABEL DOCUMENTS 122 | ID MAPPINGS 222 | COMPANIES 0
   (347, not the old 533: the M15-D tool double-counted a synthetic event per application — intentional corrected transformation.)
PROBABLE DUPLICATES: 8 rows / 4 groups retained, none dropped (legacy ids [19,78] [31,80] [118,210] [212,213]); EXACT DUPLICATES 0 | QUARANTINED 0
RECONCILIATION: applications fp 451ed7f53a242bed1bbc0817afe62f51 MATCH | snapshots fp 527ce31d916b2e1fe9e823d2df71f464 MATCH | documents fp 6f2b0c900ab61cd14885b54d6dd9d8dd MATCH. All verify.sql rows PASS (see report §9 for the two findings and their resolution).
OWNERSHIP/ISOLATION: 222/222 applications user_id=Conan in the single workspace; RLS probe (rolled back): stranger 0 rows, anon denied (42501), Conan with an active session sees 222/89/347/122 and is denied user_credentials/auth_recovery_codes.
LEGACY AUTH DATA MIGRATED: 0 (users 1 = Conan only; 0 legacy_user_id, 0 claim codes, 0 extension tokens, 0 refresh tokens, 0 rate limits, 0 leftover sessions).
OLD PROJECT kwmnl…: UNTOUCHED | DEV PROJECT xpnk…: UNTOUCHED | VERCEL: UNCHANGED, CUTOVER NOT STARTED | PRODUCTION APP: STILL ON OLD CONFIG
ES256 KEY CONFIG: ES256 Classification: READY_NEW_KEY. Verified 2026-09-30 on the public JWKS of kqsx…: kid 6434f760-580a-4945-aaa5-c161f568120a (kty EC, crv P-256, alg ES256, use sig, no private member) is registered alongside Supabase default kid bcdd6db8-… (previously used, not revoked). This is a NEW key, not the historical 48e903e8-… key.
CURRENT COMMIT: see git log on fix/m15e-extension-connection-ui (docs + tools only; no app code changed)
JQ_JWT_PRIVATE_JWK Vercel Change Required: YES — Step 16A-3 MUST replace Vercel Production JQ_JWT_PRIVATE_JWK with the exact private JWK matching kid 6434f760-… (held by the operator; never pasted to the agent), in addition to the five Supabase variables (SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY). Production scope only; Preview/Development untouched. Rollback must therefore restore the OLD JQ_JWT_PRIVATE_JWK too (vault snapshot before change).
STEP 16A-3: READY but NOT STARTED — needs a fresh explicit operator authorization. NEXT EXACT ACTION: operator authorizes 16A-3 -> vault snapshot of the six old Production values -> replace the six Production-only variables -> redeploy exact main SHA -> smoke as Conan.
IF INTERRUPTED: STEP 16A-2 IS DONE; do not re-run batches. If anything is in doubt run test-results/step16a2/sql/verify.sql (regenerate with the importer; ignore the platform-owned realtime.messages constraint in the unvalidated_constraints row).

## >>> STEP 16A-0 (Production Backend Reality Check) — COMPLETE (read-only); AWAITING OPERATOR <<<

STATUS: COMPLETE — SAFE TO RESUME. Full report: migration-upgrade/m15/STEP16A0_PRODUCTION_BACKEND_REALITY_CHECK.md
CURRENT PHASE: M15-E / Step 16A-0
CURRENT SUBTASK: Production backend reality check
PRODUCTION APP SHA: bfa82eb557c5e748ba5d7c91fe122fb8294d2313 (origin/main verified; origin/development 1ed8fdd1)
PRODUCTION DEPLOYMENT: dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK (target=production, READY, git main bfa82eb5; GET / = 200)
ASSUMED jobquest-prod: DISPUTED — operator states it was NEVER CREATED (2026-09-29). NOT settled: contradicted by evidence below; treat kwmnljvyvqvbvimypnmw as UNVERIFIED, do not access/migrate it, do not auto-create a project.
ACTUAL FRONTEND SUPABASE: https://kwmnljvyvqvbvimypnmw.supabase.co (ref kwmnljvyvqvbvimypnmw) — embedded in the live prod bundle assets/index-CGS7DZPG.js and in the 2026-09-28 vercel env pull. NOT jobquest-dev.
ACTUAL SERVER SUPABASE: UNKNOWN (SUPABASE_URL is a Vercel Sensitive var; Vercel MCP project/env endpoints 404; not decrypted)
FRONTEND/SERVER MATCH: UNKNOWN
ACTUAL LIVE DB: UNKNOWN (frontend -> kwmnljvyvqvbvimypnmw; existence unverifiable: Supabase connector sees only jobquest-dev)
PREVIEW DB: jobquest-dev xpnkasclquplmrcmhsif (per Phase 11 record; not re-verified)
PRODUCTION/DEV DB SHARED: UNKNOWN for server; frontend NO
CLAIM MIGRATION 20261021100000: NOT APPLIED on jobquest-dev (verified, 18 migrations through M14); UNKNOWN on the prod target (2026-09-28 dump suggests not applied)
CLAIM RPC: MISSING on jobquest-dev (verified); UNKNOWN on prod target (absent from 2026-09-28 dump)
LIVE DATA LOCATION: NOT jobquest-dev (migrated workspace 018f0000-…0001, jack, claim codes, migration_batches = 0 there; dev holds 393 ws / 292 users / 319 apps of test data). Last known good copy: _secure-backups/jobquest-prod/20260928_122000/*.dump (SHA-256 75aa9002…2551 verified) + _secure-backups/jobquest1/20260928_120500/legacy_neon_export_*.json
DEDICATED PROD PROJECT REQUIRED: UNKNOWN — YES if kwmnljvyvqvbvimypnmw does not exist (operator's assertion); NO if it exists under another Supabase login
CASE: D (leaning B). Case A refuted for frontend.
ENV SEPARATION RISK: MEDIUM (HIGH if project absent or if server SUPABASE_URL = jobquest-dev)
PRODUCTION WRITES PERFORMED: NONE
NEXT EXACT ACTION (operator, read-only): confirm in the Supabase dashboard(s) whether project kwmnljvyvqvbvimypnmw exists and under which login; report the host in vaulted SUPABASE_PROD_DB_URL and whether Vercel Production SUPABASE_URL matches VITE_SUPABASE_URL. Then: exists -> grant connector access/run Q1-Q8 and do 16A-2 as prepared; absent -> Step 16A-2 (CREATE REAL PRODUCTION SUPABASE PROJECT AND PREPARE CONTROLLED DATA CUTOVER) per report sections 8-11.
NOTE: deviation from instruction — the "never created" statement is recorded as DISPUTED/UNRECONCILED rather than SUPERSEDED because this session found a real checksum-matching dump and a prod frontend pointing at that ref.

## >>> STEP 16A-1 (Production Reconciliation) — BLOCKED ON PROD DB ACCESS; PLAN PREPARED <<<
(Annotation 2026-09-29: every "jobquest-prod / kwmnljvyvqvbvimypnmw" statement below and in the M15 reports is DISPUTED by the operator — see Step 16A-0 above. History preserved.)

STATUS: PARTIAL — repo/Vercel reconciliation done; production DB could NOT be inspected. SAFE TO RESUME.
CURRENT PHASE: M15-E / Step 16A-1
CURRENT SUBTASK: Production reconciliation blocked on authorized read access / awaiting operator
MAIN SHA: bfa82eb557c5e748ba5d7c91fe122fb8294d2313 (origin/main verified; origin/development 1ed8fdd1)
PRODUCTION DEPLOYMENT: dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK — re-verified via Vercel MCP: target=production, READY, source=git, meta SHA bfa82eb5, aliases incl. jobquest2.vercel.app. GET / = 200. Unchanged since Step 15.5.
PRODUCTION SHA: bfa82eb557c5e748ba5d7c91fe122fb8294d2313
PRODUCTION DB ACCESS: BLOCKED — Supabase MCP get_project/list_migrations/execute_sql on kwmnljvyvqvbvimypnmw return "permission denied"; list_projects shows ONLY jobquest-dev (xpnkasclquplmrcmhsif) in org OnePiece2.0 (jobquest-prod is not visible to this connector's account); supabase CLI/psql not installed; no SUPABASE*/DATABASE*/PG* env vars in the shell. Prod DB URL lives in the operator vault (SUPABASE_PROD_DB_URL) and was not requested/used. Vercel runtime logs/errors also 403 via MCP (log check NOT DONE).
CLAIM MIGRATION 20261021100000: UNKNOWN (handoff records NOT applied; unverified)
APP <-> DB CLAIM COMPATIBILITY: UNKNOWN (code contract analyzed below; prod function unread)
MIGRATED USER STATE: UNKNOWN (not read). Expected jack / 46ddc7bf-... / STAGED / ws 018f0000-...0001 / MANAGER. NOTE: workspace_members has NO status column in schema (role only) — "MANAGER/ACTIVE" in prior notes = role MANAGER; there is no membership state field.
DB ACTION REQUIRED: UNKNOWN (working assumption B: APPLY_MIGRATION_20261021100000_ONLY — unverified)
CLAIM CODE REISSUE: REQUIRED (old code is stale-format; independent of DB inspection) — PENDING AUTHORIZATION
PRODUCTION EXTENSION: NOT REQUIRED IN 16A-2 (belongs to a later 16B after core claim smoke)
PRODUCTION WRITES PERFORMED: NONE
BLOCKERS: prod DB read access. Options: (a) add jobquest-prod to the Supabase MCP connector account; (b) operator runs migration-upgrade/m15/STEP16A1_READONLY_PROD_QUERIES.sql (SELECT-only, Q1-Q8) in Supabase SQL editor and pastes results; (c) operator exports a read-only pooler URL into the session env (never pasted in chat).
NEXT EXACT READ-ONLY ACTION: obtain Q1-Q8 output (or MCP access), then classify DB_ACTION and finalize 16A-2 plan.

### Claim contract (repo, verified by reading code)
- Route: POST /auth/claim (apps/api/src/routes/auth.ts:318). Body {username, code, new_password}. Order: IP rate limit -> password policy -> account lookup by username_clean -> locked_until check -> select legacy_claim_codes by (user_id, code_hint = first 4 chars, claimed_at is null) -> verifyCode (Argon2id) -> rpc_record_auth_failure on miss -> rpc_claim_legacy_account -> startSession.
- RPC: public.rpc_claim_legacy_account(p_user_id uuid, p_code_id uuid, p_new_hash text, p_ip inet) returns void; SECURITY DEFINER, search_path=''; service_role only (revoked from public/anon/authenticated). Atomic in one plpgsql body: (1) consume code (claimed_at null, unexpired, user match) else CLAIM_CODE_INVALID_OR_USED; (2) upsert user_credentials; (3) revoke sessions (RECOVERY); (4) STAGED->ACTIVE only, else ACCOUNT_NOT_CLAIMABLE (suspended cannot self-reactivate; exception rolls back the whole call incl. code consumption).
- FAILURE MODE if RPC missing on prod: rpc error -> route returns generic 401 INVALID_CLAIM (no crash, no consumed code, no data change). So the live app is safe but the claim path cannot succeed. Not a data-risk; a functionality gap.
- Code format: Crockford Base32, 32 chars (160 bit), 4-char clear hint, Argon2id (m=19456,t=2,p=1). Generator scripts/migrate-legacy-data.mjs generateClaimCode() (corrected). legacy_claim_codes has UNIQUE(user_id) => reissue must UPDATE the single row, not INSERT. No rpc_reissue_claim_code exists in migrations (only mentioned in POST_LAUNCH_STABILIZATION_PLAN) and no reissue script exists.

### Migration 20261021100000 safety review (repo-only): RISK LOW
CREATE OR REPLACE FUNCTION + REVOKE/GRANT only. No table DDL, no locks beyond brief catalog lock, no data mutation/backfill, no RLS change. Depends on tables user_credentials, auth_sessions, user_accounts, legacy_claim_codes (all earlier migrations). Cannot alter existing rows. Compatible with live app (function name/args match auth.ts). Single-file execution is one transaction => partial application not expected. Rollback: if function did not pre-exist, DROP FUNCTION public.rpc_claim_legacy_account(uuid,uuid,text,inet); if a prior definition exists, restore it from Q2 body captured BEFORE applying. Vercel rollback irrelevant (app unaffected by function presence); DB rollback independent. Caveat: apply via `supabase db push` would also apply anything else unapplied — instead apply ONLY this file and record version 20261021100000 in supabase_migrations.schema_migrations exactly as the CLI would (or use db push only after Q1 confirms it is the sole pending migration).

### Step 16A-2 proposed write ops (ALL need operator approval) — order
1. (Pre-check, read) Q1-Q8 confirm only 20261021100000 pending + user STAGED + no claimed code row.
2. WRITE: apply migration 20261021100000 only (function create/replace + grants) + migration-history row.
3. Verify (read): Q2/Q3 — signature, STAGED guard, service_role-only.
4. WRITE: reissue claim code for jack — one transaction: UPDATE legacy_claim_codes SET code_hash, code_hint, claimed_at=NULL, expires_at=now()+interval '90 days' WHERE user_id=46ddc7bf-... AND claimed_at IS NULL; guarded by account status=STAGED; plaintext printed once to operator terminal only (never file/log/chat/handoff). Needs a small one-off operator script (does not exist yet: repo change on the release branch + local tests, or inline Node using generateClaimCode) — needs decision.
5. Verify (read): Q6 hash_len/prefix ($argon2id$), claimed_at null, expires_at future, Q5 status STAGED. No plaintext.
6. Read-only app smoke, then AUTHORIZED MUTATING smoke by operator: claim jack with new code + new password -> ACTIVE, session, workspace MANAGER, app read (222 apps), replay of same code fails 401 (single-use), logout/login. Claiming consumes the code and activates the real account — operator decides whether to claim in 16A-2 or leave code for the real user. Suspended-user protection is proven by CLAIM-13 integration test; do NOT test on prod accounts.
7. Extension (NOT in 16A-2): token is minted by the claimed user in-app (/settings/extension). Prod EXTENSION_TOKEN_ENV unset => tokens are jqx_dev_ prefixed (known, documented; setting =live is a separate Vercel env change). Prod package via `node apps/extension/scripts/package.mjs prod` (instanceUrl https://jobquest2.vercel.app, popup files excluded); unpacked distribution only, no store publish. Do as 16B after core smoke.
8. Final M15-E GO decision.

### Docs
migration-upgrade/m15/STEP16A1_READONLY_PROD_QUERIES.sql added (SELECT-only). Local commit ca21ed22 (Step 15.5 docs) was UNPUSHED; pushed with this docs commit on fix/m15e-extension-connection-ui (no code change, main untouched).

## >>> STEP 15.5 COMPLETE (Read-Only Production Preflight) <<<

CURRENT PHASE: M15-E / Step 15.5 Production Preflight
MAIN SHA: bfa82eb557c5e748ba5d7c91fe122fb8294d2313 (origin/main verified)
MAIN CI: 36659797562 PASS (SHA matches; static + database jobs success)
PRODUCTION DEPLOYMENT STATE: AUTO_DEPLOYED
CURRENT PROD DEPLOYMENT ID: dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK (target=production, READY, created 2026-09-30 02:25:44Z / 21:25 CDT, build 44s)
CURRENT PROD SHA: bfa82eb557c5e748ba5d7c91fe122fb8294d2313 (Vercel project targets.production meta + GitHub deployment 6750033115 env=Production, state success)
CURRENT PROD URL: https://jobquest2.vercel.app (aliases: jobquest2.vercel.app, jobquest2-one-piece-5779.vercel.app, jobquest2-git-main-...; deployment URL jobquest2-7v1ru0miy-one-piece-5779.vercel.app)
VERCEL: project jobquest2, GitHub KrapaGoutam/JobQuest2.0, production branch main, gitProviderOptions.createDeployments=enabled (auto-deploy ON). Prior prod deployments (1d, 1d, 5d old) untouched. Preview deployments for 1ed8fdd1 (development) and 5d189a84 (this branch) are target=preview.
AVAILABILITY: GET / = 200 (SPA shell, JobQuest 2.0), hashed asset 200. No app writes.
PRODUCTION DB: UNKNOWN (not directly inspected). Supabase MCP returned permission denied for jobquest-prod (list_migrations/get_project); supabase CLI not installed. No evidence of change: Vercel git deploy does not run migrations and none were authorized.
  !! COMPAT RISK: the now-live app build includes the M15 legacy claim RPC code; migration 20261021100000_m15_legacy_claim_rpc.sql (19th) is recorded as NOT applied to prod. Claim flow on prod is presumed non-functional until Step 16 reconciles. (Not fixed here.)
PROD ENV METADATA (names only, values not read): present in Production: REGISTER_IP_MAX_PER_HOUR, NODE_OPTIONS, EXTENSION_TOKEN_PEPPER, APP_ORIGINS, JQ_JWT_ISSUER, JQ_JWT_PRIVATE_JWK, SUPABASE_SECRET_KEY, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_URL, SUPABASE_URL. Values not verifiable (secrets hidden).
REGISTER_IP_MAX_PER_HOUR: Production entry is a separate Secret scoped to Production only; the Preview/Development entry (Config, 9h ago) is scoped Development+Preview only. Production override not shared. Prod value not read.
PROD CLAIM CODE: NOT REISSUED (per handoff; DB not read)
PROD EXTENSION TOKEN: UNCHANGED (per handoff; no action taken)
PROD EXTENSION PACKAGE: UNCHANGED (not published)
JOBQUEST1: UNCHANGED (standby, not retired)
PRODUCTION WRITES PERFORMED BY THIS STEP: NONE
CORRECTION: Step 15 note "PRODUCTION: UNCHANGED" above is superseded - pushing main auto-created Production deployment dpl_HFVTYfYQnpvD6iEKyRaTwSjJecqK at 02:26Z.
BLOCKERS: prod DB state unverified (needs operator/authorized read access); migration 19 not applied vs. live code.
NEXT EXACT ACTION: Step 16A - Production Reconciliation / Completion (do not redeploy blindly; verify prod migration state first, then complete remaining ops: migration 19, claim-code reissue, smoke).

## >>> STEP 15 COMPLETE (Controlled Release Promotion) <<<

Step 13C: PASS | Final Security Review: PASS | Step 15: PASS
RELEASE CANDIDATE: fix/m15e-extension-connection-ui
TESTED APPLICATION SHA: fa437ad6f22b8c485dca62834e45a6c68756c83e
Development Promotion: PASS - merge SHA 1ed8fdd1fccdbdd8febeb3e071d0f316161df542 - CI run 36659089688 PASS (static + database)
Main Promotion: PASS - merge SHA bfa82eb557c5e748ba5d7c91fe122fb8294d2313 (tree identical to development) - CI run 36659797562 PASS (static + database)
PRODUCTION: UNCHANGED (no deploy, DB, token, claim-code action taken by Step 15)
NOTE: results recorded on the release branch to avoid a post-CI commit on main.
NEXT: Step 16 Production Change Window (requires explicit operator authorization)

## >>> ACTIVE HANDOFF (M15-E duplicate-protection final remediation) <<<
STATUS: COMPLETE - STEP 13C FINAL INDEPENDENT REVIEW PASS (Opus/High, invoked once)
CURRENT PHASE: M15-E duplicate-protection final remediation - implementation, exact-SHA CI, fresh Preview, automated Preview QA all PASS
CURRENT SUBTASK: none (stop gate reached)
BRANCH: fix/m15e-extension-connection-ui
BASE APPLICATION SHA: 1837debc8e12228a454492373191df8eb25e45de
NEW APPLICATION SHA: fa437ad6f22b8c485dca62834e45a6c68756c83e
CURRENT DOCS HEAD: docs-only commit(s) after fa437ad6 (see `git log`; NOT covered by CI)
LOCAL HEAD / REMOTE HEAD: equal after docs push (application code identical to fa437ad6)
WORKING TREE: clean after docs commit
MODIFIED FILES (app commit): apps/extension/{sidepanel.js,sidepanel-logic.js,sidepanel.html,popup.js,popup.html,tests/sidepanel-logic.test.js,tests/manifest.test.js}, e2e/m15e-extension-sidepanel.spec.ts
LAST GREEN TEST: local + Preview E2E (m11, m15e incl. package test), unit 163, extension 97, integration 186
LAST FAILED TEST: none (only the intentional old-code discrimination run)
LAST CI RUN: 36655655863 / fa437ad6f22b8c485dca62834e45a6c68756c83e / PASS (static + database)
PREVIEW URL: https://jobquest2-ev0q9h1us-one-piece-5779.vercel.app (dpl_BvNeBysZxeK6gN1nbowt1PL2gAc2) ; PREVIEW BACKEND: jobquest-dev (PREVIEW_BACKEND_IS_PRODUCTION=false)
DUPLICATE OVERRIDE UI: REMOVED
DUPLICATE_OVERRIDE TRUE PATH: REMOVED (payload field always false; deprecated compat)
FAIL-CLOSED SAVE: PASS
CROSS-TAB ISOLATION: PASS
PACKAGE LEGACY POPUP: SAFE
BLOCKERS: none. Residual for reviewer: server does not enforce duplicates on POST /captures (client gate only) - contract change, not done.
PRODUCTION STATE: UNCHANGED (Development / Main also UNCHANGED)
OPUS INVOKED: YES / RESULT: PASS (no blockers)
FINAL M15-E EXTENSION SECURITY REVIEW: PASS; B1 class ELIMINATED; B2-R CLOSED; N1 CLOSED; legacy popup CLOSED
OPERATOR MANUAL RETEST: SKIPPED BY OPERATOR; AUTOMATED EVIDENCE: SUFFICIENT FOR RELEASE
NON-BLOCKING: (1) client identity key lowercases URL query values, backend keeps them case-sensitive; gate accepts any current verdict with matching key (theoretical only) - optional hardening: accept only verdict from own checkSeq. (2) server does not enforce duplicates on POST /captures (client-only gate; pre-existing design).
NEXT EXACT ACTION: Step 15 Controlled Release Promotion (separate prompt). Do NOT merge/deploy in this session.

## Current Milestone
Milestone 15 — Production Launch & Cutover
**Phase M15-E: duplicate-protection final remediation COMPLETE. Final independent Step 13C review: PASS.**
**Gate Status: Site branch — PASS. Extension branch — prior Step 13C (on 1837debc) BLOCKED; remediated by removing the duplicate override entirely + fail-closed save. Application/tested SHA: fa437ad6f22b8c485dca62834e45a6c68756c83e. Exact CI PASS (run 36655655863). Preview https://jobquest2-ev0q9h1us-one-piece-5779.vercel.app (backend jobquest-dev). Automated Preview QA PASS. B1/N1/B2-R/legacy popup: CLOSED (independently confirmed, Step 13C PASS). Operator retest: SKIPPED BY OPERATOR. Development/Main/Production UNCHANGED.**
**Step 13C BLOCKERS (historical, addressed at fa437ad6):** CHECK_ERROR resolved to VERIFIED_SAFE; non-discriminating save/race E2E.
**NEXT EXACT ACTION:** Step 15 Controlled Release Promotion (not started).

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

## Branch: fix/m15e-extension-connection-ui (extension remediation — Step 12, 12A, 13A, & 13B-R COMPLETE)
- **Base:** `fix/m15e-site-functional-remediation` @ `0a534b45` (confirmed via `git merge-base`)
- **Branch HEAD:** Pending docs commit. **Application/tested code SHA:** `1837debc8e12228a454492373191df8eb25e45de` (CI run `36646380294` ran on this exact SHA).
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
  - Verified: Connection save/test, persistent Side Panel, Capture extraction/save, duplicate detection, dynamic workflow stages, Mini Dashboard, Analytics, Settings masked token, Themes, responsive widths, active-tab changes, restart persistence.
- **Phase 12A (Manual Capture Fallback / Parity Fix): COMPLETE — PASS**
  - Restored manual review and editing capabilities (`#edit-details-card`, `#edit-toggle-btn`, `#edit-fields-section`).
  - Interactive live updates, active tab draft isolation, async view switch race guard.
  - Local gate PASS, exact-head CI run `36631704633` PASS, Preview `dpl_GawFiRmFBswMeSQjev5MdMrjwUDX` automated QA PASS.
- **Phase 13 (Release Security Review): BLOCKED (Historical).** `release-security-reviewer` (Opus/High) found two client-side duplicate protection blockers (B1: duplicate override leakage across capture contexts; B2: stale duplicate state after Company/Title/URL edits) and non-blocking N1 (late debounce timer). Server auth and tenant isolation PASS.
- **Phase 13A (Duplicate-State Security Remediation): COMPLETE — PASS**
  - Remediated B1: Replaced module-level `bypassDuplicate` with context-isolated `duplicateState` via `initDuplicateContext(seq)` and identity-bound override authorization (`authorizeDuplicateOverride` keyed to `computeDuplicateIdentityKey`). Override cleared on successful save.
  - Remediated B2: `onIdentityChange(state, nextIdentity)` invalidates duplicate state, revokes overrides, and hides stale duplicate cards. `save()` validates against `canSafelySave(state, identity)`: blocks save and displays duplicate screen if duplicate detected (`BLOCKED_DUPLICATE`), or performs inline recheck if stale (`NEEDS_CHECK`).
  - Remediated N1: `runCaptureFlow()` clears active `duplicateTimer`. `onDuplicateCheckResult` discards results matching superseded context sequence or check sequence.
  - Local verification: 69/69 extension unit tests PASS (10 new tests), 163/163 web/api unit tests PASS, 0 lint/typecheck errors, 0 secret scan findings across 48 extension bundle files and 922 tracked files.
  - Extension packages built: `apps/extension/dist/jobquest-capture-dev` and `.zip`.
  - Exact-head CI: PASS — run `36637796079`, exact SHA `e19e9ccea4f8276ccdb9736ac5f7fa206a9c3649`, static (56s) and database (7m52s) jobs completed successfully.
  - Fresh Vercel Preview: deployment `dpl_HLLKNFCYgLJ6sGa2C93RURNR2Bhn`, URL `https://jobquest2-ccdu7i7a3-one-piece-5779.vercel.app`, target: `preview`.
  - Automated Preview QA: `e2e/m15e-extension-sidepanel.spec.ts` PASS (54.0s) and `e2e/m11-extension.spec.ts` PASS (24.9s) against live Preview.
- **Phase 14 (Operator Manual Extension QA): PASS (operator-reported).** Focused retest of B1/B2/N1 + normal capture on Preview `https://jobquest2-ccdu7i7a3-one-piece-5779.vercel.app` (SHA `e19e9cce`).
- **Phase 13B (Focused Opus Blocker-Closure Review): BLOCKED (Historical).** `release-security-reviewer` (Opus/High) invoked ONCE over `e90ef9af...e19e9cce`. Confirmed B1 CLOSED, N1 CLOSED, identified residual B2-R save-time duplicate race and legacy popup packaging risk.
- **Phase 13B-R (Targeted Security Remediation: B2-R & Legacy Popup Package): COMPLETE — PASS**
  - Remediated B2-R: Fail-closed save gate via `evaluateSaveGate` in `sidepanel-logic.js` wired into `save()` in `sidepanel.js`. If duplicate check is stale or needs check, runs/awaits recheck; if recheck is discarded/superseded or produces unresolved status, save aborts/blocks and displays banner warning rather than sending an unverified write. If duplicate detected, displays duplicate screen. If `warnOnDuplicates=false`, proceeds directly without requiring duplicate freshness.
  - Remediated Context Isolation: Bound save operation and UI mutations to immutable snapshot token (`saveSeq`, `saveTabId`, `saveIdentityKey`) verified via `isSaveContextValid`. Job A async completion never mutates Job B's UI, does not reset Job B's duplicate state, and does not render 'saved' across jobs.
  - Closed Override Timing Window: `authorizeDuplicateOverride` requires `!state.isStale && state.checkedKey === computeDuplicateIdentityKey(identity)`, preventing override grant during in-flight debounce window.
  - Remediated Legacy Popup Package: Replaced module-level boolean `bypassDuplicate` in `apps/extension/popup.js` with identity-keyed `overrideIdentityKey` that is cleared on initialization, save, and capture-another. Excluded `popup.html`, `popup.css`, and `popup.js` from production packages in `apps/extension/scripts/package.mjs` while retaining them for dev/test (`e2e/m11-extension.spec.ts`).
  - Local verification: 80/80 extension unit tests PASS (11 new tests), 163/163 web/api unit tests PASS, 0 lint errors, 0 typecheck errors, 0 secret scan findings across 45 extension bundle files and 922 tracked files.
  - Extension packages built: `apps/extension/dist/jobquest-capture-dev` and `.zip`, `jobquest-capture-prod` and `.zip`.
  - Exact-head CI: PASS — run `36646380294`, exact SHA `1837debc8e12228a454492373191df8eb25e45de`, static (35s) and database (6m30s) jobs completed successfully.
  - Fresh Vercel Preview: deployment `dpl_9ERvaJBVg5xoGKuojTAGRLTiaf3L`, URL `https://jobquest2-ae69dyczb-one-piece-5779.vercel.app`, target: `preview`.
  - Automated Preview QA: `e2e/m15e-extension-sidepanel.spec.ts` PASS (59.9s) and `e2e/m11-extension.spec.ts` PASS (27.6s) against live Preview.
  - Full detail: `M15E_EXTENSION_EXECUTION_CHECKLIST.md` (Step 13B-R) and `EXTENSION_CLOSEOUT_REPORT.md`.


## Cross-cutting / unchanged by either branch
- **Main HEAD Commit:** Pending PR Merge
- **Vercel Production Deployment:** unchanged this session.
- **Production Supabase DB:** `jobquest-prod` (`kwmnljvyvqvbvimypnmw`, AWS `us-east-1`) — **[DISPUTED 2026-09-29: operator states never created; UNRECONCILED, see Step 16A-0]**
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
**TARGETED REMEDIATION REQUIRED (Step 13B BLOCKED on B2-R).** A separate remediation prompt should: fix B2-R in `apps/extension/sidepanel.js` (record `saveSeq = captureRequestSeq` at `save()` start; after the recheck abort and re-render if the context changed or if `warnOnDuplicates && !canSave`; reset `duplicateState` at `:709` only when the context is unchanged; keep `warnOnDuplicates=false` saving); close the ≤350 ms override-grant window; remove `popup.html`/`popup.js` from the package or apply the same fix; add save-path tests (superseded/ignored recheck, edit-then-save inside the debounce window, tab switch during recheck) and make the N1 E2E assertion non-vacuous; then targeted → regression → new SHA → exact-head CI → new Preview → operator retest; decide whether a further focused review is required. No merge to development/main and no production action until then.

*(Historical — the Step 13A operator retest below was executed and reported PASS against `e19e9cce`.)*
Focused manual retest of the unpacked extension against the Step 13A Preview deployment:

- **Preview Deployment:** `https://jobquest2-ccdu7i7a3-one-piece-5779.vercel.app` (`dpl_HLLKNFCYgLJ6sGa2C93RURNR2Bhn`)
- **Unpacked Extension Path:** `apps/extension/dist/jobquest-capture-dev`
- **Focused Duplicate Verification Scenarios:**
  1. **B1 Override Isolation Test:**
     - Open Job A (an existing duplicate job). Click "Save as New Application Anyway".
     - Switch to Job B (another existing duplicate job in another tab).
     - Verify: Job B displays the duplicate warning screen and does NOT inherit Job A's override. Primary button does NOT say "Save to JobQuest".
  2. **B2 Post-Check Edit Re-evaluation Test:**
     - Open a fresh job listing that is NOT a duplicate (e.g. Acme Corp / New Role).
     - Expand "Review & Edit details" (`#edit-toggle-btn`).
     - Edit Company and Title to match an already-saved application in your workspace.
     - Verify: The duplicate warning screen is immediately triggered and duplicate status card appears. The primary button is blocked from saving as normal.
     - Attempting to save without explicit override is blocked.
  3. **N1 Tab Switch Race Test:**
     - In Job A, type in the Company field and immediately switch to Job B tab before the 350 ms debounce fires.
     - Verify: Job A's late duplicate result does not overwrite Job B's capture state.

After operator confirms PASS on this focused duplicate retest:
- **Step 13B:** Focused Claude Opus / High independent security review on the exact remediation delta to confirm closure of B1 and B2.
- **Promotion & Cutover:** Merges to `development` and `main`, production deployment, and production verification remain strictly paused until separately authorized.

## JobQuest 2.1-E Implementation
**Branch:** `feature/2.1e-extension-ai-job-json`
**Status:** Completed and ready for CI/merge

Work accomplished:
1. Enhanced extension extractor (`generic.js`) to capture `responsibilities`, `requirements`, and `skills` as structured lists natively parsed from standard headings.
2. Verified database schema support: `rpc_extension_capture` and `job_snapshots` implicitly support the new fields in `raw_payload`.
3. Created a canonical serializer `ai-job-json` across both the extension and web app to ensure consistent, non-leaky JSON output for AI tailoring.
4. Added UI actions ("Copy Job JSON") to both the extension side panel and the web app's Application Detail Drawer.
5. Added rigorous unit tests ensuring payload structure correctness and null-safety.
6. Workspace typechecks cleanly. Ready for branch CI and merge to `development`.
