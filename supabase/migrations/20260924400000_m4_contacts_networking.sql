-- Milestone 4: Contacts & Networking Domain
-- 1. companies: Workspace-scoped organization registry
-- 2. contacts: Professional contacts, recruiters, hiring managers (Owner scoped / Manager override)
-- 3. contact_interactions: Chronological interaction history (Owner scoped / Manager override)
-- 4. application_contacts: Many-to-many relationship linking contacts to applications
-- 5. Atomic domain RPCs for creation, interaction logging, application linkage, and soft-archive

-- -----------------------------------------------------------------------------
-- 1. companies
-- -----------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name varchar(128) not null,
  website varchar(255) null,
  domain varchar(128) null,
  logo_url text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_id integer null,
  constraint uq_companies_workspace_name unique (workspace_id, name),
  constraint uq_companies_id_workspace unique (id, workspace_id)
);

create index if not exists idx_companies_ws_name on public.companies(workspace_id, name);

-- Link applications.company_id
alter table public.applications
  add column if not exists company_id uuid null references public.companies(id) on delete set null;

create index if not exists idx_applications_company_id on public.applications(workspace_id, company_id);

-- -----------------------------------------------------------------------------
-- 2. contacts
-- -----------------------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.user_accounts(user_id) on delete restrict,
  company_id uuid null references public.companies(id) on delete set null,
  company_name varchar(128) null,
  full_name varchar(128) not null,
  job_title varchar(128) null,
  relationship_type varchar(32) not null default 'RECRUITER',
  email varchar(255) null,
  phone varchar(32) null,
  linkedin_url text null,
  next_follow_up_date date null,
  notes text null,
  tags text[] not null default '{}',
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_id integer null,
  constraint uq_contacts_id_workspace unique (id, workspace_id),
  constraint chk_relationship_type check (relationship_type in (
    'RECRUITER', 'HIRING_MANAGER', 'REFERRAL', 'INTERVIEWER', 'PEER', 'CONTACT'
  ))
);

create index if not exists idx_contacts_ws_followup on public.contacts(workspace_id, next_follow_up_date);
create index if not exists idx_contacts_ws_owner on public.contacts(workspace_id, user_id);
create index if not exists idx_contacts_ws_company on public.contacts(workspace_id, company_id);
create index if not exists idx_contacts_ws_archived on public.contacts(workspace_id, archived_at);

-- -----------------------------------------------------------------------------
-- 3. contact_interactions
-- -----------------------------------------------------------------------------
create table if not exists public.contact_interactions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null references public.user_accounts(user_id) on delete restrict,
  interaction_type varchar(32) not null,
  interaction_date timestamptz not null default now(),
  notes text not null,
  created_at timestamptz not null default now(),
  legacy_id integer null,
  constraint fk_interactions_contact foreign key (contact_id, workspace_id)
    references public.contacts(id, workspace_id) on delete cascade,
  constraint chk_interaction_type check (interaction_type in (
    'EMAIL', 'CALL', 'LINKEDIN', 'MEETING', 'COFFEE', 'NOTE'
  ))
);

create index if not exists idx_contact_interactions_contact on public.contact_interactions(contact_id, interaction_date desc);
create index if not exists idx_contact_interactions_ws_user on public.contact_interactions(workspace_id, user_id);

-- -----------------------------------------------------------------------------
-- 4. application_contacts
-- -----------------------------------------------------------------------------
create table if not exists public.application_contacts (
  application_id uuid not null,
  contact_id uuid not null,
  workspace_id uuid not null,
  role_in_process varchar(32) null,
  created_at timestamptz not null default now(),
  primary key (application_id, contact_id),
  constraint fk_app_contacts_app foreign key (application_id, workspace_id)
    references public.applications(id, workspace_id) on delete cascade,
  constraint fk_app_contacts_contact foreign key (contact_id, workspace_id)
    references public.contacts(id, workspace_id) on delete cascade
);

