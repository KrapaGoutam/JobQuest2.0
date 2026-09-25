import { useEffect, useMemo, useState } from 'react';
import { Video, Phone, MapPin } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Segmented } from './Segmented';
import { TimeZoneNote } from './TimeZoneNote';
import {
  fetchParticipantCandidates,
  fetchSchedulableApplications,
  scheduleInterview,
  setInterviewParticipants,
  updateInterview,
  type SchedulableApplication,
} from '../../api/interviews';
import {
  DURATION_OPTIONS,
  INTERVIEW_FORMATS,
  INTERVIEW_TYPES,
  type Interview,
} from '../../types/interviews';
import type { CanonicalWorkflow } from '../../types/applications';
import { NonexistentLocalTimeError, utcIsoToZonedWallTime, zonedWallTimeToUtcIso } from '../../lib/time';

const FORMAT_ICONS = { VIDEO: <Video size={13} aria-hidden="true" />, PHONE: <Phone size={13} aria-hidden="true" />, ONSITE: <MapPin size={13} aria-hidden="true" /> };

export interface ScheduleInterviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  workflow: CanonicalWorkflow | null;
  timeZone: string;
  onChangeTimeZone: (zone: string) => Promise<void>;
  /** Schedule for this application (application drawer); otherwise the user picks one. */
  fixedApplication?: SchedulableApplication | null;
  /** Edit mode: simple fields and participants of an existing interview. */
  editing?: Interview | null;
  onSaved: (message: string) => void;
}

/** Stage the scheduling dialog may offer to move to (never applied without an explicit choice). */
function suggestedStage(workflow: CanonicalWorkflow | null, current: string): { id: string; label: string } | null {
  const stages = workflow?.stages ?? [];
  const cur = stages.find((s) => s.id === current);
  if (!cur) return null;
  for (const id of ['INTERVIEW', 'FINAL_INTERVIEW']) {
    const s = stages.find((x) => x.id === id);
    if (s && s.order > cur.order) return { id: s.id, label: s.label };
  }
  return null;
}

