-- =============================================================================
-- JobQuest 2.0 · Milestone 14 — Release Candidate & Migration Rehearsal
-- Migration: 20261020100000_m14_legacy_migration_rehearsal.sql
-- Covers:
--   1. profiles.legacy_user_id column & index for deterministic legacy user mapping
--   2. public.legacy_claim_codes for Option B account claim flow (PINs retired)
--   3. public.migration_batches for auditable migration runs
--   4. public.migration_id_mappings for cross-system dual-storage ID tracing
--   5. Row Level Security and privileges for migration tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. profiles.legacy_user_id
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists legacy_user_id integer null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'uq_profiles_legacy_user_id'
  ) then
    alter table public.profiles
      add constraint uq_profiles_legacy_user_id unique (legacy_user_id);
  end if;
end $$;

create index if not exists idx_profiles_legacy_user_id
  on public.profiles(legacy_user_id)
  where legacy_user_id is not null;

-- -----------------------------------------------------------------------------
-- 1b. applications.legacy_id
-- -----------------------------------------------------------------------------
alter table public.applications
  add column if not exists legacy_id integer null;

create index if not exists idx_applications_legacy_id
  on public.applications(workspace_id, legacy_id)
  where legacy_id is not null;

-- -----------------------------------------------------------------------------
-- 2. legacy_claim_codes (Option B account claim architecture)
-- -----------------------------------------------------------------------------
create table if not exists public.legacy_claim_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.user_accounts(user_id) on delete cascade,
  code_hash   text not null,
  code_hint   varchar(16) not null,
  expires_at  timestamptz not null default (now() + interval '90 days'),
  claimed_at  timestamptz null,
  created_at  timestamptz not null default now(),
  constraint uq_claim_code_user unique (user_id),
  constraint chk_claim_used check ((claimed_at is null) or (claimed_at is not null))
);

create index if not exists idx_legacy_claim_codes_user
  on public.legacy_claim_codes(user_id)
  where claimed_at is null;

alter table public.legacy_claim_codes enable row level security;
revoke all on public.legacy_claim_codes from public, anon;
grant select, insert, update on public.legacy_claim_codes to authenticated;

-- -----------------------------------------------------------------------------
-- 3. migration_batches (Operational migration audit & batch tracking)
-- -----------------------------------------------------------------------------
create table if not exists public.migration_batches (
  batch_id            uuid primary key default gen_random_uuid(),
  source_system       varchar(128) not null default 'JobQuest 1.0 (Neon PostgreSQL)',
  target_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status              varchar(32) not null default 'PENDING',
  summary             jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz null,
  constraint chk_migration_batch_status check (
    status in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'ROLLED_BACK')
  )
);

create index if not exists idx_migration_batches_ws
  on public.migration_batches(target_workspace_id, created_at desc);

alter table public.migration_batches enable row level security;
revoke all on public.migration_batches from public, anon;
grant select, insert, update on public.migration_batches to authenticated;

-- Managers and members can view migration batches in their workspace
create policy migration_batches_select on public.migration_batches for select to authenticated
  using (public.is_workspace_member(target_workspace_id));

-- -----------------------------------------------------------------------------
-- 4. migration_id_mappings (Dual-storage cross-system identifier registry)
-- -----------------------------------------------------------------------------
create table if not exists public.migration_id_mappings (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.migration_batches(batch_id) on delete cascade,
  source_table  varchar(64) not null,
  legacy_id     bigint not null,
  target_table  varchar(64) not null,
  target_id     uuid not null,
  created_at    timestamptz not null default now(),
  constraint uq_migration_source_table_id unique (source_table, legacy_id)
);

create index if not exists idx_migration_mappings_lookup
  on public.migration_id_mappings(target_table, target_id);

create index if not exists idx_migration_mappings_batch
  on public.migration_id_mappings(batch_id);

alter table public.migration_id_mappings enable row level security;
revoke all on public.migration_id_mappings from public, anon;
grant select, insert on public.migration_id_mappings to authenticated;

create policy migration_id_mappings_select on public.migration_id_mappings for select to authenticated
  using (exists (
    select 1 from public.migration_batches b
    where b.batch_id = migration_id_mappings.batch_id
      and public.is_workspace_member(b.target_workspace_id)
  ));
