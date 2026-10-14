import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

// AI-7: the dedicated AI Hub browser job. The AI Hub flags must be ON only inside that job, the existing jobs
// (including the full browser suite) must keep their current environment, and the job must stay synthetic-data-only
// with no new secret. Text-level checks on the workflow (no YAML dependency).
const wf = readFileSync('.github/workflows/m1b-ci.yml', 'utf8').replace(/\r\n/g, '\n');
const jobsStart = wf.indexOf('\njobs:\n');
// AI-8 extends the same isolated job with its action spec; AI-10 swaps the AI-9 provider-card spec for the provider-auth spec.
const SPECS = ['e2e/ai5-digest.spec.ts', 'e2e/ai6-sources.spec.ts', 'e2e/ai7-calendar.spec.ts', 'e2e/ai8-actions.spec.ts', 'e2e/ai10-provider-auth.spec.ts', 'e2e/ai11a-automations.spec.ts', 'e2e/ai11b-email.spec.ts', 'e2e/ai11d-discovery.spec.ts', 'e2e/ai11e-recruiters.spec.ts'];
const jobs: Record<string, string> = {};
{
  const body = wf.slice(jobsStart + 1);
  const marks = [...body.matchAll(/^ {2}([a-z0-9-]+):\n/gm)].map((m) => ({ name: m[1]!, at: m.index! }));
  marks.forEach((m, i) => { jobs[m.name] = body.slice(m.at, marks[i + 1]?.at ?? body.length); });
}

describe('dedicated AI Hub browser CI job (AI-7)', () => {
  it('exists as its own job next to the unchanged jobs', () => {
    expect(Object.keys(jobs)).toEqual(expect.arrayContaining(['classify', 'static', 'database', 'ai-hub-e2e']));
  });

  it('turns the AI Hub flags ON only inside the dedicated job', () => {
    for (const [name, body] of Object.entries(jobs)) {
      if (name === 'ai-hub-e2e') continue;
      expect(body, `job ${name} must not enable the AI Hub`).not.toMatch(/AI_HUB_ENABLED/);
    }
    const ai = jobs['ai-hub-e2e']!;
    expect(ai).toContain('AI_HUB_ENABLED=true');
    expect(ai).toContain('VITE_AI_HUB_ENABLED=true');
    // enabled by appending to this job's own env file, never through workflow-level environment
    expect(wf.slice(0, jobsStart)).not.toMatch(/AI_HUB/);
    expect(ai).toMatch(/>> \.env\.m1b-local/);
  });

  it('leaves the existing browser job as it was (full suite, no flag, same env file)', () => {
    const db = jobs.database!;
    expect(db).toContain('run: pnpm test:e2e');
    expect(db).toContain('M1B_ENV_FILE: .env.m1b-local');
    expect(db).not.toMatch(/AI_HUB|ai5-digest|ai6-sources|ai7-calendar|ai8-actions|ai11a-automations/);
  });

  it('runs only the focused AI Hub specs, not the whole browser suite', () => {
    const ai = jobs['ai-hub-e2e']!;
    const cmd = /run: pnpm exec playwright test ([^\n]+)\n/.exec(ai)?.[1] ?? '';
    expect(cmd.split(/\s+/).sort()).toEqual([...SPECS].sort());
    expect(ai).not.toContain('pnpm test:e2e');
    for (const f of SPECS) expect(existsSync(f), f).toBe(true);
  });

  it('is gated like the other code jobs and runs in parallel with the database job', () => {
    const ai = jobs['ai-hub-e2e']!;
    expect(ai).toContain('needs: [classify, static]');
    expect(ai).toContain("if: needs.classify.outputs.full_ci == 'true'");
    expect(ai).not.toMatch(/needs:.*database/);
  });

  it('uses a disposable local stack and synthetic data: no secrets, no hosted database, no provider credentials', () => {
    const ai = jobs['ai-hub-e2e']!;
    expect(ai).not.toMatch(/secrets\./);
    expect(ai).not.toMatch(/supabase\.co|ANTHROPIC|OPENAI|GEMINI|GOOGLE_|OAUTH|CLIENT_SECRET/i);
    for (const step of ['pnpm local:key', 'pnpm exec supabase start', 'pnpm local:env', 'pnpm exec supabase stop --no-backup']) expect(ai).toContain(step);
    expect(ai).toMatch(/if: always\(\)\n\s+run: pnpm exec supabase stop/);
    const specs = SPECS.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(specs).not.toMatch(/process\.env\.(ANTHROPIC|OPENAI|GEMINI|GOOGLE)/i);
    expect(specs).not.toMatch(/api\.anthropic|googleapis|graph\.microsoft/i);
  });

  it('uploads only sanitized evidence and ARIA failure context (never env files)', () => {
    const ai = jobs['ai-hub-e2e']!;
    expect(ai).toContain('test-results/evidence/');
    expect(ai).toContain('test-results/**/error-context.md');
    expect(ai).not.toMatch(/path:[^\n]*\.env/);
  });

  it('every AI Hub spec skips itself unless both flags are on, so the full-suite job stays unchanged', () => {
    for (const f of SPECS) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toMatch(/test\.skip\(!aiHubEnabled/);
      expect(src, f).toMatch(/VITE_AI_HUB_ENABLED/);
    }
  });

  it('the Calendar spec asserts the shell clipping regression beyond scrollWidth, on every tab and size, with path and width in the messages', () => {
    const src = readFileSync('e2e/ai7-calendar.spec.ts', 'utf8');
    expect(src).toContain('async function clippingProblems');
    expect(src).toContain('getBoundingClientRect');
    expect(src).toContain('shell is wider than the viewport');
    expect(src).toMatch(/for \(const w of \[375, 768, 1280\]\)/);
    expect(src).toContain('no clipped content on ${path} at ${w}px');
    expect(src).toContain("['Recruiter Intel', '/ai-hub/recruiters'], ['Calendar', '/ai-hub/calendar'], ['History', '/ai-hub/history']");
    expect(src).toMatch(/impact === 'critical' \|\| v\.impact === 'serious'/);
  });
});
