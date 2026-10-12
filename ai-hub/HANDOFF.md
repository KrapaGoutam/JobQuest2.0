# AI Hub — Handoff

Durable cross-agent transfer (Claude Code ↔ Codex ↔ new session). Keep concise; history belongs in `reports/`.

## Project
JobQuest AI Hub: provider-neutral AI findings layer + remote MCP for Claude/Gemini/ChatGPT; JobQuest remains system of record. Overview: `README.md`.

## Current Phase / Sub-Phase
CURRENT PHASE: AI-9 (Subscription provider expansion: Gemini + ChatGPT Plus capability validation, one cumulative branch) · CURRENT SUB-PHASE: AI-9 READY FOR BRANCH CI (local validation complete; see reports/AI-9_PROVIDER_EXPANSION_REPORT.md; no migration; provider gates are operator actions after branch CI) · WORKING BRANCH: `feature/ai-9-provider-expansion` (from development `5656bd46`). AI-8 COMPLETE — integrated to development. Development SHA `5656bd468e09ea07fc61cdf241174879e36055e0` (merge of `feature/ai-8-controlled-actions`); development CI `38264986612` PASS; AI-8 executable feature SHA `fe3b4df06c902c1adcc8354844179fa05d76f068`, branch CI `38263782230` PASS; main `26e517ea…` and Production unchanged; Dev head `20261029100000`, Prod `20261022100000`.

(Previous phase pointer, kept for history:)
CURRENT PHASE: AI-8 (Human-approved controlled actions + Application matching, one cumulative branch) · CURRENT SUB-PHASE: AI-8 READY FOR BRANCH CI (local validation complete; see `reports/AI-8_CONTROLLED_ACTIONS_REPORT.md`; migration `20261029100000` local only until branch CI passes) · WORKING BRANCH: `feature/ai-8-controlled-actions` (from development `4eac989c`). AI-7 COMPLETE — integrated to development. Development SHA `4eac989c364a59982bd49c6ea81b13ffd6bff4a7` (merge of `feature/ai-7-calendar-intelligence`); development CI `38253737675` PASS; AI-7 executable feature SHA `01dc9a18a1c48936d1d4bf8daa9efb9df85d7d81`, branch CI `38252291451` PASS (incl. the dedicated `ai-hub-e2e` job); main `26e517ea…` and Production unchanged; Dev head `20261028100000`, Prod `20261022100000`. Operational sources: Daily Digest (`daily_brief`), Job Leads, Email Intelligence, Recruiter Intelligence, Calendar Intelligence. No internal scheduler (provider-owned scheduling is intentional).

(Previous phase pointer, kept for history:)
CURRENT PHASE: AI-7 (Calendar Intelligence + dedicated AI-Hub e2e CI, one cumulative branch) · CURRENT SUB-PHASE: AI-7 READY FOR BRANCH CI (local validation complete; see `reports/AI-7_CALENDAR_INTELLIGENCE_REPORT.md`; migration `20261028100000` local only until branch CI passes) · WORKING BRANCH: `feature/ai-7-calendar-intelligence` (from development `f0a0ec89`). AI-6 COMPLETE — integrated to development. Development SHA `f0a0ec898088c33c918601c51025f913f6ed586b` (merge of `feature/ai-6-external-intelligence`); development CI `38212006797` PASS; AI-6 executable feature SHA `a507bf3fd9f92852839b2d303dfc03992086b3e9`, branch CI `38211220785` PASS; main `26e517ea…` and Production unchanged; Dev head `20261027100000`, Prod `20261022100000`. Operational sources: Daily Digest (`daily_brief`), Job Leads, Email Intelligence, Recruiter Intelligence. No internal scheduler (provider-owned scheduling is intentional).

(Previous phase pointer, kept for history:)
CURRENT PHASE: AI-6 (External Intelligence Sources: email + job discovery + recruiter, one cumulative branch) · CURRENT SUB-PHASE: AI-6 READY FOR BRANCH CI (local validation complete; see `reports/AI-6_EXTERNAL_INTELLIGENCE_REPORT.md`; migration `20261027100000` local only until branch CI passes) · WORKING BRANCH: `feature/ai-6-external-intelligence` (from development `ce3c16a6`). AI-5 COMPLETE — integrated to development. Development SHA `ce3c16a6e4a96e8ccfe2bc13752df1998822a218` (merge of `feature/ai-5-scheduled-digest`); development CI `38205932872` PASS; AI-5 executable feature SHA `6c8196f75a284725e0c1ef1bd7c0d48ffbe778ea`, branch CI `38205261995` PASS; main `26e517ea…` and Production unchanged; Dev head `20261026100000`, Prod `20261022100000`. `daily_brief` = canonical workflow identifier for the Daily Digest product feature (do NOT add a `daily_digest` enum). The focused AI-5 e2e stays local (AI Hub flags are OFF in CI by design).

