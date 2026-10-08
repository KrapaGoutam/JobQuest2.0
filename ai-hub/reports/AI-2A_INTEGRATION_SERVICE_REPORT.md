# AI-2A — Internal Integration Service Core + Validation + Ingestion

- **Base:** development `0847447474e9cfd6c53bcab43c4457fbd48ff9c5` (== origin/development at start).
- **Branch:** `feature/ai-2-integration-service` (local, **not pushed**, CI **not run**). AI-2A and AI-2B accumulate here.
- **Commit:** `feat(ai-hub): add internal AI integration service` (HEAD of the branch; SHA in the chat checkpoint).
- **Re-slice:** the operator folded the old registry rows AI-2B (ingestion), 2C (validation), 2D (idempotency) and 2E (provenance/audit) into AI-2A. The old "AI-2A read service" is now AI-2B.
- **AI-1 facts persisted first** (state/handoff): dev SHA `0847447…`, dev CI `37801299047` PASS, branch CI `37799394061` PASS @`4a478265`, main/Prod unchanged.

## Service
- **Location:** `apps/api/src/services/aiIntegrationService.ts` (one file; no new package or dependency).
- **Entry point:** `ingestAiResult(context: AiTrustedContext, input: unknown, deps?: { client?, env?, log? }): Promise<AiIngestResult>`. Internal only: no HTTP route, not imported by `app.ts`/`server.ts`/`vercel.ts` (asserted by a test), so it cannot affect API boot.
- **Provider-neutral:** one path for every provider; the provider is only data in the envelope. No Claude/Gemini/ChatGPT-specific code.

## Trusted vs external
| Trusted (server decides) | External (untrusted) |
|---|---|
| `workspaceId`, `userId`, `actorKind` (`SERVICE_INGEST`), `triggerType`, `retryOfRunId`, `correlationId` | the whole provider payload; only the AI-1C validator's normalized output is used |

Context is runtime-validated (UUIDs, approved trigger, `retry` ⇔ `retryOfRunId`) → `INVALID_CONTEXT`, nothing written. Payload `workspace_id`/`user_id`/`application_id` are stripped by the validator (with `untrusted_scope_field` warnings) and can never reach an RPC.

## Kill switch
`AI_HUB_ENABLED` (via `isAiHubServerEnabled`) is the first check, before context/payload parsing and before the service-role client is touched. Off/missing/other value → `AI_HUB_DISABLED`; no run, finding, suggestion or audit row. `VITE_AI_HUB_ENABLED` is never consulted. The service-role client is built lazily after validation, so invalid server config fails closed (`SERVICE_UNAVAILABLE`) without throwing.

## Flow
kill switch → context → `validateAiResult` (AI-1C, reused unchanged) → `rpc_ai_ingest_run` (RUNNING) → `rpc_ai_ingest_finding` per finding → `rpc_ai_create_suggestion` per suggestion → `rpc_ai_finalize_run`. Sequential, deterministic, no fan-out. **Only these 4 RPCs are called; no direct table writes.** Migration: none.

## Run lifecycle and PARTIAL
- Envelope invalid → rejected **before** run creation (`INVALID_AI_RESULT`; validator errors/warnings returned in `validationErrors`/`warnings`; no audit).
- All valid, all persisted → `SUCCEEDED`.
- Valid envelope + validator-rejected items, or item-scoped DB refusals → `PARTIAL` (`success: true`), `error_category` `SCHEMA_INVALID` (rejections) or `INTERNAL`, `error_detail` = static counts text (no content).
- `FAILED`: systemic failure, or every attempted finding failed and nothing persisted.
- **Item-scoped** = RPC code `AI_FINDING_*`, `AI_SUGGESTION_*`, `AI_APPLICATION_*` or SQLSTATE 23514 → record and continue. **Systemic** = transport/unknown errors, `AI_RUN_*`, `WORKSPACE_ACCESS_DENIED`, malformed RPC responses → stop, finalize `FAILED` exactly once (no loop); if finalize fails → `FINALIZE_RUN_FAILED`, `finalized: false`, status reported as last known `RUNNING`.
- Counts are computed by the service from RPC outcomes (provider counts are never used) and stored in `ai_runs.counts` (snake_case keys): findings created/duplicate/updated/closed/failed, suggestions created/duplicate/skipped/failed, rejected_items.

## Duplicate run behaviour (decided here)
`rpc_ai_ingest_run` is idempotent on (workspace, provider, external_run_id) and returns `created:false`. Service: existing **RUNNING** run (interrupted earlier attempt) → resume (child RPCs are idempotent) and finalize from this attempt's counts; existing **SUCCEEDED/PARTIAL** → `success:true, duplicateRun:true`, nothing re-ingested, zero counts; existing **FAILED/CANCELLED** → `RUN_NOT_OPEN` (callers retry with a NEW external run id and trigger `retry` + `retryOfRunId`; the AI-1B RPC refuses ingestion into a non-RUNNING run). Runs without `external_run_id` are never deduped at run level; findings still dedupe.