create index if not exists idx_app_contacts_contact on public.application_contacts(contact_id, workspace_id);
create index if not exists idx_app_contacts_app on public.application_contacts(application_id, workspace_id);

-- -----------------------------------------------------------------------------
-- 5. Row-Level Security
-- -----------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_interactions enable row level security;
alter table public.application_contacts enable row level security;

-- companies policies: workspace shared
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists companies_delete on public.companies;
create policy companies_delete on public.companies for delete to authenticated
  using (public.is_workspace_manager(workspace_id));

-- contacts policies: owner scoped / manager override
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts for insert to authenticated
  with check (
    (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id))
    or (public.is_workspace_manager(workspace_id) and app.user_is_member(workspace_id, user_id))
  );

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts for update to authenticated
  using (public.can_access_owned_record(workspace_id, user_id))
  with check (public.can_access_owned_record(workspace_id, user_id));

drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts for delete to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

-- contact_interactions policies: owner scoped / manager override
drop policy if exists contact_interactions_select on public.contact_interactions;
create policy contact_interactions_select on public.contact_interactions for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

drop policy if exists contact_interactions_insert on public.contact_interactions;
create policy contact_interactions_insert on public.contact_interactions for insert to authenticated
  with check (
    (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id))
    or (public.is_workspace_manager(workspace_id) and app.user_is_member(workspace_id, user_id))
  );

drop policy if exists contact_interactions_update on public.contact_interactions;
create policy contact_interactions_update on public.contact_interactions for update to authenticated
  using (public.can_access_owned_record(workspace_id, user_id))
  with check (public.can_access_owned_record(workspace_id, user_id));

drop policy if exists contact_interactions_delete on public.contact_interactions;
create policy contact_interactions_delete on public.contact_interactions for delete to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

-- application_contacts policies: owner scoped / manager override
drop policy if exists application_contacts_select on public.application_contacts;
create policy application_contacts_select on public.application_contacts for select to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_contacts.application_id
        and a.workspace_id = application_contacts.workspace_id
        and public.can_access_owned_record(a.workspace_id, a.user_id)
    )
  );

drop policy if exists application_contacts_insert on public.application_contacts;
create policy application_contacts_insert on public.application_contacts for insert to authenticated
  with check (
    exists (
      select 1 from public.applications a
      where a.id = application_contacts.application_id
        and a.workspace_id = application_contacts.workspace_id
        and public.can_access_owned_record(a.workspace_id, a.user_id)
    )
    and exists (
      select 1 from public.contacts c
      where c.id = application_contacts.contact_id
        and c.workspace_id = application_contacts.workspace_id
        and public.can_access_owned_record(c.workspace_id, c.user_id)
    )
  );

drop policy if exists application_contacts_delete on public.application_contacts;
create policy application_contacts_delete on public.application_contacts for delete to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_contacts.application_id
        and a.workspace_id = application_contacts.workspace_id
        and public.can_access_owned_record(a.workspace_id, a.user_id)
    )
  );

-- -----------------------------------------------------------------------------
-- 6. Table Privileges & Grants
-- -----------------------------------------------------------------------------
revoke all on public.companies from public, anon;
revoke all on public.contacts from public, anon;
revoke all on public.contact_interactions from public, anon;
revoke all on public.application_contacts from public, anon;

grant select, insert, update on public.companies to authenticated;
grant delete on public.companies to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert, update, delete on public.contact_interactions to authenticated;
grant select, insert, delete on public.application_contacts to authenticated;

grant all on public.companies to service_role;
grant all on public.contacts to service_role;
grant all on public.contact_interactions to service_role;
grant all on public.application_contacts to service_role;

-- -----------------------------------------------------------------------------
-- 7. Atomic Domain RPCs
-- -----------------------------------------------------------------------------

