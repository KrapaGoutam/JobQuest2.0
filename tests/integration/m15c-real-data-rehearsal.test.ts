import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { existsSync } from 'node:fs';
import {
  runMigration,
  rollbackMigration,
  runProductionPreflight
} from '../../scripts/migrate-legacy-data.mjs';

const { Client } = pg;

describe('M15-C Real Data Rehearsal & Reconciliation Integration Test', () => {
  const localPort = '55322';
  const targetDbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || `postgresql://postgres:${process.env.PGPASSWORD || 'postgres'}@127.0.0.1:${localPort}/postgres`;
  const exportPath = 'C:/Users/krapa/Documents/Job Search/JobTrackerProjects/_secure-backups/jobquest1/20260928_110500/legacy_neon_export_20260928_110500.json';
  const realDataWorkspaceId = '018f0000-0000-4000-8000-000000000002';
  const workspaceName = 'JobQuest Real Data Rehearsal';

  let db: any;

  beforeAll(async () => {
    if (!existsSync(exportPath)) {
      throw new Error(`Real export file not found at: ${exportPath}`);
    }

    db = new Client({ connectionString: targetDbUrl });
    await db.connect();

    // Clean up any residual data for this test workspace
    await rollbackMigration({
      targetUrl: targetDbUrl,
      workspaceId: realDataWorkspaceId,
      confirmNonProduction: true
    }).catch(() => {});
  });

  afterAll(async () => {
    // Cleanup rehearsal workspace after tests
    await rollbackMigration({
      targetUrl: targetDbUrl,
      workspaceId: realDataWorkspaceId,
      confirmNonProduction: true
    }).catch(() => {});
    await db.end();
  });

  it('verifies read-only target preflight succeeds against target database', async () => {
    const preflight = await runProductionPreflight({ targetUrl: targetDbUrl });
    expect(preflight.success).toBe(true);
    expect(preflight.readOnly).toBe(true);
    expect(preflight.checks.length).toBeGreaterThanOrEqual(6);

    const checkNames = preflight.checks.map((c: { name: string }) => c.name);
    expect(checkNames).toContain('connection');
    expect(checkNames).toContain('migrations');
    expect(checkNames).toContain('legacy_columns');
    expect(checkNames).toContain('migration_tables');
    expect(checkNames).toContain('domain_tables');
    expect(checkNames).toContain('rls_status');
  });

  it('executes dry-run validation with real export without mutating database', async () => {
    const report = await runMigration({
      source: exportPath,
      targetUrl: targetDbUrl,
      workspaceId: realDataWorkspaceId,
      workspaceName,
      dryRun: true,
      confirmNonProduction: true
    });

    expect(report.status).toBe('DRY_RUN_SUCCESS');
    expect(report.pin_hashes_migrated).toBe(0);
    expect(report.counts.users.migrated).toBe(1);
    expect(report.counts.applications.migrated).toBe(222);
    expect(report.counts.job_snapshots.migrated).toBe(89);

    // Verify zero writes occurred
    const ws = await db.query('SELECT id FROM public.workspaces WHERE id = $1', [realDataWorkspaceId]);
    expect(ws.rowCount).toBe(0);

    const apps = await db.query('SELECT id FROM public.applications WHERE workspace_id = $1', [realDataWorkspaceId]);
    expect(apps.rowCount).toBe(0);
  });

  it('executes full live migration with real legacy data into isolated workspace', async () => {
    const report = await runMigration({
      source: exportPath,
      targetUrl: targetDbUrl,
      workspaceId: realDataWorkspaceId,
      workspaceName,
      dryRun: false,
      confirmNonProduction: true
    });

    expect(report.status).toBe('COMPLETED');
    expect(report.pin_hashes_migrated).toBe(0); // STRICT INVARIANT: ZERO PIN HASHES

    // Verify exact migration counts
    expect(report.counts.users.migrated).toBe(1);
    expect(report.counts.applications.migrated).toBe(222);
    expect(report.counts.job_snapshots.migrated).toBe(89);
    expect(report.counts.tags.migrated).toBe(49);
    expect(report.claim_codes.length).toBe(1);

    // 1. Verify user profile & Option B claim code
    const profRes = await db.query(
      `SELECT p.user_id, p.display_name, p.email, p.legacy_user_id, p.theme_preference, p.week_start,
              ua.username, ua.status as account_status, c.code_hint
       FROM public.profiles p
       JOIN public.user_accounts ua ON ua.user_id = p.user_id
       LEFT JOIN public.legacy_claim_codes c ON c.user_id = p.user_id
       WHERE p.legacy_user_id = 1`
    );
    expect(profRes.rowCount).toBe(1);
    const prof = profRes.rows[0];
    expect(prof.username).toBe('jack');
    expect(prof.display_name).toBe('Jack');
    expect(prof.account_status).toBe('STAGED');
    expect(prof.theme_preference).toBe('dark');
    expect(prof.week_start).toBe(1);
    expect(prof.code_hint).toBeTruthy();

    // Invariant check: verify no password hash was stored in user_credentials
    const credCheck = await db.query('SELECT user_id FROM public.user_credentials WHERE user_id = $1', [prof.user_id]);
    expect(credCheck.rowCount).toBe(0);

    // 2. Verify workspace and membership
    const wsRes = await db.query('SELECT * FROM public.workspaces WHERE id = $1', [realDataWorkspaceId]);
    expect(wsRes.rowCount).toBe(1);
    const memberRes = await db.query(
      'SELECT role FROM public.workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [realDataWorkspaceId, prof.user_id]
    );
    expect(memberRes.rowCount).toBe(1);
    expect(memberRes.rows[0].role).toBe('MANAGER');

    // 3. Verify applications stage breakdown
    const stageCountsRes = await db.query(
      `SELECT stage, status, outcome, count(*)::int as cnt
       FROM public.applications
       WHERE workspace_id = $1
       GROUP BY stage, status, outcome
       ORDER BY cnt DESC`,
      [realDataWorkspaceId]
    );

    const breakdown = stageCountsRes.rows;
    const totalApps = breakdown.reduce((acc: number, r: any) => acc + r.cnt, 0);
    expect(totalApps).toBe(222);

    // Exact stage parity: 151 Applied, 37 Saved, 27 Withdrawn, 7 Rejected
    const appliedRow = breakdown.find((r: any) => r.stage === 'APPLIED' && r.status === 'OPEN' && r.outcome === null);
    expect(appliedRow.cnt).toBe(151);

    const savedRow = breakdown.find((r: any) => r.stage === 'SAVED' && r.status === 'OPEN' && r.outcome === null);
    expect(savedRow.cnt).toBe(37);

    const withdrawnRow = breakdown.find((r: any) => r.stage === 'APPLIED' && r.status === 'CLOSED' && r.outcome === 'WITHDRAWN');
    expect(withdrawnRow.cnt).toBe(27);

    const rejectedRow = breakdown.find((r: any) => r.stage === 'APPLIED' && r.status === 'CLOSED' && r.outcome === 'REJECTED');
    expect(rejectedRow.cnt).toBe(7);

    // 4. Verify 36 'Internship' applications retained 'Internship' tag
    const internTagRes = await db.query(
      `SELECT count(*)::int as cnt
       FROM public.applications
       WHERE workspace_id = $1 AND 'Internship' = ANY(tags)`,
      [realDataWorkspaceId]
    );
    expect(internTagRes.rows[0].cnt).toBeGreaterThanOrEqual(36);

    const internEmpTypeRes = await db.query(
      `SELECT count(*)::int as cnt
       FROM public.applications
       WHERE workspace_id = $1 AND employment_type = 'Internship'`,
      [realDataWorkspaceId]
    );
    expect(internEmpTypeRes.rows[0].cnt).toBe(0); // Validates target check constraint was preserved

    // 5. Verify 89 job snapshots created
    const snapRes = await db.query(
      'SELECT count(*)::int as cnt FROM public.job_snapshots WHERE workspace_id = $1',
      [realDataWorkspaceId]
    );
    expect(snapRes.rows[0].cnt).toBe(89);

    // 6. Verify application lifecycle events (222 app creations + 89 snapshot captures + 222 lifecycle backfills = 533)
    const evtRes = await db.query(
      'SELECT count(*)::int as cnt FROM public.application_events WHERE workspace_id = $1',
      [realDataWorkspaceId]
    );
    expect(evtRes.rows[0].cnt).toBe(533);

    // Verify event composition
    const evtTypes = await db.query(
      'SELECT event_type, count(*)::int as cnt FROM public.application_events WHERE workspace_id = $1 GROUP BY event_type',
      [realDataWorkspaceId]
    );
    const evtMap = Object.fromEntries(evtTypes.rows.map((r: any) => [r.event_type, r.cnt]));
    expect(evtMap.CREATED).toBe(222); // app creation trigger
    expect(evtMap.CAPTURED).toBe(89 + 37); // 89 from snapshot capture trigger + 37 from Saved applications
    expect(evtMap.APPLIED).toBe(151); // 151 from Applied applications
    expect(evtMap.OUTCOME_CHANGED).toBe(34); // 27 Withdrawn + 7 Rejected

    // 7. Verify zero foreign key orphans
    const orphanApps = await db.query(
      'SELECT count(*)::int as cnt FROM public.applications WHERE workspace_id = $1 AND user_id NOT IN (SELECT user_id FROM public.profiles)',
      [realDataWorkspaceId]
    );
    expect(orphanApps.rows[0].cnt).toBe(0);

    const orphanSnaps = await db.query(
      'SELECT count(*)::int as cnt FROM public.job_snapshots WHERE workspace_id = $1 AND application_id NOT IN (SELECT id FROM public.applications)',
      [realDataWorkspaceId]
    );
    expect(orphanSnaps.rows[0].cnt).toBe(0);

    const orphanEvts = await db.query(
      'SELECT count(*)::int as cnt FROM public.application_events WHERE workspace_id = $1 AND application_id NOT IN (SELECT id FROM public.applications)',
      [realDataWorkspaceId]
    );
    expect(orphanEvts.rows[0].cnt).toBe(0);

    // 8. Verify migration_id_mappings table
    const mapRes = await db.query(
      `SELECT count(*)::int as cnt FROM public.migration_id_mappings
       WHERE batch_id = (SELECT batch_id FROM public.migration_batches WHERE target_workspace_id = $1)`,
      [realDataWorkspaceId]
    );
    expect(mapRes.rows[0].cnt).toBe(223); // 222 applications + 1 user
  });

  it('proves clean rollback of the rehearsal workspace', async () => {
    const rb = await rollbackMigration({
      targetUrl: targetDbUrl,
      workspaceId: realDataWorkspaceId,
      confirmNonProduction: true
    });
    expect(rb.success).toBe(true);

    const ws = await db.query('SELECT id FROM public.workspaces WHERE id = $1', [realDataWorkspaceId]);
    expect(ws.rowCount).toBe(0);

    const apps = await db.query('SELECT id FROM public.applications WHERE workspace_id = $1', [realDataWorkspaceId]);
    expect(apps.rowCount).toBe(0);

    const snaps = await db.query('SELECT id FROM public.job_snapshots WHERE workspace_id = $1', [realDataWorkspaceId]);
    expect(snaps.rowCount).toBe(0);

    const evts = await db.query('SELECT id FROM public.application_events WHERE workspace_id = $1', [realDataWorkspaceId]);
    expect(evts.rowCount).toBe(0);
  });
});
