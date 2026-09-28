import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchAnalyticsOverview,
  fetchStageTiming,
  fetchAgingApplications,
  exportAnalyticsToCsv,
  exportAnalyticsToJson,
} from '../api/analytics';
import { fetchWorkspaceMembers, type WorkspaceMemberInfo } from '../api/applications';
import type { AnalyticsOverview, StageTiming, AgingApplication } from '../types/analytics';
import { AnalyticsOverviewTab } from '../components/analytics/AnalyticsOverviewTab';
import { StageTimingTab } from '../components/analytics/StageTimingTab';
import { AgingReportTab } from '../components/analytics/AgingReportTab';
import { GoalsTab } from '../components/analytics/GoalsTab';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Tabs, TabList, Tab, TabPanel } from '../components/ui/Tabs';
import { useToast } from '../context/ToastContext';
import {
  Download,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

export interface AnalyticsViewProps {
  activeWorkspaceId: string | null;
  isManager: boolean;
  initialTab?: AnalyticsTab;
}

export type AnalyticsTab = 'overview' | 'timing' | 'aging' | 'goals';
export type DateRangePreset = '30d' | '90d' | '180d' | '1y';

export function AnalyticsView({
  activeWorkspaceId,
  isManager,
  initialTab = 'overview',
}: AnalyticsViewProps) {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<AnalyticsTab>(initialTab);
  const [dateRange, setDateRange] = useState<DateRangePreset>('90d');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [members, setMembers] = useState<WorkspaceMemberInfo[]>([]);

  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [timing, setTiming] = useState<StageTiming | null>(null);
  const [aging, setAging] = useState<AgingApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setActiveTab(initialTab), [initialTab]);

  // Load workspace members if manager
  useEffect(() => {
    if (!activeWorkspaceId || !isManager) return;
    fetchWorkspaceMembers(activeWorkspaceId)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [activeWorkspaceId, isManager]);

  const getDateBounds = useCallback((range: DateRangePreset) => {
    const end = new Date();
    const start = new Date();
    if (range === '30d') {
      start.setDate(end.getDate() - 30);
    } else if (range === '90d') {
      start.setDate(end.getDate() - 90);
    } else if (range === '180d') {
      start.setDate(end.getDate() - 180);
    } else if (range === '1y') {
      start.setFullYear(end.getFullYear() - 1);
    }
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      startLabel: start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      endLabel: end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    };
  }, []);

  const loadData = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setError(null);

    const bounds = getDateBounds(dateRange);
    const targetUserId = isManager && selectedMemberId ? selectedMemberId : null;

    try {
      const [overviewRes, timingRes, agingRes] = await Promise.all([
        fetchAnalyticsOverview(activeWorkspaceId, {
          startDate: bounds.startDate,
          endDate: bounds.endDate,
          userId: targetUserId,
        }),
        fetchStageTiming(activeWorkspaceId, {
          startDate: bounds.startDate,
          endDate: bounds.endDate,
          userId: targetUserId,
        }),
        fetchAgingApplications(activeWorkspaceId, {
          userId: targetUserId,
        }),
      ]);

      setOverview(overviewRes);
      setTiming(timingRes);
      setAging(agingRes);
    } catch (err: unknown) {
      console.error('Failed to load analytics:', err);
      setError((err as Error).message || 'Failed to load analytics');
      addToast({ type: 'danger', title: 'Unable to retrieve search analytics data' });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, dateRange, selectedMemberId, isManager, getDateBounds, addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExportCsv = () => {
    if (!overview) return;
    try {
      exportAnalyticsToCsv(overview, `jobquest-analytics-${dateRange}.csv`);
      addToast({ type: 'success', title: 'Exported analytics CSV (formula-sanitized)' });
    } catch {
      addToast({ type: 'danger', title: 'Failed to export CSV' });
    }
  };

  const handleExportJson = () => {
    if (!overview) return;
    try {
      exportAnalyticsToJson(overview, timing ?? undefined, `jobquest-analytics-${dateRange}.json`);
      addToast({ type: 'success', title: 'Exported analytics JSON' });
    } catch {
      addToast({ type: 'danger', title: 'Failed to export JSON' });
    }
  };

  const dateBounds = getDateBounds(dateRange);

  return (
    <div className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Analytics</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Applied {dateBounds.startLabel} – {dateBounds.endLabel} ·{' '}
            {isManager
              ? selectedMemberId
                ? `Member view: ${members.find((m) => m.user_id === selectedMemberId)?.user_id ?? 'selected'}`
                : `All members aggregate (${members.length || 'workspace'})`
              : 'your applications'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Manager Member Selector */}
          {isManager && (
            <div className="w-44">
              <Select
                aria-label="Filter by workspace member"
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="text-xs h-8"
              >
                <option value="">Owner: All members</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user_id.slice(0, 8)}... ({m.role})
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* Date Range Segmented Control */}
          <div className="inline-flex items-center gap-1.5" role="group" aria-label="Date range preset">
            {(['30d', '90d', '180d', '1y'] as DateRangePreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDateRange(preset)}
                className={`btn sm ${dateRange === preset ? 'primary' : 'ghost'}`}
                style={{ minHeight: '32px', minWidth: '44px' }}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Export Buttons */}
          <div className="inline-flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={!overview}
              className="text-xs h-8 min-h-[32px] px-3 gap-1.5"
            >
              <Download size={13} />
              Export CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportJson}
              disabled={!overview}
              className="text-xs h-8 min-h-[32px] px-3"
              title="Export complete analytics payload as JSON"
            >
              JSON
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs Bar & Tab Panels */}
      <Tabs id="analytics-tabs" activeTab={activeTab} onTabChange={(t) => setActiveTab(t as AnalyticsTab)}>
        <TabList aria-label="Analytics sections">
          <Tab id="overview">Overview</Tab>
          <Tab id="timing">Stage timing</Tab>
          <Tab id="aging">Aging</Tab>
          <Tab id="goals">Goals</Tab>
        </TabList>

        {/* Main Content Area */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-muted-foreground space-y-3">
            <RefreshCw size={24} className="animate-spin text-primary" />
            <p className="text-xs">Computing analytics metrics...</p>
          </div>
        ) : error ? (
          <div className="py-16 text-center space-y-3">
            <AlertCircle size={32} className="mx-auto text-rose-500" />
            <p className="text-sm font-medium text-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={loadData}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            <TabPanel id="overview">
              {overview && (
                <AnalyticsOverviewTab data={overview} isManager={isManager && !selectedMemberId} />
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
