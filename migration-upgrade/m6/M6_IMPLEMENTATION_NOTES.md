# M6: Implementation Notes

## 1. Schema (`supabase/migrations/20260926100000_m6_tasks_habits_queue.sql`)

### `public.tasks` (TARGET_SCHEMA #16)

**Columns:**
- `workspace_id`, `user_id` (owner)
- `application_id`, `contact_id`, `interview_id`
- `task_type` TASK | FOLLOW_UP | REMINDER
- `title` (1–255, trimmed), `details` (≤5,000)
- **`due_date` DATE** or **`due_at` TIMESTAMPTZ**, at most one
- `priority` LOW | MEDIUM | HIGH
- `status` PENDING | COMPLETED | CANCELLED, `completed_at`
- `recurrence_rule` DAILY | WEEKDAYS | WEEKLY | BIWEEKLY | MONTHLY, `recurrence_anchor`, `parent_task_id`
- `created_at`, `updated_at`, `legacy_id`

**Rules enforced by the database:**
- a REMINDER needs a due date or time
- a FOLLOW_UP needs a link
- recurrence needs a due date
- COMPLETED ⇔ `completed_at` is set
- composite FKs to applications, contacts, interviews and the parent task, all within the same workspace
- `uq_tasks_parent`: a task has at most one next instance

**Deviations from TARGET_SCHEMA:**
- `due_date` is DATE, plus a separate `due_at` TIMESTAMPTZ. A date-only task never shifts through UTC conversion, while timed reminders keep their exact instant.
- `interview_id` is added. The approved T4/REM-001 say a follow-up can belong to "an application, interview or contact".
- `recurrence_anchor` is added so a monthly series keeps its day (Jan 31 → Feb 28 → Mar 31).

**Indexes:**
- partial `(workspace_id, due_date)` / `(workspace_id, due_at)` WHERE PENDING
- `(workspace_id, user_id, status)`
- `(workspace_id, completed_at DESC)` WHERE COMPLETED
- application, contact and interview link indexes

### `public.habits` / `public.habit_logs` (TARGET_SCHEMA #17/#18)

**habits:**
- `title` ≤64, `description` ≤500 (H2)
- `frequency` DAILY | **WEEKDAYS** | WEEKLY
- `target_count` 1–100, where 1 means yes/no (H2)
- `unit_label` ≤20 (FORM_SPEC 7.1)
- `is_active` (pause)
- `archived_at` ("Delete" in H2 = archive-first)

**habit_logs:**
- `log_date` DATE in the owner's zone
- `completed_count`
- **`target_count` snapshot**, taken at first check-in: "Changing the target doesn't rewrite past days"
- UNIQUE `(habit_id, log_date)`

**Deviation:** TARGET_SCHEMA's stored `current_streak`/`best_streak` are **not** added. Gate 02B §8.1 requires streaks "dynamically derived at query time … based on user's timezone", and stored counters drift.

## 2. One canonical reminder model

| Intent | Stored as | Contract |
|---|---|---|
| Stand-alone task / reminder | `tasks` | Direct Data API create/edit of simple fields. Completion, cancellation and undo go through RPCs. |
| Application follow-up | `tasks` (FOLLOW_UP, `application_id`) | Completion writes a `FOLLOW_UP` application event and bumps `last_activity_at`. |
| **Application next action** | `applications.next_action/next_action_date` (M3) | The application's single current next step, shown in the queue as a "Next action" item (approved T1/T2). "Done, set next" = `rpc_complete_next_action`: completes it, sets the next one and writes `NEXT_ACTION_CHANGED`, atomically. **Not copied into tasks**, so there is one source of truth. |
| **Contact follow-up** | `tasks` (FOLLOW_UP, `contact_id`) | `contacts.next_follow_up_date` = trigger-maintained projection (earliest pending FOLLOW_UP due date). Writes to the column route through `app.route_contact_follow_up` into `app.set_contact_follow_up`, which moves or creates the task; clearing it cancels. The contacts UI uses `rpc_set_contact_follow_up` and `rpc_complete_contact_follow_up`. Existing dates were backfilled as tasks (5 on hosted). |
| **Interview reminder** | `tasks` (REMINDER, `interview_id` + `application_id`) | `rpc_schedule_interview(..., p_remind_before_minutes)` creates it; I3 has "Remind me 1 hour before" (default on). A reschedule shifts `due_at` by the same amount; an outcome cancels it. |
| Interview awaiting an outcome | `interviews` (M5) | Shown in the queue as "Record outcome"; opens the M5 debrief. |
| Quiet application (31+ d) | `applications.last_activity_at` (M3) | Review list only. Keep / Mark Ghosted / Archive through the M3 RPCs. Nothing happens automatically. |

There is no `interview_reminders` table, no application reminder table and no separate contact reminder store.

