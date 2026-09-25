import { useState, useEffect, type CSSProperties } from 'react';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { StagePips, PriorityBars } from '../ui/StagePips';
import { X, Maximize2, Clock, ArrowRight, CheckCircle2, Calendar, ExternalLink, MapPin } from 'lucide-react';
import { fetchApplicationEvents } from '../../api/applications';
import { calculateDaysInactive, computeAgingBand } from '../../types/applications';
import type { Application, ApplicationEvent, CanonicalWorkflow } from '../../types/applications';
import { describeEvent } from './eventText';
import { outcomeLabel, stageLabel } from './ApplicationsTable';

export interface ApplicationPreviewRailProps {
  application: Application | null;
  workflow: CanonicalWorkflow | null;
  /** Bumped by the view after every mutation so recent activity refetches. */
  historyVersion: number;
  onClose: () => void;
  onOpenFullDetail: (app: Application) => void;
  onOpenStageMove: (app: Application) => void;
  onOpenOutcome: (app: Application) => void;
  onKeepActive: (appId: string) => Promise<void>;
}

const headerBtn: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '8px',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-secondary)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
};

/**
 * Wide-desktop (>=1680px) persistent 440px preview rail (Gate 02B D4, ADR-029).
 * Rendered only when open; the view owns the open/closed preference.
 */
export function ApplicationPreviewRail({
  application,
  workflow,
  historyVersion,
  onClose,
  onOpenFullDetail,
  onOpenStageMove,
  onOpenOutcome,
  onKeepActive,
}: ApplicationPreviewRailProps) {
  const [recentEvents, setRecentEvents] = useState<ApplicationEvent[]>([]);
  const [keepingActive, setKeepingActive] = useState(false);
  const appId = application?.id ?? null;

  useEffect(() => {
    if (!appId) return;
    let cancelled = false;
    fetchApplicationEvents(appId)
      .then((evs) => {
        if (!cancelled) setRecentEvents(evs.slice(0, 4));
      })
      .catch(() => {
        if (!cancelled) setRecentEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [appId, historyVersion]);

  const railStyle: CSSProperties = {
    width: '440px',
    flexShrink: 0,
    background: 'var(--color-surface-1)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxHeight: 'calc(100vh - 120px)',
    position: 'sticky',
    top: '64px',
    overflowY: 'auto',
  };

  if (!application) {
    return (
      <aside style={railStyle} aria-label="Application quick preview">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Select an application to preview it here.</span>
          <button type="button" onClick={onClose} style={headerBtn} aria-label="Close preview rail" title="Close preview (P)">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </aside>
    );
  }

  const daysInactive = calculateDaysInactive(application.last_activity_at);
  const agingBand = application.status === 'OPEN' ? computeAgingBand(daysInactive) : null;
  const title = `${application.role_title} at ${application.company_name}`;

  const handleKeepActiveClick = async () => {
    try {
      setKeepingActive(true);
      await onKeepActive(application.id);
    } finally {
      setKeepingActive(false);
    }
  };

  return (
    <aside style={railStyle} aria-label="Application quick preview" data-app-id={application.id}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {application.company_name}
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '2px 0 0 0', color: 'var(--color-text-primary)' }}>{application.role_title}</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button type="button" onClick={() => onOpenFullDetail(application)} style={headerBtn} aria-label={`Open full details: ${title}`} title="Open full details">
            <Maximize2 size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={onClose} style={headerBtn} aria-label="Close preview rail" title="Close preview (P)">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <StagePips stage={application.stage} isClosed={application.status === 'CLOSED'} maxSteps={8} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{stageLabel(workflow, application.stage)}</span>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <StatusBadge variant={application.status === 'OPEN' ? 'accent' : 'muted'}>
              {application.status === 'OPEN' ? 'Open' : outcomeLabel(workflow, application.outcome)}
            </StatusBadge>
            {application.archived_at && <StatusBadge variant="muted">Archived</StatusBadge>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>Priority:</span>
            <PriorityBars priority={application.priority} />
          </div>
          <div
            style={{
              fontWeight: 600,
              color: agingBand === 'LONG_WAITING' ? 'var(--color-danger)' : agingBand === 'STALE' ? 'var(--color-warning)' : 'var(--color-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Clock size={12} aria-hidden="true" />
            {daysInactive === 0 ? 'Active today' : `${daysInactive}d inactive`}
          </div>
        </div>
      </div>

      {!application.archived_at && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <Button size="sm" variant="primary" style={{ flex: 1 }} onClick={() => onOpenStageMove(application)}>
            <ArrowRight size={13} style={{ marginRight: '4px' }} aria-hidden="true" />
            Move Stage
          </Button>
          {application.status === 'OPEN' && (
            <>
              <Button size="sm" variant="outline" onClick={() => void handleKeepActiveClick()} disabled={keepingActive} aria-label={`Keep active: ${title}`}>
                <Clock size={13} aria-hidden="true" style={{ marginRight: '4px' }} />
                Keep Active
              </Button>
              <Button size="sm" variant="outline" onClick={() => onOpenOutcome(application)} aria-label={`Record outcome: ${title}`}>
                <CheckCircle2 size={13} aria-hidden="true" style={{ marginRight: '4px' }} />
                Outcome
              </Button>
            </>
          )}
        </div>
      )}

      {application.next_action && (
        <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-selected)', border: '1px solid var(--color-brand-primary)' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-brand-primary)' }}>Next Action</div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: '2px' }}>{application.next_action}</div>
          {application.next_action_date && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={11} aria-hidden="true" /> Due: {application.next_action_date}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
        {(application.location || application.work_arrangement) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-secondary)' }}>
            <MapPin size={13} aria-hidden="true" />
            <span>{[application.location, application.work_arrangement].filter(Boolean).join(' · ')}</span>
          </div>
        )}
        {application.job_url && (
          <a
            href={application.job_url}
            target="_blank"
            rel="noreferrer noopener"
            style={{ color: 'var(--color-brand-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ExternalLink size={13} aria-hidden="true" /> Open job posting
          </a>
        )}
      </div>

      <section aria-label="Recent activity">
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>Recent Activity</div>
        {recentEvents.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>No recorded events yet.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {recentEvents.map((ev) => {
              const { label } = describeEvent(ev, workflow);
              return (
                <li
                  key={ev.id}
                  data-event-type={ev.event_type}
                  style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-2)', fontSize: '12px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{label}</span>
                  <time dateTime={ev.created_at} style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    {new Date(ev.created_at).toLocaleDateString()}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--color-border)' }}>
        <Button size="sm" variant="outline" style={{ width: '100%' }} onClick={() => onOpenFullDetail(application)}>
          View Full Application Details
        </Button>
      </div>
    </aside>
  );
}
