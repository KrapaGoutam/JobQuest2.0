import { useState, useEffect, useRef } from 'react';
import { Search, X, Plus, Archive, PanelRight, Download, ArrowUpDown, CalendarDays, Layers3 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import type { AgingFilter, ApplicationSort, ApplicationStage, CanonicalWorkflow } from '../../types/applications';
import type { WorkspaceMemberInfo } from '../../api/applications';
import { sortDirectionLabel, type ApplicationGrouping } from '../../lib/applicationProductivity';

export interface ApplicationsToolbarProps {
  workflow: CanonicalWorkflow | null;
  stageCounts: Record<string, number>;
  totalCount: number;
  activeStage: string;
  onSelectStage: (stage: string) => void;
  outcomeFilter: string;
  onSelectOutcome: (outcome: string) => void;
  priorityFilter: string;
  onSelectPriority: (priority: string) => void;
  archiveState: 'active' | 'archived' | 'all';
  onToggleArchive: (state: 'active' | 'archived' | 'all') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isManager: boolean;
  members: WorkspaceMemberInfo[];
  selectedOwner: string;
  onSelectOwner: (ownerId: string) => void;
  onOpenCreateModal: () => void;
  agingFilter: AgingFilter;
  onSelectAging: (aging: AgingFilter) => void;
  /** Wide desktop (>=1680px): explicit visible Preview toggle (Gate 02B §4.2). */
  isWide?: boolean;
  isPreviewOpen?: boolean;
  onTogglePreview?: () => void;
  onOpenExport?: () => void;
  dateAddedFrom: string;
  dateAddedTo: string;
  onDateAddedFromChange: (date: string) => void;
  onDateAddedToChange: (date: string) => void;
  onClearDateAdded: () => void;
  sort: ApplicationSort;
  onSortChange: (sort: ApplicationSort) => void;
  groupBy?: ApplicationGrouping;
  onGroupByChange?: (grouping: ApplicationGrouping) => void;
  groupByMonth?: boolean;
  onGroupByMonthChange?: (enabled: boolean) => void;
}

export function ApplicationsToolbar({
  workflow,
  stageCounts,
  totalCount,
  activeStage,
  onSelectStage,
  outcomeFilter,
  onSelectOutcome,
  priorityFilter,
  onSelectPriority,
  archiveState,
  onToggleArchive,
  searchQuery,
  onSearchChange,
  isManager,
  members,
  selectedOwner,
  onSelectOwner,
  onOpenCreateModal,
  agingFilter,
  onSelectAging,
  isWide = false,
  isPreviewOpen = false,
  onTogglePreview,
  onOpenExport,
  dateAddedFrom,
  dateAddedTo,
  onDateAddedFromChange,
  onDateAddedToChange,
  onClearDateAdded,
  sort,
  onSortChange,
  groupBy,
  onGroupByChange,
  groupByMonth,
  onGroupByMonthChange,
}: ApplicationsToolbarProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync internal search state
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Debounced search output
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        onSearchChange(localSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, searchQuery, onSearchChange]);

  // Global `/` key focuses search when not in an input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        activeEl?.tagName === 'SELECT' ||
        activeEl?.getAttribute('contenteditable') === 'true';

      if (e.key === '/' && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const stages = workflow?.stages ?? [
    { id: 'SAVED' as ApplicationStage, label: 'Saved', order: 1 },
    { id: 'PREPARING' as ApplicationStage, label: 'Preparing', order: 2 },
    { id: 'APPLIED' as ApplicationStage, label: 'Applied', order: 3 },
    { id: 'ASSESSMENT' as ApplicationStage, label: 'Assessment', order: 4 },
    { id: 'RECRUITER_SCREEN' as ApplicationStage, label: 'Screen', order: 5 },
    { id: 'INTERVIEW' as ApplicationStage, label: 'Interview', order: 6 },
    { id: 'FINAL_INTERVIEW' as ApplicationStage, label: 'Final Round', order: 7 },
    { id: 'OFFER' as ApplicationStage, label: 'Offer', order: 8 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Top Search & Actions Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 300px', maxWidth: '480px' }}>
          <div
            style={{
              position: 'relative',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                color: 'var(--color-text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              ref={searchInputRef}
              type="text"
              className="input"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search company, role, location, notes (press / to focus)..."
              style={{ paddingLeft: '36px', paddingRight: localSearch ? '32px' : '44px', width: '100%' }}
              aria-label="Search applications"
            />
            {localSearch ? (
              <button
                type="button"
                onClick={() => {
                  setLocalSearch('');
                  onSearchChange('');
                  searchInputRef.current?.focus();
                }}
                style={{
                  position: 'absolute',
                  right: '10px',
                  background: 'none',
                  border: 'none',
                  padding: '4px',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                }}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            ) : (
              <span
                style={{
                  position: 'absolute',
                  right: '10px',
                  fontSize: '11px',
                  color: 'var(--color-text-muted)',
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  padding: '1px 5px',
                  pointerEvents: 'none',
                }}
              >
                /
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Status Filter */}
          <Select
            value={outcomeFilter}
            onChange={(e) => onSelectOutcome(e.target.value)}
            style={{ width: '130px' }}
            aria-label="Filter status and outcome"
          >
            <option value="ALL">All Outcomes</option>
            <option value="OPEN">Open Pipeline</option>
            <option value="CLOSED">Closed Only</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="REJECTED">Rejected</option>
            <option value="WITHDRAWN">Withdrawn</option>
            <option value="GHOSTED">Ghosted</option>
            <option value="POSITION_CLOSED">Position Closed</option>
          </Select>

          {/* Aging Filter (OPEN applications; Gate 02B §4.5 bands) */}
          <Select
            value={agingFilter}
            onChange={(e) => onSelectAging(e.target.value as AgingFilter)}
            style={{ width: '150px' }}
            aria-label="Filter by aging"
          >
            <option value="ALL">All Aging</option>
            <option value="QUIET">Quiet (15+ days)</option>
            <option value="STALE">Stale (15–30 days)</option>
            <option value="LONG_WAITING">Long Waiting (31+ days)</option>
          </Select>

          {/* Priority Filter */}
          <Select
            value={priorityFilter}
            onChange={(e) => onSelectPriority(e.target.value)}
            style={{ width: '120px' }}
            aria-label="Filter priority"
          >
            <option value="ALL">All Priority</option>
            <option value="HIGH">High Priority</option>
            <option value="MEDIUM">Medium Priority</option>
            <option value="LOW">Low Priority</option>
          </Select>

          {/* Manager Owner Filter */}
          {isManager && (
            <Select
              value={selectedOwner}
              onChange={(e) => onSelectOwner(e.target.value)}
              style={{ width: '150px' }}
              aria-label="Filter by workspace member"
            >
              <option value="ALL">All Members</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name || m.username} ({m.role})
                </option>
              ))}
            </Select>
          )}

          {/* Archive Toggle Button */}
          <Button
            variant={archiveState === 'archived' ? 'primary' : 'outline'}
            size="md"
            onClick={() => onToggleArchive(archiveState === 'archived' ? 'active' : 'archived')}
            aria-pressed={archiveState === 'archived'}
            title="Toggle between active and archived applications"
          >
            <Archive size={15} style={{ marginRight: '6px' }} />
            {archiveState === 'archived' ? 'Archived Only' : 'Archive'}
          </Button>

          {/* Wide-desktop preview rail toggle (also `P` with grid focus) */}
          {isWide && onTogglePreview && (
            <Button
              variant={isPreviewOpen ? 'primary' : 'outline'}
              size="md"
              onClick={onTogglePreview}
              aria-pressed={isPreviewOpen}
              title="Show or hide the preview rail (P)"
            >
              <PanelRight size={15} style={{ marginRight: '6px' }} />
              Preview
            </Button>
          )}

          {/* New Application CTA */}
          {onOpenExport && (
            <Button variant="outline" size="md" onClick={onOpenExport}>
              <Download size={15} style={{ marginRight: '6px' }} /> Export
            </Button>
          )}

          <Button
            variant="primary"
            size="md"
            onClick={onOpenCreateModal}
            data-testid="new-application-btn"
          >
            <Plus size={16} style={{ marginRight: '6px' }} />
            New Application
            <span
              style={{
                marginLeft: '8px',
                fontSize: '11px',
                opacity: 0.8,
                background: 'rgba(255,255,255,0.2)',
                padding: '1px 5px',
                borderRadius: '4px',
              }}
            >
              Q
            </span>
          </Button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'end',
          gap: '8px',
          flexWrap: 'wrap',
          padding: '10px 12px',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface-2)',
        }}
        role="group"
        aria-label="Application view controls"
      >
        <CalendarDays size={16} aria-hidden="true" style={{ alignSelf: 'center', color: 'var(--color-text-muted)' }} />
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          Date Added from
          <Input
            type="date"
            value={dateAddedFrom}
            max={dateAddedTo || undefined}
            onChange={(event) => onDateAddedFromChange(event.target.value)}
            aria-label="Date Added from"
            style={{ width: '150px', minHeight: '32px' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          Date Added through
          <Input
            type="date"
            value={dateAddedTo}
            min={dateAddedFrom || undefined}
            onChange={(event) => onDateAddedToChange(event.target.value)}
            aria-label="Date Added through"
            style={{ width: '150px', minHeight: '32px' }}
          />
        </label>
        {(dateAddedFrom || dateAddedTo) && (
          <Button size="sm" variant="ghost" onClick={onClearDateAdded} aria-label="Clear Date Added filter">
            Clear dates
          </Button>
        )}
        <span style={{ width: '1px', alignSelf: 'stretch', background: 'var(--color-border)' }} aria-hidden="true" />
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          Sort by
          <Select
            value={sort.field}
            onChange={(event) => onSortChange({ ...sort, field: event.target.value as ApplicationSort['field'] })}
            aria-label="Sort applications by"
            style={{ width: '170px', minHeight: '32px' }}
          >
            <option value="last_activity_at">Last activity</option>
            <option value="created_at">Date Added</option>
            <option value="applied_at">Application date</option>
            <option value="company_name">Company</option>
            <option value="role_title">Role</option>
            <option value="stage">Stage</option>
            <option value="priority">Priority</option>
          </Select>
        </label>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onSortChange({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' })}
          aria-label={`Sort direction: ${sortDirectionLabel(sort)}`}
          title={`Sort direction: ${sortDirectionLabel(sort)}`}
        >
          <ArrowUpDown size={14} aria-hidden="true" style={{ marginRight: '6px' }} />
          {sortDirectionLabel(sort)}
        </Button>
        <Button
          size="sm"
          variant={(groupBy ?? (groupByMonth ? 'month' : 'none')) === 'date' ? 'primary' : 'outline'}
          onClick={() => {
            const current = groupBy ?? (groupByMonth ? 'month' : 'none');
            const next = current === 'date' ? 'none' : 'date';
            onGroupByChange?.(next);
            onGroupByMonthChange?.(false);
          }}
          aria-pressed={(groupBy ?? (groupByMonth ? 'month' : 'none')) === 'date'}
          title="Group the current results page by date"
        >
          <CalendarDays size={14} aria-hidden="true" style={{ marginRight: '6px' }} />
          Group by date
        </Button>
        <Button
          size="sm"
          variant={(groupBy ?? (groupByMonth ? 'month' : 'none')) === 'month' ? 'primary' : 'outline'}
          onClick={() => {
            const current = groupBy ?? (groupByMonth ? 'month' : 'none');
            const next = current === 'month' ? 'none' : 'month';
            onGroupByChange?.(next);
            onGroupByMonthChange?.(next === 'month');
          }}
          aria-pressed={(groupBy ?? (groupByMonth ? 'month' : 'none')) === 'month'}
          title="Group the current results page by Date Added month"
        >
          <Layers3 size={14} aria-hidden="true" style={{ marginRight: '6px' }} />
          Group by month
        </Button>
      </div>

      {/* Stage Pills Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          overflowX: 'auto',
          paddingBottom: '4px',
          scrollbarWidth: 'thin',
        }}
        role="group"
        aria-label="Filter by stage"
      >
        <button
          type="button"
          aria-pressed={activeStage === 'ALL'}
          onClick={() => onSelectStage('ALL')}
          style={{
            padding: '6px 12px',
            borderRadius: 'var(--radius-full)',
            border: activeStage === 'ALL' ? '1px solid var(--color-brand-primary)' : '1px solid var(--color-border)',
            background: activeStage === 'ALL' ? 'var(--color-surface-selected)' : 'var(--color-surface-1)',
            color: activeStage === 'ALL' ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeStage === 'ALL' ? 600 : 500,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease',
          }}
        >
          All Stages
          <span
            style={{
              fontSize: '11px',
              background: 'var(--color-surface-2)',
              padding: '1px 6px',
              borderRadius: '10px',
            }}
          >
            {totalCount}
          </span>
        </button>

        {stages.map((st) => {
          const count = stageCounts[st.id] ?? 0;
          const isSelected = activeStage === st.id;
          return (
            <button
              key={st.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectStage(st.id)}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-full)',
                border: isSelected ? '1px solid var(--color-brand-primary)' : '1px solid var(--color-border)',
                background: isSelected ? 'var(--color-surface-selected)' : 'var(--color-surface-1)',
                color: isSelected ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
                fontWeight: isSelected ? 600 : 500,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {st.label}
              {count > 0 && (
                <span
                  style={{
                    fontSize: '11px',
                    background: 'var(--color-surface-2)',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    fontWeight: 600,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
