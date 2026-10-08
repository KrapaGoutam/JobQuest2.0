# AI Hub — Architecture (proposed)

Labels: **[PROPOSED]** our design · **[REPO]** observed (see `CURRENT_STATE_AUDIT.md`) · **[PROVIDER]** provider fact (see `PROVIDER_CAPABILITY_MATRIX.md`).

## 1. Principle

JobQuest is the **system of record**. Claude, Gemini and ChatGPT are **subscription-powered workers** that run on the provider side, call a JobQuest-hosted **remote MCP server** to read context, and write **findings** back. Findings never mutate core records until the operator accepts a **suggestion**. No JobQuest-paid LLM API calls. [PROPOSED]

```
Provider (Claude/Gemini/ChatGPT) ── remote MCP over HTTPS ──► /api/mcp (Hono, same Vercel function)
   │  reads (scoped)                                           │ validates token+scope, rate limit
   │  writes findings only                                     ▼
   │                                              AI service layer (TS)  ── normalizes to canonical contract
   │                                                            │
   │                                              ai_runs / ai_findings / ai_suggestions  (new tables)
   │                                                            │ operator Accept (RPC, audited)
   ▼                                                            ▼
 external sources (Gmail, Calendar, web)               core tables (applications, tasks, contacts…)
```

## 2. Three-layer separation [PROPOSED]

| Layer | Meaning | Storage | Authoritative? |
|---|---|---|---|
| A. Execution history | what ran | `ai_runs` | no (log) |
| B. Findings | what AI discovered, plus suggestions | `ai_findings`, `ai_suggestions` | no — advisory |
| C. Core records | applications, tasks, contacts, goals, interviews, documents | existing tables | **yes** |

Only an operator-triggered `rpc_ai_accept_suggestion` crosses B→C, calls the **existing** core RPC (e.g. `rpc_move_application_stage`, `rpc_create_task`-equivalents) — never raw table writes — and writes an `audit_events` row. Core business logic is not duplicated.

## 3. Failure isolation [PROPOSED]

1. AI Hub is additive: separate routes, tables, views, nav entry. No core page imports AI code paths synchronously.
2. No core page render waits on an AI call. Dashboard AI strip reads a cached `ai_findings` row via a **non-blocking, error-swallowing** query; failure renders nothing.
3. Providers run out-of-process on their own infrastructure; JobQuest never calls them in a request path (pull model). A provider outage = no new rows, nothing else.
4. `/api/mcp` is its own Hono sub-app with its own error boundary, rate limits and kill switch; a crash returns an MCP error and cannot affect `/api/auth` etc. (They share a Vercel function today; if isolation proves insufficient, split to a second function — AI-3A decision.)
5. Master kill switch `AI_HUB_ENABLED` (server) makes `/api/mcp` and AI RPC wrappers return 404/disabled; UI hides nav.
6. AI tables have no FK *from* core tables; deleting all AI data cannot break core data. Suggestions reference core rows by id with `on delete set null`.

## 4. Provider-neutral read layer [PROPOSED]

Mapped to existing capability; "wrapper" = thin MCP tool over an existing RPC/query run **as the token's user** so RLS applies. No logic duplication.

| MCP tool | Existing implementation | Gap | Wrapper? |
|---|---|---|---|
| `get_daily_context` | compose of rows below | new composer | yes (new, composes only) |
| `get_goal_progress` | `rpc_get_goal_progress` (M8/PL4C) | — | yes |
| `get_today_tasks`, `get_overdue_tasks`, `get_followups` | tasks queries / queue logic (`lib/queue.ts` is client-side) | **logic is in the web client**; needs server-side RPC or SQL | yes + new RPC (AI-2A) |
| `get_pipeline_summary` | `rpc_get_analytics_overview` | — | yes |
| `get_recent_applications`, `get_stale_applications`, `get_application`, `search_applications` | applications queries; stale/aging in analytics; M13 global search | stale threshold server-side | yes |
| `get_job_search_profile` | `profile:read` scope exists for extension; profile fields TBD | verify fields in AI-2A | yes |
| `get_existing_job_urls`, `get_existing_companies` | `rpc_check_application_duplicate`, `companies` | bulk list variant | yes (minimized: hashes/canonical URLs) |
| `get_recruiters` | `contacts` + `contact_interactions` | — | yes |

