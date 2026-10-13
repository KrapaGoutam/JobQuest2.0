import { createHash, randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Actor, loadEnv, ORIGIN, serviceDb } from './harness';

const ready = loadEnv();
const local = /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.SUPABASE_URL ?? '');

describe.skipIf(!ready || !local)('AI-10 — OAuth 2.1 authorization and revocation (real DB)', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const alice = new Actor();
  const dave = new Actor();
  const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';
  const issuer = 'http://localhost';
  const resource = `${issuer}/api/mcp`;
  let app: typeof import('../../apps/api/src/app').app;
  let ws = '';
  let daveWs = '';
  let password = `Valid-AI10-${run}-start!`;
  let client: { id: string; client_id: string; client_secret: string };

  function actorHeaders(actor: Actor, json = true): Record<string, string> {
    const headers: Record<string, string> = { origin: ORIGIN, authorization: `Bearer ${actor.token}`, 'x-real-ip': '10.10.10.10' };
    if (json) headers['content-type'] = 'application/json';
    const cookie = [...actor.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers.cookie = cookie;
    const csrf = actor.jar.get('jq_csrf');
    if (csrf) headers['x-jq-csrf'] = csrf;
    return headers;
  }

  async function jsonCall(actor: Actor, path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
    const res = await app.request(`${issuer}/api${path}`, {
      method, headers: actorHeaders(actor, body !== undefined), body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { /* no body */ }
    return { status: res.status, json, headers: res.headers, text };
  }

  async function form(path: string, data: Record<string, string>, auth = client) {
    const body = new URLSearchParams(data);
    const res = await app.request(`${issuer}/api${path}`, {
      method: 'POST', headers: {
        'content-type': 'application/x-www-form-urlencoded', 'x-real-ip': '10.10.10.11',
        authorization: `Basic ${Buffer.from(`${auth.client_id}:${auth.client_secret}`).toString('base64')}`,
      }, body: body.toString(),
    });
    const text = await res.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { /* empty revocation response */ }
    return { status: res.status, json, headers: res.headers, text };
  }

  async function createClient(actor = alice, workspaceId = ws, provider: 'gemini' | 'chatgpt' = 'chatgpt') {
    const r = await jsonCall(actor, '/oauth/clients', {
      workspace_id: workspaceId, provider, name: `${provider}-${run}`,
      redirect_uris: [redirectUri], scopes: ['jobquest:read', 'ai:read'],
    });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    return { id: r.json.client.id as string, client_id: r.json.client.client_id as string, client_secret: r.json.client_secret as string };
  }

  function pkce() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }

  async function authorize(over: Partial<Record<string, string>> = {}) {
    const p = pkce();
    const state = randomBytes(16).toString('base64url');
    const params = new URLSearchParams({
      response_type: 'code', client_id: client.client_id, redirect_uri: redirectUri,
      resource, scope: 'jobquest:read ai:read', state,
      code_challenge: p.challenge, code_challenge_method: 'S256', ...over,
    });
    const start = await app.request(`${issuer}/api/oauth/authorize?${params}`, { headers: { 'x-real-ip': '10.10.10.12' } });
    return { start, state, verifier: p.verifier };
  }

  async function approve() {
    const a = await authorize();
    expect(a.start.status).toBe(302);
    const location = a.start.headers.get('location')!;
    const requestId = new URLSearchParams(new URL(location).hash.split('?')[1]).get('request_id')!;
    const detail = await jsonCall(alice, `/oauth/requests/${requestId}`);
    expect(detail.status).toBe(200);
    expect(detail.json.request).toMatchObject({ workspace_id: ws, redirect_uri: redirectUri, resource, scopes: ['jobquest:read', 'ai:read'] });
    expect((await jsonCall(dave, `/oauth/requests/${requestId}`)).status).toBe(404);
    const decision = await jsonCall(alice, `/oauth/requests/${requestId}/decision`, { approve: true });
    expect(decision.status).toBe(200);
    const callback = new URL(decision.json.redirect_to);
    expect(callback.searchParams.get('state')).toBe(a.state);
    expect(callback.searchParams.get('iss')).toBe(issuer);
    return { code: callback.searchParams.get('code')!, verifier: a.verifier };
  }

  async function exchange(code: string, verifier: string, auth = client) {
    return form('/oauth/token', {
      grant_type: 'authorization_code', code, redirect_uri: redirectUri,
      code_verifier: verifier, resource,
    }, auth);
  }

  async function oauthGrant() {
    const approved = await approve();
    const exchanged = await exchange(approved.code, approved.verifier);
    expect(exchanged.status, JSON.stringify(exchanged.json)).toBe(200);
    return exchanged.json as { access_token: string; refresh_token: string; scope: string };
  }

  async function mcp(token: string) {
    return app.request(`${issuer}/api/mcp`, { method: 'POST', headers: {
      'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}`, 'x-real-ip': '10.10.10.13',
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  }

  beforeAll(async () => {
    process.env.AI_HUB_ENABLED = 'true';
    process.env.APP_ORIGINS = `${process.env.APP_ORIGINS ?? ORIGIN},${issuer}`;
    process.env.OAUTH_AUTHORIZE_IP_MAX_PER_MINUTE = '500';
    process.env.OAUTH_TOKEN_IP_MAX_PER_MINUTE = '500';
    process.env.OAUTH_CLIENT_USER_MAX_PER_HOUR = '500';
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();
    app = (await import('../../apps/api/src/app')).app;
    expect((await alice.call('/auth/register', { username: `ai10_alice_${run}`, password })).status).toBe(201);
    expect((await dave.call('/auth/register', { username: `ai10_dave_${run}`, password: `Valid-AI10-${run}-dave!` })).status).toBe(201);
    ws = (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', alice.userId!).single()).data!.last_active_workspace_id;
    daveWs = (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', dave.userId!).single()).data!.last_active_workspace_id;
    client = await createClient();
  });

  it('AI10-01 · discovery, registration policy, secret storage and redirect/scope/resource validation fail closed', async () => {
    const prm = await app.request(`${issuer}/api/.well-known/oauth-protected-resource/api/mcp`);
    expect(prm.status).toBe(200);
    expect(await prm.json()).toMatchObject({ resource, authorization_servers: [issuer], scopes_supported: ['jobquest:read', 'ai:read', 'ai:ingest'] });
    const asm = await app.request(`${issuer}/api/.well-known/oauth-authorization-server`);
    const metadata = await asm.json() as any;
    expect(metadata.code_challenge_methods_supported).toEqual(['S256']);
    expect(metadata).not.toHaveProperty('registration_endpoint');
    expect(metadata.client_id_metadata_document_supported).toBe(false);

    const row = (await admin.from('oauth_clients').select('*').eq('id', client.id).single()).data!;
    expect(row.client_secret_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(client.client_secret);
    expect((await alice.db().from('oauth_clients').select('*')).error).not.toBeNull();
  });

  it('AI10-02 · malformed authorization requests, wrong redirect/resource/scope and missing PKCE are rejected', async () => {
    const bad: Array<Record<string, string>> = [
      { redirect_uri: 'https://evil.example/callback' }, { resource: `${issuer}/api/other` },
      { scope: 'jobquest:read jobquest:write' }, { code_challenge_method: 'plain' },
      { code_challenge: '' }, { state: 'x' }, { response_type: 'token' },
    ];
    for (const over of bad) expect((await authorize(over)).start.status, JSON.stringify(over)).toBe(400);
    const noClient = await authorize({ client_id: 'jq_oauth_dev_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
    expect(noClient.start.status).toBe(400);
    const cross = await jsonCall(alice, '/oauth/clients', {
      workspace_id: daveWs, provider: 'gemini', name: 'forged', redirect_uris: [redirectUri], scopes: ['ai:read'],
    });
    expect(cross.status).toBe(403);
  });

  it('AI10-03 · consent is account/workspace-bound; PKCE and one-use codes work; OAuth MCP stays read-only', async () => {
    const approved = await approve();
    const wrong = await exchange(approved.code, randomBytes(32).toString('base64url'));
    expect(wrong.status).toBe(400); // wrong verifier does not burn the code
    const otherClient = await createClient(alice, ws, 'gemini');
    expect((await exchange(approved.code, approved.verifier, otherClient)).status).toBe(400); // wrong client does not burn it
    const good = await exchange(approved.code, approved.verifier);
    expect(good.status).toBe(200);
    expect(good.json.scope).toBe('jobquest:read ai:read');
    expect((await exchange(approved.code, approved.verifier)).status).toBe(400); // reused code
    const mcpResponse = await mcp(good.json.access_token);
    expect(mcpResponse.status).toBe(200);
    const payload = await mcpResponse.json() as any;
    const tools = payload.result.tools.map((tool: { name: string }) => tool.name);
    expect(tools).toContain('jobquest_list_applications');
    expect(tools).not.toContain('jobquest_submit_ai_result');
    expect(tools.some((tool: string) => /create|update|delete|execute|status/i.test(tool))).toBe(false);
    const claims = JSON.parse(Buffer.from(good.json.access_token.split('.')[1], 'base64url').toString('utf8'));
    expect(claims).toMatchObject({ aud: resource, iss: issuer, workspace_id: ws, scope: 'jobquest:read ai:read' });
    expect(claims).not.toHaveProperty('role');
  });

  it('AI10-04 · refresh tokens rotate; reuse revokes the grant; standard revocation is immediate', async () => {
    const first = await oauthGrant();
    const rotated = await form('/oauth/token', { grant_type: 'refresh_token', refresh_token: first.refresh_token, resource });
    expect(rotated.status).toBe(200);
    expect(rotated.json.refresh_token).not.toBe(first.refresh_token);
    expect((await mcp(rotated.json.access_token)).status).toBe(200);
    expect((await form('/oauth/token', { grant_type: 'refresh_token', refresh_token: first.refresh_token, resource })).status).toBe(400);
    expect((await mcp(rotated.json.access_token)).status).toBe(401);

    const next = await oauthGrant();
    expect((await form('/oauth/revoke', { token: next.refresh_token, token_type_hint: 'refresh_token' })).status).toBe(200);
    expect((await mcp(next.access_token)).status).toBe(401);
  });

  it('AI10-05 · expired codes, membership suspension/removal, password change and logout-all invalidate OAuth', async () => {
    const exp = await approve();
    const latestCode = (await admin.from('oauth_authorization_codes').select('id').is('used_at', null).order('created_at', { ascending: false }).limit(1).single()).data!;
    await admin.from('oauth_authorization_codes').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', latestCode.id);
    expect((await exchange(exp.code, exp.verifier)).status).toBe(400);

    // The last-manager guard blocks suspending/removing the only manager, so add a second one first.
    expect((await admin.from('workspace_members').insert({ workspace_id: ws, user_id: dave.userId!, role: 'MANAGER', status: 'ACTIVE' })).error).toBeNull();
    const suspended = await oauthGrant();
    expect((await admin.from('workspace_members').update({ status: 'SUSPENDED' }).eq('workspace_id', ws).eq('user_id', alice.userId!)).error).toBeNull();
    expect((await mcp(suspended.access_token)).status).toBe(401);
    expect((await admin.from('workspace_members').update({ status: 'ACTIVE' }).eq('workspace_id', ws).eq('user_id', alice.userId!)).error).toBeNull();
    expect((await mcp(suspended.access_token)).status).toBe(200);
    expect((await admin.from('workspace_members').delete().eq('workspace_id', ws).eq('user_id', alice.userId!)).error).toBeNull();
    expect((await mcp(suspended.access_token)).status).toBe(401);
    expect((await admin.from('workspace_members').insert({ workspace_id: ws, user_id: alice.userId!, role: 'MANAGER', status: 'ACTIVE' })).error).toBeNull();
    expect((await admin.from('workspace_members').delete().eq('workspace_id', ws).eq('user_id', dave.userId!)).error).toBeNull();

    const passwordGrant = await oauthGrant();
    const nextPassword = `Valid-AI10-${run}-changed!`;
    const changed = await alice.call('/auth/password', { current_password: password, new_password: nextPassword });
    expect(changed.status).toBe(200);
    password = nextPassword;
    expect((await mcp(passwordGrant.access_token)).status).toBe(401);

    const logoutGrant = await oauthGrant();
    expect((await alice.call('/auth/logout', { scope: 'global' })).status).toBe(200);
    expect((await mcp(logoutGrant.access_token)).status).toBe(401);
  });

  it('AI10-06 · client authentication, scope ceiling, CSRF, forged/expired tokens and the 401 challenge fail closed', async () => {
    expect((await alice.call('/auth/login', { username: `ai10_alice_${run}`, password })).status).toBe(200); // test 05 ended with logout-all
    // Excess scope beyond the client registration is rejected before any consent UI.
    expect((await authorize({ scope: 'jobquest:read ai:read ai:ingest' })).start.status).toBe(400);

    // Wrong or malformed client secret never reaches the exchange.
    const approved = await approve();
    const badSecret = { ...client, client_secret: client.client_secret.slice(0, -1) + (client.client_secret.endsWith('A') ? 'B' : 'A') };
    expect((await exchange(approved.code, approved.verifier, badSecret)).status).toBe(400); // well-formed but wrong secret is indistinguishable from a bad code (no credential oracle)
    expect((await exchange(approved.code, approved.verifier, { ...client, client_secret: 'nope' })).status).toBe(401);
    expect((await form('/oauth/token', { grant_type: 'authorization_code', code: approved.code, redirect_uri: redirectUri, code_verifier: approved.verifier, resource: `${issuer}/api/other` })).status).toBe(400);
    expect((await form('/oauth/token', { grant_type: 'password', username: 'x', password: 'y', resource })).status).toBe(400);
    const redeemed = await exchange(approved.code, approved.verifier);
    expect(redeemed.status).toBe(200);

    // Refresh requires the same client; a different client's secret can neither rotate nor burn the token.
    const other = await createClient(alice, ws, 'gemini');
    expect((await form('/oauth/token', { grant_type: 'refresh_token', refresh_token: redeemed.json.refresh_token, resource }, other)).status).toBe(400);
    expect((await form('/oauth/token', { grant_type: 'refresh_token', refresh_token: redeemed.json.refresh_token, resource })).status).toBe(200);

    // Consent decisions are CSRF-protected.
    const a = await authorize();
    const requestId = new URLSearchParams(new URL(a.start.headers.get('location')!).hash.split('?')[1]).get('request_id')!;
    const noCsrf = { ...actorHeaders(alice) }; delete noCsrf['x-jq-csrf'];
    const csrfRes = await app.request(`${issuer}/api/oauth/requests/${requestId}/decision`, { method: 'POST', headers: noCsrf, body: JSON.stringify({ approve: true }) });
    expect(csrfRes.status).toBe(403);
    // A denial redirects with access_denied and issues no code.
    const denied = await jsonCall(alice, `/oauth/requests/${requestId}/decision`, { approve: false });
    expect(new URL(denied.json.redirect_to).searchParams.get('error')).toBe('access_denied');
    expect(new URL(denied.json.redirect_to).searchParams.get('code')).toBeNull();
    expect((await jsonCall(alice, `/oauth/requests/${requestId}/decision`, { approve: true })).status).toBe(404); // single decision

    // Forged, wrong-audience, expired and malformed bearer tokens are rejected with a discoverable challenge.
    const { signingMaterial, ACCESS_ALG } = await import('../../apps/api/src/lib/tokens');
    const { SignJWT } = await import('jose');
    const { kid, privateKey } = await signingMaterial();
    const claims = { session_id: alice.userId!, workspace_id: ws, grant_id: alice.userId!, client_id: client.client_id, scope: 'jobquest:read' };
    const forge = (aud: string, exp: number) => new SignJWT(claims).setProtectedHeader({ alg: ACCESS_ALG, kid, typ: 'at+jwt' })
      .setSubject(alice.userId!).setIssuer(issuer).setAudience(aud).setIssuedAt(exp - 900).setExpirationTime(exp).sign(privateKey);
    const now = Math.floor(Date.now() / 1000);
    for (const token of [await forge(resource, now - 60), await forge(`${issuer}/api/other`, now + 600), await forge(resource, now + 600), 'not-a-token', 'a.b.c']) {
      const res = await mcp(token);
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toContain(`resource_metadata="${issuer}/.well-known/oauth-protected-resource/api/mcp"`);
    }

    // Server-owned tables expose no client RPC surface.
    const misuse = await alice.db().rpc('rpc_oauth_resolve_grant', { p_grant_id: alice.userId, p_client_id: client.client_id });
    expect(misuse.error).not.toBeNull();
    expect((await alice.db().from('oauth_grants').select('*')).error).not.toBeNull();

    // A client that omits RFC 8707 `resource` is bound to the single JobQuest MCP resource; a wrong explicit value is not.
    const p = pkce();
    const noResource = new URLSearchParams({
      response_type: 'code', client_id: client.client_id, redirect_uri: redirectUri, scope: 'jobquest:read',
      state: randomBytes(16).toString('base64url'), code_challenge: p.challenge, code_challenge_method: 'S256',
    });
    const start = await app.request(`${issuer}/api/oauth/authorize?${noResource}`, { headers: { 'x-real-ip': '10.10.10.12' } });
    expect(start.status).toBe(302);
    const rid = new URLSearchParams(new URL(start.headers.get('location')!).hash.split('?')[1]).get('request_id')!;
    const grantedNoResource = await jsonCall(alice, `/oauth/requests/${rid}/decision`, { approve: true });
    const noResCode = new URL(grantedNoResource.json.redirect_to).searchParams.get('code')!;
    const tokenNoResource = await form('/oauth/token', { grant_type: 'authorization_code', code: noResCode, redirect_uri: redirectUri, code_verifier: p.verifier });
    expect(tokenNoResource.status, JSON.stringify(tokenNoResource.json)).toBe(200);
    expect((await mcp(tokenNoResource.json.access_token)).status).toBe(200);

    // Explicit client revocation kills access and refresh immediately; the secret is never listed.
    const live = await oauthGrant();
    const listed = await jsonCall(alice, `/oauth/clients?workspace_id=${ws}`);
    expect(listed.status).toBe(200);
    expect(listed.text).not.toContain(client.client_secret);
    expect((await jsonCall(alice, `/oauth/clients/${client.id}/revoke`, {})).json.revoked).toBe(true);
    expect((await mcp(live.access_token)).status).toBe(401);
    expect((await form('/oauth/token', { grant_type: 'refresh_token', refresh_token: live.refresh_token, resource })).status).toBe(400);
  });

  it('AI10-07 · Gemini-size state (up to 2048) round-trips exactly; state bounds, PKCE, redirect, resource and scope stay enforced', async () => {
    client = await createClient(); // AI10-06 revoked the shared client
    const stateOf = (n: number) => randomBytes(n).toString('base64url').slice(0, n);
    const geminiState = stateOf(1182); // the length Gemini sent in Production
    const maxState = stateOf(2048);
    const consoleSpies = (['log', 'info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m));
    try {
      for (const state of ['', 'short77', stateOf(2049)]) {
        expect((await authorize({ state })).start.status, `state length ${state.length}`).toBe(400);
      }
      const strict: Array<Record<string, string>> = [
        { code_challenge_method: 'plain' }, { code_challenge: '' }, { redirect_uri: 'https://evil.example/callback' },
        { resource: `${issuer}/api/other` }, { scope: 'jobquest:read ai:ingest' }, { scope: 'jobquest:write' },
      ];
      for (const over of strict) {
        expect((await authorize({ ...over, state: geminiState })).start.status, Object.keys(over).join()).toBe(400);
      }

      for (const state of [randomBytes(16).toString('base64url'), geminiState, maxState]) {
        const a = await authorize({ state });
        expect(a.start.status, `state length ${state.length}`).toBe(302);
        const requestId = new URLSearchParams(new URL(a.start.headers.get('location')!).hash.split('?')[1]).get('request_id')!;
        const row = (await admin.from('oauth_authorization_requests').select('state').eq('id', requestId).single()).data!;
        expect(row.state).toBe(state); // persisted unchanged
        const detail = await jsonCall(alice, `/oauth/requests/${requestId}`);
        expect(detail.status).toBe(200);
        expect(detail.text).not.toContain(state); // never shown on the consent screen
        const decision = await jsonCall(alice, `/oauth/requests/${requestId}/decision`, { approve: true });
        expect(decision.status).toBe(200);
        expect(new URL(decision.json.redirect_to).searchParams.get('state')).toBe(state); // returned byte-for-byte
      }
      for (const spy of consoleSpies) expect(JSON.stringify(spy.mock.calls)).not.toContain(geminiState);
    } finally {
      for (const spy of consoleSpies) spy.mockRestore();
    }
  });
});
