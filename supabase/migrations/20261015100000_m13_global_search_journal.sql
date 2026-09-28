-- JobQuest 2.0 · Milestone 13 — Global Search, Hardening & Final Product Parity Sweep
-- Migration: 20261015100000_m13_global_search_journal.sql
-- Covers:
--   1. public.journal_entries (personal reflections, career coaching notes, research)
--   2. Constraints, indexes, and composite application linkage with ON DELETE SET NULL
--   3. Row Level Security (Tier 2: OWNER SCOPED / MANAGER OVERRIDE)
--   4. Manager cross-user mutation audit triggers via app.audit_cross_user_mutation
--   5. Domain RPCs: rpc_create_journal_entry, rpc_update_journal_entry, rpc_delete_journal_entry
--   6. Multi-domain global search RPC: rpc_global_search (applications, contacts, notes, interviews, documents)

-- ============================================================================
-- 1. Table: public.journal_entries
-- ============================================================================

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.user_accounts(user_id) on delete restrict,
  application_id uuid null,
  entry_type varchar(32) not null default 'NOTE',
  title varchar(255) null,
  content text not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_id integer null,
  constraint fk_journal_application foreign key (application_id)
    references public.applications(id) on delete set null,
  constraint uq_journal_entries_id_workspace unique (id, workspace_id),
  constraint chk_journal_entry_type check (entry_type in (
    'REFLECTION', 'STRATEGY', 'INTERVIEW_PREP', 'NOTE', 'POST_MORTEM'
  )),
  constraint chk_journal_content_length check (char_length(content) <= 50000),
  constraint chk_journal_title_length check (title is null or char_length(title) <= 255)
);

-- ============================================================================
-- 2. Indexes
-- ============================================================================

create index if not exists idx_journal_entries_ws_user
  on public.journal_entries(workspace_id, user_id);

create index if not exists idx_journal_entries_ws_created
  on public.journal_entries(workspace_id, created_at desc);

create index if not exists idx_journal_entries_ws_pinned
  on public.journal_entries(workspace_id, is_pinned desc, created_at desc);

create index if not exists idx_journal_entries_ws_app
  on public.journal_entries(workspace_id, application_id)
  where application_id is not null;

-- ============================================================================
-- 3. Grants & Row Level Security
-- ============================================================================

revoke all on public.journal_entries from public, anon;
grant select, insert, update, delete on public.journal_entries to authenticated;

alter table public.journal_entries enable row level security;

drop policy if exists journal_entries_select on public.journal_entries;
create policy journal_entries_select on public.journal_entries for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

drop policy if exists journal_entries_insert on public.journal_entries;
create policy journal_entries_insert on public.journal_entries for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and (user_id = auth.uid() or public.is_workspace_manager(workspace_id))
  );

drop policy if exists journal_entries_update on public.journal_entries;
create policy journal_entries_update on public.journal_entries for update to authenticated
  using (public.can_access_owned_record(workspace_id, user_id))
  with check (public.can_access_owned_record(workspace_id, user_id));

drop policy if exists journal_entries_delete on public.journal_entries;
create policy journal_entries_delete on public.journal_entries for delete to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

-- ============================================================================
-- 4. Manager Cross-User Mutation Audit Trigger
-- ============================================================================

drop trigger if exists trg_audit_journal_entries on public.journal_entries;
create trigger trg_audit_journal_entries
  after insert or update or delete on public.journal_entries
  for each row execute function app.audit_cross_user_mutation('JOURNAL_ENTRY');

-- ============================================================================
-- 5. Domain RPCs: Journal / Notes Operations
-- ============================================================================

