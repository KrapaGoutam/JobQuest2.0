-- JobQuest 2.0 · Milestone 7 — Documents & Resumes
-- Migration: 20260927100000_m7_documents_resumes.sql
-- Covers:
--   1. public.resumes (resume variants, tailored revisions, cover letters)
--   2. public.application_documents (document attachments linked to applications)
--   3. Composite tenancy foreign keys preventing cross-workspace linkage
--   4. RLS Tier 2: OWNER SCOPED / MANAGER OVERRIDE
--   5. Domain RPCs: create, clone, set default, archive, restore, guarded delete, link/unlink
--   6. Cross-user manager audit triggers via app.audit_cross_user_mutation

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.user_accounts(user_id) on delete restrict,
  name varchar(128) not null,
  document_type varchar(32) not null default 'RESUME',
  version_label varchar(64) not null default 'v1',
  base_resume_id uuid null references public.resumes(id) on delete set null,
  target_role varchar(128) null,
  category varchar(64) null,
  change_summary text null,
  file_storage_path text null,
  content_text text null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_id integer null,
  constraint uq_resumes_id_workspace unique (id, workspace_id),
  constraint chk_resumes_doc_type check (document_type in ('RESUME', 'COVER_LETTER'))
);

create table if not exists public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  workspace_id uuid not null,
  document_type varchar(32) not null default 'RESUME',
  resume_id uuid null,
  file_storage_path text null,
  notes text null,
  created_at timestamptz not null default now(),
  constraint fk_app_docs_app foreign key (application_id, workspace_id)
    references public.applications(id, workspace_id) on delete cascade,
  constraint fk_app_docs_resume foreign key (resume_id, workspace_id)
    references public.resumes(id, workspace_id) on delete set null,
  constraint chk_app_docs_type check (document_type in ('RESUME', 'COVER_LETTER', 'TRANSCRIPT', 'PORTFOLIO', 'OTHER'))
);

-- Indexes
create index if not exists idx_resumes_ws_user on public.resumes(workspace_id, user_id);
create index if not exists idx_resumes_base on public.resumes(base_resume_id);
create index if not exists idx_app_docs_app on public.application_documents(workspace_id, application_id);
create index if not exists idx_app_docs_resume on public.application_documents(workspace_id, resume_id);

-- Least-Privilege Grants
revoke all on public.resumes, public.application_documents from anon, public;
grant select, insert, update, delete on public.resumes, public.application_documents to authenticated;

-- Row Level Security (Tier 2: OWNER SCOPED / MANAGER OVERRIDE)
alter table public.resumes enable row level security;
alter table public.application_documents enable row level security;

-- Policies on resumes
drop policy if exists resumes_select on public.resumes;
create policy resumes_select on public.resumes for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

drop policy if exists resumes_insert on public.resumes;
create policy resumes_insert on public.resumes for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and (user_id = auth.uid() or public.is_workspace_manager(workspace_id))
  );

drop policy if exists resumes_update on public.resumes;
create policy resumes_update on public.resumes for update to authenticated
  using (public.can_access_owned_record(workspace_id, user_id))
  with check (public.can_access_owned_record(workspace_id, user_id));

drop policy if exists resumes_delete on public.resumes;
create policy resumes_delete on public.resumes for delete to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

-- Policies on application_documents
drop policy if exists app_docs_select on public.application_documents;
create policy app_docs_select on public.application_documents for select to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_documents.application_id
        and a.workspace_id = application_documents.workspace_id
        and public.can_access_owned_record(a.workspace_id, a.user_id)
    )
  );

drop policy if exists app_docs_insert on public.application_documents;
create policy app_docs_insert on public.application_documents for insert to authenticated
  with check (
    exists (
      select 1 from public.applications a
      where a.id = application_documents.application_id
        and a.workspace_id = application_documents.workspace_id
        and (a.user_id = auth.uid() or public.is_workspace_manager(a.workspace_id))
    )
  );

drop policy if exists app_docs_update on public.application_documents;
create policy app_docs_update on public.application_documents for update to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_documents.application_id
        and a.workspace_id = application_documents.workspace_id
        and public.can_access_owned_record(a.workspace_id, a.user_id)
    )
  );

drop policy if exists app_docs_delete on public.application_documents;
create policy app_docs_delete on public.application_documents for delete to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_documents.application_id
        and a.workspace_id = application_documents.workspace_id
        and public.can_access_owned_record(a.workspace_id, a.user_id)
    )
  );

-- Trigger: Audit Cross-User Mutations
drop trigger if exists trg_audit_resumes on public.resumes;
create trigger trg_audit_resumes after insert or update or delete on public.resumes
  for each row execute function app.audit_cross_user_mutation('RESUME');

drop trigger if exists trg_audit_application_documents on public.application_documents;
create trigger trg_audit_application_documents after insert or update or delete on public.application_documents
  for each row execute function app.audit_cross_user_mutation('APPLICATION_DOCUMENT');

-- -------------------------------------------------------------
-- Domain RPCs
-- -------------------------------------------------------------

