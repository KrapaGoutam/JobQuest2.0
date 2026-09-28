-- =============================================================================
-- JobQuest 2.0 · M1 Foundation (architecture spike)
-- Scope: exactly the 7 approved M1 tables (Gate 03 TARGET_SCHEMA.md / M1_SPIKE_PLAN.md)
--   1 user_accounts  2 profiles  3 auth_recovery_codes  4 workspaces
--   5 workspace_members  6 applications  7 workflow_definitions
-- Plus minimal supporting functions, triggers and RLS policies.
-- Primary keys: UUIDv4 via gen_random_uuid() (ADR-031).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. user_accounts  (SYSTEM / SECURITY — Node façade + service role only)
--    Option A: passwords are owned by Supabase Auth. NO password hash here.
-- -----------------------------------------------------------------------------
create table public.user_accounts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null unique references auth.users(id) on delete cascade,
  username               varchar(32) not null,
  username_clean         varchar(32) not null unique,
  status                 varchar(16) not null default 'ACTIVE',
  failed_login_count     integer not null default 0,
  locked_until           timestamptz null,
  -- M1 deviation (documented): recovery-attempt lockout needs its own durable counter.
  failed_recovery_count  integer not null default 0,
  recovery_locked_until  timestamptz null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint chk_username_format check (username ~ '^[a-zA-Z0-9_.-]{3,32}$'),
  constraint chk_username_clean check (username_clean = lower(username)),
  constraint chk_account_status check (status in ('ACTIVE', 'STAGED', 'SUSPENDED'))
);

-- -----------------------------------------------------------------------------
-- 2. profiles  (OWNER PRIVATE)
-- -----------------------------------------------------------------------------
create table public.profiles (
  user_id                  uuid primary key references public.user_accounts(user_id) on delete cascade,
  display_name             varchar(128) null,
  email                    varchar(255) null,   -- optional notification email (never a login id)
  phone                    varchar(32)  null,   -- optional
  timezone                 varchar(64) not null default 'UTC',
  week_start               smallint not null default 1,
  theme_preference         varchar(16) not null default 'system',
  preview_pane_open        boolean not null default true,
  last_active_workspace_id uuid null,           -- UX context only, never authorization
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint chk_profiles_theme check (theme_preference in ('system', 'light', 'dark')),
  constraint chk_profiles_week_start check (week_start in (0, 1)),
  constraint chk_profiles_email check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- -----------------------------------------------------------------------------
-- 3. auth_recovery_codes  (SYSTEM / SECURITY)
--    Stores ONLY Argon2id verifiers. Raw codes are shown once by the façade.
-- -----------------------------------------------------------------------------
create table public.auth_recovery_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.user_accounts(user_id) on delete cascade,
  code_hash   varchar(128) not null,
  code_hint   varchar(6) not null,
  is_used     boolean not null default false,
  used_at     timestamptz null,
  used_ip     inet null,
  created_at  timestamptz not null default now(),
  constraint uq_recovery_codes_user_hint unique (user_id, code_hint),
  constraint chk_recovery_used check ((is_used and used_at is not null) or (not is_used and used_at is null))
);
create index idx_recovery_codes_user on public.auth_recovery_codes(user_id) where is_used = false;

-- -----------------------------------------------------------------------------
-- 4. workspaces  (WORKSPACE SHARED)
-- -----------------------------------------------------------------------------
create table public.workspaces (
  id              uuid primary key default gen_random_uuid(),
  name            varchar(128) not null,
  slug            varchar(64) not null unique,
  workspace_type  varchar(16) not null default 'PERSONAL',
  created_by      uuid not null references public.user_accounts(user_id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint chk_workspaces_type check (workspace_type in ('PERSONAL', 'SHARED'))
);
-- exactly one personal workspace per user
create unique index uq_workspaces_one_personal on public.workspaces(created_by) where workspace_type = 'PERSONAL';

-- -----------------------------------------------------------------------------
-- 5. workspace_members  (WORKSPACE SHARED read / MANAGER write)
-- -----------------------------------------------------------------------------
create table public.workspace_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references public.user_accounts(user_id) on delete restrict,
  role          varchar(16) not null default 'USER',
  joined_at     timestamptz not null default now(),
  constraint uq_workspace_members_user unique (workspace_id, user_id),
  constraint chk_workspace_members_role check (role in ('USER', 'MANAGER'))
);
create index idx_workspace_members_user on public.workspace_members(user_id);

