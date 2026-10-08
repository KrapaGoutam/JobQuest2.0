import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// AI-3 (no database): connector-token primitives, the static security boundary of the
// MCP layer, the tool allow-list and the migration contract.
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : [p];
});
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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

describe('AI-3 connector token primitives', () => {
  it('mints high-entropy jq_mcp secrets, exposes only a short prefix, stores a domain-separated HMAC', async () => {
    const m = await import('../../apps/api/src/lib/aiConnectorTokens');
    const e = await import('../../apps/api/src/lib/extensionTokens');
    const a = m.mintConnectorSecret();
    const b = m.mintConnectorSecret();
    expect(a.token).toMatch(/^jq_mcp_dev_[A-Za-z0-9]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.prefix).toBe(a.token.slice(0, 15));
    expect(a.prefix.length).toBeLessThan(a.token.length / 2);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(m.connectorTokenHash(a.token)).toBe(a.hash);
    expect(a.hash).not.toBe(e.extensionTokenHash(a.token)); // same pepper, different domain
    expect(m.isConnectorToken(a.token)).toBe(true);
    expect(m.isConnectorToken(a.token + 'x')).toBe(false);
    expect(m.isConnectorToken('jqx_dev_' + 'A'.repeat(43))).toBe(false);
    expect(m.isConnectorToken('')).toBe(false);
    expect(e.isExtensionToken(a.token)).toBe(false); // credentials are not interchangeable
  });

  it('exposes exactly the three narrow scopes: no write, admin or wildcard scope exists', async () => {
    const m = await import('../../apps/api/src/lib/aiConnectorTokens');
    expect([...m.CONNECTOR_SCOPES]).toEqual(['jobquest:read', 'ai:read', 'ai:ingest']);
    expect([...m.DEFAULT_CONNECTOR_SCOPES]).toEqual(['jobquest:read', 'ai:read']); // ingest is opt-in
    expect([...m.CONNECTOR_SCOPES].join()).not.toMatch(/write|admin|\*/);
    expect([...m.CONNECTOR_EXPIRY_DAYS]).toEqual([7, 30, 90]);
  });

  it('public metadata never contains secrets, hashes or the bound session', async () => {
    const m = await import('../../apps/api/src/lib/aiConnectorTokens');
    const pub = m.publicConnector({
      id: 'i', workspace_id: 'w', user_id: 'u', name: 'n', token_prefix: 'jq_mcp_dev_abcd', scopes: ['ai:read'],
      created_at: '2026-10-01T00:00:00Z', expires_at: '2999-01-01T00:00:00Z', last_used_at: null, revoked_at: null, revoked_reason: null,
      // simulate an over-fetched row
      ...({ token_hash: 'h'.repeat(64), session_id: 's' } as object),
    } as never);
    expect(Object.keys(pub)).not.toEqual(expect.arrayContaining(['token_hash']));
    expect(JSON.stringify(pub)).not.toMatch(/token_hash|session_id|hhhh/);
    expect(pub.status).toBe('ACTIVE');
    expect(m.connectorStatus({ revoked_at: 'x', expires_at: '2999-01-01T00:00:00Z' })).toBe('REVOKED');
    expect(m.connectorStatus({ revoked_at: null, expires_at: '2000-01-01T00:00:00Z' })).toBe('EXPIRED');
  });

  it('bearer parsing is strict: scheme required, single token, no embedded whitespace', async () => {
    const { bearerOf } = await import('../../apps/api/src/mcp/auth');
    const ctx = (authorization?: string) => ({ req: { header: (n: string) => (n.toLowerCase() === 'authorization' ? authorization : undefined) } }) as never;
    expect(bearerOf(ctx())).toEqual({ present: false });
    expect(bearerOf(ctx('Bearer abc'))).toEqual({ present: true, token: 'abc' });
    expect(bearerOf(ctx('bearer abc'))).toEqual({ present: true, token: 'abc' });
    for (const bad of ['Basic abc', 'Bearer', 'Bearer ', 'Bearer a b', 'abc']) expect(bearerOf(ctx(bad)).token).toBeUndefined();
  });
});

