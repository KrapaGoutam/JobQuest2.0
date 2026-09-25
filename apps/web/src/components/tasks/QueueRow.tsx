import { useState, type ReactNode } from 'react';
import { AlarmClock, Briefcase, Check, Flag, BellRing, Reply, SquareCheck, UserRound, Repeat, ClipboardPen, TriangleAlert, Clock } from 'lucide-react';
import { Button } from '../ui/Button';
import { PriorityBars } from '../ui/PriorityBars';
import { Dialog } from '../ui/Dialog';
import { RecordOutcomeDialog } from '../interviews/RecordOutcomeDialog';
import { DoneSetNextDialog } from './DoneSetNextDialog';
import { useToast } from '../../context/ToastContext';
import { cancelTask, completeTask, reopenTask, snoozeNextAction, updateTask } from '../../api/tasks';
import { fetchInterview } from '../../api/interviews';
import { addDaysKey, dueLabel } from '../../types/tasks';
import type { Interview } from '../../types/interviews';
import type { CanonicalWorkflow } from '../../types/applications';
import type { QueueItem } from '../../lib/queue';
import { dayKey, utcIsoToZonedWallTime, zonedWallTimeToUtcIso } from '../../lib/time';

export const KIND_META: Record<QueueItem['kind'], { label: string; icon: ReactNode; pill: string }> = {
  TASK: { label: 'Task', icon: <SquareCheck size={12} aria-hidden="true" />, pill: '' },
  FOLLOW_UP: { label: 'Follow-up', icon: <Reply size={12} aria-hidden="true" />, pill: 'info' },
  REMINDER: { label: 'Reminder', icon: <BellRing size={12} aria-hidden="true" />, pill: '' },
  NEXT_ACTION: { label: 'Next action', icon: <Flag size={12} aria-hidden="true" />, pill: 'accent' },
  INTERVIEW_OUTCOME: { label: 'Interview', icon: <ClipboardPen size={12} aria-hidden="true" />, pill: 'warning' },
};

function SubtitleIcon({ item }: { item: QueueItem }) {
  if (item.kind === 'NEXT_ACTION' || item.task?.applications || item.interview) return <Briefcase size={12} aria-hidden="true" />;
  if (item.task?.contacts) return <UserRound size={12} aria-hidden="true" />;
  if (item.task?.recurrence_rule) return <Repeat size={12} aria-hidden="true" />;
  return null;
}

/**
 * Actions for queue items. Everything goes through the owning domain:
 * tasks → task RPCs; next actions → "Done, set next"; interviews → the M5 debrief.
 */
export function useQueueActions(opts: { timeZone: string; workflow: CanonicalWorkflow | null; onChanged: () => void }) {
  const { addToast } = useToast();
  const [doneFor, setDoneFor] = useState<QueueItem | null>(null);
  const [outcomeFor, setOutcomeFor] = useState<Interview | null>(null);
  const [cancelFor, setCancelFor] = useState<QueueItem | null>(null);

  const fail = (e: unknown) => addToast({ title: (e as Error).message || 'Something went wrong', type: 'danger' });

  const complete = async (item: QueueItem) => {
    try {
      if (item.kind === 'NEXT_ACTION') return setDoneFor(item);
      if (item.kind === 'INTERVIEW_OUTCOME') return setOutcomeFor(await fetchInterview(item.interview!.id));
      const r = await completeTask(item.task!.id);
      opts.onChanged();
      addToast({
        title: `Completed: ${item.title}`,
        description: r.next_task_id ? 'The next occurrence was created.' : undefined,
        type: 'success',
        duration: 8000,
        action: {
          label: 'Undo',
          onClick: () => {
            reopenTask(item.task!.id).then(opts.onChanged).catch(fail);
          },
        },
      });
    } catch (e) {
      fail(e);
    }
  };

  const snooze = async (item: QueueItem, days: number) => {
    try {
      const today = dayKey(Date.now(), opts.timeZone);
      if (item.kind === 'NEXT_ACTION') {
        await snoozeNextAction(item.nextAction!.id, addDaysKey(today, days));
      } else if (item.task?.due_at) {
        const w = utcIsoToZonedWallTime(item.task.due_at, opts.timeZone);
        const base = w.date < today ? today : w.date;
        await updateTask(item.task.id, { due_at: zonedWallTimeToUtcIso(addDaysKey(base, days), w.time, opts.timeZone) });
      } else if (item.task) {
        const base = item.task.due_date && item.task.due_date > today ? item.task.due_date : today;
        await updateTask(item.task.id, { due_date: addDaysKey(base, days), due_at: null });
      }
      opts.onChanged();
      addToast({ title: `Snoozed: ${item.title}`, type: 'info' });
    } catch (e) {
      fail(e);
    }
  };

  const dialogs = (
    <>
      <DoneSetNextDialog
        isOpen={doneFor !== null}
        onClose={() => setDoneFor(null)}
        application={doneFor?.nextAction ? { id: doneFor.nextAction.id, company_name: doneFor.nextAction.company_name, next_action: doneFor.nextAction.next_action } : null}
        timeZone={opts.timeZone}
        onSaved={(m) => {
          addToast({ title: m, type: 'success' });
          opts.onChanged();
        }}
      />
      <RecordOutcomeDialog
        isOpen={outcomeFor !== null}
        onClose={() => setOutcomeFor(null)}
        interview={outcomeFor}
        workflow={opts.workflow}
        timeZone={opts.timeZone}
        onSaved={(m) => {
          addToast({ title: m, type: 'success' });
          opts.onChanged();
        }}
      />
      <Dialog
        isOpen={cancelFor !== null}
        onClose={() => setCancelFor(null)}
        title="Cancel this task?"
        description="It moves out of your queue and stays in history. Nothing is deleted."
        maxWidth={440}
        footer={
          <>
            <span style={{ flex: 1 }} />
            <Button variant="secondary" onClick={() => setCancelFor(null)}>Keep</Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await cancelTask(cancelFor!.task!.id);
                  addToast({ title: `Cancelled: ${cancelFor!.title}`, type: 'info' });
                  opts.onChanged();
                } catch (e) {
                  fail(e);
                }
                setCancelFor(null);
              }}
            >
              Cancel task
            </Button>
          </>
        }
      >
        <p className="small" style={{ margin: 0 }}>{cancelFor?.title}</p>
      </Dialog>
    </>
  );

  return { complete, snooze, askCancel: setCancelFor, dialogs };
}

