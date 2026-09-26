import { ArrowUpRight, CalendarDays, Clock, Target, TriangleAlert } from 'lucide-react';
import type { AnalyticsOverview, StageTiming } from '../../types/analytics';
import type { Interview } from '../../types/interviews';
import type { QueueItem } from '../../lib/queue';
import type { QuietApplication } from '../../api/tasks';
import type { DashboardApplication } from '../../api/dashboard';
import type { DashboardWidgetDefinition, DashboardWidgetLayout } from '../../lib/dashboard';
import { dayKey, formatInZone } from '../../lib/time';

export interface DashboardWidgetData {
  today: AnalyticsOverview;
  week: AnalyticsOverview;
  month: AnalyticsOverview;
  all: AnalyticsOverview;
  timing: StageTiming;
  applications: DashboardApplication[];
  queue: QueueItem[];
  interviews: Interview[];
  quiet: { items: QuietApplication[]; total: number };
  timeZone: string;
}

interface DashboardWidgetCardProps {
  definition: DashboardWidgetDefinition;
  layout: DashboardWidgetLayout;
  data: DashboardWidgetData;
  onNavigate: (path: string) => void;
}

const DRILLS: Record<string, string> = {
  'applications-today': '/applications',
  'active-applications': '/applications',
  'follow-ups-due': '/tasks',
  'overdue-follow-ups': '/tasks',
  'upcoming-interviews': '/interviews',
  rejections: '/applications',
  ghosted: '/applications',
  offers: '/applications',
  acceptances: '/applications',
  'reminder-center': '/tasks',
  'calendar-preview': '/calendar',
  'aging-applications': '/analytics/aging',
};

function outcomeCount(data: AnalyticsOverview, outcome: string): number {
  return data.outcomes_breakdown.find((row) => row.outcome === outcome)?.count ?? 0;
}

