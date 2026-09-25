import { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { StagePips } from '../ui/StagePips';
import { PriorityBars } from '../ui/StagePips';
import {
  X,
  Maximize2,
  Clock,
  ArrowRight,
  CheckCircle2,
  Calendar,
  ExternalLink,
  MapPin,
} from 'lucide-react';
import { fetchApplicationEvents } from '../../api/applications';
import { calculateDaysInactive, computeAgingBand } from '../../types/applications';
import type { Application, ApplicationEvent } from '../../types/applications';

export interface ApplicationPreviewRailProps {
  application: Application | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenFullDetail: (app: Application) => void;
  onOpenStageMove: (app: Application) => void;
  onOpenOutcome: (app: Application) => void;
  onKeepActive: (appId: string) => Promise<void>;
}

export function ApplicationPreviewRail({
  application,
  isOpen,
  onClose,
  onOpenFullDetail,
  onOpenStageMove,
  onOpenOutcome,
  onKeepActive,
}: ApplicationPreviewRailProps) {
  const [recentEvents, setRecentEvents] = useState<ApplicationEvent[]>([]);
  const [keepingActive, setKeepingActive] = useState(false);

  useEffect(() => {
    if (application && isOpen) {
      fetchApplicationEvents(application.id)
        .then((evs) => setRecentEvents(evs.slice(0, 3)))
        .catch(() => setRecentEvents([]));
    }
  }, [application, isOpen]);

  if (!isOpen || !application) return null;

  const daysInactive = calculateDaysInactive(application.last_activity_at);
  const agingBand = computeAgingBand(daysInactive);

  const handleKeepActiveClick = async () => {
    try {
      setKeepingActive(true);
      await onKeepActive(application.id);
      const updated = await fetchApplicationEvents(application.id);
      setRecentEvents(updated.slice(0, 3));
    } finally {
      setKeepingActive(false);
    }
  };

  return (
    <aside
      style={{
        width: '420px',
        flexShrink: 0,
        background: 'var(--color-surface-1)',
        borderLeft: '1px solid var(--color-border)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        height: 'calc(100vh - 120px)',
        position: 'sticky',
        top: '64px',
        overflowY: 'auto',
      }}
      aria-label="Application quick preview"
    >
      {/* Rail Header with Controls */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {application.company_name}
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '2px 0 0 0', color: 'var(--color-text-primary)' }}>
            {application.role_title}
          </h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={() => onOpenFullDetail(application)}
            title="Open full drawer"
            style={{
              background: 'none',
              border: 'none',
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="Expand detail view"
          >
            <Maximize2 size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close preview (P)"
            style={{
              background: 'none',
              border: 'none',
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="Close preview rail"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Stage & Priority Strip */}
      <div
        style={{
          padding: '10px 12px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <StagePips stage={application.stage} isClosed={application.status === 'CLOSED'} maxSteps={8} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-brand-primary)' }}>
              {application.stage}
            </span>
          </div>
          <StatusBadge variant={application.status === 'OPEN' ? 'accent' : 'muted'}>
            {application.status === 'OPEN' ? 'OPEN' : application.outcome || 'CLOSED'}
          </StatusBadge>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>Priority:</span>
            <PriorityBars priority={application.priority} />
          </div>
          <div
            style={{
              fontWeight: 600,
              color: agingBand === 'LONG_WAITING' ? 'var(--color-danger)' : agingBand === 'STALE' ? 'var(--color-warning)' : 'var(--color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Clock size={12} />
            {daysInactive === 0 ? 'Active today' : `${daysInactive}d inactive`}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {application.status === 'OPEN' ? (
          <>
            <Button size="sm" variant="primary" style={{ flex: 1 }} onClick={() => onOpenStageMove(application)}>
              <ArrowRight size={13} style={{ marginRight: '4px' }} />
              Move Stage
            </Button>
            <Button size="sm" variant="outline" onClick={handleKeepActiveClick} disabled={keepingActive} title="Refresh last activity">
              <Clock size={13} />
            </Button>
            <Button size="sm" variant="outline" onClick={() => onOpenOutcome(application)} title="Record outcome">
              <CheckCircle2 size={13} />
            </Button>
          </>
        ) : (
          <Button size="sm" variant="primary" style={{ flex: 1 }} onClick={() => onOpenStageMove(application)}>
            Reopen Application
          </Button>
        )}
      </div>

      {/* Next Action Box */}
      {application.next_action && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-surface-selected)',
            border: '1px solid var(--color-brand-primary)',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-brand-primary)' }}>
            Next Action
          </div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: '2px' }}>
            {application.next_action}
          </div>
          {application.next_action_date && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={11} /> Due: {application.next_action_date}
            </div>
          )}
        </div>
      )}

      {/* Metadata Overview */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
        {application.location && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-secondary)' }}>
            <MapPin size={13} style={{ color: 'var(--color-text-muted)' }} />
            <span>{application.location} ({application.work_arrangement || 'Remote'})</span>
          </div>
        )}
        {application.job_url && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ExternalLink size={13} style={{ color: 'var(--color-brand-primary)' }} />
            <a
              href={application.job_url}
              target="_blank"
              rel="noreferrer noopener"
              style={{ color: 'var(--color-brand-primary)', textDecoration: 'none' }}
            >
              Open Job Posting Link
            </a>
          </div>
        )}
      </div>

      {/* Recent Timeline Preview */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
          Recent Activity
        </div>
        {recentEvents.length === 0 ? (
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
            No recent events recorded.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {recentEvents.map((ev) => (
              <div
                key={ev.id}
                style={{
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-surface-2)',
                  fontSize: '11px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  <span>{ev.event_type.replace('_', ' ')}</span>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>
                    {new Date(ev.created_at).toLocaleDateString()}
                  </span>
                </div>
                {Boolean(ev.payload?.to_stage) && (
                  <div style={{ color: 'var(--color-text-secondary)' }}>
                    → {String(ev.payload?.to_stage)}
                  </div>
                )}
                {Boolean(ev.payload?.outcome) && (
                  <div style={{ color: 'var(--color-text-secondary)' }}>
                    → {String(ev.payload?.outcome)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--color-border)' }}>
        <Button
          size="sm"
          variant="outline"
          style={{ width: '100%' }}
          onClick={() => onOpenFullDetail(application)}
        >
          View Full Application Details
        </Button>
      </div>
    </aside>
  );
}