function SnoozeMenu({ item, onSnooze }: { item: QueueItem; onSnooze: (item: QueueItem, days: number) => void }) {
  const [open, setOpen] = useState(false);
  if (item.kind === 'INTERVIEW_OUTCOME') return null;
  return (
    <span style={{ position: 'relative' }}>
      <Button size="sm" variant="secondary" leftIcon={<AlarmClock size={13} />} aria-haspopup="menu" aria-expanded={open} aria-label={`Snooze ${item.title}`} onClick={() => setOpen((o) => !o)}>
        Snooze
      </Button>
      {open && (
        <div role="menu" className="menu-pop" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          {[
            ['Tomorrow', 1],
            ['In 3 days', 3],
            ['Next week', 7],
          ].map(([l, d]) => (
            <button key={l as string} role="menuitem" type="button" onClick={() => { setOpen(false); onSnooze(item, d as number); }}>
              {l as string}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

export function QueueRow({
  item,
  timeZone,
  onComplete,
  onSnooze,
  onOpen,
  selected,
  ownerName,
  compact,
}: {
  item: QueueItem;
  timeZone: string;
  onComplete: (item: QueueItem) => void;
  onSnooze: (item: QueueItem, days: number) => void;
  onOpen?: (item: QueueItem) => void;
  selected?: boolean;
  ownerName?: string | null;
  compact?: boolean;
}) {
  const meta = KIND_META[item.kind];
  const label =
    item.kind === 'INTERVIEW_OUTCOME'
      ? 'Outcome needed'
      : item.task
        ? dueLabel(item.task, timeZone)
        : dueLabel({ due_date: item.day, due_at: null }, timeZone);
  const tone = item.state === 'overdue' ? 'danger-t b' : item.state === 'today' ? 'warning-t b' : 'muted';
  const doneLabel = item.kind === 'NEXT_ACTION' ? `Done, set next: ${item.title}` : item.kind === 'INTERVIEW_OUTCOME' ? item.title : `Complete ${item.title}`;
  return (
    <div className={`trow ${selected ? 'sel' : ''} ${compact ? 'compact' : ''}`} data-testid="queue-row" data-kind={item.kind} data-state={item.state}>
      <button type="button" className="circ-btn" aria-label={doneLabel} onClick={() => onComplete(item)}>
        {item.kind === 'INTERVIEW_OUTCOME' ? <ClipboardPen size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" className="circ-check" />}
      </button>
      <button type="button" className="trow-main" onClick={() => onOpen?.(item)} disabled={!onOpen} aria-label={onOpen ? `Open ${item.title}` : undefined}>
        <div className="b ell">{item.title}</div>
        <div className="small muted ell row" style={{ gap: 5 }}>
          <SubtitleIcon item={item} />
          {item.subtitle}
          {ownerName && ` · ${ownerName}`}
        </div>
      </button>
      {!compact && (
        <span className="trow-type">
          <span className={`pill ${meta.pill}`}>{meta.icon}{meta.label}</span>
        </span>
      )}
      {!compact && (
        <span className="trow-pri row small nowrap" style={{ gap: 6 }}>
          <PriorityBars priority={item.priority} />
          {item.priority.charAt(0) + item.priority.slice(1).toLowerCase()}
        </span>
      )}
      <span className={`trow-due small nowrap row ${tone}`} style={{ gap: 4, justifyContent: 'flex-end' }}>
        {item.state === 'overdue' && <TriangleAlert size={12} aria-hidden="true" />}
        {item.state === 'today' && <Clock size={12} aria-hidden="true" />}
        {label}
      </span>
      <span className="trow-act">
        {item.kind === 'INTERVIEW_OUTCOME' ? (
          <Button size="sm" variant="primary" onClick={() => onComplete(item)}>Record outcome</Button>
        ) : (
          <SnoozeMenu item={item} onSnooze={onSnooze} />
        )}
      </span>
    </div>
  );
}