## 3. RPCs (SECURITY DEFINER, `search_path=''`, `anon` revoked)

| RPC | Behaviour |
|---|---|
| `rpc_complete_task(id)` | PENDING → COMPLETED. For a recurring task, creates the next instance in the same transaction (`ON CONFLICT (parent_task_id) DO NOTHING`). A FOLLOW_UP on an application also writes an event. Returns `{task_id, next_task_id}` |
| `rpc_reopen_task(id)` | Undo: COMPLETED → PENDING and deletes the untouched auto-generated next instance. `TASK_REOPEN_CONFLICT` if that instance was changed or completed |
| `rpc_cancel_task(id)` | PENDING → CANCELLED. The archive-first "delete"; there is no DELETE grant |
| `rpc_complete_next_action(app, next?, date?)` | "Done, set next" |
| `rpc_set_contact_follow_up(contact, date?)` / `rpc_complete_contact_follow_up(contact)` | Contact follow-up actions |
| `rpc_schedule_interview(..., p_remind_before_minutes)` | M5 RPC recreated with the reminder parameter (old signature dropped) |
| `rpc_set_habit_log(habit, date, count)` | Idempotent per day. 0 removes the check-in. Refused for future dates in the owner's zone, dates older than 366 days, paused and archived habits |
| `rpc_archive_habit` / `rpc_restore_habit` | Archive keeps logs |

## 4. Recurrence engine (`app.task_next_occurrence`)

- Steps: DAILY +1; WEEKDAYS the next Monday–Friday; WEEKLY +7; BIWEEKLY +14; MONTHLY is anchor + n months (Postgres clamps to the end of the month).
- **No stacked overdue copies:** it keeps stepping until the next date is on or after today in the owner's zone.
- **Timed items** keep their local wall-clock time. For example, 09:00 CDT → 09:00 CST across the fall-back change (15:00Z).
- A user reschedule re-anchors the series; the completion copy carries the anchor forward.
- **No legacy recurrence existed:** JobQuest1.0 had none (CR-015 is new in 2.0), so there was nothing to preserve.

## 5. Authorization and audit

- **RLS:** `can_access_owned_record(ws, user_id)` for SELECT/UPDATE. INSERT is allowed for self, or for a MANAGER creating for a member.
- **Grants:**
  - column-level INSERT/UPDATE of simple fields only
  - status, completion, ownership and series links are RPC-only
  - no DELETE on any M6 table
  - `habit_logs` is SELECT-only
- **Link guard:** `app.guard_task` rejects links to records owned by someone else (`TASK_LINK_FORBIDDEN`). An interview link implies its application (`TASK_LINK_MISMATCH` otherwise).
- **Audit:** `app.audit_cross_user_mutation` on `tasks` (TASK), `habits` (HABIT) and `habit_logs` (HABIT_LOG). It records cross-user mutations only. **Read-audit stays deferred** (user decision).

## 6. Time zone and week start

- Dates and times are always in `profiles.timezone`.
- `useProfileTimeZone` now also returns `week_start` (0 = Sunday, 1 = Monday).
- Date-only tasks are never converted.
- "Today" query bounds are the profile's local midnight in UTC (`todayBounds`, DST-safe). The server's "today" for habit check-ins is `now()` in the owner's zone.
- Weekly habits and the Upcoming week bands follow `week_start`. This also fixes M5's interview week bands, which assumed Monday.

## 7. UI

| Surface | File |
|---|---|
| D1 dashboard (queue, interviews, quiet review; manager owner filter) | `views/DashboardView.tsx` |
| T1/T2/T5 tasks | `views/TasksView.tsx`, `components/tasks/TaskDetailPanel.tsx`, `QueueRow.tsx` (row + shared actions: complete with 8-second Undo, snooze, cancel, Done-set-next, Record outcome) |
| T3/T4/T6 create/edit | `components/tasks/TaskDialog.tsx` |
| "Done, set next" | `components/tasks/DoneSetNextDialog.tsx` |
| Review actions | `components/tasks/ReviewActions.tsx` |
| Application drawer Tasks card and Done-set-next | `components/tasks/ApplicationTasksSection.tsx`, `ApplicationDetailDrawer.tsx` |
| H1/H2/H3 habits | `views/HabitsView.tsx`, `components/habits/HabitDialog.tsx` |
| Pure logic (unit-tested) | `lib/queue.ts`, `lib/habits.ts`, `types/tasks.ts` |

- **Shell:**
  - removed the hard-coded Tasks badge "2" and "Notifications: 2 unread"
  - Dashboard/Today nav → `/dashboard`
  - Direction D `.hdr/.crumb/.search/.kbd/.bell/.nav-head` styles ported from the approved `jq.css`
- `/` still opens Applications, which is where the M3–M5 flows start. Making the dashboard the home route is an open question.
