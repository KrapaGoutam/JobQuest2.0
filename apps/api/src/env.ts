import { z } from 'zod';

/**
 * Server-only configuration. Validated once; secrets never leave this process.
 * SUPABASE_SECRET_KEY (service role) must NEVER be referenced from apps/web.
 */
const schema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),
  /** Comma-separated exact origins allowed to call state-changing routes. */
  APP_ORIGINS: z.string().default('http://localhost:5173'),
  /** Rate-limit knobs (defaults = approved Gate 03 values). */
  LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  LOGIN_IP_MAX_PER_15M: z.coerce.number().int().positive().default(20),
  REGISTER_IP_MAX_PER_HOUR: z.coerce.number().int().positive().default(3),
  RECOVERY_MAX_FAILURES: z.coerce.number().int().positive().default(3),
  RECOVERY_LOCK_MINUTES: z.coerce.number().int().positive().default(60),
  RECOVERY_IP_MAX_PER_HOUR: z.coerce.number().int().positive().default(10),
  /** Minimum response time for failed auth, to blunt username-enumeration timing. */
  AUTH_FAILURE_FLOOR_MS: z.coerce.number().int().nonnegative().default(600),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      // Names only — never echo values.
      const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
      throw new Error(`Invalid server environment: ${names}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Test hook: re-read process.env (used by the integration suite). */
export function resetEnvCache(): void {
  cached = undefined;
}

export function allowedOrigins(): Set<string> {
  const set = new Set(
    env()
      .APP_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
  // Vercel preview/branch URLs are injected by the platform, never by the client.
  for (const v of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
    if (v) set.add(`https://${v}`);
  }
  return set;
}

/** Internal alias domain for Supabase Auth identities (Option A). Server-only constant. */
export const ALIAS_DOMAIN = 'auth.jobquest.internal';