-- -----------------------------------------------------------------------------
-- 6. applications  (OWNER SCOPED / MANAGER OVERRIDE) — minimal M1 subset
-- -----------------------------------------------------------------------------
create table public.applications (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  user_id            uuid not null references public.user_accounts(user_id) on delete restrict,
  company_name       varchar(128) not null,
  role_title         varchar(128) not null,
  stage              varchar(32) not null default 'APPLIED',
  status             varchar(16) not null default 'OPEN',
  outcome            varchar(32) null,
  closure_reason     varchar(64) null,
  closed_at          timestamptz null,
  priority           varchar(16) not null default 'MEDIUM',
  next_action        varchar(255) null,
  next_action_date   date null,
  last_activity_at   timestamptz not null default now(),
  archived_at        timestamptz null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- ADR-032: composite tenant key for future child tables (job_snapshots, events, ...)
  constraint uq_applications_id_workspace unique (id, workspace_id),
  constraint chk_app_stage check (stage in (
    'SAVED', 'PREPARING', 'APPLIED', 'ASSESSMENT',
    'RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER')),
  constraint chk_app_status check (status in ('OPEN', 'CLOSED')),
  constraint chk_app_outcome check (
    (status = 'OPEN' and outcome is null) or
    (status = 'CLOSED' and outcome in ('ACCEPTED', 'REJECTED', 'WITHDRAWN', 'GHOSTED', 'POSITION_CLOSED'))),
  constraint chk_app_closure_reason check (
    outcome is distinct from 'WITHDRAWN' or closure_reason in (
      'OFFER_DECLINED', 'GENERAL_WITHDRAWAL', 'COMPENSATION_MISMATCH', 'LOCATION_UNSUITABLE', 'OTHER')),
  constraint chk_app_priority check (priority in ('LOW', 'MEDIUM', 'HIGH'))
);
create index idx_applications_ws_owner on public.applications(workspace_id, user_id);
create index idx_applications_ws_status_stage on public.applications(workspace_id, status, stage);

-- -----------------------------------------------------------------------------
-- 7. workflow_definitions  (DERIVED / READ ONLY for clients)
-- -----------------------------------------------------------------------------
create table public.workflow_definitions (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid null references public.workspaces(id) on delete cascade, -- NULL = system default
  is_default       boolean not null default false,
  version          integer not null default 1,
  stages           jsonb not null,
  outcomes         jsonb not null,
  closure_reasons  jsonb not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint uq_workflow_workspace unique (workspace_id),
  constraint chk_workflow_default check (is_default = (workspace_id is null))
);
-- UNIQUE(workspace_id) allows many NULLs; enforce a single system default explicitly.
create unique index uq_workflow_single_default on public.workflow_definitions((true)) where workspace_id is null;

-- =============================================================================
-- Authorization helpers (SECURITY DEFINER, pinned search_path, no recursion)
-- =============================================================================
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- Session liveness: a revoked session (logout / global sign-out) loses data access
-- immediately even though its access JWT is stateless until expiry.
create or replace function app.session_is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
      and s.user_id = (select auth.uid())
      and (s.not_after is null or s.not_after > now())
  );
$$;

create or replace function public.is_workspace_member(ws_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.session_is_active() and exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws_id and m.user_id = (select auth.uid()));
$$;

create or replace function public.is_workspace_manager(ws_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.session_is_active() and exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws_id and m.user_id = (select auth.uid()) and m.role = 'MANAGER');
$$;

