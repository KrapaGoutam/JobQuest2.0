# JOBQUEST2.0 — M6 COMPLETION REPORT

## 1. Status

**M6 Tasks, Habits & Unified Queue is IMPLEMENTED, TESTED, DEPLOYED TO PREVIEW and awaiting user review.** It is not merged, M7 has not started, and there is no production deployment.

| Item | State |
|---|---|
| Branch | `feature/m6-tasks-habits-queue`, from `development` `0b8f0c9` |
| Code HEAD | `b1ad12f`; the docs commit follows it (§36) |
| Supabase `jobquest-dev` | `20260926100000_m6_tasks_habits_queue` applied |
| Preview | `jobquest2-8lhec046i-one-piece-5779.vercel.app` (§27) |
| CI | **green** on `b1ad12f` (run `36151776339`) |

## 2. Executive Summary

M6 sets up **one** place for everything actionable: canonical `tasks` (task, follow-up, reminder), linked safely to applications, contacts and interviews.

- **Two older schedules** now fit that model without a second source of truth:
  - Application next actions stay the M3 "current next step", with an atomic "Done, set next".
  - Contact follow-up dates are now a projection of follow-up tasks, and every write is routed into them.
- **Interview reminders** deferred from M5 are tasks too.
- **Recurrence:** daily, weekdays, weekly, fortnightly and monthly. Time-zone and DST safe, one next instance per completion, and undoable.
- **The approved D1 dashboard** is the unified queue: overdue → due today, upcoming interviews, and Long Waiting review through M3's own operations. It never mutates anything by itself.
- **Habits:** yes/no or counted, daily, weekday or weekly (following `week_start`). History is durable, check-ins are idempotent, and streaks are derived at query time.
- **Access:** RLS for owner and manager, database-enforced link integrity, manager mutation audit.
- **Quality:** 0 accessibility violations.
- **Fixes along the way:**
  - two fabricated badge counts removed
  - the Dashboard nav pointed at the applications list
  - M5 interview week bands assumed Monday
  - the Direction D top bar was never styled
  - three test and layout issues

## 3. Git / Branch

`0b8f0c9` → the branch:

| Commit | Content |
|---|---|
| `2e13dba` | feat(m6): tasks, recurrence, habits, contact projection, interview reminders, audit + integration suite |
| `4abe62c` | fix(m5): honour `week_start` in interview week bands |
| `c4f855e` | fix(shell): remove fabricated badge counts; Dashboard/Today opens the dashboard |
| `e3e18d5` | feat(m6): Tasks / Dashboard / Habits UI, integrations, Direction D top bar, unit/E2E, CI |
| `ef9bbff` | test(m6): wait for the profile zone change (preview race) |
| `0a92387` | fix(m6): mobile dashboard card headers; E2E captures loaded states |
| `b1ad12f` | fix(m6): honest habit pause copy |
| docs | `docs(m6): …` |

There was no reset, rebase, force-push or squash. Nothing was merged. `main` is untouched.

## 4. M5 Integration

- **Verified before merging:**
  - HEAD `2e4e641` equals origin
  - CI `36108058074` green on that exact commit
  - only `migration-upgrade/**` changed after the last executable commit `6a469ed`
  - a clean tree with 0 untracked files
  - ignored files classified: build and test output reproducible; `.env*`, `signing_keys.json` and `.vercel/` sensitive
- **The six user decisions** were recorded in the M5 reports (`343a14f`, "docs: finalize M5 interviews and debriefs approval").
- **Merged:** `git merge --no-ff … -m "merge: approve M5 interviews and debriefs"` produced `0b8f0c9`, which was pushed. Development CI `36145144975` passed.
- **Development verified:** it contains all 8 migrations through M5, interviews, participants, time zones, the M5 audit behaviour, all reports and tests, and no secret files.
- **Decisions applied in M6:**
  - interview reminders → canonical tasks (done)
  - typed participants → contacts stays deferred (no automatic contacts)
  - read-audit and audit viewer stay deferred (not claimed)
  - the networking checklist stays deferred (not restored)
  - the shell polish was done within the stated limits (§30)
  - legacy interview types are kept

## 5. Database Changes

Migration `20260926100000_m6_tasks_habits_queue.sql`, additive; no applied migration edited.

