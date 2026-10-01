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

## Active task record — PL-1A

| Field | Record |
| --- | --- |
| TASK ID / STATUS | `PL-1A` / `REMEDIATION COMPLETE LOCALLY — AWAITING EXACT-SHA CI` (historical classification remains `UNKNOWN`) |
| Branch / base SHA / current HEAD / remote HEAD | `fix/pl1-credential-hygiene` / `0994812e144a2a3d20298573506c141f45dab3bd` / pending remediation commit (previous certified `df99f794c1fe8e18fe63e3d4d3bce11f69b99dd4`) / `df99f794c1fe8e18fe63e3d4d3bce11f69b99dd4` |
| Last tested application SHA | `0994812e144a2a3d20298573506c141f45dab3bd` (no application changes) |
| CI run / CI SHA / CI result | New remediation CI pending; previous `36882374030` / `df99f794c1fe8e18fe63e3d4d3bce11f69b99dd4` / `PASS` |
| Preview / database target / migrations | `NOT REQUIRED` / `READ-ONLY verification only` / `NONE` |
| Production touched / development merged / main merged | `NO / NO / NO` |
| Last completed action | Redacted the sole current tracked occurrence; added generic Markdown password-assignment detection and synthetic regression coverage; focused scanner/tooling tests, lint, and canonical scan pass (937 files, 0 findings). Historical validity remains `UNKNOWN`; no auth or environment mutation occurred. |
| Next exact action | Final pre-commit scan/review, focused remediation commit, push only this branch, observe new exact-SHA CI, then stop for operator review. |
| Blockers / open questions | No remediation blocker. Historical project/account/credential validity remains inaccessible and `UNKNOWN`; redaction is not invalidation. |
| Operator approval status | `AUTHORIZED FOR CURRENT REDACTION/SCANNER REMEDIATION`; future invalidation, Production smoke identity, or integration remains separately gated |
| Report document | `migration-upgrade/post-launch/PL1A_CREDENTIAL_HYGIENE_REPORT.md` |

## Phase queue

| Phase | Status | First exact action |
| --- | --- | --- |
| PL-0A | CLOSED | Closed as part of the certified PL-0 governance record. |
| PL-0B-1 | CLOSED | Closed as part of the certified PL-0 governance record. |
| PL-0B-R1 | CLOSED | Closed as part of the certified PL-0 governance record. |
| PL-0B-R2 | CLOSED | Closed as part of the certified PL-0 governance record. |
| PL-0B-2 | CLOSED | Governance branch exact CI passed and was no-ff integrated into development. |
| PL-0B-3 | CLOSED | Development governance integration CI `36783308738` passed for `24c0b40d2c8fe4e5f452ccdf8c9fd903a7dae2c0`; closeout documentation is awaiting its authorized certification and integration. |
| PL-0 | FORMALLY CLOSED PENDING FINAL DOCS INTEGRATION | The closeout record is complete; do not start PL-1 until the closeout branch and final development CI are green. |
| PL-1 | BLOCKED ON PL-1A SECURITY HOLD | Obtain authorized read-only visibility to the historical project and classify the account; do not start cleanup, scanner hardening, invalidation, or extension reliability work. |
| PL-2 | SELECTED | Audit current code for the actual productivity gaps before designing changes. |
| PL-3 | SELECTED | Audit existing dashboard widgets/layouts/tokens before UX work. |
| PL-4A | SELECTED | Verify duplicate, bulk, and recruiter functionality under specified views. |
| PL-4B | DEFERRED | Define the calendar/timeline/archive gap after PL-4A or explicit reprioritization. |
| PL-4C | DEFERRED | Verify existing goals/recurrence; scope templates as independent canonical tasks. |
| PL-5 | DEFERRED | Gather evidence after implementation phases; leave production metrics for M15-F when needed. |
| M15-F | RESERVED | Requires explicit operator authorization after prior work is completed/deferred. |
| Legacy retirement | RESERVED | Requires separate authorization after M15-F; never automatic. |

## Completion gate for every task

1. Reverify baseline, branch, and authorization.
2. Implement only on a feature/fix branch; record exact changed paths and migrations.
3. Run proportionate local tests and the canonical secret scan.
4. Push the branch only; capture its exact CI SHA/run with one observer.
5. Run Preview/E2E/a11y and operator review when applicable.
6. Write the phase report, current-state checkpoint, task record, and backlog update. Never let a docs push interfere with an active integration SHA certification.
7. Stop for explicit promotion authorization. Development merge and exact development CI are distinct gates; main/Production remain frozen until M15-F.
