import { beforeEach, describe, expect, it, vi } from 'vitest';

// AI-11A routes: identity from the session only, CSRF on every mutation, strict body keys, POST-only mutations
// (the Vercel entry exports no PUT/PATCH), safe error mapping. The service is mocked here; its behaviour is covered
// in ai-11a-automation.test.ts and the real database in tests/integration/ai-11a-automation.test.ts.

const ME = '22222222-2222-4222-8222-222222222222';
const PEER = '33333333-3333-4333-8333-333333333333';
const WS = '11111111-1111-4111-8111-111111111111';
const def = (over: Record<string, unknown> = {}) => ({
  name: 'Weekday Morning Digest', workflow: 'daily_brief', enabled: true, provider: 'claude', cadence: 'weekdays', localTime: '08:00',
  timezone: 'America/Chicago', weekdays: [], sections: ['followups'], delivery: ['ai_hub'], ...over,
});

// ---- routes ----------------------------------------------------------------------------------------------------
const actor = vi.hoisted(() => ({ current: { userId: '22222222-2222-4222-8222-222222222222', token: 'tok', client: {} } as unknown }));
const svc = vi.hoisted(() => ({
  listAutomations: vi.fn(), saveAutomation: vi.fn(), deleteAutomation: vi.fn(),
}));
vi.mock('../../apps/api/src/routes/scope', () => ({ caller: async () => actor.current }));
vi.mock('../../apps/api/src/services/aiAutomationService', async (orig) => ({ ...(await orig<typeof import('../../apps/api/src/services/aiAutomationService')>()), ...svc }));

describe('routes (Hono)', () => {
  const csrf = { cookie: 'jq_csrf=abc', 'x-jq-csrf': 'abc', 'content-type': 'application/json' };
  const route = async () => (await import('../../apps/api/src/routes/aiAutomations')).aiAutomations;
  beforeEach(() => {
    actor.current = { userId: ME, token: 'tok', client: {} };
    for (const f of Object.values(svc)) f.mockReset();
    svc.saveAutomation.mockResolvedValue({ ok: true, data: { id: 'id1', created: true } });
    svc.listAutomations.mockResolvedValue({ ok: true, data: [] });
    svc.deleteAutomation.mockResolvedValue({ ok: true, data: { id: 'id1' } });
  });
  const body = (over: Record<string, unknown> = {}) => JSON.stringify({ workspace_id: WS, ...def(), ...over });
  const U = '66666666-6666-4666-8666-666666666666';

  it('requires a signed-in user and a workspace; the identity comes from the session', async () => {
    const r = await route();
    expect((await r.request(`/?workspace_id=${WS}`)).status).toBe(200);
    expect(svc.listAutomations).toHaveBeenCalledWith({ workspaceId: WS, userId: ME, accessToken: 'tok' });
    expect((await r.request('/')).status).toBe(422);
    expect((await r.request('/?workspace_id=nope')).status).toBe(422);
    actor.current = null;
    expect((await r.request(`/?workspace_id=${WS}`)).status).toBe(401);
    expect((await r.request('/', { method: 'POST', headers: csrf, body: body() })).status).toBe(401);
  });

  it('mutations need the CSRF token', async () => {
    const r = await route();
    expect((await r.request('/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body() })).status).toBe(403);
    expect((await r.request('/', { method: 'POST', headers: { ...csrf, 'x-jq-csrf': 'zzz' }, body: body() })).status).toBe(403);
    expect((await r.request(`/${U}/delete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspace_id: WS }) })).status).toBe(403);
    expect(svc.saveAutomation).not.toHaveBeenCalled();
    expect(svc.deleteAutomation).not.toHaveBeenCalled();
  });

  it('create/update accept only the definition keys; ownership fields are rejected, not ignored', async () => {
    const r = await route();
    expect((await r.request('/', { method: 'POST', headers: csrf, body: body() })).status).toBe(201);
    expect(svc.saveAutomation.mock.calls[0]![1]).toBeNull();
    expect(svc.saveAutomation.mock.calls[0]![2]).not.toHaveProperty('workspace_id');
    for (const extra of [{ user_id: PEER }, { id: U }, { owner: PEER }, { settings: {} }, { fallback_provider: 'gemini' }]) {
      expect((await r.request('/', { method: 'POST', headers: csrf, body: body(extra) })).status, JSON.stringify(extra)).toBe(422);
    }
    expect((await r.request('/', { method: 'POST', headers: csrf, body: 'not json' })).status).toBe(422);
    expect((await r.request('/', { method: 'POST', headers: csrf, body: JSON.stringify({ ...def() }) })).status).toBe(422); // no workspace
    expect(svc.saveAutomation).toHaveBeenCalledTimes(1);
    expect((await r.request(`/${U}`, { method: 'POST', headers: csrf, body: body() })).status).toBe(200); // update (create is 201)
    expect(svc.saveAutomation.mock.calls[1]![1]).toBe(U);
    expect((await r.request('/not-a-uuid', { method: 'POST', headers: csrf, body: body() })).status).toBe(404);
  });

  it('maps service errors to HTTP statuses', async () => {
    const r = await route();
    const cases: Array<[string, number]> = [
      ['INVALID_INPUT', 422], ['AUTOMATION_NOT_FOUND', 404], ['AUTOMATION_CONFLICT', 409], ['AUTOMATION_LIMIT', 422], ['WORKSPACE_ACCESS_DENIED', 403], ['AI_HUB_DISABLED', 503], ['SAVE_FAILED', 500],
    ];
    for (const [code, status] of cases) {
      svc.saveAutomation.mockResolvedValueOnce({ ok: false, error: { code, message: 'safe text' } });
      const res = await r.request('/', { method: 'POST', headers: csrf, body: body() });
      expect(res.status, code).toBe(status);
      expect((await res.json()).error.code).toBe(code);
    }
  });

  it('delete is a POST with the workspace in the body; PUT/PATCH/DELETE verbs are not part of the surface', async () => {
    const r = await route();
    expect((await r.request(`/${U}/delete`, { method: 'POST', headers: csrf, body: JSON.stringify({ workspace_id: WS }) })).status).toBe(200);
    expect(svc.deleteAutomation).toHaveBeenCalledWith({ workspaceId: WS, userId: ME, accessToken: 'tok' }, U);
    expect((await r.request(`/${U}/delete`, { method: 'POST', headers: csrf, body: '{}' })).status).toBe(422);
    for (const method of ['PUT', 'PATCH', 'DELETE']) expect((await r.request(`/${U}`, { method, headers: csrf, body: body() })).status, method).toBe(404);
  });
});

