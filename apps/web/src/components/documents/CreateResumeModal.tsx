import { useState, type FormEvent } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Checkbox } from '../ui/Checkbox';
import type { DocumentType } from '../../types/documents';
import { createResume } from '../../api/documents';
import { useToast } from '../../context/ToastContext';

interface CreateResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  onSuccess: () => void;
}

export function CreateResumeModal({ isOpen, onClose, workspaceId, onSuccess }: CreateResumeModalProps) {
  const { addToast } = useToast();
  const [docType, setDocType] = useState<DocumentType>('RESUME');
  const [name, setName] = useState('');
  const [versionLabel, setVersionLabel] = useState('v1');
  const [targetRole, setTargetRole] = useState('');
  const [category, setCategory] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [contentText, setContentText] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a document name');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await createResume({
        workspaceId,
        name: name.trim(),
        documentType: docType,
        versionLabel: versionLabel.trim() || 'v1',
        targetRole: targetRole.trim() || null,
        category: category.trim() || null,
        changeSummary: changeSummary.trim() || null,
        contentText: contentText.trim() || null,
        isDefault,
      });

      addToast({
        title: `${docType === 'RESUME' ? 'Resume' : 'Document'} created`,
        description: `"${name.trim()}" has been saved.`,
        type: 'success',
      });
      onSuccess();
      onClose();
      // Reset form
      setName('');
      setVersionLabel('v1');
      setTargetRole('');
      setCategory('');
      setChangeSummary('');
      setContentText('');
      setIsDefault(false);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to create document');
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
      <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
        Cancel
      </Button>
      <Button type="button" variant="primary" onClick={handleSubmit} disabled={loading}>
        {loading ? 'Creating...' : 'Create Version'}
      </Button>
    </div>
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="New Document Version"
      footer={footer}
      maxWidth={520}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {error && (
          <div role="alert" style={{ padding: '8px 12px', background: 'var(--color-danger-soft, #fef2f2)', color: 'var(--color-danger, #dc2626)', borderRadius: 'var(--radius-sm)', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label htmlFor="create-doc-type" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
              Document Type *
            </label>
            <Select
              id="create-doc-type"
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocumentType)}
            >
              <option value="RESUME">Resume</option>
              <option value="COVER_LETTER">Cover Letter</option>
            </Select>
          </div>

          <div>
            <label htmlFor="create-doc-version" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
              Version Label *
            </label>
            <Input
              id="create-doc-version"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder="e.g. v1, v2.1, 2026-Q1"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="create-doc-name" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
            Title / Name *
          </label>
          <Input
            id="create-doc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Product Designer - Enterprise SaaS"
            required
            autoFocus
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label htmlFor="create-doc-role" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
              Target Role
            </label>
            <Input
              id="create-doc-role"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. Senior Product Designer"
            />
          </div>

          <div>
            <label htmlFor="create-doc-cat" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
              Category
            </label>
            <Input
              id="create-doc-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Design Systems, FinTech"
            />
          </div>
        </div>

        <div>
          <label htmlFor="create-doc-summary" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
            Change Summary / Notes
          </label>
          <Input
            id="create-doc-summary"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            placeholder="e.g. Leads with leadership impact; trimmed legacy roles"
          />
        </div>

        <div>
          <label htmlFor="create-doc-content" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
            Content / Plaintext Notes
          </label>
          <Textarea
            id="create-doc-content"
            value={contentText}
            onChange={(e) => setContentText(e.target.value)}
            placeholder="Paste key bullets, tailored elevator pitch, or portfolio URLs..."
            rows={4}
          />
        </div>

        <div style={{ marginTop: '2px' }}>
          <Checkbox
            id="create-doc-default"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            label={`Set as default ${docType === 'RESUME' ? 'resume' : 'variant'} for new applications`}
          />
        </div>
      </form>
    </Dialog>
  );
}
