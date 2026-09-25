import { useEffect, useRef } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/Table';
import { StatusBadge } from '../ui/StatusBadge';
import { StagePips } from '../ui/StagePips';
import { PriorityBars } from '../ui/StagePips';
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
import type { Application, ApplicationSort } from '../../types/applications';
import type { WorkspaceMemberInfo } from '../../api/applications';

export interface ApplicationsTableProps {
  applications: Application[];
  loading: boolean;
  selectedIds: string[];
  activeId: string | null;
  sort: ApplicationSort;
  isManager: boolean;
  members: WorkspaceMemberInfo[];
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
  onTogglePreview: () => void;
  onOpenCreate: () => void;
  onClearFilters: () => void;
}

export function ApplicationsTable({
  applications,
  loading,
  selectedIds,
  activeId,
  sort,
  isManager,
  members,
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
  onTogglePreview,
  onOpenCreate,
  onClearFilters,
}: ApplicationsTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);

  const isAllSelected = applications.length > 0 && selectedIds.length === applications.length;
  const isPartiallySelected = selectedIds.length > 0 && selectedIds.length < applications.length;

  // Active keyboard navigation index
  const activeIndex = applications.findIndex((a) => a.id === activeId);

  // Keyboard navigation handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        activeEl?.tagName === 'SELECT' ||
        activeEl?.getAttribute('contenteditable') === 'true';

      if (isInput) return;

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        const nextIdx = Math.min(applications.length - 1, activeIndex + 1);
        if (applications[nextIdx]) onActiveRowChange(applications[nextIdx].id);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        const prevIdx = Math.max(0, activeIndex - 1);
        if (applications[prevIdx]) onActiveRowChange(applications[prevIdx].id);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const current = applications[activeIndex];
        if (current) onRowClick(current);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        const current = applications[activeIndex];
        if (current) onOpenStageMove(current);
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        onTogglePreview();
      } else if (e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        const current = applications[activeIndex];
        if (current) onSelectRow(current.id, !selectedIds.includes(current.id));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [applications, activeIndex, selectedIds, onActiveRowChange, onRowClick, onOpenStageMove, onTogglePreview, onSelectRow]);

  const renderSortIcon = (field: ApplicationSort['field']) => {
    if (sort.field !== field) {
      return <ArrowUpDown size={12} style={{ opacity: 0.3, marginLeft: '4px' }} />;
    }
    return sort.direction === 'asc' ? (
      <ArrowUp size={12} style={{ color: 'var(--color-brand-primary)', marginLeft: '4px' }} />
    ) : (
      <ArrowDown size={12} style={{ color: 'var(--color-brand-primary)', marginLeft: '4px' }} />
    );
  };

  if (loading && applications.length === 0) {
    return (
      <div style={{ padding: '24px 0' }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead style={{ width: '40px' }} />
              <TableHead>Company · Role</TableHead>
              <TableHead style={{ width: '130px' }}>Stage</TableHead>
              <TableHead style={{ width: '110px' }}>Status</TableHead>
              <TableHead style={{ width: '90px' }}>Priority</TableHead>
              <TableHead style={{ width: '130px' }}>Last Activity</TableHead>
              <TableHead style={{ width: '160px' }}>Next Action</TableHead>
              <TableHead style={{ width: '110px' }}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i}>
                <TableCell><Skeleton height="16px" width="16px" /></TableCell>
                <TableCell><Skeleton height="16px" width="70%" /></TableCell>
                <TableCell><Skeleton height="16px" width="80px" /></TableCell>
                <TableCell><Skeleton height="16px" width="60px" /></TableCell>
                <TableCell><Skeleton height="16px" width="40px" /></TableCell>
                <TableCell><Skeleton height="16px" width="90px" /></TableCell>
                <TableCell><Skeleton height="16px" width="110px" /></TableCell>
                <TableCell><Skeleton height="16px" width="60px" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <EmptyState
        icon={<FolderOpen size={24} />}
        title="No applications found"
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

  return (
    <div
      ref={tableRef}
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--color-surface-1)',
        overflowX: 'auto',
      }}
    >
      <Table>
        <TableHeader>
          <TableRow>
            {/* Multi-selection Checkbox */}
            <TableHead style={{ width: '40px', textAlign: 'center' }}>
              <input
                type="checkbox"
                className="checkbox"
                checked={isAllSelected}
                ref={(input) => {
                  if (input) input.indeterminate = isPartiallySelected;
                }}
                onChange={(e) => onSelectAll(e.target.checked)}
                aria-label="Select all applications"
              />
            </TableHead>

            {/* Company & Role */}
            <TableHead
              onClick={() => onSortChange('company_name')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                Company · Role {renderSortIcon('company_name')}
              </div>
            </TableHead>

            {/* Stage */}
            <TableHead
              onClick={() => onSortChange('stage')}
              style={{ width: '150px', cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                Stage {renderSortIcon('stage')}
              </div>
            </TableHead>

            {/* Status & Outcome */}
            <TableHead style={{ width: '120px' }}>
              Status
            </TableHead>

            {/* Priority */}
            <TableHead
              onClick={() => onSortChange('priority')}
              style={{ width: '90px', cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                Priority {renderSortIcon('priority')}
              </div>
            </TableHead>

            {/* Aging & Last Activity */}
            <TableHead
              onClick={() => onSortChange('last_activity_at')}
              style={{ width: '140px', cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                Aging {renderSortIcon('last_activity_at')}
              </div>
            </TableHead>

            {/* Next Action */}
            <TableHead style={{ width: '180px' }}>
              Next Action
            </TableHead>

            {/* Owner (Manager) or Location */}
            <TableHead style={{ width: '130px' }}>
              {isManager ? 'Owner' : 'Location'}
            </TableHead>

            {/* Quick Actions */}
            <TableHead style={{ width: '110px', textAlign: 'right' }}>
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {applications.map((app) => {
            const isSelected = selectedIds.includes(app.id);
            const isActive = activeId === app.id;
            const daysInactive = calculateDaysInactive(app.last_activity_at);
            const agingBand = computeAgingBand(daysInactive);

            const ownerMember = isManager ? members.find((m) => m.user_id === app.user_id) : null;

            return (
              <TableRow
                key={app.id}
                className={isActive ? 'table-row-active' : ''}
                style={{
                  background: isSelected
                    ? 'var(--color-surface-selected)'
                    : isActive
                    ? 'var(--color-surface-2)'
                    : undefined,
                  cursor: 'pointer',
                  height: '44px',
                }}
                onClick={() => {
                  onActiveRowChange(app.id);
                  onRowClick(app);
                }}
              >
                {/* Checkbox */}
                <TableCell
                  style={{ width: '40px', textAlign: 'center' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRow(app.id, !isSelected);
                  }}
                >
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelectRow(app.id, e.target.checked)}
                    aria-label={`Select ${app.role_title} at ${app.company_name}`}
                  />
                </TableCell>

                {/* Company & Role */}
                <TableCell>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {app.company_name}
                      </span>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>·</span>
                      <span style={{ color: 'var(--color-text-primary)' }}>
                        {app.role_title}
                      </span>
                      {app.job_url && (
                        <a
                          href={app.job_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          title="Open job URL"
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: 'var(--color-text-muted)', display: 'inline-flex' }}
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                    {app.tags && app.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {app.tags.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: '10px',
                              color: 'var(--color-text-muted)',
                              background: 'var(--color-surface-2)',
                              padding: '0 4px',
                              borderRadius: '3px',
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </TableCell>

                {/* Stage */}
                <TableCell>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <StagePips stage={app.stage} isClosed={app.status === 'CLOSED'} maxSteps={8} />
                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                      {app.stage}
                    </span>
                  </div>
                </TableCell>

                {/* Status / Outcome */}
                <TableCell>
                  <StatusBadge variant={app.status === 'OPEN' ? 'accent' : 'muted'}>
                    {app.status === 'OPEN' ? 'OPEN' : app.outcome || 'CLOSED'}
                  </StatusBadge>
                </TableCell>

                {/* Priority */}
                <TableCell>
                  <PriorityBars priority={app.priority} />
                </TableCell>

                {/* Aging & Last Activity */}
                <TableCell>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      color:
                        agingBand === 'LONG_WAITING'
                          ? 'var(--color-danger)'
                          : agingBand === 'STALE'
                          ? 'var(--color-warning)'
                          : 'var(--color-text-muted)',
                      fontWeight: agingBand === 'LONG_WAITING' || agingBand === 'STALE' ? 600 : 400,
                    }}
                    title={`Last active: ${new Date(app.last_activity_at).toLocaleDateString()}`}
                  >
                    <Clock size={12} />
                    {daysInactive === 0 ? 'Today' : `${daysInactive}d ago`}
                  </div>
                </TableCell>

                {/* Next Action */}
                <TableCell>
                  {app.next_action ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                        {app.next_action}
                      </span>
                      {app.next_action_date && (
                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Calendar size={10} /> {app.next_action_date}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>–</span>
                  )}
                </TableCell>

                {/* Owner or Location */}
                <TableCell>
                  {isManager ? (
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      {ownerMember?.display_name || ownerMember?.username || 'Owner'}
                    </span>
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      {app.location || (app.work_arrangement ? `${app.work_arrangement}` : '–')}
                    </span>
                  )}
                </TableCell>

                {/* Quick Row Actions */}
                <TableCell style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                    {app.status === 'OPEN' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onOpenStageMove(app)}
                          style={{
                            background: 'none',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '3px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            color: 'var(--color-text-primary)',
                          }}
                          title="Move stage"
                        >
                          Move
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenOutcome(app)}
                          style={{
                            background: 'none',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '3px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            color: 'var(--color-text-secondary)',
                          }}
                          title="Set outcome"
                        >
                          Outcome
                        </button>
                        {(agingBand === 'STALE' || agingBand === 'LONG_WAITING') && (
                          <button
                            type="button"
                            onClick={() => onKeepActive(app.id)}
                            style={{
                              background: 'none',
                              border: '1px solid var(--color-warning)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '3px 6px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              color: 'var(--color-warning)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px',
                            }}
                            title="Keep application active (resets aging timer)"
                          >
                            <CheckCircle size={11} /> Keep
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenStageMove(app)}
                        style={{
                          background: 'none',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '3px 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        Reopen
                      </button>
                    )}

                    {!app.archived_at ? (
                      <button
                        type="button"
                        onClick={() => onArchive(app.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-text-muted)',
                          padding: '4px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="Archive application"
                      >
                        <Archive size={14} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRestore(app.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-text-muted)',
                          padding: '4px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="Restore application"
                      >
                        <Undo2 size={14} />
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
