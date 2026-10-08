import { createElement } from '../../apps/web/node_modules/react';
import { renderToStaticMarkup } from '../../apps/web/node_modules/react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../apps/web/src/supabase', () => ({ supabase: { from: () => { throw new Error('unexpected'); } } }));

import {
  AI_WRITE_ACTIONS_ENABLED, isAiHubExposed, isAiHubPath, parseAiFlag, resolveAiHubAvailability, workflowStatus,
} from '../../apps/web/src/lib/aiHubFlags';
import { fetchAiWorkflowConfigs } from '../../apps/web/src/api/aiHub';
import { AiAutomationSettings } from '../../apps/web/src/views/AiAutomationSettings';
import { isAiHubServerEnabled } from '../../apps/api/src/lib/aiHubConfig';

const src = (f: string) => readFileSync(`apps/web/src/${f}`, 'utf8');

describe('AI Hub flag precedence (AI-1F1)', () => {
  it('defaults OFF for missing/malformed values', () => {
    for (const v of [undefined, '', 'false', '1', 'yes', 'TRUE!', 0, null, {}]) expect(parseAiFlag(v)).toBe(false);
    expect(parseAiFlag(' True ')).toBe(true);
    expect(isAiHubExposed(undefined)).toBe(false);
    expect(isAiHubExposed('garbage')).toBe(false);
    expect(isAiHubExposed('true')).toBe(true);
  });
  it('environment kill switch takes precedence over the frontend flag', () => {
    expect(resolveAiHubAvailability({ envKillSwitch: 'false', frontendFlag: 'true' })).toBe('SYSTEM_DISABLED');
    expect(resolveAiHubAvailability({ envKillSwitch: 'bogus', frontendFlag: 'true' })).toBe('SYSTEM_DISABLED');
    expect(resolveAiHubAvailability({ envKillSwitch: 'true', frontendFlag: 'false' })).toBe('FRONTEND_DISABLED');
    expect(resolveAiHubAvailability({ envKillSwitch: 'true', frontendFlag: 'true' })).toBe('AVAILABLE');
    expect(resolveAiHubAvailability({ frontendFlag: 'true' })).toBe('AVAILABLE'); // unknown kill switch does not block
  });
  it('server kill switch is default-off', () => {
    expect(isAiHubServerEnabled({})).toBe(false);
    expect(isAiHubServerEnabled({ AI_HUB_ENABLED: 'nope' })).toBe(false);
    expect(isAiHubServerEnabled({ AI_HUB_ENABLED: 'true' })).toBe(true);
  });
  it('write actions stay disabled', () => {
    expect(AI_WRITE_ACTIONS_ENABLED).toBe(false);
  });
  it('classifies AI paths', () => {
    for (const p of ['/ai-hub', '/ai-hub/history', '/settings/ai']) expect(isAiHubPath(p)).toBe(true);
    expect(isAiHubPath('/settings')).toBe(false);
  });
});

describe('gating wiring', () => {
  it('sidebar, mobile nav, routes and settings all go through isAiHubExposed', () => {
    expect(src('components/shell/Sidebar.tsx')).toMatch(/isAiHubExposed\(\) \?/);
    expect(src('components/shell/MobileNav.tsx')).toMatch(/isAiHubExposed\(\) \?/);
    const app = src('App.tsx');
    expect(app).toMatch(/isAiHubExposed\(\)\) return notFoundView/);
    expect(app).toMatch(/'\/settings\/ai' && !isAiHubExposed\(\)/);
    expect(src('views/SettingsView.tsx')).toMatch(/isAiHubExposed\(\) && \(/);
  });
});

describe('Settings -> AI & Automation', () => {
  const html = renderToStaticMarkup(createElement(AiAutomationSettings, { activeWorkspaceId: 'w1' }));
  it('shows truthful provider and workflow state', () => {
    for (const p of ['Claude', 'Gemini', 'ChatGPT']) expect(html).toContain(p);
    expect((html.match(/Not configured<\/b>/g) ?? []).length).toBe(3);
    expect(html).not.toMatch(/Connected|Authorized|Scheduled|>Active</);
    expect(html).toContain('Unavailable until provider setup');
    expect(html).toContain('Disabled');
  });
  it('has no controls that could enable anything', () => {
    expect(html).not.toMatch(/<input|<button|<select|role="switch"|type="checkbox"/);
  });
  it('stored enabled rows are still reported as unable to run', () => {
    expect(workflowStatus(true)).toMatch(/cannot run/);
    expect(workflowStatus(false)).toBe('Unavailable until provider setup');
  });
  it('is read-only and never touches secrets or writes', () => {
    const s = src('views/AiAutomationSettings.tsx') + src('api/aiHub.ts');
    expect(s).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(|service_role|SECRET/);
  });
  it('config read failure is opaque', async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { message: 'pg detail' } }) }) }) }) };
    await expect(fetchAiWorkflowConfigs('w1', client as never)).rejects.toThrow('AI_HUB_LOAD_FAILED');
  });
});
