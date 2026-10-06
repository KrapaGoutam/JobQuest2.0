# Current State Audit

## 1. Resume Version / Attached Document Gap

| Feature | Current UI | Current Data Support | Current API Support | Gap | Confidence |
|---|---|---|---|---|---|
| Resume Version Tracking | Shows "Attached Document" for manual entries | ✅ Supported. `application_documents.label` was added in M10 migration. | ✅ Supported. `rpc_extension_capture` inserts `p_resume_label`. | **High.** The frontend type `ApplicationDocumentRecord` in `types/documents.ts` omits the `label` property. `ApplicationDocumentsSection.tsx` only checks `item.resume?.name` and falls back to a hardcoded string. | High |

**Root Cause:** The manual resume version is safely stored in the database. The bug is strictly a frontend UI/TypeScript typings omission.

## 2. Goal Tracking & Dashboard

| Feature | Current UI | Current Data Support | Current API Support | Gap | Confidence |
|---|---|---|---|---|---|
| Daily Application Goal | Configurable in Settings. Visible in some Analytics. Missing from "Today's Work". | ✅ Supported via `public.goals` and `GoalProgressPoint`. | ✅ Supported via `rpc_get_goal_progress`. | **Medium.** `DashboardPanels.tsx` has conditional logic for goals but it's not prominently featured as a standalone compact metric tracking daily progress. | High |

**Root Cause:** The data layer is complete. The dashboard needs layout adjustments to make the "Today" goal primary, pulling from existing API data.

## 3. Tasks & Follow-ups (Dismiss)

| Feature | Current UI | Current Data Support | Current API Support | Gap | Confidence |
|---|---|---|---|---|---|
| Dismiss Task | Not available. Only Complete or Delete. | ✅ Supported via `status = 'CANCELLED'`. | ✅ Supported via standard task update. | **Low.** Just requires exposing a "Dismiss" action in `QueueRow.tsx` and `ReviewActions.tsx` mapping to `CANCELLED`. | High |

**Root Cause:** Missing UI affordance. The state machine handles it perfectly.

## 4. Application Grouping (Date)

| Feature | Current UI | Current Data Support | Current API Support | Gap | Confidence |
|---|---|---|---|---|---|
| Group by Date | Only Group by Month exists. | ✅ Supported via `applied_at` (preferred) or `created_at`. | ✅ No backend change needed. | **Medium.** Need to add `groupApplicationsByDate` logic similar to `groupApplicationsByMonth` in `lib/applicationProductivity.ts` and `ApplicationsTable.tsx`. | High |

**Root Cause:** Missing frontend grouping implementation. `applied_at` should drive this grouping to reflect user intent.

## 5. Extension Capture

| Feature | Current UI | Current Data Support | Current API Support | Gap | Confidence |
|---|---|---|---|---|---|
| Comprehensive Capture | Captures title, company, basic compensation. | ✅ Supported via `job_snapshots.raw_payload`. | ✅ Supported via `rpc_extension_capture` accepting `raw_payload`. | **Medium.** The extension's `generic.js` extractor throws away structured data. The DB can store it if the extension extracts it. | High |

**Root Cause:** The browser extension does not aggressively parse and map qualifications, responsibilities, or benefits into the JSON payload.

## 6. Legacy Database Reconciliation

| Feature | Current UI | Current Data Support | Current API Support | Gap | Confidence |
|---|---|---|---|---|---|
| Reconciliation | N/A | ✅ Supported. M14 adds `applications.legacy_id` and `migration_id_mappings`. | ❌ Requires a new read-only validation script/tool. | **Medium.** The schema mapping exists, but the script to perform the diff between the Neon/Render database and current Supabase does not exist. | High |

**Root Cause:** Planned for M14, but the actual comparison logic is a new operational tool.
