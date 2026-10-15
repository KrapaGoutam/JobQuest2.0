import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { PublicSession } from '../../api';
import { DiscoveryApiError, fetchDiscoveryProfile, saveDiscoveryProfile } from '../../api/aiJobDiscovery';
import {
  ARRANGEMENT_LABELS, EMPLOYMENT_LABELS, FRESHNESS_LABELS, QA_TESTING_PRESET, applyPreset, describeProfile, formToProfile, profileToForm, validateDiscoveryForm,
  DEFAULT_DISCOVERY_PROFILE, type DiscoveryFormErrors, type DiscoveryFormState,
} from '../../lib/aiJobDiscovery';
import { DISCOVERY_FRESHNESS_HOURS, JOB_EMPLOYMENT_TYPES, JOB_WORK_ARRANGEMENTS } from '../../lib/aiSources';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';

// AI-11D: Settings -> AI & Automation -> Job Discovery. "WHAT jobs do I want?" It never touches provider credentials
// (Providers: who can talk to JobQuest) or schedules (Automations: when a workflow should run). Providers read this profile
// through a read-only MCP tool and search with their own tools; JobQuest itself never searches job boards.

const stackStyle: CSSProperties = { display: 'grid', gap: '14px' };
const mutedSmall = { fontSize: '13px' } as const;
const toggle = (xs: string[], v: string, on: boolean) => (on ? [...xs.filter((x) => x !== v), v] : xs.filter((x) => x !== v));
const freshnessOptions = DISCOVERY_FRESHNESS_HOURS.map((h) => ({ value: String(h), label: FRESHNESS_LABELS[h] ?? `${h}h` }));

export type DiscoveryLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; configured: boolean };

export function JobDiscoveryFormFields({ form, errors, disabled, onChange }: {
  form: DiscoveryFormState; errors: DiscoveryFormErrors; disabled: boolean; onChange(f: DiscoveryFormState): void;
}) {
  const set = (patch: Partial<DiscoveryFormState>) => onChange({ ...form, ...patch });
  return (
    <div style={stackStyle}>
      <FormField label="Target job titles" helpText="One per line. Providers search for these roles and close variants." error={errors.targetTitles}>
        {(p) => <Textarea {...p} rows={5} value={form.targetTitles} disabled={disabled} onChange={(e) => set({ targetTitles: e.target.value })} />}
      </FormField>
      <fieldset style={{ border: 0, margin: 0, padding: 0 }} aria-describedby={errors.workArrangements ? 'jd-arrangements-err' : undefined}>
        <legend className="label" style={{ padding: 0 }}>Work arrangements</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: '6px' }}>
          {JOB_WORK_ARRANGEMENTS.map((a) => (
            <Checkbox key={a} label={a === 'remote' ? 'Remote (United States)' : ARRANGEMENT_LABELS[a]} checked={form.workArrangements.includes(a)} disabled={disabled}
              onChange={(e) => set({ workArrangements: toggle(form.workArrangements, a, e.target.checked) })} />
          ))}
        </div>
        {errors.workArrangements && <div id="jd-arrangements-err" className="ferr" role="alert">{errors.workArrangements}</div>}
      </fieldset>
      <Checkbox label="Also include remote roles limited to certain states or regions" checked={form.includeRestrictedRemote} disabled={disabled}
        onChange={(e) => set({ includeRestrictedRemote: e.target.checked })} />
      <FormField label="Cities for hybrid or onsite roles" helpText="One per line, for example “Houston, TX”. Required when hybrid or onsite is selected." error={errors.cities}>
        {(p) => <Textarea {...p} rows={2} value={form.cities} disabled={disabled} onChange={(e) => set({ cities: e.target.value })} />}
      </FormField>
      <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="label" style={{ padding: 0 }}>Employment types</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: '6px' }}>
          {JOB_EMPLOYMENT_TYPES.map((t) => (
            <Checkbox key={t} label={EMPLOYMENT_LABELS[t] ?? t} checked={form.employmentTypes.includes(t)} disabled={disabled}
              onChange={(e) => set({ employmentTypes: toggle(form.employmentTypes, t, e.target.checked) })} />
          ))}
        </div>
        {errors.employmentTypes && <div className="ferr" role="alert">{errors.employmentTypes}</div>}
      </fieldset>
      <FormField label="Posted within" helpText="Only jobs with a trustworthy posting time inside this window are kept." error={errors.freshnessWindowHours}>
        {(p) => <Select {...p} value={form.freshnessWindowHours} disabled={disabled} options={freshnessOptions} onChange={(e) => set({ freshnessWindowHours: e.target.value })} />}
      </FormField>
      <Checkbox label="Keep jobs whose posted date is unknown (shown as “Posted date unknown”)" checked={form.allowUnknownPostedDate} disabled={disabled}
        onChange={(e) => set({ allowUnknownPostedDate: e.target.checked })} />
      <FormField label="Title words to exclude" helpText="One per line. A job whose title contains one of these words is dropped." error={errors.excludedTitleTerms}>
        {(p) => <Textarea {...p} rows={3} value={form.excludedTitleTerms} disabled={disabled} onChange={(e) => set({ excludedTitleTerms: e.target.value })} />}
      </FormField>
      <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <FormField label="Preferred maximum experience (years)" optional error={errors.maxExperienceYears}>
          {(p) => <Input {...p} type="number" inputMode="numeric" min={0} max={30} value={form.maxExperienceYears} disabled={disabled} onChange={(e) => set({ maxExperienceYears: e.target.value })} />}
        </FormField>
        <FormField label="Tolerance for strong matches (years)" error={errors.experienceToleranceYears}>
          {(p) => <Input {...p} type="number" inputMode="numeric" min={0} max={5} value={form.experienceToleranceYears} disabled={disabled} onChange={(e) => set({ experienceToleranceYears: e.target.value })} />}
        </FormField>
        <FormField label="Minimum AI match (0–100)" error={errors.minimumMatchScore}>
          {(p) => <Input {...p} type="number" inputMode="numeric" min={0} max={100} value={form.minimumMatchScore} disabled={disabled} onChange={(e) => set({ minimumMatchScore: e.target.value })} />}
        </FormField>
        <FormField label="Maximum results per run" error={errors.maximumResults}>
          {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={25} value={form.maximumResults} disabled={disabled} onChange={(e) => set({ maximumResults: e.target.value })} />}
        </FormField>
      </div>
      <FormField label="Core skills and keywords" optional helpText="One per line. Used by the provider to judge fit." error={errors.coreSkills}>
        {(p) => <Textarea {...p} rows={3} value={form.coreSkills} disabled={disabled} onChange={(e) => set({ coreSkills: e.target.value })} />}
      </FormField>
      <Checkbox label="Skip jobs that require a security clearance or U.S. citizenship" checked={form.excludeClearance} disabled={disabled}
        onChange={(e) => set({ excludeClearance: e.target.checked })} />
      <Checkbox label="Require a software-testing context (skips manufacturing, lab or food “quality assurance”)" checked={form.softwareQaGate} disabled={disabled}
        onChange={(e) => set({ softwareQaGate: e.target.checked })} />
    </div>
  );
}

