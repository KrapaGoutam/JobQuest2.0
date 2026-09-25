# M6: Visual Regression

**References:**
- Gate 02B `mockups/04-tasks.html` (T1–T6)
- `mockups/06-habits-journal.html` (H1–H3)
- approved Direction D dashboard screenshots `ui-design/approved/screenshots/dashboard-desktop-light.png` and `dashboard-mobile.png` (D1/D2)

Approved tokens are unchanged.

**Captures:** `migration-upgrade/m6/screenshots/`, taken by `e2e/m6-tasks-habits.spec.ts`. 1440×900 desktop, 390×844 mobile, browser zone Europe/Berlin, profile zone America/Chicago. All 12 were captured on the **final Vercel preview** `jobquest2-8lhec046i` (`b1ad12f`) against hosted `jobquest-dev`, run `6df3fd`, 16:12–16:13 UTC.

| Screenshot | Frame | Comparison | Verdict |
|---|---|---|---|
| `tasks-list-light.png` | T1 | Title "Tasks & Follow-ups" with "N need attention · N upcoming" and **New follow-up / New task**. Tabs Overdue · Today · Upcoming · No date · Completed with counts. Type chips including **Next actions**, and the owner filter (manager). OVERDUE and DUE TODAY bands. Rows: check circle · title / linked record · type pill · priority bars · due chip (red overdue, amber today) · **Snooze**. | Matches |
| `tasks-list-dark.png` | T2 (dark) | Same, in dark tokens. | Matches |
| `task-detail.png` | T2 panel | FOLLOW-UP header with edit and close. Title, overdue banner when due, Linked to / Due / Priority / Repeat, and Complete / Edit / Cancel task. A next-action item shows the "This is the application's **next action**…" banner with **Done, set next** / Mark Ghosted / Archive. | Matches |
| `task-new-recurring.png` | T3 | Task / Follow-up / Reminder segments, Title, Linked to, Priority Low/Medium/High, due chips (Today, Tomorrow, Next week, No date), Date / Time / Repeat, and the **Recurring** banner ("When you complete it, the next one is created for …"), Notes. | Matches (see differences) |
| `task-new-follow-up.png` | T4 | "Follow up on" is required ("An application, interview or contact."), with due chips. | Matches (see differences) |
| `task-done-set-next.png` | C10 (INTERACTION_SPEC 2.3) | Next action, the Tomorrow / In 1 week / In 2 weeks chips, Due, and "No next action needed". | Matches |
| `dashboard-light.png` | D1 | Date line and "What needs attention today" with overdue / due today / interviews this week / to review. **Today's queue** (overdue, then due today) with All tasks. **Upcoming interviews** (date tile, company, type · round, time, format). **Review quiet applications** with Keep / Mark Ghosted / Archive and "Suggestions only. Nothing is archived automatically." The Direction D top bar (breadcrumb, Manager badge, search with `/`, bell) and uppercase sidebar group labels. | Matches (see differences) |
| `dashboard-mobile.png` | D2 | The same sections stacked at 390 px with the bottom navigation ("Today" opens the dashboard). | Matches (see differences) |
| `habits-light.png` | H1 | "Habits · date · N of N done", **New habit**. Today / All habits / History. Rows: yes/no circle or the n/target tile, name · cadence · target, progress (− n / t +), 🔥 streak, the 14-period heat strip, edit. The legend "Weekly habits use your week start (Monday). Streaks look back up to 365 days." | Matches |
| `habit-edit.png` | H2 | Name, Description, Frequency Daily/Weekdays/Weekly, Target per period (− n +) with "1 = simple yes/no habit.", Active, "Changing the target doesn't rewrite past days.", Delete / Cancel / Save. | Matches, except the pause copy (see differences) |
| `tasks-mobile.png`, `habits-mobile.png` | T5 / H3 | Tabs and filters wrap; rows collapse to two lines; no horizontal overflow (0 px). | Matches (see differences) |

## Intentional differences

1. **Not built yet:**
   - T1 "Reminder categories" and "Group by": categories need user settings.
   - T4 Channel, the follow-up status sub-states (Sent · Waiting · Responded …) and "Suggested from your settings": these come from the legacy follow_ups table and settings (S6), which are not in the approved target schema.
   - D1 bottom row (Recent activity, Current pipeline, Historical funnel): analytics milestone.
   - T5 swipe gestures: buttons give the same actions.
2. The **quiet-application review uses 31+ days**, per ADR-027 / OQ-022 / INTERACTION_SPEC 2.4. The D1 mockup says "28+ days".
3. **`/` still opens Applications.** Dashboard/Today in the navigation open `/dashboard`. Making the dashboard the home route is a product decision.
4. **Habit "Delete" archives** (archive-first), with a confirmation. History is kept and archived habits can be restored from History.
5. **H2 pause copy changed.** The mockup says paused habits "don't break streaks", but no pause history exists to honour that. The copy now reads "Paused habits keep their history. Days while paused count as missed for streaks." Open question in the completion report §33.
6. The fake counts the approved screenshots show (Tasks badge, bell "4") are **not** faked. The badge was removed; real counts need notification and queue plumbing.

## Shell polish (non-blocking M2 observation, now done)

- The top bar (`.hdr`, `.crumb`, `.search`, `.kbd`, `.bell`) and sidebar group labels (`.nav-head`) use rules ported from the approved `mockups/assets/jq.css` to tokens.
- Coverage:
  - the M2 shell E2E (4 tests, including the axe audit) passes
  - every M6 capture shows the styled bar
- The approved M2–M5 baseline screenshots in git were **not** re-captured. E2E runs regenerate them, and they are restored after each run, so those baselines still show the old unstyled header.
