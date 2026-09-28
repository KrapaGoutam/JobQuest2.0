import React from 'react';
import type { AnalyticsOverview } from '../../types/analytics';
import { Card } from '../ui/Card';

interface AnalyticsOverviewTabProps {
  data: AnalyticsOverview;
  isManager?: boolean;
}

export function AnalyticsOverviewTab({ data, isManager }: AnalyticsOverviewTabProps) {
  // Helper for rates: numerator/denominator (pct) with sample floor < 5
  const renderRate = (n: number, d: number, small = false) => {
    if (d === 0) return <span className="text-muted-foreground">No data</span>;
    if (d < 5 && small) {
      return (
        <span className="text-muted-foreground" title="Fewer than 5 applications">
          {n}/{d} · <i className="italic">too few</i>
        </span>
      );
    }
    const pct = ((n / d) * 100).toFixed(1);
    return (
      <span className="whitespace-nowrap">
        <strong className="font-semibold text-foreground">{n}</strong>/{d}{' '}
        <span className="text-muted-foreground text-xs font-normal">({pct}%)</span>
      </span>
    );
  };

  // Render SVG Weekly Pacing Chart
  const renderActivitySvg = () => {
    const points = data.weekly_pacing || [];
    const W = 560;
    const H = 150;
    const bw = 24;
    const count = points.length || 12;
    const gap = (W - 40 - count * bw) / Math.max(1, count - 1);
    const maxVal = Math.max(20, ...points.map((p) => Math.max(p.applied, p.target)));
    const scale = (H - 20) / maxVal;
    const targetVal = points[0]?.target || 15;

    return (
      <svg
        viewBox={`0 0 ${W} ${H + 28}`}
        className="w-full h-auto overflow-visible select-none"
        role="img"
        aria-label="Applications, responses and interviews per week, last 12 weeks"
      >
        {/* Horizontal gridlines */}
        {[0, 5, 10, 15, 20].map((v) => {
          const y = H - v * scale;
          if (y < 10) return null;
          return (
            <g key={v}>
              <line x1="28" x2={W} y1={y} y2={y} stroke="var(--border)" strokeDasharray="2 2" />
              <text x="0" y={y + 3} fontSize="10" fill="var(--muted-foreground)">
                {v}
              </text>
            </g>
          );
        })}

        {/* Goal line */}
        <line
          x1="28"
          x2={W}
          y1={H - targetVal * scale}
          y2={H - targetVal * scale}
          stroke="var(--warning, #f59e0b)"
          strokeDasharray="4 3"
          strokeWidth="1.5"
        />
        <text
          x={W - 75}
          y={H - targetVal * scale - 5}
          fontSize="10"
          fill="var(--warning, #f59e0b)"
          fontWeight="600"
        >
          Goal {targetVal}/wk
        </text>

        {/* Bars per week */}
        {points.map((pt, i) => {
          const x = 32 + i * (bw + gap);
          const appH = Math.max(2, pt.applied * scale);
          const respH = Math.max(0, pt.responses * scale);
          const ivH = Math.max(0, pt.interviews * scale);

          return (
            <g key={i}>
              {/* Applied bar (background tint) */}
              <rect
                x={x}
                y={H - appH}
                width={bw}
                height={appH}
                rx="3"
                fill="var(--primary-subtle, rgba(59, 130, 246, 0.25))"
              />
              {/* Response bar */}
              <rect
                x={x}
                y={H - respH}
                width={bw}
                height={respH}
                rx="2"
                fill="var(--primary, #3b82f6)"
              />
              {/* Interview bar (accent overlay) */}
              <rect
                x={x + 4}
                y={H - ivH}
                width={bw - 8}
                height={ivH}
                rx="2"
                fill="var(--accent, #10b981)"
              />
              {/* Week label */}
              <text
                x={x + bw / 2}
                y={H + 16}
                fontSize="9"
                fill="var(--muted-foreground)"
                textAnchor="middle"
              >
                {pt.week_label}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  const maxHistorical = Math.max(1, data.total_applications);

  return (
    <div className="space-y-6">
      {/* 5 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-surface border border-border rounded-xl p-4 shadow-sm">
        <div className="p-2 border-b sm:border-b-0 sm:border-r border-border">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Applications
          </div>
          <div
            className="text-2xl font-bold text-foreground mt-1"
            data-testid="analytics-total-applications"
          >
            {data.total_applications.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {isManager ? 'Workspace aggregate' : 'In selected window'}
          </div>
        </div>

        <div className="p-2 border-b sm:border-b-0 sm:border-r border-border">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Response Rate
          </div>
          <div className="text-lg font-bold text-foreground mt-1">
            {renderRate(data.response_count, data.total_applications)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Any recruiter reply</div>
        </div>

        <div className="p-2 border-b sm:border-b-0 sm:border-r border-border">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Reached Interview
          </div>
          <div className="text-lg font-bold text-foreground mt-1">
            {renderRate(data.interview_count, data.total_applications)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Ever reached, incl. closed</div>
        </div>

        <div className="p-2 border-b sm:border-b-0 sm:border-r border-border">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Reached Offer
          </div>
          <div className="text-lg font-bold text-foreground mt-1">
            {renderRate(data.offer_count, data.total_applications)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Ever reached</div>
        </div>

        <div className="p-2">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Median Time to First Reply
          </div>
          <div className="text-2xl font-bold text-foreground mt-1">
            {data.median_response_days !== null ? `${data.median_response_days} days` : '—'}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            from {data.response_samples} responses
          </div>
        </div>
      </div>

      {/* Row 1: Am I keeping pace? & Pipeline vs Historical Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (7 cols): Pacing chart & Current Pipeline */}
        <div className="lg:col-span-7 space-y-5">
          {/* Card: Am I keeping pace? */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-base font-semibold text-foreground">Am I keeping pace?</h2>
                <p className="text-xs text-muted-foreground">
                  Applications, responses and interviews per week (last 12 weeks)
                </p>
              </div>
            </div>
            <div className="mt-4">{renderActivitySvg()}</div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-primary/25 inline-block" />
                Applied
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" />
                Got a response
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                Reached interview
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-amber-500 inline-block" />
                Weekly goal
              </span>
            </div>
          </Card>

          {/* Card: What is open right now? (Current Pipeline) */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">What is open right now?</h2>
                <p className="text-xs text-muted-foreground">
                  Current pipeline · open applications by current stage
                </p>
              </div>
              <span className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">
                Current stage
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {data.current_pipeline.map((p) => {
                const maxCurrent = Math.max(1, ...data.current_pipeline.map((c) => c.count));
                const widthPct = Math.max(2, (p.count / maxCurrent) * 100);
                return (
                  <div key={p.stage} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-foreground">{p.stage}</span>
                      <span className="font-bold text-foreground">{p.count}</span>
                    </div>
                    <div className="h-2 rounded bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded transition-all"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right Column (5 cols): Historical Funnel */}
        <div className="lg:col-span-5">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Where do applications stop?</h2>
                <p className="text-xs text-muted-foreground">
                  Historical funnel · ever reached, from stage history
                </p>
              </div>
              <span className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">
                Ever reached
              </span>
            </div>

            <div className="space-y-3 mt-4">
              {data.historical_funnel.map((f) => {
                const widthPct = Math.max(2, (f.count / maxHistorical) * 100);
                return (
                  <div key={f.stage} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-foreground">{f.stage}</span>
                      <span className="text-muted-foreground">
                        <strong className="text-foreground">{f.count}</strong>{' '}
                        <span>({f.pct ?? Math.round((f.count / maxHistorical) * 100)}%)</span>
                      </span>
                    </div>
                    <div className="h-2.5 rounded bg-muted overflow-hidden">
                      <div
                        className="h-full bg-slate-700 dark:bg-slate-300 rounded transition-all"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 pt-3 border-t border-border text-xs text-muted-foreground leading-relaxed">
              Stages can be skipped, so a later stage can have a higher count than an earlier one
              (e.g. Screen &gt; Assessment). Closed applications count for every stage they reached.
            </div>
          </Card>
        </div>
      </div>

      {/* Row 2: Which sources work?, Which resume performs?, How do applications end? */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Sources Breakdown */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Which sources work?</h2>
              <p className="text-xs text-muted-foreground">
                Response and interview rate by source
              </p>
            </div>
            <span className="text-xs text-muted-foreground">≥5 apps</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-medium">
                  <th className="py-2 pr-2">Source</th>
                  <th className="py-2 px-1 text-right">Apps</th>
                  <th className="py-2 px-2 text-right">Response</th>
                  <th className="py-2 pl-2 text-right">Interview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.sources_breakdown.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-muted-foreground">
                      No source data available
                    </td>
                  </tr>
                ) : (
                  data.sources_breakdown.map((s) => (
                    <tr key={s.source} className="hover:bg-muted/40">
                      <td className="py-2 pr-2 font-medium text-foreground truncate max-w-[100px]">
                        {s.source}
                      </td>
                      <td className="py-2 px-1 text-right text-foreground font-semibold">
                        {s.apps}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {renderRate(s.responses, s.apps, true)}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        {renderRate(s.interviews, s.apps, true)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Resumes Breakdown */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Which resume performs?</h2>
              <p className="text-xs text-muted-foreground">By resume version used</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-medium">
                  <th className="py-2 pr-2">Resume</th>
                  <th className="py-2 px-1 text-right">Apps</th>
                  <th className="py-2 px-2 text-right">Response</th>
                  <th className="py-2 pl-2 text-right">Interview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.resumes_breakdown.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-muted-foreground">
                      No resume data linked yet
                    </td>
                  </tr>
                ) : (
                  data.resumes_breakdown.map((r) => (
                    <tr key={r.resume_id} className="hover:bg-muted/40">
                      <td className="py-2 pr-2 font-medium text-foreground truncate max-w-[100px]">
                        {r.title}
                      </td>
                      <td className="py-2 px-1 text-right text-foreground font-semibold">
                        {r.apps}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {renderRate(r.responses, r.apps, true)}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        {renderRate(r.interviews, r.apps, true)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Outcomes Breakdown */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">How do applications end?</h2>
              <p className="text-xs text-muted-foreground">
                Outcome and the stage they reached
              </p>
            </div>
          </div>
          <div className="space-y-4">
            {data.outcomes_breakdown.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No closed applications yet
              </div>
            ) : (
              data.outcomes_breakdown.map((o) => {
                const totalClosed = data.outcomes_breakdown.reduce((sum, item) => sum + item.count, 0);
                const pct = totalClosed > 0 ? Math.round((o.count / totalClosed) * 100) : 0;
                let barColor = 'bg-slate-400';
                if (o.outcome === 'ACCEPTED') barColor = 'bg-emerald-500';
                else if (o.outcome === 'REJECTED') barColor = 'bg-rose-500';
                else if (o.outcome === 'GHOSTED') barColor = 'bg-amber-500';
                else if (o.outcome === 'WITHDRAWN') barColor = 'bg-sky-500';

                return (
                  <div key={o.outcome} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-foreground">{o.outcome}</span>
                      <span className="text-muted-foreground">
                        <strong className="text-foreground">{o.count}</strong> ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded bg-muted overflow-hidden">
                      <div
                        className={`h-full ${barColor} rounded transition-all`}
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                    {o.stages_detail && (
                      <div className="text-[11px] text-muted-foreground italic truncate">
                        {o.stages_detail}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
