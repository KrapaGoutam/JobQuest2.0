# JobQuest 2.0 · Gate 02B Interaction Specification

| | |
|---|---|
| **Status** | **PROPOSED** — Awaiting user review and approval |
| **Document Purpose** | Definitive behavioral, state transition, validation, and audit specification for all key interactions |
| **Compliance** | WCAG 2.2 AA Keyboard & Screen Reader Interaction Standards |

---

## 1. Specification Framework

Every interaction in JobQuest 2.0 is defined against an 8-part behavioral contract:
1. **Trigger:** User gesture, keyboard shortcut, or programmatic event.
2. **User Feedback:** Immediate optimistic UI changes, loading spinners, toasts, and screen-reader announcements.
3. **Client & Server Validation:** Boundary rules, schema constraints, and format requirements.
4. **Permission & Role Requirement:** `USER` (own records only) vs. `MANAGER` (workspace-wide).
5. **Confirmation Requirement:** Inline prompt, modal dialog, typed safety confirmation, or none.
6. **History & Audit Implication:** Append-only records created in `application_events` or `audit_events`.
7. **Failure Behavior:** Rollback mechanisms, retry patterns, and persistent error states.

---

## 2. Application & Workflow Interactions

### 2.1 Application Stage Transition
- **Trigger:**
  - *Table / Board:* Dropdown menu on stage pill or dragging card to new column (Board).
  - *Detail Page (C8):* Clicking "Move stage" button in detail header.
  - *Keyboard:* Selecting application row, pressing `M`, and selecting stage via arrow keys + Enter.
  - *Mobile (C13):* Tapping "Move stage" to open bottom sheet picker.
- **User Feedback:**
  - Stage indicator immediately updates (optimistic UI).
  - Polite screen-reader announcement: *"Application moved to [New Stage]"*.
  - Timeline adds a new "Stage changed" item.
- **Validation:** Must be one of the 8 canonical stages (`Saved`, `Preparing`, `Applied`, `Assessment`, `Recruiter Screen`, `Interview`, `Final Interview`, `Offer`). Skipped stages are permitted.
- **Permission Requirement:** Record owner OR workspace `MANAGER`.
- **Confirmation Requirement:** None for forward/backward stage movement within pipeline.
- **History & Audit Implication:** Appends an `application_events` record of type `stage_change` (`from_stage`, `to_stage`, `actor_id`). If actor ≠ owner (manager action), logged in `audit_events`.
- **Failure Behavior:** Reverts stage pill to previous state; displays toast: *"Couldn't update stage. Check your connection."* with Retry button.

### 2.2 Close Application with Outcome
- **Trigger:**
  - Clicking "Move stage" → selecting a closed outcome, or clicking "Close application" in action menu.
  - Selecting "Mark Ghosted" in inactivity review.
  - Extension popup "Close as..." button.
- **User Feedback:**
  - Opens modal dialog (C9) or bottom sheet on mobile.
  - Upon save: Outcome pill updates to `Accepted`, `Rejected`, `Withdrawn`, `Ghosted`, or `Position Closed`; application moves out of active pipeline views.
- **Validation:**
  - Outcome must be one of the 5 canonical outcomes.
  - When Outcome is `Withdrawn`, structured closure reason selector offers: `OFFER_DECLINED` (displayed as "Offer declined", ADR-028), `GENERAL_WITHDRAWAL`, `COMPENSATION_MISMATCH`, `LOCATION_UNSUITABLE`, `OTHER`.
  - Optional closure notes / reason text (max 2,000 characters).
  - Prompts to either clear pending next actions and reminders (default) or retain them.
- **Permission Requirement:** Record owner OR workspace `MANAGER`.
- **Confirmation Requirement:** **Mandatory confirmation dialog (C9).** Explains that closing the application removes it from the active pipeline and clears pending next actions unless explicitly retained.
- **History & Audit Implication:**
  - Current pipeline stage remains frozen at its last reached stage.
  - Application `status` set to terminal value; `closed_at` timestamp set; `closure_reason` recorded.
  - Appends `status_change` event to `application_events` with structured reason.
