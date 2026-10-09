import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CLAUDE_AUTH_HEADER_NAME, CLAUDE_CONNECTOR_NAME, CLAUDE_DEFAULT_EXPIRY_DAYS, CLAUDE_DEFAULT_PRESET, CLAUDE_EXPIRY_CHOICES,
  CLAUDE_PRESETS, CLAUDE_SECURITY_NOTES, CLAUDE_SETUP_STEPS, bearerHeaderValue, buildMcpUrl, effectiveStatus, lastUsedLabel,
  presetScopes, summarizeClaudeConnectors, type ConnectorTokenMetadata,
} from '../../apps/web/src/lib/claudeConnector';
import { ClaudeConnectorView, type ClaudeConnectorViewProps } from '../../apps/web/src/components/ai/ClaudeConnectorPanel';
import { CONNECTOR_EXPIRY_DAYS, CONNECTOR_SCOPES } from '../../apps/api/src/lib/aiConnectorTokens';
import { AI_PROVIDERS } from '../../apps/api/src/lib/aiContract/constants';
import { validateAiResult } from '../../apps/api/src/lib/aiContract/validate';
import { CLAUDE_EVAL_SCENARIOS, CLAUDE_SUBMISSION_FIXTURE } from './fixtures/claude-eval/scenarios';

vi.mock('../../apps/web/src/supabase', () => ({ supabase: { from: () => { throw new Error('unexpected'); } } }));

// AI-4 (no database): Claude connector setup UX states, frontend token hygiene,
// MCP tool-description/schema contract, evaluation fixtures and "no Anthropic API".
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const NOW = Date.parse('2026-10-09T12:00:00Z');
const RAW_TOKEN = 'jq_mcp_dev_RAWSECRETRAWSECRETRAWSECRETRAWSECRETRAWSECR';

const tok = (over: Partial<ConnectorTokenMetadata> = {}): ConnectorTokenMetadata => ({
  id: '11111111-1111-4111-8111-111111111111', workspace_id: '22222222-2222-4222-8222-222222222222', name: 'Claude connector',
  token_prefix: 'jq_mcp_dev_abcde', scopes: ['jobquest:read', 'ai:read'], created_at: '2026-10-01T12:00:00Z',
  expires_at: '2026-10-31T12:00:00Z', last_used_at: null, revoked_at: null, revoked_reason: null, status: 'ACTIVE', ...over,
});

const noop = () => undefined;
const view = (over: Partial<ClaudeConnectorViewProps> = {}) => renderToStaticMarkup(createElement(ClaudeConnectorView, {
  load: { status: 'ready', tokens: [] }, mcpUrl: 'https://preview.example.test/api/mcp', setupOpen: false, preset: 'read', expiry: 30,
  creating: false, createError: null, revealed: null, copied: null, copyError: null, revokeTarget: null, revoking: false, revokeError: null,
  now: NOW, onOpenSetup: noop, onCloseSetup: noop, onPreset: noop, onExpiry: noop, onCreate: noop, onCopy: noop, onCloseReveal: noop,
  onAskRevoke: noop, onCancelRevoke: noop, onConfirmRevoke: noop, ...over,
}));

