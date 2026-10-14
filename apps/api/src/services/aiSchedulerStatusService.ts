// AI-11G: provider scheduler status + setup instructions (Settings -> AI & Automation).
//
// "Connected to JobQuest" and "scheduled execution ready" are different facts, so they are derived separately and never from one
// flag:
//   * connection  = a live credential that may submit results exists for the provider
//                   (an unexpired, unrevoked connector token bound to it with ai:ingest, or an unrevoked OAuth client of that provider
//                   that holds an active grant and the ai:ingest scope);
//   * scheduler   = evidence from ai_runs that the provider's own scheduled task has CLAIMED and finished occurrences
//                   (see deriveSchedulerReadiness). Nothing is stored and nobody can set it by hand.
// Read-only. Reads run as the signed-in owner (RLS) except the OAuth client listing, which is the existing service-role RPC that
// the Providers panel already uses and is filtered by the verified actor id.
import { admin as adminClient, userClient } from '../lib/db';
import {
  SCHEDULER_PROVIDERS, EMPTY_EVIDENCE, buildProviderStatus, buildSchedulerSetup,
  type AutomationDefinition, type ProviderCredentialState, type ProviderSchedulerStatus, type SchedulerRunEvidence, type SchedulerSetup, type SchedulerProvider,
} from '../lib/aiContract';
import { UUID } from './aiReadSupport';

export interface SchedulerContext { workspaceId: string; userId: string; accessToken: string }
export type SchedulerError = { code: 'INVALID_INPUT' | 'AUTOMATION_NOT_FOUND' | 'READ_FAILED'; message: string };
export type SchedulerResult<T> = { ok: true; data: T } | { ok: false; error: SchedulerError };

type Reader = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
export interface SchedulerDeps { reader?: Reader; oauth?: Rpc; now?: () => Date }

const fail = <T>(code: SchedulerError['code'], message: string): SchedulerResult<T> => ({ ok: false, error: { code, message } });
const FINISHED = ['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'];

interface Connection { connected: boolean; canIngest: boolean; credential: ProviderCredentialState }

/**
 * Connection state per provider PLUS why a provider is not connected (AI-11H): a credential that exists but expired or was revoked
 * is a different, actionable fact from "never set up". Token metadata only (never a hash/secret); the newest lapsed credential decides.
 */
async function connections(ctx: SchedulerContext, reader: Reader, oauth: Rpc, now: Date): Promise<Map<SchedulerProvider, Connection> | null> {
  const out = new Map<SchedulerProvider, Connection>(SCHEDULER_PROVIDERS.map((p) => [p, { connected: false, canIngest: false, credential: 'none' as ProviderCredentialState }]));
  const lapsed = new Map<SchedulerProvider, { at: string; state: 'expired' | 'revoked' }>();
  const mark = (p: unknown, scopes: unknown) => {
    if (typeof p !== 'string' || !out.has(p as SchedulerProvider)) return;
    const cur = out.get(p as SchedulerProvider)!;
    cur.connected = true;
    cur.credential = 'active';
    cur.canIngest ||= Array.isArray(scopes) && scopes.includes('ai:ingest');
  };
  const lapse = (p: unknown, at: unknown, state: 'expired' | 'revoked') => {
    if (typeof p !== 'string' || !out.has(p as SchedulerProvider)) return;
    const when = typeof at === 'string' ? at : '';
    const prev = lapsed.get(p as SchedulerProvider);
    if (!prev || when > prev.at) lapsed.set(p as SchedulerProvider, { at: when, state });
  };

  const tokens = await reader.from('ai_connector_tokens').select('provider, scopes, expires_at, revoked_at, created_at')
    .eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId).not('provider', 'is', null).order('created_at', { ascending: false }).limit(100);
  if (tokens.error) return null;
  for (const t of (tokens.data ?? []) as Array<{ provider: string; scopes: string[]; expires_at: string; revoked_at: string | null; created_at: string }>) {
    if (t.revoked_at) lapse(t.provider, t.created_at, 'revoked');
    else if (Date.parse(t.expires_at) > now.getTime()) mark(t.provider, t.scopes);
    else lapse(t.provider, t.created_at, 'expired');
  }

  const clients = await oauth.rpc('rpc_oauth_list_clients', { p_actor_id: ctx.userId, p_workspace_id: ctx.workspaceId });
  if (clients.error) return null;
  for (const c of (Array.isArray(clients.data) ? clients.data : []) as Array<{ provider: string; scopes: string[]; revoked_at: string | null; active_grants: number | string; created_at?: string; last_used_at?: string | null }>) {
    if (c.revoked_at) lapse(c.provider, c.revoked_at, 'revoked');
    else if (Number(c.active_grants) > 0) mark(c.provider, c.scopes);
    else if (c.last_used_at) lapse(c.provider, c.last_used_at, 'expired'); // it WAS used and now has no active grant: the authorization ended. A never-used registration is not a lapse.
  }
  for (const [p, l] of lapsed) {
    const cur = out.get(p)!;
    if (!cur.connected) cur.credential = l.state;
  }
  return out;
}

