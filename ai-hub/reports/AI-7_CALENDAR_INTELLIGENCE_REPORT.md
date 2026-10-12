# AI-7 — Calendar Intelligence + dedicated AI Hub browser CI

Branch `feature/ai-7-calendar-intelligence` (one cumulative branch) from development `f0a0ec898088c33c918601c51025f913f6ed586b`.
Final branch CI / merge / development CI results are recorded in the operator checkpoint.

## 1. Calendar architecture

```
Claude scheduled/manual run (future providers) + calendar read by the PROVIDER
        -> jobquest.ai-result 1.0 (workflow calendar_review, kind calendar_event)
        -> jobquest_submit_ai_result -> ingestAiResult -> ai_findings (parent, audited once)
        -> rpc_ai_resolve_calendar_key (identity) -> rpc_ai_upsert_calendar_event (child projection, no extra audit)
        -> /ai-hub/calendar | Overview card | Daily Digest "calendar" section | jobquest_list_calendar_intelligence (read-only)
```

JobQuest stores intelligence; it never talks to a calendar (no OAuth, no Google/Microsoft API, no create/edit/delete/RSVP) and has no scheduler.
The workflow id is the existing canonical **`calendar_review`** (AI-1A CHECK; `calendar_intel` was not added), the kind is the existing **`calendar_event`**:
**no enum change**, contract stays `jobquest.ai-result` 1.0 (additive validator).

## 2. Model and categories

Closed categories (9): `interview`, `recruiter_call`, `hiring_manager_call`, `networking_call`, `assessment_deadline`, `application_deadline`,
`take_home_deadline`, `follow_up`, `other`. Deadline-ness (`is_deadline`) is derived from the category, never provider-supplied. **Reschedule and
cancellation are lifecycle statuses** (`scheduled`, `tentative`, `rescheduled`, `cancelled`) of the same event, not categories; a provider that puts
`reschedule`/`cancellation` in `category` is normalised to category `other` + that status with a warning.
Fields: title, category, status, start/end or deadline or all-day dates, source zone, calendar source + event id (+ previous id), event URL, organizer name +
domain, company, job title, public job URL (read-time matching only), location, https meeting URL, attendee **count**, confidence, summary, evidence, cancelled_at,
previous_event; discovered time = server insert time. Nothing is invented.

## 3. Child-table decision

`ai_calendar_events` (migration `supabase/migrations/20261028100000_ai_hub_calendar_intelligence.sql`), 1:1 child of `ai_findings`: chronological, range,
deadline, category and reschedule/cancel queries need real columns. The parent stays the authoritative observation. Composite FK to the parent owner, RLS select =
parent predicate, no client writes, writers only `service_role` RPCs (`search_path=''`), no new grants. CHECKs: closed sets, all-day = dates / timed = instants,
end >= start, `cancelled_at` iff cancelled, https-only links. Indexes: `(workspace_id, sort_at, id)`, source identity, logical key (no speculative indexes).

## 4. Time semantics

Storage = UTC instants + the SOURCE IANA zone; display = the owner's profile zone (UTC if unset), never server or browser zone. Accepted inputs: offset timestamp, or
`*_local` + `time_zone`. Offset-less timestamps are rejected; invalid zone, end before start, malformed or impossible dates (Feb 30) rejected; start-only,
all-day (inclusive end date), date-only deadlines and deadline-only items allowed. DST: a wall time in the spring-forward gap is rejected, a fall-back duplicate
resolves to its first occurrence with a warning; an explicit offset conflicting with the zone is trusted and warned. All-day items are dates (never shifted by a zone),
anchored at local midnight in their own zone only for ordering; windows filter them by date. Implementation: `calendarTime.ts` (api) / `lib/aiCalendar.ts` (web).
Tests: process `TZ` independence, 25h/23h days, week across fall-back, half-hour zones, southern hemisphere.

## 5. Dedupe, reschedule, cancellation

Identity: calendar provider (`dedupe.source_name`) + event id (`cal:`). Fallback without an id: company + category + title + **start minute** (`calfb:`), so equal titles on
different dates never merge. `rpc_ai_resolve_calendar_key` converges cross-provider representations (same logical key, company known) but never merges two different
events of one calendar source, never when organizer domains conflict. A **reschedule** (same id, or a new id carrying `previous_event`, or no id with the previous start)
updates ONE finding; the server keeps `original_start_at`, increments `reschedule_count`, status `rescheduled`. A **cancellation** sets `cancelled`, `cancelled_at`, keeps the
time (and original time if moved); reinstatement clears it. Closed findings: DISMISSED is never rewritten; a REVIEWED item still receives schedule changes through the child
(a cancellation is never hidden behind a review). Documented limitation: the child keeps the latest-seen source identity; cross-provider matching after a later move relies
on the logical key.

