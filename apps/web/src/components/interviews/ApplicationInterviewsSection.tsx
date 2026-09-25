import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, ClipboardPen, CalendarX } from 'lucide-react';
import { Button } from '../ui/Button';
import { fetchApplicationInterviews } from '../../api/interviews';
import { ScheduleInterviewDialog } from './ScheduleInterviewDialog';
import { RecordOutcomeDialog } from './RecordOutcomeDialog';
import { interviewStatus, resultLabel, resultVariant, typeLabel, type Interview } from '../../types/interviews';
import type { Application, CanonicalWorkflow } from '../../types/applications';
import { formatSlot } from '../../lib/time';

/**
 * Interviews entity card in the application detail drawer (ADR-020 right-rail
 * "Interviews" card): upcoming and completed rounds with debrief status, plus
 * Schedule / Record outcome using the same dialogs as the Interviews page.
 */
export function ApplicationInterviewsSection({
  application,
  workflow,
  timeZone,
  onChangeTimeZone,
  onChanged,
  version,
}: {
  application: Application;
  workflow: CanonicalWorkflow | null;
  timeZone: string;
  onChangeTimeZone: (zone: string) => Promise<void>;
  /** Called after a schedule/outcome so the drawer timeline and list refresh. */
  onChanged: () => void;
  version: number;
}) {
  const [items, setItems] = useState<Interview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [outcomeFor, setOutcomeFor] = useState<Interview | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchApplicationInterviews(application.id)
      .then(setItems)
      .catch((e: Error) => {
        setItems([]);
        setError(e.message);
      });
  }, [application.id]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load, version]);

  const canSchedule = application.status === 'OPEN' && !application.archived_at;
  const fixedApplication = useMemo(
    () => ({ id: application.id, company_name: application.company_name, role_title: application.role_title, stage: application.stage, user_id: application.user_id }),
    [application.id, application.company_name, application.role_title, application.stage, application.user_id],
  );
  const saved = () => {
    load();
    onChanged();
  };

  return (
    <section aria-labelledby={`app-int-${application.id}`} className="int-appcard" data-testid="application-interviews">
      <div className="row" style={{ gap: 8 }}>
        <h3 id={`app-int-${application.id}`} className="sec-t" style={{ margin: 0 }}>
          Interviews {items ? `· ${items.length}` : ''}
        </h3>
        <span style={{ flex: 1 }} />
        {canSchedule && (
          <Button size="sm" variant="secondary" leftIcon={<CalendarPlus size={13} />} onClick={() => setScheduleOpen(true)}>
            Schedule interview
          </Button>
        )}
      </div>
      {items === null ? (
        <div role="status" className="small muted">
          Loading interviews…
        </div>
      ) : error ? (
        <div role="alert" className="small danger-t">
          Could not load interviews: {error}
        </div>
      ) : items.length === 0 ? (
        <div className="small muted">No interviews yet.</div>
      ) : (
        <ul className="col" style={{ gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((i) => {
            const status = interviewStatus(i);
            return (
              <li key={i.id} className="int-appcard-row" data-status={status}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="small b ell">
                    {typeLabel(i.interview_type)} · round {i.round_number}
                  </div>
                  <div className="small muted ell">{formatSlot(i.scheduled_at, i.duration_minutes, timeZone)}</div>
                </div>
                {status === 'upcoming' && <span className="pill info">Upcoming</span>}
                {status === 'completed' && <span className={`pill ${resultVariant(i.outcome)}`}>{resultLabel(i.outcome)}</span>}
                {status === 'cancelled' && (
                  <span className="pill muted">
                    <CalendarX size={12} aria-hidden="true" />
                    Cancelled
                  </span>
                )}
                {status === 'needs_outcome' && (
                  <Button size="sm" variant="primary" leftIcon={<ClipboardPen size={13} />} onClick={() => setOutcomeFor(i)}>
                    Record outcome
                  </Button>
                )}
                {status === 'completed' && (
                  <Button size="sm" variant="ghost" onClick={() => setOutcomeFor(i)} aria-label={`Edit debrief for ${typeLabel(i.interview_type)} round ${i.round_number}`}>
                    Debrief
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ScheduleInterviewDialog
        isOpen={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        workspaceId={application.workspace_id}
        workflow={workflow}
        timeZone={timeZone}
        onChangeTimeZone={onChangeTimeZone}
        fixedApplication={fixedApplication}
        onSaved={saved}
      />
      <RecordOutcomeDialog
        isOpen={outcomeFor !== null}
        onClose={() => setOutcomeFor(null)}
        interview={outcomeFor ? { ...outcomeFor, applications: outcomeFor.applications ?? { id: application.id, company_name: application.company_name, role_title: application.role_title, stage: application.stage, status: application.status, archived_at: application.archived_at } } : null}
        workflow={workflow}
        timeZone={timeZone}
        onSaved={saved}
      />
    </section>
  );
}
