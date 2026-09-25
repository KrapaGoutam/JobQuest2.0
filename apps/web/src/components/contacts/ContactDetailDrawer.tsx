import { useState } from 'react';
import {
  X,
  Globe,
  Copy,
  Clock,
  AlertTriangle,
  Plus,
  MessageSquare,
  Edit2,
  Archive,
  RotateCcw,
  Check,
  ExternalLink,
} from 'lucide-react';
import type { Contact, ContactInteractionType } from '../../types/contacts';
import {
  computeFollowUpStatus,
  formatRelationshipType,
  getRelationshipPillVariant,
  getInitials,
} from '../../types/contacts';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

export interface ContactDetailDrawerProps {
  isOpen: boolean;
  contact: Contact | null;
  onClose: () => void;
  onEdit: (contact: Contact) => void;
  onArchive: (contactId: string) => Promise<void>;
  onRestore: (contactId: string) => Promise<void>;
  onLogInteraction: (contactId: string, type: ContactInteractionType, notes: string) => Promise<void>;
  onOpenLogModal: (contact: Contact) => void;
  onLinkApplication: (contact: Contact) => void;
  onUnlinkApplication: (applicationId: string, contactId: string) => Promise<void>;
  onUpdateFollowUp: (contactId: string, nextDate: string | null) => Promise<void>;
}

