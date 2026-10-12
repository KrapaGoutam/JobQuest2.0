import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, Inbox, Settings2 } from 'lucide-react';
import { SOURCE_NOT_CONFIGURED, SOURCE_PROVIDER_FILTERS, SOURCE_STATUS_FILTERS, SOURCE_TITLES, type DateRange, type SourceKind, type SourceStatusFilter } from '../lib/aiSources';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import { StatusBadge } from '../components/ui/StatusBadge';
import type { SourcePage } from '../api/aiSources';

// Shared building blocks for the Job Leads, Email and Recruiter Intel pages so the three
// interaction models stay identical: draft filters + explicit Apply, 20 per page, the same
// loading / error / empty / not-configured states, and an announced result summary.

export const wrap = { overflowWrap: 'anywhere' as const, minWidth: 0 };

export type SourceLoadState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; rows: T[]; hasNext: boolean };

export function useSourceRows<T>(enabled: boolean, deps: readonly unknown[], load: () => Promise<SourcePage<T>>) {
  const [state, setState] = useState<SourceLoadState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setState({ status: 'loading' });
    load().then(
      (r) => { if (!cancelled) setState({ status: 'ready', ...r }); },
      () => { if (!cancelled) setState({ status: 'error' }); }, // isolated: never rethrown, other AI pages unaffected
    );
    return () => { cancelled = true; };
  }, [enabled, attempt, ...deps]);
  return { state, retry: () => setAttempt((n) => n + 1) };
}

/** Whether the source's workflow has ever run successfully; null = not loaded yet. Failures read as "unknown", never "not configured". */
export function useSourceConfigured(enabled: boolean, check: () => Promise<boolean>, deps: readonly unknown[]) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    check().then((v) => { if (!cancelled) setConfigured(v); }, () => { if (!cancelled) setConfigured(null); });
    return () => { cancelled = true; };
  }, [enabled, ...deps]);
  return configured;
}

// ---- filters ---------------------------------------------------------------------------------------------

export function FilterField({ label, children, grow = 1 }: { label: string; children: ReactNode; grow?: number }) {
  return (
    <label className="small" style={{ display: 'grid', gap: '2px', minWidth: 0, flex: `${grow} 1 150px` }}>
      <span className="muted">{label}</span>
      {children}
    </label>
  );
}

export function ProviderSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <FilterField label="Provider">
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {SOURCE_PROVIDER_FILTERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </Select>
    </FilterField>
  );
}

export function StatusSelect({ value, onChange }: { value: SourceStatusFilter; onChange: (v: SourceStatusFilter) => void }) {
  return (
    <FilterField label="Status">
      <Select value={value} onChange={(e) => onChange(e.target.value as SourceStatusFilter)}>
        {SOURCE_STATUS_FILTERS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </Select>
    </FilterField>
  );
}

export function DateRangeFields({ label, value, onChange, invalid, describedBy }: { label: string; value: DateRange; onChange: (v: DateRange) => void; invalid?: boolean; describedBy?: string }) {
  return (
    <>
      <FilterField label={`${label} from`}>
        <Input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} aria-invalid={invalid || undefined} aria-describedby={invalid ? describedBy : undefined} />
      </FilterField>
      <FilterField label={`${label} to`}>
        <Input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} aria-invalid={invalid || undefined} aria-describedby={invalid ? describedBy : undefined} />
      </FilterField>
    </>
  );
}

/** A labelled search landmark: Enter submits, filters are applied together, the form can be reset. */
export function SourceFilterForm({ label, onApply, onReset, message, children }: {
  label: string; onApply: () => void; onReset: () => void; message?: string | null; children: ReactNode;
}) {
  const submit = (e: FormEvent) => { e.preventDefault(); onApply(); };
  return (
    <form role="search" aria-label={label} onSubmit={submit} style={{ display: 'grid', gap: '10px' }}>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>{children}</div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Button type="submit" variant="primary">Apply filters</Button>
        <Button type="button" variant="secondary" onClick={onReset}>Reset filters</Button>
      </div>
      {message && <p id={`${label.replace(/\W+/g, '-').toLowerCase()}-msg`} role="alert" style={{ margin: 0 }}>{message}</p>}
    </form>
  );
}

