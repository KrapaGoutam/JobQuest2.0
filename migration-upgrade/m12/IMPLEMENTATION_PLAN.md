# Milestone 12 — Workspace Management & Manager Functions: Implementation Plan

## 1. Executive Summary

Milestone 12 implements full multi-workspace lifecycle management, manager governance functions, and secure member onboarding for JobQuest 2.0. Following the approved Gate 01 Architecture Proposal (§23 M12, §6.1, §12) and Gate 02B UI Design (Screens W1–W11), M12 delivers:

1. **Multi-Workspace Tenancy & Metadata:** Personal vs. Shared workspaces, color swatches, descriptions, and safe archiving (destructive deletion forbidden).
2. **Workspace Switcher & Navigation:** Instant active workspace switching with cache invalidation, deep-link protection, and role-reactive sidebar navigation.
3. **Manager Member Roster & Governance:** Members list with role (`USER`/`MANAGER`) and status (`ACTIVE`/`SUSPENDED`) management, application counts, and search/filter.
4. **Last Manager Protection Safeguard (ADR-036):** Database-enforced trigger blocking any action (removal, demotion, suspension, or departure) that would leave a workspace without an active manager.
5. **Secure Join Invitations:** Cryptographic invite codes (`JQI-<4chars>-<4chars>`) with single-view raw code display, pre-join preview, and pending invitation revocation.
6. **Durable Member Removal (ADR-037):** Immediate revocation of workspace access and extension tokens, while permanently preserving historical records (`applications`, `contacts`, `tasks`, etc.) with `ON DELETE RESTRICT`.
7. **Cross-User Mutation Audit:** Immutable transactional audit logging for all manager mutations to `public.audit_events`, accompanied by a read-only Audit History viewer (W10).
8. **Extension Token Dynamic Invalidation:** Suspended or removed members immediately fail API authentication when presenting workspace-bound extension tokens.

---

## 2. Milestone Authority & Precedence Reconciliation

- **Authoritative Milestone:** Milestone 12 — Workspace Management & Manager Functions.
- **Superseded Early Working Draft:** `migration-upgrade/docs/IMPLEMENTATION_PLAN.md` §12 tentatively proposed "Journal / Notes" for M12. This was superseded by `GATE_01_ARCHITECTURE_PROPOSAL.md` §23 M12, which incorporated Journal/Notes into M6 and established M12 as the dedicated workspace and manager governance milestone.
- **Source Documents:**
  - `migration-upgrade/GATE_01_ARCHITECTURE_PROPOSAL.md` §6.1, §7, §12, §23 M12
  - `migration-upgrade/FEATURE_CATALOG.md` FEATURE-MGR-001, FEATURE-SET-001
  - `migration-upgrade/BUSINESS_LOGIC_CATALOG.md` BL-016
  - `migration-upgrade/DECISIONS.md` ADR-010, ADR-036, ADR-037, ADR-040, ADR-047
  - `migration-upgrade/gate-03/TARGET_SCHEMA.md` Table 4, 5, 7, 25
  - `migration-upgrade/gate-03/AUTHORIZATION_RLS_DESIGN.md` §1, §5, §6
  - `migration-upgrade/gate-03/RPC_DOMAIN_OPERATIONS.md` §5.6, §6
  - `migration-upgrade/ui-design/gate-02b/mockups/08-workspace.html` (Screens W1–W11)

---

## 3. Database Architecture & Additive Migration

### 3.1 Migration File: `20261010100000_m12_workspace_management.sql`

Additive modifications only (M1–M11 migrations remain unmodified):

1. **`public.workspaces` Enhancements:**
   - Add `color VARCHAR(32) NULL DEFAULT 'oklch(0.55 0.12 160)'` (decorative color swatch).
   - Add `description TEXT NULL`.
   - Add `archived_at TIMESTAMPTZ NULL`.
   - Constraint: `personal` workspaces cannot be archived (`CHECK (archived_at IS NULL OR workspace_type <> 'PERSONAL')`).

2. **`public.workspace_members` Enhancements:**
   - Add `status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED'))`.
   - Add `invited_by UUID NULL REFERENCES public.user_accounts(user_id) ON DELETE SET NULL`.
   - Add `last_active_at TIMESTAMPTZ NULL`.
   - Create index `idx_workspace_members_active_role` on `(workspace_id, role, status)`.

