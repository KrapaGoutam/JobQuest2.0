# AI-11F — Schedule / Cadence Execution (JobQuest 2.2 / Scheduled Intelligence & Digest Automation)

Phase report. Branch `feature/ai11f-schedule-execution`, base development `78075e9c33db1f02cc6c4710e52af4a8962de2f0` (verified unchanged on origin before any edit). Main `455a0120860405462b73647eca6a65ecd7fad6a7` and Production are untouched; development→main is **not** part of this phase.

AI-11F makes the AI-11A automation configuration *operational* with a provider-neutral execution lifecycle. It does **not** call Claude, ChatGPT or Gemini, holds no provider credential, adds no provider-specific scheduler and adds no MCP tool. Provider adapters are AI-11G.

## 1. Reuse audit

| Area | Found | Verdict |
|---|---|---|
| `ai_workflow_configs` (AI-11A) | one row = one automation: workflow, provider, enabled, cadence, local time, IANA zone, ISO weekdays, sections, delivery; `updated_at` trigger | **Reused as the desired behaviour** |
| `ai_runs` | provider-neutral history: 7 statuses, `trigger_type` `scheduled|manual|retry`, `retry_of_run_id`, `error_category`/`error_detail`, unique `(workspace, provider, external_run_id)`, `rpc_ai_ingest_run` / `rpc_ai_finalize_run` with a legal-transition matrix | **Reused as the only history** |
| `computeNextExpectedRun` (AI-11A) | the only schedule calculator, DST-aware via `localToInstant`/`zoneOffsetAt` | **Reused; its core was factored out** so due evaluation uses the same function |
| Ingest | duplicate `external_run_id` RUNNING → resume; terminal → no-op; QUEUED → `RUN_NOT_OPEN` | **Reused as the executor's result path** |
| Missing | run→automation linkage, a scheduled-for identity, a claim step, retry limits, a table-level guard, executor readiness | **Added (below)** |

## 2. Architecture decision — **EXTEND** (option B)

`ai_runs` gets two nullable columns; `ai_workflow_configs` is unchanged. No occurrence table, queue, DAG or generic workflow engine. Concurrency and idempotency are represented safely by unique indexes plus a row lock, so option C was not needed.

## 3. Canonical occurrence identity

`(automation_id, scheduled_for, trigger_type)`, enforced by the database:

| Trigger | `external_run_id` | Notes |
|---|---|---|
| `scheduled` | `auto:<automation>:<UTC stamp YYYYMMDDTHHMMSSZ>` | + unique `(automation_id, scheduled_for)` for `trigger_type='scheduled'` |
| `manual` | `manual:<automation>:<client key>` | Run Now; the browser sends a fresh key per click, so a double click or retried request is one run |
| `retry` | `retry:<first attempt run>:<n>` | n = 1..3, a NEW run |

Plus unique `(automation_id, external_run_id)`. The SQL key and `scheduledRunKey()` are asserted byte-identical. Provider/workflow are copied onto the run at creation and a trigger (`ai_runs_guard`) makes workspace, owner, provider, workflow, trigger, `scheduled_for` and a set `external_run_id` immutable; `automation_id` may only be nulled (automation deleted). A re-request of an occurrence after the automation's provider was edited returns the **original** run.

## 4. Lifecycle

```
due evaluation ─▶ rpc_ai_execution_request ─▶ QUEUED ─▶ rpc_ai_execution_claim ─▶ RUNNING
                  (idempotent, scheduled|manual|retry)  (row lock; exactly one winner)
RUNNING ─▶ executor → jobquest_submit_ai_result (run.external_run_id = claim.externalRunId) → SUCCEEDED | PARTIAL | FAILED
        └▶ reportExecutionFailure → FAILED (category + sanitized one-line summary)
```

No new statuses. Legal transitions are the existing `rpc_ai_finalize_run` matrix; `ai_runs_guard` additionally refuses *any* status change of a finished run, even a direct service-role write (SUCCEEDED/FAILED → RUNNING is impossible). History is never rewritten.

- **Claim** validates the executor's provider **against the run in the database** (`AI_EXECUTION_PROVIDER_MISMATCH`), the owner and the active membership, and returns a bounded context only to the winner: run id, automation id, workflow, provider, trigger, `scheduled_for`, time zone, sections, delivery, `external_run_id`, `retry_of_run_id` — plus the ordered `plan` built by the service. No secret/token/credential field exists in it (asserted by key whitelist).
- **Disabled / reassigned / deleted while QUEUED**: the claim does not execute it; the run is **CANCELLED** (reason `AUTOMATION_DISABLED` or `AUTOMATION_REASSIGNED`); deleting an automation cancels its QUEUED runs. A RUNNING/finished run is never altered by disabling or deleting. Deleting never cascades run history (`on delete set null`).
- **Retry** (`requestRetry`, no automatic retry anywhere): only a FAILED run, nothing else in flight for that occurrence (checked under a lock on the first attempt), at most 3 retries (`RETRY_LIMIT`). The new run points at the first attempt, keeps the occurrence's `scheduled_for`, workflow and provider, and the failed run is untouched.
- **Duplicate submissions**: the existing ingest resumes a RUNNING run with the claimed key, treats a terminal run as a no-op, and refuses an unclaimed (QUEUED) one. AI-11B/D/E dedupe and AI-11C snapshot idempotency are unchanged and still apply per item.

