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

## Active task record — PL-2 Application Productivity

| Field | Record |
| --- | --- |
| TASK ID / STATUS | `PL-2` / `IMPLEMENTED + LOCAL VALIDATION PASS; EXACT-SHA CI/PREVIEW PENDING` |
| Branch / base SHA / implementation commit / final feature SHA | `feature/pl2-application-productivity` / `1086bcb41d1b0ab25959d182ec388a0f6da53042` / `526b0318` / `PENDING` |
| Last tested application SHA | `526b0318` plus the pending documentation commit; final exact SHA must be retested in CI |
| CI run / CI SHA / CI result | `PENDING` |
| Preview / database target / migrations | `PENDING` / required `jobquest-dev` / `NONE` |
| Production touched / development merged / main merged | `NO / NO / NO` |
| Last completed action | Implemented verified gaps; lint/typecheck/unit `170/170`/integration `187/187`/build/secret scan passed; targeted browser evidence passed with zero blocking axe findings. |
| Next exact action | Commit documentation, push only the feature branch, certify the final exact SHA in CI, verify the matching Preview, then stop for operator approval. |
| Blockers / open questions | Local Playwright parent teardown hung after both targeted scenarios wrote completed PASS evidence; branch CI and Preview remain authoritative pending gates. |
| Operator approval status | `NOT YET REQUESTED`; required only after final branch CI and Preview pass |
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
| PL-2 | IN PROGRESS | Implementation and local validation pass; exact-SHA branch CI and jobquest-dev Preview verification pending. |
| PL-3 | PENDING | Audit existing dashboard widgets/layouts/tokens before UX work. |
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