// ---- states ------------------------------------------------------------------------------------------------

export function SourceLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={`Loading ${label}`} style={{ display: 'grid', gap: '10px' }}>
      <Skeleton height={20} width="40%" /><Skeleton height={96} /><Skeleton height={96} />
    </div>
  );
}

export function SourceError({ label, onRetry }: { label: string; onRetry?: () => void }) {
  return (
    <div role="alert">
      <EmptyState
        icon={<AlertTriangle size={22} />}
        title={`${label} could not be loaded.`}
        description="Your JobQuest applications and the rest of AI Hub are unaffected."
        action={onRetry ? <Button variant="secondary" onClick={onRetry}>Try again</Button> : undefined}
      />
    </div>
  );
}

export function SourceEmpty({ kind, configured, filtered, onOpenSettings }: { kind: SourceKind; configured: boolean | null; filtered: boolean; onOpenSettings?: () => void }) {
  if (!filtered && configured === false) {
    return (
      <EmptyState
        icon={<Settings2 size={22} />}
        title={`${SOURCE_TITLES[kind]} is not configured`}
        description={SOURCE_NOT_CONFIGURED[kind]}
        action={onOpenSettings ? <Button variant="secondary" onClick={onOpenSettings}>Open AI settings</Button> : undefined}
      />
    );
  }
  return (
    <EmptyState
      icon={<Inbox size={22} />}
      title={filtered ? 'No results match these filters.' : `No ${SOURCE_TITLES[kind].toLowerCase()} yet.`}
      description={filtered ? 'Try widening or resetting the filters.' : 'Results appear here after the next successful run.'}
    />
  );
}

/** Screen-reader summary of the visible result set (announced when filters or the page change). */
export function ResultsSummary({ count, hasNext, page, noun }: { count: number; hasNext: boolean; page: number; noun: string }) {
  const text = count === 0 ? `No ${noun} found.` : `Showing ${count} ${noun}${count === 1 ? '' : 's'} on page ${page + 1}${hasNext ? '; more on the next page' : ''}.`;
  return <p className="sr-only" role="status" aria-live="polite">{text}</p>;
}

export function SourcePager({ page, hasNext, onPage, label }: { page: number; hasNext: boolean; onPage: (p: number) => void; label: string }) {
  if (page === 0 && !hasNext) return null;
  return (
    <nav aria-label={`${label} pagination`} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <Button variant="secondary" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</Button>
      <span className="muted small" aria-live="polite">Page {page + 1}</span>
      <Button variant="secondary" disabled={!hasNext} onClick={() => onPage(page + 1)}>Next</Button>
    </nav>
  );
}

// ---- small shared bits -----------------------------------------------------------------------------------------

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority !== 'CRITICAL' && priority !== 'HIGH') return null;
  return <StatusBadge variant={priority === 'CRITICAL' ? 'danger' : 'warning'}>{priority === 'CRITICAL' ? 'Critical' : 'High priority'}</StatusBadge>;
}

/** A link to an external page. The visible text never contains the raw URL's credentials (they are rejected upstream). */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}<span className="sr-only"> (opens in a new tab)</span></a>;
}

/** Two-step dismiss: the only write on these pages (an AI review action; core records are never touched). */
export function DismissControl({ label, onDismiss }: { label: string; onDismiss: () => Promise<void> }) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'working' | 'error'>('idle');
  if (step === 'idle') return <Button variant="secondary" size="sm" onClick={() => setStep('confirm')} aria-label={`Dismiss ${label}`}>Dismiss</Button>;
  const run = () => { setStep('working'); onDismiss().catch(() => setStep('error')); };
  return (
    <span role="group" aria-label={`Confirm dismissing ${label}`} style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
      <Button variant="danger" size="sm" isLoading={step === 'working'} onClick={run}>Confirm dismiss</Button>
      <Button variant="secondary" size="sm" disabled={step === 'working'} onClick={() => setStep('idle')}>Cancel</Button>
      {step === 'error' && <span role="alert" className="small">Could not dismiss. Try again.</span>}
    </span>
  );
}
