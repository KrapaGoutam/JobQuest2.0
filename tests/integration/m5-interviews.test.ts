/**
 * M5 · Interviews & Debriefs integration suite (real Supabase stack, Option B tokens).
 *  - RLS: USER own SELECT/UPDATE allow; peer, foreign-workspace, removed member deny;
 *    MANAGER same-workspace allow (audited), foreign deny; anon deny.
 *  - Boundary: no client INSERT/DELETE; ownership/tenancy/outcome not client-writable.
 *  - Integrity: composite FKs stop cross-workspace interview/application and participant links.
 *  - Events: INTERVIEW_SCHEDULED / INTERVIEW_COMPLETED only for meaningful changes;
 *    scheduling never changes the stage; explicit stage moves use the workflow RPC;
 *    failures roll back atomically; last_activity_at behaviour.
 *  - Time zones: UTC storage of offsets, IANA validation of profiles.timezone.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, serviceDb, anonDb, makeRecorder } from './harness';

const record = makeRecorder('migration-upgrade/m5/evidence', 'integration');
const ready = loadEnv();
const DAY = 86_400_000;

describe.skipIf(!ready)('Milestone 5 — Interviews & Debriefs', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();

  let alice: Actor; // USER
  let bob: Actor; // USER (peer)
  let charlie: Actor; // MANAGER of the shared workspace
  let dave: Actor; // MANAGER of a foreign workspace
  let eve: Actor; // USER who gets removed

  let sharedWs: string;
  let foreignWs: string;
  let aliceApp: string;
  let aliceApp2: string;
  let bobApp: string;
  let daveApp: string;
  let eveApp: string;
  let aliceContact: string;
  let bobContact: string;
  let daveContact: string;
  let aliceInterview: string;

  const pw = (t: string) => `Valid-M5-Pass-${run}-${t}!`;
  const future = (days: number) => new Date(Date.now() + days * DAY).toISOString();
  const past = (days: number) => new Date(Date.now() - days * DAY).toISOString();

  const newApp = async (a: Actor, ws: string, company: string, stage = 'RECRUITER_SCREEN') => {
    const r = await a.db().from('applications').insert({
      workspace_id: ws, user_id: a.userId!, company_name: company, role_title: 'Engineer', stage, status: 'OPEN',
    }).select('id').single();
    expect(r.error).toBeNull();
    return r.data!.id as string;
  };
  const events = async (appId: string) => {
    const r = await admin.from('application_events').select('event_type, payload, actor_id, created_at').eq('application_id', appId).order('created_at');
    expect(r.error).toBeNull();
    return r.data as { event_type: string; payload: Record<string, unknown>; actor_id: string }[];
  };
  const appRow = async (appId: string) => (await admin.from('applications').select('stage, last_activity_at, next_action, next_action_date').eq('id', appId).single()).data!;
  const schedule = (a: Actor, appId: string, extra: Record<string, unknown> = {}) =>
    a.db().rpc('rpc_schedule_interview', {
      p_application_id: appId, p_interview_type: 'RECRUITER_SCREEN', p_scheduled_at: future(3), ...extra,
    });

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();

    alice = new Actor(); bob = new Actor(); charlie = new Actor(); dave = new Actor(); eve = new Actor();
    for (const [a, t] of [[alice, 'alice'], [bob, 'bob'], [charlie, 'charlie'], [dave, 'dave'], [eve, 'eve']] as const) {
      const r = await a.call('/auth/register', { username: `m5_${t}_${run}`, password: pw(t) });
      expect(r.status).toBe(201);
    }
    sharedWs = (await charlie.db().rpc('rpc_create_workspace', { p_name: `M5 Shared ${run}` })).data as string;
    foreignWs = (await dave.db().rpc('rpc_create_workspace', { p_name: `M5 Foreign ${run}` })).data as string;
    const m = await admin.from('workspace_members').insert([
      { workspace_id: sharedWs, user_id: alice.userId!, role: 'USER' },
      { workspace_id: sharedWs, user_id: bob.userId!, role: 'USER' },
      { workspace_id: sharedWs, user_id: eve.userId!, role: 'USER' },
    ]);
    expect(m.error).toBeNull();

    aliceApp = await newApp(alice, sharedWs, `Halcyon ${run}`);
    aliceApp2 = await newApp(alice, sharedWs, `Brightline ${run}`, 'APPLIED');
    bobApp = await newApp(bob, sharedWs, `Bob Co ${run}`);
    daveApp = await newApp(dave, foreignWs, `Foreign ${run}`);
    eveApp = await newApp(eve, sharedWs, `Eve Co ${run}`);

    const ac = await alice.db().rpc('rpc_create_contact', { p_workspace_id: sharedWs, p_full_name: 'Dana Cole', p_relationship_type: 'RECRUITER' });
    aliceContact = ac.data.id;
    const bc = await bob.db().rpc('rpc_create_contact', { p_workspace_id: sharedWs, p_full_name: 'Bob Private Contact' });
    bobContact = bc.data.id;
    const dc = await dave.db().rpc('rpc_create_contact', { p_workspace_id: foreignWs, p_full_name: 'Foreign Contact' });
    daveContact = dc.data.id;
  });

  it('M5-01 · USER schedules on own application: interview + participants + INTERVIEW_SCHEDULED, stage unchanged', async () => {
    const before = await appRow(aliceApp);
    const at = '2026-10-15T14:30:00-05:00'; // 2:30 PM CDT
    const r = await schedule(alice, aliceApp, {
      p_scheduled_at: at, p_duration_minutes: 30, p_format: 'VIDEO', p_location_or_link: 'https://zoom.example/j/1',
      p_interviewer_names: 'Priya Nair', p_preparation_notes: 'Salary range answer: 150–175k.',
      p_questions_expected: 'Why Halcyon? A project with measurable impact.', p_contact_ids: [aliceContact],
    });
    expect(r.error).toBeNull();
    aliceInterview = r.data.id;
    expect(r.data).toMatchObject({ user_id: alice.userId, workspace_id: sharedWs, application_id: aliceApp, round_number: 1, outcome: null, completed_at: null });
    // UTC storage of an offset timestamp
    expect(new Date(r.data.scheduled_at).toISOString()).toBe('2026-10-15T19:30:00.000Z');
    expect(r.data.preparation_notes).toBe('Salary range answer: 150–175k.');
    expect(r.data.questions_expected).toBe('Why Halcyon? A project with measurable impact.');

    const after = await appRow(aliceApp);
    expect(after.stage).toBe(before.stage); // scheduling never moves the stage
    expect(Date.parse(after.last_activity_at)).toBeGreaterThan(Date.parse(before.last_activity_at));
    const ev = (await events(aliceApp)).filter((e) => e.event_type === 'INTERVIEW_SCHEDULED');
    expect(ev).toHaveLength(1);
    expect(ev[0]!.payload).toMatchObject({ interview_id: aliceInterview, interview_type: 'RECRUITER_SCREEN', round_number: 1, format: 'VIDEO' });
    expect((await events(aliceApp)).some((e) => e.event_type === 'STAGE_CHANGED')).toBe(false);

    const parts = await alice.db().from('interview_contacts').select('contact_id').eq('interview_id', aliceInterview);
    expect(parts.data).toEqual([{ contact_id: aliceContact }]);

    const second = await schedule(alice, aliceApp, { p_interview_type: 'TECHNICAL' });
    expect(second.error).toBeNull();
    expect(second.data.round_number).toBe(2); // next round by default
    record('m5-01-schedule', { stageUnchanged: true, scheduledUtc: '2026-10-15T19:30:00.000Z', events: ev.length, participants: 1, nextRound: 2 });
  });

  it('M5-02 · USER own SELECT/UPDATE allowed for simple fields; no events for text edits; invariants client-immutable', async () => {
    const evBefore = (await events(aliceApp)).length;
    const sel = await alice.db().from('interviews').select('id').eq('id', aliceInterview);
    expect(sel.data).toHaveLength(1);
    const upd = await alice.db().from('interviews').update({
      preparation_notes: 'Updated prep', questions_expected: 'Updated questions', scheduled_at: '2026-10-16T15:00:00Z', duration_minutes: 45,
    }).eq('id', aliceInterview).select('preparation_notes, questions_expected, scheduled_at').single();
    expect(upd.error).toBeNull();
    expect(upd.data).toMatchObject({ preparation_notes: 'Updated prep', questions_expected: 'Updated questions' });
    expect((await events(aliceApp)).length).toBe(evBefore); // trivial edits write no history

    for (const patch of [{ outcome: 'PASSED' }, { completed_at: new Date().toISOString() }, { user_id: bob.userId }, { workspace_id: foreignWs }, { application_id: aliceApp2 }]) {
      const r = await alice.db().from('interviews').update(patch).eq('id', aliceInterview).select();
      expect(r.error?.code, JSON.stringify(patch)).toBe('42501');
    }
    const ins = await alice.db().from('interviews').insert({
      application_id: aliceApp, workspace_id: sharedWs, user_id: alice.userId, interview_type: 'OTHER', scheduled_at: future(1),
    });
    expect(ins.error?.code).toBe('42501');
    const del = await alice.db().from('interviews').delete().eq('id', aliceInterview).select();
    expect(del.error?.code).toBe('42501');
    record('m5-02-own-edit-boundary', { select: 1, simpleUpdate: 'OK', noEventOnTextEdit: true, invariants: '42501', insert: ins.error?.code, delete: del.error?.code });
  });

  it('M5-03 · peer USER is denied everything on another member’s interviews', async () => {
    const sel = await bob.db().from('interviews').select('id').eq('id', aliceInterview);
    expect(sel.data).toHaveLength(0);
    const upd = await bob.db().from('interviews').update({ preparation_notes: 'peer' }).eq('id', aliceInterview).select();
    expect(upd.error).toBeNull();
    expect(upd.data).toHaveLength(0);
    expect((await schedule(bob, aliceApp)).error?.code).toBe('42501');
    expect((await schedule(alice, bobApp)).error?.code).toBe('42501'); // and the other way round
    const out = await bob.db().rpc('rpc_record_interview_outcome', { p_interview_id: aliceInterview, p_outcome: 'CANCELLED' });
    expect(out.error?.code).toBe('42501');
    const link = await bob.db().from('interview_contacts').insert({ interview_id: aliceInterview, contact_id: bobContact, workspace_id: sharedWs });
    expect(link.error?.code).toBe('42501');
    const parts = await bob.db().from('interview_contacts').select('contact_id').eq('interview_id', aliceInterview);
    expect(parts.data).toHaveLength(0);
    record('m5-03-peer-denied', { select: 0, update: 0, scheduleRpc: '42501', outcomeRpc: '42501', linkParticipant: '42501' });
  });

  it('M5-04 · MANAGER same workspace: read, edit and schedule for a member (owner stays the member; audited)', async () => {
    const sel = await charlie.db().from('interviews').select('id, user_id').eq('workspace_id', sharedWs);
    expect(sel.data!.some((i) => i.id === aliceInterview)).toBe(true);
    const upd = await charlie.db().from('interviews').update({ questions_expected: 'Manager added a question' }).eq('id', aliceInterview).select('id');
    expect(upd.data).toHaveLength(1);
    const s = await schedule(charlie, aliceApp2, { p_interview_type: 'HIRING_MANAGER' });
    expect(s.error).toBeNull();
    expect(s.data.user_id).toBe(alice.userId); // interview belongs to the application owner

    const audit = await admin.from('audit_events').select('action, actor_id, target_user_id, target_entity_type, metadata')
      .in('target_entity_id', [aliceInterview, s.data.id]).eq('actor_id', charlie.userId!);
    expect(audit.error).toBeNull();
    const actions = audit.data!.map((a) => `${a.target_entity_type}:${a.action}`).sort();
    expect(actions).toEqual(['INTERVIEW:RECORD_CREATED', 'INTERVIEW:RECORD_UPDATED']);
    expect(audit.data!.every((a) => a.target_user_id === alice.userId)).toBe(true);
    expect(JSON.stringify(audit.data)).not.toContain('Manager added a question'); // column names only
    record('m5-04-manager-same-ws', { read: true, edit: true, scheduleForMember: true, ownerKept: true, audit: actions });
  });

  it('M5-05 · foreign workspace is denied in both directions', async () => {
    expect((await dave.db().from('interviews').select('id').eq('id', aliceInterview)).data).toHaveLength(0);
    expect((await schedule(dave, aliceApp)).error?.code).toBe('42501');
    expect((await schedule(alice, daveApp)).error?.code).toBe('42501');
    const out = await dave.db().rpc('rpc_record_interview_outcome', { p_interview_id: aliceInterview, p_outcome: 'CANCELLED' });
    expect(out.error?.code).toBe('42501');
    record('m5-05-foreign-denied', { select: 0, scheduleEitherWay: '42501', outcome: '42501' });
  });

  it('M5-06 · cross-workspace forgery fails at the database; participants must be the owner’s contacts', async () => {
    const forged = await admin.from('interviews').insert({
      application_id: daveApp, workspace_id: sharedWs, user_id: alice.userId, interview_type: 'OTHER', scheduled_at: future(2),
    });
    expect(forged.error?.code).toBe('23503');
    const crossLink = await admin.from('interview_contacts').insert({ interview_id: aliceInterview, contact_id: daveContact, workspace_id: sharedWs });
    expect(crossLink.error?.code).toBe('23503');

    const countBefore = (await admin.from('interviews').select('id', { count: 'exact', head: true }).eq('application_id', aliceApp)).count;
    const withPeerContact = await schedule(alice, aliceApp, { p_contact_ids: [bobContact] });
    expect(withPeerContact.error?.code).toBe('42501');
    expect(withPeerContact.error?.message).toMatch(/CONTACT_NOT_LINKABLE/);
    const countAfter = (await admin.from('interviews').select('id', { count: 'exact', head: true }).eq('application_id', aliceApp)).count;
    expect(countAfter).toBe(countBefore); // rolled back: no orphan interview

    const directPeer = await alice.db().from('interview_contacts').insert({ interview_id: aliceInterview, contact_id: bobContact, workspace_id: sharedWs });
    expect(directPeer.error?.code).toBe('42501');
    // A manager may not attach their own contacts to a member's interview either.
    const cc = await charlie.db().rpc('rpc_create_contact', { p_workspace_id: sharedWs, p_full_name: 'Manager Contact' });
    const mgrLink = await charlie.db().from('interview_contacts').insert({ interview_id: aliceInterview, contact_id: cc.data.id, workspace_id: sharedWs });
    expect(mgrLink.error?.code).toBe('42501');
    record('m5-06-cross-workspace', { forgedInterview: forged.error?.code, forgedParticipant: crossLink.error?.code, peerContactRpc: '42501 + rollback', peerContactDirect: '42501', managerOwnContact: '42501' });
  });

  it('M5-07 · removed member loses access immediately', async () => {
    const s = await schedule(eve, eveApp);
    expect(s.error).toBeNull();
    const rm = await admin.from('workspace_members').delete().eq('workspace_id', sharedWs).eq('user_id', eve.userId!);
    expect(rm.error).toBeNull();
    expect((await eve.db().from('interviews').select('id').eq('id', s.data.id)).data).toHaveLength(0);
    const upd = await eve.db().from('interviews').update({ preparation_notes: 'after removal' }).eq('id', s.data.id).select();
    expect(upd.data).toHaveLength(0);
    expect((await schedule(eve, eveApp)).error?.code).toBe('42501');
    record('m5-07-removed-member', { select: 0, update: 0, schedule: '42501' });
  });

  it('M5-08 · debrief: outcome, INTERVIEW_COMPLETED once per result change, next action replaced, no automatic stage move', async () => {
    const heldAt = past(2);
    const s = await schedule(alice, aliceApp2, { p_scheduled_at: heldAt, p_interview_type: 'PANEL' });
    expect(s.error).toBeNull();
    const id = s.data.id as string;
    const before = await appRow(aliceApp2);

    const r1 = await alice.db().rpc('rpc_record_interview_outcome', {
      p_interview_id: id, p_outcome: 'PASSED', p_feedback_notes: 'Strong systems answers.', p_questions_asked: 'Design-system migration?',
      p_next_step: 'Decision by early October', p_thank_you_status: 'TO_SEND', p_next_action: 'Send thank-you note', p_next_action_date: '2026-10-01',
    });
    expect(r1.error).toBeNull();
    expect(r1.data).toMatchObject({ outcome: 'PASSED', thank_you_status: 'TO_SEND', next_step: 'Decision by early October', questions_asked: 'Design-system migration?' });
    expect(r1.data.completed_at).toBeTruthy();
    const after = await appRow(aliceApp2);
    expect(after.stage).toBe(before.stage); // never auto-transitioned by the debrief
    expect(after.next_action).toBe('Send thank-you note');
    expect(after.next_action_date).toBe('2026-10-01');
    expect(Date.parse(after.last_activity_at)).toBeGreaterThan(Date.parse(before.last_activity_at));
    let completed = (await events(aliceApp2)).filter((e) => e.event_type === 'INTERVIEW_COMPLETED');
    expect(completed).toHaveLength(1);
    expect(completed[0]!.payload).toMatchObject({ interview_id: id, outcome: 'PASSED', previous_outcome: null, interview_type: 'PANEL' });

    // Re-saving the same result with edited notes is not a new milestone.
    const r2 = await alice.db().rpc('rpc_record_interview_outcome', { p_interview_id: id, p_outcome: 'PASSED', p_feedback_notes: 'Edited notes', p_thank_you_status: 'SENT' });
    expect(r2.error).toBeNull();
    expect((await events(aliceApp2)).filter((e) => e.event_type === 'INTERVIEW_COMPLETED')).toHaveLength(1);
    expect(r2.data.completed_at).toBe(r1.data.completed_at);

    // A changed result is.
    const r3 = await alice.db().rpc('rpc_record_interview_outcome', { p_interview_id: id, p_outcome: 'FAILED' });
    expect(r3.error).toBeNull();
    completed = (await events(aliceApp2)).filter((e) => e.event_type === 'INTERVIEW_COMPLETED');
    expect(completed).toHaveLength(2);
    expect(completed[1]!.payload).toMatchObject({ outcome: 'FAILED', previous_outcome: 'PASSED' });
    expect((await appRow(aliceApp2)).stage).toBe(before.stage);
    record('m5-08-debrief', { completedEvents: 2, stageUnchanged: true, nextActionReplaced: true, resaveNoEvent: true });
  });

  it('M5-09 · explicit stage transitions go through the workflow RPC (schedule and debrief)', async () => {
    const app = await newApp(alice, sharedWs, `Stage ${run}`, 'RECRUITER_SCREEN');
    const s = await schedule(alice, app, { p_move_to_stage: 'INTERVIEW', p_scheduled_at: past(1) });
    expect(s.error).toBeNull();
    expect((await appRow(app)).stage).toBe('INTERVIEW');
    let ev = await events(app);
    const iSched = ev.findIndex((e) => e.event_type === 'INTERVIEW_SCHEDULED');
    const iStage = ev.findIndex((e) => e.event_type === 'STAGE_CHANGED');
    expect(iSched).toBeGreaterThanOrEqual(0);
    expect(iStage).toBeGreaterThan(iSched);
    expect(ev[iStage]!.payload).toMatchObject({ from_stage: 'RECRUITER_SCREEN', to_stage: 'INTERVIEW' });

    const d = await alice.db().rpc('rpc_record_interview_outcome', { p_interview_id: s.data.id, p_outcome: 'PASSED', p_move_to_stage: 'FINAL_INTERVIEW' });
    expect(d.error).toBeNull();
    expect((await appRow(app)).stage).toBe('FINAL_INTERVIEW');
    ev = await events(app);
    expect(ev.filter((e) => e.event_type === 'STAGE_CHANGED').map((e) => e.payload.to_stage)).toEqual(['INTERVIEW', 'FINAL_INTERVIEW']);
    record('m5-09-explicit-stage', { schedule: 'RECRUITER_SCREEN→INTERVIEW', debrief: 'INTERVIEW→FINAL_INTERVIEW', viaWorkflowRpc: true });
  });

  it('M5-10 · failures roll back atomically; outcome rules', async () => {
    const app = await newApp(alice, sharedWs, `Rollback ${run}`, 'INTERVIEW');
    const evBefore = (await events(app)).length;
    const bad = await schedule(alice, app, { p_move_to_stage: 'INTERVIEW' }); // STAGE_UNCHANGED inside the workflow RPC
    expect(bad.error?.message).toMatch(/STAGE_UNCHANGED/);
    expect((await admin.from('interviews').select('id').eq('application_id', app)).data).toHaveLength(0);
    expect((await events(app)).length).toBe(evBefore);

    const badType = await schedule(alice, app, { p_interview_type: 'SCORECARD' });
    expect(badType.error?.code).toBe('23514');

    const upcoming = await schedule(alice, app, { p_scheduled_at: future(5) });
    expect(upcoming.error).toBeNull();
    const early = await alice.db().rpc('rpc_record_interview_outcome', { p_interview_id: upcoming.data.id, p_outcome: 'PASSED' });
    expect(early.error?.message).toMatch(/INTERVIEW_NOT_YET_HELD/);
    const badStage = await alice.db().rpc('rpc_record_interview_outcome', { p_interview_id: upcoming.data.id, p_outcome: 'CANCELLED', p_move_to_stage: 'NOT_A_STAGE' });
    expect(badStage.error?.message).toMatch(/INVALID_STAGE/);
    const still = await admin.from('interviews').select('outcome').eq('id', upcoming.data.id).single();
    expect(still.data!.outcome).toBeNull(); // rolled back with the failed stage move

    const evMid = (await events(app)).length;
    const cancel = await alice.db().rpc('rpc_record_interview_outcome', { p_interview_id: upcoming.data.id, p_outcome: 'CANCELLED' });
    expect(cancel.error).toBeNull();
    expect(cancel.data).toMatchObject({ outcome: 'CANCELLED', completed_at: null });
    expect((await events(app)).length).toBe(evMid); // cancellation is not a completion

    const invalid = await alice.db().rpc('rpc_record_interview_outcome', { p_interview_id: upcoming.data.id, p_outcome: 'MAYBE' });
    expect(invalid.error?.message).toMatch(/INVALID_OUTCOME/);
    record('m5-10-rollback', { stageUnchangedRollsBackSchedule: true, invalidType: '23514', notYetHeld: true, invalidStageRollsBackOutcome: true, cancelNoEvent: true });
  });

  it('M5-11 · only open, unarchived applications can get new interviews', async () => {
    const app = await newApp(alice, sharedWs, `Archived ${run}`);
    expect((await alice.db().rpc('rpc_archive_application', { p_application_id: app })).error).toBeNull();
    const r = await schedule(alice, app);
    expect(r.error?.message).toMatch(/APPLICATION_NOT_ACTIVE/);
    record('m5-11-archived', { schedule: 'APPLICATION_NOT_ACTIVE' });
  });

  it('M5-12 · time zones: UTC storage and IANA validation of profiles.timezone', async () => {
    const ok = await alice.db().from('profiles').update({ timezone: 'America/Chicago' }).eq('user_id', alice.userId!).select('timezone').single();
    expect(ok.error).toBeNull();
    expect(ok.data!.timezone).toBe('America/Chicago');
    const bad = await alice.db().from('profiles').update({ timezone: 'Mars/Olympus_Mons' }).eq('user_id', alice.userId!).select();
    expect(bad.error?.code).toBe('22023');
    // First occurrence of the ambiguous fall-back hour, sent with its explicit offset.
    const s = await schedule(alice, aliceApp, { p_scheduled_at: '2026-11-01T01:30:00-05:00' });
    expect(s.error).toBeNull();
    const stored = await admin.from('interviews').select('scheduled_at').eq('id', s.data.id).single();
    expect(new Date(stored.data!.scheduled_at).toISOString()).toBe('2026-11-01T06:30:00.000Z');
    record('m5-12-timezone', { validZone: 'America/Chicago', invalidZone: '22023', dstAmbiguousStoredUtc: '2026-11-01T06:30:00.000Z' });
  });

  it('M5-13 · owner debrief is not audited; manager debrief is', async () => {
    const s = await schedule(alice, aliceApp, { p_scheduled_at: past(1) });
    const own = await alice.db().rpc('rpc_record_interview_outcome', { p_interview_id: s.data.id, p_outcome: 'PENDING' });
    expect(own.error).toBeNull();
    const a1 = await admin.from('audit_events').select('action').eq('target_entity_id', s.data.id);
    expect(a1.data).toHaveLength(0);
    const mgr = await charlie.db().rpc('rpc_record_interview_outcome', { p_interview_id: s.data.id, p_outcome: 'PASSED' });
    expect(mgr.error).toBeNull();
    const a2 = await admin.from('audit_events').select('action, actor_id, metadata').eq('target_entity_id', s.data.id);
    expect(a2.data).toHaveLength(1);
    expect(a2.data![0]).toMatchObject({ action: 'RECORD_UPDATED', actor_id: charlie.userId });
    expect(a2.data![0]!.metadata).toMatchObject({ outcome: 'PASSED' });
    record('m5-13-audit', { ownerAudited: false, managerAudited: true });
  });

  it('M5-14 · anon is denied tables and RPCs', async () => {
    const anon = anonDb();
    expect((await anon.from('interviews').select('id')).error).toBeTruthy();
    expect((await anon.from('interview_contacts').select('interview_id')).error).toBeTruthy();
    expect((await anon.rpc('rpc_schedule_interview', { p_application_id: aliceApp, p_interview_type: 'OTHER', p_scheduled_at: future(1) })).error).toBeTruthy();
    expect((await anon.rpc('rpc_record_interview_outcome', { p_interview_id: aliceInterview, p_outcome: 'PASSED' })).error).toBeTruthy();
    record('m5-14-anon', { denied: true });
  });
});
