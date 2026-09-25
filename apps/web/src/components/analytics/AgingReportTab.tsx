import React, { useState } from 'react';
import type { AgingApplication } from '../../types/analytics';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { supabase } from '../../supabase';
import { useToast } from '../../context/ToastContext';
import {
  Circle,
  Hourglass,
  BellRing,
  Moon,
  AlarmClockOff,
} from 'lucide-react';

interface AgingReportTabProps {
  applications: AgingApplication[];
  onRefresh: () => void;
}

export function AgingReportTab({ applications, onRefresh }: AgingReportTabProps) {
  const { addToast } = useToast();
  const [actingId, setActingId] = useState<string | null>(null);

  // Categorize counts
  const newCount = applications.filter((a) => a.aging_band === 'NEW').length;
  const waitingCount = applications.filter((a) => a.aging_band === 'WAITING').length;
  const followUpCount = applications.filter((a) => a.aging_band === 'FOLLOW_UP_RECOMMENDED').length;
  const staleCount = applications.filter((a) => a.aging_band === 'STALE').length;
  const longWaitingCount = applications.filter((a) => a.aging_band === 'LONG_WAITING').length;

  const handleKeepActive = async (id: string) => {
    try {
      setActingId(id);
      const { error } = await supabase.rpc('rpc_keep_application_active', {
        p_application_id: id,
      });
      if (error) throw error;
      addToast({ type: 'success', title: 'Application marked as active' });
      onRefresh();
    } catch (err: unknown) {
      addToast({ type: 'danger', title: (err as Error).message || 'Failed to keep active' });
    } finally {
      setActingId(null);
    }
  };

  const handleMarkGhosted = async (id: string) => {
    try {
      setActingId(id);
      const { error } = await supabase.rpc('rpc_set_application_outcome', {
        p_application_id: id,
        p_outcome: 'GHOSTED',
        p_closure_notes: 'Marked ghosted from Aging Report',
      });
      if (error) throw error;
      addToast({ type: 'success', title: 'Application marked as Ghosted' });
      onRefresh();
    } catch (err: unknown) {
      addToast({ type: 'danger', title: (err as Error).message || 'Failed to mark ghosted' });
    } finally {
      setActingId(null);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      setActingId(id);
      const { error } = await supabase.rpc('rpc_archive_application', {
        p_application_id: id,
      });
      if (error) throw error;
      addToast({ type: 'success', title: 'Application archived' });
      onRefresh();
    } catch (err: unknown) {
      addToast({ type: 'danger', title: (err as Error).message || 'Failed to archive' });
    } finally {
      setActingId(null);
    }
  };

  const getAgingBadge = (band: string, days: number) => {
    switch (band) {
      case 'NEW':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
            <Circle size={10} className="text-muted-foreground" />
            New · {days}d
          </span>
        );
      case 'WAITING':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
            <Hourglass size={12} className="text-muted-foreground" />
            Waiting · {days}d
          </span>
        );
      case 'FOLLOW_UP_RECOMMENDED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-amber-500 font-medium">
            <BellRing size={12} className="text-amber-500" />
            Follow up · {days}d
          </span>
        );
      case 'STALE':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-rose-500 font-semibold">
            <Moon size={12} className="text-rose-500" />
            Stale · {days}d
          </span>
        );
      case 'LONG_WAITING':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-rose-600 font-bold">
            <AlarmClockOff size={12} className="text-rose-600" />
            Long Waiting · {days}d
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* 5 Aging Band Header Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 bg-surface border border-border rounded-xl p-4 shadow-sm">
        <div className="p-2 border-r border-border">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Circle size={12} />
            New
          </div>
          <div className="text-2xl font-bold text-foreground mt-1">{newCount}</div>
          <div className="text-xs text-muted-foreground">≤3 days</div>
        </div>

        <div className="p-2 border-r border-border">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Hourglass size={12} />
            Waiting
          </div>
          <div className="text-2xl font-bold text-foreground mt-1">{waitingCount}</div>
          <div className="text-xs text-muted-foreground">4–7 days</div>
        </div>

        <div className="p-2 border-r border-border">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-500">
            <BellRing size={12} />
            Follow-Up Recommended
          </div>
          <div className="text-2xl font-bold text-foreground mt-1">{followUpCount}</div>
          <div className="text-xs text-muted-foreground">8–14 days</div>
        </div>

        <div className="p-2 border-r border-border">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-500">
            <Moon size={12} />
            Stale
          </div>
          <div className="text-2xl font-bold text-foreground mt-1">{staleCount}</div>
          <div className="text-xs text-muted-foreground">15–30 days</div>
        </div>

        <div className="p-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600">
            <AlarmClockOff size={12} />
            Long Waiting
          </div>
          <div className="text-2xl font-bold text-foreground mt-1">{longWaitingCount}</div>
          <div className="text-xs text-muted-foreground">31+ days</div>
        </div>
      </div>

      {/* Review Quiet Applications Banner */}
      <div className="p-4 rounded-xl bg-muted/60 border border-border flex items-start gap-3 text-xs leading-relaxed text-foreground">
        <AlarmClockOff size={16} className="text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold">{longWaitingCount} applications</strong> have had no
          activity for <strong className="font-semibold">31+ days</strong> (Long Waiting band) and
          appear in <strong className="font-semibold">Review quiet applications</strong> on the
          dashboard (OQ-022 resolved). Review actions: Keep Active, Mark Ghosted, Archive.{' '}
          <span className="text-muted-foreground">Zero automatic state changes.</span>
        </div>
      </div>

      {/* Table of Open Applications & Aging Actions */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground font-medium">
                <th className="py-3 px-4">Application</th>
                <th className="py-3 px-3">Stage</th>
                <th className="py-3 px-3">Aging</th>
                <th className="py-3 px-3">Last Activity</th>
                <th className="py-3 px-3">Next Action</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {applications.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No active applications found
                  </td>
                </tr>
              ) : (
                applications.map((app) => (
                  <tr key={app.id} className="hover:bg-muted/30">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-foreground">{app.company_name}</div>
                      <div className="text-muted-foreground">{app.role_title}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-muted text-foreground font-medium text-[11px]">
                        {app.stage}
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getAgingBadge(app.aging_band, app.days_inactive)}
                    </td>
                    <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">
                      {new Date(app.last_activity_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-3 text-muted-foreground">
                      {app.next_action_title ? (
                        <div>
                          <div className="font-medium text-foreground truncate max-w-[150px]">
                            {app.next_action_title}
                          </div>
                          {app.next_action_due && (
                            <div className="text-[11px] text-muted-foreground">
                              {new Date(app.next_action_due).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">None scheduled</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actingId === app.id}
                          onClick={() => handleKeepActive(app.id)}
                          className="h-7 text-xs px-2"
                        >
                          Keep
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actingId === app.id}
                          onClick={() => handleMarkGhosted(app.id)}
                          className="h-7 text-xs px-2 text-amber-500 hover:text-amber-600"
                        >
                          Mark Ghosted
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actingId === app.id}
                          onClick={() => handleArchive(app.id)}
                          className="h-7 text-xs px-2 text-rose-500 hover:text-rose-600"
                        >
                          Archive
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
