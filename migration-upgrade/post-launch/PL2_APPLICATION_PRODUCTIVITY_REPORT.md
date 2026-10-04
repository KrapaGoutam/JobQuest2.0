# PL-2 Application Productivity Report

Date: 2026-10-01

Branch: `feature/pl2-application-productivity`

Base: `1086bcb41d1b0ab25959d182ec388a0f6da53042`

Implementation commit: `526b0318`

Pre-evidence branch SHA / CI: `8bf4b1c38baae508388828b0d03f0c4ebf75bb04` / `36915890541 PASS`

Final feature SHA / CI: `298d112d4379dedf6930572015d6f7498feff4ea` / `36918359854 PASS`

Development merge SHA / CI: `5dfce2086f04abd26efb1a3a36ebd73132bda986` / `36960378949 PASS`

## Scope

PL-2 covers the verified Application Productivity gaps only:

- Date Added filtering using canonical `applications.created_at`
- explicit ascending/descending sorting controls
- optional grouping by Date Added month
- cleanup of the dashboard quiet-application suggestion surface
- application-detail contact UX through the existing Contacts & Networking model

## Discovery matrix

| Feature | Classification | Discovery | Minimal action |
| --- | --- | --- | --- |
| Date Added filter | `MISSING` | `created_at` existed and was sortable, but no range filter or UI was wired through the list/count queries. | Add inclusive profile-time-zone date inputs and half-open server-side `created_at` bounds. |
| Sort direction | `PARTIAL` | Stable server ordering and desktop header toggles existed; Date Added, application date and role were not exposed, mobile had no control, and directions lacked semantic labels. | Add a responsive field selector and human-readable direction button while preserving header sorting and the default `last_activity_at DESC`. |
| Group by month | `MISSING` | No month grouping or reusable month-section component existed. Pagination was server-side offset paging at 50 rows. | Add an explicit option that groups only the current authorized result page by `created_at` month. |
| Suggestion area | `PARTIAL` | The dashboard already showed at most three deterministic quiet-application suggestions with loading/empty/actions; secondary row actions were visually crowded and two fetched rows were inaccessible. | Keep the existing deterministic model, collapse secondary actions under More, and add bounded Show more/fewer. |
| Application contact UX | `PARTIAL` | Contact create/link/edit RPCs and the `application_contacts` join existed, but application detail showed no linked contacts or reverse entry points. | Add an application-side contacts section with linked visibility, empty/loading/error states, create-and-link, link-existing, inline details, and edit. |

Canonical Date Added is `applications.created_at`, not `applied_at`, `updated_at`, activity time, or status-change time.

## Implementation summary

### Applications list

- Date Added `from` and inclusive `through` controls use the profile IANA time zone, including daylight-saving boundaries.
- Queries apply `gte(created_at, from)` and `lt(created_at, next-day)` server-side. Stage counts receive the same bounds.
- Search, stage/status/outcome/priority/aging/archive/owner filters, exact counts, offset pagination, and the default order are preserved.
- Sort field and direction controls are available on narrow layouts. Text directions read A to Z / Z to A; date directions read oldest to newest / newest to oldest.
- `id ASC` remains the deterministic server tie-breaker.
- Date Added is visible in desktop rows and mobile cards.
- Group by month is opt-in. It uses accessible month/year headings, preserves records and row/card actions, and groups only the existing page rather than fetching an unbounded data set.

### Suggestions

- The dashboard remains a deterministic quiet-application review surface; no AI subsystem was introduced.
- Keep remains immediately visible. Mark Ghosted and Archive remain available under a native keyboard-accessible More disclosure.
- The existing five-row bounded query remains unchanged; the dashboard initially shows three and can reveal the remaining fetched suggestions.
- Existing confirmations, undo, toasts, RPC behavior, and history are preserved.

### Application contacts

- The application drawer now shows linked recruiter/contact identity, application role, company/title, optional email/phone/notes, and an edit action.
- Empty, loading, and local error/retry states are explicit.
- Create contact reuses `rpc_create_contact` with the application preselected and company prefilled.
- Link existing reuses `rpc_link_application_contact`; linked and archived contacts are excluded from choices.
- Existing direct-contact updates are reused for editing. No destructive unlink/delete action was added.
- The reused contact modal now participates in the shared overlay stack for Escape, focus trap, and focus restoration.

## Explicit non-changes

- Database migration: `NO`
- Schema/RLS/policy change: `NO`
- Production database/data/auth/account/token/environment change: `NO`
- AI model/provider/prompt change: `NO`
- Unbounded applications or contacts load: `NO` (application page remains 50 rows; link choices are capped at 200)
- Default application ordering change: `NO`
- Main branch change: `NO`
- Development branch change: `YES`; the operator-approved PL-2 no-ff merge is certified at `5dfce2086f04abd26efb1a3a36ebd73132bda986`
- Production deployment: `NO`
- PL-1D remediation: `NO`; PL-1D remains `DEFERRED / TBD`
- Dashboard/Analytics redesign: `NO`

