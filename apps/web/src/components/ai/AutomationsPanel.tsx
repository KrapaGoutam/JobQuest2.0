import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { PublicSession } from '../../api';
import { AutomationApiError, deleteAutomation, fetchAutomationRuns, fetchAutomations, runAutomationNow, saveAutomation } from '../../api/aiAutomations';
import {
  AUTOMATION_COMPOSITE_WORKFLOWS, AUTOMATION_DELIVERY, AUTOMATION_LIMIT, AUTOMATION_NAME_MAX, AUTOMATION_PROVIDERS,
  AUTOMATION_SECTIONS, AUTOMATION_WORKFLOWS, CADENCE_LABELS, DELIVERY_LABELS, EXECUTOR_LABELS, PROVIDER_LABELS, RUN_NOW_REASON_LABELS,
  RUN_STATUS_LABELS, SECTION_LABELS, TRIGGER_LABELS, WEEKDAY_LABELS, WORKFLOW_LABELS, automationHealth, automationToForm, describeSchedule, emptyAutomationForm,
  formatInZone, orderedSections, validateAutomationForm,
  type AutomationCadence, type AutomationFormErrors, type AutomationFormState, type AutomationRunView, type AutomationView,
} from '../../lib/aiAutomation';
import { aiErrorCategoryLabel } from '../../lib/aiHub';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Dialog } from '../ui/Dialog';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { StatusBadge } from '../ui/StatusBadge';
import { Switch } from '../ui/Switch';

// AI-11A: Settings -> AI & Automation -> Automations. "What intelligence workflow should run, and when?" It never
// touches provider credentials (that is Providers: "how can JobQuest talk to this AI?"). JobQuest does not execute
// workflows; the schedule here is the canonical definition that the provider-side schedule should follow.

export type AutomationsLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; automations: AutomationView[] };

const rowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' };
const stackStyle: CSSProperties = { display: 'grid', gap: '12px' };
const mutedSmall = { fontSize: '13px' } as const;
const cadenceOptions = Object.entries(CADENCE_LABELS).map(([value, label]) => ({ value, label }));
const providerOptions = AUTOMATION_PROVIDERS.map((p) => ({ value: p, label: PROVIDER_LABELS[p] }));
const workflowOptions = AUTOMATION_WORKFLOWS.map((w) => ({ value: w, label: WORKFLOW_LABELS[w] }));

export interface AutomationCardProps {
  automation: AutomationView;
  busy: boolean;
  onEdit(a: AutomationView): void;
  onToggle(a: AutomationView, enabled: boolean): void;
  onDelete(a: AutomationView): void;
  /** Only invoked when the server declared Run Now ready (an executor is connected for the provider). */
  onRunNow?(a: AutomationView): void;
  /** Lazily loaded recent-run history (rendered by the panel; the card itself stays presentational). */
  history?: ReactNode;
}

