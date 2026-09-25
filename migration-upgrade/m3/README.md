# Milestone 3 (M3) — Applications Workflow & Data Grid

## 1. Overview
Milestone 3 implements the complete JobQuest 2.0 Applications tracking experience using the approved Direction D UI design and Option B backend foundation.

It brings the applications pipeline from a static foundation to a living, interactive, and high-performance workflow with real database persistence, decoupled lifecycle state, event sourcing, duplicate detection, atomic RPC mutations, and responsive presentation across all breakpoints.

---

## 2. Milestone Deliverables
1. **Database Schema Expansion:**
   - Additive migration `20260924300000_m3_applications.sql` expanding `applications` with full job metadata, salary, location, work arrangement, and aging telemetry.
   - `job_snapshots` table for immutable posting captures.
   - `application_events` table for append-only lifecycle event sourcing ("ever reached" historical funnel).
   - Atomic domain RPC functions (`rpc_move_application_stage`, `rpc_set_application_outcome`, `rpc_keep_application_active`, `rpc_archive_application`, `rpc_restore_application`, `rpc_check_application_duplicate`).
   - RLS policies enforcing strict multi-tenant boundary (USER owns own records, MANAGER has workspace-wide access, cross-workspace denied).

2. **Applications Data Grid & Table:**
   - High-density data grid built with M2 table primitives capable of handling 500–1000+ applications.
   - Server-side and client-side sorting (company, role, stage, date applied, last activity, priority).
   - Multi-dimensional filtering (stage, status/outcome, aging band, priority, archive state, search query, owner for managers).
   - Search with debouncing across company, role title, location, notes, and tags.
   - Row selection with bulk actions (move stage, archive, mark ghosted).
   - Keyboard navigation (`j`/`k` or Arrow keys, `Enter` to open, `M` to move stage, `P` to toggle preview).

3. **Application Creation & Duplicate Engine:**
   - Progressive create form with validation and dirty state detection.
   - 3-tier duplicate detection:
     - **Strong:** Job URL or Requisition ID exact match (danger container, preview existing, non-blocking with explicit override).
     - **Probable:** Company name + Role title match (amber warning container, preview existing).
     - **Possible:** Company match with different role (blue info container).
     - **Honest error handling:** Displays explicit warning if duplicate check fails.

4. **Application Detail & Persistent Preview:**
   - Wide-desktop (>=1680px) docked preview rail (defaults open, persistable preference, expands table on close, `P` shortcut).
   - Desktop drawer / split view (<1680px) and mobile full-page sheet (<768px).
   - Detail view with 8-stage progress tracker, priority badge, aging telemetry, next action card, and long-form tabs (Timeline, Job posting, Notes).
   - Chronological event timeline displaying verified entries from `application_events`.

5. **Lifecycle State & Aging Engine:**
   - Decoupled state model: `stage` (8 canonical values), `status` (OPEN/CLOSED), `outcome` (5 terminal values), and `closure_reason` (structured withdrawal reasons such as `OFFER_DECLINED`).
   - Stored aging telemetry (`last_activity_at`, Stale indicator 15–30d, Long Waiting review 31+d).
   - Explicit Keep Active action to refresh activity without false stage mutations.
   - Soft archive and restore flows with filterable archive state.

6. **Quality, Security & Deployment:**
   - Complete RLS test matrix verifying user isolation, manager workspace access, and cross-workspace denial.
   - Unit and integration tests for all domain RPCs.
   - Playwright end-to-end tests for table interactions, creation, stage moves, drawer, and preview rail.
   - Axe-core accessibility verification (0 critical/serious violations).
   - Vercel Preview deployment validation on `jobquest2`.

---

## 3. Scope Boundaries & Constraints
- **Strictly In Scope:** Applications, Job Snapshots, Application Events, Canonical Workflow consumption, Aging, Duplicate Detection, Table Grid, Detail Drawer, Wide Preview Rail.
- **Strictly Deferred to Later Milestones:**
  - Contacts & Networking (Milestone 4)
  - Interviews scheduling & preparation (Milestone 5)
  - Tasks, Habits & Unified Queue (Milestone 6)
  - Documents & Resumes (Milestone 7)
  - Analytics & Reports (Milestone 8)
  - Browser Extension porting (Milestone 10)
  - Legacy Data Migration (Milestone 14)
- **Prohibitions:**
  - Do NOT merge to `main`.
  - Do NOT deploy production Vercel release or production Supabase.
  - Do NOT modify `../JobQuest1.0/`.
