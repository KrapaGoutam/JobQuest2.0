-- =============================================================================
-- AI-1A: AI Hub database foundation (additive; no core table changes)
--
-- Tables: ai_runs, ai_findings, ai_suggestions, ai_workflow_configs.
-- Source of truth: ai-hub/DATA_MODEL_PLAN.md (Option C: generic parent + JSONB).
-- Canonical contract: jobquest.ai-result, schema_version MAJOR.MINOR ("1.0").
--
-- Access boundary (final policies/RPCs belong to AI-1B):
--   * RLS enabled on all four tables, NO policies, all client privileges
--     revoked => anon/authenticated can neither read nor write.
--   * service_role keeps full DML (it bypasses RLS) for AI-1B RPCs only.
-- Retention: only findings.expires_at metadata; no purge job here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ai_runs
-- -----------------------------------------------------------------------------
create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.user_accounts(user_id) on delete cascade,
  provider varchar(16) not null,
  workflow varchar(32) not null,
  status varchar(24) not null default 'QUEUED',
  trigger_type varchar(16) not null default 'manual',
  external_run_id varchar(255) null,
  connection_id uuid null, -- FK added with ai_provider_connections (AI-3B)
  schema_version varchar(8) not null default '1.0',
  sources jsonb not null default '[]'::jsonb,
  counts jsonb not null default '{}'::jsonb,
  error_category varchar(32) null,
  error_detail varchar(500) null,
  retry_of_run_id uuid null references public.ai_runs(id) on delete set null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_ai_runs_provider check (provider in ('claude', 'gemini', 'chatgpt', 'manual', 'system')),
  constraint chk_ai_runs_workflow check (workflow in ('daily_brief', 'email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review', 'other')),
  constraint chk_ai_runs_status check (status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'AWAITING_APPROVAL', 'CANCELLED')),
  constraint chk_ai_runs_trigger check (trigger_type in ('scheduled', 'manual', 'retry')),
  constraint chk_ai_runs_schema_version check (schema_version ~ '^[0-9]+\.[0-9]+$'),
  constraint chk_ai_runs_error_category check (
    error_category is null or error_category in (
      'PROVIDER_UNAVAILABLE', 'CONNECTOR_AUTH_EXPIRED', 'SOURCE_UNAVAILABLE',
      'PARTIAL_READ', 'SCHEMA_INVALID', 'TIMEOUT', 'RATE_LIMITED', 'INTERNAL'
    )
  ),
  constraint chk_ai_runs_sources_array check (jsonb_typeof(sources) = 'array'),
  constraint chk_ai_runs_counts_object check (jsonb_typeof(counts) = 'object'),
  constraint chk_ai_runs_not_self_retry check (retry_of_run_id is null or retry_of_run_id <> id),
  constraint chk_ai_runs_completed_after_start check (
    completed_at is null or started_at is null or completed_at >= started_at
  )
);

-- Provider-run idempotency: a rerun of the same (provider, external_run_id) is
-- the same run. Partial so runs without an external id are unconstrained.
create unique index uq_ai_runs_ws_provider_external
  on public.ai_runs(workspace_id, provider, external_run_id)
  where external_run_id is not null;
create index idx_ai_runs_ws_user_created
  on public.ai_runs(workspace_id, user_id, created_at desc);
create index idx_ai_runs_ws_workflow_status
  on public.ai_runs(workspace_id, workflow, status);
create index idx_ai_runs_retry_of
  on public.ai_runs(retry_of_run_id)
  where retry_of_run_id is not null;

