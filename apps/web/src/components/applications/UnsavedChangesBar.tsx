import { useEffect, useRef } from 'react';
import { Button } from '../ui/Button';

/**
 * Inline "discard unsaved changes?" confirmation shown inside a dialog (AC-CREATE-02).
 * Kept inside the existing dialog so its focus trap and Esc handling stay intact.
 */
export function UnsavedChangesBar({ onDiscard, onKeepEditing }: { onDiscard: () => void; onKeepEditing: () => void }) {
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  return (
    <div
      role="alert"
      data-testid="unsaved-changes"
      style={{
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-warning)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>You have unsaved changes. Discard them?</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Button ref={keepRef} type="button" size="sm" variant="outline" onClick={onKeepEditing}>
          Keep editing
        </Button>
        <Button type="button" size="sm" variant="danger" onClick={onDiscard}>
          Discard changes
        </Button>
      </div>
    </div>
  );
}