## 6. Privacy

Attendee lists, descriptions, invite HTML, `.ics`, conference data and raw events are dropped with `raw_calendar_rejected`; only an attendee **count** is kept. Organizer = display
name (addresses stripped) + domain. https-only meeting/event links; secret-looking query parameters and fragments removed; credentials rejected.

## 7. Daily Digest

New `calendar` section (+ summary keys `calendar_today`, `calendar_deadlines`), additive to payload 1.0, built from stored items only in the owner's zone (timed items by instant,
all-day by date). Up to 5 items; up to 2 cancellations/reschedules are always kept; moved items say where from; calendar HIGH items feed priorities (interview today, deadlines
within 48 h, cancellations/reschedules). `available` / `zero` (a SUCCEEDED/PARTIAL `calendar_review` run exists) / `not_configured` preserved. Stored digests are immutable (system digest run id is stable per date;
tested). No core task is mutated.

## 8. MCP

`jobquest_list_calendar_intelligence` (`ai:read`, read-only): category, eventStatus, company, deadlinesOnly, startsSince/startsBefore, order, provider, status, page <= 50; sanitized;
no provider ids, attendees or raw data. **Eleven tools, ten reads, one write**; no calendar write tool, no provider endpoint; the single write boundary is unchanged.

## 9. UI

`/ai-hub/calendar` and tab "Calendar" (seven tabs; AI-6 clipping fix preserved and regression-tested). Views Upcoming/Today/This week/Past/Date range, filters, 20/page, all states,
Scheduled-event vs Deadline labelling, reschedule/cancel presentation, link suppression, long-content wrapping; the only action is Dismiss (owner). Read-time links (never persisted,
ambiguous stays unlinked): stored Job Lead (exact canonical job URL, else company+title), tracked application (same rule), and "also reported by email" (same company, deadline within 1 h).
Overview gains one Calendar card (upcoming / interviews / deadlines).

## 10. Claude workflow

`provider-workflows/claude/CALENDAR_INTEL.md` rewritten to the exact contract (safety, privacy, time rules, identity, reschedule/cancel, example validated by a unit test). `CLAUDE_SCHEDULED_TASKS.md`
section 6b: weekday morning, optional afternoon; provider-owned schedule; no stored next-run time. The workflow definition is now operational. (Observation, not changed here: the AI-6 workflow
definitions for job_discovery/email_triage/recruiter_intel still read `sourceOperational: false`.)

## 11. Migration

`20261028100000` applied to the LOCAL stack. Dev (`jobquest-dev / xpnkasclquplmrcmhsif`) only after branch CI (result in the checkpoint). Production head stays `20261022100000`.

## 12. Dedicated AI Hub browser CI

New job `ai-hub-e2e` in `.github/workflows/m1b-ci.yml`: its own runner and disposable local Supabase stack, `AI_HUB_ENABLED` / `VITE_AI_HUB_ENABLED` appended to **that job's** env file only,
runs only `ai5-digest`, `ai6-sources`, `ai7-calendar` specs (Digest, Job Leads, Email, Recruiter, Calendar, shell, axe at 375/768/1280, clipping regression). Synthetic seeded data, no secrets, no provider/real
account. The `database` job's full browser suite is unchanged (the AI Hub specs skip there). The Calendar spec's clipping check goes beyond `scrollWidth`: no element outside `main`, shell within the viewport, every
tab reachable, per tab and per size. `tests/unit/ai-7-ci.test.ts` guards the isolation.
Test-harness note: refresh tokens are single-use with replay detection, so the shell loop navigates by clicking tabs instead of a burst of full reloads (a reload burst signed the test user out).

## 13. Tests (local, before push)

| Check | Result |
|---|---|
| Unit suite (full, once) | 44 files, 693/693 (new: `ai-7-calendar-contract`, `ai-7-calendar-ui`, `ai-7-templates`, `ai-7-ci`) |
| Integration AI suites 1B/2A/2B/3/4/5/6/7 (real local DB) | 10 files, 107/107 (new: `ai-7-calendar` 14, `ai-7-mcp` 5: RLS owner/manager/peer/other workspace/suspended/forged, dedupe, reschedule, cancel, constraints, reads, digest, isolation) |
| Focused e2e `ai5-digest` + `ai6-sources` + `ai7-calendar` (flags ON locally) | 3/3 PASS; axe 0 serious/critical |
| Root typecheck / eslint / build / bundle scan / tracked-file secret scan | PASS / PASS / PASS / 0 findings / 0 findings |

## 14. Deferred

Human-approved Job Lead -> Application, controlled application/task actions, email send/reply, calendar mutation, ChatGPT/Gemini providers, OAuth, ambiguous application matching, Production rollout. Live Claude calendar test: not performed.
