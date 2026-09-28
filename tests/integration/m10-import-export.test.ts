import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, anonDb, loadEnv, makeRecorder, serviceDb } from './harness';

const ready = loadEnv();
const record = makeRecorder('migration-upgrade/m10/evidence', 'integration');

function csv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\r\n');
}

describe.skipIf(!ready)('Milestone 10 — import and export', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const alice = new Actor();
  const bob = new Actor();
  const manager = new Actor();
  let workspaceId: string;
  let duplicateId: string;
  let batchId: string;

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();
    for (const [actor, name] of [[alice, 'alice'], [bob, 'bob'], [manager, 'manager']] as const) {
      const result = await actor.call('/auth/register', { username: `m10_${name}_${run}`, password: `Valid-M10-${name}-${run}!` });
      expect(result.status).toBe(201);
    }
    workspaceId = (await manager.db().rpc('rpc_create_workspace', { p_name: `M10 Shared ${run}` })).data as string;
    await admin.from('workspace_members').insert([
      { workspace_id: workspaceId, user_id: alice.userId!, role: 'USER' },
      { workspace_id: workspaceId, user_id: bob.userId!, role: 'USER' },
    ]);
    const seeded = await alice.db().from('applications').insert({
      workspace_id: workspaceId, user_id: alice.userId!, company_name: 'Acme', role_title: 'Engineer', applied_at: '2026-09-26T00:00:00Z', job_url: 'https://example.test/jobs/1',
    }).select('id').single();
    expect(seeded.error).toBeNull();
    duplicateId = seeded.data!.id;
  });

  it('M10-01 · previews aliases, hard-errors unknown/ownership fields, and detects exact duplicates', async () => {
    const content = csv([
      ['Company Name', 'Title', 'Applied Date', 'URL', 'Mystery'],
      ['Acme', 'Engineer', '2026-09-26', 'https://example.test/jobs/1/', 'x'],
    ]);
    const preview = await manager.call('/import/preview', { workspace_id: workspaceId, owner_id: alice.userId, format: 'CSV', content });
    expect(preview.status).toBe(200);
    expect(preview.json.suggested_mapping).toMatchObject({ 'Company Name': 'company', Title: 'job_title', 'Applied Date': 'date_applied', URL: 'job_url', Mystery: null });
    expect(preview.json.rows[0].validation_status).toBe('INVALID');
    expect(preview.json.rows[0].messages).toContain('Unknown field: Mystery');

    const clean = await manager.call('/import/preview', {
      workspace_id: workspaceId, owner_id: alice.userId, format: 'CSV',
      content: csv([['Company Name', 'Role', 'Date', 'Job Link'], ['Acme', 'Engineer', '2026-09-26', 'https://example.test/jobs/1/']]),
    });
    expect(clean.json.rows[0]).toMatchObject({ validation_status: 'DUPLICATE', duplicate_id: duplicateId });

    const ownership = await manager.call('/import/preview', {
      workspace_id: workspaceId, owner_id: alice.userId, format: 'JSON',
      content: JSON.stringify([{ company: 'Bad', job_title: 'Row', date_applied: '2026-09-26', user_id: bob.userId }]),
    });
    expect(ownership.json.rows[0].messages.join(' ')).toMatch(/not allowed/);
    record('m10-01-preview-contract', { aliasesMapped: true, unknownHardError: true, ownershipHardError: true, duplicateDetected: true });
  });

  it('M10-02 · manager commits for a member while a regular user cannot target a peer', async () => {
    const content = csv([
      ['company', 'job_title', 'date_applied', 'stage', 'notes'],
      ['Acme', 'Engineer', '2026-09-26', 'Applied', 'duplicate skipped'],
      ['Beta Labs', 'Platform Engineer', '2026-09-25', 'Interview', '=formula text'],
      ['Broken', '', '2026-99-99', 'Applied', 'invalid'],
    ]);
    const committed = await manager.call('/import', {
      workspace_id: workspaceId, owner_id: alice.userId, format: 'CSV', content,
      import_mode: 'VALID_ROWS_ONLY', duplicate_action: 'SKIP',
    });
    expect(committed.status).toBe(201);
    expect(committed.json.result).toMatchObject({ status: 'COMPLETED', total_rows: 3, created_rows: 1, skipped_rows: 1, rejected_rows: 1, duplicate_rows: 1 });
    batchId = committed.json.result.import_batch_id;
    const beta = await alice.db().from('applications').select('user_id, notes').eq('workspace_id', workspaceId).eq('company_name', 'Beta Labs').single();
    expect(beta.data).toMatchObject({ user_id: alice.userId, notes: '=formula text' });

    const denied = await bob.call('/import', {
      workspace_id: workspaceId, owner_id: alice.userId, format: 'CSV',
      content: csv([['company', 'job_title', 'date_applied'], ['Peer write', 'No', '2026-09-26']]),
      import_mode: 'VALID_ROWS_ONLY', duplicate_action: 'SKIP',
    });
    expect(denied.status).toBe(403);
    record('m10-02-owner-manager', { managerTargetCreated: true, regularPeerDenied: 403 });
  });

  it('M10-03 · import history is durable, owner/manager visible, peer isolated, and anonymous denied', async () => {
    const ownerHistory = await alice.db().from('import_batches').select('id,status').eq('id', batchId);
    const managerHistory = await manager.db().from('import_batches').select('id,status').eq('id', batchId);
    const peerHistory = await bob.db().from('import_batches').select('id').eq('id', batchId);
    const anonymous = await anonDb().from('import_batches').select('id');
    expect(ownerHistory.data).toHaveLength(1);
    expect(managerHistory.data).toHaveLength(1);
    expect(peerHistory.data).toHaveLength(0);
    expect(anonymous.error).toBeTruthy();

    const rows = await alice.call(`/import/history/${batchId}/rows`);
    expect(rows.status).toBe(200);
    expect(rows.json.rows).toHaveLength(3);
    expect(JSON.stringify(rows.json.rows)).not.toContain('duplicate skipped');
    record('m10-03-history-rls', { ownerRows: 1, managerRows: 1, peerRows: 0, anonymousDenied: true, rawInputRetained: false });
  });

  it('M10-04 · all-or-nothing rejection writes history but no application', async () => {
    const before = await alice.db().from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
    const result = await alice.call('/import', {
      workspace_id: workspaceId, owner_id: alice.userId, format: 'JSON',
      content: JSON.stringify([
        { company: 'Rollback Co', job_title: 'Valid', date_applied: '2026-09-24' },
        { company: 'Rollback Co', job_title: '', date_applied: '2026-09-24' },
      ]),
      import_mode: 'ALL_OR_NOTHING', duplicate_action: 'SKIP',
    });
    expect(result.status).toBe(201);
    expect(result.json.result).toMatchObject({ status: 'REJECTED', created_rows: 0, rejected_rows: 2 });
    const after = await alice.db().from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
    expect(after.count).toBe(before.count);
    const historyRows = await alice.db().from('import_rows').select('outcome').eq('batch_id', result.json.result.import_batch_id);
    expect(historyRows.data?.every((row) => row.outcome === 'NOT_COMMITTED')).toBe(true);
    record('m10-04-all-or-nothing', { status: 'REJECTED', applicationDelta: 0, retainedOutcomes: 2 });
  });

  it('M10-05 · an unexpected database failure rolls back every app and audit row atomically', async () => {
    const beforeApps = await alice.db().from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
    const beforeBatches = await alice.db().from('import_batches').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
    const result = await alice.call('/import', {
      workspace_id: workspaceId, owner_id: alice.userId, format: 'JSON',
      content: JSON.stringify([
        { company: 'Atomic First', job_title: 'Engineer', date_applied: '2026-09-23' },
        { company: 'Atomic Second', job_title: 'Engineer', date_applied: '2026-09-22', recruiter_name: 'Recruiter', recruiter_email: `${'a'.repeat(260)}@x.test` },
      ]),
      import_mode: 'VALID_ROWS_ONLY', duplicate_action: 'SKIP',
    });
    expect(result.status).toBe(400);
    const afterApps = await alice.db().from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
    const afterBatches = await alice.db().from('import_batches').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
    expect(afterApps.count).toBe(beforeApps.count);
    expect(afterBatches.count).toBe(beforeBatches.count);
    record('m10-05-transaction-rollback', { routeStatus: 400, applicationDelta: 0, batchDelta: 0 });
  });

  it('M10-06 · every export route is authorized and spreadsheet output neutralizes formula cells', async () => {
    await alice.db().from('applications').insert({ workspace_id: workspaceId, user_id: alice.userId!, company_name: '=FORMULA()', role_title: '@ROLE', applied_at: '2026-09-21T00:00:00Z' });
    const csvExport = await alice.call(`/exports/applications?workspace_id=${workspaceId}&owner_id=${alice.userId}`);
    expect(csvExport.status).toBe(200);
    expect(csvExport.headers.get('content-type')).toContain('text/csv');
    expect(csvExport.json).toEqual({});
    const transcriptEntry = (await import('./harness')).transcript.at(-1)!;
    expect(transcriptEntry.body).toContain("'=FORMULA()");
    expect(transcriptEntry.body).toContain("'@ROLE");

    for (const type of ['interviews', 'rejections', 'follow_ups', 'networking', 'reminders', 'goals', 'tasks', 'habits', 'notes', 'resume-analytics', 'aging', 'stage-duration']) {
      const response = await alice.call(`/exports/${type}?workspace_id=${workspaceId}&owner_id=${alice.userId}`);
      expect(response.status, type).toBe(200);
    }
    const xlsx = await alice.call(`/exports/applications.xlsx?workspace_id=${workspaceId}&owner_id=${alice.userId}`);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers.get('content-type')).toContain('spreadsheetml');
    const json = await manager.call(`/exports/json?workspace_id=${workspaceId}&owner_id=ALL`);
    expect(json.status).toBe(200);
    expect(json.json).toMatchObject({ export_version: 2, restore_supported: false, owner_scope: 'ALL' });
    record('m10-06-exports', { csvTypes: 13, xlsx: 200, jsonWorkspaceScope: true, formulaNeutralized: true });
  });
});
