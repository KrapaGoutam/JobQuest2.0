# AI Hub — Handoff

Durable cross-agent transfer (Claude Code ↔ Codex ↔ new session). Keep concise; history belongs in `reports/`.

## Project
JobQuest AI Hub: provider-neutral AI findings layer + remote MCP for Claude/Gemini/ChatGPT; JobQuest remains system of record. Overview: `README.md`.

## Current Phase / Sub-Phase
CURRENT PHASE: AI-2 · CURRENT SUB-PHASE: AI-2A + AI-2B implemented locally; branch CI 37812197575 PASS @79e44c17; merged to development (development SHA/CI in chat checkpoint; persist at AI-3 start). Read service `apps/api/src/services/aiReadService.ts` (RLS-as-caller, internal API only, no routes); audit scope filter migration `20261025100000` (Dev applied; Prod untouched); CRLF enum test fixed; tokens.test.ts service-role allow-list updated. See `reports/AI-2_FINAL_REPORT.md`. · WORKING BRANCH: `feature/ai-2-integration-service` · NEXT: push, branch CI, merge to development, development CI (see `CURRENT_AGENT_STATE.md`); then AI-3 (combined AI-3A+AI-3B: Remote MCP + Authentication) only on operator approval.

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
