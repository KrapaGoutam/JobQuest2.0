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
  } catch {
    return c.json({ error: { code: 'MCP_UNAVAILABLE', message: 'MCP is temporarily unavailable.' } }, 503);
  }
});
