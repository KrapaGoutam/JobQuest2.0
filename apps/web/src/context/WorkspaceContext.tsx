import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '../supabase';

export interface WorkspaceRecord {
  id: string;
  name: string;
  workspace_type: string;
}

export interface WorkspaceMembership {
  workspace_id: string;
  role: string;
  workspaces: WorkspaceRecord | null;
}

interface WorkspaceContextValue {
  memberships: WorkspaceMembership[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceRecord | null;
  activeRole: string;
  isManager: boolean;
  workspaceColor: string;
  setActiveWorkspaceId: (id: string) => void;
  loadWorkspaces: (preferredId?: string | null) => Promise<void>;
  createSharedWorkspace: (name: string) => Promise<string | null>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

// Generate deterministic workspace accent color based on workspace ID
function getWorkspaceColor(id: string | null): string {
  if (!id) return '#3157d5';
  const colors = [
    '#3157d5', // Classic blue
    '#147a55', // Forest green
    '#8a3fb0', // Purple
    '#9a5b08', // Amber
    '#246b9f', // Ocean
    '#c0392b', // Crimson
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
  }
  return colors[Math.abs(hash) % colors.length] ?? '#3157d5';
}

export function WorkspaceProvider({
  children,
  userActiveWorkspaceId,
}: {
  children: ReactNode;
  userActiveWorkspaceId?: string | null;
}) {
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null);

  const loadWorkspaces = useCallback(async (preferredId?: string | null) => {
    try {
      const res = await supabase
        .from('workspace_members')
        .select('workspace_id, role, workspaces(id, name, workspace_type)');

      if (res.error) {
        console.error('Error loading workspaces:', res.error.message);
        return;
      }

      const rows = (res.data as unknown as WorkspaceMembership[]) || [];
      // Deduplicate memberships by workspace_id
      const unique = rows.filter(
        (m, idx, arr) => arr.findIndex((o) => o.workspace_id === m.workspace_id) === idx,
      );
      setMemberships(unique);

      const targetId =
        preferredId ??
        activeWorkspaceId ??
        userActiveWorkspaceId ??
        unique[0]?.workspace_id ??
        null;

      setActiveWorkspaceIdState(targetId);
    } catch (err) {
      console.error('Exception loading workspaces:', err);
    }
  }, [activeWorkspaceId, userActiveWorkspaceId]);

  const createSharedWorkspace = async (name: string): Promise<string | null> => {
    try {
      const res = await supabase.rpc('rpc_create_workspace', { p_name: name });
      if (res.error) {
        throw new Error(res.error.message);
      }
      const newId = res.data as string;
      await loadWorkspaces(newId);
      return newId;
    } catch (err) {
      console.error('Failed to create shared workspace:', err);
      return null;
    }
  };

  const activeMembership = memberships.find((m) => m.workspace_id === activeWorkspaceId);
  const activeWorkspace = activeMembership?.workspaces ?? null;
  const activeRole = activeMembership?.role?.toUpperCase() ?? 'MEMBER';
  const isManager = activeRole === 'MANAGER' || activeRole === 'OWNER';
  const workspaceColor = getWorkspaceColor(activeWorkspaceId);

  return (
    <WorkspaceContext.Provider
      value={{
        memberships,
        activeWorkspaceId,
        activeWorkspace,
        activeRole,
        isManager,
        workspaceColor,
        setActiveWorkspaceId: setActiveWorkspaceIdState,
        loadWorkspaces,
        createSharedWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}
