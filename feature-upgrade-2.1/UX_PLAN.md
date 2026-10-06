# UX Plan

## 1. Dashboard: Daily Metrics & Goal Progress
- **Layout:** Transform the top "Search pulse" zone. Add a distinct visual block for "Today's Progress".
- **Metrics:** Display "Yesterday: X", "Today: Y", "Goal: Z".
- **Visualization:** A circular progress ring (using `GoalRing` component) showing completion percentage for today's application goal.

## 2. Dashboard: Today's Work
- **Layout:** Constrain the height of the "Today's queue" card.
- **Scroll:** Implement `overflow-y: auto` inside the card body. 
- **Header:** Make the card header (`div.card-h`) sticky so context remains visible while scrolling tasks.

## 3. Applications: Grouping
- **Toolbar:** Add a "Group by Date" toggle button next to "Group by month". These should act as a mutually exclusive radio group (None, Month, Date).
- **List View:** When grouped by date, render clear divider headers (e.g., "Today", "Yesterday", "Monday, Oct 2").

## 4. Documents / Application Details
- **List Item:** In `ApplicationDocumentsSection.tsx`, update the display logic.
  - If a linked resume exists: Display the Resume Name.
  - If no linked resume exists, but a `label` exists: Display the `label` (e.g., "Manual Version: v3").
  - Fallback: "Attached Document".

## 5. Tasks & Follow-ups
- **Row Action:** Add a "Dismiss" (X icon or slashed circle) button to `QueueRow.tsx` next to Complete and Snooze.
- **Confirmation:** Small toast confirmation on dismiss with an "Undo" option.
- **Bulk UI:** When tasks are selected via checkboxes, reveal a sticky bottom bar or top action bar containing [Complete Selected], [Snooze Selected], [Dismiss Selected].

## 6. AI JSON Export
- **Placement:** A prominent "Copy for AI Tailoring" button in the Job Snapshot/Details section of the application view.
- **Interaction:** On click, formats the JSON, copies to clipboard, and shows a "Copied!" toast.