## 5. Due evaluation, timezone and DST

`getDueOccurrences(candidates, now)` (pure; `latestDueOccurrence` per automation) shares `occurrenceOnLocalDay` with `computeNextExpectedRun`, so the Settings card, Next automation card, due evaluation and tests have **one** source of truth (a sweep test proves `next expected` is exactly the instant it becomes due, across both DST weeks). Enabled only; manual-only and provider-less never; the local date and weekday come from the automation's zone, never the server's; bounded (≤ 10 automations, ≤ 1 occurrence each); ordered `(scheduledFor, id)`.

- **Spring forward** (`America/Chicago`, 02:30 on 2026-03-08): the wall time does not exist → the first valid instant after the gap, 03:30 CDT = `08:30Z`. Once.
- **Fall back** (01:30 on 2026-11-01): the ambiguous time resolves to its **first** occurrence (`06:30Z`) and is one instant → one occurrence, one key. A 5-minute sweep over the whole repeated hour yields exactly one distinct occurrence.
- Nothing is hard-coded to Chicago; Tokyo and UTC are tested too (including the UTC-midnight boundary and a local weekday that differs from the UTC weekday).

## 6. Missed-run policy

Catch-up grace = **3 hours** (`AUTOMATION_CATCHUP_GRACE_MS`). Only the single most recent eligible occurrence in `(now − 3 h, now]` is due; older ones are skipped, never replayed, so an outage creates no backlog (tested with a 5-day outage). An occurrence at or before the automation's last configuration change is **not** due (`scheduled_for > updated_at`, enforced again in SQL), so a schedule edit or re-enable cannot double-run or retroactively fire a slot the new configuration did not own; past `scheduled_for` values are never rewritten and the new cadence drives all future occurrences. The SQL also rejects fractional, future (> 1 min) or > 1-day-old slots.

## 7. Run Now — **DEFERRED WITH EXECUTOR GATE** (backend real)

`POST /api/ai/automations/:id/run-now` (CSRF, owner session, AI Hub kill switch, strict body `{workspace_id, client_key}`) uses the **same** lifecycle with trigger `manual`. It is only available when an executor is configured for the automation's provider; otherwise it returns `409 NO_EXECUTOR` and **creates nothing**, so no fake or permanently stuck run exists. The UI therefore keeps **Run now** disabled with the real reason ("no provider scheduler is connected, so JobQuest can't start a provider run"). The backend path is fully tested with an injected executor.

**Executor readiness** is provider-neutral and derived, not stored: `configured | not_configured | unavailable` from `executorState(provider, { aiHubEnabled, registered })`. `REGISTERED_EXECUTORS` is empty by design in AI-11F; AI-11G registers a provider with no schema change. `manual` never has an executor.

## 8. Provider-neutral executor contract (for AI-11G)

1. `enqueueDueOccurrences(ctx)` (poller) / `requestRunNow` → QUEUED run (idempotent). Only providers with a configured executor are enqueued.
2. `claimExecution(ctx, runId, provider)` → `{claimed:true, claim}` for exactly one caller; others `{claimed:false, status}`.
3. The adapter walks `claim.plan` in order, then calls `jobquest_submit_ai_result` with `run.external_run_id = claim.externalRunId` — that is how the result correlates to **this** run.
4. Failure: `reportExecutionFailure(ctx, runId, category, summary)` → FAILED with a normalized category (`PROVIDER_UNAVAILABLE`, `CONNECTOR_AUTH_EXPIRED`, `SOURCE_UNAVAILABLE`, `PARTIAL_READ`, `SCHEMA_INVALID`, `TIMEOUT`, `RATE_LIMITED`, `INTERNAL`) and a summary sanitized by `sanitizeFailureSummary` (control characters, URLs, e-mail addresses, Bearer/JWT/opaque token runs removed; ≤ 200 chars). Technical detail belongs in operational logs only.
5. Retry: `requestRetry(ctx, failedRunId)`; a duplicate submission is handled as in §4.

Authorization: the executor entry points are **service functions taking a trusted context** (owner + workspace derived by the server from a verified session or connector token — never from a body). They are deliberately **not HTTP routes** in AI-11F; AI-11G decides how an adapter authenticates. The database RPCs are `service_role` only (`revoke … from public, anon, authenticated`).

## 9. Composite workflow ordering

