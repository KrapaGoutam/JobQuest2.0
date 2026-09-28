import { useState } from 'react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { useToast } from '../../context/ToastContext';
import { archiveApplication, keepApplicationActive, restoreApplication, setApplicationOutcome } from '../../api/applications';

/**
 * Inactivity review actions (Gate 02B INTERACTION_SPEC 2.4) using the M3 domain RPCs.
 * Nothing happens automatically: each action is an explicit user choice.
 */
export function ReviewActions({
  application,
  onChanged,
  compact,
  include = ['keep', 'ghost', 'archive'],
}: {
  application: { id: string; company_name: string };
  onChanged: () => void;
  compact?: boolean;
  include?: ('keep' | 'ghost' | 'archive')[];
}) {
  const { addToast } = useToast();
  const [confirmGhost, setConfirmGhost] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, message: string, undo?: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
      addToast({
        title: message,
        type: 'success',
        duration: undo ? 10_000 : 4000,
        action: undo ? { label: 'Undo', onClick: () => void undo().then(onChanged) } : undefined,
      });
    } catch (e) {
      addToast({ title: (e as Error).message || 'Something went wrong', type: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const size = compact ? 'sm' : 'sm';
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      {include.includes('keep') && (
        <Button size={size} variant="secondary" disabled={busy} aria-label={`Keep ${application.company_name} active`} onClick={() => void run(() => keepApplicationActive(application.id), `Kept active: ${application.company_name}`)}>
          Keep
        </Button>
      )}
      {include.includes('ghost') && (
        <Button size={size} variant="secondary" disabled={busy} aria-label={`Mark ${application.company_name} ghosted`} onClick={() => setConfirmGhost(true)}>
          Mark Ghosted
        </Button>
      )}
      {include.includes('archive') && (
        <Button
          size={size}
          variant="secondary"
          disabled={busy}
          aria-label={`Archive ${application.company_name}`}
          onClick={() => void run(() => archiveApplication(application.id), `Archived: ${application.company_name}`, () => restoreApplication(application.id))}
        >
          Archive
        </Button>
      )}
      <Dialog
        isOpen={confirmGhost}
        onClose={() => setConfirmGhost(false)}
        title="Mark as Ghosted?"
        description={`${application.company_name} closes with the outcome Ghosted. Its stage history is kept.`}
        maxWidth={440}
        footer={
          <>
            <span style={{ flex: 1 }} />
            <Button variant="secondary" onClick={() => setConfirmGhost(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirmGhost(false);
                void run(() => setApplicationOutcome(application.id, 'GHOSTED'), `Marked ghosted: ${application.company_name}`);
              }}
            >
              Mark Ghosted
            </Button>
          </>
        }
      >
        <p className="small muted" style={{ margin: 0 }}>Pending tasks linked to it stay in your queue until you complete or cancel them.</p>
      </Dialog>
    </span>
  );
}
