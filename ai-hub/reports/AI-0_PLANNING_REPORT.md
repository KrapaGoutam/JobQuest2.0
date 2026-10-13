# AI-0 Planning Report

- **Objective:** architecture, roadmap and handoff foundation for AI Hub (docs only).
- **Base:** development `c46392e13d4a85878e782439f8c01b11c0c2c92e` · **Branch:** `docs/ai-0-ai-hub-planning`
- **Implementation:** 17 files under `ai-hub/`. No application code, no migrations, no database or env changes, no provider contact. Subagents: 0. Manual tests: none (docs-only).
- **Read-only checks:** git SHAs; Supabase `list_projects`, `list_migrations` (dev = prod, head `20261022100000`); CI workflow and classifier; selected source/migration headers; three web searches for provider capabilities.
- **Key findings:** (1) Dev/Prod are separate Supabase projects with identical migrations; (2) isolation risks E-1…E-6 recorded, prerequisite AI-1P created; (3) no OAuth server exists, so MCP auth is an open gate (AI-3B); (4) `docs/**` pushes trigger no CI and `ai-hub/` is not docs-only, so merging to development runs full CI (F-1); (5) Gemini Pro eligibility for custom MCP is disputed; ChatGPT unattended writes likely blocked by confirmation; Claude Pro custom connectors are the best-documented path; (6) task/follow-up logic lives client-side, so AI-2A needs new server-side logic; (7) Vercel MCP returned 403, so the production deployment ID is not discoverable.
- **Branch CI:** none triggered (branch pattern `docs/**` not in workflow triggers).
- **Development merge / CI:** recorded in the final chat report and `git log` (exact SHAs are not embedded here, to avoid a docs-only follow-up commit and a second CI run).
- **Limitations:** provider facts are from search summaries, not account tests. Production SHA/deployment unverified.
- **Provider setup required:** none yet. **Next:** AI-1P on operator approval. **Main / production:** unchanged.