create or replace function public.can_access_owned_record(ws_id uuid, record_owner_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (record_owner_id = (select auth.uid()) and public.is_workspace_member(ws_id))
      or public.is_workspace_manager(ws_id);
$$;

-- Is a given (other) user a member of the workspace? Used to stop managers creating
-- records owned by non-members. Only callable where the caller is a member.
create or replace function app.user_is_member(ws_id uuid, target_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members m
                 where m.workspace_id = ws_id and m.user_id = target_user);
$$;

revoke all on function app.session_is_active() from public;
revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.is_workspace_manager(uuid) from public;
revoke all on function public.can_access_owned_record(uuid, uuid) from public;
revoke all on function app.user_is_member(uuid, uuid) from public;
grant execute on function app.session_is_active() to authenticated, service_role;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.is_workspace_manager(uuid) to authenticated, service_role;
grant execute on function public.can_access_owned_record(uuid, uuid) to authenticated, service_role;
grant execute on function app.user_is_member(uuid, uuid) to authenticated, service_role;

-- =============================================================================
-- Triggers
-- =============================================================================
create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create trigger trg_user_accounts_updated before update on public.user_accounts for each row execute function app.touch_updated_at();
create trigger trg_profiles_updated      before update on public.profiles      for each row execute function app.touch_updated_at();
create trigger trg_workspaces_updated    before update on public.workspaces    for each row execute function app.touch_updated_at();
create trigger trg_applications_updated  before update on public.applications  for each row execute function app.touch_updated_at();

-- ADR-036: a workspace may never lose / demote its final MANAGER.
-- Allowed only when the whole workspace is being deleted (cascade).
create or replace function public.check_last_manager_protection()
returns trigger language plpgsql security definer set search_path = '' as $$
declare remaining integer;
begin
  if old.role = 'MANAGER' and (tg_op = 'DELETE' or new.role <> 'MANAGER'
                               or new.workspace_id <> old.workspace_id) then
    if tg_op = 'DELETE' and not exists (select 1 from public.workspaces w where w.id = old.workspace_id) then
      return old; -- workspace itself is being deleted
    end if;
    select count(*) into remaining from public.workspace_members m
     where m.workspace_id = old.workspace_id and m.role = 'MANAGER' and m.id <> old.id;
    if remaining = 0 then
      raise exception 'CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER'
        using errcode = 'P0001', detail = 'A workspace must keep at least one MANAGER.';
    end if;
  end if;
  return coalesce(new, old);
end; $$;

create trigger trg_protect_last_manager
  before delete or update on public.workspace_members
  for each row execute function public.check_last_manager_protection();

-- Membership rows are identity bindings: workspace_id / user_id are immutable.
create or replace function app.guard_member_identity()
returns trigger language plpgsql as $$
begin
  if new.workspace_id <> old.workspace_id or new.user_id <> old.user_id then
    raise exception 'MEMBERSHIP_IDENTITY_IMMUTABLE' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger trg_member_identity before update on public.workspace_members
  for each row execute function app.guard_member_identity();

-- Applications: tenant + owner are immutable after creation (mass-assignment guard, BL-016).
create or replace function app.guard_application_tenant()
returns trigger language plpgsql as $$
begin
  if new.workspace_id <> old.workspace_id or new.user_id <> old.user_id then
    raise exception 'APPLICATION_TENANT_IMMUTABLE' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger trg_application_tenant before update on public.applications
  for each row execute function app.guard_application_tenant();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.user_accounts        enable row level security;
alter table public.profiles             enable row level security;
alter table public.auth_recovery_codes  enable row level security;
alter table public.workspaces           enable row level security;
alter table public.workspace_members    enable row level security;
alter table public.applications         enable row level security;
alter table public.workflow_definitions enable row level security;

-- SYSTEM / SECURITY tables: no policies at all + no grants → PostgREST cannot reach them.
revoke all on public.user_accounts       from anon, authenticated;
revoke all on public.auth_recovery_codes from anon, authenticated;

-- Anonymous callers get nothing anywhere; authenticated gets only what each policy needs
-- (Supabase default privileges would otherwise grant ALL on new public tables).
revoke all on public.profiles, public.workspaces, public.workspace_members,
              public.applications, public.workflow_definitions from anon, authenticated;

-- profiles: OWNER PRIVATE
grant select, update on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) and app.session_is_active());
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid()) and app.session_is_active())
  with check (user_id = (select auth.uid()));

