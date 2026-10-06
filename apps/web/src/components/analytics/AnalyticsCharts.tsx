import { useId, type CSSProperties, type ReactNode } from "react";
import type { StageCount, WeeklyPacingPoint } from "../../types/analytics";
import type { GoalTrendPoint } from "../../lib/goalAnalytics";

export function ScopeTag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "current" | "fixed";
}) {
  return (
    <span className={`analytics-scope analytics-scope-${tone}`}>
      {children}
    </span>
  );
}

export function RateValue({
  numerator,
  denominator,
  sampleFloor = false,
}: {
  numerator: number;
  denominator: number;
  sampleFloor?: boolean;
}) {
  if (!denominator) return <span className="muted">No data</span>;
  if (sampleFloor && denominator < 5) {
    return (
      <span className="muted" title="Fewer than five applications">
        {numerator}/{denominator} · too few
      </span>
    );
  }
  return (
    <>
      <strong>{numerator}</strong>/{denominator}{" "}
      <span className="muted">
        ({((numerator / denominator) * 100).toFixed(1)}%)
      </span>
    </>
  );
}

export function ProgressTrack({
  value,
  max,
  tone = "primary",
  label,
}: {
  value: number;
  max: number;
  tone?: "primary" | "positive" | "warning" | "danger" | "secondary";
  label?: string;
}) {
  const percent = Math.min(
    100,
    Math.max(0, Math.round((value / Math.max(1, max)) * 100)),
  );
  return (
    <div
      className="analytics-track"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label ?? `${value} of ${max}`}
    >
      <span
        className={`analytics-track-fill analytics-track-${tone}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function GoalRing({
  value,
  target,
  label = "Weekly applications",
}: {
  value: number;
  target: number;
  label?: string;
}) {
  const percent = Math.min(
    100,
    Math.round((value / Math.max(1, target)) * 100),
  );
  return (
    <div
      className="goal-ring"
      style={{ "--goal-percent": `${percent * 3.6}deg` } as CSSProperties}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={value}
    >
      <div className="goal-ring-inner">
        <strong>{value}</strong>
        <span>of {target}</span>
      </div>
    </div>
  );
}

export function PaceChart({
  points,
  compact = false,
}: {
  points: WeeklyPacingPoint[];
  compact?: boolean;
}) {
  const chartId = useId().replace(/:/g, "");
  const titleId = `${chartId}-title`;
  const descriptionId = `${chartId}-description`;
  const patternId = `${chartId}-applied-pattern`;
  const rows = [...points]
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .slice(-12);
  const width = 660;
  const height = compact ? 132 : 184;
  const plotTop = 16;
  const plotBottom = height - 28;
  const plotHeight = plotBottom - plotTop;
  const maxValue = Math.max(
    5,
    ...rows.flatMap((row) => [
      row.applied,
      row.responses,
      row.interviews,
      row.target,
    ]),
  );
  const barBand = rows.length ? (width - 48) / rows.length : width - 48;
  const y = (value: number) => plotBottom - (value / maxValue) * plotHeight;
  const targetPoints = rows
    .map(
      (row, index) => `${40 + index * barBand + barBand / 2},${y(row.target)}`,
    )
    .join(" ");

  return (
    <div className="pace-chart-wrap">
      <svg
        className="pace-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>Weekly search activity</title>
        <desc id={descriptionId}>
          Applications, responses, interviews, and weekly application goals for
          the latest twelve weeks.
        </desc>
        <defs>
          <pattern
            id={patternId}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect
              width="5"
              height="5"
              fill="color-mix(in oklch, var(--chart-1) 22%, var(--color-surface-1))"
            />
            <line
              x1="0"
              x2="0"
              y2="5"
              stroke="var(--chart-1)"
              strokeWidth="1.5"
            />
          </pattern>
        </defs>
        {[0, 0.5, 1].map((step) => {
          const lineY = plotTop + step * plotHeight;
          return (
            <line
              key={step}
              x1="36"
              x2={width - 8}
              y1={lineY}
              y2={lineY}
              className="analytics-gridline"
            />
          );
        })}
        {rows.map((row, index) => {
          const center = 40 + index * barBand + barBand / 2;
          const barWidth = Math.max(8, Math.min(20, barBand * 0.42));
          const appY = y(row.applied);
          const responseY = y(row.responses);
          const interviewY = y(row.interviews);
          return (
            <g key={row.week_start}>
              <rect
                x={center - barWidth / 2}
                y={appY}
                width={barWidth}
                height={Math.max(1, plotBottom - appY)}
                rx="3"
                fill={`url(#${patternId})`}
              />
              <rect
                x={center - barWidth / 2 + barWidth * 0.22}
                y={responseY}
                width={barWidth * 0.56}
                height={Math.max(0, plotBottom - responseY)}
                rx="2"
                className="pace-response-bar"
              />
              <circle
                cx={center}
                cy={interviewY}
                r="3.5"
                className="pace-interview-dot"
              />
              <text
                x={center}
                y={height - 8}
                textAnchor="middle"
                className="analytics-axis-label"
              >
                {row.week_label.replace(/\s+\d{4}$/, "")}
              </text>
            </g>
          );
        })}
        {rows.length > 1 && (
          <polyline points={targetPoints} className="pace-goal-line" />
        )}
      </svg>
      <div className="analytics-legend" aria-hidden="true">
        <span>
          <i className="legend-swatch legend-app" />
          Applied
        </span>
        <span>
          <i className="legend-swatch legend-response" />
          Responses
        </span>
        <span>
          <i className="legend-dot" />
          Interviews
        </span>
        <span>
          <i className="legend-line" />
          Goal
        </span>
      </div>
      <div className="sr-only">
        <table>
          <caption>Weekly search activity values</caption>
          <thead>
            <tr>
              <th>Week</th>
              <th>Applications</th>
              <th>Responses</th>
              <th>Interviews</th>
              <th>Goal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.week_start}>
                <th>{row.week_label}</th>
                <td>{row.applied}</td>
                <td>{row.responses}</td>
                <td>{row.interviews}</td>
                <td>{row.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FunnelRows({
  rows,
  total,
  current = false,
}: {
  rows: StageCount[];
  total?: number;
  current?: boolean;
}) {
  const maximum = Math.max(1, total ?? 0, ...rows.map((row) => row.count));
  if (!rows.length) return <p className="empty-copy">No pipeline data yet.</p>;
  return (
    <div className="funnel-rows">
      {rows.map((row) => (
        <div className="funnel-row" key={row.stage}>
          <div>
            <span>{row.stage}</span>
            <strong>
              {row.count}
              {!current &&
                ` · ${row.pct ?? Math.round((row.count / maximum) * 100)}%`}
            </strong>
          </div>
          <ProgressTrack
            value={row.count}
            max={maximum}
            tone={current ? "primary" : "secondary"}
            label={`${row.stage}: ${row.count}`}
          />
        </div>
      ))}
    </div>
  );
}

export function AttainmentStrip({ points }: { points: WeeklyPacingPoint[] }) {
  const rows = [...points]
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .slice(-12);
  return (
    <>
      <div
        className="attainment-strip"
        role="img"
        aria-label="Weekly goal attainment for the latest twelve weeks"
      >
        {rows.map((row) => {
          const percent = Math.min(
            100,
            Math.round((row.applied / Math.max(1, row.target)) * 100),
          );
          return (
            <div
              key={row.week_start}
              className="attainment-week"
              title={`${row.week_label}: ${row.applied} of ${row.target}`}
            >
              <span
                style={{ height: `${Math.max(6, percent)}%` }}
                className={percent >= 100 ? "met" : ""}
              />
              <small>{row.week_label}</small>
            </div>
          );
        })}
      </div>
      <div className="sr-only">
        <table>
          <caption>Weekly goal attainment</caption>
          <thead>
            <tr>
              <th>Week</th>
              <th>Applications</th>
              <th>Goal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.week_start}>
                <th>{row.week_label}</th>
                <td>{row.applied}</td>
                <td>{row.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function GoalTrendChart({
  points,
  compact = false,
}: {
  points: GoalTrendPoint[];
  compact?: boolean;
}) {
  const chartId = useId().replace(/:/g, "");
  const titleId = `${chartId}-title`;
  const descriptionId = `${chartId}-description`;

  const width = 660;
  const height = compact ? 140 : 190;
  const plotTop = 20;
  const plotBottom = height - 32;
  const plotHeight = plotBottom - plotTop;

  const maxValue = Math.max(
    5,
    ...points.flatMap((p) => [p.actual, p.target ?? 0]),
  );
  const barBand = points.length ? (width - 56) / points.length : width - 56;
  const y = (val: number) => plotBottom - (val / maxValue) * plotHeight;

  // Horizontal grid steps
  const gridSteps = [0, 0.5, 1];

  // Target line segments connecting consecutive days with configured goals
  const targetSegments: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i]!;
    const next = points[i + 1]!;
    if (current.target !== null && next.target !== null) {
      const cx1 = 44 + i * barBand + barBand / 2;
      const cx2 = 44 + (i + 1) * barBand + barBand / 2;
      targetSegments.push({
        x1: cx1,
        y1: y(current.target),
        x2: cx2,
        y2: y(next.target),
      });
    }
  }

  // Thin out x-axis labels if many points
  const labelInterval = points.length > 20 ? 3 : points.length > 12 ? 2 : 1;

  return (
    <div className="goal-trend-wrap">
      <svg
        className="goal-trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>Daily goal performance trend</title>
        <desc id={descriptionId}>
          Actual submitted applications compared against configured daily application goals over time.
        </desc>
        {gridSteps.map((step) => {
          const lineY = plotTop + step * plotHeight;
          const valLabel = Math.round(maxValue * (1 - step));
          return (
            <g key={step}>
              <line
                x1="36"
                x2={width - 8}
                y1={lineY}
                y2={lineY}
                className="analytics-gridline"
              />
              <text
                x="30"
                y={lineY + 3}
                textAnchor="end"
                className="analytics-axis-label"
              >
                {valLabel}
              </text>
            </g>
          );
        })}
        {points.map((point, index) => {
          const center = 44 + index * barBand + barBand / 2;
          const barWidth = Math.max(6, Math.min(24, barBand * 0.5));
          const appY = y(point.actual);
          const barHeight = Math.max(point.actual > 0 ? 3 : 1, plotBottom - appY);
          const showLabel =
            index % labelInterval === 0 || index === points.length - 1;

          const tooltip = `${point.label}: ${point.actual} submitted${
            point.target !== null
              ? ` · Target ${point.target} (${point.percentage}%${
                  point.status === "MET"
                    ? " · Met"
                    : point.status === "CURRENT"
                    ? " · In progress"
                    : " · Missed"
                })`
              : " · No goal configured"
          }`;

          const isMet = point.target !== null && point.actual >= point.target;
          const isNoGoal = point.target === null;

          return (
            <g key={point.date} tabIndex={0} aria-label={tooltip}>
              <title>{tooltip}</title>
              <rect
                x={center - barWidth / 2}
                y={appY}
                width={barWidth}
                height={barHeight}
                rx="3"
                className={`goal-trend-bar ${isMet ? "met" : ""} ${
                  isNoGoal ? "no-goal" : ""
                }`}
              />
              {point.target !== null && (
                <circle
                  cx={center}
                  cy={y(point.target)}
                  r="3.5"
                  className="goal-trend-target-dot"
                />
              )}
              {showLabel && (
                <text
                  x={center}
                  y={height - 8}
                  textAnchor="middle"
                  className="analytics-axis-label"
                >
                  {point.label}
                </text>
              )}
            </g>
          );
        })}
        {targetSegments.map((seg, i) => (
          <line
            key={i}
            x1={seg.x1}
            y1={seg.y1}
            x2={seg.x2}
            y2={seg.y2}
            className="pace-goal-line"
          />
        ))}
      </svg>
      <div className="analytics-legend" aria-hidden="true">
        <span>
          <i className="legend-swatch legend-app" />
          Actual Applications
        </span>
        <span>
          <i className="legend-line" />
          Daily Goal Target
        </span>
        <span>
          <i className="legend-dot legend-met-dot" />
          Target Met
        </span>
      </div>
      <div className="sr-only">
        <table>
          <caption>Daily goal performance trend values</caption>
          <thead>
            <tr>
              <th>Date</th>
              <th>Applications</th>
              <th>Target</th>
              <th>Completion</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.date}>
                <th>{point.label}</th>
                <td>{point.actual}</td>
                <td>{point.target !== null ? point.target : "No goal"}</td>
                <td>
                  {point.percentage !== null ? `${point.percentage}%` : "—"}
                </td>
                <td>{point.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

