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

  it('2.1-PA Issue G — Goals tab defaults to current user when unselected, while allowing authorized member switching', () => {
    const currentUserId = 'manager-1';
    const otherMemberId = 'member-2';
    const members = activeAnalyticsMembers([
      member(currentUserId, 'ACTIVE', 'MANAGER'),
      member(otherMemberId, 'ACTIVE', 'USER'),
    ]);

    // Model the state transition of AnalyticsView activeTab and selectedMemberId
    let selectedMemberId = '';
    let activeTab: 'overview' | 'goals' = 'overview';

    function evaluateAutoSelectEffect(tab: 'overview' | 'goals', memberId: string, currentId: string | null) {
      if (tab === 'goals' && memberId === '' && currentId) {
        return currentId;
      }
      return memberId;
    }

    // 1. Initial overview tab: selectedMemberId remains '' (All members aggregate)
    selectedMemberId = evaluateAutoSelectEffect(activeTab, selectedMemberId, currentUserId);
    expect(selectedMemberId).toBe('');
    expect(resolveAnalyticsMember(members, selectedMemberId, 'ws-1', 'ws-1')).toBeNull(); // aggregate mode

    // 2. User navigates to Goals tab: immediately defaults to current user
    activeTab = 'goals';
    selectedMemberId = evaluateAutoSelectEffect(activeTab, selectedMemberId, currentUserId);
    expect(selectedMemberId).toBe(currentUserId);
    expect(resolveAnalyticsMember(members, selectedMemberId, 'ws-1', 'ws-1')).toEqual(
      expect.objectContaining({ user_id: currentUserId, role: 'MANAGER' })
    );

    // 3. Manager switches to another authorized member: switching works and is preserved
    selectedMemberId = otherMemberId;
    selectedMemberId = evaluateAutoSelectEffect(activeTab, selectedMemberId, currentUserId);
    expect(selectedMemberId).toBe(otherMemberId); // NOT overridden back to currentUserId
    expect(resolveAnalyticsMember(members, selectedMemberId, 'ws-1', 'ws-1')).toEqual(
      expect.objectContaining({ user_id: otherMemberId, role: 'USER' })
    );

    // 4. Authorized switching to another member also preserved
    const thirdMemberId = 'member-3';
    selectedMemberId = thirdMemberId;
    selectedMemberId = evaluateAutoSelectEffect(activeTab, selectedMemberId, currentUserId);
    expect(selectedMemberId).toBe(thirdMemberId);
  });
});

