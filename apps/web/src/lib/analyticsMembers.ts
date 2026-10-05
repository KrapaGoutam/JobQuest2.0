export interface AnalyticsMember {
  user_id: string;
  role: string;
  username: string;
  display_name: string | null;
}

export interface AnalyticsRosterMember extends AnalyticsMember {
  status: 'ACTIVE' | 'SUSPENDED';
}

/** Keep the manager owner picker limited to unique, active workspace members. */
export function activeAnalyticsMembers(
  members: AnalyticsRosterMember[],
): AnalyticsMember[] {
  const seen = new Set<string>();

  return members.flatMap((member) => {
    if (
      member.status !== 'ACTIVE'
      || !member.user_id
      || !member.username
      || seen.has(member.user_id)
    ) {
      return [];
    }

    seen.add(member.user_id);
    return [{
      user_id: member.user_id,
      role: member.role,
      username: member.username,
      display_name: member.display_name,
    }];
  });
}

/** Resolve a selection only after the roster for the active workspace has loaded. */
export function resolveAnalyticsMember(
  members: AnalyticsMember[],
  selectedMemberId: string,
  rosterWorkspaceId: string | null,
  activeWorkspaceId: string | null,
): AnalyticsMember | null {
  if (!selectedMemberId || rosterWorkspaceId !== activeWorkspaceId) return null;
  return members.find((member) => member.user_id === selectedMemberId) ?? null;
}
