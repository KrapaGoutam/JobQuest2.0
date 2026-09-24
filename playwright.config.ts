import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

// Browser-level B03 inspection. Local mode starts the API (tsx) + web (vite) with the env
// file chosen by M1B_ENV_FILE (default .env.m1b-local = local Supabase stack). Process env
// takes precedence over Node --env-file and over Vite .env files, so the chosen target is
// the one both servers use. Set M1_BASE_URL to run the same spec against a Vercel preview.
const envFile = process.env.M1B_ENV_FILE ?? '.env.m1b-local';
const serverEnv: Record<string, string> = {};
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && /^[A-Z0-9_]+$/.test(line.slice(0, i))) serverEnv[line.slice(0, i)] = line.slice(i + 1);
  }
  process.env.M1B_TARGET ??= serverEnv.M1B_TARGET ?? 'hosted-dev';
}

const base = process.env.M1_BASE_URL ?? 'http://localhost:5173';
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  use: { baseURL: base, ...devices['Desktop Chrome'], extraHTTPHeaders: process.env.M1_BYPASS ? { 'x-vercel-protection-bypass': process.env.M1_BYPASS } : {} },
  reporter: [['list']],
  webServer: process.env.M1_BASE_URL
    ? undefined
    : [
        { command: 'corepack pnpm --filter @jobquest/api dev', url: 'http://localhost:8787/api/health', reuseExistingServer: false, timeout: 60_000, env: serverEnv },
        { command: 'corepack pnpm --filter @jobquest/web dev', url: 'http://localhost:5173', reuseExistingServer: false, timeout: 60_000, env: serverEnv },
      ],
});