## Findings / suggestions
- Finding outcomes `created|duplicate|updated|unchanged_closed` are preserved in counts. `content_hash` is DB-owned; the service sends nothing hash-like and never compares it with the TS `contentFingerprint`. Cross-provider dedupe is DB/AI-1C behaviour (provider is not in the key; second provider lands in `payload.seen_by`).
- `application_id` is never sent (finding stays unlinked; match hints are not persisted or acted on). Application matching is a later concern.
- Suggestions map `finding_index` (already remapped by the validator to accepted findings) → the persisted finding id **returned by the RPC** (temporary in-memory map, discarded). A suggestion whose finding failed is counted `suggestionsFailed` and never sent (no orphans). Suggestions on `unchanged_closed` findings are skipped (`suggestionsSkipped`, not a failure) because the RPC would refuse them. Suggestion `target` ids are untrusted and verified by the RPC (owner + workspace) → foreign target = `AI_SUGGESTION_TARGET_NOT_FOUND`, item-scoped.
- Suggestions stay inert PENDING proposals; there is no accept/execute path (ACCEPT remains `AI_ACTION_NOT_ENABLED` until AI-11). No task/application/status is created or changed.
- **Known limitation:** the RPC only dedupes identical *PENDING* proposals; re-submitting the same suggestion under a *new* run id after the owner IGNORED it creates a new PENDING one. The same external run id is fully safe.
- **Closed-finding supersession: DEFERRED** (unchanged from AI-1B).

## Provenance / audit
Persisted: run `provider`, `workflow`, `trigger_type`, `schema_version`, `sources`; finding `source_ref` (type, provider_message_id, thread_id, url, canonical_url) and `provider`. Not persisted (no column; AI-0 privacy): `model_hint`, `generated_at`, envelope `metadata`, raw provider response / email bodies / HTML. **Audit is written only by the RPCs** (one row per mutation; the service writes none); tests assert exact action lists and that metadata contains no content.

## Errors / observability
Service codes: `AI_HUB_DISABLED, INVALID_CONTEXT, INVALID_AI_RESULT, SERVICE_UNAVAILABLE, INGEST_RUN_FAILED, RUN_NOT_OPEN, INGEST_FINDING_FAILED, CREATE_SUGGESTION_FAILED, FINALIZE_RUN_FAILED`, each mapped to an approved AI-1A category (`SCHEMA_INVALID`/`INTERNAL`, none for the gate) with static messages, item `path` and a controlled `dbCode` (only values matching `AI_*`/`WORKSPACE_ACCESS_DENIED`). Raw DB/transport messages are never returned or logged. One structured `console.info` JSON line per call (`ai_integration.ingest`: correlationId, runId, provider, workflow, success, status, duplicateRun, counts, errorCodes, elapsedMs) via an injectable logger; no payload bodies. Correlation id: trusted `correlationId` if well-formed, else `randomUUID()`.

## Tests (local stack only; no hosted-Dev writes)
- `tests/unit/ai-integration-service.test.ts`: **39 passed** (scripted RPC client: kill switch, context, validation-first, no raw/unknown fields or scope reach the DB, lifecycle, outcomes, item vs systemic, single finalize, duplicate runs, suggestion mapping/orphans/closed, provenance, logs, correlation).
- `tests/integration/ai-2a-integration-service.test.ts`: **11 passed** on the local Supabase stack (127.0.0.1:55321; AI-1A/1B applied): no writes when off/invalid; full run + exact audit rows + no core mutation; same result twice → one run/finding/suggestion/audit set; RUNNING resume; cross-provider duplicate (`seen_by`), updated, DISMISSED stays closed with suggestion skipped; provider-chosen scope ignored; non-member refused; PARTIAL with foreign suggestion target and orphan; systemic failure → run FAILED + retry linkage (trusted only, foreign run refused); audit/logs free of canary; failure isolation + boot isolation.
- Regression: `ai-1b-rls-audit` 15/15; `ai-hub-flags` 11/11. `tests/unit/ai-contract.test.ts` shows 10 failures **only in this Windows checkout** (enum-sync regex expects `\n`; the migration SQL is checked out CRLF via `core.autocrlf=true`); unrelated to AI-2A, files untouched, the other 44 pass; Linux CI is unaffected (AI-1 CI was green).
- Typecheck: `pnpm typecheck` (root tsc + api/extension/web) — clean. ESLint on the 3 new files — clean.

## State
Migration: **none**. Dev DB changed: **no** (local only). Hosted-Dev test writes: **none**. Prod: untouched. main: unchanged (`26e517ea…`). Branch pushed: no. CI: not run.

## Deferred to AI-2B
Provider-neutral read/query service; operational internal API/read interface; pagination/filter contracts; server-side audit-window filter; final AI-2 validation; one branch CI; one development merge + CI. Also candidates: closed-finding supersession, application matching, workflow-config mutation.
