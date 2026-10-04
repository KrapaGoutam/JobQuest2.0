import { useEffect, useState } from 'react';
import { Repeat } from 'lucide-react';
import { applyTaskTemplate, fetchTaskTemplates } from '../../api/tasks';
import { recurrenceLabel, type TaskTemplate } from '../../types/tasks';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

export function TaskTemplatePicker({
  isOpen,
  onClose,
  workspaceId,
  ownerId,
  applicationId,
  onApplied,
}: {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  ownerId: string;
  applicationId: string;
  onApplied: () => void;
}) {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    fetchTaskTemplates(workspaceId, false, ownerId)
      .then((rows) => {
        setTemplates(rows);
        setSelectedId(rows[0]?.id ?? '');
      })
      .catch((cause: Error) => setError(cause.message));
  }, [isOpen, ownerId, workspaceId]);

  const selected = templates.find((template) => template.id === selectedId);
  const apply = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await applyTaskTemplate(selected.id, applicationId);
      onApplied();
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Use task template" maxWidth={560} footer={<><span style={{ flex: 1 }} /><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!selected} isLoading={saving} onClick={() => void apply()}>Create task</Button></>}>
      <div className="col" style={{ gap: 12 }}>
        <p className="small muted" style={{ margin: 0 }}>Choose a template, review its values, then create an independent task for this application.</p>
        {error && <div className="banner danger small" role="alert">{error}</div>}
        {templates.length === 0 ? <p>No active templates. Create one in Settings → Task Templates.</p> : (
          <>
            <div className="col" role="radiogroup" aria-label="Task templates" style={{ gap: 6 }}>
              {templates.map((template) => (
                <label key={template.id} className="row" style={{ gap: 8, padding: 8, border: '1px solid var(--color-border)', borderRadius: 8 }}>
                  <input type="radio" name="task-template" checked={selectedId === template.id} onChange={() => setSelectedId(template.id)} />
                  <span><b>{template.title}</b><span className="small muted" style={{ display: 'block' }}>{template.task_type.replace('_', '-').toLowerCase()} · {template.priority.toLowerCase()}</span></span>
                </label>
              ))}
            </div>
            {selected && <div className="banner info small" aria-label="Template preview"><div><b>{selected.title}</b>{selected.details && <p>{selected.details}</p>}<p>Due: {selected.due_offset_days == null ? 'No date' : `in ${selected.due_offset_days} day(s)`}</p>{selected.recurrence_rule && <p><Repeat size={13} /> {recurrenceLabel(selected.recurrence_rule)}{selected.recurrence_interval > 1 ? ` · interval ${selected.recurrence_interval}` : ''}{selected.recurrence_occurrence_limit ? ` · ${selected.recurrence_occurrence_limit} occurrences` : selected.recurrence_until ? ` · through ${selected.recurrence_until}` : ''}</p>}</div></div>}
          </>
        )}
      </div>
    </Dialog>
  );
}
