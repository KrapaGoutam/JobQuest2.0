-- =============================================================================
-- Migration: 20260925100000_m4_closeout_integrity.sql
-- Milestone 4 closeout: additive integrity, least-privilege and audit fixes found
-- in the M4 final consistency audit. 20260924400000 is already applied and is
-- NOT edited; everything here is additive or a CREATE OR REPLACE of an M4 RPC.
--
--  1. Least privilege. 20260924400000 revoked only from public/anon, so
--     `authenticated` kept Supabase's default TRUNCATE/REFERENCES/TRIGGER (and
--     DELETE/UPDATE where not intended). TRUNCATE ignores RLS. Final grants:
--       companies            SELECT, INSERT, UPDATE        (no hard delete)
--       contacts             SELECT, INSERT, UPDATE        (archive-first; no hard delete)
--       contact_interactions SELECT                        (append-only; written by RPC)
--       application_contacts SELECT, INSERT, DELETE        (a link, not a record)
--  2. Archive-first: direct hard DELETE of contacts and companies is denied;
--     contact interactions are append-only.
--  3. Composite tenant FKs for company references (applications, contacts), so a
--     record can never point at another workspace's company.
--  4. Contact guard: workspace/owner immutable for direct clients; archive state
--     changes only through rpc_archive_contact / rpc_restore_contact.
--  5. contact_interactions visibility follows the parent contact (an interaction a
--     MANAGER logs on a member's contact is visible to that member).
--  6. rpc_unlink_application_contact requires access to the application (a peer
--     in the same workspace could previously unlink another member's contact).
--  7. audit_events (Gate 03 TARGET_SCHEMA #25) + a SECURITY DEFINER trigger that
--     records every cross-user mutation (actor <> record owner) of applications,
--     job_snapshots, contacts, contact_interactions and application_contacts, in
--     the same transaction as the mutation. Reads are NOT audited (deferred; see
--     M4 report). audit_events is SYSTEM/SECURITY: no client privileges at all.
--  8. updated_at maintenance for companies and contacts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 + 2. Least privilege, archive-first, append-only interactions
-- -----------------------------------------------------------------------------
revoke all on public.companies, public.contacts, public.contact_interactions, public.application_contacts
  from public, anon, authenticated;

grant select, insert, update on public.companies to authenticated;
grant select, insert, update on public.contacts to authenticated;
grant select on public.contact_interactions to authenticated;
grant select, insert, delete on public.application_contacts to authenticated;

drop policy if exists companies_delete on public.companies;
drop policy if exists contacts_delete on public.contacts;
drop policy if exists contact_interactions_insert on public.contact_interactions;
drop policy if exists contact_interactions_update on public.contact_interactions;
drop policy if exists contact_interactions_delete on public.contact_interactions;

-- 5. Interaction visibility follows the parent contact.
drop policy if exists contact_interactions_select on public.contact_interactions;
create policy contact_interactions_select on public.contact_interactions for select to authenticated
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_interactions.contact_id
        and c.workspace_id = contact_interactions.workspace_id
        and public.can_access_owned_record(c.workspace_id, c.user_id)
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Composite tenant FKs for company references
-- -----------------------------------------------------------------------------
alter table public.applications drop constraint if exists applications_company_id_fkey;
alter table public.applications
  add constraint fk_applications_company foreign key (company_id, workspace_id)
  references public.companies(id, workspace_id) on delete set null (company_id);

alter table public.contacts drop constraint if exists contacts_company_id_fkey;
alter table public.contacts
  add constraint fk_contacts_company foreign key (company_id, workspace_id)
  references public.companies(id, workspace_id) on delete set null (company_id);

-- -----------------------------------------------------------------------------
-- 4. Contact / company guards (direct Data API writes only)
-- -----------------------------------------------------------------------------
create or replace function app.guard_contact_integrity()
returns trigger language plpgsql as $$
begin
  -- SECURITY DEFINER RPCs run as the function owner and server code as
  -- service_role; only direct Data API calls run as anon/authenticated.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.archived_at is not null then
      raise exception 'ARCHIVE_REQUIRES_RPC' using errcode = '42501',
        hint = 'New contacts start unarchived; use rpc_archive_contact.';
    end if;
    return new;
  end if;

  if new.workspace_id is distinct from old.workspace_id or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at or new.legacy_id is distinct from old.legacy_id then
    raise exception 'CONTACT_OWNERSHIP_IMMUTABLE' using errcode = '42501';
  end if;
  if new.archived_at is distinct from old.archived_at then
    raise exception 'ARCHIVE_REQUIRES_RPC' using errcode = '42501',
      hint = 'Use rpc_archive_contact / rpc_restore_contact.';
  end if;
  return new;
end; $$;

drop trigger if exists trg_contact_integrity on public.contacts;
create trigger trg_contact_integrity
  before insert or update on public.contacts
  for each row execute function app.guard_contact_integrity();

create or replace function app.guard_company_integrity()
returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.workspace_id is distinct from old.workspace_id or new.created_at is distinct from old.created_at
     or new.legacy_id is distinct from old.legacy_id then
    raise exception 'COMPANY_WORKSPACE_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end; $$;

drop trigger if exists trg_company_integrity on public.companies;
create trigger trg_company_integrity
  before update on public.companies
  for each row execute function app.guard_company_integrity();

-- 8. updated_at maintenance
drop trigger if exists trg_companies_updated on public.companies;
create trigger trg_companies_updated before update on public.companies
  for each row execute function app.touch_updated_at();
drop trigger if exists trg_contacts_updated on public.contacts;
create trigger trg_contacts_updated before update on public.contacts
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 6. rpc_unlink_application_contact: require access to the application
-- -----------------------------------------------------------------------------
create or replace function public.rpc_unlink_application_contact(
  p_application_id uuid,
  p_contact_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_link public.application_contacts;
  v_app_owner uuid;
begin
  if v_caller is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_link from public.application_contacts
  where application_id = p_application_id and contact_id = p_contact_id;

  if not found then
    return false;
  end if;

  select a.user_id into v_app_owner from public.applications a
  where a.id = v_link.application_id and a.workspace_id = v_link.workspace_id;

  if not public.can_access_owned_record(v_link.workspace_id, v_app_owner) then
    raise exception 'FORBIDDEN_RECORD' using errcode = '42501';
  end if;

  delete from public.application_contacts
  where application_id = p_application_id and contact_id = p_contact_id;

  return true;
end;
$$;

revoke all on function public.rpc_unlink_application_contact(uuid, uuid) from public, anon;
grant execute on function public.rpc_unlink_application_contact(uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. audit_events (Gate 03 TARGET_SCHEMA #25) + cross-user mutation audit
-- -----------------------------------------------------------------------------
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid not null references public.user_accounts(user_id) on delete restrict,
  target_user_id uuid null references public.user_accounts(user_id) on delete set null,
  target_entity_type varchar(32) not null,
  target_entity_id uuid null,
  action varchar(64) not null,
  metadata jsonb not null default '{}',
  ip_address inet null,
  user_agent text null,
  created_at timestamptz not null default now(),
  legacy_id integer null
);
create index if not exists idx_audit_events_ws_time on public.audit_events(workspace_id, created_at desc);
create index if not exists idx_audit_events_entity on public.audit_events(target_entity_type, target_entity_id);

-- SYSTEM / SECURITY: RLS on, no policies, no client privileges. Written only by
-- the trigger below (SECURITY DEFINER); read by server code (service_role).
alter table public.audit_events enable row level security;
revoke all on public.audit_events from public, anon, authenticated;
grant select, insert on public.audit_events to service_role;

-- Append-only for every role, including service_role.
create or replace function app.audit_events_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'AUDIT_EVENTS_APPEND_ONLY' using errcode = '42501';
end; $$;
drop trigger if exists trg_audit_events_immutable on public.audit_events;
create trigger trg_audit_events_immutable
  before update or delete on public.audit_events
  for each row execute function app.audit_events_immutable();

-- One trigger function for every owner-scoped table. TG_ARGV[0] is the entity
-- type. The record owner is the row's user_id, except for snapshots, links and
-- interactions, whose owner is the owner of the parent application/contact.
create or replace function app.audit_cross_user_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_entity text := tg_argv[0];
  v_ws uuid := (v_row->>'workspace_id')::uuid;
  v_owner uuid;
  v_new_owner uuid;
  v_entity_id uuid;
  v_action text;
  v_changed text[];
  v_meta jsonb := '{}';
  v_ua text;
begin
  -- Server-side/system writes (service_role, migrations) carry no end-user actor.
  if v_actor is null then
    return null;
  end if;

  if tg_table_name = 'application_contacts' then
    select a.user_id into v_owner from public.applications a where a.id = (v_row->>'application_id')::uuid;
    v_entity_id := (v_row->>'application_id')::uuid;
    v_meta := jsonb_build_object('contact_id', v_row->>'contact_id');
  elsif tg_table_name = 'job_snapshots' then
    select a.user_id into v_owner from public.applications a where a.id = (v_row->>'application_id')::uuid;
    v_entity_id := (v_row->>'id')::uuid;
    v_meta := jsonb_build_object('application_id', v_row->>'application_id');
  elsif tg_table_name = 'contact_interactions' then
    select c.user_id into v_owner from public.contacts c where c.id = (v_row->>'contact_id')::uuid;
    v_entity_id := (v_row->>'id')::uuid;
    v_meta := jsonb_build_object('contact_id', v_row->>'contact_id', 'interaction_type', v_row->>'interaction_type');
  else
    v_owner := coalesce((v_old->>'user_id')::uuid, (v_new->>'user_id')::uuid);
    v_new_owner := (v_new->>'user_id')::uuid;
    v_entity_id := (v_row->>'id')::uuid;
  end if;

  if v_owner is null or not exists (select 1 from public.workspaces w where w.id = v_ws) then
    return null; -- parent or workspace already gone (cascade)
  end if;

  if tg_op = 'INSERT' then
    v_action := case when tg_table_name = 'application_contacts' then 'LINK_CREATED' else 'RECORD_CREATED' end;
  elsif tg_op = 'DELETE' then
    v_action := case when tg_table_name = 'application_contacts' then 'LINK_REMOVED' else 'RECORD_DELETED' end;
  else
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(v_new) n
    where n.value is distinct from (v_old->n.key)
      and n.key not in ('updated_at', 'last_activity_at');
    if v_changed is null then
      return null; -- no-op update
    end if;
    v_meta := v_meta || jsonb_build_object('changed_columns', to_jsonb(v_changed));
    if v_new_owner is distinct from v_owner then
      v_action := 'RECORD_REASSIGNED';
      v_meta := v_meta || jsonb_build_object('to_user_id', v_new_owner);
    elsif (v_old->>'archived_at') is null and (v_new->>'archived_at') is not null then
      v_action := 'RECORD_ARCHIVED';
    elsif (v_old->>'archived_at') is not null and (v_new->>'archived_at') is null then
      v_action := 'RECORD_RESTORED';
    else
      v_action := 'RECORD_UPDATED';
    end if;
    if 'stage' = any(v_changed) then
      v_meta := v_meta || jsonb_build_object('from_stage', v_old->>'stage', 'to_stage', v_new->>'stage');
    end if;
  end if;

  -- Only cross-user actions are audited (and any reassignment).
  if v_owner = v_actor and v_action <> 'RECORD_REASSIGNED' then
    return null;
  end if;

  begin
    v_ua := left(current_setting('request.headers', true)::json->>'user-agent', 256);
  exception when others then
    v_ua := null;
  end;

  insert into public.audit_events (workspace_id, actor_id, target_user_id, target_entity_type, target_entity_id, action, metadata, user_agent)
  values (v_ws, v_actor, v_owner, v_entity, v_entity_id, v_action, v_meta, v_ua);
  return null;
end; $$;

revoke all on function app.audit_cross_user_mutation() from public;
revoke all on function app.audit_events_immutable() from public;
revoke all on function app.guard_contact_integrity() from public;
revoke all on function app.guard_company_integrity() from public;

drop trigger if exists trg_audit_applications on public.applications;
create trigger trg_audit_applications after insert or update or delete on public.applications
  for each row execute function app.audit_cross_user_mutation('APPLICATION');
drop trigger if exists trg_audit_job_snapshots on public.job_snapshots;
create trigger trg_audit_job_snapshots after insert or update or delete on public.job_snapshots
  for each row execute function app.audit_cross_user_mutation('JOB_SNAPSHOT');
drop trigger if exists trg_audit_contacts on public.contacts;
create trigger trg_audit_contacts after insert or update or delete on public.contacts
  for each row execute function app.audit_cross_user_mutation('CONTACT');
drop trigger if exists trg_audit_contact_interactions on public.contact_interactions;
create trigger trg_audit_contact_interactions after insert or update or delete on public.contact_interactions
  for each row execute function app.audit_cross_user_mutation('CONTACT_INTERACTION');
drop trigger if exists trg_audit_application_contacts on public.application_contacts;
create trigger trg_audit_application_contacts after insert or delete on public.application_contacts
  for each row execute function app.audit_cross_user_mutation('APPLICATION_CONTACT');
