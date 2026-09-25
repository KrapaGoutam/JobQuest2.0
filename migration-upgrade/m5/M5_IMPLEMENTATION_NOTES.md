# M5: Implementation Notes

## 1. Schema (`supabase/migrations/20260925200000_m5_interviews_debriefs.sql`)

### `public.interviews`

**TARGET_SCHEMA #12 columns:**
- `id`, `application_id`, `workspace_id`
- `user_id` (owner = the application owner)
- `round_number`, `interview_type`, `scheduled_at` (timestamptz, UTC), `duration_minutes`
- `format` (`VIDEO`/`PHONE`/`ONSITE`), `location_or_link`, `interviewer_names`
- **`preparation_notes`**, **`questions_expected`**
- `completed_at`, `outcome`, `feedback_notes`
- `created_at`, `updated_at`, `legacy_id`

**Additions, each with source support:**

| Column / value | Source |
|---|---|
| `questions_asked`, `next_step`, `thank_you_status` (`NOT_NEEDED`/`TO_SEND`/`SENT`) | Approved I4 form (FORM_SPEC 6.2) and the legacy JobQuest1.0 `interviews` columns (`docs/BACKEND_SCHEMA.md`). TARGET_SCHEMA had trimmed them. Recorded as a deviation in the completion report §31. |
| `outcome` value `CANCELLED` | Approved I4 result "Cancelled / moved". `PENDING` = "Completed · waiting", `PASSED` = "Advanced", `FAILED` = "Rejected". |
| `interview_type` values | The approved I3 list (Recruiter screen, Technical, Hiring manager, Panel, Offer call, Other) plus the legacy values Behavioral, Coding and Final Interview, so migrated rows keep their meaning. |

**Constraints:**
- `uq_interviews_id_workspace`
- `fk_interviews_application (application_id, workspace_id) → applications(id, workspace_id)`: composite tenant FK
- `chk_interviews_completion`:
  - no outcome → no `completed_at`
  - `CANCELLED` → no `completed_at`
  - any other result → `completed_at` required
- length limits: 5,000 characters for long text, 500 for the link/location, 1,000 for names

**Indexes:**
- `(workspace_id, scheduled_at)` (TARGET_SCHEMA)
- `(workspace_id, user_id, scheduled_at)` (USER-scoped lists)
- `(application_id, scheduled_at)` (drawer)
- partial `(workspace_id, scheduled_at) WHERE outcome IS NULL` (upcoming / needs outcome)

There is no checklist column or table (ADR-022).

### `public.interview_contacts`

Participants that are M4 contacts: `(interview_id, contact_id, workspace_id)`. It has composite FKs to both `interviews` and `contacts`, so the same workspace is guaranteed. Free-text participants stay in `interviewer_names`, so a participant doesn't have to be a saved contact.

## 2. Authorization

- **`interviews`:**
  - SELECT and UPDATE are allowed where `can_access_owned_record(workspace_id, user_id)`: the owner who is still a member, or the workspace MANAGER.
  - There's no client INSERT or DELETE: scheduling is the RPC, and cancel is an outcome.
  - UPDATE is granted **per column**, simple fields only. `outcome`, `completed_at`, `user_id`, `workspace_id` and `application_id` return `42501`.
- **`interview_contacts`:**
  - SELECT and DELETE follow access to the interview.
  - INSERT also requires the contact to belong to the **interview owner**. Nobody can attach, or reveal through a join, another USER's private contacts. That includes a manager's own contacts on a member's interview.
- **Removed members** lose access at once, because the RLS helpers check live membership.
- **Audit:** `app.audit_cross_user_mutation` (from the M4 closeout) is replaced with a version that also handles `interviews` (entity `INTERVIEW`, metadata `application_id` and `outcome`) and `interview_contacts` (`INTERVIEW_CONTACT`, `LINK_CREATED`/`LINK_REMOVED`).

## 3. RPCs (SECURITY DEFINER, `search_path=''`, `anon` revoked)

### `rpc_schedule_interview(p_application_id, p_interview_type, p_scheduled_at, p_duration_minutes, p_format, p_round_number, p_location_or_link, p_interviewer_names, p_preparation_notes, p_questions_expected, p_contact_ids uuid[], p_move_to_stage)`

