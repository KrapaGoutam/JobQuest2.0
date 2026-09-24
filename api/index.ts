// Vercel Function entry: every /api/* request is rewritten here (vercel.json)
// and handled by the same Hono app used locally.
import { vercelHandler } from '../apps/api/src/vercel';

export const GET = vercelHandler;
export const POST = vercelHandler;
export const OPTIONS = vercelHandler;
