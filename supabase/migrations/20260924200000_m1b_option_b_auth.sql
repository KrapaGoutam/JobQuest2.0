-- =============================================================================
-- JobQuest 2.0 · M1B · Auth Option B amendment
-- (gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md)
--
-- Option A (Supabase Auth user identities with a synthetic email) FAILED in M1.
-- Option B: the Node API owns credentials and sessions and mints short-lived ES256
-- access JWTs (sub = user_accounts.user_id, role = authenticated, session_id).
-- The Supabase Data API verifies them against the project's trusted signing key.
-- auth.uid() reads the JWT `sub` claim, and RLS stays the only data-isolation layer.
--
-- This migration is additive and amending. The M1 foundation migration stays as
-- applied history; the Option A-only objects it created are removed here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Identity is application-owned: no dependency on auth.users
-- -----------------------------------------------------------------------------
alter table public.user_accounts drop constraint if exists user_accounts_user_id_fkey;
alter table public.user_accounts alter column user_id set default gen_random_uuid();
comment on column public.user_accounts.user_id is
  'Application-owned user id (Option B). Equals the JWT sub claim and auth.uid(). Not an auth.users id.';

-- Option A-only objects
drop function if exists public.rpc_bootstrap_account(uuid, text, text, text, text, text[], text[]);
drop function if exists public.custom_access_token_hook(jsonb);

-- -----------------------------------------------------------------------------
-- 2. user_credentials: password verifier, separate from identity metadata
-- -----------------------------------------------------------------------------
create table public.user_credentials (
  user_id              uuid primary key references public.user_accounts(user_id) on delete cascade,
  password_hash        text not null,                      -- PHC string (contains salt + params)
  password_algorithm   varchar(16) not null default 'argon2id',
  password_version     smallint not null default 1,        -- policy version; bump to force rehash
  password_changed_at  timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint chk_credentials_algorithm check (password_algorithm in ('argon2id')),
  constraint chk_credentials_phc check (password_hash like '$argon2id$%')
);
create trigger trg_user_credentials_updated before update on public.user_credentials
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3. auth_sessions: one row per signed-in device/session (revocable)
-- -----------------------------------------------------------------------------
create table public.auth_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.user_accounts(user_id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz not null default now(),
  expires_at      timestamptz not null,                   -- absolute session lifetime
  revoked_at      timestamptz null,
  revoked_reason  varchar(32) null,
  user_agent      varchar(256) null,
  ip_hash         char(64) null,                          -- sha256 of client IP, never raw
  constraint chk_session_revocation check ((revoked_at is null) = (revoked_reason is null)),
  constraint chk_session_reason check (revoked_reason is null or revoked_reason in (
    'LOGOUT', 'LOGOUT_ALL', 'PASSWORD_CHANGED', 'RECOVERY', 'REFRESH_REUSE', 'ADMIN'))
);
create index idx_auth_sessions_user_active on public.auth_sessions(user_id) where revoked_at is null;

