import { supabase } from '../supabase';

export interface WorkspaceMemberDetailed {
  member_id: string;
  membership_id?: string;
  user_id: string;
  role: 'USER' | 'MANAGER';
  status: 'ACTIVE' | 'SUSPENDED';
  joined_at: string;
  last_active_at: string | null;
  username: string;
  display_name: string | null;
  applications_count: number;
}

export interface WorkspaceInvitationRecord {
  id: string;
  workspace_id: string;
  code_prefix: string;
  role: 'USER' | 'MANAGER';
  max_uses: number;
  uses_count: number;
  label: string | null;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
}

export interface CreatedInvitation {
  id: string;
  code: string;
  prefix: string;
  invitation_id: string;
  invite_code: string;
  code_prefix: string;
  role: 'USER' | 'MANAGER';
  max_uses: number;
  expires_at: string;
  label: string | null;
}

export interface InvitationPreview {
  workspace_id: string;
  workspace_name: string;
  workspace_color: string;
  role: 'USER' | 'MANAGER';
  label: string | null;
  managers: string[];
  max_uses: number;
  uses_count: number;
  expires_at: string;
}

export interface WorkspaceAuditEvent {
  event_id: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_name: string;
  action: string;
  target_user_id: string | null;
  target_user_name: string;
  payload: Record<string, unknown> | null;
}

/**
 * List detailed roster of workspace members with applications count and activity.
 */