Output is minimized (field allow-lists, row caps) and never includes secrets, token material or documents' bodies by default.

## 5. Safe write-back [PROPOSED]

MCP write tools are **append-only into the AI layer**: `save_digest`, `save_email_triage`, `save_job_leads`, `save_recruiter_finding`, `save_calendar_finding`, `save_ai_note`, `suggest_status_change`, `suggest_task`, `suggest_followup`. Each: validates payload against the canonical contract → resolves/creates an `ai_run` → upserts findings by dedupe key → returns ids and per-item status. No tool can update/delete core rows. Controlled actions (AI-11) are a separate, later, flag-gated capability.

## 6. Hosting choice [PROPOSED]

`/api/mcp` inside the existing Hono app on Vercel, **Streamable HTTP**, stateless (no SSE sessions) to suit serverless. Rationale: reuses auth/db/rate-limit libs, one deploy, same env separation. Risks: function timeout/cold start, shared blast radius, and the auth gap in `SECURITY_AUTH.md` §3. Alternatives (separate Vercel project, Supabase Edge Function) recorded in `PROVIDER_INTEGRATION_PLAN.md` §2.

## 7. Workflow → provider assignment [PROPOSED]

Stored in `ai_workflow_configs` (per workspace/user): `workflow`, `primary_provider`, `fallback_provider`, `enabled`, `schedule_hint`. JobQuest **cannot** trigger provider runs (pull model); assignment is advisory + enforced at ingest: a run from a non-assigned provider is accepted but flagged `OFF_ASSIGNMENT`, and duplicate daily briefs are collapsed by dedupe key (`daily_brief:<date>`, newest from primary wins; fallback only fills if primary absent). Provider-unavailable behavior is therefore "no run by deadline → UI shows 'No brief today', operator may run fallback manually".

## 8. Feature flags [PROPOSED minimum viable]

- **Env (server, kill switch):** `AI_HUB_ENABLED` (default off in prod).
- **Build-time (web):** `VITE_AI_HUB_ENABLED` hides nav/routes.
- **DB per-workspace** (`ai_workflow_configs.enabled` + `ai_workspace_settings` if needed): `ai_daily_brief_enabled`, `ai_email_triage_enabled`, `ai_job_discovery_enabled`, `ai_recruiter_intel_enabled`, `ai_calendar_enabled`, `ai_write_actions_enabled` (default **false**, requires manager + explicit phase AI-11).
- No user-level flags in v1. Env must never be the only gate for data access: RLS + token scope remain authoritative.

## 9. Settled decisions (do not reopen without contradicting evidence)

D-1 pull-model, provider-out-of-process · D-2 Option C data model · D-3 findings→suggestions→accept via existing RPCs · D-4 same-schema-different-project for Dev/Prod · D-5 MCP in Hono, Streamable HTTP stateless · D-6 token model derived from `extension_tokens` · D-7 cumulative development integration, no per-phase main/prod · D-8 AI-writes only via SECURITY DEFINER RPCs; no direct client INSERT/UPDATE on `ai_*`.

## 10. AI service layer boundaries (AI-2, implemented)

- **Write path (internal, AI-2A):** `apps/api/src/services/aiIntegrationService.ts` `ingestAiResult()` -> AI-1C validator -> the four service-role `rpc_ai_ingest_*`/`finalize` RPCs. Service-role is confined to this file for AI data (static allow-list test). Not an HTTP route.
- **Read path (internal, AI-2B):** `apps/api/src/services/aiReadService.ts` (`listAiRuns/getAiRun/listAiFindings/getAiFinding/listAiSuggestions/getAiSuggestion/countPendingAiSuggestions`). Reads run **as the caller through RLS** (`userClient(accessToken)`), never service-role; trusted server code picks the workspace; kill switch `AI_HUB_ENABLED` enforced; bounded filters/pagination (default 20, max 50, `created_at desc, id desc`); DTOs omit `error_detail`, `content_hash`, `dedupe_key`.
- **Operational interface = internal service API** (no `/api/ai/*` routes in AI-2). AI-3 MCP tools will call these functions with the verified connector identity; neither module is imported by API boot.
- **Audit read:** `rpc_list_workspace_audit_events(..., p_scope)` filters `ALL|AI|OTHER` before the limit (manager-only, unchanged authz).
