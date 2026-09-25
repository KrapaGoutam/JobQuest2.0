import { useCallback, useEffect, useState } from 'react';
import { Plus, FileText, Mail, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Select } from '../ui/Select';
import {
  fetchApplicationDocuments,
  fetchResumes,
  linkApplicationDocument,
  unlinkApplicationDocument,
} from '../../api/documents';
import type { ApplicationDocumentRecord, ResumeRecord } from '../../types/documents';
import type { Application } from '../../types/applications';
import { useToast } from '../../context/ToastContext';

interface ApplicationDocumentsSectionProps {
  application: Application;
  version: number;
  onChanged?: () => void;
}

export function ApplicationDocumentsSection({
  application,
  version,
  onChanged,
}: ApplicationDocumentsSectionProps) {
  const { addToast } = useToast();
  const [docs, setDocs] = useState<ApplicationDocumentRecord[] | null>(null);
  const [availableResumes, setAvailableResumes] = useState<ResumeRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Link dialog
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('RESUME');
  const [linking, setLinking] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [appDocs, allResumes] = await Promise.all([
        fetchApplicationDocuments(application.id),
        fetchResumes(application.workspace_id, { includeArchived: false }),
      ]);
      setDocs(appDocs);
      setAvailableResumes(allResumes);
      if (allResumes.length > 0 && !selectedResumeId) {
        const defaultDoc = allResumes.find((r) => r.is_default) || allResumes[0];
        if (defaultDoc) setSelectedResumeId(defaultDoc.id);
      }
    } catch (err: unknown) {
      setDocs([]);
      setError((err as Error).message);
    }
  }, [application.id, application.workspace_id, selectedResumeId]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const handleLink = async () => {
    if (!selectedResumeId) return;
    setLinking(true);
    try {
      await linkApplicationDocument({
        applicationId: application.id,
        resumeId: selectedResumeId,
        documentType: selectedType,
      });

      addToast({
        title: 'Document linked',
        description: 'Linked document version to this application.',
        type: 'success',
      });
      setIsLinkOpen(false);
      await load();
      onChanged?.();
    } catch (err: unknown) {
      addToast({
        title: 'Could not link document',
        description: (err as Error).message,
        type: 'danger',
      });
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (docLinkId: string, docName: string) => {
    try {
      await unlinkApplicationDocument(docLinkId);

      addToast({
        title: 'Document unlinked',
        description: `Unlinked "${docName}" from this application.`,
        type: 'info',
      });
      await load();
      onChanged?.();
    } catch (err: unknown) {
      addToast({
        title: 'Could not unlink document',
        description: (err as Error).message,
        type: 'danger',
      });
    }
  };

  const linkDialogFooter = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
      <Button variant="outline" size="sm" onClick={() => setIsLinkOpen(false)}>
        Cancel
      </Button>
      <Button variant="primary" size="sm" onClick={handleLink} disabled={linking || !selectedResumeId}>
        {linking ? 'Linking...' : 'Attach to Application'}
      </Button>
    </div>
  );

  return (
    <section
      aria-labelledby={`app-docs-${application.id}`}
      data-testid="application-documents"
      style={{
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3
          id={`app-docs-${application.id}`}
          style={{
            margin: 0,
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Documents {docs ? `· ${docs.length}` : ''}
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setIsLinkOpen(true)}
          disabled={availableResumes.length === 0}
          style={{ height: '26px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          <Plus size={12} />
          <span>Attach</span>
        </Button>
      </div>

      {error && (
        <div role="alert" style={{ fontSize: '12px', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      {docs === null ? (
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Loading documents…</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', padding: '6px 0' }}>
          No resumes or documents attached to this application.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {docs.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                {item.resume?.document_type === 'COVER_LETTER' ? (
                  <Mail size={14} style={{ color: 'var(--color-brand-primary)' }} />
                ) : (
                  <FileText size={14} style={{ color: 'var(--color-brand-primary)' }} />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.resume?.name || 'Attached Document'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    {item.document_type}
                    {item.resume?.version_label ? ` · ${item.resume.version_label}` : ''}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleUnlink(item.id, item.resume?.name || 'document')}
                title="Unlink document"
                style={{
                  padding: '4px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Link Dialog */}
      <Dialog
        isOpen={isLinkOpen}
        onClose={() => setIsLinkOpen(false)}
        title="Attach Document"
        footer={linkDialogFooter}
        maxWidth={440}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label htmlFor="attach-doc-select" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
              Select Document / Resume
            </label>
            <Select
              id="attach-doc-select"
              value={selectedResumeId}
              onChange={(e) => setSelectedResumeId(e.target.value)}
            >
              {availableResumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.version_label}) {r.is_default ? '★ Default' : ''}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="attach-role-select" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
              Document Type
            </label>
            <Select
              id="attach-role-select"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="RESUME">Primary Resume</option>
              <option value="COVER_LETTER">Cover Letter</option>
              <option value="PORTFOLIO">Portfolio / Work Sample</option>
              <option value="TRANSCRIPT">Transcript</option>
              <option value="OTHER">Other Attachment</option>
            </Select>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
