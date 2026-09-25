import { useWorkspace } from '../../context/WorkspaceContext';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { ThemeToggle } from '../ui/ThemeToggle';
import {
  LayoutDashboard,
  Briefcase,
  CheckSquare,
  Users,
  Calendar,
  Video,
  Flame,
  BookOpen,
  FileText,
  BarChart3,
  UserPlus,
  ArrowDownUp,
  GitBranch,
  ShieldCheck,
  Settings,
  Palette,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

export interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  isRail: boolean;
  onToggleRail: () => void;
  applicationsCount?: number;
  onNewApplication?: () => void;
}

export function Sidebar({
  currentPath,
  onNavigate,
  isRail,
  onToggleRail,
  applicationsCount = 0,
  onNewApplication,
}: SidebarProps) {
  const { isManager, workspaceColor } = useWorkspace();

  const coreNav = [
    { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'applications', path: '/applications', label: 'Applications', icon: Briefcase, count: applicationsCount },
    { id: 'tasks', path: '/tasks', label: 'Tasks & Follow-ups', icon: CheckSquare },
    { id: 'contacts', path: '/contacts', label: 'Contacts', icon: Users },
    { id: 'calendar', path: '/calendar', label: 'Calendar', icon: Calendar },
  ];

  const trackNav = [
    { id: 'interviews', path: '/interviews', label: 'Interviews', icon: Video },
    { id: 'habits', path: '/habits', label: 'Habits', icon: Flame },
    { id: 'journal', path: '/journal', label: 'Journal', icon: BookOpen },
    { id: 'resumes', path: '/resumes', label: 'Resumes', icon: FileText },
  ];

  const insightsNav = [
    { id: 'analytics', path: '/analytics', label: 'Analytics', icon: BarChart3 },
  ];

  const workspaceNav = [
    { id: 'ws-members', path: '/workspace/members', label: 'Members', icon: UserPlus },
    { id: 'ws-imports', path: '/workspace/imports', label: 'Import & Export', icon: ArrowDownUp },
    { id: 'ws-workflow', path: '/workspace/workflow', label: 'Workflow', icon: GitBranch },
    { id: 'ws-audit', path: '/workspace/audit', label: 'Audit History', icon: ShieldCheck },
  ];

  const bottomNav = [
    { id: 'settings', path: '/settings', label: 'Settings', icon: Settings },
    { id: 'design-system', path: '/design-system', label: 'Design System', icon: Palette },
  ];

  const renderNavItem = (item: {
    id: string;
    path: string;
    label: string;
    icon: typeof LayoutDashboard;
    count?: number;
    badge?: { text: string; danger?: boolean };
  }) => {
    const Icon = item.icon;
    const isCurrent = currentPath === item.path;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onNavigate(item.path)}
        className={`nav-item ${isCurrent ? 'cur' : ''}`}
        aria-current={isCurrent ? 'page' : undefined}
        title={isRail ? item.label : undefined}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          height: '32px',
          padding: isRail ? '0 12px' : '0 10px',
          justifyContent: isRail ? 'center' : 'flex-start',
          border: 0,
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
          fontSize: '13px',
          background: isCurrent ? 'var(--color-accent-soft)' : 'transparent',
          color: isCurrent ? 'var(--color-accent)' : 'var(--color-text)',
          fontWeight: isCurrent ? 600 : 400,
        }}
      >
        <Icon size={16} color={isCurrent ? 'var(--color-accent)' : 'var(--color-text-muted)'} aria-hidden="true" />
        {!isRail && <span style={{ flex: 1 }} className="ell">{item.label}</span>}
        {!isRail && item.count !== undefined && item.count > 0 && (
          <span className="nbadge">{item.count}</span>
        )}
        {!isRail && item.badge && (
          <span className={`nbadge ${item.badge.danger ? 'danger' : ''}`}>{item.badge.text}</span>
        )}
      </button>
    );
  };

  return (
    <aside
      className={`side ${isRail ? 'rail' : ''}`}
      aria-label="Primary navigation"
      style={{
        width: isRail ? 'var(--sidebar-rail-width)' : 'var(--sidebar-width)',
        borderTop: `3px solid ${workspaceColor}`,
        transition: 'width var(--duration-base) var(--ease-standard)',
      }}
    >
      {/* Workspace Switcher Header */}
      <div style={{ padding: '12px 10px 8px 10px' }}>
        <WorkspaceSwitcher isRail={isRail} />
      </div>

      {/* "+ New application" Button */}
      <div style={{ padding: '0 10px 8px 10px' }}>
        <button
          type="button"
          onClick={onNewApplication}
          className="btn primary focus-ring"
          title="New application"
          style={{
            width: '100%',
            height: '34px',
            borderRadius: 'var(--radius-md)',
            justifyContent: 'center',
          }}
        >
          <Plus size={15} />
          {!isRail && <span>New application</span>}
        </button>
      </div>

      {/* Navigation Groups */}
      <nav className="nav" aria-label="Primary navigation" style={{ overflowY: 'auto' }}>
        {/* Core items */}
        {coreNav.map(renderNavItem)}

        {/* Track items */}
        {!isRail && <div className="nav-head">Track</div>}
        {trackNav.map(renderNavItem)}

        {/* Insights items */}
        {!isRail && <div className="nav-head">Insights</div>}
        {insightsNav.map(renderNavItem)}

        {/* Workspace Manager items */}
        {isManager && (
          <>
            {!isRail && <div className="nav-head">Workspace</div>}
            {workspaceNav.map(renderNavItem)}
          </>
        )}
      </nav>

      {/* Bottom Footer Section */}
      <div className="side-foot">
        {bottomNav.map(renderNavItem)}

        {!isRail && (
          <div style={{ padding: '6px 8px 4px' }}>
            <ThemeToggle />
          </div>
        )}

        <button
          type="button"
          onClick={onToggleRail}
          aria-label={isRail ? 'Expand sidebar' : 'Collapse sidebar'}
          className="btn ghost sm"
          style={{
            width: '100%',
            justifyContent: isRail ? 'center' : 'flex-start',
            gap: '8px',
            color: 'var(--color-text-muted)',
            marginTop: '4px',
          }}
        >
          {isRail ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          {!isRail && <span style={{ fontSize: '11px' }}>Collapse sidebar</span>}
        </button>
      </div>
    </aside>
  );
}
