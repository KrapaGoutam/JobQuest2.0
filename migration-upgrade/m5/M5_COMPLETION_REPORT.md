# JOBQUEST2.0 — M5 COMPLETION REPORT

## 1. Status

**M5 Interviews & Debriefs is IMPLEMENTED, TESTED, DEPLOYED TO PREVIEW and awaiting user review.** It is not merged, and M6 has not started.

| Item | State |
|---|---|
| Branch | `feature/m5-interviews-debriefs`, from `development` `caf9f33` |
| Code HEAD | `6a469ed`; the docs commit follows it (§35) |
| CI | **green** on `6a469ed` (run `36106977932`) |
| Supabase `jobquest-dev` | `20260925200000_m5_interviews_debriefs` applied |
| Vercel preview | `jobquest2-eq3zy6rxb-one-piece-5779.vercel.app`: health ok, E2E PASS |
| Production | none |

## 2. Executive Summary

Interviews are now first-class, workspace-safe records linked to applications.

- **Scheduling** takes the type, round, date and time in the user's profile time zone (DST-safe), duration, format, link or location, participants (M4 contacts or free text), and the verified legacy fields `preparation_notes` and `questions_expected` (no checklist).
- **The debrief** records the result, questions asked, notes, the next step, thank-you status and an optional next-action replacement.
- **Neither scheduling nor the debrief changes the application stage.** An optional, explicit stage move runs the existing workflow RPC in the same transaction.
- **Timeline events** are written only for meaningful changes.
- **RLS** is OWNER SCOPED / MANAGER OVERRIDE, and manager cross-user mutations are audited.
- **The UI:**
  - covers the approved I1–I5 frames and an Interviews card in the application drawer
  - reports 0 accessibility violations
  - uses indexed, bounded queries
- **Bugs found and fixed during M5:**
  - a stale-tab rendering issue
  - a dialog-reset bug that only showed up in CI
  - legacy ICU zone names in the time-zone picker
  - a workspace switcher that had never been connected (present since M2)
  - the M4 E2E never asserted its a11y results

## 3. Git / Branch

`caf9f33` (development, M4 merged) → the branch, with these logical commits:

| Commit | Content |
|---|---|
| `328385e` | feat(m5): schema, RLS, RPCs, audit, time-zone validation, integration suite |
| `9e826be` | fix(shell): workspace switcher bound to the loaded memberships |
| `1a0fe90` | test(m4): assert zero critical/serious axe findings |
| `d129933` | feat(m5): UI I1–I5, drawer integration, time zones, unit/E2E, CI |
| `ddc90df` | test(m5): dialog error reporting; CI failure context |
| `6a469ed` | fix(m5): parent re-render must not reset the schedule dialog |
| docs | `docs(m5): …` (reports, evidence, screenshots) |

There was no reset, rebase, force-push or squash. Nothing was merged. `main` is untouched.

## 4. M4 Integration

- **Final consistency audit and fixes:** see `m4/M4_COMPLETION_REPORT.md` §3.
- **Merged:** `git merge --no-ff feature/m4-contacts-networking -m "merge: approve M4 contacts and networking"` produced `caf9f33`, which was pushed.
- **CI:**
  - development: `36103536454` PASS
  - M4 docs commit: `36103512923` PASS
  - final M4 code `1e2b42b`: `36102911035` PASS
- **Development was verified:**
  - the tree is identical to the approved M4 branch
  - it contains Option B, the M2 shell, M3, M4 (companies, contacts, interactions, links, RLS, closeout migration), the tests and the reports
  - no secret files are tracked
- **M4 preview E2E (open at M4 closeout):** **PASS** on the final M4 preview `jobquest2-ctu0qz2yx` (`1e2b42b`) once the register window reset. Evidence: `m4/evidence/e2e-contacts-4f94e9.json`, target vercel-preview.

## 5. Database Changes

Migration `20260925200000_m5_interviews_debriefs.sql`, additive, with no applied migration edited:

