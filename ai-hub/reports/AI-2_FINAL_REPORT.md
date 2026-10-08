# AI-2 — Internal Integration Service: Final Report

**Status:** AI-2 READY FOR BRANCH CI (not yet COMPLETE; see "CI / integration" below, filled in after CI).

- **Branch:** `feature/ai-2-integration-service` (base development `0847447474e9cfd6c53bcab43c4457fbd48ff9c5`).
- **AI-2A commit:** `eadef2760a3511c3c2171bd07b01eb453deac578` (ingestion; see `AI-2A_INTEGRATION_SERVICE_REPORT.md`).
- **AI-2B commit:** `feat(ai-hub): add AI read service and operational queries` (HEAD before CI-fact docs; SHA in the chat checkpoint).

## AI-2B deliverables

### A. Read service — `apps/api/src/services/aiReadService.ts`
Provider-neutral, **read-only**. Functions: `listAiRuns`, `getAiRun`, `listAiFindings`, `getAiFinding`, `listAiSuggestions`, `getAiSuggestion`, `countPendingAiSuggestions`. Result type `AiReadResult<T> = { ok: true, data } | { ok: false, error: { code, message } }`.

- **Authorization:** every read runs AS THE CALLER through RLS via `userClient(accessToken)` (the existing server pattern, same as `routes/workflow.ts`). Never service-role: the source contains no `admin()`, `rpc`, `insert/update/delete` (asserted by a test). The AI-1B policies stay the single authority: owner, plus ACTIVE manager visibility; peers and other workspaces see nothing; workflow configs are not exposed here (owner-only, untouched). `workspaceId` in the context is only a narrowing filter chosen by trusted server code; a forged/foreign id returns empty/`NOT_FOUND`, never data.
- **Kill switch:** `AI_HUB_ENABLED` is checked first (`AI_HUB_DISABLED`); `VITE_AI_HUB_ENABLED` is ignored. The service is not imported by `app.ts`/`server.ts`/`vercel.ts`, so core APIs boot and run regardless.
- **Filters (typed, strict, centralized; unknown keys rejected, no DSL):** runs: `status, provider, workflow, createdSince, createdBefore`; findings: `status, kind, priority, runId`; suggestions: `status, findingId, action`. Enum values come from the AI-1C constants (the same ones the DB CHECKs mirror).
- **Pagination:** same model as the AI Hub UI (AI-1E): 0-based `page`, `pageSize` default **20**, hard max **50** (larger → `INVALID_FILTER`), `page` max 500, size+1 lookahead for `hasNext`; order `created_at DESC, id DESC` (stable on equal timestamps).
- **Run detail:** exactly two queries, run + findings (bounded 50 + lookahead → `findingsTruncated`). No N+1.
- **DTOs:** camelCase, provider-neutral. Never returned or selected: `error_detail`, `content_hash`, `dedupe_key`, `workspace_id`, `connection_id`. Runs expose the normalized `errorCategory` only (AI-1A `error_detail` is free text, so it is withheld by default; tested with a planted canary). Finding detail exposes the persisted normalized `payload`/`sourceRef` (validator output, ≤16 KiB/2 KiB). `counts` is filtered to numeric values.
- **Errors:** `AI_HUB_DISABLED, INVALID_CONTEXT, INVALID_FILTER, NOT_FOUND, FORBIDDEN (42501), READ_FAILED`; raw DB messages never returned. (`INVALID_CURSOR` is unnecessary: offset pagination has no cursor.)
- **Mutation:** none; suggestions have no decide/accept path here (decisions remain the owner-only AI-1B RPCs; ACCEPT still `AI_ACTION_NOT_ENABLED`).

### B. Operational interface
**OPERATIONAL INTERFACE = INTERNAL SERVICE API. No HTTP routes were added.** The browser AI Hub already reads through RLS; routes would add a second surface with no current consumer. AI-3 (MCP) and internal automation call the service functions directly with the verified access token. Adding routes later is mechanical (`bearer(c)` + these functions) and would need per-route auth tests.