## Test evidence

| Gate | Result |
| --- | --- |
| Focused application/contact unit | `27/27 PASS` across 2 files |
| Full unit | `170/170 PASS` across 20 files |
| Focused application/contact integration | `49/49 PASS` across 2 files |
| Full integration | `187/187 PASS` across 18 files |
| Lint | `PASS` |
| Full workspace typecheck | `PASS` |
| Production web build | `PASS`; existing >500 kB chunk warning remains |
| Hardened tracked-secret scan | `PASS`; 941 tracked files, 0 findings |
| `git diff --check` | `PASS` |
| Exact-SHA branch CI | Run `36915890541` for `8bf4b1c38baae508388828b0d03f0c4ebf75bb04`: `PASS`; classification, lint, typecheck, unit, build, both secret scans, disposable-Supabase integration, extension checks, browser E2E, and axe all passed. |

Targeted local Playwright evidence:

- Applications scenario artifact `test-results/evidence/e2e-local-23e721.json`: `PASS` for Date Added range, semantic direction, month grouping, contact empty/create-and-link/details/link-existing empty state, desktop/tablet/mobile behavior, archive/bulk/timeline regressions, and seven recorded axe contexts with zero violations.
- Dashboard/tasks scenario artifact `test-results/evidence/e2e-local-03129c.json`: `PASS` for compact review actions, Show more, Keep refresh, and nine recorded axe contexts with zero violations.
- The local Playwright parent process hung during Windows server teardown after both specs wrote completed PASS evidence. This is recorded as a runner limitation; the feature branch CI and Preview gates remain required.

## Preview evidence

- URL: `https://jobquest2-3vo0855vi-one-piece-5779.vercel.app`
- Deployment: `dpl_EcGew1upDBKvUUK9EGKfwfCCHDJz`
- GitHub deployment record: `6793532898`, exact SHA `8bf4b1c38baae508388828b0d03f0c4ebf75bb04`
- Team/project/target/status: `one-piece-5779` / `jobquest2` / `preview` / `READY`
- Backend: `jobquest-dev` (`xpnkasclquplmrcmhsif`) is the only Supabase project ref in the compiled browser bundle; the Production project ref is absent.
- Read-only runtime checks: `/`, `/auth/login`, and `/applications` returned HTTP 200 and rendered the signed-out JobQuest UI with no framework overlay or page error; `/api/health` returned 200; `/api/ext/v1/me` with a synthetic invalid token returned 401.
- Accessibility/regression classification: the authenticated PL-2 M3/M6 browser suites passed in exact-SHA CI, and the targeted local evidence recorded zero violations across the changed Applications, contact-modal, and suggestion contexts. Anonymous Preview axe found `landmark-one-main`, `page-has-heading-one`, and `region` on the pre-existing sign-in page; the same findings and one expected signed-out 403 console response reproduced identically on the unchanged development Preview `1086bcb41d1b0ab25959d182ec388a0f6da53042`, so they are inherited baseline rather than PL-2 regressions.
- Live authenticated Preview limitation: no authorized Preview identity was available, and none was created solely for QA. Authenticated PL-2 interactions therefore rely on disposable local and exact-SHA CI browser coverage.

## Known limitations and follow-ups

- Month grouping is intentionally page-scoped because the Applications list uses server-side 50-row offset pagination. A month may therefore continue on another page.
- Link-existing choices are bounded to the first 200 active contacts sorted by name; no unbounded fetch was introduced.
- The application link model has no per-link notes field. The UI shows the existing general contact notes and does not imply application-specific notes.
- Link/create RPCs do not currently append `CONTACT_EVENT` to application history; PL-2 does not add a new event or schema behavior.
- Stage and priority sorts retain their existing database lexical ordering. PL-2 adds discoverable direction controls without redesigning workflow-order semantics.
- Local browser tests require a temporary Node 24 Windows launcher workaround because `tsx` calls an OS user-info function that returns `ENOMEM` on this host. No repository dependency was patched.

## Certification status

PL-2 is formally closed. The final feature SHA `298d112d4379dedf6930572015d6f7498feff4ea` passed CI run `36918359854` and was merged into `development` with the approved no-ff merge `5dfce2086f04abd26efb1a3a36ebd73132bda986`. Exact development CI run `36960378949` passed classification, lint, typecheck, unit, build, tracked/browser secret scans, disposable-Supabase migrations and integration, extension validation, browser E2E, and axe. Main and Production remain unchanged. PL-3 is next and was not started in this session.

The post-development-CI closeout edits in this report and the canonical state/checklist are intentionally left unstaged so they do not create an untested development commit.
