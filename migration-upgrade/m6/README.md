# Milestone 6: Tasks, Habits & Unified Queue

Branch: `feature/m6-tasks-habits-queue`, created from `development` at `0b8f0c9` (`merge: approve M5 interviews and debriefs`).
Status: **implemented and awaiting user review**. It is not merged, and M7 has not started.

## What M6 delivers

- **One reminder system.** `public.tasks` (TASK / FOLLOW_UP / REMINDER) is the only store for reminders and follow-ups. A task can link to an application, contact or interview; composite tenant FKs keep those links in the same workspace, and each link must belong to the task's owner.
  - **Application next actions:** `applications.next_action` stays the application's single current next step, as in the approved T1/T2 "Next action" row type. It is completed with "Done, set next" and never copied into tasks.
  - **Contact follow-ups:** `contacts.next_follow_up_date` is now a projection of the contact's pending FOLLOW_UP tasks. Every write to it is routed into tasks.
  - **Interview reminders:** the reminder M5 deferred is now a REMINDER task. It follows reschedules and is cancelled once the interview has an outcome.
- **Recurrence** (ADR-023): Daily, Weekdays, Weekly, Every 2 weeks, Monthly.
  - Wall-clock time is kept in the owner's time zone, and a monthly series keeps its day.
  - An overdue task skips ahead instead of stacking copies.
  - Each completion creates exactly one next instance, and Undo withdraws it.
- **Unified queue:**
  - `/dashboard` (approved D1): overdue, then due today, from tasks, next actions and interviews that need an outcome. It also shows upcoming interviews and a Long Waiting (31+ days) review with Keep / Mark Ghosted / Archive through the M3 RPCs.
  - `/tasks` (T1–T6): Overdue · Today · Upcoming · No date · Completed.
- **Habits** (H1–H3):
  - Daily, Weekdays and Weekly cadences; yes/no or counted targets.
  - Streaks and the 14-period heat strip are derived at query time.
  - Check-ins are one per day and idempotent. Pause and archive both keep history.
  - Weekly progress follows `profiles.week_start`.
- **Access and audit.** RLS is OWNER SCOPED / MANAGER OVERRIDE; peers, foreign workspaces, removed members and `anon` are denied. Manager edits of tasks, habits and habit logs are audited.
- **Shell fixes.** The fake "2" badges are gone, Dashboard/Today opens the dashboard, and the Direction D top bar and sidebar labels are styled.

## Files

| File | Purpose |
|---|---|
| `M6_COMPLETION_REPORT.md` | Full report (37 sections) |
| `M6_TEST_RESULTS.md` | Every suite and its evidence |
| `M6_VISUAL_REGRESSION.md` | Screenshots compared with 04-tasks, 06-habits and the approved D1 |
| `M6_IMPLEMENTATION_NOTES.md` | Schema, contracts, RPCs, recurrence, habits, UI |
| `M6_INFRASTRUCTURE.md` | Supabase `jobquest-dev`, Vercel preview, CI |
| `IMPLEMENTATION_PLAN.md`, `TEST_PLAN.md`, `ACCEPTANCE_CRITERIA.md` | Plan and criteria |
| `NEXT_AGENT_HANDOFF.md` | For the next agent |