-- -----------------------------------------------------------------------------
-- 2. ai_findings
-- -----------------------------------------------------------------------------
create table public.ai_findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.user_accounts(user_id) on delete cascade,
  run_id uuid null references public.ai_runs(id) on delete set null,
  kind varchar(32) not null,
  schema_version varchar(8) not null default '1.0',
  provider varchar(16) not null,
  status varchar(16) not null default 'NEW',
  category varchar(48) null,
  priority varchar(16) not null default 'NORMAL',
  confidence numeric(4,3) null,
  application_id uuid null references public.applications(id) on delete set null,
  match_confidence numeric(4,3) null,
  title varchar(300) not null,
  summary varchar(1000) null,
  occurred_at timestamptz null,
  due_at timestamptz null,
  source_ref jsonb not null default '{}'::jsonb,
  evidence varchar(500) null,
  dedupe_key varchar(255) not null,
  content_hash varchar(128) null,
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_ai_findings_kind check (kind in ('daily_brief', 'email_event', 'job_lead', 'recruiter_intel', 'calendar_event', 'note', 'other')),
  constraint chk_ai_findings_provider check (provider in ('claude', 'gemini', 'chatgpt', 'manual', 'system')),
  constraint chk_ai_findings_status check (status in ('NEW', 'REVIEWED', 'DISMISSED', 'ACCEPTED', 'SUPERSEDED', 'EXPIRED')),
  constraint chk_ai_findings_priority check (priority in ('CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'INFO')),
  constraint chk_ai_findings_schema_version check (schema_version ~ '^[0-9]+\.[0-9]+$'),
  constraint chk_ai_findings_confidence check (confidence is null or confidence between 0 and 1),
  constraint chk_ai_findings_match_confidence check (match_confidence is null or match_confidence between 0 and 1),
  constraint chk_ai_findings_source_ref_object check (jsonb_typeof(source_ref) = 'object'),
  constraint chk_ai_findings_payload_object check (jsonb_typeof(payload) = 'object')
);

-- Dedupe: one finding per (workspace, user, kind, dedupe_key). The key is
-- computed by JobQuest (never by the AI). Provider is deliberately NOT part of
-- the key so the same event seen by two providers collapses to one finding.
-- Related-but-distinct events (invite -> reschedule) use distinct keys.
create unique index uq_ai_findings_dedupe
  on public.ai_findings(workspace_id, user_id, kind, dedupe_key);
create index idx_ai_findings_ws_user_status_created
  on public.ai_findings(workspace_id, user_id, status, created_at desc);
create index idx_ai_findings_run
  on public.ai_findings(run_id)
  where run_id is not null;
create index idx_ai_findings_application
  on public.ai_findings(application_id)
  where application_id is not null;
create index idx_ai_findings_expires
  on public.ai_findings(expires_at)
  where expires_at is not null;

-- -----------------------------------------------------------------------------
-- 3. ai_suggestions (proposals only; never mutate core records in this phase)
-- -----------------------------------------------------------------------------
create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.user_accounts(user_id) on delete cascade,
  finding_id uuid not null references public.ai_findings(id) on delete cascade,
  action varchar(32) not null,
  target_type varchar(32) null,
  target_id uuid null, -- polymorphic by target_type: intentionally no FK
  proposed jsonb not null default '{}'::jsonb,
  status varchar(16) not null default 'PENDING',
  confidence numeric(4,3) null,
  decided_by uuid null references public.user_accounts(user_id) on delete set null,
  decided_at timestamptz null,
  applied_ref jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_ai_suggestions_action check (action in ('set_status', 'create_task', 'create_followup', 'link_contact', 'create_application', 'schedule_interview', 'other')),
  constraint chk_ai_suggestions_status check (status in ('PENDING', 'ACCEPTED', 'IGNORED', 'EXPIRED', 'SUPERSEDED')),
  constraint chk_ai_suggestions_confidence check (confidence is null or confidence between 0 and 1),
  constraint chk_ai_suggestions_proposed_object check (jsonb_typeof(proposed) = 'object'),
  constraint chk_ai_suggestions_decision check (
    (status in ('ACCEPTED', 'IGNORED') and decided_at is not null)
    or (status not in ('ACCEPTED', 'IGNORED') and decided_by is null and decided_at is null)
  )
);

create index idx_ai_suggestions_finding
  on public.ai_suggestions(finding_id);
create index idx_ai_suggestions_ws_user_status
  on public.ai_suggestions(workspace_id, user_id, status, created_at desc);

-- -----------------------------------------------------------------------------
-- 4. ai_workflow_configs (no credentials of any kind in this table)
-- -----------------------------------------------------------------------------
create table public.ai_workflow_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.user_accounts(user_id) on delete cascade,
  workflow varchar(32) not null,
  enabled boolean not null default false,
  primary_provider varchar(16) null,
  fallback_provider varchar(16) null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_ai_workflow_configs_owner_workflow unique (workspace_id, user_id, workflow),
  constraint chk_ai_workflow_configs_workflow check (workflow in ('daily_brief', 'email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review', 'other')),
  constraint chk_ai_workflow_configs_primary check (primary_provider is null or primary_provider in ('claude', 'gemini', 'chatgpt', 'manual', 'system')),
  constraint chk_ai_workflow_configs_fallback check (fallback_provider is null or fallback_provider in ('claude', 'gemini', 'chatgpt', 'manual', 'system')),
  constraint chk_ai_workflow_configs_distinct_providers check (
    fallback_provider is null or primary_provider is null or fallback_provider <> primary_provider
  ),
  constraint chk_ai_workflow_configs_settings_object check (jsonb_typeof(settings) = 'object')
);

-- -----------------------------------------------------------------------------
-- 5. updated_at triggers
-- -----------------------------------------------------------------------------
create trigger trg_ai_runs_updated before update on public.ai_runs
  for each row execute function app.touch_updated_at();
create trigger trg_ai_findings_updated before update on public.ai_findings
  for each row execute function app.touch_updated_at();
create trigger trg_ai_suggestions_updated before update on public.ai_suggestions
  for each row execute function app.touch_updated_at();
create trigger trg_ai_workflow_configs_updated before update on public.ai_workflow_configs
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 6. Safe-by-default access boundary (AI-1B adds SELECT policies and RPCs)
-- -----------------------------------------------------------------------------
alter table public.ai_runs enable row level security;
alter table public.ai_findings enable row level security;
alter table public.ai_suggestions enable row level security;
alter table public.ai_workflow_configs enable row level security;

revoke all on public.ai_runs from public, anon, authenticated;
revoke all on public.ai_findings from public, anon, authenticated;
revoke all on public.ai_suggestions from public, anon, authenticated;
revoke all on public.ai_workflow_configs from public, anon, authenticated;

grant select, insert, update, delete on public.ai_runs to service_role;
grant select, insert, update, delete on public.ai_findings to service_role;
grant select, insert, update, delete on public.ai_suggestions to service_role;
grant select, insert, update, delete on public.ai_workflow_configs to service_role;
