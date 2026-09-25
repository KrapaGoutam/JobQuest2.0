# Milestone 3 (M3): Acceptance Criteria
## Applications Workflow & Data Grid

**Document ID:** `JQ2-M3-AC-001`  
**Milestone:** `M3`  
**Status:** `ACTIVE`  

---

## 1. Database & Schema Acceptance Criteria
- [ ] **AC-DB-01 (Additive Migration):** Migration `20260924300000_m3_applications.sql` applies cleanly without modifying past migrations.
- [ ] **AC-DB-02 (Applications Columns):** `applications` includes `job_url`, `external_job_id`, `location`, `work_arrangement`, `employment_type`, `salary_min`, `salary_max`, `salary_currency`, `tags`, `closure_notes`, `applied_at`, `next_action_completed_at`, `notes`, `duplicate_override_flag`.
- [ ] **AC-DB-03 (Job Snapshots):** `job_snapshots` table exists, foreign keyed to `applications(id, workspace_id)` with cascade delete.
- [ ] **AC-DB-04 (Application Events):** `application_events` table exists, foreign keyed to `applications(id, workspace_id)` and actor `user_accounts(user_id)`.
- [ ] **AC-DB-05 (Domain Constraints):** Database CHECK constraints enforce 8 valid stages, OPEN/CLOSED statuses, 5 outcomes, and structured closure reasons (`OFFER_DECLINED` when `WITHDRAWN`).
- [ ] **AC-DB-06 (Atomic RPCs):** Domain RPCs (`rpc_move_application_stage`, `rpc_set_application_outcome`, `rpc_keep_application_active`, `rpc_archive_application`, `rpc_restore_application`, `rpc_check_application_duplicate`) execute atomically and log events.
- [ ] **AC-DB-07 (RLS Isolation):** RLS tests prove USER cannot access peer records in shared workspace; MANAGER can access workspace records; cross-workspace access is denied.

---

## 2. Applications Data Grid Acceptance Criteria
- [ ] **AC-GRID-01 (Table Rendering):** Dense 44px table renders applications with company, role, stage, aging, priority, next action, and owner/source.
- [ ] **AC-GRID-02 (Sorting):** Clicking column headers toggles ascending/descending sort cleanly.
- [ ] **AC-GRID-03 (Filtering):** Stage filters, outcome filter (Open/Closed), archive filter, and manager owner filter update rows correctly.
- [ ] **AC-GRID-04 (Search):** Search box debounces input and matches company, role, location, notes, and tags.
- [ ] **AC-GRID-05 (Bulk Selection):** Header and row checkboxes allow selecting multiple rows; floating bulk action bar appears with Move Stage, Archive, and Ghost options.
- [ ] **AC-GRID-06 (Keyboard Navigation):** Arrow/j/k row navigation, `Enter` to open detail, `M` to move stage, `P` to toggle preview rail without conflicting with input fields.

---

## 3. Creation & Duplicate Detection Acceptance Criteria
- [ ] **AC-CREATE-01 (Create Flow):** Quick Add (`Q` key) and New Application modal save records with required fields (Company, Role) and optional metadata.
- [ ] **AC-CREATE-02 (Validation & Dirty State):** Invalid inputs prevent submission; navigating away with unsaved edits prompts confirmation.
- [ ] **AC-DUP-01 (Strong Duplicate):** Exact URL or Requisition ID match displays danger warning card with link to existing application and non-blocking override.
- [ ] **AC-DUP-02 (Probable Duplicate):** Company + Role collision displays amber warning card.
- [ ] **AC-DUP-03 (Possible Duplicate):** Same company with different role displays blue info card.
- [ ] **AC-DUP-04 (Honest Error):** Network or RPC check error displays explicit warning banner that duplicate status could not be verified.

---

## 4. Application Detail & Wide Preview Acceptance Criteria
- [ ] **AC-DETAIL-01 (Detail Presentation):** Drawer or full-route shows 8-stage progress tracker, priority badge, aging telemetry, next action card, and long-form tabs.
- [ ] **AC-DETAIL-02 (Event Timeline):** Real chronological event history from `application_events` is displayed with actor and transition details.
- [ ] **AC-PREVIEW-01 (Wide Desktop Preview):** At >=1680px, right preview rail defaults open; closing it expands the table grid.
- [ ] **AC-PREVIEW-02 (Preference Persistence):** Closing or opening the preview rail persists user preference in `localStorage`.
- [ ] **AC-PREVIEW-03 (Responsive Adaptation):** At <1680px, preview becomes a slide-in drawer; at <768px, adapts to mobile full sheet.

---

## 5. Aging & Lifecycle Acceptance Criteria
- [ ] **AC-LIFE-01 (Decoupled Model):** Stage transitions update stage while keeping status OPEN; setting outcome marks status CLOSED with terminal outcome.
- [ ] **AC-LIFE-02 (Aging Telemetry):** Stale badge appears for 15–30 days inactive; Long Waiting badge for 31+ days.
- [ ] **AC-LIFE-03 (Keep Active):** Clicking Keep Active updates `last_activity_at` and appends `KEEP_ACTIVE` event without changing stage or state.
- [ ] **AC-LIFE-04 (Archive & Restore):** Soft archiving sets `archived_at`; restoring clears `archived_at` and refreshes `last_activity_at`.

---

## 6. Security, Accessibility & CI Acceptance Criteria
- [ ] **AC-SEC-01 (Option B Preservation):** ES256 JWT, Argon2id, custom refresh tokens, and direct PostgREST RLS remain functional.
- [ ] **AC-SEC-02 (Zero Secret Leak):** Private keys (`JQ_JWT_PRIVATE_JWK`) and service role secrets are never exposed to browser bundles.
- [ ] **AC-A11Y-01 (Accessibility):** Automated axe-core scan on applications data grid and dialogs reports 0 critical or serious violations.
- [ ] **AC-CI-01 (Green CI):** GitHub Actions CI runs lint, typecheck, unit, and integration tests green.
- [ ] **AC-VERCEL-01 (Vercel Preview):** Deployed to preview on `jobquest2` and validated live.
