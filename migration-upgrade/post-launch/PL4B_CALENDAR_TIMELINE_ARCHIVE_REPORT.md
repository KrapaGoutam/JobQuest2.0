# PL-4B — Calendar, Cross-Application Timeline/Gantt, and Archive

Date: 2026-10-03

Branch: `feature/pl4b-calendar-timeline-archive`

Development baseline: `80076446a120388fe2b05f7d36ccc131bb72d538`

Main baseline: `bfa82eb557c5e748ba5d7c91fe122fb8294d2313`

## Status

PL-4B implementation, local/Preview acceptance, and exact application/test candidate CI are complete. Candidate `f8890b4d33bb8470ed3564951436cab869135389` passed run `37127378593`. PL-4B is not fully certified until the later documentation-tip CI passes. Development, main, Production, and PL-1D remain unchanged.

## Discovery and product decision

| Area | Baseline finding | Result |
| --- | --- | --- |
| Calendar | PARTIAL | The route and navigation existed only as a Future Feature placeholder. It is now a real month/agenda view over canonical interviews, tasks, follow-up tasks, and dated application next actions. |
| Cross-application Timeline | MISSING | Existing application/contact histories remain unchanged. A new workspace-wide event and duration view aggregates canonical application history, interviews, tasks, follow-ups, and dated next actions. |
| Gantt-range data | PARTIAL | Recorded stage occupancy and scheduled interview duration support defensible bars. Tasks, follow-ups, next actions, and other point events remain milestones; no duration is invented. |
| Archive | PARTIAL | Recoverable archives existed separately for applications, contacts, habits, and documents. A consolidated recovery-oriented Archive Center was justified and implemented over those existing contracts. |
| Manager support | PARTIAL | Existing RLS and workspace membership were authoritative. Calendar, Timeline, and Archive now expose manager aggregate/member filters without creating another authorization path. |

Archive decision: **CONSOLIDATED ARCHIVE CENTER** for the four domains with real archived state and canonical restore semantics: applications, contacts, habits, and resumes/cover letters. Cancelled tasks, interviews, and workspaces are excluded because they do not share those semantics. Permanent deletion is not available.

## Implementation

- Added shared presentation models and normalization for calendar items, timeline milestones, stage intervals, and interview intervals.
- Replaced `/calendar` placeholder behavior with a timezone-aware month/agenda view, period controls, date deep links, status/type/owner filters, keyboard date navigation, source navigation, and mobile agenda fallback.
- Suppressed duplicate contact follow-ups by treating canonical `FOLLOW_UP` tasks as the source rather than also rendering `contacts.next_follow_up_date`.
- Preserved date-only task/next-action dates without UTC-midnight conversion and rendered timestamp events in the profile timezone.
- Added `/timeline` with 30/90/180/365-day ranges, chronological event mode, duration mode, exact stage occupancy, scheduled interview bars, semantic equivalents, and mobile interval cards.
- Added `/archive` with domain counts/filtering, search, manager ownership filtering, canonical restore RPCs, pending/error/live status, and no hard-delete operation.
- Added a compact Calendar/Timeline/Archive route switcher without bloating primary navigation.
- Added loading, empty, filtered-empty, and error states across all three views.

## Database, API, RLS, and dependency impact

- Database migration: **NO**
- Schema change: **NO**
- External or backend API contract change: **NO**
- RLS change: **NO**
- Authentication change: **NO**
- New dependency: **NO**
- Workflow/environment change: **NO**

The views use bounded parallel Supabase queries under existing RLS and existing restore RPCs. No redundant backend event or archive entity was created.

## CI recovery

Original pushed application/test SHA: `3c7ecb7bd12549b51ccbef9318df045dd6c76fb5`

Original CI run: `37101076139` — **FAIL**

Failure: `e2e/pl4b-planning.spec.ts:226`, TypeScript `TS2367`. The test compared `animation.playState` to `"pending"`, but the Web Animations API playback-state union is `idle | running | paused | finished`; pending is represented by the separate `animation.pending` boolean.

Fix: preserve the intended settled-theme guard by requiring `animation.playState !== 'running' && !animation.pending`. No cast, suppression, removed assertion, or application-code change was used.