-- -----------------------------------------------------------------------------
-- 4. auth_refresh_tokens: rotating, single-use refresh token verifiers
--    The raw token is 256 random bits shown only to the browser (HttpOnly cookie).
--    Only SHA-256(token) is stored. A fast hash is appropriate here: unlike a
--    password, a 256-bit random secret cannot be guessed, and it needs indexed lookup.
-- -----------------------------------------------------------------------------
create table public.auth_refresh_tokens (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.auth_sessions(id) on delete cascade,
  token_hash   char(64) not null unique,
  parent_id    uuid null references public.auth_refresh_tokens(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz null                             -- set exactly once, on rotation
);
create index idx_refresh_tokens_session on public.auth_refresh_tokens(session_id);

-- -----------------------------------------------------------------------------
-- 5. auth_rate_limits: shared fixed-window counters (works across serverless instances)
-- -----------------------------------------------------------------------------
create table public.auth_rate_limits (
  bucket        varchar(160) primary key,                  -- e.g. 'login:ip:<sha256>'
  window_start  timestamptz not null,
  hits          integer not null
);

-- -----------------------------------------------------------------------------
-- 6. Lock the new system tables away from the Data API (service role / RPC only)
-- -----------------------------------------------------------------------------
alter table public.user_credentials    enable row level security;
alter table public.auth_sessions       enable row level security;
alter table public.auth_refresh_tokens enable row level security;
alter table public.auth_rate_limits    enable row level security;
revoke all on public.user_credentials, public.auth_sessions, public.auth_refresh_tokens,
              public.auth_rate_limits from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Session liveness now reads the application-owned session table.
--    A logged-out / revoked session loses data access immediately, even though its
--    stateless access JWT has not expired yet.
-- -----------------------------------------------------------------------------
create or replace function app.session_is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.auth_sessions s
    where s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
      and s.user_id = (select auth.uid())
      and s.revoked_at is null
      and s.expires_at > now()
  );
$$;

-- -----------------------------------------------------------------------------
-- 8. Privileged auth RPCs: service role only (called by the Node API)
-- -----------------------------------------------------------------------------

-- Registration: account, credential, profile, personal workspace (caller = MANAGER),
-- 10 recovery-code verifiers. One transaction.
create or replace function public.rpc_register_account(
  p_username text, p_password_hash text, p_display_name text, p_email text, p_phone text,
  p_code_hashes text[], p_code_hints text[])
returns table (user_id uuid, workspace_id uuid)
language plpgsql security definer set search_path = '' as $$
declare uid uuid; ws uuid;
begin
  if coalesce(array_length(p_code_hashes, 1), 0) <> 10 or coalesce(array_length(p_code_hints, 1), 0) <> 10 then
    raise exception 'RECOVERY_CODE_SET_MUST_BE_10' using errcode = 'P0001';
  end if;
  insert into public.user_accounts(username, username_clean)
    values (p_username, lower(p_username)) returning user_accounts.user_id into uid;
  insert into public.user_credentials(user_id, password_hash) values (uid, p_password_hash);
  insert into public.profiles(user_id, display_name, email, phone)
    values (uid, coalesce(nullif(p_display_name, ''), p_username), nullif(p_email, ''), nullif(p_phone, ''));
  insert into public.workspaces(name, slug, workspace_type, created_by)
    values ('Personal', 'personal-' || replace(gen_random_uuid()::text, '-', ''), 'PERSONAL', uid)
    returning id into ws;
  insert into public.workspace_members(workspace_id, user_id, role) values (ws, uid, 'MANAGER');
  insert into public.auth_recovery_codes(user_id, code_hash, code_hint)
    select uid, h, t from unnest(p_code_hashes, p_code_hints) as x(h, t);
  update public.profiles set last_active_workspace_id = ws where profiles.user_id = uid;
  return query select uid, ws;
end; $$;

