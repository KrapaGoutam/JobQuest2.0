-- JobQuest 2.0 · Milestone 12 — Workspace Management & Manager Functions
-- Multi-workspace tenancy, metadata, member roster, role/status administration,
-- last-manager protection, secure invitations, durable member removal, and mutation auditing.

-- =============================================================================
-- 1. workspaces schema additions
-- =============================================================================

alter table public.workspaces
  add column if not exists color varchar(32) null default 'oklch(0.55 0.12 160)',
  add column if not exists description text null,
  add column if not exists archived_at timestamptz null;

-- Invariant: Personal workspace cannot be archived
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_workspaces_personal_not_archived'
  ) then
    alter table public.workspaces
      add constraint chk_workspaces_personal_not_archived
      check (workspace_type <> 'PERSONAL' or archived_at is null);
  end if;
end $$;

-- =============================================================================
-- 2. workspace_members schema additions
-- =============================================================================

alter table public.workspace_members
  add column if not exists status varchar(16) not null default 'ACTIVE',
  add column if not exists invited_by uuid null references public.user_accounts(user_id) on delete set null,
  add column if not exists last_active_at timestamptz null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_workspace_members_status'
  ) then
    alter table public.workspace_members
      add constraint chk_workspace_members_status check (status in ('ACTIVE', 'SUSPENDED'));
  end if;
end $$;

create index if not exists idx_workspace_members_ws_status_role
  on public.workspace_members(workspace_id, status, role);

-- =============================================================================
-- 3. workspace_invitations table
-- =============================================================================

create table if not exists public.workspace_invitations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  code_hash     varchar(128) not null unique,
  code_prefix   varchar(16) not null,
  role          varchar(16) not null default 'USER',
  created_by    uuid not null references public.user_accounts(user_id) on delete restrict,
  label         varchar(128) null,
  max_uses      integer not null default 1,
  uses_count    integer not null default 0,
  expires_at    timestamptz not null,
  revoked_at    timestamptz null,
  created_at    timestamptz not null default now(),
  constraint chk_workspace_invites_role check (role in ('USER', 'MANAGER')),
  constraint chk_workspace_invites_max_uses check (max_uses between 1 and 100),
  constraint chk_workspace_invites_uses check (uses_count <= max_uses)
);

create index if not exists idx_workspace_invites_ws_created
  on public.workspace_invitations(workspace_id, created_at desc);

create index if not exists idx_workspace_invites_hash
  on public.workspace_invitations(code_hash);

alter table public.workspace_invitations enable row level security;
revoke all on public.workspace_invitations from public, anon;
grant select, insert, update on public.workspace_invitations to authenticated;

-- Invites RLS: Workspace managers can select, insert, and update/revoke invites
drop policy if exists invites_manager_select on public.workspace_invitations;
create policy invites_manager_select on public.workspace_invitations
  for select to authenticated
  using (public.is_workspace_manager(workspace_id));

drop policy if exists invites_manager_insert on public.workspace_invitations;
create policy invites_manager_insert on public.workspace_invitations
  for insert to authenticated
  with check (public.is_workspace_manager(workspace_id) and created_by = (select auth.uid()));

drop policy if exists invites_manager_update on public.workspace_invitations;
create policy invites_manager_update on public.workspace_invitations
  for update to authenticated
  using (public.is_workspace_manager(workspace_id))
  with check (public.is_workspace_manager(workspace_id));

-- =============================================================================
-- 4. Invariant triggers: Last Manager Protection (ADR-036)
-- =============================================================================