- **Tables:** `tasks`, `habits`, `habit_logs`
- **Indexes:** 8 on tasks (including the unique parent), 1 on habits, 1 on habit_logs (plus the unique day key)
- **RLS and column-level grants:** no DELETE anywhere
- **Functions:**
  - `app.user_timezone`
  - `app.task_next_occurrence`
  - `app.guard_task`
  - `app.set_contact_follow_up`
  - `app.refresh_contact_follow_up`
  - `app.sync_contact_follow_up`
  - `app.route_contact_follow_up`
  - `app.sync_interview_tasks`
  - `app.guard_habit_log`
- **RPCs:**
  - `rpc_complete_task`, `rpc_reopen_task`, `rpc_cancel_task`
  - `rpc_complete_next_action`
  - `rpc_set_contact_follow_up`, `rpc_complete_contact_follow_up`
  - `rpc_set_habit_log`, `rpc_archive_habit`, `rpc_restore_habit`
  - `rpc_schedule_interview`, recreated with `p_remind_before_minutes` (old signature dropped)
- **Audit triggers:** on all three new tables.
- **Backfill:** existing contact follow-up dates became FOLLOW_UP tasks (5 on hosted).

## 6. Tasks Data Model

TARGET_SCHEMA #16, with three justified additions:

| Addition | Why |
|---|---|
| DATE `due_date` plus `due_at` | Date-only tasks never shift |
| `interview_id` | Approved: follow-ups link to "an application, interview or contact" |
| `recurrence_anchor` | Monthly series keep their day |

Types TASK / FOLLOW_UP / REMINDER; priority LOW / MEDIUM / HIGH (the same values as M3); status PENDING / COMPLETED / CANCELLED. Shape rules are CHECK constraints. Details: `M6_IMPLEMENTATION_NOTES.md` §1.

## 7. Task Recurrence

- **Rules:** DAILY, WEEKDAYS, WEEKLY, BIWEEKLY, MONTHLY (ADR-023; Gate 02B §6.2).
- **Completion** creates the next instance in the same transaction. The unique parent key guarantees one instance, and Undo withdraws an untouched one.
- **Owner's zone:** the next occurrence keeps local wall-clock time and skips past dates.
- **Tests:** every rule, the monthly clamp and anchor, DST, overdue skip, duplicate prevention and rollback on conflict (M6-07/08).
- **No legacy recurrence existed** to preserve (CR-015 is new).

## 8. Task Completion

`rpc_complete_task`:
- PENDING → COMPLETED with `completed_at`
- creates the recurring next instance
- for a FOLLOW_UP on an application, writes a timeline event and bumps `last_activity_at`
- manager completions are audited

The UI shows a completion toast with an **8-second Undo** (`rpc_reopen_task`). Cancel (`rpc_cancel_task`, confirmed) is the archive-first removal. Nothing is ever hard-deleted, except that Undo withdraws its own auto-created instance.

## 9. Application Integration

| Piece | What it does |
|---|---|
| Contract | `applications.next_action` is the **single current next step**, shown as a "Next action" queue item. "Done, set next" (`rpc_complete_next_action`) completes it, optionally sets the next one, and writes `NEXT_ACTION_CHANGED`, atomically. Tasks linked to an application are additional durable actions; the next action is never duplicated into tasks |
| Drawer | ADR-020 **Tasks** card (open linked tasks, including interview reminders; complete, snooze, Add task pre-linked to the application owner) and **Done, set next** on the Next Action box |
| Long Waiting | Review in the dashboard: Keep / Mark Ghosted (confirmed) / Archive (10-second Undo) through the M3 RPCs |

## 10. Contact Follow-Ups

- **Tasks are canonical.** `contacts.next_follow_up_date` is a trigger-maintained **projection**: the earliest pending FOLLOW_UP due date.
- **Every write is routed into tasks:**
  - the M4 edit form
  - `rpc_create_contact`
  - `rpc_log_contact_interaction`'s next date
  - direct updates

  They move or create the follow-up task; clearing cancels open follow-ups, keeping history. So the M4 UI, RPCs and tests keep working without change.
- **The contact drawer:**
  - "Done" → `rpc_complete_contact_follow_up`, which completes the task instead of clearing a date
  - "Snooze" → `rpc_set_contact_follow_up`
- **Tests:** M6-09 and the E2E contact follow-up.

## 11. Interview Reminders

- **I3 "Remind me 1 hour before"** is on by default, as in the mockup. It creates a REMINDER task (`due_at = scheduled_at − 60 min`) linked to the interview and application.
- **Rescheduling** shifts it; **cancelling or recording an outcome** cancels it.
- **Afterwards,** "Record outcome" items appear in the queue until the debrief is saved.
- There is no separate reminder table. Rendering follows the profile zone: the E2E shows "Tomorrow · 1:30 PM" with the browser in Berlin.

