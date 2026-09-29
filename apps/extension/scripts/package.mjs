import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
if (!['dev', 'prod'].includes(mode)) {
  throw new Error('Usage: node scripts/package.mjs <dev|prod>');
}

const packageName = `jobquest-capture-${mode}`;
const outputRoot = join(root, 'dist');
const outputDir = join(outputRoot, packageName);
const zipPath = join(outputRoot, `${packageName}.zip`);
const sourceEntries = [
  'manifest.json',
  'background.js',
  'content.js',
  ...(mode === 'dev' ? ['popup.html', 'popup.css', 'popup.js'] : []),
  'options.html',
  'options.css',
  'options.js',
  'sidepanel.html',
  'sidepanel.css',
  'sidepanel.js',
  'sidepanel-logic.js',
  'api',
  'extractors',
  'icons',
];

rmSync(outputDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(outputDir, { recursive: true });
for (const entry of sourceEntries) {
  cpSync(join(root, entry), join(outputDir, entry), { recursive: true });
}

const preset = {
  environment: mode,
  instanceUrl: mode === 'dev' ? 'http://localhost:5173' : (process.env.JOBQUEST_PROD_URL || 'https://jobquest2.vercel.app'),
};
writeFileSync(join(outputDir, 'instance-preset.json'), `${JSON.stringify(preset, null, 2)}\n`, 'utf8');


const archive = {};
function addDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) addDirectory(fullPath);
    else archive[relative(outputDir, fullPath).replaceAll('\\', '/')] = new Uint8Array(readFileSync(fullPath));
  }
}
addDirectory(outputDir);
archive['BUILD.txt'] = strToU8(`JobQuest Capture ${mode} package\n`);
writeFileSync(zipPath, zipSync(archive, { level: 9 }));

console.log(`Created ${relative(root, outputDir)} and ${relative(root, zipPath)}`);
