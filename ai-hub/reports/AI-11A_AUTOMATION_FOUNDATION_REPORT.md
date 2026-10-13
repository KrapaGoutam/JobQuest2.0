# AI-11A — Automation Foundation (JobQuest 2.2 / Scheduled Intelligence & Digest Automation)

Phase report. Branch `feature/ai11a-automation-foundation`, base development `879f73e71188993b5bd8f03387468fa87e822481` (verified unchanged on origin before any edit). Main `455a0120860405462b73647eca6a65ecd7fad6a7` and Production are untouched. Development→main is **not** part of this phase (main promotion happens once, after all approved AI-11 subphases).

AI-11A is only the provider-neutral automation/configuration foundation. No Gmail/email, job-discovery or recruiter intelligence, no digest composition, no scheduler, no provider adapter, no MCP change.

## 1. Reuse audit (what already existed)

| Area | Found | Verdict |
|---|---|---|
| `ai_workflow_configs` (AI-1A) | owner-scoped rows: `workflow` (enum incl. `other`), `enabled`, `primary_provider`/`fallback_provider` (claude/gemini/chatgpt/manual/system), `settings jsonb`; unique `(workspace, user, workflow)`; RLS owner-only SELECT (AI-1B); **no mutation path**; only reader = the Settings Workflows card's `enabled=false` badge | **Reuse and extend** |
| `ai_runs` | provider-neutral run record: `provider` is data, `workflow`, `status` (7-state lifecycle), `trigger_type` (`scheduled`/`manual`/`retry`), `error_category`, `external_run_id` idempotency index, `rpc_ai_ingest_run` / `rpc_ai_finalize_run` lifecycle | **Reuse as the only run history** (state is derived from it; nothing duplicated) |
| `ai_findings` | results land here via `jobquest_submit_ai_result` | Untouched |
| RLS / RPC conventions | `can_access_owned_record`, service-role RPCs with `p_actor_id`, `app.ai_assert_actor`, `app.ai_write_audit` (ids/enums/counts only) | Reused verbatim |
| API patterns | Hono routes + `caller()` session + `requireCsrfToken`; services with injectable clients; kill switch `isAiHubServerEnabled`; POST-only mutations (Vercel entry exports no PUT/PATCH) | Reused |
| Web | Settings → AI & Automation (`AiAutomationSettings`), `FormField/Input/Select/Switch/Checkbox/Dialog/StatusBadge`, `aiErrorCategoryLabel`, Overview cards, `useProfileTimeZone`, `time.ts` | Reused |
| MCP | 11 tools (10 reads + `jobquest_submit_ai_result`); workflow values from `AI_WORKFLOWS` | **Unchanged** (no automation tool, no new write capability) |
| Scheduling | none in JobQuest by design (provider-owned scheduling) | Still none |

## 2. Architecture decision — **EXTEND** `ai_workflow_configs` minimally

Not "reuse as-is": the table had no schedule/sections/delivery/name and could hold only one row per workflow. Not "new model": a second `automations` table would duplicate `workflow`/`enabled`/`provider` and create two concepts for one thing. One additive migration extends the existing table; a row **is** an automation.

Decisions inside the extension:

- **Operational state is derived, not stored.** `last_run_at`, `last_success_at`, `last_status`, `last_error` come from `ai_runs` (same owner + workflow + provider; only the normalized `error_category`, never `error_detail`). `next_expected_run_at` is a pure function of the schedule (computed on read, so it can never go stale and needs no scheduler). The config row holds none of these columns (asserted by the integration test).
- **Uniqueness**: was `(workspace, owner, workflow)`; now `(workspace, owner, workflow, provider)` plus a unique case-insensitive name per owner, max 10 per owner/workspace. Run history is matched by `(workflow, provider)`, so this is the exact invariant that keeps derived state unambiguous. Relaxing it later (once explicit run→automation linkage exists with provider adapters, AI-11G) is non-breaking; tightening would not be. `workflow = other` ("Custom review") is the generic composite so the *Weekly Job Search Review* example is representable now; a dedicated `weekly_review` workflow value is an AI-11H decision (it would change the shared contract/MCP enum).
- **No `ai_runs` schema change** and no `automation_id` column: nothing would populate it in this phase. Explicit linkage is deferred to AI-11F/G with the adapters.
- **Provider schedule ids** are not canonical fields; adapter metadata, if ever needed, belongs under `settings.adapter` (existing jsonb).

