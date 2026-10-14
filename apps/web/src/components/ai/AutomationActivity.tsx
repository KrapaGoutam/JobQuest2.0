import type { CSSProperties } from 'react';
import {
  INSIGHT_WINDOWS, PROVIDER_LABELS, WORKFLOW_LABELS, formatDuration, formatPercent,
  type AutomationAnalyticsView, type AutomationInsights, type AutomationProvider, type AutomationView, type AutomationWorkflow, type RunTally,
} from '../../lib/aiAutomation';
import { aiErrorCategoryLabel } from '../../lib/aiHub';
import { Select } from '../ui/Select';

// AI-11H: "Automation activity" - derived run analytics (success, failures, manual vs scheduled, per provider and workflow, source
// problems, retries, duration). Everything comes from the server's derivation of ai_runs; nothing is stored here. Pure presentation
// so it can be rendered on the server in tests.

const small: CSSProperties = { fontSize: '13px' };
const dl: CSSProperties = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', margin: 0, ...small };

const providerLabel = (k: string) => PROVIDER_LABELS[k as AutomationProvider] ?? k;
const workflowLabel = (k: string) => WORKFLOW_LABELS[k as AutomationWorkflow] ?? k;
const tallyText = (t: RunTally) => `${t.runs} run${t.runs === 1 ? '' : 's'} · ${t.succeeded} succeeded${t.partial ? ` · ${t.partial} partial` : ''}${t.failed ? ` · ${t.failed} failed` : ''}`;

export interface AutomationActivityProps {
  insights: AutomationInsights | null;
  state: 'loading' | 'error' | 'ready';
  days: 7 | 30 | 90;
  automations: readonly Pick<AutomationView, 'id' | 'name'>[];
  onDays(d: 7 | 30 | 90): void;
  onRetry(): void;
  formatAt(iso: string): string;
}

export function AutomationActivity({ insights, state, days, automations, onDays, onRetry, formatAt }: AutomationActivityProps) {
  const a: AutomationAnalyticsView | null = insights?.analytics ?? null;
  const name = (id: string) => automations.find((x) => x.id === id)?.name ?? 'Deleted automation';
  return (
    <section aria-labelledby="automation-activity-title" data-testid="automation-activity" style={{ display: 'grid', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <b id="automation-activity-title" style={{ fontSize: '14px' }}>Automation activity</b>
        <label style={{ ...small, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="muted">Period</span>
          <Select
            aria-label="Activity period"
            value={String(days)}
            onChange={(e) => onDays(Number(e.target.value) as 7 | 30 | 90)}
            options={INSIGHT_WINDOWS.map((d) => ({ value: String(d), label: `Last ${d} days` }))}
          />
        </label>
      </div>
      {state === 'loading' && <p role="status" className="muted" style={{ margin: 0, ...small }}>Loading activity…</p>}
      {state === 'error' && (
        <p role="alert" style={{ margin: 0, ...small, color: 'var(--color-danger)' }}>
          Couldn’t load activity. Your automations are unaffected. <button type="button" onClick={onRetry} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>Try again</button>
        </p>
      )}
      {state === 'ready' && a && a.totalRuns === 0 && <p className="muted" style={{ margin: 0, ...small }}>No automation runs in the last {a.windowDays} days. Activity appears after a provider claims or submits a run.</p>}
      {state === 'ready' && a && a.totalRuns > 0 && (
        <>
          <dl style={dl}>
            <dt className="muted">Runs</dt><dd style={{ margin: 0 }}>{a.totalRuns} ({a.finishedRuns} finished{a.inFlightRuns ? `, ${a.inFlightRuns} in progress` : ''})</dd>
            <dt className="muted">Succeeded</dt><dd style={{ margin: 0 }}>{a.succeeded} · success rate {formatPercent(a.successRate)} of finished</dd>
            <dt className="muted">Partial</dt><dd style={{ margin: 0 }}>{a.partial}</dd>
            <dt className="muted">Failed</dt><dd style={{ margin: 0 }}>{a.failed}</dd>
            <dt className="muted">Started by</dt><dd style={{ margin: 0 }}>{a.byTrigger.scheduled} scheduled · {a.byTrigger.manual} manual · {a.byTrigger.retry} retry</dd>
            <dt className="muted">Retries</dt><dd style={{ margin: 0 }}>{a.retries.attempts} attempt{a.retries.attempts === 1 ? '' : 's'}, {a.retries.recovered} recovered</dd>
            <dt className="muted">Average completion</dt><dd style={{ margin: 0 }}>{formatDuration(a.avgCompletionMs)}</dd>
            <dt className="muted">Source problems</dt>
            <dd style={{ margin: 0 }}>
              {a.sourceProblems.total === 0 ? 'None reported' : `${a.sourceProblems.total} unavailable, blocked or errored (${a.sourceProblems.byType.map((t) => `${t.key} ${t.count}`).join(', ')})`}
            </dd>
          </dl>
          {a.byProvider.length > 0 && (
            <div>
              <b style={small}>By provider</b>
              <ul style={{ margin: '4px 0 0', paddingLeft: '20px', ...small }}>{a.byProvider.map((t) => <li key={t.key}>{providerLabel(t.key)}: {tallyText(t)}</li>)}</ul>
            </div>
          )}
          {a.byWorkflow.length > 0 && (
            <div>
              <b style={small}>By workflow</b>
              <ul style={{ margin: '4px 0 0', paddingLeft: '20px', ...small }}>{a.byWorkflow.map((t) => <li key={t.key}>{workflowLabel(t.key)}: {tallyText(t)}</li>)}</ul>
            </div>
          )}
          {a.recentFailures.length > 0 && (
            <div>
              <b style={small}>Recent failures</b>
              <ul style={{ margin: '4px 0 0', paddingLeft: '20px', ...small }} data-testid="recent-failures">
                {a.recentFailures.map((f) => (
                  <li key={f.runId}>{name(f.automationId)} · {providerLabel(f.provider)} · {formatAt(f.at)}{f.errorCategory ? ` · ${aiErrorCategoryLabel(f.errorCategory)}` : ''}</li>
                ))}
              </ul>
            </div>
          )}
          {insights?.truncated && <p className="muted" style={{ margin: 0, ...small }}>Showing the newest {a.totalRuns} runs only.</p>}
          <p className="muted" style={{ margin: 0, ...small }}>
            Success rate counts partial runs separately. Average completion includes the time the provider spent working. Derived from your recent runs; nothing here is stored.
          </p>
        </>
      )}
    </section>
  );
}
