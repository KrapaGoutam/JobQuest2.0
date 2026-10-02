import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Download, RefreshCw } from "lucide-react";
import {
  fetchAnalyticsOverview,
  fetchStageTiming,
  fetchAgingApplications,
  exportAnalyticsToCsv,
  exportAnalyticsToJson,
} from "../api/analytics";
import {
  fetchWorkspaceMembers,
  type WorkspaceMemberInfo,
} from "../api/applications";
import type {
  AgingApplication,
  AnalyticsOverview,
  StageTiming,
} from "../types/analytics";
import { AnalyticsOverviewTab } from "../components/analytics/AnalyticsOverviewTab";
import { StageTimingTab } from "../components/analytics/StageTimingTab";
import { AgingReportTab } from "../components/analytics/AgingReportTab";
import { GoalsTab } from "../components/analytics/GoalsTab";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { Tab, TabList, TabPanel, Tabs } from "../components/ui/Tabs";
import { useToast } from "../context/ToastContext";

export interface AnalyticsViewProps {
  activeWorkspaceId: string | null;
  isManager: boolean;
  initialTab?: AnalyticsTab;
}
export type AnalyticsTab = "overview" | "timing" | "aging" | "goals";
export type DateRangePreset = "30d" | "90d" | "180d" | "1y";

const RANGE_LABEL: Record<DateRangePreset, string> = {
  "30d": "30 days",
  "90d": "90 days",
  "180d": "180 days",
  "1y": "1 year",
};

