import type { StageTiming } from "../../types/analytics";
import { Card } from "../ui/Card";
import { ProgressTrack, RateValue, ScopeTag } from "./AnalyticsCharts";

export function StageTimingTab({ data }: { data: StageTiming }) {
  const maximum = Math.max(
    1,
    ...data.transitions.map((row) => row.max_days ?? 0),
  );
  const impact = data.follow_up_impact;
  return (
    <div className="analytics-stack">
      <section className="analytics-timing-grid">
        <Card className="analytics-card analytics-timing-card">
          <header className="analytics-card-head">
            <div>
              <h2>How long does each step take?</h2>
              <p>First qualifying events · median and full range</p>
            </div>
            <ScopeTag>Range</ScopeTag>
          </header>
          <div className="table-scroll">
            <table className="analytics-table timing-table">
              <thead>
                <tr>
                  <th>Transition</th>
                  <th>Median</th>
                  <th>Average</th>
                  <th>Range</th>
                  <th>Sample</th>
                  <th>Distribution</th>
                </tr>
              </thead>
              <tbody>
                {data.transitions.length ? (
                  data.transitions.map((row) => (
                    <tr key={row.transition}>
                      <th>{row.transition}</th>
                      <td>
                        <strong>
                          {row.median_days === null
                            ? "—"
                            : `${row.median_days}d`}
                        </strong>
                      </td>
                      <td>
                        {row.average_days === null
                          ? "—"
                          : `${row.average_days}d`}
                      </td>
                      <td>
                        {row.min_days === null || row.max_days === null
                          ? "—"
                          : `${row.min_days}–${row.max_days}d`}
                      </td>
                      <td>
                        {row.sample_size < 5 ? (
                          <span
                            className="sample-low"
                            title="Fewer than five transitions"
                          >
                            {row.sample_size} · low
                          </span>
                        ) : (
                          row.sample_size
                        )}
                      </td>
                      <td>
                        {row.sample_size < 5 || row.median_days === null ? (
                          <span className="muted">Insufficient data</span>
                        ) : (
                          <ProgressTrack
                            value={row.median_days}
                            max={maximum}
                            label={`${row.transition} median ${row.median_days} days`}
                          />
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="empty-cell">
                      No transition data yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="sr-only">
            <table>
              <caption>Stage transition timing ranges</caption>
              <thead>
                <tr>
                  <th>Transition</th>
                  <th>Minimum</th>
                  <th>Median</th>
                  <th>Maximum</th>
                </tr>
              </thead>
              <tbody>
                {data.transitions.map((row) => (
                  <tr key={row.transition}>
                    <th>{row.transition}</th>
                    <td>{row.min_days}</td>
                    <td>{row.median_days}</td>
                    <td>{row.max_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="analytics-card">
          <header className="analytics-card-head">
            <div>
              <h2>What is stuck right now?</h2>
              <p>Open applications in one stage for 14+ days</p>
            </div>
            <ScopeTag tone="current">
              {data.stuck_applications.length} stuck
            </ScopeTag>
          </header>
          <div className="stuck-list">
            {data.stuck_applications.length ? (
              data.stuck_applications.map((app) => (
                <div key={app.id}>
                  <span>
                    <strong>{app.company_name}</strong>
                    <small>
                      {app.role_title} · {app.stage}
                    </small>
                  </span>
                  <b>{app.days_in_stage}d</b>
                </div>
              ))
            ) : (
              <p className="empty-copy">
                Nothing has been stuck for more than 14 days.
              </p>
            )}
          </div>
        </Card>
      </section>
      <Card className="analytics-card followup-card">
        <header className="analytics-card-head">
          <div>
            <h2>Does following up help?</h2>
            <p>
              Response rate with and without a follow-up sent within 14 days
            </p>
          </div>
          <ScopeTag>Range</ScopeTag>
        </header>
        <div className="followup-comparison">
          <div>
            <span>With follow-up</span>
            <strong>
              <RateValue
                numerator={impact?.with_follow_up?.responses ?? 0}
                denominator={impact?.with_follow_up?.count ?? 0}
              />
            </strong>
          </div>
          <div>
            <span>Without follow-up</span>
            <strong>
              <RateValue
                numerator={impact?.without_follow_up?.responses ?? 0}
                denominator={impact?.without_follow_up?.count ?? 0}
              />
            </strong>
          </div>
          <p>
            <strong>Correlation, not proof.</strong> Applications you follow up
            on may differ in other ways. Follow-ups sent this period:{" "}
            <b>{impact?.total_follow_ups ?? 0}</b>.
          </p>
        </div>
      </Card>
    </div>
  );
}
