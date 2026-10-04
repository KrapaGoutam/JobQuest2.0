-- =============================================================================
-- JobQuest 2.0 · M15-E · Step 16A-1 · READ-ONLY production verification queries
-- Target: jobquest-prod (kwmnljvyvqvbvimypnmw). SELECT ONLY. Run each query
-- separately in the Supabase SQL editor (or via an authorized read-only session)
-- and return the output. NONE of these statements writes. They read no secret
-- values: code_hash / password_hash / token hashes are never selected.
-- =============================================================================

-- Q1. Migration history (expect 18 rows through 20261020100000; 19th absent if unapplied)
select version, name
from supabase_migrations.schema_migrations
order by version;

-- Q2. Claim RPC presence, signature, security mode, search_path
select p.oid::regprocedure                          as signature,
       p.prosecdef                                  as security_definer,
       p.proconfig                                  as config,
       pg_get_functiondef(p.oid) ilike '%''STAGED''%'         as has_staged_guard,
       pg_get_functiondef(p.oid) ilike '%ACCOUNT_NOT_CLAIMABLE%' as has_not_claimable_raise
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'rpc_claim_legacy_account';
-- (For the full body, if needed:)
-- select pg_get_functiondef('public.rpc_claim_legacy_account(uuid,uuid,text,inet)'::regprocedure);

-- Q3. Claim RPC grants (expect: service_role true; anon/authenticated false)
select r.rolname,
       has_function_privilege(r.rolname, 'public.rpc_claim_legacy_account(uuid,uuid,text,inet)', 'EXECUTE') as can_execute
from pg_roles r
where r.rolname in ('anon', 'authenticated', 'service_role');

-- Q4. legacy_claim_codes shape + RLS (expect unique(user_id), RLS enabled)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'legacy_claim_codes'
order by ordinal_position;

select c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'legacy_claim_codes';

-- Q5. Migrated user state (no hashes selected)
select ua.user_id, ua.username, ua.status, ua.failed_login_count, ua.locked_until,
       wm.workspace_id, wm.role
from public.user_accounts ua
left join public.workspace_members wm on wm.user_id = ua.user_id
where ua.user_id = '46ddc7bf-de34-4a06-b155-50e141921f29';

-- Q6. Claim-code row METADATA only (never code_hash)
select id, code_hint, length(code_hash) as hash_len, left(code_hash, 10) as hash_prefix,
       expires_at, claimed_at, created_at
from public.legacy_claim_codes
where user_id = '46ddc7bf-de34-4a06-b155-50e141921f29';

-- Q7. Data integrity (historical expectation: 222 apps, 89 snapshots, 533 events, 49 tags)
select 'applications'    as item, count(*) as n from public.applications
  where workspace_id = '018f0000-0000-4000-8000-000000000001'
union all
select 'job_snapshots',  count(*) from public.job_snapshots
union all
select 'application_events', count(*) from public.application_events
union all
select 'distinct_tags',  count(*) from (
  select distinct unnest(tags) from public.applications
  where workspace_id = '018f0000-0000-4000-8000-000000000001') t;

-- Q8. No legacy credential migration (expect: credential row count == accounts; no
-- sessions / extension tokens / recovery codes for the migrated user; STAGED only)
select 'sessions_for_user'   as item, count(*) as n from public.auth_sessions
  where user_id = '46ddc7bf-de34-4a06-b155-50e141921f29'
union all
select 'ext_tokens_for_user', count(*) from public.extension_tokens
  where user_id = '46ddc7bf-de34-4a06-b155-50e141921f29'
union all
select 'recovery_codes_for_user', count(*) from public.auth_recovery_codes
  where user_id = '46ddc7bf-de34-4a06-b155-50e141921f29'
union all
select 'all_accounts_by_status:' || status, count(*) from public.user_accounts group by status;
