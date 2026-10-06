# Testing and CI Strategy

This strategy ensures token efficiency and fast validation during implementation.

## Targeted Testing Approach

### 1. Resume Version Fix
- **Type:** Component Test.
- **Target:** `ApplicationDocumentsSection.test.tsx` (or equivalent).
- **Validation:** Assert that a document record with a `label` but no `resume` object correctly renders the label text instead of "Attached Document".

### 2. Dashboard Goal Metrics
- **Type:** Unit Test.
- **Target:** `analytics.test.ts` (testing the normalization of the `AnalyticsOverview` payload).
- **Validation:** Assert that `active_goal` and `weekly_pacing` correctly map from the raw RPC response.

### 3. Application Grouping
- **Type:** Unit Test.
- **Target:** `applicationProductivity.test.ts`.
- **Validation:** Assert `groupApplicationsByDate` correctly buckets applications into "Today", "Yesterday", and exact dates, respecting timezone boundaries.

### 4. Tasks Dismissal & Bulk Actions
- **Type:** Integration / Component Test.
- **Target:** `QueueRow.test.tsx` and Bulk Actions bar.
- **Validation:** Assert that dismissing triggers the update callback with `status: 'CANCELLED'`. Assert bulk dispatch sends an array of IDs.

### 5. Extension Capture
- **Type:** Unit Test.
- **Target:** `sidepanel-logic.test.js` or `generic.test.js`.
- **Validation:** Provide mock DOMs with `<ul>` requirements and assert the extractor correctly parses them into the JSON structure.

## CI Efficiency Rules
- **Local Validation:** Run only the specific Jest/Vitest files related to the modified components before committing.
- **No Redundant CI:** Do not trigger full E2E GitHub Action workflows for localized UI component changes until the feature slice is merged to the integration branch.
- **Database Tests:** Since no schema changes are proposed, database migration tests do not need to be triggered.
