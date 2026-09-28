# Milestone 8 · Test Plan — Analytics & Reports

**Target Environments:**
- Local PostgreSQL (`55322`) + PostgREST (`55321`)
- Hosted Remote Development Supabase (`jobquest-dev`)
- Playwright Chromium Test Runner

---

## 1. Unit Tests (`tests/unit/m8-analytics.test.ts`)
1. **Ratio Formatting (`formatAnalyticsRate`):**
   - Correctly renders numerator, denominator, and percentage: `31 / 142 (21.8%)`.
   - Denominators < 5 with small flag display `"Insufficient data (<5)"`.
   - Denominators equal to 0 display `"No data"`.
2. **Date Range Computations:**
   - Computes correct ISO date boundaries for `30d`, `90d`, `180d`, `1y`.
3. **CSV Export Sanitization (Formula Injection Prevention):**
   - Automatically prefixes leading `=`, `+`, `-`, `@` with a single quote.
   - Escapes quotes and commas appropriately.

---

## 2. Integration Tests (`tests/integration/m8-analytics.test.ts`)
1. **M8-01 · Goals CRUD & Unique Constraints:**
   - Insert weekly goal for user in workspace.
   - Verify unique constraint `(workspace_id, user_id, period_type, effective_date)`.
   - Verify update via `rpc_upsert_goal`.
2. **M8-02 · Peer Isolation on Goals:**
   - Peer in same workspace cannot read or update another member's private goal.
3. **M8-03 · Manager Same-Workspace Goal Access & Audit:**
   - Workspace manager can read member's goals.
   - Manager mutation writes to `manager_audit_log`.
4. **M8-04 · Historical Funnel Fidelity ("Ever Reached"):**
   - Create applications, advance stages via `rpc_advance_stage` (logging events), and reject an application.
   - Verify that the rejected application is still counted in "ever reached" Interview metrics.
5. **M8-05 · Aging Bands Classification:**
   - Test applications created with varying simulated `last_activity_at` dates.
   - Verify correct categorization into New (≤3d), Waiting (≤7d), Follow-Up Recommended (≤14d), Stale (≤30d), and Long Waiting (>30d).
6. **M8-06 · Manager Aggregate vs Filtered User Analytics:**
   - Verify manager overview aggregates metrics across all workspace members when `filter_user_id` is null, and isolates metrics when `filter_user_id` is specified.
7. **M8-07 · Anonymous Denial:**
   - Unauthenticated access to `goals` or analytics RPCs is denied.

---

## 3. Playwright E2E Tests (`e2e/m8-analytics.spec.ts`)
1. Register user and authenticate with Option B credentials.
2. Create sample applications and contacts across stages.
3. Navigate to `/analytics`.
4. Validate Overview tab KPIs, weekly activity chart, current pipeline, and historical funnel.
5. Capture screenshots:
   - `Y1-analytics-light.png`
   - `Y2-analytics-dark.png`
   - `Y3-stage-timing-light.png`
   - `Y4-aging-report-dark.png`
   - `R3-goals-light.png`
6. Switch tabs to `Stage timing`, `Aging`, and `Goals`.
7. Edit weekly goal target modal and save.
8. Perform axe-core accessibility audit on each surface (target: 0 critical, 0 serious).
