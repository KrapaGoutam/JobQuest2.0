import { useState, useEffect, type FormEvent } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import type { ResumeRecord } from '../../types/documents';
import { cloneResume } from '../../api/documents';
import { useToast } from '../../context/ToastContext';

interface CloneResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceResume: ResumeRecord | null;
  onSuccess: () => void;
}

export function CloneResumeModal({ isOpen, onClose, sourceResume, onSuccess }: CloneResumeModalProps) {
  const { addToast } = useToast();
  const [name, setName] = useState('');
  const [versionLabel, setVersionLabel] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sourceResume) {
      setName(sourceResume.name ? `${sourceResume.name} (Clone)` : '');
      setVersionLabel(`rev-${sourceResume.version_label}`);
      setChangeSummary('');
      setError(null);
    }
  }, [sourceResume]);

  if (!sourceResume) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a document name');
      return;
    }
    if (!versionLabel.trim()) {
      setError('Please provide a version label');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await cloneResume({
        resumeId: sourceResume.id,
        newName: name.trim(),
        newVersionLabel: versionLabel.trim(),
        changeSummary: changeSummary.trim() || undefined,
      });

      addToast({
        title: 'New Version Created',
        description: `Created revision "${name.trim()}" linked to parent version.`,
        type: 'success',
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to clone document');
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
        {loading ? 'Cloning...' : 'Save Revision'}
      </Button>
    </div>
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Clone / Create Revision"
      footer={footer}
      maxWidth={520}
    >
      <div style={{ padding: '8px 12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
        Cloning from base version: <strong>{sourceResume.name}</strong> ({sourceResume.version_label})
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {error && (
          <div role="alert" style={{ padding: '8px 12px', background: 'var(--color-danger-soft, #fef2f2)', color: 'var(--color-danger, #dc2626)', borderRadius: 'var(--radius-sm)', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
          <div>
            <label htmlFor="clone-doc-name" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
              New Name / Title *
            </label>
            <Input
              id="clone-doc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="clone-doc-version" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
              New Version Label *
            </label>
            <Input
              id="clone-doc-version"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder="e.g. v2, rev-1"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="clone-doc-summary" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
            Change Summary (What changed from parent?)
          </label>
          <Textarea
            id="clone-doc-summary"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            placeholder="e.g. Highlighted healthcare domain experience; updated metrics"
            rows={3}
          />
        </div>
      </form>
    </Dialog>
  );
}
