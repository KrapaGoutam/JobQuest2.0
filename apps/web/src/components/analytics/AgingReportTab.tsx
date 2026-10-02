import { useMemo, useState } from "react";
import { AlarmClockOff, BellRing, Circle, Hourglass, Moon } from "lucide-react";
import type { AgingApplication, AgingBand } from "../../types/analytics";
import { supabase } from "../../supabase";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ScopeTag } from "./AnalyticsCharts";

interface AgingReportTabProps {
  applications: AgingApplication[];
  onRefresh: () => void;
}
type Filter = "ALL" | AgingBand;
const BANDS: Array<{
  id: AgingBand;
  label: string;
  range: string;
  icon: typeof Circle;
}> = [
  { id: "NEW", label: "New", range: "≤3 days", icon: Circle },
  { id: "WAITING", label: "Waiting", range: "4–7 days", icon: Hourglass },
  {
    id: "FOLLOW_UP_RECOMMENDED",
    label: "Follow up",
    range: "8–14 days",
    icon: BellRing,
  },
  { id: "STALE", label: "Stale", range: "15–30 days", icon: Moon },
  {
    id: "LONG_WAITING",
    label: "Long waiting",
    range: "31+ days",
    icon: AlarmClockOff,
  },
];

export function AgingReportTab({
  applications,
  onRefresh,
}: AgingReportTabProps) {
  const { addToast } = useToast();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [actingId, setActingId] = useState<string | null>(null);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        BANDS.map(({ id }) => [
          id,
          applications.filter((app) => app.aging_band === id).length,
        ]),
      ) as Record<AgingBand, number>,
    [applications],
  );
  const visible =
    filter === "ALL"
      ? applications
      : applications.filter((app) => app.aging_band === filter);
  const act = async (
    app: AgingApplication,
    action: "keep" | "ghost" | "archive",
  ) => {
    setActingId(app.id);
    try {
      const result =
        action === "keep"
          ? await supabase.rpc("rpc_keep_application_active", {
              p_application_id: app.id,
            })
          : action === "ghost"
            ? await supabase.rpc("rpc_set_application_outcome", {
                p_application_id: app.id,
                p_outcome: "GHOSTED",
                p_closure_notes: "Marked ghosted from Aging Report",
              })
            : await supabase.rpc("rpc_archive_application", {
                p_application_id: app.id,
              });
      if (result.error) throw result.error;
      addToast({
        type: "success",
        title:
          action === "keep"
            ? "Application marked as active"
            : action === "ghost"
              ? "Application marked as Ghosted"
              : "Application archived",
      });
      onRefresh();
    } catch (cause) {
      addToast({
        type: "danger",
        title: (cause as Error).message || "Failed to update application",
      });
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="analytics-stack aging-view">
      <section
        className="aging-distribution"
        aria-labelledby="aging-distribution-title"
      >
        <div className="analytics-card-head">
          <div>
            <h2 id="aging-distribution-title">Open application aging</h2>
            <p>Current state · unaffected by the date range above</p>
          </div>
          <ScopeTag tone="current">Current</ScopeTag>
        </div>
        <div className="aging-band-grid">
          {BANDS.map(({ id, label, range, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`aging-band aging-band-${id.toLowerCase()} ${filter === id ? "selected" : ""}`}
              onClick={() => setFilter(filter === id ? "ALL" : id)}
              aria-pressed={filter === id}
            >
              <Icon size={14} aria-hidden="true" />
              <span>
                {label}
                <small>{range}</small>
              </span>
              <strong>{counts[id]}</strong>
            </button>
          ))}
        </div>
        <div
          className="aging-bar"
          aria-label={`${applications.length} open applications by aging band`}
        >
          {BANDS.map(({ id }) =>
            applications.length ? (
              <span
                key={id}
                className={`aging-segment aging-segment-${id.toLowerCase()}`}
                style={{
                  width: `${(counts[id] / applications.length) * 100}%`,
                }}
                title={`${id}: ${counts[id]}`}
              />
            ) : null,
          )}
        </div>
        <div className="sr-only">
          <table>
            <caption>Application aging distribution</caption>
            <thead>
              <tr>
                <th>Band</th>
                <th>Applications</th>
              </tr>
            </thead>
            <tbody>
              {BANDS.map(({ id, label }) => (
                <tr key={id}>
                  <th>{label}</th>
                  <td>{counts[id]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div
        className="aging-filter-row"
        role="group"
        aria-label="Filter applications by aging"
      >
        <button
          type="button"
          aria-pressed={filter === "ALL"}
          onClick={() => setFilter("ALL")}
        >
          All <span>{applications.length}</span>
        </button>
        {BANDS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label} <span>{counts[id]}</span>
          </button>
        ))}
      </div>
      <Card className="analytics-card aging-table-card">
        <div
          className="table-scroll"
          tabIndex={0}
          aria-label="Open applications aging table"
        >
          <table className="analytics-table aging-table">
            <thead>
              <tr>
                <th scope="col">Application</th>
                <th scope="col">Stage</th>
                <th scope="col">Aging</th>
                <th scope="col">Last activity</th>
                <th scope="col">Next action</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map((app) => (
                  <tr key={app.id}>
                    <th>
                      <strong>{app.company_name}</strong>
                      <small>{app.role_title}</small>
                    </th>
                    <td>
                      <span className="stage-pill">{app.stage}</span>
                    </td>
                    <td>
                      <span
                        className={`aging-status aging-status-${app.aging_band.toLowerCase()}`}
                      >
                        {
                          BANDS.find((band) => band.id === app.aging_band)
                            ?.label
                        }{" "}
                        · {app.days_inactive}d
                      </span>
                    </td>
                    <td>
                      {new Date(app.last_activity_at).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      )}
                    </td>
                    <td>
                      {app.next_action_title ? (
                        <span>
                          {app.next_action_title}
                          <small>
                            {app.next_action_due
                              ? new Date(
                                  app.next_action_due,
                                ).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                })
                              : ""}
                          </small>
                        </span>
                      ) : (
                        <span className="muted">None scheduled</span>
                      )}
                    </td>
                    <td>
                      <div className="aging-actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actingId === app.id}
                          aria-label={`Keep ${app.company_name} active`}
                          onClick={() => void act(app, "keep")}
                        >
                          Keep
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actingId === app.id}
                          aria-label={`Mark ${app.company_name} ghosted`}
                          onClick={() => void act(app, "ghost")}
                        >
                          Ghosted
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actingId === app.id}
                          aria-label={`Archive ${app.company_name}`}
                          onClick={() => void act(app, "archive")}
                        >
                          Archive
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    No applications match this aging filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