export function ScheduleInterviewDialog({
  isOpen,
  onClose,
  workspaceId,
  workflow,
  timeZone,
  onChangeTimeZone,
  fixedApplication,
  editing,
  onSaved,
}: ScheduleInterviewDialogProps) {
  const isEdit = Boolean(editing);
  const [apps, setApps] = useState<SchedulableApplication[]>([]);
  const [appId, setAppId] = useState('');
  const [type, setType] = useState('RECRUITER_SCREEN');
  const [round, setRound] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('45');
  const [customDuration, setCustomDuration] = useState('');
  const [format, setFormat] = useState('VIDEO');
  const [link, setLink] = useState('');
  const [names, setNames] = useState('');
  const [prep, setPrep] = useState('');
  const [questions, setQuestions] = useState('');
  const [stageChoice, setStageChoice] = useState<'keep' | 'move'>('keep');
  const [candidates, setCandidates] = useState<{ id: string; full_name: string; relationship_type: string }[]>([]);
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // (Re)initialise whenever the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setStageChoice('keep');
    if (editing) {
      const wall = utcIsoToZonedWallTime(editing.scheduled_at, timeZone);
      setAppId(editing.application_id);
      setType(editing.interview_type);
      setRound(String(editing.round_number));
      setDate(wall.date);
      setTime(wall.time);
      const known = (DURATION_OPTIONS as readonly number[]).includes(editing.duration_minutes);
      setDuration(known ? String(editing.duration_minutes) : 'custom');
      setCustomDuration(known ? '' : String(editing.duration_minutes));
      setFormat(editing.format);
      setLink(editing.location_or_link ?? '');
      setNames(editing.interviewer_names ?? '');
      setPrep(editing.preparation_notes ?? '');
      setQuestions(editing.questions_expected ?? '');
      setContactIds((editing.interview_contacts ?? []).map((c) => c.contact_id));
    } else {
      setAppId(fixedApplication?.id ?? '');
      setType('RECRUITER_SCREEN');
      setRound('');
      setDate('');
      setTime('');
      setDuration('45');
      setCustomDuration('');
      setFormat('VIDEO');
      setLink('');
      setNames('');
      setPrep('');
      setQuestions('');
      setContactIds([]);
    }
    // timeZone intentionally excluded: changing the zone must not reset typed values.
  }, [isOpen, editing, fixedApplication]);

  useEffect(() => {
    if (!isOpen || isEdit || fixedApplication) return;
    fetchSchedulableApplications(workspaceId)
      .then(setApps)
      .catch((e: Error) => setErrors((x) => ({ ...x, submit: e.message })));
  }, [isOpen, isEdit, fixedApplication, workspaceId]);

  const selectedApp: SchedulableApplication | null = useMemo(() => {
    if (fixedApplication) return fixedApplication;
    if (editing?.applications) {
      return { id: editing.application_id, company_name: editing.applications.company_name, role_title: editing.applications.role_title, stage: editing.applications.stage, user_id: editing.user_id };
    }
    return apps.find((a) => a.id === appId) ?? null;
  }, [fixedApplication, editing, apps, appId]);

  // Participants are the application owner's own contacts (enforced by the database too).
  const ownerId = editing ? editing.user_id : selectedApp?.user_id;
  useEffect(() => {
    if (!isOpen || !ownerId) {
      setCandidates([]);
      return;
    }
    fetchParticipantCandidates(workspaceId, ownerId)
      .then(setCandidates)
      .catch(() => setCandidates([]));
  }, [isOpen, ownerId, workspaceId]);

  const stageName = (id: string) => workflow?.stages.find((s) => s.id === id)?.label ?? id;
  const suggestion = selectedApp && !isEdit ? suggestedStage(workflow, selectedApp.stage) : null;

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!isEdit && !appId) errs.app = 'Choose an application.';
    if (!date) errs.date = 'Choose a date.';
    if (!time) errs.time = 'Choose a time.';
    const minutes = duration === 'custom' ? Number(customDuration) : Number(duration);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 600) errs.duration = 'Duration must be 5–600 minutes.';
    const roundNum = round.trim() ? Number(round) : null;
    if (roundNum !== null && (!Number.isInteger(roundNum) || roundNum < 1 || roundNum > 50)) errs.round = 'Round must be a whole number from 1 to 50.';
    if (link.length > 500) errs.link = 'Keep the link or location under 500 characters.';
    if (prep.length > 5000) errs.prep = 'Preparation notes are limited to 5,000 characters.';
    if (questions.length > 5000) errs.questions = 'Questions expected are limited to 5,000 characters.';
    let scheduledAtUtc = '';
    if (!errs.date && !errs.time) {
      try {
        scheduledAtUtc = zonedWallTimeToUtcIso(date, time, timeZone);
      } catch (e) {
        errs.time = e instanceof NonexistentLocalTimeError ? `${time} does not exist on ${date} in ${timeZone} (daylight saving change). Pick another time.` : 'Invalid date or time.';
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      if (editing) {
        await updateInterview(editing.id, {
          interview_type: type as Interview['interview_type'],
          round_number: roundNum ?? editing.round_number,
          scheduled_at: scheduledAtUtc,
          duration_minutes: minutes,
          format: format as Interview['format'],
          location_or_link: link.trim() || null,
          interviewer_names: names.trim() || null,
          preparation_notes: prep.trim() || null,
          questions_expected: questions.trim() || null,
        });
        await setInterviewParticipants(editing, (editing.interview_contacts ?? []).map((c) => c.contact_id), contactIds);
        onSaved('Interview updated');
      } else {
        await scheduleInterview({
          applicationId: appId,
          interviewType: type,
          scheduledAtUtc,
          durationMinutes: minutes,
          format,
          roundNumber: roundNum,
          locationOrLink: link.trim(),
          interviewerNames: names.trim(),
          preparationNotes: prep.trim(),
          questionsExpected: questions.trim(),
          contactIds,
          moveToStage: stageChoice === 'move' && suggestion ? suggestion.id : null,
        });
        onSaved(stageChoice === 'move' && suggestion ? `Interview scheduled · stage moved to ${suggestion.label}` : 'Interview scheduled');
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
      title={isEdit ? 'Edit interview' : 'Schedule interview'}
      maxWidth={640}
      footer={
        <>
          {!isEdit && <span className="small muted">Adds “Interview scheduled” to the timeline.</span>}
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} isLoading={saving}>
            {isEdit ? 'Save changes' : 'Schedule'}
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        {errors.submit && (
          <div className="banner danger small" role="alert">
            {errors.submit}
          </div>
        )}

        {isEdit || fixedApplication ? (
          <div className="field">
            <span className="label">Application</span>
            <div className="small">
              <b>{selectedApp?.company_name}</b> · {selectedApp?.role_title}
              {selectedApp && <span className="muted"> · {stageName(selectedApp.stage)}</span>}
            </div>
          </div>
        ) : (
          <FormField label="Application" required error={errors.app}>
            {(p) => (
              <Select {...p} value={appId} onChange={(e) => setAppId(e.target.value)}>
                <option value="">Choose an open application…</option>
                {apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.company_name} · {a.role_title} ({stageName(a.stage)})
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        )}

        <div className="fgrid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 12 }}>
          <FormField label="Interview type" required>
            {(p) => (
              <Select {...p} value={type} onChange={(e) => setType(e.target.value)}>
                {INTERVIEW_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Round" optional error={errors.round} helpText={isEdit ? undefined : 'Defaults to the next round.'}>
            {(p) => <Input {...p} type="number" min={1} max={50} inputMode="numeric" value={round} onChange={(e) => setRound(e.target.value)} />}
          </FormField>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
          <FormField label="Date" required error={errors.date}>
            {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </FormField>
          <FormField label="Time" required error={errors.time}>
            {(p) => <Input {...p} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
          </FormField>
          <FormField label="Duration" required error={errors.duration}>
            {(p) => (
              <Select {...p} value={duration} onChange={(e) => setDuration(e.target.value)}>
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={String(d)}>
                    {d} min
                  </option>
                ))}
                <option value="custom">Custom</option>
              </Select>
            )}
          </FormField>
        </div>
        {duration === 'custom' && (
          <FormField label="Custom duration (minutes)" required error={errors.duration}>
            {(p) => <Input {...p} type="number" min={5} max={600} value={customDuration} onChange={(e) => setCustomDuration(e.target.value)} />}
          </FormField>
        )}
        <TimeZoneNote timeZone={timeZone} onChange={onChangeTimeZone} />

        <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
          <div className="field">
            <span className="label" id="int-format-label">
              Format
            </span>
            <Segmented
              label="Format"
              value={format}
              onChange={setFormat}
              options={INTERVIEW_FORMATS.map((f) => ({ value: f.id, label: <>{FORMAT_ICONS[f.id]}{f.label}</> }))}
            />
          </div>
          <FormField label={format === 'ONSITE' ? 'Location' : 'Meeting link'} optional error={errors.link}>
            {(p) => <Input {...p} value={link} onChange={(e) => setLink(e.target.value)} placeholder={format === 'ONSITE' ? 'Address or building' : 'https://…'} />}
          </FormField>
        </div>

        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">
            Participants <span className="opt">(optional)</span>
          </legend>
          {candidates.length > 0 ? (
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {candidates.map((c) => {
                const on = contactIds.includes(c.id);
                return (
                  <label key={c.id} className={`chip sm ${on ? 'on' : ''}`} style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setContactIds((ids) => (on ? ids.filter((x) => x !== c.id) : [...ids, c.id]))}
                      style={{ margin: 0 }}
                    />
                    {c.full_name}
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="help">{selectedApp ? 'No saved contacts yet for this application’s owner.' : 'Choose an application to pick contacts.'}</div>
          )}
          <FormField label="Other participants" optional helpText="Names you type that aren't contacts yet can be saved as contacts later.">
            {(p) => <Input {...p} value={names} onChange={(e) => setNames(e.target.value)} placeholder="e.g. Priya Nair, Marco V." />}
          </FormField>
        </fieldset>

        <FormField label="Preparation notes" optional error={errors.prep}>
          {(p) => <Textarea {...p} rows={3} value={prep} onChange={(e) => setPrep(e.target.value)} placeholder="Salary goals, questions to ask, strategic focus…" />}
        </FormField>
        <FormField label="Questions expected" optional error={errors.questions}>
          {(p) => <Textarea {...p} rows={3} value={questions} onChange={(e) => setQuestions(e.target.value)} placeholder="Anticipated technical or behavioral questions…" />}
        </FormField>

        {selectedApp && suggestion && (
          <div className="field">
            <span className="label">Application stage</span>
            <Segmented
              label="Application stage"
              value={stageChoice}
              onChange={(v) => setStageChoice(v as 'keep' | 'move')}
              describedBy="int-stage-help"
              options={[
                { value: 'keep', label: `Keep at ${stageName(selectedApp.stage)}` },
                { value: 'move', label: `Move to ${suggestion.label}` },
              ]}
            />
            <div className="help" id="int-stage-help">
              Moving the stage adds “Stage changed” to the timeline. Nothing changes automatically.
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
