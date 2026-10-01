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
| TASK ID / STATUS | `PL-1A` / `BLOCKED — HISTORICAL CREDENTIAL VALIDITY STILL UNKNOWN` (`UNKNOWN`) |
| Branch / base SHA / local docs checkpoint / remote HEAD | `fix/pl1-credential-hygiene` / `0994812e144a2a3d20298573506c141f45dab3bd` / see final handoff or branch tip (pre-checkpoint `f0774eb90fb446f550ab736545a0430805195857`) / `f0774eb90fb446f550ab736545a0430805195857` pending authorized push |
| Last tested application SHA | `0994812e144a2a3d20298573506c141f45dab3bd` (no application changes) |
| CI run / CI SHA / CI result | `36789160703` / `f0774eb90fb446f550ab736545a0430805195857` / `PASS` (existing docs-only checkpoint) |
| Preview / database target / migrations | `NOT REQUIRED` / `READ-ONLY verification only` / `NONE` |
| Production touched / development merged / main merged | `NO / NO / NO` |
| Last completed action | Verified reset Supabase/Vercel CLI identities read-only: DEV and PROD are visible; the repository is linked only to DEV; Vercel scope/project access is correct; historical project `kwmnljvyvqvbvimypnmw` belongs to an inaccessible/incorrect historical account and remains invisible, so classification remains `UNKNOWN`. Operator confirms current Production user is `Conan`; historical `smoke-tester` is absent and must not be created there. |
| Next exact action | Provide authorized read-only visibility to historical project `kwmnljvyvqvbvimypnmw`, then inspect only whether `smoke-tester` exists and its safe status without testing the credential or mutating auth. |
| Blockers / open questions | Historical project visibility and therefore account existence, enabled state, and credential validity remain unknown. The historical credential must not be tested, reused, recreated, or printed. Any future M15-F smoke identity must be new, temporary, minimally privileged, operator-approved, and use a new credential never stored in the repository. |
| Operator approval status | `NOT REQUIRED` for the next read-only inspection; separately required if PL-1B invalidation becomes necessary |
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