- **Failure Behavior:** Form remains open with error banner; no database changes committed.

### 2.3 Next Action Completion & Scheduling ("Done, Set Next")
- **Trigger:**
  - Clicking "Done, set next" button on Application Detail header (C10) or Task row.
  - Clicking check circle on Dashboard queue item.
- **User Feedback:**
  - Check circle fills green with checkmark animation.
  - Opens lightweight popover (C10) prompting for next step with quick-date chips (*"Tomorrow"*, *"In 1 week"*, *"In 2 weeks"*, *"Pick date"*).
  - Also includes a *"No next action needed"* trigger.
- **Validation:** Action text max 255 characters. Due date must be a valid ISO date string.
- **Permission Requirement:** Record owner OR workspace `MANAGER`.
- **Confirmation Requirement:** None.
- **History & Audit Implication:**
  - Marks previous action complete in timeline.
  - Sets `applications.next_action` and `applications.next_action_date`.
  - Appends `next_action_updated` event to `application_events`.
- **Failure Behavior:** Optimistic checkmark reverts; toast notification indicates failure with automatic retry.

### 2.4 Inactivity Advisory Review (31+ Days, ADR-027, OQ-022)
- **Trigger:** Application exceeds **31+ days** of inactivity (no timeline events or updates). Aligned 100% with the **Long Waiting** aging band (distinguished from the 15–30 day Stale indicator). Surfaces in Dashboard "Review quiet applications" queue (D1/D2, Y4).
- **User Feedback:**
  - Renders advisory card with 3 action buttons: `Keep Active`, `Mark Ghosted`, `Archive`.
- **Validation:** None.
- **Permission Requirement:** Record owner OR workspace `MANAGER`.
- **Confirmation Requirement:**
  - `Keep Active`: None (resets inactivity timer by logging a "Reviewed application" note).
  - `Mark Ghosted`: Closes with outcome `Ghosted` (prompts for follow-up cancellation; 10-second undo toast).
  - `Archive`: Soft-archives application (10-second undo toast).
  - **Zero Automatic Mutation:** Nothing is automatically ghosted, archived, closed, or changed. All state changes require explicit user action.
- **History & Audit Implication:** Appends appropriate event (`review_kept`, `status_change`, or `archived`) to `application_events`.
- **Failure Behavior:** Card remains in queue with retry indicator.

### 2.5 Duplicate Warning Override
- **Trigger:** User enters a Company/Role or Job URL that triggers duplicate detection during creation (C4, C5, C6) or extension capture (X9, X10, X11).
- **User Feedback:**
  - Inline colored banner (Red = Strong, Amber = Probable, Blue = Possible) appears dynamically.
  - Card displays summary of conflicting existing record with "View existing" link.
- **Validation:** Non-blocking by architecture. User may click "Save anyway" or "Cancel".
- **Permission Requirement:** Any authenticated user creating an application.
- **Confirmation Requirement:** For Strong Duplicate (C4), "Save anyway" requires clicking a secondary confirmation button.
- **History & Audit Implication:** New application record created with `duplicate_override_flag = true` and reference to existing application ID for analytics tracing.
- **Failure Behavior:** Standard form validation display.

### 2.6 Soft Archive Application
- **Trigger:** Selecting "Archive" from application card menu, table row action, or bulk action bar.
- **User Feedback:**
  - Application instantly slides out of active table, board, and calendar views.
  - Toast notification appears at bottom: *"Archived [Company] · [Role] — Undo (10s)"*.
- **Validation:** Cannot archive an application that is already archived.
- **Permission Requirement:** Record owner OR workspace `MANAGER`.
- **Confirmation Requirement:** None (mitigated by 10-second instant Undo toast).
- **History & Audit Implication:**
  - Sets `applications.archived_at = NOW()`.
  - Appends `archived` event to `application_events`.
  - Record remains accessible under the Archived filter (V7).
- **Failure Behavior:** Row re-appears in view; toast reports error.

### 2.7 Restore Application
- **Trigger:** Clicking "Restore" button on an archived application row in the Archive view (V7).
- **User Feedback:**
  - Application removed from Archive view; toast displays: *"Restored [Company] · [Role] to active applications"*.
