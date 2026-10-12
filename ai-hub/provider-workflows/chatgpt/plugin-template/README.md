# JobQuest ChatGPT plugin template (UNVERIFIED against a live account)

Built from OpenAI’s documented plugin package format (<https://developers.openai.com/plugins/build/plugins>, read
2026-10-12): `plugin.json`, `mcp.json`, `skills/<name>/SKILL.md`. It has **not** been imported into a live ChatGPT account by
the agent. Whether a Plus account can create/install it, and whether the `api_key` + `bearer` auth mode accepts a JobQuest
connector token, are **operator gate** questions — see [`../../CHATGPT_PLUGIN_SETUP.md`](../../CHATGPT_PLUGIN_SETUP.md).

- Replace `REPLACE-WITH-YOUR-JOBQUEST-ORIGIN` in `mcp.json` with your Dev/Preview origin (never Production in AI-9).
- The manifest declares connection settings only — **no secret**. The JobQuest connector token is entered in ChatGPT’s own
  connection/credential step and is never written to these files, Git or chat.
- If ChatGPT offers only OAuth for the plugin’s MCP server, stop: JobQuest has no OAuth server (deferred decision).
- Do not add tools, scopes or write capabilities beyond what the skill lists.