-- workspaces: members read, managers update, creation via RPC only
grant select, update on public.workspaces to authenticated;
create policy workspaces_select_member on public.workspaces for select to authenticated
  using (public.is_workspace_member(id));
create policy workspaces_update_manager on public.workspaces for update to authenticated
  using (public.is_workspace_manager(id)) with check (public.is_workspace_manager(id));

-- workspace_members: members read; managers insert/update/delete (last-manager trigger applies)
grant select, insert, update, delete on public.workspace_members to authenticated;
create policy members_select_member on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy members_insert_manager on public.workspace_members for insert to authenticated
  with check (public.is_workspace_manager(workspace_id));
create policy members_update_manager on public.workspace_members for update to authenticated
  using (public.is_workspace_manager(workspace_id)) with check (public.is_workspace_manager(workspace_id));
create policy members_delete_manager on public.workspace_members for delete to authenticated
  using (public.is_workspace_manager(workspace_id));

-- applications: owner in workspace OR manager of workspace. No DELETE (archive-first; hard delete = future audited RPC).
grant select, insert, update on public.applications to authenticated;
create policy applications_select on public.applications for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));
create policy applications_insert on public.applications for insert to authenticated
  with check (
    (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id))
    or (public.is_workspace_manager(workspace_id) and app.user_is_member(workspace_id, user_id)));
create policy applications_update on public.applications for update to authenticated
  using (public.can_access_owned_record(workspace_id, user_id))
  with check (public.can_access_owned_record(workspace_id, user_id));

-- workflow_definitions: read-only for clients (system default + own workspaces)
grant select on public.workflow_definitions to authenticated;
create policy workflow_select on public.workflow_definitions for select to authenticated
  using (app.session_is_active() and (workspace_id is null or public.is_workspace_member(workspace_id)));

-- =============================================================================
-- RPCs
-- =============================================================================

