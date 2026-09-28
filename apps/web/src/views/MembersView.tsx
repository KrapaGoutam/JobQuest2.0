import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useToast } from '../context/ToastContext';
import {
  listWorkspaceMembers,
  updateMemberRole,
  updateMemberStatus,
  listPendingInvitations,
  revokeWorkspaceInvitation,
  type WorkspaceMemberDetailed,
  type WorkspaceInvitationRecord,
} from '../api/workspace';
import { InviteMemberModal } from '../components/workspace/InviteMemberModal';
import { RemoveMemberModal } from '../components/workspace/RemoveMemberModal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Dropdown } from '../components/ui/Dropdown';
import {
  ShieldCheck,
  UserPlus,
  Search,
  CheckCircle2,
  PauseCircle,
  MoreVertical,
  Briefcase,
  UserMinus,
  Ticket,
} from 'lucide-react';

interface MembersViewProps {
  currentUserId?: string | null;
  onNavigate?: (path: string) => void;
}

export function MembersView({ currentUserId, onNavigate }: MembersViewProps) {
  const { activeWorkspaceId, activeWorkspace, isManager } = useWorkspace();
  const { addToast } = useToast();

  const [members, setMembers] = useState<WorkspaceMemberDetailed[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'MANAGER' | 'USER'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');

  // Modals
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [removingMember, setRemovingMember] = useState<WorkspaceMemberDetailed | null>(null);

  // Active managers count for last-manager protection in UI
  const activeManagersCount = useMemo(() => {
    return members.filter((m) => m.role === 'MANAGER' && m.status === 'ACTIVE').length;
  }, [members]);

  const loadData = useCallback(async () => {
    if (!activeWorkspaceId) {
      setMembers([]);
      setInvitations([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const memberList = await listWorkspaceMembers(activeWorkspaceId);
      setMembers(memberList);

      if (isManager) {
        const inviteList = await listPendingInvitations(activeWorkspaceId);
        setInvitations(inviteList);
      } else {
        setInvitations([]);
      }
    } catch (err) {
      addToast({
        title: 'Failed to load workspace members',
        description: err instanceof Error ? err.message : 'Unknown error',
        type: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspaceId, isManager, addToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Role toggle
  const handleToggleRole = async (member: WorkspaceMemberDetailed) => {
    if (!activeWorkspaceId) return;

    if (member.role === 'MANAGER' && activeManagersCount <= 1) {
      addToast({
        title: 'Cannot demote manager',
        description: "You're the only active manager. Make someone else a manager first; a workspace always needs one.",
        type: 'warning',
      });
      return;
    }

    const newRole = member.role === 'MANAGER' ? 'USER' : 'MANAGER';
    try {
      await updateMemberRole(activeWorkspaceId, member.user_id, newRole);
      addToast({
        title: 'Role updated',
        description: `${member.display_name || member.username} is now a ${newRole === 'MANAGER' ? 'Manager' : 'User'}.`,
        type: 'success',
      });
      await loadData();
    } catch (err) {
      addToast({
        title: 'Failed to update role',
        description: err instanceof Error ? err.message : 'Unknown error',
        type: 'danger',
      });
    }
  };

  // Status toggle
  const handleToggleStatus = async (member: WorkspaceMemberDetailed) => {
    if (!activeWorkspaceId) return;

    if (member.role === 'MANAGER' && member.status === 'ACTIVE' && activeManagersCount <= 1) {
      addToast({
        title: 'Cannot suspend manager',
        description: "You're the only active manager. A workspace must have at least one active manager.",
        type: 'warning',
      });
      return;
    }

    const newStatus = member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await updateMemberStatus(activeWorkspaceId, member.user_id, newStatus);
      addToast({
        title: newStatus === 'ACTIVE' ? 'Access reactivated' : 'Access suspended',
        description: `${member.display_name || member.username}'s access was ${newStatus.toLowerCase()}.`,
        type: 'info',
      });
      await loadData();
    } catch (err) {
      addToast({
        title: 'Failed to update status',
        description: err instanceof Error ? err.message : 'Unknown error',
        type: 'danger',
      });
    }
  };

  // Revoke invite
  const handleRevokeInvite = async (invitationId: string) => {
    try {
      await revokeWorkspaceInvitation(invitationId);
      addToast({
        title: 'Invitation revoked',
        description: 'The invite code can no longer be used.',
        type: 'info',
      });
      await loadData();
    } catch (err) {
      addToast({
        title: 'Failed to revoke invitation',
        description: err instanceof Error ? err.message : 'Unknown error',
        type: 'danger',
      });
    }
  };

  // Filtered members
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (roleFilter !== 'ALL' && m.role !== roleFilter) return false;
      if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = m.display_name?.toLowerCase().includes(q);
        const matchesUser = m.username.toLowerCase().includes(q);
        if (!matchesName && !matchesUser) return false;
      }
      return true;
    });
  }, [members, roleFilter, statusFilter, search]);

  const totalMembers = members.length;
  const managersCount = members.filter((m) => m.role === 'MANAGER').length;
  const pendingCount = invitations.length;

  return (
    <div
      className="page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '24px',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* Title & Header */}
      <div
        className="page-title"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Members</h1>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            {totalMembers} {totalMembers === 1 ? 'member' : 'members'} · {managersCount} {managersCount === 1 ? 'manager' : 'managers'}
            {isManager && ` · ${pendingCount} pending ${pendingCount === 1 ? 'invite' : 'invites'}`}
          </div>
        </div>

        {isManager && (
          <Button variant="primary" onClick={() => setIsInviteOpen(true)}>
            <UserPlus size={16} />
            <span>Invite members</span>
          </Button>
        )}
      </div>

      {/* Permissions Explainer Banner */}
      <div
        className="banner neutral small"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          padding: '12px 14px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          fontSize: '12.5px',
          lineHeight: 1.5,
          color: 'var(--color-text)',
        }}
      >
        <ShieldCheck size={18} className="success-t" style={{ flexShrink: 0, marginTop: '2px' }} />
        <span>
          <b>Managers</b> can view, edit, archive and delete every member's records in this workspace,
          manage members, and configure workflow. <b>Users</b> see only their own records. Access never
          extends to other workspaces.
        </span>
      </div>

      {/* Search & Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: '240px' }}>
          <Search
            size={14}
            className="muted"
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
          />
          <Input
            placeholder="Find a member…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '32px', height: '34px' }}
          />
        </div>

        <div style={{ width: '130px' }}>
          <Select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'ALL' | 'MANAGER' | 'USER')}
            style={{ height: '34px' }}
          >
            <option value="ALL">Role: All</option>
            <option value="MANAGER">Managers</option>
            <option value="USER">Users</option>
          </Select>
        </div>

        <div style={{ width: '140px' }}>
          <Select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'SUSPENDED')}
            style={{ height: '34px' }}
          >
            <option value="ALL">Status: All</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </Select>
        </div>
      </div>

      {/* Members Table */}
      <div
        className="tbl card"
        style={{
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          className="tr th"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(200px, 1.8fr) 130px 120px 110px 120px 110px 50px',
            gap: '8px',
            padding: '10px 16px',
            borderBottom: '1px solid var(--color-border)',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--color-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          <span>Member</span>
          <span>Role</span>
          <span>Status</span>
          <span>Applications</span>
          <span>Last active</span>
          <span>Joined</span>
          <span></span>
        </div>

        {isLoading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
            Loading members…
          </div>
        ) : filteredMembers.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
            No members found matching your search.
          </div>
        ) : (
          filteredMembers.map((m) => {
            const isMe = currentUserId === m.user_id;
            const initials = (m.display_name || m.username)
              .split(' ')
              .map((w) => w[0])
              .slice(0, 2)
              .join('')
              .toUpperCase();
            const joinedDate = new Date(m.joined_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            });
            const lastActive = m.last_active_at
              ? new Date(m.last_active_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })
              : 'Never';

            const isSoleManager = m.role === 'MANAGER' && m.status === 'ACTIVE' && activeManagersCount <= 1;

            return (
              <div
                key={m.member_id || m.membership_id || m.user_id}
                className="tr"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(200px, 1.8fr) 130px 120px 110px 120px 110px 50px',
                  gap: '8px',
                  padding: '12px 16px',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  opacity: m.status === 'SUSPENDED' ? 0.65 : 1,
                  fontSize: '13px',
                }}
              >
                {/* Member Identity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: 'var(--color-surface-3)',
                      color: 'var(--color-text)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: '12px',
                      flexShrink: 0,
                    }}
                  >
                    {initials}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="ell" style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                      {m.display_name || m.username}
                      {isMe && (
                        <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '4px' }}>
                          (you)
                        </span>
                      )}
                    </div>
                    <div className="ell small muted" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      @{m.username}
                    </div>
                  </div>
                </div>

                {/* Role Pill */}
                <div>
                  {m.role === 'MANAGER' ? (
                    <span
                      className="pill success"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: 'var(--color-success-soft)',
                        color: 'var(--color-success)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      <ShieldCheck size={13} />
                      Manager
                    </span>
                  ) : (
                    <span
                      className="pill"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: 'var(--color-surface-2)',
                        color: 'var(--color-text-muted)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '12px',
                      }}
                    >
                      User
                    </span>
                  )}
                </div>

                {/* Status */}
                <div>
                  {m.status === 'ACTIVE' ? (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        color: 'var(--color-success)',
                        fontSize: '12px',
                      }}
                    >
                      <CheckCircle2 size={14} /> Active
                    </span>
                  ) : (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        color: 'var(--color-text-muted)',
                        fontSize: '12px',
                      }}
                    >
                      <PauseCircle size={14} /> Suspended
                    </span>
                  )}
                </div>

                {/* Applications Count */}
                <div style={{ color: 'var(--color-text)' }}>{m.applications_count}</div>

                {/* Last Active */}
                <div style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>{lastActive}</div>

                {/* Joined */}
                <div style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>{joinedDate}</div>

                {/* Actions Menu */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {isManager && (
                    <Dropdown
                      trigger={(props) => (
                        <button
                          type="button"
                          ref={props.ref}
                          onClick={props.onClick}
                          aria-expanded={props['aria-expanded']}
                          aria-haspopup={props['aria-haspopup']}
                          className="ibtn ghost"
                          aria-label={`Actions for ${m.display_name || m.username}`}
                          style={{
                            background: 'none',
                            border: 0,
                            padding: '4px',
                            cursor: 'pointer',
                            color: 'var(--color-text-muted)',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          <MoreVertical size={16} />
                        </button>
                      )}
                      align="right"
                      items={[
                        {
                          id: 'toggle-role',
                          label: m.role === 'MANAGER' ? 'Change to User' : 'Make manager',
                          icon: <ShieldCheck size={14} />,
                          disabled: isSoleManager,
                          onClick: () => handleToggleRole(m),
                        },
                        {
                          id: 'view-apps',
                          label: 'View their applications',
                          icon: <Briefcase size={14} />,
                          onClick: () => onNavigate?.(`/applications?owner=${m.user_id}`),
                        },
                        {
                          id: 'toggle-status',
                          label: m.status === 'ACTIVE' ? 'Suspend access' : 'Reactivate access',
                          icon: <PauseCircle size={14} />,
                          disabled: isSoleManager,
                          onClick: () => handleToggleStatus(m),
                        },
                        'separator' as const,
                        {
                          id: 'remove-member',
                          label: 'Remove from workspace…',
                          icon: <UserMinus size={14} />,
                          isDanger: true,
                          disabled: isSoleManager,
                          onClick: () => setRemovingMember(m),
                        },
                      ]}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pending Invites Section (For Managers) */}
      {isManager && invitations.length > 0 && (
        <div
          className="card"
          style={{
            background: 'var(--color-surface-1)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text)' }}>
                Pending invites
              </span>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginLeft: '8px' }}>
                Codes are shown only when created
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {invitations.map((inv) => {
              const expiresDate = new Date(inv.expires_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              });

              return (
                <div
                  key={inv.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(200px, 1.5fr) 110px 140px 140px 100px',
                    gap: '12px',
                    padding: '12px 16px',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--color-border-subtle)',
                    fontSize: '13px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <Ticket size={16} className="muted" />
                    <span className="mono" style={{ fontWeight: 600 }}>
                      {inv.code_prefix}
                    </span>
                    {inv.label && (
                      <span className="small muted ell" style={{ fontSize: '12px' }}>
                        {inv.label}
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="pill" style={{ fontSize: '11px', padding: '1px 6px' }}>
                      {inv.role}
                    </span>
                  </div>

                  <div className="small" style={{ color: 'var(--color-text-muted)' }}>
                    Used {inv.uses_count} of {inv.max_uses}
                  </div>

                  <div className="small muted">Expires {expiresDate}</div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button size="sm" variant="danger-outline" onClick={() => handleRevokeInvite(inv.id)}>
                      Revoke
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {activeWorkspaceId && (
        <InviteMemberModal
          isOpen={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
          workspaceId={activeWorkspaceId}
          onInvitationCreated={loadData}
        />
      )}

      {/* Remove Member Alert Dialog */}
      {activeWorkspaceId && (
        <RemoveMemberModal
          isOpen={!!removingMember}
          onClose={() => setRemovingMember(null)}
          workspaceId={activeWorkspaceId}
          workspaceName={activeWorkspace?.name || 'Workspace'}
          member={removingMember}
          onMemberRemoved={loadData}
          onSuspendInstead={(m) => handleToggleStatus(m)}
        />
      )}
    </div>
  );
}
