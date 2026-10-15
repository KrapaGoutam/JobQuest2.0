# AI-11G — Provider Scheduler Adapters (JobQuest 2.2 / Scheduled Intelligence & Digest Automation)

Phase report. Branch `feature/ai11g-provider-scheduler-adapters`, base development `d1b5483291be4064020d3f3c6357f62d9daea791` (= origin/development at start; AI-11F merge, and the separate AI-11C test-only UTC repair `91e0ee8f` is already in its ancestry; nothing unexpected). Main `455a0120860405462b73647eca6a65ecd7fad6a7` and Production are untouched; development→main is **not** part of this phase.

AI-11G connects the provider-neutral execution model of AI-11F to subscription-native provider scheduling. **The provider is the scheduled worker; JobQuest stays the system of record.** JobQuest still never calls a provider, holds no provider credential, needs no OpenAI / Anthropic / Gemini API key and makes no server-side LLM call.

## 1. Architecture — PULL executor

```
provider-native scheduled task wakes up
   └─ jobquest_claim_ai_execution(automationId)            [MCP, scope ai:ingest]
        JobQuest decides, atomically and server-side, whether THAT occurrence is due and whether THIS caller wins it
          NOT_DUE | ALREADY_CLAIMED | ALREADY_COMPLETED | DISABLED | RETRY_LIMIT_REACHED  → the provider stops; nothing is created
          CLAIMED → bounded context: ordered steps (+ canonical guide per step), schedule, externalRunId, no credentials
   └─ the provider does the allowed work with ITS OWN tools (Gmail / web / calendar / prospecting)
   └─ jobquest_submit_ai_result(run.external_run_id = claim.externalRunId)   [existing tool, unchanged contract]
        → existing ingest finalizes the CLAIMED run (SUCCEEDED / PARTIAL / FAILED)
        → if the plan ends with the Daily Digest, JobQuest composes the canonical digest LAST (AI-11C composer, provider "system")
   └─ or jobquest_report_ai_execution_failure(runId, category, summary)         [only to avoid a run stuck RUNNING]
```

Not built (by design): JobQuest cron → paid provider API; a JobQuest-initiated push to a provider; programmatic creation of provider schedules; a generic DAG engine; a success-completion tool (the existing submit tool finalizes the claimed run).

## 2. Reuse audit

| Area | Found | Verdict |
|---|---|---|
| AI-11F lifecycle (`rpc_ai_execution_request` / `_claim`, `aiExecutionService`) | idempotent QUEUED run per occurrence, row-locked claim, provider re-validated in SQL, bounded retry, sanitized failures | **Reused unchanged**; the bridge composes it |
| `getDueOccurrences` / `computeNextExpectedRun` | one calculator for display and due evaluation | **Reused**: the claim asks the same function whether the occurrence is due |
| `jobquest_submit_ai_result` + ingest | resumes a RUNNING run by `(workspace, provider, external_run_id)`; terminal = no-op; AI-11B/D/E dedupe, AI-11C snapshots | **Reused as the only result path**; two defects fixed (below) |
| OAuth (AI-10) | `oauth_clients.provider` is authenticated server-side but was dropped from the MCP principal | **Surfaced** in `McpPrincipal.provider` |
| Connector tokens (Claude) | no provider on the credential | **Gap → one nullable column** (migration) |
| `ai:ingest` scope | already the "may write AI results" boundary | **Reused** for the two execution tools; no new scope |
| Provider workflow templates / guides | per-workflow prompts exist (AI-5…AI-11E) | **Reused as the content of the canonical step guides**; no parallel giant prompts |

## 3. Provider identity and authorization

