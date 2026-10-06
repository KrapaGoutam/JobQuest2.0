# JobQuest 2.1 Feature Upgrade Plan

## 1. Resume Version Visibility

### User Problem
Manually entered resume versions during job capture disappear and only show as "Attached Document" in the UI.

### Current State
The backend database (`application_documents.label`) and the capture RPC correctly save the string. The frontend ignores it.

### Root Cause / Gap
The `ApplicationDocumentRecord` type in `types/documents.ts` omits the `label` property. `ApplicationDocumentsSection.tsx` hardcodes the fallback.

### Existing Components to Reuse
- `ApplicationDocumentsSection.tsx`
- `rpc_extension_capture`

### Proposed UX
If `label` exists and `resume` is null, display the label text (e.g., "Manual Version: v3") instead of "Attached Document".

### Proposed Data Flow
API -> `ApplicationDocumentRecord` -> UI Render.

### Backend/Database Impact
None.

### Edge Cases
Old records without a label and without a resume will still fallback to "Attached Document".

### Acceptance Criteria
Applications captured with a manual resume version string display that string in the Documents list.

### Complexity
Small.

---

## 2. Dashboard Goal Tracking

### User Problem
Configured application goals do not provide operational utility on the daily dashboard.

### Current State
Goals are stored in the DB and retrieved via `rpc_get_analytics_overview`.

### Root Cause / Gap
Missing frontend layout integration to elevate these metrics to primary visibility.

### Existing Components to Reuse
- `GoalRing` from `DashboardPanels.tsx`
- `rpc_get_analytics_overview`

### Proposed UX
A dedicated block in the Search pulse area showing "Yesterday", "Today", and a visual "Goal %" progress ring.

### Proposed Data Flow
`rpc_get_analytics_overview` -> `DashboardPanels.tsx` -> Display.

### Backend/Database Impact
None.

### Edge Cases
Users without a configured goal should see a prompt to set one, or the ring should default to a sensible empty state.

### Acceptance Criteria
Changing the daily goal updates the target on the dashboard. Adding an application immediately updates the "Today" count and progress ring.

### Complexity
Small.

---

## 3. Tasks & Follow-ups Dismissal

### User Problem
Tasks can only be completed or deleted, leaving no option to intentionally ignore a follow-up.

### Current State
Tasks support `PENDING`, `COMPLETED`, `CANCELLED` statuses.

### Root Cause / Gap
No UI button exists to transition a task to `CANCELLED`.

### Existing Components to Reuse
- Task list rows (`QueueRow.tsx`)
- Standard task update API

### Proposed UX
Add a "Dismiss" action button next to "Snooze" and "Complete".

### Proposed Data Flow
Click Dismiss -> API Update Status to `CANCELLED` -> Refresh Queue.

### Backend/Database Impact
None.

### Edge Cases
Dismissing a recurring task should not stop future occurrences unless explicitly specified. The existing M9 recurrence logic handles this.

### Acceptance Criteria
Dismissing a task removes it from the active queue without marking it as completed.

### Complexity
Small.

---

## 4. Application Grouping (Group by Date)

### User Problem
Users want to group applications by exact date (Today, Yesterday, Oct 3) instead of just Month.

### Current State
`groupApplicationsByMonth` exists in `ApplicationsTable.tsx`.

### Root Cause / Gap
Missing `groupApplicationsByDate` utility and UI toggle.

### Existing Components to Reuse
- `time.ts` utility functions.
- `ApplicationsTable.tsx` grouping architecture.

### Proposed UX
Toolbar toggle for "Date" alongside "Month". Table dividers for "Today", "Yesterday", etc.

### Proposed Data Flow
`applied_at` property -> grouping function -> Render sections.

### Backend/Database Impact
None.

### Edge Cases
Timezone shifts might make an application appear on a different calendar day depending on when the user views it.

### Acceptance Criteria
Toggling "Group by Date" buckets applications accurately by their local `applied_at` date.

### Complexity
Medium.

---

## 5. AI Tailoring JSON Export

### User Problem
Users need a clean way to copy all job details to paste into an AI prompt for resume tailoring.

### Current State
The generic extension extractor discards structured lists (requirements/skills). `job_snapshots` exists but is not easily exported.

### Root Cause / Gap
Extension extraction logic is weak. No UI exists to format and copy the payload.

### Existing Components to Reuse
- `job_snapshots` database table.
- Application details view.

### Proposed UX
A "Copy Job JSON" button on the application details page.

### Proposed Data Flow
Extension `extractGeneric` -> `rpc_extension_capture` -> `job_snapshots` -> Frontend formatter -> Clipboard.

### Backend/Database Impact
None.

### Edge Cases
Payloads with malformed JSON or excessively long descriptions.

### Acceptance Criteria
Button click copies a clean, versioned JSON representation of the job description, company, and metadata without exposing tokens.

### Complexity
Medium.
