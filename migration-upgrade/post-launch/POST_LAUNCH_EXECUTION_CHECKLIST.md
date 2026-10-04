# Post-Launch Execution Checklist

Use one copy of this task record for every approved phase task. It is the exact-resume contract; unknown values remain `TBD`, never inferred.

## Required task record

| Field | Record |
| --- | --- |
| TASK ID / STATUS | `TBD` / `SELECTED` |
| Branch / base SHA / current HEAD / remote HEAD | `TBD` |
| Last tested application SHA | `TBD` |
| CI run / CI SHA / CI result | `TBD` |
| Preview / database target / migrations | `TBD` |
| Production touched / development merged / main merged | `NO / NO / NO` unless evidenced |
| Last completed action | `TBD` |
| Next exact action | `TBD` |
| Blockers / open questions | `None known / TBD` |
| Operator approval status | `Required before work` |
| Report document | `TBD` |

## Current task record — M15-F Final Production Release + Stabilization

| Field | Record |
| --- | --- |
| TASK ID / STATUS | `M15-F` / `BLOCKED — PRODUCTION BACKUP/RESTORE NOT READY` |
| Branch / base SHA / current HEAD / remote HEAD | `feature/m15f-production-stabilization` / `50a1a13d291da20ada18e4b4bbaaadc9fd54401b` / `9cee870b2e1cfeecd04fecbee28266ec3e2ea636` before blocker report / same initial governance commit pushed |
| Last tested application SHA | `50a1a13d291da20ada18e4b4bbaaadc9fd54401b` |
| CI run / CI SHA / CI result | Development `37182554528` / `50a1a13d291da20ada18e4b4bbaaadc9fd54401b` / `PASS`; M15-F feature run pending |
| Preview / database target / migrations | Primary repo remains linked to jobquest-dev `xpnkasclquplmrcmhsif`; Production verified as jobquest-prod `kqsxdothjxtcktyirpux`, 19 migrations through `20261021100000`; exactly `20261022100000` pending |
| Production touched / development merged / main merged | `NO / NO / NO` |
| Last completed action | Release delta and Production migration/compatibility audits passed; audit stopped at mandatory backup/restore gate with no Production mutation. |
| Next exact action | Create a fresh supported logical backup of current jobquest-prod, verify archive integrity and disposable restore, document operator restore access, then resume at Stage 7. |
| Blockers / open questions | Supabase Free has no verified managed backup; only local prod dump is from the superseded target; current-project backup/restore and operator restore access are not ready. Vercel/config/auth/extension/final-security stages were not reached. |
| Operator approval status | `PREFLIGHT AUTHORIZED`; Production cutover/mutation `NOT AUTHORIZED` |
| Report document | `migration-upgrade/post-launch/M15F_PRODUCTION_RELEASE_STABILIZATION_REPORT.md` |

## Current task record — PL-4C Goals + Task Templates + Recurrence Enhancements

| Field | Record |
| --- | --- |
| TASK ID / STATUS | `PL-4C` / `FORMALLY CLOSED` |
| Branch / base SHA / application-certified SHA | `feature/pl4c-goals-task-templates-recurrence` / `dfa5a59b6619d12e319fe82b316be2339280f673` / `eff714e2564391953638e7a7fa2cf7ed729ed71a` |
| Local certification | Reused: lint/typecheck/build PASS; unit `179/179`; integration `192/192`; extension `97/97`; Playwright/axe `23/23`; migration/RLS/concurrency/responsive/secret gates PASS. |
| Remote migration verification | jobquest-dev `xpnkasclquplmrcmhsif`; M15 `20261021100000` then PL-4C `20261022100000` applied; history aligned; catalog/RLS/grants and focused integration `5/5` PASS. |
| CI run / CI SHA / CI result | Application `37181003327` / `eff714e2564391953638e7a7fa2cf7ed729ed71a` / `PASS`; feature `37181949107` / `5e49b966561cdced327d33a6dd6b936bd5cec1e8` / `PASS`; development `37182554528` / `50a1a13d291da20ada18e4b4bbaaadc9fd54401b` / `PASS`. |
| Preview / database target / migrations | `https://jobquest2-gnmajdb53-one-piece-5779.vercel.app` (`dpl_4oRca2xD5zSdq5TccycvD71gxTNp`, READY, application SHA) / `jobquest-dev` / M15 predecessor + PL-4C applied |
| Focused Preview acceptance | `2/2 PASS`: representative configurable goals, task-template application/independence, recurrence, mobile, and axe. Bundle contains dev ref and excludes Production ref. |
| Production touched / development merged / main merged | `NO / YES / NO` |
| Last completed action | Operator-approved no-ff merge `50a1a13d291da20ada18e4b4bbaaadc9fd54401b` was pushed to development and passed exact CI run `37182554528`, including all static, secret, migration, integration, extension, browser, and axe gates. |
| Next exact action | M15-F preflight under the operator's updated sequence; PL-5 remains deferred until after M15-F. |
| Blockers / open questions | None for PL-4C closeout. |
| Operator approval status | `APPROVED AND COMPLETED` for PL-4C → development only |
| Report document | `migration-upgrade/post-launch/PL4C_GOALS_TASK_TEMPLATES_RECURRENCE_REPORT.md` |

