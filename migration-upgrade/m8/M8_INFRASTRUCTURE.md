# Milestone 8 · Infrastructure & Database Architecture

**Milestone:** M8 — Search Analytics, Reports & Goals  
**Database Migration:** `supabase/migrations/20260928100000_m8_analytics_goals.sql`  
**Execution Date:** 2026-09-25  

---

## 1. Environments & Deployment Status

| Environment | Status | Verification | Notes |
| :--- | :--- | :--- | :--- |
| **Local Docker Stack** | **Applied & Verified** | Postgres `55322`, PostgREST `55321` | Applied via local migration runner. Full integration suite passing. |
| **Remote Dev Supabase** (`jobquest-dev` ref `xpnkasclquplmrcmhsif`) | **Applied & Verified** | Remote Postgres via HTTPS Management SQL API | Applied cleanly; Verified via `verify-remote-m8.mjs` with 0 errors. |
| **Production Supabase** | **UNTOUCHED** | Strict constraint preserved | No migration, connection, or credentials executed against prod. |
| **Vercel Preview** | **Ready** | Connected to `jobquest-dev` | Feature branch `feature/m8-analytics-reports` ready for preview build. |
| **Vercel Production** | **UNTOUCHED** | Strict constraint preserved | Main branch and production domain untouched. |

---

## 2. Database Schema Changes

### A. New Table: `public.goals`
Stores weekly and monthly job search activity targets per user and workspace.

```sql
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  period_type text not null check (period_type in ('WEEKLY', 'MONTHLY')),
  target_applications integer not null check (target_applications >= 0),
  target_outreach integer not null check (target_outreach >= 0),
  effective_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compound unique constraint for idempotent weekly/monthly target definitions
create unique index if not exists idx_goals_user_period_date
  on public.goals(workspace_id, user_id, period_type, effective_date);
```

### B. Manager Audit Trigger
Attached to `public.goals` to record whenever a workspace manager modifies another member's goals:
- Trigger function: `public.trg_audit_goals_manager_mutation()`
- Target log: `public.manager_audit_log` with action `MANAGER_GOAL_MUTATION`.

### C. Row-Level Security (RLS)
Enabled on `public.goals`:
- `goals_select`: `can_access_owned_record(workspace_id, user_id)` (owner or workspace manager).
- `goals_insert`: `user_id = auth_uid()` and workspace membership.
- `goals_update`: `can_access_owned_record(workspace_id, user_id)`.
- `goals_delete`: `can_access_owned_record(workspace_id, user_id)`.
- Public/anon: Completely revoked.

---

## 3. High-Performance Analytics RPCs

All analytics aggregations are executed server-side via PostgreSQL `SECURITY DEFINER` functions in `public` schema, strictly verifying `auth.uid()` and workspace membership:

### 1. `rpc_upsert_goal`
- Atomically inserts or updates a goal record on `(workspace_id, user_id, period_type, effective_date)`.
- Automatically grants managers rights to configure targets for members (audited).

### 2. `rpc_get_analytics_overview`
Parameters:
- `p_workspace_id`: Target workspace UUID.
- `p_start_date`: Optional start timestamp (defaults to `now() - interval '90 days'`).
- `p_end_date`: Optional end timestamp (defaults to `now()`).
- `p_user_id`: Optional target member UUID (accessible only to managers; ignored/forced to caller for regular members).

Returns JSON object containing:
- `total_applications`: Count of applications created within range.
- `response_count`: Count of applications receiving responses.
- `interview_count`: Count of applications reaching interviews.
- `offer_count`: Count of applications receiving offers.
- `accepted_count`: Count of offers accepted.
- `median_response_days`: Approximate median days from `APPLIED` to first response event.
- `response_samples`: Number of response data points.
- `weekly_pacing`: Array of last 12 weeks with `week_label`, `applied`, `responses`, `interviews`, and target.
- `current_pipeline`: Count of currently open applications by active stage.
- `historical_funnel`: Cumulative count and percentage of applications having ever reached each lifecycle stage.
- `sources_breakdown`: Application volume, response rate, and interview rate grouped by referral source.
- `resumes_breakdown`: Volume and conversion rates grouped by attached resume version.
- `outcomes_breakdown`: Breakdown of closed applications by outcome reason.
- `active_goal`: Most recent weekly activity goal record.

### 3. `rpc_get_stage_timing`
Parameters:
- `p_workspace_id`, `p_start_date`, `p_end_date`, `p_user_id`.

Returns JSON object containing:
- `transitions`: Array of lifecycle transitions (`Applied → Response`, `Applied → Screen`, `Applied → Interview`, `Interview → Offer`, `Applied → Rejection`, `Full lifecycle`) with median days and sample count.
- `stuck_applications`: Active applications residing in their current stage for 14+ days without progression.
- `follow_up_correlation`: Response rates for applications with completed follow-up tasks vs without follow-ups within 14 days.

---

## 4. Option B Custom Auth & Multi-Workspace Isolation

- Zero Supabase Auth users exist or were created.
- Authentication tokens are custom ES256 JWTs carrying `sub = account_id` and signed by custom cryptographic keys.
- Multi-workspace isolation is enforced at the database level: non-managers cannot access peers' records under any circumstances.
- Direct PostgREST queries and RPC calls authenticate via memory-only access tokens (`supabase-js` `accessToken` callback).
