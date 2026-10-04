import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Repeat } from 'lucide-react';
import {
  createTaskTemplate,
  fetchTaskTemplates,
  updateTaskTemplate,
} from '../../api/tasks';
import {
  RECURRENCE_RULES,
  TASK_PRIORITIES,
  TASK_TYPES,
  recurrenceLabel,
  type RecurrenceRule,
  type TaskPriority,
  type TaskTemplate,
  type TaskType,
} from '../../types/tasks';
import { useToast } from '../../context/ToastContext';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../ui/Card';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';

interface TemplateDraft {
  title: string;
  details: string;
  task_type: TaskType;
  priority: TaskPriority;
  due_offset_days: string;
  recurrence_rule: RecurrenceRule | '';
  recurrence_interval: number;
  recurrence_weekdays: number[];
  end_mode: 'never' | 'until' | 'after';
  recurrence_until: string;
  recurrence_occurrence_limit: number;
}

const EMPTY: TemplateDraft = {
  title: '', details: '', task_type: 'TASK', priority: 'MEDIUM', due_offset_days: '',
  recurrence_rule: '', recurrence_interval: 1, recurrence_weekdays: [], end_mode: 'never',
  recurrence_until: '', recurrence_occurrence_limit: 10,
};

export function TaskTemplateManager({ workspaceId, ownerId }: { workspaceId: string; ownerId: string }) {
  const { addToast } = useToast();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [editing, setEditing] = useState<TaskTemplate | null | 'new'>(null);
  const [draft, setDraft] = useState<TemplateDraft>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    void fetchTaskTemplates(workspaceId, true, ownerId).then(setTemplates).catch((cause: Error) => {
      addToast({ type: 'danger', title: cause.message });
    });
  }, [addToast, ownerId, workspaceId]);
  useEffect(load, [load]);

  const open = (template?: TaskTemplate) => {
    setEditing(template ?? 'new');
    setDraft(template ? {
      title: template.title,
      details: template.details ?? '',
      task_type: template.task_type,
      priority: template.priority,
      due_offset_days: template.due_offset_days?.toString() ?? '',
      recurrence_rule: template.recurrence_rule ?? '',
      recurrence_interval: template.recurrence_interval,
      recurrence_weekdays: template.recurrence_weekdays ?? [],
      end_mode: template.recurrence_until ? 'until' : template.recurrence_occurrence_limit ? 'after' : 'never',
      recurrence_until: template.recurrence_until ?? '',
      recurrence_occurrence_limit: template.recurrence_occurrence_limit ?? 10,
    } : EMPTY);
  };

  const save = async () => {
    if (!draft.title.trim()) return;
    if ((draft.task_type === 'REMINDER' || draft.recurrence_rule) && draft.due_offset_days === '') {
      addToast({ type: 'danger', title: 'Reminders and repeating templates need a due-date offset.' });
      return;
    }
    const input = {
      title: draft.title.trim(),
      details: draft.details.trim() || null,
      task_type: draft.task_type,
      priority: draft.priority,
      due_offset_days: draft.due_offset_days === '' ? null : Number(draft.due_offset_days),
      recurrence_rule: draft.recurrence_rule || null,
      recurrence_interval: draft.recurrence_rule && !['WEEKDAYS', 'BIWEEKLY'].includes(draft.recurrence_rule) ? draft.recurrence_interval : 1,
      recurrence_weekdays: draft.recurrence_rule === 'WEEKLY' && draft.recurrence_weekdays.length ? draft.recurrence_weekdays : null,
      recurrence_until: draft.recurrence_rule && draft.end_mode === 'until' ? draft.recurrence_until : null,
      recurrence_occurrence_limit: draft.recurrence_rule && draft.end_mode === 'after' ? draft.recurrence_occurrence_limit : null,
    };
    setSaving(true);
    try {
      if (editing === 'new') await createTaskTemplate({ workspace_id: workspaceId, user_id: ownerId, ...input });
      else if (editing) await updateTaskTemplate(editing.id, input);
      addToast({ type: 'success', title: editing === 'new' ? 'Template created' : 'Template updated' });
      setEditing(null);
      load();
    } catch (cause) {
      addToast({ type: 'danger', title: (cause as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Task templates">
      <Card>
        <CardHeader action={<Button size="sm" variant="secondary" leftIcon={<Plus size={14} />} onClick={() => open()}>New template</Button>}>
          <CardTitle>Task templates</CardTitle>
        </CardHeader>
        <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="muted small" style={{ margin: 0 }}>Reusable defaults for tasks you create from an application. Applying a template always creates an independent task.</p>
          {templates.length === 0 ? <p>No templates yet.</p> : templates.map((template) => (
            <div className="row" key={template.id} style={{ gap: 10, borderTop: '1px solid var(--color-border)', paddingTop: 12, opacity: template.is_active ? 1 : 0.6 }}>
              <div style={{ flex: 1 }}>
                <b>{template.title}</b>
                <div className="small muted">{template.task_type.replace('_', '-').toLowerCase()} · {template.priority.toLowerCase()} · {template.due_offset_days == null ? 'no due date' : `due in ${template.due_offset_days} day(s)`}{template.recurrence_rule ? ` · ${recurrenceLabel(template.recurrence_rule)}` : ''}</div>
              </div>
              <Button size="sm" variant="ghost" leftIcon={<Pencil size={13} />} onClick={() => open(template)}>Edit</Button>
              <Button size="sm" variant="secondary" onClick={() => void updateTaskTemplate(template.id, { is_active: !template.is_active }).then(load)}>{template.is_active ? 'Disable' : 'Enable'}</Button>
            </div>
          ))}
        </CardBody>
      </Card>
      <Dialog isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New task template' : 'Edit task template'} maxWidth={620} footer={<><span style={{ flex: 1 }} /><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" isLoading={saving} onClick={() => void save()}>Save template</Button></>}>
        <div className="col" style={{ gap: 12 }}>
          <label className="field"><span className="label">Title</span><Input value={draft.title} maxLength={255} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label className="field"><span className="label">Notes <span className="opt">(optional)</span></span><Textarea rows={2} maxLength={5000} value={draft.details} onChange={(event) => setDraft({ ...draft, details: event.target.value })} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
            <label className="field"><span className="label">Type</span><Select value={draft.task_type} onChange={(event) => setDraft({ ...draft, task_type: event.target.value as TaskType })}>{TASK_TYPES.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</Select></label>
            <label className="field"><span className="label">Priority</span><Select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as TaskPriority })}>{TASK_PRIORITIES.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</Select></label>
            <label className="field"><span className="label">Due in days</span><Input type="number" min={0} max={3650} value={draft.due_offset_days} onChange={(event) => setDraft({ ...draft, due_offset_days: event.target.value })} placeholder="No date" /></label>
          </div>
          <label className="field"><span className="label">Repeat</span><Select value={draft.recurrence_rule} onChange={(event) => setDraft({ ...draft, recurrence_rule: event.target.value as RecurrenceRule | '' })}><option value="">Does not repeat</option>{RECURRENCE_RULES.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</Select></label>
          {draft.recurrence_rule && <div className="banner info small"><Repeat size={14} /><span>Recurrence starts from the computed due date when this template is applied.</span></div>}
          {draft.recurrence_rule && !['WEEKDAYS', 'BIWEEKLY'].includes(draft.recurrence_rule) && <label className="field"><span className="label">Interval</span><Input type="number" min={1} max={365} value={draft.recurrence_interval} onChange={(event) => setDraft({ ...draft, recurrence_interval: Number(event.target.value) || 1 })} /></label>}
          {draft.recurrence_rule === 'WEEKLY' && <fieldset className="field"><legend className="label">Weekdays</legend><div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((label, index) => { const day = index + 1; return <button key={label} type="button" className={`chip sm ${draft.recurrence_weekdays.includes(day) ? 'on' : ''}`} onClick={() => setDraft({ ...draft, recurrence_weekdays: draft.recurrence_weekdays.includes(day) ? draft.recurrence_weekdays.filter((value) => value !== day) : [...draft.recurrence_weekdays, day] })}>{label}</button>; })}</div></fieldset>}
          {draft.recurrence_rule && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}><label className="field"><span className="label">Ends</span><Select value={draft.end_mode} onChange={(event) => setDraft({ ...draft, end_mode: event.target.value as TemplateDraft['end_mode'] })}><option value="never">Never</option><option value="until">On date</option><option value="after">After occurrences</option></Select></label>{draft.end_mode === 'until' && <label className="field"><span className="label">Last occurrence</span><Input type="date" value={draft.recurrence_until} onChange={(event) => setDraft({ ...draft, recurrence_until: event.target.value })} /></label>}{draft.end_mode === 'after' && <label className="field"><span className="label">Occurrences</span><Input type="number" min={1} max={10000} value={draft.recurrence_occurrence_limit} onChange={(event) => setDraft({ ...draft, recurrence_occurrence_limit: Number(event.target.value) || 1 })} /></label>}</div>}
        </div>
      </Dialog>
    </section>
  );
}
