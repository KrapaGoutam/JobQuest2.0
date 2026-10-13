-- =============================================================================
-- JobQuest AI Hub · AI-10 — OAuth 2.1 provider authorization
--
-- Additive authorization-code + PKCE layer for remote MCP clients. JobQuest's
-- existing application identity, auth_sessions, workspace membership, RLS and
-- connector-token path remain authoritative. OAuth never grants a core-write
-- scope and every grant owns an auth_sessions row, so logout-all, password
-- changes, recovery, suspension and membership removal fail closed.
-- =============================================================================

-- Pre-registered, user-defined clients are the deliberately small registration
-- surface. Secrets are HMAC digests produced by the Node API; raw values are
-- shown once and never stored. Redirect URIs are exact-match only.
create table public.oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id varchar(96) not null unique,
  client_secret_hash char(64) not null,
  client_secret_prefix varchar(24) not null,
  issuer text not null,
  provider varchar(16) not null,
  name varchar(64) not null,
  user_id uuid not null references public.user_accounts(user_id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  redirect_uris text[] not null,
  scopes text[] not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz null,
  revoked_at timestamptz null,
  revoked_reason varchar(128) null,
  constraint chk_oauth_client_provider check (provider in ('gemini', 'chatgpt')),
  constraint chk_oauth_client_redirects check (cardinality(redirect_uris) between 1 and 5),
  constraint chk_oauth_client_scopes check (
    cardinality(scopes) between 1 and 3
    and scopes <@ array['jobquest:read', 'ai:read', 'ai:ingest']::text[]
  ),
  constraint chk_oauth_client_revocation check ((revoked_at is null) = (revoked_reason is null))
);
create index idx_oauth_clients_owner on public.oauth_clients(user_id, workspace_id, created_at desc);

create table public.oauth_authorization_requests (
  id uuid primary key default gen_random_uuid(),
  oauth_client_id uuid not null references public.oauth_clients(id) on delete cascade,
  issuer text not null,
  redirect_uri text not null,
  resource text not null,
  scopes text[] not null,
  state varchar(512) not null,
  code_challenge char(43) not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz null,
  decision varchar(16) null,
  constraint chk_oauth_request_decision check (decision is null or decision in ('APPROVED', 'DENIED'))
);
create index idx_oauth_requests_expiry on public.oauth_authorization_requests(expires_at);

create table public.oauth_grants (
  id uuid primary key default gen_random_uuid(),
  oauth_client_id uuid not null references public.oauth_clients(id) on delete cascade,
  user_id uuid not null references public.user_accounts(user_id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  session_id uuid not null unique references public.auth_sessions(id) on delete cascade,
  scopes text[] not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz null,
  revoked_at timestamptz null,
  revoked_reason varchar(128) null,
  constraint chk_oauth_grant_scopes check (
    cardinality(scopes) between 1 and 3
    and scopes <@ array['jobquest:read', 'ai:read', 'ai:ingest']::text[]
  ),
  constraint chk_oauth_grant_revocation check ((revoked_at is null) = (revoked_reason is null))
);
create index idx_oauth_grants_owner on public.oauth_grants(user_id, workspace_id, created_at desc);
create index idx_oauth_grants_client_active on public.oauth_grants(oauth_client_id) where revoked_at is null;

create table public.oauth_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.oauth_grants(id) on delete cascade,
  oauth_client_id uuid not null references public.oauth_clients(id) on delete cascade,
  code_hash char(64) not null unique,
  redirect_uri text not null,
  resource text not null,
  code_challenge char(43) not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz null
);
create index idx_oauth_codes_expiry on public.oauth_authorization_codes(expires_at);

create table public.oauth_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.oauth_grants(id) on delete cascade,
  token_hash char(64) not null unique,
  parent_id uuid null references public.oauth_refresh_tokens(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz null
);
create index idx_oauth_refresh_grant on public.oauth_refresh_tokens(grant_id);

alter table public.oauth_clients enable row level security;
alter table public.oauth_authorization_requests enable row level security;
alter table public.oauth_grants enable row level security;
alter table public.oauth_authorization_codes enable row level security;
alter table public.oauth_refresh_tokens enable row level security;
revoke all on public.oauth_clients, public.oauth_authorization_requests, public.oauth_grants,
  public.oauth_authorization_codes, public.oauth_refresh_tokens from public, anon, authenticated;

