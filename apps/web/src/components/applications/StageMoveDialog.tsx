import { useEffect, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { StagePips } from '../ui/StagePips';
import type { ApplicationStage, CanonicalWorkflow } from '../../types/applications';

export interface StageMoveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workflow: CanonicalWorkflow | null;
  currentStage?: ApplicationStage;
  targetAppCount?: number;
  onConfirmMove: (newStage: ApplicationStage, notes?: string) => Promise<void>;
}

export function StageMoveDialog({
  isOpen,
  onClose,
  workflow,
  currentStage = 'APPLIED',
  targetAppCount = 1,
  onConfirmMove,
}: StageMoveDialogProps) {
  const [selectedStage, setSelectedStage] = useState<ApplicationStage>(currentStage);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The dialog stays mounted; start every opening from the target's current stage.
  useEffect(() => {
    if (isOpen) {
      setSelectedStage(currentStage);
      setNotes('');
      setError(null);
    }
  }, [isOpen, currentStage]);

  const isSingle = targetAppCount <= 1;
  const unchanged = isSingle && selectedStage === currentStage;

  const stages = workflow?.stages ?? [
    { id: 'SAVED' as ApplicationStage, label: 'Saved', order: 1 },
    { id: 'PREPARING' as ApplicationStage, label: 'Preparing', order: 2 },
    { id: 'APPLIED' as ApplicationStage, label: 'Applied', order: 3 },
    { id: 'ASSESSMENT' as ApplicationStage, label: 'Assessment', order: 4 },
    { id: 'RECRUITER_SCREEN' as ApplicationStage, label: 'Recruiter Screen', order: 5 },
    { id: 'INTERVIEW' as ApplicationStage, label: 'Interview', order: 6 },
    { id: 'FINAL_INTERVIEW' as ApplicationStage, label: 'Final Interview', order: 7 },
    { id: 'OFFER' as ApplicationStage, label: 'Offer', order: 8 },
  ];

  const handleConfirm = async () => {
    if (unchanged) return;
    try {
      setSubmitting(true);
      setError(null);
      await onConfirmMove(selectedStage, notes.trim() || undefined);
      setNotes('');
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Stage change failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={targetAppCount > 1 ? `Move Stage (${targetAppCount} applications)` : 'Move Stage'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={submitting || unchanged}>
            {submitting ? 'Updating...' : `Move to ${stages.find((s) => s.id === selectedStage)?.label ?? selectedStage}`}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {error && (
          <div role="alert" style={{ fontSize: '13px', color: 'var(--color-danger)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
            {error}
          </div>
        )}
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 }}>
          Select the new pipeline stage to transition {targetAppCount > 1 ? 'these applications' : 'this application'} to:
        </p>

        <div role="group" aria-label="Pipeline stages" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
          {stages.map((st) => {
            const isSelected = selectedStage === st.id;
            return (
              <button
                key={st.id}
                type="button"
                aria-pressed={isSelected}
                data-stage={st.id}
                onClick={() => setSelectedStage(st.id)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: isSelected ? '2px solid var(--color-brand-primary)' : '1px solid var(--color-border)',
                  background: isSelected ? 'var(--color-surface-selected)' : 'var(--color-surface-1)',
                  color: isSelected ? 'var(--color-brand-primary)' : 'var(--color-text-primary)',
                  fontWeight: isSelected ? 600 : 500,
                  fontSize: '13px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>
                    {st.label}
                    {isSingle && st.id === currentStage ? ' (current)' : ''}
                  </span>
                  <StagePips stage={st.id} maxSteps={8} />
                </div>
              </button>
            );
          })}
        </div>

        <div>
          <label
            htmlFor="stage-move-notes"
            style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '6px' }}
          >
            Transition Notes (optional)
          </label>
          <Textarea
            id="stage-move-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Completed second round panel interview with engineering leads..."
            rows={3}
          />
        </div>
      </div>
    </Dialog>
  );
}
