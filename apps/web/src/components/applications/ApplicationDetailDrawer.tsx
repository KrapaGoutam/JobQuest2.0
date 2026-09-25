import { useState, useEffect } from 'react';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { Tabs, TabList, Tab, TabPanel } from '../ui/Tabs';
import { StatusBadge } from '../ui/StatusBadge';
import { StagePips } from '../ui/StagePips';
import { PriorityBars } from '../ui/StagePips';
import {
  ExternalLink,
  Clock,
  ArrowRight,
  CheckCircle2,
  Calendar,
  MapPin,
  DollarSign,
  Briefcase,
  Archive,
  Undo2,
  Edit,
} from 'lucide-react';
import { fetchApplicationEvents } from '../../api/applications';
import { calculateDaysInactive, computeAgingBand } from '../../types/applications';
import type { Application, ApplicationEvent, CanonicalWorkflow } from '../../types/applications';

export interface ApplicationDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  application: Application | null;
  workflow: CanonicalWorkflow | null;
  onOpenStageMove: (app: Application) => void;
  onOpenOutcome: (app: Application) => void;
  onKeepActive: (appId: string) => Promise<void>;
  onArchive: (appId: string) => Promise<void>;
  onRestore: (appId: string) => Promise<void>;
  onEdit: (app: Application) => void;
}

