import { Hono } from 'hono';

/**
 * AI-3: remote MCP endpoint (Streamable HTTP, stateless). The implementation is
 * imported lazily so that any MCP module/config problem can only ever fail MCP
 * requests (closed, generic 503) and never API boot or /api/health.
 */
export const mcp = new Hono();

mcp.all('/', async (c) => {
  try {
    const { handleMcpRequest } = await import('../mcp/server');
    return await handleMcpRequest(c);
  } catch (error) {
    // Operability: a load/config failure must be diagnosable from server logs. Only the error class, code and a
    // truncated message are logged (module-resolution text; never request data, tokens or environment values).
    const e = error as { name?: unknown; code?: unknown; message?: unknown };
    console.error(JSON.stringify({
      event: 'mcp.unavailable', name: String(e?.name ?? 'Error').slice(0, 64), code: e?.code === undefined ? undefined : String(e.code).slice(0, 64),
      message: String(e?.message ?? '').slice(0, 300),
    }));
    return c.json({ error: { code: 'MCP_UNAVAILABLE', message: 'MCP is temporarily unavailable.' } }, 503);
  }
});
