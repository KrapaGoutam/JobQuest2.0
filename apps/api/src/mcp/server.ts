// AI-3: remote MCP over Streamable HTTP, mounted at /api/mcp (see routes/mcp.ts).
//
// STATELESS by design (Vercel/serverless): every request builds its own McpServer
// + transport (no session id, no in-memory sessions, no SSE streams, JSON
// responses). Authentication, scope and rate limits are resolved from the database
// per request, so nothing depends on which function instance serves it.
// The official SDK owns JSON-RPC validation, initialize/version negotiation,
// tools/list|call framing and protocol errors. This file adds only the
// JobQuest boundary: kill switch, Origin check, bearer auth, body bounds, scope
// pre-check (HTTP 403), request timeout and safe structured logging.
import { randomUUID } from 'node:crypto';
import type { Context } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { allowedOrigins, env } from '../env';
import { isAiHubServerEnabled } from '../lib/aiHubConfig';
import { authenticateMcp, type McpAuthFailure } from './auth';
import { hasMcpScope, type McpPrincipal } from './principal';
import { createToolContext, registerTools, requiredScope } from './tools';

/** Keep in sync with apps/api/package.json (asserted by a unit test). */
export const MCP_SERVER_NAME = 'jobquest-ai-hub';
export const MCP_SERVER_VERSION = '0.1.0';

const log = (entry: Record<string, unknown>) => console.info(JSON.stringify(entry));

type ApiStatus = 400 | 401 | 403 | 405 | 413 | 415 | 429 | 500 | 503 | 504;
const fail = (c: Context, status: ApiStatus, code: string, message: string, headers: Record<string, string> = {}) =>
  c.json({ error: { code, message } }, status, headers);

const AUTH_MESSAGES: Record<McpAuthFailure, string> = {
  MISSING: 'Authentication required.',
  MALFORMED: 'Authentication required.',
  INVALID: 'Invalid or expired credentials.',
  RATE_LIMITED: 'Too many requests.',
  UNAVAILABLE: 'Authentication is temporarily unavailable.',
};

/** Per-request server: only the tools this principal's scopes permit are registered. */
export function buildMcpServer(principal: McpPrincipal, correlationId: string): { server: McpServer; tools: string[] } {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { capabilities: { tools: {} } }, // TOOLS only: no resources, prompts, sampling, elicitation or subscriptions
  );
  const tools = registerTools(server, createToolContext(principal, correlationId), log);
  return { server, tools };
}

function insufficientScope(c: Context, scope: string) {
  return c.json(
    { jsonrpc: '2.0', error: { code: -32001, message: `Insufficient scope: ${scope} required.` }, id: null },
    403,
    { 'WWW-Authenticate': `Bearer realm="jobquest-mcp", error="insufficient_scope", scope="${scope}"` },
  );
}

/** First tool call whose required scope the principal lacks (HTTP-level 403 before any tool code runs). */
function missingScope(body: unknown, principal: McpPrincipal): string | null {
  for (const message of Array.isArray(body) ? body : [body]) {
    if (typeof message !== 'object' || message === null) continue;
    const m = message as { method?: unknown; params?: { name?: unknown } };
    if (m.method !== 'tools/call' || typeof m.params?.name !== 'string') continue;
    const need = requiredScope(m.params.name);
    if (need && !hasMcpScope(principal, need)) return need;
  }
  return null;
}

