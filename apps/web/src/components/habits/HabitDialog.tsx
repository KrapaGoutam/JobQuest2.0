import { useEffect, useState } from 'react';
import { Minus, Plus, Trash2, Info } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';
import { Segmented } from '../interviews/Segmented';
import { archiveHabit, createHabit, updateHabit, type Habit } from '../../api/habits';
import type { HabitFrequency } from '../../lib/habits';

/** Gate 02B H2 (FORM_SPEC 7.1): replaces the legacy prompt() chain (CR-002). */
export function HabitDialog({
  isOpen,
  onClose,
  workspaceId,
  ownerId,
  editing,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  ownerId: string;
  editing: Habit | null;
  onSaved: (message: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<HabitFrequency>('DAILY');
  const [target, setTarget] = useState(1);
  const [unit, setUnit] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setConfirmDelete(false);
    setTitle(editing?.title ?? '');
    setDescription(editing?.description ?? '');
    setFrequency(editing?.frequency ?? 'DAILY');
    setTarget(editing?.target_count ?? 1);
    setUnit(editing?.unit_label ?? '');
    setActive(editing?.is_active ?? true);
  }, [isOpen, editing?.id]);

  const save = async () => {
    if (!title.trim() || title.trim().length > 64) {
      setError('Name is required (up to 64 characters).');
      return;
    }
    if (!Number.isInteger(target) || target < 1 || target > 100) {
      setError('Target must be a whole number from 1 to 100.');
      return;
    }
    setSaving(true);
    setError(null);
    const fields = { title: title.trim(), description: description.trim() || null, frequency, target_count: target, unit_label: unit.trim() || null, is_active: active };
    try {
      if (editing) {
        await updateHabit(editing.id, fields);
        onSaved(`Saved ${fields.title}`);
      } else {
        await createHabit({ workspace_id: workspaceId, user_id: ownerId, ...fields });
        onSaved(`Created ${fields.title}`);
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit habit' : 'New habit'}
      maxWidth={520}
      footer={
        <>
          {editing &&
            (confirmDelete ? (
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await archiveHabit(editing.id);
                    onSaved(`Archived ${editing.title}. Its history is kept.`);
                    onClose();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Confirm archive
              </Button>
            ) : (
              <Button variant="danger-outline" leftIcon={<Trash2 size={13} />} onClick={() => setConfirmDelete(true)}>Delete</Button>
            ))}
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} isLoading={saving}>Save</Button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        {error && <div className="banner danger small" role="alert">{error}</div>}
        {confirmDelete && <div className="banner small" role="status">Deleting archives the habit: it leaves your list and its history is kept.</div>}
        <FormField label="Name" required>
          {(p) => <Input {...p} value={title} maxLength={64} onChange={(e) => setTitle(e.target.value)} placeholder="Send 3 recruiter outreaches" />}
        </FormField>
        <FormField label="Description" optional>
          {(p) => <Input {...p} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder="Why this matters" />}
        </FormField>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 12 }}>
          <div className="field">
            <span className="label">Frequency <span className="req" aria-hidden="true">*</span></span>
            <Segmented label="Frequency" value={frequency} onChange={(v) => setFrequency(v as HabitFrequency)} options={[{ value: 'DAILY', label: 'Daily' }, { value: 'WEEKDAYS', label: 'Weekdays' }, { value: 'WEEKLY', label: 'Weekly' }]} />
          </div>
          <div className="field">
            <label className="label" htmlFor="habit-target">Target per period</label>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="cnt-btn" aria-label="Decrease target" onClick={() => setTarget((t) => Math.max(1, t - 1))}><Minus size={14} /></button>
              <input id="habit-target" className="input cnt-input" type="number" min={1} max={100} value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-describedby="habit-target-help" />
              <button type="button" className="cnt-btn" aria-label="Increase target" onClick={() => setTarget((t) => Math.min(100, t + 1))}><Plus size={14} /></button>
            </div>
            <div className="help" id="habit-target-help">1 = simple yes/no habit.</div>
          </div>
        </div>
        {target > 1 && (
          <FormField label="Unit label" optional>
            {(p) => <Input {...p} value={unit} maxLength={20} onChange={(e) => setUnit(e.target.value)} placeholder="applications" />}
          </FormField>
        )}
        <label className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ marginTop: 3 }} />
          <span><b>Active</b><br /><span className="small muted">Paused habits keep their history. Days while paused count as missed for streaks.</span></span>
        </label>
        <div className="banner small"><Info size={14} aria-hidden="true" /><span>Changing the target doesn't rewrite past days.</span></div>
      </div>
    </Dialog>
  );
}