## 12. Unified Queue

**Sources:**
- pending tasks due by today
- application next actions due by today
- interviews that need an outcome
- quiet applications (31+ days; ADR-027)

**Order:**
1. overdue, then due today, by earliest due
2. timed before all-day on the same day
3. then by priority

**Counts:** header stats and tab counts, computed server-side with head counts.

**Scope:** owner isolation through RLS; the manager owner filter follows D7. The empty state is "All caught up".

**No automatic mutation:** every action goes through its domain RPC.

**Tests:** unit tests (ordering, kinds, profile-zone "today") and E2E (dashboard and tasks).

## 13. Habits

- **Screens:** H1 (Today / All habits / History) and H2 (edit).
- **Cadence:** Daily, Weekdays or Weekly; a target of 1 means yes/no, otherwise a counted target with an optional unit.
- **Pause** keeps history, but paused days count as missed: there is no pause history, so the H2 promise isn't made and the copy says so (§33). **Delete** archives (restorable).
- **Derived at query time:** progress, current streak, best streak (365-day lookback) and the 14-period heat strip, all in `lib/habits.ts` (unit-tested).

## 14. Habit Logs

- **One row per habit and day**, set idempotently by `rpc_set_habit_log`; a count of 0 removes the check-in.
- **Target snapshot** kept per day.
- **Owner's day:** "today" is the owner's profile day; future dates are refused.
- **Durable history:** logs survive pause and archive. There are no direct client writes.
- **Manager check-ins** are attributed to the member and audited.

## 15. week_start Handling

`profiles.week_start` (0 = Sunday, 1 = Monday) is loaded with the time zone and used for:
- weekly habit periods and progress
- the Tasks "Upcoming" week bands
- the M5 interview week bands (fixed; they had assumed Monday)

Tests: unit for both week starts; the E2E shows the week-start note.

## 16. Timezone Handling

- **Instants:** timed items store UTC instants and are shown in `profiles.timezone`.
- **Date-only tasks** store a DATE and never shift.
- **Today's bounds** are the profile's local midnight, DST-safe.
- **Server-side "today"** (habit check-ins, recurrence skip) uses the owner's zone through `app.user_timezone`.
- **Tests:** DST in recurrence (M6-07), zone edge cases (unit), and a browser in Berlin with the profile in Chicago (E2E).

## 17. Manager Experience

A MANAGER can:
- see and act on every member's tasks and habits in the workspace
- filter by owner on the dashboard, tasks and habits
- create tasks for members (the member stays the owner)
- complete tasks and check in for members

Every cross-user mutation is audited. There is no cross-workspace access.

## 18. USER Privacy

A USER sees only their own tasks, habits and logs; peers get 0 rows or `42501`. A task can't link to another USER's application, contact or interview, so tasks can't reveal them. Filtering happens in the database.

## 19. RLS Results

M6-01..05 and M6-12..13:

| Actor / operation | Tasks | Habits and logs |
|---|---|---|
| Own SELECT / INSERT / UPDATE | ALLOW | ALLOW (logs through the RPC) |
| Peer | DENY | DENY |
| Foreign workspace | DENY | DENY |
| MANAGER same workspace | ALLOW, audited | ALLOW, audited |
| MANAGER foreign workspace | DENY | DENY |
| Removed member | DENY | DENY |
| `anon` | DENY | DENY |

## 20. Cross-Workspace Integrity

- Composite FKs `(x_id, workspace_id)` on every task link and on habit logs. A cross-workspace reference fails with `23503`, even for the service role.
- The owner-match guard stops cross-user links within a workspace (`42501`).
- An interview/application mismatch is refused (M6-06).

## 21. Manager Audit

The M4/M5 `app.audit_cross_user_mutation` trigger now also covers `tasks`, `habits` and `habit_logs`. It records in the same transaction, with column names only. Owner actions are not audited. **Read-audit and the audit viewer remain deferred** (user decision) and are **not** claimed.

## 22. Accessibility

- axe WCAG 2.0/2.1/2.2 A+AA, colour contrast on, **asserted 0 critical/serious**.
- 9 M6 contexts, all with 0 violations of any severity.
- Controls:
  - check circles are labelled buttons ("Complete …", "Done, set next: …")
  - segmented controls are radiogroups
  - due-date chips are `aria-pressed` buttons
  - snooze is a menu button
  - the lists are labelled tabpanels
  - habit counters have labelled −/+
