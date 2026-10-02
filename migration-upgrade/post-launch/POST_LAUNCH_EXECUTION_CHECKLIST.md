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

## Current task record — PL-3 Dashboard + Analytics Redesign

| Field | Record |
| --- | --- |
| TASK ID / STATUS | `PL-3` / `FEATURE CERTIFIED — AWAITING OPERATOR APPROVAL` |
| Branch / base SHA / application-certified SHA | `feature/pl3-dashboard-analytics-redesign` / `5dfce2086f04abd26efb1a3a36ebd73132bda986` / `fda08f2ec465fbfbe961ecc5bd40e98269ca7674` |
| Last tested application SHA | `fda08f2ec465fbfbe961ecc5bd40e98269ca7674` |
| CI run / CI SHA / CI result | `36972469514` / `fda08f2ec465fbfbe961ecc5bd40e98269ca7674` / `PASS` |
| Preview / database target / migrations | `https://jobquest2-kmyr2pq0v-one-piece-5779.vercel.app` (`dpl_62fhBQL3Jd6iuPy5YS7sKXvRqnea`, READY, exact application SHA) / `jobquest-dev` / `NONE` |
| Production touched / development merged / main merged | `NO / NO / NO` |
| Last completed action | Recovered the original 9px Linux Chromium mobile-overflow failure to a hidden pace-chart table; contained all hidden analytics tables; passed exact-SHA CI and matching-Preview Dashboard/Analytics/axe verification. |
| Next exact action | Stop for explicit operator approval before any PL-3 no-ff merge to `development`; development CI is a separate future gate. |
| Blockers / open questions | No product blocker; operator approval for development integration is required. |
| Operator approval status | PL-3 implementation authorized; merge to development is not authorized. |
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
| PL-3 | FEATURE CERTIFIED / OPERATOR APPROVAL REQUIRED | Exact application SHA CI and matching jobquest-dev Preview passed; stop before development integration. |
| PL-4A | PENDING | Verify duplicate, bulk, and recruiter functionality under specified views. |
| PL-4B | PENDING | Define the calendar/timeline/archive gap after PL-4A or explicit reprioritization. |
| PL-4C | PENDING | Verify existing goals/recurrence; scope templates as independent canonical tasks. |
| PL-5 | PENDING | Gather evidence after implementation phases; leave production metrics for M15-F when needed. |
| M15-F | RESERVED — LAST | Final Production release and stabilization; requires explicit authorization after prior work is completed, deferred, or otherwise decided. |
| Legacy retirement | RESERVED | Requires separate authorization after M15-F; never automatic. |

## Completion gate for every task

1. Reverify baseline, branch, and authorization.
2. Implement only on a feature/fix branch; record exact changed paths and migrations.
3. Run proportionate local tests and the canonical secret scan.
4. Push the branch only; capture its exact CI SHA/run with one observer.
5. Run Preview/E2E/a11y and operator review when applicable.
6. Write the phase report, current-state checkpoint, task record, and backlog update. Never let a docs push interfere with an active integration SHA certification.
7. Stop for explicit promotion authorization. Development merge and exact development CI are distinct gates; main/Production remain frozen until M15-F.
