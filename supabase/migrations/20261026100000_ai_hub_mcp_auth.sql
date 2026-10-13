-- =============================================================================
-- JobQuest AI Hub · AI-3 — MCP connector tokens
--
-- Dedicated, scoped, expiring, revocable credentials for the provider-neutral
-- remote MCP endpoint (/api/mcp). Separate from extension_tokens (different
-- audience, scopes and prefix) but the same security pattern:
--   * the raw token is never stored; only an HMAC-SHA256 hex digest (peppered
--     in the Node layer) plus a short non-secret display prefix;
--   * each token binds exactly one (user, workspace); tool arguments never
--     choose either;
--   * creation / revocation / resolution are service_role-only SECURITY DEFINER
--     RPCs; authenticated users may only SELECT their own metadata columns
--     (never token_hash / session_id);
--   * every token owns a dedicated auth_sessions row so MCP reads can run AS THE
--     USER under the existing RLS (a short-lived user JWT carries that
--     session_id). Revoking the token revokes the session in the same
--     transaction, and a password change / logout-all that revokes sessions also
--     kills the connector, so RLS and the token can never disagree.
-- Audit: AI_CONNECTOR_TOKEN_CREATED / AI_CONNECTOR_TOKEN_REVOKED (AI_ prefix, so
-- they appear in the existing AI audit scope). Per-call MCP usage is NOT audited
-- here (structured server logs only).
-- =============================================================================

create table public.ai_connector_tokens (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references public.user_accounts(user_id) on delete cascade,
  session_id    uuid not null unique references public.auth_sessions(id) on delete cascade,
  name          varchar(64) not null,
  token_prefix  varchar(16) not null,
  token_hash    varchar(64) not null unique,
  scopes        text[] not null default array['jobquest:read', 'ai:read']::text[],
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '30 days'),
  last_used_at  timestamptz null,
  revoked_at    timestamptz null,
  revoked_by    uuid null references public.user_accounts(user_id) on delete set null,
  revoked_reason varchar(128) null,
  constraint chk_ai_conn_token_name check (char_length(btrim(name)) between 1 and 64),
  constraint chk_ai_conn_token_prefix check (token_prefix ~ '^jq_mcp_(dev|live)_'),
  constraint chk_ai_conn_token_hash check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint chk_ai_conn_token_expiry check (
    expires_at > created_at and expires_at <= created_at + interval '90 days'
  ),
  constraint chk_ai_conn_token_revocation check (
    (revoked_at is null and revoked_by is null and revoked_reason is null)
    or (revoked_at is not null and revoked_by is not null and revoked_reason is not null)
  ),
  -- Narrow, explicit scopes only: no write, admin or wildcard scope exists.
  constraint chk_ai_conn_token_scopes check (
    cardinality(scopes) between 1 and 3
    and scopes <@ array['jobquest:read', 'ai:read', 'ai:ingest']::text[]
  )
);

create index idx_ai_conn_tokens_owner
  on public.ai_connector_tokens(user_id, workspace_id, created_at desc);
create index idx_ai_conn_tokens_active_hash
  on public.ai_connector_tokens(token_hash)
  where revoked_at is null;

alter table public.ai_connector_tokens enable row level security;
revoke all on public.ai_connector_tokens from public, anon, authenticated;
-- Column-level grant: token_hash and session_id are never readable by clients.
grant select (
  id, workspace_id, user_id, name, token_prefix, scopes,
  created_at, expires_at, last_used_at, revoked_at, revoked_by, revoked_reason
) on public.ai_connector_tokens to authenticated;
grant select, insert, update on public.ai_connector_tokens to service_role;

-- Owner-private metadata (managers cannot see other users' connectors).
create policy ai_connector_tokens_select_own
  on public.ai_connector_tokens
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_workspace_member(workspace_id)
  );

