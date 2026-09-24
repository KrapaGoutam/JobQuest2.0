// Fails if the built browser bundle contains anything that looks like a server secret
// or the internal alias domain. Run after `pnpm build`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = 'apps/web/dist';
const forbidden = [/sb_secret_/, /service_role/, /SUPABASE_SECRET_KEY/, /auth\.jobquest\.internal/];
const secret = process.env.SUPABASE_SECRET_KEY;
let bad = 0;
function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    const text = readFileSync(p, 'utf8');
    for (const re of forbidden) if (re.test(text)) { console.error(`FORBIDDEN ${re} in ${p}`); bad++; }
    if (secret && text.includes(secret)) { console.error(`SECRET KEY VALUE found in ${p}`); bad++; }
  }
}
walk(root);
if (bad) process.exit(1);
console.log('bundle check: no server secrets or internal alias in apps/web/dist');
