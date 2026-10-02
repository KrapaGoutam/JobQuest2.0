import { useState } from "react";
import { Check, Target } from "lucide-react";
import type { AnalyticsOverview } from "../../types/analytics";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import {
  AttainmentStrip,
  GoalRing,
  ProgressTrack,
  ScopeTag,
} from "./AnalyticsCharts";
import { EditGoalModal } from "./EditGoalModal";

interface GoalsTabProps {
  overview: AnalyticsOverview;
  workspaceId: string;
  onRefresh: () => void;
  targetUserId?: string | null;
  isManagerAggregate?: boolean;
}

export function GoalsTab({
  overview,
  workspaceId,
  onRefresh,
  targetUserId,
  isManagerAggregate,
}: GoalsTabProps) {
  const [editing, setEditing] = useState(false);
  const pacing = [...(overview.weekly_pacing || [])].sort((a, b) =>
    a.week_start.localeCompare(b.week_start),
  );
  const current = pacing.at(-1) ?? {
    week_start: "",
    week_label: "This week",
    applied: 0,
    responses: 0,
    interviews: 0,
    outreach: 0,
    target: 15,
  };
  const goal = overview.active_goal;
  const applicationsTarget = goal?.target_applications ?? current.target ?? 15;
  const outreachTarget = goal?.target_outreach ?? 5;
  const met = pacing
    .slice(-12)
    .filter((week) => week.applied >= week.target).length;

  if (isManagerAggregate)
    return (
      <Card className="analytics-card manager-goal-message">
        <Target aria-hidden="true" />
        <div>
          <h2>Workspace goal pacing</h2>
          <p>
            The Overview pace chart uses the sum of each member’s effective
            weekly target. Select a member above to inspect or edit an
            individual goal.
          </p>
        </div>
      </Card>
    );

  return (
    <div className="analytics-stack goals-view">
      <div className="goals-heading">
        <div>
          <h2>Weekly activity targets</h2>
          <p>
            Week of {current.week_label} · actuals are counted automatically
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing(true)}
          leftIcon={<Target size={14} />}
        >
          Edit targets
        </Button>
      </div>
      <section className="goals-grid">
        <Card className="analytics-card goal-current-card">
          <header className="analytics-card-head">
            <div>
              <h2>This week</h2>
              <p>
                {goal?.id ? "Active weekly goal" : "Using the default target"}
              </p>
            </div>
            <ScopeTag tone="fixed">Weekly</ScopeTag>
          </header>
          <div className="goal-current-content">
            <GoalRing value={current.applied} target={applicationsTarget} />
            <div className="goal-progress-list">
              <div>
                <span>
                  <strong>Applications</strong>
                  <b>
                    {current.applied} / {applicationsTarget}
                  </b>
                </span>
                <ProgressTrack
                  value={current.applied}
                  max={applicationsTarget}
                  tone={
                    current.applied >= applicationsTarget
                      ? "positive"
                      : "primary"
                  }
                />
              </div>
              <div>
                <span>
                  <strong>Outreach &amp; follow-ups</strong>
                  <b>
                    {current.outreach} / {outreachTarget}
                  </b>
                </span>
                <ProgressTrack
                  value={current.outreach}
                  max={outreachTarget}
                  tone={
                    current.outreach >= outreachTarget ? "positive" : "primary"
                  }
                />
              </div>
            </div>
          </div>
        </Card>
        <Card className="analytics-card goal-history-card">
          <header className="analytics-card-head">
            <div>
              <h2>
                Target met in {met} of {Math.min(12, pacing.length)} weeks
              </h2>
              <p>Latest 12 weeks · each period keeps its effective target</p>
            </div>
            <ScopeTag tone="fixed">12 weeks</ScopeTag>
          </header>
          <AttainmentStrip points={pacing} />
          <div className="attainment-legend">
            <span>
              <Check size={13} /> Target met
            </span>
            <span>— Below target</span>
          </div>
        </Card>
      </section>
      <EditGoalModal
        key={`${targetUserId ?? "self"}-${goal?.id ?? "default"}`}
        isOpen={editing}
        onClose={() => setEditing(false)}
        workspaceId={workspaceId}
        currentGoal={goal}
        targetUserId={targetUserId}
        onGoalUpdated={onRefresh}
      />
    </div>
  );
}
