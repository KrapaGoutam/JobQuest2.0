# Data Model & API Impact

No sweeping architectural changes are required. The JobQuest 2.0 foundation is robust enough to support the 2.1 features mostly through frontend extensions.

## Database Impact

**No schema changes are required for 2.1.**
- Resume version labels are already stored (`application_documents.label`).
- Goals are already stored and versioned (`public.goals`).
- Task states already support cancellation (`public.tasks.status`).
- Job snapshots already support arbitrary JSON (`public.job_snapshots.raw_payload`).

## API / RPC Impact

**Minimal API changes required.**

### 1. Task Bulk Operations
- **Existing Endpoint:** Bulk updates currently rely on iterating single updates or specialized RPCs.
- **Proposed Change:** Ensure `rpc_update_tasks` (or equivalent batch RPC) exists and supports the `CANCELLED` state.
- **Backward Compatibility:** 100%.

### 2. Analytics Overview
- **Existing RPC:** `rpc_get_analytics_overview`.
- **Proposed Change:** None. It already returns `active_goal` and application pacing.

### 3. Extension Capture
- **Existing RPC:** `rpc_extension_capture`.
- **Proposed Change:** None. The `p_raw_payload` argument accepts any valid JSON structure the extension provides.

## Security / RLS Impact
No changes to Row Level Security. All features operate within the existing user-scoped or workspace-manager-scoped constraints.
