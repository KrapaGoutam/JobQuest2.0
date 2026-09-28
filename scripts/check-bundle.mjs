// Secret scanner (M1B B23/B24).
//
//   node scripts/check-bundle.mjs            scan the built browser bundle (apps/web/dist)
//   node scripts/check-bundle.mjs --tracked  scan every git-tracked text file
//   node scripts/check-bundle.mjs --extension scan unpacked extension build artifacts
//
// Fails (exit 1) on any complete credential structure (see scripts/lib/secret-scan.mjs),
// on any privileged JWT, or on any known secret value present in the environment.
// Findings print rule + file + offset only, never the matched value.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { knownSecretsFromEnv, scanText } from './lib/secret-scan.mjs';

const allowlist = JSON.parse(readFileSync(new URL('./secret-scan-allowlist.json', import.meta.url), 'utf8')).entries;
const knownSecrets = knownSecretsFromEnv();
const tracked = process.argv.includes('--tracked');
const extension = process.argv.includes('--extension');

function* bundleFiles(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* bundleFiles(p);
    else yield p;
  }
}
function* trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  for (const p of out.split('\0')) {
    if (!p || /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip)$/i.test(p) || p === 'pnpm-lock.yaml') continue;
    yield p;
  }
}

let files = 0;
let bad = 0;
const bundleRoot = extension ? 'apps/extension/dist' : 'apps/web/dist';
if (!tracked && !existsSync(bundleRoot)) {
  console.error(`${bundleRoot} not found: run the relevant package build first`);
  process.exit(1);
}
for (const p of tracked ? trackedFiles() : bundleFiles(bundleRoot)) {
  if (/\.zip$/i.test(p)) continue;
  if (!existsSync(p)) continue;
  const text = readFileSync(p, 'utf8');
  files++;
  for (const f of scanText(text, { knownSecrets, allowlist, mode: tracked ? 'source' : 'bundle' })) {
    console.error(`SECRET ${f.rule} in ${p} @${f.index}`);
    bad++;
  }
}
if (bad) process.exit(1);
console.log(`secret scan (${tracked ? 'tracked files' : extension ? 'extension bundle' : 'browser bundle'}): ${files} files, 0 findings`);
