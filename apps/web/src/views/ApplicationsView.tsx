import { useState, useEffect, useCallback, useMemo, type FormEvent } from 'react';
import { Card, CardHeader, CardTitle, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../context/ToastContext';
import {
  ShieldCheck,
  RefreshCw,
  Plus,
  KeyRound,
} from 'lucide-react';
import type { PublicSession, PublicUser } from '../api';
import type {
  Application,
  ApplicationStage,
  ApplicationSort,
  ApplicationOutcome,
  ClosureReason,
  CanonicalWorkflow,
} from '../types/applications';
import {
  fetchApplications,
  createApplication,
  updateApplication,
  moveApplicationStage,
  setApplicationOutcome,
  keepApplicationActive,
  archiveApplication,
  restoreApplication,
  fetchCanonicalWorkflow,
  fetchWorkspaceMembers,
  type WorkspaceMemberInfo,
  type CreateApplicationPayload,
} from '../api/applications';
import { calculateDaysInactive, computeAgingBand } from '../types/applications';
import { ApplicationsToolbar } from '../components/applications/ApplicationsToolbar';
import { ApplicationsTable } from '../components/applications/ApplicationsTable';
import { AgingBanner } from '../components/applications/AgingBanner';
import { BulkActionBar } from '../components/applications/BulkActionBar';
import { CreateApplicationModal } from '../components/applications/CreateApplicationModal';
import { EditApplicationModal } from '../components/applications/EditApplicationModal';
import { StageMoveDialog } from '../components/applications/StageMoveDialog';
import { OutcomeDialog } from '../components/applications/OutcomeDialog';
import { ApplicationDetailDrawer } from '../components/applications/ApplicationDetailDrawer';
import { ApplicationPreviewRail } from '../components/applications/ApplicationPreviewRail';

export interface ApplicationRecord {
  id: string;
  company_name: string;
  role_title: string;
  stage: string;
  status: string;
  user_id: string;
  archived_at: string | null;
}

export interface WorkflowDef {
  stages: { id: string; label: string }[];
  outcomes: { id: string; label: string }[];
}

export interface ApplicationsViewProps {
  user: PublicUser | null;
  session: PublicSession | null;
  apps?: ApplicationRecord[];
  wfDirect?: WorkflowDef | null;
  wfNode?: WorkflowDef | null;
  recoveryCodes?: string[] | null;
  leakResults?: Record<string, boolean> | null;
  probeStatus?: string;
  log?: string[];
  activeWorkspaceId?: string | null;
  userRole?: string;
  onRefresh: () => Promise<unknown>;
  onLogout: (scope: 'local' | 'global') => Promise<void>;
  onCreateApp?: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onStageChange?: (id: string, stage: string) => Promise<void>;
  onArchive?: (id: string) => Promise<void>;
  onLoadWorkflow?: () => Promise<void>;
  onPasswordChange?: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onRegenerateCodes?: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onLeakCheck?: () => Promise<void>;
  onDismissCodes?: () => void;
}

export function ApplicationsView({
  user,
  session,
  apps: legacyApps = [],
  wfDirect,
  wfNode,
  recoveryCodes,
  leakResults,
  probeStatus = '',
  log = [],
  activeWorkspaceId,
  userRole = 'MEMBER',
  onRefresh,
  onLogout,
  onCreateApp,
  onStageChange,
  onArchive,
  onLoadWorkflow,
  onPasswordChange,
  onRegenerateCodes,
  onLeakCheck,
  onDismissCodes,
}: ApplicationsViewProps) {
  const { addToast } = useToast();

  // Active workspace determination
  const wsId = activeWorkspaceId || user?.active_workspace_id || '';
  const isManager = userRole === 'MANAGER' || userRole === 'OWNER';

  // Applications data state
  const [applications, setApplications] = useState<Application[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // Workflow & members
  const [workflow, setWorkflow] = useState<CanonicalWorkflow | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberInfo[]>([]);

  // Filtering & Search
  const [activeStage, setActiveStage] = useState<string>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [archiveState, setArchiveState] = useState<'active' | 'archived' | 'all'>('active');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedOwner, setSelectedOwner] = useState<string>('ALL');
  const [sort, setSort] = useState<ApplicationSort>({
    field: 'last_activity_at',
    direction: 'desc',
  });

  // Table selection & active row
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Modals & Panels state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [drawerApp, setDrawerApp] = useState<Application | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isStageMoveOpen, setIsStageMoveOpen] = useState(false);
  const [stageMoveTarget, setStageMoveTarget] = useState<Application | null>(null);
  const [isOutcomeOpen, setIsOutcomeOpen] = useState(false);
  const [outcomeTarget, setOutcomeTarget] = useState<Application | null>(null);

  // Wide desktop (>=1680px) Preview Rail persistence & state
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('jobquest_preview_rail_open');
      return stored !== 'false';
    }
    return true;
  });

  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1440
  );

  const isWide = windowWidth >= 1680;
  const isMobile = windowWidth < 768;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleTogglePreview = useCallback(() => {
    setIsPreviewOpen((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('jobquest_preview_rail_open', String(next));
      }
      return next;
    });
  }, []);

  // Keyboard shortcut: P toggles preview rail; Q opens new application modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        activeEl?.tagName === 'SELECT' ||
        activeEl?.getAttribute('contenteditable') === 'true';

      if (isInput) return;

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handleTogglePreview();
      } else if (e.key === 'q' || e.key === 'Q') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          setIsCreateOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePreview]);

  // Load canonical workflow & workspace members
  useEffect(() => {
    if (wsId) {
      fetchCanonicalWorkflow(wsId)
        .then(setWorkflow)
        .catch(() => {});
      if (isManager) {
        fetchWorkspaceMembers(wsId)
          .then(setMembers)
          .catch(() => {});
      }
    }
  }, [wsId, isManager]);

  // Load applications
  const loadApps = useCallback(async () => {
    if (!wsId) return;
    try {
      setLoading(true);
      const res = await fetchApplications(
        wsId,
        {
          stage: activeStage,
          status: outcomeFilter === 'OPEN' || outcomeFilter === 'CLOSED' ? outcomeFilter : undefined,
          outcome: outcomeFilter !== 'ALL' && outcomeFilter !== 'OPEN' && outcomeFilter !== 'CLOSED' ? outcomeFilter : undefined,
          priority: priorityFilter,
          archiveState,
          search: searchQuery,
          ownerId: selectedOwner,
        },
        sort,
        0,
        100
      );

      setApplications(res.applications);
      setTotalCount(res.totalCount);

      // Default active ID to first application if none set
      if (res.applications.length > 0 && res.applications[0]) {
        const firstId = res.applications[0].id;
        setActiveId((prev) => (prev && res.applications.some((a) => a.id === prev) ? prev : firstId));
      } else {
        setActiveId(null);
      }
    } catch (err: unknown) {
      addToast({
        title: 'Failed to load applications',
        description: (err as Error).message || 'Error communicating with database',
        type: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [wsId, activeStage, outcomeFilter, priorityFilter, archiveState, searchQuery, selectedOwner, sort, addToast]);

  useEffect(() => {
    void loadApps();
  }, [loadApps, legacyApps]);

  // Compute stage counts and aging metrics
  const { stageCounts, staleCount, longWaitingCount } = useMemo(() => {
    const counts: Record<string, number> = {};
    let stale = 0;
    let longWaiting = 0;

    for (const app of applications) {
      counts[app.stage] = (counts[app.stage] ?? 0) + 1;
      if (app.status === 'OPEN' && !app.archived_at) {
        const days = calculateDaysInactive(app.last_activity_at);
        const band = computeAgingBand(days);
        if (band === 'STALE') stale++;
        if (band === 'LONG_WAITING') longWaiting++;
      }
    }

    return { stageCounts: counts, staleCount: stale, longWaitingCount: longWaiting };
  }, [applications]);

  // Active selected application for preview rail
  const previewApp = useMemo(() => {
    if (!activeId) return applications[0] ?? null;
    return applications.find((a) => a.id === activeId) ?? applications[0] ?? null;
  }, [activeId, applications]);

  // Domain Actions
  const handleCreated = async (payload: CreateApplicationPayload) => {
    await createApplication(payload);
    addToast({
      title: 'Application Created',
      description: `${payload.company_name} — ${payload.role_title} added to ${payload.stage || 'APPLIED'}.`,
      type: 'success',
    });
    await loadApps();
  };

  const handleUpdate = async (applicationId: string, updates: Partial<Application>) => {
    await updateApplication(applicationId, updates);
    addToast({
      title: 'Application Updated',
      description: 'Changes saved successfully.',
      type: 'success',
    });
    await loadApps();
    if (drawerApp?.id === applicationId) {
      setDrawerApp((prev) => (prev ? { ...prev, ...updates } : null));
    }
  };

  const handleConfirmMoveStage = async (newStage: ApplicationStage, notes?: string) => {
    if (stageMoveTarget) {
      // Single row transition
      await moveApplicationStage(stageMoveTarget.id, newStage, notes);
      addToast({
        title: 'Stage Updated',
        description: `Moved to ${newStage}`,
        type: 'success',
      });
    } else if (selectedIds.length > 0) {
      // Bulk transition
      for (const id of selectedIds) {
        await moveApplicationStage(id, newStage, notes);
      }
      addToast({
        title: 'Bulk Stage Move',
        description: `Updated ${selectedIds.length} applications to ${newStage}`,
        type: 'success',
      });
      setSelectedIds([]);
    }
    await loadApps();
  };

  const handleConfirmOutcome = async (
    outcome: ApplicationOutcome,
    closureReason?: ClosureReason | null,
    closureNotes?: string | null
  ) => {
    if (outcomeTarget) {
      await setApplicationOutcome(outcomeTarget.id, outcome, closureReason, closureNotes);
      addToast({
        title: 'Application Closed',
        description: `Outcome recorded: ${outcome}`,
        type: 'success',
      });
      await loadApps();
    }
  };

  const handleKeepActive = async (appId: string) => {
    await keepApplicationActive(appId);
    addToast({
      title: 'Activity Refreshed',
      description: 'Application marked as currently active.',
      type: 'success',
    });
    await loadApps();
  };

  const handleArchive = async (appId: string) => {
    await archiveApplication(appId);
    if (onArchive) {
      try {
        await onArchive(appId);
      } catch {
        // preserve diagnostic compatibility
      }
    }
    addToast({
      title: 'Application Archived',
      description: 'Record moved to archive.',
      type: 'info',
    });
    await loadApps();
  };

  const handleRestore = async (appId: string) => {
    await restoreApplication(appId);
    addToast({
      title: 'Application Restored',
      description: 'Application returned to active pipeline.',
      type: 'success',
    });
    await loadApps();
  };

  // Bulk actions
  const handleBulkGhosted = async () => {
    for (const id of selectedIds) {
      await setApplicationOutcome(id, 'GHOSTED', null, 'Bulk marked as ghosted');
    }
    addToast({
      title: 'Bulk Action',
      description: `Marked ${selectedIds.length} applications as Ghosted`,
      type: 'info',
    });
    setSelectedIds([]);
    await loadApps();
  };

  const handleBulkArchive = async () => {
    for (const id of selectedIds) {
      await archiveApplication(id);
    }
    addToast({
      title: 'Bulk Archive',
      description: `Archived ${selectedIds.length} applications`,
      type: 'info',
    });
    setSelectedIds([]);
    await loadApps();
  };

  const handleBulkRestore = async () => {
    for (const id of selectedIds) {
      await restoreApplication(id);
    }
    addToast({
      title: 'Bulk Restore',
      description: `Restored ${selectedIds.length} applications`,
      type: 'success',
    });
    setSelectedIds([]);
    await loadApps();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Recovery Codes Banner */}
      {recoveryCodes && (
        <section aria-label="Recovery codes">
          <Card style={{ borderColor: 'var(--color-warning)' }}>
            <CardBody>
              <div style={{ fontWeight: 600, color: 'var(--color-warning)', marginBottom: '6px' }}>
                Recovery codes: shown once. Save them now.
              </div>
              <ol
                data-testid="recovery-codes"
                style={{
                  margin: '8px 0',
                  paddingLeft: '24px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '6px',
                }}
              >
                {recoveryCodes.map((code) => (
                  <li key={code}>
                    <code style={{ fontSize: '13px', background: 'var(--color-surface-2)', padding: '2px 6px', borderRadius: '4px' }}>
                      {code}
                    </code>
                  </li>
                ))}
              </ol>
              {onDismissCodes && (
                <Button variant="primary" size="sm" onClick={onDismissCodes} style={{ marginTop: '8px' }}>
                  I saved them
                </Button>
              )}
            </CardBody>
          </Card>
        </section>
      )}

      {/* Session Strip for Identity & Token Rotation */}
      <section aria-label="Session">
        <Card>
          <CardBody style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <b>{user?.username}</b>
              <span className="muted">·</span>
              <span className="muted small">
                Session expires {session?.expires_at ? new Date(session.expires_at * 1000).toLocaleTimeString() : '?'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button variant="secondary" size="sm" leftIcon={<RefreshCw size={13} />} onClick={() => void onRefresh()}>
                Refresh now
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void onLogout('local')}>
                Sign out
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void onLogout('global')}>
                Sign out everywhere
              </Button>
            </div>
          </CardBody>
        </Card>
      </section>

      {/* Aging Advisory Banner */}
      <AgingBanner
        staleCount={staleCount}
        longWaitingCount={longWaitingCount}
        onFilterAging={(band) => {
          if (band === 'long_waiting' || band === 'stale') {
            setOutcomeFilter('OPEN');
            setArchiveState('active');
          }
        }}
      />

      {/* Main Applications Section */}
      <section
        aria-label="Applications"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Direct PostgREST Quick Insert Form (for E2E Test Compatibility) */}
        {onCreateApp && (
          <Card style={{ padding: '8px 12px', background: 'var(--color-surface-2)' }}>
            <form onSubmit={onCreateApp} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Quick Insert:</span>
              <Input name="company" placeholder="Company" required aria-label="Company" style={{ minWidth: '150px', height: '32px', fontSize: '13px' }} />
              <Input name="role" placeholder="Role" required aria-label="Role" style={{ minWidth: '150px', height: '32px', fontSize: '13px' }} />
              <Select name="stage" aria-label="Stage" defaultValue="APPLIED" style={{ minWidth: '120px', height: '32px', fontSize: '13px' }}>
                <option value="SAVED">Saved</option>
                <option value="PREPARING">Preparing</option>
                <option value="APPLIED">Applied</option>
                <option value="INTERVIEW">Interview</option>
              </Select>
              <Button variant="primary" size="sm" leftIcon={<Plus size={13} />}>
                Insert (direct PostgREST)
              </Button>
            </form>
            {legacyApps.length > 0 && onStageChange && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                {legacyApps.map((a) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', padding: '4px 8px', borderRadius: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>{a.company_name} · {a.role_title}</span>
                    <StatusBadge stage={a.stage} />
                    <Button size="sm" variant="secondary" onClick={() => void onStageChange(a.id, 'INTERVIEW')}>
                      → Interview
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Search, Filter & Stage Tabs Toolbar */}
        <ApplicationsToolbar
          workflow={workflow}
          stageCounts={stageCounts}
          totalCount={totalCount}
          activeStage={activeStage}
          onSelectStage={setActiveStage}
          outcomeFilter={outcomeFilter}
          onSelectOutcome={setOutcomeFilter}
          priorityFilter={priorityFilter}
          onSelectPriority={setPriorityFilter}
          archiveState={archiveState}
          onToggleArchive={setArchiveState}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isManager={isManager}
          members={members}
          selectedOwner={selectedOwner}
          onSelectOwner={setSelectedOwner}
          onOpenCreateModal={() => setIsCreateOpen(true)}
        />

        {/* Data Grid + Persistent Preview Rail Layout */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          {/* Main Applications Table Grid */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <ApplicationsTable
              applications={applications}
              loading={loading}
              selectedIds={selectedIds}
              activeId={activeId}
              sort={sort}
              isManager={isManager}
              members={members}
              onSelectRow={(id, selected) => {
                setSelectedIds((prev) => (selected ? [...prev, id] : prev.filter((i) => i !== id)));
              }}
              onSelectAll={(selected) => {
                setSelectedIds(selected ? applications.map((a) => a.id) : []);
              }}
              onActiveRowChange={(id) => setActiveId(id)}
              onSortChange={(field) => {
                setSort((prev: ApplicationSort) => ({
                  field,
                  direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
                }));
              }}
              onRowClick={(app) => {
                if (isMobile || !isWide || !isPreviewOpen) {
                  setDrawerApp(app);
                  setIsDrawerOpen(true);
                } else {
                  setActiveId(app.id);
                }
              }}
              onOpenStageMove={(app) => {
                setStageMoveTarget(app);
                setIsStageMoveOpen(true);
              }}
              onOpenOutcome={(app) => {
                setOutcomeTarget(app);
                setIsOutcomeOpen(true);
              }}
              onKeepActive={handleKeepActive}
              onArchive={handleArchive}
              onRestore={handleRestore}
              onTogglePreview={handleTogglePreview}
              onOpenCreate={() => setIsCreateOpen(true)}
              onClearFilters={() => {
                setActiveStage('ALL');
                setOutcomeFilter('ALL');
                setPriorityFilter('ALL');
                setArchiveState('active');
                setSearchQuery('');
                setSelectedOwner('ALL');
              }}
            />
          </div>

          {/* Persistent Wide-Desktop (>=1680px) Preview Rail */}
          {isWide && (
            <ApplicationPreviewRail
              application={previewApp}
              isOpen={isPreviewOpen}
              onClose={() => setIsPreviewOpen(false)}
              onOpenFullDetail={(app) => {
                setDrawerApp(app);
                setIsDrawerOpen(true);
              }}
              onOpenStageMove={(app) => {
                setStageMoveTarget(app);
                setIsStageMoveOpen(true);
              }}
              onOpenOutcome={(app) => {
                setOutcomeTarget(app);
                setIsOutcomeOpen(true);
              }}
              onKeepActive={handleKeepActive}
            />
          )}
        </div>
      </section>

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.length}
        isArchivedView={archiveState === 'archived'}
        onMoveStage={() => {
          setStageMoveTarget(null);
          setIsStageMoveOpen(true);
        }}
        onMarkGhosted={handleBulkGhosted}
        onArchive={handleBulkArchive}
        onRestore={handleBulkRestore}
        onClearSelection={() => setSelectedIds([])}
      />

      {/* Create Application Modal with 3-tier Duplicate Detection */}
      <CreateApplicationModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        workspaceId={wsId}
        userId={user?.id || ''}
        workflow={workflow}
        onCreated={handleCreated}
        onViewExisting={(appId) => {
          setIsCreateOpen(false);
          setActiveId(appId);
          const found = applications.find((a) => a.id === appId);
          if (found) {
            setDrawerApp(found);
            setIsDrawerOpen(true);
          }
        }}
      />

      {/* Edit Application Modal */}
      <EditApplicationModal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setEditingApp(null);
        }}
        application={editingApp}
        onSave={handleUpdate}
      />

      {/* Stage Move Dialog */}
      <StageMoveDialog
        isOpen={isStageMoveOpen}
        onClose={() => {
          setIsStageMoveOpen(false);
          setStageMoveTarget(null);
        }}
        workflow={workflow}
        currentStage={stageMoveTarget?.stage}
        targetAppCount={stageMoveTarget ? 1 : selectedIds.length}
        onConfirmMove={handleConfirmMoveStage}
      />

      {/* Record Outcome Dialog */}
      <OutcomeDialog
        isOpen={isOutcomeOpen}
        onClose={() => {
          setIsOutcomeOpen(false);
          setOutcomeTarget(null);
        }}
        applicationTitle={outcomeTarget ? `${outcomeTarget.role_title} at ${outcomeTarget.company_name}` : undefined}
        onConfirmOutcome={handleConfirmOutcome}
      />

      {/* Slide-in Detail Drawer */}
      <ApplicationDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setDrawerApp(null);
        }}
        application={drawerApp}
        workflow={workflow}
        onOpenStageMove={(app) => {
          setStageMoveTarget(app);
          setIsStageMoveOpen(true);
        }}
        onOpenOutcome={(app) => {
          setOutcomeTarget(app);
          setIsOutcomeOpen(true);
        }}
        onKeepActive={handleKeepActive}
        onArchive={handleArchive}
        onRestore={handleRestore}
        onEdit={(app) => {
          setEditingApp(app);
          setIsEditOpen(true);
        }}
      />

      {/* Canonical Workflow Section */}
      {onLoadWorkflow && (
        <section aria-label="Workflow">
          <Card>
            <CardHeader action={<Button size="sm" variant="secondary" onClick={() => void onLoadWorkflow()}>Load (PostgREST + Node)</Button>}>
              <CardTitle>Canonical Workflow (Data API + Node)</CardTitle>
            </CardHeader>
            <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div>
                <b>PostgREST:</b> {wfDirect?.stages ? wfDirect.stages.map((s) => s.label).join(' → ') : 'Click load to query'}
                {wfDirect?.outcomes && <span> | outcomes: {wfDirect.outcomes.map((o) => o.label).join(', ')}</span>}
              </div>
              <div>
                <b>Node API:</b> {wfNode?.stages ? wfNode.stages.map((s) => s.label).join(' → ') : 'Pending'}
              </div>
            </CardBody>
          </Card>
        </section>
      )}

      {/* Account Security Section */}
      {onPasswordChange && onRegenerateCodes && (
        <section aria-label="Account security">
          <Card>
            <CardHeader>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={16} className="primary-t" />
                <CardTitle>Account Security</CardTitle>
              </div>
            </CardHeader>
            <CardBody style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              <form onSubmit={onPasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <b>Change Password</b>
                <Input
                  name="current"
                  type="password"
                  placeholder="Current password"
                  required
                  aria-label="Current password"
                  autoComplete="current-password"
                />
                <Input
                  name="next"
                  type="password"
                  placeholder="New password"
                  required
                  aria-label="New password"
                  autoComplete="new-password"
                />
                <Button variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }}>
                  Change
                </Button>
              </form>

              <form onSubmit={onRegenerateCodes} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <b>Regenerate Recovery Codes</b>
                <Input
                  name="password"
                  type="password"
                  placeholder="Password to confirm"
                  required
                  aria-label="Password to regenerate codes"
                />
                <Button variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }}>
                  Regenerate
                </Button>
              </form>
            </CardBody>
          </Card>
        </section>
      )}

      {/* Leak Self-Check Section */}
      {onLeakCheck && (
        <section aria-label="Leak self-check">
          <Card>
            <CardHeader action={<Button size="sm" variant="secondary" leftIcon={<ShieldCheck size={14} />} onClick={() => void onLeakCheck()}>Scan for exposed identity or credentials</Button>}>
              <CardTitle>B03 Exposure Self-Check</CardTitle>
            </CardHeader>
            <CardBody>
              {leakResults && (
                <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {Object.entries(leakResults).map(([key, isFound]) => (
                    <li key={key} data-leak={key} data-found={String(isFound)} style={{ fontSize: '13px' }}>
                      <b>{key}:</b>{' '}
                      <span style={{ color: isFound ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 600 }}>
                        {isFound ? 'FOUND (exposure)' : 'clean'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {probeStatus && (
                <div data-testid="auth-user-probe-status" style={{ marginTop: '10px', fontSize: '13px' }}>
                  Supabase /auth/v1/user with my token → HTTP {probeStatus}
                </div>
              )}
            </CardBody>
          </Card>
        </section>
      )}

      {/* Activity Log */}
      {log.length > 0 && (
        <section aria-label="Log">
          <Card>
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
            </CardHeader>
            <CardBody>
              <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }} className="mono muted">
                {log.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </section>
      )}
    </div>
  );
}