-- New session plus its first refresh token.
create or replace function public.rpc_create_session(
  p_user_id uuid, p_refresh_hash text, p_session_seconds integer, p_refresh_seconds integer,
  p_user_agent text, p_ip_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  insert into public.auth_sessions(user_id, expires_at, user_agent, ip_hash)
    values (p_user_id, now() + make_interval(secs => p_session_seconds), left(p_user_agent, 256), p_ip_hash)
    returning id into sid;
  insert into public.auth_refresh_tokens(session_id, token_hash, expires_at)
    values (sid, p_refresh_hash,
            least(now() + make_interval(secs => p_refresh_seconds), now() + make_interval(secs => p_session_seconds)));
  return sid;
end; $$;

-- Single-use rotation with replay detection. There is no grace window.
--  * 'ok'      : the presented token was live; it is now consumed and a child token issued.
--  * 'reused'  : the presented token was ALREADY consumed. It is treated as stolen or replayed,
--                and the whole session is revoked (every token in the family dies with it).
--  * 'invalid' : unknown, expired, or its session is revoked or expired.
-- Concurrency: the conditional UPDATE takes a row lock, so of N concurrent
-- rotations of the same token exactly one sees used_at IS NULL.
create or replace function public.rpc_rotate_refresh_token(
  p_token_hash text, p_new_hash text, p_refresh_seconds integer)
returns table (status text, session_id uuid, user_id uuid)
language plpgsql security definer set search_path = '' as $$
declare t record; s record;
begin
  update public.auth_refresh_tokens r
     set used_at = now()
   where r.token_hash = p_token_hash and r.used_at is null and r.expires_at > now()
  returning r.id, r.session_id into t;

  if t.id is null then
    select r.session_id, r.used_at into s from public.auth_refresh_tokens r where r.token_hash = p_token_hash;
    if s.session_id is not null and s.used_at is not null then
      update public.auth_sessions a set revoked_at = now(), revoked_reason = 'REFRESH_REUSE'
       where a.id = s.session_id and a.revoked_at is null;
      return query select 'reused'::text, s.session_id, null::uuid;
    else
      return query select 'invalid'::text, null::uuid, null::uuid;
    end if;
    return;
  end if;

  select a.id, a.user_id, a.expires_at into s from public.auth_sessions a
   where a.id = t.session_id and a.revoked_at is null and a.expires_at > now();
  if s.id is null then
    return query select 'invalid'::text, null::uuid, null::uuid;
    return;
  end if;

  insert into public.auth_refresh_tokens(session_id, token_hash, parent_id, expires_at)
    values (s.id, p_new_hash, t.id, least(now() + make_interval(secs => p_refresh_seconds), s.expires_at));
  update public.auth_sessions a set last_used_at = now() where a.id = s.id;
  return query select 'ok'::text, s.id, s.user_id;
end; $$;

-- Look up the live session a refresh token belongs to (for logout).
create or replace function public.rpc_session_for_refresh(p_token_hash text)
returns table (session_id uuid, user_id uuid)
language sql stable security definer set search_path = '' as $$
  select a.id, a.user_id from public.auth_refresh_tokens r
    join public.auth_sessions a on a.id = r.session_id
   where r.token_hash = p_token_hash and a.revoked_at is null;
$$;

-- Revoke one session, or all of a user's sessions except (optionally) one.
create or replace function public.rpc_revoke_sessions(
  p_user_id uuid, p_session_id uuid, p_all boolean, p_except_session uuid, p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.auth_sessions a set revoked_at = now(), revoked_reason = p_reason
   where a.user_id = p_user_id and a.revoked_at is null
     and (p_all or a.id = p_session_id)
     and (p_except_session is null or a.id <> p_except_session);
  get diagnostics n = row_count;
  return n;
end; $$;

-- Is this (session, user) pair live? Used by the Node API for bearer-authenticated routes.
create or replace function public.rpc_session_is_live(p_session_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.auth_sessions a
                 where a.id = p_session_id and a.user_id = p_user_id
                   and a.revoked_at is null and a.expires_at > now());
$$;

-- Logged-in password change: new verifier; revoke every OTHER session (policy:
-- the session that performed the change stays valid).
create or replace function public.rpc_change_password(
  p_user_id uuid, p_new_hash text, p_keep_session uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.user_credentials c
     set password_hash = p_new_hash, password_changed_at = now()
   where c.user_id = p_user_id;
  if not found then raise exception 'NO_CREDENTIAL' using errcode = 'P0001'; end if;
  update public.auth_sessions a set revoked_at = now(), revoked_reason = 'PASSWORD_CHANGED'
   where a.user_id = p_user_id and a.revoked_at is null and a.id <> p_keep_session;
  get diagnostics n = row_count;
  return n;
end; $$;

-- Recovery: consume one code (single use), set the new verifier, revoke ALL
-- sessions, clear lockouts. Atomic: either all of it happens or none of it.
create or replace function public.rpc_recover_account(
  p_user_id uuid, p_code_id uuid, p_new_hash text, p_ip inet)
returns integer language plpgsql security definer set search_path = '' as $$
declare remaining integer;
begin
  update public.auth_recovery_codes rc set is_used = true, used_at = now(), used_ip = p_ip
   where rc.id = p_code_id and rc.user_id = p_user_id and rc.is_used = false;
  if not found then raise exception 'CODE_ALREADY_USED' using errcode = 'P0001'; end if;
  update public.user_credentials c set password_hash = p_new_hash, password_changed_at = now()
   where c.user_id = p_user_id;
  update public.auth_sessions a set revoked_at = now(), revoked_reason = 'RECOVERY'
   where a.user_id = p_user_id and a.revoked_at is null;
  update public.user_accounts u set failed_login_count = 0, locked_until = null,
         failed_recovery_count = 0, recovery_locked_until = null
   where u.user_id = p_user_id;
  select count(*) into remaining from public.auth_recovery_codes rc
   where rc.user_id = p_user_id and rc.is_used = false;
  return remaining;
end; $$;

-- Durable per-account failure accounting (login or recovery). Returns lock expiry or NULL.
create or replace function public.rpc_record_auth_failure(
  p_user_id uuid, p_kind text, p_max integer, p_lock_minutes integer)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare lock_until timestamptz;
begin
  if p_kind = 'login' then
    update public.user_accounts u
       set failed_login_count = u.failed_login_count + 1,
           locked_until = case when u.failed_login_count + 1 >= p_max
                               then now() + make_interval(mins => p_lock_minutes) else u.locked_until end
     where u.user_id = p_user_id returning u.locked_until into lock_until;
  elsif p_kind = 'recovery' then
    update public.user_accounts u
       set failed_recovery_count = u.failed_recovery_count + 1,
           recovery_locked_until = case when u.failed_recovery_count + 1 >= p_max
                               then now() + make_interval(mins => p_lock_minutes) else u.recovery_locked_until end
     where u.user_id = p_user_id returning u.recovery_locked_until into lock_until;
  else
    raise exception 'BAD_KIND' using errcode = '22023';
  end if;
  return lock_until;
end; $$;

create or replace function public.rpc_clear_login_failures(p_user_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.user_accounts set failed_login_count = 0, locked_until = null where user_id = p_user_id;
$$;

-- Shared fixed-window rate limiter. Returns seconds to wait (0 = allowed).
create or replace function public.rpc_rate_limit_hit(p_bucket text, p_max integer, p_window_seconds integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; win interval := make_interval(secs => p_window_seconds);
begin
  insert into public.auth_rate_limits as l (bucket, window_start, hits)
    values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set hits = case when l.window_start + win <= now() then 1 else l.hits + 1 end,
        window_start = case when l.window_start + win <= now() then now() else l.window_start end
  returning l.window_start, l.hits into r;
  if r.hits > p_max then
    return greatest(1, ceil(extract(epoch from (r.window_start + win - now())))::integer);
  end if;
  return 0;
end; $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.rpc_register_account(text, text, text, text, text, text[], text[])',
    'public.rpc_create_session(uuid, text, integer, integer, text, text)',
    'public.rpc_rotate_refresh_token(text, text, integer)',
    'public.rpc_session_for_refresh(text)',
    'public.rpc_revoke_sessions(uuid, uuid, boolean, uuid, text)',
    'public.rpc_session_is_live(uuid, uuid)',
    'public.rpc_change_password(uuid, text, uuid)',
    'public.rpc_recover_account(uuid, uuid, text, inet)',
    'public.rpc_record_auth_failure(uuid, text, integer, integer)',
    'public.rpc_clear_login_failures(uuid)',
    'public.rpc_rate_limit_hit(text, integer, integer)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