1. Locks the application.
2. Checks access, and that the application is open and unarchived.
3. Numbers the round as the next one by default.
4. Inserts the interview, owned by the application owner.
5. Validates and inserts the participants.
6. Appends `INTERVIEW_SCHEDULED` and bumps `last_activity_at`.
7. **Only if `p_move_to_stage` is given**, calls `rpc_move_application_stage`. If that fails (for example `STAGE_UNCHANGED`), everything rolls back.

### `rpc_record_interview_outcome(p_interview_id, p_outcome, p_feedback_notes, p_questions_asked, p_next_step, p_thank_you_status, p_next_action, p_next_action_date, p_move_to_stage)`

1. Locks the interview and checks access.
2. Rejects a non-cancel result before `scheduled_at` (`INTERVIEW_NOT_YET_HELD`).
3. Sets the outcome and the debrief fields. `completed_at` keeps its first value; it is null for `CANCELLED`.
4. Writes `INTERVIEW_COMPLETED` only when the result changes and isn't a cancellation. The payload includes `previous_outcome`, `next_step`, `thank_you_status` and up to 500 characters of the notes.
5. When `p_next_action` is given, replaces the application's next action.
6. Performs an explicit stage move only when `p_move_to_stage` is given.

## 4. Time zones

- **Storage:** `timestamptz` (UTC). The client sends an ISO UTC instant.
- **Display and entry** use the profile time zone:
  - `profiles.timezone` is loaded by `useProfileTimeZone` and shared across views.
  - It can be changed from the I3 help text ("Change").
  - A new trigger `app.validate_profile_timezone` accepts only names found in `pg_timezone_names`.
- **`apps/web/src/lib/time.ts`** (Intl only, no dependency):
  - `zonedWallTimeToUtcIso` tries the offsets on either side of the wall time.
  - An ambiguous fall-back time maps to its **first** occurrence.
  - A time inside a spring-forward gap throws `NonexistentLocalTimeError`, and the form shows "does not exist … (daylight saving change)".
  - `formatSlot` labels the zone abbreviation in force at that instant (CDT/CST).
  - Day and week bands are computed on the profile zone's calendar.
- The browser's own zone is never used: the E2E runs Chromium in Europe/Berlin to prove it.
- Chromium lists legacy ICU names (for example `Asia/Calcutta`); the picker shows the current IANA names (`Asia/Kolkata`).

## 5. UI

| Surface | File |
|---|---|
| I1 list: tabs Upcoming / Needs outcome / Past; bands Needs outcome, This week, Next week, Later, Recent; type filter; owner filter (managers); paging | `views/InterviewsView.tsx` |
| I2 detail panel (≥1100 px) / I5 sheet (narrow): when, format, join link, status, participants, inline prep and questions, debrief summary | `components/interviews/InterviewDetailPanel.tsx` |
| I3 schedule / edit dialog | `components/interviews/ScheduleInterviewDialog.tsx` |
| I4 debrief ("How did it go?") | `components/interviews/RecordOutcomeDialog.tsx` |
| Application drawer Interviews card (ADR-020) | `components/interviews/ApplicationInterviewsSection.tsx` |
| Accessible segmented control (radiogroup, arrow keys) | `components/interviews/Segmented.tsx` |
| Timeline text for interview events | `components/applications/eventText.ts` |

- Lists load through a sequence guard, and a view key stops rows from another tab showing while a new tab loads.
- Dialogs reset only when a different record opens (keyed on ids), so a parent re-render never wipes typed input. This was found in CI.

## 6. Shell fix (pre-existing since M2)

`WorkspaceProvider.loadWorkspaces` was never called, so the switcher always showed a fallback role and couldn't switch. The provider now has a controlled mode that `App.tsx` drives with the memberships it already loads. The switcher shows the real role (a personal-workspace creator is MANAGER), and selecting a workspace reloads the app data.

## 7. Deferred

- Reminders ("Remind me 1 hour before") belong to the tasks and reminders milestone.
- The calendar view.
- Converting a typed participant name into a contact.
- Read-audit of manager views, as in M4.
