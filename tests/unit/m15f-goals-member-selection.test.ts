import { describe, expect, it } from 'vitest';
import {
  activeAnalyticsMembers,
  resolveAnalyticsMember,
} from '../../apps/web/src/lib/analyticsMembers';
import type { WorkspaceMemberDetailed } from '../../apps/web/src/api/workspace';

const member = (
  userId: string,
  status: WorkspaceMemberDetailed['status'] = 'ACTIVE',
  role: WorkspaceMemberDetailed['role'] = 'USER',
): WorkspaceMemberDetailed => ({
  member_id: `membership-${userId}`,
  user_id: userId,
  role,
  status,
  joined_at: '2026-01-01T00:00:00.000Z',
  last_active_at: null,
  username: `user-${userId}`,
  display_name: `User ${userId}`,
  applications_count: 0,
});

describe('M15-F goals member selection', () => {
  it('keeps the sole active manager available for a personal workspace', () => {
    const members = activeAnalyticsMembers([member('manager', 'ACTIVE', 'MANAGER')]);

    expect(members).toEqual([
      expect.objectContaining({ user_id: 'manager', role: 'MANAGER' }),
    ]);
  });

  it('keeps each active member once and excludes suspended entries', () => {
    const members = activeAnalyticsMembers([
      member('manager', 'ACTIVE', 'MANAGER'),
      member('member'),
      member('member'),
      member('suspended', 'SUSPENDED'),
    ]);

    expect(members.map(({ user_id }) => user_id)).toEqual(['manager', 'member']);
  });

  it('preserves an authorized selection only for the loaded active workspace roster', () => {
    const members = activeAnalyticsMembers([member('manager', 'ACTIVE', 'MANAGER')]);
    const refreshedMembers = activeAnalyticsMembers([member('manager', 'ACTIVE', 'MANAGER')]);

    expect(resolveAnalyticsMember(members, 'manager', 'workspace-a', 'workspace-a'))
      .toEqual(expect.objectContaining({ user_id: 'manager' }));
    expect(resolveAnalyticsMember(refreshedMembers, 'manager', 'workspace-a', 'workspace-a'))
      .toEqual(expect.objectContaining({ user_id: 'manager' }));
    expect(resolveAnalyticsMember(members, 'manager', null, 'workspace-a')).toBeNull();
    expect(resolveAnalyticsMember(members, 'manager', 'workspace-a', 'workspace-b')).toBeNull();
    expect(resolveAnalyticsMember(members, 'foreign', 'workspace-a', 'workspace-a')).toBeNull();
  });
});
