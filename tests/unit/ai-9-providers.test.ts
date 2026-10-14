import { beforeAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { AI_PROVIDERS } from '../../apps/api/src/lib/aiContract/constants';
import { validateAiResult } from '../../apps/api/src/lib/aiContract';
import { CONNECTOR_SCOPES } from '../../apps/api/src/lib/aiConnectorTokens';
import { effectiveStatus, summarizeClaudeConnectors, type ConnectorTokenMetadata } from '../../apps/web/src/lib/claudeConnector';
import {
  CHATGPT_PROVIDER, CLAUDE_PROVIDER, GEMINI_PROVIDER, PROVIDER_CONNECTORS, isProviderToken, presetScopesFor, summarizeProvider,
  type ProviderConnectorConfig,
} from '../../apps/web/src/lib/providerConnectors';
import { ProviderConnectorView, type ProviderConnectorViewProps } from '../../apps/web/src/components/ai/ProviderConnectorPanel';
import { AI_WORKFLOW_DEFINITIONS, PROVIDER_COMPATIBILITY_LABELS } from '../../apps/web/src/lib/aiWorkflowDefinitions';

// AI-9 coverage (no network, no provider account): the provider-neutral connector cards stay truthful, the Gemini and ChatGPT
// templates keep the one canonical schema, the ChatGPT plugin template contains no secret and no invented capability, and
// nothing provider-specific (API keys, schedulers, tables, core-write tools) crept in.

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const NOW = Date.parse('2026-10-12T12:00:00Z');
const RAW_TOKEN = 'jq_mcp_dev_RAW_SECRET_TOKEN_VALUE_0123456789';

const tok = (over: Partial<ConnectorTokenMetadata> = {}): ConnectorTokenMetadata => ({
  id: 't1', workspace_id: 'w1', name: 'Gemini connector', token_prefix: 'jq_mcp_dev_abcde', scopes: ['jobquest:read', 'ai:read'],
  created_at: '2026-10-10T10:00:00Z', expires_at: '2026-11-10T10:00:00Z', last_used_at: null, revoked_at: null, revoked_reason: null, status: 'ACTIVE', ...over,
});

const noop = () => undefined;
const view = (provider: ProviderConnectorConfig, over: Partial<ProviderConnectorViewProps> = {}) => renderToStaticMarkup(createElement(ProviderConnectorView, {
  provider, load: { status: 'ready', tokens: [] }, mcpUrl: 'https://preview.example.test/api/mcp', setupOpen: false, preset: 'read', expiry: 30,
  creating: false, createError: null, revealed: null, copied: null, copyError: null, revokeTarget: null, revoking: false, revokeError: null,
  now: NOW, onOpenSetup: noop, onCloseSetup: noop, onPreset: noop, onExpiry: noop, onCreate: noop, onCopy: noop, onCloseReveal: noop,
  onAskRevoke: noop, onCancelRevoke: noop, onConfirmRevoke: noop, ...over,
}));

describe('provider cards (Settings -> AI & Automation -> Providers)', () => {
  it('Claude is unchanged: the generic summary equals the AI-4 summary and the Claude view keeps its copy', () => {
    const cases: ConnectorTokenMetadata[][] = [
      [], [tok({ name: 'Claude connector' })],
      [tok({ name: 'Claude connector', expires_at: '2026-10-01T00:00:00Z' }), tok({ id: 't2', name: 'Claude connector', revoked_at: '2026-10-05T00:00:00Z', status: 'REVOKED' })],
      [tok({ name: 'Gemini connector' })],
    ];
    for (const tokens of cases) {
      const a = summarizeClaudeConnectors(tokens, NOW);
      const b = summarizeProvider(CLAUDE_PROVIDER, tokens, NOW);
      expect({ state: b.state, label: b.label, active: b.active, previous: b.previous }).toEqual(a);
    }
    const html = view(CLAUDE_PROVIDER);
    expect(html).toContain('Set up Claude');
    expect(html).toContain('stores no Claude credentials');
    expect(html).toContain('data-testid="claude-connector"');
    expect(html).not.toContain('capabilities'); // no extra capability list on Claude
  });

  it('Gemini: not configured, then "Connector credential ready" (never "Connected"), with the approval-required write note', () => {
    const none = view(GEMINI_PROVIDER);
    expect(none).toContain('data-testid="gemini-connector"');
    expect(none).toContain('Not configured');
    expect(none).toContain('Set up Gemini');
    const ready = view(GEMINI_PROVIDER, { load: { status: 'ready', tokens: [tok({ last_used_at: '2026-10-11T09:00:00Z' })] } });
    expect(ready).toContain('Connector credential ready');
    expect(ready).toContain('Gemini connector');
    expect(ready).toContain('Last used');
    expect(ready).toContain('Add another credential');
    expect(ready).toContain('Scheduled save to JobQuest:</b> Approval required');
    for (const html of [none, ready]) expect(html).not.toMatch(/\bConnected\b/);
    expect(ready).not.toContain('Claude');
  });

  it('Gemini: expired and revoked credentials say so (and an unused credential says "Not used yet")', () => {
    const expired = view(GEMINI_PROVIDER, { load: { status: 'ready', tokens: [tok({ expires_at: '2026-10-01T00:00:00Z' })] } });
    expect(expired).toContain('Credential expired');
    expect(expired).toContain('Set up Gemini');
    expect(expired).not.toContain('Connector credential ready');
    const revoked = view(GEMINI_PROVIDER, { load: { status: 'ready', tokens: [tok({ revoked_at: '2026-10-05T00:00:00Z', status: 'REVOKED' })] } });
    expect(revoked).toContain('Credential revoked');
    expect(revoked).not.toContain('Revoke</button>');
    expect(view(GEMINI_PROVIDER, { load: { status: 'ready', tokens: [tok()] } })).toContain('Not used yet');
  });

  it('a credential belongs to exactly one provider card (prefix convention) and states are provider-specific', () => {
    expect(isProviderToken(GEMINI_PROVIDER, { name: 'Gemini connector' })).toBe(true);
    expect(isProviderToken(CLAUDE_PROVIDER, { name: 'Gemini connector' })).toBe(false);
    expect(isProviderToken(GEMINI_PROVIDER, { name: 'ChatGPT plugin' })).toBe(false);
    expect(isProviderToken(CHATGPT_PROVIDER, { name: 'ChatGPT plugin' })).toBe(true);
    expect(summarizeProvider(GEMINI_PROVIDER, [tok({ name: 'Claude connector' })], NOW).state).toBe('NOT_CONFIGURED');
    expect(summarizeProvider(GEMINI_PROVIDER, [tok()], NOW).state).toBe('CONNECTOR_READY');
    expect(effectiveStatus(tok(), NOW)).toBe('ACTIVE');
  });

  it('ChatGPT: plugin setup required, plan-gated direct MCP, no "MCP connected" claim', () => {
    const none = view(CHATGPT_PROVIDER);
    expect(none).toContain('data-testid="chatgpt-connector"');
    expect(none).toContain('Plugin setup required');
    expect(none).toContain('Direct MCP connector:</b> Not available on this plan');
    expect(none).toContain('Create plugin credential');
    expect(none).toContain('does not support a direct Claude-style MCP connector');
    const ready = view(CHATGPT_PROVIDER, { load: { status: 'ready', tokens: [tok({ name: 'ChatGPT plugin' })] } });
    expect(ready).toContain('Plugin credential ready');
    for (const html of [none, ready]) {
      expect(html).not.toMatch(/MCP connected|\bConnected\b/);
      expect(html).not.toContain('Connector ready');
    }
  });

  it('load error / loading states are honest and offer no setup action', () => {
    for (const provider of [GEMINI_PROVIDER, CHATGPT_PROVIDER]) {
      expect(view(provider, { load: { status: 'loading' } })).toContain('Checking…');
      const err = view(provider, { load: { status: 'error', message: 'Could not load connector credentials.' } });
      expect(err).toContain('Status unavailable');
      expect(err).not.toContain(provider.setupButton);
    }
  });

  it('setup dialog is provider-specific: presets, default expiry choices, grants and the strict no-core-write promise', () => {
    for (const provider of [GEMINI_PROVIDER, CHATGPT_PROVIDER]) {
      const html = view(provider, { setupOpen: true });
      expect(html).toContain(provider.setupTitle);
      expect(html).toContain('Read only');
      expect(html).toContain('(recommended)');
      expect(html).toContain('Read + AI findings');
      for (const d of ['7 days', '30 days', '90 days']) expect(html).toContain(d);
      expect(html).toContain(`${provider.name} can never change your applications`);
      expect(html).toContain(`name="${provider.id}-preset"`);
      expect(html).toContain(`id="${provider.id}-expiry"`);
    }
    expect(presetScopesFor(GEMINI_PROVIDER, 'read')).toEqual(['jobquest:read', 'ai:read']);
    expect(presetScopesFor(GEMINI_PROVIDER, 'read_ingest')).toEqual(['jobquest:read', 'ai:read', 'ai:ingest']);
    for (const provider of Object.values(PROVIDER_CONNECTORS)) {
      expect(provider.connectorName.length).toBeLessThanOrEqual(64);
      expect(provider.connectorName.toLowerCase().startsWith(provider.id)).toBe(true);
      for (const preset of provider.presets) for (const s of preset.scopes) expect(CONNECTOR_SCOPES as readonly string[]).toContain(s);
    }
  });

  it('the raw token is shown once in the reveal dialog only, never otherwise; Gemini steps reflect the current UI', () => {
    expect(view(GEMINI_PROVIDER)).not.toContain(RAW_TOKEN);
    const html = view(GEMINI_PROVIDER, { revealed: { token: RAW_TOKEN, metadata: tok() } });
    expect(html).toContain(RAW_TOKEN);
    expect(html).toContain('shown only once');
    expect(html).toContain('https://preview.example.test/api/mcp');
    expect(html).toContain('Authorization: Bearer &lt;connector token&gt;');
    for (const needle of ['Connected Apps', 'Custom apps', 'Add a custom app', 'Dynamic Client Registration', 'confirm any write', 'stop and report']) expect(html).toContain(needle);
    expect(html).not.toContain('Customize → Connectors'); // never Claude's steps
    const chat = view(CHATGPT_PROVIDER, { revealed: { token: RAW_TOKEN, metadata: tok({ name: 'ChatGPT plugin' }) } });
    for (const needle of ['Add custom MCP server', 'Plugin Creator', 'only OAuth', 'pause for your approval']) expect(chat).toContain(needle);
  });

  it('the connector UI never persists a token: no storage, URL, history or console in the panel/config code', () => {
    for (const f of ['apps/web/src/components/ai/ProviderConnectorPanel.tsx', 'apps/web/src/lib/providerConnectors.ts', 'apps/web/src/api/aiConnectors.ts']) {
      expect(strip(read(f)), f).not.toMatch(/localStorage|sessionStorage|indexedDB|history\.(push|replace)State|location\.(search|hash|href)\s*=|console\.|document\.cookie/);
    }
    expect(strip(read('apps/web/src/components/ai/ProviderConnectorPanel.tsx'))).toMatch(/const \[revealed, setRevealed\] = useState<ClaudeRevealed \| null>\(null\)/);
  });

  it('Settings renders a card per provider on the generic panel; ChatGPT never gets a Claude-style MCP card', () => {
    const settings = read('apps/web/src/views/AiAutomationSettings.tsx');
    expect(settings).toContain('PROVIDER_CONNECTORS[p.id]');
    expect(settings).not.toMatch(/ChatGPT MCP|chatgpt-mcp/i);
  });
});

describe('workflow definitions stay truthful about providers', () => {
  it('all five JobQuest workflows are available; Gemini/ChatGPT templates exist but are NOT claimed verified', () => {
    expect(AI_WORKFLOW_DEFINITIONS.map((d) => d.id)).toEqual(['daily_brief', 'job_discovery', 'email_triage', 'recruiter_intel', 'calendar_review']);
    for (const d of AI_WORKFLOW_DEFINITIONS) {
      expect(d.status).toBe('AVAILABLE');
      expect(d.providers.claude).toBe('template_ready');
      for (const t of [d.claudeTemplate, d.geminiTemplate, d.chatgptTemplate]) expect(existsSync(t), t).toBe(true);
      expect(d.geminiTemplate.replace('/gemini/', '/claude/')).toBe(d.claudeTemplate);
      expect(d.chatgptTemplate.replace('/chatgpt/', '/claude/')).toBe(d.claudeTemplate);
      // never "template ready" == "verified": the label says the provider is unverified
      expect(PROVIDER_COMPATIBILITY_LABELS[d.providers.gemini]).toMatch(/unverified|Pending|Not planned|Template ready/);
      expect(d.providers.gemini).not.toBe('template_ready');
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Provider workflow templates

const FILES = ['DAILY_DIGEST', 'JOB_DISCOVERY', 'EMAIL_TRIAGE', 'RECRUITER_INTEL', 'CALENDAR_INTEL'] as const;
const PROVIDERS = [['gemini', 'Gemini', 'GEMINI_SCHEDULED_ACTIONS.md'], ['chatgpt', 'ChatGPT', 'CHATGPT_SCHEDULED_TASKS.md']] as const;
const tpl = (provider: string, f: string) => read(`ai-hub/provider-workflows/${provider}/${f}.md`);

function shapeBlock(doc: string): string {
  const m = /\nRESULT SHAPE[^\n]*\n([\s\S]*?)\n\n(?:NOTES|RULES FOR THE PAYLOAD)/.exec(doc);
  if (!m) throw new Error('no RESULT SHAPE block');
  return m[1]!;
}
function exampleOf(doc: string): unknown {
  const filled = shapeBlock(doc).replace(/"([a-z_]+)":\s*"([^"]*)"/g, (_m, key: string, value: string) => {
    let v = value;
    if (value.includes('<')) {
      if (/(_at|observed_at|generated_at)$/.test(key)) v = '2026-10-15T14:00:00-05:00';
      else if (/url$/.test(key) || /ref$/.test(key) && key !== 'ref') v = 'https://example.com/page';
      else v = 'Example';
    }
    if (value.includes('|')) v = value.split('|')[0]!;
    if (value === 'YYYY-MM-DD') v = '2026-09-28';
    if (key === 'sender_domain') v = 'example.com';
    if (key === 'contact_email') v = 'someone@example.com';
    if (key === 'source_id') v = 'evt-example-1';
    if (key === 'external_run_id') v = v.replace(/YYYY-MM-DDTHH|YYYY-MM-DD/, '2026-10-15');
    if (key === 'generated_at' || key === 'observed_at') v = '2026-10-15T12:00:00Z';
    return `"${key}": "${v}"`;
  });
  return JSON.parse(filled);
}

describe.each(PROVIDERS)('%s workflow templates (AI-9)', (id, name, guide) => {
  it('the five templates exist and the operator guide exists', () => {
    expect(readdirSync(`ai-hub/provider-workflows/${id}`).sort()).toEqual(FILES.map((f) => `${f}.md`).sort().concat(id === 'chatgpt' ? ['plugin-template'] : []).sort());
    expect(existsSync(`ai-hub/provider-workflows/${guide}`)).toBe(true);
  });

  for (const f of ['JOB_DISCOVERY', 'EMAIL_TRIAGE', 'RECRUITER_INTEL', 'CALENDAR_INTEL'] as const) {
    it(`${f}: the example validates against the REAL validator with provider "${id}" and no dropped fields`, () => {
      const r = validateAiResult(exampleOf(tpl(id, f)));
      expect(r.errors, JSON.stringify(r.errors)).toEqual([]);
      expect(r.unknownFieldCount, JSON.stringify(r.warnings)).toBe(0);
      expect(r.data!.provider).toBe(id);
      expect(r.data!.schema_version).toBe('1.0');
    });
  }

  for (const f of FILES) {
    it(`${f}: the schema block is IDENTICAL to Claude's (only provider and run-id prefix differ)`, () => {
      const normalized = shapeBlock(tpl(id, f)).replaceAll(`"provider": "${id}"`, '"provider": "claude"').replaceAll(`"${id}-`, '"claude-');
      expect(normalized).toBe(shapeBlock(read(`ai-hub/provider-workflows/claude/${f}.md`)));
    });

    it(`${f}: safety language, approval handling and no foreign-provider leakage`, () => {
      const t = tpl(id, f);
      expect(t.toLowerCase()).toContain('untrusted');
      expect(t).toContain('jobquest_submit_ai_result');
      expect(t).toContain('APPROVAL AND FAILURE HANDLING');
      expect(t).toContain('NOT SUBMITTED');
      expect(t).toContain(`../${guide}`);
      expect(t).not.toMatch(/\bClaude\b(?! and|-style)/); // the header names Claude once, only to say the schema is shared
      expect(t).not.toMatch(/API key|OPENAI_API_KEY|GEMINI_API_KEY|api\.openai\.com|generativelanguage/i);
      expect(t).toMatch(/Never invent|never fabricate|Never fabricate|Never infer|NEVER fabricate/i);
      // proposals only: any template that mentions a controlled action says submitting does NOT execute it (human approval in JobQuest)
      if (/create_application|create_task|set_status/.test(t)) expect(t).toContain('Submitting a suggestion does NOT execute it');
    });
  }

  it('the operator guide states the write-approval truth and the human-approval architecture', () => {
    const g = read(`ai-hub/provider-workflows/${guide}`);
    expect(g).toMatch(/human approval (in|inside) JobQuest/i);
    expect(g).toMatch(/does \*\*not\*\* run schedules/);
    expect(g).not.toMatch(/AI-8 execution endpoints? (?:are|is) exposed/);
  });
});

describe('Gemini guide records the real current Google requirements and the STOP rule', () => {
  const g = read('ai-hub/provider-workflows/GEMINI_SCHEDULED_ACTIONS.md');
  it('official requirements, UI steps and the OAuth/DCR stop rule', () => {
    for (const phrase of ['personal** Google Account', 'United States', 'Keep Activity', 'Connected Apps', 'Add a custom app', 'Show more', 'Dynamic Client Registration', 'APPROVAL-GATED', 'STOP', 'support.google.com/gemini/answer/17209137']) expect(g).toContain(phrase);
    expect(g).toContain('GEMINI_UNATTENDED_JOBQUEST_PUSH');
    expect(g).toMatch(/does not implement OAuth or Dynamic Client Registration/);
  });
});

describe('ChatGPT plugin template (documented format, no secrets, no invented capability)', () => {
  const dir = 'ai-hub/provider-workflows/chatgpt/plugin-template';
  const plugin = JSON.parse(read(`${dir}/plugin.json`)) as Record<string, unknown>;
  const mcp = JSON.parse(read(`${dir}/mcp.json`)) as { mcpServers: Record<string, Record<string, unknown>> };
  it('plugin.json / mcp.json follow the documented layout', () => {
    expect(plugin).toMatchObject({ name: 'jobquest', version: '0.1.0' });
    expect(Object.keys(mcp.mcpServers)).toEqual(['jobquest']);
    const server = mcp.mcpServers.jobquest!;
    expect(server.type).toBe('streamable-http');
    expect(String(server.url)).toMatch(/^https:\/\/REPLACE-WITH-YOUR-JOBQUEST-ORIGIN\/api\/mcp$/);
    expect(server.extensions).toEqual({ 'com.openai': { auth: { type: 'api_key', headerScheme: 'bearer' } } });
  });
  it('contains no credential, no Production host and no OAuth/OpenAI-API machinery', () => {
    const all = [`${dir}/plugin.json`, `${dir}/mcp.json`, `${dir}/README.md`, `${dir}/skills/jobquest-ai-hub/SKILL.md`].map(read).join('\n');
    expect(all).not.toMatch(/jq_mcp_|sk-[A-Za-z0-9]{10,}|Bearer [A-Za-z0-9_-]{16,}|client_secret|OPENAI_API_KEY|eyJ[A-Za-z0-9_-]{20,}/);
    expect(all).not.toMatch(/vercel\.app|jobquest\.app/i);
  });
  it('SKILL.md has valid frontmatter, lists exactly the 13 tools and forbids claiming core changes', async () => {
    const skill = read(`${dir}/skills/jobquest-ai-hub/SKILL.md`);
    expect(skill).toMatch(/^---\nname: jobquest-ai-hub\ndescription: .+\n---\n/);
    const { MCP_TOOLS } = await import('../../apps/api/src/mcp/tools');
    for (const t of MCP_TOOLS) expect(skill, t.name).toContain(`\`${t.name}\``);
    expect(skill).toContain('provider` set to `chatgpt`');
    expect(skill).toMatch(/no tool to change applications, tasks, contacts or statuses/);
    expect(skill).toMatch(/untrusted data/);
  });
});

describe('MCP surface and provider identity (regression)', () => {
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
  it('still 13 tools: 12 read-only and exactly one write that stays a write; no core mutation tool', async () => {
    const { MCP_TOOLS } = await import('../../apps/api/src/mcp/tools');
    expect(MCP_TOOLS).toHaveLength(13);
    const writes = MCP_TOOLS.filter((t) => t.annotations.readOnlyHint !== true);
    expect(writes.map((t) => t.name)).toEqual(['jobquest_submit_ai_result']);
    expect(writes[0]!.annotations.readOnlyHint).toBe(false); // NOT weakened to satisfy a provider
    expect(writes[0]!.scope).toBe('ai:ingest');
    expect(MCP_TOOLS.map((t) => t.name).join()).not.toMatch(/create_application|update_application|set_status|create_task|complete_task|delete|execute/);
    for (const p of ['"claude"', '"gemini"', '"chatgpt"']) expect(writes[0]!.description).toContain(p);
  });
  it('canonical provider identities are unchanged: no subscription-tier providers', () => {
    expect([...AI_PROVIDERS]).toEqual(['claude', 'gemini', 'chatgpt', 'manual', 'system']);
    for (const bad of ['gemini-pro', 'chatgpt-plus', 'claude-pro', 'google', 'openai']) {
      expect(validateAiResult({ contract: 'jobquest.ai-result', schema_version: '1.0', provider: bad, workflow: 'daily_brief', findings: [] }).success, bad).toBe(false);
    }
  });
});

describe('no provider APIs, no new scheduler, no new credential tables, no migration', () => {
  it('no OpenAI / Google GenAI SDK or API-key variable in manifests or shipped code', () => {
    for (const m of ['package.json', 'apps/api/package.json', 'apps/web/package.json']) expect(read(m), m).not.toMatch(/"openai"|@openai|@google\/genai|@google\/generative-ai|google-auth-library|vertexai/i);
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}/${e.name}`] : []));
    for (const f of [...walk('apps/api/src'), ...walk('apps/web/src')]) expect(strip(read(f)), f).not.toMatch(/OPENAI_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|api\.openai\.com|generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com/);
  });
  it('JobQuest owns no schedule: no cron config, no scheduler dependency', () => {
    expect(read('vercel.json')).not.toMatch(/"crons"/);
    for (const m of ['package.json', 'apps/api/package.json']) expect(read(m), m).not.toMatch(/node-cron|node-schedule|bull|agenda|cron/i);
  });
  it('AI-9 added no provider-specific credential tables; AI-10 adds one provider-neutral OAuth migration (+ state-length hotfix); AI-11A adds one additive automation migration; AI-11D adds one additive discovery migration; AI-11E adds one additive recruiter migration; AI-11F adds one additive schedule-execution migration', () => {
    const migrations = readdirSync('supabase/migrations').sort();
    expect(migrations.slice(-5)).toEqual(['20261031100000_ai_hub_oauth_state_length.sql', '20261101100000_ai_hub_automation_foundation.sql', '20261102100000_ai_hub_fresh_job_discovery.sql', '20261103100000_ai_hub_recruiter_intelligence.sql', '20261104100000_ai_hub_schedule_execution.sql']);
    expect(read('supabase/migrations/20261031100000_ai_hub_oauth_state_length.sql')).not.toMatch(/create table/i);
    const sql = migrations.map((m) => read(`supabase/migrations/${m}`)).join('\n');
    expect(sql).not.toMatch(/gemini_tokens|chatgpt_tokens|openai_tokens/i);
    expect(sql).toMatch(/create table public\.oauth_clients/);
  });
});
