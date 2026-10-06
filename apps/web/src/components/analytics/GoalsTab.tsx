import { useMemo, useState } from 'react';
import { Check, Target } from 'lucide-react';
import type {
  AnalyticsOverview,
  GoalProgressResponse,
  GoalType,
} from '../../types/analytics';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import {
  GoalRing,
  GoalTrendChart,
  ProgressTrack,
  ScopeTag,
} from './AnalyticsCharts';
import { EditGoalModal } from './EditGoalModal';
import type { AnalyticsMember } from '../../lib/analyticsMembers';
import { calculateGoalTrends } from '../../lib/goalAnalytics';

interface GoalsTabProps {
  overview: AnalyticsOverview;
  progress: GoalProgressResponse | null;
  workspaceId: string;
  onRefresh: () => void;
  targetUserId?: string | null;
  isManagerAggregate?: boolean;
  singleMember?: AnalyticsMember | null;
  onSelectMember?: (userId: string) => void;
  dateRange?: string;
  startDate?: string;
  endDate?: string;
}

const GOAL_LABEL: Record<GoalType, string> = {
  APPLICATIONS: 'Applications',
  NETWORKING: 'Networking interactions',
  FOLLOW_UPS: 'Completed follow-ups',
  INTERVIEW_PREP: 'Interview prep sessions',
};

