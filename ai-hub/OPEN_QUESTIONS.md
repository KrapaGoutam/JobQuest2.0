# AI Hub — Open Questions

Classes: **REPO** repository-answerable (must resolve before the phase that needs it) · **PRODUCT** operator decision · **PROVIDER** needs external verification · **DEFERRED**.

## Resolved in AI-0 (no longer open)
- Dev vs Prod DB layout (two Supabase projects, identical migrations) — `CURRENT_STATE_AUDIT.md`.
- Data model (Option C), canonical contract, run states, dedupe, retention — `DATA_MODEL_PLAN.md`.
- MCP hosting (Hono `/api/mcp`, Streamable HTTP stateless) — `ARCHITECTURE.md` §6.
- Flag model, nav/tab structure — `ARCHITECTURE.md` §8, `UI_UX_PLAN.md`.
- Branch/CI behavior for docs vs feature branches — `TESTING_CI_RELEASE_STRATEGY.md` §1.

## Open

| # | Class | Question | Needed by |
|---|---|---|---|
| Q-1 | REPO | Vercel Preview/Development env → which Supabase project? (E-1) | AI-1P |
| Q-2 | REPO | Current prod deployment ID/SHA and the exact prod migration procedure post-Render (E-4) | AI-1P |
| Q-3 | REPO | Does the app have a stored job-search profile (target roles, locations)? Which `profiles` columns exist? | AI-2A / AI-8A |
| Q-4 | REPO | Which validation library does `apps/api` use (zod or other)? | AI-1C |
| Q-5 | REPO | Vercel function max duration/region vs MCP needs; function region vs Supabase prod region (us-east-1) | AI-3A |
| Q-6 | REPO | Server-side equivalent for queue/follow-up logic currently in `apps/web/src/lib/queue.ts` | AI-2A |
| Q-7 | PROVIDER | Which MCP auth methods does each provider accept: static bearer/header, authless secret URL, OAuth (DCR vs pre-registered)? | AI-3B |
| Q-8 | PROVIDER | Can Claude Cowork scheduled tasks call remote custom connectors on Pro, unattended, with write tools set to Allow? | AI-4C |
| Q-9 | PROVIDER | Can Google AI Pro add a custom remote MCP app in Gemini? Can scheduled actions use it? | AI-5 |
| Q-10 | PROVIDER | Can ChatGPT Plus scheduled Tasks use developer-mode apps; are write confirmations bypassable unattended? | AI-6 |
| Q-11 | PROVIDER | Subscription quota consumption of scheduled/connector runs per provider | AI-4+ |
| Q-12 | PRODUCT | Approve AI-1 scope (`IMPLEMENTATION_PHASES.md` §4) and the AI-1P prerequisite | now |
| Q-13 | PRODUCT | Are findings workspace-shared for managers or strictly per-user? (Proposal: per-user rows, manager-readable like core data) | AI-1B |
| Q-14 | PRODUCT | Retention defaults (90/180/30 days) acceptable? | AI-1A |
| Q-15 | PRODUCT | Which providers to prioritize if Gemini Pro is ineligible (proposal: Claude first, ChatGPT attended-only) | AI-4 |
| Q-16 | PRODUCT | Store non-job email counts only (proposal) or nothing? | AI-7 |
| Q-17 | DEFERRED | Purge-job mechanism (pg_cron vs Vercel cron) | after AI-2 |
| Q-18 | DEFERRED | `ai_job_leads` child table necessity | AI-8C |
| Q-19 | DEFERRED | Extend CI classifier to `ai-hub/` (F-1) | any chore |
