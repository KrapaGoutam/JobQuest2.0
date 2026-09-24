import { useState, useEffect, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileNav } from './MobileNav';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { FormField } from '../ui/FormField';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { useToast } from '../../context/ToastContext';
import { Search } from 'lucide-react';
import type { PublicSession, PublicUser } from '../../api';

export interface AppShellProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  user: PublicUser | null;
  session: PublicSession | null;
  onRefreshSession: () => Promise<unknown>;
  onLogout: (scope: 'local' | 'global') => Promise<void>;
  applicationsCount?: number;
  pageTitle: string;
  children: ReactNode;
  previewPane?: ReactNode; // Wide desktop (>=1680px) persistent preview rail
}

export function AppShell({
  currentPath,
  onNavigate,
  user,
  session,
  onRefreshSession,
  onLogout,
  applicationsCount = 0,
  pageTitle,
  children,
  previewPane,
}: AppShellProps) {
  const { addToast } = useToast();
  const [isRail, setIsRail] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNewAppOpen, setIsNewAppOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200,
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;
  const isWide = windowWidth >= 1680;

  // Auto-rail on tablet
  useEffect(() => {
    if (isTablet) {
      setIsRail(true);
    }
  }, [isTablet]);

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if (e.key === '/' && !isInput) {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if (e.key.toLowerCase() === 'q' && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsNewAppOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className="app-shell"
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: 'var(--color-canvas)',
      }}
    >
      {/* Desktop / Tablet Sidebar (hidden on mobile) */}
      {!isMobile && (
        <Sidebar
          currentPath={currentPath}
          onNavigate={onNavigate}
          isRail={isRail}
          onToggleRail={() => setIsRail((prev) => !prev)}
          applicationsCount={applicationsCount}
          onNewApplication={() => setIsNewAppOpen(true)}
        />
      )}

      {/* Main Canvas Area */}
      <div
        className="main"
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Topbar Header (hidden on mobile in favor of MobileNav topbar) */}
        {!isMobile && (
          <Topbar
            pageTitle={pageTitle}
            user={user}
            session={session}
            onRefreshSession={onRefreshSession}
            onLogout={onLogout}
            onOpenMobileNav={() => {}}
            onSearchFocus={() => setIsSearchOpen(true)}
          />
        )}

        {/* Mobile Header (rendered on mobile only) */}
        {isMobile && (
          <MobileNav
            currentPath={currentPath}
            onNavigate={onNavigate}
            onOpenSearch={() => setIsSearchOpen(true)}
            onLogout={() => void onLogout('local')}
          />
        )}

        {/* Page Content Viewport */}
        <div
          className="page-viewport"
          style={{
            flex: 1,
            display: 'flex',
            minHeight: 0,
            overflowY: 'auto',
            paddingBottom: isMobile ? 'var(--mobile-tabbar-height)' : 0,
          }}
        >
          {/* Main content canvas */}
          <main
            className="page"
            role="main"
            style={{
              flex: 1,
              minWidth: 0,
              padding: isMobile ? '16px' : '20px 24px',
              overflowY: 'auto',
            }}
          >
            {children}
          </main>

          {/* Persistent Wide Desktop (>=1680px) Preview Rail */}
          {isWide && previewPane && (
            <aside
              aria-label="Application preview pane"
              style={{
                width: '420px',
                flexShrink: 0,
                borderLeft: '1px solid var(--color-border)',
                background: 'var(--color-surface-1)',
                overflowY: 'auto',
                padding: '20px',
              }}
            >
              {previewPane}
            </aside>
          )}
        </div>
      </div>

      {/* Global Search Dialog Modal */}
      <Dialog
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        title="Quick Search"
        description="Search across all entities in your active workspace"
        maxWidth={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            autoFocus
            placeholder="Type a company, role, contact, or note..."
            leftIcon={<Search size={16} />}
          />
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            Search results grouped by entity: <b>Applications</b>, <b>Contacts</b>, <b>Notes</b>, <b>Tasks</b>.
          </div>
          <div className="card" style={{ padding: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '8px' }}>
              RECENT SEARCHES
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Staff Frontend Engineer · Stripe</span>
                <span className="pill muted">Application</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Sarah Connor · Technical Recruiter</span>
                <span className="pill muted">Contact</span>
              </div>
            </div>
          </div>
        </div>
      </Dialog>

      {/* New Application Quick Modal */}
      <Dialog
        isOpen={isNewAppOpen}
        onClose={() => setIsNewAppOpen(false)}
        title="Quick Add Application"
        description="Add a new job application to your active workspace"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsNewAppOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setIsNewAppOpen(false);
                addToast({
                  title: 'Application Created',
                  description: 'New application added to preparing stage.',
                  type: 'success',
                });
                onNavigate('/applications');
              }}
            >
              Create Application
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <FormField label="Company Name" required>
            {({ id }) => <Input id={id} placeholder="e.g. Acme Corp" autoFocus />}
          </FormField>
          <FormField label="Role Title" required>
            {({ id }) => <Input id={id} placeholder="e.g. Senior Product Designer" />}
          </FormField>
          <FormField label="Initial Stage">
            {({ id }) => (
              <Select id={id} defaultValue="APPLIED">
                <option value="SAVED">Saved</option>
                <option value="PREPARING">Preparing</option>
                <option value="APPLIED">Applied</option>
                <option value="SCREENING">Screening</option>
                <option value="INTERVIEW">Interview</option>
              </Select>
            )}
          </FormField>
        </div>
      </Dialog>
    </div>
  );
}
