import { ArrowRight, Ghost, Archive, Undo2, X } from 'lucide-react';
import { Button } from '../ui/Button';

export interface BulkActionBarProps {
  selectedCount: number;
  isArchivedView: boolean;
  onMoveStage: () => void;
  onMarkGhosted: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onClearSelection: () => void;
}

export function BulkActionBar({
  selectedCount,
  isArchivedView,
  onMoveStage,
  onMarkGhosted,
  onArchive,
  onRestore,
  onClearSelection,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-lg)',
        borderRadius: 'var(--radius-lg)',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        animation: 'slideUp 0.2s ease-out',
      }}
      role="region"
      aria-label="Bulk actions toolbar"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
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
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Selected
        </span>
      </div>

      <div style={{ height: '20px', width: '1px', background: 'var(--color-border)' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {!isArchivedView ? (
          <>
            <Button size="sm" variant="outline" onClick={onMoveStage}>
              <ArrowRight size={14} style={{ marginRight: '6px' }} />
              Move Stage
            </Button>
            <Button size="sm" variant="outline" onClick={onMarkGhosted}>
              <Ghost size={14} style={{ marginRight: '6px' }} />
              Mark Ghosted
            </Button>
            <Button size="sm" variant="outline" onClick={onArchive}>
              <Archive size={14} style={{ marginRight: '6px' }} />
              Archive
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={onRestore}>
            <Undo2 size={14} style={{ marginRight: '6px' }} />
            Restore to Active
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={onClearSelection}
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
