import { serve } from '@hono/node-server';
import { app } from './app';
import { env } from './env';

env(); // fail fast on missing configuration (names only are reported)
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`JobQuest API listening on http://localhost:${port}/api`));
