import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, Mail, Phone, Plus, Users } from 'lucide-react';
import type { Application } from '../../types/applications';
import type { Company, Contact, ContactRelationshipType } from '../../types/contacts';
import { formatRelationshipType } from '../../types/contacts';
import {
  createContact,
  fetchApplicationContacts,
  fetchCompanies,
  fetchContacts,
  linkApplicationContact,
  updateContact,
} from '../../api/contacts';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { CreateContactModal } from '../contacts/CreateContactModal';
import { useToast } from '../../context/ToastContext';

const ROLE_OPTIONS = [
  ['RECRUITER', 'Recruiter'],
  ['HIRING_MANAGER', 'Hiring manager'],
  ['REFERRAL', 'Referral'],
  ['INTERVIEWER', 'Interviewer'],
  ['CONTACT', 'General contact'],
] as const;

export function ApplicationContactsSection({
  application,
  onChanged,
  onNavigateToContact,
}: {
  application: Application;
  onChanged?: () => void;
  onNavigateToContact?: (contactId: string) => void;
}) {
  const { addToast } = useToast();
  const [links, setLinks] = useState<Awaited<ReturnType<typeof fetchApplicationContacts>>>([]);
  const [availableContacts, setAvailableContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [linkSearch, setLinkSearch] = useState('');
  const [roleInProcess, setRoleInProcess] = useState('RECRUITER');
  const [saving, setSaving] = useState(false);
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLinks(await fetchApplicationContacts(application.id));
    } catch (cause) {
      setError((cause as Error).message || 'Could not load application contacts.');
    } finally {
      setLoading(false);
    }
  }, [application.id]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  const loadReferences = useCallback(async () => {
    const [contactsResult, companyRows] = await Promise.all([
      fetchContacts(application.workspace_id, { archiveState: 'active' }, { field: 'full_name', direction: 'asc' }, 0, 200),
      fetchCompanies(application.workspace_id),
    ]);
    setAvailableContacts(contactsResult.contacts);
    setCompanies(companyRows);
  }, [application.workspace_id]);

  const linkedIds = useMemo(() => new Set(links.map((link) => link.contact_id)), [links]);
  const choices = availableContacts.filter((contact) => {
    if (linkedIds.has(contact.id)) return false;
    const term = linkSearch.trim().toLowerCase();
    return !term || [contact.full_name, contact.company_name, contact.job_title, contact.email]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(term));
  });

  const openLink = async () => {
    setSelectedContactId('');
    setLinkSearch('');
    setRoleInProcess('RECRUITER');
    setLinkOpen(true);
    try {
      await loadReferences();
    } catch (cause) {
      setError((cause as Error).message || 'Could not load contacts to link.');
    }
  };

  const openContactModal = async (contact: Contact | null) => {
    setEditingContact(contact);
    setContactModalOpen(true);
    try {
      await loadReferences();
    } catch (cause) {
      setError((cause as Error).message || 'Could not load contact reference data.');
    }
  };

  const submitLink = async () => {
    if (!selectedContactId) return;
    setSaving(true);
    try {
      await linkApplicationContact(application.id, selectedContactId, roleInProcess);
      setLinkOpen(false);
      await loadLinks();
      onChanged?.();
      addToast({ title: 'Contact linked', type: 'success' });
    } catch (cause) {
      addToast({ title: (cause as Error).message || 'Could not link contact.', type: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const submitContact = async (data: {
    full_name: string;
    relationship_type: ContactRelationshipType;
    company_name?: string;
    job_title?: string;
    email?: string;
    phone?: string;
    linkedin_url?: string;
    relationship_notes?: string;
    next_follow_up_date?: string;
    role_in_process?: string;
  }) => {
    if (editingContact) {
      await updateContact(editingContact.id, {
        full_name: data.full_name,
        relationship_type: data.relationship_type,
        company_name: data.company_name,
        job_title: data.job_title,
        email: data.email,
        phone: data.phone,
        linkedin_url: data.linkedin_url,
        notes: data.relationship_notes,
        next_follow_up_date: data.next_follow_up_date,
      });
      addToast({ title: 'Contact updated', type: 'success' });
    } else {
      await createContact({
        ...data,
        workspace_id: application.workspace_id,
        application_id: application.id,
        role_in_process: data.role_in_process || data.relationship_type,
      });
      addToast({ title: 'Contact created and linked', type: 'success' });
    }
    await loadLinks();
    onChanged?.();
  };

  return (
    <section aria-labelledby="application-contacts-heading" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--color-surface-2)', flexWrap: 'wrap' }}>
        <Users size={16} aria-hidden="true" style={{ color: 'var(--color-brand-primary)' }} />
        <h2 id="application-contacts-heading" style={{ margin: 0, fontSize: '14px' }}>Hiring contacts</h2>
        {!loading && <span className="small muted">{links.length}</span>}
        <span style={{ flex: 1 }} />
        <Button size="sm" variant="outline" onClick={() => void openLink()}>
          <Link2 size={13} aria-hidden="true" style={{ marginRight: '5px' }} /> Link existing
        </Button>
        <Button size="sm" variant="primary" onClick={() => void openContactModal(null)}>
          <Plus size={13} aria-hidden="true" style={{ marginRight: '5px' }} /> Add contact
        </Button>
      </div>

      {loading ? (
        <div role="status" aria-live="polite" className="small muted" style={{ padding: '14px' }}>Loading contacts...</div>
      ) : error ? (
        <div role="alert" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger)' }}>
          <span className="small" style={{ flex: 1 }}>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void loadLinks()}>Retry</Button>
        </div>
      ) : links.length === 0 ? (
        <div style={{ padding: '14px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600 }}>No contacts linked yet</div>
          <div className="small muted" style={{ marginTop: '3px' }}>Link a saved contact or add a recruiter from this application.</div>
        </div>
      ) : (
        <div role="list" aria-label="Contacts linked to this application">
          {links.map((link) => {
            const contact = link.contacts;
            if (!contact) return null;
            const expanded = expandedContactId === contact.id;
            return (
              <div key={link.contact_id} role="listitem" style={{ padding: '11px 14px', borderTop: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{contact.full_name}</div>
                    <div className="small muted">
                      {ROLE_OPTIONS.find(([value]) => value === link.role_in_process)?.[1] ?? formatRelationshipType(contact.relationship_type)}
                      {(contact.job_title || contact.company_name) && ` · ${[contact.job_title, contact.company_name].filter(Boolean).join(' at ')}`}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" aria-expanded={expanded} onClick={() => setExpandedContactId(expanded ? null : contact.id)}>
                    {expanded ? 'Hide details' : 'View details'}
                  </Button>
                  {onNavigateToContact && (
                    <Button size="sm" variant="ghost" onClick={() => onNavigateToContact(contact.id)}>Open contact</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => void openContactModal(contact)}>Edit</Button>
                </div>
                {expanded && (
                  <div style={{ marginTop: '9px', paddingTop: '9px', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {contact.email && <a href={`mailto:${contact.email}`} className="small" style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}><Mail size={12} aria-hidden="true" />{contact.email}</a>}
                    {contact.phone && <a href={`tel:${contact.phone}`} className="small" style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}><Phone size={12} aria-hidden="true" />{contact.phone}</a>}
                    {contact.notes && <p className="small muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{contact.notes}</p>}
                    {!contact.email && !contact.phone && !contact.notes && <span className="small muted">No additional contact details saved.</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        isOpen={linkOpen}
        onClose={() => setLinkOpen(false)}
        title="Link an existing contact"
        description={`Choose a saved contact for ${application.company_name}. Already-linked contacts are excluded.`}
        footer={
          <>
            <span style={{ flex: 1 }} />
            <Button variant="secondary" onClick={() => setLinkOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={() => void submitLink()} disabled={saving || !selectedContactId}>
              {saving ? 'Linking...' : 'Link contact'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <label className="label" htmlFor="application-contact-select">Contact</label>
          <Input
            aria-label="Search saved contacts"
            placeholder="Search by name, company, title, or email"
            value={linkSearch}
            onChange={(event) => {
              setLinkSearch(event.target.value);
              setSelectedContactId('');
            }}
          />
          <Select id="application-contact-select" value={selectedContactId} onChange={(event) => setSelectedContactId(event.target.value)}>
            <option value="">Select a contact...</option>
            {choices.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name}{contact.company_name ? ` — ${contact.company_name}` : ''}</option>)}
          </Select>
          {choices.length === 0 && <p className="small muted" style={{ margin: 0 }}>No unlinked active contacts are available. Add a new contact instead.</p>}
          <label className="label" htmlFor="application-contact-role">Role on this application</label>
          <Select id="application-contact-role" value={roleInProcess} onChange={(event) => setRoleInProcess(event.target.value)}>
            {ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </div>
      </Dialog>

      <CreateContactModal
        isOpen={contactModalOpen}
        contactToEdit={editingContact}
        companies={companies}
        applications={[application]}
        initialApplicationId={application.id}
        initialCompanyName={application.company_name}
        onClose={() => {
          setContactModalOpen(false);
          setEditingContact(null);
        }}
        onSubmit={submitContact}
      />
    </section>
  );
}
