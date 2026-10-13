# AI-9 — Subscription provider expansion + scheduled-automation validation (Gemini, ChatGPT Plus)

Branch `feature/ai-9-provider-expansion` (one cumulative branch) from development `5656bd468e09ea07fc61cdf241174879e36055e0`.
Branch CI `38279984981` passed at `519ab2e3199ce42202bb5e66b898afacd5733a47`. Provider gates are recorded; merge and development CI remain pending.

AI-8 closure facts were persisted first (CURRENT_AGENT_STATE, HANDOFF, ROADMAP, PHASE_REGISTRY): development `5656bd46…`, development CI `38264986612` PASS,
branch CI `38263782230` PASS, AI-8 executable SHA `fe3b4df0…`. No separate docs-closure branch.

**Status of this report:** repository-side implementation and branch CI are complete. Both operator gates are resolved: Gemini and ChatGPT Plus expose custom-MCP UI paths, but authenticated JobQuest connections are blocked because both require standards-based OAuth that JobQuest does not implement. Every capability not exercised stays `NOT TESTED — AUTH BLOCKED`. AI-9 is ready for development integration; no provider integration is claimed as verified except Claude.

## 1. Phase A — actionable-count drift (fixed)

Problem (from AI-8): the Actions queue hid pending suggestions whose stored proposal fails the strict action schema, while the Overview count (a raw table count) still
included them (“N pending” vs fewer cards). The queue also required an open finding while the count did not.

Fix — ONE canonical definition, server-owned (`aiActionService.loadActionable`): own (workspace + user) · `PENDING` · supported action type · finding `NEW/REVIEWED/ACCEPTED` ·
schema-valid proposal (`validateActionProposal`). It feeds (a) the Actions queue (paged in memory over at most 500 rows, then enriched per page) and (b) the new
`GET /api/ai/actions/count`, which the Overview card and the Daily Digest line now call (the browser no longer counts rows itself). Legacy rows remain readable
(History / finding detail) but never inflate a count. Tests: integration `AI8-18` (queue total == count, raw table count is larger, legacy row still readable, peer’s count
differs), `AI9-1` (completing an action and dismissing a finding both lower count and queue together), HTTP `AI8-19` (401 without session, 400 bad workspace, count ==
queue total), unit (count is one authenticated GET, never a table count), and the AI-8 browser spec now seeds a pending legacy suggestion (Overview/Digest/queue stay 7/1).

Residual (deliberate, narrow): the Job Leads “Review application action” shortcut and the digest *payload* metric `pending_suggestions` (all pending suggestion types, labelled
“suggestions”) are separate concepts and still use their own queries; neither is the “pending actions” count.

## 2. Windows contrast observation

AI-8 recorded pre-existing local-Windows contrast flakiness in the AI-5/AI-7 specs (hover/transition timing, reproduces on clean development, passes in CI). AI-9 did not
turn into a CSS sweep and did not waive any CI accessibility check. The new AI-9 and the updated AI-8 spec passed locally with axe 0 serious/critical.

## 3. Provider-neutral cards (code)

`providerConnectors.ts` (config + pure summary) and `ProviderConnectorPanel.tsx` (generic view/panel) replace the Claude-only implementation; `ClaudeConnectorPanel.tsx` is now a
thin wrapper so Claude’s output and tests are unchanged (a unit test proves the generic summary equals the AI-4 summary). Gemini token name `Gemini connector`, ChatGPT
`ChatGPT plugin`; same presets (Read only default; Read + AI findings), 7/30/90 days (30 default), same `ai_connector_tokens` API. States: Not configured / Plugin setup
required → Connector credential ready / Plugin credential ready → Credential expired / Credential revoked, plus Last used. Never “Connected”. Capability notes on the cards
mirror the matrix (Gemini scheduled save: Approval required; ChatGPT direct MCP: Not available on this plan).

Token safety (same as Claude): shown once in component state; no storage/URL/console (static test); the browser spec proves it for Gemini (not in storage/URL/page after close or reload,
read-only credential discovers read tools only, denied with 401 after revocation, no screenshot while a token is visible).

