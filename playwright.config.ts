import { defineConfig, devices } from '@playwright/test';

// Browser-level T03 leak inspection. Local mode starts the API (tsx) + web (vite);
// set M1_BASE_URL to run the same spec against a Vercel preview instead.
const base = process.env.M1_BASE_URL ?? 'http://localhost:5173';
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  use: { baseURL: base, ...devices['Desktop Chrome'], extraHTTPHeaders: process.env.M1_BYPASS ? { 'x-vercel-protection-bypass': process.env.M1_BYPASS } : {} },
  reporter: [['list']],
  webServer: process.env.M1_BASE_URL
    ? undefined
    : [
        { command: 'corepack pnpm --filter @jobquest/api dev', url: 'http://localhost:8787/api/health', reuseExistingServer: true, timeout: 60_000 },
        { command: 'corepack pnpm --filter @jobquest/web dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
      ],
});
