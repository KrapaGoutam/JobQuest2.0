import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { CreateResumeModal } from '../components/documents/CreateResumeModal';
import { CloneResumeModal } from '../components/documents/CloneResumeModal';
import { ResumeCompareView } from '../components/documents/ResumeCompareView';
import {
  FileText,
  Mail,
  Plus,
  GitCompare,
  CopyPlus,
  MoreVertical,
  Archive,
  Undo2,
  Trash2,
  CheckCircle2,
  Info,
  Search,
} from 'lucide-react';
import {
  type ResumeRecord,
  type DocumentType,
  formatResumeRate,
} from '../types/documents';
import {
  fetchResumes,
  setDefaultResume,
  archiveResume,
  restoreResume,
  deleteResume,
} from '../api/documents';
import { useToast } from '../context/ToastContext';

interface ResumesViewProps {
  activeWorkspaceId: string | null;
  isManager?: boolean;
}

export function ResumesView({ activeWorkspaceId }: ResumesViewProps) {
  const { addToast } = useToast();
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Tabs
  const [tab, setTab] = useState<'ALL' | 'RESUME' | 'COVER_LETTER' | 'ARCHIVED'>('ALL');
  const [search, setSearch] = useState('');

  // Modals & Subviews
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [cloneSource, setCloneSource] = useState<ResumeRecord | null>(null);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!activeWorkspaceId) {
      setResumes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchResumes(activeWorkspaceId, { includeArchived: true });
      setResumes(data);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Derived counts
  const resumeCount = useMemo(() => resumes.filter((r) => r.document_type === 'RESUME' && !r.archived_at).length, [resumes]);
  const coverCount = useMemo(() => resumes.filter((r) => r.document_type === 'COVER_LETTER' && !r.archived_at).length, [resumes]);
  const archivedCount = useMemo(() => resumes.filter((r) => !!r.archived_at).length, [resumes]);

  // Filtered list
  const filteredResumes = useMemo(() => {
    return resumes.filter((r) => {
      // Tab filter
      if (tab === 'ARCHIVED') {
        if (!r.archived_at) return false;
      } else {
        if (r.archived_at) return false;
        if (tab === 'RESUME' && r.document_type !== 'RESUME') return false;
        if (tab === 'COVER_LETTER' && r.document_type !== 'COVER_LETTER') return false;
      }

      // Search filter
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchName = r.name.toLowerCase().includes(query);
        const matchRole = (r.target_role || '').toLowerCase().includes(query);
        const matchCat = (r.category || '').toLowerCase().includes(query);
        const matchVer = r.version_label.toLowerCase().includes(query);
        if (!matchName && !matchRole && !matchCat && !matchVer) return false;
      }

      return true;
    });
  }, [resumes, tab, search]);

  const handleSetDefault = async (resume: ResumeRecord) => {
    try {
      await setDefaultResume(resume.id);
      addToast({
        title: 'Default variant updated',
        description: `"${resume.name}" is now the default ${resume.document_type === 'RESUME' ? 'resume' : 'variant'}.`,
        type: 'success',
      });
      await loadData();
    } catch (err: unknown) {
      addToast({
        title: 'Could not set default',
        description: (err as Error).message,
        type: 'danger',
      });
    } finally {
      setOpenMenuId(null);
    }
  };

  const handleArchive = async (resume: ResumeRecord) => {
    try {
      await archiveResume(resume.id);
      addToast({
        title: 'Document archived',
        description: `"${resume.name}" moved to archive.`,
        type: 'info',
      });
      await loadData();
    } catch (err: unknown) {
      addToast({
        title: 'Could not archive document',
        description: (err as Error).message,
        type: 'danger',
      });
    } finally {
      setOpenMenuId(null);
    }
  };

  const handleRestore = async (resume: ResumeRecord) => {
    try {
      await restoreResume(resume.id);
      addToast({
        title: 'Document restored',
        description: `"${resume.name}" restored from archive.`,
        type: 'success',
      });
      await loadData();
    } catch (err: unknown) {
      addToast({
        title: 'Could not restore document',
        description: (err as Error).message,
        type: 'danger',
      });
    } finally {
      setOpenMenuId(null);
    }
  };

  const handleDelete = async (resume: ResumeRecord) => {
    const used = resume.used_count ?? 0;
    if (used > 0) {
      addToast({
        title: 'Cannot delete document in use',
        description: `"${resume.name}" is referenced by ${used} application(s). Archive it instead.`,
        type: 'warning',
      });
      setOpenMenuId(null);
      return;
    }

    if (!window.confirm(`Permanently delete "${resume.name}"? This action cannot be undone.`)) {
      setOpenMenuId(null);
      return;
    }

    try {
      await deleteResume(resume.id);
      addToast({
        title: 'Document deleted',
        description: `"${resume.name}" has been removed.`,
        type: 'info',
      });
      await loadData();
    } catch (err: unknown) {
      addToast({
        title: 'Delete rejected',
        description: (err as Error).message,
        type: 'danger',
      });
    } finally {
      setOpenMenuId(null);
    }
  };

  const getDocIcon = (type: DocumentType) => {
    if (type === 'COVER_LETTER') {
      return <Mail size={16} style={{ color: 'var(--color-brand-primary, #6366f1)' }} />;
    }
    return <FileText size={16} style={{ color: 'var(--color-brand-primary, #6366f1)' }} />;
  };

  const renderRateBadge = (n?: number, d?: number) => {
    if (n === undefined || d === undefined || d === 0) return <span style={{ color: 'var(--color-text-muted)' }}>0/0</span>;
    const formatted = formatResumeRate(n, d);
    if (formatted.isTooFew) {
      return (
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
          {formatted.ratioText} · <i>{formatted.percentText}</i>
        </span>
      );
    }
    return (
      <span style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
        <strong>{n}</strong>/{d}{' '}
        <span style={{ color: 'var(--color-text-secondary)', fontSize: '11px' }}>
          {formatted.percentText}
        </span>
      </span>
    );
  };

  if (isCompareOpen) {
    return (
      <ResumeCompareView
        resumes={resumes.filter((r) => !r.archived_at)}
        onBack={() => setIsCompareOpen(false)}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Resumes</h1>
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              {resumeCount} resumes · {coverCount} cover letters{archivedCount > 0 ? ` · ${archivedCount} archived` : ''}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCompareOpen(true)}
            disabled={resumes.length < 2}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <GitCompare size={14} />
            <span>Compare</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={14} />
            <span>New Version</span>
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-secondary)',
          fontSize: '12px',
        }}
      >
        <Info size={16} style={{ flexShrink: 0 }} />
        <span>
          Versions are tracked as names and notes. File upload isn't available yet; the design keeps a slot for it.
        </span>
      </div>

      {/* Tabs & Search Filter Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', borderBottom: '1px solid var(--color-border)', width: '100%', maxWidth: '480px' }}>
          <button
            type="button"
            onClick={() => setTab('ALL')}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: tab === 'ALL' ? 600 : 400,
              color: tab === 'ALL' ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
              borderBottom: tab === 'ALL' ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
            }}
          >
            All active ({resumeCount + coverCount})
          </button>
          <button
            type="button"
            onClick={() => setTab('RESUME')}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: tab === 'RESUME' ? 600 : 400,
              color: tab === 'RESUME' ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
              borderBottom: tab === 'RESUME' ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
            }}
          >
            Resumes ({resumeCount})
          </button>
          <button
            type="button"
            onClick={() => setTab('COVER_LETTER')}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: tab === 'COVER_LETTER' ? 600 : 400,
              color: tab === 'COVER_LETTER' ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
              borderBottom: tab === 'COVER_LETTER' ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
            }}
          >
            Cover letters ({coverCount})
          </button>
          <button
            type="button"
            onClick={() => setTab('ARCHIVED')}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: tab === 'ARCHIVED' ? 600 : 400,
              color: tab === 'ARCHIVED' ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
              borderBottom: tab === 'ARCHIVED' ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
            }}
          >
            Archived ({archivedCount})
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: '220px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--color-text-muted)' }} />
          <Input
            id="resumes-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter versions..."
            style={{ paddingLeft: '32px', height: '34px', fontSize: '13px' }}
          />
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
          Loading document versions...
        </div>
      ) : error ? (
        <div role="alert" style={{ padding: '16px', color: 'var(--color-danger)', fontSize: '13px', background: 'var(--color-danger-soft)', borderRadius: 'var(--radius-md)' }}>
          {error}
        </div>
      ) : filteredResumes.length === 0 ? (
        <div style={{ padding: '48px 16px', textAlign: 'center', background: 'var(--color-surface-1)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <FileText size={32} style={{ color: 'var(--color-text-muted)', marginBottom: '8px' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '4px 0' }}>No versions found</h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '4px 0 16px' }}>
            {search ? 'Try adjusting your search criteria.' : 'Create your first resume or cover letter variant to track performance.'}
          </p>
          {!search && (
            <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus size={14} style={{ marginRight: '6px' }} />
              Create Document Version
            </Button>
          )}
        </div>
      ) : (
        <div
          style={{
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            background: 'var(--color-surface-1)',
          }}
        >
          {/* Table Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.8fr 110px 130px 70px 1fr 1fr 90px 110px',
              padding: '10px 16px',
              background: 'var(--color-surface-2)',
              borderBottom: '1px solid var(--color-border)',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
            }}
          >
            <div>Version</div>
            <div>Type</div>
            <div>Status</div>
            <div>Used</div>
            <div>Response rate</div>
            <div>Reached interview</div>
            <div>Updated</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {/* Table Body */}
          <div>
            {filteredResumes.map((doc) => {
              const isRevision = !!doc.base_resume_id;
              const isArchived = !!doc.archived_at;
              const usedCount = doc.used_count ?? 0;

              return (
                <div
                  key={doc.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.8fr 110px 130px 70px 1fr 1fr 90px 110px',
                    padding: '10px 16px',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--color-border)',
                    fontSize: '13px',
                    opacity: isArchived ? 0.65 : 1,
                    position: 'relative',
                  }}
                >
                  {/* Version & Title */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: isRevision ? '20px' : 0 }}>
                    {isRevision && <span style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>↳</span>}
                    {getDocIcon(doc.document_type)}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        {doc.version_label}{doc.target_role ? ` · ${doc.target_role}` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Type */}
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    {doc.document_type === 'RESUME' ? 'Resume' : 'Cover Letter'}
                  </div>

                  {/* Status */}
                  <div>
                    {doc.is_default ? (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: 'var(--color-brand-primary-soft, #e0e7ff)',
                          color: 'var(--color-brand-primary, #4338ca)',
                        }}
                      >
                        Default
                      </span>
                    ) : isArchived ? (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: 'var(--color-surface-2)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        Archived
                      </span>
                    ) : isRevision ? (
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        Revision
                      </span>
                    ) : null}
                  </div>

                  {/* Used */}
                  <div style={{ fontSize: '12px', color: 'var(--color-text-primary)' }}>
                    {usedCount}
                  </div>

                  {/* Response rate */}
                  <div>
                    {renderRateBadge(doc.responses_count, doc.used_count)}
                  </div>

                  {/* Reached interview */}
                  <div>
                    {renderRateBadge(doc.interviews_count, doc.used_count)}
                  </div>

                  {/* Updated */}
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    {new Date(doc.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', position: 'relative' }}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCloneSource(doc)}
                      title="Clone this version to create a new revision"
                      style={{ padding: '4px 8px', height: '28px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <CopyPlus size={13} />
                      <span>Clone</span>
                    </Button>

                    <button
                      type="button"
                      aria-label="More actions"
                      onClick={() => setOpenMenuId(openMenuId === doc.id ? null : doc.id)}
                      style={{
                        padding: '4px',
                        background: 'transparent',
                        border: '1px solid transparent',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      <MoreVertical size={16} />
                    </button>

                    {/* Dropdown Menu */}
                    {openMenuId === doc.id && (
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: '32px',
                          background: 'var(--color-surface-1)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-md)',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          zIndex: 50,
                          minWidth: '160px',
                          display: 'flex',
                          flexDirection: 'column',
                          padding: '4px',
                        }}
                      >
                        {!doc.is_default && !isArchived && (
                          <button
                            type="button"
                            onClick={() => handleSetDefault(doc)}
                            style={{
                              padding: '6px 10px',
                              textAlign: 'left',
                              background: 'transparent',
                              border: 'none',
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: 'var(--color-text-primary)',
                            }}
                          >
                            <CheckCircle2 size={13} />
                            Set as Default
                          </button>
                        )}

                        {!isArchived ? (
                          <button
                            type="button"
                            onClick={() => handleArchive(doc)}
                            style={{
                              padding: '6px 10px',
                              textAlign: 'left',
                              background: 'transparent',
                              border: 'none',
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: 'var(--color-text-primary)',
                            }}
                          >
                            <Archive size={13} />
                            Archive
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRestore(doc)}
                            style={{
                              padding: '6px 10px',
                              textAlign: 'left',
                              background: 'transparent',
                              border: 'none',
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: 'var(--color-text-primary)',
                            }}
                          >
                            <Undo2 size={13} />
                            Restore
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDelete(doc)}
                          style={{
                            padding: '6px 10px',
                            textAlign: 'left',
                            background: 'transparent',
                            border: 'none',
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: 'var(--color-danger, #dc2626)',
                          }}
                        >
                          <Trash2 size={13} />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer Guidance Note */}
      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
        A version can't be deleted while applications use it; archive it instead. Rates count applications that <strong>ever reached</strong> each step.
      </div>

      {/* Modals */}
      {activeWorkspaceId && (
        <>
          <CreateResumeModal
            isOpen={isCreateOpen}
            onClose={() => setIsCreateOpen(false)}
            workspaceId={activeWorkspaceId}
            onSuccess={loadData}
          />

          <CloneResumeModal
            isOpen={!!cloneSource}
            onClose={() => setCloneSource(null)}
            sourceResume={cloneSource}
            onSuccess={loadData}
          />
        </>
      )}
    </div>
  );
}
