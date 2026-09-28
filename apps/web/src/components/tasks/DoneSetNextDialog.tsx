import { useEffect, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';
import { completeNextAction } from '../../api/tasks';
import { addDaysKey } from '../../types/tasks';
import { dayKey } from '../../lib/time';

/**
 * "Done, set next" (Gate 02B INTERACTION_SPEC 2.3 / C10): completes the application's
 * current next action and optionally sets the next one, atomically with a
 * NEXT_ACTION_CHANGED timeline event (rpc_complete_next_action).
 */
export function DoneSetNextDialog({
  isOpen,
  onClose,
  application,
  timeZone,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  application: { id: string; company_name: string; next_action: string } | null;
  timeZone: string;
  onSaved: (message: string) => void;
}) {
  const [next, setNext] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setNext('');
      setDate('');
      setError(null);
    }
  }, [isOpen, application?.id]);
  if (!application) return null;
  const today = dayKey(Date.now(), timeZone);
  const chips = [
    { label: 'Tomorrow', value: addDaysKey(today, 1) },
    { label: 'In 1 week', value: addDaysKey(today, 7) },
    { label: 'In 2 weeks', value: addDaysKey(today, 14) },
  ];
  const save = async (withNext: boolean) => {
    if (withNext && !next.trim()) {
      setError('Describe the next step, or choose "No next action needed".');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await completeNextAction(application.id, withNext ? next.trim() : null, withNext ? date || null : null);
      onSaved(withNext ? `Done · next: ${next.trim()}` : `Done: ${application.next_action}`);
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
      title="Done, set next"
      description={`${application.company_name} · completed: ${application.next_action}`}
      maxWidth={500}
      footer={
        <>
          <Button variant="ghost" onClick={() => void save(false)} disabled={saving}>No next action needed</Button>
          <span style={{ flex: 1 }} />
          <Button variant="primary" onClick={() => void save(true)} isLoading={saving}>Save next action</Button>
        </>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        {error && <div className="banner danger small" role="alert">{error}</div>}
        <FormField label="Next action" required>
          {(p) => <Input {...p} value={next} maxLength={255} onChange={(e) => setNext(e.target.value)} placeholder="Send thank-you note" />}
        </FormField>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Quick due dates">
          {chips.map((c) => (
            <button key={c.label} type="button" className={`chip sm ${date === c.value ? 'on' : ''}`} aria-pressed={date === c.value} onClick={() => setDate(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
        <FormField label="Due" optional>
          {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        </FormField>
        <div className="help">Adds “Next action changed” to the application timeline.</div>
      </div>
    </Dialog>
  );
}
