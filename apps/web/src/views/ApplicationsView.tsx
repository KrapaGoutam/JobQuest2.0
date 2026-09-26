import { useState, useEffect, useCallback, useMemo, useRef, type FormEvent } from 'react';
import { Card, CardHeader, CardTitle, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../context/ToastContext';
import { ShieldCheck, RefreshCw, Plus, KeyRound, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { PublicSession, PublicUser } from '../api';
import type {
  AgingFilter,
  Application,
  ApplicationStage,
  ApplicationSort,
  ApplicationOutcome,
  ClosureReason,
  CanonicalWorkflow,
} from '../types/applications';
import {
  PAGE_SIZE,
  fetchApplications,
  fetchApplicationDetail,
  fetchAgingCounts,
  fetchStageCounts,
  createApplication,
  updateApplication,
  moveApplicationStage,
  setApplicationOutcome,
  keepApplicationActive,
  archiveApplication,
  restoreApplication,
  fetchCanonicalWorkflow,
  fetchWorkspaceMembers,
  type ApplicationFilters,
  type EditableApplicationFields,
  type WorkspaceMemberInfo,
  type CreateApplicationPayload,
} from '../api/applications';
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
import { Dialog } from '../components/ui/Dialog';
import { downloadExport } from '../api/importExport';
import { consumeNewApplicationRequest, onNewApplicationRequest } from '../lib/newApplicationIntent';

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
  userRole?: 'USER' | 'MANAGER';
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

const PREVIEW_PREF_KEY = 'jobquest_preview_rail_open';

function readPreviewPref(): boolean {
  try {
    return localStorage.getItem(PREVIEW_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

function writePreviewPref(open: boolean): void {
  try {
    localStorage.setItem(PREVIEW_PREF_KEY, String(open));
  } catch {
    // storage unavailable (private mode): the preference simply is not remembered
  }
}

function errorMessage(err: unknown, fallback: string): string {
  const msg = (err as { message?: string })?.message;
  return msg && msg.length < 200 ? msg : fallback;
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
  userRole = 'USER',
  onRefresh,
  onLogout,
  onCreateApp,
  onStageChange,
  onLoadWorkflow,
  onPasswordChange,
  onRegenerateCodes,
  onLeakCheck,
  onDismissCodes,
}: ApplicationsViewProps) {
  const { addToast } = useToast();

  const wsId = activeWorkspaceId || user?.active_workspace_id || '';
  // UX only: MANAGER sees owner columns/filters. Authorization is enforced by RLS.
  const isManager = userRole === 'MANAGER';

  // ---------------------------------------------------------------------------
  // Data state
  // ---------------------------------------------------------------------------
  const [applications, setApplications] = useState<Application[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'CSV' | 'XLSX'>('CSV');
  const [exportBusy, setExportBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [agingCounts, setAgingCounts] = useState({ stale: 0, longWaiting: 0 });
  const [workflow, setWorkflow] = useState<CanonicalWorkflow | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberInfo[]>([]);
  /** Bumped after every mutation so the drawer/rail refetch their event history. */
  const [historyVersion, setHistoryVersion] = useState(0);

  // Filters, search & sort
  const [activeStage, setActiveStage] = useState('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [agingFilter, setAgingFilter] = useState<AgingFilter>('ALL');
  const [archiveState, setArchiveState] = useState<'active' | 'archived' | 'all'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOwner, setSelectedOwner] = useState('ALL');
  const [sort, setSort] = useState<ApplicationSort>({ field: 'last_activity_at', direction: 'desc' });

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Dialogs & panels
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [drawerAppId, setDrawerAppId] = useState<string | null>(null);
  const [drawerFallback, setDrawerFallback] = useState<Application | null>(null);
  const [stageMoveTarget, setStageMoveTarget] = useState<Application | null>(null);
  const [isStageMoveOpen, setIsStageMoveOpen] = useState(false);
  const [outcomeTarget, setOutcomeTarget] = useState<Application | null>(null);

  // Responsive layout & wide-desktop preview rail (Gate 02B D4 / ADR-029)
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(readPreviewPref);
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1440);
  const isWide = windowWidth >= 1680;
  const isMobile = windowWidth < 768;

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const setPreview = useCallback((open: boolean) => {
    setIsPreviewOpen(open);
    writePreviewPref(open);
  }, []);
  const togglePreview = useCallback(() => setPreview(!isPreviewOpen), [isPreviewOpen, setPreview]);

  // Shell "New Application" intent (global `q` / sidebar button from any route)
  useEffect(() => {
    if (consumeNewApplicationRequest()) setIsCreateOpen(true);
    return onNewApplicationRequest(() => setIsCreateOpen(true));
  }, []);

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------
  const filters: ApplicationFilters = useMemo(
    () => ({
      stage: activeStage,
      status: outcomeFilter === 'OPEN' || outcomeFilter === 'CLOSED' ? outcomeFilter : undefined,
      outcome: outcomeFilter !== 'ALL' && outcomeFilter !== 'OPEN' && outcomeFilter !== 'CLOSED' ? outcomeFilter : undefined,
      priority: priorityFilter,
      aging: agingFilter,
      archiveState,
      search: searchQuery,
      ownerId: selectedOwner,
    }),
    [activeStage, outcomeFilter, priorityFilter, agingFilter, archiveState, searchQuery, selectedOwner]
  );

  // Any filter or sort change returns to the first page and clears the selection.
  useEffect(() => {
    setPage(0);
    setSelectedIds([]);
  }, [filters, sort, wsId]);

  useEffect(() => {
    if (!wsId) return;
    fetchCanonicalWorkflow(wsId)
      .then(setWorkflow)
      .catch(() => setWorkflow(null));
    fetchWorkspaceMembers(wsId)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [wsId]);

  const requestSeq = useRef(0);
  const loadApps = useCallback(async () => {
    if (!wsId) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const stageIds = (workflow?.stages ?? []).map((s) => s.id);
      const [res, counts, aging] = await Promise.all([
        fetchApplications(wsId, filters, sort, page, PAGE_SIZE),
        stageIds.length ? fetchStageCounts(wsId, stageIds, { ...filters, stage: 'ALL' }) : Promise.resolve({}),
        fetchAgingCounts(wsId),
      ]);
      if (seq !== requestSeq.current) return; // a newer request superseded this one
      setApplications(res.applications);
      setTotalCount(res.totalCount);
      setStageCounts(counts);
      setAgingCounts(aging);
      setLoadError(null);
      setActiveId((prev) => (prev && res.applications.some((a) => a.id === prev) ? prev : res.applications[0]?.id ?? null));
    } catch (err: unknown) {
      if (seq !== requestSeq.current) return;
      setLoadError(errorMessage(err, 'Error communicating with the database'));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [wsId, filters, sort, page, workflow]);

  useEffect(() => {
    void loadApps();
  }, [loadApps, legacyApps]);

  /** Refresh list, counts and history after any mutation. */
  const afterMutation = useCallback(async () => {
    setHistoryVersion((v) => v + 1);
    await loadApps();
  }, [loadApps]);

  // Drawer shows the live record: from the loaded page when present, else fetched.
  const drawerApp = useMemo(
    () => (drawerAppId ? applications.find((a) => a.id === drawerAppId) ?? drawerFallback : null),
    [drawerAppId, applications, drawerFallback]
  );
  useEffect(() => {
    if (!drawerAppId || applications.some((a) => a.id === drawerAppId)) return;
    fetchApplicationDetail(drawerAppId)
      .then(setDrawerFallback)
      .catch(() => setDrawerFallback(null));
  }, [drawerAppId, applications, historyVersion]);

  const openDetail = useCallback((app: Application) => {
    setDrawerFallback(app);
    setDrawerAppId(app.id);
  }, []);

  const previewApp = useMemo(
    () => applications.find((a) => a.id === activeId) ?? applications[0] ?? null,
    [activeId, applications]
  );
  const railVisible = isWide && isPreviewOpen && !isMobile;

  const handleRowClick = useCallback(
    (app: Application) => {
      setActiveId(app.id);
      // With the rail open on wide desktops, a row click previews in place;
      // otherwise it opens the drawer (desktop) or full-screen sheet (mobile).
      if (!railVisible) openDetail(app);
    },
    [railVisible, openDetail]
  );

  // ---------------------------------------------------------------------------
  // Keyboard: one context-safe handler (Gate 02B §4.2; never Space)
  // ---------------------------------------------------------------------------
  const keyState = useRef({ applications, activeId, selectedIds });
  keyState.current = { applications, activeId, selectedIds };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return; // a dialog/drawer owns the keyboard
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
      if (typing) return;
      const inGrid = !!el?.closest('[data-app-grid]');
      const onPage = !el || el === document.body || inGrid;
      // Enter / M / X act on the active row only when focus is not on another control.
      const interactive = !!el && el !== document.body && !!el.closest('button, a, [role="button"], [role="tab"], summary');
      const { applications: list, activeId: current, selectedIds: selected } = keyState.current;
      const idx = list.findIndex((a) => a.id === current);
      const row = list[idx];

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          if (!onPage || !list.length) return;
          e.preventDefault();
          setActiveId(list[Math.min(list.length - 1, idx + 1)]!.id);
          break;
        case 'k':
        case 'ArrowUp':
          if (!onPage || !list.length) return;
          e.preventDefault();
          setActiveId(list[Math.max(0, idx - 1)]!.id);
          break;
        case 'Enter':
          if (interactive || !row) return;
          e.preventDefault();
          openDetail(row);
          break;
        case 'm':
        case 'M':
          if (interactive || !row || row.archived_at) return;
          e.preventDefault();
          setStageMoveTarget(row);
          setIsStageMoveOpen(true);
          break;
        case 'x':
        case 'X':
          if (interactive || !row) return;
          e.preventDefault();
          setSelectedIds(selected.includes(row.id) ? selected.filter((i) => i !== row.id) : [...selected, row.id]);
          break;
        case 'p':
        case 'P':
          if (!isWide) return;
          e.preventDefault();
          togglePreview();
          break;
        case 'q':
        case 'Q':
          e.preventDefault();
          setIsCreateOpen(true);
          break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isWide, togglePreview, openDetail]);

  // Keep the active row in view during keyboard navigation.
  useEffect(() => {
    if (!activeId) return;
    const node = document.querySelector(`[data-app-id="${activeId}"]`);
    if (node && 'scrollIntoView' in node) (node as HTMLElement).scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  // ---------------------------------------------------------------------------
  // Mutations (lifecycle via RPC; simple fields via Data API)
  // ---------------------------------------------------------------------------
  const stageName = (id: string) => workflow?.stages.find((s) => s.id === id)?.label ?? id;

  const handleCreated = async (payload: CreateApplicationPayload) => {
    const { application, snapshotError } = await createApplication(payload);
    addToast({
      title: 'Application created',
      description: `${application.company_name} · ${application.role_title} added in ${stageName(application.stage)}.`,
      type: 'success',
    });
    if (snapshotError) {
      addToast({ title: 'Posting snapshot not saved', description: snapshotError, type: 'warning', duration: 8000 });
    }
    setActiveId(application.id);
    await afterMutation();
  };

  const handleUpdate = async (applicationId: string, updates: Partial<EditableApplicationFields>) => {
    await updateApplication(applicationId, updates);
    addToast({ title: 'Application updated', description: 'Changes saved.', type: 'success' });
    await afterMutation();
  };

  const handleConfirmMoveStage = async (newStage: ApplicationStage, notes?: string) => {
    if (stageMoveTarget) {
      await moveApplicationStage(stageMoveTarget.id, newStage, notes);
      addToast({ title: 'Stage updated', description: `Moved to ${stageName(newStage)}.`, type: 'success' });
    } else {
      const results = await runBulk(selectedIds, (id) => moveApplicationStage(id, newStage, notes));
      reportBulk(`Moved to ${stageName(newStage)}`, results);
      setSelectedIds([]);
    }
    await afterMutation();
  };

  const handleConfirmOutcome = async (outcome: ApplicationOutcome, closureReason?: ClosureReason | null, closureNotes?: string | null) => {
    if (!outcomeTarget) return;
    await setApplicationOutcome(outcomeTarget.id, outcome, closureReason, closureNotes);
    const label = workflow?.outcomes.find((o) => o.id === outcome)?.label ?? outcome;
    addToast({ title: 'Application closed', description: `Outcome recorded: ${label}.`, type: 'success' });
    await afterMutation();
  };

  const guarded = async (action: () => Promise<unknown>, failTitle: string) => {
    try {
      await action();
      return true;
    } catch (err: unknown) {
      addToast({ title: failTitle, description: errorMessage(err, 'Please try again.'), type: 'danger', duration: 6000 });
      return false;
    }
  };

  const handleKeepActive = async (appId: string) => {
    if (await guarded(() => keepApplicationActive(appId), 'Could not refresh activity')) {
      addToast({ title: 'Marked as reviewed', description: 'Inactivity timer reset. Stage and state unchanged.', type: 'success' });
    }
    await afterMutation();
  };

  const handleRestore = async (appId: string) => {
    if (await guarded(() => restoreApplication(appId), 'Could not restore')) {
      addToast({ title: 'Application restored', description: 'Returned to the active pipeline.', type: 'success' });
    }
    await afterMutation();
  };

  const handleArchive = async (appId: string) => {
    if (await guarded(() => archiveApplication(appId), 'Could not archive')) {
      // Gate 02B §4.5 / ADR-026: soft archive with a 10-second undo.
      addToast({
        title: 'Application archived',
        description: 'Moved to the archive.',
        type: 'info',
        duration: 10000,
        action: { label: 'Undo', onClick: () => void handleRestore(appId) },
      });
    }
    await afterMutation();
  };

  // Bulk actions: sequential atomic RPCs; failures are counted and reported, never hidden.
  async function runBulk(ids: string[], op: (id: string) => Promise<unknown>) {
    let ok = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await op(id);
        ok++;
      } catch (err: unknown) {
        failed.push(errorMessage(err, 'failed'));
      }
    }
    return { ok, failed };
  }

  function reportBulk(what: string, r: { ok: number; failed: string[] }) {
    if (r.failed.length === 0) {
      addToast({ title: 'Bulk update complete', description: `${what}: ${r.ok} application${r.ok === 1 ? '' : 's'}.`, type: 'success' });
    } else {
      addToast({
        title: 'Bulk update partly failed',
        description: `${what}: ${r.ok} succeeded, ${r.failed.length} failed (${[...new Set(r.failed)].join('; ')}).`,
        type: 'warning',
        duration: 8000,
      });
    }
  }

  const selectedApps = applications.filter((a) => selectedIds.includes(a.id));

  const handleBulkGhosted = async () => {
    // Explicit user action only (never automatic); already-closed records are skipped.
    const open = selectedApps.filter((a) => a.status === 'OPEN').map((a) => a.id);
    const r = await runBulk(open, (id) => setApplicationOutcome(id, 'GHOSTED', null, 'Bulk marked as ghosted'));
    const skipped = selectedIds.length - open.length;
    reportBulk(`Marked Ghosted${skipped ? ` (${skipped} already closed, skipped)` : ''}`, r);
    setSelectedIds([]);
    await afterMutation();
  };

  const handleBulkArchive = async () => {
    const ids = selectedApps.filter((a) => !a.archived_at).map((a) => a.id);
    reportBulk('Archived', await runBulk(ids, archiveApplication));
    setSelectedIds([]);
    await afterMutation();
  };

  const handleBulkRestore = async () => {
    const ids = selectedApps.filter((a) => a.archived_at).map((a) => a.id);
    reportBulk('Restored', await runBulk(ids, restoreApplication));
    setSelectedIds([]);
    await afterMutation();
  };

  const clearFilters = () => {
    setActiveStage('ALL');
    setOutcomeFilter('ALL');
    setPriorityFilter('ALL');
    setAgingFilter('ALL');
    setArchiveState('active');
    setSearchQuery('');
    setSelectedOwner('ALL');
  };

  const pageStart = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const pageEnd = Math.min(totalCount, (page + 1) * PAGE_SIZE);
  const lastPage = Math.max(0, Math.ceil(totalCount / PAGE_SIZE) - 1);

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

      {/* Inactivity advisory (31+ days review; 15–30 stale). Advisory only: nothing changes automatically. */}
      <AgingBanner
        staleCount={agingCounts.stale}
        longWaitingCount={agingCounts.longWaiting}
        onFilterAging={(band) => {
          setArchiveState('active');
          setAgingFilter(band === 'long_waiting' ? 'LONG_WAITING' : 'STALE');
        }}
      />

      {/* Main Applications Section */}
      <section aria-label="Applications" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Direct PostgREST Quick Insert Form (M1B harness; kept for the leak test) */}
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

        <ApplicationsToolbar
          workflow={workflow}
          stageCounts={stageCounts}
          totalCount={Object.values(stageCounts).reduce((a, b) => a + b, 0) || totalCount}
          activeStage={activeStage}
          onSelectStage={setActiveStage}
          outcomeFilter={outcomeFilter}
          onSelectOutcome={setOutcomeFilter}
          priorityFilter={priorityFilter}
          onSelectPriority={setPriorityFilter}
          agingFilter={agingFilter}
          onSelectAging={setAgingFilter}
          archiveState={archiveState}
          onToggleArchive={setArchiveState}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isManager={isManager}
          members={members}
          selectedOwner={selectedOwner}
          onSelectOwner={setSelectedOwner}
          onOpenCreateModal={() => setIsCreateOpen(true)}
          isWide={isWide}
          isPreviewOpen={isPreviewOpen}
          onTogglePreview={togglePreview}
          onOpenExport={() => setIsExportOpen(true)}
        />

        {loadError && (
          <div role="alert" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-danger)', color: 'var(--color-danger)', fontSize: '13px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
            <span>Couldn't load applications: {loadError}</span>
            <Button size="sm" variant="outline" onClick={() => void loadApps()}>
              Retry
            </Button>
          </div>
        )}

        {/* Data grid + wide-desktop preview rail */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <ApplicationsTable
              applications={applications}
              loading={loading}
              selectedIds={selectedIds}
              activeId={activeId}
              sort={sort}
              isManager={isManager}
              isMobile={isMobile}
              members={members}
              workflow={workflow}
              onSelectRow={(id, selected) =>
                setSelectedIds((prev) => (selected ? [...new Set([...prev, id])] : prev.filter((i) => i !== id)))
              }
              onSelectAll={(selected) => setSelectedIds(selected ? applications.map((a) => a.id) : [])}
              onActiveRowChange={setActiveId}
              onSortChange={(field) =>
                setSort((prev) => ({ field, direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc' }))
              }
              onRowClick={handleRowClick}
              onOpenStageMove={(app) => {
                setStageMoveTarget(app);
                setIsStageMoveOpen(true);
              }}
              onOpenOutcome={setOutcomeTarget}
              onKeepActive={handleKeepActive}
              onArchive={handleArchive}
              onRestore={handleRestore}
              onOpenCreate={() => setIsCreateOpen(true)}
              onClearFilters={clearFilters}
            />

            {totalCount > 0 && (
              <nav aria-label="Applications pages" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                <span aria-live="polite" data-testid="page-status">
                  Showing {pageStart}–{pageEnd} of {totalCount}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <Button size="sm" variant="outline" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))} aria-label="Previous page">
                    <ChevronLeft size={14} aria-hidden="true" />
                  </Button>
                  <Button size="sm" variant="outline" disabled={page >= lastPage || loading} onClick={() => setPage((p) => Math.min(lastPage, p + 1))} aria-label="Next page">
                    <ChevronRight size={14} aria-hidden="true" />
                  </Button>
                </div>
              </nav>
            )}
          </div>

          {railVisible && (
            <ApplicationPreviewRail
              application={previewApp}
              workflow={workflow}
              historyVersion={historyVersion}
              onClose={() => setPreview(false)}
              onOpenFullDetail={openDetail}
              onOpenStageMove={(app) => {
                setStageMoveTarget(app);
                setIsStageMoveOpen(true);
              }}
              onOpenOutcome={setOutcomeTarget}
              onKeepActive={handleKeepActive}
            />
          )}
        </div>
      </section>

      <BulkActionBar
        selectedCount={selectedIds.length}
        isArchivedView={archiveState === 'archived'}
        onMoveStage={() => {
          setStageMoveTarget(null);
          setIsStageMoveOpen(true);
        }}
        onMarkGhosted={() => void handleBulkGhosted()}
        onArchive={() => void handleBulkArchive()}
        onRestore={() => void handleBulkRestore()}
        onClearSelection={() => setSelectedIds([])}
      />

      <Dialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="Export applications"
        description="Download applications in the current owner scope. Spreadsheet cells are formula-injection safe."
        footer={<><Button variant="secondary" onClick={() => setIsExportOpen(false)}>Cancel</Button><Button variant="primary" disabled={exportBusy || !session || !wsId} leftIcon={<Download size={14} />} onClick={() => void (async () => {
          if (!session || !wsId) return;
          setExportBusy(true);
          try {
            const owner = isManager ? selectedOwner : user?.id || '';
            const params = new URLSearchParams({ workspace_id: wsId, owner_id: owner });
            const path = exportFormat === 'XLSX' ? '/exports/applications.xlsx' : '/exports/applications';
            await downloadExport(`${path}?${params}`, session, exportFormat === 'XLSX' ? 'jobquest-applications.xlsx' : 'applications.csv');
            setIsExportOpen(false);
          } catch (err) {
            addToast({ title: 'Export failed', description: errorMessage(err, 'Could not export applications.'), type: 'danger' });
          } finally { setExportBusy(false); }
        })()}>{exportBusy ? 'Preparing…' : 'Download'}</Button></>}
      >
        <label style={{ display: 'grid', gap: '6px' }}>Format
          <Select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as 'CSV' | 'XLSX')}>
            <option value="CSV">CSV</option><option value="XLSX">Excel workbook (.xlsx)</option>
          </Select>
        </label>
        {isManager && <p className="muted small" style={{ marginBottom: 0 }}>Owner scope: {selectedOwner === 'ALL' ? 'entire workspace' : members.find((member) => member.user_id === selectedOwner)?.display_name || 'selected member'}.</p>}
      </Dialog>

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
          if (found) openDetail(found);
          else setDrawerAppId(appId);
        }}
      />

      <EditApplicationModal
        isOpen={editingApp !== null}
        onClose={() => setEditingApp(null)}
        application={editingApp}
        onSave={handleUpdate}
      />

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

      <OutcomeDialog
        isOpen={outcomeTarget !== null}
        onClose={() => setOutcomeTarget(null)}
        applicationTitle={outcomeTarget ? `${outcomeTarget.role_title} at ${outcomeTarget.company_name}` : undefined}
        onConfirmOutcome={handleConfirmOutcome}
      />

      <ApplicationDetailDrawer
        isOpen={drawerApp !== null}
        onClose={() => {
          setDrawerAppId(null);
          setDrawerFallback(null);
        }}
        application={drawerApp}
        workflow={workflow}
        historyVersion={historyVersion}
        members={members}
        currentUserId={user?.id ?? null}
        onApplicationChanged={() => void afterMutation()}
        onOpenStageMove={(app) => {
          setStageMoveTarget(app);
          setIsStageMoveOpen(true);
        }}
        onOpenOutcome={setOutcomeTarget}
        onKeepActive={handleKeepActive}
        onArchive={handleArchive}
        onRestore={handleRestore}
        onEdit={setEditingApp}
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
                <Input name="current" type="password" placeholder="Current password" required aria-label="Current password" autoComplete="current-password" />
                <Input name="next" type="password" placeholder="New password" required aria-label="New password" autoComplete="new-password" />
                <Button variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }}>
                  Change
                </Button>
              </form>

              <form onSubmit={onRegenerateCodes} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <b>Regenerate Recovery Codes</b>
                <Input name="password" type="password" placeholder="Password to confirm" required aria-label="Password to regenerate codes" />
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
