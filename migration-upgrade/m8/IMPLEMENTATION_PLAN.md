# Milestone 8 · Implementation Plan — Analytics & Reports

**Milestone:** M8  
**Domain:** Analytics, Reports, Funnels, Stage Timing, Aging & Goals  
**Target Date:** 2026-09-25  

---

## 1. Objective
Build the comprehensive **Analytics & Reports** subsystem for JobQuest 2.0 based on approved Gate 02B designs (`07-analytics.html`, Y1–Y5, R3, E7–E9) and Gate 03 target schema (Table #20 `goals`). Ensure mathematical fidelity in historical funnel reporting ("ever reached"), transparent ratio presentation (`N/D (X%)`), sample size safety, multi-dimensional stage timing, aging reports with actionable review triage, and goal pacing.

---

## 2. Scope Boundaries

### Strictly Included Scope
1. **Gate 03 Table #20 `goals`:**
   - PostgreSQL schema for weekly/monthly application and outreach activity targets.
   - Unique constraint `(workspace_id, user_id, period_type, effective_date)`.
   - RLS: owner scoped for users, workspace-scoped for managers, peer isolation, manager mutation auditing.
2. **Analytics Aggregation Engine (Direct Data API + Stored Procedures):**
   - Overview metrics: Total Applications, Response Rate, Interview Rate, Offer Rate, Median Days to Response.
   - Pacing chart: 12-week rolling activity (applications, responses, interviews vs weekly goal).
   - Current Pipeline: open application count per current stage.
   - Historical Funnel ("Ever Reached"): computed from `application_events` to preserve fidelity even when applications are closed/rejected.
   - Source Effectiveness: application volume, response rate, and interview rate by source.
   - Resume Effectiveness: conversion performance by resume version used.
   - Outcome Distribution: breakdown of closed outcomes (`REJECTED`, `GHOSTED`, `WITHDRAWN`, `POSITION_CLOSED`, `ACCEPTED`) and terminal stage reached.
   - Stage Timing: median and range of days between transitions, stuck applications list (14+ days), follow-up correlation.
   - Aging Bands: 5 canonical bands (New, Waiting, Follow-Up Recommended, Stale, Long Waiting) with inline actions (`Keep Active`, `Mark Ghosted`, `Archive`).
   - Goals & Pacing: target setting and weekly tracking.
   - Data Export: Client-side CSV/JSON export with formula injection mitigation.
3. **React Surfaces:**
   - Route `/analytics` with tabs: `Overview`, `Stage timing`, `Aging`, `Goals`.
   - Date range selector: `30d`, `90d`, `180d`, `1y`, `Custom`.
   - Manager member selector dropdown for workspace-wide vs single member filtering.
   - Goal Target modal.
   - Responsive layout adapting to mobile screens (Y5 single-column cards, horizontal bars).

### Strictly Excluded Scope
- Production cutover or legacy production data migration (deferred to M14).
- Production Supabase or production Vercel changes.
- Modification of `../JobQuest1.0/`.
- Merging to `main`.
- Native mobile app or browser extension porting (M10).

---

## 3. Database & RLS Architecture

### Table Definition: `public.goals`
```sql
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.user_accounts(user_id) on delete cascade,
  period_type text not null default 'WEEKLY',
  target_applications integer not null default 15,
  target_outreach integer not null default 5,
  effective_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_id integer null,
  constraint chk_goals_period check (period_type in ('DAILY', 'WEEKLY', 'MONTHLY')),
  constraint chk_goals_target_apps check (target_applications >= 0),
  constraint chk_goals_target_outreach check (target_outreach >= 0),
  constraint uq_goals_user_effective unique (workspace_id, user_id, period_type, effective_date)
);
```

### RLS Policies
- `goals_select`: `can_access_owned_record(workspace_id, user_id)`
- `goals_insert`: `can_access_owned_record(workspace_id, user_id) and user_id = auth_uid()`
- `goals_update`: `can_access_owned_record(workspace_id, user_id)` (with manager mutation audit trigger)
- `goals_delete`: `can_access_owned_record(workspace_id, user_id)`
- Anonymous access: completely revoked.

### Database RPC Functions
1. `rpc_upsert_goal`: Atomically sets or updates active weekly/monthly goals for a user in a workspace.
2. `rpc_get_analytics_overview`: Aggregates overview metrics, weekly pacing, current pipeline, historical funnel, sources, and resume conversions for a workspace and date range, with optional user filter.
3. `rpc_get_stage_timing`: Computes median days, ranges, stuck applications, and follow-up correlation.

---

## 4. UI Architecture & Components

- `apps/web/src/views/AnalyticsView.tsx`: Main route `/analytics` with header, date range controls, manager filter, and tabs.
- `apps/web/src/components/analytics/AnalyticsOverviewTab.tsx`: KPI cards, weekly pace chart, side-by-side funnel and pipeline, source and resume tables, outcome breakdown.
- `apps/web/src/components/analytics/StageTimingTab.tsx`: Duration matrix, stuck applications, follow-up impact.
- `apps/web/src/components/analytics/AgingReportTab.tsx`: 5 aging bands, Long Waiting alert banner, triage table.
- `apps/web/src/components/analytics/GoalsTab.tsx`: Goal targets, weekly pacing table, and Edit Goal dialog modal.
- `apps/web/src/components/analytics/EditGoalModal.tsx`: Dialog to adjust weekly application and outreach targets.

---

## 5. Security & Isolation
- Option B ES256 auth headers verified on every request.
- Multi-workspace isolation: PostgREST queries and RPCs enforce `workspace_id = current_workspace`.
- Formula injection protection: CSV export sanitizes fields starting with `=`, `+`, `-`, `@`.
- Cross-user manager mutations on goals trigger security audit logs in `manager_audit_log`.

---

## 6. Test Matrix
- Unit tests: Ratio formatting (`formatRatio`), sample size thresholding (<5 check), date range calculations, CSV export sanitization.
- Integration tests (`tests/integration/m8-analytics.test.ts`):
  - Historical funnel ("ever reached") calculation accuracy from `application_events`.
  - Peer isolation on goals.
  - Manager workspace aggregate vs single member filtering.
  - Stage timing and aging band calculations.
  - Anonymous denial.
- Playwright E2E (`e2e/m8-analytics.spec.ts`):
  - Tab switching between Overview, Stage timing, Aging, and Goals.
  - Editing goals target.
  - Aging triage actions.
  - Date range filtering.
  - Light and dark theme screenshots.
  - Automated Axe-core accessibility audits (0 critical, 0 serious).
