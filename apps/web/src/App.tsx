import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { api, type PublicSession, type PublicUser } from './api';
import { setAccessToken, supabase, SUPABASE_KEY, SUPABASE_URL } from './supabase';

/*
 * M1 ENGINEERING HARNESS — not product UI (Direction D ships in later milestones).
 * Exercises: register, login, session refresh/logout, password change, recovery,
 * direct PostgREST CRUD under RLS, canonical workflow (PostgREST + Node), leak self-check.
 */

// Built at runtime so the served source/bundle never contains the marker itself.
const ALIAS_MARKER = ['auth', 'jobquest', 'internal'].join('.');
const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('jobquest-auth') : null;

interface Workspace { id: string; name: string; workspace_type: string }
interface Membership { workspace_id: string; role: string; workspaces: Workspace | null }
interface Application { id: string; company_name: string; role_title: string; stage: string; status: string; user_id: string; archived_at: string | null }
interface WorkflowDef { stages: { id: string; label: string }[]; outcomes: { id: string; label: string }[] }

declare global {
  interface Window { __jqState?: unknown }
}

export function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [session, setSession] = useState<PublicSession | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeWs, setActiveWs] = useState<string | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [wfDirect, setWfDirect] = useState<WorkflowDef | null>(null);
  const [wfNode, setWfNode] = useState<WorkflowDef | null>(null);
  const [leak, setLeak] = useState<Record<string, boolean> | null>(null);
  const refreshTimer = useRef<number | undefined>(undefined);

  const note = (m: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${m}`, ...l].slice(0, 40));

  const adopt = useCallback((s: PublicSession | null, u?: PublicUser | null) => {
    setSession(s);
    setAccessToken(s?.access_token ?? null);
    if (u !== undefined) setUser(u);
    window.clearTimeout(refreshTimer.current);
    if (s?.expires_at) {
      const ms = Math.max(5_000, s.expires_at * 1000 - Date.now() - 60_000);
      refreshTimer.current = window.setTimeout(() => void refresh(), ms);
    }
  }, []);

  const refresh = useCallback(async () => {
    const r = await api<{ session?: PublicSession }>('/auth/refresh', {});
    if (r.status === 200 && r.data.session) {
      adopt(r.data.session);
      note('session refreshed (token rotated)');
      return r.data.session;
    }
    adopt(null, null);
    return null;
  }, [adopt]);

  // Restore on load from the HttpOnly refresh cookie; follow other tabs.
  useEffect(() => {
    void (async () => {
      const s = await refresh();
      if (s) {
        const me = await api<{ user: PublicUser }>('/auth/me', undefined, s.access_token);
        if (me.status === 200) setUser(me.data.user);
      }
    })();
    const onMsg = (e: MessageEvent) => {
      if (e.data === 'logout') { adopt(null, null); note('signed out in another tab'); }
      if (e.data === 'login') void refresh();
    };
    bc?.addEventListener('message', onMsg);
    return () => bc?.removeEventListener('message', onMsg);
  }, [adopt, refresh]);

  // Mirror state for the automated leak inspection (T03). Contains exactly what React holds.
  useEffect(() => {
    window.__jqState = { user, session, memberships, apps, wfDirect, wfNode, activeWs };
  }, [user, session, memberships, apps, wfDirect, wfNode, activeWs]);

  const loadData = useCallback(async (ws?: string | null) => {
    const m = await supabase.from('workspace_members').select('workspace_id, role, workspaces(id, name, workspace_type)');
    if (m.error) return note(`workspaces: ${m.error.message}`);
    // RLS returns every membership row in workspaces I belong to; keep mine for the switcher.
    const mine = (m.data as unknown as Membership[]).filter((x, i, arr) => arr.findIndex((y) => y.workspace_id === x.workspace_id) === i);
    setMemberships(mine);
    const target = ws ?? activeWs ?? user?.active_workspace_id ?? mine[0]?.workspace_id ?? null;
    setActiveWs(target);
    if (target) {
      const a = await supabase.from('applications').select('id, company_name, role_title, stage, status, user_id, archived_at').eq('workspace_id', target).order('created_at');
      if (a.error) note(`applications: ${a.error.message}`);
      else setApps(a.data as Application[]);
    }
  }, [activeWs, user]);

  useEffect(() => { if (session) void loadData(); }, [session, loadData]);

  async function onRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await api<{ user: PublicUser; session: PublicSession; recovery_codes: string[]; error?: { message: string } }>('/auth/register', {
      username: f.get('username'), password: f.get('password'), email: f.get('email') || '', phone: f.get('phone') || '',
    });
    if (r.status !== 201) return note(`register ${r.status}: ${r.data.error?.message ?? ''}`);
    setCodes(r.data.recovery_codes);
    adopt(r.data.session, r.data.user);
    bc?.postMessage('login');
    note(`registered ${r.data.user.username}; personal workspace created`);
  }

  async function onLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await api<{ user: PublicUser; session: PublicSession; error?: { message: string } }>('/auth/login', { username: f.get('username'), password: f.get('password') });
    if (r.status !== 200) return note(`login ${r.status}: ${r.data.error?.message ?? ''}`);
    adopt(r.data.session, r.data.user);
    bc?.postMessage('login');
    note(`signed in as ${r.data.user.username}`);
  }

  async function onLogout(scope: 'local' | 'global') {
    await api('/auth/logout', { scope }, session?.access_token);
    adopt(null, null);
    setApps([]); setMemberships([]);
    bc?.postMessage('logout');
    note(`signed out (${scope})`);
  }

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await api<{ error?: { message: string } }>('/auth/password', { current_password: f.get('current'), new_password: f.get('next') }, session?.access_token);
    note(r.status === 200 ? 'password changed; other sessions revoked' : `password ${r.status}: ${r.data.error?.message ?? ''}`);
  }

  async function onRecover(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await api<{ session?: PublicSession; remaining_codes?: number; error?: { message: string } }>('/auth/recover', {
      username: f.get('username'), code: f.get('code'), new_password: f.get('password'),
    });
    if (r.status !== 200) return note(`recover ${r.status}: ${r.data.error?.message ?? ''}`);
    adopt(r.data.session ?? null);
    note(`recovered; ${r.data.remaining_codes} codes left; all other sessions revoked`);
  }

  async function onRegenerate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await api<{ recovery_codes?: string[]; error?: { message: string } }>('/auth/recovery-codes', { password: f.get('password') }, session?.access_token);
    if (r.data.recovery_codes) { setCodes(r.data.recovery_codes); note('recovery codes regenerated; old set invalid'); }
    else note(`regenerate ${r.status}: ${r.data.error?.message ?? ''}`);
  }

  async function onCreateApp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeWs || !user) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await supabase.from('applications').insert({
      workspace_id: activeWs, user_id: user.id, company_name: f.get('company'), role_title: f.get('role'), stage: f.get('stage'),
    }).select('id').single();
    note(r.error ? `insert failed: ${r.error.message}` : `inserted application ${r.data.id} via direct PostgREST`);
    form.reset();
    await loadData();
  }

  async function onStage(id: string, stage: string) {
    const r = await supabase.from('applications').update({ stage }).eq('id', id);
    note(r.error ? `update failed: ${r.error.message}` : `stage → ${stage} (direct PostgREST)`);
    await loadData();
  }

  async function onArchive(id: string) {
    const r = await supabase.from('applications').update({ archived_at: new Date().toISOString() }).eq('id', id);
    note(r.error ? `archive failed: ${r.error.message}` : 'archived (direct PostgREST)');
    await loadData();
  }

  async function onCreateWorkspace() {
    const r = await supabase.rpc('rpc_create_workspace', { p_name: `Team ${Math.floor(Math.random() * 1000)}` });
    note(r.error ? `create workspace failed: ${r.error.message}` : 'shared workspace created (RPC); you are MANAGER');
    await loadData(r.data as string);
  }

  async function loadWorkflow() {
    const d = await supabase.from('workflow_definitions').select('stages, outcomes').is('workspace_id', null).maybeSingle();
    setWfDirect(d.data as WorkflowDef | null);
    const n = await api<{ workflow?: WorkflowDef }>('/workflow', undefined, session?.access_token);
    setWfNode(n.data.workflow ?? null);
    note(`workflow via PostgREST: ${d.data ? 'ok' : 'none'}; via Node: ${n.status}`);
  }

  async function leakCheck() {
    const payload = session ? JSON.parse(atob(session.access_token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) : {};
    const probe = session
      ? await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${session.access_token}` } }).then((r) => r.text())
      : '';
    const result = {
      localStorage: JSON.stringify({ ...localStorage }).includes(ALIAS_MARKER),
      sessionStorage: JSON.stringify({ ...sessionStorage }).includes(ALIAS_MARKER),
      readableCookies: document.cookie.includes(ALIAS_MARKER),
      reactState: JSON.stringify(window.__jqState ?? {}).includes(ALIAS_MARKER),
      html: document.documentElement.outerHTML.includes(ALIAS_MARKER),
      jwtClaims: JSON.stringify(payload).includes(ALIAS_MARKER),
      gotrueUserEndpointWithMyToken: probe.includes(ALIAS_MARKER),
    };
    setLeak(result); // booleans only — never render the value itself
  }

  const panel: CSSProperties = { border: '1px solid #c7ced9', borderRadius: 8, padding: 12, marginBottom: 12 };
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 16, fontSize: 14 }}>
      <h1 style={{ fontSize: 20 }}>JobQuest 2.0 · M1 architecture harness</h1>
      <p style={{ color: '#5f6b7e' }}>Engineering test surface only. Not product UI.</p>

      {!session ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <form style={panel} onSubmit={onRegister} aria-label="Register">
            <h2 style={{ fontSize: 16 }}>Register</h2>
            <label>Username (required) <input name="username" required autoComplete="username" /></label><br />
            <label>Password (required) <input name="password" type="password" required autoComplete="new-password" /></label><br />
            <label>Email (optional) <input name="email" type="email" /></label><br />
            <label>Phone (optional) <input name="phone" /></label><br />
            <button>Create account</button>
          </form>
          <form style={panel} onSubmit={onLogin} aria-label="Sign in">
            <h2 style={{ fontSize: 16 }}>Sign in</h2>
            <label>Username <input name="username" required autoComplete="username" /></label><br />
            <label>Password <input name="password" type="password" required autoComplete="current-password" /></label><br />
            <button>Sign in</button>
          </form>
          <form style={panel} onSubmit={onRecover} aria-label="Recover account">
            <h2 style={{ fontSize: 16 }}>Recover with a code</h2>
            <label>Username <input name="username" required /></label><br />
            <label>Recovery code <input name="code" required /></label><br />
            <label>New password <input name="password" type="password" required autoComplete="new-password" /></label><br />
            <button>Reset password</button>
          </form>
        </div>
      ) : (
        <>
          <section style={panel} aria-label="Session">
            <b>{user?.username}</b> · session expires {session.expires_at ? new Date(session.expires_at * 1000).toLocaleTimeString() : '?'}
            {' '}<button onClick={() => void refresh()}>Refresh now</button>
            {' '}<button onClick={() => void onLogout('local')}>Sign out</button>
            {' '}<button onClick={() => void onLogout('global')}>Sign out everywhere</button>
          </section>
          <section style={panel} aria-label="Workspaces">
            <h2 style={{ fontSize: 16 }}>Workspaces (direct PostgREST)</h2>
            <select value={activeWs ?? ''} onChange={(e) => void loadData(e.target.value)} aria-label="Active workspace">
              {memberships.map((m) => <option key={m.workspace_id} value={m.workspace_id}>{m.workspaces?.name} · {m.role}</option>)}
            </select>{' '}
            <button onClick={() => void onCreateWorkspace()}>Create shared workspace (RPC)</button>
          </section>
          <section style={panel} aria-label="Applications">
            <h2 style={{ fontSize: 16 }}>Applications in active workspace ({apps.length})</h2>
            <form onSubmit={onCreateApp}>
              <input name="company" placeholder="Company" required aria-label="Company" />{' '}
              <input name="role" placeholder="Role" required aria-label="Role" />{' '}
              <select name="stage" aria-label="Stage" defaultValue="APPLIED">
                {(wfDirect?.stages ?? [{ id: 'APPLIED', label: 'Applied' }]).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>{' '}
              <button>Insert (direct PostgREST)</button>
            </form>
            <ul>
              {apps.map((a) => (
                <li key={a.id}>
                  {a.company_name} · {a.role_title} · {a.stage} {a.archived_at ? '· archived' : ''}{' '}
                  <button onClick={() => void onStage(a.id, 'INTERVIEW')}>→ Interview</button>{' '}
                  <button onClick={() => void onArchive(a.id)}>Archive</button>
                </li>
              ))}
            </ul>
          </section>
          <section style={panel} aria-label="Workflow">
            <h2 style={{ fontSize: 16 }}>Canonical workflow</h2>
            <button onClick={() => void loadWorkflow()}>Load (PostgREST + Node)</button>
            <div>PostgREST: {wfDirect?.stages.map((s) => s.label).join(' → ')} | outcomes: {wfDirect?.outcomes.map((o) => o.label).join(', ')}</div>
            <div>Node API: {wfNode?.stages.map((s) => s.label).join(' → ')}</div>
          </section>
          <section style={panel} aria-label="Account security">
            <form onSubmit={onPassword} style={{ display: 'inline-block', marginRight: 24 }}>
              <b>Change password</b><br />
              <input name="current" type="password" placeholder="Current" required aria-label="Current password" autoComplete="current-password" />{' '}
              <input name="next" type="password" placeholder="New" required aria-label="New password" autoComplete="new-password" />{' '}
              <button>Change</button>
            </form>
            <form onSubmit={onRegenerate} style={{ display: 'inline-block' }}>
              <b>Regenerate recovery codes</b><br />
              <input name="password" type="password" placeholder="Password" required aria-label="Password to regenerate codes" />{' '}
              <button>Regenerate</button>
            </form>
          </section>
          <section style={panel} aria-label="Leak self-check">
            <h2 style={{ fontSize: 16 }}>T03 leak self-check</h2>
            <button onClick={() => void leakCheck()}>Scan for internal identity</button>
            {leak && <ul>{Object.entries(leak).map(([k, v]) => <li key={k} data-leak={k} data-found={String(v)}>{k}: {v ? 'FOUND (leak)' : 'clean'}</li>)}</ul>}
          </section>
        </>
      )}

      {codes && (
        <section style={{ ...panel, borderColor: '#9a5b08' }} aria-label="Recovery codes">
          <b>Recovery codes: shown once. Save them now.</b>
          <ol data-testid="recovery-codes">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ol>
          <button onClick={() => setCodes(null)}>I saved them</button>
        </section>
      )}
      <section style={panel} aria-label="Log"><b>Log</b><ul>{log.map((l, i) => <li key={i}>{l}</li>)}</ul></section>
    </main>
  );
}