/** Recent runs of one automation, loaded when the section is first opened. Scheduled and manual runs are labelled. */
export function AutomationRunHistory({ workspaceId, session, automation }: { workspaceId: string; session: PublicSession; automation: AutomationView }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; runs: AutomationRunView[] }>({ status: 'idle' });
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setState({ status: 'loading' });
    fetchAutomationRuns(workspaceId, session, automation.id).then((runs) => live && setState({ status: 'ready', runs }), () => live && setState({ status: 'error' }));
    return () => { live = false; };
  }, [open, workspaceId, automation.id, automation.state.lastRunAt, session.access_token]);
  return (
    <details onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} data-testid="automation-history">
      <summary style={{ cursor: 'pointer', ...mutedSmall }}>Recent runs</summary>
      {state.status === 'loading' && <p role="status" className="muted" style={mutedSmall}>Loading runs…</p>}
      {state.status === 'error' && <p role="alert" style={{ ...mutedSmall, color: 'var(--color-danger)' }}>Couldn’t load run history.</p>}
      {state.status === 'ready' && state.runs.length === 0 && <p className="muted" style={mutedSmall}>No runs yet.</p>}
      {state.status === 'ready' && state.runs.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: '4px' }}>
          {state.runs.map((r) => (
            <li key={r.id} style={{ ...mutedSmall, display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
              <span>{TRIGGER_LABELS[r.trigger] ?? r.trigger}</span>
              <span>{RUN_STATUS_LABELS[r.status] ?? r.status}</span>
              <span className="muted">{formatInZone(r.scheduledFor ?? r.startedAt ?? r.createdAt, automation.timezone)}</span>
              {r.errorCategory && <span className="muted">{aiErrorCategoryLabel(r.errorCategory)}</span>}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export function AutomationCard({ automation: a, busy, onEdit, onToggle, onDelete, onRunNow, history }: AutomationCardProps) {
  const health = automationHealth(a);
  const nextText = a.enabled ? (a.state.nextExpectedRunAt ? formatInZone(a.state.nextExpectedRunAt, a.timezone) : 'Run manually') : 'Disabled';
  const runNowText = a.runNow.reason ? RUN_NOW_REASON_LABELS[a.runNow.reason] ?? 'Run Now is not available.' : '';
  return (
    <li style={{ ...stackStyle, gap: '8px', padding: '12px 0', borderTop: '1px solid var(--color-border)' }} data-testid="automation-card">
      <div style={rowStyle}>
        <div>
          <b style={{ fontSize: '14px' }}>{a.name}</b>
          <div className="muted" style={mutedSmall}>{WORKFLOW_LABELS[a.workflow]} · {PROVIDER_LABELS[a.provider]}</div>
        </div>
        <div style={{ ...rowStyle, justifyContent: 'flex-end' }}>
          <StatusBadge variant={health.variant}>{health.label}</StatusBadge>
          <Switch checked={a.enabled} disabled={busy} onCheckedChange={(v) => onToggle(a, v)} aria-label={`${a.enabled ? 'Disable' : 'Enable'} ${a.name}`} />
        </div>
      </div>
      <div style={mutedSmall}>{describeSchedule(a)}</div>
      {a.sections.length > 0 && <div className="muted" style={mutedSmall}>Sections: {orderedSections(a.sections).map((s) => SECTION_LABELS[s]).join(', ')}</div>}
      <div className="muted" style={mutedSmall}>Delivery: {a.delivery.map((d) => DELIVERY_LABELS[d]).join(', ')}</div>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', margin: 0, fontSize: '13px' }}>
        <dt className="muted">Next expected</dt><dd style={{ margin: 0 }}>{nextText}</dd>
        <dt className="muted">Last run</dt><dd style={{ margin: 0 }}>{a.state.lastRunAt ? formatInZone(a.state.lastRunAt, a.timezone) : 'No runs yet'}</dd>
        <dt className="muted">Last success</dt><dd style={{ margin: 0 }}>{a.state.lastSuccessAt ? formatInZone(a.state.lastSuccessAt, a.timezone) : '—'}</dd>
        {a.state.lastFailureAt && (<><dt className="muted">Last failure</dt><dd style={{ margin: 0 }}>{formatInZone(a.state.lastFailureAt, a.timezone)}</dd></>)}
        {a.state.lastErrorCategory && (<><dt className="muted">Last error</dt><dd style={{ margin: 0 }}>{aiErrorCategoryLabel(a.state.lastErrorCategory)}</dd></>)}
        {a.state.lastTrigger && (<><dt className="muted">Last started by</dt><dd style={{ margin: 0 }}>{TRIGGER_LABELS[a.state.lastTrigger] ?? a.state.lastTrigger}</dd></>)}
        {a.executor && (<><dt className="muted">Provider scheduler</dt><dd style={{ margin: 0 }}>{EXECUTOR_LABELS[a.executor] ?? a.executor}</dd></>)}
      </dl>
      <div style={{ ...rowStyle, justifyContent: 'flex-start' }}>
        <Button size="sm" variant="secondary" onClick={() => onEdit(a)} disabled={busy}>Edit</Button>
        <Button size="sm" variant="secondary" disabled={!a.runNow.ready || busy} onClick={() => onRunNow?.(a)} aria-describedby={`run-now-${a.id}`}>Run now</Button>
        <Button size="sm" variant="danger-outline" onClick={() => onDelete(a)} disabled={busy}>Delete</Button>
      </div>
      {!a.runNow.ready && <span id={`run-now-${a.id}`} className="muted" style={mutedSmall}>{runNowText}</span>}
      {history}
    </li>
  );
}

export interface AutomationFormProps {
  form: AutomationFormState;
  errors: AutomationFormErrors;
  disabled: boolean;
  zoneOptions: readonly string[];
  onChange(next: AutomationFormState): void;
}

const toggle = <T,>(list: readonly T[], v: T, on: boolean): T[] => (on ? [...list.filter((x) => x !== v), v] : list.filter((x) => x !== v));

export function AutomationFormFields({ form, errors, disabled, zoneOptions, onChange }: AutomationFormProps) {
  const set = (patch: Partial<AutomationFormState>) => onChange({ ...form, ...patch });
  const scheduled = form.cadence !== 'manual_only';
  const composite = (AUTOMATION_COMPOSITE_WORKFLOWS as readonly string[]).includes(form.workflow);
  return (
    <div style={stackStyle}>
      <FormField label="Name" required error={errors.name}>
        {(p) => <Input {...p} value={form.name} maxLength={AUTOMATION_NAME_MAX} disabled={disabled} onChange={(e) => set({ name: e.target.value })} placeholder="Weekday Morning Digest" />}
      </FormField>
      <FormField label="Workflow" helpText="What intelligence this automation produces.">
        {(p) => <Select {...p} value={form.workflow} disabled={disabled} options={workflowOptions} onChange={(e) => set({ workflow: e.target.value as AutomationFormState['workflow'], sections: [] })} />}
      </FormField>
      <FormField label="Provider" helpText="Which AI runs it. Connect providers under Providers above; choosing one here does not connect it.">
        {(p) => <Select {...p} value={form.provider} disabled={disabled} options={providerOptions} onChange={(e) => set({ provider: e.target.value as AutomationFormState['provider'] })} />}
      </FormField>
      <FormField label="Cadence">
        {(p) => <Select {...p} value={form.cadence} disabled={disabled} options={cadenceOptions} onChange={(e) => set({ cadence: e.target.value as AutomationCadence, weekdays: [] })} />}
      </FormField>
      {form.cadence === 'weekly' && (
        <FormField label="Day" required error={errors.weekdays}>
          {(p) => (
            <Select {...p} value={String(form.weekdays[0] ?? '')} disabled={disabled} onChange={(e) => set({ weekdays: e.target.value ? [Number(e.target.value)] : [] })}>
              <option value="">Choose a day</option>
              {WEEKDAY_LABELS.map((d) => <option key={d.value} value={d.value}>{d.long}</option>)}
            </Select>
          )}
        </FormField>
      )}
      {form.cadence === 'selected_days' && (
        <fieldset style={{ border: 0, margin: 0, padding: 0 }} aria-describedby={errors.weekdays ? 'automation-days-error' : undefined}>
          <legend className="label" style={{ padding: 0 }}>Days <span className="req" aria-hidden="true">*</span></legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: '6px' }}>
            {WEEKDAY_LABELS.map((d) => (
              <Checkbox key={d.value} label={d.short} checked={form.weekdays.includes(d.value)} disabled={disabled}
                onChange={(e) => set({ weekdays: toggle(form.weekdays, d.value, e.target.checked) })} />
            ))}
          </div>
          {errors.weekdays && <div id="automation-days-error" className="ferr" role="alert"><span>{errors.weekdays}</span></div>}
        </fieldset>
      )}
      {scheduled && (
        <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <FormField label="Time" required error={errors.localTime}>
            {(p) => <Input {...p} type="time" value={form.localTime} disabled={disabled} onChange={(e) => set({ localTime: e.target.value })} />}
          </FormField>
          <FormField label="Time zone" required error={errors.timezone} helpText="IANA name, for example America/Chicago.">
            {(p) => (
              <>
                <Input {...p} list="automation-zones" value={form.timezone} disabled={disabled} autoComplete="off" onChange={(e) => set({ timezone: e.target.value })} />
                <datalist id="automation-zones">{zoneOptions.map((z) => <option key={z} value={z} />)}</datalist>
              </>
            )}
          </FormField>
        </div>
      )}
      {composite && (
        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="label" style={{ padding: 0 }}>Sections <span className="opt">(optional)</span></legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: '6px' }}>
            {AUTOMATION_SECTIONS.map((s) => (
              <Checkbox key={s} label={SECTION_LABELS[s]} checked={form.sections.includes(s)} disabled={disabled}
                onChange={(e) => set({ sections: toggle(form.sections, s, e.target.checked) })} />
            ))}
          </div>
        </fieldset>
      )}
      <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="label" style={{ padding: 0 }}>Delivery</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: '6px' }}>
          {AUTOMATION_DELIVERY.map((d) => (
            <Checkbox key={d} label={DELIVERY_LABELS[d]} checked={form.delivery.includes(d)} disabled={disabled || d === 'ai_hub'}
              onChange={(e) => set({ delivery: toggle(form.delivery, d, e.target.checked) })} />
          ))}
        </div>
        <div className="help" style={{ marginTop: '4px' }}>Results always arrive in the AI Hub. Email summaries are saved as a preference only; sending email isn’t available yet.</div>
      </fieldset>
      <Switch id="automation-enabled" checked={form.enabled} disabled={disabled} onCheckedChange={(v) => set({ enabled: v })} label="Enabled" />
    </div>
  );
}

