import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { PublicSession } from '../../api';
import { RecruiterPrefsApiError, fetchRecruiterPreferences, saveRecruiterPreferences } from '../../api/aiRecruiterDiscovery';
import {
  DEFAULT_RECRUITER_PREFERENCES, RECRUITER_LIMITS, RECRUITER_PREFERRED_ROLES, RECRUITER_PREFERRED_ROLE_LABELS, describePreferences, formToPrefs, prefsToForm,
  validateRecruiterForm, type RecruiterFormErrors, type RecruiterFormState,
} from '../../lib/aiRecruiterDiscovery';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';

// AI-11E: Settings -> AI & Automation -> Recruiter Intelligence. "WHO is useful to connect with?" It never touches provider
// credentials (Providers), the jobs the user wants (Job Discovery) or schedules (Automations). Providers read these preferences through
// a read-only MCP tool and research with their own tools; JobQuest itself never searches for people and never contacts anyone.

const stackStyle: CSSProperties = { display: 'grid', gap: '14px' };
const mutedSmall = { fontSize: '13px' } as const;
const toggle = (xs: string[], v: string, on: boolean) => (on ? [...xs.filter((x) => x !== v), v] : xs.filter((x) => x !== v));

export type RecruiterLoad = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; configured: boolean };

export function RecruiterPreferenceFields({ form, errors, disabled, onChange }: {
  form: RecruiterFormState; errors: RecruiterFormErrors; disabled: boolean; onChange(f: RecruiterFormState): void;
}) {
  const set = (patch: Partial<RecruiterFormState>) => onChange({ ...form, ...patch });
  return (
    <div style={stackStyle}>
      <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="label" style={{ padding: 0 }}>What to research</legend>
        <div style={{ display: 'grid', gap: '8px', marginTop: '6px' }}>
          <Checkbox label="Job-linked recruiter research (one useful person for each strong job lead)" checked={form.jobLinkedEnabled} disabled={disabled}
            onChange={(e) => set({ jobLinkedEnabled: e.target.checked })} />
          <Checkbox label="Target-company networking (a few new contacts at the companies below, even on a day with no new jobs)" checked={form.targetNetworkingEnabled} disabled={disabled}
            onChange={(e) => set({ targetNetworkingEnabled: e.target.checked })} />
        </div>
      </fieldset>
      <FormField
        label="Target companies"
        helpText={`One per line, up to ${RECRUITER_LIMITS.targetCompanies}. Only companies you list here are used for networking; a company counts once whatever its spelling (“Acme”, “ACME Inc.”).`}
        error={errors.targetCompanies}
      >
        {(p) => <Textarea {...p} rows={5} value={form.targetCompanies} disabled={disabled} onChange={(e) => set({ targetCompanies: e.target.value })} />}
      </FormField>
      <fieldset style={{ border: 0, margin: 0, padding: 0 }} aria-describedby={errors.preferredRoles ? 'rd-roles-err' : undefined}>
        <legend className="label" style={{ padding: 0 }}>Preferred roles</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: '6px' }}>
          {RECRUITER_PREFERRED_ROLES.map((r) => (
            <Checkbox key={r} label={RECRUITER_PREFERRED_ROLE_LABELS[r]} checked={form.preferredRoles.includes(r)} disabled={disabled}
              onChange={(e) => set({ preferredRoles: toggle(form.preferredRoles, r, e.target.checked) })} />
          ))}
        </div>
        {errors.preferredRoles && <div id="rd-roles-err" className="ferr" role="alert">{errors.preferredRoles}</div>}
      </fieldset>
      <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <FormField label="Maximum new contacts per run" helpText={`Whole number 1–${RECRUITER_LIMITS.maxNewContactsMax}. Never more than one person per company.`} error={errors.maxNewContactsPerRun}>
          {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={RECRUITER_LIMITS.maxNewContactsMax} value={form.maxNewContactsPerRun} disabled={disabled} onChange={(e) => set({ maxNewContactsPerRun: e.target.value })} />}
        </FormField>
      </div>
      <Checkbox label="Allow draft outreach text (connection note and email drafts you review yourself; JobQuest never sends them)" checked={form.draftOutreachEnabled} disabled={disabled}
        onChange={(e) => set({ draftOutreachEnabled: e.target.checked })} />
      <p className="muted" style={{ margin: 0, ...mutedSmall }}>
        A person already shown in the last {RECRUITER_LIMITS.suppressionDays} days is not surfaced again as new.
      </p>
    </div>
  );
}

