# Milestone 12 — Workspace Management & Manager Functions: Acceptance Criteria

## 1. Acceptance Criteria Checklist

### AC-01: Multi-Workspace Tenancy & Lifecycle
- [ ] Self-registration automatically creates an immutable `PERSONAL` workspace with the user as sole `MANAGER`.
- [ ] Users can create additional `SHARED` workspaces with a custom name, decorative color swatch, and optional description.
- [ ] The creator of a shared workspace is automatically assigned the `MANAGER` role and `ACTIVE` status.
- [ ] Workspaces can be archived by managers, hiding them from standard views while preserving all historical records.
- [ ] Personal workspaces can never be archived or left.
- [ ] Hard deletion of workspaces is strictly prevented.

### AC-02: Workspace Switcher & Navigation State
- [ ] The workspace switcher displays the active workspace name, decorative color swatch, and user's role (`USER` or `MANAGER`).
- [ ] Opening the switcher displays all workspaces in which the user holds an active membership.
- [ ] Selecting a different workspace instantly updates the application shell, updates the sidebar accent color, invalidates cached queries, and reloads domain data.
- [ ] Stale data from the previous workspace is never rendered or actionable in the newly selected workspace.
- [ ] Direct deep-links to foreign or non-member workspaces safely redirect to the user's primary workspace with a warning notice.

### AC-03: Member Roster & Governance (Screens W1, W11)
- [ ] The members roster view (`/workspace/members`) is accessible only to users with the `MANAGER` role in the active workspace.
- [ ] Ordinary `USER` members attempting to access member administration receive a clean `403 Forbidden` / permission banner.
- [ ] The roster displays member details: avatar/initials, display name, username, role badge (`Manager` or `User`), status badge (`Active` or `Suspended`), application count, last active timestamp, and joined date.
- [ ] Roster can be filtered by role (`All`, `Manager`, `User`) and status (`All`, `Active`, `Suspended`), and searched by name/username.
- [ ] Current user row is labeled with `(you)`.

### AC-04: Role Administration & Last Manager Safeguard (ADR-036, Screens W1, W4)
- [ ] Managers can promote active `USER` members to `MANAGER`.
- [ ] Managers can demote `MANAGER` members to `USER`, provided another active manager remains in the workspace.
- [ ] Database trigger `trg_protect_last_manager` strictly rejects any attempt to demote, remove, or suspend the sole remaining manager of a workspace with exception `CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER`.
- [ ] In the UI, the sole manager row disables demotion/removal actions and presents a descriptive lock notice (Screen W4).

### AC-05: Member Suspension & Reactivation
- [ ] Managers can toggle member status between `ACTIVE` and `SUSPENDED`.
- [ ] Suspended members retain historical attribution but lose access to the workspace and cannot query its PostgREST tables or execute RPCs.
- [ ] Suspending the sole active manager of a workspace is blocked by the last manager safeguard trigger.

### AC-06: Durable Member Removal (ADR-037, Screen W3)
- [ ] Removal of a member requires explicit confirmation via an alert dialog enumerating the consequences (Screen W3).
- [ ] Confirming removal deletes the `workspace_members` row, revoking workspace access immediately.
- [ ] All existing applications, tasks, contacts, documents, and historical events created by the removed member remain intact within the workspace, retaining their original `user_id` attribution (`ON DELETE RESTRICT`).
- [ ] The removed user's personal workspace and memberships in other workspaces remain unaffected.

### AC-07: Workspace Invitations & Join Flow (Screens W2, W8)
- [ ] Managers can create join invitations specifying role (`USER` or `MANAGER`), max uses (1 to 100), and expiration window (default 7 days).
- [ ] Newly generated invite codes follow the format `JQI-<4chars>-<4chars>` and are displayed once in plaintext with "Copy code" and "Copy link" buttons (Screen W2).
- [ ] The database stores only a SHA-256 hash (`code_hash`) and masked display prefix (`code_prefix`, e.g. `JQI-••••-7Q2M`); raw codes are never saved.
- [ ] Managers can view pending invitations and revoke them before expiration.
- [ ] The Join dialog (`/workspaces/join` or switcher modal, Screen W8) allows entering an invite code and renders a pre-join preview (workspace name, color, managers, and joining role) before committing.
- [ ] Expired, revoked, or fully exhausted invitations are rejected with clear error messages.
- [ ] Existing members attempting to join receive an `ALREADY_WORKSPACE_MEMBER` notice.

### AC-08: Cross-User Mutation Audit Logging (ADR-010, Screen W10)
- [ ] Every manager mutation affecting another member (role change, status suspension, removal) or invitation (creation, revocation) writes an immutable record to `public.audit_events` in the same transaction.
- [ ] Audit rows record `workspace_id`, `actor_id`, `target_user_id`, `action`, `metadata` (field changes only; no secrets or tokens), and timestamp.
- [ ] Managers can inspect sensitive workspace events through the read-only Audit History view (`/workspace/audit`, Screen W10).
- [ ] Read-audit remains deferred (no audit rows recorded for passive reads).

### AC-09: Extension Token Dynamic Invalidation
- [ ] An extension token bound to a workspace functions normally while the user's membership is `ACTIVE`.
- [ ] If the user is suspended or removed from the workspace, all API requests presenting that extension token are immediately rejected (`403 Forbidden`).
- [ ] Workspace switching in the web application does not alter or corrupt an extension token's workspace binding.

### AC-10: Quality, Security & Accessibility Gates
- [ ] `pnpm check` passes with 0 type errors.
- [ ] `pnpm lint` passes with 0 warnings or errors.
- [ ] Complete unit and integration test suites pass (100% green).
- [ ] All M1B–M11 cross-milestone regressions pass.
- [ ] Zero secrets committed in source code or build bundles.
- [ ] Automated Axe accessibility audit across all M12 views and dialogs yields **0 critical, 0 serious, 0 blocking** violations.
- [ ] Unmerged feature branch `feature/m12-workspace-manager` ready for user review.