export interface AutomationsViewProps {
  load: AutomationsLoad;
  busyId: string | null;
  actionError: string | null;
  notice?: string | null;
  onNew(): void;
  onEdit(a: AutomationView): void;
  onToggle(a: AutomationView, enabled: boolean): void;
  onDelete(a: AutomationView): void;
  onRetry(): void;
  onRunNow?(a: AutomationView): void;
  renderHistory?(a: AutomationView): ReactNode;
}

export function AutomationsView({ load, busyId, actionError, notice, onNew, onEdit, onToggle, onDelete, onRetry, onRunNow, renderHistory }: AutomationsViewProps) {
  const count = load.status === 'ready' ? load.automations.length : 0;
  return (
    <div style={stackStyle}>
      <p className="muted" style={{ margin: 0, ...mutedSmall }}>
        An automation defines which workflow should run, with which provider, and when. JobQuest does not run it: create the matching
        schedule in the provider (for example a Claude scheduled task); results arrive as AI findings and the status below is
        derived from them.
      </p>
      {actionError && <p role="alert" style={{ margin: 0, color: 'var(--color-danger)' }}>{actionError}</p>}
      {notice && <p role="status" style={{ margin: 0, ...mutedSmall }}>{notice}</p>}
      {load.status === 'loading' && <p role="status" className="muted" style={{ margin: 0 }}>Loading automations…</p>}
      {load.status === 'error' && (
        <div role="alert" style={rowStyle}>
          <span style={{ color: 'var(--color-danger)' }}>{load.message}</span>
          <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>
        </div>
      )}
      {load.status === 'ready' && count === 0 && <p className="muted" style={{ margin: 0 }}>No automations yet. Create one to record when a workflow should run.</p>}
      {load.status === 'ready' && count > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {load.automations.map((a) => <AutomationCard key={a.id} automation={a} busy={busyId === a.id} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} onRunNow={onRunNow} history={renderHistory?.(a)} />)}
        </ul>
      )}
      <div>
        <Button variant="primary" size="sm" onClick={onNew} disabled={load.status !== 'ready' || count >= AUTOMATION_LIMIT}>New automation</Button>
        {count >= AUTOMATION_LIMIT && <span className="muted" style={{ ...mutedSmall, marginLeft: '8px' }}>Limit of {AUTOMATION_LIMIT} reached.</span>}
      </div>
    </div>
  );
}

