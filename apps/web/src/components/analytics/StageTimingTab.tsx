import React from 'react';
import type { StageTiming } from '../../types/analytics';
import { Card } from '../ui/Card';
import { AlertCircle } from 'lucide-react';

interface StageTimingTabProps {
  data: StageTiming;
}

export function StageTimingTab({ data }: StageTimingTabProps) {
  const renderRate = (n: number, d: number) => {
    if (d === 0) return <span className="text-muted-foreground">No data</span>;
    const pct = ((n / d) * 100).toFixed(1);
    return (
      <span className="whitespace-nowrap font-bold text-foreground">
        {n}/{d} <span className="text-muted-foreground text-sm font-normal">({pct}%)</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (7 cols): How long does each step take? */}
        <div className="lg:col-span-7">
          <Card className="p-5">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-foreground">
                How long does each step take?
              </h2>
              <p className="text-xs text-muted-foreground">
                Days between first qualifying events · average, median and range
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-medium">
                    <th className="py-2.5 pr-2">Transition</th>
                    <th className="py-2.5 px-2 text-right">Median</th>
                    <th className="py-2.5 px-2 text-right">Average</th>
                    <th className="py-2.5 px-2 text-right">Range</th>
                    <th className="py-2.5 px-2 text-right">Sample</th>
                    <th className="py-2.5 pl-3 w-28">Distribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.transitions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-muted-foreground">
                        No transition data available yet
                      </td>
                    </tr>
                  ) : (
                    data.transitions.map((t) => {
                      const isFew = t.sample_size < 5;
                      const median = t.median_days ?? 0;
                      const maxScale = 30;
                      const barPct = Math.min(100, Math.max(5, (median / maxScale) * 100));

                      return (
                        <tr key={t.transition} className="hover:bg-muted/40">
                          <td className="py-2.5 pr-2 font-medium text-foreground">
                            {t.transition}
                          </td>
                          <td className="py-2.5 px-2 text-right font-bold text-foreground">
                            {t.median_days !== null ? `${t.median_days} d` : '—'}
                          </td>
                          <td className="py-2.5 px-2 text-right text-muted-foreground">
                            {t.average_days !== null ? `${t.average_days} d` : '—'}
                          </td>
                          <td className="py-2.5 px-2 text-right text-muted-foreground whitespace-nowrap">
                            {t.min_days !== null && t.max_days !== null
                              ? `${t.min_days}–${t.max_days} d`
                              : '—'}
                          </td>
                          <td className="py-2.5 px-2 text-right font-medium text-foreground">
                            {t.sample_size}
                          </td>
                          <td className="py-2.5 pl-3">
                            {isFew ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-muted text-muted-foreground"
                                title="Fewer than 5 recorded transitions"
                              >
                                <AlertCircle size={10} />
                                Insufficient data (&lt;5)
                              </span>
                            ) : (
                              <div className="h-2 w-full rounded bg-muted overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded transition-all"
                                  style={{ width: `${barPct}%` }}
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right Column (5 cols): What is stuck right now? */}
        <div className="lg:col-span-5">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">What is stuck right now?</h2>
                <p className="text-xs text-muted-foreground">
                  Open applications in the same stage for 14+ days
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-500">
                {data.stuck_applications.length} stuck
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-medium">
                    <th className="py-2 pr-2">Application</th>
                    <th className="py-2 px-2">Stage</th>
                    <th className="py-2 pl-2 text-right">In stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.stuck_applications.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-muted-foreground">
                        No applications stuck over 14 days
                      </td>
                    </tr>
                  ) : (
                    data.stuck_applications.map((app) => (
                      <tr key={app.id} className="hover:bg-muted/40">
                        <td className="py-2.5 pr-2">
                          <div className="font-semibold text-foreground truncate max-w-[140px]">
                            {app.company_name}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                            {app.role_title}
                          </div>
                        </td>
                        <td className="py-2.5 px-2">
                          <span className="px-2 py-0.5 rounded bg-muted text-foreground text-[11px]">
                            {app.stage}
                          </span>
                        </td>
                        <td className="py-2.5 pl-2 text-right font-bold text-rose-500 whitespace-nowrap">
                          {app.days_in_stage} d
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      {/* Row 2: Does following up help? */}
      <Card className="p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-foreground">Does following up help?</h2>
          <p className="text-xs text-muted-foreground">
            Response rate for applications with vs without a follow-up sent within 14 days
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <div className="p-4 rounded-xl bg-surface border border-border">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              With Follow-Up
            </div>
            <div className="text-xl mt-1">
              {renderRate(
                data.follow_up_impact?.with_follow_up?.responses ?? 0,
                data.follow_up_impact?.with_follow_up?.count ?? 0
              )}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-surface border border-border">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Without Follow-Up
            </div>
            <div className="text-xl mt-1">
              {renderRate(
                data.follow_up_impact?.without_follow_up?.responses ?? 0,
                data.follow_up_impact?.without_follow_up?.count ?? 0
              )}
            </div>
          </div>

          <div className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Correlation, not proof:</span> applications
            you follow up on may differ in other ways (e.g. higher priority roles). Follow-ups sent this
            period: <strong className="text-foreground">{data.follow_up_impact?.total_follow_ups ?? 0}</strong>.
          </div>
        </div>
      </Card>
    </div>
  );
}