describe('Claude connector helpers', () => {
  it('presets are exactly Read only (default) and Read + AI findings, drawn from the server scope list', () => {
    expect(CLAUDE_PRESETS.map((p) => p.id)).toEqual(['read', 'read_ingest']);
    expect(CLAUDE_DEFAULT_PRESET).toBe('read');
    expect(presetScopes('read')).toEqual(['jobquest:read', 'ai:read']);
    expect(presetScopes('read_ingest')).toEqual(['jobquest:read', 'ai:read', 'ai:ingest']);
    for (const p of CLAUDE_PRESETS) for (const s of p.scopes) expect(CONNECTOR_SCOPES as readonly string[]).toContain(s);
    const all = CLAUDE_PRESETS.flatMap((p) => p.scopes).join();
    expect(all).not.toMatch(/write|admin|\*/);
  });
  it('expiry choices are 7/30/90 days, default 30, and a subset of what the server accepts (no permanent token)', () => {
    expect([...CLAUDE_EXPIRY_CHOICES]).toEqual([7, 30, 90]);
    expect(CLAUDE_DEFAULT_EXPIRY_DAYS).toBe(30);
    for (const d of CLAUDE_EXPIRY_CHOICES) expect(CONNECTOR_EXPIRY_DAYS as readonly number[]).toContain(d);
  });
  it('MCP URL is origin-relative, never a hard-coded host', () => {
    expect(buildMcpUrl('http://localhost:5173')).toBe('http://localhost:5173/api/mcp');
    expect(buildMcpUrl('https://preview-abc.vercel.app/')).toBe('https://preview-abc.vercel.app/api/mcp');
    expect(read('apps/web/src/lib/claudeConnector.ts')).not.toMatch(/vercel\.app|jobquest2\.|https?:\/\//);
  });
  it('header convention is Authorization: Bearer <token>', () => {
    expect(CLAUDE_AUTH_HEADER_NAME).toBe('Authorization');
    expect(bearerHeaderValue('abc')).toBe('Bearer abc');
    expect(CLAUDE_CONNECTOR_NAME).toBe('Claude connector');
  });
  it('summary: no active token is "Not configured"; an active token is "Connector ready" (never "Connected")', () => {
    expect(summarizeClaudeConnectors([], NOW)).toMatchObject({ state: 'NOT_CONFIGURED', label: 'Not configured' });
    const ready = summarizeClaudeConnectors([tok()], NOW);
    expect(ready).toMatchObject({ state: 'CONNECTOR_READY', label: 'Connector ready' });
    expect(JSON.stringify(ready)).not.toMatch(/Connected/);
    // Non-Claude tokens are ignored.
    expect(summarizeClaudeConnectors([tok({ name: 'Gemini test' })], NOW).state).toBe('NOT_CONFIGURED');
  });
  it('expired and revoked tokens are never active; a token that expired while the page was open flips to expired', () => {
    const expired = tok({ expires_at: '2026-10-05T00:00:00Z' }); // server said ACTIVE a moment ago; clock has moved on
    const revoked = tok({ id: '33333333-3333-4333-8333-333333333333', status: 'REVOKED', revoked_at: '2026-10-02T00:00:00Z' });
    expect(effectiveStatus(expired, NOW)).toBe('EXPIRED');
    expect(effectiveStatus(revoked, NOW)).toBe('REVOKED');
    const s = summarizeClaudeConnectors([expired, revoked], NOW);
    expect(s.state).toBe('NOT_CONFIGURED');
    expect(s.active).toHaveLength(0);
    expect(s.previous).toHaveLength(2);
  });
  it('last-used is evidence, not a live session', () => {
    expect(lastUsedLabel(null, String)).toBe('Not used yet');
    expect(lastUsedLabel('2026-10-08T00:00:00Z', () => 'Oct 8')).toBe('Last used Oct 8');
  });
  it('setup instructions follow the Claude custom-connector flow and never ask for Supabase/service keys/passwords', () => {
    const steps = CLAUDE_SETUP_STEPS.join('\n');
    for (const needle of ['Customize → Connectors', 'Add custom connector', 'JobQuest', 'Authorization', 'Bearer', 'enable']) expect(steps).toContain(needle);
    const notes = CLAUDE_SECURITY_NOTES.join('\n');
    expect(notes).toMatch(/password/i);
    expect(notes).toMatch(/revoke/i);
    expect(notes).toMatch(/permissions/i);
  });
});

describe('Claude connector settings UI states', () => {
  it('no Claude token: "Not configured" with a "Set up Claude" action and no token rows', () => {
    const html = view();
    expect(html).toContain('Not configured');
    expect(html).toContain('Set up Claude');
    expect(html).not.toContain('Connector ready');
    expect(html).not.toContain('Revoke');
    expect(html).toContain('stores no Claude credentials');
  });
  it('loading and error states are truthful', () => {
    expect(view({ load: { status: 'loading' } })).toContain('Checking…');
    const err = view({ load: { status: 'error', message: 'Could not load connector credentials.' } });
    expect(err).toContain('Status unavailable');
    expect(err).toContain('Could not load connector credentials.');
    expect(err).not.toContain('Set up Claude');
  });
  it('active credential: "Connector ready" with name, scopes, expiry, created date and last-used state; never "Connected"', () => {
    const html = view({ load: { status: 'ready', tokens: [tok({ scopes: ['jobquest:read', 'ai:read', 'ai:ingest'] })] } });
    expect(html).toContain('Connector ready');
    expect(html).toContain('Claude connector');
    expect(html).toContain('jq_mcp_dev_abcde');
    expect(html).toContain('Read applications');
    expect(html).toContain('Save AI findings');
    expect(html).toContain('Not used yet');
    expect(html).toContain('Expires');
    expect(html).toContain('Created');
    expect(html).toContain('Revoke');
    expect(html).not.toMatch(/Connected/);
    expect(html).not.toMatch(/Running|Syncing|Scheduled|Automated/);
  });
  it('a used credential shows "Last used"', () => {
    expect(view({ load: { status: 'ready', tokens: [tok({ last_used_at: '2026-10-08T10:00:00Z' })] } })).toContain('Last used');
  });
  it('expired/revoked credentials appear only under "Previous credentials" and offer no revoke action', () => {
    const html = view({ load: { status: 'ready', tokens: [tok({ status: 'REVOKED', revoked_at: '2026-10-02T00:00:00Z' }), tok({ id: '44444444-4444-4444-8444-444444444444', expires_at: '2026-10-05T00:00:00Z' })] } });
    expect(html).toContain('Previous credentials (2)');
    expect(html).toContain('revoked');
    expect(html).toContain('expired');
    expect(html).toContain('Not configured');
    expect(html).not.toContain('Connector ready');
    expect(html).not.toContain('Active Claude credentials');
    expect(html).not.toContain('>Revoke<');
    expect(html).not.toMatch(/token_hash|hash/i);
  });
  it('setup dialog offers both presets (read-only recommended), 7/30/90-day expiry, and create loading/error states', () => {
    const html = view({ setupOpen: true });
    expect(html).toContain('Set up Claude');
    expect(html).toContain('Read only');
    expect(html).toContain('(recommended)');
    expect(html).toContain('Read + AI findings');
    expect(html).toContain('7 days');
    expect(html).toContain('30 days');
    expect(html).toContain('90 days');
    expect(html).toContain('Claude can never change your applications');
    expect(html).not.toMatch(/write access|admin|wildcard/i);
    expect(view({ setupOpen: true, preset: 'read_ingest' })).toContain('Save AI findings');
    expect(view({ setupOpen: true, creating: true })).toContain('Create credential');
    const failed = view({ setupOpen: true, createError: 'AI Hub is disabled on this server.' });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('AI Hub is disabled on this server.');
  });
  it('show-once reveal: token, MCP URL, header guidance, steps and security notice; token appears only when revealed', () => {
    expect(view()).not.toContain(RAW_TOKEN);
    const html = view({ revealed: { token: RAW_TOKEN, metadata: tok() } });
    expect(html).toContain(RAW_TOKEN);
    expect(html).toContain('https://preview.example.test/api/mcp');
    expect(html).toContain('Copy token');
    expect(html).toContain('Copy URL');
    expect(html).toContain('Copy header value');
    expect(html).toContain('Authorization: Bearer &lt;connector token&gt;'); // guidance never embeds the real token twice
    expect(html.split(RAW_TOKEN).length - 1).toBe(1);
    expect(html).toContain('shown only once');
    expect(html).toContain('Treat the token like a password');
    expect(html).toContain('Customize → Connectors');
    expect(view({ revealed: { token: RAW_TOKEN, metadata: tok() }, copied: 'token' })).toContain('Copied');
    expect(view({ revealed: { token: RAW_TOKEN, metadata: tok() }, copyError: 'Copy failed.' })).toContain('Copy failed.');
  });
  it('revoke needs confirmation and states the immediate effect; revoke errors are surfaced', () => {
    const html = view({ revokeTarget: tok() });
    expect(html).toContain('Revoke “Claude connector”?');
    expect(html).toContain('Claude loses access to JobQuest immediately');
    expect(html).toContain('Revoke credential');
    expect(view({ revokeError: 'Could not revoke the connector credential.' })).toContain('Could not revoke the connector credential.');
  });
});

describe('Claude connector frontend token hygiene', () => {
  const FILES = ['apps/web/src/components/ai/ClaudeConnectorPanel.tsx', 'apps/web/src/api/aiConnectors.ts', 'apps/web/src/lib/claudeConnector.ts'];
  it('never touches web storage, cookies, history, URL search params, query caches, analytics or the console', () => {
    for (const f of FILES) {
      const code = strip(read(f));
      expect(code, f).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|history\.(push|replace)State|location\.(hash|search|href\s*=)|URLSearchParams|console\.|react-query|tanstack|queryClient|analytics|window\.name/);
    }
  });
  it('the raw token lives only in ephemeral component state and is cleared when the reveal dialog closes', () => {
    const code = strip(read(FILES[0]!));
    expect(code).toMatch(/const \[revealed, setRevealed\] = useState<ClaudeRevealed \| null>\(null\)/);
    expect(code).toMatch(/onCloseReveal=\{\(\) => \{ setRevealed\(null\)/);
    expect((code.match(/\.token\b/g) ?? []).length).toBeLessThan(12);
    // list API returns metadata only; create is the only place that reads `.token`.
    const listFn = strip(read(FILES[1]!)).split('export async function createConnectorToken')[0]!;
    expect(listFn).not.toMatch(/\.token\b/);
  });
  it('Claude setup uses the generic AI-3 routes and adds no provider-specific server surface', () => {
    const api = strip(read(FILES[1]!));
    expect(api).toContain('/ai/connector-tokens');
    expect(api).not.toMatch(/anthropic|claude\.ai|api\.anthropic/i);
  });
  it('Settings -> Providers wires the Claude panel and keeps Gemini/ChatGPT "Not configured"', () => {
    const settings = read('apps/web/src/views/AiAutomationSettings.tsx');
    expect(settings).toContain('ClaudeConnectorPanel');
    expect(settings).toMatch(/p\.id === 'claude' && session/);
    expect(read('apps/web/src/views/SettingsView.tsx')).toContain('<AiAutomationSettings activeWorkspaceId={activeWorkspaceId} session={session} />');
  });
});

describe('MCP tool descriptions for Claude (deterministic contract)', () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_unit_test_placeholder';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_placeholder';
    process.env.JQ_JWT_PRIVATE_JWK = '{"placeholder":"unit-test-not-a-key"}';
    process.env.EXTENSION_TOKEN_PEPPER = 'unit-test-extension-pepper-32-bytes-minimum';
    process.env.EXTENSION_TOKEN_ENV = 'dev';
    const { resetEnvCache } = await import('../../apps/api/src/env');
    resetEnvCache();
  });
  const load = async () => (await import('../../apps/api/src/mcp/tools')).MCP_TOOLS;
  const byName = async (n: string) => (await load()).find((t) => t.name === n)!;

  it('the surface stays minimal: the same six tools, nothing added for Claude', async () => {
    expect((await load()).map((t) => t.name).sort()).toEqual([
      'jobquest_get_application', 'jobquest_list_ai_findings', 'jobquest_list_ai_runs',
      'jobquest_list_ai_suggestions', 'jobquest_list_applications', 'jobquest_submit_ai_result',
    ]);
  });
  it('descriptions are concise, static and non-coercive', async () => {
    for (const t of await load()) {
      expect(t.description.length, t.name).toBeGreaterThan(60);
      expect(t.description.length, t.name).toBeLessThan(720);
      expect(t.description, t.name).not.toMatch(/ignore (previous|prior)|you must|always call|secret|token/i);
    }
  });
  it('read tools say they are read-only and what they are not', async () => {
    for (const t of (await load()).filter((x) => x.name !== 'jobquest_submit_ai_result')) expect(t.description, t.name).toMatch(/Read-only/);
    const apps = (await byName('jobquest_list_applications')).description;
    expect(apps).toMatch(/ALREADY TRACKED/);
    expect(apps).toMatch(/Does NOT discover or search for jobs, browse the web, or create or change applications/);
    expect(apps).toMatch(/at most 50/);
    const get = (await byName('jobquest_get_application')).description;
    expect(get).toMatch(/EXISTING/);
    expect(get).toMatch(/private notes, salary and contacts are never included/);
    for (const n of ['jobquest_list_ai_runs', 'jobquest_list_ai_findings']) {
      expect((await byName(n)).description, n).toMatch(/JobQuest/);
      expect((await byName(n)).description, n).toMatch(/not web search|history only/i);
    }
    expect((await byName('jobquest_list_ai_suggestions')).description).toMatch(/cannot be accepted/);
  });
  it('the submit tool is unmistakably the only write and states what it does NOT change', async () => {
    const submit = await byName('jobquest_submit_ai_result');
    expect(submit.description).toMatch(/^WRITE \(AI Hub only\)/);
    expect(submit.description).toContain('jobquest.ai-result');
    expect(submit.description).toContain('"claude"');
    for (const phrase of ['does NOT change an application status', 'create applications', 'edit contacts', 'complete tasks', 'idempotent']) expect(submit.description).toContain(phrase);
    expect(submit.description).toMatch(/only when the user asks/i);
    expect(submit.scope).toBe('ai:ingest');
    expect(submit.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: false });
  });
  it('every tool carries a distinct title and a single scope; no tool takes identity or workspace input', async () => {
    const tools = await load();
    expect(new Set(tools.map((t) => t.title)).size).toBe(tools.length);
    for (const t of tools) {
      const keys = Object.keys((t.input as unknown as { shape: Record<string, unknown> }).shape);
      expect(keys.join(), t.name).not.toMatch(/user_?id|workspace_?id|token/i);
    }
  });
});