-- Registration bootstrap — called ONLY by the Node façade (service role) after the
-- Supabase Auth identity exists. One transaction: account, profile, personal workspace,
-- MANAGER membership, 10 recovery-code verifiers.
create or replace function public.rpc_bootstrap_account(
  p_user_id uuid, p_username text, p_display_name text, p_email text, p_phone text,
  p_code_hashes text[], p_code_hints text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  if coalesce(array_length(p_code_hashes, 1), 0) <> 10 or coalesce(array_length(p_code_hints, 1), 0) <> 10 then
    raise exception 'RECOVERY_CODE_SET_MUST_BE_10' using errcode = 'P0001';
  end if;
  insert into public.user_accounts(user_id, username, username_clean)
    values (p_user_id, p_username, lower(p_username));
  insert into public.profiles(user_id, display_name, email, phone)
    values (p_user_id, coalesce(nullif(p_display_name, ''), p_username), nullif(p_email, ''), nullif(p_phone, ''));
  insert into public.workspaces(name, slug, workspace_type, created_by)
    values ('Personal', 'personal-' || replace(gen_random_uuid()::text, '-', ''), 'PERSONAL', p_user_id)
    returning id into ws;
  insert into public.workspace_members(workspace_id, user_id, role) values (ws, p_user_id, 'MANAGER');
  insert into public.auth_recovery_codes(user_id, code_hash, code_hint)
    select p_user_id, h, t from unnest(p_code_hashes, p_code_hints) as x(h, t);
  update public.profiles set last_active_workspace_id = ws where user_id = p_user_id;
  return ws;
end; $$;

-- Replace the recovery-code set atomically (regeneration invalidates every old code).
create or replace function public.rpc_replace_recovery_codes(
  p_user_id uuid, p_code_hashes text[], p_code_hints text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(array_length(p_code_hashes, 1), 0) <> 10 then
    raise exception 'RECOVERY_CODE_SET_MUST_BE_10' using errcode = 'P0001';
  end if;
  delete from public.auth_recovery_codes where user_id = p_user_id;
  insert into public.auth_recovery_codes(user_id, code_hash, code_hint)
    select p_user_id, h, t from unnest(p_code_hashes, p_code_hints) as x(h, t);
end; $$;

revoke all on function public.rpc_bootstrap_account(uuid, text, text, text, text, text[], text[]) from public, anon, authenticated;
revoke all on function public.rpc_replace_recovery_codes(uuid, text[], text[]) from public, anon, authenticated;
grant execute on function public.rpc_bootstrap_account(uuid, text, text, text, text, text[], text[]) to service_role;
grant execute on function public.rpc_replace_recovery_codes(uuid, text[], text[]) to service_role;

-- Create a SHARED workspace; caller becomes its MANAGER (atomic).
create or replace function public.rpc_create_workspace(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ws uuid; uid uuid := (select auth.uid());
begin
  if uid is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'NAME_REQUIRED' using errcode = '22023'; end if;
  insert into public.workspaces(name, slug, workspace_type, created_by)
    values (trim(p_name), 'ws-' || replace(gen_random_uuid()::text, '-', ''), 'SHARED', uid)
    returning id into ws;
  insert into public.workspace_members(workspace_id, user_id, role) values (ws, uid, 'MANAGER');
  return ws;
end; $$;
revoke all on function public.rpc_create_workspace(text) from public, anon;
grant execute on function public.rpc_create_workspace(text) to authenticated;

-- =============================================================================
-- Custom Access Token Hook — keeps the internal alias identity OUT of JWT claims.
-- (Supported Supabase Auth hook; runs before a token is issued.)
-- =============================================================================
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare claims jsonb := event -> 'claims';
begin
  claims := jsonb_set(claims, '{email}', to_jsonb(''::text));
  claims := jsonb_set(claims, '{phone}', to_jsonb(''::text));
  claims := jsonb_set(claims, '{user_metadata}', '{}'::jsonb);
  if claims ? 'app_metadata' then
    claims := jsonb_set(claims, '{app_metadata}', jsonb_build_object('provider', 'jobquest'));
  end if;
  return jsonb_set(event, '{claims}', claims);
end; $$;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- =============================================================================
-- Canonical workflow seed (system default). Values mirror the applications CHECKs.
-- =============================================================================
insert into public.workflow_definitions(workspace_id, is_default, version, stages, outcomes, closure_reasons)
values (null, true, 1,
  '[{"id":"SAVED","label":"Saved","order":1,"legacy":"Saved"},
    {"id":"PREPARING","label":"Preparing","order":2,"legacy":"Preparing"},
    {"id":"APPLIED","label":"Applied","order":3,"legacy":"Applied"},
    {"id":"ASSESSMENT","label":"Assessment","order":4,"legacy":"Assessment"},
    {"id":"RECRUITER_SCREEN","label":"Recruiter Screen","order":5,"legacy":"Recruiter Screen"},
    {"id":"INTERVIEW","label":"Interview","order":6,"legacy":"Interview"},
    {"id":"FINAL_INTERVIEW","label":"Final Interview","order":7,"legacy":"Final Interview"},
    {"id":"OFFER","label":"Offer","order":8,"legacy":"Offer"}]'::jsonb,
  '[{"id":"ACCEPTED","label":"Accepted","terminal_state":"CLOSED","legacy":"Accepted"},
    {"id":"REJECTED","label":"Rejected","terminal_state":"CLOSED","legacy":"Rejected"},
    {"id":"WITHDRAWN","label":"Withdrawn","terminal_state":"CLOSED","legacy":"Withdrawn"},
    {"id":"GHOSTED","label":"Ghosted","terminal_state":"CLOSED","legacy":"Ghosted"},
    {"id":"POSITION_CLOSED","label":"Position Closed","terminal_state":"CLOSED","legacy":"Position Closed"}]'::jsonb,
  '[{"id":"OFFER_DECLINED","label":"Offer declined","for_outcome":"WITHDRAWN"},
    {"id":"GENERAL_WITHDRAWAL","label":"Withdrew","for_outcome":"WITHDRAWN"},
    {"id":"COMPENSATION_MISMATCH","label":"Compensation mismatch","for_outcome":"WITHDRAWN"},
    {"id":"LOCATION_UNSUITABLE","label":"Location unsuitable","for_outcome":"WITHDRAWN"},
    {"id":"OTHER","label":"Other","for_outcome":"WITHDRAWN"}]'::jsonb);