Intermediate corrected SHA `a7aeeb4172d77befd8f3677384afb0e23a4a930b` passed exact CI run `37126669497`. Preview verification then exposed a timing-only test harness gap: `activeWs` could be available before restored `user.id` after hard navigation. The poll now requires both identity and workspace readiness. Explicit 820px tablet coverage was added for Calendar, Timeline, and Archive.

Final application/test candidate: `f8890b4d33bb8470ed3564951436cab869135389`

Final candidate CI: `37127378593` — **PASS**

The exact run passed classification, lint, typecheck, `179/179` unit tests, build, tracked/browser secret scans, migrations, `187/187` integration tests, extension validation, `23/23` browser E2E plus axe, sanitized evidence upload, and disposable-stack cleanup.

## Local verification

Local certification of the corrected application/test tree:

- lint: PASS
- TypeScript: PASS
- unit: `179/179` PASS across 22 files, including five PL-4B planning tests
- integration: `187/187` PASS across 18 files
- production build: PASS (existing chunk-size advisory only)
- extension: `97/97` PASS across four files
- full browser E2E and axe: `23/23` PASS
- focused PL-4B browser scenario: PASS
- browser bundle secret scan: three files, zero findings
- extension bundle secret scan: 45 files, zero findings
- tracked-file secret scan: 955 files, zero findings
- `git diff --check`: PASS

The strengthened final test-only delta passed lint, TypeScript, tracked-secret scan, and direct Preview acceptance. It does not change application behavior. A first full browser invocation was inconclusive when the command harness terminated at five minutes; the unchanged rerun completed successfully with `23/23` in 5.8 minutes.

## Preview evidence

- URL: `https://jobquest2-pb0szhpwp-one-piece-5779.vercel.app`
- Deployment: `dpl_AHAeH26jLYdd2AgMSafhHAdFjWvV`
- Target/status/SHA: `preview` / `READY` / `f8890b4d33bb8470ed3564951436cab869135389`
- Team/project: `one-piece-5779` / `jobquest2`
- `/api/health`: HTTP 200 with `{"status":"ok"}`
- Backend binding: compiled browser asset contains jobquest-dev project ref `xpnkasclquplmrcmhsif`; the recorded Production ref is absent.
- Authenticated Preview acceptance: `1/1` PASS against jobquest-dev.
- Responsive evidence: desktop 1440px, tablet 820px, mobile 390px; zero page-level horizontal overflow.
- Accessibility: ten Calendar/Timeline/Archive axe contexts across light/dark and desktop/tablet/mobile; zero critical or serious violations.
- Archive recovery: application, contact, habit, and document restore flows all passed and were verified through canonical stored state.

## Semantics and limits

- Calendar intentionally omits general application-history events by default to avoid clutter.
- Date-only records remain on their recorded local date; timestamp records use the profile timezone.
- Current open-stage occupancy ends at today, or the selected range end when earlier. It never extends into an invented future duration.
- Tasks, follow-ups, next actions, and event history are point milestones, not Gantt bars.
- Interview bars use the stored start timestamp plus stored duration.
- Archive exposes only domains with genuine `archived_at` plus restore semantics and never offers permanent deletion.
- Existing single-application and contact timelines remain authoritative and unchanged.
- Frontend queries remain intentionally bounded; removing bounds would require a server-search/pagination contract.

## Promotion state

Application/test candidate: `f8890b4d33bb8470ed3564951436cab869135389`

Application CI: `37127378593` — PASS

Final feature SHA: `8ee3dcaa024ae9780ca395d246e61667a09dc580`

Final feature CI: `37128248294` — PASS

Development merge: `dfa5a59b6619d12e319fe82b316be2339280f673` — operator-approved no-ff merge with parents `80076446a120388fe2b05f7d36ccc131bb72d538` and `8ee3dcaa024ae9780ca395d246e61667a09dc580`

Development CI: `37128826840` — PASS

Main: `bfa82eb557c5e748ba5d7c91fe122fb8294d2313` — UNCHANGED

Production/jobquest-prod: UNCHANGED

PL-1D: DEFERRED / TBD — UNCHANGED

Status: PL-4B formally closed. This post-development-CI closeout metadata remains intentionally unstaged so it does not create a new untested development SHA.

Next action: PL-4C — Goals + Task Templates + Recurrence Enhancements, in a separate controlled task with explicit authorization. Do not start automatically.
