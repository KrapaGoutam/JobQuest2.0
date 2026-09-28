-- JobQuest 2.0 · Milestone 11 — Browser Extension Migration
-- Scoped, expiring, workspace-bound extension tokens and atomic captures.

create table public.extension_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.user_accounts(user_id) on delete cascade,
  name varchar(64) not null,
  token_prefix varchar(16) not null,
  token_hash varchar(64) not null unique,
  scopes text[] not null default array[
    'workflow:read',
    'documents:read',
    'applications:duplicate_check',
    'applications:create',
    'profile:read'
  ]::text[],
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  last_used_at timestamptz null,
  revoked_at timestamptz null,
  revoked_by uuid null references public.user_accounts(user_id) on delete set null,
  revoked_reason varchar(128) null,
  replaced_by_token_id uuid null references public.extension_tokens(id) on delete set null,
  legacy_id integer null,
  constraint chk_extension_token_name check (char_length(btrim(name)) between 1 and 64),
  constraint chk_extension_token_prefix check (token_prefix ~ '^jqx_(dev|live)_'),
  constraint chk_extension_token_hash check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint chk_extension_token_expiry check (
    expires_at > created_at and expires_at <= created_at + interval '365 days'
  ),
  constraint chk_extension_token_revocation check (
    (revoked_at is null and revoked_by is null and revoked_reason is null)
    or
    (revoked_at is not null and revoked_by is not null and revoked_reason is not null)
  ),
  constraint chk_extension_token_replacement check (
    replaced_by_token_id is null or (revoked_at is not null and replaced_by_token_id <> id)
  ),
  constraint chk_extension_token_scopes check (
    cardinality(scopes) between 1 and 5
    and scopes <@ array[
      'workflow:read',
      'documents:read',
      'applications:duplicate_check',
      'applications:create',
      'profile:read'
    ]::text[]
  )
);

create index idx_extension_tokens_owner
  on public.extension_tokens(user_id, workspace_id, created_at desc);
create index idx_extension_tokens_active_hash
  on public.extension_tokens(token_hash)
  where revoked_at is null;

-- Owner-private metadata. Creation, revocation, and rotation are only available
-- through the Node facade's service-role-only RPCs below.
alter table public.extension_tokens enable row level security;
revoke all on public.extension_tokens from public, anon, authenticated;
grant select (
  id,
  workspace_id,
  user_id,
  name,
  token_prefix,
  scopes,
  created_at,
  expires_at,
  last_used_at,
  revoked_at,
  revoked_by,
  revoked_reason,
  replaced_by_token_id
) on public.extension_tokens to authenticated;
grant select, insert, update on public.extension_tokens to service_role;

create policy extension_tokens_select_own
  on public.extension_tokens
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_workspace_member(workspace_id)
  );

-- The Node facade has already verified the user's short-lived JobQuest access
-- token. This RPC repeats ownership and live-membership checks, inserts the token,
-- and writes its audit record in the same transaction.
create or replace function public.rpc_create_extension_token(
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
begin
  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id and wm.user_id = p_actor_id
  ) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;

  insert into public.extension_tokens (
    workspace_id, user_id, name, token_prefix, token_hash, scopes, expires_at
  ) values (
    p_workspace_id, p_actor_id, btrim(p_name), p_token_prefix, p_token_hash,
    p_scopes, p_expires_at
  )
  returning id into v_token_id;

  insert into public.audit_events (
    workspace_id, actor_id, target_user_id, target_entity_type,
    target_entity_id, action, metadata
  ) values (
    p_workspace_id, p_actor_id, p_actor_id, 'EXTENSION_TOKEN',
    v_token_id, 'EXTENSION_TOKEN_CREATED',
    jsonb_build_object('name', btrim(p_name), 'expires_at', p_expires_at, 'scopes', to_jsonb(p_scopes))
  );

  return v_token_id;
end;
$$;

