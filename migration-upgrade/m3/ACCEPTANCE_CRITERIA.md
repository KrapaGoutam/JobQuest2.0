# Milestone 3 (M3): Acceptance Criteria
## Applications Workflow & Data Grid

**Document ID:** `JQ2-M3-AC-001`  
**Milestone:** `M3`  
**Status:** `MET, verified 2026-09-24/25 (see M3_TEST_RESULTS.md)`  

---

## 1. Database & Schema Acceptance Criteria
- [x] **AC-DB-01 (Additive Migration):** Migration `20260924300000_m3_applications.sql` applies cleanly without modifying past migrations.  
  ✅ **Verified:** migrations 300000 (unchanged) + 310000 + 320000 applied local/CI/hosted
- [x] **AC-DB-02 (Applications Columns):** `applications` includes `job_url`, `external_job_id`, `location`, `work_arrangement`, `employment_type`, `salary_min`, `salary_max`, `salary_currency`, `tags`, `closure_notes`, `applied_at`, `next_action_completed_at`, `notes`, `duplicate_override_flag`.  
  ✅ **Verified:** columns present; INT/RLS suites
- [x] **AC-DB-03 (Job Snapshots):** `job_snapshots` table exists, foreign keyed to `applications(id, workspace_id)` with cascade delete.  
  ✅ **Verified:** JOB-01/02 (immutable, one per application)
- [x] **AC-DB-04 (Application Events):** `application_events` table exists, foreign keyed to `applications(id, workspace_id)` and actor `user_accounts(user_id)`.  
  ✅ **Verified:** INT-02/03, RLS-12
- [x] **AC-DB-05 (Domain Constraints):** Database CHECK constraints enforce 8 valid stages, OPEN/CLOSED statuses, 5 outcomes, and structured closure reasons (`OFFER_DECLINED` when `WITHDRAWN`).  
  ✅ **Verified:** RPC-02/04, QRY; CHECKs from M1 + 300000
- [x] **AC-DB-06 (Atomic RPCs):** Domain RPCs (`rpc_move_application_stage`, `rpc_set_application_outcome`, `rpc_keep_application_active`, `rpc_archive_application`, `rpc_restore_application`, `rpc_check_application_duplicate`) execute atomically and log events.  
  ✅ **Verified:** RPC-01..08 (atomic; failed calls write no event)
- [x] **AC-DB-07 (RLS Isolation):** RLS tests prove USER cannot access peer records in shared workspace; MANAGER can access workspace records; cross-workspace access is denied.  
  ✅ **Verified:** RLS-01..13

---

## 2. Applications Data Grid Acceptance Criteria
- [x] **AC-GRID-01 (Table Rendering):** Dense 44px table renders applications with company, role, stage, aging, priority, next action, and owner/source.  
  ✅ **Verified:** E2E-01 (44px measured)
- [x] **AC-GRID-02 (Sorting):** Clicking column headers toggles ascending/descending sort cleanly.  
  ✅ **Verified:** E2E-02 (aria-sort)
- [x] **AC-GRID-03 (Filtering):** Stage filters, outcome filter (Open/Closed), archive filter, and manager owner filter update rows correctly.  
  ✅ **Verified:** E2E-02, QRY-02, INT-04 (owner roster)
- [x] **AC-GRID-04 (Search):** Search box debounces input and matches company, role, location, notes, and tags.  
  ✅ **Verified:** QRY-01, unit, E2E-02
- [x] **AC-GRID-05 (Bulk Selection):** Header and row checkboxes allow selecting multiple rows; floating bulk action bar appears with Move Stage, Archive, and Ghost options.  
  ✅ **Verified:** E2E-03
- [x] **AC-GRID-06 (Keyboard Navigation):** Arrow/j/k row navigation, `Enter` to open detail, `M` to move stage, `P` to toggle preview rail without conflicting with input fields.  
  ✅ **Verified:** E2E keyboard

---

## 3. Creation & Duplicate Detection Acceptance Criteria
- [x] **AC-CREATE-01 (Create Flow):** Quick Add (`Q` key) and New Application modal save records with required fields (Company, Role) and optional metadata.  
  ✅ **Verified:** E2E-04 (Q + New Application)