-- Internal helper: RFC 7636 S256 challenge for an ASCII verifier.
create or replace function app.oauth_s256(p_verifier text)
returns text language sql immutable strict set search_path = '' as $$
  select translate(rtrim(encode(extensions.digest(convert_to(p_verifier, 'UTF8'), 'sha256'), 'base64'), '='), '+/', '-_');
$$;
revoke all on function app.oauth_s256(text) from public, anon, authenticated;

create or replace function public.rpc_oauth_register_client(
  p_actor_id uuid, p_workspace_id uuid, p_client_id text, p_secret_hash text,
  p_secret_prefix text, p_issuer text, p_provider text, p_name text,
  p_redirect_uris text[], p_scopes text[]
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_active integer;
begin
  if p_provider not in ('gemini', 'chatgpt')
     or cardinality(p_redirect_uris) not between 1 and 5
     or cardinality(p_scopes) not between 1 and 3
     or not (p_scopes <@ array['jobquest:read', 'ai:read', 'ai:ingest']::text[]) then
    raise exception 'OAUTH_CLIENT_INVALID' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.workspace_members wm
    join public.user_accounts ua on ua.user_id = wm.user_id
    where wm.workspace_id = p_workspace_id and wm.user_id = p_actor_id
      and wm.status = 'ACTIVE' and ua.status = 'ACTIVE'
  ) then raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501'; end if;
  select count(*) into v_active from public.oauth_clients c
   where c.user_id = p_actor_id and c.workspace_id = p_workspace_id and c.revoked_at is null;
  if v_active >= 6 then raise exception 'OAUTH_CLIENT_LIMIT' using errcode = '53400'; end if;
  insert into public.oauth_clients(
    client_id, client_secret_hash, client_secret_prefix, issuer, provider, name,
    user_id, workspace_id, redirect_uris, scopes
  ) values (
    p_client_id, p_secret_hash, p_secret_prefix, p_issuer, p_provider, btrim(p_name),
    p_actor_id, p_workspace_id, p_redirect_uris, p_scopes
  ) returning id into v_id;
  insert into public.audit_events(workspace_id, actor_id, target_user_id, target_entity_type, target_entity_id, action, metadata)
  values (p_workspace_id, p_actor_id, p_actor_id, 'OAUTH_CLIENT', v_id, 'OAUTH_CLIENT_CREATED',
    jsonb_build_object('provider', p_provider, 'scopes', to_jsonb(p_scopes), 'redirect_count', cardinality(p_redirect_uris)));
  return v_id;
end $$;

create or replace function public.rpc_oauth_list_clients(p_actor_id uuid, p_workspace_id uuid)
returns table(
  id uuid, client_id text, client_secret_prefix text, issuer text, provider text, name text,
  workspace_id uuid, redirect_uris text[], scopes text[], created_at timestamptz,
  last_used_at timestamptz, revoked_at timestamptz, revoked_reason text, active_grants bigint
) language sql stable security definer set search_path = '' as $$
  select c.id, c.client_id::text, c.client_secret_prefix::text, c.issuer, c.provider::text, c.name::text,
    c.workspace_id, c.redirect_uris, c.scopes, c.created_at, c.last_used_at, c.revoked_at,
    c.revoked_reason::text,
    (select count(*) from public.oauth_grants g where g.oauth_client_id = c.id and g.revoked_at is null and g.expires_at > now())
  from public.oauth_clients c
  where c.user_id = p_actor_id and c.workspace_id = p_workspace_id
    and exists (select 1 from public.workspace_members wm where wm.workspace_id = p_workspace_id
      and wm.user_id = p_actor_id and wm.status = 'ACTIVE')
  order by c.created_at desc;
$$;

