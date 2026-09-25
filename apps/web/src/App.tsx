import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type PublicSession, type PublicUser } from './api';
import { setAccessToken, supabase, SUPABASE_KEY, SUPABASE_URL } from './supabase';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { ToastContainer } from './components/ui/Toast';
import { AppShell } from './components/shell/AppShell';
import { AuthView } from './views/AuthView';
import { ApplicationsView, type ApplicationRecord, type WorkflowDef } from './views/ApplicationsView';
import { ContactsView } from './views/ContactsView';
import { InterviewsView } from './views/InterviewsView';
import { TasksView } from './views/TasksView';
import { HabitsView } from './views/HabitsView';
import { DashboardView } from './views/DashboardView';
import { DesignSystemShowcase } from './views/DesignSystemShowcase';
import { PlaceholderView } from './views/PlaceholderView';
import {
  Calendar,
  BookOpen,
  FileText,
  BarChart3,
  UserPlus,
  Settings,
  AlertCircle,
} from 'lucide-react';
import './styles/globals.css';

const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('jobquest-auth') : null;

interface Workspace { id: string; name: string; workspace_type: string }
interface Membership { workspace_id: string; role: 'USER' | 'MANAGER'; workspaces: Workspace | null }

declare global {
  interface Window { __jqState?: unknown }
}

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppContent />
        <ToastContainer />
      </ToastProvider>
    </ThemeProvider>
  );
}

