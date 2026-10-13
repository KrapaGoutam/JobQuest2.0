# AI Hub — Implementation Phases, Dependencies, Gates

Attributes per phase: `PHASE_REGISTRY.md`. Progress: `ROADMAP.md`.

## 1. Dependency graph (verified against repo/provider facts)

```
AI-0 (docs)  ── environment safety, data model, UX, provider matrix, security, idempotency
   ↓
AI-1P  Env isolation verification      (operator-assisted; BLOCKS all migrations)
   ↓
AI-1A DB → 1B RLS/audit → 1C contract+service → 1D shell → 1E overview/history
                                   └──────────────→ 1F flags (needs 1D)
   ↓
AI-2A read service ─┐
AI-2B ingest → 2C validation, 2D dedupe, 2E provenance ─┤
                                                         ↓
AI-3A MCP skeleton → 3B AUTH (decision gate + provider spike) → 3C read tools, 3D write tools → 3E limits → 3F security validation
                                                         ↓
              ┌──────────────────┬──────────────────┐
         AI-4 Claude        AI-5 Gemini*       AI-6 ChatGPT      (* conditional on plan eligibility)
              └──────────────────┴──────────────────┘
                                 ↓ (≥1 provider proven)
   AI-7 Email ─ needs 1E, 2C, 2D     AI-8 Jobs ─ needs 3C, 2D     AI-9 Recruiters ─ 2D, 3D     AI-10 Calendar ─ 2D, 3D
   (7A,7B,7C,7D,7F can start after 2D without a provider; use fixtures. 7E needs 1E.)
                                 ↓ (read/suggestion layers stable)
                       AI-11 Controlled actions (separate flag, security review)
```
Non-obvious dependencies: AI-2A needs new server-side task/follow-up logic because queue logic is in `apps/web/src/lib/queue.ts` (client). AI-7/8 UI can proceed against fixtures before any provider works — provider phases are the long pole and are mostly operator-gated.

## 2. Phase size rule

One session must understand it; independently testable; rollback = revert merge + (dev) down-migration/drop; concise handoff. Split if >1 system touched. Candidates already flagged: AI-2A (split per domain: goals/pipeline vs tasks vs apps), AI-3B (split per auth option), AI-7E.

## 3. Gate matrix

Legend: **OA** operator approval before implementation · **MIG** schema migration · **MA** migration approval (dev apply) · **PS** provider account setup · **OAU** OAuth setup · **EXT** external manual config · **SEC** secret/credential creation · **UI** manual UI acceptance · **PROD** production env action · **PV** external provider verification. `Y` = required. Coding agents must stop at every `Y` they cannot satisfy themselves.

| Phase | OA | MIG | MA | PS | OAU | EXT | SEC | UI | PROD | PV |
|---|---|---|---|---|---|---|---|---|---|---|
| AI-1P | Y | | | | | Y (read Vercel) | | | | |
| AI-1A | Y | Y | Y | | | | | | | |
| AI-1B | Y | Y | Y | | | | | | | |
| AI-1C | Y | | | | | | | | | |
| AI-1D | Y | | | | | | | Y | | |
| AI-1E | Y | | | | | | | Y | | |
| AI-1F | Y | maybe | Y if mig | | | | | Y | | |
| AI-2A | Y | likely | Y | | | | | | | |
| AI-2B–2E | Y | maybe(2D) | Y if mig | | | | | | | |
| AI-3A | Y | | | | | | | | | |
| AI-3B | Y (**decision gate**) | Y | Y | Y | Y if S2 | Y | **Y** (pepper, signing) | Y (connections UI) | | **Y** |
| AI-3C–3E | Y | maybe(3E) | Y if mig | | | | | | | |
| AI-3F | Y | | | | | | | | | |
| AI-4A–4E | Y | | | Y | Y | Y | | Y | | Y |
| AI-5A–5E | Y (+plan eligibility) | | | Y | Y | Y | | Y | | Y |
| AI-6A–6E | Y | | | Y | Y | Y | | Y | | Y |
| AI-7A–7F | Y | maybe(7A) | Y if mig | | | | | Y (7E) | | |
| AI-8A–8E | Y | maybe | Y if mig | | | Y (8B) | | Y (8E) | | |
| AI-9, AI-10 | Y | | | | | Y | | Y | | |
| AI-11A–E | Y (each) + security review | maybe | Y if mig | | | | | Y | | |
| Final release | **Y** | prod apply | **Y** | | | prod connector config | prod secrets | Y | **Y** | Y recheck matrix |

Standing rules: production migrations/deploys happen only in the final approved release; AI migrations are applied to the dev project only; secrets are created by the operator (agents never see values); agents do not claim provider setup occurred.

## 4. AI-1 precise scope

**In:** AI-1P prerequisite; tables `ai_runs`, `ai_findings`, `ai_suggestions`, `ai_workflow_configs` with constraints, indexes, `touch_updated_at` triggers; RLS (select via `can_access_owned_record`), revoked write grants, SECURITY DEFINER RPC shells (`rpc_ai_decide_suggestion` with stub apply-handlers that only record decision, `rpc_ai_dismiss_finding`, `rpc_ai_delete_finding`, ingest RPCs callable only by service-role and covered by tests), audit events; canonical contract v1.0 types + validator + dedupe-key util + golden fixtures; `/ai-hub` shell, Overview, History (read-only), Settings → AI & Automation shell; env kill switch + build flag + per-workspace flags. Default **off** everywhere.
**Out:** MCP, tokens, OAuth, any provider, email/jobs/recruiter/calendar, accept handlers that mutate core data, contextual surfaces, purge job, prod anything.
**Exit criteria:** migrations applied to dev only; `list_migrations` dev = repo; RLS tests green (cross-user, cross-workspace, anon denied, client-write denied); flag off ⇒ no nav/route/API; core regression covered by normal branch+development CI; reports `AI-1*_REPORT.md` written; each sub-phase merged to development once.

## 5. Branch/CI policy per phase (from operator policy)

`feature/fix/docs/chore branch → targeted local validation → push (CI on feature/** fix/** triggers automatically once) → merge to development once → development CI once → STOP`. Main/prod untouched until final release approval. Details: `TESTING_CI_RELEASE_STRATEGY.md`.
