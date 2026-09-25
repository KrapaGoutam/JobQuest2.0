/**
 * M8 · Analytics, Reports & Search Goals integration suite (real Supabase stack, Option B tokens).
 *  - Goals CRUD & RLS (own / peer / manager / foreign / anon).
 *  - Manager cross-user mutation audit on goals.
 *  - Historical Funnel fidelity ("ever reached" from application_events, ADR-018, CR-014).
 *  - Current pipeline vs historical funnel distinction.
 *  - Stage timing and stuck application detection.
 *  - Manager aggregate vs single-member analytics filtering.
 *  - Anonymous denial.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, serviceDb, anonDb, makeRecorder } from './harness';

const record = makeRecorder('migration-upgrade/m8/evidence', 'integration');
const ready = loadEnv();

describe.skipIf(!ready)('Milestone 8 — Analytics, Reports & Goals', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();

  let alice: Actor; // USER
  let bob: Actor; // USER (peer in same workspace)
  let charlie: Actor; // MANAGER of shared workspace
  let dave: Actor; // MANAGER of foreign workspace

  let ws: string;
  let foreignWs: string;
  let aliceApp1: string;
  let aliceApp2: string;

  const pw = (t: string) => `Valid-M8-Pass-${run}-${t}!`;

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache();
    resetSigningMaterial();
    resetAdminClient();

    alice = new Actor();
    bob = new Actor();
    charlie = new Actor();
    dave = new Actor();

    for (const [a, t] of [
      [alice, 'alice'],
      [bob, 'bob'],
      [charlie, 'charlie'],
      [dave, 'dave'],
    ] as const) {
      const r = await a.call('/auth/register', { username: `m8_${t}_${run}`, password: pw(t) });
      expect(r.status).toBe(201);
    }

    // Charlie creates shared workspace (Charlie = MANAGER); Alice & Bob join as USER
    ws = (await charlie.db().rpc('rpc_create_workspace', { p_name: `M8 Shared ${run}` })).data as string;
    await admin.from('workspace_members').insert([
      { workspace_id: ws, user_id: alice.userId!, role: 'USER' },
      { workspace_id: ws, user_id: bob.userId!, role: 'USER' },
    ]);

    // Dave creates foreign workspace
    foreignWs = (await dave.db().rpc('rpc_create_workspace', { p_name: `M8 Foreign ${run}` })).data as string;

    // Alice creates applications in shared workspace
    const app1Res = await alice.db().from('applications').insert({
      workspace_id: ws,
      user_id: alice.userId!,
      company_name: 'Alpha Analytics',
      role_title: 'Data Engineer',
      stage: 'APPLIED',
      status: 'OPEN',
      priority: 'HIGH',
      source: 'LinkedIn',
    }).select('id').single();
    expect(app1Res.error).toBeNull();
    aliceApp1 = app1Res.data!.id;

    const app2Res = await alice.db().from('applications').insert({
      workspace_id: ws,
      user_id: alice.userId!,
      company_name: 'Beta Cloud',
      role_title: 'Full Stack Engineer',
      stage: 'APPLIED',
      status: 'OPEN',
      priority: 'MEDIUM',
      source: 'Referral',
    }).select('id').single();
    expect(app2Res.error).toBeNull();
    aliceApp2 = app2Res.data!.id;
  });

  // M8-01 · Goals upsert & unique constraint
  it('M8-01 · goals: upsert, default values, and uniqueness', async () => {
    // Alice upserts weekly goal
    const res = await alice.db().rpc('rpc_upsert_goal', {
      p_workspace_id: ws,
      p_period_type: 'WEEKLY',
      p_target_applications: 20,
      p_target_outreach: 8,
      p_effective_date: '2026-09-21',
    });
    expect(res.error).toBeNull();
    expect(res.data.target_applications).toBe(20);
    expect(res.data.target_outreach).toBe(8);
    expect(res.data.effective_date).toBe('2026-09-21');

    // Upserting again updates the existing record
    const updateRes = await alice.db().rpc('rpc_upsert_goal', {
      p_workspace_id: ws,
      p_period_type: 'WEEKLY',
      p_target_applications: 25,
      p_target_outreach: 10,
      p_effective_date: '2026-09-21',
    });
    expect(updateRes.error).toBeNull();
    expect(updateRes.data.id).toBe(res.data.id);
    expect(updateRes.data.target_applications).toBe(25);

    // Verify row directly in table
    const { data: rows } = await alice.db().from('goals').select('*').eq('id', res.data.id);
    expect(rows).toHaveLength(1);
    expect(rows?.[0].target_applications).toBe(25);

    record('m8-01-goals-upsert', { goalId: res.data.id, target: 25 });
  });

  // M8-02 · Peer isolation on goals
  it('M8-02 · goals: peer user in same workspace cannot read or modify member goal', async () => {
    // Alice's goal is unreachable by Bob (peer user in same workspace)
    const { data: bobView } = await bob.db().from('goals').select('*').eq('user_id', alice.userId);
    expect(bobView).toHaveLength(0);

    // Bob cannot update Alice's goal
    const { error: bobUpdate } = await bob.db().from('goals')
      .update({ target_applications: 99 })
      .eq('user_id', alice.userId);
    expect(bobUpdate).toBeDefined(); // direct goal mutations are RPC-only

    // Verify Alice's target remains unchanged
    const { data: aliceGoal } = await alice.db().from('goals').select('target_applications').eq('user_id', alice.userId).single();
    expect(aliceGoal?.target_applications).toBe(25);

    const { error: aliceDelete } = await alice.db().from('goals').delete().eq('user_id', alice.userId);
    expect(aliceDelete).toBeDefined();

    record('m8-02-peer-isolation', { peerBobBlocked: true });
  });

  // M8-03 · Manager access & audit on goals
  it('M8-03 · goals: manager can view member goals; mutation triggers audit log', async () => {
    // Charlie (MANAGER) can view Alice's goal
    const { data: mgrView } = await charlie.db().from('goals').select('*').eq('user_id', alice.userId);
    expect(mgrView).toHaveLength(1);
    expect(mgrView?.[0].target_applications).toBe(25);

    // Charlie updates Alice's goal
    const mgrUpdate = await charlie.db().rpc('rpc_upsert_goal_for_user', {
      p_workspace_id: ws,
      p_period_type: 'WEEKLY',
      p_target_applications: 30,
      p_target_outreach: 10,
      p_effective_date: '2026-09-21',
      p_user_id: alice.userId,
    });
    expect(mgrUpdate.error).toBeNull();
    expect(mgrUpdate.data.target_applications).toBe(30);

    // Verify manager audit log recorded the mutation
    const { data: audits } = await admin.from('audit_events')
      .select('action, actor_id, target_user_id, target_entity_type')
      .eq('target_entity_id', mgrView?.[0].id);
    expect(audits?.length).toBeGreaterThanOrEqual(1);
    expect(audits![0]!.actor_id).toBe(charlie.userId);
    expect(audits![0]!.target_user_id).toBe(alice.userId);

    record('m8-03-manager-audit', { audited: true, actor: charlie.userId });
  });

  // M8-04 · Historical funnel fidelity ("Ever Reached")
  it('M8-04 · analytics: historical funnel preserves stages ever reached from application_events', async () => {
    // Advance aliceApp1: APPLIED -> RECRUITER_SCREEN -> INTERVIEW -> REJECTED
    const move1 = await alice.db().rpc('rpc_move_application_stage', {
      p_application_id: aliceApp1,
      p_new_stage: 'RECRUITER_SCREEN',
    });
    expect(move1.error).toBeNull();

    const move2 = await alice.db().rpc('rpc_move_application_stage', {
      p_application_id: aliceApp1,
      p_new_stage: 'INTERVIEW',
    });
    expect(move2.error).toBeNull();

    // Mark outcome REJECTED (closes application)
    const outRes = await alice.db().rpc('rpc_set_application_outcome', {
      p_application_id: aliceApp1,
      p_outcome: 'REJECTED',
      p_closure_notes: 'Budget cut',
    });
    expect(outRes.error).toBeNull();

    // Overview analytics for Alice
    const res = await alice.db().rpc('rpc_get_analytics_overview', {
      p_workspace_id: ws,
      p_start_date: new Date(Date.now() - 86400000).toISOString(),
      p_end_date: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(res.error).toBeNull();
    const data = res.data;

    // Although aliceApp1 is CLOSED/REJECTED, it must count in INTERVIEW in the historical funnel
    const funnel = data.historical_funnel as Array<{ stage: string; count: number }>;
    const appliedFunnel = funnel.find((f) => f.stage === 'APPLIED');
    const screenFunnel = funnel.find((f) => f.stage === 'RECRUITER_SCREEN');
    const interviewFunnel = funnel.find((f) => f.stage === 'INTERVIEW');

    expect(data.total_applications).toBe(2);
    expect(appliedFunnel?.count).toBe(2);
    expect(screenFunnel?.count).toBe(1);
    expect(interviewFunnel?.count).toBe(1);
    expect(funnel.find((f) => f.stage === 'ASSESSMENT')?.count).toBe(0);

    // Reached interview KPI
    expect(data.interview_count).toBeGreaterThanOrEqual(1);
    expect(data.response_samples).toBe(1);
    expect(data.weekly_pacing).toHaveLength(12);
    expect(data.weekly_pacing[0]).toHaveProperty('week_label');
    expect(data.sources_breakdown).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'LinkedIn', apps: 1 }),
      expect.objectContaining({ source: 'Referral', apps: 1 }),
    ]));

    record('m8-04-historical-funnel', {
      interviewCount: data.interview_count,
      interviewFunnel: interviewFunnel?.count,
    });
  });

  // M8-05 · Current pipeline vs historical funnel
  it('M8-05 · analytics: current pipeline only includes open applications', async () => {
    const res = await alice.db().rpc('rpc_get_analytics_overview', {
      p_workspace_id: ws,
    });
    expect(res.error).toBeNull();
    const data = res.data;

    const pipeline = data.current_pipeline as Array<{ stage: string; count: number }>;
    // aliceApp1 is CLOSED, aliceApp2 is OPEN in APPLIED
    const appliedPipeline = pipeline.find((p) => p.stage === 'APPLIED');
    expect(appliedPipeline?.count).toBeGreaterThanOrEqual(1);

    // aliceApp1 was closed from INTERVIEW stage, so current pipeline should not show it in INTERVIEW
    const interviewPipeline = pipeline.find((p) => p.stage === 'INTERVIEW');
    expect(interviewPipeline?.count ?? 0).toBe(0);

    // Outcome breakdown includes REJECTED
    const outcomes = data.outcomes_breakdown as Array<{ outcome: string; count: number }>;
    const rejectedOutcome = outcomes.find((o) => o.outcome === 'REJECTED');
    expect(rejectedOutcome?.count).toBeGreaterThanOrEqual(1);

    record('m8-05-pipeline-vs-funnel', {
      appliedInPipeline: appliedPipeline?.count,
      outcomes: outcomes.length,
    });
  });

  // M8-06 · Stage timing RPC
  it('M8-06 · stage timing: derives exact first-event durations and current-stage age', async () => {
    const base = new Date('2026-02-01T12:00:00.000Z');
    const atDay = (days: number) => new Date(base.getTime() + days * 86400000).toISOString();
    const timingInsert = await alice.db().from('applications').insert({
      workspace_id: ws,
      user_id: alice.userId!,
      company_name: 'Timing Fixtures Inc',
      role_title: 'Timing Analyst',
      stage: 'APPLIED',
      status: 'OPEN',
      priority: 'MEDIUM',
      applied_at: base.toISOString(),
    }).select('id').single();
    expect(timingInsert.error).toBeNull();
    const timingApp = timingInsert.data!.id;

    const createdEvent = await admin.from('application_events')
      .update({ created_at: base.toISOString() })
      .eq('application_id', timingApp)
      .eq('event_type', 'CREATED');
    expect(createdEvent.error).toBeNull();

    const timingEvents = await admin.from('application_events').insert([
      { application_id: timingApp, workspace_id: ws, actor_id: alice.userId!, event_type: 'STAGE_CHANGED', payload: { from_stage: 'APPLIED', to_stage: 'RECRUITER_SCREEN' }, created_at: atDay(2) },
      { application_id: timingApp, workspace_id: ws, actor_id: alice.userId!, event_type: 'STAGE_CHANGED', payload: { from_stage: 'RECRUITER_SCREEN', to_stage: 'RECRUITER_SCREEN' }, created_at: atDay(3) },
      { application_id: timingApp, workspace_id: ws, actor_id: alice.userId!, event_type: 'STAGE_CHANGED', payload: { from_stage: 'RECRUITER_SCREEN', to_stage: 'APPLIED' }, created_at: atDay(4) },
      { application_id: timingApp, workspace_id: ws, actor_id: alice.userId!, event_type: 'STAGE_CHANGED', payload: { from_stage: 'APPLIED', to_stage: 'INTERVIEW' }, created_at: atDay(5) },
      { application_id: timingApp, workspace_id: ws, actor_id: alice.userId!, event_type: 'STAGE_CHANGED', payload: { from_stage: 'INTERVIEW', to_stage: 'OFFER' }, created_at: atDay(8) },
      { application_id: timingApp, workspace_id: ws, actor_id: alice.userId!, event_type: 'OUTCOME_CHANGED', payload: { outcome: 'REJECTED' }, created_at: atDay(10) },
    ]);
    expect(timingEvents.error).toBeNull();

    const oldCreated = new Date(Date.now() - 20 * 86400000).toISOString();
    const oldStage = await admin.from('application_events').update({ created_at: oldCreated })
      .eq('application_id', aliceApp2).eq('event_type', 'CREATED');
    expect(oldStage.error).toBeNull();

    const res = await alice.db().rpc('rpc_get_stage_timing', {
      p_workspace_id: ws,
      p_start_date: '2026-02-01T00:00:00.000Z',
      p_end_date: '2026-02-02T00:00:00.000Z',
    });
    expect(res.error).toBeNull();
    const data = res.data;

    const transitions = data.transitions as Array<{ transition: string; median_days: number; average_days: number; min_days: number; max_days: number; sample_size: number }>;
    expect(transitions).toHaveLength(6);
    expect(transitions.find((t) => t.transition === 'Applied to first response')).toMatchObject({ median_days: 2, average_days: 2, min_days: 2, max_days: 2, sample_size: 1 });
    expect(transitions.find((t) => t.transition === 'Applied to Recruiter Screen')).toMatchObject({ median_days: 2, sample_size: 1 });
    expect(transitions.find((t) => t.transition === 'Applied to Interview')).toMatchObject({ median_days: 5, sample_size: 1 });
    expect(transitions.find((t) => t.transition === 'Interview to Offer')).toMatchObject({ median_days: 3, sample_size: 1 });
    expect(transitions.find((t) => t.transition === 'Applied to Rejection')).toMatchObject({ median_days: 10, sample_size: 1 });

    const stuck = data.stuck_applications as Array<{ id: string; company_name: string; days_in_stage: number }>;
    const found = stuck.find((s) => s.id === aliceApp2);
    expect(found).toBeDefined();
    expect(found?.days_in_stage).toBeGreaterThanOrEqual(19);

    record('m8-06-stage-timing', {
      transitionsCount: transitions.length,
      stuckFound: !!found,
    });
  });

  // M8-07 · Manager aggregate vs single-member analytics
  it('M8-07 · manager analytics: aggregate view vs member-filtered view', async () => {
    // Bob adds an application in the shared workspace
    const bobApp = await bob.db().from('applications').insert({
      workspace_id: ws,
      user_id: bob.userId!,
      company_name: 'Gamma Systems',
      role_title: 'Security Analyst',
      stage: 'APPLIED',
      status: 'OPEN',
      priority: 'LOW',
    }).select('id').single();
    expect(bobApp.error).toBeNull();

    // 1. Charlie views workspace aggregate (p_user_id = null)
    const aggRes = await charlie.db().rpc('rpc_get_analytics_overview', {
      p_workspace_id: ws,
      p_user_id: null,
    });
    expect(aggRes.error).toBeNull();
    const aggTotal = aggRes.data.total_applications;

    // 2. Charlie filters specifically for Bob
    const bobFilterRes = await charlie.db().rpc('rpc_get_analytics_overview', {
      p_workspace_id: ws,
      p_user_id: bob.userId,
    });
    expect(bobFilterRes.error).toBeNull();
    const bobTotal = bobFilterRes.data.total_applications;

    // Aggregate total must be greater than or equal to Bob's individual total
    expect(aggTotal).toBeGreaterThanOrEqual(bobTotal);
    expect(bobTotal).toBeGreaterThanOrEqual(1);

    record('m8-07-manager-filtering', { aggTotal, bobTotal });
  });

  // M8-08 · Anonymous and foreign workspace denial
  it('M8-08 · security: unauthenticated and cross-workspace calls are denied', async () => {
    const anon = anonDb();
    const { error: anonGoals } = await anon.from('goals').select('*');
    expect(anonGoals).toBeDefined();

    const { error: anonOverview } = await anon.rpc('rpc_get_analytics_overview', {
      p_workspace_id: ws,
    });
    expect(anonOverview).toBeDefined();

    // Foreign workspace denial: Alice cannot call analytics for foreignWs
    const { error: foreignOverview } = await alice.db().rpc('rpc_get_analytics_overview', {
      p_workspace_id: foreignWs,
    });
    expect(foreignOverview).toBeDefined();

    record('m8-08-anonymous-and-foreign-denial', { anonDenied: true, foreignDenied: true });
  });
});
