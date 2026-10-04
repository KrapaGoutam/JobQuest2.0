import { useEffect, useMemo, useState } from 'react';
import { SquareCheck, Reply, BellRing, Repeat } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Segmented } from '../interviews/Segmented';
import { createTask, fetchLinkTargets, updateTask } from '../../api/tasks';
import { RECURRENCE_RULES, TASK_PRIORITIES, addDaysKey, type Task, type TaskType } from '../../types/tasks';
import { dayKey, formatInZone, NonexistentLocalTimeError, utcIsoToZonedWallTime, zonedWallTimeToUtcIso } from '../../lib/time';

const TYPE_ICON = { TASK: <SquareCheck size={13} aria-hidden="true" />, FOLLOW_UP: <Reply size={13} aria-hidden="true" />, REMINDER: <BellRing size={13} aria-hidden="true" /> };
const TYPE_TITLE: Record<TaskType, string> = { TASK: 'task', FOLLOW_UP: 'follow-up', REMINDER: 'reminder' };

type Targets = Awaited<ReturnType<typeof fetchLinkTargets>>;

export interface TaskDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  /** Owner of a new task (the signed-in user). */
  ownerId: string;
  timeZone: string;
  editing?: Task | null;
  initialType?: TaskType;
  /** Pre-link a new task, e.g. from the application drawer. */
  preset?: { applicationId?: string; contactId?: string; interviewId?: string };
  onSaved: (message: string) => void;
}