export function ContactDetailDrawer({
  isOpen,
  contact,
  onClose,
  onEdit,
  onArchive,
  onRestore,
  onLogInteraction,
  onOpenLogModal,
  onLinkApplication,
  onUnlinkApplication,
  onUpdateFollowUp,
}: ContactDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<'activity' | 'notes'>('activity');
  const [quickNote, setQuickNote] = useState('');
  const [quickType, setQuickType] = useState<ContactInteractionType>('EMAIL');
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  if (!isOpen || !contact) return null;

  const followUp = computeFollowUpStatus(contact.next_follow_up_date);
  const pillVariant = getRelationshipPillVariant(contact.relationship_type);
  const initials = getInitials(contact.full_name);
  const interactions = contact.contact_interactions || [];
  const linkedApps = contact.application_contacts || [];

  const handleCopyEmail = () => {
    if (contact.email) {
      void navigator.clipboard.writeText(contact.email);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickNote.trim()) return;
    setIsSubmittingQuick(true);
    try {
      await onLogInteraction(contact.id, quickType, quickNote.trim());
      setQuickNote('');
    } finally {
      setIsSubmittingQuick(false);
    }
  };

  const handleCompleteFollowUp = async () => {
    // Clear follow-up date and log a note
    await onUpdateFollowUp(contact.id, null);
  };

  const handleSnooze = async (days = 3) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const dateStr = d.toISOString().split('T')[0] ?? null;
    await onUpdateFollowUp(contact.id, dateStr);
  };


  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="drawer contact-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Contact details for ${contact.full_name}`}
        style={{
          width: '740px',
          maxWidth: '100vw',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-border)',
        }}
      >
        {/* Top Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
          }}
        >
          {/* Navigation & close */}
          <div className="row small" style={{ alignItems: 'center', marginBottom: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              className="row"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                gap: '4px',
                padding: 0,
                alignItems: 'center',
                fontSize: '12px',
                color: 'var(--color-text-secondary)',
              }}
            >
              ← Back to Contacts
            </button>
            <div style={{ flex: 1 }} />
            <IconButton
              icon={<X size={16} />}
              aria-label="Close drawer"
              variant="ghost"
              onClick={onClose}
            />
          </div>

          {/* Contact Identity Row */}
          <div className="row" style={{ gap: '16px', alignItems: 'center' }}>
            <span
              className="av xl"
              style={{
                width: '56px',
                height: '56px',
                fontSize: '20px',
                borderRadius: '50%',
                background: 'var(--color-surface-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
              }}
            >
              {initials}
            </span>
            <div className="col" style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 600 }}>{contact.full_name}</h2>
                <span className={`pill ${pillVariant === 'accent' ? 'accent' : pillVariant}`}>
                  {formatRelationshipType(contact.relationship_type)}
                </span>
                {contact.archived_at && <span className="pill muted">Archived</span>}
              </div>
              <div className="small" style={{ marginTop: '4px', color: 'var(--color-text-secondary)' }}>
                {contact.job_title && <span>{contact.job_title}</span>}
                {contact.job_title && contact.company_name && <span> · </span>}
                {contact.company_name && (
                  <strong style={{ color: 'var(--color-fg)' }}>{contact.company_name}</strong>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="row" style={{ gap: '6px' }}>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<MessageSquare size={13} />}
                onClick={() => onOpenLogModal(contact)}
              >
                Log interaction
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Edit2 size={13} />}
                onClick={() => onEdit(contact)}
              >
                Edit
              </Button>
              {contact.archived_at ? (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<RotateCcw size={13} />}
                  onClick={() => onRestore(contact.id)}
                >
                  Restore
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Archive size={13} />}
                  onClick={() => onArchive(contact.id)}
                >
                  Archive
                </Button>
              )}
            </div>
          </div>

          {/* Follow-up Banner if due */}
          {followUp.status !== 'none' && (
            <div
              className={`banner ${followUp.status === 'danger' ? 'danger' : 'warning'} row`}
              style={{
                marginTop: '14px',
                padding: '10px 14px',
                borderRadius: '6px',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              {followUp.status === 'danger' ? (
                <AlertTriangle size={16} className="danger-t" />
              ) : (
                <Clock size={16} className="warning-t" />
              )}
              <div className="col" style={{ flex: 1 }}>
                <span className="b" style={{ fontSize: '13px' }}>
                  {followUp.status === 'danger'
                    ? `Follow-up ${followUp.label}`
                    : followUp.status === 'warning'
                    ? 'Follow-up due today'
                    : `Follow-up due ${followUp.label}`}
                </span>
                <span className="small" style={{ opacity: 0.9 }}>
                  {contact.next_follow_up_date}
                </span>
              </div>
              <Button
                size="sm"
                variant="primary"
                leftIcon={<Check size={12} />}
                onClick={handleCompleteFollowUp}
              >
                Done
              </Button>
              <Button size="sm" variant="secondary" onClick={() => handleSnooze(3)}>
                Snooze 3d
              </Button>
            </div>
          )}
        </div>

        {/* 2-Column Body Content matching 03-contacts.html */}
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1.2fr 1fr', overflow: 'hidden' }}>
          {/* Left Column: Activity & Quick Log */}
          <div
            style={{
              padding: '16px 20px',
              overflowY: 'auto',
              borderRight: '1px solid var(--color-border)',
            }}
          >
            {/* Tabs */}
            <div className="tabs" role="tablist" style={{ marginBottom: '12px' }}>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'activity'}
                className={`tab ${activeTab === 'activity' ? 'sel' : ''}`}
                onClick={() => setActiveTab('activity')}
              >
                Activity <span className="cnt">{interactions.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'notes'}
                className={`tab ${activeTab === 'notes' ? 'sel' : ''}`}
                onClick={() => setActiveTab('notes')}
              >
                Notes
              </button>
            </div>

            {activeTab === 'activity' && (
              <>
                {/* Quick interaction log input */}
                <form onSubmit={handleQuickSubmit} style={{ marginBottom: '16px' }}>
                  <div
                    className="card col"
                    style={{ padding: '10px 12px', gap: '8px', border: '1px solid var(--color-border)' }}
                  >
                    <div className="row" style={{ gap: '6px', alignItems: 'center' }}>
                      <span className="small b" style={{ color: 'var(--color-text)' }}>Log quick interaction:</span>
                      {(['EMAIL', 'CALL', 'LINKEDIN', 'MEETING'] as ContactInteractionType[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`chip ${quickType === t ? 'on' : ''}`}
                          style={{
                            fontSize: '11px',
                            height: '24px',
                            padding: '0 8px',
                            cursor: 'pointer',
                          }}
                          onClick={() => setQuickType(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder={`Log a note or summary with ${contact.full_name}...`}
                        value={quickNote}
                        onChange={(e) => setQuickNote(e.target.value)}
                        style={{
                          flex: 1,
                          height: '32px',
                          padding: '0 10px',
                          borderRadius: '4px',
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface)',
                          fontSize: '13px',
                          color: 'var(--color-fg)',
                        }}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="primary"
                        disabled={!quickNote.trim() || isSubmittingQuick}
                      >
                        {isSubmittingQuick ? '...' : 'Log'}
                      </Button>
                    </div>
                  </div>
                </form>

                {/* Timeline */}
                {interactions.length === 0 ? (
                  <div className="muted small" style={{ textAlign: 'center', padding: '24px 0' }}>
                    No interactions logged yet. Use the quick logger above to record an email, call, or meeting.
                  </div>
                ) : (
                  <div className="col" style={{ gap: '12px' }}>
                    {interactions.map((int) => {
                      const d = new Date(int.interaction_date + (int.interaction_date.includes('T') ? '' : 'T00:00:00'));
                      const day = d.getDate();
                      const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();

                      return (
                        <div
                          key={int.id}
                          className="row"
                          style={{
                            padding: '10px 0',
                            borderTop: '1px solid var(--color-border)',
                            gap: '12px',
                            alignItems: 'flex-start',
                          }}
                        >
                          {/* Date badge */}
                          <div style={{ textAlign: 'center', minWidth: '40px' }}>
                            <div style={{ fontSize: '18px', fontWeight: 600, lineHeight: 1 }}>{day}</div>
                            <div className="xs b" style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                              {month}
                            </div>
                          </div>

                          {/* Content */}
                          <div className="col" style={{ flex: 1, minWidth: 0 }}>
                            <div className="row" style={{ gap: '6px', alignItems: 'center' }}>
                              <span className="pill info" style={{ fontSize: '10px', padding: '1px 6px' }}>
                                {int.interaction_type}
                              </span>
                              <span className="small" style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                                {int.interaction_date}
                              </span>
                            </div>
                            {int.notes && (
                              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-fg)' }}>
                                {int.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {activeTab === 'notes' && (
              <div className="col" style={{ gap: '12px' }}>
                <div className="sec-t small b" style={{ color: 'var(--color-text-secondary)' }}>Relationship Notes</div>
                <div
                  className="card"
                  style={{
                    padding: '12px',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    background: 'var(--color-surface-muted)',
                  }}
                >
                  {contact.notes || (
                    <span className="muted" style={{ fontStyle: 'italic' }}>
                      No notes recorded. Click "Edit" to add relationship background or details.
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Contact info, Linked applications & Networking progress */}
          <div style={{ padding: '16px 20px', overflowY: 'auto', background: 'var(--color-surface)' }}>
            {/* Contact info card */}
            <div style={{ marginBottom: '20px' }}>
              <div className="sec-t small b" style={{ marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
                Contact Info
              </div>
              <div className="kv" style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '8px', fontSize: '13px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Email</span>
                <span className="row" style={{ gap: '6px', alignItems: 'center' }}>
                  {contact.email ? (
                    <>
                      <a href={`mailto:${contact.email}`} className="ell">
                        {contact.email}
                      </a>
                      <button
                        type="button"
                        onClick={handleCopyEmail}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                        title="Copy email"
                      >
                        {copiedEmail ? <Check size={12} className="success-t" /> : <Copy size={12} className="muted" />}
                      </button>
                    </>
                  ) : (
                    <span className="muted" style={{ fontStyle: 'italic' }}>
                      Not added
                    </span>
                  )}
                </span>

                <span style={{ color: 'var(--color-text-secondary)' }}>Phone</span>
                <span>
                  {contact.phone ? (
                    <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                  ) : (
                    <span className="muted" style={{ fontStyle: 'italic' }}>
                      Not added
                    </span>
                  )}
                </span>

                <span style={{ color: 'var(--color-text-secondary)' }}>LinkedIn</span>
                <span>
                  {contact.linkedin_url ? (
                    <a
                      href={
                        contact.linkedin_url.startsWith('http')
                          ? contact.linkedin_url
                          : `https://${contact.linkedin_url}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="row"
                      style={{ gap: '4px', alignItems: 'center', color: 'var(--color-accent)' }}
                    >
                      <Globe size={12} />
                      <span className="ell" style={{ color: 'var(--color-accent)' }}>Profile</span>
                      <ExternalLink size={10} style={{ color: 'var(--color-accent)' }} />
                    </a>
                  ) : (
                    <span className="muted" style={{ fontStyle: 'italic' }}>
                      Not added
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Linked Applications */}
            <div style={{ marginBottom: '20px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
              <div className="row" style={{ alignItems: 'center', marginBottom: '10px' }}>
                <span className="sec-t small b" style={{ color: 'var(--color-text-secondary)' }}>Linked Applications</span>
                <span className="cnt small" style={{ marginLeft: '6px' }}>
                  {linkedApps.length}
                </span>
                <div style={{ flex: 1 }} />
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Plus size={12} />}
                  onClick={() => onLinkApplication(contact)}
                >
                  Link
                </Button>
              </div>

              {linkedApps.length === 0 ? (
                <div className="small" style={{ fontStyle: 'italic', padding: '6px 0', color: 'var(--color-text-secondary)' }}>
                  No applications linked. Link an application to trace hiring team contacts.
                </div>
              ) : (
                <div className="col" style={{ gap: '8px' }}>
                  {linkedApps.map((link) => (
                    <div
                      key={link.application_id}
                      className="card row"
                      style={{
                        padding: '8px 10px',
                        gap: '8px',
                        alignItems: 'center',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <div className="col" style={{ flex: 1, minWidth: 0 }}>
                        <div className="b ell" style={{ fontSize: '13px' }}>
                          {link.applications?.role_title || 'Application'}
                        </div>
                        <div className="small muted ell">
                          {link.applications?.company_name} · as {link.role_in_process || 'Contact'}
                        </div>
                      </div>
                      <span className="pill muted" style={{ fontSize: '10px' }}>
                        {link.applications?.stage || 'APPLIED'}
                      </span>
                      <IconButton
                        icon={<X size={12} />}
                        aria-label="Unlink application"
                        variant="ghost"
                        size="sm"
                        onClick={() => onUnlinkApplication(link.application_id, contact.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Networking progress checklist (03-contacts.html) is deferred: the legacy
                progress flags are not in the approved schema (M4 closeout, OPEN_QUESTIONS). */}
          </div>
        </div>
      </div>
    </>
  );
}
