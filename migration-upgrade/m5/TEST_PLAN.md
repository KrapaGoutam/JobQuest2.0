# M5: Test Plan

## Integration (`tests/integration/m5-interviews.test.ts`)

These run against the real Supabase stack with Option B tokens.

Actors:
- alice, bob: USER
- charlie: MANAGER of the shared workspace
- dave: MANAGER of a foreign workspace
- eve: a USER who is later removed

| ID | Scenario (prompt §37–§39) |
|---|---|
| M5-01 | USER schedules on own application.<br>• The interview, its participants and the prep/question fields are stored.<br>• `INTERVIEW_SCHEDULED` is written.<br>• `last_activity_at` advances.<br>• **The stage is unchanged.**<br>• The next round is numbered automatically.<br>• An offset timestamp is stored in UTC. |
| M5-02 | USER can SELECT their own interview and UPDATE its simple fields; text edits write no event.<br>Blocked with `42501`: `outcome`, `completed_at`, `user_id`, `workspace_id`, `application_id`, and any INSERT or DELETE. |
| M5-03 | Peer USER is denied: SELECT and UPDATE return 0 rows; both RPCs and participant links return `42501`, in both directions. |
| M5-04 | MANAGER in the same workspace can read, edit and schedule for a member. The member stays the owner. Audit rows are written with column names only. |
| M5-05 | Foreign workspace is denied in both directions. |
| M5-06 | Cross-workspace forgery fails with `23503`, even as the service role. A participant who belongs to another user returns `42501`, and the whole schedule rolls back. A manager can't link their own contact. |
| M5-07 | A removed member loses SELECT, UPDATE and RPC access immediately. |
| M5-08 | Debrief:<br>• outcome, `completed_at`, `INTERVIEW_COMPLETED` written once per result change<br>• an unchanged re-save writes no event<br>• the next action is replaced<br>• **the stage never moves automatically** |
| M5-09 | An explicit stage move from schedule and from debrief goes through the workflow RPC, with events in order. |
| M5-10 | Rollback:<br>• `STAGE_UNCHANGED` inside the schedule leaves no interview and no event<br>• invalid type: `23514`<br>• a result before the interview starts: `INTERVIEW_NOT_YET_HELD`<br>• an invalid stage rolls the outcome back<br>• cancel writes no event and sets no `completed_at`<br>• invalid outcome is rejected |
| M5-11 | A new interview can't be added to an archived or closed application. |
| M5-12 | Time zone:<br>• a valid IANA name is accepted<br>• an invalid name returns `22023`<br>• the ambiguous fall-back hour is stored as its first occurrence in UTC |
| M5-13 | The owner's debrief is not audited; a manager's debrief is (`outcome` in the metadata). |
| M5-14 | `anon` is denied on the tables and RPCs. |

## Unit (`tests/unit/m5-time.test.ts`)

- Conversion around the Chicago spring-forward gap (rejected) and fall-back overlap (first occurrence).
- London's different DST dates.
- Kolkata (+5:30), and Lord Howe's 30-minute DST.
- A round trip across a DST week.
- Display in each profile zone, and day keys.
- IANA validation and the time-zone picker list.

## E2E (`e2e/m5-interviews.spec.ts`, browser time zone Europe/Berlin)

1. Register (Option B). The switcher shows the real role.
2. Create an application at Recruiter Screen, and a contact.
3. Visit `/interviews` and see the empty state.
4. Schedule with the Chicago profile zone and **Keep** stage, with participant, prep and questions. The row shows `2:30 PM`.
5. Schedule on 2 Nov and see **CST**. A spring-forward gap time is rejected.
6. Detail panel: edit prep notes inline; edit the time through the Edit dialog.
7. Switch the profile zone to Kolkata and see `1:30 AM` on the next day; switch back. The browser zone plays no part.
8. Capture light, dark and the manager (owner filter) view.
9. Application drawer:
   - the Interviews card
   - schedule with an explicit **Move to Interview**
   - the timeline shows the stage change and "Interview scheduled"
10. Debrief from the drawer:
    - Advanced, questions, notes, next step, thank-you
    - the next action is replaced
    - "Panel completed: Advanced" appears
    - there is no further stage move
11. Past tab and debrief detail.
12. Keyboard: arrow keys across the tabs; Enter opens a row.
13. Error state: the request is aborted; retry works; the previous tab's rows are never shown.
14. Mobile at 390×844: no horizontal overflow; the I5 sheet with **Join video**; Escape closes it.
15. axe (WCAG 2.0/2.1/2.2 A and AA, colour contrast on) over:
    - schedule form
    - interview detail
    - list, light and dark
    - debrief form
    - application drawer
    - mobile interview

    Expected: **0 critical and 0 serious**, asserted by the test.

## Regression

- M1B 17, M3 38, M4 10 and M4 closeout 9 integration tests, locally and on hosted.
- E2E: leak (B03/B11/B12), M2 shell, M3, M4 (a11y now asserted).
- The same suites again on the preview (see `M5_TEST_RESULTS.md`).

## Performance

EXPLAIN ANALYZE of the upcoming, needs-outcome (USER-scoped), count and drawer queries on a 5,000-interview fixture: every query must use an index.