/** Gate 02B T3/T4/T6 (FORM_SPEC 5.1). */
export function TaskDialog({ isOpen, onClose, workspaceId, ownerId, timeZone, editing, initialType = 'TASK', preset, onSaved }: TaskDialogProps) {
  const [type, setType] = useState<TaskType>(initialType);
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [repeat, setRepeat] = useState('');
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>([]);
  const [repeatEnd, setRepeatEnd] = useState<'never' | 'until' | 'after'>('never');
  const [repeatUntil, setRepeatUntil] = useState('');
  const [repeatCount, setRepeatCount] = useState(10);
  const [notes, setNotes] = useState('');
  const [targets, setTargets] = useState<Targets | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const owner = editing?.user_id ?? ownerId;

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    if (editing) {
      setType(editing.task_type);
      setTitle(editing.title);
      setLink(editing.interview_id ? `i:${editing.interview_id}` : editing.application_id ? `a:${editing.application_id}` : editing.contact_id ? `c:${editing.contact_id}` : '');
      setPriority(editing.priority);
      if (editing.due_at) {
        const w = utcIsoToZonedWallTime(editing.due_at, timeZone);
        setDate(w.date);
        setTime(w.time);
      } else {
        setDate(editing.due_date ?? '');
        setTime('');
      }
      setRepeat(editing.recurrence_rule ?? '');
      setRepeatInterval(editing.recurrence_interval ?? 1);
      setRepeatWeekdays(editing.recurrence_weekdays ?? []);
      setRepeatEnd(editing.recurrence_until ? 'until' : editing.recurrence_occurrence_limit ? 'after' : 'never');
      setRepeatUntil(editing.recurrence_until ?? '');
      setRepeatCount(editing.recurrence_occurrence_limit ?? 10);
      setNotes(editing.details ?? '');
    } else {
      setType(initialType);
      setTitle('');
      setLink(preset?.interviewId ? `i:${preset.interviewId}` : preset?.applicationId ? `a:${preset.applicationId}` : preset?.contactId ? `c:${preset.contactId}` : '');
      setPriority('MEDIUM');
      setDate(initialType === 'REMINDER' ? dayKey(Date.now(), timeZone) : '');
      setTime('');
      setRepeat('');
      setRepeatInterval(1);
      setRepeatWeekdays([]);
      setRepeatEnd('never');
      setRepeatUntil('');
      setRepeatCount(10);
      setNotes('');
    }
    // Keyed on ids so a parent re-render never wipes typed input (M5 lesson).
    // timeZone is excluded for the same reason.
  }, [isOpen, editing?.id, initialType, preset?.applicationId, preset?.contactId, preset?.interviewId]);

  useEffect(() => {
    if (!isOpen || !owner) return;
    fetchLinkTargets(workspaceId, owner).then(setTargets).catch(() => setTargets({ applications: [], contacts: [], interviews: [] }));
  }, [isOpen, workspaceId, owner]);

  const today = dayKey(Date.now(), timeZone);
  const chips = [
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: addDaysKey(today, 1) },
    { label: 'Next week', value: addDaysKey(today, 7) },
    { label: 'No date', value: '' },
  ];
  const nextOccurrenceHint = useMemo(() => {
    if (!repeat || !date) return null;
    let next = '';
    if (repeat === 'DAILY') next = addDaysKey(date, repeatInterval);
    else if (repeat === 'WEEKDAYS') {
      next = addDaysKey(date, 1);
      while ([0, 6].includes(new Date(`${next}T00:00:00Z`).getUTCDay())) next = addDaysKey(next, 1);
    } else if (repeat === 'WEEKLY' && repeatWeekdays.length) {
      const anchorIsoDay = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
      const anchorWeek = addDaysKey(date, -(anchorIsoDay - 1));
      next = date;
      for (let guard = 0; guard < 3000; guard += 1) {
        next = addDaysKey(next, 1);
        const isoDay = new Date(`${next}T00:00:00Z`).getUTCDay() || 7;
        const candidateWeek = addDaysKey(next, -(isoDay - 1));
        const weekDifference = Math.round((Date.parse(`${candidateWeek}T00:00:00Z`) - Date.parse(`${anchorWeek}T00:00:00Z`)) / (7 * 86_400_000));
        if (repeatWeekdays.includes(isoDay) && weekDifference % repeatInterval === 0) break;
      }
    } else if (repeat === 'WEEKLY') {
      next = addDaysKey(date, 7 * repeatInterval);
    } else if (repeat === 'BIWEEKLY') {
      next = addDaysKey(date, 14);
    } else if (repeat === 'MONTHLY') {
      const [y, m, d] = date.split('-').map(Number);
      const last = new Date(Date.UTC(y!, m! + repeatInterval, 0)).getUTCDate();
      next = new Date(Date.UTC(y!, m! - 1 + repeatInterval, Math.min(d!, last))).toISOString().slice(0, 10);
    }
    return next ? formatInZone(`${next}T12:00:00Z`, 'UTC', { weekday: 'short', month: 'short', day: 'numeric' }) : null;
  }, [repeat, date, repeatInterval, repeatWeekdays]);

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Enter a title.';
    if (title.trim().length > 255) errs.title = 'Keep the title under 255 characters.';
    if (type === 'FOLLOW_UP' && !link) errs.link = 'Choose what to follow up on.';
    if (type === 'REMINDER' && !date) errs.date = 'Reminders need a date.';
    if (repeat && !date) errs.date = 'Repeating tasks need a due date.';
    if (repeatInterval < 1 || repeatInterval > 365) errs.repeat = 'Interval must be between 1 and 365.';
    if (repeat === 'WEEKLY' && repeatWeekdays.length === 0 && repeatInterval > 1) errs.repeat = 'Choose at least one weekday for a custom weekly schedule.';
    if (repeatEnd === 'until' && !repeatUntil) errs.repeatEnd = 'Choose an end date.';
    if (repeatEnd === 'until' && date && repeatUntil < date) errs.repeatEnd = 'End date must be on or after the first due date.';
    if (repeatEnd === 'after' && (repeatCount < 1 || repeatCount > 10000)) errs.repeatEnd = 'Occurrences must be between 1 and 10,000.';
    if (time && !date) errs.date = 'Choose a date for this time.';
    let dueAt: string | null = null;
    if (date && time) {
      try {
        dueAt = zonedWallTimeToUtcIso(date, time, timeZone);
      } catch (e) {
        errs.time = e instanceof NonexistentLocalTimeError ? `${time} does not exist on ${date} in ${timeZone} (daylight saving change).` : 'Invalid time.';
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const linkFields = {
      application_id: link.startsWith('a:') ? link.slice(2) : null,
      contact_id: link.startsWith('c:') ? link.slice(2) : null,
      interview_id: link.startsWith('i:') ? link.slice(2) : null,
    };
    const fields = {
      task_type: type,
      title: title.trim(),
      details: notes.trim() || null,
      due_date: date && !time ? date : null,
      due_at: dueAt,
      priority: priority as Task['priority'],
      recurrence_rule: (repeat || null) as Task['recurrence_rule'],
      recurrence_interval: repeat && !['WEEKDAYS', 'BIWEEKLY'].includes(repeat) ? repeatInterval : 1,
      recurrence_weekdays: repeat === 'WEEKLY' && repeatWeekdays.length ? [...repeatWeekdays].sort((a, b) => a - b) : null,
      recurrence_until: repeat && repeatEnd === 'until' ? repeatUntil : null,
      recurrence_occurrence_limit: repeat && repeatEnd === 'after' ? repeatCount : null,
      ...linkFields,
    };
    setSaving(true);
    try {
      if (editing) {
        await updateTask(editing.id, fields);
        onSaved(`Updated ${TYPE_TITLE[type]}`);
      } else {
        await createTask({ workspace_id: workspaceId, user_id: ownerId, ...fields });
        onSaved(`Created ${TYPE_TITLE[type]}`);
      }
      onClose();
    } catch (e) {
      setErrors({ submit: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? `Edit ${TYPE_TITLE[type]}` : `New ${TYPE_TITLE[type]}`}
      maxWidth={580}
      footer={
        <>
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} isLoading={saving}>
            {editing ? 'Save changes' : `Create ${TYPE_TITLE[type]}`}
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        {errors.submit && <div className="banner danger small" role="alert">{errors.submit}</div>}
        <Segmented
          label="Type"
          value={type}
          onChange={(v) => setType(v as TaskType)}
          options={(['TASK', 'FOLLOW_UP', 'REMINDER'] as const).map((t) => ({ value: t, label: <>{TYPE_ICON[t]}{t === 'FOLLOW_UP' ? 'Follow-up' : t === 'TASK' ? 'Task' : 'Reminder'}</> }))}
        />
        <FormField label="Title" required error={errors.title}>
          {(p) => <Input {...p} value={title} maxLength={255} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'FOLLOW_UP' ? 'Send 2nd follow-up' : 'Update portfolio case study'} />}
        </FormField>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
          <FormField label={type === 'FOLLOW_UP' ? 'Follow up on' : 'Linked to'} required={type === 'FOLLOW_UP'} optional={type !== 'FOLLOW_UP'} error={errors.link} helpText={type === 'FOLLOW_UP' ? 'An application, interview or contact.' : undefined}>
            {(p) => (
              <Select {...p} value={link} onChange={(e) => setLink(e.target.value)}>
                <option value="">{type === 'FOLLOW_UP' ? 'Choose…' : 'Nothing'}</option>
                {targets && targets.applications.length > 0 && (
                  <optgroup label="Applications">
                    {targets.applications.map((a) => <option key={a.id} value={`a:${a.id}`}>{a.company_name} · {a.role_title}</option>)}
                  </optgroup>
                )}
                {targets && targets.interviews.length > 0 && (
                  <optgroup label="Interviews">
                    {targets.interviews.map((i) => (
                      <option key={i.id} value={`i:${i.id}`}>
                        {i.applications?.company_name ?? 'Interview'} · round {i.round_number} · {formatInZone(i.scheduled_at, timeZone, { month: 'short', day: 'numeric' })}
                      </option>
                    ))}
                  </optgroup>
                )}
                {targets && targets.contacts.length > 0 && (
                  <optgroup label="Contacts">
                    {targets.contacts.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.full_name}</option>)}
                  </optgroup>
                )}
              </Select>
            )}
          </FormField>
          <div className="field">
            <span className="label">Priority</span>
            <Segmented label="Priority" value={priority} onChange={setPriority} options={TASK_PRIORITIES.map((p) => ({ value: p.id, label: p.label }))} />
          </div>
        </div>
        <div className="field">
          <span className="label">
            Due date {type === 'REMINDER' ? <span className="req" aria-hidden="true">*</span> : <span className="opt">(optional)</span>}
          </span>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Quick due dates">
            {chips.map((c) => (
              <button key={c.label} type="button" className={`chip sm ${date === c.value && !(c.value === '' && time) ? 'on' : ''}`} aria-pressed={date === c.value} onClick={() => { setDate(c.value); if (!c.value) setTime(''); }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
          <FormField label="Date" error={errors.date} helpText={!date ? 'Leave empty to keep it in "No date".' : undefined}>
            {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </FormField>
          <FormField label="Time" optional error={errors.time}>
            {(p) => <Input {...p} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
          </FormField>
          <FormField label="Repeat" optional>
            {(p) => (
              <Select {...p} value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-invalid={Boolean(errors.repeat)}>
                <option value="">Does not repeat</option>
                {RECURRENCE_RULES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </Select>
            )}
          </FormField>
        </div>
        {errors.repeat && <div className="help danger" role="alert">{errors.repeat}</div>}
        {repeat && (
          <div className="col" style={{ gap: 12 }}>
            {!['WEEKDAYS', 'BIWEEKLY'].includes(repeat) && (
              <FormField label={repeat === 'MONTHLY' ? 'Every N months' : repeat === 'WEEKLY' ? 'Every N weeks' : 'Every N days'}>
                {(p) => <Input {...p} type="number" min={1} max={365} value={repeatInterval} onChange={(e) => setRepeatInterval(Number(e.target.value) || 1)} />}
              </FormField>
            )}
            {repeat === 'WEEKLY' && (
              <fieldset className="field">
                <legend className="label">On weekdays <span className="opt">(optional for every week)</span></legend>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, index) => {
                    const day = index + 1;
                    return <button key={label} type="button" className={`chip sm ${repeatWeekdays.includes(day) ? 'on' : ''}`} aria-pressed={repeatWeekdays.includes(day)} onClick={() => setRepeatWeekdays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day])}>{label}</button>;
                  })}
                </div>
              </fieldset>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
              <FormField label="Ends" error={errors.repeatEnd}>
                {(p) => (
                  <Select {...p} value={repeatEnd} onChange={(e) => setRepeatEnd(e.target.value as typeof repeatEnd)}>
                    <option value="never">Never</option>
                    <option value="until">On date</option>
                    <option value="after">After occurrences</option>
                  </Select>
                )}
              </FormField>
              {repeatEnd === 'until' && <FormField label="Last occurrence">{(p) => <Input {...p} type="date" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} />}</FormField>}
              {repeatEnd === 'after' && <FormField label="Occurrences">{(p) => <Input {...p} type="number" min={1} max={10000} value={repeatCount} onChange={(e) => setRepeatCount(Number(e.target.value) || 1)} />}</FormField>}
            </div>
          </div>
        )}
        <div className="help">Times are in {timeZone.replace(/_/g, ' ')}, your profile time zone.</div>
        {repeat && (
          <div className="banner info small" data-testid="recurrence-hint">
            <Repeat size={14} aria-hidden="true" />
            <span>
              <b>Recurring.</b> {nextOccurrenceHint ? <>When you complete it, the next one is created for <b>{nextOccurrenceHint}</b>. </> : null}Past occurrences stay in Completed.
            </span>
          </div>
        )}
        <FormField label="Notes" optional>
          {(p) => <Textarea {...p} rows={3} value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to remember" />}
        </FormField>
      </div>
    </Dialog>
  );
}