MCP tool description: `jobquest_submit_ai_result` previously told every caller to use provider `"claude"`; it now says the provider is the calling product (`"claude"`, `"gemini"` or `"chatgpt"`).
The tool stays a write (`readOnlyHint: false`); the surface is unchanged: **11 tools, 10 read, 1 AI-Hub-only write, no core write**.

Workflow definitions: all five workflows remain `AVAILABLE` (JobQuest side). Gemini/ChatGPT show *Template ready, provider unverified* (new compatibility value), never “available”.

## 4. Gemini (documentation findings, 2026-10-12)

Source: Google, “Connect & manage custom apps for Gemini Apps” (support.google.com/gemini/answer/17209137). Requirements: personal Google Account (not work/school), 18+, US,
English, Keep Activity on. Added only in the Gemini **web** app: Settings → Connected Apps (→ Personal Intelligence first if hidden) → Custom apps → Add a custom app → MCP
URL → Next. If the server does not support Dynamic Client Registration: *Show more* under *Advanced features* → enter credentials. **“Gemini requires manual confirmation for any
write actions.”** The page does not state whether a fixed bearer/header credential is accepted, and does not mention Scheduled Actions. JobQuest has no OAuth/DCR (deferred), so
auth acceptance is the first operator-gate question; OAuth-only = STOP and record, not build.

Delivered: card, token presets, `GEMINI_SCHEDULED_ACTIONS.md` (requirements, exact steps, smoke list, scheduled-action test with the exact “unattended” acceptance rule), five templates in `gemini/`.

Operator gate (2026-10-12): Gemini reached the JobQuest MCP endpoint, then rejected the server authentication method with:
“This MCP server uses an authentication method that Gemini doesn’t support. Gemini requires standard OAuth for server connections.” Therefore the custom app is
**BLOCKED** for the current architecture: the endpoint is reachable, but Gemini does not support JobQuest's bearer authentication. Tool discovery, reads, AI ingest and
scheduled use were not reached and remain `NOT TESTED`. OAuth/DCR is deferred by design and was not implemented. The temporary Gemini connector credential was revoked.

## 5. ChatGPT Plus (documentation findings + operator gate, 2026-10-12)

- Earlier documentation suggested direct full MCP was workspace-plan-gated. The operator's Plus account instead exposed **Add custom MCP server**, **Create as a plugin** and advanced OAuth configuration. UI availability is therefore **VERIFIED** for this account; authenticated JobQuest use is still blocked.
- In the observed custom-MCP connection flow, authentication choices included OAuth/no-auth style options but no bearer/API-key field. No-auth was not selected. OAuth discovery failed because JobQuest publishes no OAuth metadata.
- Advanced OAuth showed User-Defined OAuth Client; DCR and CIMD were unavailable. The UI exposed callback, client, token/auth, scope, authorization-server, resource and OIDC fields. JobQuest has none of the required OAuth authorization-server infrastructure.
- Scheduled tasks and Gmail event-triggered Work tasks remain documentation-only capabilities. JobQuest scheduled read, scheduled ingest and Gmail event-trigger testing were not attempted because authentication failed first.

ChatGPT reported: "Couldn't discover OAuth settings. Check the server URL and retry, or enter the settings manually". The authenticated connection is therefore **BLOCKED — OAUTH 2.1 REQUIRED**. No OAuth values were invented, the existing bearer token was not misused as an OAuth secret, and no temporary ChatGPT connector token was created.

Delivered: `CHATGPT_PLUGIN_SETUP.md`, `CHATGPT_SCHEDULED_TASKS.md`, five templates in `chatgpt/`, and `chatgpt/plugin-template/` (`plugin.json`, `mcp.json`, one `SKILL.md`). The package contains no secret. No OpenAI API/SDK/key and no account-side automation were added by repository code.

## 6. Templates (provider-neutral schema)

Generated from the Claude templates; a unit test asserts every template’s `RESULT SHAPE` block is **identical** to Claude’s after normalising `provider` and the run-id prefix, that four of the five examples validate against the real
`validateAiResult` for provider `gemini`/`chatgpt`, that each carries the untrusted-input / never-mutate / findings-only language, an approval/“NOT SUBMITTED” fallback, and (when a controlled action is mentioned)
“Submitting a suggestion does NOT execute it”.

