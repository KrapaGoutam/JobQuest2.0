import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Plus,
  Pin,
  PinOff,
  Trash2,
  Edit3,
  Search,
  Building,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../context/ToastContext';
import {
  fetchJournalEntries,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  type JournalEntry,
} from '../api/journal';
import { supabase } from '../supabase';

export interface JournalViewProps {
  activeWorkspaceId: string | null;
  isManager: boolean;
  currentUserId?: string | null;
  onNavigateToApp?: (applicationId: string) => void;
}

interface ApplicationOption {
  id: string;
  company_name: string;
  role_title: string;
}

const ENTRY_TYPES = [
  { value: 'NOTE', label: 'General Note' },
  { value: 'REFLECTION', label: 'Reflection' },
  { value: 'STRATEGY', label: 'Strategy' },
  { value: 'INTERVIEW_PREP', label: 'Interview Prep' },
  { value: 'POST_MORTEM', label: 'Post-Mortem' },
] as const;

export function JournalView({
  activeWorkspaceId,
  isManager,
  onNavigateToApp,
}: JournalViewProps) {
  const { addToast } = useToast();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [pinnedFilter, setPinnedFilter] = useState(false);

  // Application lookup for linking
  const [applications, setApplications] = useState<ApplicationOption[]>([]);

  // Dialog state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form fields
  const [formType, setFormType] = useState<JournalEntry['entry_type']>('NOTE');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formAppId, setFormAppId] = useState<string>('');
  const [formPinned, setFormPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadEntries = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJournalEntries(activeWorkspaceId, {
        entryType: typeFilter || undefined,
        searchQuery: searchQuery || undefined,
        pinnedOnly: pinnedFilter || undefined,
      });
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load journal entries');
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, typeFilter, searchQuery, pinnedFilter]);

  // Load applications for linking combobox
  useEffect(() => {
    if (!activeWorkspaceId) return;
    void (async () => {
      const { data } = await supabase
        .from('applications')
        .select('id, company_name, role_title')
        .eq('workspace_id', activeWorkspaceId)
        .is('archived_at', null)
        .order('company_name');
      if (data) {
        setApplications(data as ApplicationOption[]);
      }
    })();
  }, [activeWorkspaceId]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const openCreateModal = () => {
    setEditingEntry(null);
    setFormType('NOTE');
    setFormTitle('');
    setFormContent('');
    setFormAppId('');
    setFormPinned(false);
    setIsEditorOpen(true);
  };

  const openEditModal = (entry: JournalEntry) => {
    setEditingEntry(entry);
    setFormType(entry.entry_type);
    setFormTitle(entry.title || '');
    setFormContent(entry.content);
    setFormAppId(entry.application_id || '');
    setFormPinned(entry.is_pinned);
    setIsEditorOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspaceId) return;
    if (!formContent.trim()) {
      addToast({ title: 'Entry content is required', type: 'danger' });
      return;
    }

    setSaving(true);
    try {
      if (editingEntry) {
        await updateJournalEntry(editingEntry.id, {
          title: formTitle.trim() || null,
          content: formContent.trim(),
          entry_type: formType,
          application_id: formAppId || null,
          is_pinned: formPinned,
        });
        addToast({ title: 'Journal entry updated', type: 'success' });
      } else {
        await createJournalEntry(activeWorkspaceId, {
          title: formTitle.trim() || null,
          content: formContent.trim(),
          entry_type: formType,
          application_id: formAppId || null,
          is_pinned: formPinned,
        });
        addToast({ title: 'Journal entry created', type: 'success' });
      }
      setIsEditorOpen(false);
      void loadEntries();
    } catch (err) {
      addToast({ title: 'Failed to save entry', description: err instanceof Error ? err.message : '', type: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePin = async (entry: JournalEntry) => {
    try {
      await updateJournalEntry(entry.id, {
        title: entry.title,
        content: entry.content,
        entry_type: entry.entry_type,
        application_id: entry.application_id,
        is_pinned: !entry.is_pinned,
      });
      addToast({ title: entry.is_pinned ? 'Entry unpinned' : 'Entry pinned to top', type: 'success' });
      void loadEntries();
    } catch (err) {
      addToast({ title: 'Failed to update pin', description: err instanceof Error ? err.message : '', type: 'danger' });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteJournalEntry(deleteConfirmId);
      addToast({ title: 'Entry deleted', type: 'success' });
      setDeleteConfirmId(null);
      void loadEntries();
    } catch (err) {
      addToast({ title: 'Failed to delete entry', description: err instanceof Error ? err.message : '', type: 'danger' });
    }
  };

  const getBadgeClass = (type: JournalEntry['entry_type']) => {
    switch (type) {
      case 'REFLECTION':
        return 'pill primary';
      case 'STRATEGY':
        return 'pill success';
      case 'INTERVIEW_PREP':
        return 'pill warning';
      case 'POST_MORTEM':
        return 'pill error';
      default:
        return 'pill muted';
    }
  };

  const formatTypeLabel = (type: string) => {
    const found = ENTRY_TYPES.find((t) => t.value === type);
    return found ? found.label : type;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--color-text-strong)' }}>
              Job Search Journal
            </h1>
            {isManager && (
              <span className="pill muted" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                <Shield size={11} color="var(--color-success)" /> Workspace coaching view
              </span>
            )}
          </div>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '14px' }}>
            Structured reflections, career coaching notes, and interview prep
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="secondary" onClick={() => void loadEntries()} leftIcon={<RefreshCw size={14} />}>
            Refresh
          </Button>
          <Button variant="primary" onClick={openCreateModal} leftIcon={<Plus size={16} />}>
            New Entry
          </Button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div
        className="card"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          padding: '12px 16px',
        }}
      >
        <div style={{ flex: '1 1 240px', minWidth: '200px' }}>
          <Input
            placeholder="Search entries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search size={15} />}
          />
        </div>
        <div style={{ width: '180px' }}>
          <Select
            aria-label="Filter by entry type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[
              { value: '', label: 'All Entry Types' },
              ...ENTRY_TYPES.map((t) => ({ value: t.value, label: t.label })),
            ]}
          />
        </div>
        <div>
          <Button
            variant={pinnedFilter ? 'primary' : 'secondary'}
            onClick={() => setPinnedFilter((prev) => !prev)}
            leftIcon={<Pin size={14} />}
          >
            Pinned Only
          </Button>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Loading entries...
        </div>
      ) : error ? (
        <div className="card" style={{ padding: '24px', color: 'var(--color-error)' }}>
          Failed to load journal: {error}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={48} />}
          title="No journal entries yet"
          description={
            searchQuery || typeFilter || pinnedFilter
              ? 'No entries match your search criteria.'
              : 'Record your search strategy, prep for interviews, or capture daily reflections.'
          }
          action={
            <Button variant="primary" onClick={openCreateModal} leftIcon={<Plus size={16} />}>
              Create First Entry
            </Button>
          }
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '16px',
                position: 'relative',
                borderTop: entry.is_pinned ? '3px solid var(--color-accent)' : undefined,
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className={getBadgeClass(entry.entry_type)}>
                    {formatTypeLabel(entry.entry_type)}
                  </span>
                  {entry.is_pinned && (
                    <span style={{ fontSize: '11px', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                      <Pin size={12} /> Pinned
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => void handleTogglePin(entry)}
                    title={entry.is_pinned ? 'Unpin' : 'Pin to top'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--color-text-muted)' }}
                    aria-label={entry.is_pinned ? 'Unpin entry' : 'Pin entry'}
                  >
                    {entry.is_pinned ? <PinOff size={15} /> : <Pin size={15} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(entry)}
                    title="Edit entry"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--color-text-muted)' }}
                    aria-label="Edit entry"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(entry.id)}
                    title="Delete entry"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--color-error)' }}
                    aria-label="Delete entry"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Title */}
              {entry.title && (
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--color-text-strong)' }}>
                  {entry.title}
                </h3>
              )}

              {/* Linked Application card (if linked) */}
              {entry.applications && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    background: 'var(--color-surface-2)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    cursor: onNavigateToApp ? 'pointer' : 'default',
                  }}
                  onClick={() => onNavigateToApp && entry.application_id && onNavigateToApp(entry.application_id)}
                >
                  <Building size={14} style={{ color: 'var(--color-text-muted)' }} />
                  <span style={{ fontWeight: 600, color: 'var(--color-text-strong)' }}>
                    {entry.applications.company_name}
                  </span>
                  <span style={{ color: 'var(--color-text-muted)' }}>·</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {entry.applications.role_title}
                  </span>
                </div>
              )}

              {/* Content reading view - preserved whitespace, safe against XSS */}
              <div
                style={{
                  fontSize: '13px',
                  lineHeight: '1.6',
                  color: 'var(--color-text-body)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  flex: 1,
                  maxHeight: '260px',
                  overflowY: 'auto',
                }}
              >
                {entry.content}
              </div>

              {/* Timestamp */}
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)', paddingTop: '8px', marginTop: 'auto' }}>
                {new Date(entry.created_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Entry Modal (J2) */}
      <Dialog
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        title={editingEntry ? 'Edit Journal Entry' : 'New Journal Entry'}
        maxWidth={620}
      >
        <form onSubmit={(e) => void handleSave(e)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label htmlFor="journal-form-type" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Entry Type *
              </label>
              <Select
                id="journal-form-type"
                aria-label="Entry Type"
                value={formType}
                onChange={(e) => setFormType(e.target.value as JournalEntry['entry_type'])}
                options={ENTRY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              />
            </div>
            <div>
              <label htmlFor="journal-form-app" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Linked Application (Optional)
              </label>
              <Select
                id="journal-form-app"
                aria-label="Linked Application"
                value={formAppId}
                onChange={(e) => setFormAppId(e.target.value)}
                options={[
                  { value: '', label: 'None (Standalone Note)' },
                  ...applications.map((a) => ({
                    value: a.id,
                    label: `${a.company_name} — ${a.role_title}`,
                  })),
                ]}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Title
            </label>
            <Input
              placeholder="e.g. System Design Interview Debrief, Week 3 Search Reflection..."
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Content *
            </label>
            <textarea
              required
              rows={8}
              placeholder="Write your reflection, notes, or interview observations here..."
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              className="input-base"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '13px',
                lineHeight: '1.5',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-1)',
                color: 'var(--color-text-strong)',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="journal-pin-checkbox"
              checked={formPinned}
              onChange={(e) => setFormPinned(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="journal-pin-checkbox" style={{ fontSize: '13px', cursor: 'pointer', userSelect: 'none' }}>
              Pin this entry to the top of your journal
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button type="button" variant="secondary" onClick={() => setIsEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving...' : editingEntry ? 'Save Changes' : 'Create Entry'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        isOpen={Boolean(deleteConfirmId)}
        onClose={() => setDeleteConfirmId(null)}
        title="Delete Journal Entry"
        maxWidth={440}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-body)' }}>
            Are you sure you want to delete this journal entry? This action cannot be undone.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleDelete()}>
              Delete Entry
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
