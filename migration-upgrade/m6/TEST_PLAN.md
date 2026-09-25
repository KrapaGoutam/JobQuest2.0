# M6: Test Plan

## Integration (`tests/integration/m6-tasks-habits.test.ts`)

These run against the real Supabase stack with Option B tokens.

Actors:
- alice, bob: USER
- charlie: MANAGER
- dave: MANAGER of a foreign workspace
- eve: a USER who is later removed

Profile zone: America/Chicago.

| ID | Scenario (prompt §38–§42) |
|---|---|
| M6-01 | Own tasks:<br>• insert, select, update simple fields<br>• status, completion, owner, workspace and parent → `42501`<br>• inserting as COMPLETED → `42501`<br>• DELETE → `42501`<br>• cancel keeps the row |
| M6-02 | Shape rules → `23514`: reminder without a due date, follow-up without a link, two dues, recurrence without a due date, bad enum values |
| M6-03 | Peer: select/update 0 rows; complete, cancel and inserting for a peer → `42501` |
| M6-04 | Manager reads; creates a task for a member; completes it (audited: created and updated, target = member). Foreign manager denied. Owner must be a member. The owner's own actions aren't audited |
| M6-05 | A removed member loses tasks, habits and RPC access |
| M6-06 | Cross-workspace link → `23503` (service role). Peer application/contact link → `42501`. Relink to a peer's record → `42501`. An interview link implies its application; a mismatch is rejected |
| M6-07 | Recurrence:<br>• DAILY / WEEKLY / BIWEEKLY / WEEKDAYS (Fri → Mon) / MONTHLY (Jan 31 → Feb 28 → Mar 31)<br>• completing twice → `TASK_NOT_PENDING`<br>• exactly one child<br>• an overdue daily task skips to today<br>• DST wall time kept<br>• duplicate child → `23505` |
| M6-08 | Undo withdraws the untouched next instance. A changed next instance → `TASK_REOPEN_CONFLICT`, rolled back |
| M6-09 | Contact follow-ups:<br>• RPC create<br>• direct edit of the column<br>• an interaction's next date<br>• an earlier explicit follow-up<br>• Done<br>• clear<br><br>Each changes the canonical tasks, and the column equals the projection. A peer is denied |
| M6-10 | Interview reminder:<br>• REMINDER task 60 minutes before, linked to the interview and application<br>• none unless requested<br>• a reschedule shifts it<br>• cancelling the interview cancels it |
| M6-11 | "Done, set next" writes `NEXT_ACTION_CHANGED`; `NO_NEXT_ACTION`; peer `42501`. A follow-up completion writes a timeline event |
| M6-12 | Habits:<br>• one row per day (idempotent)<br>• target snapshot<br>• uncomplete<br>• a future date in the owner's zone is refused<br>• paused / archive / restore<br>• no direct log writes or deletes<br>• peer denied<br>• a manager check-in is attributed to the member and audited<br>• WEEKDAYS accepted |
| M6-13 | `anon` denied on the tables and RPCs |

## Unit (`tests/unit/m6-queue-habits.test.ts`)

- Date-only tasks never shift across zones.
- Timed items: overdue once the instant passes; the day in the profile zone.
- Labels.
- Queue grouping, urgency order and item kinds.
- `todayBounds` in the profile zone.
- `week_start` for weeks and for the M5 interview bands.
- Habits:
  - a daily streak survives an unfinished today
  - counted with a target snapshot
  - weekdays skip weekends
  - weekly sums follow `week_start`
  - best streak over the lookback window

## E2E (`e2e/m6-tasks-habits.spec.ts`, browser in Europe/Berlin, profile in America/Chicago)

1. Register. The bell has no fake count.
2. Applications, one with an overdue next action. An interview with a reminder. A contact with a follow-up date.
3. `/tasks`: the next action is overdue.
4. T3 recurring task, then T4 follow-up (with validation).
5. Complete and Undo, then complete again: a next occurrence appears in Upcoming. The contact's follow-up task and the interview reminder (`Tomorrow · 1:30 PM`) appear in Upcoming.
6. "Done, set next".
7. T2 detail, edit, snooze, cancel.
8. Type filter; keyboard tabs.
9. Error, then Retry, then the empty state.
10. D1 dashboard: interviews, a backdated Long Waiting application, the overdue contact task first, Keep.
11. Application drawer: Tasks card with the reminder; Add task (pre-linked).
12. Habits:
    - counted +/−
    - weekly check-in with a streak
    - the `week_start` note
    - pause, and History
13. Mobile at 390 px (no overflow): dashboard, tasks, habits.
14. axe on 9 contexts, 0 critical/serious asserted: task form, tasks list light and dark, task detail, list after actions, dashboard, habit form, habits, mobile tasks.

## Regression, performance, preview

- **Regression:** all 101 integration tests and 10 E2E specs, locally, on hosted and in CI. On the preview: M5, M6, leak and M2 shell.
- **Performance:** EXPLAIN on 10,000 tasks and 365-day habit logs (`evidence/perf-explain-local.txt`).
