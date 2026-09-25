import type { CSSProperties, ReactNode } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/Table';
import { StatusBadge } from '../ui/StatusBadge';
import { StagePips, PriorityBars } from '../ui/StagePips';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import {
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Clock,
  Calendar,
  Archive,
  Undo2,
  FolderOpen,
  CheckCircle,
} from 'lucide-react';
import { calculateDaysInactive, computeAgingBand } from '../../types/applications';
import type { Application, ApplicationSort, CanonicalWorkflow } from '../../types/applications';
import type { WorkspaceMemberInfo } from '../../api/applications';

export interface ApplicationsTableProps {
  applications: Application[];
  loading: boolean;
  selectedIds: string[];
  activeId: string | null;
  sort: ApplicationSort;
  isManager: boolean;
  isMobile: boolean;
  members: WorkspaceMemberInfo[];
  workflow: CanonicalWorkflow | null;
  onSelectRow: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onActiveRowChange: (id: string) => void;
  onSortChange: (field: ApplicationSort['field']) => void;
  onRowClick: (app: Application) => void;
  onOpenStageMove: (app: Application) => void;
  onOpenOutcome: (app: Application) => void;
  onKeepActive: (appId: string) => Promise<void>;
  onArchive: (appId: string) => Promise<void>;
  onRestore: (appId: string) => Promise<void>;
  onOpenCreate: () => void;
  onClearFilters: () => void;
}

const miniBtn: CSSProperties = {
  background: 'none',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '3px 8px',
  minHeight: '28px',
  fontSize: '11px',
  cursor: 'pointer',
  color: 'var(--color-text-primary)',
};

const iconBtn: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--color-text-muted)',
  padding: '6px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
};

export function stageLabel(workflow: CanonicalWorkflow | null, stage: string): string {
  return workflow?.stages.find((s) => s.id === stage)?.label ?? stage;
}

export function outcomeLabel(workflow: CanonicalWorkflow | null, outcome: string | null): string {
  if (!outcome) return 'Closed';
  return workflow?.outcomes.find((o) => o.id === outcome)?.label ?? outcome;
}

function AgingChip({ app }: { app: Application }) {
  const days = calculateDaysInactive(app.last_activity_at);
  const band = app.status === 'OPEN' ? computeAgingBand(days) : null;
  const tone =
    band === 'LONG_WAITING' ? 'var(--color-danger)' : band === 'STALE' ? 'var(--color-warning)' : 'var(--color-text-muted)';
  const suffix = band === 'LONG_WAITING' ? ' · Long waiting' : band === 'STALE' ? ' · Stale' : '';
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: tone, fontWeight: suffix ? 600 : 400 }}
      title={`Last activity: ${new Date(app.last_activity_at).toLocaleDateString()}`}
      data-aging-band={band ?? 'CLOSED'}
    >
      <Clock size={12} aria-hidden="true" />
      {days === 0 ? 'Today' : `${days}d ago`}
      {suffix}
    </span>
  );
}

