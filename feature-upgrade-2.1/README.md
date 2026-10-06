# JobQuest 2.1 — Feature Upgrade Planning

## Executive Summary
JobQuest 2.1 is a focused feature and productivity upgrade targeting goal tracking, job capture completeness, missing metadata recovery (resume versions), and task management improvements. 

This planning phase conducted a comprehensive read-only audit of the JobQuest 2.0 repository to identify root causes of missing features, map existing data flows, and design a non-disruptive implementation sequence.

## Current-State Headline Findings
- **Data Integrity (Resume Version):** The `label` field for tracking manually entered resume versions during extension capture *is* successfully written to the database (added in M10), but is entirely omitted from the frontend Typescript interface (`ApplicationDocumentRecord`) and the UI rendering logic. The data is safe, just hidden.
- **Goal Foundation:** The data layer for tracking daily, weekly, and monthly goals across multiple categories (APPLICATIONS, NETWORKING, etc.) is fully robust and implemented via `rpc_upsert_goal_for_user`. The frontend analytics components exist but are under-exposed on the daily dashboard.
- **Application Dates:** Multiple date semantics exist (`applied_at`, `created_at`, `last_activity_at`). The correct date for user-facing grouping and daily goal matching is `applied_at`.
- **Tasks Dismissal:** Existing `CANCELLED` status supports the semantics of a "Dismiss" action without requiring schema changes or hard deletion.

## Priority Order & Recommended Phases
1. **2.1-A — Data Integrity / Resume Version Fix (P0):** Expose existing `label` data in the UI to resolve the "Attached Document" issue immediately.
2. **2.1-B — Dashboard Goal + Daily Metrics (P1):** Surface the existing `applied_at` metrics and active goal targets on the dashboard's "Search pulse" zone.
3. **2.1-C — Tasks & Follow-ups (P2):** Implement "Dismiss" (via Cancelled status) and bulk selection actions.
4. **2.1-D — Application Grouping (P2):** Extend `ApplicationsTable` to group by `applied_at` dates (Today, Yesterday, etc.).
5. **2.1-E — Extension Capture + AI Job JSON (P2):** Enhance the generic extractor and add a UI mechanism to export the `job_snapshots` payload.
6. **2.1-F — Analytics Goal Trends (P2):** Expand the Analytics charts to map actual applications vs historical targets.
7. **2.1-G — Legacy Database Reconciliation (P3):** Read-only cross-system validation leveraging M14's mapping tables.
8. **2.1-H — AI Connectivity Research (P3):** Conceptual architecture for future integrations.

## Major Dependencies
- The Goal Dashboard (2.1-B) and Goal Trends (2.1-F) both depend on the existing `applied_at` and `goals` schema behavior.
- The AI JSON Export (2.1-E) depends on expanding the Extension Capture payload mapped to `job_snapshots`.

## Key Risks
- **Timezone Boundaries:** Misalignment between `applied_at` (timestamptz) and daily goal calculations based on user timezone.
- **Task Recurrence & Dismissal:** Bulk dismissing a recurring task instance must correctly generate the *next* occurrence via the M9/PL4C recurrence rules, rather than terminating the chain entirely.

## Intentionally Deferred
- Implementation of the AI Integration (REST/MCP/Webhook) is limited to research only in this phase.
- Modifications to the legacy database or automatic data migration.

STATUS: PLANNING COMPLETE — AWAITING OPERATOR APPROVAL