describe('Claude evaluation fixtures (deterministic half of the live smoke)', () => {
  const loadTools = async () => (await import('../../apps/api/src/mcp/tools')).MCP_TOOLS;
  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_unit_test_placeholder';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_placeholder';
    process.env.JQ_JWT_PRIVATE_JWK = '{"placeholder":"unit-test-not-a-key"}';
    process.env.EXTENSION_TOKEN_PEPPER = 'unit-test-extension-pepper-32-bytes-minimum';
    process.env.EXTENSION_TOKEN_ENV = 'dev';
    const { resetEnvCache } = await import('../../apps/api/src/env');
    resetEnvCache();
  });

  it('covers all eight scenarios and none can be satisfied by a core mutation', () => {
    expect(CLAUDE_EVAL_SCENARIOS.map((s) => s.id.split('-')[0])).toEqual(['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7a', 'E8']);
    for (const s of CLAUDE_EVAL_SCENARIOS) expect(s.coreMutation).toBe(false);
  });
  it('every expected tool exists and is reachable under the scenario scopes; forbidden/unavailable ones are not', async () => {
    const tools = await loadTools();
    const hasScope = (granted: readonly string[], scope: string) => granted.includes(scope);
    for (const s of CLAUDE_EVAL_SCENARIOS) {
      const visible = tools.filter((t) => hasScope(s.scopes, t.scope)).map((t) => t.name);
      for (const e of s.expectedTools) expect(visible, `${s.id}:${e}`).toContain(e);
      if (s.id.startsWith('E7a')) expect(visible).not.toContain('jobquest_submit_ai_result'); // read-only token cannot even see submit
      if (s.id.startsWith('E5')) expect(visible.join()).not.toMatch(/update|status|set_|create_application|delete/); // unsupported write: nothing to call
    }
  });
  it('the synthetic Claude submission is a valid jobquest.ai-result 1.0 with canonical provider "claude"', () => {
    expect(AI_PROVIDERS).toContain('claude');
    expect(AI_PROVIDERS.filter((p) => /claude/.test(p))).toEqual(['claude']); // no claude-pro / claude-code / anthropic-cloud
    const r = validateAiResult(structuredClone(CLAUDE_SUBMISSION_FIXTURE));
    expect(r.success).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.data!.provider).toBe('claude');
    expect(r.data!.findings).toHaveLength(1);
    for (const bad of ['claude-pro', 'claude-code', 'anthropic-cloud']) {
      expect(validateAiResult({ ...structuredClone(CLAUDE_SUBMISSION_FIXTURE), provider: bad }).success, bad).toBe(false);
    }
  });
});