describe('AI-3 MCP static security boundary', () => {
  const mcpSources = () => files('apps/api/src/mcp').map((p) => ({ p: p.replace(/\\/g, '/'), src: strip(read(p)) }));

  it('MCP code never uses the service-role client, raw DB access, SQL or table writes', () => {
    for (const { p, src } of mcpSources()) {
      expect(src, p).not.toMatch(/\badmin\(\)|userClient|createClient|\.rpc\(|\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(|SUPABASE_SECRET_KEY/);
    }
    const routeSrc = strip(read('apps/api/src/routes/mcp.ts'));
    expect(routeSrc).not.toMatch(/admin\(\)|\.rpc\(|\.from\(/);
  });

  it('tool handlers reach data only through the approved services (reads: RLS services; write: ingestAiResult)', () => {
    const src = strip(read('apps/api/src/mcp/tools.ts'));
    const imports = [...src.matchAll(/from '(\.\.?\/[^']+)'/g)].map((m) => m[1]).sort();
    expect(imports).toEqual([
      '../lib/tokens', '../services/aiIntegrationService', '../services/aiReadService', '../services/applicationReadService', './principal', './schemas',
    ].sort());
    expect(src).toContain("actorKind: 'SERVICE_INGEST'");
    expect(src).toContain('ingestAiResult(');
  });

  it('the registry is a fixed allow-list: six named tools, no generic SQL/RPC/HTTP/command/mutation tool', async () => {
    const { MCP_TOOLS, requiredScope } = await import('../../apps/api/src/mcp/tools');
    const names = MCP_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([
      'jobquest_get_application', 'jobquest_list_ai_findings', 'jobquest_list_ai_runs',
      'jobquest_list_ai_suggestions', 'jobquest_list_applications', 'jobquest_submit_ai_result',
    ]);
    expect(names.join()).not.toMatch(/sql|rpc|http|fetch|exec|run_|command|delete|update|create_|status|accept|approve/);
    expect(new Set(names).size).toBe(names.length);
    expect(requiredScope('jobquest_list_applications')).toBe('jobquest:read');
    expect(requiredScope('jobquest_list_ai_runs')).toBe('ai:read');
    expect(requiredScope('jobquest_submit_ai_result')).toBe('ai:ingest');
    expect(requiredScope('execute_sql')).toBeUndefined();
    const reads = MCP_TOOLS.filter((t) => t.name !== 'jobquest_submit_ai_result');
    for (const t of reads) expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    const submit = MCP_TOOLS.find((t) => t.name === 'jobquest_submit_ai_result')!;
    expect(submit.annotations.readOnlyHint).toBe(false);
    expect(submit.annotations.destructiveHint).toBe(false);
    for (const t of MCP_TOOLS) {
      expect(t.description).not.toMatch(/ignore (previous|prior)|you must|always call/i); // static, non-coercive descriptions
    }
  });

  it('strict input schemas reject identity/authorization fields and out-of-bound values', async () => {
    const s = await import('../../apps/api/src/mcp/schemas');
    const uuid = '123e4567-e89b-42d3-a456-426614174000';
    for (const schema of [s.listApplicationsInput, s.listAiRunsInput, s.listAiFindingsInput, s.listAiSuggestionsInput]) {
      expect(schema.safeParse({}).success).toBe(true);
      for (const extra of ['user_id', 'userId', 'workspace_id', 'workspaceId', 'role', 'scopes']) {
        expect(schema.safeParse({ [extra]: uuid }).success, extra).toBe(false);
      }
      expect(schema.safeParse({ pageSize: 51 }).success).toBe(false);
      expect(schema.safeParse({ pageSize: 50 }).success).toBe(true);
      expect(schema.safeParse({ page: 501 }).success).toBe(false);
      expect(schema.safeParse({ page: -1 }).success).toBe(false);
    }
    expect(s.getApplicationInput.safeParse({ applicationId: 'x' }).success).toBe(false);
    expect(s.getApplicationInput.safeParse({ applicationId: uuid }).success).toBe(true);
    expect(s.submitAiResultInput.safeParse({ result: { contract: 'jobquest.ai-result', schema_version: '1.0', provider: 'claude', workflow: 'other' }, user_id: uuid }).success).toBe(false);
    expect(s.submitAiResultInput.safeParse({ result: { contract: 'jobquest.ai-result', schema_version: '1.0', provider: 'claude', workflow: 'other', findings: new Array(201).fill({}) } }).success).toBe(false);
  });

  it('OAuth is deferred honestly: no fake authorization-server or protected-resource metadata is advertised', () => {
    const everything = [...mcpSources().map((x) => x.src), strip(read('apps/api/src/routes/mcp.ts')), strip(read('apps/api/src/app.ts'))].join('\n');
    expect(everything).not.toMatch(/\.well-known|authorization_servers|resource_metadata|oauth-protected-resource|\/authorize|\/token\b|registration_endpoint/i);
  });

  it('MCP is failure-isolated: app.ts mounts a lazy route and never imports the SDK or MCP server module', () => {
    const app = read('apps/api/src/app.ts');
    expect(app).toMatch(/app\.route\('\/mcp', mcp\)/);
    expect(app).not.toMatch(/modelcontextprotocol|mcp\/server/);
    expect(read('apps/api/src/routes/mcp.ts')).toContain("import('../mcp/server')");
    expect(read('apps/api/src/routes/mcp.ts')).not.toMatch(/^import .*modelcontextprotocol/m);
    // The same-origin CSRF layer exempts ONLY the exact MCP path, and MCP validates Origin itself.
    const sec = read('apps/api/src/lib/security.ts');
    expect(sec).toContain("c.req.path === '/api/mcp'");
    expect(strip(read('apps/api/src/mcp/server.ts'))).toContain('allowedOrigins()');
  });

  it('the kill switch is checked first, centrally, with the server flag only', () => {
    const src = strip(read('apps/api/src/mcp/server.ts'));
    expect(src.indexOf('isAiHubServerEnabled()')).toBeGreaterThan(-1);
    expect(src.indexOf('isAiHubServerEnabled()')).toBeLessThan(src.indexOf('authenticateMcp('));
    expect(src).not.toMatch(/VITE_AI_HUB_ENABLED/);
  });

  it('server identity is provider-neutral and the version tracks apps/api/package.json', async () => {
    const { MCP_SERVER_NAME, MCP_SERVER_VERSION } = await import('../../apps/api/src/mcp/server');
    expect(MCP_SERVER_NAME).toBe('jobquest-ai-hub');
    expect(MCP_SERVER_NAME).not.toMatch(/claude|gemini|chatgpt|openai/i);
    expect(MCP_SERVER_VERSION).toBe(JSON.parse(read('apps/api/package.json')).version);
  });

  it('the scope pre-check, body bound, request timeout and POST-only transport are wired', () => {
    const src = strip(read('apps/api/src/mcp/server.ts'));
    expect(src).toContain('missingScope(');
    expect(src).toContain('MCP_MAX_BODY_BYTES');
    expect(src).toContain('MCP_REQUEST_TIMEOUT_MS');
    expect(src).toContain("c.req.method !== 'POST'");
    expect(src).toContain('sessionIdGenerator: undefined'); // stateless
    expect(src).toContain('enableJsonResponse: true');
    expect(src).toContain("capabilities: { tools: {} }");
    expect(src).not.toMatch(/Access-Control-Allow-Origin/i);
  });
});

describe('AI-3 migration contract (20261026100000_ai_hub_mcp_auth.sql)', () => {
  const sql = read('supabase/migrations/20261026100000_ai_hub_mcp_auth.sql');

  it('stores a hash only, with narrow scope/expiry constraints and no raw-token column', () => {
    expect(sql).toMatch(/token_hash\s+varchar\(64\) not null unique/);
    expect(sql).not.toMatch(/\btoken\s+(varchar|text)/);
    expect(sql).toMatch(/scopes <@ array\['jobquest:read', 'ai:read', 'ai:ingest'\]/);
    expect(sql).not.toMatch(/jobquest:write|'admin'|'\*'/);
    expect(sql).toMatch(/expires_at <= created_at \+ interval '90 days'/);
  });

  it('keeps hash and session out of client reach and the privileged RPCs service_role-only', () => {
    expect(sql).toMatch(/revoke all on public\.ai_connector_tokens from public, anon, authenticated/);
    const grant = sql.match(/grant select \(([\s\S]*?)\) on public\.ai_connector_tokens to authenticated/)![1]!;
    expect(grant).not.toMatch(/token_hash|session_id/);
    for (const fn of ['rpc_ai_create_connector_token', 'rpc_ai_revoke_connector_token', 'rpc_ai_resolve_connector_token', 'rpc_ai_touch_connector_token']) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`));
      expect(sql).not.toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to (anon|authenticated|public)`));
    }
    expect(sql).toMatch(/create policy ai_connector_tokens_select_own[\s\S]*user_id = \(select auth\.uid\(\)\)/);
  });

  it('every security-definer function pins search_path and the lifecycle is audited with AI_ actions', () => {
    const defs = sql.match(/security definer/g)!.length;
    expect(sql.match(/set search_path = ''/g)!.length).toBe(defs);
    expect(sql).toContain("'AI_CONNECTOR_TOKEN_CREATED'");
    expect(sql).toContain("'AI_CONNECTOR_TOKEN_REVOKED'");
    expect(sql).toMatch(/revoke[\s\S]*update public\.auth_sessions[\s\S]*revoked_reason = 'ADMIN'/i);
  });
});
