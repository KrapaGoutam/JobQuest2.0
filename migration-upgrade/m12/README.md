# Milestone 12 — Workspace Management & Manager Functions

## Status

PLANNED & INITIALIZED — feature branch `feature/m12-workspace-manager` created from updated `development` (commit `37cc400f`).

## Milestone Authority & Precedence Reconciliation

- **Authoritative Milestone:** **Milestone 12 — Workspace Management & Manager Functions**.
- **Superseded Historical Label:** An early pre-Gate-01 working draft (`migration-upgrade/docs/IMPLEMENTATION_PLAN.md` §12) tentatively assigned "Journal / Notes" to M12. That preliminary structure was superseded by the approved Gate 01 Architecture Proposal (`GATE_01_ARCHITECTURE_PROPOSAL.md` §23 M12, §6.1, §12) and Gate 03 baseline, which consolidated Journal/Notes into M6 (Tasks, Habits & Queue) and established M12 as the governing milestone for Workspace Management and Manager Functions.
- **Source Documents:**
  - `migration-upgrade/GATE_01_ARCHITECTURE_PROPOSAL.md` §6.1, §12, §23 M12
  - `migration-upgrade/FEATURE_CATALOG.md` FEATURE-MGR-001, FEATURE-SET-001
  - `migration-upgrade/BUSINESS_LOGIC_CATALOG.md` BL-016
  - `migration-upgrade/DECISIONS.md` ADR-036 (Last Manager Protection), ADR-037 (Durable Member Removal), ADR-047 (Workspace Roles in Query Time)
  - `migration-upgrade/gate-03/AUTHORIZATION_RLS_DESIGN.md` §1, §5, §6
  - `migration-upgrade/gate-03/RPC_DOMAIN_OPERATIONS.md` §5.6, §6
  - `migration-upgrade/gate-03/TARGET_SCHEMA.md` Table 4 (`workspaces`), Table 5 (`workspace_members`), Table 7 (`workspace_invitations`), Table 25 (`audit_events`)
  - `migration-upgrade/ui-design/gate-02b/mockups/08-workspace.html` (Screens W1–W11)

## Scope

### Included Scope
1. **Multi-Workspace Tenancy:**
   - Personal workspace (created automatically during user registration, cannot be left or archived).
   - Shared workspaces (created on demand via `rpc_create_workspace`, creator assigned `MANAGER`).
   - Workspace metadata: Name, decorative Color swatch, Description, `workspace_type` (`PERSONAL`, `SHARED`).
2. **Workspace Switcher & Navigation:**
   - Switcher in app shell displaying current workspace, available memberships, and user's role in each.
   - Seamless active workspace transition with automatic cache invalidation and route protection.
   - Deep-link validation ensuring access to requested workspace route.
3. **Workspace Members Management (Manager Surface):**
   - Members roster view (`/w/:ws/manage/members`) with search, role filter (`All`, `Manager`, `User`), status filter (`All`, `Active`, `Suspended`).
   - Member metadata: Avatar, display name, username, role badge, status indicator, application count, last active, joined date.
   - Role modifications: Promote `USER` → `MANAGER`, Demote `MANAGER` → `USER`.
   - Suspension: Toggle `ACTIVE` vs `SUSPENDED` status.
   - Member removal (`rpc_remove_workspace_member`): Revokes membership immediately, while preserving all historical applications, tasks, and audit logs with `ON DELETE RESTRICT`.
   - Leave workspace flow for non-sole-manager members.
4. **Last Manager Protection Safeguard (ADR-036):**
   - Database trigger `trg_protect_last_manager` on `workspace_members` strictly preventing the removal, demotion, or departure of a workspace's sole remaining manager.
5. **Workspace Invitations:**
   - Secure invitation codes (`JQI-<4chars>-<4chars>`) with configurable role (`USER`/`MANAGER`), max uses, and expiration (7 days default).
   - Single-use raw code display with copy-code and copy-link UX.
   - Pending invites list with revocation capability.
   - Join workspace flow (`/workspaces/join` or Join dialog) with pre-join preview (workspace name, managers, joining role).
6. **Cross-User Mutation Audit:**
   - Every manager modification to workspace membership, role changes, member removal, and invitation generation/revocation writes an immutable record to `public.audit_events`.
   - Manager read-only Audit History viewer (`/w/:ws/manage/audit`).
7. **Extension Token Membership Invalidation:**
   - Removing or suspending a member immediately invalidates their extension tokens bound to that workspace through dynamic membership revalidation in `/api/ext/v1`.

### Excluded Scope
- Production cutover, legacy data migration, or cutover execution (deferred to M14/M15).
- Global manager access (managers are strictly workspace-scoped).
- Password resets of other members (strictly forbidden).
- Manager read-audit logging (manager reads are not logged; only mutations are audited).
- Hard workspace deletion (destructive loss prevention; archiving only).
- Deletion of historical member records upon removal (Durable Historical Attribution preserved).

## Safety Classification

**NORMAL DEVELOPMENT**.
- Operates exclusively on `feature/m12-workspace-manager`, local disposable Supabase, `jobquest-dev` hosted development, and Vercel Previews.
- Zero production changes; `JobQuest1.0/` remains strictly read-only.
- Per Section 70 instructions: **DO NOT MERGE M12 TO DEVELOPMENT**. M12 will remain on its feature branch for user review upon completion.