- **Tables:** `interviews`, `interview_contacts`
- **Indexes:** 4 on interviews, 1 on interview_contacts
- **RLS:** SELECT/UPDATE policies on interviews; SELECT/INSERT/DELETE on interview_contacts
- **Grants:** SELECT plus column-level UPDATE on interviews; no client INSERT or DELETE
- **RPCs:** `rpc_schedule_interview`, `rpc_record_interview_outcome`
- **Triggers:**
  - `updated_at`
  - audit on both new tables (the audit function was replaced to handle them)
  - `app.validate_profile_timezone` on profiles

## 6. Interview Data Model

- **TARGET_SCHEMA #12** columns, plus `questions_asked`, `next_step` and `thank_you_status`. These have approved-UI support (I4) and legacy support.
- **Outcome** adds `CANCELLED`.
- **Interview types:** the approved list plus the legacy Behavioral, Coding and Final.
- **Constraints:** composite FK to applications, completion consistency, length limits.
- Details in `M5_IMPLEMENTATION_NOTES.md` §1.

## 7. Scheduling

`rpc_schedule_interview`:
- requires an open, unarchived application
- sets the owner to the application owner
- numbers the round as the next one by default
- validates participants
- writes `INTERVIEW_SCHEDULED` and `last_activity_at`
- performs an optional explicit stage move

The UI shows the I3 dialog on the Interviews page and in the application drawer (with the application fixed). Edits of simple fields go through the Data API under a column grant.

## 8. Preparation Notes

`preparation_notes` is kept exactly as the legacy field: multiline text, entered in I3 and edited inline in I2/I5 with an explicit Save. A "Prep notes added" pill appears in the list. There is no checklist and no structured questionnaire.

## 9. Questions Expected

`questions_expected` works the same way as preparation notes: kept, multiline, editable in I3/I2/I5.

## 10. Interview Detail

The I2 panel (≥1100 px) or I5 sheet shows:
- When, with the zone abbreviation in force
- Format · Join link (http/https only)
- Status
- Participants
- Prep and questions
- Debrief summary
- Actions: Record outcome / Edit debrief / Cancel or move, Edit, and Join video on mobile

## 11. Debrief

The I4 dialog runs through `rpc_record_interview_outcome` in one transaction. It:

- sets the result and the debrief fields
- writes `INTERVIEW_COMPLETED` only when the result changes and isn't a cancellation
- replaces the next action only when one is given
- rejects a result for an interview that hasn't started (cancellation is still allowed)
- keeps `completed_at` stable across re-saves

**It never auto-transitions.**

## 12. Application Integration

An **Interviews** card in the M3 detail drawer (ADR-020) shows upcoming, needs-outcome and completed interviews with debrief status, plus Schedule / Record outcome / Debrief. The timeline renders the interview events in the viewer's profile zone. The M3 drawer and rail behaviour is unchanged; the M3 E2E passes with a11y asserted.

## 13. Contact Integration

- **Participants:** `interview_contacts` holds the application owner's M4 contacts; `interviewer_names` holds free-text names, so saving a participant as a contact isn't required.
- **Cross-workspace** links fail with `23503`.
- **Other users' contacts** (peer or manager) → `42501`.
- **Privacy:** no USER's private contacts are exposed.

## 14. Workflow Transition Behavior

- A stage change happens **only** when the user explicitly picks "Move to …" in I3, or a stage in I4.
- The RPC then calls `rpc_move_application_stage`, which writes `STAGE_CHANGED` after the interview event.
- A failure rolls back the interview change as well (M5-10).
- Defaults are always Keep.

## 15. Application Events

- `INTERVIEW_SCHEDULED`, with a payload of `interview_id`, type, round, `scheduled_at`, duration and format.
- `INTERVIEW_COMPLETED`, with the outcome, `previous_outcome`, next step, thank-you status and up to 500 characters of notes.
- Nothing is written for:
  - text edits
  - reschedules
  - an unchanged re-save
  - cancellation
- No separate event system was added.

## 16. Timezone Handling

