# M5: Test Results

A result counts as PASS only when the run completed and wrote its evidence. Evidence is in `migration-upgrade/m5/evidence/`. It is sanitized: the recorder refuses JWTs, refresh tokens, secret keys, private JWK material, Argon2 verifiers and test passwords.

## 1. Summary

| Category | Suite | Local | Hosted `jobquest-dev` | CI | Vercel preview |
|---|---|---|---|---|---|
| Static | lint, typecheck | PASS | n/a | PASS | n/a |
| Unit | 79 tests / 10 files (M5 time zones: 15) | **79/79** | n/a | PASS | n/a |
| Build + secret scans | build, `check:bundle` (3 files), `check:secrets` (396 files) | PASS, 0 findings | n/a | PASS | deployed-bundle scan 0 findings |
| Integration | M1B 17 · M3 38 · M4 10 · M4 closeout 9 · **M5 14** | **88/88** | **88/88** | PASS | n/a |
| E2E | capture-M2, leak, M2 shell ×4, M3, M4, **M5** | **9/9** | n/a | PASS | M5 + leak + M2 shell ×4: **6/6**<br>M4 on the final M4 preview: PASS |
| a11y | axe WCAG 2.0/2.1/2.2 A+AA, colour contrast on | **0 violations** in 7 M5 contexts (asserted) | n/a | PASS | 0 violations in 7 contexts |
| Performance | EXPLAIN ANALYZE, 5,000-interview fixture | all index scans, < 0.1 ms | n/a | n/a | n/a |

## 2. Integration: M5 (`tests/integration/m5-interviews.test.ts`)

Evidence:
- local: `integration-local-ecd4ca.json` / `integration-local-779e4f.json`
- hosted: `integration-hosted-dev-f40048.json` / `-5de7d6.json` / `-05522a.json`

| ID | Result | Key assertions |
|---|---|---|
| M5-01 | PASS | Schedule stored. `2026-10-15T14:30-05:00` → `19:30Z`. `INTERVIEW_SCHEDULED` ×1, no `STAGE_CHANGED`, stage unchanged. `last_activity_at` advanced. Participant linked. Next round = 2 |
| M5-02 | PASS | Own SELECT/UPDATE of simple fields; no event for text edits. `outcome`, `completed_at`, `user_id`, `workspace_id`, `application_id` → `42501`. INSERT and DELETE → `42501` |
| M5-03 | PASS | Peer: SELECT 0 rows, UPDATE 0 rows. Both RPCs → `42501` in both directions. Participant link → `42501` |
| M5-04 | PASS | Manager reads, edits, and schedules for a member (the member stays the owner). Audit: `INTERVIEW:RECORD_CREATED`, `INTERVIEW:RECORD_UPDATED`, target = member, no values in the metadata |
| M5-05 | PASS | Foreign workspace denied in both directions |
| M5-06 | PASS | A forged cross-workspace interview or participant → `23503`, even as the service role. A peer's contact → `42501 CONTACT_NOT_LINKABLE`, the whole schedule rolls back, and the interview count is unchanged. A manager's own contact on a member's interview → `42501` |
| M5-07 | PASS | Removed member: SELECT 0, UPDATE 0, RPC `42501` |
| M5-08 | PASS | Debrief PASSED: `completed_at` set, `INTERVIEW_COMPLETED` ×1, next action replaced, stage unchanged. An unchanged re-save writes no event and keeps `completed_at`. The result changed to FAILED writes a second event with `previous_outcome: PASSED` |
| M5-09 | PASS | Explicit moves: Recruiter Screen → Interview (schedule) and Interview → Final Interview (debrief), both through the workflow RPC, events in order |
| M5-10 | PASS | `STAGE_UNCHANGED` in the schedule leaves no interview and no event. Invalid type → `23514`. `INTERVIEW_NOT_YET_HELD`. `INVALID_STAGE` rolls the outcome back. Cancel: `completed_at` null, no event. `INVALID_OUTCOME` |
| M5-11 | PASS | Archived application → `APPLICATION_NOT_ACTIVE` |
| M5-12 | PASS | `America/Chicago` accepted; `Mars/Olympus_Mons` → `22023`. `2026-11-01T01:30-05:00` stored as `06:30Z` |
| M5-13 | PASS | The owner's debrief isn't audited; the manager's debrief writes one `RECORD_UPDATED` with `outcome: PASSED` |
| M5-14 | PASS | `anon` denied on both tables and both RPCs |

**Hosted note:** the first M5 run on hosted, immediately after the migration push, failed during setup before any test ran. Its output wasn't captured; the most likely cause is a PostgREST schema-cache reload after the DDL. The immediate re-run passed 14/14, and the full suite passed 88/88.

## 3. Unit: time zones (`tests/unit/m5-time.test.ts`, 15)

- Chicago CDT and CST.
- **Ambiguous 01:30 → first occurrence (06:30Z).**
- **Spring-forward 02:30 → `NonexistentLocalTimeError`**, while 03:00 is valid.
- London's DST dates.
- Kolkata +5:30.
- Lord Howe +11 / +10:30.
- A 168-hour round trip across the fall-back week.
- Display per profile zone (2:30 PM Chicago = 1:00 AM Kolkata), day keys, abbreviations.
- IANA validation, and the picker listing modern names (`Asia/Kolkata`, not `Asia/Calcutta`).