export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberDetailed[]> {
  const { data, error } = await supabase.rpc('rpc_list_workspace_members_detailed', {
    p_workspace_id: workspaceId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data as WorkspaceMemberDetailed[]) || [];
}

/**
 * Update member role (USER <-> MANAGER).
 */
export async function updateMemberRole(
  workspaceId: string,
  targetUserId: string,
  newRole: 'USER' | 'MANAGER',
): Promise<void> {
  const { error } = await supabase.rpc('rpc_update_member_role', {
    p_workspace_id: workspaceId,
    p_target_user_id: targetUserId,
    p_new_role: newRole,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Update member status (ACTIVE <-> SUSPENDED).
 */
export async function updateMemberStatus(
  workspaceId: string,
  targetUserId: string,
  newStatus: 'ACTIVE' | 'SUSPENDED',
): Promise<void> {
  const { error } = await supabase.rpc('rpc_update_member_status', {
    p_workspace_id: workspaceId,
    p_target_user_id: targetUserId,
    p_new_status: newStatus,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Remove a member from the workspace (durable removal with data preservation).
 */
export async function removeWorkspaceMember(
  workspaceId: string,
  targetUserId: string,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_remove_workspace_member', {
    p_workspace_id: workspaceId,
    p_target_user_id: targetUserId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Leave a workspace as the calling user.
 */
export async function leaveWorkspace(workspaceId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_leave_workspace', {
    p_workspace_id: workspaceId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * List pending, unrevoked, unexpired invitations for a workspace.
 */
export async function listPendingInvitations(
  workspaceId: string,
): Promise<WorkspaceInvitationRecord[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('workspace_invitations')
    .select('id, workspace_id, code_prefix, role, max_uses, uses_count, label, expires_at, created_at, revoked_at')
    .eq('workspace_id', workspaceId)
    .is('revoked_at', null)
    .gt('expires_at', now)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data as WorkspaceInvitationRecord[]) || [];
}

/**
 * Create a new workspace invitation code.
 */
export async function createWorkspaceInvitation(
  workspaceId: string,
  params: {
    role?: 'USER' | 'MANAGER';
    max_uses?: number;
    expires_days?: number;
    label?: string;
  },
): Promise<CreatedInvitation> {
  const { data, error } = await supabase.rpc('rpc_create_workspace_invitation', {
    p_workspace_id: workspaceId,
    p_role: params.role ?? 'USER',
    p_max_uses: params.max_uses ?? 10,
    p_expires_days: params.expires_days ?? 7,
    p_label: params.label ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  const raw = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  if (!raw || (!raw.code && !raw.invite_code)) {
    throw new Error('Failed to generate invitation code.');
  }

  const id = String(raw.id ?? raw.invitation_id);
  const code = String(raw.code ?? raw.invite_code);
  const prefix = String(raw.prefix ?? raw.code_prefix);

  return {
    id,
    code,
    prefix,
    invitation_id: id,
    invite_code: code,
    code_prefix: prefix,
    role: (raw.role as 'USER' | 'MANAGER') ?? 'USER',
    max_uses: Number(raw.max_uses ?? 10),
    expires_at: String(raw.expires_at),
    label: raw.label ? String(raw.label) : null,
  };
}

/**
 * Revoke an existing invitation code.
 */
export async function revokeWorkspaceInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_revoke_workspace_invitation', {
    p_invitation_id: invitationId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Preview an invitation code before joining.
 */
export async function previewWorkspaceInvitation(inviteCode: string): Promise<InvitationPreview> {
  const { data, error } = await supabase.rpc('rpc_preview_workspace_invitation', {
    p_code: inviteCode.trim(),
  });

  if (error) {
    throw new Error(error.message);
  }

  const raw = data as Record<string, unknown>;
  return {
    workspace_id: String(raw.workspace_id),
    workspace_name: String(raw.workspace_name),
    workspace_color: String(raw.color || raw.workspace_color || 'oklch(0.55 0.12 160)'),
    role: (raw.role as 'USER' | 'MANAGER') ?? 'USER',
    label: raw.label ? String(raw.label) : null,
    managers: Array.isArray(raw.managers) ? (raw.managers as string[]) : [],
    max_uses: Number(raw.max_uses ?? 1),
    uses_count: Number(raw.uses_count ?? 0),
    expires_at: String(raw.expires_at || ''),
  };
}

/**
 * Join a workspace with an invitation code.
 */
export async function joinWorkspace(inviteCode: string): Promise<{ workspace_id: string; role: string }> {
  const { data, error } = await supabase.rpc('rpc_join_workspace', {
    p_code: inviteCode.trim(),
  });

  if (error) {
    throw new Error(error.message);
  }

  const wsId = typeof data === 'string' ? data : String((data as { workspace_id?: string })?.workspace_id || '');
  return { workspace_id: wsId, role: 'member' };
}

export type AuditScope = 'ALL' | 'AI' | 'OTHER';

/**
 * List workspace audit events for managers. `scope` is applied by the database
 * BEFORE the limit (AI = AI_* actions, OTHER = membership/security and the rest).
 */
export async function listWorkspaceAuditEvents(
  workspaceId: string,
  limit = 50,
  scope: AuditScope = 'ALL',
): Promise<WorkspaceAuditEvent[]> {
  const { data, error } = await supabase.rpc('rpc_list_workspace_audit_events', {
    p_workspace_id: workspaceId,
    p_limit: limit,
    p_scope: scope,
  });

  if (error) {
    throw new Error(error.message);
  }

  const rawRows = (data as Array<Record<string, unknown>>) || [];
  return rawRows.map((r) => ({
    event_id: String(r.id || r.event_id || ''),
    occurred_at: String(r.created_at || r.occurred_at || new Date().toISOString()),
    actor_user_id: r.actor_id ? String(r.actor_id) : (r.actor_user_id ? String(r.actor_user_id) : null),
    actor_name: String(r.actor_name || 'System'),
    action: String(r.action || ''),
    target_user_id: r.target_user_id ? String(r.target_user_id) : null,
    target_user_name: String(r.target_user_name || '—'),
    payload: (r.metadata as Record<string, unknown>) || (r.payload as Record<string, unknown>) || null,
  }));
}

/**
 * Update workspace name, color, or description.
 */
export async function updateWorkspaceMetadata(
  workspaceId: string,
  params: { name?: string; color?: string; description?: string | null },
): Promise<void> {
  const { error } = await supabase.rpc('rpc_update_workspace', {
    p_workspace_id: workspaceId,
    p_name: params.name ?? '',
    p_color: params.color ?? null,
    p_description: params.description ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Archive a workspace.
 */
export async function archiveWorkspace(workspaceId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_archive_workspace', {
    p_workspace_id: workspaceId,
  });

  if (error) {
    throw new Error(error.message);
  }
}