- **Validation:** None.
- **Permission Requirement:** Record owner OR workspace `MANAGER`.
- **Confirmation Requirement:** None.
- **History & Audit Implication:**
  - Sets `applications.archived_at = NULL`.
  - Appends `restored` event to `application_events`.
- **Failure Behavior:** Application remains in Archive view; error banner displayed.

### 2.8 Hard Delete Application
- **Trigger:** Clicking "Delete permanently" on an application in Archive view (C11).
- **User Feedback:**
  - Opens modal dialog (C11) with red danger banner.
  - Outlines exact cascade impact: *"Permanently removes application, [N] timeline events, [N] interviews, and removes from analytics history. Linked contacts and notes will be kept but unlinked."*
- **Validation:** **User must type "DELETE" into a confirmation input field.** The action button remains disabled until the string matches exactly.
- **Permission Requirement:** Record owner OR workspace `MANAGER`.
- **Confirmation Requirement:** Strict typed confirmation modal (C11).
- **History & Audit Implication:**
  - Irreversible cascade delete across application-owned tables (`application_events`, `stage_history`, `interviews`, `checklists`).
  - Contact links and journal links have `application_id` set to `NULL`.
  - Logged permanently in `audit_events` with actor ID, original company, role, and deletion timestamp.
- **Failure Behavior:** Dialog displays inline server error message; deletion aborted.

### 2.9 Bulk Table Actions
- **Trigger:** Selecting multiple rows via checkboxes or Shift+Click range selection in Applications table.
- **User Feedback:**
  - Sticky Bulk Action Bar floats over table header.
  - Displays selected count: *"X applications selected"*.
  - Action buttons: `Move stage`, `Add tag`, `Export (X)`, `Archive (X)`.
- **Validation:** Selection must contain ≥1 row. Actions apply only to valid rows.
- **Permission Requirement:** Standard users may only bulk-modify their own records. Managers may bulk-modify across members.
- **Confirmation Requirement:** Bulk Archive prompts with count confirmation. Bulk Stage Move prompts with target stage selector.
- **History & Audit Implication:** Batch transactional write; generates individual `application_events` for each affected record.
### 2.10 Applications Preview Pane Toggle & Preference Persistence (ADR-029, OQ-024)
- **Trigger:**
  - Clicking visible "Preview" toggle button on table toolbar.
  - Clicking "Close" (`×`) button in preview pane header.
  - Pressing context-safe keyboard shortcut `P` when an application row has table grid focus.
  - Initial load on viewports **≥ 1680px** (defaults to **OPEN**).
- **User Feedback:**
  - When opened: Table canvas smoothly contracts to 65% width; 440px preview pane pins to right rail showing comprehensive application overview (stage pips, outcome, next action card, latest timeline events).
  - When closed: Preview pane slides out; table canvas expands to 100% width.
- **Validation:** Viewport must support split-rail or drawer layout (≥1024px).
- **Permission Requirement:** All authenticated users.
- **Confirmation Requirement:** None.
- **History & Audit Implication:** Persists `ui_preferences.app_preview_pane_open` in local client storage and syncs to user profile settings.
- **A11y & Keyboard Safety:**
  - `Space` is strictly prohibited as a preview toggle shortcut to prevent conflicts with native vertical scrolling, checkbox selection, and screen-reader interaction.
  - Closing pane returns focus to the triggering row in the table grid.
- **Failure Behavior:** If persistence fails, state remains responsive in local memory for the active session.

---


## 3. Navigation & Workspace Interactions

### 3.1 Workspace Switching
- **Trigger:** Clicking Workspace Switcher dropdown at top of sidebar (D1) or mobile header chip.
- **User Feedback:**
  - Menu opens displaying all user workspace memberships with role badges (`Manager` or `User`).
  - Selecting a workspace initiates instant context switch.
  - App shell accent color and workspace title update immediately.
