-- =============================================================================
-- JobQuest AI Hub · AI-11G — provider scheduler adapters (pull executor)
--
-- The provider (Claude / ChatGPT / Gemini) is the scheduled worker: its own scheduled task
-- wakes up, calls JobQuest over MCP and CLAIMS one automation occurrence. JobQuest never
-- calls a provider. To claim, JobQuest must know WHICH provider a credential belongs to,
-- from server-side data and never from a request body.
--
--   * OAuth credentials (Gemini, ChatGPT) already carry it: oauth_clients.provider (AI-10).
--   * MCP connector tokens (Claude's fixed-header connector) did not. This migration adds an
--     OPTIONAL, owner-chosen `provider` to ai_connector_tokens, set when the credential is
--     created for a provider in Settings -> AI & Automation -> Providers.
--   A credential with provider NULL keeps every existing capability (reads, submit) but cannot
--   claim or fail an automation run: the claim answers "credential not bound to a provider".
--
-- Additive and forward-only: one nullable column, the create RPC gains one trailing optional
-- parameter, the resolve RPC returns one more column. Nothing is backfilled, nothing is
-- dropped, no data is rewritten. No Production change here (Production gets it at the single
-- post-AI-11 promotion).
-- =============================================================================

begin;

alter table public.ai_connector_tokens
  add column provider varchar(16) null,
  add constraint chk_ai_conn_token_provider check (provider is null or provider in ('claude', 'gemini', 'chatgpt'));

-- The column-level grant is explicit (token_hash / session_id stay unreadable); provider is not secret.
grant select (provider) on public.ai_connector_tokens to authenticated;

-- -----------------------------------------------------------------------------
-- Create: same behaviour as AI-3 plus the optional provider binding.
-- -----------------------------------------------------------------------------
drop function if exists public.rpc_ai_create_connector_token(uuid, uuid, text, text, text, text[], timestamptz);

create or replace function public.rpc_ai_create_connector_token(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_name text,
  p_token_prefix text,
  p_token_hash text,
  p_scopes text[],
  p_expires_at timestamptz,
  p_provider text default null
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
  if p_provider is not null and p_provider not in ('claude', 'gemini', 'chatgpt') then
    raise exception 'AI_CONNECTOR_TOKEN_INVALID_PROVIDER' using errcode = '22023';
  end if;
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
    workspace_id, user_id, session_id, name, token_prefix, token_hash, scopes, expires_at, provider
  ) values (
    p_workspace_id, p_actor_id, v_session_id, btrim(p_name), p_token_prefix,
    p_token_hash, p_scopes, p_expires_at, p_provider
  )
  returning id into v_token_id;

  insert into public.audit_events (
    workspace_id, actor_id, target_user_id, target_entity_type,
    target_entity_id, action, metadata
  ) values (
    p_workspace_id, p_actor_id, p_actor_id, 'AI_CONNECTOR_TOKEN',
    v_token_id, 'AI_CONNECTOR_TOKEN_CREATED',
    jsonb_build_object('scopes', to_jsonb(p_scopes), 'expires_at', p_expires_at, 'provider', p_provider)
  );

  return v_token_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Resolve: unchanged rules; additionally returns the bound provider (null = unbound).
-- -----------------------------------------------------------------------------
drop function if exists public.rpc_ai_resolve_connector_token(text);

create or replace function public.rpc_ai_resolve_connector_token(p_token_hash text)
returns table (
  token_id uuid,
  user_id uuid,
  workspace_id uuid,
  session_id uuid,
  scopes text[],
  token_prefix text,
  expires_at timestamptz,
  last_used_at timestamptz,
  provider text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.user_id, t.workspace_id, t.session_id, t.scopes,
         t.token_prefix::text, t.expires_at, t.last_used_at, t.provider::text
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

-- -----------------------------------------------------------------------------
-- Ingest run: identical to AI-1B except for ONE addition. An executor-claimed run (AI-11F/G) exists, RUNNING, BEFORE the
-- provider's result arrives, so the provider's source list (and its ok / zero / blocked / unavailable / error / skipped
-- health) would otherwise be dropped on the resume path and "unavailable" would be invisible. While the run is still RUNNING
-- the submission's sources are adopted. A finished run is never touched, and nothing else about the resume changes.
-- -----------------------------------------------------------------------------
create or replace function public.rpc_ai_ingest_run(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_provider text,
  p_workflow text,
  p_trigger_type text default 'manual',
  p_external_run_id text default null,
  p_schema_version text default '1.0',
  p_status text default 'RUNNING',
  p_sources jsonb default '[]'::jsonb,
  p_retry_of_run_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.ai_runs%rowtype;
  v_id uuid;
  v_sources jsonb := coalesce(p_sources, '[]'::jsonb);
begin
  perform app.ai_assert_actor(p_actor_id, p_workspace_id);
  perform app.ai_assert_schema_version(p_schema_version);

  if p_status is null or p_status not in ('QUEUED', 'RUNNING') then
    raise exception 'AI_RUN_INVALID_INITIAL_STATUS' using errcode = '22023';
  end if;
  if jsonb_typeof(v_sources) <> 'array' or jsonb_array_length(v_sources) > 50
     or octet_length(v_sources::text) > 8192 then
    raise exception 'AI_RUN_INVALID_SOURCES' using errcode = '22023';
  end if;
  if p_external_run_id is not null and p_external_run_id !~ '^[[:graph:]]{1,255}$' then
    raise exception 'AI_RUN_INVALID_EXTERNAL_ID' using errcode = '22023';
  end if;
  if (p_trigger_type = 'retry') <> (p_retry_of_run_id is not null) then
    raise exception 'AI_RUN_INVALID_RETRY' using errcode = '22023';
  end if;
  if p_retry_of_run_id is not null and not exists (
    select 1 from public.ai_runs r
    where r.id = p_retry_of_run_id and r.workspace_id = p_workspace_id and r.user_id = p_actor_id
  ) then
    raise exception 'AI_RUN_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.ai_runs (
    workspace_id, user_id, provider, workflow, status, trigger_type,
    external_run_id, schema_version, sources, retry_of_run_id, started_at
  ) values (
    p_workspace_id, p_actor_id, p_provider, p_workflow, p_status, p_trigger_type,
    p_external_run_id, p_schema_version, v_sources, p_retry_of_run_id,
    case when p_status = 'RUNNING' then now() end
  )
  on conflict (workspace_id, provider, external_run_id) where external_run_id is not null
  do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_run from public.ai_runs r
    where r.workspace_id = p_workspace_id and r.provider = p_provider
      and r.external_run_id = p_external_run_id;
    -- Another member's run with the same external id: refuse without leaking it.
    if v_run.user_id is distinct from p_actor_id then
      raise exception 'AI_RUN_CONFLICT' using errcode = '23505';
    end if;
    if v_run.status = 'RUNNING' and jsonb_array_length(v_sources) > 0 then
      update public.ai_runs r set sources = v_sources where r.id = v_run.id;
    end if;
    return jsonb_build_object('run_id', v_run.id, 'created', false, 'status', v_run.status);
  end if;

  perform app.ai_write_audit(p_workspace_id, p_actor_id, p_actor_id, 'AI_RUN', v_id, 'AI_RUN_CREATED',
    jsonb_build_object('actor_kind', 'SERVICE_INGEST', 'provider', p_provider, 'workflow', p_workflow,
                       'trigger_type', p_trigger_type, 'status', p_status, 'schema_version', p_schema_version));

  return jsonb_build_object('run_id', v_id, 'created', true, 'status', p_status);
end;
$$;

revoke all on function public.rpc_ai_ingest_run(uuid, uuid, text, text, text, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.rpc_ai_ingest_run(uuid, uuid, text, text, text, text, text, text, jsonb, uuid) to service_role;

revoke all on function public.rpc_ai_create_connector_token(uuid, uuid, text, text, text, text[], timestamptz, text) from public, anon, authenticated;
revoke all on function public.rpc_ai_resolve_connector_token(text) from public, anon, authenticated;
grant execute on function public.rpc_ai_create_connector_token(uuid, uuid, text, text, text, text[], timestamptz, text) to service_role;
grant execute on function public.rpc_ai_resolve_connector_token(text) to service_role;

commit;
