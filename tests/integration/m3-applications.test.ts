/**
 * M3 · Applications workflow integration suite (real Supabase stack, Option B tokens).
 * Covers AC-DB-01..07: RLS isolation, atomic RPCs + event history, the lifecycle boundary
 * (RPC-only state changes), append-only events, immutable snapshots, duplicate detection,
 * search/aging/pagination queries and "no automatic mutation".
 * Every test writes sanitized evidence to migration-upgrade/m3/evidence/.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, serviceDb, anonDb, makeRecorder } from './harness';
import { agingRange, buildSearchFilter } from '../../apps/web/src/types/applications';

const record = makeRecorder('migration-upgrade/m3/evidence', 'integration');
const ready = loadEnv();

describe.skipIf(!ready)('Milestone 3 — Applications Workflow & Data Grid Integration Suite', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();

  let alice: Actor;
  let bob: Actor;
  let managerCharlie: Actor;
  let dave: Actor;

  let sharedWsId: string;
  let foreignWsId: string;

  let aliceAppId: string;
  let bobAppId: string;
  let bobForeignAppId: string;

  const pw = (tag: string) => `Valid-Pass-${run}-${tag}!`;
  const eventsOf = async (who: Actor, appId: string, type?: string) => {
    let q = who.db().from('application_events').select('*').eq('application_id', appId);
    if (type) q = q.eq('event_type', type);
    const { data, error } = await q;
    expect(error).toBeNull();
    return data ?? [];
  };

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();

    alice = new Actor();
    bob = new Actor();
    managerCharlie = new Actor();
    dave = new Actor();
    for (const [a, tag] of [[alice, 'alice'], [bob, 'bob'], [managerCharlie, 'charlie'], [dave, 'dave']] as const) {
      const r = await a.call('/auth/register', { username: `${tag}_${run}`, password: pw(tag) });
      expect(r.status).toBe(201);
      expect(a.userId).toBeTruthy();
    }

    // Charlie creates a SHARED workspace (MANAGER); Alice, Bob, Dave join as USER.
    const { data: wsData, error: wsErr } = await managerCharlie.db().rpc('rpc_create_workspace', { p_name: `Collab WS ${run}` });
    expect(wsErr).toBeNull();
    sharedWsId = wsData as string;
    for (const u of [alice, bob, dave]) {
      const { error } = await admin.from('workspace_members').insert({ workspace_id: sharedWsId, user_id: u.userId!, role: 'USER' });
      expect(error).toBeNull();
    }

    // Bob's separate workspace (foreign to Alice and Charlie).
    const { data: fWs, error: fWsErr } = await bob.db().rpc('rpc_create_workspace', { p_name: `Bob Private WS ${run}` });
    expect(fWsErr).toBeNull();
    foreignWsId = fWs as string;

    const { data: appA, error: errAppA } = await alice.db().from('applications').insert({
      workspace_id: sharedWsId, user_id: alice.userId!, company_name: 'Acme Corp', role_title: 'Senior Frontend Engineer',
      stage: 'APPLIED', status: 'OPEN', priority: 'HIGH', location: 'Remote', work_arrangement: 'Remote',
      employment_type: 'Full-time', salary_min: 140000, salary_max: 180000, salary_currency: 'USD',
      job_url: `https://acme.com/jobs/${run}-101`, external_job_id: `ACME-${run}-101`, tags: ['react', 'typescript'],
    }).select('id').single();
    expect(errAppA).toBeNull();
    aliceAppId = appA!.id;

    const { data: appB, error: errAppB } = await bob.db().from('applications').insert({
      workspace_id: sharedWsId, user_id: bob.userId!, company_name: 'Globex Inc', role_title: 'Backend Platform Engineer',
      stage: 'SAVED', status: 'OPEN', priority: 'MEDIUM', location: 'New York, NY', work_arrangement: 'Hybrid',
      employment_type: 'Full-time', job_url: `https://globex.com/jobs/${run}-202`, external_job_id: `GLX-${run}-202`,
    }).select('id').single();
    expect(errAppB).toBeNull();
    bobAppId = appB!.id;

    const { data: fApp, error: fErr } = await bob.db().from('applications').insert({
      workspace_id: foreignWsId, user_id: bob.userId!, company_name: 'Wayne Enterprises', role_title: 'Security Lead',
    }).select('id').single();
    expect(fErr).toBeNull();
    bobForeignAppId = fApp!.id;
  });

  // ===========================================================================
  // SECTION 1: RLS ISOLATION MATRIX (AC-DB-07)
  // ===========================================================================
  describe('RLS Isolation Matrix', () => {
    it('RLS-01: USER can SELECT own application in shared workspace', async () => {
      const { data, error } = await alice.db().from('applications').select('*').eq('id', aliceAppId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].company_name).toBe('Acme Corp');
      record('RLS-01', { status: 'PASS', own_rows: data!.length });
    });

    it('RLS-02: USER cannot SELECT peer application in shared workspace (0 rows)', async () => {
      const { data, error } = await alice.db().from('applications').select('*').eq('id', bobAppId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
      record('RLS-02', { status: 'PASS', peer_rows: 0 });
    });

    it('RLS-03: USER can INSERT own application in a permitted workspace', async () => {
      const { data, error } = await alice.db().from('applications').insert({
        workspace_id: sharedWsId, user_id: alice.userId!, company_name: 'Stark Industries', role_title: 'UI Architect', stage: 'APPLIED',
      }).select('id').single();
      expect(error).toBeNull();
      expect(data?.id).toBeTruthy();
      record('RLS-03', { status: 'PASS', insert: 'allowed' });
    });

    it('RLS-04: USER cannot INSERT an application owned by a peer', async () => {
      const { error } = await alice.db().from('applications').insert({
        workspace_id: sharedWsId, user_id: bob.userId!, company_name: 'Initech', role_title: 'Software Engineer', stage: 'APPLIED',
      });
      expect(error?.code).toBe('42501');
      record('RLS-04', { status: 'PASS', insert_for_peer: error?.code });
    });

    it('RLS-05: USER can UPDATE simple fields on own application', async () => {
      const before = await alice.db().from('applications').select('last_activity_at').eq('id', aliceAppId).single();
      const { error } = await alice.db().from('applications').update({ notes: 'Updated notes by Alice' }).eq('id', aliceAppId);
      expect(error).toBeNull();
      const { data } = await alice.db().from('applications').select('notes, last_activity_at').eq('id', aliceAppId).single();
      expect(data?.notes).toBe('Updated notes by Alice');
      // A metadata edit is not timeline activity: aging is not reset by it.
      expect(data?.last_activity_at).toBe(before.data?.last_activity_at);
      record('RLS-05', { status: 'PASS', own_simple_update: 'allowed', last_activity_at_unchanged_by_edit: true });
    });

    it('RLS-06: USER cannot UPDATE a peer application (0 rows affected)', async () => {
      const { data, error } = await alice.db().from('applications').update({ notes: 'Tampered by Alice' }).eq('id', bobAppId).select('id');
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
      const { data: bobRow } = await bob.db().from('applications').select('notes').eq('id', bobAppId).single();
      expect(bobRow?.notes).toBeNull();
      record('RLS-06', { status: 'PASS', peer_update_rows: 0, peer_row_untouched: true });
    });

    it('RLS-07: MANAGER can SELECT all applications in the managed workspace', async () => {
      const { data, error } = await managerCharlie.db().from('applications').select('id').eq('workspace_id', sharedWsId);
      expect(error).toBeNull();
      const ids = data!.map((r) => r.id);
      expect(ids).toContain(aliceAppId);
      expect(ids).toContain(bobAppId);
      record('RLS-07', { status: 'PASS', manager_sees_member_rows: true });
    });

    it('RLS-08: MANAGER can UPDATE a member application in the managed workspace', async () => {
      const { data, error } = await managerCharlie.db().from('applications').update({ priority: 'HIGH' }).eq('id', bobAppId).select('id');
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      const { data: row } = await bob.db().from('applications').select('priority').eq('id', bobAppId).single();
      expect(row?.priority).toBe('HIGH');
      record('RLS-08', { status: 'PASS', manager_member_update_rows: 1 });
    });

    it('RLS-09: USER cannot SELECT applications in a foreign workspace', async () => {
      const { data, error } = await alice.db().from('applications').select('*').eq('id', bobForeignAppId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
      record('RLS-09', { status: 'PASS', foreign_rows: 0 });
    });

    it('RLS-10: USER and MANAGER cannot UPDATE or INSERT in a foreign workspace', async () => {
      const aUpd = await alice.db().from('applications').update({ notes: 'x' }).eq('id', bobForeignAppId).select('id');
      const mUpd = await managerCharlie.db().from('applications').update({ notes: 'x' }).eq('id', bobForeignAppId).select('id');
      const mIns = await managerCharlie.db().from('applications').insert({ workspace_id: foreignWsId, user_id: managerCharlie.userId!, company_name: 'Z', role_title: 'Z' });
      const mSel = await managerCharlie.db().from('applications').select('id').eq('workspace_id', foreignWsId);
      expect(aUpd.data).toHaveLength(0);
      expect(mUpd.data).toHaveLength(0);
      expect(mIns.error?.code).toBe('42501');
      expect(mSel.data).toHaveLength(0);
      record('RLS-10', { status: 'PASS', user_foreign_update_rows: 0, manager_foreign_update_rows: 0, manager_foreign_insert: mIns.error?.code, manager_foreign_rows: 0 });
    });

    it('RLS-11: removed member loses access; their records remain attributed and visible to the manager', async () => {
      const { data: dApp, error: dErr } = await dave.db().from('applications').insert({
        workspace_id: sharedWsId, user_id: dave.userId!, company_name: 'Umbrella', role_title: 'Researcher',
      }).select('id').single();
      expect(dErr).toBeNull();
      const removal = await managerCharlie.db().from('workspace_members').delete().eq('workspace_id', sharedWsId).eq('user_id', dave.userId!).select('id');
      expect(removal.error).toBeNull();
      expect(removal.data).toHaveLength(1);
      const daveRows = await dave.db().from('applications').select('id').eq('workspace_id', sharedWsId);
      const daveEvents = await dave.db().from('application_events').select('id').eq('application_id', dApp!.id);
      const daveRpc = await dave.db().rpc('rpc_move_application_stage', { p_application_id: dApp!.id, p_new_stage: 'INTERVIEW' });
      const mgrRow = await managerCharlie.db().from('applications').select('id, user_id').eq('id', dApp!.id).single();
      expect(daveRows.data).toHaveLength(0);
      expect(daveEvents.data).toHaveLength(0);
      expect(daveRpc.error?.message).toContain('NOT_AUTHORIZED');
      expect(mgrRow.data?.user_id).toBe(dave.userId);
      record('RLS-11', { status: 'PASS', removed_member_rows: 0, removed_member_events: 0, removed_member_rpc: 'NOT_AUTHORIZED', record_retained_and_attributed: true });
    });

    it('RLS-12: event history follows record visibility (peer denied, manager allowed)', async () => {
      const aliceSeesBob = await alice.db().from('application_events').select('id').eq('application_id', bobAppId);
      const mgrSeesBob = await managerCharlie.db().from('application_events').select('id').eq('application_id', bobAppId);
      expect(aliceSeesBob.data).toHaveLength(0);
      expect((mgrSeesBob.data ?? []).length).toBeGreaterThan(0);
      record('RLS-12', { status: 'PASS', peer_event_rows: 0, manager_event_rows: mgrSeesBob.data!.length });
    });

    it('RLS-13: anonymous callers see nothing and cannot call workflow RPCs', async () => {
      const rows = await anonDb().from('applications').select('id').limit(1);
      const evs = await anonDb().from('application_events').select('id').limit(1);
      const rpc = await anonDb().rpc('rpc_move_application_stage', { p_application_id: aliceAppId, p_new_stage: 'OFFER' });
      expect(rows.error !== null || (rows.data ?? []).length === 0).toBe(true);
      expect(evs.error !== null || (evs.data ?? []).length === 0).toBe(true);
      expect(rpc.error).not.toBeNull();
      record('RLS-13', { status: 'PASS', anon_rows: 0, anon_events: 0, anon_rpc: rpc.error?.code ?? 'error' });
    });
  });

  // ===========================================================================
  // SECTION 2: WORKFLOW INTEGRITY BOUNDARY (migration 20260924310000)
  // ===========================================================================
  describe('Workflow integrity boundary', () => {
    it('INT-01: direct Data API writes cannot change lifecycle state (stage/status/outcome/archive)', async () => {
      const attempts = {
        stage: await alice.db().from('applications').update({ stage: 'OFFER' }).eq('id', aliceAppId),
        status: await alice.db().from('applications').update({ status: 'CLOSED', outcome: 'REJECTED' }).eq('id', aliceAppId),
        archive: await alice.db().from('applications').update({ archived_at: new Date().toISOString() }).eq('id', aliceAppId),
        insert_closed: await alice.db().from('applications').insert({ workspace_id: sharedWsId, user_id: alice.userId!, company_name: 'Q', role_title: 'Q', status: 'CLOSED', outcome: 'REJECTED' }),
        insert_archived: await alice.db().from('applications').insert({ workspace_id: sharedWsId, user_id: alice.userId!, company_name: 'Q', role_title: 'Q', archived_at: new Date().toISOString() }),
        manager_stage: await managerCharlie.db().from('applications').update({ stage: 'OFFER' }).eq('id', bobAppId),
      };
      for (const [name, r] of Object.entries(attempts)) {
        expect(r.error?.code, name).toBe('42501');
        expect(r.error?.message, name).toContain('LIFECYCLE_CHANGE_REQUIRES_RPC');
      }
      const { data } = await alice.db().from('applications').select('stage, status, archived_at').eq('id', aliceAppId).single();
      expect(data).toEqual({ stage: 'APPLIED', status: 'OPEN', archived_at: null });
      record('INT-01', { status: 'PASS', rejected: Object.fromEntries(Object.entries(attempts).map(([k, r]) => [k, r.error?.code])), row_unchanged: true });
    });

    it('INT-02: application_events is append-only history clients cannot write', async () => {
      const [ev] = await eventsOf(alice, aliceAppId, 'CREATED');
      const ins = await alice.db().from('application_events').insert({
        application_id: aliceAppId, workspace_id: sharedWsId, actor_id: alice.userId!, event_type: 'STAGE_CHANGED', payload: { forged: true },
      });
      const upd = await alice.db().from('application_events').update({ payload: { forged: true } }).eq('id', ev!.id).select('id');
      const del = await alice.db().from('application_events').delete().eq('id', ev!.id).select('id');
      expect(ins.error?.code).toBe('42501');
      expect(upd.error?.code).toBe('42501');
      expect(del.error?.code).toBe('42501');
      expect(await eventsOf(alice, aliceAppId, 'CREATED')).toHaveLength(1);
      record('INT-02', { status: 'PASS', client_insert: ins.error?.code, client_update: upd.error?.code, client_delete: del.error?.code });
    });

    it('INT-03: CREATED history is written by the database for every new application (actor = creator)', async () => {
      const aliceCreated = await eventsOf(alice, aliceAppId, 'CREATED');
      const mgrCreated = await managerCharlie.db().from('applications').insert({
        workspace_id: sharedWsId, user_id: alice.userId!, company_name: 'Hooli', role_title: 'PM', stage: 'SAVED',
      }).select('id').single();
      expect(mgrCreated.error).toBeNull();
      const [mgrEvent] = await eventsOf(managerCharlie, mgrCreated.data!.id, 'CREATED');
      expect(aliceCreated).toHaveLength(1);
      expect(aliceCreated[0]!.actor_id).toBe(alice.userId);
      expect(aliceCreated[0]!.payload.stage).toBe('APPLIED');
      expect(mgrEvent!.actor_id).toBe(managerCharlie.userId); // actor is who did it, not the owner
      record('INT-03', { status: 'PASS', created_event: true, actor_is_creator: true, manager_created_for_member_actor: 'manager' });
    });

    it('INT-04: member roster RPC returns usernames to members only (no credential fields)', async () => {
      const r = await alice.db().rpc('rpc_list_workspace_members', { p_workspace_id: sharedWsId });
      expect(r.error).toBeNull();
      const rows = r.data as Record<string, unknown>[];
      expect(rows.map((m) => m.user_id)).toEqual(expect.arrayContaining([alice.userId, bob.userId, managerCharlie.userId]));
      expect(Object.keys(rows[0]!).sort()).toEqual(['display_name', 'role', 'user_id', 'username']);
      const removed = await dave.db().rpc('rpc_list_workspace_members', { p_workspace_id: sharedWsId });
      const outsider = await alice.db().rpc('rpc_list_workspace_members', { p_workspace_id: foreignWsId });
      expect(removed.error?.code).toBe('42501');
      expect(outsider.error?.code).toBe('42501');
      record('INT-04', { status: 'PASS', member_roster_rows: rows.length, fields: Object.keys(rows[0]!).sort(), removed_member: removed.error?.code, outsider: outsider.error?.code });
    });
  });

  // ===========================================================================
  // SECTION 3: DOMAIN RPCS (AC-DB-06, AC-LIFE-01..04)
  // ===========================================================================
  describe('Domain RPCs', () => {
    it('RPC-01: rpc_move_application_stage updates stage, refreshes last_activity_at, writes STAGE_CHANGED', async () => {
      const beforeDate = new Date();
      const { data, error } = await alice.db().rpc('rpc_move_application_stage', {
        p_application_id: aliceAppId, p_new_stage: 'INTERVIEW', p_notes: 'Passed recruiter screen',
      });
      expect(error).toBeNull();
      expect(data.new_stage).toBe('INTERVIEW');
      expect(data.old_stage).toBe('APPLIED');
      const { data: appRow } = await alice.db().from('applications').select('stage, status, last_activity_at').eq('id', aliceAppId).single();
      expect(appRow?.stage).toBe('INTERVIEW');
      expect(appRow?.status).toBe('OPEN'); // Stage != State
      expect(new Date(appRow!.last_activity_at).getTime()).toBeGreaterThanOrEqual(beforeDate.getTime() - 1000);
      const events = await eventsOf(alice, aliceAppId, 'STAGE_CHANGED');
      expect(events).toHaveLength(1);
      expect(events[0]!.payload).toMatchObject({ from_stage: 'APPLIED', to_stage: 'INTERVIEW', notes: 'Passed recruiter screen' });
      expect(events[0]!.actor_id).toBe(alice.userId);
      record('RPC-01', { status: 'PASS', stage: 'APPLIED→INTERVIEW', state_unchanged: 'OPEN', event: 'STAGE_CHANGED', actor: 'caller' });
    });

    it('RPC-02: rpc_move_application_stage rejects an invalid stage and a no-op move (no event written)', async () => {
      const bad = await alice.db().rpc('rpc_move_application_stage', { p_application_id: aliceAppId, p_new_stage: 'INVALID_STAGE_NAME' });
      const same = await alice.db().rpc('rpc_move_application_stage', { p_application_id: aliceAppId, p_new_stage: 'INTERVIEW' });
      expect(bad.error?.message).toContain('INVALID_STAGE');
      expect(same.error?.message).toContain('STAGE_UNCHANGED');
      expect(await eventsOf(alice, aliceAppId, 'STAGE_CHANGED')).toHaveLength(1);
      record('RPC-02', { status: 'PASS', invalid_stage: 'INVALID_STAGE', same_stage: 'STAGE_UNCHANGED', events_added: 0 });
    });

    it('RPC-03: rpc_move_application_stage rejects an unauthorized peer caller', async () => {
      const { error } = await alice.db().rpc('rpc_move_application_stage', { p_application_id: bobAppId, p_new_stage: 'INTERVIEW' });
      expect(error?.message).toContain('NOT_AUTHORIZED');
      record('RPC-03', { status: 'PASS', peer_rpc: 'NOT_AUTHORIZED' });
    });

    it('RPC-04: outcome closure rules are explicit; invalid calls change nothing', async () => {
      const cases = {
        withdrawn_without_reason: await alice.db().rpc('rpc_set_application_outcome', { p_application_id: aliceAppId, p_outcome: 'WITHDRAWN' }),
        withdrawn_invalid_reason: await alice.db().rpc('rpc_set_application_outcome', { p_application_id: aliceAppId, p_outcome: 'WITHDRAWN', p_closure_reason: 'BORED' }),
        reason_on_rejected: await alice.db().rpc('rpc_set_application_outcome', { p_application_id: aliceAppId, p_outcome: 'REJECTED', p_closure_reason: 'OFFER_DECLINED' }),
        invalid_outcome: await alice.db().rpc('rpc_set_application_outcome', { p_application_id: aliceAppId, p_outcome: 'MAYBE' }),
      };
      expect(cases.withdrawn_without_reason.error?.message).toContain('CLOSURE_REASON_REQUIRED');
      expect(cases.withdrawn_invalid_reason.error?.message).toContain('INVALID_CLOSURE_REASON');
      expect(cases.reason_on_rejected.error?.message).toContain('CLOSURE_REASON_ONLY_FOR_WITHDRAWN');
      expect(cases.invalid_outcome.error?.message).toContain('INVALID_OUTCOME');
      const { data: row } = await alice.db().from('applications').select('status, outcome').eq('id', aliceAppId).single();
      expect(row).toEqual({ status: 'OPEN', outcome: null });
      expect(await eventsOf(alice, aliceAppId, 'OUTCOME_CHANGED')).toHaveLength(0);
      record('RPC-04', { status: 'PASS', errors: Object.fromEntries(Object.entries(cases).map(([k, r]) => [k, r.error?.message])), row_unchanged: true, events_added: 0 });
    });

    it('RPC-05: rpc_set_application_outcome closes with outcome + closure reason (OFFER_DECLINED) and keeps the stage', async () => {
      const { data, error } = await alice.db().rpc('rpc_set_application_outcome', {
        p_application_id: aliceAppId, p_outcome: 'WITHDRAWN', p_closure_reason: 'OFFER_DECLINED',
        p_closure_notes: 'Accepted another offer with higher compensation',
      });
      expect(error).toBeNull();
      expect(data).toMatchObject({ status: 'CLOSED', outcome: 'WITHDRAWN', closure_reason: 'OFFER_DECLINED' });
      const { data: appRow } = await alice.db().from('applications').select('*').eq('id', aliceAppId).single();
      expect(appRow).toMatchObject({ status: 'CLOSED', outcome: 'WITHDRAWN', closure_reason: 'OFFER_DECLINED', stage: 'INTERVIEW' });
      expect(appRow?.closed_at).toBeTruthy();
      const events = await eventsOf(alice, aliceAppId, 'OUTCOME_CHANGED');
      expect(events).toHaveLength(1);
      expect(events[0]!.payload).toMatchObject({ outcome: 'WITHDRAWN', closure_reason: 'OFFER_DECLINED', previous_status: 'OPEN', stage_at_close: 'INTERVIEW' });
      // Stage != State: a stage correction on a CLOSED record does not reopen it.
      const moved = await alice.db().rpc('rpc_move_application_stage', { p_application_id: aliceAppId, p_new_stage: 'OFFER' });
      expect(moved.error).toBeNull();
      const { data: after } = await alice.db().from('applications').select('stage, status, outcome').eq('id', aliceAppId).single();
      expect(after).toEqual({ stage: 'OFFER', status: 'CLOSED', outcome: 'WITHDRAWN' });
      record('RPC-05', { status: 'PASS', closed: 'WITHDRAWN/OFFER_DECLINED', stage_kept: 'INTERVIEW', event: 'OUTCOME_CHANGED', stage_move_on_closed_keeps_state: true });
    });

    it('RPC-06: rpc_keep_application_active resets aging without touching stage/state and logs the review note', async () => {
      await admin.from('applications').update({ last_activity_at: new Date(Date.now() - 40 * 86_400_000).toISOString() }).eq('id', bobAppId);
      const beforeTime = new Date().toISOString();
      const { data, error } = await bob.db().rpc('rpc_keep_application_active', { p_application_id: bobAppId });
      expect(error).toBeNull();
      expect(data.id).toBe(bobAppId);
      const { data: appRow } = await bob.db().from('applications').select('stage, status, outcome, last_activity_at').eq('id', bobAppId).single();
      expect(appRow).toMatchObject({ stage: 'SAVED', status: 'OPEN', outcome: null });
      expect(appRow!.last_activity_at >= beforeTime).toBe(true);
      const events = await eventsOf(bob, bobAppId, 'KEEP_ACTIVE');
      expect(events).toHaveLength(1);
      expect(events[0]!.payload.note).toBe('Reviewed application');
      record('RPC-06', { status: 'PASS', stage_state_unchanged: true, aging_reset: true, event: 'KEEP_ACTIVE', note: 'Reviewed application' });
    });

    it('RPC-07: archive and restore are explicit, logged, and reject no-op transitions', async () => {
      const arch = await bob.db().rpc('rpc_archive_application', { p_application_id: bobAppId });
      const again = await bob.db().rpc('rpc_archive_application', { p_application_id: bobAppId });
      expect(arch.error).toBeNull();
      expect(again.error?.message).toContain('ALREADY_ARCHIVED');
      const archived = await bob.db().from('applications').select('archived_at, status').eq('id', bobAppId).single();
      expect(archived.data?.archived_at).toBeTruthy();
      expect(archived.data?.status).toBe('OPEN'); // archive is not a lifecycle outcome
      const rest = await bob.db().rpc('rpc_restore_application', { p_application_id: bobAppId });
      const restAgain = await bob.db().rpc('rpc_restore_application', { p_application_id: bobAppId });
      expect(rest.error).toBeNull();
      expect(rest.data.archived_at).toBeNull();
      expect(restAgain.error?.message).toContain('NOT_ARCHIVED');
      expect(await eventsOf(bob, bobAppId, 'ARCHIVED')).toHaveLength(1);
      expect(await eventsOf(bob, bobAppId, 'RESTORED')).toHaveLength(1);
      record('RPC-07', { status: 'PASS', archived_then_restored: true, archive_keeps_state: 'OPEN', double_archive: 'ALREADY_ARCHIVED', double_restore: 'NOT_ARCHIVED' });
    });

    it('RPC-08: MANAGER can move a member record; the event records the manager as actor', async () => {
      const { error } = await managerCharlie.db().rpc('rpc_move_application_stage', { p_application_id: bobAppId, p_new_stage: 'APPLIED' });
      expect(error).toBeNull();
      const events = await eventsOf(managerCharlie, bobAppId, 'STAGE_CHANGED');
      const move = events.find((e) => e.payload.from_stage === 'SAVED' && e.payload.to_stage === 'APPLIED');
      expect(move?.actor_id).toBe(managerCharlie.userId);
      record('RPC-08', { status: 'PASS', manager_move_member: 'allowed', actor: 'manager' });
    });
  });

  // ===========================================================================
  // SECTION 4: DUPLICATE DETECTION ENGINE (AC-DUP-01 .. 03)
  // ===========================================================================
  describe('Duplicate Detection Engine (rpc_check_application_duplicate)', () => {
    it('DUP-01: Strong duplicate on matching job URL (case/whitespace-insensitive)', async () => {
      const { data, error } = await alice.db().rpc('rpc_check_application_duplicate', {
        p_workspace_id: sharedWsId, p_company_name: 'Different Company Name', p_role_title: 'Different Title',
        p_job_url: `  HTTPS://ACME.COM/jobs/${run}-101 `,
      });
      expect(error).toBeNull();
      expect(data.tier).toBe('STRONG');
      expect(data.matches.map((m: { id: string }) => m.id)).toContain(aliceAppId);
      record('DUP-01', { status: 'PASS', tier: data.tier });
    });

    it('DUP-02: Strong duplicate on matching requisition ID', async () => {
      const { data, error } = await alice.db().rpc('rpc_check_application_duplicate', {
        p_workspace_id: sharedWsId, p_company_name: 'Acme Unknown', p_role_title: 'Software Developer', p_external_job_id: `ACME-${run}-101`,
      });
      expect(error).toBeNull();
      expect(data.tier).toBe('STRONG');
      record('DUP-02', { status: 'PASS', tier: data.tier });
    });

    it('DUP-03: Probable duplicate on case-insensitive company + role', async () => {
      const { data, error } = await alice.db().rpc('rpc_check_application_duplicate', {
        p_workspace_id: sharedWsId, p_company_name: 'acme corp', p_role_title: 'senior frontend engineer', p_job_url: 'https://other-url.com/x',
      });
      expect(error).toBeNull();
      expect(data.tier).toBe('PROBABLE');
      record('DUP-03', { status: 'PASS', tier: data.tier });
    });

    it('DUP-04: Possible duplicate on same company, different role', async () => {
      const { data, error } = await alice.db().rpc('rpc_check_application_duplicate', {
        p_workspace_id: sharedWsId, p_company_name: 'Acme Corp', p_role_title: 'Director of Product',
      });
      expect(error).toBeNull();
      expect(data.tier).toBe('POSSIBLE');
      record('DUP-04', { status: 'PASS', tier: data.tier });
    });

    it('DUP-05: None when nothing matches', async () => {
      const { data, error } = await alice.db().rpc('rpc_check_application_duplicate', {
        p_workspace_id: sharedWsId, p_company_name: 'Novel Brand Corp', p_role_title: 'Head of Analytics',
      });
      expect(error).toBeNull();
      expect(data).toEqual({ tier: 'NONE', matches: [] });
      record('DUP-05', { status: 'PASS', tier: data.tier });
    });

    it('DUP-06: duplicate check never reveals peer records or foreign workspaces', async () => {
      const peer = await alice.db().rpc('rpc_check_application_duplicate', {
        p_workspace_id: sharedWsId, p_company_name: 'Globex Inc', p_role_title: 'Backend Platform Engineer', p_job_url: `https://globex.com/jobs/${run}-202`,
      });
      const foreign = await alice.db().rpc('rpc_check_application_duplicate', {
        p_workspace_id: foreignWsId, p_company_name: 'Wayne Enterprises', p_role_title: 'Security Lead',
      });
      expect(peer.error).toBeNull();
      expect(peer.data.tier).toBe('NONE');
      expect(foreign.error?.message).toContain('NOT_AUTHORIZED');
      record('DUP-06', { status: 'PASS', peer_record_tier: peer.data.tier, foreign_workspace: 'NOT_AUTHORIZED' });
    });
  });

  // ===========================================================================
  // SECTION 5: JOB SNAPSHOTS (AC-DB-03, ADR-013 immutability)
  // ===========================================================================
  describe('Job Snapshots', () => {
    it('JOB-01: snapshot capture is stored, logged as CAPTURED, and immutable afterwards', async () => {
      const { data, error } = await alice.db().from('job_snapshots').insert({
        application_id: aliceAppId, workspace_id: sharedWsId,
        job_description: 'We are seeking an experienced Frontend Engineer...',
        requirements: '5+ years TypeScript & React experience', skills: 'React, TypeScript, CSS, Playwright',
        raw_payload: { source: 'web_form', version: 1 },
      }).select('*').single();
      expect(error).toBeNull();
      expect(data?.skills).toContain('TypeScript');
      const upd = await alice.db().from('job_snapshots').update({ skills: 'rewritten' }).eq('id', data!.id).select('id');
      const del = await alice.db().from('job_snapshots').delete().eq('id', data!.id).select('id');
      const second = await alice.db().from('job_snapshots').insert({ application_id: aliceAppId, workspace_id: sharedWsId, job_description: 'second' });
      expect(upd.error?.code).toBe('42501');
      expect(del.error?.code).toBe('42501');
      expect(second.error?.code).toBe('23505'); // one snapshot per application
      expect(await eventsOf(alice, aliceAppId, 'CAPTURED')).toHaveLength(1);
      record('JOB-01', { status: 'PASS', captured: true, event: 'CAPTURED', client_update: upd.error?.code, client_delete: del.error?.code, second_snapshot: second.error?.code });
    });

    it('JOB-02: a peer cannot read another user\'s snapshot', async () => {
      const { data, error } = await bob.db().from('job_snapshots').select('*').eq('application_id', aliceAppId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
      record('JOB-02', { status: 'PASS', peer_snapshot_rows: 0 });
    });
  });

  // ===========================================================================
  // SECTION 6: QUERIES — search, aging, pagination, no automatic mutation
  // ===========================================================================
  describe('Grid queries', () => {
    let wsSearch: string;
    const created: Record<string, string> = {};

    beforeAll(async () => {
      const { data } = await alice.db().rpc('rpc_create_workspace', { p_name: `Search WS ${run}` });
      wsSearch = data as string;
      const rows = [
        { key: 'comma', company_name: 'Acme, Inc (Beta)', role_title: 'Designer', tags: ['figma'] },
        { key: 'percent', company_name: '100%_Club', role_title: 'Analyst', tags: [] },
        { key: 'plain', company_name: '100 Club', role_title: 'Analyst', tags: ['typescript'] },
        { key: 'quote', company_name: 'Say "Hello" Ltd', role_title: 'Writer', tags: [] },
        { key: 'stale', company_name: 'Stale Co', role_title: 'Engineer', tags: [] },
        { key: 'long', company_name: 'Long Co', role_title: 'Engineer', tags: [] },
        { key: 'fresh', company_name: 'Fresh Co', role_title: 'Engineer', tags: [] },
      ];
      for (const r of rows) {
        const ins = await alice.db().from('applications').insert({ workspace_id: wsSearch, user_id: alice.userId!, company_name: r.company_name, role_title: r.role_title, tags: r.tags }).select('id').single();
        expect(ins.error).toBeNull();
        created[r.key] = ins.data!.id;
      }
      // Simulate inactivity (service role; last_activity_at is data, not lifecycle state).
      const day = 86_400_000;
      await admin.from('applications').update({ last_activity_at: new Date(Date.now() - 20 * day).toISOString() }).eq('id', created.stale!);
      await admin.from('applications').update({ last_activity_at: new Date(Date.now() - 45 * day).toISOString() }).eq('id', created.long!);
    });

    const search = async (term: string) => {
      const f = buildSearchFilter(term);
      const r = await alice.db().from('applications').select('id').eq('workspace_id', wsSearch).or(f!);
      expect(r.error, term).toBeNull();
      return (r.data ?? []).map((x) => x.id);
    };

    it('QRY-01: search is injection-safe (commas, parentheses, quotes, % and _ are literal) and covers tags', async () => {
      const comma = await search('Acme, Inc (');
      const percent = await search('100%_');
      const quote = await search('"Hello"');
      const tag = await search('typescript');
      const hostile = await search('x),user_id.neq.00000000-0000-0000-0000-000000000000,(company_name.eq.x');
      expect(comma).toEqual([created.comma]);
      expect(percent).toEqual([created.percent]); // "100 Club" must NOT match a literal "%_"
      expect(quote).toEqual([created.quote]);
      expect(tag).toEqual([created.plain]);
      expect(hostile).toEqual([]);
      record('QRY-01', { status: 'PASS', comma_parens: 1, literal_percent_underscore: 1, quotes: 1, tag_match: 1, filter_injection_rows: 0 });
    });

    it('QRY-02: aging filters match Gate 02B bands (Stale 15–30d, Long Waiting 31+d) for OPEN records', async () => {
      const q = async (band: 'STALE' | 'LONG_WAITING' | 'QUIET') => {
        const range = agingRange(band, new Date());
        let query = alice.db().from('applications').select('id').eq('workspace_id', wsSearch).eq('status', 'OPEN').lte('last_activity_at', range.to);
        if (range.from) query = query.gt('last_activity_at', range.from);
        const r = await query;
        expect(r.error).toBeNull();
        return (r.data ?? []).map((x) => x.id).sort();
      };
      expect(await q('STALE')).toEqual([created.stale]);
      expect(await q('LONG_WAITING')).toEqual([created.long]);
      expect(await q('QUIET')).toEqual([created.stale, created.long].sort());
      record('QRY-02', { status: 'PASS', stale: 1, long_waiting: 1, quiet: 2, fresh_excluded: true });
    });

    it('QRY-03: no automatic mutation — a 45-day-inactive record stays OPEN, unarchived, un-ghosted', async () => {
      const { data } = await alice.db().from('applications').select('status, outcome, archived_at, stage').eq('id', created.long!).single();
      expect(data).toEqual({ status: 'OPEN', outcome: null, archived_at: null, stage: 'APPLIED' });
      const evs = await eventsOf(alice, created.long!);
      expect(evs.map((e) => e.event_type)).toEqual(['CREATED']);
      record('QRY-03', { status: 'PASS', long_inactive_state: 'OPEN', outcome: null, archived: false, events: ['CREATED'] });
    });

    it('QRY-04: exact count + range pagination returns disjoint, complete pages', async () => {
      const page = (i: number) =>
        alice.db().from('applications').select('id', { count: 'exact' }).eq('workspace_id', wsSearch)
          .order('company_name', { ascending: true }).order('id', { ascending: true }).range(i * 3, i * 3 + 2);
      const [p0, p1, p2] = await Promise.all([page(0), page(1), page(2)]);
      const ids = [...p0.data!, ...p1.data!, ...p2.data!].map((x) => x.id);
      expect(p0.count).toBe(7);
      expect(new Set(ids).size).toBe(7);
      record('QRY-04', { status: 'PASS', total_count: p0.count, pages: [p0.data!.length, p1.data!.length, p2.data!.length], disjoint: true });
    });
  });
});
