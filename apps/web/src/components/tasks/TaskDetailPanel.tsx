import { X, Pencil, TriangleAlert, Info, Check } from 'lucide-react';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { PriorityBars } from '../ui/PriorityBars';
import { ReviewActions } from './ReviewActions';
import { KIND_META } from './QueueRow';
import { daysOverdue, type QueueItem } from '../../lib/queue';
import { dueLabel, recurrenceLabel } from '../../types/tasks';
import { formatSlot } from '../../lib/time';

/** Gate 02B T2 detail panel for any queue item. */
export function TaskDetailPanel({
  item,
  timeZone,
  ownerName,
  onClose,
  onComplete,
  onEdit,
  onCancel,
  onChanged,
  variant = 'panel',
}: {
  item: QueueItem;
  timeZone: string;
  ownerName?: string | null;
  onClose: () => void;
  onComplete: (item: QueueItem) => void;
  onEdit: (item: QueueItem) => void;
  onCancel: (item: QueueItem) => void;
  onChanged: () => void;
  variant?: 'panel' | 'sheet';
}) {
  const meta = KIND_META[item.kind];
  const t = item.task;
  const overdue = item.state === 'overdue' ? daysOverdue(item, timeZone) : 0;
  return (
    <section className={variant === 'panel' ? 'int-panel' : 'int-sheet'} aria-label={`${meta.label} details: ${item.title}`} data-testid="task-detail">
      {variant === 'panel' && (
        <div className="int-panel-h">
          <span className="xs b" style={{ letterSpacing: '.05em' }}>{meta.label.toUpperCase()}</span>
          <span style={{ flex: 1 }} />
          {t && <IconButton icon={<Pencil size={15} />} aria-label="Edit task" variant="ghost" size="sm" onClick={() => onEdit(item)} />}
          <IconButton icon={<X size={15} />} aria-label="Close details" variant="ghost" size="sm" onClick={onClose} />
        </div>
      )}
      <div className="col" style={{ padding: variant === 'panel' ? '14px 16px' : 0, gap: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>{item.title}</div>
        {overdue > 0 && (
          <div className="banner danger small">
            <TriangleAlert size={14} aria-hidden="true" />
            <span><b>{overdue} {overdue === 1 ? 'day' : 'days'} overdue.</b></span>
          </div>
        )}
        <dl className="kv">
          <dt>Linked to</dt>
          <dd>{item.subtitle}</dd>
          <dt>Due</dt>
          <dd>
            {item.interview ? formatSlot(item.interview.scheduled_at, 45, timeZone) : t ? dueLabel(t, timeZone) : dueLabel({ due_date: item.day, due_at: null }, timeZone)}
          </dd>
          <dt>Priority</dt>
          <dd className="row" style={{ gap: 6 }}>
            <PriorityBars priority={item.priority} />
            {item.priority.charAt(0) + item.priority.slice(1).toLowerCase()}
          </dd>
          {t && (
            <>
              <dt>Repeat</dt>
              <dd>{recurrenceLabel(t.recurrence_rule)}</dd>
            </>
          )}
          {ownerName && (
            <>
              <dt>Owner</dt>
              <dd>{ownerName}</dd>
            </>
          )}
        </dl>
        {t?.details && <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{t.details}</div>}
        {item.kind === 'NEXT_ACTION' && (
          <div className="banner small" style={{ alignItems: 'flex-start' }}>
            <Info size={14} aria-hidden="true" style={{ marginTop: 2 }} />
            <span>This is the application's <b>next action</b>. Completing it writes to the application timeline and asks for the next one.</span>
          </div>
        )}
        <div className="col" style={{ gap: 8 }}>
          {item.kind === 'NEXT_ACTION' ? (
            <>
              <Button variant="primary" leftIcon={<Check size={14} />} onClick={() => onComplete(item)}>Done, set next</Button>
              <ReviewActions application={{ id: item.nextAction!.id, company_name: item.nextAction!.company_name }} include={['ghost', 'archive']} onChanged={onChanged} />
            </>
          ) : item.kind === 'INTERVIEW_OUTCOME' ? (
            <Button variant="primary" onClick={() => onComplete(item)}>Record outcome</Button>
          ) : (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Button variant="primary" leftIcon={<Check size={14} />} onClick={() => onComplete(item)}>Complete</Button>
              <Button variant="secondary" leftIcon={<Pencil size={13} />} onClick={() => onEdit(item)}>Edit</Button>
              <Button variant="ghost" onClick={() => onCancel(item)}>Cancel task</Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