export function ApplicationDetailDrawer({
  isOpen,
  onClose,
  application,
  workflow,
  onOpenStageMove,
  onOpenOutcome,
  onKeepActive,
  onArchive,
  onRestore,
  onEdit,
}: ApplicationDetailDrawerProps) {
  const [events, setEvents] = useState<ApplicationEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [activeTab, setActiveTab] = useState('timeline');
  const [keepingActive, setKeepingActive] = useState(false);

  useEffect(() => {
    if (application && isOpen) {
      setLoadingEvents(true);
      fetchApplicationEvents(application.id)
        .then(setEvents)
        .catch(() => setEvents([]))
        .finally(() => setLoadingEvents(false));
    }
  }, [application, isOpen]);

  if (!application) return null;

  const daysInactive = calculateDaysInactive(application.last_activity_at);
  const agingBand = computeAgingBand(daysInactive);

  const handleKeepActiveClick = async () => {
    try {
      setKeepingActive(true);
      await onKeepActive(application.id);
      const updatedEvents = await fetchApplicationEvents(application.id);
      setEvents(updatedEvents);
    } finally {
      setKeepingActive(false);
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`${application.role_title} · ${application.company_name}`}
      width={600}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px' }}>
        {/* Header Strip */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {application.company_name}
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '2px 0 6px 0', color: 'var(--color-text-primary)' }}>
                {application.role_title}
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <StatusBadge variant={application.status === 'OPEN' ? 'accent' : 'muted'}>
                {application.status === 'OPEN' ? 'OPEN' : application.outcome || 'CLOSED'}
              </StatusBadge>
              {application.archived_at && (
                <StatusBadge variant="muted">Archived</StatusBadge>
              )}
            </div>
          </div>

          {/* Stage Progress Pip Bar */}
          <div
            style={{
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <StagePips stage={application.stage} isClosed={application.status === 'CLOSED'} maxSteps={8} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-brand-primary)' }}>
                {workflow?.stages?.find(s => s.id === application.stage || s.label.toUpperCase() === application.stage.toUpperCase())?.label || application.stage}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Priority:</span>
                <PriorityBars priority={application.priority} />
              </div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: agingBand === 'LONG_WAITING' ? 'var(--color-danger)' : agingBand === 'STALE' ? 'var(--color-warning)' : 'var(--color-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Clock size={13} />
                {daysInactive === 0 ? 'Today' : `${daysInactive}d inactive`}
                {agingBand === 'LONG_WAITING' && ' (Long Waiting)'}
                {agingBand === 'STALE' && ' (Stale)'}
              </div>
            </div>
          </div>

          {/* Quick Action Strip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {application.status === 'OPEN' ? (
              <>
                <Button size="sm" variant="primary" onClick={() => onOpenStageMove(application)}>
                  <ArrowRight size={14} style={{ marginRight: '6px' }} />
                  Move Stage
                </Button>
                <Button size="sm" variant="outline" onClick={() => onOpenOutcome(application)}>
                  <CheckCircle2 size={14} style={{ marginRight: '6px' }} />
                  Record Outcome
                </Button>
                <Button size="sm" variant="outline" onClick={handleKeepActiveClick} disabled={keepingActive}>
                  <Clock size={14} style={{ marginRight: '6px' }} />
                  {keepingActive ? 'Updating...' : 'Keep Active'}
                </Button>
              </>
            ) : (
              <Button size="sm" variant="primary" onClick={() => onOpenStageMove(application)}>
                <ArrowRight size={14} style={{ marginRight: '6px' }} />
                Reopen / Move Stage
              </Button>
            )}

            <Button size="sm" variant="ghost" onClick={() => onEdit(application)}>
              <Edit size={14} style={{ marginRight: '6px' }} />
              Edit
            </Button>

            {!application.archived_at ? (
              <Button size="sm" variant="ghost" onClick={() => onArchive(application.id)}>
                <Archive size={14} style={{ marginRight: '6px' }} />
                Archive
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => onRestore(application.id)}>
                <Undo2 size={14} style={{ marginRight: '6px' }} />
                Restore
              </Button>
            )}
          </div>
        </div>

        {/* Next Action Box */}
        {application.next_action && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface-selected)',
              border: '1px solid var(--color-brand-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-brand-primary)', textTransform: 'uppercase' }}>
                Next Action
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: '2px' }}>
                {application.next_action}
              </div>
              {application.next_action_date && (
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={12} /> Due: {application.next_action_date}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Tabs */}
        <div>
          <Tabs id="app-drawer-tabs" activeTab={activeTab} onTabChange={setActiveTab}>
            <TabList aria-label="Application detail sections">
              <Tab id="timeline" count={events.length}>Timeline</Tab>
              <Tab id="snapshot">Job Posting</Tab>
              <Tab id="details">Details & Notes</Tab>
            </TabList>

            <TabPanel id="timeline">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {loadingEvents ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    Loading history...
                  </div>
                ) : events.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                    No recorded timeline events for this application.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {events.map((ev) => {
                      const dateStr = new Date(ev.created_at).toLocaleString();
                      let label: string = ev.event_type;
                      let detail = '';

                      if (ev.event_type === 'STAGE_CHANGED') {
                        label = `Moved Stage: ${ev.payload?.from_stage} → ${ev.payload?.to_stage}`;
                        if (ev.payload?.notes) detail = String(ev.payload.notes);
                      } else if (ev.event_type === 'OUTCOME_CHANGED') {
                        label = `Closed: ${ev.payload?.outcome}`;
                        if (ev.payload?.closure_reason) detail = `Reason: ${ev.payload.closure_reason}`;
                        if (ev.payload?.closure_notes) detail += ` — ${ev.payload.closure_notes}`;
                      } else if (ev.event_type === 'KEEP_ACTIVE') {
                        label = 'Activity Refreshed (Keep Active)';
                      } else if (ev.event_type === 'ARCHIVED') {
                        label = 'Archived Application';
                      } else if (ev.event_type === 'RESTORED') {
                        label = 'Restored Application';
                      } else if (ev.event_type === 'CREATED') {
                        label = 'Application Created';
                      }

                      return (
                        <div
                          key={ev.id}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--color-surface-2)',
                            border: '1px solid var(--color-border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                              {label}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                              {dateStr}
                            </span>
                          </div>
                          {detail && (
                            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                              {detail}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabPanel>

            {/* Snapshot Tab */}
            <TabPanel id="snapshot">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {application.job_snapshot ? (
                  <>
                    {application.job_snapshot.skills && (
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                          Skills & Keywords
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', background: 'var(--color-surface-2)', padding: '10px', borderRadius: 'var(--radius-md)' }}>
                          {application.job_snapshot.skills}
                        </div>
                      </div>
                    )}
                    {application.job_snapshot.requirements && (
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                          Requirements & Qualifications
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', background: 'var(--color-surface-2)', padding: '10px', borderRadius: 'var(--radius-md)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                          {application.job_snapshot.requirements}
                        </div>
                      </div>
                    )}
                    {application.job_snapshot.job_description && (
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                          Full Job Posting Text
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', background: 'var(--color-surface-2)', padding: '10px', borderRadius: 'var(--radius-md)', whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto', lineHeight: 1.5 }}>
                          {application.job_snapshot.job_description}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                    No job posting text was captured for this application.
                  </div>
                )}
              </div>
            </TabPanel>

            {/* Details Tab */}
            <TabPanel id="details">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                  {application.location && (
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Location</div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <MapPin size={13} /> {application.location}
                      </div>
                    </div>
                  )}

                  {application.work_arrangement && (
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Arrangement</div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <Briefcase size={13} /> {application.work_arrangement}
                      </div>
                    </div>
                  )}

                  {(application.salary_min || application.salary_max) && (
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Compensation</div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <DollarSign size={13} />
                        {application.salary_min && application.salary_max
                          ? `${application.salary_min.toLocaleString()} – ${application.salary_max.toLocaleString()} ${application.salary_currency}`
                          : application.salary_min
                          ? `From ${application.salary_min.toLocaleString()} ${application.salary_currency}`
                          : `Up to ${application.salary_max?.toLocaleString()} ${application.salary_currency}`}
                      </div>
                    </div>
                  )}

                  {application.job_url && (
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Posting URL</div>
                      <a
                        href={application.job_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        style={{ fontSize: '13px', color: 'var(--color-brand-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}
                      >
                        <ExternalLink size={13} /> View Link
                      </a>
                    </div>
                  )}

                  {application.external_job_id && (
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Requisition ID</div>
                      <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', marginTop: '2px' }}>
                        {application.external_job_id}
                      </div>
                    </div>
                  )}
                </div>

                {application.tags && application.tags.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Tags</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {application.tags.map((t) => (
                        <span
                          key={t}
                          style={{
                            fontSize: '11px',
                            background: 'var(--color-surface-2)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-full)',
                            padding: '2px 8px',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {application.notes && (
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Notes</div>
                    <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', background: 'var(--color-surface-2)', padding: '10px 14px', borderRadius: 'var(--radius-md)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {application.notes}
                    </div>
                  </div>
                )}
              </div>
            </TabPanel>
          </Tabs>
        </div>
      </div>
    </Drawer>
  );
}