## 4. E2E: M5 (`e2e/m5-interviews.spec.ts`, browser zone Europe/Berlin)

Evidence: local `e2e-local-*.json`; preview `e2e-vercel-preview-d40720.json`.

| Step | Result |
|---|---|
| Register; the switcher shows **MANAGER** (the real membership) | PASS |
| Empty state on `/interviews` | PASS |
| Schedule, profile zone Chicago, **Keep at Recruiter Screen**: row `2:30 PM`, participant, prep, questions | PASS |
| 2 Nov interview shows **CST**; a 2027-03-14 02:30 gap time is rejected with a message | PASS |
| Detail: inline prep edit; Edit dialog time 14:30 → 15:00, row shows `3:00 PM` | PASS |
| Profile zone → Kolkata shows `1:30 AM`, and back to Chicago shows `3:00 PM` (browser zone ignored) | PASS |
| Application drawer: card shows `Interviews · 2`; explicit **Move to Interview** writes "Stage: Recruiter Screen → Interview" and "Interview scheduled: Panel · round 3" | PASS |
| Debrief from the drawer: Advanced, questions, notes, next step, To send, next action. Shows "Panel completed: Advanced" and "Send thank-you note"; **no further stage move** | PASS |
| Past tab and debrief detail | PASS |
| Keyboard: arrows across the tabs; Enter opens a row | PASS |
| Error: aborted request shows the loading state (no stale rows), then the error, then Retry recovers | PASS |
| Mobile 390×844: overflow 0 px; I5 sheet with **Join video**; Escape closes it | PASS |

| a11y context | Violations (local) | Violations (preview) |
|---|---|---|
| schedule-form | 0 | 0 |
| interview-detail | 0 | 0 |
| interviews-list | 0 | 0 |
| interviews-list-dark | 0 | 0 |
| debrief-form | 0 | 0 |
| application-drawer-interviews | 0 | 0 |
| mobile-interview | 0 | 0 |

## 5. Regression

- **Integration:** M1B 17, M3 38, M4 10 and M4 closeout 9 pass locally and on hosted, after the M5 migration.
- **E2E, local and CI:**
  - leak (B03/B11/B12)
  - M2 capture and M2 shell
  - M3: its drawer now contains the Interviews card; its a11y is asserted at 0
  - M4: its a11y assertion was added in M5; it was recorded but not enforced before
- **E2E, preview:** leak and M2 shell on the M5 preview. M4 on the final M4 preview `jobquest2-ctu0qz2yx` (`1e2b42b`), evidence `m4/evidence/e2e-contacts-4f94e9.json`.
- The M3 E2E was **not** re-run on the preview. The 3/hour/IP register limit was used by M4, M5 and leak; M3 is covered by local and CI E2E and the hosted integration suite.

## 6. Performance (`evidence/perf-explain-local.txt`)

The fixture is 50 applications × 100 interviews = 5,000 rows on the local stack, removed afterwards.

| Query | Plan | Execution |
|---|---|---|
| Upcoming tab (workspace, `outcome is null`, `scheduled_at >= now()`, limit 50) | Index Scan `idx_interviews_open` | 0.021 ms |
| Needs outcome, USER-scoped (owner predicate) | Bitmap Index Scan `idx_interviews_ws_owner_schedule` | 0.076 ms |
| Past-tab count | Bitmap Index Scan `idx_interviews_workspace_schedule` | 0.088 ms |
| Application drawer (limit 100) | Bitmap Index Scan `idx_interviews_application` | 0.075 ms |

- All list queries are paged (50) or limited (drawer 100, picker 200). Counts are head-only.
- RLS adds per-row helper evaluation, as in M3 and M4. It is not measured separately here.

## 7. CI (GitHub Actions `M1B CI`)

| Run | Commit | Result |
|---|---|---|
| `36103545624` | `caf9f33` (branch created) | PASS |
| `36105850496` | `d129933` | **FAILED**: M5 E2E, drawer schedule dialog did not close in time |
| `36106491486` | `ddc90df` (diagnostics) | **FAILED**: showed the real bug. The drawer's schedule dialog reset its fields on a parent re-render, so "Panel" was saved as "Recruiter screen" |
| `36106977932` | `6a469ed` (fix) | **PASS**: both jobs; integration 88, E2E 9 |
| final docs commit | see the M5 hand-off | |

## 8. Vercel preview

| Check | Result |
|---|---|
| Preview `jobquest2-eq3zy6rxb-one-piece-5779.vercel.app` (`6a469ed`), Environment = Preview, Ready | PASS |
| `/api/health` | `{"status":"ok"}` |
| Option B login/registration, interviews route, schedule, debrief, RLS-backed data, application integration, contacts participant, time-zone rendering (Chicago/CST/Kolkata), mobile | PASS (M5 E2E on the preview) |
| Leak B03/B11/B12 and M2 shell | PASS |
| Deployed-bundle secret scan (real secret key, DB password, signing-key `d` as known values) | 0 findings (`preview-bundle-scan-*.json`) |