## Current task record — PL-4B Calendar + Timeline/Gantt + Archive

| Field | Record |
| --- | --- |
| TASK ID / STATUS | `PL-4B` / `FORMALLY CLOSED` |
| Branch / base SHA / final feature SHA | `feature/pl4b-calendar-timeline-archive` / `80076446a120388fe2b05f7d36ccc131bb72d538` / `8ee3dcaa024ae9780ca395d246e61667a09dc580` |
| Original failed SHA / CI | `3c7ecb7bd12549b51ccbef9318df045dd6c76fb5` / `37101076139 FAIL` (`TS2367` in PL-4B E2E animation state handling) |
| Corrected intermediate SHA / CI | `a7aeeb4172d77befd8f3677384afb0e23a4a930b` / `37126669497 PASS` |
| CI run / CI SHA / CI result | Feature `37128248294` / `8ee3dcaa024ae9780ca395d246e61667a09dc580` / `PASS`; development `37128826840` / `dfa5a59b6619d12e319fe82b316be2339280f673` / `PASS` |
| Preview / database target / migrations | `https://jobquest2-pb0szhpwp-one-piece-5779.vercel.app` (`dpl_AHAeH26jLYdd2AgMSafhHAdFjWvV`, READY, exact candidate SHA) / `jobquest-dev` / `NONE` |
| Production touched / development merged / main merged | `NO / YES / NO` |
| Last completed action | Operator-approved no-ff merge `dfa5a59b6619d12e319fe82b316be2339280f673` was pushed to development and passed exact CI run `37128826840`, including all static, secret, migration, integration, extension, browser, and axe gates. |
| Next exact action | PL-4C in a separate controlled task; do not start automatically. |
| Blockers / open questions | None for PL-4B closeout. |
| Operator approval status | `APPROVED AND COMPLETED` for PL-4B → development only |
| Report document | `migration-upgrade/post-launch/PL4B_CALENDAR_TIMELINE_ARCHIVE_REPORT.md` |

## Current task record — PL-3 Dashboard + Analytics Redesign

| Field | Record |
| --- | --- |
| TASK ID / STATUS | `PL-3` / `FORMALLY CLOSED` |
| Branch / base SHA / final feature SHA | `feature/pl3-dashboard-analytics-redesign` / `5dfce2086f04abd26efb1a3a36ebd73132bda986` / `2745abb7ac3c70f7877e4d2a304c53e54215cce5` |
| Last tested application SHA | `11116ca2a577c70e18b4bcfac796dfa6260bda15` development merge SHA |
| CI run / CI SHA / CI result | Feature `36973633143` / `2745abb7ac3c70f7877e4d2a304c53e54215cce5` / `PASS`; development `37012301480` / `11116ca2a577c70e18b4bcfac796dfa6260bda15` / `PASS` |
| Preview / database target / migrations | `https://jobquest2-kmyr2pq0v-one-piece-5779.vercel.app` (`dpl_62fhBQL3Jd6iuPy5YS7sKXvRqnea`, READY, exact application SHA) / `jobquest-dev` / `NONE` |
| Production touched / development merged / main merged | `NO / YES / NO` |
| Last completed action | Operator-approved no-ff merge `11116ca2a577c70e18b4bcfac796dfa6260bda15` was pushed to development and passed exact CI run `37012301480`, including all static, secret, integration, extension, browser, and axe gates. |
| Next exact action | PL-4A in a separate controlled task; do not start automatically. |
| Blockers / open questions | None for PL-3 closeout. |
| Operator approval status | `APPROVED AND COMPLETED` for PL-3 → development only |
| Report document | `migration-upgrade/post-launch/PL3_DASHBOARD_ANALYTICS_REPORT.md` |

## Most recently closed task record — PL-2 Application Productivity

