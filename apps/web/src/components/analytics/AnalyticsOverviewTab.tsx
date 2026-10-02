import type { AnalyticsOverview } from "../../types/analytics";
import { Card } from "../ui/Card";
import { FunnelRows, PaceChart, RateValue, ScopeTag } from "./AnalyticsCharts";

interface AnalyticsOverviewTabProps {
  data: AnalyticsOverview;
  isManager?: boolean;
}

function PerformanceTable({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: Array<{
    id: string;
    label: string;
    apps: number;
    responses: number;
    interviews: number;
  }>;
}) {
  return (
    <Card className="analytics-card">
      <header className="analytics-card-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <ScopeTag>Range</ScopeTag>
      </header>
      <div className="table-scroll">
        <table className="analytics-table">
          <thead>
            <tr>
              <th>{title.includes("resume") ? "Resume" : "Source"}</th>
              <th>Apps</th>
              <th>Response</th>
              <th>Interview</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id}>
                  <th>{row.label}</th>
                  <td>{row.apps}</td>
                  <td>
                    <RateValue
                      numerator={row.responses}
                      denominator={row.apps}
                      sampleFloor
                    />
                  </td>
                  <td>
                    <RateValue
                      numerator={row.interviews}
                      denominator={row.apps}
                      sampleFloor
                    />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="empty-cell">
                  No linked data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function AnalyticsOverviewTab({
  data,
  isManager,
}: AnalyticsOverviewTabProps) {
  const summary = [
    [
      "Applications",
      data.total_applications,
      isManager ? "Workspace aggregate" : "In selected window",
    ],
    [
      "Response rate",
      <RateValue
        numerator={data.response_count}
        denominator={data.total_applications}
      />,
      "Any recruiter reply",
    ],
    [
      "Reached interview",
      <RateValue
        numerator={data.interview_count}
        denominator={data.total_applications}
      />,
      "Ever reached, including closed",
    ],
    [
      "Reached offer",
      <RateValue
        numerator={data.offer_count}
        denominator={data.total_applications}
      />,
      "Ever reached",
    ],
    [
      "Median first reply",
      data.median_response_days === null
        ? "—"
        : `${data.median_response_days} days`,
      `From ${data.response_samples} responses`,
    ],
  ] as const;
  return (
    <div className="analytics-stack">
      <section
        className="analytics-kpis"
        aria-label="Search performance summary"
      >
        {summary.map(([label, value, note], index) => (
          <div className="analytics-kpi" key={label}>
            <span>{label}</span>
            <strong
              data-testid={
                index === 0 ? "analytics-total-applications" : undefined
              }
            >
              {value}
            </strong>
            <small>{note}</small>
          </div>
        ))}
      </section>

      <section
        className="analytics-overview-grid"
        aria-label="Search performance details"
      >
        <Card className="analytics-card analytics-pace-card">
          <header className="analytics-card-head">
            <div>
              <h2>Am I keeping pace?</h2>
              <p>Applications, responses and interviews · latest 12 weeks</p>
            </div>
            <ScopeTag tone="fixed">12 weeks</ScopeTag>
          </header>
          <PaceChart points={data.weekly_pacing} />
        </Card>
        <Card className="analytics-card analytics-funnel-card">
          <header className="analytics-card-head">
            <div>
              <h2>Where do applications stop?</h2>
              <p>Historical funnel · every stage reached</p>
            </div>
            <ScopeTag>Range</ScopeTag>
          </header>
          <FunnelRows
            rows={data.historical_funnel}
            total={data.total_applications}
          />
          <p className="analytics-note">
            Stages can be skipped. Closed applications count for every stage
            they reached.
          </p>
        </Card>
        <Card className="analytics-card analytics-pipeline-card">
          <header className="analytics-card-head">
            <div>
              <h2>What is open right now?</h2>
              <p>Open applications by current stage</p>
            </div>
            <ScopeTag tone="current">Current</ScopeTag>
          </header>
          <FunnelRows rows={data.current_pipeline} current />
        </Card>
      </section>

      <section
        className="analytics-three-grid"
        aria-label="Sources, resumes, and outcomes"
      >
        <PerformanceTable
          title="Which sources work?"
          subtitle="Response and interview rate by source"
          rows={data.sources_breakdown.map((row) => ({
            id: row.source,
            label: row.source,
            ...row,
          }))}
        />
        <PerformanceTable
          title="Which resume performs?"
          subtitle="Performance by resume version"
          rows={data.resumes_breakdown.map((row) => ({
            id: row.resume_id,
            label: row.title,
            ...row,
          }))}
        />
        <Card className="analytics-card">
          <header className="analytics-card-head">
            <div>
              <h2>How do applications end?</h2>
              <p>Recorded outcomes in this range</p>
            </div>
            <ScopeTag>Range</ScopeTag>
          </header>
          <div className="outcome-list">
            {data.outcomes_breakdown.length ? (
              data.outcomes_breakdown.map((row) => (
                <div key={row.outcome}>
                  <span>
                    <strong>{row.outcome}</strong>
                    <small>{row.stages_detail}</small>
                  </span>
                  <b>{row.count}</b>
                </div>
              ))
            ) : (
              <p className="empty-copy">No outcomes recorded yet.</p>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
