import { handle } from 'hono/vercel';
import { app } from './app';

/** Vercel Functions (Node runtime, Web-standard handlers). */
export const vercelHandler = handle(app);
