# AI-1B — RLS / Ownership / Audit Report

- **Branch:** `feature/ai-1-foundation` (cumulative; local commit, not pushed). AI-1A commit `b9b3513d`.
- **Migration:** `supabase/migrations/20261024100000_ai_hub_rls_ownership_audit.sql`. Named by repo convention (next day, `100000`) because `supabase migration new` would generate a wall-clock timestamp (2026-10-07) that sorts before the future-dated head — same deviation as AI-1A.
- **Target:** jobquest-dev `xpnkasclquplmrcmhsif` only. Verified before apply: branch, `supabase/.temp/project-ref`, MCP `list_migrations` head `20261023100000`, `db push --dry-run` listed only this file. Applied with `npx supabase db push`.
- **Heads:** pre `20261023100000` → post `20261024100000` (recorded once; 22 rows). Prod `kqsxdothjxtcktyirpux` read-only check: head `20261022100000`, unchanged.

## Read model (RLS)
| Table | Grant to `authenticated` | Policy |
|---|---|---|
| `ai_runs`, `ai_findings`, `ai_suggestions` | SELECT | `public.can_access_owned_record(workspace_id, user_id)` |
| `ai_workflow_configs` | SELECT | owner only: `user_id = auth.uid() and is_workspace_member(workspace_id)` |

- `can_access_owned_record` = (owner AND ACTIVE member) OR ACTIVE MANAGER of the workspace, with session liveness (`app.session_is_active`). Same predicate as all core owner-scoped tables; DATA_MODEL_PLAN §3 / SECURITY_AUTH §5 specified it.
- **Manager visibility:** ACTIVE managers read members' runs/findings/suggestions (consistent with core data). Managers **cannot** review, dismiss or delete them, and cannot read members' workflow configs (personal settings; mirrors `extension_tokens` owner-private pattern — least privilege).
- Plain members never see peers' AI rows; workspace id alone grants nothing. anon/public: no grants at all.
- No INSERT/UPDATE/DELETE grants to anon/authenticated/public on any `ai_*` table.

## Write model (RPCs)
All `SECURITY DEFINER`, `set search_path = ''`, no dynamic SQL, explicit REVOKE/GRANT (Supabase default privileges revoked per role).

| RPC | Executable by | Purpose |
|---|---|---|
| `rpc_ai_ingest_run` | service_role | create QUEUED/RUNNING run; idempotent on (workspace, provider, external_run_id); another member's id → `AI_RUN_CONFLICT` |
| `rpc_ai_finalize_run` | service_role | constrained transition + counts/error; terminal sets `completed_at`; `error_detail` truncated to 500 |
| `rpc_ai_ingest_finding` | service_role | finding into an open RUNNING run; ws/user/provider taken from the run; dedupe (below) |
| `rpc_ai_create_suggestion` | service_role | inert proposal on a NEW finding; target (application/task/contact) must be the actor's in the same workspace; identical PENDING proposal is a no-op |
| `rpc_ai_dismiss_finding` | authenticated (owner) | NEW/REVIEWED → DISMISSED; pending suggestions → IGNORED |
| `rpc_ai_decide_suggestion` | authenticated (owner) | `IGNORED` only; `ACCEPTED` → `AI_ACTION_NOT_ENABLED` (AI-11) |
| `rpc_ai_delete_finding` | authenticated (owner) | hard delete (user-deletable per §7), suggestions cascade |