create or replace function public.rpc_create_journal_entry(
  p_workspace_id uuid,
  p_title text,
  p_content text,
  p_entry_type text default 'NOTE',
  p_application_id uuid default null,
  p_is_pinned boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_caller_id uuid := auth.uid();
  v_entry_id uuid;
  v_clean_title text := nullif(trim(p_title), '');
  v_clean_content text := trim(p_content);
  v_type text := upper(trim(coalesce(p_entry_type, 'NOTE')));
begin
  if v_caller_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;

  if v_clean_content is null or length(v_clean_content) = 0 then
    raise exception 'CONTENT_REQUIRED' using errcode = '22023';
  end if;

  if p_application_id is not null then
    if not exists (
      select 1 from public.applications
      where id = p_application_id and workspace_id = p_workspace_id
    ) then
      raise exception 'APPLICATION_NOT_FOUND' using errcode = '22023';
    end if;
  end if;

  insert into public.journal_entries (
    workspace_id,
    user_id,
    application_id,
    entry_type,
    title,
    content,
    is_pinned
  ) values (
    p_workspace_id,
    v_caller_id,
    p_application_id,
    v_type,
    v_clean_title,
    v_clean_content,
    coalesce(p_is_pinned, false)
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

create or replace function public.rpc_update_journal_entry(
  p_entry_id uuid,
  p_title text,
  p_content text,
  p_entry_type text default 'NOTE',
  p_application_id uuid default null,
  p_is_pinned boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_entry public.journal_entries%rowtype;
  v_clean_title text := nullif(trim(p_title), '');
  v_clean_content text := trim(p_content);
  v_type text := upper(trim(coalesce(p_entry_type, 'NOTE')));
begin
  select * into v_entry from public.journal_entries where id = p_entry_id;
  if not found then
    raise exception 'ENTRY_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.can_access_owned_record(v_entry.workspace_id, v_entry.user_id) then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;

  if v_clean_content is null or length(v_clean_content) = 0 then
    raise exception 'CONTENT_REQUIRED' using errcode = '22023';
  end if;

  if p_application_id is not null then
    if not exists (
      select 1 from public.applications
      where id = p_application_id and workspace_id = v_entry.workspace_id
    ) then
      raise exception 'APPLICATION_NOT_FOUND' using errcode = '22023';
    end if;
  end if;

  update public.journal_entries
  set
    title = v_clean_title,
    content = v_clean_content,
    entry_type = v_type,
    application_id = p_application_id,
    is_pinned = coalesce(p_is_pinned, false),
    updated_at = now()
  where id = p_entry_id;

  return true;
end;
$$;

create or replace function public.rpc_delete_journal_entry(
  p_entry_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_entry public.journal_entries%rowtype;
begin
  select * into v_entry from public.journal_entries where id = p_entry_id;
  if not found then
    raise exception 'ENTRY_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.can_access_owned_record(v_entry.workspace_id, v_entry.user_id) then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;

  delete from public.journal_entries where id = p_entry_id;
  return true;
end;
$$;

revoke all on function public.rpc_create_journal_entry(uuid, text, text, text, uuid, boolean) from public, anon;
grant execute on function public.rpc_create_journal_entry(uuid, text, text, text, uuid, boolean) to authenticated;

revoke all on function public.rpc_update_journal_entry(uuid, text, text, text, uuid, boolean) from public, anon;
grant execute on function public.rpc_update_journal_entry(uuid, text, text, text, uuid, boolean) to authenticated;

revoke all on function public.rpc_delete_journal_entry(uuid) from public, anon;
grant execute on function public.rpc_delete_journal_entry(uuid) to authenticated;

-- ============================================================================
-- 6. Global Search Stored Procedure: rpc_global_search
-- ============================================================================

create or replace function public.rpc_global_search(
  p_query text,
  p_workspace_id uuid,
  p_limit integer default 20
)
returns table (
  id text,
  domain text,
  title text,
  subtitle text,
  badge text,
  snippet text,
  deep_link text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_role varchar(16);
  v_term text;
  v_pattern text;
  v_effective_limit integer;
begin
  if v_caller_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select role into v_caller_role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = v_caller_id
    and status = 'ACTIVE';

  if v_caller_role is null then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;

  v_term := trim(coalesce(p_query, ''));
  if v_term = '' or length(v_term) = 0 then
    return;
  end if;

  v_pattern := '%' || v_term || '%';
  v_effective_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  return query
  with results as (
    -- 1. Applications
    select
      a.id::text as id,
      'application'::text as domain,
      (a.company_name || ' — ' || a.role_title)::text as title,
      coalesce(a.location, 'Application')::text as subtitle,
      a.stage::text as badge,
      coalesce(nullif(left(a.notes, 120), ''), nullif(left(js.job_description, 120), ''), a.company_name)::text as snippet,
      ('/w/' || p_workspace_id || '/applications/' || a.id)::text as deep_link,
      a.created_at
    from public.applications a
    left join public.job_snapshots js on js.application_id = a.id
    where a.workspace_id = p_workspace_id
      and a.archived_at is null
      and (v_caller_role = 'MANAGER' or a.user_id = v_caller_id)
      and (
        a.company_name ilike v_pattern
        or a.role_title ilike v_pattern
        or a.location ilike v_pattern
        or a.notes ilike v_pattern
        or js.job_description ilike v_pattern
      )

    union all

    -- 2. Contacts
    select
      c.id::text as id,
      'contact'::text as domain,
      c.full_name::text as title,
      coalesce(nullif(c.job_title || case when c.company_name is not null then ' at ' || c.company_name else '' end, ''), c.company_name, 'Contact')::text as subtitle,
      c.relationship_type::text as badge,
      coalesce(nullif(left(c.notes, 120), ''), c.email, c.phone, '')::text as snippet,
      '/contacts'::text as deep_link,
      c.created_at
    from public.contacts c
    where c.workspace_id = p_workspace_id
      and (v_caller_role = 'MANAGER' or c.user_id = v_caller_id)
      and (
        c.full_name ilike v_pattern
        or c.company_name ilike v_pattern
        or c.job_title ilike v_pattern
        or c.email ilike v_pattern
        or c.notes ilike v_pattern
      )

    union all

    -- 3. Notes / Journal
    select
      j.id::text as id,
      'note'::text as domain,
      coalesce(nullif(j.title, ''), 'Untitled Note')::text as title,
      j.entry_type::text as subtitle,
      j.entry_type::text as badge,
      left(j.content, 120)::text as snippet,
      '/journal'::text as deep_link,
      j.created_at
    from public.journal_entries j
    where j.workspace_id = p_workspace_id
      and (v_caller_role = 'MANAGER' or j.user_id = v_caller_id)
      and (
        j.title ilike v_pattern
        or j.content ilike v_pattern
      )

    union all

    -- 4. Interviews
    select
      i.id::text as id,
      'interview'::text as domain,
      (a.company_name || ' — Round ' || i.round_number)::text as title,
      (i.interview_type || ' (' || i.format || ')')::text as subtitle,
      coalesce(i.outcome, 'SCHEDULED')::text as badge,
      coalesce(nullif(left(i.interviewer_names, 120), ''), nullif(left(i.preparation_notes, 120), ''), nullif(left(i.feedback_notes, 120), ''), '')::text as snippet,
      '/interviews'::text as deep_link,
      i.created_at
    from public.interviews i
    join public.applications a on a.id = i.application_id and a.workspace_id = i.workspace_id
    where i.workspace_id = p_workspace_id
      and (v_caller_role = 'MANAGER' or i.user_id = v_caller_id)
      and (
        a.company_name ilike v_pattern
        or a.role_title ilike v_pattern
        or i.interview_type ilike v_pattern
        or i.interviewer_names ilike v_pattern
        or i.preparation_notes ilike v_pattern
        or i.feedback_notes ilike v_pattern
      )

    union all

    -- 5. Documents / Resumes
    select
      r.id::text as id,
      'document'::text as domain,
      (r.name || ' (' || r.version_label || ')')::text as title,
      coalesce(r.target_role, r.category, r.document_type)::text as subtitle,
      r.document_type::text as badge,
      coalesce(nullif(left(r.change_summary, 120), ''), r.category, '')::text as snippet,
      '/resumes'::text as deep_link,
      r.created_at
    from public.resumes r
    where r.workspace_id = p_workspace_id
      and r.archived_at is null
      and (v_caller_role = 'MANAGER' or r.user_id = v_caller_id)
      and (
        r.name ilike v_pattern
        or r.target_role ilike v_pattern
        or r.category ilike v_pattern
        or r.change_summary ilike v_pattern
        or r.version_label ilike v_pattern
      )
  )
  select * from results
  order by created_at desc
  limit v_effective_limit;
end;
$$;

revoke all on function public.rpc_global_search(text, uuid, integer) from public, anon;
grant execute on function public.rpc_global_search(text, uuid, integer) to authenticated;