-- 7.1 rpc_create_contact
create or replace function public.rpc_create_contact(
  p_workspace_id uuid,
  p_full_name text,
  p_company_name text default null,
  p_job_title text default null,
  p_relationship_type text default 'RECRUITER',
  p_email text default null,
  p_phone text default null,
  p_linkedin_url text default null,
  p_next_follow_up_date date default null,
  p_notes text default null,
  p_tags text[] default '{}',
  p_application_id uuid default null,
  p_role_in_process text default null
)
returns public.contacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_comp_id uuid := null;
  v_clean_name text := trim(p_full_name);
  v_clean_company text := nullif(trim(coalesce(p_company_name, '')), '');
  v_contact public.contacts;
begin
  if v_caller is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'FORBIDDEN_WORKSPACE' using errcode = '42501';
  end if;

  if v_clean_name is null or length(v_clean_name) = 0 then
    raise exception 'FULL_NAME_REQUIRED' using errcode = '22023';
  end if;

  -- Upsert company if provided
  if v_clean_company is not null then
    insert into public.companies (workspace_id, name)
    values (p_workspace_id, v_clean_company)
    on conflict (workspace_id, name) do update
      set updated_at = now()
    returning id into v_comp_id;
  end if;

  -- Insert contact
  insert into public.contacts (
    workspace_id,
    user_id,
    company_id,
    company_name,
    full_name,
    job_title,
    relationship_type,
    email,
    phone,
    linkedin_url,
    next_follow_up_date,
    notes,
    tags
  ) values (
    p_workspace_id,
    v_caller,
    v_comp_id,
    v_clean_company,
    v_clean_name,
    nullif(trim(coalesce(p_job_title, '')), ''),
    coalesce(nullif(trim(p_relationship_type), ''), 'RECRUITER'),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_linkedin_url, '')), ''),
    p_next_follow_up_date,
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_tags, '{}')
  )
  returning * into v_contact;

  -- Optional application link
  if p_application_id is not null then
    -- Verify application belongs to same workspace and caller has access
    if exists (
      select 1 from public.applications a
      where a.id = p_application_id
        and a.workspace_id = p_workspace_id
        and public.can_access_owned_record(a.workspace_id, a.user_id)
    ) then
      insert into public.application_contacts (
        application_id,
        contact_id,
        workspace_id,
        role_in_process
      ) values (
        p_application_id,
        v_contact.id,
        p_workspace_id,
        nullif(trim(coalesce(p_role_in_process, '')), '')
      )
      on conflict (application_id, contact_id) do nothing;
    end if;
  end if;

  return v_contact;
end;
$$;