- Keyboard: arrows across tabs.
- One contrast issue (the completed row's opacity) was found and fixed without changing tokens.

## 23. Performance

EXPLAIN ANALYZE on 10,000 tasks and 365-day habit logs (`evidence/perf-explain-local.txt`):

| Query | Index | Time |
|---|---|---|
| Overdue | `idx_tasks_ws_due_date` + `idx_tasks_ws_due_at` (bitmap OR) | 0.16 ms |
| Today | the same indexes | 0.02 ms |
| USER-scoped | `idx_tasks_user_queue` | 0.15 ms |
| Drawer | `idx_tasks_application` | 0.04 ms |
| Completed | `idx_tasks_ws_completed` | 0.01 ms |
| Habit window | `uq_habit_logs_date` | 0.55 ms |

- **Bounds:** lists are paged (50); queue sources limited (300 / 200 / 50); habit logs limited to 5,000; counts are head-only.
- **Bundle:** 798 kB JS (was 731 kB), still above Vite's warning; code-splitting is deferred.

## 24. Integration Tests

**101/101 locally and on hosted:** M1B 17, M3 38, M4 10, M4 closeout 9, M5 14, **M6 13**. The hosted transient is described in `M6_TEST_RESULTS.md` §3.

## 25. E2E Tests

**10/10 locally and in CI.** The M6 spec covers:
- tasks route, create (task / follow-up / reminder), edit, complete, recurring task with undo
- linked application, contact and interview
- "Done, set next", snooze, cancel
- unified queue on the dashboard, including Long Waiting review
- habits: create, count, check-in, pause, history
- manager owner filters (personal workspace = MANAGER)
- mobile, keyboard, loading, empty, error/retry
- a11y

## 26. Previous-Milestone Regression

| Area | Result |
|---|---|
| Option B (M1B) | 17/17; leak passes on the preview |
| Applications (M3) | 38/38; E2E passes |
| Contacts (M4) | 10 + 9, with follow-ups now routed through tasks; E2E passes |
| Interviews (M5) | 14/14; E2E passes locally, in CI and on the preview |
| Shell (M2) | 4/4, including axe, with the new top-bar styles |

No existing test was weakened.

## 27. Vercel Preview

| Preview | Code | Result |
|---|---|---|
| `jobquest2-har9s7xwi` | `e3e18d5` | M5, leak and M2 shell ×4: 6/6 PASS. The M6 spec failed on a test race, fixed in `ef9bbff` |
| `jobquest2-jlksvlrqq` | `0a92387` | Health ok, bundle scan 0 findings. Superseded by the pause-copy fix |
| **`jobquest2-8lhec046i`** | `b1ad12f`, final code | Health ok, Environment Preview, deployed-bundle scan 0 findings. **M6 E2E PASS** (`e2e-vercel-preview-6df3fd.json`, a11y 0 in 9 contexts). The M6 visual set was captured on this preview |

A background run scheduled for this check was interrupted when the previous session ended: it had printed only "Running 1 test" and wrote no evidence. The check was run once more in the foreground. An orphaned copy of the interrupted run was still running then and wrote an unrelated failure (a navigation-click timeout) into the same log file. That run left no evidence, and every screenshot's timestamp (16:12–16:13 UTC) belongs to the passing run.

## 28. CI Results

| Run | Commit | Result |
|---|---|---|
| `36145162669` | `0b8f0c9` | PASS |
| `36146690490` | `2e13dba` | PASS |
| `36149400747` | `e3e18d5` | PASS |
| `36150499585` | `ef9bbff` | PASS |
| `36151401228` | `0a92387` | cancelled (superseded) |
| **`36151776339`** | **`b1ad12f` (final code)** | **PASS** (both jobs) |
| — | docs commit | recorded in the hand-off message |

## 29. Secret Hygiene

- `check:bundle` and `check:secrets` (435 files): 0 findings.
- Deployed-bundle scans of both M6 previews (with the real secret key, DB password and signing-key `d`): 0 findings.
- The E2E uses the service key only from the git-ignored env file, for one fixture step.
- Nothing sensitive was staged.

## 30. Visual Regression

`M6_VISUAL_REGRESSION.md` has 13 captures compared with T1–T6, H1–H3 and D1/D2, all matching apart from the documented intentional differences.

The shell polish met the conditions the user set:
- small, and cosmetic
- rules ported from the approved `jq.css`
- regression-covered (M2 shell E2E, including axe)

## 31. Files Created / Modified

- **New:**
  - migration `20260926100000_m6_tasks_habits_queue.sql`
  - `apps/web/src/{api/tasks.ts, api/habits.ts, lib/queue.ts, lib/habits.ts, types/tasks.ts}`
  - views `DashboardView`, `TasksView`, `HabitsView`
  - `components/tasks/{TaskDialog, DoneSetNextDialog, QueueRow, TaskDetailPanel, ReviewActions, ApplicationTasksSection}.tsx`
  - `components/habits/HabitDialog.tsx`
  - tests: `tests/integration/m6-tasks-habits.test.ts`, `tests/unit/m6-queue-habits.test.ts`, `e2e/m6-tasks-habits.spec.ts`
  - `migration-upgrade/m6/*`
- **Modified:**
  - `App.tsx` (routes)
  - `hooks/useProfileTimeZone.ts` (`week_start`)
  - `types/interviews.ts`, `views/InterviewsView.tsx` (`week_start`)
  - `api/interviews.ts`, `components/interviews/ScheduleInterviewDialog.tsx` (reminder)
  - `components/applications/ApplicationDetailDrawer.tsx` (Tasks card, Done-set-next)
  - `views/ContactsView.tsx` (follow-up Done/Snooze through tasks)
  - `components/shell/{Sidebar, MobileNav, Topbar}.tsx`
  - `styles/globals.css` (M6 styles and Direction D top bar)
  - `.github/workflows/m1b-ci.yml`
  - M5 reports (closeout decisions)

## 32. Deviations

1. **Task due fields:** `due_date` is DATE with a separate `due_at` instant, rather than one TIMESTAMPTZ `due_date`.
2. **Task link and anchor:** `interview_id` and `recurrence_anchor` added to tasks.
3. **Habits additions:** WEEKDAYS cadence, `description`, `unit_label` and `archived_at`, from the approved H2 / FORM_SPEC.
4. **Habit log target:** `target_count` snapshot on habit_logs, per H2.
5. **Streaks:** TARGET_SCHEMA's stored `current_streak`/`best_streak` are **omitted**; streaks are derived (UI spec §8.1).
6. **M5 RPC recreated:** `rpc_schedule_interview` dropped and recreated with an extra parameter. The body is otherwise identical.
7. **M4 RPCs unchanged:** `rpc_create_contact` and `rpc_log_contact_interaction` are not edited. Their writes to `next_follow_up_date` are routed by a trigger.
8. **Quiet threshold:** 31+ days (spec), not the D1 mockup's "28+".
9. **Home route:** `/` stays Applications; the Dashboard is `/dashboard`.
10. **Preview M3 E2E not re-run** (register limit); covered locally and in CI.

## 33. Remaining Questions

1. Should the dashboard become the home route (`/`), as the approved navigation implies?
2. Should the T4 follow-up channel and status sub-states and the settings-based suggested dates (legacy follow_ups, S6) be modelled?
3. Should reminder categories (T1) be built?
4. When an application is closed, should pending tasks be cleared (FORM_SPEC "Clear all pending next actions")?
5. Should real notification and badge counts appear in the shell?
6. Should paused periods be recorded, so paused habits don't break streaks as the H2 mockup promises? There is no pause history today, so paused days count as missed. The UI copy says so honestly instead of making the approved promise.

## 34. Deferred Work

- Journal and goals.
- Analytics cards on the dashboard.
- Calendar view.
- Reminder categories.
- Follow-up channel/status and suggestions.
- Notifications and delivery of reminders (reminders are queue items only).
- Swipe gestures.
- Code-splitting.
- Read-audit and the audit viewer; the networking checklist; participant → contact conversion (all user decisions).

## 35. Recommended Next Milestone

**M7: Documents & Resumes**, per the `m3/README.md` §3 sequence. **Not started**; it needs explicit approval.

## 36. Git Status

- Branch pushed.
- Working tree clean apart from local-run evidence at report time; its disposition is in the hand-off.
- The final docs commit and its CI run are listed in the hand-off message.

## 37. Final Recommendation

M6 meets its acceptance criteria with evidence. I recommend a user review of this report, `M6_VISUAL_REGRESSION.md` and the questions in §33, then an explicit merge decision. **Do not merge automatically. Do not start M7.**