- [x] **AC-CREATE-02 (Validation & Dirty State):** Invalid inputs prevent submission; navigating away with unsaved edits prompts confirmation.  
  ✅ **Verified:** E2E-04 dirty guard; unit validation
- [x] **AC-DUP-01 (Strong Duplicate):** Exact URL or Requisition ID match displays danger warning card with link to existing application and non-blocking override.  
  ✅ **Verified:** DUP-01/02, E2E-04
- [x] **AC-DUP-02 (Probable Duplicate):** Company + Role collision displays amber warning card.  
  ✅ **Verified:** DUP-03, E2E-04
- [x] **AC-DUP-03 (Possible Duplicate):** Same company with different role displays blue info card.  
  ✅ **Verified:** DUP-04
- [x] **AC-DUP-04 (Honest Error):** Network or RPC check error displays explicit warning banner that duplicate status could not be verified.  
  ✅ **Verified:** E2E-04 (check aborted → honest warning)

---

## 4. Application Detail & Wide Preview Acceptance Criteria
- [x] **AC-DETAIL-01 (Detail Presentation):** Drawer or full-route shows 8-stage progress tracker, priority badge, aging telemetry, next action card, and long-form tabs.  
  ✅ **Verified:** E2E-05
- [x] **AC-DETAIL-02 (Event Timeline):** Real chronological event history from `application_events` is displayed with actor and transition details.  
  ✅ **Verified:** E2E-05 (actors), INT-03
- [x] **AC-PREVIEW-01 (Wide Desktop Preview):** At >=1680px, right preview rail defaults open; closing it expands the table grid.  
  ✅ **Verified:** E2E-06
- [x] **AC-PREVIEW-02 (Preference Persistence):** Closing or opening the preview rail persists user preference in `localStorage`.  
  ✅ **Verified:** E2E-06 (reload + close button)
- [x] **AC-PREVIEW-03 (Responsive Adaptation):** At <1680px, preview becomes a slide-in drawer; at <768px, adapts to mobile full sheet.  
  ✅ **Verified:** E2E-07

---

## 5. Aging & Lifecycle Acceptance Criteria
- [x] **AC-LIFE-01 (Decoupled Model):** Stage transitions update stage while keeping status OPEN; setting outcome marks status CLOSED with terminal outcome.  
  ✅ **Verified:** RPC-01/05
- [x] **AC-LIFE-02 (Aging Telemetry):** Stale badge appears for 15–30 days inactive; Long Waiting badge for 31+ days.  
  ✅ **Verified:** QRY-02, unit, grid chips
- [x] **AC-LIFE-03 (Keep Active):** Clicking Keep Active updates `last_activity_at` and appends `KEEP_ACTIVE` event without changing stage or state.  
  ✅ **Verified:** RPC-06, E2E-05
- [x] **AC-LIFE-04 (Archive & Restore):** Soft archiving sets `archived_at`; restoring clears `archived_at` and refreshes `last_activity_at`.  
  ✅ **Verified:** RPC-07, E2E archive/restore

---

## 6. Security, Accessibility & CI Acceptance Criteria
- [x] **AC-SEC-01 (Option B Preservation):** ES256 JWT, Argon2id, custom refresh tokens, and direct PostgREST RLS remain functional.  
  ✅ **Verified:** M1B 17/17 local, CI, hosted; leak.spec on preview
- [x] **AC-SEC-02 (Zero Secret Leak):** Private keys (`JQ_JWT_PRIVATE_JWK`) and service role secrets are never exposed to browser bundles.  
  ✅ **Verified:** check:bundle, check:secrets, deployed preview bundle scan
- [x] **AC-A11Y-01 (Accessibility):** Automated axe-core scan on applications data grid and dialogs reports 0 critical or serious violations.  
  ✅ **Verified:** axe WCAG 2.2 AA: 0 critical / 0 serious (6 contexts, local, CI, preview)
- [x] **AC-CI-01 (Green CI):** GitHub Actions CI runs lint, typecheck, unit, and integration tests green.  
  ✅ **Verified:** CI runs in M3_TEST_RESULTS.md §8
- [x] **AC-VERCEL-01 (Vercel Preview):** Deployed to preview on `jobquest2` and validated live.  
  ✅ **Verified:** jobquest2 preview (target preview) + E2E on it
