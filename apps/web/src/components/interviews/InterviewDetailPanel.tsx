import { useEffect, useId, useState } from 'react';
import { Video, Phone, MapPin, Pencil, X, ClipboardPen, CalendarX, ExternalLink } from 'lucide-react';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Textarea } from '../ui/Textarea';
import { updateInterview } from '../../api/interviews';
import {
  formatLabel,
  interviewStatus,
  resultLabel,
  resultVariant,
  safeMeetingUrl,
  typeLabel,
  THANK_YOU_OPTIONS,
  type Interview,
} from '../../types/interviews';
import { formatSlot } from '../../lib/time';

const FORMAT_ICON = { VIDEO: Video, PHONE: Phone, ONSITE: MapPin } as const;

/** Multiline field saved with an explicit button (simple direct update; no timeline event). */
function NotesField({
  label,
  value,
  onSave,
  placeholder,
}: {
  label: string;
  value: string | null;
  onSave: (v: string | null) => Promise<void>;
  placeholder: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(value ?? ''), [value]);
  const dirty = draft.trim() !== (value ?? '').trim();
  return (
    <div className="field">
      <label className="sec-t" htmlFor={id}>
        {label}
      </label>
      <Textarea id={id} rows={3} value={draft} maxLength={5000} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} />
      {error && (
        <div className="ferr" role="alert">
          {error}
        </div>
      )}
      {dirty && (
        <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
          <Button size="sm" variant="ghost" onClick={() => setDraft(value ?? '')} disabled={saving}>
            Discard
          </Button>
          <Button
            size="sm"
            variant="primary"
            isLoading={saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await onSave(draft.trim() || null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            Save {label.toLowerCase()}
          </Button>
        </div>
      )}
    </div>
  );
}

export interface InterviewDetailPanelProps {
  interview: Interview;
  timeZone: string;
  ownerName?: string | null;
  onClose: () => void;
  onEdit: (i: Interview) => void;
  onRecordOutcome: (i: Interview) => void;
  onChanged: () => void;
  /** 'panel' = I2 side panel; 'sheet' = inside a drawer / mobile day-of view (I5). */
  variant?: 'panel' | 'sheet';
}

export function InterviewDetailPanel({ interview: i, timeZone, ownerName, onClose, onEdit, onRecordOutcome, onChanged, variant = 'panel' }: InterviewDetailPanelProps) {
  const status = interviewStatus(i);
  const Icon = FORMAT_ICON[i.format] ?? Video;
  const url = safeMeetingUrl(i.location_or_link);
  const contacts = (i.interview_contacts ?? []).filter((p) => p.contacts);
  const save = (field: 'preparation_notes' | 'questions_expected') => async (v: string | null) => {
    await updateInterview(i.id, { [field]: v });
    onChanged();
  };

  return (
    <section
      aria-label={`Interview details: ${typeLabel(i.interview_type)}`}
      className={variant === 'panel' ? 'int-panel' : 'int-sheet'}
      data-testid="interview-detail"
    >
      {variant === 'panel' && (
        <div className="int-panel-h">
          <span className="xs b" style={{ letterSpacing: '.05em' }}>
            INTERVIEW
          </span>
          <span style={{ flex: 1 }} />
          <IconButton icon={<Pencil size={15} />} aria-label="Edit interview" variant="ghost" size="sm" onClick={() => onEdit(i)} />
          <IconButton icon={<X size={15} />} aria-label="Close interview details" variant="ghost" size="sm" onClick={onClose} />
        </div>
      )}
      <div className="col" style={{ padding: variant === 'panel' ? '14px 16px' : 0, gap: 14 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>
            {typeLabel(i.interview_type)}
            <span className="muted" style={{ fontWeight: 400 }}>
              {' '}
              · round {i.round_number}
            </span>
          </div>
          <div className="muted">
            {i.applications?.company_name} · {i.applications?.role_title}
          </div>
          {ownerName && <div className="small muted">Owner: {ownerName}</div>}
        </div>

        <dl className="kv">
          <dt>When</dt>
          <dd>
            <b data-testid="interview-when">{formatSlot(i.scheduled_at, i.duration_minutes, timeZone)}</b>
          </dd>
          <dt>Format</dt>
          <dd className="row" style={{ gap: 6 }}>
            <Icon size={14} aria-hidden="true" className="muted" />
            {formatLabel(i.format)}
            {url ? (
              <a href={url} target="_blank" rel="noreferrer noopener" className="row" style={{ gap: 4 }}>
                · Join link <ExternalLink size={12} aria-hidden="true" />
              </a>
            ) : (
              i.location_or_link && <span className="ell">· {i.location_or_link}</span>
            )}
          </dd>
          <dt>Status</dt>
          <dd>
            {status === 'upcoming' && <span className="pill info">Upcoming</span>}
            {status === 'needs_outcome' && (
              <span className="pill warning">
                <ClipboardPen size={12} aria-hidden="true" />
                Outcome needed
              </span>
            )}
            {status === 'completed' && <span className={`pill ${resultVariant(i.outcome)}`}>{resultLabel(i.outcome)}</span>}
            {status === 'cancelled' && (
              <span className="pill muted">
                <CalendarX size={12} aria-hidden="true" />
                Cancelled / moved
              </span>
            )}
          </dd>
        </dl>

        <div>
          <div className="sec-t" style={{ marginBottom: 6 }}>
            Participants
          </div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {contacts.map((p) => (
              <span key={p.contact_id} className="chip sm">
                {p.contacts!.full_name}
              </span>
            ))}
            {i.interviewer_names && <span className="chip sm">{i.interviewer_names}</span>}
            {!contacts.length && !i.interviewer_names && <span className="small muted">None added yet</span>}
          </div>
        </div>

        <NotesField label="Preparation notes" value={i.preparation_notes} onSave={save('preparation_notes')} placeholder="Salary range, questions to ask, strategy…" />
        <NotesField label="Questions expected" value={i.questions_expected} onSave={save('questions_expected')} placeholder="Anticipated technical or behavioral questions…" />

        {status === 'completed' && (
          <div className="col" style={{ gap: 8 }} data-testid="interview-debrief">
            <div className="sec-t">Debrief</div>
            {i.next_step && (
              <div className="small">
                <span className="muted">Next step: </span>
                {i.next_step}
              </div>
            )}
            {i.thank_you_status && (
              <div className="small">
                <span className="muted">Thank-you note: </span>
                {THANK_YOU_OPTIONS.find((t) => t.id === i.thank_you_status)?.label}
              </div>
            )}
            {i.questions_asked && (
              <div className="small" style={{ whiteSpace: 'pre-wrap' }}>
                <span className="muted">Questions asked: </span>
                {i.questions_asked}
              </div>
            )}
            {i.feedback_notes && (
              <div className="small" style={{ whiteSpace: 'pre-wrap' }}>
                <span className="muted">Notes: </span>
                {i.feedback_notes}
              </div>
            )}
          </div>
        )}

        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {status === 'needs_outcome' && (
            <Button variant="primary" size="sm" onClick={() => onRecordOutcome(i)}>
              Record outcome
            </Button>
          )}
          {status === 'completed' && (
            <Button variant="secondary" size="sm" onClick={() => onRecordOutcome(i)}>
              Edit debrief
            </Button>
          )}
          {status === 'upcoming' && (
            <Button variant="secondary" size="sm" onClick={() => onRecordOutcome(i)}>
              Cancel or move
            </Button>
          )}
          {variant === 'sheet' && (
            <Button variant="secondary" size="sm" leftIcon={<Pencil size={13} />} onClick={() => onEdit(i)}>
              Edit
            </Button>
          )}
          {variant === 'sheet' && url && i.format === 'VIDEO' && status !== 'cancelled' && (
            <a className="btn sm primary" href={url} target="_blank" rel="noreferrer noopener">
              <Video size={13} aria-hidden="true" /> Join video
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
