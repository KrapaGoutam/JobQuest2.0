-- JobQuest 2.0 · Milestone 10 — Import & Export
-- Durable import audit history, owner/manager tenancy, and one atomic commit RPC.
-- Uploaded source bytes are parsed by the Node facade and are never stored here.

alter table public.applications
  add column if not exists last_response_date date null,
  add column if not exists pinned boolean not null default false,
  add column if not exists important boolean not null default false,
  add column if not exists favorite boolean not null default false;

alter table public.applications drop constraint if exists chk_app_employment_type;
alter table public.applications
  add constraint chk_app_employment_type check (
    employment_type is null or employment_type in (
      'Full-time', 'Contract', 'Part-time', 'Internship', 'Temporary', 'Other'
    )
  );

alter table public.application_documents
  add column if not exists label varchar(100) null;

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.user_accounts(user_id) on delete restrict,
  actor_id uuid not null references public.user_accounts(user_id) on delete restrict,
  input_format varchar(24) not null,
  import_mode varchar(24) not null,
  duplicate_action varchar(24) not null,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  created_rows integer not null default 0,
  updated_rows integer not null default 0,
  skipped_rows integer not null default 0,
  rejected_rows integer not null default 0,
  status varchar(24) not null default 'PROCESSING',
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint uq_import_batches_id_workspace unique (id, workspace_id),
  constraint chk_import_batch_format check (input_format in ('CSV', 'XLSX', 'JSON', 'STRUCTURED_TEXT')),
  constraint chk_import_batch_mode check (import_mode in ('VALID_ROWS_ONLY', 'ALL_OR_NOTHING')),
  constraint chk_import_batch_duplicate_action check (duplicate_action in ('SKIP', 'IMPORT_ANYWAY', 'UPDATE_EXISTING')),
  constraint chk_import_batch_status check (status in ('PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED')),
  constraint chk_import_batch_counts check (
    total_rows >= 0 and valid_rows >= 0 and invalid_rows >= 0 and duplicate_rows >= 0
    and created_rows >= 0 and updated_rows >= 0 and skipped_rows >= 0 and rejected_rows >= 0
  )
);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null references public.user_accounts(user_id) on delete restrict,
  row_number integer not null,
  validation_status varchar(16) not null,
  outcome varchar(24) not null,
  messages jsonb not null default '[]'::jsonb,
  row_summary jsonb not null default '{}'::jsonb,
  application_id uuid null,
  created_at timestamptz not null default now(),
  constraint fk_import_rows_batch foreign key (batch_id, workspace_id)
    references public.import_batches(id, workspace_id) on delete cascade,
  constraint fk_import_rows_application foreign key (application_id, workspace_id)
    references public.applications(id, workspace_id) on delete set null,
  constraint uq_import_rows_batch_number unique (batch_id, row_number),
  constraint chk_import_row_number check (row_number > 0),
  constraint chk_import_row_validation check (validation_status in ('VALID', 'WARNING', 'INVALID', 'DUPLICATE')),
  constraint chk_import_row_outcome check (outcome in ('CREATED', 'UPDATED', 'SKIPPED', 'REJECTED', 'NOT_COMMITTED')),
  constraint chk_import_row_messages_array check (jsonb_typeof(messages) = 'array'),
  constraint chk_import_row_summary_object check (jsonb_typeof(row_summary) = 'object')
);

create index if not exists idx_import_batches_ws_owner_created
  on public.import_batches(workspace_id, user_id, created_at desc);
create index if not exists idx_import_batches_ws_actor
  on public.import_batches(workspace_id, actor_id, created_at desc);
create index if not exists idx_import_rows_batch
  on public.import_rows(batch_id, row_number);
create index if not exists idx_import_rows_ws_owner
  on public.import_rows(workspace_id, user_id);

alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;

revoke all on public.import_batches, public.import_rows from public, anon, authenticated;
grant select on public.import_batches, public.import_rows to authenticated;

create policy import_batches_select on public.import_batches for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

create policy import_rows_select on public.import_rows for select to authenticated
  using (public.can_access_owned_record(workspace_id, user_id));

-- Safe date conversion for defensive RPC validation. Invalid values return NULL.
create or replace function app.try_import_date(value text)
returns date language plpgsql immutable set search_path = '' as $$
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return value::date;
exception when others then
  return null;
