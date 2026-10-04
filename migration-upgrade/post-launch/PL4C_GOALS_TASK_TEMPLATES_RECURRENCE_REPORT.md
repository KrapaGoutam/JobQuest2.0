# PL-4C — Configurable Goals, Global Task Templates, and Recurrence Enhancements

Date: 2026-10-04

Branch: `feature/pl4c-goals-task-templates-recurrence`

Development baseline: `dfa5a59b6619d12e319fe82b316be2339280f673`

Main baseline: `bfa82eb557c5e748ba5d7c91fe122fb8294d2313`

## Status

PL-4C is formally closed. Implementation, jobquest-dev migration and verification, exact feature certification, matching Preview acceptance, operator-approved no-ff development integration, and exact development CI all passed. Main and Production remain unchanged.

## Implementation

- Normalized goals into independently configurable `APPLICATIONS`, `NETWORKING`, `FOLLOW_UPS`, and `INTERVIEW_PREP` metrics with daily, weekly, or monthly periods, effective dating, immutable closed history, enable/disable behavior, exact canonical progress, and manager-authorized configuration.
- Preserved legacy goal fields and compatibility RPCs while adding `rpc_set_goal_for_user` and `rpc_get_goal_progress`.
- Added owner-scoped reusable task-template definitions, manager visibility, audited management, and `rpc_apply_task_template`. Applying a template creates an independent canonical task; reapplying intentionally creates another independent task.
- Extended the existing recurrence engine with intervals, ISO weekdays, end dates, occurrence limits, and occurrence numbers while retaining existing presets, unique-parent protection, concurrency safety, and undo behavior.
- Added goal management/history UI, a Settings template manager, an application template preview/apply flow, and configurable recurrence controls.
- Updated dashboard, analytics, extension statistics, exports, and legacy migration compatibility to consume the normalized model.

## Database and security impact

- Migration: `supabase/migrations/20261022100000_pl4c_goals_task_templates_recurrence.sql`
- Authorized predecessor: `supabase/migrations/20261021100000_m15_legacy_claim_rpc.sql`
- Remote target: `jobquest-dev` (`xpnkasclquplmrcmhsif`) only.
- Both migrations were applied in canonical order with the Supabase CLI; the post-push migration list shows local/remote alignment through `20261022100000`.
- Remote catalog verification passed for RLS, policies, columns, constraints/indexes, and RPC grants. Anonymous execution is denied; the M15 claim RPC remains service-role-only; approved PL-4C RPCs are authenticated/service-role callable.
- Focused remote functional verification passed `5/5`: all four goal metrics, owner/peer/manager/foreign authorization, independent template-created tasks, recurrence intervals/weekdays/limits/end dates, and concurrency.
- Production/jobquest-prod was not queried, migrated, or changed.

## Local certification reused

The operator explicitly accepted the already-completed local certification. No source, test, or migration file changed after authorization, so the full local suites were not redundantly repeated.

- lint: PASS
- TypeScript: PASS
- unit: `179/179` PASS
- integration: `192/192` PASS
- extension: `97/97` PASS
- full browser E2E and axe: `23/23` PASS
- build: PASS (existing chunk-size advisory only)
- fresh migration and M15→PL-4C upgrade path: PASS
- RLS/grants, recurrence concurrency, responsive/axe, compatibility, and secret scans: PASS
- tracked secret scan: 960 files, zero findings
- database lint: only two pre-existing warnings; no PL-4C warning

The only post-authorization database test was the focused `5/5` jobquest-dev integration file because the remote environment had changed.

## Exact-SHA CI

- Application/test SHA: `eff714e2564391953638e7a7fa2cf7ed729ed71a`
- Run: `37181003327` — **PASS**
- Result: change classification; lint; typecheck; `179/179` unit tests; build; secret scans; disposable migrations; `192/192` integration tests; `97/97` extension tests; `23/23` browser E2E plus axe; sanitized evidence upload; cleanup — all passed.

Final feature SHA `5e49b966561cdced327d33a6dd6b936bd5cec1e8` passed exact feature CI run `37181949107`. That documentation-only tip directly follows the application-certified SHA.

## Preview evidence

- URL: `https://jobquest2-gnmajdb53-one-piece-5779.vercel.app`
- Deployment: `dpl_4oRca2xD5zSdq5TccycvD71gxTNp`
- Target/status: `preview` / `READY`
- Team/project: `one-piece-5779` / `jobquest2`
- Application SHA: `eff714e2564391953638e7a7fa2cf7ed729ed71a`
- `/api/health`: HTTP 200
- Backend binding: the compiled browser bundle contains jobquest-dev ref `xpnkasclquplmrcmhsif` and excludes the recorded Production ref.
- Focused authenticated acceptance: `2/2` PASS in 1.3 minutes against jobquest-dev.
- Goals: add/configure/type/target/period/effective-date/progress/history and manager behavior passed.
- Templates: create/manage, preview/apply to an application, and normal independent task behavior passed.
- Recurrence: representative configurable interval/weekday/end behavior and generated task flow passed.
- Responsive/accessibility: focused mobile layout and axe coverage passed with no reported violations.

## Promotion state

Application-certified SHA: `eff714e2564391953638e7a7fa2cf7ed729ed71a`

Application CI: `37181003327` — PASS

Final feature SHA: `5e49b966561cdced327d33a6dd6b936bd5cec1e8`

Feature CI: `37181949107` — PASS

Development merge: `50a1a13d291da20ada18e4b4bbaaadc9fd54401b` — operator-approved no-ff merge with parents `dfa5a59b6619d12e319fe82b316be2339280f673` and `5e49b966561cdced327d33a6dd6b936bd5cec1e8`

Development CI: `37182554528` — PASS

Development: `50a1a13d291da20ada18e4b4bbaaadc9fd54401b` — PL-4C INTEGRATED AND CERTIFIED

Main: `bfa82eb557c5e748ba5d7c91fe122fb8294d2313` — UNCHANGED

Production/jobquest-prod: UNCHANGED; Production migration/deployment: NO

PL-1D: DEFERRED / TBD — UNCHANGED

Status: PL-4C formally closed. This post-development-CI closeout metadata remains intentionally unstaged so it does not create a new untested development SHA.

Next action (updated by the operator's scheduling decision): M15-F preflight and controlled Production release precede PL-5. PL-5 is deferred, not cancelled or started. Legacy retirement remains separately authorized.
