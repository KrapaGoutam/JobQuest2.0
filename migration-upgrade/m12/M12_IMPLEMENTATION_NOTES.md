# Milestone 12 — Implementation Notes: Workspace Management & Manager Governance

## 1. Architectural Overview & Context

Milestone 12 delivers multi-workspace management, invitation workflows, member rosters, manager role delegation, durable member removal, and audit event trails to JobQuest 2.0.

All features strictly adhere to JobQuest 2.0 core architectural invariants:
1. **Option B Authentication Unchanged**:
   - Zero native Supabase Auth users (`auth.users` remains empty);
   - Authentication remains custom Argon2id + ES256 JWTs with HttpOnly refresh cookies;
   - All RPCs use `auth.uid()` populated by the verified ES256 JWT claim.
2. **Workspace-Scoped Role Authority (MANAGER vs USER)**:
   - Managers are strictly workspace-scoped; there is no global administrator;
   - A manager in Workspace A possesses zero manager or read authority in Workspace B;
   - Role mutations, member status updates, and invitations operate exclusively within the manager's authorized workspace.
3. **Defense in Depth**:
   - Every state mutation and administrative action is implemented as a PostgreSQL `SECURITY DEFINER` stored procedure with `SET search_path = ''`;
   - Explicit `is_workspace_manager(workspace_id)` checks guard every manager capability;
   - Last active manager protection (ADR-036) is enforced at the database trigger level to prevent orphaned workspaces.

---

## 2. Database Schema & RPC Architecture

### 2.1 Schema Extensions (`supabase/migrations/20261010100000_m12_workspace_management.sql`)
- **`public.workspaces`**:
  - `color text`: OKLCH accessible color string for workspace identification;
  - `description text`: Optional workspace description;
  - `archived_at timestamptz`: Archive lifecycle timestamp (soft archive).
- **`public.workspace_members`**:
  - `status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED'))`;
  - `invited_by uuid references public.user_accounts(user_id)`;
  - `last_active_at timestamptz`: Timestamp updated on member activity.
- **`public.workspace_invitations`**:
  - `id uuid primary key default gen_random_uuid()`;
  - `workspace_id uuid not null references public.workspaces(id) on delete cascade`;
  - `code_hash text not null unique`: SHA-256 hex digest of the raw invite code;
  - `code_prefix text not null`: Masked prefix display format (e.g. `JQI-••••-XXXX`);
  - `role text not null check (role in ('USER', 'MANAGER'))`;
  - `created_by uuid not null references public.user_accounts(user_id)`;
  - `max_uses integer not null default 1 check (max_uses > 0)`;
  - `uses_count integer not null default 0 check (uses_count >= 0)`;
  - `expires_at timestamptz not null`;
  - `revoked_at timestamptz`;
  - `label text`: Optional human label (e.g. "Cohort 8 Intake").

### 2.2 Security Definer RPCs
| RPC | Authority | Purpose |
| --- | --- | --- |
| `rpc_create_workspace(p_name, p_color, p_description)` | Authenticated | Creates a new shared workspace, automatically adds the caller as `MANAGER`, and records audit event |
| `rpc_update_workspace(p_workspace_id, p_name, p_color, p_description)` | Manager | Updates workspace name, color, and description |
| `rpc_archive_workspace(p_workspace_id)` | Manager | Sets `archived_at` timestamp (personal workspaces cannot be archived) |
| `rpc_list_workspace_members_detailed(p_workspace_id)` | Authenticated (Members) | Lists member roster with joined date, last active, role, status, and applications count |
| `rpc_update_member_role(p_workspace_id, p_target_user_id, p_new_role)` | Manager | Promotes or demotes member between USER and MANAGER with audit log |
| `rpc_update_member_status(p_workspace_id, p_target_user_id, p_new_status)` | Manager | Suspends or activates member with audit log |
| `rpc_remove_workspace_member(p_workspace_id, p_target_user_id)` | Manager | Durable member removal (ADR-037): deletes membership row; preserves created application records |
| `rpc_leave_workspace(p_workspace_id)` | Member | Self-removal from workspace; protected against removing last manager |
| `rpc_create_workspace_invitation(p_workspace_id, p_role, p_max_uses, p_expires_days, p_label)` | Manager | Generates cryptographically secure invite code (`JQI-XXXX-XXXX`), stores SHA-256 hash, returns raw code once |
| `rpc_revoke_workspace_invitation(p_invitation_id)` | Manager | Revokes pending invitation |
| `rpc_preview_workspace_invitation(p_code)` | Authenticated | Previews workspace name, color, manager names, and joining role without joining |
| `rpc_join_workspace(p_code)` | Authenticated | Atomically increments uses_count, adds membership row, audits join event |
| `rpc_list_workspace_audit_events(p_workspace_id, p_limit)` | Manager | Returns audit log of administrative actions in the workspace |