- **Validation:** User must have active membership in target workspace.
- **Permission Requirement:** Any authenticated user.
- **Confirmation Requirement:** If user has unsaved form changes in current view, prompts: *"Leave page with unsaved changes?"*.
- **History & Audit Implication:** Updates `profiles.last_active_workspace_id`.
- **Failure Behavior:** Remains on current workspace; alerts user if workspace is unavailable or user was removed.

### 3.2 Member Role Modification & Safeguard
- **Trigger:** Workspace Manager opens member action menu (W1) → selects "Make manager" or "Demote to user".
- **User Feedback:**
  - Role badge updates in member table (W1).
  - Toast confirmation: *"Updated [Member Name]'s role to [Role]"*.
- **Validation:** Cannot modify own role.
- **Permission Requirement:** Workspace `MANAGER` only.
- **Confirmation Requirement:**
  - **Last-Manager Safeguard (W4):** If target user is the sole remaining manager of the workspace, demotion is strictly blocked. An alert dialog displays: *"Cannot change role: A workspace must have at least one active manager. Promote another member first."*
- **History & Audit Implication:** Logged in `audit_events` (`actor_id`, `target_user_id`, `old_role`, `new_role`).
- **Failure Behavior:** Role remains unchanged; alert dialog surfaces server rejection.

### 3.3 Member Removal from Workspace
- **Trigger:** Manager opens member menu (W1) → clicks "Remove from workspace..." (W3).
- **User Feedback:**
  - Opens modal dialog (W3) explaining data retention: *"All [N] applications tracked by [Member] will remain in this workspace. Their access will be revoked immediately."*
- **Validation:** Cannot remove the sole remaining manager (blocked by W4 safeguard).
- **Permission Requirement:** Workspace `MANAGER` only.
- **Confirmation Requirement:** Modal confirmation with explicit checkbox: *"I understand this user's records will stay in the workspace"*.
- **History & Audit Implication:** Member's `workspace_memberships` record deleted. Logged in `audit_events`.
- **Failure Behavior:** Member remains active; dialog shows error message.

---

## 4. Tasks & Calendar Interactions

### 4.1 Task Completion & Recurrence
- **Trigger:** Clicking checkbox next to a task item in Queue (T1) or Dashboard.
- **User Feedback:**
  - Checkbox checks, text gains strikethrough, and item smoothly transitions to Completed section after 1.5 seconds.
  - Toast displays: *"Completed: [Task Title] — Undo (8s)"*.
- **Validation:** Task must not already be completed.
- **Permission Requirement:** Task owner OR workspace `MANAGER`.
- **Confirmation Requirement:** None.
- **History & Audit Implication:**
  - Current task instance set to `completed_at = NOW()`.
  - If task has recurrence rule (e.g. `FREQ=WEEKLY`), the recurrence engine immediately calculates the next due date and inserts a new pending task instance.
- **Failure Behavior:** Checkbox unchecks; toast indicates failure with retry option.

### 4.2 Interview Scheduling
- **Trigger:** Clicking "Schedule interview" button in Interviews page (I1), Application detail rail, or calendar.
- **User Feedback:**
  - Opens modal dialog (I3).
  - Shows linked application and current stage.
  - Prompts with stage recommendation segment: *"Keep at Recruiter Screen"* vs *"Move to Interview"*.
- **Validation:** Application, Interview Type, Date, and Time are required. Duration must be positive integer.
- **Permission Requirement:** Application owner OR workspace `MANAGER`.
- **Confirmation Requirement:** None.
- **History & Audit Implication:**
  - Creates `interviews` record with `preparation_notes` and `questions_expected`.
  - Appends `interview_scheduled` event to application timeline.
  - If user opted to change stage, triggers Stage Transition event.
- **Failure Behavior:** Modal remains open with highlighted field validation errors.

### 4.3 Interview Outcome Recording
- **Trigger:** Clicking "Record outcome" button on past interview card (I1, I4) or Dashboard interview reminder.
- **User Feedback:**
  - Opens outcome dialog (I4).
  - Surfaces outcome options: `Completed · waiting`, `Advanced`, `Rejected`, `Cancelled`.
  - Prompts for questions asked, performance notes, thank-you follow-up, and updated next action.