### C. Audit-window crowding — fixed (migration `20261025100000_ai_hub_audit_scope_filter.sql`)
`rpc_list_workspace_audit_events(p_workspace_id, p_limit, p_scope default 'ALL')`; scopes `ALL | AI | OTHER`, applied in the WHERE clause **before** the LIMIT (verified: 3 newest events are all AI under `ALL`, while `OTHER` still returns the older `workspace.updated`). Authorization unchanged (ACTIVE manager only; members, peers and other workspaces get 42501; an invalid scope is `22023`). Hardening: `p_limit` is clamped to 1..500 (previously unbounded), tiebreaker `id desc`. The old two-argument function was replaced (not overloaded), so existing 2-arg callers still resolve (M12 test passes). Audit storage and writers are untouched. UI: `AuditHistoryView` passes its existing scope selector to the server; `listWorkspaceAuditEvents(workspaceId, limit, scope)`. The AI-1E unit assertion was updated accordingly. **Visual smoke of the Audit History screen was NOT run** (change is a one-line wiring; covered by the unit wiring test and the DB tests).
Dev: applied to jobquest-dev via `supabase db push` (dry-run listed only this file; project-ref verified). Production not touched.

### D. CRLF enum-sync test — fixed
`tests/unit/ai-contract.test.ts` normalizes `\r\n`→`\n` before parsing the migration, and a new test mutates an enum in the SQL text to prove drift is still detected. All 55 contract tests pass on this Windows checkout. Migration files were not changed.

### E. Defect found and fixed in AI-2A scope
`tests/unit/tokens.test.ts` (static service-role boundary) allow-lists the files that may call `admin()`. AI-2A's `aiIntegrationService.ts` does (for the service-role-only `rpc_ai_ingest_*`), and AI-2A did not run the full unit suite, so that guard would have failed CI. The allow-list now names the file explicitly (documented as ingestion-only, never reads). Found by the one full unit-suite run required here.

### F. Suggestion cross-run re-proposal — assessment
Observed: an IGNORED suggestion on a still-NEW finding can be re-created as a fresh PENDING one if the same proposal arrives under a **new** run id (RPC dedupe only matches PENDING). Docs (`DATA_MODEL_PLAN`, AI-1B report) define no cross-run suppression rule or "do not re-propose after ignore" policy; the closest intent is advisory, owner-controlled proposals. Classification: potentially **B (spam risk for recurring provider runs)** but the correct behaviour (suppress forever? until finding content changes? time window?) is a product decision. Not changed. **SUGGESTION CROSS-RUN RE-PROPOSAL POLICY — NEEDS PRODUCT DECISION.** Candidate designs for that decision: suppress when any IGNORED suggestion with the same (finding, action, target, proposed) exists; or suppress until the finding's `content_hash` changes. Same external run id is fully idempotent today.

### G. Carried-forward deferrals
Closed-finding supersession; application matching; workflow-config mutation; HTTP routes for AI reads; Audit History visual smoke; ACCEPT/controlled actions (AI-11).

## Validation (local, before push)
| Check | Result |
|---|---|
| `ai-contract.test.ts` | 55/55 (Windows CRLF fixed) |
| `ai-integration-service` unit (AI-2A regression) | 39/39 |
| `ai-read-service` unit | 18/18 |
| Full unit suite (`vitest --project unit`, once) | 31 files, 383/383 |
| Integration, local stack: `ai-2a-integration-service` | 11/11 |
| Integration: `ai-2b-read-service` (RLS + audit scope) | 7/7 |
| Integration: `ai-1b-rls-audit`, `m12-workspace` | 15/15, pass |
| Root `pnpm typecheck` (root tsc + api/extension/web) | clean |
| Root `eslint .` | clean |
| `pnpm build`, `check:bundle`, tracked-file secret scan | pass; 0 findings |

DB: Dev head `20261025100000` (23 migrations); Prod head `20261022100000` (unchanged, read-only check). Hosted-Dev test writes: none (only the migration). main `26e517ea…` unchanged; Production unchanged; no providers, MCP, OAuth, write actions.

## CI / integration
(Filled in after branch CI and development merge: branch CI run ID + tested SHA, development SHA/CI.)

## Next
AI-3 — Remote MCP + Authentication, planned as one combined AI-3A + AI-3B phase (transport, endpoint, tool registry, auth decision + implementation, scoped initial tools, security tests). Not started.
