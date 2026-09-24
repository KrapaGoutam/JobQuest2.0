// Generates supabase/signing_keys.json (gitignored) for the LOCAL Supabase stack only.
// The local Auth + Data API trust this ES256 key, and the Node API mints tokens with it
// (via .env.m1b-local). The CLI refuses to run inside a project whose config points at a
// missing key file, so it runs from the OS temp dir. The key is never printed.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const out = resolve('supabase/signing_keys.json');
if (existsSync(out) && !process.argv.includes('--force')) {
  console.log('supabase/signing_keys.json already exists (use --force to replace)');
  process.exit(0);
}
const bin = resolve('node_modules/.bin', process.platform === 'win32' ? 'supabase.cmd' : 'supabase');
const raw = execFileSync(bin, ['gen', 'signing-key', '--algorithm', 'ES256'], {
  cwd: tmpdir(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32',
});
const jwk = JSON.parse(raw.slice(raw.indexOf('{')));
if (jwk.kty !== 'EC' || !jwk.d || !jwk.kid) throw new Error('unexpected signing-key output');
writeFileSync(out, JSON.stringify([jwk], null, 2));
console.log(`wrote supabase/signing_keys.json (${jwk.alg}, ${jwk.crv}); gitignored, local stack only`);
