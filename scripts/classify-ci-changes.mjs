import { readFileSync } from 'node:fs';

function isDocumentationPath(path) {
  if (/^[^/]+\.md$/i.test(path)) return true;
  return /^(?:migration-upgrade|docs|\.agents)\/.+\.md$/i.test(path);
}

export function classifyPaths(paths) {
  return paths.length > 0 && paths.every(isDocumentationPath) ? 'DOCS_ONLY' : 'FULL_CI';
}

function selfTest() {
  const cases = [
    [['migration-upgrade/foo.md'], 'DOCS_ONLY'],
    [['README.md'], 'DOCS_ONLY'],
    [['apps/web/src/example.tsx'], 'FULL_CI'],
    [['e2e/leak.spec.ts'], 'FULL_CI'],
    [['.github/workflows/m1b-ci.yml'], 'FULL_CI'],
    [['supabase/migrations/example.sql'], 'FULL_CI'],
    [['package.json'], 'FULL_CI'],
    [['pnpm-lock.yaml'], 'FULL_CI'],
    [['migration-upgrade/foo.md', 'apps/web/src/example.tsx'], 'FULL_CI'],
    [['unknown.file'], 'FULL_CI'],
    [[], 'FULL_CI'],
  ];

  for (const [paths, expected] of cases) {
    const actual = classifyPaths(paths);
    if (actual !== expected) {
      throw new Error(`Expected ${JSON.stringify(paths)} to be ${expected}; received ${actual}`);
    }
  }
  console.log('CI change classifier: 11 cases passed');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const paths = readFileSync(0).toString('utf8').split('\0').filter(Boolean);
  console.log(classifyPaths(paths));
}
