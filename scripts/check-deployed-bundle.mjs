// Scan a deployed app shell and its same-origin text assets with the same rules
// used by check-bundle.mjs. Run with hosted env values loaded so exact secrets
// are detected without ever printing those values:
//   node --env-file=.env.local scripts/check-deployed-bundle.mjs https://preview.example
import { readFileSync } from 'node:fs';
import { knownSecretsFromEnv, scanText } from './lib/secret-scan.mjs';

const rawBase = process.argv[2];
if (!rawBase) {
  console.error('Usage: node scripts/check-deployed-bundle.mjs <https-url>');
  process.exit(2);
}

const base = new URL(rawBase);
if (base.protocol !== 'https:') {
  console.error('Deployed bundle scans require an HTTPS URL.');
  process.exit(2);
}

const allowlist = JSON.parse(
  readFileSync(new URL('./secret-scan-allowlist.json', import.meta.url), 'utf8'),
).entries;
const knownSecrets = knownSecretsFromEnv();
const pending = [new URL('/', base)];
const visited = new Set();
const findings = [];

while (pending.length > 0) {
  const url = pending.shift();
  if (!url || visited.has(url.href)) continue;
  visited.add(url.href);

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Could not fetch ${url.pathname}: HTTP ${response.status}`);
  const type = response.headers.get('content-type') ?? '';
  if (!/text\/html|javascript|text\/css|image\/svg\+xml/.test(type)) continue;
  const body = await response.text();

  for (const finding of scanText(body, { knownSecrets, allowlist, mode: 'bundle' })) {
    findings.push({ file: url.pathname, rule: finding.rule, index: finding.index });
  }

  if (type.includes('text/html')) {
    for (const match of body.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)) {
      const asset = new URL(match[1], response.url);
      if (asset.origin === base.origin) pending.push(asset);
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`SECRET ${finding.rule} in ${finding.file} @${finding.index}`);
  }
  process.exit(1);
}

console.log(JSON.stringify({
  base: base.origin,
  files: visited.size,
  knownSecretValues: knownSecrets.length,
  findings: 0,
  at: new Date().toISOString(),
}));
