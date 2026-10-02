import { useId, type CSSProperties, type ReactNode } from "react";
import type { StageCount, WeeklyPacingPoint } from "../../types/analytics";

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
