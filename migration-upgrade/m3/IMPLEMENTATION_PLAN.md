# Milestone 3 (M3): Implementation Plan
## Applications Workflow & Data Grid

**Document ID:** `JQ2-M3-PLAN-001`  
**Milestone:** `M3`  
**Status:** `PLANNED`  
**Base:** `development` (commit `9bfac15`)  
**Branch:** `feature/m3-applications-workflow`  

---

## 1. Objectives & Architectural Requirements

### Primary Objectives:
1. **Database Schema Expansion:**
   - Author additive migration `20260924300000_m3_applications.sql` to expand `applications` table with all verified metadata, constraints, and indexes.
   - Implement `job_snapshots` table for immutable job posting requirements/description.
   - Implement append-only `application_events` table for lifecycle tracking and historical funnel analytics ("ever reached").
   - Implement atomic domain RPCs (`rpc_move_application_stage`, `rpc_set_application_outcome`, `rpc_keep_application_active`, `rpc_archive_application`, `rpc_restore_application`, `rpc_check_application_duplicate`).
   - Define strict RLS policies matching the hybrid contract: direct Data API reads and simple permitted mutations under RLS, and RPCs for state-changing lifecycle events.

2. **Canonical Workflow Integration:**
   - Consume canonical workflow from `workflow_definitions` (8 stages: SAVED, PREPARING, APPLIED, ASSESSMENT, RECRUITER_SCREEN, INTERVIEW, FINAL_INTERVIEW, OFFER; 5 outcomes: ACCEPTED, REJECTED, WITHDRAWN, GHOSTED, POSITION_CLOSED).
   - Enforce decoupled lifecycle state (Stage + Status + Outcome + Closure Reason). Never overload into a single string.

3. **Applications Data Grid (Direction D):**
   - Implement dense applications table using M2 table primitives.
   - Support high data scale (500–1000+ applications per user) with efficient pagination, sorting, filtering, and debounce search.
   - Bulk selection bar with batch stage transitions, archiving, and ghosting.
   - Full keyboard accessibility (Arrow navigation, `Enter`, `M` stage move, `P` preview toggle).

4. **Creation, Editing & 3-Tier Duplicate Engine:**
   - Progressive 5-section create form with validation, dirty state, and snapshot capture.
   - Duplicate detection engine surfacing Strong (URL/ReqID), Probable (Company + Role), and Possible (Company match) alerts.
   - Honest error handling on check failures.

5. **Detail Drawer & Wide-Desktop Docked Preview:**
   - Persistent right preview rail at >=1680px (default open, user toggle, preference persistence).
   - Slide-in detail drawer for viewports <1680px, responsive card list on mobile (<768px).
   - Event timeline displaying real chronological history from `application_events`.

---

## 2. Technical Strategy & Step-by-Step Execution

### Step 1: Database Migration (`supabase/migrations/20260924300000_m3_applications.sql`)
- Add columns to `applications`: `job_url`, `external_job_id`, `location`, `work_arrangement`, `employment_type`, `salary_min`, `salary_max`, `salary_currency`, `tags`, `closure_notes`, `applied_at`, `next_action_completed_at`, `notes`, `duplicate_override_flag`.
- Create `job_snapshots` with cascade FK to `applications(id, workspace_id)`.
- Create `application_events` with cascade FK to `applications(id, workspace_id)` and actor FK to `user_accounts(user_id)`.
- Implement RPCs with `SECURITY DEFINER` and pinned `search_path = ''`.
- Set up RLS policies for `applications`, `job_snapshots`, and `application_events`.
- Apply migration locally and verify.

### Step 2: Backend API & Service Layer (`apps/api/` & `packages/` / types)
- Export shared TypeScript types for `Application`, `JobSnapshot`, `ApplicationEvent`, `WorkflowStage`, `WorkflowOutcome`, `DuplicateCheckResult`.
- Ensure Node API / Supabase client types align.
- Provide health and workflow validation endpoints if necessary, adhering to hybrid contract.

### Step 3: Frontend Applications Data Layer (`apps/web/src/api/applications.ts`)
- Implement direct PostgREST client functions using authenticated Supabase client:
  - `fetchApplications(workspaceId, filters, sort, pagination)`
  - `fetchApplicationDetail(applicationId)`
  - `createApplication(payload)`
  - `updateApplication(id, payload)`
  - `checkDuplicate(payload)`
- Implement RPC wrapper calls:
  - `moveStage(applicationId, newStage, notes)`
  - `setOutcome(applicationId, outcome, closureReason, notes)`
  - `keepActive(applicationId)`
  - `archiveApplication(applicationId)`
  - `restoreApplication(applicationId)`

### Step 4: UI Components & Views
- `apps/web/src/components/applications/`:
  - `ApplicationsTable.tsx`: Virtualized/paginated dense table, column sorting, status badges, stage pips, priority bars, aging indicator.
  - `ApplicationsToolbar.tsx`: Search bar with debounce, stage filter pills, outcome filter, manager owner dropdown, archive toggle.
  - `BulkActionBar.tsx`: Selection count, Move Stage, Archive, Mark Ghosted, Clear.
  - `CreateApplicationModal.tsx`: Form with Company, Role, URL, Requisition ID, Location, Work Arrangement, Employment Type, Salary, Stage, Priority, Notes. Duplicate warning cards inline.
  - `EditApplicationModal.tsx`: Field edits with dirty detection.
  - `StageMoveDialog.tsx`: 8-stage selector with transition notes.
  - `OutcomeDialog.tsx`: 5 outcomes with structured closure reason selector when WITHDRAWN (Offer Declined, Compensation Mismatch, etc.).
  - `ApplicationDetailDrawer.tsx`: Header stage progress bar, next action card, tabs (Timeline, Job Snapshot, Notes).
  - `ApplicationPreviewRail.tsx`: >=1680px right rail with quick stage move, keep active button, and mini timeline.
  - `DuplicateWarningCard.tsx`: Strong, Probable, and Possible duplicate warning displays.

### Step 5: Route & Shell Wiring
- Update `apps/web/src/views/ApplicationsView.tsx` with live data binding, drawer, preview rail, and modals.
- Update `Topbar.tsx` and `MobileNav.tsx` active counts and shortcuts (`Q` quick add).

### Step 6: Testing & Verification
- Author RLS test suite verifying owner isolation and manager access.
- Author unit/integration tests for domain RPCs.
- Author Playwright E2E tests for table interactions, responsive viewports, create flow, and preview rail.
- Run axe-core accessibility audit.
- Push to GitHub Actions CI and deploy to Vercel Preview.

---

## 3. Risk Management & Mitigations
- **Large Dataset Lag:** Mitigated by server-side limit/offset pagination and index tuning on `(workspace_id, status, stage)` and `(workspace_id, last_activity_at)`.
- **Duplicate Detection False Negatives:** Handled by multi-tier matching (exact URL/ReqID, case-insensitive company/title match) and honest error handling if API check fails.
- **Accidental Deletions:** Mitigated by soft-archive default; hard delete is isolated and requires explicit typing confirmation.
