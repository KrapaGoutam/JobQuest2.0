import { useState, type FormEvent } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type { Contact } from '../../types/contacts';
import type { Application } from '../../types/applications';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

export interface LinkApplicationModalProps {
  isOpen: boolean;
  contact: Contact | null;
  applications: Application[];
  onClose: () => void;
  onSubmit: (applicationId: string, contactId: string, roleInProcess: string) => Promise<void>;
}

export function LinkApplicationModal({
  isOpen,
  contact,
  applications,
  onClose,
  onSubmit,
}: LinkApplicationModalProps) {
  const [selectedAppId, setSelectedAppId] = useState('');
  const [roleInProcess, setRoleInProcess] = useState('RECRUITER');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !contact) return null;

  // Filter out applications already linked to this contact
  const linkedAppIds = new Set((contact.application_contacts || []).map((l) => l.application_id));
  const availableApps = applications.filter((a) => !linkedAppIds.has(a.id));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedAppId) {
      setError('Please select an application to link.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(selectedAppId, contact.id, roleInProcess);
      setSelectedAppId('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to link application.';
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
        aria-label={`Link application to ${contact.full_name}`}
        style={{
          width: '500px',
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
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Link application</h2>
            <span className="small muted">To {contact.full_name}</span>
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

            {availableApps.length === 0 ? (
              <div className="muted small" style={{ fontStyle: 'italic', padding: '12px 0' }}>
                All available applications in your workspace are already linked to this contact.
              </div>
            ) : (
              <>
                {/* Application selector */}
                <div className="field">
                  <label className="label" htmlFor="select-app">
                    Application <span className="req" style={{ color: 'var(--color-danger)' }}>*</span>
                  </label>
                  <select
                    id="select-app"
                    className="input"
                    value={selectedAppId}
                    onChange={(e) => setSelectedAppId(e.target.value)}
                    style={{ width: '100%', height: '36px' }}
                  >
                    <option value="">Select an application...</option>
                    {availableApps.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.company_name} — {a.role_title} ({a.stage})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Role in process */}
                <div className="field">
                  <label className="label" htmlFor="role-in-app">
                    Role on this application
                  </label>
                  <select
                    id="role-in-app"
                    className="input"
                    value={roleInProcess}
                    onChange={(e) => setRoleInProcess(e.target.value)}
                    style={{ width: '100%', height: '36px' }}
                  >
                    <option value="RECRUITER">Recruiter</option>
                    <option value="HIRING_MANAGER">Hiring manager</option>
                    <option value="REFERRAL">Referral</option>
                    <option value="INTERVIEWER">Interviewer</option>
                    <option value="CONTACT">General contact</option>
                  </select>
                </div>
              </>
            )}
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
              disabled={isSubmitting || availableApps.length === 0 || !selectedAppId}
              style={{ marginLeft: '8px' }}
            >
              {isSubmitting ? 'Linking...' : 'Link application'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