create or replace function public.rpc_oauth_revoke_client(p_actor_id uuid, p_client_uuid uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v public.oauth_clients%rowtype; v_changed boolean;
begin
  select * into v from public.oauth_clients where id = p_client_uuid and user_id = p_actor_id for update;
  if not found then raise exception 'OAUTH_CLIENT_NOT_FOUND' using errcode = 'P0002'; end if;
  v_changed := v.revoked_at is null;
  if v_changed then
    update public.oauth_clients set revoked_at = now(), revoked_reason = left(coalesce(nullif(btrim(p_reason), ''), 'USER_REVOKED'), 128) where id = v.id;
    update public.oauth_grants set revoked_at = now(), revoked_reason = 'CLIENT_REVOKED'
      where oauth_client_id = v.id and revoked_at is null;
    update public.auth_sessions s set revoked_at = now(), revoked_reason = 'ADMIN'
      where s.id in (select g.session_id from public.oauth_grants g where g.oauth_client_id = v.id) and s.revoked_at is null;
    insert into public.audit_events(workspace_id, actor_id, target_user_id, target_entity_type, target_entity_id, action, metadata)
    values (v.workspace_id, p_actor_id, p_actor_id, 'OAUTH_CLIENT', v.id, 'OAUTH_CLIENT_REVOKED', jsonb_build_object('reason', p_reason));
  end if;
  return v_changed;
end $$;

-- Validates the untrusted authorization request before anything reaches the UI.
create or replace function public.rpc_oauth_create_authorization_request(
  p_client_id text, p_issuer text, p_redirect_uri text, p_resource text,
  p_scopes text[], p_state text, p_code_challenge text, p_ttl_seconds integer
)
returns table(request_id uuid, provider text, client_name text)
language plpgsql security definer set search_path = '' as $$
declare v public.oauth_clients%rowtype; v_id uuid;
begin
  select * into v from public.oauth_clients c
   where c.client_id = p_client_id and c.issuer = p_issuer and c.revoked_at is null;
  if not found or not (p_redirect_uri = any(v.redirect_uris)) then return; end if;
  if cardinality(p_scopes) < 1 or not (p_scopes <@ v.scopes)
     or p_resource <> v.issuer || '/api/mcp' then return; end if;
  insert into public.oauth_authorization_requests(
    oauth_client_id, issuer, redirect_uri, resource, scopes, state, code_challenge, expires_at
  ) values (v.id, p_issuer, p_redirect_uri, p_resource, p_scopes, p_state, p_code_challenge,
    now() + make_interval(secs => least(greatest(p_ttl_seconds, 60), 600)))
  returning id into v_id;
  return query select v_id, v.provider::text, v.name::text;
end $$;

create or replace function public.rpc_oauth_get_authorization_request(p_actor_id uuid, p_request_id uuid)
returns table(
  request_id uuid, client_id text, client_name text, provider text, workspace_id uuid,
  workspace_name text, redirect_uri text, resource text, scopes text[], expires_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select r.id, c.client_id::text, c.name::text, c.provider::text, c.workspace_id, w.name,
    r.redirect_uri, r.resource, r.scopes, r.expires_at
  from public.oauth_authorization_requests r
  join public.oauth_clients c on c.id = r.oauth_client_id
  join public.workspaces w on w.id = c.workspace_id
  join public.workspace_members wm on wm.workspace_id = c.workspace_id and wm.user_id = p_actor_id and wm.status = 'ACTIVE'
  join public.user_accounts ua on ua.user_id = p_actor_id and ua.status = 'ACTIVE'
  where r.id = p_request_id and c.user_id = p_actor_id and c.revoked_at is null
    and r.decision is null and r.expires_at > now();
$$;

create or replace function public.rpc_oauth_decide_authorization_request(
  p_actor_id uuid, p_request_id uuid, p_approve boolean, p_code_hash text,
  p_grant_seconds integer, p_code_seconds integer
)
returns table(
  approved boolean, issuer text, redirect_uri text, state text, grant_id uuid,
  client_id text, resource text, scopes text[]
) language plpgsql security definer set search_path = '' as $$
declare r public.oauth_authorization_requests%rowtype; c public.oauth_clients%rowtype;
  v_session uuid; v_grant uuid; old_session uuid;
begin
  select * into r from public.oauth_authorization_requests where id = p_request_id for update;
  if not found or r.decision is not null or r.expires_at <= now() then return; end if;
  select * into c from public.oauth_clients where id = r.oauth_client_id and user_id = p_actor_id and revoked_at is null;
  if not found or not exists (
    select 1 from public.workspace_members wm join public.user_accounts ua on ua.user_id = wm.user_id
    where wm.workspace_id = c.workspace_id and wm.user_id = p_actor_id and wm.status = 'ACTIVE' and ua.status = 'ACTIVE'
  ) then return; end if;
  if not p_approve then
    update public.oauth_authorization_requests set decision = 'DENIED', decided_at = now() where id = r.id;
    return query select false, r.issuer, r.redirect_uri, r.state::text, null::uuid, c.client_id::text, r.resource, r.scopes;
    return;
  end if;
  -- One live grant per user-defined client. Reauthorization replaces it atomically.
  for old_session in
    select g.session_id from public.oauth_grants g where g.oauth_client_id = c.id and g.user_id = p_actor_id and g.revoked_at is null
  loop
    update public.oauth_grants set revoked_at = now(), revoked_reason = 'REAUTHORIZED'
      where session_id = old_session and revoked_at is null;
    update public.auth_sessions set revoked_at = now(), revoked_reason = 'ADMIN'
      where id = old_session and revoked_at is null;
  end loop;
  insert into public.auth_sessions(user_id, expires_at, user_agent)
    values (p_actor_id, now() + make_interval(secs => least(greatest(p_grant_seconds, 300), 7776000)), 'oauth:' || c.provider)
    returning id into v_session;
  insert into public.oauth_grants(oauth_client_id, user_id, workspace_id, session_id, scopes, expires_at)
    values (c.id, p_actor_id, c.workspace_id, v_session, r.scopes,
      now() + make_interval(secs => least(greatest(p_grant_seconds, 300), 7776000)))
    returning id into v_grant;
  insert into public.oauth_authorization_codes(
    grant_id, oauth_client_id, code_hash, redirect_uri, resource, code_challenge, expires_at
  ) values (v_grant, c.id, p_code_hash, r.redirect_uri, r.resource, r.code_challenge,
    now() + make_interval(secs => least(greatest(p_code_seconds, 30), 300)));
  update public.oauth_authorization_requests set decision = 'APPROVED', decided_at = now() where id = r.id;
  insert into public.audit_events(workspace_id, actor_id, target_user_id, target_entity_type, target_entity_id, action, metadata)
    values (c.workspace_id, p_actor_id, p_actor_id, 'OAUTH_GRANT', v_grant, 'OAUTH_GRANT_APPROVED',
      jsonb_build_object('client_id', c.client_id, 'provider', c.provider, 'scopes', to_jsonb(r.scopes)));
  return query select true, r.issuer, r.redirect_uri, r.state::text, v_grant, c.client_id::text, r.resource, r.scopes;
end $$;

-- Atomic, one-use authorization-code exchange. A wrong verifier/client/redirect/
-- resource returns zero rows and does not burn a legitimate code.
create or replace function public.rpc_oauth_exchange_code(
  p_code_hash text, p_client_id text, p_secret_hash text, p_redirect_uri text,
  p_resource text, p_code_verifier text, p_refresh_hash text, p_refresh_seconds integer
)
returns table(
  grant_id uuid, user_id uuid, workspace_id uuid, session_id uuid, scopes text[],
  client_id text, issuer text, resource text, provider text, refresh_expires_at timestamptz
) language plpgsql security definer set search_path = '' as $$
declare x record; v_refresh_exp timestamptz;
begin
  select ac.id as code_id, ac.grant_id, g.user_id, g.workspace_id, g.session_id, g.scopes,
    c.id as client_uuid, c.client_id, c.issuer, c.provider, g.expires_at as grant_expires
  into x
  from public.oauth_authorization_codes ac
  join public.oauth_grants g on g.id = ac.grant_id
  join public.oauth_clients c on c.id = ac.oauth_client_id and c.id = g.oauth_client_id
  join public.auth_sessions s on s.id = g.session_id and s.user_id = g.user_id
  join public.workspace_members wm on wm.workspace_id = g.workspace_id and wm.user_id = g.user_id and wm.status = 'ACTIVE'
  join public.user_accounts ua on ua.user_id = g.user_id and ua.status = 'ACTIVE'
  where ac.code_hash = p_code_hash and ac.used_at is null and ac.expires_at > now()
    and ac.redirect_uri = p_redirect_uri and ac.resource = p_resource
    and ac.code_challenge = app.oauth_s256(p_code_verifier)
    and c.client_id = p_client_id and c.client_secret_hash = p_secret_hash and c.revoked_at is null
    and g.revoked_at is null and g.expires_at > now() and s.revoked_at is null and s.expires_at > now()
  for update of ac;
  if not found then return; end if;
  update public.oauth_authorization_codes set used_at = now() where id = x.code_id;
  v_refresh_exp := least(x.grant_expires, now() + make_interval(secs => least(greatest(p_refresh_seconds, 300), 7776000)));
  insert into public.oauth_refresh_tokens(grant_id, token_hash, expires_at) values (x.grant_id, p_refresh_hash, v_refresh_exp);
  update public.oauth_clients set last_used_at = now() where id = x.client_uuid;
  update public.oauth_grants set last_used_at = now() where id = x.grant_id;
  return query select x.grant_id, x.user_id, x.workspace_id, x.session_id, x.scopes,
    x.client_id::text, x.issuer, p_resource, x.provider::text, v_refresh_exp;
end $$;

create or replace function public.rpc_oauth_rotate_refresh_token(
  p_token_hash text, p_new_hash text, p_client_id text, p_secret_hash text,
  p_resource text, p_refresh_seconds integer
)
returns table(
  status text, grant_id uuid, user_id uuid, workspace_id uuid, session_id uuid,
  scopes text[], client_id text, issuer text, resource text, provider text,
  refresh_expires_at timestamptz
) language plpgsql security definer set search_path = '' as $$
declare x record; v_exp timestamptz;
begin
  -- Authenticate the client and lock the refresh row before consuming it. A
  -- wrong client/secret/resource can neither rotate nor burn somebody else's token.
  select rt.id as token_id, rt.used_at as token_used_at, rt.expires_at as token_expires,
    g.id as grant_id, g.user_id, g.workspace_id, g.session_id, g.scopes, g.expires_at as grant_expires,
    c.id as client_uuid, c.client_id, c.issuer, c.provider
  into x from public.oauth_refresh_tokens rt
  join public.oauth_grants g on g.id = rt.grant_id
  join public.oauth_clients c on c.id = g.oauth_client_id
  join public.auth_sessions s on s.id = g.session_id and s.user_id = g.user_id
  join public.workspace_members wm on wm.workspace_id = g.workspace_id and wm.user_id = g.user_id and wm.status = 'ACTIVE'
  join public.user_accounts ua on ua.user_id = g.user_id and ua.status = 'ACTIVE'
  where rt.token_hash = p_token_hash
    and c.client_id = p_client_id and c.client_secret_hash = p_secret_hash and c.revoked_at is null
    and p_resource = c.issuer || '/api/mcp'
  for update of rt;
  if not found then return query select 'invalid'::text, null::uuid, null::uuid, null::uuid, null::uuid,
    null::text[], null::text, null::text, null::text, null::text, null::timestamptz; return; end if;
  if x.token_used_at is not null then
    update public.oauth_grants set revoked_at = now(), revoked_reason = 'REFRESH_REUSE'
      where id = x.grant_id and revoked_at is null;
    update public.auth_sessions set revoked_at = now(), revoked_reason = 'REFRESH_REUSE'
      where id = x.session_id and revoked_at is null;
    return query select 'reused'::text, x.grant_id, null::uuid, null::uuid, null::uuid,
      null::text[], null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  if x.token_expires <= now() or x.grant_expires <= now()
     or exists (select 1 from public.oauth_grants g where g.id = x.grant_id and g.revoked_at is not null)
     or exists (select 1 from public.auth_sessions s where s.id = x.session_id and (s.revoked_at is not null or s.expires_at <= now())) then
    return query select 'invalid'::text, null::uuid, null::uuid, null::uuid, null::uuid,
      null::text[], null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  update public.oauth_refresh_tokens set used_at = now() where id = x.token_id and used_at is null;
  v_exp := least(x.grant_expires, now() + make_interval(secs => least(greatest(p_refresh_seconds, 300), 7776000)));
  insert into public.oauth_refresh_tokens(grant_id, token_hash, parent_id, expires_at)
    values (x.grant_id, p_new_hash, x.token_id, v_exp);
  update public.oauth_clients set last_used_at = now() where id = x.client_uuid;
  update public.oauth_grants set last_used_at = now() where id = x.grant_id;
  return query select 'ok'::text, x.grant_id, x.user_id, x.workspace_id, x.session_id,
    x.scopes, x.client_id::text, x.issuer, p_resource, x.provider::text, v_exp;
end $$;

create or replace function public.rpc_oauth_resolve_grant(p_grant_id uuid, p_client_id text)
returns table(
  grant_id uuid, user_id uuid, workspace_id uuid, session_id uuid, scopes text[],
  client_id text, issuer text, provider text
) language sql stable security definer set search_path = '' as $$
  select g.id, g.user_id, g.workspace_id, g.session_id, g.scopes, c.client_id::text, c.issuer, c.provider::text
  from public.oauth_grants g
  join public.oauth_clients c on c.id = g.oauth_client_id
  join public.auth_sessions s on s.id = g.session_id and s.user_id = g.user_id
  join public.workspace_members wm on wm.workspace_id = g.workspace_id and wm.user_id = g.user_id and wm.status = 'ACTIVE'
  join public.user_accounts ua on ua.user_id = g.user_id and ua.status = 'ACTIVE'
  where g.id = p_grant_id and c.client_id = p_client_id and c.revoked_at is null
    and g.revoked_at is null and g.expires_at > now() and s.revoked_at is null and s.expires_at > now();
$$;

create or replace function public.rpc_oauth_touch_grant(p_grant_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.oauth_grants set last_used_at = now() where id = p_grant_id and revoked_at is null
    and (last_used_at is null or last_used_at < now() - interval '1 minute');
$$;

create or replace function public.rpc_oauth_revoke_grant(
  p_actor_id uuid, p_grant_id uuid, p_reason text default 'USER_REVOKED'
) returns boolean language plpgsql security definer set search_path = '' as $$
declare g public.oauth_grants%rowtype; v_changed boolean;
begin
  select * into g from public.oauth_grants where id = p_grant_id and user_id = p_actor_id for update;
  if not found then raise exception 'OAUTH_GRANT_NOT_FOUND' using errcode = 'P0002'; end if;
  v_changed := g.revoked_at is null;
  if v_changed then
    update public.oauth_grants set revoked_at = now(), revoked_reason = left(coalesce(nullif(btrim(p_reason), ''), 'USER_REVOKED'), 128) where id = g.id;
    update public.auth_sessions set revoked_at = now(), revoked_reason = 'ADMIN' where id = g.session_id and revoked_at is null;
    insert into public.audit_events(workspace_id, actor_id, target_user_id, target_entity_type, target_entity_id, action, metadata)
      values (g.workspace_id, p_actor_id, p_actor_id, 'OAUTH_GRANT', g.id, 'OAUTH_GRANT_REVOKED', jsonb_build_object('reason', p_reason));
  end if;
  return v_changed;
end $$;

create or replace function public.rpc_oauth_revoke_grant_by_client(
  p_grant_id uuid, p_client_id text, p_secret_hash text, p_reason text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_grant public.oauth_grants%rowtype;
begin
  select gr.* into v_grant from public.oauth_grants gr join public.oauth_clients c on c.id = gr.oauth_client_id
   where gr.id = p_grant_id and c.client_id = p_client_id and c.client_secret_hash = p_secret_hash for update of gr;
  if not found then return false; end if;
  if v_grant.revoked_at is null then
    update public.oauth_grants set revoked_at = now(), revoked_reason = left(coalesce(nullif(btrim(p_reason), ''), 'CLIENT_REVOKED'), 128) where id = v_grant.id;
    update public.auth_sessions set revoked_at = now(), revoked_reason = 'ADMIN' where id = v_grant.session_id and revoked_at is null;
  end if;
  return true;
end $$;

create or replace function public.rpc_oauth_grant_for_refresh(p_token_hash text, p_client_id text, p_secret_hash text)
returns uuid language sql stable security definer set search_path = '' as $$
  select rt.grant_id from public.oauth_refresh_tokens rt
  join public.oauth_grants g on g.id = rt.grant_id
  join public.oauth_clients c on c.id = g.oauth_client_id
  where rt.token_hash = p_token_hash and c.client_id = p_client_id and c.client_secret_hash = p_secret_hash;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.rpc_oauth_register_client(uuid, uuid, text, text, text, text, text, text, text[], text[])',
    'public.rpc_oauth_list_clients(uuid, uuid)',
    'public.rpc_oauth_revoke_client(uuid, uuid, text)',
    'public.rpc_oauth_create_authorization_request(text, text, text, text, text[], text, text, integer)',
    'public.rpc_oauth_get_authorization_request(uuid, uuid)',
    'public.rpc_oauth_decide_authorization_request(uuid, uuid, boolean, text, integer, integer)',
    'public.rpc_oauth_exchange_code(text, text, text, text, text, text, text, integer)',
    'public.rpc_oauth_rotate_refresh_token(text, text, text, text, text, integer)',
    'public.rpc_oauth_resolve_grant(uuid, text)',
    'public.rpc_oauth_touch_grant(uuid)',
    'public.rpc_oauth_revoke_grant(uuid, uuid, text)',
    'public.rpc_oauth_revoke_grant_by_client(uuid, text, text, text)',
    'public.rpc_oauth_grant_for_refresh(text, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