function AppContent() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [session, setSession] = useState<PublicSession | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeWs, setActiveWs] = useState<string | null>(null);
  const [apps, setApps] = useState<ApplicationRecord[]>([]);
  const [wfDirect, setWfDirect] = useState<WorkflowDef | null>(null);
  const [wfNode, setWfNode] = useState<WorkflowDef | null>(null);
  const [leak, setLeak] = useState<Record<string, boolean> | null>(null);
  const [probe, setProbe] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace(/^#/, '');
      return hash || window.location.pathname || '/';
    }
    return '/';
  });

  const refreshTimer = useRef<number | undefined>(undefined);

  const note = (m: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${m}`, ...l].slice(0, 40));

  const navigate = useCallback((path: string) => {
    setCurrentPath(path);
    if (typeof window !== 'undefined') {
      window.location.hash = `#${path}`;
    }
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash) setCurrentPath(hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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
    const run = () => api<{ session?: PublicSession }>('/auth/refresh', {});
    const r = navigator.locks ? await navigator.locks.request('jobquest-refresh', run) : await run();
    if (r.status === 200 && r.data.session) {
      adopt(r.data.session);
      note('session refreshed (token rotated)');
      return r.data.session;
    }
    adopt(null, null);
    return null;
  }, [adopt]);

  // Restore on load from HttpOnly refresh cookie; follow other tabs.
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
    const mine = (m.data as unknown as Membership[]).filter((x, i, arr) => arr.findIndex((y) => y.workspace_id === x.workspace_id) === i);
    setMemberships(mine);
    const target = ws ?? activeWs ?? user?.active_workspace_id ?? mine[0]?.workspace_id ?? null;
    setActiveWs(target);
    if (target) {
      const a = await supabase.from('applications').select('id, company_name, role_title, stage, status, user_id, archived_at').eq('workspace_id', target).order('created_at');
      if (a.error) note(`applications: ${a.error.message}`);
      else setApps(a.data as ApplicationRecord[]);
    }
  }, [activeWs, user]);

  useEffect(() => { if (session) void loadData(); }, [session, loadData]);

  async function onRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAuthError(null);
    const f = new FormData(e.currentTarget);
    const r = await api<{ user: PublicUser; session: PublicSession; recovery_codes: string[]; error?: { message: string } }>('/auth/register', {
      username: f.get('username'), password: f.get('password'), email: f.get('email') || '', phone: f.get('phone') || '',
    });
    if (r.status !== 201) {
      const msg = r.data.error?.message ?? `Register failed with code ${r.status}`;
      setAuthError(msg);
      return note(`register ${r.status}: ${msg}`);
    }
    setCodes(r.data.recovery_codes);
    adopt(r.data.session, r.data.user);
    bc?.postMessage('login');
    note(`registered ${r.data.user.username}; personal workspace created`);
  }

  async function onLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAuthError(null);
    const f = new FormData(e.currentTarget);
    const r = await api<{ user: PublicUser; session: PublicSession; error?: { message: string } }>('/auth/login', { username: f.get('username'), password: f.get('password') });
    if (r.status !== 200) {
      const msg = r.data.error?.message ?? `Sign in failed with code ${r.status}`;
      setAuthError(msg);
      return note(`login ${r.status}: ${msg}`);
    }
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
    setAuthError(null);
    const f = new FormData(e.currentTarget);
    const r = await api<{ session?: PublicSession; remaining_codes?: number; error?: { message: string } }>('/auth/recover', {
      username: f.get('username'), code: f.get('code'), new_password: f.get('password'),
    });
    if (r.status !== 200) {
      const msg = r.data.error?.message ?? `Recover failed with code ${r.status}`;
      setAuthError(msg);
      return note(`recover ${r.status}: ${msg}`);
    }
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
    const wsId = activeWs || user?.active_workspace_id || memberships[0]?.workspace_id;
    if (!wsId || !user) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await supabase.from('applications').insert({
      workspace_id: wsId, user_id: user.id, company_name: f.get('company'), role_title: f.get('role'), stage: f.get('stage'),
    }).select('id').single();
    note(r.error ? `insert failed: ${r.error.message}` : `inserted application ${r.data.id} via direct PostgREST`);
    form.reset();
    await loadData();
  }

  async function onStage(id: string, stage: string) {
    // Lifecycle changes go through the atomic RPC (Gate 03 boundary; migration 20260924310000).
    const r = await supabase.rpc('rpc_move_application_stage', { p_application_id: id, p_new_stage: stage });
    note(r.error ? `update failed: ${r.error.message}` : `stage → ${stage} (RPC via Data API)`);
    await loadData();
  }

  async function onArchive(id: string) {
    const r = await supabase.rpc('rpc_archive_application', { p_application_id: id });
    note(r.error ? `archive failed: ${r.error.message}` : 'archived (RPC via Data API)');
    await loadData();
  }

  async function loadWorkflow() {
    const d = await supabase.from('workflow_definitions').select('stages, outcomes').is('workspace_id', null).maybeSingle();
    setWfDirect(d.data as WorkflowDef | null);
    const n = await api<{ workflow?: WorkflowDef }>('/workflow', undefined, session?.access_token);
    setWfNode(n.data.workflow ?? null);
    note(`workflow via PostgREST: ${d.data ? 'ok' : 'none'}; via Node: ${n.status}`);
  }

  async function leakCheck() {
    const payload = session ? JSON.parse(atob(session.access_token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown> : {};
    const probeRes = session
      ? await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${session.access_token}` } })
          .then(async (r) => ({ status: r.status, text: await r.text() }))
      : { status: 0, text: '' };
    const storage = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    const html = document.documentElement.outerHTML;
    const name = user?.username ?? '\u0000';
    const result = {
      refreshTokenReadableByScript: document.cookie.includes('jqr_') || storage.includes('jqr_'),
      accessTokenInWebStorage: storage.includes('eyJ'),
      credentialMaterialInPage: html.includes('$argon2id$') || html.includes('jqr_'),
      identityClaimsInJwt: ['email', 'phone', 'username', 'user_metadata', 'app_metadata'].some((k) => k in payload),
      supabaseAuthUserEndpointRevealsIdentity: probeRes.status === 200 || probeRes.text.includes('@') || probeRes.text.includes(name),
    };
    setLeak(result);
    setProbe(`${probeRes.status}`);
  }

  // If unauthenticated: allow direct access to Design System Showcase for visual regression / dev
  if (!session) {
    if (currentPath === '/design-system') {
      return (
        <WorkspaceProvider>
          <AppShell
            currentPath={currentPath}
            onNavigate={navigate}
            user={{ id: 'dev-user', username: 'alex_chen', display_name: 'Alex Chen', active_workspace_id: 'ws-demo' }}
            session={{ access_token: 'dev-token', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600 }}
            onRefreshSession={async () => {}}
            onLogout={async () => { navigate('/'); }}
            applicationsCount={5}
            pageTitle="Design System"
          >
            <DesignSystemShowcase />
          </AppShell>
        </WorkspaceProvider>
      );
    }

    return (
      <AuthView
        onRegister={onRegister}
        onLogin={onLogin}
        onRecover={onRecover}
        authError={authError}
      />
    );
  }

  // Route title resolver
  const getPageTitle = (path: string): string => {
    switch (path) {
      case '/':
      case '/applications':
        return 'Applications';
      case '/dashboard':
        return 'Dashboard';
      case '/tasks':
        return 'Tasks & Follow-ups';
      case '/contacts':
        return 'Contacts';
      case '/calendar':
        return 'Calendar';
      case '/interviews':
        return 'Interviews';
      case '/habits':
        return 'Habits';
      case '/journal':
        return 'Journal';
      case '/resumes':
        return 'Resumes';
      case '/analytics':
        return 'Analytics';
      case '/workspace':
      case '/workspace/members':
        return 'Workspace Members';
      case '/workspace/imports':
        return 'Import & Export';
      case '/workspace/workflow':
        return 'Workflow';
      case '/workspace/audit':
        return 'Audit History';
      case '/settings':
        return 'Settings';
      case '/design-system':
        return 'Design System';
      default:
        return 'JobQuest 2.0';
    }
  };

  // Render active view
  const renderRouteView = () => {
    if (currentPath === '/' || currentPath === '/applications') {
      return (
        <ApplicationsView
          user={user}
          session={session}
          apps={apps}
          wfDirect={wfDirect}
          wfNode={wfNode}
          recoveryCodes={codes}
          leakResults={leak}
          probeStatus={probe}
          log={log}
          activeWorkspaceId={activeWs}
          userRole={memberships.find((m) => m.workspace_id === activeWs)?.role ?? 'USER'}
          onRefresh={refresh}
          onLogout={onLogout}
          onCreateApp={onCreateApp}
          onStageChange={onStage}
          onArchive={onArchive}
          onLoadWorkflow={loadWorkflow}
          onPasswordChange={onPassword}
          onRegenerateCodes={onRegenerate}
          onLeakCheck={leakCheck}
          onDismissCodes={() => setCodes(null)}
        />
      );
    }

    if (currentPath === '/design-system') {
      return <DesignSystemShowcase />;
    }

    if (currentPath === '/dashboard') {
      return (
        <DashboardView
          activeWorkspaceId={activeWs}
          isManager={memberships.find((m) => m.workspace_id === activeWs)?.role === 'MANAGER'}
          currentUserId={user?.id ?? null}
          onNavigate={navigate}
        />
      );
    }

    if (currentPath === '/tasks') {
      return (
        <TasksView
          activeWorkspaceId={activeWs}
          isManager={memberships.find((m) => m.workspace_id === activeWs)?.role === 'MANAGER'}
          currentUserId={user?.id ?? null}
        />
      );
    }

    if (currentPath === '/contacts') {
      return (
        <ContactsView
          activeWorkspaceId={activeWs}
          isManager={memberships.find((m) => m.workspace_id === activeWs)?.role === 'MANAGER'}
        />
      );
    }

    if (currentPath === '/calendar') {
      return (
        <PlaceholderView
          title="Interview Calendar"
          subtitle="Schedule of recruiter screenings, technical assessments, and panel loops"
          icon={<Calendar size={24} />}
          milestoneOwner="Milestone 7"
        />
      );
    }

    if (currentPath === '/interviews') {
      return (
        <InterviewsView
          activeWorkspaceId={activeWs}
          isManager={memberships.find((m) => m.workspace_id === activeWs)?.role === 'MANAGER'}
          currentUserId={user?.id ?? null}
        />
      );
    }

    if (currentPath === '/habits') {
      return (
        <HabitsView
          activeWorkspaceId={activeWs}
          isManager={memberships.find((m) => m.workspace_id === activeWs)?.role === 'MANAGER'}
          currentUserId={user?.id ?? null}
        />
      );
    }

    if (currentPath === '/journal') {
      return (
        <PlaceholderView
          title="Job Search Journal"
          subtitle="Personal reflections, career milestones, and search logs"
          icon={<BookOpen size={24} />}
          milestoneOwner="Milestone 8"
        />
      );
    }

    if (currentPath === '/resumes') {
      return (
        <PlaceholderView
          title="Resumes & Goals"
          subtitle="Target resume variants, portfolio links, and compensation criteria"
          icon={<FileText size={24} />}
          milestoneOwner="Milestone 8"
        />
      );
    }

    if (currentPath === '/analytics') {
      return (
        <PlaceholderView
          title="Search Analytics"
          subtitle="Stage funnel conversion rates, latency to interview, and response distributions"
          icon={<BarChart3 size={24} />}
          milestoneOwner="Milestone 9"
        />
      );
    }

    if (currentPath.startsWith('/workspace')) {
      return (
        <PlaceholderView
          title={getPageTitle(currentPath)}
          subtitle="Team workspace management, CSV/JSON data operations, and stage configuration"
          icon={<UserPlus size={24} />}
          milestoneOwner="Milestone 4"
        />
      );
    }

    if (currentPath === '/settings') {
      return (
        <PlaceholderView
          title="Settings"
          subtitle="User profile, credentials, notifications, and telemetry preferences"
          icon={<Settings size={24} />}
          milestoneOwner="Milestone 4"
        />
      );
    }

    return (
      <PlaceholderView
        title="404 — Page Not Found"
        subtitle="The requested view does not exist in JobQuest 2.0"
        icon={<AlertCircle size={24} />}
        actionText="Return to Applications"
        onAction={() => navigate('/applications')}
      />
    );
  };

  return (
    <WorkspaceProvider
      userActiveWorkspaceId={user?.active_workspace_id}
      memberships={memberships}
      activeWorkspaceId={activeWs}
      onSelectWorkspace={(id) => loadData(id)}
    >
      <AppShell
        currentPath={currentPath}
        onNavigate={navigate}
        user={user}
        session={session}
        onRefreshSession={refresh}
        onLogout={onLogout}
        applicationsCount={apps.length}
        pageTitle={getPageTitle(currentPath)}
      >
        {renderRouteView()}
      </AppShell>
    </WorkspaceProvider>
  );
}