export function GoalsTab({
  progress,
  workspaceId,
  onRefresh,
  targetUserId,
  isManagerAggregate,
  singleMember,
  onSelectMember,
  dateRange = '90d',
  startDate,
  endDate,
}: GoalsTabProps) {
  const [editing, setEditing] = useState<GoalType | 'new' | null>(null);

  const trends = useMemo(() => {
    return calculateGoalTrends({
      progress,
      startDate,
      endDate,
      timeZone: progress?.timezone,
    });
  }, [progress, startDate, endDate]);

  if (isManagerAggregate) {
    return (
      <Card className="analytics-card manager-goal-message">
        <Target aria-hidden="true" />
        <div>
          <h2>Workspace goal pacing</h2>
          <p>
            The Overview pace chart uses the sum of each member's effective target.
            Select a member above to inspect or edit their individual goals.
          </p>
          {singleMember && onSelectMember && (
            <Button
              variant="outline"
              size="sm"
              style={{ marginTop: 12 }}
              onClick={() => onSelectMember(singleMember.user_id)}
            >
              Manage {singleMember.display_name || singleMember.username}'s goals
            </Button>
          )}
        </div>
      </Card>
    );
  }

  const active = progress?.active_goals ?? [];
  const history = progress?.history ?? [];
  const met = history.filter((point) => point.status === 'MET').length;

  const periodUnit =
    trends.periodType === 'DAILY'
      ? 'day'
      : trends.periodType === 'WEEKLY'
      ? 'week'
      : 'month';
  const periodUnits =
    trends.periodType === 'DAILY'
      ? 'days'
      : trends.periodType === 'WEEKLY'
      ? 'weeks'
      : 'months';

  return (
    <div className="analytics-stack goals-view">
      <div className="goals-heading">
        <div>
          <h2>Activity goals & trends</h2>
          <p>Track application targets, actual performance, and consistency over time.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing('new')}
          leftIcon={<Target size={14} />}
        >
          Add goal
        </Button>
      </div>

      {trends.hasGoal && (
        <section
          className="analytics-kpis analytics-kpis-4"
          aria-label="Goal summary metrics"
        >
          <div className="analytics-kpi">
            <span>Goal Reached</span>
            <strong>
              {trends.daysReached} of {trends.totalEligibleDays} {periodUnits}
            </strong>
            <small>Periods meeting target</small>
          </div>
          <div className="analytics-kpi">
            <span>Success Rate</span>
            <strong>
              {trends.successRate !== null ? `${trends.successRate}%` : '—'}
            </strong>
            <small>Eligible periods reached</small>
          </div>
          <div className="analytics-kpi">
            <span>Daily Average</span>
            <strong>{trends.averageDailyApplications}</strong>
            <small>Applications / active {periodUnit}</small>
          </div>
          <div className="analytics-kpi">
            <span>Current Streak</span>
            <strong>
              {trends.currentStreak}{' '}
              {trends.currentStreak === 1 ? periodUnit : periodUnits}
            </strong>
            <small>Consecutive targets met</small>
          </div>
        </section>
      )}

      <Card className="analytics-card goal-trend-card">
        <header className="analytics-card-head">
          <div>
            <h2>Target vs Actual Trend</h2>
            <p>
              {trends.hasGoal
                ? `Submitted applications against configured targets · ${dateRange}`
                : 'Configure an application goal to visualize performance trends over time'}
            </p>
          </div>
          <ScopeTag tone="current">Trend</ScopeTag>
        </header>
        {trends.hasGoal && trends.trendPoints.length > 0 ? (
          <GoalTrendChart points={trends.trendPoints} />
        ) : (
          <div className="goal-trend-empty">
            <p>
              {trends.hasGoal
                ? 'No application activity recorded in this date range.'
                : 'No application goals configured. Add a daily application goal above to start tracking consistency.'}
            </p>
          </div>
        )}
      </Card>

      <section className="goals-grid" aria-label="Active goals">
        {active.map((item) => (
          <Card className="analytics-card goal-current-card" key={item.id ?? item.goal_id}>
            <header className="analytics-card-head">
              <div>
                <h2>{GOAL_LABEL[item.goal_type]}</h2>
                <p>{item.period_type.toLowerCase()} · effective {item.effective_date}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditing(item.goal_type)}>
                Edit
              </Button>
            </header>
            <div className="goal-current-content">
              <GoalRing value={item.actual} target={item.target_value} />
              <div className="goal-progress-list">
                <div>
                  <span>
                    <strong>{GOAL_LABEL[item.goal_type]}</strong>
                    <b>{item.actual} / {item.target_value}</b>
                  </span>
                  <ProgressTrack
                    value={item.actual}
                    max={item.target_value}
                    tone={item.actual >= item.target_value ? 'positive' : 'primary'}
                  />
                </div>
                {item.goal_type === 'INTERVIEW_PREP' && (
                  <p>One interview-prep journal entry counts as one completed session.</p>
                )}
              </div>
            </div>
          </Card>
        ))}
        {active.length === 0 && (
          <Card className="analytics-card">
            <p>No active goals yet. Add one to begin tracking progress.</p>
          </Card>
        )}
      </section>

      <Card className="analytics-card goal-history-card">
        <header className="analytics-card-head">
          <div>
            <h2>Target met in {met} of {history.length} periods</h2>
            <p>Latest periods retain the target version that was effective at the time.</p>
          </div>
          <ScopeTag tone="fixed">History</ScopeTag>
        </header>
        <div className="goal-progress-list">
          {history.slice(0, 12).map((point) => (
            <div key={`${point.goal_id}-${point.period_start}`}>
              <span>
                <strong>{GOAL_LABEL[point.goal_type]} · {point.period_start}</strong>
                <b>
                  {point.actual} / {point.target_value} ({point.percentage}%) {point.status === 'MET' ? <Check size={13} /> : null}
                </b>
              </span>
              <ProgressTrack value={point.actual} max={point.target_value} tone={point.status === 'MET' ? 'positive' : 'primary'} />
            </div>
          ))}
          {history.length === 0 && <p>Completed periods will appear here.</p>}
        </div>
      </Card>

      <EditGoalModal
        key={`${targetUserId ?? 'self'}-${editing ?? 'closed'}`}
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        workspaceId={workspaceId}
        currentGoal={editing && editing !== 'new'
          ? active.find((item) => item.goal_type === editing) ?? null
          : null}
        targetUserId={targetUserId}
        onGoalUpdated={onRefresh}
      />
    </div>
  );
}