- Service RPCs follow the M11 `p_actor_id` convention (server passes the connector token's resolved user); every call re-checks ACTIVE membership via `app.user_is_member` and ownership of the run/finding.
- Review RPCs revoke EXECUTE from service_role too: providers/servers cannot delete or decide.
- Unknown, foreign and inaccessible ids return the same `*_NOT_FOUND` (no existence leak).
- Run transitions: QUEUED→RUNNING|FAILED|CANCELLED; RUNNING→SUCCEEDED|PARTIAL|FAILED|AWAITING_APPROVAL|CANCELLED; AWAITING_APPROVAL→SUCCEEDED|PARTIAL|FAILED|CANCELLED; terminal states final; same-status is an idempotent no-op.
- Validation: contract major 1 (`^1\.\d{1,3}$`), initial status, sources array ≤50/8 KiB, counts object of ≤20 non-negative numbers, `dedupe_key` `[[:graph:]]{1,255}`, payload object ≤16 KiB, source_ref object ≤2 KiB, proposed object ≤4 KiB. Enum values rely on AI-1A CHECK constraints (23514).
- Internal helpers `app.ai_assert_actor`, `app.ai_assert_schema_version`, `app.ai_write_audit`: SECURITY INVOKER, pinned search_path, EXECUTE revoked from every API role.
- `ai_workflow_configs` mutation: **not implemented** (belongs to AI-1F flags/settings).

## Dedupe / content hash
- `content_hash` is computed **in the RPC** (sha256 over canonical jsonb of the stored content fields; timestamps as epoch, confidences at stored scale). No caller hash accepted. `dedupe_key` is computed by the JobQuest server (AI-1C TS util) and only shape-validated here.
- Outcomes: `created`; `duplicate` (same key + hash; a different provider is appended to server-owned `payload.seen_by`); `updated` (different hash, still NEW: updated in place, id kept); `unchanged_closed` (finding no longer NEW: never resurrected). Superseding linked findings needs a derived key and is deferred. AI-1A unique index unchanged.

## Audit
Reuses append-only `public.audit_events`. Entity types `AI_RUN`, `AI_FINDING`, `AI_SUGGESTION`. Actions: `AI_RUN_CREATED`, `AI_RUN_STATUS_CHANGED`, `AI_FINDING_CREATED`, `AI_FINDING_UPDATED`, `AI_FINDING_DISMISSED`, `AI_FINDING_DELETED`, `AI_SUGGESTION_CREATED`, `AI_SUGGESTION_IGNORED`. `actor_id` = connector owner for ingest with `metadata.actor_kind = 'SERVICE_INGEST'`, or the signed-in user with `'USER'`. Metadata = ids/enums/counts only (no title, summary, evidence, payload, source_ref, error_detail). Refused calls and no-op duplicates write nothing.

## Tests
`tests/integration/ai-1b-rls-audit.test.ts` (15 cases, existing harness; skips unless `SUPABASE_URL` is 127.0.0.1/localhost). **Executed:** local Supabase stack (Docker, `127.0.0.1:55321/55322`; AI-1A + AI-1B applied with `supabase migration up --local`) — **15/15 passed**. Covers: anon read/write denied; owner/manager read, peer/unrelated hidden; configs owner-only; direct client DML denied (owner and manager); service RPCs denied to anon/authenticated, review RPCs denied to anon/service_role; review RPCs reject non-owners incl. manager with no audit; ACCEPTED refused; dedupe incl. cross-provider; run transitions; input validation; **AI-1A outstanding constraint tests** (check, FK, unique, self-retry, set-null, cascade, decision consistency, distinct providers); audit content scan.
Local note: `supabase start` fails on edge-runtime health (project id `JobQuest2.0` has a dot → invalid hostname); started with `-x edge-runtime,imgproxy,studio,vector,logflare,mailpit`.
**Hosted-Dev temporary writes:** none. AI tables on Dev still 0/0/0/0 rows.

## Dev read-only verification (post-apply)
RLS on 4/4; policies as above; client grants = `authenticated:SELECT` ×4 only; 7 RPCs + 3 helpers all `search_path=""`; ACLs as tabled; 16 indexes on `ai_*`.

## Advisors
Security: `ai_*` no longer in `rls_enabled_no_policy`. No AI function in `function_search_path_mutable` or `anon_security_definer_function_executable`. Only the 3 intended owner-review RPCs appear in `authenticated_security_definer_function_executable` (WARN; intended — same class as all existing `rpc_*`). Unrelated pre-existing (not fixed): 8 `app.*` mutable search_path functions; anon-executable `can_access_owned_record`, `is_workspace_member`, `is_workspace_manager`, `check_last_manager_protection`. Performance advisor: not run.

## Files
`supabase/migrations/20261024100000_ai_hub_rls_ownership_audit.sql`, `tests/integration/ai-1b-rls-audit.test.ts`, this report, `ROADMAP.md`, `PHASE_REGISTRY.md`, `CURRENT_AGENT_STATE.md`, `HANDOFF.md`, `SECURITY_AUTH.md`, `DATA_MODEL_PLAN.md`. Core tables: none changed.

## Known limitations
- Per-finding audit volume will share `rpc_list_workspace_audit_events` (newest 50) with membership events; AI-1E/AI-2 may need an entity-type filter.
- Superseding linked findings for closed findings not implemented (`unchanged_closed`).
- Suggestion target validation covers application/task/contact only; other target types rejected.
- Ingest actor trust rests on the server passing the token's user (as M11); token tables arrive in AI-3B.
- No REVIEWED transition RPC (not in plan); no expiry/purge job.

## State
Dev changed: yes (this migration). Prod: no. Preview: none. Branch pushed: no. CI: not run (deferred to AI-1 completion).

## Next
AI-1C — canonical contract types / validator / dedupe-key util (TS), calling these RPCs.
