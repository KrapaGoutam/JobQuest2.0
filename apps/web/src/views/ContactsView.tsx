import { completeContactFollowUp, setContactFollowUp } from '../api/tasks';
import { useState, useEffect, useCallback, useRef } from 'react';
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
  fetchContactFacetCounts,
  type ContactFacetCounts,
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
import { Button } from '../components/ui/Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
export interface ContactsViewProps {
  activeWorkspaceId?: string | null;
  isManager?: boolean;
  initialContactId?: string | null;
  onDeepLinkClose?: () => void;
  onDeepLinkMissing?: () => void;
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
  initialContactId = null,
  onDeepLinkClose,
  onDeepLinkMissing,
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
  // The list query follows the search box 250 ms after the last keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  const [companyFilter, setCompanyFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string | undefined>();
  const [archiveState, setArchiveState] = useState<'active' | 'archived' | 'all'>('active');
  const [sort, setSort] = useState<ContactSort>({
    field: 'next_follow_up_date',
    direction: 'asc',
  });
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [counts, setCounts] = useState<ContactFacetCounts>({ all: 0, followUpDue: 0, recruiters: 0, hiringManagers: 0, referrals: 0, interviewers: 0, networking: 0 });

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
  const handledDeepLink = useRef<string | null>(null);

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

  // Fetch contacts. Only the latest request may update the list: with network latency,
  // responses to earlier keystrokes/filters can arrive after newer ones.
  const requestSeq = useRef(0);
  const loadContacts = useCallback(async () => {
    const seq = ++requestSeq.current;
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

      const baseFilters = {
        company: companyFilter || undefined,
        archiveState,
        ownerId: ownerFilter,
        search: debouncedSearch || undefined,
      } as const;
      const [result, facetCounts] = await Promise.all([
        fetchContacts(activeWorkspaceId, {
          relationshipType: relType,
          followUpDueOnly: isDueOnly,
          ...baseFilters,
        }, sort, page, pageSize),
        fetchContactFacetCounts(activeWorkspaceId, baseFilters),
      ]);

      if (seq !== requestSeq.current) return;
      setContacts(result.contacts);
      setTotalCount(result.totalCount);
      setCounts(facetCounts);
    } catch (err: unknown) {
      if (seq !== requestSeq.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to load contacts.';
      showToast(msg, 'danger');
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [activeWorkspaceId, selectedTab, companyFilter, ownerFilter, archiveState, debouncedSearch, sort, page, pageSize]);

  useEffect(() => {
    setPage(0);
  }, [activeWorkspaceId, selectedTab, companyFilter, ownerFilter, archiveState, debouncedSearch, sort]);

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

  useEffect(() => {
    if (!initialContactId || !activeWorkspaceId || handledDeepLink.current === initialContactId) return;
    handledDeepLink.current = initialContactId;
    fetchContactDetail(initialContactId)
      .then((contact) => {
        if (contact.workspace_id !== activeWorkspaceId) throw new Error('Contact is not in this workspace.');
        setSelectedContact(contact);
      })
      .catch(() => {
        addToast({ title: 'Contact unavailable', description: 'This contact was removed or is not available in your workspace.', type: 'warning' });
        onDeepLinkMissing?.();
      });
  }, [initialContactId, activeWorkspaceId, addToast, onDeepLinkMissing]);

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
      // M6: follow-ups are canonical tasks; the contact date is their projection.
      if (nextDate) await setContactFollowUp(contactId, nextDate);
      else await completeContactFollowUp(contactId);
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
      {totalCount > pageSize && (
        <nav aria-label="Contacts pages" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
          <Button size="sm" variant="outline" disabled={page === 0 || isLoading} onClick={() => setPage((current) => Math.max(0, current - 1))} aria-label="Previous contacts page">
            <ChevronLeft size={14} aria-hidden="true" />
          </Button>
          <span className="small muted" aria-live="polite">Page {page + 1} of {Math.ceil(totalCount / pageSize)}</span>
          <Button size="sm" variant="outline" disabled={(page + 1) * pageSize >= totalCount || isLoading} onClick={() => setPage((current) => current + 1)} aria-label="Next contacts page">
            <ChevronRight size={14} aria-hidden="true" />
          </Button>
        </nav>
      )}

      {/* Contact Detail Drawer */}
      <ContactDetailDrawer
        isOpen={Boolean(selectedContact)}
        contact={selectedContact}
        onClose={() => {
          setSelectedContact(null);
          if (initialContactId) onDeepLinkClose?.();
        }}
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
