# Data Flow & Reuse Analysis

## Reuse / Extend / New

### 1. Resume Version Visibility
- **REUSE:** Database schema (`application_documents.label`), API payload, RPCs (`rpc_extension_capture`).
- **EXTEND:** TypeScript interface `ApplicationDocumentRecord` to include `label?: string | null`. `ApplicationDocumentsSection.tsx` to render `item.label || item.resume?.name`.
- **NEW:** None.

### 2. Dashboard Daily Goals & Metrics
- **REUSE:** `rpc_get_analytics_overview`, `rpc_get_goal_progress`. The `DashboardPanels.tsx` already fetches this data.
- **EXTEND:** Modify `SearchPulse` in `DashboardPanels.tsx` to explicitly highlight the "Today" delta and goal progress ring using the existing `today` payload data.
- **NEW:** None.

### 3. Tasks Dismissal
- **REUSE:** Existing Task `status` column supporting `'CANCELLED'`.
- **EXTEND:** `useQueueActions` in `QueueRow.tsx` to include an `onDismiss` handler mapping to cancellation.
- **NEW:** UI buttons/icons for dismissing.

### 4. Tasks Bulk Operations
- **REUSE:** Existing batch update API architecture.
- **EXTEND:** Task list UI to support checkbox selection.
- **NEW:** Bulk action bar for mutating multiple IDs atomically.

### 5. Application Date Grouping
- **REUSE:** Date formatting logic in `time.ts` (`dayKey`).
- **EXTEND:** `ApplicationsView.tsx` toolbar to include a "Group by Date" toggle. `ApplicationsTable.tsx` rendering logic.
- **NEW:** `groupApplicationsByDate` utility function.

### 6. Extension Capture Enrichment
- **REUSE:** `rpc_extension_capture`, `job_snapshots` table.
- **EXTEND:** `extractGeneric` in `apps/extension/extractors/generic.js` to parse DOM for `<ul>` lists indicating requirements/responsibilities.
- **NEW:** Extended JSON schema in the extension's `raw_payload`.

### 7. AI Copy Job JSON
- **REUSE:** `job_snapshots` data already fetched on the Application Details page.
- **EXTEND:** Nothing.
- **NEW:** A serialization utility function that merges `Application` metadata and `job_snapshots` JSON into a flattened, AI-optimized text format, and a "Copy" button in the UI.

### 8. Legacy Database Reconciliation
- **REUSE:** `applications.legacy_id`, `migration_id_mappings`.
- **EXTEND:** Nothing.
- **NEW:** A standalone read-only Node script (e.g., under `scripts/`) to connect to both databases and execute the diff report.