---

## 3. UI Implementation Details (`apps/web`)

1. **Workspace Switcher (`WorkspaceSwitcher.tsx`)**:
   - Displays color swatches beside workspace names;
   - Displays current role indicator (`MANAGER` badge);
   - Offers "Create shared workspace" dialog with custom name and OKLCH color selection;
   - Offers "Join a workspace…" dialog with invite code input and preview card;
   - Persists selected active workspace in `localStorage` (`jq_active_ws`) to prevent resetting on page reload.
2. **Members View (`MembersView.tsx`)**:
   - Screen W1: Member roster showing display name, username, role pill, status pill, application count, and join date;
   - Screen W2: "Invite members" modal with role selector, max uses, expiration in days, and generated code copy box;
   - Screen W3: "Remove member" dialog confirming durable record preservation;
   - Screen W4: Role promotion/demotion dropdown and status suspension toggle for managers;
   - Screen W11: Responsive layout adjusting gracefully on 390px mobile viewports.
3. **Workspace Settings View (`WorkspaceSettingsView.tsx`)**:
   - Screen W5: Edit workspace name, color swatch, and description;
   - Screen W6: Archive shared workspace with confirmation dialog; personal workspace is explicitly protected.
4. **Join Workspace Modal (`JoinWorkspaceModal.tsx`)**:
   - Screen W8: Real-time code lookup on debounced input; displays workspace tile, name, managers, and joining role;
   - Prevents joining if the code is invalid, expired, revoked, or already a member.
5. **Audit History View (`AuditHistoryView.tsx`)**:
   - Screen W10: Manager-only audit ledger showing timestamp, actor, action, affected member, and details;
   - Search filter and action filter dropdown with accessible ARIA labels;
   - CSV export capability for compliance records.

---

## 4. Key Decisions & Safeguards (ADRs)

- **ADR-036: Last Active Manager Safeguard**:
  - The database trigger `trg_protect_last_manager` executes on `UPDATE` and `DELETE` on `workspace_members`.
  - It ensures that a shared workspace must have at least one member with `role = 'MANAGER'` and `status = 'ACTIVE'`.
  - Demoting the last manager, suspending the last manager, or the last manager attempting to leave or be removed raises an immediate exception `CANNOT_REMOVE_LAST_MANAGER` (SQLSTATE `P0001`).
- **ADR-037: Durable Member Removal**:
  - Removing a member deletes the membership record from `workspace_members`.
  - Existing application and interview records created by that user remain intact in the workspace with their original `user_id` reference.
  - Managers can continue reviewing or managing those records, but the removed user loses all read and write access to the workspace.
- **Dynamic Extension Token Invalidation (M11 Parity)**:
  - In `apps/api/src/lib/extensionTokens.ts`, token validation queries `workspace_members` and verifies `status = 'ACTIVE'`.
  - If a member is suspended or removed, their browser extension token is instantly denied with HTTP 403 on the next request.
