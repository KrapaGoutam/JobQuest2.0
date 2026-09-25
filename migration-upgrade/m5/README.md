# Milestone 5: Interviews & Debriefs

Branch: `feature/m5-interviews-debriefs`, created from `development` at `caf9f33` (`merge: approve M4 contacts and networking`).
Status: **implemented and awaiting user review**. It is not merged, and M6 has not started.

## What M5 delivers

- **Interviews as records.** Each interview is a first-class record linked to an application (Gate 01 model, Gate 03 TARGET_SCHEMA #12).
- **The interview record:**
  - rounds and types
  - date and time with DST handling, stored in UTC and shown in the user's profile IANA time zone
  - duration and format
  - meeting link or location
  - participants: M4 contacts plus free-text names
  - `preparation_notes` and `questions_expected`, the verified legacy fields (ADR-022; no checklist)
- **Debrief** (Gate 02B I4):
  - result: Completed · waiting / Advanced / Rejected / Cancelled
  - questions asked, notes, next step mentioned, thank-you status
  - an optional replacement of the application's next action
- **Stage changes are explicit only.** Scheduling and debriefs never move the stage on their own. An optional, explicit move runs the existing `rpc_move_application_stage` in the same transaction.
- **Timeline events:**
  - `INTERVIEW_SCHEDULED` / `INTERVIEW_COMPLETED` are written only for meaningful changes.
  - Text edits write no event.
  - Cancellation writes no event.
- **RLS:** OWNER SCOPED / MANAGER OVERRIDE. Peers, foreign workspaces, removed members and `anon` are denied.
- **Manager audit.** Manager cross-user mutations are audited (the M4 closeout trigger now also covers interviews and participants).
- **UI:**
  - the `/interviews` page: I1 list, I2 panel, I3 schedule, I4 debrief, I5 mobile
  - an Interviews card in the application drawer
- **Shell fix.** The workspace switcher now shows the real membership and role (a pre-existing gap since M2).

## Files to read

| File | Purpose |
|---|---|
| `M5_COMPLETION_REPORT.md` | Full report (36 sections) |
| `M5_TEST_RESULTS.md` | Every suite and its evidence |
| `M5_VISUAL_REGRESSION.md` | Screenshots compared with Gate 02B `05-interviews.html` |
| `M5_IMPLEMENTATION_NOTES.md` | Schema, RPCs, RLS, time zones, UI structure |
| `M5_INFRASTRUCTURE.md` | Supabase `jobquest-dev`, Vercel preview, CI |
| `IMPLEMENTATION_PLAN.md`, `TEST_PLAN.md`, `ACCEPTANCE_CRITERIA.md` | Plan and criteria |
| `NEXT_AGENT_HANDOFF.md` | For the next agent (no chat history needed) |

Evidence is in `evidence/`; screenshots are in `screenshots/`.
