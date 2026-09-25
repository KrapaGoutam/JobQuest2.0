import React, { useState } from 'react';
import type { AnalyticsOverview } from '../../types/analytics';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { EditGoalModal } from './EditGoalModal';
import { Target, CheckCircle2, Check } from 'lucide-react';

interface GoalsTabProps {
  overview: AnalyticsOverview;
  workspaceId: string;
  onRefresh: () => void;
  targetUserId?: string | null;
  isManagerAggregate?: boolean;
}

export function GoalsTab({ overview, workspaceId, onRefresh, targetUserId, isManagerAggregate }: GoalsTabProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const activeGoal = overview.active_goal;
  const pacing = overview.weekly_pacing || [];

  // Current week is the last item in weekly pacing
  const currentWeek = pacing[pacing.length - 1] || {
    week_label: 'This week',
    applied: 0,
    responses: 0,
    interviews: 0,
    outreach: 0,
    target: activeGoal?.target_applications ?? 15,
  };

  const appTarget = activeGoal?.target_applications ?? 15;
  const outreachTarget = activeGoal?.target_outreach ?? 5;
  const appPct = Math.min(100, Math.round((currentWeek.applied / Math.max(1, appTarget)) * 100));
  const isAppMet = currentWeek.applied >= appTarget;

  if (isManagerAggregate) {
    return (
      <Card className="p-6">
        <h2 className="text-base font-semibold text-foreground">Workspace goal pacing</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The Overview chart uses the sum of each member&apos;s effective weekly target.
          Select a workspace member above to inspect or edit that member&apos;s goal history.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Weekly Activity Targets</h2>
          <p className="text-xs text-muted-foreground">
            Goals · week of {currentWeek.week_label} (profile week start)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)} className="gap-2" disabled={isManagerAggregate}>
          <Target size={14} />
          Edit targets
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Card: This Week */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-base font-semibold text-foreground">This week</span>
            <span className="text-xs text-muted-foreground">{currentWeek.week_label}</span>
          </div>

          <div className="space-y-5">
            {/* Applications Progress */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-foreground">Applications Submitted</span>
                <span className="flex items-center gap-1.5">
                  <strong className="text-foreground">{currentWeek.applied}</strong> / {appTarget}
                  {isAppMet && <CheckCircle2 size={14} className="text-emerald-500" />}
                </span>
              </div>
              <div className="h-2.5 rounded bg-muted overflow-hidden">
                <div
                  className={`h-full ${isAppMet ? 'bg-emerald-500' : 'bg-primary'} rounded transition-all`}
                  style={{ width: `${appPct}%` }}
                />
              </div>
            </div>

            {/* Outreach Progress */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-foreground">Outreach &amp; Follow-ups</span>
                <span className="flex items-center gap-1.5">
                  <strong className="text-foreground">{currentWeek.outreach}</strong> / {outreachTarget}
                  {currentWeek.outreach >= outreachTarget && (
                    <CheckCircle2 size={14} className="text-emerald-500" />
                  )}
                </span>
              </div>
              <div className="h-2.5 rounded bg-muted overflow-hidden">
                <div
                  className={`h-full ${
                    currentWeek.outreach >= outreachTarget ? 'bg-emerald-500' : 'bg-primary'
                  } rounded transition-all`}
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round((currentWeek.outreach / Math.max(1, outreachTarget)) * 100)
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div className="pt-3 border-t border-border text-xs text-muted-foreground leading-relaxed">
              Actuals are counted automatically from your activity events; they are never typed in.
              Weekly periods use your workspace/profile week start.
            </div>
          </div>
        </Card>

        {/* Card: History (Last weeks pacing) */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-base font-semibold text-foreground">Recent History</span>
            <span className="text-xs text-muted-foreground">Past weeks · target met</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-medium">
                  <th className="py-2.5 pr-2">Week</th>
                  <th className="py-2.5 px-2 text-right">Apps</th>
                  <th className="py-2.5 px-2 text-right">Outreach</th>
                  <th className="py-2.5 pl-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pacing.slice(-6).reverse().map((w) => {
                  const met = w.applied >= (w.target || appTarget);
                  return (
                    <tr key={w.week_label} className="hover:bg-muted/40">
                      <td className="py-2.5 pr-2 font-medium text-foreground">{w.week_label}</td>
                      <td className="py-2.5 px-2 text-right">
                        <strong className="text-foreground">{w.applied}</strong> / {w.target || appTarget}
                      </td>
                      <td className="py-2.5 px-2 text-right text-muted-foreground">
                        {w.outreach}
                      </td>
                      <td className="py-2.5 pl-2 text-right">
                        {met ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-500">
                            Met <Check size={12} />
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 pt-3 border-t border-border text-xs text-muted-foreground leading-relaxed">
            Each week uses the goal effective for that period. Later target edits cannot delete
            earlier effective periods.
          </div>
        </Card>
      </div>

      <EditGoalModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        workspaceId={workspaceId}
        currentGoal={activeGoal}
        targetUserId={targetUserId}
        onGoalUpdated={onRefresh}
      />
    </div>
  );
}
