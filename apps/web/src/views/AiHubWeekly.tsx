import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PublicSession } from '../api';
import { fetchWeeklyDigest, WeeklyApiError } from '../api/aiDigest';
import {
  WEEKLY_STATUS_HELP, WEEKLY_STATUS_LABELS, formatWeekRange, nextWeek, orderedWeeklySections, previousWeek, weeklyStatusVariant,
  type WeeklyDigest, type WeeklySection,
} from '../lib/aiWeekly';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';

// AI-11H: AI Hub -> Weekly Digest. A computed report of one owner-local week (see aiWeeklyDigestService for the semantics). Read-only:
// every handler only changes which week is shown; nothing here changes a record. All strings come from the server report and are
// rendered as React text (escaped): application, email, job and recruiter text is untrusted DATA, never instructions.

export type WeeklyLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; digest: WeeklyDigest };

const wrap = { overflowWrap: 'anywhere' as const, minWidth: 0 };

function SectionCard({ section }: { section: WeeklySection }) {
  const showItems = section.items.length > 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{section.title}</span>
            <StatusBadge variant={weeklyStatusVariant(section.status)}>{WEEKLY_STATUS_LABELS[section.status]}</StatusBadge>
          </span>
        </CardTitle>
      </CardHeader>
      <CardBody>
        <p style={{ margin: 0, ...wrap }}>{section.headline}</p>
        {section.status !== 'available' && WEEKLY_STATUS_HELP[section.status] && section.status !== 'zero' && (
          <p className="muted small" style={{ margin: '4px 0 0', ...wrap }}>{WEEKLY_STATUS_HELP[section.status]}</p>
        )}
        {section.metrics.length > 0 && (
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px 16px', margin: '10px 0 0' }}>
            {section.metrics.map((m) => (
              <div key={m.label} style={{ minWidth: 0 }}>
                <dt className="muted small" style={wrap}>{m.label}</dt>
                <dd style={{ margin: 0, fontWeight: 600, fontSize: '18px', ...wrap }}>{m.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {showItems && (
          <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: '6px' }}>
            {section.items.map((it, i) => (
              <li key={`${it.title}-${i}`} style={{ display: 'grid', gap: '2px', ...wrap }}>
                <span style={{ fontWeight: 600 }}>{it.title}</span>
                {it.detail && <span className="muted small">{it.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export interface AiHubWeeklyPanelProps {
  state: WeeklyLoadState;
  onWeek(weekStart: string | null): void;
  onRetry(): void;
}

/** Presentational (rendered on the server in tests): header with week navigation, then the sections in canonical order. */
export function AiHubWeeklyPanel({ state, onWeek, onRetry }: AiHubWeeklyPanelProps) {
  if (state.status === 'loading') {
    return <div role="status" aria-live="polite" aria-label="Loading the weekly digest" style={{ display: 'grid', gap: '12px' }}><Skeleton height={64} /><Skeleton height={140} /><Skeleton height={140} /></div>;
  }
  if (state.status === 'error') {
    return (
      <Card>
        <CardBody>
          <EmptyState title="The weekly digest couldn’t load" description={state.message} action={<Button variant="secondary" onClick={onRetry}>Try again</Button>} />
        </CardBody>
      </Card>
    );
  }
  const d = state.digest;
  const prev = previousWeek(d);
  const next = nextWeek(d);
  return (
    <div style={{ display: 'grid', gap: '12px' }} data-testid="weekly-digest">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>{formatWeekRange(d.weekStart, d.weekEnd)}</h2>
          <span className="muted small">
            {d.inProgress ? 'This week so far' : 'Completed week'} · {d.timeZone}
          </span>
        </div>
        <nav aria-label="Choose a week" style={{ display: 'flex', gap: '8px' }}>
          <Button size="sm" variant="secondary" disabled={!prev} onClick={() => prev && onWeek(prev)} leftIcon={<ChevronLeft size={14} aria-hidden />}>Previous week</Button>
          <Button size="sm" variant="secondary" disabled={!next} onClick={() => next && onWeek(next)} rightIcon={<ChevronRight size={14} aria-hidden />}>Next week</Button>
          {d.weekStart !== d.currentWeekStart && <Button size="sm" variant="secondary" onClick={() => onWeek(null)}>This week</Button>}
        </nav>
      </div>
      {orderedWeeklySections(d.sections).map((s) => <SectionCard key={s.key} section={s} />)}
      <Card>
        <CardBody>
          <ul className="muted small" style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '2px' }} aria-label="How to read this report">
            {d.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

export function AiHubWeekly({ activeWorkspaceId, session }: { activeWorkspaceId: string | null; session?: PublicSession | null }) {
  const [week, setWeek] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<WeeklyLoadState>({ status: 'loading' });
  useEffect(() => {
    if (!activeWorkspaceId || !session) return undefined;
    let cancelled = false;
    setState({ status: 'loading' });
    fetchWeeklyDigest(activeWorkspaceId, session, week).then(
      (digest) => { if (!cancelled) setState({ status: 'ready', digest }); },
      (e: unknown) => { if (!cancelled) setState({ status: 'error', message: e instanceof WeeklyApiError ? e.message : 'Something went wrong while building the report. Your data is unchanged.' }); },
    );
    return () => { cancelled = true; };
  }, [activeWorkspaceId, week, attempt, session?.access_token]);
  if (!activeWorkspaceId || !session) {
    return <Card><CardBody><EmptyState title="Select a workspace" description="Choose a workspace to see its weekly digest." /></CardBody></Card>;
  }
  return <AiHubWeeklyPanel state={state} onWeek={setWeek} onRetry={() => setAttempt((n) => n + 1)} />;
}
