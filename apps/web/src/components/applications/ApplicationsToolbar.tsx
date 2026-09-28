import { useState, useEffect, useRef } from 'react';
import { Search, X, Plus, Archive, PanelRight, Download } from 'lucide-react';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import type { AgingFilter, ApplicationStage, CanonicalWorkflow } from '../../types/applications';
import type { WorkspaceMemberInfo } from '../../api/applications';

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
