# AI-1A — Database Foundation Report

- **Migration:** `supabase/migrations/20261023100000_ai_hub_database_foundation.sql` (commit: see `git log` on feature/ai-1-foundation, "feat(ai-hub): add AI database foundation").
  Deviation: `supabase migration new` generated `20261007223020` (wall clock), which sorts before the existing head and would be out-of-order for `db push`; renamed to `20261023100000`.
- **Target:** jobquest-dev `xpnkasclquplmrcmhsif` (verified: `supabase/.temp/project-ref`, MCP project list, `db push --dry-run` listed only this migration). Branch `feature/ai-1-foundation`. Prod not touched.
- **Heads:** pre `20261022100000`; post `20261023100000` (exactly 1 row in schema_migrations). Applied with `npx supabase db push`.
- **AI-0 dev CI 37690590350:** completed, success.

## Tables (per DATA_MODEL_PLAN.md, Option C)
`ai_runs`, `ai_findings`, `ai_suggestions`, `ai_workflow_configs`. uuid PK `gen_random_uuid()`, `workspace_id`→workspaces and `user_id`→user_accounts(user_id) cascade, timestamptz, `app.touch_updated_at` triggers (4) — matching repo conventions (extension_tokens, tasks).

## Constraints
- CHECK enums: provider, workflow, 7-state run status, trigger_type, error_category, finding kind/status/priority, suggestion action/status, schema_version `^\d+\.\d+$` (supports `jobquest.ai-result` 1.0 and additive minors), confidence 0–1, JSONB type checks (object/array), evidence ≤500 and summary ≤1000 via varchar, suggestion decision consistency, no self-retry, completed_at ≥ started_at, fallback ≠ primary provider.
- FKs: runs.retry_of_run_id→runs (set null); findings.run_id→runs (set null); findings.application_id→applications (set null); suggestions.finding_id→findings (cascade); suggestions.decided_by→user_accounts (set null). `suggestions.target_id` and `runs.connection_id` have deliberately no FK (polymorphic / table arrives in AI-3B).
- Counts on Dev: runs 10 check/3 FK; findings 9/4; suggestions 5/4; configs 5 check/2 FK/1 unique.

## Dedupe / idempotency
- `uq_ai_runs_ws_provider_external` (workspace, provider, external_run_id) partial WHERE external_run_id IS NOT NULL.
- `uq_ai_findings_dedupe` (workspace, user, kind, dedupe_key); provider excluded so cross-provider duplicates collapse. `content_hash` column supports same-hash/different-hash handling in AI-1B RPCs; `source_ref` jsonb holds source ids. Update-vs-supersede semantics are RPC logic (AI-1B).
- `ai_workflow_configs` unique (workspace, user, workflow).

## Indexes (non-PK/unique)
runs: (ws,user,created desc), (ws,workflow,status), retry_of partial. findings: (ws,user,status,created desc), run_id partial, application_id partial, expires_at partial. suggestions: finding_id, (ws,user,status,created desc). No speculative indexes on priority/provider/kind; add when AI-1B/AI-2 queries exist.

## RLS / access
RLS enabled on all four, **zero policies**, `REVOKE ALL` from public/anon/authenticated; `service_role` has DML. Verified on Dev: rls=true, 0 policies, 0 client grants. Result: no client read or write. **Deferred to AI-1B:** authenticated SELECT grant + `can_access_owned_record` policies, ingest/decide/dismiss/delete RPCs, audit events, manager-visibility semantics.

## Retention
Only `ai_findings.expires_at` (nullable, partial index). No default, purge job, or cron. Run/failed-run retention left to the later purge phase.

## Core table changes
None. No data mutated.

## Validation
Run (read-only on Dev): tables exist with RLS, 0 policies; no anon/authenticated/public grants; 7 JSONB columns; PK/FK/check/unique counts as above; 4 triggers; migration recorded once; head `20261023100000`.
**Not run:** behavioural constraint/dedupe tests (rollback-wrapped inserts on Dev) — the tool call was declined by the operator, so check/unique/FK-set-null *behaviour* is verified by definition only. Outstanding for AI-1B.

## Advisors (security)
New tables: only INFO `rls_enabled_no_policy` (intended; same as other service-only tables). Unrelated pre-existing: mutable search_path on `app.*` functions (incl. touch_updated_at), anon/authenticated-executable SECURITY DEFINER functions. Performance advisor not run.

## State
Dev changed: yes (this migration). Prod: no. Preview: none. Branch pushed: no. CI: not run. App code: unchanged.
## Next
AI-1B — RLS / ownership / audit.