`executionPlan({workflow, sections})` — the stored section set is alphabetical, so order is derived: `email_triage → job_discovery → recruiter_intel → calendar_review → followups → goal_summary → daily_brief`. **The Daily Digest composes LAST.** A single-purpose workflow is one step; a custom review runs its sections in the same order with no digest step. A bounded ordered list, not a DAG. Supports every AI-11A workflow (`email_triage`, `job_discovery`, `recruiter_intel`, `calendar_review`, `daily_brief`, `other`) with no provider-specific logic.

## 10. Database

One forward-only, additive migration `20261104100000_ai_hub_schedule_execution.sql` (single transaction): `ai_runs.automation_id` (FK `on delete set null`) and `scheduled_for`; two partial unique indexes + one history index; trigger `app.ai_runs_guard`; `rpc_ai_execution_request`, `rpc_ai_execution_claim`; `rpc_ai_automation_delete` re-created (same signature/grants) to cancel QUEUED runs before deleting. RLS unchanged (owner-only SELECT through `can_access_owned_record`; no client write). Applied to the **local** stack only; remote Dev after development CI (see the completion report); Production **not** touched. Production will need `20261101100000`, `20261102100000`, `20261103100000` and `20261104100000` at the single post-AI-11 promotion.

## 11. API / MCP

- New: `POST /api/ai/automations/:id/run-now`, `GET /api/ai/automations/:id/runs` (last 10; linked runs plus provider-submitted runs of the same workflow+provider, the same rule as the card's derived state; only the normalized `error_category`, never `error_detail`; 404 for a non-owner or another workspace).
- Automation list now also returns `state.lastTrigger`, `state.lastFailureAt` and `executor`.
- **MCP unchanged: 13 tools, 12 read-only + the single write `jobquest_submit_ai_result`.** No automation/schedule/claim/execution tool, no core mutation tool.

## 12. UI

Settings → AI & Automation → Automations: per-automation "Provider scheduler: Not connected yet / Connected / Unavailable", "Last started by Scheduled / Manual / Retry", "Last failure", the existing last run / success / error, Run now (enabled only when the server says ready; clicking uses a fresh key and shows "Run requested… waiting for the provider scheduler"), and a lazily loaded **Recent runs** section labelled Scheduled/Manual/Retry with status. AI Hub History rows now show the trigger beside provider and status. Automation health (did the workflow execute?) stays distinct from source health (could it reach its sources?); AI-11H polishes the analytics.

## 13. Validation

- Unit (whole project) 1192 + new: `ai-11f-execution` (41), `ai-11f-ui` (4); AI-11A pins updated narrowly (additive state fields, `trigger_type` column; migration list).
- Integration `ai-11f-execution` (14, real DB + real API): identity pinned SQL==TS, idempotency incl. provider edit, **8-way concurrent request → 1 created, 8-way concurrent claim → 1 winner**, owner/workspace/provider isolation, occurrence validation + edit boundary, Run Now gate + lifecycle, transitions and table guard, failure hygiene, retry chain + limit + concurrency, disable/reassign/delete, ingest correlation and duplicate submission, every workflow, history, no core mutation, MCP unchanged. All `ai-*` integration suites: 17/18 files green locally; the one red (AI11C-03) is a pre-existing wall-clock defect, fixed separately (§14).
- e2e `ai11a-automations` (extended): executor row, last failure, Run now disabled with the real reason, scheduled vs manual in Recent runs, History trigger label, 375 px no overflow with the history open, axe 0 critical/serious (existing 375/768/1280 audits included).

## 14. CI defect found and handled separately

`AI11C-03` builds a peer (no profile time zone → UTC date) digest with carol's `America/Chicago` date, so it fails between ~00:00 and ~05:00 UTC (found at 02:57 UTC; same class as the earlier AI11C-05 fix). Not caused by AI-11F: no digest code or test file is in this diff. Reproduced, then fixed test-only on `fix/ai11c-peer-utc-digest-date`, and verified inside the failing window.

## 15. Provenance note

The AI-11E Dev migration (`20261103100000`) was found applied during later verification, but the actor and time of that apply were not documented. The schema and ledger were independently verified correct. This is provenance/documentation only, not a blocker.

## 16. Deferred

AI-11G provider scheduler adapters (Claude first, then ChatGPT, then Gemini; subscription-native scheduling, no paid API tokens as the primary architecture; registers executors, decides executor authentication, stale RUNNING/QUEUED reaping). AI-11H weekly digest, automation health UI, execution analytics, digest refresh decision, scheduling UX polish.

## 17. Limitations

- Nothing creates occurrences on a timer inside JobQuest (no scheduler by design): `enqueueDueOccurrences` is invoked by the adapter/poller (AI-11G). Until then provider-side schedules keep reporting through `jobquest_submit_ai_result` as before and appear in history and derived state.
- A claimed (RUNNING) run whose executor dies stays RUNNING until the adapter reports a failure or resumes it; reaping policy is AI-11G.
- Edits count: `updated_at` changes on every save (including rename/toggle), so a save within a slot's own minute forfeits that slot.
