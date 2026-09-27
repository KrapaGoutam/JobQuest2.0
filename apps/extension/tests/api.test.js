import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSecureJobQuestUrl, checkDuplicate, createCapture, getActiveResumes,
  getSettings, getWorkflow, isConnectionError, JobQuestApiError,
  normalizeInstanceUrl, parseSalaryRange, saveSettings, saveTheme, testConnection,
} from '../api/jobquest.js';

const rawToken = `jqx_dev_${'A'.repeat(43)}`;

beforeEach(() => {
  const values = {};
  globalThis.chrome = {
    storage: { local: {
      get: vi.fn(async (keys) => Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]]))),
      set: vi.fn(async (next) => Object.assign(values, next)),
      remove: vi.fn(async (keys) => keys.forEach((key) => delete values[key])),
    } },
  };
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
});

describe('JobQuest extension API client', () => {
  it('normalizes configured origins without retaining paths', () => {
    expect(normalizeInstanceUrl('localhost:3000///')).toBe('http://localhost:3000');
    expect(normalizeInstanceUrl(' https://jobquest.example.test/path ')).toBe('https://jobquest.example.test');
  });

  it('rejects non-http instance protocols', () => {
    expect(() => normalizeInstanceUrl('javascript:alert(1)')).toThrow(/http: or https:/);
  });

  it('constructs deep links strictly within the configured origin', () => {
    expect(buildSecureJobQuestUrl('https://jobquest.example.test', '/w/ws/applications/app')).toBe('https://jobquest.example.test/w/ws/applications/app');
    expect(() => buildSecureJobQuestUrl('https://jobquest.example.test', '//evil.test/phish')).toThrow(/origin boundary/);
    expect(() => buildSecureJobQuestUrl('data:text/html,test', '/')).toThrow(/http: or https:/);
  });

  it('parses formatted and abbreviated salary ranges without splitting thousands separators', () => {
    expect(parseSalaryRange('USD 195,000 - USD 255,000')).toEqual({ min: 195000, max: 255000 });
    expect(parseSalaryRange('$120k - $1.5m')).toEqual({ min: 120000, max: 1500000 });
    expect(parseSalaryRange('', 90000, 110000)).toEqual({ min: 90000, max: 110000 });
  });

  it('stores credentials only through chrome.storage.local', async () => {
    await saveSettings({ instanceUrl: 'https://jobquest.example.test/', apiToken: rawToken, theme: 'dark' });
    await expect(getSettings()).resolves.toEqual({ instanceUrl: 'https://jobquest.example.test', apiToken: rawToken, theme: 'dark' });
    expect(chrome.storage.local.set).toHaveBeenCalledOnce();
    expect(JSON.stringify(chrome)).not.toContain('sync');
  });

  it('defaults theme to System and persists explicit Light/Dark choices locally', async () => {
    await expect(getSettings()).resolves.toMatchObject({ theme: 'system' });
    await expect(saveTheme('dark')).resolves.toBe('dark');
    await expect(getSettings()).resolves.toMatchObject({ theme: 'dark' });
  });

  it('uses the versioned bearer endpoint for connection tests', async () => {
    await testConnection('https://jobquest.example.test', rawToken);
    expect(fetch).toHaveBeenCalledWith('https://jobquest.example.test/api/ext/v1/me', expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${rawToken}` }) }));
  });

  it('loads canonical workflow live rather than defining a client stage enum', async () => {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ stages: [{ id: 'SAVED', label: 'Saved' }], default_action: 'APPLIED' }), { status: 200 }));
    await expect(getWorkflow('https://jobquest.example.test', rawToken)).resolves.toMatchObject({ default_action: 'APPLIED' });
  });

  it('returns active resume documents from the v1 contract', async () => {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ documents: [{ id: 'resume-1' }] }), { status: 200 }));
    await expect(getActiveResumes('https://jobquest.example.test', rawToken)).resolves.toEqual([{ id: 'resume-1' }]);
  });

  it('maps duplicate-check failures to honest CHECK_ERROR rather than NONE', async () => {
    fetch.mockRejectedValueOnce(new TypeError('offline'));
    await expect(checkDuplicate('https://jobquest.example.test', rawToken, { company: 'Acme', jobTitle: 'Engineer' })).resolves.toMatchObject({ match_type: 'CHECK_ERROR', has_duplicate: false, matches: [] });
  });

  it('posts capture payloads atomically through /captures', async () => {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'app-1', deep_link_path: '/w/ws/applications/app-1' }), { status: 201 }));
    await expect(createCapture('https://jobquest.example.test', rawToken, { company: 'Acme', job_title: 'Engineer' })).resolves.toMatchObject({ id: 'app-1' });
    expect(fetch).toHaveBeenLastCalledWith('https://jobquest.example.test/api/ext/v1/captures', expect.objectContaining({ method: 'POST' }));
  });

  it('distinguishes revoked/expired connection errors', () => {
    expect(isConnectionError(new JobQuestApiError('expired', 401))).toBe(true);
    expect(isConnectionError(new JobQuestApiError('forbidden', 403))).toBe(false);
  });
});
