# AI Hub — Handoff

Durable cross-agent transfer (Claude Code ↔ Codex ↔ new session). Keep concise; history belongs in `reports/`.

## Project
JobQuest AI Hub: provider-neutral AI findings layer + remote MCP for Claude/Gemini/ChatGPT; JobQuest remains system of record. Overview: `README.md`.

## Current Phase / Sub-Phase
AI-0 complete (docs). Next: AI-1P → AI-1A…1F (not approved yet).

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
Dev (`xpnkasclquplmrcmhsif`) and prod (`kqsxdothjxtcktyirpux`): 20 migrations each, head `20261022100000`. No `ai_*` tables. Unchanged by AI-0.

## Migration State
None created. Repo `supabase/migrations/` = 20 files.

## Tests Already Run
None (docs-only).

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
AI-1P onward.

## Uncommitted Work
None (pre-existing untracked `.artifacts/` is not part of this work).

## Exact Resume Instructions
Follow `CURRENT_AGENT_STATE.md` → NEXT EXACT STEP. Run `git status` and `git log -3` first; if HEAD differs from the state file, trust Git.

## Next Phase
AI-1P (prerequisite), then AI-1A, upon explicit operator approval.

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
