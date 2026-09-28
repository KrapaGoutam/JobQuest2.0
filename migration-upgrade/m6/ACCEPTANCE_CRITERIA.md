# M6: Acceptance Criteria

| ID | Criterion | Evidence | Status |
|---|---|---|---|
| AC-M6-01 | One canonical tasks/reminders model; no competing reminder stores | Migration, `M6_IMPLEMENTATION_NOTES.md` §2 | PASS |
| AC-M6-02 | Interview reminders use tasks, follow reschedules and are cancelled once the interview has an outcome | M6-10; E2E | PASS |
| AC-M6-03 | Contact follow-ups reconciled: the column is a projection of the tasks, and every write routes into tasks | M6-09; E2E contact follow-up | PASS |
| AC-M6-04 | Application next action contract is explicit: M3 field plus "Done, set next", shown in the queue, never duplicated | M6-11; E2E | PASS |
| AC-M6-05 | Recurrence: DAILY/WEEKDAYS/WEEKLY/BIWEEKLY/MONTHLY; one next instance; undo; time zone and DST | M6-07, M6-08 | PASS |
| AC-M6-06 | Task RLS: own allowed; peer, foreign, removed and `anon` denied; manager allowed (audited) | M6-01, M6-03..05, M6-13 | PASS |
| AC-M6-07 | Habit RLS is the same | M6-05, M6-12, M6-13 | PASS |
| AC-M6-08 | Cross-workspace and cross-owner links are denied by the database | M6-06 | PASS |
| AC-M6-09 | Archive-first: no hard delete of tasks or habits; habit history is durable | M6-01, M6-12 | PASS |
| AC-M6-10 | Idempotent habit check-ins and target snapshots | M6-12; unit | PASS |
| AC-M6-11 | `week_start` is honoured (habits, upcoming bands, M5 bands) | unit; E2E note | PASS |
| AC-M6-12 | Profile time zone: date-only tasks never shift; timed items render in the profile zone | unit; M6-07; E2E (`1:30 PM` with the browser in Berlin) | PASS |
| AC-M6-13 | Unified queue: overdue → today; kinds; ordering; counts; owner isolation; manager view; empty state | unit; E2E dashboard/tasks | PASS |
| AC-M6-14 | Long Waiting review uses the M3 operations and never mutates automatically | E2E Keep; code review | PASS |
| AC-M6-15 | Manager mutation audit preserved and extended; read-audit **not** claimed | M6-04, M6-12 | PASS |
| AC-M6-16 | Accessibility: 0 critical/serious (asserted) | E2E axe, 9 contexts | PASS |
| AC-M6-17 | Indexed, bounded queries | `evidence/perf-explain-local.txt` | PASS |
| AC-M6-18 | No regression in M1B/M3/M4/M5 or the shell | 101 integration, 10 E2E | PASS |
| AC-M6-19 | Preview healthy and validated; no production | `M6_TEST_RESULTS.md` §7 (final preview M6 E2E PASS) | PASS |
| AC-M6-20 | CI green with the M6 suites and evidence | `M6_TEST_RESULTS.md` §6 (`36151776339` on `b1ad12f`) | PASS |