end;
$$;
revoke all on function app.try_import_date(text) from public, anon, authenticated;

create or replace function public.rpc_commit_import(
  p_workspace_id uuid,
  p_owner_id uuid,
  p_input_format text,
  p_import_mode text,
  p_duplicate_action text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_owner uuid := coalesce(p_owner_id, v_actor);
  v_format text := upper(coalesce(p_input_format, ''));
  v_mode text := upper(coalesce(p_import_mode, ''));
  v_default_action text := upper(coalesce(p_duplicate_action, ''));
  v_batch_id uuid;
  v_row jsonb;
  v_data jsonb;
  v_status text;
  v_action text;
  v_messages jsonb;
  v_summary jsonb;
  v_application_id uuid;
  v_duplicate_id uuid;
  v_contact_id uuid;
  v_row_number integer;
  v_total integer := 0;
  v_valid integer := 0;
  v_invalid integer := 0;
  v_duplicates integer := 0;
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_rejected integer := 0;
  v_date date;
  v_stage text;
  v_app_status text;
  v_outcome text;
begin
  if v_actor is null or not app.session_is_active() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'NOT_A_WORKSPACE_MEMBER' using errcode = '42501';
  end if;
  if v_owner <> v_actor and not public.is_workspace_manager(p_workspace_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if not app.user_is_member(p_workspace_id, v_owner) then
    raise exception 'TARGET_NOT_A_WORKSPACE_MEMBER' using errcode = '42501';
  end if;
  if v_format not in ('CSV', 'XLSX', 'JSON', 'STRUCTURED_TEXT') then
    raise exception 'INVALID_IMPORT_FORMAT' using errcode = '22023';
  end if;
  if v_mode not in ('VALID_ROWS_ONLY', 'ALL_OR_NOTHING') then
    raise exception 'INVALID_IMPORT_MODE' using errcode = '22023';
  end if;
  if v_default_action not in ('SKIP', 'IMPORT_ANYWAY', 'UPDATE_EXISTING') then
    raise exception 'INVALID_DUPLICATE_ACTION' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'ROWS_MUST_BE_AN_ARRAY' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_rows);
  if v_total < 1 or v_total > 1000 then
    raise exception 'IMPORT_ROW_LIMIT' using errcode = '22023', detail = 'Provide 1 to 1000 rows.';
  end if;

  -- Recount and defensively reject malformed canonical rows before any app write.
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_status := upper(coalesce(v_row ->> 'validation_status', 'INVALID'));
    v_data := coalesce(v_row -> 'data', '{}'::jsonb);
    if v_status not in ('VALID', 'WARNING', 'INVALID', 'DUPLICATE')
       or jsonb_typeof(v_data) <> 'object' then
      v_status := 'INVALID';
    end if;
    v_date := app.try_import_date(v_data ->> 'date_applied');
    if nullif(btrim(v_data ->> 'company'), '') is null
       or nullif(btrim(v_data ->> 'job_title'), '') is null
       or char_length(btrim(v_data ->> 'company')) > 128
       or char_length(btrim(v_data ->> 'job_title')) > 128
       or v_date is null then
      v_status := 'INVALID';
    end if;
    if v_status = 'INVALID' then v_invalid := v_invalid + 1;
    else v_valid := v_valid + 1; end if;
  end loop;

  insert into public.import_batches (
    workspace_id, user_id, actor_id, input_format, import_mode, duplicate_action,
    total_rows, valid_rows, invalid_rows, status
  ) values (
    p_workspace_id, v_owner, v_actor, v_format, v_mode, v_default_action,
    v_total, v_valid, v_invalid,
    case when v_invalid > 0 and v_mode = 'ALL_OR_NOTHING' then 'REJECTED' else 'PROCESSING' end
  ) returning id into v_batch_id;

  if v_invalid > 0 and v_mode = 'ALL_OR_NOTHING' then
    for v_row in select value from jsonb_array_elements(p_rows) loop
      v_row_number := greatest(coalesce((v_row ->> 'row_number')::integer, 1), 1);
      v_status := upper(coalesce(v_row ->> 'validation_status', 'INVALID'));
      if v_status not in ('VALID', 'WARNING', 'INVALID', 'DUPLICATE') then v_status := 'INVALID'; end if;
      v_messages := case when jsonb_typeof(v_row -> 'messages') = 'array' then v_row -> 'messages' else '[]'::jsonb end;
      v_summary := case when jsonb_typeof(v_row -> 'summary') = 'object' then v_row -> 'summary' else '{}'::jsonb end;
      insert into public.import_rows (
        batch_id, workspace_id, user_id, row_number, validation_status, outcome, messages, row_summary
      ) values (v_batch_id, p_workspace_id, v_owner, v_row_number, v_status, 'NOT_COMMITTED', v_messages, v_summary);
    end loop;
    update public.import_batches set rejected_rows = v_total, completed_at = now() where id = v_batch_id;
    return jsonb_build_object(
      'import_batch_id', v_batch_id, 'status', 'REJECTED', 'total_rows', v_total,
      'valid_rows', v_valid, 'invalid_rows', v_invalid, 'duplicate_rows', 0,
      'created_rows', 0, 'updated_rows', 0, 'skipped_rows', 0, 'rejected_rows', v_total,
      'created_application_ids', '[]'::jsonb
    );
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_row_number := greatest(coalesce((v_row ->> 'row_number')::integer, 1), 1);
    v_status := upper(coalesce(v_row ->> 'validation_status', 'INVALID'));
    v_data := coalesce(v_row -> 'data', '{}'::jsonb);
    v_messages := case when jsonb_typeof(v_row -> 'messages') = 'array' then v_row -> 'messages' else '[]'::jsonb end;
    v_summary := case when jsonb_typeof(v_row -> 'summary') = 'object' then v_row -> 'summary' else '{}'::jsonb end;
    v_date := app.try_import_date(v_data ->> 'date_applied');

    if v_status not in ('VALID', 'WARNING', 'INVALID', 'DUPLICATE')
       or jsonb_typeof(v_data) <> 'object'
       or nullif(btrim(v_data ->> 'company'), '') is null
       or nullif(btrim(v_data ->> 'job_title'), '') is null
       or char_length(btrim(v_data ->> 'company')) > 128
       or char_length(btrim(v_data ->> 'job_title')) > 128
       or v_date is null then
      v_status := 'INVALID';
    end if;

    if v_status = 'INVALID' then
      v_rejected := v_rejected + 1;
      insert into public.import_rows (
        batch_id, workspace_id, user_id, row_number, validation_status, outcome, messages, row_summary
      ) values (v_batch_id, p_workspace_id, v_owner, v_row_number, 'INVALID', 'REJECTED', v_messages, v_summary);
      continue;
    end if;

    select a.id into v_duplicate_id
      from public.applications a
     where a.workspace_id = p_workspace_id and a.user_id = v_owner
       and lower(btrim(a.company_name)) = lower(btrim(v_data ->> 'company'))
       and lower(btrim(a.role_title)) = lower(btrim(v_data ->> 'job_title'))
       and a.applied_at::date = v_date
       and (
         nullif(regexp_replace(btrim(v_data ->> 'job_url'), '/+$', ''), '') is null
         or regexp_replace(coalesce(a.job_url, ''), '/+$', '') = regexp_replace(btrim(v_data ->> 'job_url'), '/+$', '')
       )
     order by a.created_at desc limit 1;

    v_action := upper(coalesce(nullif(v_row ->> 'duplicate_action', ''), v_default_action));
    if v_action not in ('SKIP', 'IMPORT_ANYWAY', 'UPDATE_EXISTING') then
      raise exception 'INVALID_DUPLICATE_ACTION' using errcode = '22023';
    end if;
    if v_duplicate_id is not null then
      v_duplicates := v_duplicates + 1;
      v_status := 'DUPLICATE';
    end if;

    if v_duplicate_id is not null and v_action = 'SKIP' then
      v_skipped := v_skipped + 1;
      insert into public.import_rows (
        batch_id, workspace_id, user_id, row_number, validation_status, outcome,
        messages, row_summary, application_id
      ) values (v_batch_id, p_workspace_id, v_owner, v_row_number, v_status, 'SKIPPED',
                v_messages, v_summary, v_duplicate_id);
      continue;
    end if;

    v_stage := upper(replace(coalesce(nullif(v_data ->> 'stage', ''), 'APPLIED'), ' ', '_'));
    v_app_status := 'OPEN';
    v_outcome := null;
    if v_stage in ('REJECTED', 'WITHDRAWN', 'GHOSTED', 'POSITION_CLOSED', 'ACCEPTED') then
      v_app_status := 'CLOSED';
      v_outcome := v_stage;
      if v_stage = 'ACCEPTED' then v_stage := 'OFFER'; else v_stage := 'APPLIED'; end if;
    end if;
    if v_stage not in ('SAVED', 'PREPARING', 'APPLIED', 'ASSESSMENT', 'RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER') then
      raise exception 'INVALID_STAGE' using errcode = '23514';
    end if;

    if v_duplicate_id is not null and v_action = 'UPDATE_EXISTING' then
      update public.applications set
        company_name = btrim(v_data ->> 'company'), role_title = btrim(v_data ->> 'job_title'),
        job_url = nullif(btrim(v_data ->> 'job_url'), ''),
        location = nullif(btrim(v_data ->> 'location'), ''),
        work_arrangement = nullif(v_data ->> 'work_arrangement', ''),
        employment_type = nullif(v_data ->> 'employment_type', ''),
        source = nullif(btrim(v_data ->> 'source'), ''), stage = v_stage,
        status = v_app_status, outcome = v_outcome,
        closed_at = case when v_app_status = 'CLOSED' then coalesce(closed_at, now()) else null end,
        priority = upper(coalesce(nullif(v_data ->> 'priority', ''), 'MEDIUM')),
        salary_min = nullif(v_data ->> 'salary_min', '')::numeric,
        salary_max = nullif(v_data ->> 'salary_max', '')::numeric,
        salary_currency = upper(coalesce(nullif(v_data ->> 'salary_currency', ''), 'USD')),
        notes = nullif(v_data ->> 'notes', ''), next_action = nullif(v_data ->> 'next_action', ''),
        next_action_date = app.try_import_date(v_data ->> 'next_action_date'),
        last_response_date = app.try_import_date(v_data ->> 'last_response_date'),
        external_job_id = nullif(btrim(v_data ->> 'external_job_id'), ''),
        tags = case when jsonb_typeof(v_data -> 'tags') = 'array'
          then array(select jsonb_array_elements_text(v_data -> 'tags')) else '{}'::text[] end,
        pinned = coalesce((v_data ->> 'pinned')::boolean, false),
        important = coalesce((v_data ->> 'important')::boolean, false),
        favorite = coalesce((v_data ->> 'favorite')::boolean, false),
        applied_at = v_date::timestamptz,
        last_activity_at = now()
      where id = v_duplicate_id;
      v_application_id := v_duplicate_id;
      v_updated := v_updated + 1;
    else
      insert into public.applications (
        workspace_id, user_id, company_name, role_title, job_url, location,
        work_arrangement, employment_type, source, stage, status, outcome, closed_at,
        priority, salary_min, salary_max, salary_currency, notes, next_action,
        next_action_date, last_response_date, external_job_id, tags,
        pinned, important, favorite, applied_at, duplicate_override_flag
      ) values (
        p_workspace_id, v_owner, btrim(v_data ->> 'company'), btrim(v_data ->> 'job_title'),
        nullif(btrim(v_data ->> 'job_url'), ''), nullif(btrim(v_data ->> 'location'), ''),
        nullif(v_data ->> 'work_arrangement', ''), nullif(v_data ->> 'employment_type', ''),
        nullif(btrim(v_data ->> 'source'), ''), v_stage, v_app_status, v_outcome,
        case when v_app_status = 'CLOSED' then now() else null end,
        upper(coalesce(nullif(v_data ->> 'priority', ''), 'MEDIUM')),
        nullif(v_data ->> 'salary_min', '')::numeric, nullif(v_data ->> 'salary_max', '')::numeric,
        upper(coalesce(nullif(v_data ->> 'salary_currency', ''), 'USD')),
        nullif(v_data ->> 'notes', ''), nullif(v_data ->> 'next_action', ''),
        app.try_import_date(v_data ->> 'next_action_date'), app.try_import_date(v_data ->> 'last_response_date'),
        nullif(btrim(v_data ->> 'external_job_id'), ''),
        case when jsonb_typeof(v_data -> 'tags') = 'array'
          then array(select jsonb_array_elements_text(v_data -> 'tags')) else '{}'::text[] end,
        coalesce((v_data ->> 'pinned')::boolean, false),
        coalesce((v_data ->> 'important')::boolean, false),
        coalesce((v_data ->> 'favorite')::boolean, false),
        v_date::timestamptz, v_duplicate_id is not null
      ) returning id into v_application_id;
      v_created := v_created + 1;
    end if;

    if nullif(v_data ->> 'job_description', '') is not null
       and not exists (select 1 from public.job_snapshots s where s.application_id = v_application_id) then
      insert into public.job_snapshots(application_id, workspace_id, job_description)
      values (v_application_id, p_workspace_id, v_data ->> 'job_description');
    end if;
    if nullif(v_data ->> 'resume_version', '') is not null then
      insert into public.application_documents(application_id, workspace_id, document_type, label)
      values (v_application_id, p_workspace_id, 'RESUME', left(btrim(v_data ->> 'resume_version'), 100));
    end if;
    if nullif(v_data ->> 'cover_letter_version', '') is not null then
      insert into public.application_documents(application_id, workspace_id, document_type, label)
      values (v_application_id, p_workspace_id, 'COVER_LETTER', left(btrim(v_data ->> 'cover_letter_version'), 100));
    end if;
    if nullif(v_data ->> 'recruiter_name', '') is not null then
      select c.id into v_contact_id from public.contacts c
       where c.workspace_id = p_workspace_id and c.user_id = v_owner
         and lower(btrim(c.full_name)) = lower(btrim(v_data ->> 'recruiter_name'))
         and (nullif(v_data ->> 'recruiter_email', '') is null
              or lower(coalesce(c.email, '')) = lower(v_data ->> 'recruiter_email'))
       order by c.created_at limit 1;
      if v_contact_id is null then
        insert into public.contacts(
          workspace_id, user_id, company_name, full_name, relationship_type, email, phone
        ) values (
          p_workspace_id, v_owner, btrim(v_data ->> 'company'), btrim(v_data ->> 'recruiter_name'),
          'RECRUITER', nullif(btrim(v_data ->> 'recruiter_email'), ''),
          nullif(btrim(v_data ->> 'recruiter_phone'), '')
        ) returning id into v_contact_id;
      end if;
      insert into public.application_contacts(application_id, contact_id, workspace_id, role_in_process)
      values (v_application_id, v_contact_id, p_workspace_id, 'RECRUITER')
      on conflict (application_id, contact_id) do nothing;
    end if;

    insert into public.import_rows (
      batch_id, workspace_id, user_id, row_number, validation_status, outcome,
      messages, row_summary, application_id
    ) values (
      v_batch_id, p_workspace_id, v_owner, v_row_number, v_status,
      case when v_duplicate_id is not null and v_action = 'UPDATE_EXISTING' then 'UPDATED' else 'CREATED' end,
      v_messages, v_summary, v_application_id
    );
  end loop;

  update public.import_batches set
    duplicate_rows = v_duplicates, created_rows = v_created, updated_rows = v_updated,
    skipped_rows = v_skipped, rejected_rows = v_rejected, status = 'COMPLETED', completed_at = now()
  where id = v_batch_id;

  return jsonb_build_object(
    'import_batch_id', v_batch_id, 'status', 'COMPLETED', 'total_rows', v_total,
    'valid_rows', v_valid, 'invalid_rows', v_invalid, 'duplicate_rows', v_duplicates,
    'created_rows', v_created, 'updated_rows', v_updated, 'skipped_rows', v_skipped,
    'rejected_rows', v_rejected,
    'created_application_ids', coalesce((
      select jsonb_agg(r.application_id order by r.row_number)
      from public.import_rows r where r.batch_id = v_batch_id and r.outcome = 'CREATED'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.rpc_commit_import(uuid, uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.rpc_commit_import(uuid, uuid, text, text, text, jsonb) to authenticated;

comment on table public.import_batches is
  'M10 import audit metadata. Source file bytes and raw input are intentionally not retained.';
comment on column public.import_rows.row_summary is
  'Small canonical display summary only; never the raw uploaded row.';
