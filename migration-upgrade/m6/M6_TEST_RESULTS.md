# M6: Test Results

A result counts as PASS only when the run completed and wrote its evidence. Evidence is in `migration-upgrade/m6/evidence/` and is sanitized by the recorder.

## 1. Summary

| Category | Suite | Local | Hosted `jobquest-dev` | CI | Vercel preview |
|---|---|---|---|---|---|
| Static | lint, typecheck | PASS | n/a | PASS | n/a |
| Unit | 93 tests / 11 files (M6: 14) | **93/93** | n/a | PASS | n/a |
| Build + secret scans | build (798 kB JS), `check:bundle` (3 files), `check:secrets` (435 files) | PASS, 0 findings | n/a | PASS | deployed-bundle scans 0 findings |
| Integration | M1B 17 · M3 38 · M4 10 · M4 closeout 9 · M5 14 · **M6 13** | **101/101** | **101/101** (see §3) | PASS | n/a |
| E2E | M2 capture, leak, M2 shell ×4, M3, M4, M5, **M6** | **10/10** | n/a | PASS | M6 PASS on the final preview; M5, leak and M2 shell PASS on `har9s7xwi` |
| a11y | axe WCAG 2.0/2.1/2.2 A+AA, colour contrast on | **0 violations** in 9 M6 contexts (asserted) | n/a | PASS | 0 violations in 9 contexts |
| Performance | EXPLAIN ANALYZE, 10,000 tasks and 365-day habit logs | all index scans, ≤0.55 ms | n/a | n/a | n/a |

## 2. Integration: M6 (`tests/integration/m6-tasks-habits.test.ts`)

Evidence: local `integration-local-4063ae.json`; hosted `integration-hosted-dev-ac1618.json`.

| ID | Result | Key assertions |
|---|---|---|
| M6-01 | PASS | Own insert, select and update. Title trimmed. `status`, `completed_at`, `user_id`, `workspace_id`, `parent_task_id` → `42501`. Insert as COMPLETED → `42501`. DELETE → `42501`. Cancel keeps the row |
| M6-02 | PASS | Reminder without a due date, follow-up without a link, both dues, recurrence without a due date, HOURLY, URGENT → `23514` |
| M6-03 | PASS | Peer: 0 rows on select and update. Complete, cancel and insert-for-peer → `42501` |
| M6-04 | PASS | Manager creates for a member and completes; audit `RECORD_CREATED` + `RECORD_UPDATED` (actor = manager, target = member, TASK). Foreign manager denied. A non-member owner → `42501`. Owner actions are not audited |
| M6-05 | PASS | Removed member: tasks 0, habits 0, RPCs `42501` |
| M6-06 | PASS | Cross-workspace application → `23503`. Peer application, peer contact and relink → `42501 TASK_LINK_FORBIDDEN`. An interview link sets `application_id`. Mismatch → `TASK_LINK_MISMATCH` |
| M6-07 | PASS | DAILY +1, WEEKLY +7, BIWEEKLY +14, WEEKDAYS Fri 2027-10-01 → Mon 10-04, MONTHLY 2027-01-31 → 02-28 → **03-31**. Complete twice → `TASK_NOT_PENDING`. One child. An overdue daily task → today. Timed 09:00 CDT → **2026-11-01T15:00Z** (09:00 CST). Duplicate child → `23505` |
| M6-08 | PASS | Undo withdraws the untouched next instance. A changed next instance → `TASK_REOPEN_CONFLICT`, and the task stays COMPLETED |
| M6-09 | PASS | A contact created with a follow-up date → a FOLLOW_UP task. A direct column edit moves the same task. An interaction's next date moves it. An earlier task becomes the projection. Done completes the earliest. Clear cancels, keeping history. Peer `42501` |
| M6-10 | PASS | REMINDER due at `scheduled_at − 60 min`, linked to the interview and application, HIGH. None by default. A reschedule shifts it by the same amount. Cancelling the interview cancels the reminder |
| M6-11 | PASS | "Done, set next" writes `NEXT_ACTION_CHANGED {completed_action, next_action}` and sets `next_action_completed_at`. `NO_NEXT_ACTION`. Peer `42501`. A FOLLOW_UP completion writes a `FOLLOW_UP` event |
| M6-12 | PASS | One log per day (2 → 3). The target snapshot is kept after a target change. Uncomplete. Tomorrow in the owner's zone → `FUTURE_DATE`. Paused → `HABIT_PAUSED`. Archive and restore keep logs. Direct log insert and habit delete → `42501`. Peer denied. A manager check-in is attributed to the member and audited. WEEKDAYS accepted, HOURLY → `23514` |
| M6-13 | PASS | `anon` denied on 3 tables and 4 RPCs |

## 3. Hosted note

The first hosted run started 5 seconds after the migration push. 14 M1B tests failed with "Unhandled API error", and the other files were skipped because their setup failed. The same transient failure followed the M5 push. `rpc_register_account` was then shown to work when called directly, and the re-run passed **101/101**. The most likely cause is a PostgREST schema-cache reload after the DDL; this was not confirmed.

## 4. Unit (`tests/unit/m6-queue-habits.test.ts`, 14)

- **Due states:**
  - date-only tasks never shift (Kiritimati +14 and Pago Pago −11)
  - timed items are overdue once the instant passes, and belong to the profile's day (22:00 CDT = the next UTC day)
  - labels
- **Queue:**
  - overdue / today / upcoming / no date
  - completed tasks excluded
  - order: follow-up (5 days) → next action (4 days) → interview outcome (1 day)
  - `todayBounds` for Chicago = 05:00Z–05:00Z
- **week_start:**
  - Monday and Sunday week starts
  - the M5 interview band fix: a Sunday is "this week" with Monday weeks and "next week" with Sunday weeks
