import { SCHEDULER_HELP, SCHEDULER_LABELS, SCHEDULER_VARIANT, connectionLabel, type ProviderSchedulerStatus } from '../../lib/aiScheduler';
import { StatusBadge } from '../ui/StatusBadge';

// AI-11G: under each provider in Settings -> Providers. Two separate facts, never one green badge:
//   JobQuest connection  - can this provider talk to JobQuest and save results?
//   Scheduled execution  - has the provider's OWN scheduled task actually claimed and finished a run?
// A connection does not imply a working scheduler, and a scheduler that exists does not imply JobQuest is reachable from it.

const fmt = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
};

export function ProviderSchedulerSummary({ status }: { status: ProviderSchedulerStatus }) {
  const lastClaim = fmt(status.lastClaimAt);
  const lastDone = fmt(status.lastCompletedAt);
  return (
    <div data-testid={`${status.provider}-scheduling`} style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--color-border)' }}>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', margin: 0, fontSize: '13px', alignItems: 'center' }}>
        <dt className="muted">JobQuest connection</dt><dd style={{ margin: 0 }}>{connectionLabel(status)}</dd>
        <dt className="muted">Scheduled execution</dt>
        <dd style={{ margin: 0 }}><StatusBadge variant={SCHEDULER_VARIANT[status.scheduler]}>{SCHEDULER_LABELS[status.scheduler]}</StatusBadge></dd>
      </dl>
      <p className="muted" style={{ margin: '6px 0 0', fontSize: '13px' }}>
        {SCHEDULER_HELP[status.scheduler]}
        {lastClaim ? ` Last scheduled claim: ${lastClaim}.` : ''}
        {lastDone ? ` Last finished: ${lastDone}.` : ''}
      </p>
      <p className="muted" style={{ margin: '4px 0 0', fontSize: '13px' }}>
        Whether {status.label}’s scheduled tasks can use JobQuest is not assumed: it is shown as ready only after a scheduled run really completes. Set up each schedule from Automations.
      </p>
    </div>
  );
}
