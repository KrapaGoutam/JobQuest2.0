-- =============================================================================
-- AI-2B: server-side scope filter for the workspace audit history.
--
-- AI-1E could only filter client-side over the newest-N window, so AI_* events
-- could push membership/security events out of that window. The scope is now
-- applied BEFORE the LIMIT. Only the read path changes: audit storage, audit
-- writers and authorization (ACTIVE workspace manager only) are unchanged.
--
-- p_scope: 'ALL' (default, previous behaviour) | 'AI' (action AI_*) | 'OTHER' (not AI_*).
-- The old (uuid, integer) signature is replaced, not overloaded, so existing
-- two-argument callers keep resolving to a single function.
-- =============================================================================
drop function if exists public.rpc_list_workspace_audit_events(uuid, integer);

create or replace function public.rpc_list_workspace_audit_events(
  p_workspace_id uuid,
  p_limit integer default 50,
  p_scope text default 'ALL'
)
returns table (
  id uuid,
  created_at timestamptz,
  actor_id uuid,
  actor_name text,
  action text,
  target_user_id uuid,
  target_user_name text,
  metadata jsonb
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.is_workspace_manager(p_workspace_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_scope is null or p_scope not in ('ALL', 'AI', 'OTHER') then
    raise exception 'AUDIT_SCOPE_INVALID' using errcode = '22023';
  end if;

  return query
    select
      a.id,
      a.created_at,
      a.actor_id,
      coalesce(ap.display_name, au.username, a.actor_id::text)::text as actor_name,
      a.action::text as action,
      a.target_user_id,
      coalesce(tp.display_name, tu.username, a.target_user_id::text)::text as target_user_name,
      a.metadata
    from public.audit_events a
    left join public.user_accounts au on au.user_id = a.actor_id
    left join public.profiles ap on ap.user_id = a.actor_id
    left join public.user_accounts tu on tu.user_id = a.target_user_id
    left join public.profiles tp on tp.user_id = a.target_user_id
    where a.workspace_id = p_workspace_id
      and case p_scope
            when 'AI' then a.action::text like 'AI\_%' escape '\'
            when 'OTHER' then a.action::text not like 'AI\_%' escape '\'
            else true
          end
    order by a.created_at desc, a.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 500);
end; $$;

revoke all on function public.rpc_list_workspace_audit_events(uuid, integer, text) from public, anon;
grant execute on function public.rpc_list_workspace_audit_events(uuid, integer, text) to authenticated;