## 3. Database

**Migration `20261101100000_ai_hub_automation_foundation.sql`** (one, forward-only, single transaction). Local stack: applied and exercised. **Remote Dev: NOT applied by this phase's branch work; applied only after development integration + CI (see the completion report). Production: not touched.**

- Columns on `ai_workflow_configs`: `name varchar(80)`, `cadence`, `local_time varchar(5)` (`HH:MM`), `timezone varchar(64)`, `weekdays smallint[]` (ISO 1=Mon..7=Sun), `sections varchar(24)[]`, `delivery varchar(16)[]`. Existing rows (none expected) are backfilled with a name and cannot stay enabled without a provider.
- CHECKs: cadence vocabulary; time regex; weekday range; **schedule shape** per cadence (manual_only → no days; daily/weekdays → time+zone, no days; weekly → exactly one day; selected_days → 1..7 days); sections ⊆ vocabulary and ≤6; delivery ⊆ {ai_hub,email_summary}, must contain `ai_hub`; `enabled ⇒ provider`.
- `rpc_ai_automation_save` / `rpc_ai_automation_delete`: **service_role only** (`revoke … from public, anon, authenticated`). They assert ACTIVE membership, require ownership, validate every field (IANA `Area/Location` or `UTC`, known to `pg_timezone_names`, `posix/`/`right/` aliases rejected), normalize (sort/dedupe), cap at 10, and audit `AI_AUTOMATION_CREATED|UPDATED|DELETED` with ids/enums/counts only (never the user-typed name).
- RLS unchanged (owner-only SELECT; no client INSERT/UPDATE/DELETE). `provider = system` is not selectable (no internal scheduler exists).
- Not touched: `ai_runs`, `ai_findings`, `ai_suggestions`, ingest/finalize RPCs, OAuth/connector tables.

## 4. Canonical schedule model (provider-neutral)

```
automation = { name, workflow, enabled, provider, cadence, localTime "HH:MM", timezone (IANA), weekdays[ISO], sections[], delivery[] }
cadence    ∈ daily | weekdays | selected_days | weekly | manual_only
provider   ∈ claude | chatgpt | gemini | manual        (data, not architecture)
sections   ∈ email_triage | job_discovery | recruiter_intel | calendar_review | followups | goal_summary   (digest/custom review only)
delivery   ∈ ai_hub (always) | email_summary (preference only; push reserved)
```

`computeNextExpectedRun(schedule, now)` — strictly after `now`; null when disabled/manual-only/invalid. Wall-clock semantics in the automation's own zone (local date and weekday from the zone, never the server's or UTC's): a time inside a spring-forward gap runs at the first valid instant after it; an ambiguous fall-back time resolves to its first occurrence (not run twice). Reuses the AI-7 `localToInstant`/`zoneOffsetAt` helpers (platform tz database). It is when the provider **should** run, not a promise: JobQuest does not execute anything.

Translatable later to a Claude/ChatGPT/Gemini scheduler or an internal scheduler without schema change.

## 5. API

`/api/ai/automations` — `GET ?workspace_id` (list with derived state + `runNow`), `POST` (create, 201), `POST /:id` (update), `POST /:id/delete`. Session-authenticated owner only; identity and workspace never come from a provider payload; CSRF on every mutation; body keys are a strict whitelist (`user_id`, `id`, `owner`, `settings`, … are rejected, not ignored); create/update honour the AI Hub kill switch, delete does not; DB errors are mapped to safe codes. Not exposed through MCP.

## 6. Run Now — **DEFERRED WITH CONTRACT**

