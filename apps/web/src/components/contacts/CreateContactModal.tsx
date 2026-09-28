import { useState, useEffect, type FormEvent } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type {
  Contact,
  Company,
  ContactRelationshipType,
} from '../../types/contacts';
import type { Application } from '../../types/applications';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

export interface CreateContactModalProps {
  isOpen: boolean;
  contactToEdit?: Contact | null;
  companies: Company[];
  applications: Application[];
  initialApplicationId?: string;
  onClose: () => void;
  onSubmit: (data: {
    full_name: string;
    relationship_type: ContactRelationshipType;
    company_name?: string;
    job_title?: string;
    email?: string;
    phone?: string;
    linkedin_url?: string;
    relationship_notes?: string;
    next_follow_up_date?: string;
    application_id?: string;
    role_in_process?: string;
  }) => Promise<void>;
}

export function CreateContactModal({
  isOpen,
  contactToEdit,
  companies,
  applications,
  initialApplicationId,
  onClose,
  onSubmit,
}: CreateContactModalProps) {
  const [fullName, setFullName] = useState('');
  const [relationshipType, setRelationshipType] = useState<ContactRelationshipType>('RECRUITER');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [relationshipNotes, setRelationshipNotes] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [selectedApplicationId, setSelectedApplicationId] = useState('');
  const [roleInProcess, setRoleInProcess] = useState('RECRUITER');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (contactToEdit) {
      setFullName(contactToEdit.full_name || '');
      setRelationshipType(contactToEdit.relationship_type || 'CONTACT');
      setCompanyName(contactToEdit.company_name || '');
      setJobTitle(contactToEdit.job_title || '');
      setEmail(contactToEdit.email || '');
      setPhone(contactToEdit.phone || '');
      setLinkedinUrl(contactToEdit.linkedin_url || '');
      setRelationshipNotes(contactToEdit.notes || '');
      setNextFollowUpDate(contactToEdit.next_follow_up_date || '');
      setSelectedApplicationId('');
    } else {
      setFullName('');
      setRelationshipType('RECRUITER');
      setCompanyName('');
      setJobTitle('');
      setEmail('');
      setPhone('');
      setLinkedinUrl('');
      setRelationshipNotes('');
      setNextFollowUpDate('');
      setSelectedApplicationId(initialApplicationId || '');
      setRoleInProcess('RECRUITER');
    }
    setErrors({});
  }, [contactToEdit, initialApplicationId, isOpen]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) {
      errs.fullName = 'Contact name is required.';
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Enter a valid full email address, like name@company.com.';
    }
    if (
      linkedinUrl.trim() &&
      !linkedinUrl.includes('linkedin.com') &&
      !linkedinUrl.startsWith('http')
    ) {
      errs.linkedinUrl = 'Enter a valid LinkedIn profile URL or username.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        full_name: fullName.trim(),
        relationship_type: relationshipType,
        company_name: companyName.trim() || undefined,
        job_title: jobTitle.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        linkedin_url: linkedinUrl.trim() || undefined,
        relationship_notes: relationshipNotes.trim() || undefined,
        next_follow_up_date: nextFollowUpDate || undefined,
        application_id: selectedApplicationId || undefined,
        role_in_process: roleInProcess || undefined,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save contact.';
      setErrors((prev) => ({ ...prev, submit: msg }));
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
        aria-label={contactToEdit ? 'Edit contact' : 'New contact'}
        style={{
          width: '640px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--color-surface)',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          zIndex: 1000,
          border: '1px solid var(--color-border)',
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
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
            {contactToEdit ? 'Edit contact' : 'New contact'}
          </h2>
          <div style={{ flex: 1 }} />
          <IconButton
            icon={<X size={16} />}
            aria-label="Close dialog"
            variant="ghost"
            onClick={onClose}
          />
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
            {errors.submit && (
              <div
                className="banner danger row"
                style={{ padding: '10px 12px', marginBottom: '16px', gap: '8px', alignItems: 'center' }}
              >
                <AlertCircle size={14} className="danger-t" />
                <span className="small">{errors.submit}</span>
              </div>
            )}

            <div
              className="fgrid"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}
            >
              {/* Name */}
              <div className="field">
                <label className="label" htmlFor="contact-name">
                  Name <span className="req" style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <input
                  id="contact-name"
                  type="text"
                  className={`input ${errors.fullName ? 'err' : ''}`}
                  placeholder="e.g. Dana Cole"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{ width: '100%', height: '36px' }}
                />
                {errors.fullName && <div className="ferr" style={{ color: '#7f1d1d', fontSize: '13px', fontWeight: 600 }}>{errors.fullName}</div>}
              </div>

              {/* Type */}
              <div className="field">
                <label className="label" htmlFor="contact-type">
                  Type
                </label>
                <select
                  id="contact-type"
                  className="input"
                  value={relationshipType}
                  onChange={(e) => {
                    const t = e.target.value as ContactRelationshipType;
                    setRelationshipType(t);
                    setRoleInProcess(t);
                  }}
                  style={{ width: '100%', height: '36px' }}
                >
                  <option value="RECRUITER">Recruiter</option>
                  <option value="HIRING_MANAGER">Hiring manager</option>
                  <option value="REFERRAL">Referral</option>
                  <option value="INTERVIEWER">Interviewer</option>
                  <option value="PEER">Peer</option>
                  <option value="CONTACT">Networking / Other</option>
                </select>
              </div>

              {/* Company */}
              <div className="field">
                <label className="label" htmlFor="contact-company">
                  Company <span className="opt small">(optional)</span>
                </label>
                <input
                  id="contact-company"
                  type="text"
                  list="companies-datalist"
                  className="input"
                  placeholder="e.g. Halcyon Health"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  style={{ width: '100%', height: '36px' }}
                />
                <datalist id="companies-datalist">
                  {companies.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>

              {/* Title */}
              <div className="field">
                <label className="label" htmlFor="contact-title">
                  Title <span className="opt small">(optional)</span>
                </label>
                <input
                  id="contact-title"
                  type="text"
                  className="input"
                  placeholder="e.g. Talent Partner"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  style={{ width: '100%', height: '36px' }}
                />
              </div>

              {/* Email */}
              <div className="field">
                <label className="label" htmlFor="contact-email">
                  Email <span className="opt small">(optional)</span>
                </label>
                <input
                  id="contact-email"
                  type="email"
                  className={`input ${errors.email ? 'err' : ''}`}
                  placeholder="dana.cole@halcyon.example"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ width: '100%', height: '36px' }}
                />
                {errors.email && <div className="ferr small danger-t">{errors.email}</div>}
              </div>

              {/* Phone */}
              <div className="field">
                <label className="label" htmlFor="contact-phone">
                  Phone <span className="opt small">(optional)</span>
                </label>
                <input
                  id="contact-phone"
                  type="tel"
                  className="input"
                  placeholder="+1 555 010 0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{ width: '100%', height: '36px' }}
                />
              </div>

              {/* LinkedIn URL */}
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label className="label" htmlFor="contact-linkedin">
                  LinkedIn URL <span className="opt small">(optional)</span>
                </label>
                <input
                  id="contact-linkedin"
                  type="text"
                  className={`input ${errors.linkedinUrl ? 'err' : ''}`}
                  placeholder="https://linkedin.com/in/danacole"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  style={{ width: '100%', height: '36px' }}
                />
                {errors.linkedinUrl && (
                  <div className="ferr small danger-t">{errors.linkedinUrl}</div>
                )}
              </div>
            </div>

            {/* Application Linkage & Follow-up Section */}
            <div
              className="fsec"
              style={{
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid var(--color-border)',
              }}
            >
              <div
                className="fgrid"
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}
              >
                {/* Link to application */}
                {!contactToEdit && (
                  <>
                    <div className="field">
                      <label className="label" htmlFor="link-app">
                        Link to application <span className="opt small">(optional)</span>
                      </label>
                      <select
                        id="link-app"
                        className="input"
                        value={selectedApplicationId}
                        onChange={(e) => setSelectedApplicationId(e.target.value)}
                        style={{ width: '100%', height: '36px' }}
                      >
                        <option value="">None (standalone contact)</option>
                        {applications.map((app) => (
                          <option key={app.id} value={app.id}>
                            {app.company_name} — {app.role_title} ({app.stage})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="label" htmlFor="role-in-process">
                        Role on this application
                      </label>
                      <select
                        id="role-in-process"
                        className="input"
                        value={roleInProcess}
                        onChange={(e) => setRoleInProcess(e.target.value)}
                        disabled={!selectedApplicationId}
                        style={{ width: '100%', height: '36px' }}
                      >
                        <option value="RECRUITER">Recruiter</option>
                        <option value="HIRING_MANAGER">Hiring manager</option>
                        <option value="REFERRAL">Referral</option>
                        <option value="INTERVIEWER">Interviewer</option>
                        <option value="CONTACT">Contact</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Next follow-up */}
                <div className="field">
                  <label className="label" htmlFor="next-follow-up">
                    Next follow-up <span className="opt small">(optional)</span>
                  </label>
                  <input
                    id="next-follow-up"
                    type="date"
                    className="input"
                    value={nextFollowUpDate}
                    onChange={(e) => setNextFollowUpDate(e.target.value)}
                    style={{ width: '100%', height: '36px' }}
                  />
                </div>

                {/* Relationship notes */}
                <div className="field">
                  <label className="label" htmlFor="rel-notes">
                    Relationship details <span className="opt small">(optional)</span>
                  </label>
                  <input
                    id="rel-notes"
                    type="text"
                    className="input"
                    placeholder="e.g. met at meetup, alumni, former colleague"
                    value={relationshipNotes}
                    onChange={(e) => setRelationshipNotes(e.target.value)}
                    style={{ width: '100%', height: '36px' }}
                  />
                </div>
              </div>
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
            <span className="small" style={{ color: 'var(--color-text-secondary)' }}>
              All contacts are isolated to your workspace under RLS.
            </span>
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
              {isSubmitting ? 'Saving...' : contactToEdit ? 'Save changes' : 'Save contact'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