- **Storage:** UTC `timestamptz`.
- **Display and entry:** `profiles.timezone`, validated as IANA by a DB trigger.
- **DST:** gaps are rejected with a message; overlaps map to the first occurrence.
- **Labels:** abbreviations (CDT/CST) follow the instant.
- **Bands:** computed on the profile-zone calendar.
- **The browser zone is never used.** The E2E runs in Berlin against a Chicago profile and then a Kolkata profile.
- **Picker:** modern IANA names, because Chromium lists legacy ICU names.

## 17. Manager Experience

- A MANAGER sees and edits every interview in the workspace and can schedule and debrief for members; the member stays the owner.
- The Owner filter and owner names appear in rows and the panel.
- All cross-user mutations are audited.
- A manager can't attach their own contacts to a member's interview.
- There is no cross-workspace access.

## 18. USER Privacy

A USER sees only their own interviews and participants. Peers, foreign workspaces and removed members get 0 rows or `42501`. Filtering happens in the database, not the frontend.

## 19. RLS Results

M5-02..07 and M5-14 cover:

| Actor / operation | Result |
|---|---|
| Own SELECT / UPDATE | ALLOW |
| Own INSERT | via RPC ALLOW; direct DENY by design |
| Peer | DENY |
| Cross-workspace | DENY |
| MANAGER, same workspace | ALLOW |
| MANAGER, foreign workspace | DENY |
| Removed member | DENY |
| `anon` | DENY |

## 20. Cross-Workspace Integrity

- A forged interview→application pair or participant→contact pair across workspaces fails with `23503`, even as the service role (M5-06).
- The RPCs check access before writing.

## 21. Accessibility

- axe WCAG 2.0/2.1/2.2 A+AA, colour contrast on.
- 7 M5 contexts: **0 violations**, locally and on the preview, **asserted** by the test.
- Accessible segmented controls (radiogroup, arrow keys).
- Rows are real buttons with descriptive names.
- The list is a labelled `tabpanel`.
- Keyboard: arrows across the tabs, Enter opens, Escape closes the sheet.
- All form fields are labelled; errors use `role=alert`.

## 22. Performance

- **Fixture:** 5,000 interviews.
- **Query plans:** every list, count and drawer query uses an M5 index, in under 0.1 ms.
- **Bounds:** lists paged at 50, drawer limited to 100, picker to 200; counts are head-only.
- **Client:** a stale-response guard on the lists.
- **Bundle:** 731 kB JS (was 684 kB), still over Vite's 500 kB warning. Code-splitting is deferred.

## 23. Integration Tests

**88/88 locally and on hosted:** M1B 17, M3 38, M4 10, M4 closeout 9, **M5 14**. Details: `M5_TEST_RESULTS.md` §2.

## 24. E2E Tests

- **9/9 locally and in CI:** capture, leak, M2 shell ×4, M3, M4, **M5**.
- **M5 spec covers:**
  - route, schedule, edit, detail
  - prep and questions
  - debrief, explicit stage move
  - application integration, manager view
  - mobile, keyboard
  - loading, empty, error/retry
  - time zones and DST

## 25. Previous-Milestone Regression

- **Option B:** M1B 17/17, leak PASS on the preview.
- **Applications:** M3 38/38, E2E PASS.
- **Contacts and links:** M4 10 + closeout 9, E2E PASS (now with a11y asserted).
- **Shell:** PASS, now showing real roles.
- **No hard-delete regression:** M4C-01/04, and interviews have no DELETE.

## 26. Vercel Preview

`jobquest2-eq3zy6rxb-one-piece-5779.vercel.app` (`6a469ed`), Environment Preview, Ready.

- Health ok.
- M5 E2E PASS: Option B registration, interviews route, schedule, debrief, RLS-backed data, application and contact integration, time zones, mobile.
- Leak and M2 shell PASS.
- Deployed-bundle scan: 0 findings.
- Earlier M5 preview: `jobquest2-k1eph4v90` (`d129933`).

## 27. CI Results

`36106977932` on `6a469ed`: **PASS** (static 33 s; database + integration 88 + E2E 9 + evidence 4 m 3 s).

Earlier failures, all fixed:
- `36105850496`: the dialog didn't close in time on a slower runner
- `36106491486`: diagnosed the dialog-reset bug

The final docs-commit run is reported in the M5 hand-off message.

