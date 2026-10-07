# AI Hub — Provider & Workflow Integration Plan

Capabilities and readiness live in `PROVIDER_CAPABILITY_MATRIX.md`; contract in `DATA_MODEL_PLAN.md` §4; auth in `SECURITY_AUTH.md`.

## 1. Who does what

| Coding agent can do | Operator must do |
|---|---|
| repo code, Dev migrations (after approval), MCP server, UI, APIs, tests, docs | provider login, OAuth consent, Claude custom connector setup, Gemini custom app, ChatGPT developer-mode app, creating provider-side scheduled tasks, creating secrets/peppers in Vercel, plan/permission configuration, throwaway-connector spike |

No document may claim provider configuration happened unless the operator reports it, recorded in `HANDOFF.md` → "Provider assumptions".

## 2. MCP server (AI-3)

- Path `/api/mcp`, Streamable HTTP, stateless, JSON-RPC; separate Hono sub-app so it is exempt from `requireSameOriginJson` but has its own CORS-less posture (providers call server-to-server), its own auth middleware, body-size cap, per-token rate limits, structured logging without payloads.
- Alternatives considered: (a) second Vercel project — better isolation, doubles env/secret management; (b) Supabase Edge Function — closer to DB but forks auth code. Revisit only if (a) shared-function timeouts or (b) blast-radius concerns materialize in AI-3A.
- Tools: read tools and write tools as in `ARCHITECTURE.md` §4–5. Tool annotations: read tools `readOnlyHint: true`; write tools marked non-read-only and non-destructive (affects ChatGPT confirmation behavior).
- Tool outputs validated against output schemas before return; errors are typed (`SCHEMA_INVALID`, `UNAUTHORIZED`, `SCOPE_DENIED`, `RATE_LIMITED`, `DISABLED`).

## 3. Failure & retry policy

| Failure | Handling |
|---|---|
| Provider unavailable / connector expired | no run arrives; UI shows stale-since banner after the expected window; connector status `needs_reauth` on 401 patterns; operator re-auths |
| Source unavailable / partial Gmail read | provider reports `PARTIAL_READ`; run PARTIAL with counts; findings kept |
| AI response invalid | per-item reject; run PARTIAL (some valid) or FAILED (none); error category `SCHEMA_INVALID`; response tells the model which fields failed so it can retry |
| MCP failure / timeout | provider-side retry; JobQuest is idempotent (run id + dedupe keys) so retries never duplicate |
| Server-initiated retries | none in v1 (pull model). Manual "re-run" creates a `trigger_type=retry` run linked by `retry_of_run_id` |
| Backoff | providers own it; JobQuest answers `429` + `Retry-After` |
| Max retries | n/a server-side; tokens auto-pause after N consecutive SCHEMA_INVALID runs (N configurable, default 5) |
| Fallback provider | `ai_workflow_configs.fallback_provider`; only informational/manual in v1 |

## 4. Workflows

**Daily Brief** — read `get_daily_context`; save one `daily_brief` finding: goal progress, apps today/yesterday, remaining daily goal, overdue tasks, urgent follow-ups, recruiter replies, interviews, assessments, email events, stale apps, new leads, recommended order. Dedupe `daily_brief:<local date>` (profile timezone; reuse `useProfileTimeZone`/dayKey semantics). Stored in AI Hub.

**Email triage** — taxonomy `job`: Login/Account, Application Submitted, Application Update, Action Required, Recruiter Outreach, Screening, Interview, Assessment, Rejection, Offer, Status Update, Job Recommendation, Other Job Related; `other`: Security, Billing, Banking, Shopping, Personal, Travel, School, Subscription, Newsletter, Promotion, Other. **Only job-related summaries are stored; `other` is counted, not stored** (privacy). Priority is a separate field: CRITICAL (interview today, assessment due today, offer deadline, action ≤24h), HIGH (recruiter availability request, interview scheduling, assessment ≤72h), NORMAL (confirmation, ordinary update), LOW (generic recs/promos), INFO. Rules (`Settings → AI & Automation → Email Rules`): default/custom/excluded keywords, sender and domain filters — passed to the provider as *signals* in `get_email_rules`; classification is semantic, keywords are never authoritative. JobQuest is not an email client: no bodies stored.

**Application matching** — server-side, deterministic order (external job ID → exact URL → company+title → +date → company only); only the first two may auto-link; the rest require review; ambiguous (>1 candidate) never auto-links.

**Job discovery** — provider reads `get_job_search_profile`, `get_existing_job_urls`, `get_existing_companies`; searches web; saves `job_lead` findings with canonical URL; JobQuest dedupes against Applications + prior leads; ranking provided by provider with rationale, re-checked by deterministic filters. Leads never become Applications without Accept (AI-11D).

**Recruiter intelligence** — findings with name, company, title, source, email/phone only if present in source, related application, interaction date, recommendation, provenance, confidence; **never fabricated** (contract requires `source_ref` for any contact detail; validator rejects contact details without provenance).

**Calendar / interview intelligence** — detect recruiter calls, interviews, technical interviews, assessments, deadlines, reschedules, cancellations; finding with external event reference; Accept → `rpc_schedule_interview`.

## 5. Per-provider notes (plan, subject to matrix)

- **AI-4 Claude/Cowork:** custom connector → dev MCP URL first; read-only workflow, then scheduled Morning Brief **if** Cowork scheduled tasks can use the connector (spike). Operator sets write tools to Allow only after AI-3F passes.
- **AI-5 Gemini:** blocked on plan eligibility decision.
- **AI-6 ChatGPT:** developer mode, attended; expect per-call confirmation; unattended = UNSUPPORTED until proven.
