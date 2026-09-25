# M5: Visual Regression

**Reference:** Gate 02B `ui-design/gate-02b/mockups/05-interviews.html`, frames I1–I5, together with the approved Direction D tokens (unchanged in M5).
**Captures:** `migration-upgrade/m5/screenshots/`, taken by `e2e/m5-interviews.spec.ts` on the **Vercel preview** `jobquest2-eq3zy6rxb` against hosted `jobquest-dev`, run `d40720`. Local runs produce the same layout.
**Settings:** 1440×900 desktop, 390×844 mobile, browser zone Europe/Berlin, profile zone America/Chicago.

| Screenshot | Gate 02B frame | Comparison | Verdict |
|---|---|---|---|
| `interviews-list-light.png` | I1 (light) with I2 open | Title with "N upcoming · N needs outcome" and **Schedule interview**. Tabs Upcoming / Needs outcome / Past with counts. Week bands (NEEDS OUTCOME, THIS WEEK, NEXT WEEK, LATER, RECENT). Rows: date tile · company · role, type · round · participants, time · format, status pill ("Prep notes added" / "Outcome needed" / result), Open or **Record outcome**. The I2 panel sits on the right (420 px). | Matches |
| `interviews-list-dark.png` | I2 (dark) | Same layout in dark tokens. The selected row uses the accent tint and a left bar. | Matches |
| `interview-schedule.png` | I3 | Application, type, round, date, time, duration. Help text: "Times are in America/Chicago (CDT), your profile time zone. **Change**". Format segments with a meeting link. Participants (contact chips plus "Other participants" free text). Preparation notes and questions expected. **Application stage: Keep at Recruiter Screen / Move to Interview**, with "Nothing changes automatically". Footer: 'Adds "Interview scheduled" to the timeline.' | Matches (see differences) |
| `interview-detail.png`, `interview-preparation.png` | I2 | INTERVIEW header with edit and close. Type · round, company · role. When "Mon, Sep 28 · 3:00 PM–3:30 PM CDT", Format "Video · Join link", Status. Participants chips. **Preparation notes** and **Questions expected** as editable multiline text (no checklist). | Matches |
| `interview-debrief.png` | I4 | "How did it go?" with the type · round · company · date subtitle. Result segments Completed · waiting / Advanced / Rejected / Cancelled / moved. Participants. Next step they mentioned. Questions they asked. Notes ("Saved to the interview and shown on the application timeline."). Follow-up: Thank-you note (Not needed / To send / Sent) and Next action ("Replaces the application's next action."). An optional application-stage selector defaults to **Keep**. Footer: 'Adds "Panel completed" to the timeline.' | Matches (see differences) |
| `application-interview-section.png` | ADR-020 drawer "Interviews" card | The application drawer shows **Interviews · 3** with type · round, zone-labelled slots (CDT and CST), result and Upcoming pills, and Debrief / Record outcome. The timeline shows "Panel completed: Advanced", "Stage: Recruiter Screen → Interview" and "Interview scheduled: …". The next action box reads "Send thank-you note". | New integration, consistent with the M3 drawer |
| `interviews-manager-view.png` | I1, manager | The **Owner** filter appears for a MANAGER (the personal-workspace creator). The switcher shows **MANAGER**. | Matches |
| `interviews-mobile.png` | Mobile list | Stacked rows (tile · title · Open / time · format · status). Filters wrap. No horizontal overflow (0 px). Bottom nav. | Matches |
| `interview-mobile-detail.png` | I5 | Bottom sheet: title · round, company, When, Format · Join link, Participants, Preparation notes, Questions expected, and the **Join video** / Edit / Cancel or move actions. | Matches (sheet instead of a full page) |

## Intentional differences from the mockup

1. **No reminder checkbox or banner.** I3 "Remind me 1 hour before" and the I2 reminder banner need the tasks/reminders engine (a later milestone), so M5 promises nothing it can't deliver.
2. **No "Calendar" button.** The V4/V5 calendar view is assigned to a later milestone.
3. **"Round 1 of ~4".** There is no total-rounds field in the approved schema, so the round shows as "round N".
4. **Participants in I4 are read-only.** They are edited in I3/I2.
5. **I5 is a bottom sheet** (the shared `Drawer` / `m-sheet`) rather than a separate route, with the same content and actions.
6. **A stage selector in I4.** The spec says the explicit stage move may be offered separately; it defaults to Keep and never moves the stage automatically.

## Pre-existing shell issues visible in the captures (not introduced by M5)

- The top-bar classes (`.hdr`, `.crumb`, `.bell`, `.mgr-badge`, the search box) have no CSS rules, so the header renders unstyled. This has been so since M2 and shows in the approved M2/M3/M4 screenshots. Logged for a shell pass.
- The sidebar group labels ("Track", "Insights", "Workspace") are unstyled.
- Now visible because of the M5 switcher fix: the top bar shows the (unstyled) "Manager" badge for managers.

The approved M2/M3/M4 baseline screenshots were not changed. E2E runs regenerate them, and they were restored after each run.
