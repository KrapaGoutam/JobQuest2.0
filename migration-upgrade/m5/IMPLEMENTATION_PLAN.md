# M5: Implementation Plan (as executed)

## Scope sources

- The user's M5 prompt, sections 13–57.
- Gate 03 `TARGET_SCHEMA.md` #12 `interviews` and #25 `audit_events`.
- `AUTHORIZATION_RLS_DESIGN.md`: Tier 2, OWNER SCOPED / MANAGER OVERRIDE.
- The Gate 02B specs:
  - `GATE_02B_UI_SPEC.md` §7
  - `FORM_SPEC.md` §6.1–6.2
  - `INTERACTION_SPEC.md` §4.2–4.3
  - `SCREEN_INVENTORY.md` I1–I5
  - mockup `05-interviews.html`
- `DECISIONS.md` ADR-020 (drawer entity cards) and ADR-022 (interview decoupling).
- `OPEN_QUESTIONS.md` OQ-017 (profile time zone).
- `PRD.md` FR-027.
- `docs/BACKEND_SCHEMA.md`: the legacy `interviews` columns.

`docs/IMPLEMENTATION_PLAN.md` uses the older Gate 01 milestone numbering, where interviews sit in "M6", and there is no `m5/` planning package. The milestone sequence used since M3 (see `m3/README.md` §3) assigns "Interviews scheduling & preparation" to **Milestone 5**. That sequence was followed.

## Phases

| Phase | Work | Status |
|---|---|---|
| 0 | M4 closeout and merge into `development` (`caf9f33`); branch created | Done |
| 1 | Migration `20260925200000`: `interviews`, `interview_contacts`, RLS, grants, the two RPCs, audit extension, profile time-zone validation | Done (local and hosted) |
| 2 | Integration suite M5-01..14 | Done: 14/14 local, 14/14 hosted |
| 3 | `lib/time.ts` (DST-safe) plus unit tests | Done: 15/15 |
| 4 | API layer, profile time-zone hook, types | Done |
| 5 | UI:<br>• `/interviews` (I1, I2, I5)<br>• the I3 schedule/edit dialog<br>• the I4 debrief dialog<br>• the application-drawer Interviews card<br>• timeline text | Done |
| 6 | Shell fix: the workspace switcher bound to the loaded memberships | Done |
| 7 | E2E M5 spec: flows, keyboard, mobile, states, time zones, a11y | Done |
| 8 | Performance check with a 5,000-row fixture | Done |
| 9 | CI: M5 suites, evidence upload, failure context | Done |
| 10 | Vercel preview and preview validation | See `M5_TEST_RESULTS.md` |
| 11 | Docs | Done |

## Explicitly not in M5

- Tasks and reminders. The "Remind me 1 hour before" option is deferred to the tasks and reminders milestone, and nothing in the UI promises a reminder.
- The calendar view (V4/V5).
- Analytics.
- Documents.
- The browser extension.
- Legacy data migration.
- Production infrastructure.
