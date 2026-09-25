import { useEffect, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { StatusBadge, type BadgeVariant } from '../ui/StatusBadge';
import type { ApplicationOutcome, ClosureReason } from '../../types/applications';

export interface OutcomeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  applicationTitle?: string;
  onConfirmOutcome: (
    outcome: ApplicationOutcome,
    closureReason?: ClosureReason | null,
    closureNotes?: string | null
  ) => Promise<void>;
}

export function OutcomeDialog({
  isOpen,
  onClose,
  applicationTitle,
  onConfirmOutcome,
}: OutcomeDialogProps) {
  const [outcome, setOutcome] = useState<ApplicationOutcome>('ACCEPTED');
  const [closureReason, setClosureReason] = useState<ClosureReason>('OFFER_DECLINED');
  const [closureNotes, setClosureNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setOutcome('ACCEPTED');
      setClosureReason('OFFER_DECLINED');
      setClosureNotes('');
      setError(null);
    }
  }, [isOpen]);

  const outcomes: { id: ApplicationOutcome; label: string; badge: BadgeVariant; desc: string }[] = [
    { id: 'ACCEPTED', label: 'Accepted', badge: 'success', desc: 'Received and accepted an offer for this position' },
    { id: 'REJECTED', label: 'Rejected', badge: 'danger', desc: 'Employer decided not to proceed' },
    { id: 'WITHDRAWN', label: 'Withdrawn', badge: 'warning', desc: 'Withdrew candidacy or declined an offer' },
    { id: 'GHOSTED', label: 'Ghosted', badge: 'muted', desc: 'No response after multiple follow-ups' },
    { id: 'POSITION_CLOSED', label: 'Position Closed', badge: 'muted', desc: 'Role was cancelled or put on hold' },
  ];

  const closureReasons: { id: ClosureReason; label: string }[] = [
    { id: 'OFFER_DECLINED', label: 'Offer declined' },
    { id: 'GENERAL_WITHDRAWAL', label: 'General withdrawal' },
    { id: 'COMPENSATION_MISMATCH', label: 'Compensation mismatch' },
    { id: 'LOCATION_UNSUITABLE', label: 'Location unsuitable' },
    { id: 'OTHER', label: 'Other reason' },
  ];

  const handleConfirm = async () => {
    try {
      setSubmitting(true);
      setError(null);
      await onConfirmOutcome(
        outcome,
        outcome === 'WITHDRAWN' ? closureReason : null,
        closureNotes.trim() || null
      );
      setClosureNotes('');
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Could not record the outcome');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Close Application: Record Outcome"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Saving...' : 'Confirm Outcome'}
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
        {applicationTitle && (
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Recording outcome for: <strong>{applicationTitle}</strong>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span id="outcome-group-label" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Terminal Outcome
          </span>
          <div role="group" aria-labelledby="outcome-group-label" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {outcomes.map((o) => {
              const isSelected = outcome === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={isSelected}
                  data-outcome={o.id}
                  onClick={() => setOutcome(o.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: isSelected ? '2px solid var(--color-brand-primary)' : '1px solid var(--color-border)',
                    background: isSelected ? 'var(--color-surface-selected)' : 'var(--color-surface-1)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                      {o.label}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                      {o.desc}
                    </div>
                  </div>
                  <StatusBadge variant={o.badge}>{o.label}</StatusBadge>
                </button>
              );
            })}
          </div>
        </div>

        {outcome === 'WITHDRAWN' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              htmlFor="closure-reason-select"
              style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}
            >
              Withdrawal / Closure Reason
            </label>
            <Select
              id="closure-reason-select"
              value={closureReason}
              onChange={(e) => setClosureReason(e.target.value as ClosureReason)}
            >
              {closureReasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label
            htmlFor="outcome-notes"
            style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}
          >
            Outcome Notes (optional)
          </label>
          <Textarea
            id="outcome-notes"
            value={closureNotes}
            onChange={(e) => setClosureNotes(e.target.value)}
            placeholder="e.g. Received offer letter of $175k base + equity, decided to decline in favor of another role..."
            rows={3}
          />
        </div>
      </div>
    </Dialog>
  );
}
