import { useWorkspace } from '../../context/WorkspaceContext';
import { useToast } from '../../context/ToastContext';
import { Search, Bell, Shield, Menu, RefreshCw, LogOut, KeyRound } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { Dropdown } from '../ui/Dropdown';
import { IconButton } from '../ui/IconButton';
import type { PublicSession, PublicUser } from '../../api';

export interface TopbarProps {
  pageTitle: string;
  user: PublicUser | null;
  session: PublicSession | null;
  onRefreshSession: () => Promise<unknown>;
  onLogout: (scope: 'local' | 'global') => Promise<void>;
  onOpenMobileNav: () => void;
  onSearchFocus?: () => void;
}

export function Topbar({
  pageTitle,
  user,
  session,
  onRefreshSession,
  onLogout,
  onOpenMobileNav,
  onSearchFocus,
}: TopbarProps) {
  const { activeWorkspace, isManager, workspaceColor } = useWorkspace();
  const { addToast } = useToast();

  const handleRefresh = async () => {
    try {
      await onRefreshSession();
      addToast({
        title: 'Session refreshed',
        description: 'Access token rotated safely via WebLock.',
        type: 'success',
      });
    } catch {
      addToast({
        title: 'Refresh failed',
        description: 'Could not refresh session.',
        type: 'danger',
      });
    }
  };

  const expiresTime = session?.expires_at
    ? new Date(session.expires_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Active';

  const userMenuItems = [
    {
      id: 'user-info',
      label: (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 600 }}>{user?.username || 'User'}</span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
            Expires at {expiresTime}
          </span>
        </div>
      ),
      onClick: () => {},
      disabled: true,
    },
    'separator' as const,
    {
      id: 'refresh-session',
      label: 'Refresh session now',
      icon: <RefreshCw size={14} />,
      onClick: handleRefresh,
    },
    {
      id: 'change-password',
      label: 'Change password',
      icon: <KeyRound size={14} />,
      onClick: () => {
        addToast({
          title: 'Account Settings',
          description: 'Password change available under Settings.',
          type: 'info',
        });
      },
    },
    'separator' as const,
    {
      id: 'logout-local',
      label: 'Sign out',
      icon: <LogOut size={14} />,
      isDanger: true,
      onClick: () => onLogout('local'),
    },
    {
      id: 'logout-global',
      label: 'Sign out everywhere',
      icon: <LogOut size={14} />,
      isDanger: true,
      onClick: () => onLogout('global'),
    },
  ];

  return (
    <header className="hdr" role="banner">
      {/* Mobile Hamburger Menu (visible on mobile only) */}
      <div className="mobile-only" style={{ display: 'none' }}>
        <IconButton
          icon={<Menu size={18} />}
          aria-label="Open navigation menu"
          variant="ghost"
          onClick={onOpenMobileNav}
        />
      </div>

      {/* Breadcrumb Area */}
      <div className="crumb" aria-label="Breadcrumb">
        <span
          className="dot"
          style={{ background: workspaceColor, display: 'inline-block' }}
          aria-hidden="true"
        />
        <span>{activeWorkspace?.name || 'Personal'}</span>
        <span className="muted" aria-hidden="true">›</span>
        <b>{pageTitle}</b>
      </div>

      {/* Manager Badge */}
      {isManager && (
        <div className="mgr-badge" title="You have manager permissions in this workspace">
          <Shield size={12} color="var(--color-success)" aria-hidden="true" />
          <span>Manager</span>
        </div>
      )}

      {/* Global Search Bar */}
      <div
        className="search focus-ring"
        onClick={onSearchFocus}
        role="search"
        style={{ cursor: 'pointer' }}
      >
        <Search size={15} color="var(--color-text-muted)" aria-hidden="true" />
        <span style={{ fontSize: '13px', flex: 1, color: 'var(--color-text-muted)' }}>
          Search applications, contacts, notes...
        </span>
        <span className="kbd" aria-label="Keyboard shortcut: forward slash">/</span >
      </div>

      {/* Notification Bell */}
      <button
        type="button"
        className="bell focus-ring"
        aria-label="Notifications"
        style={{
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <Bell size={17} color="var(--color-text-muted)" aria-hidden="true" />
      </button>

      {/* User Profile Menu */}
      <Dropdown
        align="right"
        width={220}
        trigger={({ onClick, ref, ...props }) => (
          <button
            ref={ref}
            type="button"
            onClick={onClick}
            aria-label={`User profile for ${user?.username || 'user'}`}
            className="focus-ring"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              border: 0,
              background: 'transparent',
              cursor: 'pointer',
              padding: '2px',
              borderRadius: 'var(--radius-pill)',
            }}
            {...props}
          >
            <Avatar name={user?.username || 'User'} size="md" />
          </button>
        )}
        items={userMenuItems}
      />
    </header>
  );
}