export function RecruiterDiscoveryPanel({ activeWorkspaceId, session }: { activeWorkspaceId: string | null; session: PublicSession }) {
  const [load, setLoad] = useState<RecruiterLoad>({ status: 'loading' });
  const [form, setForm] = useState<RecruiterFormState>(() => prefsToForm(DEFAULT_RECRUITER_PREFERENCES));
  const [errors, setErrors] = useState<RecruiterFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [summary, setSummary] = useState('');

  useEffect(() => {
    if (!activeWorkspaceId) return undefined;
    let live = true;
    setLoad({ status: 'loading' });
    fetchRecruiterPreferences(activeWorkspaceId, session).then(
      (s) => { if (!live) return; setForm(prefsToForm(s.preferences)); setSummary(describePreferences(s.preferences)); setLoad({ status: 'ready', configured: s.configured }); },
      () => { if (live) setLoad({ status: 'error', message: 'Couldn’t load the recruiter preferences. The rest of Settings is unaffected.' }); },
    );
    return () => { live = false; };
  }, [activeWorkspaceId, attempt, session.access_token]);

  const submit = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const found = validateRecruiterForm(form);
    setErrors(found);
    setSaved(false);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const prefs = formToPrefs(form);
      await saveRecruiterPreferences(activeWorkspaceId, session, prefs);
      setForm(prefsToForm(prefs));
      setSummary(describePreferences(prefs));
      setLoad({ status: 'ready', configured: true });
      setSaved(true);
    } catch (e) {
      if (e instanceof RecruiterPrefsApiError && e.field && e.field in form) setErrors({ [e.field]: e.message });
      else setSaveError(e instanceof RecruiterPrefsApiError ? e.message : 'Couldn’t save the recruiter preferences.');
    } finally { setSaving(false); }
  }, [activeWorkspaceId, form, session]);

  if (!activeWorkspaceId) return <p className="muted" style={{ margin: 0 }}>Select a workspace to set up Recruiter Intelligence.</p>;
  return (
    <div style={stackStyle}>
      <p className="muted" style={{ margin: 0, ...mutedSmall }}>
        This describes <b>who</b> is useful to connect with. Your AI provider reads it, researches with its own tools and sends back cited recruiter and hiring
        contacts; JobQuest never searches for people, finds email addresses, sends messages or changes your applications. Which provider researches is set
        under Providers, which jobs you want under Job Discovery, and when it runs under Automations.
      </p>
      {load.status === 'loading' && <p role="status" className="muted" style={{ margin: 0 }}>Loading recruiter preferences…</p>}
      {load.status === 'error' && (
        <div role="alert" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: 'var(--color-danger)' }}>{load.message}</span>
          <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
        </div>
      )}
      {load.status === 'ready' && (
        <>
          <p style={{ margin: 0, ...mutedSmall }} data-testid="recruiter-prefs-summary">
            {load.configured ? `Saved preferences: ${summary}.` : 'Nothing saved yet. Job-linked research uses the defaults; networking needs target companies.'}
          </p>
          <RecruiterPreferenceFields form={form} errors={errors} disabled={saving} onChange={(f) => { setSaved(false); setForm(f); }} />
          {saveError && <p role="alert" style={{ margin: 0, color: 'var(--color-danger)' }}>{saveError}</p>}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="primary" size="sm" onClick={submit} isLoading={saving}>Save recruiter preferences</Button>
            {saved && <span role="status" style={mutedSmall}>Saved.</span>}
          </div>
        </>
      )}
    </div>
  );
}