describe('No Anthropic API, no stored Claude credentials, no workflow config mutation', () => {
  it('adds no Anthropic SDK or ANTHROPIC_API_KEY anywhere in shipped code or manifests', () => {
    for (const manifest of ['package.json', 'apps/api/package.json', 'apps/web/package.json']) {
      expect(read(manifest), manifest).not.toMatch(/@anthropic-ai|anthropic/i);
    }
    const shipped = [
      'apps/web/src/components/ai/ClaudeConnectorPanel.tsx', 'apps/web/src/api/aiConnectors.ts', 'apps/web/src/lib/claudeConnector.ts',
      'apps/api/src/mcp/tools.ts', 'apps/api/src/mcp/server.ts', 'apps/api/src/env.ts',
    ];
    for (const f of shipped) expect(strip(read(f)), f).not.toMatch(/ANTHROPIC_API_KEY|api\.anthropic\.com|@anthropic-ai/);
  });
  it('the Claude UI never mutates ai_workflow_configs and adds no migration', () => {
    const code = strip(read('apps/web/src/components/ai/ClaudeConnectorPanel.tsx')) + strip(read('apps/web/src/api/aiConnectors.ts'));
    expect(code).not.toMatch(/ai_workflow_configs|workflow_config|supabase/i);
  });
});
