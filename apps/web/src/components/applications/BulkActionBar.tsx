import { ArrowRight, Ghost, Archive, Undo2, X } from 'lucide-react';
import { Button } from '../ui/Button';

export interface BulkActionBarProps {
  selectedCount: number;
  selectedActiveCount: number;
  selectedArchivedCount: number;
  selectedOpenCount: number;
  isPending: boolean;
  onMoveStage: () => void;
  onMarkGhosted: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onClearSelection: () => void;
}

export function BulkActionBar({
  selectedCount,
  selectedActiveCount,
  selectedArchivedCount,
  selectedOpenCount,
  isPending,
  onMoveStage,
  onMarkGhosted,
  onArchive,
  onRestore,
  onClearSelection,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className="application-bulk-bar"
      role="region"
      aria-label="Bulk actions toolbar"
      aria-busy={isPending}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          aria-hidden="true"
          style={{
            background: 'var(--color-brand-primary)',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 700,
            borderRadius: 'var(--radius-full)',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selectedCount}
        </span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }} aria-live="polite">
          {selectedCount === 1 ? '1 application selected' : `${selectedCount} applications selected`}
        </span>
      </div>

      <div className="application-bulk-divider" />

      <div className="application-bulk-actions">
        {selectedActiveCount > 0 && (
          <>
            <Button size="sm" variant="outline" onClick={onMoveStage} disabled={isPending}>
              <ArrowRight size={14} style={{ marginRight: '6px' }} aria-hidden="true" />
              Move Stage ({selectedActiveCount})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onMarkGhosted}
              disabled={isPending || selectedOpenCount === 0}
              title={selectedOpenCount === 0 ? 'Only open, active applications can be marked Ghosted.' : undefined}
            >
              <Ghost size={14} style={{ marginRight: '6px' }} aria-hidden="true" />
              Mark Ghosted ({selectedOpenCount})
            </Button>
            <Button size="sm" variant="outline" onClick={onArchive} disabled={isPending}>
              <Archive size={14} style={{ marginRight: '6px' }} aria-hidden="true" />
              Archive ({selectedActiveCount})
            </Button>
          </>
        )}
        {selectedArchivedCount > 0 && (
          <Button size="sm" variant="outline" onClick={onRestore} disabled={isPending}>
            <Undo2 size={14} style={{ marginRight: '6px' }} aria-hidden="true" />
            Restore ({selectedArchivedCount})
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={onClearSelection}
          disabled={isPending}
          aria-label="Clear selection"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <X size={15} style={{ marginRight: '4px' }} />
          Cancel
        </Button>
      </div>
    </div>
  );
}
