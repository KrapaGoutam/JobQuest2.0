-- =============================================================================
-- AI-11 multi-instance automations (additive-in-effect; forward-only; data-preserving)
--
-- AI-11A made `(workspace_id, user_id, workflow, primary_provider)` unique because run
-- history was matched to an automation by (workflow, provider). Since AI-11F every
-- scheduled / manual / retry run is linked to its automation (`ai_runs.automation_id`,
-- idempotency keys `auto:<automation_id>:<slot>` / `manual:<automation_id>:<key>` /
-- `retry:<root run>:<n>`, and unique indexes on (automation_id, scheduled_for) and
-- (automation_id, external_run_id)), so the workflow + provider pair no longer needs to
-- identify an automation. An owner may now keep several automations of the same
-- workflow and provider (e.g. Email Intelligence - Morning / Midday / Evening on Claude).
--
-- Kept on purpose:
--   * uq_ai_workflow_configs_owner_name  (workspace_id, user_id, lower(name))  - the
--     duplicate protection is the automation NAME, case-insensitively, per owner.
--   * the per-owner automation limit and every RPC / RLS / grant boundary (untouched).
--
-- Nothing else changes: no row, id, schedule, run or `automation_id` reference is
-- touched, and no replacement index is needed (every automation read filters by
-- workspace + owner, which the name index already prefixes).
-- Production is not touched by this file.
-- =============================================================================

begin;

drop index if exists public.uq_ai_workflow_configs_owner_workflow_provider;

commit;