async function evidenceFor(ctx: SchedulerContext, reader: Reader, provider: SchedulerProvider): Promise<SchedulerRunEvidence | null> {
  // Scheduled (and retried-scheduled) runs that a claim started. Run Now / attended manual runs prove nothing about the scheduler.
  const res = await reader.from('ai_runs').select('status, started_at, completed_at, trigger_type')
    .eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId).eq('provider', provider)
    .in('trigger_type', ['scheduled', 'retry']).not('started_at', 'is', null)
    .order('started_at', { ascending: false }).limit(20);
  if (res.error) return null;
  const rows = (res.data ?? []) as Array<{ status: string; started_at: string; completed_at: string | null }>;
  if (rows.length === 0) return EMPTY_EVIDENCE;
  const finished = rows.find((r) => FINISHED.includes(r.status)) ?? null;
  const completed = rows.find((r) => r.status === 'SUCCEEDED' || r.status === 'PARTIAL') ?? null;
  return { claimedRuns: rows.length, latestFinishedStatus: finished?.status ?? null, latestClaimAt: rows[0]!.started_at, latestCompletedAt: completed ? completed.completed_at ?? completed.started_at : null };
}

/** One entry per supported provider: connection state and scheduler readiness, kept separate. */
export async function getSchedulerStatus(ctx: SchedulerContext, deps: SchedulerDeps = {}): Promise<SchedulerResult<ProviderSchedulerStatus[]>> {
  if (!UUID.test(ctx.workspaceId) || !UUID.test(ctx.userId)) return fail('INVALID_INPUT', 'A workspace is required.');
  const reader = deps.reader ?? (userClient(ctx.accessToken) as unknown as Reader);
  const oauth = deps.oauth ?? (adminClient() as unknown as Rpc);
  const conn = await connections(ctx, reader, oauth, (deps.now ?? (() => new Date()))());
  if (!conn) return fail('READ_FAILED', 'Could not load provider connections.');
  const list: ProviderSchedulerStatus[] = [];
  for (const p of SCHEDULER_PROVIDERS) {
    const evidence = await evidenceFor(ctx, reader, p);
    if (!evidence) return fail('READ_FAILED', 'Could not load scheduler status.');
    const c = conn.get(p)!;
    list.push(buildProviderStatus(p, c.connected ? 'connected' : 'not_connected', c.canIngest, evidence, c.credential));
  }
  return { ok: true, data: list };
}

export interface AutomationSetupView { setup: SchedulerSetup; status: ProviderSchedulerStatus }

/** Copyable setup instructions for ONE automation, generated from its stored definition (never from client input). */
export async function getAutomationSetup(ctx: SchedulerContext, automationId: string, deps: SchedulerDeps = {}): Promise<SchedulerResult<AutomationSetupView>> {
  if (!UUID.test(ctx.workspaceId) || !UUID.test(ctx.userId) || !UUID.test(automationId)) return fail('INVALID_INPUT', 'A workspace and an automation are required.');
  const reader = deps.reader ?? (userClient(ctx.accessToken) as unknown as Reader);
  const res = await reader.from('ai_workflow_configs').select('id, name, workflow, enabled, primary_provider, cadence, local_time, timezone, weekdays, sections')
    .eq('id', automationId).eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId).maybeSingle();
  if (res.error) return fail('READ_FAILED', 'Could not load the automation.');
  const r = res.data as {
    id: string; name: string; workflow: AutomationDefinition['workflow']; enabled: boolean; primary_provider: AutomationDefinition['provider'] | null;
    cadence: AutomationDefinition['cadence']; local_time: string | null; timezone: string | null; weekdays: number[] | null; sections: AutomationDefinition['sections'] | null;
  } | null;
  if (!r) return fail('AUTOMATION_NOT_FOUND', 'Automation not found.');
  const setup = buildSchedulerSetup({
    id: r.id, name: r.name, workflow: r.workflow, provider: r.primary_provider ?? 'manual', enabled: r.enabled, cadence: r.cadence,
    localTime: r.local_time, timezone: r.timezone, weekdays: r.weekdays ?? [], sections: r.sections ?? [],
  });
  if (!setup) return fail('INVALID_INPUT', 'Choose Claude, ChatGPT or Gemini as the provider to get setup instructions.');
  const all = await getSchedulerStatus(ctx, deps);
  if (!all.ok) return all;
  return { ok: true, data: { setup, status: all.data.find((s) => s.provider === setup.provider)! } };
}