- **Habits:**
  - an unfinished today keeps the streak
  - target snapshot
  - weekdays skip weekends
  - weekly sums per `week_start`
  - best streak across the lookback window

## 5. E2E: M6 (`e2e/m6-tasks-habits.spec.ts`)

Evidence: local `e2e-local-*.json` (latest PASS). The browser runs in Europe/Berlin with the profile in America/Chicago.

| Step | Result |
|---|---|
| Register; the bell has no fake unread count | PASS |
| Application next action overdue by 4 days shows in the queue as NEXT_ACTION | PASS |
| T3 recurring task (hint shown) and T4 follow-up (validation, link, Tomorrow) | PASS |
| Complete → Undo → complete; next weekly occurrence in Upcoming. The contact form's follow-up is a FOLLOW_UP task. Interview reminder **"Tomorrow · 1:30 PM"** (profile zone, not Berlin) | PASS |
| "Done, set next" | PASS |
| T2 detail, edit, snooze (Next week), cancel (confirmed) | PASS |
| "Next actions" type filter; keyboard arrows across tabs | PASS |
| Aborted request shows loading (no stale rows), then the error, then Retry, then the empty state | PASS |
| D1: interview, backdated **Long Waiting · 40d** review, overdue contact task first ("2d overdue"), Keep removes it | PASS |
| Application drawer Tasks card shows the interview reminder; Add task is pre-linked | PASS |
| Habits: counted + / + / −, weekly check-in with a streak of 1 week, "1 of 2 done", the week-start note, pause, History shows "paused" | PASS |
| Mobile 390 px: dashboard, tasks (overflow 0), habits | PASS |

| a11y context | Violations |
|---|---|
| task-form | 0 |
| tasks-list | 0 |
| tasks-list-dark | 0 |
| task-detail | 0 |
| tasks-list-after-actions | 0 |
| dashboard | 0 |
| habit-form | 0 |
| habits | 0 |
| tasks-mobile | 0 |

**Fixed during M6 testing:**
- Contrast on the completed-today row: `opacity: 0.8` pushed muted text to 3.53:1. The opacity was removed; the approved tokens are unchanged.
- Dashboard card headers overlapped on mobile.

## 6. Regression and CI

- **Integration:** M1B 17, M3 38, M4 10, M4 closeout 9 and M5 14 pass locally and on hosted after the M6 migration. The M4 follow-up behaviour is now routed through tasks, and the M4 suites pass unchanged.
- **E2E:** capture, leak, M2 shell ×4, M3, M4 and M5 pass locally and in CI.

| Run | Commit | Result |
|---|---|---|
| `36145162669` | `0b8f0c9` (branch created) | PASS |
| `36146690490` | `2e13dba` (DB) | PASS |
| `36149400747` | `e3e18d5` (UI) | PASS |
| `36150499585` | `ef9bbff` (spec fix) | PASS |
| `36151401228` | `0a92387` | cancelled (superseded by the next push) |
| **`36151776339`** | **`b1ad12f` (final code)** | **PASS**: static 37 s; database + integration 101 + E2E 10 + evidence 4 m 46 s |
| docs commit | docs only | recorded in the hand-off message |

## 7. Vercel preview

| Check | Result |
|---|---|
| `jobquest2-har9s7xwi` (`e3e18d5`): M5 E2E, leak, M2 shell ×4 | **PASS (6/6)** |
| `jobquest2-har9s7xwi`: M6 E2E | **FAILED** at the reminder time. The spec switched the profile zone and scheduled without waiting for the save, so the interview was converted in the old zone ("8:30 AM"). This was a test race, fixed in `ef9bbff` (the spec waits, as the M5 spec already did) |
| `jobquest2-jlksvlrqq` (`0a92387`): health ok; bundle scan 0 findings | PASS (superseded) |
| **`jobquest2-8lhec046i` (`b1ad12f`, final code)**: health ok; Environment Preview; deployed-bundle scan 0 findings | PASS |
| **`jobquest2-8lhec046i`: M6 E2E** | **PASS**: `e2e-vercel-preview-6df3fd.json` (16:12:29–16:13:28 UTC). All steps pass, including the reminder at "Tomorrow · 1:30 PM" in the profile zone, the D1 Long Waiting review, habits and mobile. a11y: **0 violations in all 9 contexts** |

A background run scheduled for this check was interrupted when the previous session ended: it had printed only "Running 1 test" and wrote no evidence. The check was run once more in the foreground. An orphaned copy of the interrupted run was still running then and wrote an unrelated failure (a navigation-click timeout) into the same log file. That run left no evidence, and every screenshot's timestamp (16:12–16:13 UTC) belongs to the passing run.

## 8. Final Closeout & Evidence Disposition

- **Final Code HEAD:** `b1ad12f`
- **Final Docs Commit:** `5a5919c`
- **Final CI:** Run `36151776339` (Green on `b1ad12f`)
- **Evidence Disposition:**
  - Category A (Committed Milestone Evidence): `migration-upgrade/m6/evidence/` (`integration-local-4063ae.json`, `integration-hosted-dev-ac1618.json`, `e2e-m6-*.json`), screenshots in `migration-upgrade/m6/screenshots/`.
  - Category B (Reproducible Temp Output Ignored): `test-results/`, `apps/web/dist/`, `supabase/.temp/`, `node_modules/`.
  - Category C (Sensitive / Local-Only State Ignored): `.env.local`, `.env.m1b-local`, `supabase/signing_keys.json`, `.vercel/`.
- **Status:** **M6 APPROVED FOR INTEGRATION.** Validated across all static, unit, integration (101/101), E2E, a11y, and cloud preview checks. Ready for `--no-ff` merge into `development`.
