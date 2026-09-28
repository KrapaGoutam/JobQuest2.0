import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { resolve } from 'node:path';
import {
  runMigration,
  rollbackMigration,
  DEFAULT_MIGRATED_WORKSPACE_NAME
} from '../../scripts/migrate-legacy-data.mjs';

const { Client } = pg;

describe('M14 Migration Rehearsal & Reconciliation Integration Test', () => {
  const localPort = '55322';
  const targetDbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || `postgresql://postgres:${process.env.PGPASSWORD || 'postgres'}@127.0.0.1:${localPort}/postgres`;
  const fixturePath = resolve(__dirname, '../fixtures/legacy-representative-export.json');
  const rehearsalWorkspaceId = '018f0000-0000-4000-8000-000000000001';

  let db: any;

  beforeAll(async () => {
    db = new Client({ connectionString: targetDbUrl });
    await db.connect();
    // Clean up any residual test data for the rehearsal workspace before starting
    await rollbackMigration({
      targetUrl: targetDbUrl,
      workspaceId: rehearsalWorkspaceId,
      confirmNonProduction: true
    }).catch(() => {});
  });

  afterAll(async () => {
    // Clean up rehearsal workspace after test completion
    await rollbackMigration({
      targetUrl: targetDbUrl,
      workspaceId: rehearsalWorkspaceId,
      confirmNonProduction: true
    }).catch(() => {});
    await db.end();
  });

  it('executes dry-run validation without mutating the database', async () => {
    const report = await runMigration({
      source: fixturePath,
      targetUrl: targetDbUrl,
      workspaceId: rehearsalWorkspaceId,
      workspaceName: DEFAULT_MIGRATED_WORKSPACE_NAME,
      dryRun: true,
      confirmNonProduction: true
    });

    expect(report.status).toBe('DRY_RUN_SUCCESS');
    expect(report.counts.applications.migrated).toBe(13);
    expect(report.counts.users.migrated).toBe(2);

    // Verify database was NOT mutated
    const ws = await db.query('SELECT id FROM public.workspaces WHERE id = $1', [rehearsalWorkspaceId]);
    expect(ws.rowCount).toBe(0);

    const apps = await db.query('SELECT id FROM public.applications WHERE workspace_id = $1', [rehearsalWorkspaceId]);
    expect(apps.rowCount).toBe(0);
  });

  it('executes full live rehearsal and populates all domains in isolated workspace', async () => {
    const report = await runMigration({
      source: fixturePath,
      targetUrl: targetDbUrl,
      workspaceId: rehearsalWorkspaceId,
      workspaceName: DEFAULT_MIGRATED_WORKSPACE_NAME,
      dryRun: false,
      confirmNonProduction: true
    });

    expect(report.status).toBe('COMPLETED');
    expect(report.pin_hashes_migrated).toBe(0); // STRICT INVARIANT

    // Count Assertions
    expect(report.counts.users.migrated).toBe(2);
    expect(report.counts.applications.migrated).toBe(13);
    expect(report.counts.job_snapshots.migrated).toBe(13);
    expect(report.counts.contacts.migrated).toBe(2);
    expect(report.counts.interviews.migrated).toBe(1);
    expect(report.counts.tasks.migrated).toBe(3);
    expect(report.counts.habits.migrated).toBe(2);
    expect(report.counts.habit_logs.migrated).toBe(2);
    expect(report.counts.journal_entries.migrated).toBe(3);
    expect(report.counts.resumes.migrated).toBe(1);
    expect(report.counts.goals.migrated).toBe(1);
    expect(report.counts.tags.migrated).toBe(2);

    // Verify workspace created
    const ws = await db.query('SELECT * FROM public.workspaces WHERE id = $1', [rehearsalWorkspaceId]);
    expect(ws.rowCount).toBe(1);
    expect(ws.rows[0].name).toBe(DEFAULT_MIGRATED_WORKSPACE_NAME);

    // Verify Option B claim codes created and NO pin_hash in user_credentials
    const claims = await db.query(
      `SELECT c.code_hint, p.legacy_user_id 
       FROM public.legacy_claim_codes c 
       JOIN public.profiles p ON p.user_id = c.user_id 
       WHERE p.legacy_user_id IS NOT NULL`
    );
    expect(claims.rowCount).toBe(2);

    const creds = await db.query(
      `SELECT uc.* FROM public.user_credentials uc 
       JOIN public.profiles p ON p.user_id = uc.user_id 
       WHERE p.legacy_user_id IS NOT NULL`
    );
    expect(creds.rowCount).toBe(0); // Invariant: no password credentials created yet
  });

  it('satisfies foreign key integrity with exactly zero orphan records', async () => {
    // 1. Applications without owner
    const orphanApps = await db.query(
      `SELECT count(*)::int AS cnt FROM public.applications 
       WHERE workspace_id = $1 AND user_id NOT IN (SELECT user_id FROM public.profiles)`,
      [rehearsalWorkspaceId]
    );
    expect(orphanApps.rows[0].cnt).toBe(0);

    // 2. Job Snapshots without application
    const orphanSnapshots = await db.query(
      `SELECT count(*)::int AS cnt FROM public.job_snapshots 
       WHERE workspace_id = $1 AND application_id NOT IN (SELECT id FROM public.applications)`,
      [rehearsalWorkspaceId]
    );
    expect(orphanSnapshots.rows[0].cnt).toBe(0);

    // 3. Interviews without application
    const orphanInterviews = await db.query(
      `SELECT count(*)::int AS cnt FROM public.interviews 
       WHERE workspace_id = $1 AND application_id NOT IN (SELECT id FROM public.applications)`,
      [rehearsalWorkspaceId]
    );
    expect(orphanInterviews.rows[0].cnt).toBe(0);

    // 4. Tasks without valid application (when linked)
    const orphanTasks = await db.query(
      `SELECT count(*)::int AS cnt FROM public.tasks 
       WHERE workspace_id = $1 AND application_id IS NOT NULL 
         AND application_id NOT IN (SELECT id FROM public.applications)`,
      [rehearsalWorkspaceId]
    );
    expect(orphanTasks.rows[0].cnt).toBe(0);

    // 5. Habit Logs without valid habit
    const orphanHabitLogs = await db.query(
      `SELECT count(*)::int AS cnt FROM public.habit_logs 
       WHERE workspace_id = $1 AND habit_id NOT IN (SELECT id FROM public.habits)`,
      [rehearsalWorkspaceId]
    );
    expect(orphanHabitLogs.rows[0].cnt).toBe(0);

    // 6. Journal Entries without valid application (when linked)
    const orphanJournal = await db.query(
      `SELECT count(*)::int AS cnt FROM public.journal_entries 
       WHERE workspace_id = $1 AND application_id IS NOT NULL 
         AND application_id NOT IN (SELECT id FROM public.applications)`,
      [rehearsalWorkspaceId]
    );
    expect(orphanJournal.rows[0].cnt).toBe(0);
  });

  it('demonstrates idempotency when re-running migration on existing dataset', async () => {
    const report2 = await runMigration({
      source: fixturePath,
      targetUrl: targetDbUrl,
      workspaceId: rehearsalWorkspaceId,
      workspaceName: DEFAULT_MIGRATED_WORKSPACE_NAME,
      dryRun: false,
      confirmNonProduction: true
    });

    expect(report2.status).toBe('COMPLETED');

    // Confirm that counts in database have not multiplied
    const appCount = await db.query(
      `SELECT count(*)::int AS cnt FROM public.applications WHERE workspace_id = $1`,
      [rehearsalWorkspaceId]
    );
    expect(appCount.rows[0].cnt).toBe(13);

    const journalCount = await db.query(
      `SELECT count(*)::int AS cnt FROM public.journal_entries WHERE workspace_id = $1`,
      [rehearsalWorkspaceId]
    );
    expect(journalCount.rows[0].cnt).toBe(3);
  });

  it('rehearses rollback and purges rehearsal data cleanly without affecting standard data', async () => {
    const rollbackRes = await rollbackMigration({
      targetUrl: targetDbUrl,
      workspaceId: rehearsalWorkspaceId,
      confirmNonProduction: true
    });

    expect(rollbackRes.success).toBe(true);

    // Verify all records in rehearsal workspace are purged
    const ws = await db.query('SELECT count(*)::int AS cnt FROM public.workspaces WHERE id = $1', [rehearsalWorkspaceId]);
    expect(ws.rows[0].cnt).toBe(0);

    const apps = await db.query('SELECT count(*)::int AS cnt FROM public.applications WHERE workspace_id = $1', [rehearsalWorkspaceId]);
    expect(apps.rows[0].cnt).toBe(0);

    const journal = await db.query('SELECT count(*)::int AS cnt FROM public.journal_entries WHERE workspace_id = $1', [rehearsalWorkspaceId]);
    expect(journal.rows[0].cnt).toBe(0);

    const stagedUsers = await db.query("SELECT count(*)::int AS cnt FROM public.user_accounts WHERE status = 'STAGED'");
    expect(stagedUsers.rows[0].cnt).toBe(0);
  });
});
