/**
 * JobQuest 2.0 · M15-E · Step 16A-2 — create the FRESH production owner + personal workspace.
 *
 * One-time OPERATOR tool (not application code). It reuses the application's own registration
 * primitives, so the account is exactly what POST /auth/register would create:
 *   normalizeUsername + checkPassword (same policy), generateCodeSet (10 Argon2id recovery codes),
 *   Argon2id password verifier (same parameters as apps/api env defaults), rpc_register_account.
 *
 * Safety properties:
 *   - hard-locked to project ref kqsxdothjxtcktyirpux; any other host (jobquest-dev, old prod) aborts
 *   - service key is read from the environment only and is never printed or written
 *   - password is read from a hidden TTY prompt only (never argv/env/files)
 *   - refuses to run if any user_accounts row already exists (fresh environment only)
 *   - starts NO session; writes NO files; recovery codes are printed to this terminal exactly once
 *
 * Run it YOURSELF in your own terminal (not through an AI agent), from the repo root:
 *   PowerShell:  $env:SUPABASE_URL = "https://kqsxdothjxtcktyirpux.supabase.co"
 *                $env:SUPABASE_SECRET_KEY = "<project secret / service_role key>"   # dashboard -> Project Settings -> API Keys
 *                npx tsx migration-upgrade/m15/step16a2/bootstrap-prod-owner.ts --username <name> [--display-name "<Name>"]
 *                Remove-Item Env:SUPABASE_SECRET_KEY
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { generateCodeSet } from '../../../apps/api/src/lib/recovery';
import { checkPassword, normalizeUsername } from '../../../apps/api/src/lib/credentials';

const req = createRequire(resolve(process.cwd(), 'apps/api/package.json'));
const { createClient } = req('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
const { hash } = req('@node-rs/argon2') as { hash: (p: string, o: object) => Promise<string> };

const PROD_REF = 'kqsxdothjxtcktyirpux';
const ARGON = { algorithm: 2 as const, memoryCost: 19456, timeCost: 2, parallelism: 1 }; // = apps/api env defaults

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const die = (m: string): never => { console.error(`ABORT: ${m}`); process.exit(1); };

function readHidden(prompt: string): Promise<string> {
  return new Promise((res, rej) => {
    if (!process.stdin.isTTY) return rej(new Error('An interactive terminal is required (password is never accepted via args/env/pipe).'));
    process.stdout.write(prompt);
    const stdin = process.stdin;
    let buf = '';
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); return res(buf); }
        if (c === '\u0003') { stdin.setRawMode(false); process.stdout.write('\n'); process.exit(130); }
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1); else buf += c;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const url = process.env.SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SECRET_KEY ?? '';
  let host = '';
  try { host = new URL(url).host; } catch { /* handled below */ }
  if (host !== `${PROD_REF}.supabase.co`) die(`SUPABASE_URL must be https://${PROD_REF}.supabase.co (got host "${host || 'invalid'}"). Refusing to touch any other project.`);
  if (!key) die('SUPABASE_SECRET_KEY is not set in this terminal session.');

  const name = normalizeUsername(arg('username') ?? '');
  if (!name) die('--username must be 3–32 letters, digits, dot, dash or underscore.');
  const displayName = arg('display-name') ?? '';

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { count, error: cErr } = await admin.from('user_accounts').select('user_id', { count: 'exact', head: true });
  if (cErr) die(`Could not read user_accounts (check the key belongs to ${PROD_REF}): ${cErr.message}`);
  if ((count ?? 0) > 0) die(`The target already has ${count} user account(s). This tool only creates the first owner of a fresh environment.`);

  const pw1 = await readHidden('Choose a password (min 10 chars, not guessable): ');
  const problem = checkPassword(pw1, name!.username);
  if (problem) die(`Password rejected by the application policy: ${problem}`);
  const pw2 = await readHidden('Repeat the password: ');
  if (pw1 !== pw2) die('Passwords did not match.');

  const codes = await generateCodeSet();
  const { data, error } = await admin.rpc('rpc_register_account', {
    p_username: name!.username,
    p_password_hash: await hash(pw1, ARGON),
    p_display_name: displayName,
    p_email: '',
    p_phone: '',
    p_code_hashes: codes.map((c) => c.hash),
    p_code_hints: codes.map((c) => c.hint),
  });
  const row = (data as { user_id: string; workspace_id: string }[] | null)?.[0];
  if (error || !row) die(`Registration failed: ${error?.message ?? 'no row returned'} (nothing was committed by this tool if the RPC errored).`);

  console.log('\n=== FRESH PRODUCTION OWNER CREATED (project kqsxdothjxtcktyirpux) ===');
  console.log(`username     : ${name!.username}`);
  console.log(`user_id      : ${row!.user_id}        <-- safe to share (not a secret)`);
  console.log(`workspace_id : ${row!.workspace_id}   <-- safe to share (not a secret)`);
  console.log('\nRECOVERY CODES — shown ONCE, never stored in plaintext. Save them in your password vault NOW.');
  console.log('Do NOT paste them into chat, tickets, docs or git:\n');
  codes.forEach((c, i) => console.log(`  ${String(i + 1).padStart(2, ' ')}. ${c.display}`));
  console.log('\nNext: tell the agent only the username, user_id and workspace_id. Then clear this terminal and: Remove-Item Env:SUPABASE_SECRET_KEY');
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