-- -----------------------------------------------------------------------------
-- Create: validates the actor's ACTIVE membership, caps active tokens, opens the
-- dedicated session, stores the hash-only token and audits, atomically.
-- -----------------------------------------------------------------------------
create or replace function public.rpc_ai_create_connector_token(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_name text,
  p_token_prefix text,
  p_token_hash text,
  p_scopes text[],
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_id uuid;
  v_session_id uuid;
  v_active integer;
begin
  if not exists (
    select 1
    from public.workspace_members wm
    join public.user_accounts ua on ua.user_id = wm.user_id
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_actor_id
      and wm.status = 'ACTIVE'
      and ua.status = 'ACTIVE'
  ) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;

  select count(*) into v_active
  from public.ai_connector_tokens t
  where t.user_id = p_actor_id and t.workspace_id = p_workspace_id
    and t.revoked_at is null and t.expires_at > now();
  if v_active >= 10 then
    raise exception 'AI_CONNECTOR_TOKEN_LIMIT' using errcode = '53400';
  end if;

  insert into public.auth_sessions (user_id, expires_at, user_agent)
  values (p_actor_id, p_expires_at, 'mcp-connector')
  returning id into v_session_id;

  insert into public.ai_connector_tokens (
    workspace_id, user_id, session_id, name, token_prefix, token_hash, scopes, expires_at
  ) values (
    p_workspace_id, p_actor_id, v_session_id, btrim(p_name), p_token_prefix,
    p_token_hash, p_scopes, p_expires_at
  )
  returning id into v_token_id;

  insert into public.audit_events (
    workspace_id, actor_id, target_user_id, target_entity_type,
    target_entity_id, action, metadata
  ) values (
    p_workspace_id, p_actor_id, p_actor_id, 'AI_CONNECTOR_TOKEN',
    v_token_id, 'AI_CONNECTOR_TOKEN_CREATED',
    jsonb_build_object('scopes', to_jsonb(p_scopes), 'expires_at', p_expires_at)
  );

  return v_token_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Revoke: owner only (the token must belong to the actor). Idempotent.
-- Returns true when this call revoked it, false when it was already revoked.
-- -----------------------------------------------------------------------------
create or replace function public.rpc_ai_revoke_connector_token(
  p_actor_id uuid,
  p_token_id uuid,
  p_reason text default 'USER_REVOKED'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.ai_connector_tokens%rowtype;
begin
  select * into v_token
  from public.ai_connector_tokens
  where id = p_token_id and user_id = p_actor_id
  for update;

  if not found then
    raise exception 'AI_CONNECTOR_TOKEN_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_token.revoked_at is not null then
    return false;
  end if;

  update public.ai_connector_tokens
  set revoked_at = now(), revoked_by = p_actor_id,
      revoked_reason = left(btrim(coalesce(nullif(p_reason, ''), 'USER_REVOKED')), 128)
  where id = p_token_id;

  update public.auth_sessions
  set revoked_at = now(), revoked_reason = 'ADMIN'
  where id = v_token.session_id and revoked_at is null;

  insert into public.audit_events (
    workspace_id, actor_id, target_user_id, target_entity_type,
    target_entity_id, action, metadata
  ) values (
    v_token.workspace_id, p_actor_id, p_actor_id, 'AI_CONNECTOR_TOKEN',
    p_token_id, 'AI_CONNECTOR_TOKEN_REVOKED',
    jsonb_build_object('reason', left(btrim(coalesce(nullif(p_reason, ''), 'USER_REVOKED')), 128))
  );

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Resolve: the ONLY authentication lookup. Given the peppered hash it returns
-- the bound principal fields iff the token is unrevoked, unexpired, its session
-- is live, and the user/membership are still ACTIVE. No hash or session secret is
-- ever returned. Zero rows for every failure mode (indistinguishable to callers).
-- -----------------------------------------------------------------------------
create or replace function public.rpc_ai_resolve_connector_token(p_token_hash text)
returns table (
  token_id uuid,
  user_id uuid,
  workspace_id uuid,
  session_id uuid,
  scopes text[],
  token_prefix text,
  expires_at timestamptz,
  last_used_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.user_id, t.workspace_id, t.session_id, t.scopes,
         t.token_prefix::text, t.expires_at, t.last_used_at
  from public.ai_connector_tokens t
  join public.auth_sessions s
    on s.id = t.session_id and s.user_id = t.user_id
   and s.revoked_at is null and s.expires_at > now()
  join public.user_accounts ua on ua.user_id = t.user_id and ua.status = 'ACTIVE'
  join public.workspace_members wm
    on wm.workspace_id = t.workspace_id and wm.user_id = t.user_id and wm.status = 'ACTIVE'
  where t.token_hash = p_token_hash
    and t.revoked_at is null
    and t.expires_at > now();
$$;

-- Advisory usage timestamp. Never part of the authentication decision.
create or replace function public.rpc_ai_touch_connector_token(p_token_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_connector_tokens
  set last_used_at = now()
  where id = p_token_id and revoked_at is null
    and (last_used_at is null or last_used_at < now() - interval '1 minute');
$$;

revoke all on function public.rpc_ai_create_connector_token(uuid, uuid, text, text, text, text[], timestamptz) from public, anon, authenticated;
revoke all on function public.rpc_ai_revoke_connector_token(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.rpc_ai_resolve_connector_token(text) from public, anon, authenticated;
revoke all on function public.rpc_ai_touch_connector_token(uuid) from public, anon, authenticated;

grant execute on function public.rpc_ai_create_connector_token(uuid, uuid, text, text, text, text[], timestamptz) to service_role;
grant execute on function public.rpc_ai_revoke_connector_token(uuid, uuid, text) to service_role;
grant execute on function public.rpc_ai_resolve_connector_token(text) to service_role;
grant execute on function public.rpc_ai_touch_connector_token(uuid) to service_role;