-- 7.2 rpc_log_contact_interaction
create or replace function public.rpc_log_contact_interaction(
  p_contact_id uuid,
  p_interaction_type text,
  p_notes text,
  p_interaction_date timestamptz default now(),
  p_next_follow_up_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_contact public.contacts;
  v_interaction_id uuid;
  v_clean_notes text := trim(coalesce(p_notes, ''));
begin
  if v_caller is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_contact from public.contacts
  where id = p_contact_id;

  if not found then
    raise exception 'CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.can_access_owned_record(v_contact.workspace_id, v_contact.user_id) then
    raise exception 'FORBIDDEN_CONTACT' using errcode = '42501';
  end if;

  if v_clean_notes is null or length(v_clean_notes) = 0 then
    raise exception 'INTERACTION_NOTES_REQUIRED' using errcode = '22023';
  end if;

  insert into public.contact_interactions (
    contact_id,
    workspace_id,
    user_id,
    interaction_type,
    notes,
    interaction_date
  ) values (
    v_contact.id,
    v_contact.workspace_id,
    v_caller,
    coalesce(nullif(trim(p_interaction_type), ''), 'NOTE'),
    v_clean_notes,
    coalesce(p_interaction_date, now())
  )
  returning id into v_interaction_id;

  -- Update contact's updated_at and optionally next_follow_up_date
  update public.contacts
  set updated_at = now(),
      next_follow_up_date = coalesce(p_next_follow_up_date, next_follow_up_date)
  where id = v_contact.id;

  return v_interaction_id;
end;
$$;

-- 7.3 rpc_link_application_contact
create or replace function public.rpc_link_application_contact(
  p_application_id uuid,
  p_contact_id uuid,
  p_role_in_process text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_app public.applications;
  v_contact public.contacts;
begin
  if v_caller is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_app from public.applications where id = p_application_id;
  if not found then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_contact from public.contacts where id = p_contact_id;
  if not found then
    raise exception 'CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Cross-workspace denial
  if v_app.workspace_id <> v_contact.workspace_id then
    raise exception 'CROSS_WORKSPACE_LINK_FORBIDDEN' using errcode = '42501';
  end if;

  -- Permission checks
  if not public.can_access_owned_record(v_app.workspace_id, v_app.user_id) or
     not public.can_access_owned_record(v_contact.workspace_id, v_contact.user_id) then
    raise exception 'FORBIDDEN_RECORD' using errcode = '42501';
  end if;

  insert into public.application_contacts (
    application_id,
    contact_id,
    workspace_id,
    role_in_process
  ) values (
    p_application_id,
    p_contact_id,
    v_app.workspace_id,
    nullif(trim(coalesce(p_role_in_process, '')), '')
  )
  on conflict (application_id, contact_id) do update
    set role_in_process = excluded.role_in_process;

  return true;
end;
$$;

-- 7.4 rpc_unlink_application_contact
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
begin
  if v_caller is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_link from public.application_contacts
  where application_id = p_application_id and contact_id = p_contact_id;

  if not found then
    return false;
  end if;

  if not public.is_workspace_member(v_link.workspace_id) then
    raise exception 'FORBIDDEN_WORKSPACE' using errcode = '42501';
  end if;

  delete from public.application_contacts
  where application_id = p_application_id and contact_id = p_contact_id;

  return true;
end;
$$;

-- 7.5 rpc_archive_contact / rpc_restore_contact
create or replace function public.rpc_archive_contact(p_contact_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_contact public.contacts;
begin
  if v_caller is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_contact from public.contacts where id = p_contact_id;
  if not found then
    raise exception 'CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.can_access_owned_record(v_contact.workspace_id, v_contact.user_id) then
    raise exception 'FORBIDDEN_CONTACT' using errcode = '42501';
  end if;

  if v_contact.archived_at is not null then
    return true; -- already archived
  end if;

  update public.contacts
  set archived_at = now(), updated_at = now()
  where id = p_contact_id;

  return true;
end;
$$;

create or replace function public.rpc_restore_contact(p_contact_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_contact public.contacts;
begin
  if v_caller is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_contact from public.contacts where id = p_contact_id;
  if not found then
    raise exception 'CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.can_access_owned_record(v_contact.workspace_id, v_contact.user_id) then
    raise exception 'FORBIDDEN_CONTACT' using errcode = '42501';
  end if;

  if v_contact.archived_at is null then
    return true; -- already active
  end if;

  update public.contacts
  set archived_at = null, updated_at = now()
  where id = p_contact_id;

  return true;
end;
$$;

-- Revoke from anon, grant to authenticated and service_role
revoke all on function public.rpc_create_contact from public, anon;
revoke all on function public.rpc_log_contact_interaction from public, anon;
revoke all on function public.rpc_link_application_contact from public, anon;
revoke all on function public.rpc_unlink_application_contact from public, anon;
revoke all on function public.rpc_archive_contact from public, anon;
revoke all on function public.rpc_restore_contact from public, anon;

grant execute on function public.rpc_create_contact to authenticated, service_role;
grant execute on function public.rpc_log_contact_interaction to authenticated, service_role;
grant execute on function public.rpc_link_application_contact to authenticated, service_role;
grant execute on function public.rpc_unlink_application_contact to authenticated, service_role;
grant execute on function public.rpc_archive_contact to authenticated, service_role;
grant execute on function public.rpc_restore_contact to authenticated, service_role;
