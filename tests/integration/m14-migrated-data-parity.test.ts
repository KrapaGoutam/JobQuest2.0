import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import path from 'path';
import { runMigration, rollbackMigration } from '../../scripts/migrate-legacy-data.mjs';

const localPort = '55322';
const targetDbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || `postgresql://postgres:${process.env.PGPASSWORD || 'postgres'}@127.0.0.1:${localPort}/postgres`;
const parityWorkspaceId = '018f0000-0000-4000-8000-000000000002';
const fixturePath = path.resolve(__dirname, '../fixtures/legacy-representative-export.json');

describe('M14 Migrated Data Parity & Global Search Integration Test', () => {
  let db: Client;
  let primaryUserId: string;

  beforeAll(async () => {
    db = new Client({ connectionString: targetDbUrl });
    await db.connect();

    // Ensure clean state before running parity suite
    try {
      await rollbackMigration({
        targetUrl: targetDbUrl,
        workspaceId: parityWorkspaceId,
        confirmNonProduction: true
      });
    } catch {
      // Ignore if not present
    }

    // Run migration rehearsal for parity workspace
    const report = await runMigration({
      source: fixturePath,
      targetUrl: targetDbUrl,
      workspaceId: parityWorkspaceId,
      workspaceName: 'JobQuest Parity (Migrated)',
      dryRun: false,
      confirmNonProduction: true
    });
    expect(report.status).toBe('COMPLETED');

    const userRes = await db.query(
      `SELECT user_id FROM public.profiles WHERE legacy_user_id = 1`
    );
    primaryUserId = userRes.rows[0].user_id;
  });

  afterAll(async () => {
    // Clean rollback
    try {
      await rollbackMigration({
        targetUrl: targetDbUrl,
        workspaceId: parityWorkspaceId,
        confirmNonProduction: true
      });
    } finally {
      await db.end();
    }
  });

  async function searchAsUser(query: string, wsId: string, callerId = primaryUserId) {
    await db.query('BEGIN');
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [callerId]);
    try {
      const res = await db.query(`SELECT * FROM public.rpc_global_search($1, $2)`, [query, wsId]);
      await db.query('COMMIT');
      return res.rows;
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  }

  describe('1. Global Search Parity on Migrated Data (rpc_global_search)', () => {
    it('indexes and discovers migrated applications via rpc_global_search', async () => {
      const rows = await searchAsUser('TechNova', parityWorkspaceId);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const appMatch = rows.find((r: any) => r.domain === 'application' && r.title.includes('TechNova'));
      expect(appMatch).toBeDefined();
      expect(appMatch.title).toContain('Full Stack Developer');
    });

    it('indexes and discovers migrated contacts via rpc_global_search', async () => {
      const rows = await searchAsUser('Carol Danvers', parityWorkspaceId);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const contactMatch = rows.find((r: any) => r.domain === 'contact' && r.title.includes('Carol Danvers'));
      expect(contactMatch).toBeDefined();
    });

    it('indexes and discovers migrated notes / journal entries via rpc_global_search', async () => {
      const rows = await searchAsUser('Turbopack', parityWorkspaceId);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const noteMatch = rows.find((r: any) => r.domain === 'note' && r.snippet.includes('Turbopack'));
      expect(noteMatch).toBeDefined();
      expect(noteMatch.title).toBe('Vercel Interview Preparation Notes');
    });

    it('indexes and discovers migrated interviews via rpc_global_search', async () => {
      const rows = await searchAsUser('Guillermo Rauch', parityWorkspaceId);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const intMatch = rows.find((r: any) => r.domain === 'interview');
      expect(intMatch).toBeDefined();
      expect(intMatch.snippet).toContain('Guillermo Rauch');
    });

    it('indexes and discovers migrated resumes / documents via rpc_global_search', async () => {
      const rows = await searchAsUser('Senior Frontend Resume', parityWorkspaceId);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const docMatch = rows.find((r: any) => r.domain === 'document');
      expect(docMatch).toBeDefined();
      expect(docMatch.title).toContain('Senior Frontend Resume');
    });
  });

  describe('2. Career Journal Parity (M13 Notes Migration)', () => {
    it('preserves note types and maps them to structured journal_entries', async () => {
      const res = await db.query(
        `SELECT entry_type, title, is_pinned 
         FROM public.journal_entries 
         WHERE workspace_id = $1 
         ORDER BY title`,
        [parityWorkspaceId]
      );
      expect(res.rowCount).toBe(3);

      const types = res.rows.map((r: any) => r.entry_type);
      expect(types).toContain('INTERVIEW_PREP'); // mapped from 'interview'
      expect(types).toContain('REFLECTION');     // mapped from 'daily_journal'
      expect(types).toContain('POST_MORTEM');    // mapped from 'reflection'

      // Verify pinned status
      const pinned = res.rows.find((r: any) => r.is_pinned === true);
      expect(pinned).toBeDefined();
      expect(pinned.title).toBe('OpenAI Offer Analysis & Counter-Strategy');
    });
  });

  describe('3. Analytics & Funnel Parity on Migrated Data', () => {
    it('preserves distinct stages and terminal outcome distributions', async () => {
      const stageDist = await db.query(
        `SELECT stage, count(*)::int AS cnt 
         FROM public.applications 
         WHERE workspace_id = $1 
         GROUP BY stage ORDER BY stage`,
        [parityWorkspaceId]
      );
      expect(stageDist.rows.length).toBeGreaterThanOrEqual(4);

      const statusDist = await db.query(
        `SELECT status, outcome, count(*)::int AS cnt 
         FROM public.applications 
         WHERE workspace_id = $1 
         GROUP BY status, outcome ORDER BY status, outcome`,
        [parityWorkspaceId]
      );
      
      const openApps = statusDist.rows.filter((r: any) => r.status === 'OPEN');
      const closedApps = statusDist.rows.filter((r: any) => r.status === 'CLOSED');
      
      expect(openApps.length).toBeGreaterThan(0);
      expect(closedApps.length).toBeGreaterThan(0);

      // Verify specific terminal outcomes
      const outcomes = closedApps.map((r: any) => r.outcome);
      expect(outcomes).toContain('ACCEPTED');
      expect(outcomes).toContain('REJECTED');
      expect(outcomes).toContain('WITHDRAWN');
      expect(outcomes).toContain('GHOSTED');
      expect(outcomes).toContain('POSITION_CLOSED');
    });

    it('populates backfilled application events for historical analytics continuity', async () => {
      const events = await db.query(
        `SELECT event_type, count(*)::int AS cnt 
         FROM public.application_events 
         WHERE workspace_id = $1 
         GROUP BY event_type`,
        [parityWorkspaceId]
      );
      expect(events.rows.length).toBeGreaterThan(0);
      const eventTypes = events.rows.map((r: any) => r.event_type);
      expect(eventTypes).toContain('CAPTURED');
      expect(eventTypes).toContain('APPLIED');
      expect(eventTypes).toContain('OUTCOME_CHANGED');
    });

    it('retains daily goals configuration for target tracking', async () => {
      const goals = await db.query(
        `SELECT period_type, target_applications, target_outreach 
         FROM public.goals 
         WHERE workspace_id = $1`,
        [parityWorkspaceId]
      );
      expect(goals.rowCount).toBe(1);
      expect(goals.rows[0].period_type).toBe('DAILY');
      expect(goals.rows[0].target_applications).toBe(3);
      expect(goals.rows[0].target_outreach).toBe(5);
    });
  });

  describe('4. Strict Isolation & Zero Tenant Leakage', () => {
    it('ensures foreign workspace search rejects unauthorized workspace access', async () => {
      const foreignWsId = '00000000-0000-0000-0000-000000000099';
      await expect(searchAsUser('TechNova', foreignWsId)).rejects.toThrow('WORKSPACE_ACCESS_DENIED');
    });
  });
});