create or replace function public.rpc_revoke_extension_token(
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
  v_token public.extension_tokens%rowtype;
begin
  select * into v_token
  from public.extension_tokens
  where id = p_token_id and user_id = p_actor_id
  for update;

  if not found then
    raise exception 'EXTENSION_TOKEN_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_token.revoked_at is not null then
    return false;
  end if;

  update public.extension_tokens
  set revoked_at = now(), revoked_by = p_actor_id, revoked_reason = left(btrim(p_reason), 128)
  where id = p_token_id;

  insert into public.audit_events (
    workspace_id, actor_id, target_user_id, target_entity_type,
    target_entity_id, action, metadata
  ) values (
    v_token.workspace_id, p_actor_id, p_actor_id, 'EXTENSION_TOKEN',
    p_token_id, 'EXTENSION_TOKEN_REVOKED', jsonb_build_object('reason', left(btrim(p_reason), 128))
  );

  return true;
end;
$$;

create or replace function public.rpc_rotate_extension_token(
  p_actor_id uuid,
  p_token_id uuid,
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
  v_old public.extension_tokens%rowtype;
  v_new_id uuid;
begin
  select * into v_old
  from public.extension_tokens
  where id = p_token_id and user_id = p_actor_id
  for update;

  if not found then
    raise exception 'EXTENSION_TOKEN_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_old.revoked_at is not null or v_old.expires_at <= now() then
    raise exception 'EXTENSION_TOKEN_INACTIVE' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = v_old.workspace_id and wm.user_id = p_actor_id
  ) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;

  insert into public.extension_tokens (
    workspace_id, user_id, name, token_prefix, token_hash, scopes, expires_at
  ) values (
    v_old.workspace_id, p_actor_id, btrim(p_name), p_token_prefix,
    p_token_hash, p_scopes, p_expires_at
  )
  returning id into v_new_id;

  update public.extension_tokens
  set revoked_at = now(), revoked_by = p_actor_id,
      revoked_reason = 'ROTATED', replaced_by_token_id = v_new_id
  where id = p_token_id;

  insert into public.audit_events (
    workspace_id, actor_id, target_user_id, target_entity_type,
    target_entity_id, action, metadata
  ) values (
    v_old.workspace_id, p_actor_id, p_actor_id, 'EXTENSION_TOKEN',
    p_token_id, 'EXTENSION_TOKEN_ROTATED',
    jsonb_build_object('replacement_token_id', v_new_id)
  );

  return v_new_id;
end;
$$;

-- One transaction for the application, immutable posting snapshot, database-
-- generated CREATED/CAPTURED events, and optional resume/manual document label.
create or replace function public.rpc_extension_capture(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_company_name text,
  p_role_title text,
  p_stage text default 'APPLIED',
  p_job_url text default null,
  p_source text default null,
  p_external_job_id text default null,
  p_location text default null,
  p_work_arrangement text default null,
  p_employment_type text default null,
  p_salary_min numeric default null,
  p_salary_max numeric default null,
  p_salary_currency text default 'USD',
  p_tags text[] default '{}',
  p_duplicate_override boolean default false,
  p_notes text default null,
  p_applied_at timestamptz default now(),
  p_job_description text default null,
  p_requirements text default null,
  p_skills text default null,
  p_raw_payload jsonb default null,
  p_resume_id uuid default null,
  p_resume_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application_id uuid;
begin
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id and wm.user_id = p_actor_id
  ) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;

  if p_resume_id is not null and not exists (
    select 1 from public.resumes r
    where r.id = p_resume_id
      and r.workspace_id = p_workspace_id
      and r.user_id = p_actor_id
      and r.document_type = 'RESUME'
      and r.is_active
      and r.archived_at is null
  ) then
    raise exception 'RESUME_ACCESS_DENIED' using errcode = '42501';
  end if;

  insert into public.applications (
    workspace_id, user_id, company_name, role_title, stage, job_url, source,
    external_job_id, location, work_arrangement, employment_type,
    salary_min, salary_max, salary_currency, tags, duplicate_override_flag,
    notes, applied_at
  ) values (
    p_workspace_id, p_actor_id, btrim(p_company_name), btrim(p_role_title), upper(p_stage),
    nullif(btrim(p_job_url), ''), nullif(btrim(p_source), ''), nullif(btrim(p_external_job_id), ''),
    nullif(btrim(p_location), ''), nullif(btrim(p_work_arrangement), ''),
    nullif(btrim(p_employment_type), ''), p_salary_min, p_salary_max,
    upper(coalesce(nullif(btrim(p_salary_currency), ''), 'USD')),
    coalesce(p_tags, '{}'), p_duplicate_override,
    nullif(btrim(p_notes), ''), coalesce(p_applied_at, now())
  )
  returning id into v_application_id;

  insert into public.job_snapshots (
    application_id, workspace_id, job_description, requirements, skills, raw_payload
  ) values (
    v_application_id, p_workspace_id, nullif(p_job_description, ''),
    nullif(p_requirements, ''), nullif(p_skills, ''), p_raw_payload
  );

  if p_resume_id is not null or nullif(btrim(p_resume_label), '') is not null then
    insert into public.application_documents (
      application_id, workspace_id, document_type, resume_id, label
    ) values (
      v_application_id, p_workspace_id, 'RESUME', p_resume_id,
      nullif(btrim(p_resume_label), '')
    );
  end if;

  return jsonb_build_object(
    'id', v_application_id,
    'deep_link_path', '/w/' || p_workspace_id::text || '/applications/' || v_application_id::text
  );
end;
$$;

revoke all on function public.rpc_create_extension_token(uuid, uuid, text, text, text, text[], timestamptz) from public, anon, authenticated;
revoke all on function public.rpc_revoke_extension_token(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.rpc_rotate_extension_token(uuid, uuid, text, text, text, text[], timestamptz) from public, anon, authenticated;
revoke all on function public.rpc_extension_capture(uuid, uuid, text, text, text, text, text, text, text, text, text, numeric, numeric, text, text[], boolean, text, timestamptz, text, text, text, jsonb, uuid, text) from public, anon, authenticated;

grant execute on function public.rpc_create_extension_token(uuid, uuid, text, text, text, text[], timestamptz) to service_role;
grant execute on function public.rpc_revoke_extension_token(uuid, uuid, text) to service_role;
grant execute on function public.rpc_rotate_extension_token(uuid, uuid, text, text, text, text[], timestamptz) to service_role;
grant execute on function public.rpc_extension_capture(uuid, uuid, text, text, text, text, text, text, text, text, text, numeric, numeric, text, text[], boolean, text, timestamptz, text, text, text, jsonb, uuid, text) to service_role;
