# Implementation Phases

## Recommended Sequence

### Phase 2.1-A — Data Integrity / Resume Version Fix (Priority: P0)
**Why First?** Resolves a direct data-loss perception issue for users. Data exists but is hidden.
1. Update `ApplicationDocumentRecord` type in `types/documents.ts` to include `label`.
2. Update `ApplicationDocumentsSection.tsx` to render the `label` when `resume_id` is null.

### Phase 2.1-B — Dashboard Goal + Daily Metrics (Priority: P1)
**Why Second?** Unlocks high-value productivity tracking using existing data.
1. Modify `DashboardPanels.tsx` to elevate Today's goal from the `AnalyticsOverview` payload.
2. Refactor "Today's queue" in `DashboardView.tsx` into a fixed-height scrolling container.

### Phase 2.1-C — Application Grouping (Priority: P2)
**Why Third?** Low complexity, high visibility.
1. Add `groupApplicationsByDate` utility using `applied_at`.
2. Add "Group by Date" to `ApplicationsToolbar.tsx`.
3. Update `ApplicationsTable.tsx` to render date sections.

### Phase 2.1-D — Tasks & Follow-ups (Priority: P2)
**Why Fourth?** Improves daily workflow efficiency.
1. Add "Dismiss" button to `QueueRow.tsx` resolving to `status = 'CANCELLED'`.
2. Implement bulk selection UI in the Tasks view.
3. Wire bulk actions to existing batch update APIs.

### Phase 2.1-E — Extension Capture & AI JSON (Priority: P2)
**Why Fifth?** More complex, requires extension changes.
1. Enhance `generic.js` extractor in the extension to capture lists (requirements/skills) into JSON.
2. Add "Copy Job JSON" serialization logic and UI button to `JobSnapshot` view in the application.

### Phase 2.1-F — Analytics Goal Trends (Priority: P2)
**Why Sixth?** Dependent on solid goal foundations.
1. Create a "Goal Trend" chart component in Analytics showing historical daily applications vs target.

### Phase 2.1-G — Legacy Database Reconciliation (Priority: P3)
1. Build standalone Node script to query Neon and Supabase databases.
2. Output markdown report categorizing matches and gaps.

### Phase 2.1-H — AI Connectivity Research (Priority: P3)
1. Conclude architectural design for future automation capabilities (MCP vs REST).
