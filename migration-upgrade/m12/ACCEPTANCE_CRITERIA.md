# Milestone 12 — Workspace Management & Manager Functions: Acceptance Criteria

## 1. Acceptance Criteria Checklist

### AC-01: Multi-Workspace Tenancy & Lifecycle
- [x] Self-registration automatically creates an immutable `PERSONAL` workspace with the user as sole `MANAGER`.
- [x] Users can create additional `SHARED` workspaces with a custom name, decorative color swatch, and optional description.
- [x] The creator of a shared workspace is automatically assigned the `MANAGER` role and `ACTIVE` status.
- [x] Workspaces can be archived by managers, hiding them from standard views while preserving all historical records.
- [x] Personal workspaces can never be archived or left.
- [x] Hard deletion of workspaces is strictly prevented.

### AC-02: Workspace Switcher & Navigation State
- [x] The workspace switcher displays the active workspace name, decorative color swatch, and user's role (`USER` or `MANAGER`).
- [x] Opening the switcher displays all workspaces in which the user holds an active membership.
- [x] Selecting a different workspace instantly updates the application shell, updates the sidebar accent color, invalidates cached queries, and reloads domain data.
- [x] Stale data from the previous workspace is never rendered or actionable in the newly selected workspace.
- [x] Direct deep-links to foreign or non-member workspaces safely redirect to the user's primary workspace with a warning notice.

### AC-03: Member Roster & Governance (Screens W1, W11)
- [x] The members roster view (`/workspace/members`) is accessible only to users with the `MANAGER` role in the active workspace.
- [x] Ordinary `USER` members attempting to access member administration receive a clean `403 Forbidden` / permission banner.
- [x] The roster displays member details: avatar/initials, display name, username, role badge (`Manager` or `User`), status badge (`Active` or `Suspended`), application count, last active timestamp, and joined date.
- [x] Roster can be filtered by role (`All`, `Manager`, `User`) and status (`All`, `Active`, `Suspended`), and searched by name/username.
- [x] Current user row is labeled with `(you)`.

### AC-04: Role Administration & Last Manager Safeguard (ADR-036, Screens W1, W4)
- [x] Managers can promote active `USER` members to `MANAGER`.
- [x] Managers can demote `MANAGER` members to `USER`, provided another active manager remains in the workspace.
- [x] Database trigger `trg_protect_last_manager` strictly rejects any attempt to demote, remove, or suspend the sole remaining manager of a workspace with exception `CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER`.
- [x] In the UI, the sole manager row disables demotion/removal actions and presents a descriptive lock notice (Screen W4).

### AC-05: Member Suspension & Reactivation
- [x] Managers can toggle member status between `ACTIVE` and `SUSPENDED`.
- [x] Suspended members retain historical attribution but lose access to the workspace and cannot query its PostgREST tables or execute RPCs.
- [x] Suspending the sole active manager of a workspace is blocked by the last manager safeguard trigger.

### AC-06: Durable Member Removal (ADR-037, Screen W3)
- [x] Removal of a member requires explicit confirmation via an alert dialog enumerating the consequences (Screen W3).
- [x] Confirming removal deletes the `workspace_members` row, revoking workspace access immediately.
- [x] All existing applications, tasks, contacts, documents, and historical events created by the removed member remain intact within the workspace, retaining their original `user_id` attribution (`ON DELETE RESTRICT`).
- [x] The removed user's personal workspace and memberships in other workspaces remain unaffected.

### AC-07: Workspace Invitations & Join Flow (Screens W2, W8)
- [x] Managers can create join invitations specifying role (`USER` or `MANAGER`), max uses (1 to 100), and expiration window (default 7 days).
- [x] Newly generated invite codes follow the format `JQI-<4chars>-<4chars>` and are displayed once in plaintext with "Copy code" and "Copy link" buttons (Screen W2).
- [x] The database stores only a SHA-256 hash (`code_hash`) and masked display prefix (`code_prefix`, e.g. `JQI-••••-7Q2M`); raw codes are never saved.
- [x] Managers can view pending invitations and revoke them before expiration.
- [x] The Join dialog (`/workspaces/join` or switcher modal, Screen W8) allows entering an invite code and renders a pre-join preview (workspace name, color, managers, and joining role) before committing.
- [x] Expired, revoked, or fully exhausted invitations are rejected with clear error messages.
- [x] Existing members attempting to join receive an `ALREADY_WORKSPACE_MEMBER` notice.

### AC-08: Cross-User Mutation Audit Logging (ADR-010, Screen W10)
- [x] Every manager mutation affecting another member (role change, status suspension, removal) or invitation (creation, revocation) writes an immutable record to `public.audit_events` in the same transaction.
- [x] Audit rows record `workspace_id`, `actor_id`, `target_user_id`, `action`, `metadata` (field changes only; no secrets or tokens), and timestamp.
- [x] Managers can inspect sensitive workspace events through the read-only Audit History view (`/workspace/audit`, Screen W10).
- [x] Read-audit remains deferred (no audit rows recorded for passive reads).

### AC-09: Extension Token Dynamic Invalidation
- [x] An extension token bound to a workspace functions normally while the user's membership is `ACTIVE`.
- [x] If the user is suspended or removed from the workspace, all API requests presenting that extension token are immediately rejected (`403 Forbidden`).
- [x] Workspace switching in the web application does not alter or corrupt an extension token's workspace binding.

### AC-10: Quality, Security & Accessibility Gates
- [x] `pnpm check` passes with 0 type errors.
- [x] `pnpm lint` passes with 0 warnings or errors.
- [x] Complete unit and integration test suites pass (100% green).
- [x] All M1B–M11 cross-milestone regressions pass.
- [x] Zero secrets committed in source code or build bundles.
- [x] Automated Axe accessibility audit across all M12 views and dialogs yields **0 critical, 0 serious, 0 blocking** violations.
- [x] Unmerged feature branch `feature/m12-workspace-manager` ready for user review.
