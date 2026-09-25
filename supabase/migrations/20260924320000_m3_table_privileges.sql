-- =============================================================================
-- Migration: 20260924320000_m3_table_privileges.sql
-- Milestone 3: least-privilege table grants for job_snapshots / application_events.
--
-- 20260924300000 created both tables without revoking Supabase's default
-- privileges, so `anon` (and `authenticated`, beyond what was intended) kept
-- table-level grants such as SELECT, INSERT, TRUNCATE, REFERENCES and TRIGGER.
-- RLS still returned zero rows (every policy is `to authenticated`), but the
-- grants contradicted the M1 pattern ("revoke all, then grant the minimum").
-- Found while diagnosing a preview-only UI state during M3 verification.
--
-- Final state:
--   anon:          no privileges on either table
--   authenticated: job_snapshots  SELECT, INSERT (immutable after capture)
--                  application_events SELECT (append-only; written by RPCs/triggers)
-- =============================================================================

revoke all on public.job_snapshots, public.application_events from anon, authenticated, public;

grant select, insert on public.job_snapshots to authenticated;
grant select on public.application_events to authenticated;