export function JobDiscoveryPanel({ activeWorkspaceId, session }: { activeWorkspaceId: string | null; session: PublicSession }) {
  const [load, setLoad] = useState<DiscoveryLoad>({ status: 'loading' });
  const [form, setForm] = useState<DiscoveryFormState>(() => profileToForm(DEFAULT_DISCOVERY_PROFILE));
  const [errors, setErrors] = useState<DiscoveryFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [summary, setSummary] = useState('');

  useEffect(() => {
    if (!activeWorkspaceId) return undefined;
    let live = true;
    setLoad({ status: 'loading' });
    fetchDiscoveryProfile(activeWorkspaceId, session).then(
      (s) => { if (!live) return; setForm(profileToForm(s.profile)); setSummary(describeProfile(s.profile)); setLoad({ status: 'ready', configured: s.configured }); },
      () => { if (live) setLoad({ status: 'error', message: 'Couldn’t load the discovery profile. The rest of Settings is unaffected.' }); },
    );
    return () => { live = false; };
  }, [activeWorkspaceId, attempt, session.access_token]);

  const submit = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const found = validateDiscoveryForm(form);
    setErrors(found);
    setSaved(false);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const profile = formToProfile(form);
      await saveDiscoveryProfile(activeWorkspaceId, session, profile);
      setSummary(describeProfile(profile));
      setLoad({ status: 'ready', configured: true });
      setSaved(true);
    } catch (e) {
      if (e instanceof DiscoveryApiError && e.field && e.field in form) setErrors({ [e.field]: e.message });
      else setSaveError(e instanceof DiscoveryApiError ? e.message : 'Couldn’t save the discovery profile.');
    } finally { setSaving(false); }
  }, [activeWorkspaceId, form, session]);

  if (!activeWorkspaceId) return <p className="muted" style={{ margin: 0 }}>Select a workspace to set up Job Discovery.</p>;
  return (
    <div style={stackStyle}>
      <p className="muted" style={{ margin: 0, ...mutedSmall }}>
        This describes <b>what</b> jobs you want. Your AI provider reads it, searches with its own tools and sends back job leads; JobQuest never
        searches job boards or applies for you. Which provider searches is set under Providers, and when it runs under Automations.
      </p>
      {load.status === 'loading' && <p role="status" className="muted" style={{ margin: 0 }}>Loading discovery profile…</p>}
      {load.status === 'error' && (
        <div role="alert" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: 'var(--color-danger)' }}>{load.message}</span>
          <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
        </div>
      )}
      {load.status === 'ready' && (
        <>
          <p style={{ margin: 0, ...mutedSmall }} data-testid="discovery-summary">
            {load.configured ? `Saved profile: ${summary}.` : 'No profile saved yet. Nothing is filtered until you save one.'}
          </p>
          <div>
            <Button variant="secondary" size="sm" disabled={saving} onClick={() => { setSaved(false); setForm(applyPreset(form, QA_TESTING_PRESET)); }}>Load QA / testing starter</Button>
            <span className="muted" style={{ ...mutedSmall, marginLeft: '8px' }}>Fills the form below; review it, then save.</span>
          </div>
          <JobDiscoveryFormFields form={form} errors={errors} disabled={saving} onChange={(f) => { setSaved(false); setForm(f); }} />
          {saveError && <p role="alert" style={{ margin: 0, color: 'var(--color-danger)' }}>{saveError}</p>}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="primary" size="sm" onClick={submit} isLoading={saving}>Save discovery profile</Button>
            {saved && <span role="status" style={mutedSmall}>Saved.</span>}
          </div>
        </>
      )}
    </div>
  );
}
