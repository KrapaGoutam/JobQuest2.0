# AI Hub — Phase Registry

Single source for phase attributes. Status values: NOT STARTED · IN PROGRESS · BLOCKED · READY FOR REVIEW · COMPLETE · SHELVED · INTERRUPTED. Gates per phase are in `IMPLEMENTATION_PHASES.md` §3. Progress view: `ROADMAP.md`. No time estimates.

Column key — **Br**: branch type (d=docs, f=feature, x=fix, c=chore). **DB/API/UI/Prov**: impact (–/S/M/L). **Sec**: security risk (L/M/H). **Mig**: schema migration. **Setup**: manual provider/operator setup. **Agent/Reason**: recommended agent class + reasoning (std = strong general coding model; deep = highest tier, only for stated reasons). **Cx**: Small/Medium/Large.

| ID | Name | Objective | Deps | Br / suggested branch | DB | API | UI | Prov | Sec | Mig | Setup | Validation | Agent/Reason | Cx | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AI-0A | Repo audit | map architecture | – | d `docs/ai-0-ai-hub-planning` | – | – | – | – | L | N | N | doc review | std | M | COMPLETE |
| AI-0B | Env audit | Dev/Prod facts + risks | 0A | same | – | – | – | – | L | N | N | doc review | std | S | COMPLETE |
| AI-0C | Data model | Option C + contract | 0A | same | – | – | – | – | L | N | N | doc review | std | M | COMPLETE |
| AI-0D | MCP/auth arch | hosting + auth options | 0A | same | – | – | – | – | M | N | N | doc review | std | M | COMPLETE |
| AI-0E | UX arch | nav/tabs/settings | 0A | same | – | – | – | – | L | N | N | doc review | std | S | COMPLETE |
| AI-0F | Security arch | trust/injection | 0D | same | – | – | – | – | M | N | N | doc review | std | M | COMPLETE |
| AI-0G | Provider matrix | capability registry | – | same | – | – | – | – | L | N | N | doc review | std | S | COMPLETE |
| AI-0H | Idempotency/retention/obs/failure | policies | 0C | same | – | – | – | – | L | N | N | doc review | std | M | COMPLETE |
| AI-0I | Roadmap + gates | this registry | 0A–H | same | – | – | – | – | L | N | N | doc review | std | M | COMPLETE |
| AI-1P | Env isolation verification | confirm Vercel env→Supabase map, prod migration procedure, agent write-rule | 0 | c `feature/ai-1-foundation` (cumulative; docs only) | – | – | – | – | M | N | **Y** (operator reads Vercel env) | operator checklist | std | S | COMPLETE (local commit, not pushed) |
| AI-1P-G | Migration target guard | `scripts/assert-migration-target.mjs` + `db:push:dev` wrapper; fails unless ref == expected | 1P | c | – | – | – | – | M | N | N | script test | std | S | NOT STARTED (before first prod migration; manual ref check until then) |
| AI-1P-V | Vercel Preview remap/verify (operator) | Preview → jobquest-dev; prod keys Production-only; record Production deployment ID/SHA | 1P | – | – | – | – | – | H | N | **Y** | operator checklist | – | S | OPEN — required before first push of feature/ai-1-foundation |
| AI-1A | AI database foundation | `ai_runs`,`ai_findings`,`ai_suggestions`,`ai_workflow_configs` + constraints/indexes | 1P | f `feature/ai-1a-db-foundation` | L | – | – | – | M | **Y** | N | migration apply on DEV, schema assertions | std | M | COMPLETE — Dev migration 20261023100000 applied; on cumulative branch feature/ai-1-foundation (not pushed) |
| AI-1B | RLS/ownership/audit | RLS, grants, SECURITY DEFINER RPC shells (ingest, decide, dismiss, delete), audit events | 1A | f `feature/ai-1b-rls-audit` | L | S | – | – | H | **Y** | N | RLS tests incl. cross-user/cross-workspace, privilege tests | std (deep only if RLS contradictory) | M | COMPLETE — Dev migration 20261024100000 applied; SELECT policies, 4 service-only + 3 owner-only RPCs, audit_events; 15 local behavioural tests; on cumulative branch feature/ai-1-foundation (not pushed) |
| AI-1C | Run + finding model (TS) | contract types + validator, dedupe-key util, service for runs/findings | 1B | f `feature/ai-1c-contract-service` | S | M | – | – | M | N | N | unit (contract golden files), RPC tests | std | M | COMPLETE — `apps/api/src/lib/aiContract/` (jobquest.ai-result 1.0), 54 unit tests, no migration; service layer deferred to AI-2/AI-3 |
| AI-1D | AI Hub shell/nav | `/ai-hub` route, sidebar entry, flag-gated, empty states | 1C | f `feature/ai-1d-shell` | – | – | M | – | L | N | N | component tests, manual UI | std | S | COMPLETE (local, not pushed) |
| AI-1E | Overview/History | read-only Overview + History over `ai_runs/findings` (seeded in tests) | 1D | f `feature/ai-1e-overview-history` | – | S | M | – | L | N | N | component + integration, manual UI | std | M | NOT STARTED |
| AI-1F | Feature flags/release controls | env kill switch + per-workspace flags in `ai_workflow_configs`, Settings → AI & Automation shell | 1D | f `feature/ai-1f-flags` | S | S | S | – | M | maybe (settings cols) | N | unit + RPC tests | std | S | NOT STARTED |
| AI-2A | Provider-neutral read service | server-side context builders over existing RPCs; new RPCs for tasks/follow-ups/stale | 1F | f `feature/ai-2a-read-service` | S | M | – | – | M | likely | N | RPC/DB + unit | std | L→split if >1 domain | NOT STARTED |
| AI-2B | Finding ingestion | `ingest()` service → ingest RPCs | 1C,1B | f `feature/ai-2b-ingest` | S | M | – | – | H | N | N | unit + RPC | std | M | NOT STARTED |
| AI-2C | Schema validation/versioning | version upgraders, unknown-field policy | 2B | f `feature/ai-2c-validation` | – | M | – | – | M | N | N | unit golden | std | S | NOT STARTED |
| AI-2D | Idempotency/dedupe | dedupe keys, update/ignore/link semantics | 2B | f `feature/ai-2d-dedupe` | S | M | – | – | M | maybe | N | unit + DB concurrency | std | M | NOT STARTED |
| AI-2E | Audit/provenance | provenance fields, audit events, run counts | 2B | f `feature/ai-2e-provenance` | S | S | S | – | M | N | N | RPC tests | std | S | NOT STARTED |
| AI-3A | MCP foundation | `/api/mcp` Streamable HTTP skeleton, health tool, kill switch, rate-limit shell | 2E | f `feature/ai-3a-mcp-foundation` | – | L | – | M | H | N | N | integration (MCP client test) | std | M | NOT STARTED |
| AI-3B | MCP auth | **decision gate** S1/S2/S3 then token tables/OAuth | 3A | f `feature/ai-3b-mcp-auth` | M | L | M (connections UI) | H | H | **Y** | **Y** (provider spike) | auth tests, token lifecycle | std→deep (auth ambiguity) | L (split by option) | NOT STARTED |
| AI-3C | Read tools | wrap read layer as MCP tools w/ scopes | 3B,2A | f `feature/ai-3c-read-tools` | – | L | – | M | M | N | N | tool-level tests, RLS-as-user | std | M | NOT STARTED |
| AI-3D | Safe write tools | `save_*`/`suggest_*` tools | 3B,2B–2E | f `feature/ai-3d-write-tools` | – | L | – | M | H | N | N | tool + idempotency tests | std | M | NOT STARTED |
| AI-3E | Rate limits/scopes | per-token buckets, caps, auto-pause | 3C,3D | f `feature/ai-3e-limits` | S | M | – | – | M | maybe | N | unit + load-lite | std | S | NOT STARTED |
| AI-3F | Security validation | injection/abuse/cross-tenant test suite + `release-security-reviewer` pass | 3E | f `feature/ai-3f-security-validation` | – | M | – | – | H | N | N | dedicated security tests | std + read-only deep review once | M | NOT STARTED |
| AI-4A | Claude connector setup | docs + dev connector config | 3F | d/f `feature/ai-4a-claude-connector` | – | – | – | M | M | N | **Y** | operator acceptance | std | S | NOT STARTED |
| AI-4B | Claude read workflow | verify read via Claude | 4A | f | – | – | – | M | L | N | Y | manual | std | S | NOT STARTED |
| AI-4C | Scheduled Morning Brief | Brief prompt/spec + daily_brief finding | 4B | f | – | S | S | M | L | N | **Y** (Cowork schedule) | manual + run history | std | M | NOT STARTED |
| AI-4D | Safe structured return | contract adherence tuning | 4C | f | – | S | – | M | M | N | N | golden runs | std | S | NOT STARTED |
| AI-4E | Failure/approval behavior | test denial, expiry, partials | 4D | f | – | S | S | M | M | N | Y | scenario tests | std | S | NOT STARTED |
| AI-5A–5E | Gemini (connected app, read, scheduled, write confirm, fallback) | mirror of AI-4 | 3F + plan decision | f `feature/ai-5x-…` | – | S | S | M | M | N | **Y** | as AI-4 | std | S–M each | NOT STARTED (may be SHELVED) |
| AI-6A–6E | ChatGPT (supported path, scheduled, Gmail/events, structured return, approval/fallback) | mirror of AI-4 | 3F | f `feature/ai-6x-…` | – | S | S | M | M | N | **Y** | as AI-4 | std | S–M each | NOT STARTED |
| AI-7A | Email rules/settings | rules in config + UI | 1F | f `feature/ai-7a-email-rules` | S | S | M | – | L | maybe | N | unit + UI | std | M | NOT STARTED |
| AI-7B | Classification | taxonomy enums + contract | 7A,2C | f | S | S | – | M | L | N | N | unit | std | S | NOT STARTED |
| AI-7C | Priority | priority rules + SLA-ish urgency | 7B | f | – | S | S | – | L | N | N | unit | std | S | NOT STARTED |
| AI-7D | Application matching | deterministic matcher | 7B | f | S | M | – | – | M | N | N | unit + DB | std | M | NOT STARTED |
| AI-7E | Review UX | Email tab, accept/ignore, status-change accept path | 7D,1E | f | S | M | L | – | M | N | N | component + manual UI | std | L→split | NOT STARTED |
| AI-7F | Email dedupe | provider-message-id keys end-to-end | 7B,2D | f | S | S | – | – | M | N | N | idempotency tests | std | S | NOT STARTED |
| AI-8A | Search profile | profile fields for discovery | 3C | f | M | S | M | – | L | maybe | N | unit | std | M | NOT STARTED |
| AI-8B | Provider job discovery | workflow spec + lead findings | 8A,4 or 6 | f | – | S | – | M | L | N | Y | manual | std | M | NOT STARTED |
| AI-8C | Dedup | URL canonicalization vs applications/leads | 8B,2D | f | S | S | – | – | L | maybe (`ai_job_leads`) | N | unit | std | M | NOT STARTED |
| AI-8D | Ranking | rank + filters | 8C | f | – | S | – | – | L | N | N | unit | std | S | NOT STARTED |
| AI-8E | Job Leads UX | tab + accept→application (via 11D later) | 8D,1E | f | – | S | L | – | L | N | N | UI manual | std | M | NOT STARTED |
| AI-9A–9D | Recruiter intel (ingest, matching, contact suggestions, UX) | see ROADMAP | 3D,2D | f | S | S | M | M | M | N | N | unit + manual | std | S–M | NOT STARTED |
| AI-10A–10D | Calendar/interview intel (ingest, detection, reschedule/cancel, events UX) | see ROADMAP | 3D,2D | f | S | S | M | M | M | N | N | unit + manual | std | S–M | NOT STARTED |
| AI-11A | Create task | first controlled write, flag `ai_write_actions_enabled` | 7,8 stable + approval | f `feature/ai-11a-create-task` | S | M | M | – | H | maybe | N | RPC + audit tests | std + security review | M | NOT STARTED |
| AI-11B | Snooze/dismiss task | | 11A | f | – | S | S | – | H | N | N | tests | std | S | NOT STARTED |
| AI-11C | Update application status | | 11A | f | – | M | M | – | H | N | N | tests | std | M | NOT STARTED |
| AI-11D | Create application from approved lead | | 11A,8E | f | S | M | M | – | H | N | N | tests | std | M | NOT STARTED |
| AI-11E | Approval/audit controls | | 11A–D | f | S | M | M | – | H | maybe | N | audit completeness | std + deep read-only review | M | NOT STARTED |