function RowActions(props: {
  app: Application;
  onOpenStageMove: (app: Application) => void;
  onOpenOutcome: (app: Application) => void;
  onKeepActive: (appId: string) => Promise<void>;
  onArchive: (appId: string) => Promise<void>;
  onRestore: (appId: string) => Promise<void>;
}) {
  const { app } = props;
  const band = app.status === 'OPEN' ? computeAgingBand(calculateDaysInactive(app.last_activity_at)) : null;
  const label = `${app.role_title} at ${app.company_name}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
      {!app.archived_at && (
        <button type="button" style={miniBtn} onClick={() => props.onOpenStageMove(app)} aria-label={`Move stage: ${label}`} title="Move stage (M)">
          Move
        </button>
      )}
      {app.status === 'OPEN' && !app.archived_at && (
        <button type="button" style={{ ...miniBtn, color: 'var(--color-text-secondary)' }} onClick={() => props.onOpenOutcome(app)} aria-label={`Record outcome: ${label}`} title="Record outcome">
          Outcome
        </button>
      )}
      {(band === 'STALE' || band === 'LONG_WAITING') && !app.archived_at && (
        <button
          type="button"
          onClick={() => void props.onKeepActive(app.id)}
          style={{ ...miniBtn, border: '1px solid var(--color-warning)', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '2px' }}
          aria-label={`Keep active: ${label}`}
          title="Keep application active (resets aging timer)"
        >
          <CheckCircle size={11} aria-hidden="true" /> Keep
        </button>
      )}
      {!app.archived_at ? (
        <button type="button" onClick={() => void props.onArchive(app.id)} style={iconBtn} title="Archive application" aria-label={`Archive ${label}`}>
          <Archive size={14} aria-hidden="true" />
        </button>
      ) : (
        <button type="button" onClick={() => void props.onRestore(app.id)} style={iconBtn} title="Restore application" aria-label={`Restore ${label}`}>
          <Undo2 size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function StatusCell({ app, workflow }: { app: Application; workflow: CanonicalWorkflow | null }) {
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      <StatusBadge variant={app.status === 'OPEN' ? 'accent' : 'muted'}>
        {app.status === 'OPEN' ? 'Open' : outcomeLabel(workflow, app.outcome)}
      </StatusBadge>
      {app.archived_at && <StatusBadge variant="muted">Archived</StatusBadge>}
    </div>
  );
}

export function ApplicationsTable({
  applications,
  loading,
  selectedIds,
  activeId,
  sort,
  isManager,
  isMobile,
  members,
  workflow,
  onSelectRow,
  onSelectAll,
  onActiveRowChange,
  onSortChange,
  onRowClick,
  onOpenStageMove,
  onOpenOutcome,
  onKeepActive,
  onArchive,
  onRestore,
  onOpenCreate,
  onClearFilters,
}: ApplicationsTableProps) {
  const isAllSelected = applications.length > 0 && applications.every((a) => selectedIds.includes(a.id));
  const isPartiallySelected = selectedIds.length > 0 && !isAllSelected;
  const ownerName = (userId: string) => {
    const m = members.find((x) => x.user_id === userId);
    return m ? m.display_name || m.username : 'Member';
  };

  if (loading && applications.length === 0) {
    return (
      <div aria-busy="true" aria-label="Loading applications" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 0' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} height="36px" width="100%" />
        ))}
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <EmptyState
        icon={<FolderOpen size={24} />}
        title="No matching applications found"
        description="Try adjusting your filters or search query, or track a new application."
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              Clear Filters
            </Button>
            <Button variant="primary" size="sm" onClick={onOpenCreate}>
              New Application
            </Button>
          </div>
        }
      />
    );
  }

  // Mobile (<768px): card list; tapping a card opens the full-screen detail sheet.
  if (isMobile) {
    return (
      <ul aria-label="Applications list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {applications.map((app) => (
          <li
            key={app.id}
            data-testid="application-card"
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--color-surface-1)',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                onActiveRowChange(app.id);
                onRowClick(app);
              }}
              style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit', minHeight: '44px' }}
              aria-label={`Open ${app.role_title} at ${app.company_name}`}
            >
              <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)' }}>{app.company_name}</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{app.role_title}</div>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <StagePips stage={app.stage} isClosed={app.status === 'CLOSED'} maxSteps={8} />
                <span style={{ fontSize: '12px' }}>{stageLabel(workflow, app.stage)}</span>
              </div>
              <StatusCell app={app} workflow={workflow} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <AgingChip app={app} />
              <PriorityBars priority={app.priority} />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  const sortHead = (field: ApplicationSort['field'], label: string, style: CSSProperties = {}): ReactNode => {
    const active = sort.field === field;
    return (
      <TableHead style={style} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          onClick={() => onSortChange(field)}
          style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
        >
          {label}
          {!active ? (
            <ArrowUpDown size={12} style={{ opacity: 0.4, marginLeft: '4px' }} aria-hidden="true" />
          ) : sort.direction === 'asc' ? (
            <ArrowUp size={12} style={{ color: 'var(--color-brand-primary)', marginLeft: '4px' }} aria-hidden="true" />
          ) : (
            <ArrowDown size={12} style={{ color: 'var(--color-brand-primary)', marginLeft: '4px' }} aria-hidden="true" />
          )}
        </button>
      </TableHead>
    );
  };

  return (
    <div data-app-grid="true" style={{ background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)' }}>
      <Table aria-label="Applications" aria-rowcount={applications.length}>
        <TableHeader>
          <TableRow>
            <TableHead style={{ width: '40px', textAlign: 'center' }}>
              <input
                type="checkbox"
                className="checkbox"
                checked={isAllSelected}
                ref={(input) => {
                  if (input) input.indeterminate = isPartiallySelected;
                }}
                onChange={(e) => onSelectAll(e.target.checked)}
                aria-label="Select all applications on this page"
              />
            </TableHead>
            {sortHead('company_name', 'Company · Role')}
            {sortHead('stage', 'Stage', { width: '150px' })}
            <TableHead style={{ width: '110px' }}>Status</TableHead>
            {sortHead('priority', 'Priority', { width: '80px' })}
            {sortHead('last_activity_at', 'Aging', { width: '120px' })}
            <TableHead style={{ width: '150px' }}>Next Action</TableHead>
            <TableHead style={{ width: '110px' }}>{isManager ? 'Owner' : 'Location'}</TableHead>
            <TableHead style={{ width: '136px', textAlign: 'right' }}>Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {applications.map((app) => {
            const isSelected = selectedIds.includes(app.id);
            const isActive = activeId === app.id;
            return (
              <TableRow
                key={app.id}
                data-testid="application-row"
                data-app-id={app.id}
                className={isActive ? 'table-row-active' : ''}
                style={{
                  background: isSelected ? 'var(--color-surface-selected)' : isActive ? 'var(--color-surface-2)' : undefined,
                  boxShadow: isActive ? 'inset 3px 0 0 var(--color-brand-primary)' : undefined,
                  cursor: 'pointer',
                  height: '44px',
                }}
                onClick={() => {
                  onActiveRowChange(app.id);
                  onRowClick(app);
                }}
              >
                <TableCell style={{ width: '40px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelectRow(app.id, e.target.checked)}
                    aria-label={`Select ${app.role_title} at ${app.company_name}`}
                  />
                </TableCell>

                <TableCell style={{ minWidth: '200px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', lineHeight: 1.3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{app.company_name}</span>
                      {app.job_url && (
                        <a
                          href={app.job_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          aria-label={`Open job posting for ${app.role_title} at ${app.company_name}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: 'var(--color-text-muted)', display: 'inline-flex' }}
                        >
                          <ExternalLink size={12} aria-hidden="true" />
                        </a>
                      )}
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{app.role_title}</span>
                  </div>
                </TableCell>

                <TableCell>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <StagePips stage={app.stage} isClosed={app.status === 'CLOSED'} maxSteps={8} />
                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{stageLabel(workflow, app.stage)}</span>
                  </div>
                </TableCell>

                <TableCell>
                  <StatusCell app={app} workflow={workflow} />
                </TableCell>

                <TableCell>
                  <PriorityBars priority={app.priority} />
                </TableCell>

                <TableCell>
                  <AgingChip app={app} />
                </TableCell>

                <TableCell>
                  {app.next_action ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px', display: 'block' }} title={app.next_action}>
                        {app.next_action}
                      </span>
                      {app.next_action_date && (
                        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Calendar size={10} aria-hidden="true" /> {app.next_action_date}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>–</span>
                  )}
                </TableCell>

                <TableCell>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px', display: 'block' }}>
                    {isManager ? ownerName(app.user_id) : app.location || app.work_arrangement || '–'}
                  </span>
                </TableCell>

                <TableCell style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                  <RowActions
                    app={app}
                    onOpenStageMove={onOpenStageMove}
                    onOpenOutcome={onOpenOutcome}
                    onKeepActive={onKeepActive}
                    onArchive={onArchive}
                    onRestore={onRestore}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
