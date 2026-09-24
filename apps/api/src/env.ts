import { z } from 'zod';

/**
 * Server-only configuration. Validated once; secrets never leave this process.
 * SUPABASE_SECRET_KEY (service role) and JQ_JWT_PRIVATE_JWK (access-token signing key)
 * must NEVER be referenced from apps/web.
 */
const schema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),
  /** Private ES256 JWK (JSON) whose public half the Supabase project trusts. Server only. */
  JQ_JWT_PRIVATE_JWK: z.string().min(20),
  /** `iss` claim of JobQuest access tokens. */
  JQ_JWT_ISSUER: z.string().default('jobquest-api'),
  /** Comma-separated exact origins allowed to call state-changing routes. */
  APP_ORIGINS: z.string().default('http://localhost:5173'),

  /** Session lifetimes (Option B, app-owned sessions). */
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  SESSION_MAX_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),

  /** Argon2id password hashing (OWASP baseline: m = 19 MiB, t = 2, p = 1). */
  PASSWORD_ARGON2_MEMORY_KIB: z.coerce.number().int().min(19456).default(19456),
  PASSWORD_ARGON2_TIME_COST: z.coerce.number().int().min(2).default(2),
  PASSWORD_ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),

  /** Rate-limit knobs (defaults = approved Gate 03 values). */
  RATE_LIMIT_STORE: z.enum(['db', 'memory']).default('db'),
  LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  LOGIN_IP_MAX_PER_15M: z.coerce.number().int().positive().default(20),
  REGISTER_IP_MAX_PER_HOUR: z.coerce.number().int().positive().default(3),
  RECOVERY_MAX_FAILURES: z.coerce.number().int().positive().default(3),
  RECOVERY_LOCK_MINUTES: z.coerce.number().int().positive().default(60),
  RECOVERY_IP_MAX_PER_HOUR: z.coerce.number().int().positive().default(10),
  PASSWORD_CHANGE_MAX_PER_HOUR: z.coerce.number().int().positive().default(3),
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
