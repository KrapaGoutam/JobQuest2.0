# AI-9 — Subscription provider expansion + scheduled-automation validation (Gemini, ChatGPT Plus)

Branch `feature/ai-9-provider-expansion` (one cumulative branch) from development `5656bd468e09ea07fc61cdf241174879e36055e0`.
Final branch CI / merge / development CI results are recorded in the operator checkpoint.

AI-8 closure facts were persisted first (CURRENT_AGENT_STATE, HANDOFF, ROADMAP, PHASE_REGISTRY): development `5656bd46…`, development CI `38264986612` PASS,
branch CI `38263782230` PASS, AI-8 executable SHA `fe3b4df0…`. No separate docs-closure branch.

**Status of this report:** the implementation, templates, matrix and documentation below are complete. The *provider gate results* (section 9) are filled in only from
operator-reported live tests; every row not yet reported is `NOT TESTED`. Nothing here claims a provider capability that has not been verified.

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

## 5. ChatGPT Plus (documentation findings, 2026-10-12)

- Direct “developer mode” custom MCP with write tools: documented for **Business / Enterprise / Edu** workspaces (OpenAI Help). Plus is not named → **PLAN-GATED** for Plus. No “ChatGPT MCP connector” card exists.
- Personal plugins: the plugin quickstart documents *Plugins page → Add custom MCP server → Create as a plugin* and a package format (`plugin.json`, `mcp.json` with `streamable-http` server and per-server auth
  `none | oauth | mixed | api_key(bearer|basic|custom_header)`, `skills/<name>/SKILL.md`). Plan eligibility is unstated. OpenAI’s auth guide separately says ChatGPT apps “cannot present custom API
  keys” and prefers OAuth 2.1 (DCR/CIMD). These conflict; the operator gate decides. OAuth-only = STOP (decision), no OAuth built in AI-9.
- Scheduled tasks (Plus: 5 active) and event-triggered Work tasks (Gmail/Slack/GitHub) are documented; approval-needed steps pause the task. Plugin use inside those modes is **not** documented → live test.
- Several help.openai.com pages returned HTTP 403 to the agent; their content came from search excerpts and must be re-confirmed in the operator’s account.

Delivered: `CHATGPT_PLUGIN_SETUP.md` (capability table, Case A/B/C decision tree, operator gate), `CHATGPT_SCHEDULED_TASKS.md`, five templates in `chatgpt/`, and `chatgpt/plugin-template/`
(`plugin.json`, `mcp.json` with a placeholder origin and `api_key`/`bearer` declaration, one `SKILL.md`): built from the documented format, **not** imported into a live account by the agent, contains no secret.
No OpenAI API/SDK/key, no account-side automation from repository code.

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
| GEMINI custom app connected | NOT TESTED |
| GEMINI tool discovery / read / AI ingest / unsupported core write / prompt injection | NOT TESTED |
| GEMINI revocation / post-revocation access | NOT TESTED |
| GEMINI_SCHEDULED_READ | NOT TESTED |
| GEMINI_SCHEDULED_JOBQUEST_PUSH (unattended) | NOT TESTED — documented APPROVAL-GATED |
| CHATGPT direct full MCP (Plus) | PLAN-GATED (documented) |
| CHATGPT private plugin / read / AI ingest | NOT TESTED |
| CHATGPT scheduled read / scheduled AI ingest / Gmail event trigger | NOT TESTED |
| Core write bypass (any provider) | NONE |

## 10. Deferred

OAuth / Dynamic Client Registration server (needed if a provider accepts only OAuth); provider automation-health view (observed last-result only; optional in the brief); Job Leads shortcut using the canonical set;
Production rollout and the final security/release review (AI-10).
