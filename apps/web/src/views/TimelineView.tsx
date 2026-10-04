import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CalendarClock, GanttChart, ListTree, RotateCw } from 'lucide-react';
import { fetchTimelineSources } from '../api/planning';
import { fetchWorkspaceMembers, type WorkspaceMemberInfo } from '../api/applications';
import { PlanningNav } from '../components/planning/PlanningNav';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Select } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import { useProfileTimeZone } from '../hooks/useProfileTimeZone';
import {
  buildTimelineLanes,
  formatDateKey,
  shiftDateKey,
  timelinePosition,
  type TimelineLane,
  type TimelineMilestone,
} from '../lib/planning';
import { dayKey, formatInZone, zonedWallTimeToUtcIso } from '../lib/time';

const RANGES = {
  '30': { label: '30 days', before: 21, after: 9 },
  '90': { label: '90 days', before: 60, after: 30 },
  '180': { label: '6 months', before: 150, after: 30 },
  '365': { label: '1 year', before: 335, after: 30 },
} as const;
type RangeKey = keyof typeof RANGES;

function isRangeKey(value: string | null | undefined): value is RangeKey {
  return Boolean(value && value in RANGES);
}

function dayBoundary(day: string, timeZone: string): string {
  try {
    return zonedWallTimeToUtcIso(day, '00:00', timeZone);
  } catch {
    return zonedWallTimeToUtcIso(day, '01:00', timeZone);
  }
}

