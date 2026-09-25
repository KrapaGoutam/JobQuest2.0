import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, serviceDb } from './harness';

describe('Milestone 3 — Applications Workflow & Data Grid Integration Suite', () => {
  const ready = loadEnv();
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();

  let alice: Actor;
  let bob: Actor;
  let managerCharlie: Actor;

  let sharedWsId: string;
  let foreignWsId: string;

  let aliceAppId: string;
  let bobAppId: string;

  beforeAll(async () => {
    if (!ready) throw new Error('Missing environment configuration for integration test');

    alice = new Actor();
    bob = new Actor();
    managerCharlie = new Actor();

    // 1. Register Alice, Bob, Charlie
    const uAlice = `alice_${run}`;
    const pAlice = `Valid-Pass-${run}-123!`;
    const resA = await alice.call('/auth/register', { username: uAlice, password: pAlice });
    expect(resA.status).toBe(201);
    expect(alice.userId).toBeTruthy();

    const uBob = `bob_${run}`;
    const pBob = `Valid-Pass-${run}-456!`;
    const resB = await bob.call('/auth/register', { username: uBob, password: pBob });
    expect(resB.status).toBe(201);
    expect(bob.userId).toBeTruthy();

    const uCharlie = `charlie_${run}`;
    const pCharlie = `Valid-Pass-${run}-789!`;
    const resC = await managerCharlie.call('/auth/register', { username: uCharlie, password: pCharlie });
    expect(resC.status).toBe(201);
    expect(managerCharlie.userId).toBeTruthy();

    // 2. Charlie creates a SHARED workspace where Charlie is MANAGER
    const { data: wsData, error: wsErr } = await managerCharlie.db().rpc('rpc_create_workspace', {
      p_name: `Collab WS ${run}`,
    });
    expect(wsErr).toBeNull();
    sharedWsId = wsData as string;
    expect(sharedWsId).toBeTruthy();

    // 3. Add Alice and Bob as normal USER members in sharedWsId
    const { error: addAliceErr } = await admin.from('workspace_members').insert({
      workspace_id: sharedWsId,
      user_id: alice.userId!,
      role: 'USER',
    });
    expect(addAliceErr).toBeNull();

    const { error: addBobErr } = await admin.from('workspace_members').insert({
      workspace_id: sharedWsId,
      user_id: bob.userId!,
      role: 'USER',
    });
    expect(addBobErr).toBeNull();

    // 4. Bob creates a separate personal workspace (foreign to Alice)
    const { data: fWs, error: fWsErr } = await bob.db().rpc('rpc_create_workspace', {
      p_name: `Bob Private WS ${run}`,
    });
    expect(fWsErr).toBeNull();
    foreignWsId = fWs as string;

    // 5. Seed Alice's application in sharedWsId
    const { data: appA, error: errAppA } = await alice.db().from('applications').insert({
      workspace_id: sharedWsId,
      user_id: alice.userId!,
      company_name: 'Acme Corp',
      role_title: 'Senior Frontend Engineer',
      stage: 'APPLIED',
      status: 'OPEN',
      priority: 'HIGH',
      location: 'Remote',
      work_arrangement: 'Remote',
      employment_type: 'Full-time',
      salary_min: 140000,
      salary_max: 180000,
      salary_currency: 'USD',
      job_url: `https://acme.com/jobs/${run}-101`,
      external_job_id: `ACME-${run}-101`,
      tags: ['react', 'typescript'],
    }).select('id').single();
    expect(errAppA).toBeNull();
    aliceAppId = appA!.id;

    // 6. Seed Bob's application in sharedWsId
    const { data: appB, error: errAppB } = await bob.db().from('applications').insert({
      workspace_id: sharedWsId,
      user_id: bob.userId!,
      company_name: 'Globex Inc',
      role_title: 'Backend Platform Engineer',
      stage: 'SAVED',
      status: 'OPEN',
      priority: 'MEDIUM',
      location: 'New York, NY',
      work_arrangement: 'Hybrid',
      employment_type: 'Full-time',
      job_url: `https://globex.com/jobs/${run}-202`,
      external_job_id: `GLX-${run}-202`,
    }).select('id').single();
    expect(errAppB).toBeNull();
    bobAppId = appB!.id;
  });

  // ===========================================================================
  // SECTION 1: RLS ISOLATION MATRIX (AC-DB-07)
  // ===========================================================================
  describe('RLS Isolation Matrix', () => {
    it('RLS-01: USER can SELECT own application in shared workspace', async () => {
      const { data, error } = await alice.db()
        .from('applications')
        .select('*')
        .eq('id', aliceAppId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].id).toBe(aliceAppId);
      expect(data![0].company_name).toBe('Acme Corp');
    });

    it('RLS-02: USER cannot SELECT peer application in shared workspace (returns 0 rows)', async () => {
      const { data, error } = await alice.db()
        .from('applications')
        .select('*')
        .eq('id', bobAppId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0); // RLS strictly filters out peer's row
    });

    it('RLS-03: USER can INSERT application with own user_id in permitted workspace', async () => {
      const { data, error } = await alice.db().from('applications').insert({
        workspace_id: sharedWsId,
        user_id: alice.userId!,
        company_name: 'Stark Industries',
        role_title: 'UI Architect',
        stage: 'APPLIED',
      }).select('id').single();
      expect(error).toBeNull();
      expect(data?.id).toBeTruthy();
    });

    it('RLS-04: USER cannot INSERT application with peer user_id (fails check constraint / RLS)', async () => {
      const { error } = await alice.db().from('applications').insert({
        workspace_id: sharedWsId,
        user_id: bob.userId!,
        company_name: 'Initech',
        role_title: 'Software Engineer',
        stage: 'APPLIED',
      });
      expect(error).toBeTruthy();
    });

    it('RLS-05: USER can UPDATE own application in permitted workspace', async () => {
      const { error } = await alice.db()
        .from('applications')
        .update({ notes: 'Updated notes by Alice' })
        .eq('id', aliceAppId);
      expect(error).toBeNull();

      const { data } = await alice.db().from('applications').select('notes').eq('id', aliceAppId).single();
      expect(data?.notes).toBe('Updated notes by Alice');
    });

    it('RLS-06: USER cannot UPDATE peer application (0 rows affected)', async () => {
      const { data, error } = await alice.db()
        .from('applications')
        .update({ notes: 'Tampered by Alice' })
        .eq('id', bobAppId)
        .select('id');
      expect(error).toBeNull();
      expect(data).toHaveLength(0); // RLS denies mutation

      // Verify Bob's row is untouched
      const { data: bobRow } = await bob.db().from('applications').select('notes').eq('id', bobAppId).single();
      expect(bobRow?.notes).toBeNull();
    });

    it('RLS-07: MANAGER can SELECT all applications in managed workspace', async () => {
      const { data, error } = await managerCharlie.db()
        .from('applications')
        .select('id, user_id, company_name')
        .eq('workspace_id', sharedWsId);
      expect(error).toBeNull();
      const ids = data!.map((r) => r.id);
      expect(ids).toContain(aliceAppId);
      expect(ids).toContain(bobAppId);
    });

    it('RLS-08: MANAGER can UPDATE member application in managed workspace', async () => {
      const { error } = await managerCharlie.db()
        .from('applications')
        .update({ priority: 'HIGH' })
        .eq('id', bobAppId);
      expect(error).toBeNull();

      const { data } = await bob.db().from('applications').select('priority').eq('id', bobAppId).single();
      expect(data?.priority).toBe('HIGH');
    });

    it('RLS-09: USER cannot SELECT applications in foreign workspace', async () => {
      // Bob creates app in foreignWsId
      const { data: bobForeignApp } = await bob.db().from('applications').insert({
        workspace_id: foreignWsId,
        user_id: bob.userId!,
        company_name: 'Wayne Enterprises',
        role_title: 'Security Lead',
      }).select('id').single();

      // Alice tries to select it
      const { data, error } = await alice.db()
        .from('applications')
        .select('*')
        .eq('id', bobForeignApp!.id);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  });

  // ===========================================================================
  // SECTION 2: DOMAIN RPCS (AC-DB-06)
  // ===========================================================================
  describe('Domain RPCs', () => {
    it('RPC-01: rpc_move_application_stage updates stage, refreshes last_activity_at, and writes STAGE_CHANGED event', async () => {
      const beforeDate = new Date();
      const { data, error } = await alice.db().rpc('rpc_move_application_stage', {
        p_application_id: aliceAppId,
        p_new_stage: 'INTERVIEW',
        p_notes: 'Passed recruiter screen',
      });
      expect(error).toBeNull();
      expect(data.new_stage).toBe('INTERVIEW');
      expect(data.old_stage).toBe('APPLIED');

      // Verify applications row
      const { data: appRow } = await alice.db().from('applications').select('stage, last_activity_at').eq('id', aliceAppId).single();
      expect(appRow?.stage).toBe('INTERVIEW');
      expect(new Date(appRow!.last_activity_at).getTime()).toBeGreaterThanOrEqual(beforeDate.getTime() - 1000);

      // Verify application_events row
      const { data: events, error: evErr } = await alice.db()
        .from('application_events')
        .select('*')
        .eq('application_id', aliceAppId)
        .eq('event_type', 'STAGE_CHANGED');
      expect(evErr).toBeNull();
      expect(events).toHaveLength(1);
      expect(events![0].payload.from_stage).toBe('APPLIED');
      expect(events![0].payload.to_stage).toBe('INTERVIEW');
      expect(events![0].payload.notes).toBe('Passed recruiter screen');
      expect(events![0].actor_id).toBe(alice.userId);
    });

    it('RPC-02: rpc_move_application_stage rejects invalid stage string', async () => {
      const { error } = await alice.db().rpc('rpc_move_application_stage', {
        p_application_id: aliceAppId,
        p_new_stage: 'INVALID_STAGE_NAME',
      });
      expect(error).toBeTruthy();
    });

    it('RPC-03: rpc_move_application_stage rejects unauthorized peer caller', async () => {
      const { error } = await alice.db().rpc('rpc_move_application_stage', {
        p_application_id: bobAppId,
        p_new_stage: 'INTERVIEW',
      });
      expect(error).toBeTruthy();
      expect(error?.message).toContain('NOT_AUTHORIZED');
    });

    it('RPC-04: rpc_set_application_outcome closes application, sets outcome and closure reason, and writes OUTCOME_CHANGED event', async () => {
      const { data, error } = await alice.db().rpc('rpc_set_application_outcome', {
        p_application_id: aliceAppId,
        p_outcome: 'WITHDRAWN',
        p_closure_reason: 'OFFER_DECLINED',
        p_closure_notes: 'Accepted another offer with higher compensation',
      });
      expect(error).toBeNull();
      expect(data.status).toBe('CLOSED');
      expect(data.outcome).toBe('WITHDRAWN');
      expect(data.closure_reason).toBe('OFFER_DECLINED');

      // Verify application row
      const { data: appRow } = await alice.db().from('applications').select('*').eq('id', aliceAppId).single();
      expect(appRow?.status).toBe('CLOSED');
      expect(appRow?.outcome).toBe('WITHDRAWN');
      expect(appRow?.closure_reason).toBe('OFFER_DECLINED');
      expect(appRow?.closed_at).toBeTruthy();

      // Verify event
      const { data: events } = await alice.db()
        .from('application_events')
        .select('*')
        .eq('application_id', aliceAppId)
        .eq('event_type', 'OUTCOME_CHANGED');
      expect(events).toHaveLength(1);
      expect(events![0].payload.outcome).toBe('WITHDRAWN');
      expect(events![0].payload.closure_reason).toBe('OFFER_DECLINED');
    });

    it('RPC-05: rpc_keep_application_active refreshes last_activity_at without mutating stage/outcome', async () => {
      const beforeTime = new Date().toISOString();
      const { data, error } = await bob.db().rpc('rpc_keep_application_active', {
        p_application_id: bobAppId,
      });
      expect(error).toBeNull();
      expect(data.id).toBe(bobAppId);

      const { data: appRow } = await bob.db().from('applications').select('stage, status, last_activity_at').eq('id', bobAppId).single();
      expect(appRow?.stage).toBe('SAVED');
      expect(appRow?.status).toBe('OPEN');
      expect(appRow!.last_activity_at >= beforeTime).toBe(true);

      // Verify event
      const { data: events } = await bob.db()
        .from('application_events')
        .select('*')
        .eq('application_id', bobAppId)
        .eq('event_type', 'KEEP_ACTIVE');
      expect(events).toHaveLength(1);
    });

    it('RPC-06: rpc_archive_application sets archived_at and records ARCHIVED event', async () => {
      const { data, error } = await bob.db().rpc('rpc_archive_application', {
        p_application_id: bobAppId,
      });
      expect(error).toBeNull();
      expect(data.archived_at).toBeTruthy();

      const { data: appRow } = await bob.db().from('applications').select('archived_at').eq('id', bobAppId).single();
      expect(appRow?.archived_at).toBeTruthy();

      // Verify event
      const { data: events } = await bob.db()
        .from('application_events')
        .select('*')
        .eq('application_id', bobAppId)
        .eq('event_type', 'ARCHIVED');
      expect(events).toHaveLength(1);
    });

    it('RPC-07: rpc_restore_application clears archived_at and records RESTORED event', async () => {
      const { data, error } = await bob.db().rpc('rpc_restore_application', {
        p_application_id: bobAppId,
      });
      expect(error).toBeNull();
      expect(data.archived_at).toBeNull();

      const { data: appRow } = await bob.db().from('applications').select('archived_at').eq('id', bobAppId).single();
      expect(appRow?.archived_at).toBeNull();

      // Verify event
      const { data: events } = await bob.db()
        .from('application_events')
        .select('*')
        .eq('application_id', bobAppId)
        .eq('event_type', 'RESTORED');
      expect(events).toHaveLength(1);
    });
  });

  // ===========================================================================
  // SECTION 3: DUPLICATE DETECTION ENGINE (AC-DUP-01 .. AC-DUP-04)
  // ===========================================================================
  describe('Duplicate Detection Engine (rpc_check_application_duplicate)', () => {
    it('DUP-01: Strong Duplicate on matching Job URL', async () => {
      const { data, error } = await alice.db().rpc('rpc_check_application_duplicate', {
        p_workspace_id: sharedWsId,
        p_company_name: 'Different Company Name',
        p_role_title: 'Different Title',
        p_job_url: `https://acme.com/jobs/${run}-101`,
      });
      expect(error).toBeNull();
      expect(data.tier).toBe('STRONG');
      expect(data.matches).toHaveLength(1);
      expect(data.matches[0].id).toBe(aliceAppId);
    });

    it('DUP-02: Strong Duplicate on matching external Requisition ID', async () => {
      const { data, error } = await alice.db().rpc('rpc_check_application_duplicate', {
        p_workspace_id: sharedWsId,
        p_company_name: 'Acme Unknown',
        p_role_title: 'Software Developer',
        p_external_job_id: `ACME-${run}-101`,
      });
      expect(error).toBeNull();
      expect(data.tier).toBe('STRONG');
      expect(data.matches[0].id).toBe(aliceAppId);
    });

    it('DUP-03: Probable Duplicate on case-insensitive Company + Role match', async () => {
      const { data, error } = await alice.db().rpc('rpc_check_application_duplicate', {
        p_workspace_id: sharedWsId,
        p_company_name: 'acme corp',
        p_role_title: 'senior frontend engineer',
        p_job_url: 'https://other-url.com/something-else',
      });
      expect(error).toBeNull();
      expect(data.tier).toBe('PROBABLE');
      expect(data.matches[0].id).toBe(aliceAppId);
    });

    it('DUP-04: Possible Duplicate on Company match with different Role', async () => {
      const { data, error } = await alice.db().rpc('rpc_check_application_duplicate', {
        p_workspace_id: sharedWsId,
        p_company_name: 'Acme Corp',
        p_role_title: 'Director of Product',
      });
      expect(error).toBeNull();
      expect(data.tier).toBe('POSSIBLE');
      expect(data.matches[0].id).toBe(aliceAppId);
    });

    it('DUP-05: None when Company and Role are distinct and no URL/ReqID match', async () => {
      const { data, error } = await alice.db().rpc('rpc_check_application_duplicate', {
        p_workspace_id: sharedWsId,
        p_company_name: 'Novel Brand Corp',
        p_role_title: 'Head of Analytics',
      });
      expect(error).toBeNull();
      expect(data.tier).toBe('NONE');
      expect(data.matches).toHaveLength(0);
    });
  });

  // ===========================================================================
  // SECTION 4: JOB SNAPSHOTS (AC-DB-03)
  // ===========================================================================
  describe('Job Snapshots', () => {
    it('JOB-01: can insert and query immutable job snapshot linked to application', async () => {
      const { data, error } = await alice.db().from('job_snapshots').insert({
        application_id: aliceAppId,
        workspace_id: sharedWsId,
        job_description: 'We are seeking an experienced Frontend Engineer...',
        requirements: '5+ years TypeScript & React experience',
        skills: 'React, TypeScript, CSS, Playwright',
        raw_payload: { source: 'web_form', version: 1 },
      }).select('*').single();

      expect(error).toBeNull();
      expect(data?.application_id).toBe(aliceAppId);
      expect(data?.skills).toContain('TypeScript');
    });

    it('JOB-02: peer user cannot select job snapshot belonging to Alice', async () => {
      const { data, error } = await bob.db()
        .from('job_snapshots')
        .select('*')
        .eq('application_id', aliceAppId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  });
});