- **Validation:** Outcome result is required.
- **Permission Requirement:** Interview owner OR workspace `MANAGER`.
- **Confirmation Requirement:** None.
- **History & Audit Implication:**
  - Updates `interviews.outcome` and notes.
  - Appends `interview_completed` event to application timeline.
  - Creates or updates application's Next Action if specified.
- **Failure Behavior:** Dialog remains open with error details.

---

## 5. Browser Extension & Capture Interactions

### 5.1 Extension One-Click Capture
- **Trigger:** Clicking "Save to JobQuest" button in extension popup (X4, X5).
- **User Feedback:**
  - Save button shows spinner: *"Saving..."*.
  - Transforms to green success state (X8): *"Saved to [Workspace Name]"*.
  - Provides two actions: *"Capture another"* and *"Open application"*.
- **Validation:** Company and Role required. URL must be valid HTTP/HTTPS. Canonical stage must be validated against `/api/workflow`.
- **Permission Requirement:** Valid active extension token.
- **Confirmation Requirement:** None if no duplicate detected. If duplicate detected, requires selecting "Save anyway" (X9, X10).
- **History & Audit Implication:**
  - Inserts `applications` row and `job_posting_snapshots` row.
  - Appends `created_via_extension` event to `application_events`.
- **Failure Behavior:**
  - If network fails: Shows "API unavailable" screen (X3) with "Try again" button. Data preserved in popup storage.
  - If token revoked: Shows "Connection expired" screen (X2) with reconnect link.

### 5.2 Extension Token Generation & Reveal
- **Trigger:** Clicking "Connect a browser" in Settings → Browser Extension (S8) → submitting form.
- **User Feedback:**
  - Transitions to Token Reveal Modal (S9).
  - Displays generated secret token string (`jqx_live_...`) with one-click "Copy token" button.
  - Displays prominent warning: *"This token will never be shown again. Paste it into your extension popup immediately."*.
- **Validation:** Token description/device name required (max 64 chars). Expiration selection required (30d, 90d, 1y).
- **Permission Requirement:** Any authenticated user.
- **Confirmation Requirement:** User must click "Done" or close dialog after copying.
- **History & Audit Implication:**
  - Hashes token using server-side pepper and SHA-256.
  - Inserts row in `extension_tokens` with workspace ID, scope, and expiration.
  - Logged in `audit_events`.
- **Failure Behavior:** Error banner displayed in modal; no token issued.

---

## 6. Import & Export Interactions

### 6.1 Column Mapping & Validation
- **Trigger:** Uploading CSV/XLSX file in Import Wizard (E1) → advancing to Step 2 (E3).
- **User Feedback:**
  - Analyzes headers; auto-matches recognizable aliases (e.g. `Organization` → `Company`, `Position` → `Role`, `URL` → `Job URL`).
  - Unmatched columns flagged with yellow caution badge.
- **Validation:** Target fields `Company` and `Role` must be mapped before user can advance to Review step.
- **Permission Requirement:** Any user for personal import; `MANAGER` role required to import for other members (E2).
- **Confirmation Requirement:** Advancing to Step 3 requires resolving all required unmapped columns.
- **History & Audit Implication:** None at mapping stage.
- **Failure Behavior:** "Next" button disabled; unmapped required fields outlined in red.

### 6.2 Data Export Generation
- **Trigger:** Clicking "Export" button in Export Center (E7, E8) or Applications view (V9).
- **User Feedback:**
  - Button transitions to spinner: *"Generating export..."*.
  - Browser initiates file download (`jobquest_export_[domain]_[date].csv` or `.json`).
  - Toast confirmation: *"Export downloaded successfully"*.
- **Validation:** Selected date range and entity filters must yield valid data.
- **Permission Requirement:** Standard users export own records. Managers may export workspace-wide datasets.
- **Confirmation Requirement:** None for user exports. Managers exporting full workspace receive a scope confirmation prompt.
- **History & Audit Implication:**
  - Applies formula injection sanitization to all cells.
  - Logged in `audit_events` (`actor_id`, `export_format`, `record_count`, `scope`).
- **Failure Behavior:** Toast alerts: *"Export failed: [Reason]"* with Retry action.
