# Milestone 12 — Workspace Management & Manager Functions: Test Plan

## 1. Overview & Strategy

This test plan defines the complete validation matrix for Milestone 12 (Workspace Management & Manager Functions). It covers pure unit logic, database-level security policies (RLS), transactional RPC procedures, concurrency guards, cross-milestone regressions (specifically M11 extension tokens and M3-M10 domain isolation), browser end-to-end user journeys, and automated accessibility auditing.

---

## 2. Test Suites & Coverage Matrix

### 2.1 Unit Tests (`tests/unit/m12-workspace.test.ts`)
- **UT-01 · Invite Code Formatting & Entropy:** Validates prefix generation (`JQI-••••-XXXX`), alphanumeric character sets, and format validation regex.
- **UT-02 · Member Role & Status Badges:** Validates UI mapping of `USER`, `MANAGER`, `ACTIVE`, and `SUSPENDED` states.
- **UT-03 · Member Search & Filter Predicates:** Validates client-side filtering by role, status, and substring searches over names and usernames.
- **UT-04 · Active Workspace Resolution & Fallback:** Validates workspace selection logic when preferred workspace is deleted or user is removed.
- **UT-05 · Error Code Mapping:** Validates mapping of database exceptions (`CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER`, `INVITATION_EXPIRED`, `INVITATION_REVOKED`, `ALREADY_WORKSPACE_MEMBER`) to human-readable error messages.

### 2.2 Integration Tests (`tests/integration/m12-workspace.test.ts`)
- **INT-01 · Workspace Creation & Metadata:**
  - Authenticated user calls `rpc_create_workspace(p_name, p_color, p_description)`.
  - Verifies workspace created with `workspace_type = 'SHARED'`.
  - Verifies creator automatically inserted as `role = 'MANAGER'`, `status = 'ACTIVE'`.
  - Verifies audit row recorded in `public.audit_events`.
- **INT-02 · Workspace Update & Archiving:**
  - Manager updates name, color, and description; non-manager update is rejected (`42501`).
  - Manager archives shared workspace; archiving personal workspace is rejected (`CHECK constraint`).
- **INT-03 · Invitation Generation & Security:**
  - Manager calls `rpc_create_workspace_invitation`; receives plaintext code once (`JQI-XXXX-XXXX`).
  - Verifies database contains only `code_hash` and masked `code_prefix`; raw code is never persisted.
  - Non-manager call to create invitation is rejected (`42501`).
- **INT-04 · Invitation Preview & Join Lifecycle:**
  - User calls `rpc_preview_workspace_invitation(p_code)`; receives metadata without joining.
  - User calls `rpc_join_workspace(p_code)`; membership created with specified role.
  - Verifies `uses_count` incremented.
  - Joining with expired code fails with `INVITATION_EXPIRED`.
  - Joining with revoked code fails with `INVITATION_REVOKED`.
  - Joining when `uses_count >= max_uses` fails with `INVITATION_EXHAUSTED`.
  - Attempting to join a workspace where user is already an active member is handled safely (`ALREADY_WORKSPACE_MEMBER`).
- **INT-05 · Member Role & Status Modifications (Audited):**
  - Manager promotes `USER` to `MANAGER`. Verifies role change and `audit_events` row.
  - Manager suspends active member (`status = 'SUSPENDED'`). Verifies status change and `audit_events` row.
  - Manager reactivates suspended member. Verifies status change and `audit_events` row.
- **INT-06 · Last Manager Safeguard (ADR-036):**
  - Workspace with 1 manager: Attempt to demote manager via `rpc_update_member_role` fails with `CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER`.
  - Workspace with 1 manager: Attempt to remove manager via `rpc_remove_workspace_member` fails with `CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER`.
  - Workspace with 1 manager: Attempt to suspend manager via `rpc_update_member_status` fails with `CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER`.
  - Workspace with 1 manager: Attempt to leave workspace via `rpc_leave_workspace` fails with `CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER`.
  - Workspace with 2 managers: Demoting one manager succeeds.
- **INT-07 · Durable Member Removal (ADR-037):**
  - User creates applications, tasks, and contacts in shared workspace.
  - Manager removes user via `rpc_remove_workspace_member`.
  - Membership row in `workspace_members` is deleted.
  - All existing applications, contacts, and tasks remain intact in the workspace with original `user_id` attribution (`ON DELETE RESTRICT` preserved).
  - Removed user cannot access workspace via PostgREST or RPCs (`42501`).
- **INT-08 · Cross-Workspace Manager Isolation:**
  - Manager of Workspace A attempts to list members, invite members, or modify roles in Workspace B.
  - All actions are rejected with `42501 Not Authorized`.
- **INT-09 · Concurrency & Race Conditions:**
  - Two managers attempt to demote each other simultaneously: at least one fails and database retains at least one active manager.
  - Two users attempt to claim the final use of an invitation concurrently: one succeeds, one receives `INVITATION_EXHAUSTED`.

### 2.3 Cross-Milestone Regression: M11 Extension Token Invalidation
- **EXT-01 · Active Token Access:** Active member with extension token bound to workspace successfully queries `/api/ext/v1/capture` and metadata.
- **EXT-02 · Suspended Member Invalidation:** When member is suspended (`status = 'SUSPENDED'`), subsequent requests with their extension token are immediately rejected (`403 Forbidden`).
- **EXT-03 · Removed Member Invalidation:** When member is removed from the workspace, subsequent requests with their extension token are immediately rejected (`403 Forbidden`).
- **EXT-04 · Foreign Workspace Binding:** Token bound to Workspace A cannot be used to read or capture data into Workspace B.

### 2.4 Browser E2E & Accessibility Tests (`e2e/m12-workspace.spec.ts`)
- **E2E-01 · Workspace Switcher Navigation:** User switches between Personal and Shared workspaces; validates top bar, sidebar accent color, and dashboard reload.
- **E2E-02 · Create Shared Workspace Dialog (W7):** Creates a new workspace with custom color swatch; verifies immediate switch to the newly created workspace.
- **E2E-03 · Member Roster & Role Actions (W1, W4):**
  - Manager views member list, searches by name, filters by role.
  - Verifies last-manager safeguard displays disabled action and lock notice.
- **E2E-04 · Invite & Join Flow (W2, W8):**
  - Manager generates invite code; copies code.
  - Second user joins workspace using the invite code modal; verifies new membership and role.
- **E2E-05 · Member Removal Modal (W3):**
  - Manager opens removal confirmation; verifies all impact bullets render clearly.
  - Confirms removal; verifies member disappears from active roster.
- **E2E-06 · Accessibility & Axe Audit:**
  - Automated Axe audit across all M12 dialogs (Create, Join, Invite, Remove) and full Member Roster.
  - Target: **0 critical, 0 serious, 0 blocking** accessibility violations.

---

## 3. Execution Gates & Pass Criteria

| Gate | Target | Pass Condition |
|---|---|---|
| **TypeScript & Lint** | `pnpm check` | 0 errors |
| **Unit Tests** | `pnpm --filter @jobquest/web test:unit` | 100% PASS |
| **Integration Tests** | `pnpm test:integration:m12` | 100% PASS |
| **Extension Regression** | `pnpm test:integration:m11` | 100% PASS |
| **Secret Scan** | Tracked files + bundles | 0 findings |
| **Hosted Verification** | `jobquest-dev` | 100% PASS |
| **Preview Health & E2E** | Vercel Preview | HTTP 200, 100% E2E PASS |
| **Accessibility** | Axe core | 0 critical/serious/blocking |
