import { useState } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import {
  CalendarDays,
  Briefcase,
  CheckSquare,
  Users,
  MoreHorizontal,
  Search,
  Menu,
  Palette,
  Settings,
  Shield,
  Video,
  Flame,
  BookOpen,
  FileText,
  BarChart3,
  LogOut,
} from 'lucide-react';
import { Drawer } from '../ui/Drawer';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Button } from '../ui/Button';

export interface MobileNavProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onOpenSearch: () => void;
  onLogout: () => void;
}

export function MobileNav({
  currentPath,
  onNavigate,
  onOpenSearch,
  onLogout,
}: MobileNavProps) {
  const { activeWorkspace, workspaceColor, isManager } = useWorkspace();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const tabs = [
    { id: 'today', path: '/dashboard', label: 'Today', icon: CalendarDays },
    { id: 'apps', path: '/applications', label: 'Apps', icon: Briefcase },
    { id: 'tasks', path: '/tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'contacts', path: '/contacts', label: 'Contacts', icon: Users },
    { id: 'more', path: '#more', label: 'More', icon: MoreHorizontal },
  ];

  const handleTabClick = (tab: typeof tabs[0]) => {
    if (tab.id === 'more') {
      setIsMoreOpen(true);
    } else {
      onNavigate(tab.path);
    }
  };

  return (
    <>
      {/* Mobile Top Header */}
      <div
        className="m-hdr mobile-only"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          height: 'var(--mobile-header-height)',
          padding: '0 8px 0 12px',
          background: 'var(--color-surface-1)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <button
          type="button"
          aria-label="Open mobile menu"
          onClick={() => setIsMoreOpen(true)}
          style={{
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 0,
            color: 'var(--color-text)',
            cursor: 'pointer',
          }}
        >
          <Menu size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '2px',
              background: workspaceColor,
              display: 'inline-block',
            }}
          />
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }} className="ell">
            {activeWorkspace?.name || 'Personal'}
          </h2>
        </div>

        <button
          type="button"
          aria-label="Search"
          onClick={onOpenSearch}
          style={{
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 0,
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
          }}
        >
          <Search size={18} />
        </button>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav
        className="m-tabbar mobile-only"
        aria-label="Mobile navigation"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 'var(--mobile-tabbar-height)',
          background: 'var(--color-surface-1)',
          borderTop: '1px solid var(--color-border)',
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          paddingBottom: '16px',
          zIndex: 40,
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = tab.id === 'more' ? isMoreOpen : currentPath === tab.path;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab)}
              className={`m-tab ${isSelected ? 'on' : ''}`}
              aria-label={tab.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                minHeight: '44px',
                border: 0,
                background: 'transparent',
                color: isSelected ? 'var(--color-accent)' : 'var(--color-text-muted)',
                fontFamily: 'inherit',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              <Icon size={20} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Expanded Navigation Drawer for Mobile */}
      <Drawer
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        title="JobQuest 2.0"
        description="Navigation & Settings"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div className="nav-head" style={{ padding: '0 4px', marginBottom: '8px' }}>
              Track
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[
                { path: '/interviews', label: 'Interviews', icon: Video },
                { path: '/habits', label: 'Habits', icon: Flame },
                { path: '/journal', label: 'Journal', icon: BookOpen },
                { path: '/resumes', label: 'Resumes', icon: FileText },
                { path: '/analytics', label: 'Analytics', icon: BarChart3 },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => {
                      onNavigate(item.path);
                      setIsMoreOpen(false);
                    }}
                    className="btn ghost"
                    style={{
                      minHeight: '44px',
                      justifyContent: 'flex-start',
                      width: '100%',
                      padding: '0 12px',
                    }}
                  >
                    <Icon size={18} className="muted" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {isManager && (
            <div>
              <div className="nav-head" style={{ padding: '0 4px', marginBottom: '8px' }}>
                Workspace (Manager)
              </div>
              <button
                type="button"
                onClick={() => {
                  onNavigate('/workspace');
                  setIsMoreOpen(false);
                }}
                className="btn ghost"
                style={{
                  minHeight: '44px',
                  justifyContent: 'flex-start',
                  width: '100%',
                  padding: '0 12px',
                }}
              >
                <Shield size={18} className="muted" />
                <span>Workspace Settings</span>
              </button>
            </div>
          )}

          <div>
            <div className="nav-head" style={{ padding: '0 4px', marginBottom: '8px' }}>
              Preferences & System
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ padding: '4px 0' }}>
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={() => {
                  onNavigate('/design-system');
                  setIsMoreOpen(false);
                }}
                className="btn ghost"
                style={{
                  minHeight: '44px',
                  justifyContent: 'flex-start',
                  width: '100%',
                  padding: '0 12px',
                }}
              >
                <Palette size={18} className="muted" />
                <span>Design System Showcase</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigate('/settings');
                  setIsMoreOpen(false);
                }}
                className="btn ghost"
                style={{
                  minHeight: '44px',
                  justifyContent: 'flex-start',
                  width: '100%',
                  padding: '0 12px',
                }}
              >
                <Settings size={18} className="muted" />
                <span>Settings</span>
              </button>
            </div>
          </div>

          <div style={{ paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
            <Button
              variant="danger-outline"
              onClick={() => {
                setIsMoreOpen(false);
                onLogout();
              }}
              style={{ width: '100%', height: '44px' }}
              leftIcon={<LogOut size={16} />}
            >
              Sign out
            </Button>
          </div>
        </div>
      </Drawer>
    </>
  );
}
