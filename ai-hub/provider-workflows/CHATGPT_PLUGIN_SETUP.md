# ChatGPT (Plus) for JobQuest — plugin capability gate and setup

ChatGPT **Plus is not Claude**. JobQuest does **not** offer a “ChatGPT MCP connector” card that claims Claude-style
parity, and no OpenAI API, SDK or API key is used anywhere. This guide records what current OpenAI documentation supports
and defines the operator gate. Capability status: [`../PROVIDER_CAPABILITY_MATRIX.md`](../PROVIDER_CAPABILITY_MATRIX.md).

## Capability assessment (official sources, 2026-10-12)

| Question | Finding | Status |
|---|---|---|
| Direct “developer mode” custom MCP apps with write tools | OpenAI Help (“Developer mode and MCP apps in ChatGPT”) describes full MCP support, including write actions, for **Business and Enterprise/Edu** workspaces on ChatGPT web; admins enable it. Plus is not named. | **PLAN-GATED** for Plus |
| Personal plugins (Plugins page → *Add custom MCP server* → *Create as a plugin*) | OpenAI’s plugin quickstart documents this personal path; the page does not state plan eligibility. Plus/Pro plugin availability is listed on OpenAI’s plan pages; third-party sources conflict. | **NOT TESTED** (operator gate) |
| Plugin package format | Documented: root `plugin.json`, `mcp.json` (`mcpServers`, `type: streamable-http`, `url`), `skills/<name>/SKILL.md`; auth declared per server under `extensions["com.openai"].auth` (`none`, `oauth`, `mixed`, `api_key` with `headerScheme` `bearer`/`basic`/`custom_header`). | DOCUMENTED |
| Static credential for the plugin’s MCP server | The plugin schema declares an `api_key` + `bearer` mode, **but** OpenAI’s authentication guide says ChatGPT apps do not support “custom API keys” and prefers OAuth 2.1 (DCR/CIMD). These two statements conflict. Whether a Plus account accepts a pasted bearer token must be tested. | **NOT TESTED / conflicting** |
| Scheduled tasks | Open to eligible paid plans; Plus has **5** active tasks; hourly/exact-time needs a paid plan. | DOCUMENTED |
| Event-triggered Work tasks (Gmail/Slack/GitHub) | Available to Plus/Pro/Business/Enterprise/Edu; created in **Work**; an action needing approval **pauses** the task. | DOCUMENTED |
| Write approval | Writes through plugins/apps pause for user approval by default. | APPROVAL-GATED (expected) |

Source URLs:
<https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt> ·
<https://help.openai.com/en/articles/20001256-plugins-in-chatgpt> ·
<https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt> ·
<https://developers.openai.com/plugins/quickstart> ·
<https://developers.openai.com/plugins/build/plugins> ·
<https://developers.openai.com/plugins/build/auth> ·
<https://developers.openai.com/plugins/build/mcp-events>
(Some help.openai.com pages could not be fetched directly by the agent; their content was read through search excerpts and
must be re-confirmed in your account.)

## Decision tree (from the AI-9 brief)

- **Case A** — your private plugin can attach a remote MCP server and accepts a JobQuest scoped connector token as an
  `api_key`/bearer credential → use the existing `/api/mcp` and the plugin template below. Nothing new is built.
- **Case B** — a plugin can carry only instructions (skills) and cannot securely reach JobQuest from your plan →
  `CHATGPT_JOBQUEST_PUSH = PLAN/CAPABILITY BLOCKED`. No fake integration.
- **Case C** — the product requires **OAuth** (the documented preferred mode) → **STOP at an operator/security decision**.
  JobQuest’s OAuth server is deferred; it is not bolted on inside AI-9.

JobQuest never invents a proprietary OpenAI protocol and never works around plan restrictions.

## Operator gate (do these only after branch CI + a Preview deployment exist)

1. In JobQuest create a **temporary** credential: Settings → AI & Automation → Providers → ChatGPT → *Create credential*
   (7 days; **Read only** unless you are testing a save). It is shown once.
2. In ChatGPT open **Plugins**. Report exactly what your account offers: is there *Add custom MCP server*? Which
   authentication options appear (No authentication / OAuth / API key / other)? Is **Plugin Creator** available?
3. If a bearer/API-key option exists: add the server URL `<your JobQuest origin>/api/mcp`, choose it, paste the credential
   into ChatGPT’s own credential field (never into a chat message or this repo), and **Create as a plugin**.
   A ready-to-edit package is in [`chatgpt/plugin-template/`](chatgpt/plugin-template/) (replace the placeholder URL; it holds
   no secret). If you use Plugin Creator instead, ask it for exactly: one remote MCP server at that URL with bearer API-key
   auth, plus the skill in `plugin-template/skills/jobquest-ai-hub/SKILL.md`.
4. If only OAuth is offered → stop and report; do not try workarounds.
5. Smoke (synthetic data): tool discovery (expect 11 tools, 1 write), recent applications, Job Leads / email / recruiter /
   calendar reads, Daily Digest read, synthetic result submission (expect an approval prompt — record it), “Change this
   application to Interview” (must be impossible), the prompt-injection record, then **revoke** the credential and confirm
   the next call is denied.
6. Record results per capability: `PLUGIN`, `JOBQUEST READ`, `JOBQUEST AI INGEST`, `SCHEDULED READ`,
   `SCHEDULED AI INGEST`, `GMAIL EVENT-TRIGGER`, `CORE WRITE BYPASS` (always NONE).

Scheduled and Gmail-trigger steps are in [`CHATGPT_SCHEDULED_TASKS.md`](CHATGPT_SCHEDULED_TASKS.md).

## Security boundaries (unchanged)

- Providers may *propose* controlled actions; they can never execute `create_application`, `create_task` or `set_status`.
  Those stay JobQuest UI → human preview → human confirmation. AI-8 execution endpoints are **not** exposed as MCP or plugin
  tools.
- Scopes: `jobquest:read` + `ai:read` (read) or + `ai:ingest` (findings). No write/admin/wildcard scope exists.
- No credentials in the plugin package, Git, docs, logs, screenshots or chat.
