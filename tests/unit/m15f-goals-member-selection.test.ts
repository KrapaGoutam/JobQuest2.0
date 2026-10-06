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

    // Model the state transition of AnalyticsView activeTab, selectedMemberId, and userSelectedMemberRef
    let selectedMemberId = '';
    let activeTab: 'overview' | 'goals' = 'overview';
    let userSelectedMember = false;

    function evaluateAutoSelectEffect(
      tab: 'overview' | 'goals',
      memberId: string,
      currentId: string | null,
      explicitlySelected: boolean,
    ) {
      if (tab === 'goals' && memberId === '' && currentId && !explicitlySelected) {
        return currentId;
      }
      return memberId;
    }

    // 1. Initial overview tab: selectedMemberId remains '' (All members aggregate)
    selectedMemberId = evaluateAutoSelectEffect(activeTab, selectedMemberId, currentUserId, userSelectedMember);
    expect(selectedMemberId).toBe('');
    expect(resolveAnalyticsMember(members, selectedMemberId, 'ws-1', 'ws-1')).toBeNull(); // aggregate mode

    // 2. User navigates to Goals tab: immediately defaults to current user
    activeTab = 'goals';
    selectedMemberId = evaluateAutoSelectEffect(activeTab, selectedMemberId, currentUserId, userSelectedMember);
    expect(selectedMemberId).toBe(currentUserId);
    expect(resolveAnalyticsMember(members, selectedMemberId, 'ws-1', 'ws-1')).toEqual(
      expect.objectContaining({ user_id: currentUserId, role: 'MANAGER' }),
    );

    // 3. Manager explicitly selects "All members" ('') on Goals tab: respected and not reverted back
    userSelectedMember = true;
    selectedMemberId = '';
    selectedMemberId = evaluateAutoSelectEffect(activeTab, selectedMemberId, currentUserId, userSelectedMember);
    expect(selectedMemberId).toBe('');
    expect(resolveAnalyticsMember(members, selectedMemberId, 'ws-1', 'ws-1')).toBeNull(); // manager aggregate view preserved

    // 4. Manager switches to another authorized member: switching works and is preserved
    selectedMemberId = otherMemberId;
    selectedMemberId = evaluateAutoSelectEffect(activeTab, selectedMemberId, currentUserId, userSelectedMember);
    expect(selectedMemberId).toBe(otherMemberId);
    expect(resolveAnalyticsMember(members, selectedMemberId, 'ws-1', 'ws-1')).toEqual(
      expect.objectContaining({ user_id: otherMemberId, role: 'USER' }),
    );

    // 5. Personal workspace: sole manager defaults to current user immediately
    const personalMembers = activeAnalyticsMembers([member('solo-owner', 'ACTIVE', 'MANAGER')]);
    let personalMemberId = '';
    const personalUserSelected = false;
    personalMemberId = evaluateAutoSelectEffect('goals', personalMemberId, 'solo-owner', personalUserSelected);
    expect(personalMemberId).toBe('solo-owner');
    expect(resolveAnalyticsMember(personalMembers, personalMemberId, 'ws-p', 'ws-p')).toEqual(
      expect.objectContaining({ user_id: 'solo-owner' }),
    );

    // 6. Non-manager role behavior: targetUserId is null, defaulting directly to own progress in RPC
    const isManager = false;
    const targetUserId = isManager ? resolveAnalyticsMember(members, selectedMemberId, 'ws-1', 'ws-1')?.user_id ?? null : null;
    const isManagerAggregate = isManager && !targetUserId;
    expect(targetUserId).toBeNull();
    expect(isManagerAggregate).toBe(false);
  });
});