function milestoneWhen(milestone: TimelineMilestone, timeZone: string): string {
  if (milestone.dateOnly) return formatDateKey(milestone.at.slice(0, 10), { weekday: 'short', month: 'short', day: 'numeric' });
  return formatInZone(milestone.at, timeZone, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function EventList({
  lanes,
  timeZone,
  ownerNames,
  showOwner,
  onNavigate,
}: {
  lanes: TimelineLane[];
  timeZone: string;
  ownerNames: Map<string, string>;
  showOwner: boolean;
  onNavigate: (path: string) => void;
}) {
  const applications = new Map(lanes.map((lane) => [lane.application.id, lane.application]));
  const milestones = lanes.flatMap((lane) => lane.milestones).sort((left, right) => right.at.localeCompare(left.at));
  return (
    <div className="timeline-event-list" role="list">
      {milestones.map((milestone) => {
        const application = applications.get(milestone.applicationId)!;
        return (
          <button
            key={milestone.id}
            type="button"
            role="listitem"
            className="timeline-event-row"
            onClick={() => onNavigate(`/w/${encodeURIComponent(application.workspace_id)}/applications/${encodeURIComponent(application.id)}`)}
          >
            <span className={`timeline-dot kind-${milestone.kind}`} aria-hidden="true" />
            <span className="timeline-event-date">{milestoneWhen(milestone, timeZone)}</span>
            <span className="timeline-event-copy">
              <strong>{milestone.title}</strong>
              <span className="muted small">{application.company_name} · {application.role_title}{milestone.detail ? ` · ${milestone.detail}` : ''}</span>
            </span>
            {showOwner ? <span className="muted small timeline-owner">{ownerNames.get(milestone.ownerId)}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function DurationGrid({
  lanes,
  rangeStartIso,
  rangeEndIso,
  todayIso,
  timeZone,
  onNavigate,
}: {
  lanes: TimelineLane[];
  rangeStartIso: string;
  rangeEndIso: string;
  todayIso: string;
  timeZone: string;
  onNavigate: (path: string) => void;
}) {
  const todayPosition = timelinePosition(todayIso, rangeStartIso, rangeEndIso);
  return (
    <>
      <Card className="timeline-duration-grid">
        <div className="timeline-axis">
          <span>{formatInZone(rangeStartIso, timeZone, { month: 'short', day: 'numeric' })}</span>
          <span>Today</span>
          <span>{formatInZone(new Date(Date.parse(rangeEndIso) - 1).toISOString(), timeZone, { month: 'short', day: 'numeric' })}</span>
        </div>
        <div className="timeline-grid-heading">
          <span>Application</span>
          <span>Recorded stage occupancy and scheduled interviews</span>
        </div>
        {lanes.map((lane) => (
          <button
            key={lane.application.id}
            type="button"
            className="timeline-lane"
            onClick={() => onNavigate(`/w/${encodeURIComponent(lane.application.workspace_id)}/applications/${encodeURIComponent(lane.application.id)}`)}
            aria-label={`${lane.application.company_name}, ${lane.application.role_title}. ${lane.intervals.map((interval) => `${interval.label} from ${formatInZone(interval.startAt, timeZone, { month: 'short', day: 'numeric' })} to ${formatInZone(interval.endAt, timeZone, { month: 'short', day: 'numeric' })}`).join('. ')}`}
          >
            <span className="timeline-lane-label">
              <strong>{lane.application.company_name}</strong>
              <span>{lane.application.role_title}</span>
            </span>
            <span className="timeline-lane-plot">
              <span className="timeline-today-line" style={{ left: `${todayPosition}%` }} aria-hidden="true" />
              {lane.intervals.map((interval) => {
                const left = timelinePosition(interval.startAt, rangeStartIso, rangeEndIso);
                const right = timelinePosition(interval.endAt, rangeStartIso, rangeEndIso);
                return (
                  <span
                    key={interval.id}
                    className={`timeline-bar ${interval.kind} ${interval.openEnded ? 'open-ended' : ''}`}
                    style={{ left: `${left}%`, width: `${Math.max(interval.kind === 'interview' ? 0.8 : 1.2, right - left)}%` }}
                    title={`${interval.label}: ${formatInZone(interval.startAt, timeZone, { month: 'short', day: 'numeric' })} – ${formatInZone(interval.endAt, timeZone, { month: 'short', day: 'numeric' })}`}
                  >
                    <span>{interval.label}</span>
                  </span>
                );
              })}
            </span>
          </button>
        ))}
      </Card>

      <div className="timeline-mobile-lanes">
        {lanes.map((lane) => (
          <Card key={lane.application.id}>
            <CardBody>
              <button type="button" className="timeline-mobile-title" onClick={() => onNavigate(`/w/${encodeURIComponent(lane.application.workspace_id)}/applications/${encodeURIComponent(lane.application.id)}`)}>
                <strong>{lane.application.company_name}</strong>
                <span>{lane.application.role_title}</span>
              </button>
              <ul className="timeline-interval-list">
                {lane.intervals.map((interval) => (
                  <li key={interval.id}>
                    <span className={`planning-kind ${interval.kind === 'stage' ? 'planning-kind-next_action' : 'planning-kind-interview'}`}>{interval.kind === 'stage' ? 'Stage' : 'Interview'}</span>
                    <span><strong>{interval.label}</strong><br /><span className="muted small">{formatInZone(interval.startAt, timeZone, { month: 'short', day: 'numeric' })} – {formatInZone(interval.endAt, timeZone, { month: 'short', day: 'numeric' })}{interval.openEnded ? ' · current as of today' : ''}</span></span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}

export function TimelineView({
  activeWorkspaceId,
  currentUserId,
  isManager,
  initialRange,
  initialMode,
  onStateChange,
  onNavigate,
}: {
  activeWorkspaceId: string | null;
  currentUserId: string | null;
  isManager: boolean;
  initialRange?: string | null;
  initialMode?: string | null;
  onStateChange: (range: string, mode: 'events' | 'duration') => void;
  onNavigate: (path: string) => void;
}) {
  const { timeZone, loaded: timeLoaded } = useProfileTimeZone(currentUserId);
  const [rangeKey, setRangeKey] = useState<RangeKey>(isRangeKey(initialRange) ? initialRange : '90');
  const [mode, setMode] = useState<'events' | 'duration'>(initialMode === 'duration' ? 'duration' : 'events');
  const [ownerId, setOwnerId] = useState('');
  const [members, setMembers] = useState<WorkspaceMemberInfo[]>([]);
  const [lanes, setLanes] = useState<TimelineLane[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isRangeKey(initialRange)) setRangeKey(initialRange);
    if (initialMode === 'events' || initialMode === 'duration') setMode(initialMode);
  }, [initialMode, initialRange]);

  useEffect(() => {
    if (!activeWorkspaceId || !isManager) {
      setMembers([]);
      setOwnerId('');
      return;
    }
    void fetchWorkspaceMembers(activeWorkspaceId).then(setMembers).catch(() => setMembers([]));
  }, [activeWorkspaceId, isManager]);

  const bounds = useMemo(() => {
    const today = dayKey(Date.now(), timeZone);
    const config = RANGES[rangeKey];
    const startDay = shiftDateKey(today, -config.before);
    const endDayExclusive = shiftDateKey(today, config.after + 1);
    return {
      today,
      startDay,
      endDayExclusive,
      startIso: dayBoundary(startDay, timeZone),
      endIso: dayBoundary(endDayExclusive, timeZone),
    };
  }, [rangeKey, timeZone]);

  const load = useCallback(async () => {
    if (!activeWorkspaceId || !timeLoaded) return;
    setLoading(true);
    setError(null);
    try {
      const source = await fetchTimelineSources(activeWorkspaceId, {
        startDay: bounds.startDay,
        endDayExclusive: bounds.endDayExclusive,
        startIso: bounds.startIso,
        endIso: bounds.endIso,
        ownerId: ownerId || undefined,
      });
      setLanes(buildTimelineLanes(source, bounds.startIso, bounds.endIso));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load Timeline.');
      setLanes([]);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, bounds, ownerId, timeLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  const ownerNames = useMemo(() => new Map(members.map((member) => [member.user_id, member.display_name || member.username])), [members]);
  const milestoneCount = lanes.reduce((total, lane) => total + lane.milestones.length, 0);
  const intervalCount = lanes.reduce((total, lane) => total + lane.intervals.length, 0);
  const chooseRange = (value: RangeKey) => {
    setRangeKey(value);
    onStateChange(value, mode);
  };
  const chooseMode = (value: 'events' | 'duration') => {
    setMode(value);
    onStateChange(rangeKey, value);
  };

  return (
    <div className="planning-page" data-testid="timeline-view">
      <PlanningNav currentPath="/timeline" onNavigate={onNavigate} />
      <header className="planning-page-header">
        <div>
          <p className="eyebrow">Across all applications</p>
          <h1>Timeline</h1>
          <p className="muted">Recorded milestones and honest duration ranges. Point events never become invented bars.</p>
        </div>
        <div className="planning-header-actions">
          {isManager ? (
            <Select aria-label="Timeline owner" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
              <option value="">All members</option>
              {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.username}</option>)}
            </Select>
          ) : null}
          <Select aria-label="Timeline range" value={rangeKey} onChange={(event) => chooseRange(event.target.value as RangeKey)}>
            {(Object.entries(RANGES) as [RangeKey, (typeof RANGES)[RangeKey]][]).map(([value, range]) => <option key={value} value={value}>{range.label}</option>)}
          </Select>
          <div className="segmented-control" aria-label="Timeline mode">
            <button type="button" aria-pressed={mode === 'events'} onClick={() => chooseMode('events')}><ListTree size={15} /> Events</button>
            <button type="button" aria-pressed={mode === 'duration'} onClick={() => chooseMode('duration')}><GanttChart size={15} /> Duration</button>
          </div>
        </div>
      </header>

      <div className="planning-summary-row" aria-label="Timeline summary">
        <Card><CardBody><Activity size={18} aria-hidden="true" /><span><strong>{milestoneCount}</strong> milestones</span></CardBody></Card>
        <Card><CardBody><GanttChart size={18} aria-hidden="true" /><span><strong>{intervalCount}</strong> real ranges</span></CardBody></Card>
        <Card><CardBody><CalendarClock size={18} aria-hidden="true" /><span>{formatDateKey(bounds.startDay)} – {formatDateKey(shiftDateKey(bounds.endDayExclusive, -1))}</span></CardBody></Card>
      </div>

      {loading ? (
        <div className="planning-loading" role="status" aria-label="Loading Timeline"><Skeleton height={420} /></div>
      ) : error ? (
        <EmptyState icon={<RotateCw size={22} />} title="Timeline could not load" description={error} action={<Button onClick={() => void load()}>Try again</Button>} />
      ) : lanes.length === 0 ? (
        <EmptyState title="No application history in this range" description="Choose a wider range or another workspace member." />
      ) : mode === 'events' ? (
        <EventList lanes={lanes} timeZone={timeZone} ownerNames={ownerNames} showOwner={isManager && !ownerId} onNavigate={onNavigate} />
      ) : (
        <DurationGrid lanes={lanes} rangeStartIso={bounds.startIso} rangeEndIso={bounds.endIso} todayIso={dayBoundary(bounds.today, timeZone)} timeZone={timeZone} onNavigate={onNavigate} />
      )}

      <aside className="timeline-honesty-note">
        <strong>Duration semantics</strong>
        <span>Stage bars run from exact recorded entry to the next transition, closure, archive, or today. Interview bars use scheduled start plus saved duration. Tasks and next actions remain milestones.</span>
      </aside>
      <span className="sr-only" aria-live="polite">{loading ? 'Loading Timeline' : `${lanes.length} application lanes loaded`}</span>
    </div>
  );
}