There is no executor: JobQuest cannot start a provider run, and a QUEUED run nobody claims would be fabricated state. Each automation returns `runNow: { ready, reason }` (`AI_HUB_DISABLED` → `AUTOMATION_DISABLED` → `NO_EXECUTOR`); the UI shows a disabled **Run now** with the explanation. Future contract (AI-11F/G), recorded in `runNowReadiness`: `POST /api/ai/automations/:id/run-now` (CSRF, owner, kill switch) → insert `ai_runs {workflow, provider, trigger_type:'manual', status:'QUEUED', external_run_id:'manual:<automationId>:<clientKey>'}` (idempotent on the existing unique index) → the adapter claims it and finalizes it through the existing `rpc_ai_finalize_run` lifecycle. No route or service in AI-11A writes `ai_runs` (asserted).

## 7. UI

- **Settings → AI & Automation → Automations** (between Providers and the Workflows reference): list with name, workflow · provider, schedule sentence, sections, delivery, next expected (rendered **in the automation's zone**, zone named), last run, last success, normalized last error, one health badge, enable switch, Edit / Run now (disabled+explained) / Delete. Dialog form for name, workflow, provider, cadence, day(s), time, time zone (datalist), sections (digest/custom only), delivery, enabled (new automations start **disabled**). Field errors + server conflict messages. **No provider credentials in this form**; Providers is unchanged.
- The Workflows reference card no longer infers a "Disabled" badge from config rows (those are automations now); `fetchAiWorkflowConfigs` (its only reader) was removed with its test.
- **AI Hub Overview**: one additive "Next automation" card (soonest enabled scheduled automation, provider, schedule, health, failure count); isolated like the other cards (a failure never breaks the Overview); an automation alone makes the Overview non-empty. Full dashboard remains AI-11H.

## 8. Security

AI-10 boundary intact: no new MCP tool or scope; providers cannot read or change automation definitions; no core mutation capability added; owner-only RLS; service-role RPCs bound to the session user; no secrets in rows or audit; error text never reaches the client.

## 9. Validation

Local (Windows, Docker stack up; migration applied to the LOCAL stack only):

- `pnpm typecheck` (root + api + web + extension) **PASS**; `eslint .` **PASS**.
- Unit project: **861/861** (51 files), including new `ai-11a-automation` (contract, next-run, timezone/DST, service scoping, boundary), `ai-11a-automation-routes`, `ai-11a-automation-ui`.
- Integration, all `ai-*` suites on the local stack: **145/145** (13 files), including new `ai-11a-automation` (9 tests: ownership/workspace isolation, RLS + RPC boundary, validation at API/RPC/table, uniqueness + limit, derived state, kill switch + CSRF, audit hygiene) and `ai-1b-rls-audit` (updated to supply the new required `name`).
- Focused browser spec `e2e/ai11a-automations.spec.ts` (flags ON, local stack): create / validate / conflict / toggle / edit / derived state / Run Now contract / Overview card / delete, 375·768·1280 no overflow, axe 0 critical/serious. Added to the dedicated `ai-hub-e2e` CI job (the AI Hub flags are OFF in every other job and the spec self-skips there).
- Existing pins updated narrowly: `ai-4-claude` (SettingsView prop string), `ai-9-providers` (migration list), `ai-hub-flags` (removed dead reader test).
- **Branch CI `38448057910` PASS** at executable feature SHA `614515d26c2a2e964be5a8fac3d7727044053cc4` (all four jobs, incl. migrations/integration and the dedicated `ai-hub-e2e` job with the new spec). Development merge SHA, development CI and the remote Dev migration are recorded in the completion report / chat checkpoint (not knowable before the push; this file is not re-pushed to certify itself).

## 10. Deferred (unchanged roadmap)

AI-11B email triage · AI-11C digest composition · AI-11D fresh job discovery · AI-11E recruiter intelligence · AI-11F schedule execution semantics, retries, **Run Now execution**, explicit run→automation linkage · AI-11G provider scheduler adapters (Claude first) · AI-11H weekly digest (`weekly_review` workflow decision), automation health dashboard, analytics.

## 11. Limitations

- One automation per `(workflow, provider)` per owner for now (see §2).
- `email_summary` delivery is a stored preference; nothing sends email.
- "Healthy / failed" reflects the latest matching `ai_runs` row only; missed-run detection (expected run with no run) is AI-11F.
- Derived state costs 2 small indexed queries per automation (≤10 automations).
