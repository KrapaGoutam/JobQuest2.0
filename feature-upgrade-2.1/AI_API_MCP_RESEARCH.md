# AI / API / MCP Connectivity Research

`FUTURE / RESEARCH — NOT PART OF INITIAL 2.1 IMPLEMENTATION`

## Goal
Enable secure, automated interactions between JobQuest 2.0 and external AI agents (ChatGPT, Claude, Gemini) for tasks like daily summaries, follow-up reminders, and application ingestion.

## Architecture Options

### Option A: REST API
- **Pros:** Universal compatibility. Easy to build Custom GPTs using OpenAPI schemas.
- **Cons:** Polling is required for automated workflows (e.g., daily digests). Requires careful API Key management.

### Option B: Model Context Protocol (MCP)
- **Pros:** Native integration with Claude Desktop and modern AI IDEs (Cursor, Antigravity). Real-time tool execution.
- **Cons:** ChatGPT does not natively support MCP without middleware. Requires a running local server or an MCP-to-REST proxy for cloud usage.

### Option C: Webhooks / Scheduled Push
- **Pros:** Perfect for "Daily Digest" workflows. JobQuest pushes data to a Zapier/Make endpoint which triggers the AI.
- **Cons:** One-way data flow. Harder for the AI to query back for more details.

## Recommendation: Hybrid (REST API + Optional MCP Wrapper)
1. **Foundation:** Implement a minimal, secure REST API using Supabase Edge Functions or the existing Next.js API routes, secured by long-lived Personal Access Tokens (similar to the extension architecture).
2. **AI Compatibility:** Expose an OpenAPI (`swagger.json`) spec. This allows instant creation of a "JobQuest Custom GPT" in ChatGPT.
3. **MCP Support:** For local agentic workflows (Claude Desktop), provide a lightweight local MCP server script that acts as a proxy, translating MCP tool calls into REST API requests to the cloud database.
4. **Automation:** For daily scheduled summaries, rely on external automation tools (Zapier/Make) to poll the REST API on a cron schedule, rather than building a heavy cron scheduler into JobQuest.

## Security Considerations
- **Isolation:** AI access tokens must be tightly scoped using Row Level Security (RLS) to the user's workspace.
- **Permissions:** Implement read-only tokens vs read-write tokens.