export function AnalyticsView({
  activeWorkspaceId,
  isManager,
  initialTab = "overview",
}: AnalyticsViewProps) {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<AnalyticsTab>(initialTab);
  const [dateRange, setDateRange] = useState<DateRangePreset>("90d");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [members, setMembers] = useState<WorkspaceMemberInfo[]>([]);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [timing, setTiming] = useState<StageTiming | null>(null);
  const [aging, setAging] = useState<AgingApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setActiveTab(initialTab), [initialTab]);
  useEffect(() => {
    if (!activeWorkspaceId || !isManager) return;
    fetchWorkspaceMembers(activeWorkspaceId)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [activeWorkspaceId, isManager]);

  const getDateBounds = useCallback((range: DateRangePreset) => {
    const end = new Date();
    const start = new Date(end);
    if (range === "1y") start.setFullYear(start.getFullYear() - 1);
    else start.setDate(start.getDate() - Number.parseInt(range, 10));
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      startLabel: start.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      endLabel: end.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
    };
  }, []);

  const loadData = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setError(null);
    const bounds = getDateBounds(dateRange);
    const userId = isManager && selectedMemberId ? selectedMemberId : null;
    try {
      const [overviewResult, timingResult, agingResult] = await Promise.all([
        fetchAnalyticsOverview(activeWorkspaceId, {
          startDate: bounds.startDate,
          endDate: bounds.endDate,
          userId,
        }),
        fetchStageTiming(activeWorkspaceId, {
          startDate: bounds.startDate,
          endDate: bounds.endDate,
          userId,
        }),
        fetchAgingApplications(activeWorkspaceId, { userId }),
      ]);
      setOverview(overviewResult);
      setTiming(timingResult);
      setAging(agingResult);
    } catch (cause) {
      console.error("Failed to load analytics:", cause);
      setError("Failed to load analytics");
      addToast({
        type: "danger",
        title: "Unable to retrieve search analytics data",
      });
    } finally {
      setLoading(false);
    }
  }, [
    activeWorkspaceId,
    addToast,
    dateRange,
    getDateBounds,
    isManager,
    selectedMemberId,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);
  const bounds = getDateBounds(dateRange);
  const selectedMember = useMemo(
    () => members.find((member) => member.user_id === selectedMemberId),
    [members, selectedMemberId],
  );
  const memberName = selectedMember
    ? selectedMember.display_name || selectedMember.username
    : null;
  const ownerCopy = isManager
    ? memberName
      ? `Member: ${memberName}`
      : `All members${members.length ? ` (${members.length})` : ""}`
    : "Your applications";

  const exportCsv = () => {
    if (!overview) return;
    try {
      exportAnalyticsToCsv(overview, `jobquest-analytics-${dateRange}.csv`);
      addToast({
        type: "success",
        title: "Exported analytics CSV (formula-sanitized)",
      });
    } catch {
      addToast({ type: "danger", title: "Failed to export CSV" });
    }
  };
  const exportJson = () => {
    if (!overview) return;
    try {
      exportAnalyticsToJson(
        overview,
        timing ?? undefined,
        `jobquest-analytics-${dateRange}.json`,
      );
      addToast({ type: "success", title: "Exported analytics JSON" });
    } catch {
      addToast({ type: "danger", title: "Failed to export JSON" });
    }
  };

  return (
    <div className="page analytics-page">
      <header className="analytics-header">
        <div>
          <h1>Analytics</h1>
          <p>
            Applied {bounds.startLabel}–{bounds.endLabel} · {ownerCopy}
          </p>
        </div>
        <div
          className="analytics-toolbar"
          role="toolbar"
          aria-label="Analytics controls"
        >
          {isManager && (
            <Select
              aria-label="Filter by workspace member"
              value={selectedMemberId}
              onChange={(event) => setSelectedMemberId(event.target.value)}
            >
              <option value="">Owner: All members</option>
              {members.map((member) => (
                <option value={member.user_id} key={member.user_id}>
                  {member.display_name || member.username} ({member.role})
                </option>
              ))}
            </Select>
          )}
          <div className="analytics-range" role="group" aria-label="Date range">
            {(Object.keys(RANGE_LABEL) as DateRangePreset[]).map((range) => (
              <button
                key={range}
                type="button"
                aria-pressed={dateRange === range}
                onClick={() => setDateRange(range)}
              >
                {RANGE_LABEL[range]}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            aria-label="Export CSV"
            onClick={exportCsv}
            disabled={!overview}
            leftIcon={<Download size={14} aria-hidden="true" />}
          >
            <span className="export-label">Export CSV</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={exportJson}
            disabled={!overview}
          >
            JSON
          </Button>
        </div>
      </header>

      <Tabs
        id="analytics-tabs"
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as AnalyticsTab)}
      >
        <div className="analytics-tab-scroll">
          <TabList aria-label="Analytics sections">
            <Tab id="overview">Overview</Tab>
            <Tab id="timing">Stage timing</Tab>
            <Tab id="aging">
              Aging <span className="tab-count">{aging.length}</span>
            </Tab>
            <Tab id="goals">Goals</Tab>
          </TabList>
        </div>
        {loading ? (
          <div className="analytics-loading" role="status">
            <div className="analytics-skeleton skel" />
            <div className="analytics-skeleton-grid">
              <div className="skel" />
              <div className="skel" />
              <div className="skel" />
            </div>
            <span className="sr-only">Computing analytics metrics</span>
          </div>
        ) : error ? (
          <div className="analytics-error" role="alert">
            <AlertCircle aria-hidden="true" />
            <h2>{error}</h2>
            <p>We could not compute your analytics right now.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadData()}
              leftIcon={<RefreshCw size={14} />}
            >
              Retry
            </Button>
          </div>
        ) : (
          <>
            <TabPanel id="overview">
              {overview && (
                <AnalyticsOverviewTab
                  data={overview}
                  isManager={isManager && !selectedMemberId}
                />
              )}
            </TabPanel>
            <TabPanel id="timing">
              {timing && <StageTimingTab data={timing} />}
            </TabPanel>
            <TabPanel id="aging">
              <AgingReportTab applications={aging} onRefresh={loadData} />
            </TabPanel>
            <TabPanel id="goals">
              {overview && (
                <GoalsTab
                  overview={overview}
                  workspaceId={activeWorkspaceId!}
                  onRefresh={loadData}
                  targetUserId={selectedMemberId || null}
                  isManagerAggregate={isManager && !selectedMemberId}
                />
              )}
            </TabPanel>
          </>
        )}
      </Tabs>
    </div>
  );
}