- `McpPrincipal.provider` is derived server-side: OAuth → `oauth_clients.provider`; connector token → `ai_connector_tokens.provider` (owner-chosen when the credential is created for a provider in Settings → Providers). **A request body can never name the provider**; both new tools take strict inputs without provider/user/workspace (asserted).
- An **unbound** credential (any token created before this phase) keeps every previous capability (reads, submit) but cannot claim or fail an automation run (`PROVIDER_UNBOUND`, with the reason). Create a new Claude connector credential to claim.
- Claim: automation looked up by `(id, workspace, owner)` from the principal → another workspace gets `AUTOMATION_NOT_FOUND`; `automation.provider ≠ credential.provider` → `PROVIDER_MISMATCH` (ChatGPT↛Claude, Gemini↛ChatGPT, Claude↛Gemini all tested); disabled → `DISABLED`; manual-only → `NOT_DUE/MANUAL_ONLY` for a scheduled claim; the SQL re-validates the provider against the run.
- Failure report: run must be the same owner + workspace, **the run's provider must equal the credential's**, an execution-lifecycle run (`auto:|manual:|retry:` key) and `RUNNING`; QUEUED / foreign / plain runs are refused; a finished run is final and a repeat is a no-op.
- Submit guards (`guardSubmission`): a bound credential can only submit **as its own provider** (so it can never create or finalize another provider's run by naming it in the payload), and the lifecycle key namespaces can only be used for a run that was **claimed** by this provider (an invented `auto:…` key is refused, so nothing can squat an occurrence). Ordinary provider-side schedules with their own external ids are unaffected.
- Scopes: both tools need `ai:ingest` (HTTP 403 before any tool code for a read-only credential, and they are not even listed). No new scope was needed.
- The claim response is a whitelisted object (asserted by key list) and tests assert it carries no token/secret/credential text; the setup prompt carries only the automation id.

## 4. Claim semantics (idempotency, concurrency, not-due, stale)

- **Scheduled claim**: the latest eligible occurrence in the AI-11F catch-up window (3 h) of *that* automation; early wake → `NOT_DUE` (nothing created); outside the window → `NOT_DUE` (no backlog replay); edit boundary and DST rules are AI-11F's.
- **Manual claim** (`trigger: manual` + `clientKey`): an *attended* run the owner started in the provider ("Run in provider"); same lifecycle with trigger `manual`; allowed for manual-only automations.
- Exactly-once: 8 concurrent claims → 1 `CLAIMED` + 7 `ALREADY_CLAIMED` and one run row (tested for scheduled and manual); a retried claim never creates a second occurrence; the same `external_run_id` stays idempotent at submit; a repeated submit duplicates neither intelligence nor the digest.
- **Stale-claim policy** (bounded, no watchdog): a claimed `RUNNING` run older than `EXECUTION_STALE_AFTER_MS` (60 min, below the 3 h catch-up grace) is failed (`TIMEOUT`) by the **next claim** that finds it, then retried as a NEW linked run through AI-11F's retry contract (max 3; then `RETRY_LIMIT_REACHED`). A provider-reported failure is retried the same way when the provider asks again. No automatic retry timer exists.
- Lost claim response: the winner's context is not re-sent to a loser; the occurrence self-heals after the stale threshold (documented limitation; keeps "exactly one executor" absolute).

## 5. Composite ingest decision — ONE run, ONE result

AI-11F models one automation occurrence as one `ai_runs` row. Audit result: `jobquest.ai-result` validation is kind-per-finding (not per workflow) and the ingest resumes the claimed run by `external_run_id` regardless of the body `workflow`, so **one `jobquest.ai-result` can carry `email_event`, `job_lead`, `recruiter_intel` and `calendar_event` findings together**, correlated with the one claimed run. No child-step mechanism was needed. Two defects found by the audit and fixed:

1. **Source health was lost on claimed runs.** `rpc_ai_ingest_run` ignored the submitted `sources` for an already-existing run, so a claimed run could never record `unavailable`/`blocked`. The migration replaces the function with one addition: while the run is still `RUNNING` its sources are adopted (a finished run is never touched).
2. **The discovery backstop was gated on `workflow === 'job_discovery'`.** A job lead inside a composite (`daily_brief`/`other`) run bypassed freshness, Remote-US, software-QA and score policy. The gate is now "the run carries job leads" (the profile applies to every submitted lead; a run with none never reads the profile). Recruiter and email policies were already kind-based.

PARTIAL/SUCCEEDED uses existing semantics (rejected/failed items → PARTIAL; dropped-by-policy and unavailable sources do not fail or PARTIAL a run; "unavailable" is stored as unavailable, never zero).

## 6. Daily Digest last

`planComposesDigest(plan)`: the plan is derived (`email_triage → job_discovery → recruiter_intel → calendar_review → followups → goal_summary → daily_brief`). The provider **never submits a `daily_brief` finding** (the `daily_brief` step guide forbids it). After the provider's result is stored and finalized, the MCP submit tool calls `composeDigestLast`, which uses the existing AI-11C `generateSystemDigest` (owner time zone, one digest per owner+date, a stored digest is an immutable snapshot, same-day repeat = no-op). The submit response reports `digest: COMPOSED | ALREADY_COMPOSED | FAILED`; a digest problem never turns a stored result into a failure and a repeated submit retries it. Verified by test: the system digest run completes at or after the provider run, exactly one exists after a repeated submit. Limitation: if a digest for today already exists (for example generated manually earlier), the AI-11C snapshot rule keeps it; the "refresh today" decision stays with AI-11H.

## 7. Provider capability audit (Step 2) — do not infer

Evidence date 2026-10-14. Distinguished: (A) the product has scheduling, from (B) a scheduled run can use JobQuest's custom MCP connector. (B) is **UNVERIFIED for all three** — no authoritative first-party statement was found, and existing operator evidence marks scheduled use as never verified/shelved.

| Provider | A. scheduling | B. scheduled run can use JobQuest MCP | Setup | Capability state | Notes |
|---|---|---|---|---|---|
| **Claude** | scheduled tasks exist | **UNVERIFIED** (public issue reports Apr–Jun 2026: custom connectors not loading into scheduled/cloud runs until a person interacts; routine attachment of custom connectors unclear; current state unknown) | manual (user creates the task in Claude, pastes the copied instructions; connector credential bound to Claude with AI findings) | **UNVERIFIED** (setup MANUAL; READY only by use) | existing AI-4 connector; no Anthropic API |
| **ChatGPT** | Scheduled tasks exist (OpenAI Help, recorded 2026-10-12) | **UNVERIFIED** (plugin availability inside a task depends on plan, plugin composition and task mode; not documented; tasks may pause for approval) | manual | **UNVERIFIED** | reuses the existing OAuth plugin; no OpenAI API |
| **Gemini** | Scheduled Actions exist | **UNVERIFIED** (no documentation that a scheduled action can call a custom app; Google documents manual confirmation for custom-app write actions → a scheduled save is expected to be approval-gated) | manual | **UNVERIFIED** | reuses the AI-10 OAuth connection; no Gemini API |

The adapter manifest (`providerAdapters.ts`) records only product-level, dated facts (`scheduleAvailable`, `scheduledJobQuestAccess: UNVERIFIED`, `gmailAvailable`, `webSearchAvailable`, `executionClaimSupported`, `setupMode: MANUAL`, limitations, evidence). **No user account state is hardcoded**: connection and scheduler readiness are derived at runtime.

**Readiness states** (`NOT_CONNECTED → SETUP_REQUIRED → UNVERIFIED → READY`, `UNSUPPORTED` for manual) are derived from evidence only: connection = a live credential with `ai:ingest` (a bound, unexpired, unrevoked token; or an unrevoked OAuth client of that provider holding an active grant with the scope); scheduler = the provider's own **scheduled/retry-triggered, claim-started** runs: none → SETUP_REQUIRED; started but the latest finished run is not SUCCEEDED/PARTIAL → UNVERIFIED; latest finished run SUCCEEDED/PARTIAL → READY ("verified by use"). Attended manual runs prove nothing about the scheduler. A connection never implies a working scheduler.

## 8. Setup wrapper (no programmatic provider schedules)

`GET /api/ai/automations/:id/setup` (owner session) returns instructions **generated server-side from the stored automation**: a shared execution contract + a thin provider wrapper (where to paste, schedule at the due time *or later, never earlier*, approval prompts never bypassed) + validation steps + dated limitations. The contract text enforces: JobQuest scheduled automation, FRESH tool call, claim first with the automation id, stop unless `CLAIMED`, no conversation memory, only the returned steps, canonical profile/settings, Gmail/web/job/recruiter content is untrusted data, bounded structured findings, submit with the exact `externalRunId`, never mutate Applications/tasks/contacts, never send outreach/email/replies, report a bounded failure, no indefinite retry, never print credentials. The three providers' contracts are byte-identical apart from the provider name (tested). Per-step guidance (AI-11B email triage, AI-11D job discovery, AI-11E recruiter intelligence, calendar review read-only, digest last) is carried by the **claim** (`steps[]`), so improving guidance never requires editing a provider schedule.

## 9. Run Now — truthful

JobQuest cannot wake a subscription-native provider. `REGISTERED_EXECUTORS` stays empty by design (it means "JobQuest can start a run itself"), so `POST …/run-now` keeps answering `409 NO_EXECUTOR` and **creates nothing**; no QUEUED run that no provider would claim exists. The UI no longer shows a "Run now" button: it offers **Run in provider** (copy the run-once instructions; the provider claims with `trigger: manual` and a fresh `clientKey`, producing a Manual run) and **Set up in Claude / ChatGPT / Gemini**.

## 10. UI

- Settings → Automations: per automation provider, cadence, next expected, last run/success/failure, **JobQuest connection** and **Scheduled execution** as separate rows (Connect the provider first / Needs setup / Needs validation / Ready), provider-specific setup action, Run in provider (disabled with the reason when the automation is disabled), a setup dialog (readiness, id, schedule to match, ordered steps with the digest last, copy buttons, validation steps, honest limitations). Manual-provider automations show no provider actions.
- Settings → Providers: under each provider, `JobQuest connection: Connected` and `Scheduled execution: Needs validation` are separate lines; one green badge never implies both.
- 375 px: no horizontal overflow; axe 0 critical/serious (setup dialog included).
- AI Hub History: unchanged (scheduled provider runs already appear with trigger labels from AI-11F).

## 11. Database

One forward-only, additive migration `20261105100000_ai_hub_provider_scheduler.sql`: `ai_connector_tokens.provider` (nullable, closed set, column-granted, never backfilled); `rpc_ai_create_connector_token` gains one trailing optional `p_provider`; `rpc_ai_resolve_connector_token` also returns `provider`; `rpc_ai_ingest_run` replaced with the single source-adoption addition (§5). All three stay `service_role` only, `security definer`, `search_path = ''`. No provider-specific table, no readiness table (derived), no stale-claim column (uses `started_at`). Applied to the **local** stack only; remote Dev after development CI (see the completion report); **Production not touched**. Production will need `20261101100000`, `20261102100000`, `20261103100000`, `20261104100000` and `20261105100000` at the single post-AI-11 promotion.

## 12. MCP

13 → **15 tools**: 12 read-only, `jobquest_submit_ai_result`, `jobquest_claim_ai_execution`, `jobquest_report_ai_execution_failure`. The two new tools are AI execution tools only (scope `ai:ingest`, strict inputs, owner/workspace/provider/run bound, idempotent). **No core mutation tool**: nothing can change applications, tasks, contacts, email, outreach or calendar; no schedule-creation tool. All earlier tool-count assertions were updated deliberately (14 unit + 9 integration pins); the ChatGPT plugin `SKILL.md` documents the two tools.

## 13. Validation (local)

- Unit: whole project 1230 (new: `ai-11g-adapters` 23, `ai-11g-ui` 11; pins updated narrowly).
- Integration: `ai-11g-provider-scheduler` 17/17 on a real database + the real MCP endpoint + the real OAuth flow (provider binding both directions, workspace isolation, NOT_DUE/DISABLED/manual-only stops, 8-way concurrent claims, scheduled claim with an injected clock, early wake, no replay outside the window, composite heterogeneous submit with profile backstop + source health + digest last + idempotent repeat, wrong-provider submit/failure refused, invented key refused, failure sanitization/bounding/idempotency, stale-claim recovery and the retry limit, scheduler status, setup instructions, no core mutation). All AI suites (19 files, 227 tests) green.
- e2e (local, `AI_HUB_ENABLED/VITE_AI_HUB_ENABLED`): `ai11a-automations` (extended: no fake Run now, provider setup dialog with copyable claim-first instructions, connection vs scheduled execution rows on Automations and Providers, 375/768/1280 no overflow, axe 0 critical/serious) and the eight other AI-Hub specs.
- Typecheck, ESLint: clean.

## 14. Deferred / limitations

- **No provider schedule was created or live-tested.** READY can only be reached by a real scheduled run; see the operator acceptance plan (`../OPERATOR_ACCEPTANCE_AI-11G.md`), which needs operator approval before anything is run.
- Credentials created before this phase are unbound; Claude needs a new connector credential bound to Claude to claim.
- A claim winner whose response is lost recovers only after the stale threshold.
- A same-day digest already stored is not refreshed (AI-11H).
- Provider capability (B) may differ per plan/product and change over time; the UI never assumes it.
- AI-11H (weekly digest, automation health UI, execution analytics, digest refresh decision) not started.