## 28. Secret Hygiene

- `check:bundle`: 0 findings. `check:secrets`: 0 findings across 396 tracked files.
- The deployed bundles of both M5 previews were scanned with the real secret values: 0 findings.
- Evidence is sanitized by the recorder.
- Never staged: `.env*`, keys, tokens, `test-results/`.
- The CI failure artifact holds ARIA snapshots only.

## 29. Visual Regression

`M5_VISUAL_REGRESSION.md` has 10 captures compared with `05-interviews.html` I1–I5, all matching apart from the documented intentional differences (reminders, calendar, "of ~4"). The pre-existing unstyled top bar is noted there.

## 30. Files Created / Modified

- **New:**
  - `supabase/migrations/20260925200000_m5_interviews_debriefs.sql`
  - `apps/web/src/{api/interviews.ts, types/interviews.ts, lib/time.ts, hooks/useProfileTimeZone.ts, views/InterviewsView.tsx}`
  - `apps/web/src/components/interviews/{ScheduleInterviewDialog, RecordOutcomeDialog, InterviewDetailPanel, ApplicationInterviewsSection, Segmented, TimeZoneNote}.tsx`
  - `tests/integration/m5-interviews.test.ts`, `tests/unit/m5-time.test.ts`, `e2e/m5-interviews.spec.ts`
  - `migration-upgrade/m5/*`
- **Modified:**
  - `apps/web/src/App.tsx` (route, WorkspaceProvider controlled mode)
  - `context/WorkspaceContext.tsx`
  - `components/applications/{ApplicationDetailDrawer.tsx, eventText.ts}`
  - `views/ApplicationsView.tsx`
  - `styles/globals.css` (M5 section, tokens only)
  - `e2e/m4-contacts.spec.ts` (a11y assertion)
  - `.github/workflows/m1b-ci.yml`

## 31. Deviations

1. **Debrief columns beyond TARGET_SCHEMA:** `questions_asked`, `next_step`, `thank_you_status`, plus `CANCELLED` in the outcome. They come from the approved I4 form and the legacy table, and nothing was invented.
2. **Legacy interview types kept** in the enum: Behavioral, Coding, Final.
3. **`interview_contacts` table:** the approved "participants linked to contacts where possible" needed an association. It uses composite FKs.
4. **Owner = application owner**, even when a manager schedules; the manager's action is audited.
5. **`audit_events` stays SYSTEM-only**, as at M4; the trigger was extended.
6. **Shell fix outside the M5 domain:** the workspace switcher had never worked, and the "real role" requirement needed it fixed.
7. **The M3 E2E was not re-run on the preview** because of the register limit.

## 32. Remaining Questions

1. Should reminders (I3 "Remind me 1 hour before") ship with the tasks milestone?
2. Should typed participant names become draft contacts ("can be saved as contacts later")?
3. Should there be a manager audit viewer, and read-audit (carried from M4)?
4. Should the M4 networking progress checklist be designed (carried from M4)?
5. Should the M2 top bar and sidebar group labels get a styling pass?
6. Should legacy interview types be mapped during data migration or kept?

## 33. Deferred Work

- Reminders and notifications.
- The calendar view.
- Participant → contact conversion.
- Interview analytics (ever-reached is already event-based).
- Code-splitting.
- The shell top-bar CSS.
- Read-audit.

## 34. Recommended Next Milestone

**M6: Tasks, Habits & Unified Queue**, per the milestone sequence in `m3/README.md` §3. It would also carry the I3 reminder and post-interview follow-up prompts. It is **not started**, and it needs explicit approval.

## 35. Git Status

- Branch `feature/m5-interviews-debriefs` is pushed.
- The working tree was clean apart from untracked local-run evidence at report time.
- There are no uncommitted code changes.
- The final docs commit and its CI run are listed in the chat hand-off.

## 36. Final Recommendation

M5 meets its acceptance criteria with evidence (`ACCEPTANCE_CRITERIA.md`). I recommend a user review of this report and `M5_VISUAL_REGRESSION.md`, and then an explicit decision on merging into `development`. **Do not merge automatically. Do not start M6.**