-- ADR-036 & M12: a workspace may never lose, demote, or suspend its final active MANAGER.
create or replace function public.check_last_manager_protection()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  remaining integer;
begin
  if old.role = 'MANAGER' and old.status = 'ACTIVE' and (
       tg_op = 'DELETE'
       or new.role <> 'MANAGER'
       or new.status <> 'ACTIVE'
       or new.workspace_id <> old.workspace_id
     ) then
    if tg_op = 'DELETE' and not exists (
      select 1 from public.workspaces w where w.id = old.workspace_id
    ) then
      return old; -- workspace itself is being deleted (cascade)
    end if;

    select count(*) into remaining from public.workspace_members m
     where m.workspace_id = old.workspace_id
       and m.role = 'MANAGER'
       and m.status = 'ACTIVE'
       and m.id <> old.id;

    if remaining = 0 then
      raise exception 'CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER'
        using errcode = 'P0001', detail = 'A workspace must keep at least one active MANAGER.';
    end if;
  end if;
  return coalesce(new, old);
end; $$;

-- Re-attach trigger if needed
drop trigger if exists trg_protect_last_manager on public.workspace_members;
create trigger trg_protect_last_manager
  before delete or update on public.workspace_members
  for each row execute function public.check_last_manager_protection();

-- =============================================================================
-- 5. Updated Membership & Manager Predicates (Status-Aware)
-- =============================================================================

create or replace function public.is_workspace_member(ws_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.session_is_active() and exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws_id
      and m.user_id = (select auth.uid())
      and m.status = 'ACTIVE');
$$;

create or replace function public.is_workspace_manager(ws_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.session_is_active() and exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws_id
      and m.user_id = (select auth.uid())
      and m.role = 'MANAGER'
      and m.status = 'ACTIVE');
$$;

create or replace function app.user_is_member(ws_id uuid, target_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws_id
      and m.user_id = target_user
      and m.status = 'ACTIVE');
$$;

-- =============================================================================
-- 6. Domain RPCs
-- =============================================================================

