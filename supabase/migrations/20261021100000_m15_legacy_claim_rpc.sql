-- =============================================================================
-- JobQuest 2.0 · M15 · Legacy Account Claim RPC
-- Provides an atomic transition for migrated legacy accounts.
-- =============================================================================

create or replace function public.rpc_claim_legacy_account(
  p_user_id uuid,
  p_code_id uuid,
  p_new_hash text,
  p_ip inet
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- 1. Consume the claim code
  update public.legacy_claim_codes lc
     set claimed_at = now()
   where lc.id = p_code_id
     and lc.user_id = p_user_id
     and lc.claimed_at is null
     and lc.expires_at > now();
     
  if not found then
    raise exception 'CLAIM_CODE_INVALID_OR_USED' using errcode = 'P0001';
  end if;

  -- 2. Update credentials
  update public.user_credentials c
     set password_hash = p_new_hash,
         password_changed_at = now()
   where c.user_id = p_user_id;

  if not found then
    -- It should have a credential row from M14 migration (even if empty/placeholder)
    -- If not, insert it
    insert into public.user_credentials (user_id, password_hash, password_changed_at)
    values (p_user_id, p_new_hash, now());
  end if;

  -- 3. Revoke any existing sessions (shouldn't be any, but just in case)
  update public.auth_sessions a
     set revoked_at = now(),
         revoked_reason = 'RECOVERY'
   where a.user_id = p_user_id
     and a.revoked_at is null;

  -- 4. Activate the user account and clear failures
  update public.user_accounts u
     set status = 'ACTIVE',
         failed_login_count = 0,
         locked_until = null,
         failed_recovery_count = 0,
         recovery_locked_until = null
   where u.user_id = p_user_id;

end; $$;

-- Lock down access
revoke all on function public.rpc_claim_legacy_account(uuid, uuid, text, inet) from public, anon, authenticated;
grant execute on function public.rpc_claim_legacy_account(uuid, uuid, text, inet) to service_role;