3. **`public.workspace_invitations` Table:**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE`
   - `code_hash VARCHAR(128) NOT NULL UNIQUE` (SHA-256 HMAC / peppered hash)
   - `code_prefix VARCHAR(16) NOT NULL` (e.g. `JQI-••••-7Q2M` for secure masking in pending lists)
   - `role VARCHAR(16) NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'MANAGER'))`
   - `created_by UUID NOT NULL REFERENCES public.user_accounts(user_id) ON DELETE RESTRICT`
   - `label VARCHAR(128) NULL`
   - `max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses >= 1)`
   - `uses_count INTEGER NOT NULL DEFAULT 0 CHECK (uses_count <= max_uses)`
   - `expires_at TIMESTAMPTZ NOT NULL`
   - `revoked_at TIMESTAMPTZ NULL`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - Indices on `(workspace_id, created_at DESC)` and `(code_hash)`.

4. **Last Manager Safeguard Trigger (`trg_protect_last_manager`):**
   - Enhance existing `check_last_manager_protection()` function to also check:
     - Demotion: `new.role <> 'MANAGER'`
     - Deletion: `TG_OP = 'DELETE'`
     - Suspension: `new.status = 'SUSPENDED'`
   - If the actor attempts to leave, demote, delete, or suspend the sole active manager of a non-deleted workspace, raise exception `CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER` (`P0001`).

5. **RLS Policies:**
   - `workspace_invitations`:
     - `SELECT`: Only active `MANAGER`s in the workspace can view pending invitations.
     - `INSERT`: Only active `MANAGER`s can generate invitations.
     - `UPDATE`: Only active `MANAGER`s can update/revoke invitations.
   - `workspaces`:
     - Update policy allowing active `MANAGER`s to update metadata (`name`, `color`, `description`, `archived_at`).

6. **Domain RPC Functions (SECURITY DEFINER with strict search_path):**
   - `rpc_create_workspace(p_name text, p_color text default null, p_description text default null)`: creates shared workspace, adds creator as MANAGER, audits action.
   - `rpc_update_workspace(p_workspace_id uuid, p_name text, p_color text default null, p_description text default null)`: updates metadata if caller is MANAGER, audits action.
   - `rpc_archive_workspace(p_workspace_id uuid)`: sets `archived_at = now()`, denies personal workspace, audits action.
   - `rpc_create_workspace_invitation(p_workspace_id uuid, p_role text, p_max_uses int, p_expires_days int, p_label text)`: generates cryptographically random token (`JQI-<4chars>-<4chars>`), computes SHA-256 hash, stores prefix and hash, returns plaintext code. Audits creation.
   - `rpc_revoke_workspace_invitation(p_invitation_id uuid)`: marks invite revoked, audits action.
   - `rpc_preview_workspace_invitation(p_code text)`: public/authenticated lookup returning workspace summary (name, color, description, manager names, joining role) without joining.
   - `rpc_join_workspace(p_code text)`: validates token, increments uses_count, inserts membership, audits join.
   - `rpc_list_workspace_members_detailed(p_workspace_id uuid)`: returns roster with application counts and status for workspace managers.
   - `rpc_update_member_role(p_workspace_id uuid, p_target_user_id uuid, p_new_role text)`: atomically promotes/demotes member, checks last-manager invariant, audits action.
   - `rpc_update_member_status(p_workspace_id uuid, p_target_user_id uuid, p_new_status text)`: atomically suspends/reactivates member, checks last-manager invariant, audits action.
   - `rpc_remove_workspace_member(p_workspace_id uuid, p_target_user_id uuid)`: atomically removes member, checks last-manager invariant, audits action.
   - `rpc_leave_workspace(p_workspace_id uuid)`: user removes own membership, checks last-manager invariant, audits action.
   - `rpc_list_workspace_audit_events(p_workspace_id uuid, p_limit int default 50)`: manager-only read-only query on `public.audit_events` for the audit history view.

---

## 4. API & Backend Implementation (`apps/api`)

1. **Extension Token Dynamic Membership Invalidation:**
   - In `/api/ext/v1` authentication middleware, verify that the token's `user_id` has an `ACTIVE` membership in the token's bound `workspace_id`.
   - If membership is absent or `status = 'SUSPENDED'`, reject request immediately with `HTTP 403 Forbidden` (`WORKSPACE_MEMBERSHIP_REVOKED`).
2. **Server-Side Endpoints (Hono):**
   - Provide REST endpoints mapping to the workspace domain operations for clients that invoke `/api/workspaces/*`, `/api/manage/members/*`, `/api/manage/invitations/*`.

---

## 5. Frontend & UI Implementation (`apps/web`)

Following Direction D design tokens and mockups in `08-workspace.html`:

1. **Workspace Switcher (`apps/web/src/components/shell/WorkspaceSwitcher.tsx`):**
   - Display active workspace name, color swatch, and role badge.
   - List all available user memberships with distinct styling.
   - "Create shared workspace" trigger opening creation dialog with color pickers (W7).
   - "Join workspace" trigger opening code entry dialog (W8).
   - Instant active workspace transition with query client invalidation and cache clear.
2. **Members View (`apps/web/src/components/workspace/MembersView.tsx` - W1, W2, W3, W4, W11):**
   - Members roster table with search, role filter (`All`, `Manager`, `User`), status filter (`All`, `Active`, `Suspended`).
   - Columns: Member (avatar, display name, username, "(you)"), Role, Status, Applications count, Last active, Joined date, Actions menu.
   - Row Actions Menu:
     - "Make manager" / "Change to user"
     - "View their applications" (deep link to applications with owner filter)
     - "Suspend access" / "Reactivate access"
     - "Remove from workspace..."
   - Invite Members Dialog (W2): Select role, max uses, expiration, optional label. Raw code shown once with "Copy code" and "Copy link".
   - Remove Member Confirmation Dialog (W3): Explicitly enumerates consequences (data stays in workspace, extension tokens revoked, personal workspace unaffected).
   - Last Manager Safeguard Notice (W4): Disabled role/removal actions with explanatory warning message.
   - Pending Invites Card: Shows masked prefix (`JQI-••••-7Q2M`), role, uses counter, expiration, and Revoke button.
3. **Workspace Settings View (`apps/web/src/components/workspace/WorkspaceSettingsView.tsx` - W5, W6):**
   - General Section: Name input, color swatch selector, description.
   - Members Section: Member count summary and quick navigation.
   - Data Section: Import/Export shortcuts.
   - Danger Zone:
     - Personal workspace: Clear banner indicating personal workspace cannot be left or archived.
     - Shared workspace: "Leave workspace" (with last-manager validation) and "Archive workspace" (with confirmation dialog).
4. **Join Workspace Modal / Route (`apps/web/src/components/workspace/JoinWorkspaceModal.tsx` - W8):**
   - Invite code input field with uppercase formatting.
   - Live preview card displaying workspace name, color swatch, manager names, and joining role.
   - Clear disclosure explaining manager visibility in shared workspaces.
5. **Audit History View (`apps/web/src/components/workspace/AuditHistoryView.tsx` - W10):**
   - Read-only audit log table displaying timestamp, actor, action, affected member, and details.
   - Filter chips for action types and date ranges.

---

## 6. Execution Phases

- **Phase 1: Planning Package & Schema:** Author plan, test plan, acceptance criteria. Author migration `20261010100000_m12_workspace_management.sql`. Apply locally and verify pgTAP / SQL logic.
- **Phase 2: Database RPCs & Triggers:** Implement and verify all member, invite, last-manager, and audit procedures.
- **Phase 3: Extension Dynamic Auth Invalidation:** Update `/api/ext/v1` to verify active membership.
- **Phase 4: Frontend Components:** Build MembersView, WorkspaceSettingsView, JoinModal, and Switcher updates.
- **Phase 5: Local Quality Gate & Integration Tests:** Comprehensive unit and integration test suites covering all authorization boundaries, race conditions, and regressions.
- **Phase 6: Hosted Supabase & Vercel Preview:** Apply migration to `jobquest-dev` (`xpnkasclquplmrcmhsif`), deploy preview, verify health and live workflows.
- **Phase 7: Exact-SHA CI & Closeout Documentation:** Verify exact-SHA GitHub Actions CI run, author completion report, determine M13 scope, and stop with M12 unmerged.
