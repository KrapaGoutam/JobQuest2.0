import { describe, expect, it } from 'vitest';

export function isInviteCodeFormat(code: string): boolean {
  return /^JQI-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(code.trim());
}

export function maskInviteCode(code: string): string {
  const clean = code.trim().toUpperCase();
  if (!isInviteCodeFormat(clean)) return 'JQI-••••-••••';
  return `JQI-••••-${clean.slice(-4)}`;
}

export function filterMembers<T extends { username: string; display_name?: string | null; role: string; status: string }>(
  members: T[],
  query: string,
  roleFilter: string,
  statusFilter: string
): T[] {
  const q = query.trim().toLowerCase();
  return members.filter((m) => {
    if (roleFilter !== 'All' && m.role.toUpperCase() !== roleFilter.toUpperCase()) return false;
    if (statusFilter !== 'All' && m.status.toUpperCase() !== statusFilter.toUpperCase()) return false;
    if (q) {
      const matchUsername = m.username.toLowerCase().includes(q);
      const matchDisplayName = (m.display_name ?? '').toLowerCase().includes(q);
      if (!matchUsername && !matchDisplayName) return false;
    }
    return true;
  });
}

export function mapWorkspaceError(codeOrMessage: string): string {
  if (codeOrMessage.includes('CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER')) {
    return "You're the only active manager. Make someone else a manager first; a workspace always needs one.";
  }
  if (codeOrMessage.includes('CANNOT_LEAVE_PERSONAL_WORKSPACE')) {
    return "Your personal workspace cannot be left or archived.";
  }
  if (codeOrMessage.includes('CANNOT_ARCHIVE_PERSONAL_WORKSPACE')) {
    return "Your personal workspace cannot be archived.";
  }
  if (codeOrMessage.includes('INVITATION_NOT_FOUND')) {
    return "This invite code is invalid or does not exist.";
  }
  if (codeOrMessage.includes('INVITATION_EXPIRED')) {
    return "This invite code has expired.";
  }
  if (codeOrMessage.includes('INVITATION_REVOKED')) {
    return "This invite code has been revoked by a workspace manager.";
  }
  if (codeOrMessage.includes('INVITATION_EXHAUSTED')) {
    return "This invite code has reached its maximum number of uses.";
  }
  if (codeOrMessage.includes('ALREADY_WORKSPACE_MEMBER')) {
    return "You are already an active member of this workspace.";
  }
  if (codeOrMessage.includes('MEMBERSHIP_SUSPENDED')) {
    return "Your membership in this workspace has been suspended.";
  }
  return 'An unexpected workspace error occurred.';
}

describe('Milestone 12 — Workspace Management Unit Tests', () => {
  it('validates invite code format', () => {
    expect(isInviteCodeFormat('JQI-4KDP-7Q2M')).toBe(true);
    expect(isInviteCodeFormat('jqi-4kdp-7q2m')).toBe(true);
    expect(isInviteCodeFormat('  JQI-ABCD-1234  ')).toBe(true);
    expect(isInviteCodeFormat('JQI-4KDP-7Q2')).toBe(false);
    expect(isInviteCodeFormat('INVALID-CODE')).toBe(false);
    expect(isInviteCodeFormat('')).toBe(false);
  });

  it('masks invite codes safely for pending list display', () => {
    expect(maskInviteCode('JQI-4KDP-7Q2M')).toBe('JQI-••••-7Q2M');
    expect(maskInviteCode('JQI-ABCD-1234')).toBe('JQI-••••-1234');
    expect(maskInviteCode('malformed')).toBe('JQI-••••-••••');
  });

  it('filters member lists by query, role, and status', () => {
    const list = [
      { username: 'maya.ortiz', display_name: 'Maya Ortiz', role: 'MANAGER', status: 'ACTIVE' },
      { username: 'jblake', display_name: 'Jordan Blake', role: 'MANAGER', status: 'ACTIVE' },
      { username: 'devp', display_name: 'Dev Patel', role: 'USER', status: 'ACTIVE' },
      { username: 'prao', display_name: 'Priyanka Rao', role: 'USER', status: 'SUSPENDED' },
    ];

    // Filter by role
    const managers = filterMembers(list, '', 'Manager', 'All');
    expect(managers.map((m) => m.username)).toEqual(['maya.ortiz', 'jblake']);

    // Filter by status
    const suspended = filterMembers(list, '', 'All', 'Suspended');
    expect(suspended.map((m) => m.username)).toEqual(['prao']);

    // Filter by search query
    const dev = filterMembers(list, 'dev', 'All', 'All');
    expect(dev.map((m) => m.username)).toEqual(['devp']);

    const patel = filterMembers(list, 'patel', 'All', 'All');
    expect(patel.map((m) => m.username)).toEqual(['devp']);

    // Combined filter
    const activeUsers = filterMembers(list, '', 'User', 'Active');
    expect(activeUsers.map((m) => m.username)).toEqual(['devp']);
  });

  it('maps database error codes to user-friendly messages', () => {
    expect(mapWorkspaceError('CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER')).toContain('only active manager');
    expect(mapWorkspaceError('CANNOT_LEAVE_PERSONAL_WORKSPACE')).toContain('personal workspace cannot be left');
    expect(mapWorkspaceError('INVITATION_EXPIRED')).toContain('has expired');
    expect(mapWorkspaceError('INVITATION_REVOKED')).toContain('has been revoked');
    expect(mapWorkspaceError('INVITATION_EXHAUSTED')).toContain('maximum number of uses');
    expect(mapWorkspaceError('ALREADY_WORKSPACE_MEMBER')).toContain('already an active member');
  });
});
