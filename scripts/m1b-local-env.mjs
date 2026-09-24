// Writes an env file for running the M1B suite against the LOCAL Supabase stack.
//
//   node scripts/m1b-local-env.mjs [outfile]      (default: .env.m1b-local, gitignored)
//
// Values come from `supabase status -o json` (local stack only) and
// supabase/signing_keys.json, the local ES256 private key that the stack trusts.
// Only variable NAMES are printed. Nothing here ever targets a hosted project.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const out = process.argv[2] ?? '.env.m1b-local';
const raw = execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'status', '-o', 'json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
  shell: process.platform === 'win32',
});
const s = JSON.parse(raw.slice(raw.indexOf('{')));
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(s.API_URL)) {
  throw new Error('Refusing: supabase status does not point at a local stack');
}
const keys = JSON.parse(readFileSync('supabase/signing_keys.json', 'utf8'));
const jwk = Array.isArray(keys) ? keys[0] : keys;
if (!jwk?.d || jwk.kty !== 'EC') throw new Error('supabase/signing_keys.json must hold an EC private JWK');

const vars = {
  SUPABASE_URL: s.API_URL,
  SUPABASE_PUBLISHABLE_KEY: s.PUBLISHABLE_KEY ?? s.ANON_KEY,
  SUPABASE_SECRET_KEY: s.SECRET_KEY ?? s.SERVICE_ROLE_KEY,
  SUPABASE_DB_URL: s.DB_URL,
  VITE_SUPABASE_URL: s.API_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: s.PUBLISHABLE_KEY ?? s.ANON_KEY,
  JQ_JWT_PRIVATE_JWK: JSON.stringify(jwk),
  APP_ORIGINS: 'http://localhost:5173',
  M1B_TARGET: 'local',
};
writeFileSync(out, Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
console.log(`wrote ${out}: ${Object.keys(vars).join(', ')}`);