export async function handleMcpRequest(c: Context): Promise<Response> {
  const started = Date.now();
  const correlationId = randomUUID();
  const done = (event: Record<string, unknown>) =>
    log({ event: 'mcp.request', correlationId, elapsedMs: Date.now() - started, ...event });
  try {
    // 1. Server kill switch, before any parsing or database access. Fails closed.
    if (!isAiHubServerEnabled()) {
      done({ outcome: 'ai_hub_disabled' });
      return fail(c, 503, 'AI_HUB_DISABLED', 'AI Hub is disabled on this server.');
    }

    // 2. Browser-originated requests are never legitimate MCP traffic: reject any
    //    Origin that is not one of JobQuest's own origins (DNS-rebinding / CSRF defence).
    const origin = c.req.header('origin');
    if (origin && !allowedOrigins().has(origin)) {
      done({ outcome: 'origin_rejected' });
      return fail(c, 403, 'ORIGIN_REJECTED', 'Request origin not allowed.');
    }

    // 3. Authentication precedes everything else (including method handling).
    const auth = await authenticateMcp(c);
    if (!auth.ok) {
      done({ outcome: `auth_${auth.reason.toLowerCase()}` });
      if (auth.reason === 'RATE_LIMITED') return fail(c, 429, 'RATE_LIMITED', AUTH_MESSAGES.RATE_LIMITED, { 'Retry-After': String(auth.retryAfterSeconds ?? 60) });
      if (auth.reason === 'UNAVAILABLE') return fail(c, 503, 'AUTH_UNAVAILABLE', AUTH_MESSAGES.UNAVAILABLE);
      return fail(c, 401, 'UNAUTHENTICATED', AUTH_MESSAGES[auth.reason], { 'WWW-Authenticate': 'Bearer realm="jobquest-mcp"' });
    }
    const { principal } = auth;
    const who = {
      userId: principal.userId, workspaceId: principal.workspaceId,
      credentialType: principal.credentialType, credentialId: principal.credentialId, scopes: principal.scopes,
    };

    // 4. Stateless Streamable HTTP: JSON-RPC over POST only. No server-initiated
    //    stream (GET) and no session termination (DELETE) exist to support.
    if (c.req.method !== 'POST') {
      done({ ...who, outcome: 'method_not_allowed', method: c.req.method });
      return fail(c, 405, 'METHOD_NOT_ALLOWED', 'Use POST.', { Allow: 'POST' });
    }
    if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      done({ ...who, outcome: 'unsupported_media_type' });
      return fail(c, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
    }

    // 5. Bounded body: declared length first, then actual bytes.
    const maxBytes = env().MCP_MAX_BODY_BYTES;
    const declared = Number(c.req.header('content-length') ?? 0);
    if (declared > maxBytes) {
      done({ ...who, outcome: 'body_too_large' });
      return fail(c, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large.');
    }
    const text = await c.req.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      done({ ...who, outcome: 'body_too_large' });
      return fail(c, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large.');
    }
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch {
      done({ ...who, outcome: 'parse_error' });
      return c.json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }, 400);
    }

    // 6. Scope pre-check -> HTTP 403 (never a "successful" tool response).
    const needed = missingScope(parsed, principal);
    if (needed) {
      done({ ...who, outcome: 'insufficient_scope', requiredScope: needed });
      return insufficientScope(c, needed);
    }

    // 7. SDK handles the protocol. One server + transport per request (stateless).
    const { server, tools } = buildMcpServer(principal, correlationId);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: maxBytes,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await server.connect(transport);
      const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), env().MCP_REQUEST_TIMEOUT_MS); });
      const response = await Promise.race([transport.handleRequest(c.req.raw, { parsedBody: parsed }), timeout]);
      if (!response) {
        done({ ...who, outcome: 'timeout' });
        return fail(c, 504, 'TIMEOUT', 'The request timed out.');
      }
      const rpc = (Array.isArray(parsed) ? parsed : [parsed]).map((m) => (m as { method?: unknown })?.method).filter((m): m is string => typeof m === 'string').slice(0, 5);
      done({ ...who, outcome: 'handled', status: response.status, rpcMethods: rpc, toolsExposed: tools.length });
      const out = new Response(response.body, response);
      out.headers.set('Cache-Control', 'no-store');
      return out;
    } finally {
      if (timer) clearTimeout(timer);
      void server.close().catch(() => undefined);
    }
  } catch {
    // Anything unexpected (including invalid server config) fails closed and generic.
    done({ outcome: 'internal_error' });
    return fail(c, 500, 'INTERNAL', 'Internal error.');
  }
}
