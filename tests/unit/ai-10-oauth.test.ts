import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPair, exportJWK } from 'jose';

beforeAll(async () => {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk = await exportJWK(privateKey); jwk.kid = 'ai10-unit';
  process.env.JQ_JWT_PRIVATE_JWK = JSON.stringify(jwk);
  process.env.JQ_JWT_ISSUER = 'jobquest-api';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-key-at-least-20-characters';
  process.env.SUPABASE_SECRET_KEY = 'secret-key-at-least-20-characters';
  process.env.EXTENSION_TOKEN_PEPPER = 'unit-test-oauth-pepper-at-least-32-bytes';
  process.env.EXTENSION_TOKEN_ENV = 'dev';
  process.env.APP_ORIGINS = 'https://jobquest.example';
  const { resetEnvCache } = await import('../../apps/api/src/env');
  const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
  resetEnvCache(); resetSigningMaterial();
});

describe('AI-10 OAuth 2.1 primitives', () => {
  it('uses one provider-neutral client format, HMAC-only secrets, and exact safe redirect validation', async () => {
    const oauth = await import('../../apps/api/src/lib/oauth');
    const client = oauth.mintOAuthClient();
    expect(client.clientId).toMatch(/^jq_oauth_dev_[A-Za-z0-9]{32}$/);
    expect(client.secret).toMatch(/^jq_oauth_secret_dev_[A-Za-z0-9]{43}$/);
    expect(client.secretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(client.secretHash).not.toContain(client.secret);
    expect(oauth.validRedirectUri('https://chatgpt.com/connector_platform_oauth_redirect')).toBe(true);
    expect(oauth.validRedirectUri('https://example.com/cb#fragment')).toBe(false);
    expect(oauth.validRedirectUri('http://example.com/cb')).toBe(false);
    expect(oauth.validRedirectUri('javascript:alert(1)')).toBe(false);
  });

  it('accepts only the three semantic MCP scopes and never a core-write scope', async () => {
    const { normalizeScopes, OAUTH_SCOPES } = await import('../../apps/api/src/lib/oauth');
    expect(OAUTH_SCOPES).toEqual(['jobquest:read', 'ai:read', 'ai:ingest']);
    expect(normalizeScopes('ai:read jobquest:read ai:read')).toEqual(['ai:read', 'jobquest:read']);
    for (const bad of ['jobquest:write', 'ai:write', 'admin', '*', 'jobquest:read jobquest:write', '']) expect(normalizeScopes(bad)).toBeNull();
  });

  it('bounds OAuth state at 8..2048 characters, matching the database column', async () => {
    const { OAUTH_STATE_MIN_LENGTH, OAUTH_STATE_MAX_LENGTH } = await import('../../apps/api/src/lib/oauth');
    expect([OAUTH_STATE_MIN_LENGTH, OAUTH_STATE_MAX_LENGTH]).toEqual([8, 2048]);
    const sql = readFileSync(new URL('../../supabase/migrations/20261031100000_ai_hub_oauth_state_length.sql', import.meta.url), 'utf8');
    expect(sql).toContain(`alter column state type varchar(${OAUTH_STATE_MAX_LENGTH})`);
  });

  it('mints audience-bound at+jwt access tokens distinct from browser access tokens', async () => {
    const oauth = await import('../../apps/api/src/lib/oauth');
    const principal = {
      grantId: '11111111-1111-4111-8111-111111111111', userId: '22222222-2222-4222-8222-222222222222',
      workspaceId: '33333333-3333-4333-8333-333333333333', sessionId: '44444444-4444-4444-8444-444444444444',
      scopes: ['jobquest:read' as const, 'ai:read' as const], clientId: 'jq_oauth_dev_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345',
      issuer: 'https://jobquest.example', provider: 'chatgpt' as const,
    };
    const resource = 'https://jobquest.example/api/mcp';
    const token = await oauth.mintOAuthAccessToken(principal, resource);
    expect(await oauth.verifyOAuthAccessToken(token.accessToken, principal.issuer, resource)).toMatchObject({
      sub: principal.userId, workspace_id: principal.workspaceId, grant_id: principal.grantId, scope: 'jobquest:read ai:read',
    });
    expect(await oauth.verifyOAuthAccessToken(token.accessToken, principal.issuer, 'https://jobquest.example/api/other')).toBeNull();
    const { verifyAccessToken } = await import('../../apps/api/src/lib/tokens');
    expect(await verifyAccessToken(token.accessToken)).toBeNull();
  });

  it('publishes OAuth/MCP discovery without DCR or CIMD and with PKCE S256', async () => {
    const { authorizationServerMetadata, protectedResourceMetadata } = await import('../../apps/api/src/routes/oauth');
    const issuer = 'https://jobquest.example';
    const as = authorizationServerMetadata(issuer) as Record<string, unknown>;
    expect(as.code_challenge_methods_supported).toEqual(['S256']);
    expect(as.token_endpoint_auth_methods_supported).toEqual(['client_secret_post', 'client_secret_basic']);
    expect(as).not.toHaveProperty('registration_endpoint');
    expect(as.client_id_metadata_document_supported).toBe(false);
    expect(protectedResourceMetadata(issuer)).toMatchObject({ resource: `${issuer}/api/mcp`, authorization_servers: [issuer] });
  });
});
