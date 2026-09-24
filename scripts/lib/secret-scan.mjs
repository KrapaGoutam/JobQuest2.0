// Structure-aware secret detection shared by scripts/check-bundle.mjs and its unit tests.
//
// Design (M1B, replacing M1's bare-substring rules):
//  * Match COMPLETE credential structures, not prefixes. `sb_secret_` alone is a literal
//    inside supabase-js (a key-type check); a real key has a long random body after it.
//  * Decode JWTs and flag only privileged roles (e.g. service_role). Public anon or
//    publishable tokens are browser-safe by design.
//  * Private keys: PEM private-key blocks, and JWKs that carry a private component (`d`).
//  * Database URLs are flagged only when they embed a real password, not a placeholder.
//  * Exact-value matching for known secret values present in the environment, so a
//    rotated or unusual-format secret is still caught.
//  * Allowlist entries are EXACT strings with a documented reason; there are no
//    directory or pattern-wide exemptions.

const B64URL = '[A-Za-z0-9_-]';

export const RULES = [
  { id: 'supabase-secret-key', re: new RegExp(`\\bsb_secret_${B64URL}{20,}`, 'g') },
  { id: 'supabase-personal-access-token', re: /\bsbp_[a-f0-9]{40}\b/g },
  { id: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { id: 'jobquest-refresh-token', re: new RegExp(`\\bjqr_${B64URL}{40,}`, 'g') },
  { id: 'jobquest-extension-token', re: /\bjqe_live_[0-9a-f]{40}\b/g },
  { id: 'jobquest-claim-token', re: new RegExp(`\\bjqc_live_${B64URL}{40,}`, 'g') },
  { id: 'pem-private-key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g },
  { id: 'jwk-private-key', re: new RegExp(`"d"\\s*:\\s*"${B64URL}{32,}"`, 'g'), context: /"kty"\s*:/ },
  { id: 'database-url-with-password', re: /\bpostgres(?:ql)?:\/\/[^\s:@/'"`]+:([^\s@'"`]+)@[^\s'"`]+/g, check: (m) => !isPlaceholder(m[1]) },
  { id: 'server-secret-env-name', re: /\b(?:SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|JQ_JWT_PRIVATE_JWK|SUPABASE_DB_PASSWORD|SUPABASE_DB_URL)\b/g, bundleOnly: true },
];

const JWT = new RegExp(`\\beyJ${B64URL}{10,}\\.eyJ${B64URL}{10,}\\.${B64URL}{10,}`, 'g');
const PRIVILEGED_ROLES = new Set(['service_role', 'supabase_admin', 'postgres', 'supabase_auth_admin']);

function isPlaceholder(pw) {
  return /^(\[.*\]|<.*>|\$\{.*\}|\*+|x+|password|your[-_]?password|changeme|placeholder)$/i.test(pw);
}

function decodeSegment(seg) {
  try {
    return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {string} text
 * @param {{ knownSecrets?: string[], allowlist?: {value: string, reason: string}[], mode?: 'bundle' | 'source' }} [opts]
 *   mode 'bundle' (default) also flags server-secret variable NAMES, which must never reach browser code.
 * @returns {{ rule: string, index: number }[]}  findings (never the matched value itself)
 */
export function scanText(text, opts = {}) {
  const allow = new Set((opts.allowlist ?? []).map((a) => a.value));
  const findings = [];
  const mode = opts.mode ?? 'bundle';
  for (const rule of RULES) {
    if (rule.bundleOnly && mode !== 'bundle') continue;
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) {
      if (allow.has(m[0])) continue;
      if (rule.check && !rule.check(m)) continue;
      if (rule.context) {
        const window = text.slice(Math.max(0, m.index - 400), m.index + 400);
        if (!rule.context.test(window)) continue;
      }
      findings.push({ rule: rule.id, index: m.index });
    }
  }
  for (const m of text.matchAll(JWT)) {
    if (allow.has(m[0])) continue;
    const payload = decodeSegment(m[0].split('.')[1]);
    if (payload && PRIVILEGED_ROLES.has(payload.role)) findings.push({ rule: 'privileged-jwt', index: m.index });
  }
  for (const secret of opts.knownSecrets ?? []) {
    if (secret && secret.length >= 12) {
      const i = text.indexOf(secret);
      if (i >= 0) findings.push({ rule: 'known-secret-value', index: i });
    }
  }
  return findings;
}

/** Secret values that must never appear in shipped or committed files, taken from the environment. */
export function knownSecretsFromEnv(env = process.env) {
  const out = [env.SUPABASE_SECRET_KEY, env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_DB_PASSWORD];
  if (env.JQ_JWT_PRIVATE_JWK) {
    try {
      const j = JSON.parse(env.JQ_JWT_PRIVATE_JWK);
      out.push((Array.isArray(j) ? j[0] : j)?.d);
    } catch {
      out.push(env.JQ_JWT_PRIVATE_JWK);
    }
  }
  return out.filter(Boolean);
}
