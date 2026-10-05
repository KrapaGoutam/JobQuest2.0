import { describe, expect, it } from 'vitest';
import {
  activeAnalyticsMembers,
  resolveAnalyticsMember,
  type AnalyticsRosterMember,
} from '../../apps/web/src/lib/analyticsMembers';

const member = (
  userId: string,
  status: AnalyticsRosterMember['status'] = 'ACTIVE',
  role = 'USER',
): AnalyticsRosterMember => ({
  user_id: userId,
  role,
  status,
  username: `user-${userId}`,
  display_name: `User ${userId}`,
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