function Metric({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="dash-widget-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Bars({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (rows.length === 0) return <p className="small muted dash-widget-empty">No data yet.</p>;
  return (
    <div className="dash-bars">
      {rows.slice(0, 8).map((row) => (
        <div key={row.label} className="dash-bar-row">
          <span className="ell" title={row.label}>{row.label}</span>
          <i><b style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }} /></i>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

function GoalProgress({ data, period }: { data: AnalyticsOverview; period: 'day' | 'week' }) {
  const goal = data.active_goal;
  if (!goal) return <p className="small muted dash-widget-empty">No active goal. Add one from Analytics.</p>;
  const actual = data.total_applications;
  const target = period === 'day' ? Math.max(1, Math.ceil(goal.target_applications / 5)) : goal.target_applications;
  const pct = Math.min(100, Math.round((actual / Math.max(1, target)) * 100));
  return (
    <div className="dash-goal">
      <div className="row"><Target size={18} aria-hidden="true" /><strong>{actual} / {target}</strong><span className="muted small">{pct}%</span></div>
      <div
        className="dash-progress"
        role="progressbar"
        aria-label={`${actual} of ${target} applications`}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(actual, target)}
      >
        <i style={{ width: `${pct}%` }} />
      </div>
      <span className="small muted">Applications this {period}</span>
    </div>
  );
}

function WorkArrangement({ applications }: { applications: DashboardApplication[] }) {
  const counts = new Map<string, number>();
  for (const application of applications) {
    const label = application.work_arrangement || 'Not specified';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return <Bars rows={[...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)} />;
}

function RecentApplications({ applications, timeZone }: { applications: DashboardApplication[]; timeZone: string }) {
  if (applications.length === 0) return <p className="small muted dash-widget-empty">No application activity yet.</p>;
  return (
    <div className="dash-widget-list">
      {applications.slice(0, 5).map((application) => (
        <div key={application.id}>
          <span className="ell"><b>{application.company_name}</b> · {application.role_title}</span>
          <time className="small muted" dateTime={application.last_activity_at}>
            {formatInZone(application.last_activity_at, timeZone, { month: 'short', day: 'numeric' })}
          </time>
        </div>
      ))}
    </div>
  );
}

function content(id: string, data: DashboardWidgetData) {
  const activeCount = data.applications.filter((application) => application.status === 'OPEN').length;
  const reminders = data.queue.filter((item) => item.kind === 'REMINDER');
  const followUps = data.queue.filter((item) => item.kind === 'FOLLOW_UP');
  const overdueFollowUps = followUps.filter((item) => item.state === 'overdue');
  const highPriority = data.applications.filter((application) => application.priority === 'HIGH' && application.status === 'OPEN');
  const todayKey = dayKey(Date.now(), data.timeZone);

  switch (id) {
    case 'applications-today': return <Metric value={data.today.total_applications} label="applied today" />;
    case 'applications-week': return <Metric value={data.week.total_applications} label="applied this week" />;
    case 'applications-month': return <Metric value={data.month.total_applications} label="applied this month" />;
    case 'active-applications': return <Metric value={activeCount} label="open applications" />;
    case 'follow-ups-due': return <Metric value={followUps.filter((item) => item.state === 'today' || item.state === 'overdue').length} label="due now" />;
    case 'overdue-follow-ups': return <Metric value={overdueFollowUps.length} label="past due" />;
    case 'upcoming-interviews': return <Metric value={data.interviews.length} label="scheduled ahead" />;
    case 'responses': return <Metric value={data.month.response_count} label="responses this month" />;
    case 'rejections': return <Metric value={outcomeCount(data.all, 'REJECTED')} label="closed as rejected" />;
    case 'ghosted': return <Metric value={outcomeCount(data.all, 'GHOSTED')} label="closed as ghosted" />;
    case 'offers': return <Metric value={data.all.offer_count} label="ever reached offer" />;
    case 'acceptances': return <Metric value={data.all.accepted_count} label="accepted" />;
    case 'daily-goals': return <GoalProgress data={data.today} period="day" />;
    case 'daily-goal-chart': return <GoalProgress data={data.today} period="day" />;
    case 'weekly-goals': return <GoalProgress data={data.week} period="week" />;
    case 'goal-comparison': return <GoalProgress data={data.week} period="week" />;
    case 'activity-chart': return <Bars rows={data.all.weekly_pacing.map((row) => ({ label: row.week_label, value: row.applied }))} />;
    case 'job-funnel': return <Bars rows={data.all.historical_funnel.map((row) => ({ label: row.stage, value: row.count }))} />;
    case 'applications-stage': return <Bars rows={data.all.current_pipeline.map((row) => ({ label: row.stage, value: row.count }))} />;
    case 'applications-source': return <Bars rows={data.all.sources_breakdown.map((row) => ({ label: row.source, value: row.apps }))} />;
    case 'applications-work-arrangement': return <WorkArrangement applications={data.applications} />;
    case 'resume-performance': return <Bars rows={data.all.resumes_breakdown.map((row) => ({ label: row.title, value: row.interviews }))} />;
    case 'goal-trends': return <Bars rows={data.all.weekly_pacing.map((row) => ({ label: row.week_label, value: row.target ? Math.round((row.applied / row.target) * 100) : 0 }))} />;
    case 'reminder-center': return <Metric value={reminders.filter((item) => item.state === 'today' || item.state === 'overdue').length} label="reminders due" />;
    case 'aging-applications': return <Metric value={data.quiet.total} label="waiting 31+ days" />;
    case 'stage-duration': return <Bars rows={data.timing.transitions.map((row) => ({ label: row.transition, value: row.median_days ?? 0 }))} />;
    case 'recent-activity': return <RecentApplications applications={data.applications} timeZone={data.timeZone} />;
    case 'pinned-applications': return highPriority.length === 0
      ? <p className="small muted dash-widget-empty">No high-priority active applications.</p>
      : <RecentApplications applications={highPriority} timeZone={data.timeZone} />;
    case 'health-summary': return (
      <div className="dash-health">
        <span><b>{activeCount}</b> open</span>
        <span><TriangleAlert size={13} aria-hidden="true" /><b>{data.quiet.total}</b> long waiting</span>
        <span><Clock size={13} aria-hidden="true" /><b>{overdueFollowUps.length}</b> follow-ups overdue</span>
      </div>
    );
    case 'calendar-preview': {
      const next = data.interviews[0];
      return next ? (
        <div className="dash-calendar-preview">
          <CalendarDays size={20} aria-hidden="true" />
          <div><b>{next.applications?.company_name || 'Interview'}</b><span className="small muted">{formatInZone(next.scheduled_at, data.timeZone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
        </div>
      ) : <p className="small muted dash-widget-empty">No upcoming dated events after {todayKey}.</p>;
    }
    default: return <p className="small muted dash-widget-empty">No data yet.</p>;
  }
}

export function DashboardWidgetCard({ definition, layout, data, onNavigate }: DashboardWidgetCardProps) {
  const drill = DRILLS[definition.id];
  return (
    <article
      className={`card dash-widget dash-widget-${definition.kind}`}
      style={{ gridColumn: `span ${layout.width}`, gridRow: `span ${layout.height}` }}
      data-widget-id={definition.id}
    >
      <header>
        <div><h3>{definition.name}</h3><span>{definition.kind}</span></div>
        {drill && (
          <button type="button" className="ibtn ghost" aria-label={`Open ${definition.name}`} onClick={() => onNavigate(drill)}>
            <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="dash-widget-body">{content(definition.id, data)}</div>
    </article>
  );
}
