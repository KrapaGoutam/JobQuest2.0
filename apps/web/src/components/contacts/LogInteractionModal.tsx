import { useState, type FormEvent } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type { Contact, ContactInteractionType } from '../../types/contacts';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

export interface LogInteractionModalProps {
  isOpen: boolean;
  contact: Contact | null;
  onClose: () => void;
  onSubmit: (data: {
    contact_id: string;
    interaction_type: ContactInteractionType;
    interaction_date: string;
    notes?: string;
    next_follow_up_date?: string;
  }) => Promise<void>;
}

export function LogInteractionModal({
  isOpen,
  contact,
  onClose,
  onSubmit,
}: LogInteractionModalProps) {
  const [interactionType, setInteractionType] = useState<ContactInteractionType>('EMAIL');
  const [interactionDate, setInteractionDate] = useState(
    new Date().toISOString().split('T')[0] ?? ''
  );
  const [notes, setNotes] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !contact) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) {
      setError('Please enter notes or a summary of the interaction.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        contact_id: contact.id,
        interaction_type: interactionType,
        interaction_date: interactionDate,
        notes: notes.trim(),
        next_follow_up_date: nextFollowUpDate || undefined,
      });
      setNotes('');
      setNextFollowUpDate('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to log interaction.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Log interaction with ${contact.full_name}`}
        style={{
          width: '540px',
          maxWidth: '95vw',
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--color-surface)',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          zIndex: 1000,
          border: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          className="dlg-h row"
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-border)',
            alignItems: 'center',
          }}
        >
          <div className="col">
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Log interaction</h2>
            <span className="small muted">With {contact.full_name}</span>
          </div>
          <div style={{ flex: 1 }} />
          <IconButton
            icon={<X size={16} />}
            aria-label="Close dialog"
            variant="ghost"
            onClick={onClose}
          />
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && (
              <div
                className="banner danger row"
                style={{ padding: '10px 12px', gap: '8px', alignItems: 'center' }}
              >
                <AlertCircle size={14} className="danger-t" />
                <span className="small">{error}</span>
              </div>
            )}

            {/* Interaction Type selection buttons */}
            <div className="field">
              <label className="label">Interaction type</label>
              <div className="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
                {(['EMAIL', 'CALL', 'LINKEDIN', 'MEETING', 'COFFEE', 'NOTE'] as ContactInteractionType[]).map(
                  (t) => (
                    <button
                      key={t}
                      type="button"
                      className={`chip ${interactionType === t ? 'on' : ''}`}
                      style={{
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: interactionType === t ? 600 : 400,
                      }}
                      onClick={() => setInteractionType(t)}
                    >
                      {t}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Date */}
            <div className="field">
              <label className="label" htmlFor="int-date">
                Date of interaction
              </label>
              <input
                id="int-date"
                type="date"
                className="input"
                value={interactionDate}
                onChange={(e) => setInteractionDate(e.target.value)}
                style={{ width: '100%', height: '36px' }}
              />
            </div>

            {/* Notes */}
            <div className="field">
              <label className="label" htmlFor="int-notes">
                Notes / Summary <span className="req" style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <textarea
                id="int-notes"
                className="input"
                rows={4}
                placeholder="Key takeaways, answers to preparation questions, or next steps..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  lineHeight: '1.4',
                  fontSize: '13px',
                }}
              />
            </div>

            {/* Schedule next follow-up */}
            <div className="field">
              <label className="label" htmlFor="int-followup">
                Schedule next follow-up <span className="opt muted small">(optional)</span>
              </label>
              <input
                id="int-followup"
                type="date"
                className="input"
                value={nextFollowUpDate}
                onChange={(e) => setNextFollowUpDate(e.target.value)}
                style={{ width: '100%', height: '36px' }}
              />
            </div>
          </div>

          {/* Footer */}
          <div
            className="dlg-f row"
            style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-surface-muted)',
              alignItems: 'center',
            }}
          >
            <div style={{ flex: 1 }} />
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
              style={{ marginLeft: '8px' }}
            >
              {isSubmitting ? 'Logging...' : 'Log interaction'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