(Previous phase pointer, kept for history:)
CURRENT PHASE: AI-5 (Scheduled Intelligence + Daily Digest; re-sequenced from "Gemini") · CURRENT SUB-PHASE: AI-5 READY FOR BRANCH CI · WORKING BRANCH: `feature/ai-5-scheduled-digest` (from development `498d3342`; AI-4 closure docs carried as `76322f69`). Digest = `ai_findings` `daily_brief` (per owner+date+provider, payload 1.0), no new table/migration, provider-owned scheduling (no JobQuest scheduler), one new read-only MCP tool, Daily Digest tab `/ai-hub/digest`. Details: `reports/AI-5_SCHEDULED_DIGEST_REPORT.md`. Next: AI-6 External Intelligence Sources needs operator approval.

(Previous phase pointer, kept for history:)
CURRENT PHASE: AI-4 (Claude Integration) · CURRENT SUB-PHASE: AI-4 COMPLETE. AI-4 COMPLETE — CLAUDE REMOTE CONNECTOR INTEGRATED TO DEVELOPMENT. Executable SHA `4c3a5778` (branch CI `37947672506` PASS); first development merge `ddec2093` CI `38149316322` FAILED on an unrelated pre-existing calendar today-badge contrast defect (white on #8098ff, 2.67:1; `e2e/pl4b-planning.spec.ts:70`; failed-job rerun failed the same way); narrow fix branch `fix/calendar-today-contrast` (`019cbaba`, `.calendar-today` now uses existing `--color-on-accent`), branch CI `38200664445` PASS; merged to development `498d3342765deb252cceefb287940d3d83382814`; final development CI `38201400116` PASS. AI-4 provider functionality needed no further change; Claude smoke NOT repeated. Main `26e517ea` and Production unchanged; Dev migration head `20261026100000`, Prod `20261022100000`. · WORKING BRANCH: `feature/ai-4-claude-integration` (from development `ed517594d58dedf26b6144d61b2e9ac2f8e60a58`) · AI-3 FINAL (persisted): COMPLETE; development SHA `ed517594d58dedf26b6144d61b2e9ac2f8e60a58`; development CI `37820583043` PASS; executable feature SHA `d8657e54` (implementation `bac31196`), branch CI `37819293115` PASS; main `26e517ea…` and Production unchanged. · AI-4: Claude connects as a custom remote MCP connector to `/api/mcp` with a fixed `Authorization: Bearer <AI-3 connector token>` header (no OAuth, no Anthropic API/SDK/key, no Claude credentials stored, no migration). Settings -> AI & Automation -> Providers -> Claude: `ClaudeConnectorPanel` (Set up Claude, Read-only / Read + AI findings presets, 7/30/90-day expiry default 30, show-once token, MCP URL + header guidance, revoke with confirmation, previous credentials). Manager connector tokens keep exact RLS parity with the manager UI (`SECURITY_AUTH.md` §5). MCP tool descriptions reworded for Claude; still six tools. Claude is ATTENDED connector capable, not autonomous; workflow-config mutation, OAuth, core writes deferred. See `reports/AI-4_CLAUDE_INTEGRATION_REPORT.md`. · NEXT: operator review; no next provider until explicitly approved (no Gemini/ChatGPT without operator approval).

(Previous phase pointer, kept for history:)
CURRENT PHASE: AI-3 · CURRENT SUB-PHASE: AI-3 (combined AI-3A + AI-3B) branch CI PASS (run 37819293115 @d8657e54, executable bac31196); merged to development (development SHA/CI persisted at AI-4 start) · WORKING BRANCH: `feature/ai-3-mcp-auth` (from development `222d7e40…`) · AI-2 FINAL (persisted): COMPLETE; development SHA `222d7e40f112cb3a56c6adf30e574cfd6177a731`; development CI `37813657961` PASS; executable feature SHA `79e44c17ba1ffcf364df5aa0eb287d9649c336ed`, branch CI `37812197575` PASS; main/Production unchanged. · AI-3: remote MCP at `/api/mcp` (official SDK 1.32.1, Streamable HTTP, stateless, tools only, POST only) in `apps/api/src/mcp/` (`auth.ts`, `principal.ts`, `schemas.ts`, `tools.ts`, `server.ts`; lazy-mounted by `routes/mcp.ts`); scoped connector tokens (`ai_connector_tokens`, migration `20261026100000`, Dev applied; scopes `jobquest:read|ai:read|ai:ingest`; hash-only, user+workspace bound, each owns an auth_sessions row so reads run as the user under RLS); management routes `/api/ai/connector-tokens` (owner-only; no UI); 6 tools (3 AI reads via aiReadService, 2 application reads via new applicationReadService, 1 AI submit via ingestAiResult); OAuth DEFERRED (no fake metadata). See `reports/AI-3_FINAL_REPORT.md`, `reports/AI-3_AUTH_DECISION.md`. · NEXT: push branch -> one branch CI -> merge --no-ff to development -> development CI (see `CURRENT_AGENT_STATE.md`); then STOP for operator approval of AI-4 (Claude Integration). Provider work (Claude/Gemini/ChatGPT adapters) is NOT started.

AI-1 FINAL (persisted): development SHA `0847447474e9cfd6c53bcab43c4457fbd48ff9c5`; development CI `37801299047` PASS; branch implementation SHA `4a478265ce52de17b4c32290ed751f6cf21c99b3`, branch CI `37799394061` PASS; main `26e517ea…` and Production unchanged; Dev head `20261024100000`, Prod head `20261022100000`.

AI-1F1: central flag resolver `apps/web/src/lib/aiHubFlags.ts` (`VITE_AI_HUB_ENABLED` frontend, `AI_HUB_ENABLED` server kill switch in `apps/api/src/lib/aiHubConfig.ts`; default OFF, kill switch wins); nav, mobile nav and routes (`/ai-hub*`, `/settings/ai`) hidden/404 when off; read-only Settings -> AI & Automation; workflow-config mutation DEFERRED (no migration, no DB change); write actions OFF. 40 unit tests pass, tsc/eslint clean; live visual smoke not done. See `reports/AI-1F1_SETTINGS_FLAGS_REPORT.md`.

AI-1A: migration `supabase/migrations/20261023100000_ai_hub_database_foundation.sql` applied to jobquest-dev only (4 tables, RLS on, no policies, client privileges revoked; service_role DML). See `reports/AI-1A_DATABASE_FOUNDATION_REPORT.md`.

AI-1E: read-only Overview cards (latest run, 7-day activity, needs-attention, pending suggestions, recent findings), run-centric History (status/provider/workflow filters, 20/page, size+1 pagination), run + finding detail dialogs, allowlisted payload display, AuditHistory AI-scope filter (client-side). No migration, no writes. 29 unit tests, typecheck/eslint clean, focused fixture browser check at 375/768/1280. See `reports/AI-1E_OPERATIONAL_VIEWS_REPORT.md`.

AI-1D: AI Hub shell `/ai-hub` + `/ai-hub/history` (apps/web: views/AiHubView.tsx, api/aiHub.ts, lib/aiHub.ts), sidebar + mobile More drawer entry, read-only RLS SELECTs, 12 unit tests pass, typecheck/eslint clean, no DB change, not pushed. Settings → AI & Automation and feature flags deferred to AI-1F. See `reports/AI-1D_UI_FOUNDATION_REPORT.md`.

AI-1C: provider-neutral contract layer `apps/api/src/lib/aiContract/` (constants, types, validate, dedupe, canonical), fixtures `tests/unit/fixtures/ai-contract/`, tests `tests/unit/ai-contract.test.ts` (54 pass), typecheck + eslint clean. No DB change, not pushed. See `reports/AI-1C_CANONICAL_CONTRACT_REPORT.md`. Deferred: closed-finding supersession (ingestion/service phase), audit-view entity filter (AI-1E/AI-2), workflow-config mutation (AI-1F).
AI-1B: migration `supabase/migrations/20261024100000_ai_hub_rls_ownership_audit.sql` applied to jobquest-dev only: authenticated SELECT + `can_access_owned_record` policies (configs owner-only), 4 service_role-only ingest RPCs, 3 owner-only review RPCs (ACCEPTED refused until AI-11), audit via `audit_events`. Behavioural tests `tests/integration/ai-1b-rls-audit.test.ts` 15/15 on the local stack (no hosted-Dev test writes). See `reports/AI-1B_RLS_OWNERSHIP_AUDIT_REPORT.md`. Branch still NOT pushed (Preview mapping unverified). AI-0 dev CI 37690590350 finished: success.

AI-1P environment findings: `reports/AI-1P_ENVIRONMENT_READINESS_REPORT.md` and `ENVIRONMENT_STRATEGY.md` §7. Local dev/CLI → jobquest-dev (verified). Unresolved operator actions: Vercel Preview/Production env→Supabase mapping, Production deployment ID/SHA, stale `.env.production.local`, final result of CI run 37690590350. AI-1P: no tests, no CI, no DB change, no migration. Do not push the feature branch until Preview mapping is confirmed. Agents: dev DB only.

## Why This Phase Exists
2.1-G (legacy reconciliation) was closed and shelved; AI connectivity became its own subsystem needing architecture before any schema/code.

## Current Branch / SHA
Base development `c46392e13d4a85878e782439f8c01b11c0c2c92e`. Docs branch `docs/ai-0-ai-hub-planning`. Post-merge development SHA: see `reports/AI-0_PLANNING_REPORT.md`. main `26e517ea…` unchanged. Production unchanged.

## Completed Work
All 17 AI-0 docs under `ai-hub/`.

## Architecture Decisions
`ARCHITECTURE.md` §9; data model `DATA_MODEL_PLAN.md`; auth options open (`SECURITY_AUTH.md` §3).

## Files Changed
`ai-hub/**` only.

## Database State
Dev (`xpnkasclquplmrcmhsif`): 22 migrations, head `20261024100000` (4 `ai_*` tables with SELECT policies + `rpc_ai_*`; 0 AI rows). Prod (`kqsxdothjxtcktyirpux`): 20 migrations, head `20261022100000`, no `ai_*` tables, untouched.

## Migration State
Repo `supabase/migrations/` = 22 files (AI-1A `20261023100000`, AI-1B `20261024100000`).

## Tests Already Run
AI-1B: `tests/integration/ai-1b-rls-audit.test.ts` 15/15 on local Supabase (Docker). No branch/dev CI for AI-1 yet (deferred to AI-1 completion).

## CI Already Run
See report. Note: `docs/**` branches don't trigger push CI; `ai-hub/` is not docs-only for the classifier (F-1).

## Known Flakes
None recorded for AI work. (Repo-level history lives in `migration-upgrade/`.)

## Important Repository Facts
Option B custom auth (ES256 JWT, no OAuth server); RLS helpers `can_access_owned_record` etc.; mutations via `rpc_*`; extension tokens are the template for connector tokens; queue logic is client-side; routing is a path switch in `App.tsx`; `migration-upgrade/ENVIRONMENT_MATRIX.md` is stale (Render/Neon).

## Provider Assumptions
None confirmed by the operator. All in `PROVIDER_CAPABILITY_MATRIX.md` (mostly NEEDS RECHECK). No provider configuration has occurred.

## Do Not Repeat
Repo audit, env comparison, provider web search (unless re-verifying a specific row).

## Unfinished Work
AI-1C onward (AI-1C–AI-1F, then one branch CI + development merge).

## Uncommitted Work
None (pre-existing untracked `.artifacts/` is not part of this work).

## Exact Resume Instructions
Follow `CURRENT_AGENT_STATE.md` → NEXT EXACT STEP. Run `git status` and `git log -3` first; if HEAD differs from the state file, trust Git.

## Next Phase
AI-1C upon explicit operator approval.

---

## Interruption protocol
If interrupted, context-limited, switching model/agent, or unable to finish — BEFORE stopping when possible:
1. save safe working files; **do not** create a fake completion commit
2. update `CURRENT_AGENT_STATE.md` and this file
3. list uncommitted files, tests already run, CI already run
4. record conclusions and the exact next step
5. set `STATUS: INTERRUPTED — NOT COMPLETE`
Never mark a phase complete because a session ended. Update state files before compaction, model switch, long operations and stopping.

## Agent-switch protocol
Replacement agent reads, in order: `CURRENT_AGENT_STATE.md` → `HANDOFF.md` → current phase report → only the relevant architecture doc. Then inspect `git status`/`git log`. Must NOT: redo the full audit, rerun already-green tests or CI, rediscover settled decisions, or reopen them without contradicting evidence. Resume at NEXT EXACT STEP unless Git proves it stale.

## Phase report rule
Each implementation phase writes `reports/AI-X_<NAME>_REPORT.md` (objective, base SHA, branch, feature SHA, summary, files, DB changes, migration, security impact, validation, branch CI, development merge + CI, manual acceptance, limitations, unresolved, provider setup required, next phase, main/prod status). Never rewrite earlier reports.