function zoneList(current: string): string[] {
  const known = (): string[] => {
    try { return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []; } catch { return []; }
  };
  const zones = known();
  return zones.includes(current) || !current ? zones : [current, ...zones];
}

export function AutomationsPanel({ activeWorkspaceId, session, defaultTimeZone = 'UTC' }: {
  activeWorkspaceId: string | null; session: PublicSession; defaultTimeZone?: string;
}) {
  const [load, setLoad] = useState<AutomationsLoad>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: AutomationFormState } | null>(null);
  const [errors, setErrors] = useState<AutomationFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AutomationView | null>(null);
  const zones = useMemo(() => zoneList(editing?.form.timezone ?? defaultTimeZone), [editing?.form.timezone, defaultTimeZone]);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    if (!activeWorkspaceId) return undefined;
    let live = true;
    setLoad({ status: 'loading' });
    fetchAutomations(activeWorkspaceId, session).then(
      (automations) => live && setLoad({ status: 'ready', automations }),
      () => live && setLoad({ status: 'error', message: 'Couldn’t load automations. The rest of Settings is unaffected.' }),
    );
    return () => { live = false; };
  }, [activeWorkspaceId, attempt, session.access_token]);

  const submit = async () => {
    if (!editing || !activeWorkspaceId) return;
    const found = validateAutomationForm(editing.form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveAutomation(activeWorkspaceId, session, editing.id, editing.form);
      setEditing(null);
      refresh();
    } catch (e) {
      if (e instanceof AutomationApiError && e.field && e.field in { name: 1, localTime: 1, timezone: 1, weekdays: 1 }) setErrors({ [e.field]: e.message });
      else setSaveError(e instanceof AutomationApiError ? e.message : 'Couldn’t save the automation.');
    } finally { setSaving(false); }
  };

  const onToggle = async (a: AutomationView, enabled: boolean) => {
    if (!activeWorkspaceId) return;
    setBusyId(a.id);
    setActionError(null);
    try {
      await saveAutomation(activeWorkspaceId, session, a.id, { ...automationToForm(a, defaultTimeZone), enabled });
      refresh();
    } catch (e) { setActionError(e instanceof AutomationApiError ? e.message : 'Couldn’t update the automation.'); }
    finally { setBusyId(null); }
  };

  // Reached only when the server declared Run Now ready. A fresh key per click: a double click or a retried request is the same run.
  const onRunNow = async (a: AutomationView) => {
    if (!activeWorkspaceId) return;
    setBusyId(a.id);
    setActionError(null);
    setNotice(null);
    try {
      const key = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');
      const out = await runAutomationNow(activeWorkspaceId, session, a.id, key);
      setNotice(out.created ? `Run requested for “${a.name}”. It is waiting for the provider scheduler to pick it up.` : `A run for “${a.name}” was already requested.`);
      refresh();
    } catch (e) { setActionError(e instanceof AutomationApiError ? e.message : 'Couldn’t request the run.'); }
    finally { setBusyId(null); }
  };

  const confirmDelete = async () => {
    if (!deleting || !activeWorkspaceId) return;
    setBusyId(deleting.id);
    setActionError(null);
    try {
      await deleteAutomation(activeWorkspaceId, session, deleting.id);
      setDeleting(null);
      refresh();
    } catch (e) { setActionError(e instanceof AutomationApiError ? e.message : 'Couldn’t delete the automation.'); setDeleting(null); }
    finally { setBusyId(null); }
  };

  return (
    <>
      <AutomationsView
        load={activeWorkspaceId ? load : { status: 'error', message: 'Select a workspace to manage automations.' }}
        busyId={busyId}
        actionError={actionError}
        notice={notice}
        onRunNow={onRunNow}
        renderHistory={(a) => (activeWorkspaceId ? <AutomationRunHistory workspaceId={activeWorkspaceId} session={session} automation={a} /> : null)}
        onNew={() => { setErrors({}); setSaveError(null); setEditing({ id: null, form: emptyAutomationForm(defaultTimeZone) }); }}
        onEdit={(a) => { setErrors({}); setSaveError(null); setEditing({ id: a.id, form: automationToForm(a, defaultTimeZone) }); }}
        onToggle={onToggle}
        onDelete={setDeleting}
        onRetry={refresh}
      />
      {editing && (
        <Dialog
          isOpen
          onClose={() => !saving && setEditing(null)}
          title={editing.id ? 'Edit automation' : 'New automation'}
          description="Defines what should run and when. Provider credentials are managed under Providers."
          maxWidth={560}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
              <Button variant="primary" onClick={submit} isLoading={saving}>{editing.id ? 'Save changes' : 'Create automation'}</Button>
            </>
          )}
        >
          {saveError && <p role="alert" style={{ margin: '0 0 12px', color: 'var(--color-danger)' }}>{saveError}</p>}
          <AutomationFormFields form={editing.form} errors={errors} disabled={saving} zoneOptions={zones} onChange={(form) => setEditing({ ...editing, form })} />
        </Dialog>
      )}
      {deleting && (
        <Dialog
          isOpen
          onClose={() => setDeleting(null)}
          title="Delete automation?"
          description={`“${deleting.name}” will be removed. Past runs and findings are kept. Any schedule you created in the provider keeps running until you delete it there.`}
          maxWidth={460}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button variant="danger" onClick={confirmDelete} isLoading={busyId === deleting.id}>Delete automation</Button>
            </>
          )}
        >
          <span className="muted" style={mutedSmall}>This cannot be undone.</span>
        </Dialog>
      )}
    </>
  );
}
