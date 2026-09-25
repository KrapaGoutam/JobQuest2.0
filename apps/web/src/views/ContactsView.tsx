import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { useWorkspace } from '../context/WorkspaceContext';
import { useToast } from '../context/ToastContext';
import {
  fetchContacts,
  fetchContactDetail,
  createContact,
  updateContact,
  archiveContact,
  restoreContact,
  logContactInteraction,
  linkApplicationContact,
  unlinkApplicationContact,
  fetchCompanies,
  fetchWorkspaceMembers,
} from '../api/contacts';
import { fetchApplications } from '../api/applications';
import type {
  Contact,
  Company,
  ContactSort,
  ContactRelationshipType,
  ContactInteractionType,
} from '../types/contacts';
import type { Application } from '../types/applications';
import { ContactsToolbar } from '../components/contacts/ContactsToolbar';
import { ContactsTable } from '../components/contacts/ContactsTable';
import { ContactDetailDrawer } from '../components/contacts/ContactDetailDrawer';
import { CreateContactModal } from '../components/contacts/CreateContactModal';
import { LogInteractionModal } from '../components/contacts/LogInteractionModal';
import { LinkApplicationModal } from '../components/contacts/LinkApplicationModal';
export interface ContactsViewProps {
  activeWorkspaceId?: string | null;
  isManager?: boolean;
}

