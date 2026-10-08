# AI-1F1 — Feature Flags / AI & Automation Settings

Branch `feature/ai-1-foundation` (local, NOT pushed, no CI). Base AI-1E `5aa4e376`. Migration: NONE. Dev/Prod DB changed: NO. Preview: none.

## Feature-flag architecture and precedence
Centralized in `apps/web/src/lib/aiHubFlags.ts` (`resolveAiHubAvailability`, `isAiHubExposed`):
1. Environment kill switch `AI_HUB_ENABLED` (server-side; `apps/api/src/lib/aiHubConfig.ts` `isAiHubServerEnabled`) OFF -> SYSTEM_DISABLED regardless of anything else. Foundation only; no service/MCP code is wired to it yet.
2. Frontend build flag `VITE_AI_HUB_ENABLED` OFF -> FRONTEND_DISABLED (nav, routes, Settings tab hidden).
3. Both ON -> AVAILABLE. Workspace config (layer 3) can never override 1 or 2.

Default-safe: only the literal `true` (trim, case-insensitive) enables; missing or malformed = OFF. The browser cannot read the server kill switch, so it is an optional input (undefined = unknown, not blocking); a browser-visible "System disabled" state needs a future server status endpoint. Both variables added to `.env.example` (empty = off).

## Gating
Sidebar and mobile More drawer omit AI Hub when off (not CSS hiding). `/ai-hub`, `/ai-hub/history` and `/settings/ai` render the existing 404 view when off (no disclosure that the feature exists). The Settings tab "AI & Automation" only exists when exposed.

## Settings -> AI & Automation (`/settings/ai`, tab in existing SettingsView)
Fully read-only: General (build state, "Automation: Not configured yet", Write actions: Disabled), Providers (Claude/Gemini/ChatGPT: "Not configured"), Workflows (all "Unavailable until provider setup"; a stored enabled row is reported as "cannot run"), Data & Privacy (informational; no mutable retention; states retention/cleanup and email rules are not active). Permissions section omitted (nothing real to show). No controls, no connect buttons. A config read failure is localized (role=alert) and does not affect the rest of Settings. The tab row now wraps for mobile.

## Workflow-config mutation: DEFERRED (no RPC, no migration)
`ai_workflow_configs` is a per-user personal row (unique workspace+user+workflow, owner-only SELECT from AI-1B). The product model has no workspace-level config row, and no workflow can run (no provider), so enabling is forbidden and nothing else is safely configurable. An RPC would be a mutation with nothing valid to mutate. Result: no write RPC, no policy/grant change, no audit event, no secret storage. Design note for a provider phase: add `rpc_ai_update_workflow_config` (owner-scoped, allowlisted settings, enable only when a provider connection exists, audit via `app.ai_write_audit`); manager-level workspace config would need a distinct workspace-scoped row, not this per-user table. Write actions remain OFF (`AI_WRITE_ACTIONS_ENABLED = false`).

## Tests / checks
`tests/unit/ai-hub-flags.test.ts` (11): default-off parsing, kill-switch precedence, server switch, write actions off, path classification, gating wiring (source scan of Sidebar, MobileNav, App routes, Settings tab), truthful settings states, no controls, read-only/no-secrets scan, opaque read failure. With ai-hub-ui + ai-hub-operational: 40/40 pass. Web + API tsc clean; eslint clean on changed files. Not run: full suites, E2E, CI, DB tests (no DB change).

## Visual check
NOT performed in a live browser (needs an authenticated session; SSR markup asserted instead). Left for AI-1F2 manual smoke at 375/768/1280 with the flag on and off.

## Files
New: `lib/aiHubFlags.ts`, `views/AiAutomationSettings.tsx`, `apps/api/src/lib/aiHubConfig.ts`, `tests/unit/ai-hub-flags.test.ts`. Modified: `App.tsx`, `Sidebar.tsx`, `MobileNav.tsx`, `SettingsView.tsx`, `api/aiHub.ts` (read-only config fetch), `vite-env.d.ts`, `.env.example`, ai-hub docs.

## Deferred
Workflow-config mutation + audit (provider phase), browser-visible system-disabled state, Email Rules/Permissions sections (AI-7/AI-11), audit-window filter (AI-2), closed-finding supersession, live visual smoke (AI-1F2).

## Readiness for AI-1F2
Blocker: Vercel Preview -> Supabase mapping unverified (do not push). `VITE_AI_HUB_ENABLED` must be set deliberately per Vercel environment; it is OFF by default, so Preview/Production hide the AI Hub unless set.
