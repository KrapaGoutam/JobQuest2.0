# M6: Implementation Plan (as executed)

## Scope sources

- **Milestone sequence:** `m3/README.md` §3 lists "Tasks, Habits & Unified Queue (Milestone 6)". `docs/IMPLEMENTATION_PLAN.md` uses the older Gate 01 numbering, and there was no `m6/` planning package.
- **Gate 03:** TARGET_SCHEMA #16–18 and `AUTHORIZATION_RLS_DESIGN.md` Tier 2.
- **Gate 02B specs:**
  - `GATE_02B_UI_SPEC.md` §4.5, §6, §8.1
  - `FORM_SPEC.md` 5.1 and 7.1
  - `INTERACTION_SPEC.md` 2.3, 2.4 and 4.1
- **Mockups:** `04-tasks.html` (T1–T6), `06-habits-journal.html` (H1–H3), approved dashboard screenshots (D1/D2).
- **Decisions:** `DECISIONS.md` ADR-020, ADR-023, ADR-027; the M5 review decisions (interview reminders move to M6).

## Phases

| Phase | Work | Status |
|---|---|---|
| 0 | M5 final verification, docs, `--no-ff` merge into development (`0b8f0c9`), branch | Done |
| 1 | Migration: tasks, habits, habit_logs, RLS/grants, recurrence engine, RPCs, contact follow-up projection and routing, interview reminders, audit | Done (local and hosted) |
| 2 | Integration suite M6-01..13 | 13/13 local, 13/13 hosted |
| 3 | Pure logic (queue, due states, habits, `week_start`) plus unit tests | 14/14 |
| 4 | UI: dashboard, tasks, habits, dialogs, drawer card, contact and interview integrations | Done |
| 5 | Shell: fake badges removed, dashboard nav, Direction D top bar | Done |
| 6 | E2E, performance, CI | Done |
| 7 | Preview and docs | See `M6_TEST_RESULTS.md` |

## Not in M6

- Journal (J1–J3).
- Goals.
- Analytics: the dashboard's pipeline, funnel and recent-activity cards belong to analytics.
- Calendar view.
- Reminder categories (settings).
- Follow-up channel and status sub-states from the legacy follow_ups table (T4).
- Suggested follow-up dates from settings (S6).
- Notifications.
- The "clear pending next actions on close" option in the outcome dialog.