/** One CSV cell: quoted, and neutralised against spreadsheet formula injection. */
function csvCell(value: string | null | undefined): string {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

export function ContactsView({
  activeWorkspaceId: propWorkspaceId,
  isManager: propIsManager,
}: ContactsViewProps = {}) {
  const ctx = useWorkspace();
  const [resolvedWsId, setResolvedWsId] = useState<string | null>(propWorkspaceId ?? ctx.activeWorkspaceId ?? null);
  const activeWorkspaceId = propWorkspaceId ?? ctx.activeWorkspaceId ?? resolvedWsId;
  const isManager = propIsManager ?? ctx.isManager;
  const { addToast } = useToast();

  useEffect(() => {
    if (!activeWorkspaceId) {
      void supabase
        .from('workspace_members')
        .select('workspace_id, role')
        .limit(1)
        .then((res: { data: Array<{ workspace_id: string; role: string }> | null }) => {
          if (res.data?.[0]?.workspace_id) {
            setResolvedWsId(res.data[0].workspace_id);
          }
        });
    }
  }, [activeWorkspaceId]);

  // Contacts query state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & sorting
  const [selectedTab, setSelectedTab] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string | undefined>();
  const [archiveState, setArchiveState] = useState<'active' | 'archived' | 'all'>('active');
  const [sort, setSort] = useState<ContactSort>({
    field: 'next_follow_up_date',
    direction: 'asc',
  });
  const [page] = useState(0);
  const pageSize = 50;

  // Reference data
  const [companies, setCompanies] = useState<Company[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<
    Array<{ user_id: string; username: string; role: string }>
  >([]);

  // Dialog & drawer states
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [contactToEdit, setContactToEdit] = useState<Contact | null>(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [contactForLog, setContactForLog] = useState<Contact | null>(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [contactForLink, setContactForLink] = useState<Contact | null>(null);

  const showToast = (msg: string, variant: 'success' | 'danger' = 'success') => {
    addToast({ title: msg, type: variant });
  };

  // Load reference data
  const loadReferenceData = useCallback(async (wsId: string) => {
    try {
      const [cos, appsRes, members] = await Promise.all([
        fetchCompanies(wsId),
        fetchApplications(wsId, { archiveState: 'active' }, { field: 'company_name', direction: 'asc' }, 0, 200),
        fetchWorkspaceMembers(wsId),
      ]);
      setCompanies(cos);
      setApplications(appsRes.applications);
      setWorkspaceMembers(members);
    } catch (err) {
      console.error('Failed to load reference data:', err);
    }
  }, []);

  // Fetch contacts
  const loadContacts = useCallback(async () => {
    if (!activeWorkspaceId) {
      setContacts([]);
      setTotalCount(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const isDueOnly = selectedTab === 'FOLLOW_UP_DUE';
      const relType =
        selectedTab !== 'ALL' && selectedTab !== 'FOLLOW_UP_DUE'
          ? (selectedTab as ContactRelationshipType)
          : undefined;

      const result = await fetchContacts(
        activeWorkspaceId,
        {
          relationshipType: relType,
          company: companyFilter || undefined,
          followUpDueOnly: isDueOnly,
          archiveState,
          ownerId: ownerFilter,
          search: search || undefined,
        },
        sort,
        page,
        pageSize
      );

      setContacts(result.contacts);
      setTotalCount(result.totalCount);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load contacts.';
      showToast(msg, 'danger');
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspaceId, selectedTab, companyFilter, ownerFilter, archiveState, search, sort, page, pageSize]);

  // Initial load on workspace change
  useEffect(() => {
    if (activeWorkspaceId) {
      void loadReferenceData(activeWorkspaceId);
      void loadContacts();
    }
  }, [activeWorkspaceId, loadReferenceData, loadContacts]);

  // Refresh selected contact detail if drawer is open
  const refreshSelectedContact = async (contactId: string) => {
    try {
      const updated = await fetchContactDetail(contactId);
      setSelectedContact(updated);
    } catch {
      // Ignore if closed or deleted
    }
  };

  // Category counts computed from contacts
  const counts = useMemo(() => {
    const today = new Date().toISOString().split('T')[0] ?? '';
    const all = totalCount;
    let followUpDue = 0;
    let recruiters = 0;
    let hiringManagers = 0;
    let referrals = 0;
    let interviewers = 0;
    let networking = 0;

    // Approximate counts from loaded contacts for tabs
    for (const c of contacts) {
      if (c.next_follow_up_date && c.next_follow_up_date <= today) followUpDue++;
      if (c.relationship_type === 'RECRUITER') recruiters++;
      else if (c.relationship_type === 'HIRING_MANAGER') hiringManagers++;
      else if (c.relationship_type === 'REFERRAL') referrals++;
      else if (c.relationship_type === 'INTERVIEWER') interviewers++;
      else networking++;
    }

    return {
      all,
      followUpDue,
      recruiters,
      hiringManagers,
      referrals,
      interviewers,
      networking,
    };
  }, [contacts, totalCount]);

  // Handlers
  const handleSelectContact = async (contact: Contact) => {
    try {
      const detail = await fetchContactDetail(contact.id);
      setSelectedContact(detail);
    } catch {
      setSelectedContact(contact);
    }
  };

  const handleCreateOrUpdate = async (data: {
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
  }) => {
    if (!activeWorkspaceId) return;

    if (contactToEdit) {
      await updateContact(contactToEdit.id, {
        full_name: data.full_name,
        relationship_type: data.relationship_type,
        company_name: data.company_name || null,
        job_title: data.job_title || null,
        email: data.email || null,
        phone: data.phone || null,
        linkedin_url: data.linkedin_url || null,
        notes: data.relationship_notes || null,
        next_follow_up_date: data.next_follow_up_date || null,
      });
      showToast(`Updated ${data.full_name}`);
      if (selectedContact?.id === contactToEdit.id) {
        await refreshSelectedContact(contactToEdit.id);
      }
    } else {
      await createContact({
        workspace_id: activeWorkspaceId,
        ...data,
      });
      showToast(`Added contact ${data.full_name}`);
      if (data.company_name) {
        void fetchCompanies(activeWorkspaceId).then(setCompanies);
      }
    }
    setContactToEdit(null);
    void loadContacts();
  };

  const handleArchive = async (contactId: string) => {
    try {
      await archiveContact(contactId);
      showToast('Contact archived');
      if (selectedContact?.id === contactId) {
        setSelectedContact(null);
      }
      void loadContacts();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Archive failed', 'danger');
    }
  };

  const handleRestore = async (contactId: string) => {
    try {
      await restoreContact(contactId);
      showToast('Contact restored');
      if (selectedContact?.id === contactId) {
        await refreshSelectedContact(contactId);
      }
      void loadContacts();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Restore failed', 'danger');
    }
  };

  const handleQuickLogInteraction = async (
    contactId: string,
    type: ContactInteractionType,
    notes: string
  ) => {
    try {
      await logContactInteraction({
        contact_id: contactId,
        interaction_type: type,
        notes,
      });
      showToast('Logged interaction');
      await refreshSelectedContact(contactId);
      void loadContacts();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to log interaction', 'danger');
    }
  };

  const handleLogModalSubmit = async (data: {
    contact_id: string;
    interaction_type: ContactInteractionType;
    interaction_date: string;
    notes?: string;
    next_follow_up_date?: string;
  }) => {
    await logContactInteraction(data);
    showToast('Logged interaction');
    if (selectedContact?.id === data.contact_id) {
      await refreshSelectedContact(data.contact_id);
    }
    void loadContacts();
  };

  const handleLinkApplication = async (
    applicationId: string,
    contactId: string,
    roleInProcess: string
  ) => {
    await linkApplicationContact(applicationId, contactId, roleInProcess);
    showToast('Application linked');
    if (selectedContact?.id === contactId) {
      await refreshSelectedContact(contactId);
    }
    void loadContacts();
  };

  const handleUnlinkApplication = async (applicationId: string, contactId: string) => {
    try {
      await unlinkApplicationContact(applicationId, contactId);
      showToast('Application unlinked');
      if (selectedContact?.id === contactId) {
        await refreshSelectedContact(contactId);
      }
      void loadContacts();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Unlink failed', 'danger');
    }
  };

  const handleUpdateFollowUp = async (contactId: string, nextDate: string | null) => {
    try {
      await updateContact(contactId, { next_follow_up_date: nextDate });
      showToast(nextDate ? 'Follow-up updated' : 'Follow-up completed');
      if (selectedContact?.id === contactId) {
        await refreshSelectedContact(contactId);
      }
      void loadContacts();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to update follow-up', 'danger');
    }
  };

  const handleExport = () => {
    if (contacts.length === 0) {
      showToast('No contacts to export', 'danger');
      return;
    }

    const headers = [
      'Name',
      'Relationship Type',
      'Company',
      'Title',
      'Email',
      'Phone',
      'LinkedIn',
      'Last Contact',
      'Next Follow-Up',
      'Created At',
    ];

    const rows = contacts.map((c) =>
      [
        c.full_name,
        c.relationship_type,
        c.company_name,
        c.job_title,
        c.email,
        c.phone,
        c.linkedin_url,
        c.last_contact_at,
        c.next_follow_up_date,
        c.created_at,
      ].map(csvCell)
    );

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `jobquest-contacts-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${contacts.length} contacts to CSV`);
  };

  return (
    <div
      className="page contacts-page"
      style={{
        gap: '12px',
        padding: '16px 20px 24px 24px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Toolbar */}
      <ContactsToolbar
        search={search}
        onSearchChange={setSearch}
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
        counts={counts}
        companies={companies}
        companyFilter={companyFilter}
        onCompanyFilterChange={setCompanyFilter}
        isManager={isManager}
        ownerFilter={ownerFilter}
        onOwnerFilterChange={setOwnerFilter}
        workspaceMembers={workspaceMembers}
        sort={sort}
        onSortChange={setSort}
        onNewContact={() => {
          setContactToEdit(null);
          setIsCreateModalOpen(true);
        }}
        onExport={handleExport}
        archiveState={archiveState}
        onArchiveStateChange={setArchiveState}
      />

      {/* Main Contacts Table */}
      <ContactsTable
        contacts={contacts}
        totalCount={totalCount}
        isLoading={isLoading}
        selectedContactId={selectedContact?.id || null}
        onSelectContact={handleSelectContact}
        onNewContact={() => {
          setContactToEdit(null);
          setIsCreateModalOpen(true);
        }}
        isManager={isManager}
        page={page}
        pageSize={pageSize}
      />

      {/* Contact Detail Drawer */}
      <ContactDetailDrawer
        isOpen={Boolean(selectedContact)}
        contact={selectedContact}
        onClose={() => setSelectedContact(null)}
        onEdit={(c) => {
          setContactToEdit(c);
          setIsCreateModalOpen(true);
        }}
        onArchive={handleArchive}
        onRestore={handleRestore}
        onLogInteraction={handleQuickLogInteraction}
        onOpenLogModal={(c) => {
          setContactForLog(c);
          setIsLogModalOpen(true);
        }}
        onLinkApplication={(c) => {
          setContactForLink(c);
          setIsLinkModalOpen(true);
        }}
        onUnlinkApplication={handleUnlinkApplication}
        onUpdateFollowUp={handleUpdateFollowUp}
      />

      {/* Create / Edit Contact Modal */}
      <CreateContactModal
        isOpen={isCreateModalOpen}
        contactToEdit={contactToEdit}
        companies={companies}
        applications={applications}
        onClose={() => {
          setIsCreateModalOpen(false);
          setContactToEdit(null);
        }}
        onSubmit={handleCreateOrUpdate}
      />

      {/* Log Interaction Modal */}
      <LogInteractionModal
        isOpen={isLogModalOpen}
        contact={contactForLog}
        onClose={() => {
          setIsLogModalOpen(false);
          setContactForLog(null);
        }}
        onSubmit={handleLogModalSubmit}
      />

      {/* Link Application Modal */}
      <LinkApplicationModal
        isOpen={isLinkModalOpen}
        contact={contactForLink}
        applications={applications}
        onClose={() => {
          setIsLinkModalOpen(false);
          setContactForLink(null);
        }}
        onSubmit={handleLinkApplication}
      />
    </div>
  );
}