| Field | Record |
| --- | --- |
| TASK ID / STATUS | `PL-2` / `FORMALLY CLOSED` |
| Branch / base SHA / implementation commit / final feature SHA | `feature/pl2-application-productivity` / `1086bcb41d1b0ab25959d182ec388a0f6da53042` / `526b0318` / `298d112d4379dedf6930572015d6f7498feff4ea` |
| Last tested application SHA | `5dfce2086f04abd26efb1a3a36ebd73132bda986` development merge SHA |
| CI run / CI SHA / CI result | Feature `36918359854` / `298d112d4379dedf6930572015d6f7498feff4ea` / `PASS`; development `36960378949` / `5dfce2086f04abd26efb1a3a36ebd73132bda986` / `PASS` |
| Preview / database target / migrations | `https://jobquest2-86tuv7yxd-one-piece-5779.vercel.app` (`dpl_3PcsXLanZhRMww5bTdfjXSTtux87`, READY) / `jobquest-dev` / `NONE` |
| Production touched / development merged / main merged | `NO / YES / NO` |
| Last completed action | Approved no-ff merge into `development`; exact merge SHA `5dfce2086f04abd26efb1a3a36ebd73132bda986` passed CI run `36960378949`, including classification, static checks, secret scans, disposable-Supabase integration, browser E2E, and axe. |
| Next exact action | PL-3 — Dashboard + Analytics redesign, in a separate controlled task. |
| Blockers / open questions | No authorized Preview identity was available or created; authenticated PL-2 flows are covered by passing disposable local/CI browser suites. Local Playwright teardown limitation remains documented. |
| Operator approval status | `APPROVED AND COMPLETED` for PL-2 → development only |
| Report document | `migration-upgrade/post-launch/PL2_APPLICATION_PRODUCTIVITY_REPORT.md` |

## Phase queue

| Phase | Status | First exact action |
| --- | --- | --- |
| PL-0A | CLOSED | Closed as part of the certified PL-0 governance record. |
| PL-0B-1 | CLOSED | Closed as part of the certified PL-0 governance record. |
| PL-0B-R1 | CLOSED | Closed as part of the certified PL-0 governance record. |
| PL-0B-R2 | CLOSED | Closed as part of the certified PL-0 governance record. |
| PL-0B-2 | CLOSED | Governance branch exact CI passed and was no-ff integrated into development. |
| PL-0B-3 | CLOSED | Development governance integration CI `36783308738` passed for `24c0b40d2c8fe4e5f452ccdf8c9fd903a7dae2c0`; formal PL-0 closeout complete. |
| PL-0 | CLOSED | Certified governance integration and formal closeout complete. |
| PL-1 | CLOSED | Closeout feature CI `36898779897` and development integration CI `36903888076` passed; PL-1A closed, PL-1B conditional/not executed, PL-1C closed with evidence limitation, PL-1D assessed/deferred. |
| PL-2 | CLOSED | Feature CI `36918359854` and development integration CI `36960378949` passed; PL-2 is formally closed. |
| PL-3 | CLOSED | Feature certification and matching Preview passed; development merge `11116ca2a577c70e18b4bcfac796dfa6260bda15` passed CI `37012301480`. |
| PL-4A | CLOSED | Final feature CI `37034644123` passed; operator-approved development merge `80076446a120388fe2b05f7d36ccc131bb72d538` passed exact development CI `37050583184`. |
| PL-4B | CLOSED | Final feature CI `37128248294` passed; operator-approved development merge `dfa5a59b6619d12e319fe82b316be2339280f673` passed exact development CI `37128826840`. |
| PL-4C | CLOSED | Final feature CI `37181949107` passed; operator-approved development merge `50a1a13d291da20ada18e4b4bbaaadc9fd54401b` passed exact development CI `37182554528`. |
| M15-F | BLOCKED — BACKUP/RESTORE NOT READY | Git/delta/migration/compatibility audit completed; no current recoverable jobquest-prod backup or verified restore path. Production mutation remains unauthorized. |
| PL-5 | DEFERRED / NOT STARTED | Begins only after successful M15-F so it can use final Production evidence. |
| Legacy retirement | RESERVED | Requires separate authorization after M15-F; never automatic. |

## Completion gate for every task

1. Reverify baseline, branch, and authorization.
2. Implement only on a feature/fix branch; record exact changed paths and migrations.
3. Run proportionate local tests and the canonical secret scan.
4. Push the branch only; capture its exact CI SHA/run with one observer.
5. Run Preview/E2E/a11y and operator review when applicable.
6. Write the phase report, current-state checkpoint, task record, and backlog update. Never let a docs push interfere with an active integration SHA certification.
7. Stop for explicit promotion authorization. Development merge and exact development CI are distinct gates; main/Production remain frozen until M15-F.
