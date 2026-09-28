import { useEffect, useState, type ReactNode } from 'react';
import { CircleCheck, ArrowUpRight, CircleX, CalendarX } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Segmented } from './Segmented';
import { recordInterviewOutcome } from '../../api/interviews';
import {
  INTERVIEW_RESULTS,
  THANK_YOU_OPTIONS,
  interviewStatus,
  typeLabel,
  type Interview,
  type InterviewOutcome,
  type ThankYouStatus,
} from '../../types/interviews';
import type { CanonicalWorkflow } from '../../types/applications';
import { formatInZone } from '../../lib/time';

const RESULT_ICONS: Record<string, ReactNode> = {
  PENDING: <CircleCheck size={13} aria-hidden="true" />,
  PASSED: <ArrowUpRight size={13} aria-hidden="true" />,
  FAILED: <CircleX size={13} aria-hidden="true" />,
  CANCELLED: <CalendarX size={13} aria-hidden="true" />,
};

export interface RecordOutcomeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  interview: Interview | null;
  workflow: CanonicalWorkflow | null;
  timeZone: string;
  onSaved: (message: string) => void;
}

/**
 * Debrief (Gate 02B I4). Saves through rpc_record_interview_outcome in one
 * transaction. The result never moves the application stage; a stage move is a
 * separate, explicit choice below the form.
 */
export function RecordOutcomeDialog({ isOpen, onClose, interview, workflow, timeZone, onSaved }: RecordOutcomeDialogProps) {
  const [outcome, setOutcome] = useState<InterviewOutcome | null>(null);
  const [nextStep, setNextStep] = useState('');
  const [asked, setAsked] = useState('');
  const [notes, setNotes] = useState('');
  const [thankYou, setThankYou] = useState<ThankYouStatus>('TO_SEND');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [moveTo, setMoveTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !interview) return;
    setOutcome(interview.outcome ?? (interviewStatus(interview) === 'upcoming' ? 'CANCELLED' : null));
    setNextStep(interview.next_step ?? '');
    setAsked(interview.questions_asked ?? '');
    setNotes(interview.feedback_notes ?? '');
    setThankYou(interview.thank_you_status ?? 'TO_SEND');
    setNextAction('');
    setNextActionDate('');
    setMoveTo('');
    setError(null);
    // Reset only when a different interview opens (the parent may pass a fresh object each render).
  }, [isOpen, interview?.id]);

  if (!interview) return null;
  const upcoming = interviewStatus(interview) === 'upcoming';
  const results = upcoming ? INTERVIEW_RESULTS.filter((r) => r.id === 'CANCELLED') : INTERVIEW_RESULTS;
  const app = interview.applications;
  const stages = workflow?.stages ?? [];
  const current = stages.find((s) => s.id === app?.stage);
  const laterStages = current ? stages.filter((s) => s.order > current.order) : [];
  const when = formatInZone(interview.scheduled_at, timeZone, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  const submit = async () => {
    if (!outcome) {
      setError('Choose a result.');
      return;
    }
    if (nextAction.length > 255 || nextStep.length > 255) {
      setError('Next step and next action are limited to 255 characters.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await recordInterviewOutcome({
        interviewId: interview.id,
        outcome,
        feedbackNotes: notes.trim(),
        questionsAsked: asked.trim(),
        nextStep: nextStep.trim(),
        thankYouStatus: outcome === 'CANCELLED' ? interview.thank_you_status : thankYou,
        nextAction: nextAction.trim() || undefined,
        nextActionDate: nextAction.trim() ? nextActionDate || null : null,
        moveToStage: moveTo || null,
      });
      onSaved(outcome === 'CANCELLED' ? 'Interview marked cancelled' : 'Outcome saved');
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
      title={upcoming ? 'Cancel or move interview' : 'How did it go?'}
      description={`${typeLabel(interview.interview_type)} · round ${interview.round_number} · ${app?.company_name ?? ''} · ${when}`}
      maxWidth={660}
      footer={
        <>
          {outcome && outcome !== 'CANCELLED' && (
            <span className="small muted">Adds “{typeLabel(interview.interview_type)} completed” to the timeline.</span>
          )}
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} isLoading={saving}>
            Save outcome
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        {error && (
          <div className="banner danger small" role="alert">
            {error}
          </div>
        )}
        <div className="field">
          <span className="label">
            Result <span className="req" aria-hidden="true">*</span>
          </span>
          <Segmented
            label="Result"
            value={outcome}
            onChange={(v) => setOutcome(v as InterviewOutcome)}
            options={results.map((r) => ({ value: r.id, label: <>{RESULT_ICONS[r.id]}{r.label}</> }))}
          />
          {upcoming && <div className="help">A result can be recorded once the interview has started. To change the time, edit the interview instead.</div>}
        </div>

        {outcome !== 'CANCELLED' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
              <div className="field">
                <span className="label">Participants</span>
                <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                  {(interview.interview_contacts ?? []).filter((p) => p.contacts).map((p) => (
                    <span key={p.contact_id} className="chip sm">
                      {p.contacts!.full_name}
                    </span>
                  ))}
                  {interview.interviewer_names && (
                    <span className="chip sm">
                      {interview.interviewer_names}
                      <span className="pill muted" style={{ height: 18 }}>
                        not a contact
                      </span>
                    </span>
                  )}
                  {!interview.interviewer_names && !(interview.interview_contacts ?? []).length && <span className="small muted">None recorded</span>}
                </div>
              </div>
              <FormField label="Next step they mentioned" optional>
                {(p) => <Input {...p} value={nextStep} maxLength={255} onChange={(e) => setNextStep(e.target.value)} placeholder="Decision by early October" />}
              </FormField>
            </div>
            <FormField label="Questions they asked" optional>
              {(p) => <Textarea {...p} rows={3} value={asked} maxLength={5000} onChange={(e) => setAsked(e.target.value)} />}
            </FormField>
            <FormField label="Notes" optional helpText="Saved to the interview and shown on the application timeline.">
              {(p) => <Textarea {...p} rows={3} value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} placeholder="Performance notes, impressions, red flags…" />}
            </FormField>
            <div className="fsec">
              <div className="sec-t">Follow-up</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12, marginTop: 8 }}>
                <div className="field">
                  <span className="label">Thank-you note</span>
                  <Segmented label="Thank-you note" value={thankYou} onChange={(v) => setThankYou(v as ThankYouStatus)} options={THANK_YOU_OPTIONS.map((t) => ({ value: t.id, label: t.label }))} />
                </div>
                <div className="col" style={{ gap: 6 }}>
                  <FormField label="Next action" optional helpText="Replaces the application's next action.">
                    {(p) => <Input {...p} value={nextAction} maxLength={255} onChange={(e) => setNextAction(e.target.value)} placeholder="Send thank-you note" />}
                  </FormField>
                  {nextAction.trim() && (
                    <FormField label="Next action due" optional>
                      {(p) => <Input {...p} type="date" value={nextActionDate} onChange={(e) => setNextActionDate(e.target.value)} />}
                    </FormField>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {app && app.status === 'OPEN' && laterStages.length > 0 && (
          <FormField label="Application stage" optional helpText="Saving an outcome never moves the stage by itself. Choose a stage only if you want to move it now.">
            {(p) => (
              <Select {...p} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">Keep at {current?.label ?? app.stage}</option>
                {laterStages.map((s) => (
                  <option key={s.id} value={s.id}>
                    Move to {s.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        )}
      </div>
    </Dialog>
  );
}
