import { handle } from 'hono/vercel';
import { app } from './app';

const handler = handle(app);

/**
 * Vercel Functions (Node runtime, Web-standard handlers). OAuth/MCP discovery
 * documents must be served from the origin root (`/.well-known/...`, RFC 8414 /
 * RFC 9728). vercel.json rewrites them here with the original URL preserved, so
 * map them onto the `/api`-based Hono routes.
 */
export const vercelHandler = (request: Request): Promise<Response> | Response => {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/.well-known/')) {
    url.pathname = `/api${url.pathname}`;
    return handler(new Request(url, request));
  }
  return handler(request);
};