## 7. Architecture checks (enforced by tests)

No migration (head stays `20261029100000`; Prod `20261022100000`) · no provider credential tables · no OpenAI/Google AI SDK or API-key variables in manifests or shipped code · no cron/scheduler · canonical provider values unchanged
(`claude, gemini, chatgpt, manual, system`) · MCP: 11 tools, exactly one write, no core mutation tool · AI-8 human-approval architecture untouched (execution endpoints are web-session routes, not provider tools).

## 8. Local validation

Unit 795/795 (47 files) · AI integration suites 129/129 (11 files incl. MCP/ai-3/ai-4/ai-6/ai-7/ai-8 and the new AI-9 cases) · browser: new `ai9-providers` spec and the updated `ai8-actions` spec PASS locally
(axe 0 serious/critical; 375/768/1280) · root typecheck · eslint · build · bundle check · secret scan (0 findings).

## 9. Provider gate results (operator-reported)

| Item | Result |
|---|---|
| GEMINI custom-app UI | **VERIFIED AVAILABLE** |
| GEMINI MCP endpoint | **REACHABLE** |
| GEMINI authenticated JobQuest connection | **BLOCKED — STANDARD OAUTH REQUIRED** |
| GEMINI current bearer auth | **NOT SUPPORTED BY GEMINI** |
| GEMINI tool discovery / read / AI ingest | NOT TESTED — AUTH BLOCKED |
| GEMINI scheduled read / scheduled JobQuest push | NOT TESTED — AUTH BLOCKED |
| GEMINI temporary credential | **REVOKED — operator confirmed**; post-revocation test not required because Gemini never accepted it |
| CHATGPT Plus custom-MCP / plugin UI | **VERIFIED AVAILABLE** |
| CHATGPT create-as-plugin flow | **VERIFIED AVAILABLE** |
| CHATGPT OAuth discovery | **FAILED** — JobQuest publishes no OAuth metadata |
| CHATGPT DCR / CIMD | **UNAVAILABLE** with current JobQuest server |
| CHATGPT user-defined OAuth client | NOT CONFIGURED — JobQuest has no OAuth authorization server |
| CHATGPT authenticated JobQuest connection | **BLOCKED — OAUTH 2.1 REQUIRED** |
| CHATGPT current JobQuest bearer auth | **NOT COMPATIBLE** with the observed custom-MCP flow |
| CHATGPT temporary connector token | **NONE CREATED** |
| CHATGPT JobQuest read / AI ingest | NOT TESTED — AUTH BLOCKED |
| CHATGPT scheduled read / scheduled AI ingest / Gmail event trigger | NOT TESTED — AUTH BLOCKED |
| Core write bypass (any provider) | NONE |

The shared result is an authentication-layer requirement, not two provider-specific integrations: one standards-compliant, provider-neutral JobQuest OAuth layer should serve Gemini, ChatGPT and future OAuth-capable MCP clients. AI-9 deliberately added no OAuth/DCR, no no-auth mode and no bearer workaround.

## 10. Deferred / recommended next phase

Recommended only after explicit operator approval: **AI-10 — OAuth 2.1 Provider Auth + Final Security / Release Hardening**. First decide whether OAuth is release-blocking. Planning scope:

- OAuth 2.1 authorization-server behavior; Authorization Code flow; PKCE S256.
- Authorization-server metadata and MCP protected-resource metadata where required.
- Client registration strategy: user-defined clients, DCR and CIMD.
- Access-token issuance, refresh tokens if necessary, revocation and session invalidation.
- Scope mapping for `jobquest:read`, `ai:read` and `ai:ingest`; user/workspace binding; connector revocation.
- Consent UI, provider callback registration and MCP auth integration.
- Security, rate-limit and audit tests; Gemini/ChatGPT live revalidation.
- Final security review, migration reconciliation, final AI-Hub E2E/release matrix and Production GO/NO-GO.

Also deferred: provider automation-health view; Job Leads shortcut using the canonical set; Production rollout. No AI-10 work starts automatically.