-- 1. rpc_create_resume
create or replace function public.rpc_create_resume(
  p_workspace_id uuid,
  p_name text,
  p_document_type text default 'RESUME',
  p_version_label text default 'v1',
  p_target_role text default null,
  p_category text default null,
  p_change_summary text default null,
  p_content_text text default null,
  p_file_storage_path text default null,
  p_is_default boolean default false,
  p_base_resume_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_resume_id uuid;
  v_clean_name text := trim(p_name);
  v_doc_type text := upper(coalesce(trim(p_document_type), 'RESUME'));
  v_version_label text := coalesce(trim(p_version_label), 'v1');
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'NOT_A_WORKSPACE_MEMBER' using errcode = '42501';
  end if;

  if v_clean_name is null or length(v_clean_name) = 0 then
    raise exception 'NAME_REQUIRED' using errcode = '23514';
  end if;

  if v_doc_type not in ('RESUME', 'COVER_LETTER') then
    raise exception 'INVALID_DOCUMENT_TYPE' using errcode = '23514';
  end if;

  if p_base_resume_id is not null then
    if not exists (
      select 1 from public.resumes r
      where r.id = p_base_resume_id and r.workspace_id = p_workspace_id
    ) then
      raise exception 'BASE_RESUME_NOT_FOUND' using errcode = '23503';
    end if;
  end if;

  if coalesce(p_is_default, false) then
    update public.resumes
    set is_default = false, updated_at = now()
    where workspace_id = p_workspace_id
      and user_id = v_user_id
      and document_type = v_doc_type
      and is_default = true;
  end if;

  insert into public.resumes (
    workspace_id,
    user_id,
    name,
    document_type,
    version_label,
    base_resume_id,
    target_role,
    category,
    change_summary,
    content_text,
    file_storage_path,
    is_default,
    is_active
  ) values (
    p_workspace_id,
    v_user_id,
    v_clean_name,
    v_doc_type,
    v_version_label,
    p_base_resume_id,
    trim(p_target_role),
    trim(p_category),
    trim(p_change_summary),
    p_content_text,
    trim(p_file_storage_path),
    coalesce(p_is_default, false),
    true
  )
  returning id into v_resume_id;

  return jsonb_build_object(
    'id', v_resume_id,
    'workspace_id', p_workspace_id,
    'name', v_clean_name,
    'version_label', v_version_label,
    'document_type', v_doc_type,
    'is_default', coalesce(p_is_default, false)
  );
end;
$$;

-- 2. rpc_clone_resume
create or replace function public.rpc_clone_resume(
  p_resume_id uuid,
  p_new_name text default null,
  p_new_version_label text default null,
  p_change_summary text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_base public.resumes%rowtype;
  v_new_id uuid;
  v_name text;
  v_label text;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_base
  from public.resumes
  where id = p_resume_id;

  if not found then
    raise exception 'RESUME_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.can_access_owned_record(v_base.workspace_id, v_base.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  v_name := coalesce(trim(p_new_name), '↳ ' || v_base.name || ' (revision)');
  v_label := coalesce(trim(p_new_version_label), v_base.version_label || '.1');

  insert into public.resumes (
    workspace_id,
    user_id,
    name,
    document_type,
    version_label,
    base_resume_id,
    target_role,
    category,
    change_summary,
    content_text,
    file_storage_path,
    is_default,
    is_active
  ) values (
    v_base.workspace_id,
    v_user_id,
    v_name,
    v_base.document_type,
    v_label,
    v_base.id,
    v_base.target_role,
    v_base.category,
    coalesce(trim(p_change_summary), 'Revision of ' || v_base.name),
    v_base.content_text,
    v_base.file_storage_path,
    false,
    true
  )
  returning id into v_new_id;

  return jsonb_build_object(
    'id', v_new_id,
    'base_resume_id', v_base.id,
    'workspace_id', v_base.workspace_id,
    'name', v_name,
    'version_label', v_label
  );
end;
$$;

-- 3. rpc_set_default_resume
create or replace function public.rpc_set_default_resume(p_resume_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_res public.resumes%rowtype;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_res from public.resumes where id = p_resume_id;
  if not found then
    raise exception 'RESUME_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.can_access_owned_record(v_res.workspace_id, v_res.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  update public.resumes
  set is_default = false, updated_at = now()
  where workspace_id = v_res.workspace_id
    and user_id = v_res.user_id
    and document_type = v_res.document_type
    and id <> v_res.id
    and is_default = true;

  update public.resumes
  set is_default = true, updated_at = now()
  where id = v_res.id;

  return jsonb_build_object('id', v_res.id, 'is_default', true);
end;
$$;

-- 4. rpc_archive_resume & rpc_restore_resume
create or replace function public.rpc_archive_resume(p_resume_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res public.resumes%rowtype;
begin
  select * into v_res from public.resumes where id = p_resume_id;
  if not found then raise exception 'RESUME_NOT_FOUND' using errcode = 'P0002'; end if;
  if not public.can_access_owned_record(v_res.workspace_id, v_res.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  update public.resumes
  set archived_at = now(), is_active = false, is_default = false, updated_at = now()
  where id = v_res.id;

  return jsonb_build_object('id', v_res.id, 'archived', true);
end;
$$;

create or replace function public.rpc_restore_resume(p_resume_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res public.resumes%rowtype;
begin
  select * into v_res from public.resumes where id = p_resume_id;
  if not found then raise exception 'RESUME_NOT_FOUND' using errcode = 'P0002'; end if;
  if not public.can_access_owned_record(v_res.workspace_id, v_res.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  update public.resumes
  set archived_at = null, is_active = true, updated_at = now()
  where id = v_res.id;

  return jsonb_build_object('id', v_res.id, 'restored', true);
end;
$$;

-- 5. rpc_delete_resume (Guarded deletion: blocks delete if used by applications)
create or replace function public.rpc_delete_resume(p_resume_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res public.resumes%rowtype;
  v_used_count integer;
begin
  select * into v_res from public.resumes where id = p_resume_id;
  if not found then raise exception 'RESUME_NOT_FOUND' using errcode = 'P0002'; end if;
  if not public.can_access_owned_record(v_res.workspace_id, v_res.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select count(*) into v_used_count
  from public.application_documents
  where resume_id = p_resume_id;

  if v_used_count > 0 then
    raise exception 'CANNOT_DELETE_USED_RESUME: Resume is linked to % applications. Archive it instead.', v_used_count
      using errcode = 'P0001';
  end if;

  delete from public.resumes where id = p_resume_id;
  return jsonb_build_object('id', p_resume_id, 'deleted', true);
end;
$$;

-- 6. rpc_link_application_document
create or replace function public.rpc_link_application_document(
  p_application_id uuid,
  p_resume_id uuid default null,
  p_document_type text default 'RESUME',
  p_notes text default null,
  p_file_storage_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.applications%rowtype;
  v_res public.resumes%rowtype;
  v_doc_type text := upper(coalesce(trim(p_document_type), 'RESUME'));
  v_doc_id uuid;
begin
  select * into v_app from public.applications where id = p_application_id;
  if not found then raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if not public.can_access_owned_record(v_app.workspace_id, v_app.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if p_resume_id is not null then
    select * into v_res from public.resumes where id = p_resume_id;
    if not found then raise exception 'RESUME_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_res.workspace_id <> v_app.workspace_id then
      raise exception 'CROSS_WORKSPACE_DOCUMENT_FORBIDDEN' using errcode = '23503';
    end if;
  end if;

  insert into public.application_documents (
    application_id,
    workspace_id,
    document_type,
    resume_id,
    file_storage_path,
    notes
  ) values (
    v_app.id,
    v_app.workspace_id,
    v_doc_type,
    p_resume_id,
    trim(p_file_storage_path),
    trim(p_notes)
  )
  returning id into v_doc_id;

  return jsonb_build_object(
    'id', v_doc_id,
    'application_id', v_app.id,
    'resume_id', p_resume_id,
    'document_type', v_doc_type
  );
end;
$$;

-- 7. rpc_unlink_application_document
create or replace function public.rpc_unlink_application_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.application_documents%rowtype;
  v_app public.applications%rowtype;
begin
  select * into v_doc from public.application_documents where id = p_document_id;
  if not found then raise exception 'DOCUMENT_NOT_FOUND' using errcode = 'P0002'; end if;

  select * into v_app from public.applications where id = v_doc.application_id;
  if not public.can_access_owned_record(v_app.workspace_id, v_app.user_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  delete from public.application_documents where id = p_document_id;
  return jsonb_build_object('id', p_document_id, 'deleted', true);
end;
$$;

-- RPC Security Grants
revoke all on function public.rpc_create_resume(uuid, text, text, text, text, text, text, text, text, boolean, uuid) from public, anon;
grant execute on function public.rpc_create_resume(uuid, text, text, text, text, text, text, text, text, boolean, uuid) to authenticated;

revoke all on function public.rpc_clone_resume(uuid, text, text, text) from public, anon;
grant execute on function public.rpc_clone_resume(uuid, text, text, text) to authenticated;

revoke all on function public.rpc_set_default_resume(uuid) from public, anon;
grant execute on function public.rpc_set_default_resume(uuid) to authenticated;

revoke all on function public.rpc_archive_resume(uuid) from public, anon;
grant execute on function public.rpc_archive_resume(uuid) to authenticated;

revoke all on function public.rpc_restore_resume(uuid) from public, anon;
grant execute on function public.rpc_restore_resume(uuid) to authenticated;

revoke all on function public.rpc_delete_resume(uuid) from public, anon;
grant execute on function public.rpc_delete_resume(uuid) to authenticated;

revoke all on function public.rpc_link_application_document(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.rpc_link_application_document(uuid, uuid, text, text, text) to authenticated;

revoke all on function public.rpc_unlink_application_document(uuid) from public, anon;
grant execute on function public.rpc_unlink_application_document(uuid) to authenticated;