-- 6.1 rpc_create_workspace
drop function if exists public.rpc_create_workspace(text);
create or replace function public.rpc_create_workspace(
  p_name text,
  p_color text default 'oklch(0.55 0.12 160)',
  p_description text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  ws uuid;
  uid uuid := (select auth.uid());
  clean_slug text;
  clean_name text;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  clean_name := trim(coalesce(p_name, ''));
  if length(clean_name) = 0 then
    raise exception 'INVALID_WORKSPACE_NAME' using errcode = '22023';
  end if;

  clean_slug := lower(regexp_replace(clean_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 8);

  insert into public.workspaces (name, slug, workspace_type, color, description, created_by)
  values (clean_name, clean_slug, 'SHARED', coalesce(p_color, 'oklch(0.55 0.12 160)'), p_description, uid)
  returning id into ws;

  insert into public.workspace_members (workspace_id, user_id, role, status)
  values (ws, uid, 'MANAGER', 'ACTIVE');

  insert into public.audit_events (
    workspace_id, actor_id, target_user_id, target_entity_type, target_entity_id, action, metadata
  ) values (
    ws, uid, uid, 'workspace', ws, 'workspace.created',
    jsonb_build_object('name', clean_name, 'type', 'SHARED')
  );

  return ws;
end; $$;

revoke all on function public.rpc_create_workspace(text, text, text) from public, anon;
grant execute on function public.rpc_create_workspace(text, text, text) to authenticated;

-- 6.2 rpc_update_workspace
create or replace function public.rpc_update_workspace(
  p_workspace_id uuid,
  p_name text,
  p_color text default null,
  p_description text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  clean_name text;
begin
  if uid is null or not public.is_workspace_manager(p_workspace_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  clean_name := trim(coalesce(p_name, ''));
  if length(clean_name) = 0 then
    raise exception 'INVALID_WORKSPACE_NAME' using errcode = '22023';
  end if;

  update public.workspaces
     set name = clean_name,
         color = coalesce(p_color, color),
         description = p_description,
         updated_at = now()
   where id = p_workspace_id;

  insert into public.audit_events (
    workspace_id, actor_id, target_user_id, target_entity_type, target_entity_id, action, metadata
  ) values (
    p_workspace_id, uid, uid, 'workspace', p_workspace_id, 'workspace.updated',
    jsonb_build_object('name', clean_name, 'color', p_color)
  );

  return true;
end; $$;

revoke all on function public.rpc_update_workspace(uuid, text, text, text) from public, anon;
grant execute on function public.rpc_update_workspace(uuid, text, text, text) to authenticated;

-- 6.3 rpc_archive_workspace
create or replace function public.rpc_archive_workspace(p_workspace_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  ws_type varchar(16);
begin
  if uid is null or not public.is_workspace_manager(p_workspace_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select workspace_type into ws_type from public.workspaces where id = p_workspace_id;
  if ws_type = 'PERSONAL' then
    raise exception 'CANNOT_ARCHIVE_PERSONAL_WORKSPACE' using errcode = 'P0001';
  end if;

  update public.workspaces
     set archived_at = now(),
         updated_at = now()
   where id = p_workspace_id;

  insert into public.audit_events (
    workspace_id, actor_id, target_user_id, target_entity_type, target_entity_id, action, metadata
  ) values (
    p_workspace_id, uid, uid, 'workspace', p_workspace_id, 'workspace.archived',
    jsonb_build_object('archived_at', now())
  );

  return true;
end; $$;

revoke all on function public.rpc_archive_workspace(uuid) from public, anon;
grant execute on function public.rpc_archive_workspace(uuid) to authenticated;

-- 6.4 rpc_list_workspace_members_detailed
create or replace function public.rpc_list_workspace_members_detailed(p_workspace_id uuid)
returns table (
  member_id uuid,
  user_id uuid,
  role text,
  status text,
  username text,
  display_name text,
  joined_at timestamptz,
  last_active_at timestamptz,
  applications_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.is_workspace_manager(p_workspace_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  return query
    select
      m.id as member_id,
      m.user_id,
      m.role::text,
      m.status::text,
      u.username::text,
      p.display_name::text,
      m.joined_at,
      m.last_active_at,
      count(a.id)::bigint as applications_count
    from public.workspace_members m
    join public.user_accounts u on u.user_id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
    left join public.applications a on a.workspace_id = m.workspace_id and a.user_id = m.user_id
    where m.workspace_id = p_workspace_id
    group by m.id, m.user_id, m.role, m.status, u.username, p.display_name, m.joined_at, m.last_active_at
    order by
      case when m.role = 'MANAGER' then 0 else 1 end,
      lower(coalesce(p.display_name, u.username));
end; $$;

revoke all on function public.rpc_list_workspace_members_detailed(uuid) from public, anon;
grant execute on function public.rpc_list_workspace_members_detailed(uuid) to authenticated;

-- 6.5 rpc_update_member_role
create or replace function public.rpc_update_member_role(
  p_workspace_id uuid,
  p_target_user_id uuid,
  p_new_role text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  target_member record;
begin
  if uid is null or not public.is_workspace_manager(p_workspace_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if p_new_role not in ('USER', 'MANAGER') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;

  select id, role into target_member
    from public.workspace_members
   where workspace_id = p_workspace_id and user_id = p_target_user_id;

  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if target_member.role = p_new_role then
    return true; -- no change
  end if;

  -- Update triggers trg_protect_last_manager if demoting sole manager
  update public.workspace_members
     set role = p_new_role
   where id = target_member.id;

  insert into public.audit_events (
    workspace_id, actor_id, target_user_id, target_entity_type, target_entity_id, action, metadata
  ) values (
    p_workspace_id, uid, p_target_user_id, 'workspace_member', target_member.id, 'member.role_changed',
    jsonb_build_object('old_role', target_member.role, 'new_role', p_new_role)
  );

  return true;
end; $$;

revoke all on function public.rpc_update_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.rpc_update_member_role(uuid, uuid, text) to authenticated;

-- 6.6 rpc_update_member_status
create or replace function public.rpc_update_member_status(
  p_workspace_id uuid,
  p_target_user_id uuid,
  p_new_status text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  target_member record;
begin
  if uid is null or not public.is_workspace_manager(p_workspace_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if p_new_status not in ('ACTIVE', 'SUSPENDED') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;

  select id, status into target_member
    from public.workspace_members
   where workspace_id = p_workspace_id and user_id = p_target_user_id;

  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if target_member.status = p_new_status then
    return true;
  end if;

  -- Update triggers trg_protect_last_manager if suspending sole active manager
  update public.workspace_members
     set status = p_new_status
   where id = target_member.id;

  insert into public.audit_events (
    workspace_id, actor_id, target_user_id, target_entity_type, target_entity_id, action, metadata
  ) values (
    p_workspace_id, uid, p_target_user_id, 'workspace_member', target_member.id, 'member.status_changed',
    jsonb_build_object('old_status', target_member.status, 'new_status', p_new_status)
  );

  return true;
end; $$;

revoke all on function public.rpc_update_member_status(uuid, uuid, text) from public, anon;
grant execute on function public.rpc_update_member_status(uuid, uuid, text) to authenticated;

-- 6.7 rpc_remove_workspace_member (ADR-037)
create or replace function public.rpc_remove_workspace_member(
  p_workspace_id uuid,
  p_target_user_id uuid
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  target_member record;
begin
  if uid is null or not public.is_workspace_manager(p_workspace_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select id, role into target_member
    from public.workspace_members
   where workspace_id = p_workspace_id and user_id = p_target_user_id;

  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Deletion triggers trg_protect_last_manager if target is sole active manager
  delete from public.workspace_members
   where id = target_member.id;

  insert into public.audit_events (
    workspace_id, actor_id, target_user_id, target_entity_type, target_entity_id, action, metadata
  ) values (
    p_workspace_id, uid, p_target_user_id, 'workspace_member', target_member.id, 'member.removed',
    jsonb_build_object('removed_user_id', p_target_user_id, 'role', target_member.role)
  );

  return true;
end; $$;

revoke all on function public.rpc_remove_workspace_member(uuid, uuid) from public, anon;
grant execute on function public.rpc_remove_workspace_member(uuid, uuid) to authenticated;

-- 6.8 rpc_leave_workspace
create or replace function public.rpc_leave_workspace(p_workspace_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  ws_type varchar(16);
  target_member record;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select workspace_type into ws_type from public.workspaces where id = p_workspace_id;
  if ws_type = 'PERSONAL' then
    raise exception 'CANNOT_LEAVE_PERSONAL_WORKSPACE' using errcode = 'P0001';
  end if;

  select id, role into target_member
    from public.workspace_members
   where workspace_id = p_workspace_id and user_id = uid;

  if not found then
    raise exception 'NOT_A_MEMBER' using errcode = 'P0002';
  end if;

  -- Deletion triggers trg_protect_last_manager if caller is sole active manager
  delete from public.workspace_members
   where id = target_member.id;

  insert into public.audit_events (
    workspace_id, actor_id, target_user_id, target_entity_type, target_entity_id, action, metadata
  ) values (
    p_workspace_id, uid, uid, 'workspace_member', target_member.id, 'member.left',
    jsonb_build_object('user_id', uid, 'role', target_member.role)
  );

  return true;
end; $$;

revoke all on function public.rpc_leave_workspace(uuid) from public, anon;
grant execute on function public.rpc_leave_workspace(uuid) to authenticated;

-- 6.9 rpc_create_workspace_invitation
create or replace function public.rpc_create_workspace_invitation(
  p_workspace_id uuid,
  p_role text default 'USER',
  p_max_uses integer default 10,
  p_expires_days integer default 7,
  p_label text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  raw_code text;
  prefix text;
  hash_val text;
  expires timestamptz;
  inv_id uuid;
begin
  if uid is null or not public.is_workspace_manager(p_workspace_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if p_role not in ('USER', 'MANAGER') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;

  if p_max_uses < 1 or p_max_uses > 100 then
    raise exception 'INVALID_MAX_USES' using errcode = '22023';
  end if;

  if p_expires_days < 1 or p_expires_days > 30 then
    raise exception 'INVALID_EXPIRY_DAYS' using errcode = '22023';
  end if;

  -- Generate 8-character high entropy code: JQI-<4chars>-<4chars>
  raw_code := 'JQI-' || upper(substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 4))
                     || '-' || upper(substr(md5(clock_timestamp()::text || random()::text || gen_random_uuid()::text), 5, 4));
  prefix := 'JQI-••••-' || right(raw_code, 4);
  hash_val := encode(sha256(raw_code::bytea), 'hex');
  expires := now() + (p_expires_days || ' days')::interval;

  insert into public.workspace_invitations (
    workspace_id, code_hash, code_prefix, role, created_by, label, max_uses, expires_at
  ) values (
    p_workspace_id, hash_val, prefix, p_role, uid, p_label, p_max_uses, expires
  ) returning id into inv_id;

  insert into public.audit_events (
    workspace_id, actor_id, target_user_id, target_entity_type, target_entity_id, action, metadata
  ) values (
    p_workspace_id, uid, uid, 'workspace_invitation', inv_id, 'invitation.created',
    jsonb_build_object('prefix', prefix, 'role', p_role, 'max_uses', p_max_uses, 'label', p_label)
  );

  return jsonb_build_object(
    'id', inv_id,
    'code', raw_code,
    'prefix', prefix,
    'role', p_role,
    'max_uses', p_max_uses,
    'expires_at', expires,
    'label', p_label
  );
end; $$;

revoke all on function public.rpc_create_workspace_invitation(uuid, text, integer, integer, text) from public, anon;
grant execute on function public.rpc_create_workspace_invitation(uuid, text, integer, integer, text) to authenticated;

-- 6.10 rpc_revoke_workspace_invitation
create or replace function public.rpc_revoke_workspace_invitation(p_invitation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  inv record;
begin
  select id, workspace_id, code_prefix into inv
    from public.workspace_invitations
   where id = p_invitation_id and revoked_at is null;

  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if uid is null or not public.is_workspace_manager(inv.workspace_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  update public.workspace_invitations
     set revoked_at = now()
   where id = inv.id;

  insert into public.audit_events (
    workspace_id, actor_id, target_user_id, target_entity_type, target_entity_id, action, metadata
  ) values (
    inv.workspace_id, uid, uid, 'workspace_invitation', inv.id, 'invitation.revoked',
    jsonb_build_object('prefix', inv.code_prefix)
  );

  return true;
end; $$;

revoke all on function public.rpc_revoke_workspace_invitation(uuid) from public, anon;
grant execute on function public.rpc_revoke_workspace_invitation(uuid) to authenticated;

-- 6.11 rpc_preview_workspace_invitation
create or replace function public.rpc_preview_workspace_invitation(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  clean_code text;
  hash_val text;
  inv record;
  ws record;
  mgr_names text[];
  already_member boolean;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  clean_code := upper(trim(coalesce(p_code, '')));
  if length(clean_code) = 0 then
    raise exception 'INVALID_INVITE_CODE' using errcode = '22023';
  end if;

  hash_val := encode(sha256(clean_code::bytea), 'hex');

  select * into inv from public.workspace_invitations where code_hash = hash_val;
  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if inv.revoked_at is not null then
    raise exception 'INVITATION_REVOKED' using errcode = 'P0003';
  end if;

  if inv.expires_at <= now() then
    raise exception 'INVITATION_EXPIRED' using errcode = 'P0003';
  end if;

  if inv.uses_count >= inv.max_uses then
    raise exception 'INVITATION_EXHAUSTED' using errcode = 'P0003';
  end if;

  select id, name, color, description into ws from public.workspaces where id = inv.workspace_id;

  select coalesce(array_agg(coalesce(p.display_name, u.username)), array[]::text[])
    into mgr_names
    from public.workspace_members wm
    join public.user_accounts u on u.user_id = wm.user_id
    left join public.profiles p on p.user_id = wm.user_id
   where wm.workspace_id = ws.id
     and wm.role = 'MANAGER'
     and wm.status = 'ACTIVE';

  select exists (
    select 1 from public.workspace_members
     where workspace_id = ws.id and user_id = uid and status = 'ACTIVE'
  ) into already_member;

  return jsonb_build_object(
    'workspace_id', ws.id,
    'workspace_name', ws.name,
    'color', coalesce(ws.color, 'oklch(0.55 0.12 160)'),
    'description', ws.description,
    'role', inv.role,
    'managers', mgr_names,
    'is_already_member', already_member
  );
end; $$;

revoke all on function public.rpc_preview_workspace_invitation(text) from public, anon;
grant execute on function public.rpc_preview_workspace_invitation(text) to authenticated;

-- 6.12 rpc_join_workspace
create or replace function public.rpc_join_workspace(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  clean_code text;
  hash_val text;
  inv record;
  existing_member record;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  clean_code := upper(trim(coalesce(p_code, '')));
  if length(clean_code) = 0 then
    raise exception 'INVALID_INVITE_CODE' using errcode = '22023';
  end if;

  hash_val := encode(sha256(clean_code::bytea), 'hex');

  -- Lock invitation row to prevent concurrent race condition on uses_count
  select * into inv from public.workspace_invitations where code_hash = hash_val for update;
  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if inv.revoked_at is not null then
    raise exception 'INVITATION_REVOKED' using errcode = 'P0003';
  end if;

  if inv.expires_at <= now() then
    raise exception 'INVITATION_EXPIRED' using errcode = 'P0003';
  end if;

  if inv.uses_count >= inv.max_uses then
    raise exception 'INVITATION_EXHAUSTED' using errcode = 'P0003';
  end if;

  -- Check existing membership
  select id, status into existing_member
    from public.workspace_members
   where workspace_id = inv.workspace_id and user_id = uid;

  if found then
    if existing_member.status = 'ACTIVE' then
      raise exception 'ALREADY_WORKSPACE_MEMBER' using errcode = 'P0004';
    else
      raise exception 'MEMBERSHIP_SUSPENDED' using errcode = 'P0004';
    end if;
  end if;

  -- Increment uses_count atomically
  update public.workspace_invitations
     set uses_count = uses_count + 1
   where id = inv.id;

  -- Insert membership
  insert into public.workspace_members (
    workspace_id, user_id, role, status, invited_by
  ) values (
    inv.workspace_id, uid, inv.role, 'ACTIVE', inv.created_by
  );

  insert into public.audit_events (
    workspace_id, actor_id, target_user_id, target_entity_type, target_entity_id, action, metadata
  ) values (
    inv.workspace_id, uid, uid, 'workspace_member', uid, 'member.joined',
    jsonb_build_object('role', inv.role, 'invited_by', inv.created_by)
  );

  return inv.workspace_id;
end; $$;

revoke all on function public.rpc_join_workspace(text) from public, anon;
grant execute on function public.rpc_join_workspace(text) to authenticated;

-- 6.13 rpc_list_workspace_audit_events
create or replace function public.rpc_list_workspace_audit_events(
  p_workspace_id uuid,
  p_limit integer default 50
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
    order by a.created_at desc
    limit coalesce(p_limit, 50);
end; $$;

revoke all on function public.rpc_list_workspace_audit_events(uuid, integer) from public, anon;
grant execute on function public.rpc_list_workspace_audit_events(uuid, integer) to authenticated;
