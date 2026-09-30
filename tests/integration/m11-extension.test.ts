import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, makeRecorder, serviceDb } from './harness';

const ready = loadEnv();
const record = makeRecorder('test-results/evidence', 'integration');

describe.skipIf(!ready)('Milestone 11 — browser extension API and token isolation', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const alice = new Actor();
  const bob = new Actor();
  let workspaceId: string;
  let mainToken: string;
  let mainTokenId: string;

  async function createToken(name: string, targetWorkspace = workspaceId, expires = 90) {
    const response = await alice.call('/extension/tokens', {
      workspace_id: targetWorkspace,
      name,
      expires_in_days: expires,
    });
    expect(response.status).toBe(201);
    return {
      raw: response.json.token as string,
      id: response.json.metadata.id as string,
      metadata: response.json.metadata,
    };
  }

  async function extensionCall(token: string, path: string, body?: unknown) {
    return alice.call(path, body, { bearer: token, origin: null });
  }

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();
    for (const [actor, name] of [[alice, 'alice'], [bob, 'bob']] as const) {
      const result = await actor.call('/auth/register', {
        username: `m11_${name}_${run}`,
        password: `Valid-M11-${name}-${run}!`,
      });
      expect(result.status).toBe(201);
    }
    const profile = await admin.from('profiles').select('last_active_workspace_id').eq('user_id', alice.userId!).single();
    workspaceId = profile.data!.last_active_workspace_id;
  });

  it('M11-01 · creates a HMAC-only token, reveals raw secret once, and isolates owner metadata', async () => {
    const created = await createToken('Primary Chrome');
    mainToken = created.raw;
    mainTokenId = created.id;
    expect(mainToken).toMatch(/^jqx_dev_[A-Za-z0-9]{43}$/);
    expect(created.metadata).toMatchObject({ workspace_id: workspaceId, name: 'Primary Chrome', status: 'ACTIVE' });
    expect(created.metadata.token_prefix).toBe(mainToken.slice(0, 12));

    const listed = await alice.call(`/extension/tokens?workspace_id=${workspaceId}`);
    expect(listed.status).toBe(200);
    expect(listed.json.tokens.some((token: { id: string }) => token.id === mainTokenId)).toBe(true);
    expect(JSON.stringify(listed.json)).not.toContain(mainToken);

    const stored = await admin.from('extension_tokens').select('token_hash').eq('id', mainTokenId).single();
    expect(stored.data!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.data!.token_hash).not.toContain(mainToken);
    const ownRows = await alice.db().from('extension_tokens').select('id').eq('id', mainTokenId);
    const peerRows = await bob.db().from('extension_tokens').select('id').eq('id', mainTokenId);
    const verifierProbe = await alice.db().from('extension_tokens').select('token_hash').eq('id', mainTokenId);
    expect(ownRows.data).toHaveLength(1);
    expect(peerRows.data).toHaveLength(0);
    expect(verifierProbe.error).not.toBeNull();
    record('m11-01-token-storage', { rawRevealedOnce: true, hmacOnlyAtRest: true, verifierColumnDenied: true, ownerRows: 1, peerRows: 0 });
  });

  it('M11-02 · serves identity, canonical workflow, and only the token owner’s active resumes', async () => {
    const resume = await alice.db().from('resumes').insert({
      workspace_id: workspaceId,
      user_id: alice.userId!,
      name: 'Extension Resume',
      version_label: 'v11',
      document_type: 'RESUME',
    }).select('id').single();
    expect(resume.error).toBeNull();
    await bob.db().from('resumes').insert({
      workspace_id: (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', bob.userId!).single()).data!.last_active_workspace_id,
      user_id: bob.userId!,
      name: 'Private Bob Resume',
      version_label: 'v1',
    });

    const me = await extensionCall(mainToken, '/ext/v1/me');
    const workflow = await extensionCall(mainToken, '/ext/v1/workflow');
    const documents = await extensionCall(mainToken, '/ext/v1/documents?kind=resume');
    expect(me.status).toBe(200);
    expect(me.json.workspace.id).toBe(workspaceId);
    expect(me.json.scopes).toHaveLength(5);
    expect(workflow.status).toBe(200);
    expect(workflow.json.stages.map((stage: { id: string }) => stage.id)).toContain('SAVED');
    expect(workflow.json.default_action).toBe('APPLIED');
    expect(documents.status).toBe(200);
    expect(documents.json.documents).toHaveLength(1);
    expect(documents.json.documents[0].id).toBe(resume.data!.id);
    record('m11-02-reference-api', { me: 200, workflow: 200, ownerResumeCount: 1 });
  });

  it('M11-03 · preserves EXACT_POSTING, SAME_ROLE, COMPANY_ONLY, and NONE as distinct states', async () => {
    await alice.db().from('applications').insert([
      {
        workspace_id: workspaceId, user_id: alice.userId!, company_name: 'Acme Corp', role_title: 'QA Engineer',
        job_url: 'https://jobs.example.test/ROLE/42/?b=2&a=1', external_job_id: 'REQ-42', source: 'jobs.example.test', stage: 'APPLIED',
      },
      {
        workspace_id: workspaceId, user_id: alice.userId!, company_name: 'Beta Labs', role_title: 'Data Engineer', stage: 'INTERVIEW',
      },
      {
        workspace_id: workspaceId, user_id: alice.userId!, company_name: 'Beta Labs', role_title: 'Product Designer', stage: 'SAVED',
      },
    ]);

    const exact = await extensionCall(mainToken, '/ext/v1/duplicates/check', {
      job_url: 'HTTPS://JOBS.EXAMPLE.TEST/role/42/?utm_source=x&a=1&b=2', company: 'Other', job_title: 'Other',
    });
    const same = await extensionCall(mainToken, '/ext/v1/duplicates/check', { company: ' beta  labs ', job_title: 'Data Engineer' });
    const company = await extensionCall(mainToken, '/ext/v1/duplicates/check', { company: 'Beta Labs', job_title: 'Security Architect' });
    const none = await extensionCall(mainToken, '/ext/v1/duplicates/check', { company: 'New Company', job_title: 'QA Engineer' });
    expect(exact.json.match_type).toBe('EXACT_POSTING');
    expect(same.json.match_type).toBe('SAME_ROLE');
    expect(company.json.match_type).toBe('COMPANY_ONLY');
    expect(company.json.has_duplicate).toBe(false);
    expect(none.json).toMatchObject({ match_type: 'NONE', has_duplicate: false, matches: [] });
    for (const result of [exact, same, company]) {
      expect(result.json.matches.length).toBeGreaterThan(0);
      expect(result.json.matches.length).toBeLessThanOrEqual(3);
      expect(result.json.matches[0].deep_link_path).toMatch(new RegExp(`^/w/${workspaceId}/applications/`));
    }
    record('m11-03-duplicates', { exact: 'EXACT_POSTING', probable: 'SAME_ROLE', possible: 'COMPANY_ONLY', none: 'NONE', bounded: true });
  });

  it('M11-04 · captures application, immutable snapshot, CAPTURED event, and resume link atomically', async () => {
    const resume = await alice.db().from('resumes').select('id, version_label').eq('workspace_id', workspaceId).eq('user_id', alice.userId!).single();
    const captured = await extensionCall(mainToken, '/ext/v1/captures', {
      company: 'Capture Co',
      job_title: 'Platform Engineer',
      stage: 'Saved',
      job_url: 'https://capture.example.test/jobs/1',
      source: 'capture.example.test',
      external_job_id: 'CAP-1',
      location: 'Remote',
      work_arrangement: 'Remote',
      employment_type: 'Full-time',
      salary_min: 120000,
      salary_max: 150000,
      notes: 'Captured from the browser extension',
      applied_at: '2026-09-26T12:00:00.000Z',
      snapshot: { description: 'Immutable posting', requirements: 'TypeScript', skills: 'Postgres', raw_payload: { confidence: 'jsonld' } },
      resume_id: resume.data!.id,
      resume_label: resume.data!.version_label,
    });
    expect(captured.status).toBe(201);
    expect(captured.json.deep_link_path).toBe(`/w/${workspaceId}/applications/${captured.json.id}`);
    const [application, snapshot, events, document] = await Promise.all([
      alice.db().from('applications').select('company_name, role_title, stage, user_id, notes, applied_at').eq('id', captured.json.id).single(),
      alice.db().from('job_snapshots').select('id, job_description').eq('application_id', captured.json.id).single(),
      alice.db().from('application_events').select('event_type').eq('application_id', captured.json.id).order('created_at'),
      alice.db().from('application_documents').select('resume_id, label').eq('application_id', captured.json.id).single(),
    ]);
    expect(application.data).toMatchObject({
      company_name: 'Capture Co', role_title: 'Platform Engineer', stage: 'SAVED', user_id: alice.userId,
      notes: 'Captured from the browser extension', applied_at: '2026-09-26T12:00:00+00:00',
    });
    expect(snapshot.data!.job_description).toBe('Immutable posting');
    expect(events.data!.map((event) => event.event_type)).toEqual(expect.arrayContaining(['CREATED', 'CAPTURED']));
    expect(document.data).toMatchObject({ resume_id: resume.data!.id, label: resume.data!.version_label });
    const immutable = await alice.db().from('job_snapshots').update({ job_description: 'mutated' }).eq('id', snapshot.data!.id);
    expect(immutable.error).toBeTruthy();
    record('m11-04-atomic-capture', { status: 201, application: true, snapshot: true, capturedEvent: true, resumeLink: true, immutable: true });
  });

  it('M11-05 · rejects ownership injection and rolls back an invalid capture completely', async () => {
    const before = await alice.db().from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
    const injected = await extensionCall(mainToken, '/ext/v1/captures', {
      company: 'Injected', job_title: 'Denied', stage: 'APPLIED', workspace_id: '00000000-0000-0000-0000-000000000000', snapshot: {},
    });
    const invalidStage = await extensionCall(mainToken, '/ext/v1/captures', {
      company: 'Rollback', job_title: 'Invalid Stage', stage: 'BOOKMARKED', snapshot: { description: 'must roll back' },
    });
    const after = await alice.db().from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
    expect(injected.status).toBe(422);
    expect(invalidStage.status).toBe(400);
    expect(after.count).toBe(before.count);
    record('m11-05-capture-denials', { ownershipInjection: 422, invalidStage: 400, applicationDelta: 0 });
  });

  it('M11-06 · enforces scope, expiration, revocation, atomic rotation, and live membership', async () => {
    const scoped = await createToken('Scoped');
    await admin.from('extension_tokens').update({ scopes: ['profile:read'] }).eq('id', scoped.id);
    expect((await extensionCall(scoped.raw, '/ext/v1/me')).status).toBe(200);
    expect((await extensionCall(scoped.raw, '/ext/v1/captures', { company: 'No', job_title: 'No', snapshot: {} })).status).toBe(403);

    const expired = await createToken('Expired');
    await admin.from('extension_tokens').update({
      created_at: new Date(Date.now() - 100 * 86_400_000).toISOString(),
      expires_at: new Date(Date.now() - 86_400_000).toISOString(),
    }).eq('id', expired.id);
    expect((await extensionCall(expired.raw, '/ext/v1/me')).status).toBe(401);

    const revoked = await createToken('Revoked');
    expect((await alice.call(`/extension/tokens/${revoked.id}/revoke`, {})).status).toBe(200);
    expect((await extensionCall(revoked.raw, '/ext/v1/me')).status).toBe(401);

    const rotating = await createToken('Rotating');
    const rotated = await alice.call(`/extension/tokens/${rotating.id}/rotate`, { expires_in_days: 90 });
    expect(rotated.status).toBe(201);
    expect((await extensionCall(rotating.raw, '/ext/v1/me')).status).toBe(401);
    expect((await extensionCall(rotated.json.token, '/ext/v1/me')).status).toBe(200);
    const oldRow = await admin.from('extension_tokens').select('revoked_reason, replaced_by_token_id').eq('id', rotating.id).single();
    expect(oldRow.data).toMatchObject({ revoked_reason: 'ROTATED', replaced_by_token_id: rotated.json.metadata.id });

    const sharedId = (await bob.db().rpc('rpc_create_workspace', { p_name: `M11 Shared ${run}` })).data as string;
    await admin.from('workspace_members').insert({ workspace_id: sharedId, user_id: alice.userId!, role: 'USER' });
    const membership = await createToken('Membership bound', sharedId);
    expect((await extensionCall(membership.raw, '/ext/v1/me')).status).toBe(200);
    await admin.from('workspace_members').delete().eq('workspace_id', sharedId).eq('user_id', alice.userId!);
    expect((await extensionCall(membership.raw, '/ext/v1/me')).status).toBe(401);
    record('m11-06-token-enforcement', { missingScope: 403, expired: 401, revoked: 401, rotatedOld: 401, rotatedNew: 200, removedMember: 401 });
  });

  it('M11-07 · rate limits independently per token', async () => {
    process.env.EXTENSION_TOKEN_RATE_LIMIT = '3';
    const { resetEnvCache } = await import('../../apps/api/src/env');
    resetEnvCache();
    const limited = await createToken('Rate limited');
    const separate = await createToken('Separate rate bucket');
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) statuses.push((await extensionCall(limited.raw, '/ext/v1/me')).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect((await extensionCall(separate.raw, '/ext/v1/me')).status).toBe(200);
    record('m11-07-rate-limit', { perTokenLimit: 3, limitedStatuses: statuses, separateTokenStatus: 200 });
  });
});
