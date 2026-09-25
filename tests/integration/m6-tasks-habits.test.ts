/**
 * M6 · Tasks, Habits & Unified Queue integration suite (real Supabase stack, Option B tokens).
 *  - Tasks RLS (own / peer / manager / foreign / removed / anon), column-level boundary, no hard delete.
 *  - Relationship integrity: composite FKs + owner-matching links (application / contact / interview).
 *  - Recurrence engine: DAILY / WEEKDAYS / WEEKLY / BIWEEKLY / MONTHLY, overdue skip, DST wall time,
 *    monthly anchor, no duplicate next instance, undo.
 *  - One canonical reminder model: contact follow-ups (projection), interview reminders, next actions.
 *  - Habits + habit logs: RLS, idempotent check-ins, paused/archived, target snapshot, timezone "today".
 *  - Manager mutation audit.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, serviceDb, anonDb, makeRecorder } from './harness';

const record = makeRecorder('migration-upgrade/m6/evidence', 'integration');
const ready = loadEnv();
const DAY = 86_400_000;

/** Calendar date (YYYY-MM-DD) of `now + days` in an IANA zone. */
const dayIn = (tz: string, days = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + days * DAY));
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

describe.skipIf(!ready)('Milestone 6 — Tasks, Habits & Unified Queue', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();

  let alice: Actor; // USER
  let bob: Actor; // USER (peer)
  let charlie: Actor; // MANAGER of shared workspace
  let dave: Actor; // MANAGER of foreign workspace
  let eve: Actor; // USER later removed

  let ws: string;
  let foreignWs: string;
  let aliceApp: string;
  let bobApp: string;
  let daveApp: string;
  let aliceContact: string;
  let bobContact: string;
  let aliceTask: string;

  const pw = (t: string) => `Valid-M6-Pass-${run}-${t}!`;
  const newTask = (a: Actor, extra: Record<string, unknown>) =>
    a.db().from('tasks').insert({ workspace_id: ws, user_id: a.userId!, title: `Task ${randomBytes(2).toString('hex')}`, ...extra }).select().single();
  const task = async (id: string) => (await admin.from('tasks').select('*').eq('id', id).single()).data!;
  const audit = async (id: string) => (await admin.from('audit_events').select('action, actor_id, target_user_id, target_entity_type').eq('target_entity_id', id)).data ?? [];

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();

    alice = new Actor(); bob = new Actor(); charlie = new Actor(); dave = new Actor(); eve = new Actor();
    for (const [a, t] of [[alice, 'alice'], [bob, 'bob'], [charlie, 'charlie'], [dave, 'dave'], [eve, 'eve']] as const) {
      const r = await a.call('/auth/register', { username: `m6_${t}_${run}`, password: pw(t) });
      expect(r.status).toBe(201);
    }
    ws = (await charlie.db().rpc('rpc_create_workspace', { p_name: `M6 Shared ${run}` })).data as string;
    foreignWs = (await dave.db().rpc('rpc_create_workspace', { p_name: `M6 Foreign ${run}` })).data as string;
    expect((await admin.from('workspace_members').insert([
      { workspace_id: ws, user_id: alice.userId!, role: 'USER' },
      { workspace_id: ws, user_id: bob.userId!, role: 'USER' },
      { workspace_id: ws, user_id: eve.userId!, role: 'USER' },
    ])).error).toBeNull();
    const mkApp = async (a: Actor, w: string, c: string) =>
      (await a.db().from('applications').insert({ workspace_id: w, user_id: a.userId!, company_name: c, role_title: 'Engineer', stage: 'APPLIED', status: 'OPEN' }).select('id').single()).data!.id as string;
    aliceApp = await mkApp(alice, ws, `Northwind ${run}`);
    bobApp = await mkApp(bob, ws, `Bob Co ${run}`);
    daveApp = await mkApp(dave, foreignWs, `Foreign ${run}`);
    aliceContact = (await alice.db().rpc('rpc_create_contact', { p_workspace_id: ws, p_full_name: 'Jonah Wells' })).data.id;
    bobContact = (await bob.db().rpc('rpc_create_contact', { p_workspace_id: ws, p_full_name: 'Bob Private' })).data.id;
    for (const a of [alice, bob, charlie, eve]) {
      expect((await a.db().from('profiles').update({ timezone: 'America/Chicago' }).eq('user_id', a.userId!)).error).toBeNull();
    }
  });

  it('M6-01 · USER own tasks: insert/select/update simple fields; status, ownership and delete are not client-writable', async () => {
    const r = await newTask(alice, { title: '  Send 2nd follow-up  ', task_type: 'FOLLOW_UP', application_id: aliceApp, due_date: dayIn('America/Chicago', -5), priority: 'HIGH' });
    expect(r.error).toBeNull();
    aliceTask = r.data.id;
    expect(r.data).toMatchObject({ status: 'PENDING', completed_at: null, title: 'Send 2nd follow-up', user_id: alice.userId });
    expect((await alice.db().from('tasks').select('id').eq('id', aliceTask)).data).toHaveLength(1);
    const upd = await alice.db().from('tasks').update({ title: 'Send 2nd follow-up (edited)', priority: 'MEDIUM' }).eq('id', aliceTask).select('title').single();
    expect(upd.error).toBeNull();
    for (const patch of [{ status: 'COMPLETED' }, { completed_at: new Date().toISOString() }, { user_id: bob.userId }, { workspace_id: foreignWs }, { parent_task_id: aliceTask }]) {
      expect((await alice.db().from('tasks').update(patch).eq('id', aliceTask).select()).error?.code, JSON.stringify(patch)).toBe('42501');
    }
    const insDone = await alice.db().from('tasks').insert({ workspace_id: ws, user_id: alice.userId!, title: 'x', status: 'COMPLETED' });
    expect(insDone.error?.code).toBe('42501');
    expect((await alice.db().from('tasks').delete().eq('id', aliceTask).select()).error?.code).toBe('42501');
    // Cancel is the archive-first removal; the row stays.
    const t2 = await newTask(alice, { title: 'Throwaway' });
    expect((await alice.db().rpc('rpc_cancel_task', { p_task_id: t2.data.id })).error).toBeNull();
    expect((await task(t2.data.id)).status).toBe('CANCELLED');
    record('m6-01-own-tasks', { insert: 'OK', trimmedTitle: true, invariants: '42501', insertCompleted: '42501', delete: '42501', cancelKeepsRow: true });
  });

  it('M6-02 · task shape rules are enforced by the database', async () => {
    expect((await newTask(alice, { task_type: 'REMINDER' })).error?.code).toBe('23514');
    expect((await newTask(alice, { task_type: 'FOLLOW_UP', due_date: dayIn('UTC', 2) })).error?.code).toBe('23514');
    expect((await newTask(alice, { due_date: dayIn('UTC', 1), due_at: new Date().toISOString() })).error?.code).toBe('23514');
    expect((await newTask(alice, { recurrence_rule: 'DAILY' })).error?.code).toBe('23514');
    expect((await newTask(alice, { recurrence_rule: 'HOURLY', due_date: dayIn('UTC', 1) })).error?.code).toBe('23514');
    expect((await newTask(alice, { priority: 'URGENT' })).error?.code).toBe('23514');
    record('m6-02-shape', { reminderNeedsDue: true, followUpNeedsLink: true, oneDue: true, recurrenceNeedsDue: true, badEnums: '23514' });
  });

  it('M6-03 · peer USER is denied on another member’s tasks', async () => {
    expect((await bob.db().from('tasks').select('id').eq('id', aliceTask)).data).toHaveLength(0);
    const upd = await bob.db().from('tasks').update({ title: 'peer' }).eq('id', aliceTask).select();
    expect(upd.data).toHaveLength(0);
    expect((await bob.db().rpc('rpc_complete_task', { p_task_id: aliceTask })).error?.code).toBe('42501');
    expect((await bob.db().rpc('rpc_cancel_task', { p_task_id: aliceTask })).error?.code).toBe('42501');
    const forged = await bob.db().from('tasks').insert({ workspace_id: ws, user_id: alice.userId!, title: 'for alice' });
    expect(forged.error?.code).toBe('42501');
    record('m6-03-peer', { select: 0, update: 0, complete: '42501', cancel: '42501', insertForPeer: '42501' });
  });

  it('M6-04 · MANAGER same workspace: read, create for a member, complete (audited); foreign workspace denied', async () => {
    expect((await charlie.db().from('tasks').select('id').eq('id', aliceTask)).data).toHaveLength(1);
    const forAlice = await charlie.db().from('tasks').insert({ workspace_id: ws, user_id: alice.userId!, title: 'Prep portfolio (from manager)', due_date: dayIn('UTC', 3) }).select().single();
    expect(forAlice.error).toBeNull();
    expect((await charlie.db().rpc('rpc_complete_task', { p_task_id: forAlice.data.id })).error).toBeNull();
    const a = await audit(forAlice.data.id);
    expect(a.map((x) => x.action).sort()).toEqual(['RECORD_CREATED', 'RECORD_UPDATED']);
    expect(a.every((x) => x.actor_id === charlie.userId && x.target_user_id === alice.userId && x.target_entity_type === 'TASK')).toBe(true);
    expect((await dave.db().from('tasks').select('id').eq('id', aliceTask)).data).toHaveLength(0);
    expect((await dave.db().rpc('rpc_complete_task', { p_task_id: aliceTask })).error?.code).toBe('42501');
    const notMember = await charlie.db().from('tasks').insert({ workspace_id: ws, user_id: dave.userId!, title: 'nope' });
    expect(notMember.error?.code).toBe('42501');
    // Owner self-actions are not audited.
    const own = await newTask(alice, { title: 'own' });
    expect(await audit(own.data.id)).toHaveLength(0);
    record('m6-04-manager', { read: true, createForMember: true, completeAudited: true, foreign: 'denied', nonMemberOwner: '42501', ownerNotAudited: true });
  });

  it('M6-05 · removed member loses task and habit access', async () => {
    const t = await newTask(eve, { title: 'Eve task' });
    const h = await eve.db().from('habits').insert({ workspace_id: ws, user_id: eve.userId!, title: 'Eve habit' }).select().single();
    expect(t.error).toBeNull();
    expect(h.error).toBeNull();
    expect((await admin.from('workspace_members').delete().eq('workspace_id', ws).eq('user_id', eve.userId!)).error).toBeNull();
    expect((await eve.db().from('tasks').select('id').eq('id', t.data.id)).data).toHaveLength(0);
    expect((await eve.db().from('habits').select('id').eq('id', h.data.id)).data).toHaveLength(0);
    expect((await eve.db().rpc('rpc_complete_task', { p_task_id: t.data.id })).error?.code).toBe('42501');
    expect((await eve.db().rpc('rpc_set_habit_log', { p_habit_id: h.data.id, p_log_date: dayIn('America/Chicago'), p_count: 1 })).error?.code).toBe('42501');
    record('m6-05-removed-member', { tasks: 0, habits: 0, rpc: '42501' });
  });

  it('M6-06 · relationship integrity: cross-workspace links fail at the DB; links must belong to the task owner', async () => {
    const cross = await admin.from('tasks').insert({ workspace_id: ws, user_id: alice.userId!, title: 'x', application_id: daveApp });
    expect(cross.error?.code).toBe('23503');
    const peerApp = await newTask(alice, { title: 'x', application_id: bobApp });
    expect(peerApp.error?.code).toBe('42501');
    expect(peerApp.error?.message).toMatch(/TASK_LINK_FORBIDDEN/);
    const peerContact = await newTask(alice, { title: 'x', contact_id: bobContact });
    expect(peerContact.error?.code).toBe('42501');
    const relink = await alice.db().from('tasks').update({ application_id: bobApp }).eq('id', aliceTask).select();
    expect(relink.error?.code).toBe('42501');
    // An interview link implies its application.
    const iv = await alice.db().rpc('rpc_schedule_interview', { p_application_id: aliceApp, p_interview_type: 'TECHNICAL', p_scheduled_at: new Date(Date.now() + 5 * DAY).toISOString() });
    const viaInterview = await newTask(alice, { title: 'Prepare questions', interview_id: iv.data.id });
    expect(viaInterview.error).toBeNull();
    expect(viaInterview.data.application_id).toBe(aliceApp);
    const mismatch = await admin.from('tasks').insert({ workspace_id: ws, user_id: alice.userId!, title: 'x', interview_id: iv.data.id, application_id: (await admin.from('applications').insert({ workspace_id: ws, user_id: alice.userId!, company_name: 'Other', role_title: 'x', stage: 'APPLIED', status: 'OPEN' }).select('id').single()).data!.id });
    expect(mismatch.error?.message).toMatch(/TASK_LINK_MISMATCH/);
    record('m6-06-integrity', { crossWorkspace: '23503', peerApp: '42501', peerContact: '42501', relinkToPeer: '42501', interviewImpliesApp: true, mismatch: 'TASK_LINK_MISMATCH' });
  });

  it('M6-07 · recurrence: every approved rule computes the right next instance, once', async () => {
    const tz = 'America/Chicago';
    const base = addDays(dayIn(tz), 10);
    const cases: [string, string, string][] = [
      ['DAILY', base, addDays(base, 1)],
      ['WEEKLY', base, addDays(base, 7)],
      ['BIWEEKLY', base, addDays(base, 14)],
      ['WEEKDAYS', '2027-10-01', '2027-10-04'], // Friday -> Monday
      ['MONTHLY', '2027-01-31', '2027-02-28'], // clamped to month end
    ];
    const results: Record<string, string> = {};
    for (const [rule, due, expected] of cases) {
      const t = await newTask(alice, { title: `${rule} task`, due_date: due, recurrence_rule: rule });
      expect(t.error, rule).toBeNull();
      const c = await alice.db().rpc('rpc_complete_task', { p_task_id: t.data.id });
      expect(c.error, rule).toBeNull();
      const next = await task(c.data.next_task_id);
      expect(next.due_date, rule).toBe(expected);
      expect(next).toMatchObject({ status: 'PENDING', recurrence_rule: rule, parent_task_id: t.data.id, title: `${rule} task` });
      results[rule] = next.due_date;
      if (rule === 'MONTHLY') {
        // The series keeps its day: Feb 28 -> Mar 31 (anchor Jan 31), not Mar 28.
        const c2 = await alice.db().rpc('rpc_complete_task', { p_task_id: next.id });
        expect((await task(c2.data.next_task_id)).due_date).toBe('2027-03-31');
      }
      // Completing again is rejected; no duplicate next instance.
      expect((await alice.db().rpc('rpc_complete_task', { p_task_id: t.data.id })).error?.message).toMatch(/TASK_NOT_PENDING/);
      expect((await admin.from('tasks').select('id').eq('parent_task_id', t.data.id)).data).toHaveLength(1);
    }
    // Overdue daily task: next occurrence is not in the past (no stacked overdue copies).
    const overdue = await newTask(alice, { title: 'Overdue daily', due_date: addDays(dayIn(tz), -6), recurrence_rule: 'DAILY' });
    const oc = await alice.db().rpc('rpc_complete_task', { p_task_id: overdue.data.id });
    expect((await task(oc.data.next_task_id)).due_date).toBe(dayIn(tz));
    // Timed daily item keeps its wall-clock time across the fall-back DST change.
    const timed = await newTask(alice, { title: 'Timed daily', task_type: 'REMINDER', due_at: '2026-10-31T09:00:00-05:00', recurrence_rule: 'DAILY' });
    const tc = await alice.db().rpc('rpc_complete_task', { p_task_id: timed.data.id });
    expect(new Date((await task(tc.data.next_task_id)).due_at).toISOString()).toBe('2026-11-01T15:00:00.000Z'); // 09:00 CST
    // The database refuses a second next instance for the same parent.
    const dup = await admin.from('tasks').insert({ workspace_id: ws, user_id: alice.userId!, title: 'dup', parent_task_id: timed.data.id });
    expect(dup.error?.code).toBe('23505');
    record('m6-07-recurrence', { ...results, monthlyThird: '2027-03-31', overdueSkipsToToday: true, dstWallTime: '2026-11-01T15:00:00Z', duplicateNext: '23505' });
  });

  it('M6-08 · undo completion withdraws the untouched next instance; a changed one blocks undo', async () => {
    const t = await newTask(alice, { title: 'Undo me', due_date: addDays(dayIn('America/Chicago'), 3), recurrence_rule: 'WEEKLY' });
    const c = await alice.db().rpc('rpc_complete_task', { p_task_id: t.data.id });
    const u = await alice.db().rpc('rpc_reopen_task', { p_task_id: t.data.id });
    expect(u.error).toBeNull();
    expect((await task(t.data.id))).toMatchObject({ status: 'PENDING', completed_at: null });
    expect((await admin.from('tasks').select('id').eq('id', c.data.next_task_id)).data).toHaveLength(0);
    const c2 = await alice.db().rpc('rpc_complete_task', { p_task_id: t.data.id });
    await alice.db().from('tasks').update({ title: 'Edited next' }).eq('id', c2.data.next_task_id);
    const blocked = await alice.db().rpc('rpc_reopen_task', { p_task_id: t.data.id });
    expect(blocked.error?.message).toMatch(/TASK_REOPEN_CONFLICT/);
    expect((await task(t.data.id)).status).toBe('COMPLETED'); // rolled back
    record('m6-08-undo', { reopen: 'OK', childWithdrawn: true, conflictRollsBack: true });
  });

  it('M6-09 · contact follow-ups: tasks are canonical and contacts.next_follow_up_date is their projection', async () => {
    const d1 = addDays(dayIn('America/Chicago'), 4);
    const c = await alice.db().rpc('rpc_create_contact', { p_workspace_id: ws, p_full_name: `Ana Liu ${run}`, p_next_follow_up_date: d1 });
    expect(c.error).toBeNull();
    const cid = c.data.id as string;
    const fu = async () => (await admin.from('tasks').select('id, due_date, status').eq('contact_id', cid).eq('task_type', 'FOLLOW_UP').order('created_at')).data!;
    const proj = async () => (await admin.from('contacts').select('next_follow_up_date').eq('id', cid).single()).data!.next_follow_up_date;
    expect(await fu()).toEqual([expect.objectContaining({ due_date: d1, status: 'PENDING' })]);
    expect(await proj()).toBe(d1);

    // A direct edit of the contact field (M4 edit form) moves the same task.
    const d2 = addDays(d1, 3);
    expect((await alice.db().from('contacts').update({ next_follow_up_date: d2 }).eq('id', cid)).error).toBeNull();
    expect((await fu()).filter((t) => t.status === 'PENDING')).toEqual([expect.objectContaining({ due_date: d2 })]);
    expect(await proj()).toBe(d2);

    // Logging an interaction with a next follow-up (M4 RPC) also goes through the task.
    const d3 = addDays(d1, 5);
    expect((await alice.db().rpc('rpc_log_contact_interaction', { p_contact_id: cid, p_interaction_type: 'EMAIL', p_notes: 'Sent intro', p_next_follow_up_date: d3 })).error).toBeNull();
    expect((await fu()).filter((t) => t.status === 'PENDING').map((t) => t.due_date)).toEqual([d3]);
    expect(await proj()).toBe(d3);

    // An earlier explicit follow-up task becomes the projection.
    const early = await newTask(alice, { task_type: 'FOLLOW_UP', title: 'Coffee chat', contact_id: cid, due_date: d1 });
    expect(early.error).toBeNull();
    expect(await proj()).toBe(d1);

    // "Done" completes the earliest follow-up; the projection moves to the next one.
    expect((await alice.db().rpc('rpc_complete_contact_follow_up', { p_contact_id: cid })).error).toBeNull();
    expect((await task(early.data.id)).status).toBe('COMPLETED');
    expect(await proj()).toBe(d3);

    // Clearing cancels the remaining follow-ups (history kept).
    expect((await alice.db().rpc('rpc_set_contact_follow_up', { p_contact_id: cid, p_due_date: null })).error).toBeNull();
    expect(await proj()).toBeNull();
    expect((await fu()).every((t) => t.status !== 'PENDING')).toBe(true);
    expect((await bob.db().rpc('rpc_set_contact_follow_up', { p_contact_id: cid, p_due_date: d1 })).error?.code).toBe('42501');
    record('m6-09-contact-follow-ups', { createViaRpc: 'task', directEditMovesTask: true, interactionMovesTask: true, projectionEarliest: true, doneCompletes: true, clearCancels: true, peer: '42501' });
  });

  it('M6-10 · interview reminders are REMINDER tasks that follow reschedules and outcomes', async () => {
    const at = new Date(Date.now() + 3 * DAY);
    at.setUTCSeconds(0, 0);
    const s = await alice.db().rpc('rpc_schedule_interview', {
      p_application_id: aliceApp, p_interview_type: 'RECRUITER_SCREEN', p_scheduled_at: at.toISOString(), p_remind_before_minutes: 60,
    });
    expect(s.error).toBeNull();
    const rem = async () => (await admin.from('tasks').select('*').eq('interview_id', s.data.id).eq('task_type', 'REMINDER')).data!;
    const [r] = await rem();
    expect(r).toMatchObject({ application_id: aliceApp, user_id: alice.userId, status: 'PENDING', priority: 'HIGH' });
    expect(Date.parse(r.due_at)).toBe(at.getTime() - 3_600_000);
    // No reminder unless asked for.
    const s2 = await alice.db().rpc('rpc_schedule_interview', { p_application_id: aliceApp, p_interview_type: 'PANEL', p_scheduled_at: at.toISOString() });
    expect((await admin.from('tasks').select('id').eq('interview_id', s2.data.id))).toMatchObject({ data: [] });
    // Reschedule moves the reminder by the same amount.
    const moved = new Date(at.getTime() + 2 * DAY);
    expect((await alice.db().from('interviews').update({ scheduled_at: moved.toISOString() }).eq('id', s.data.id)).error).toBeNull();
    expect(Date.parse((await rem())[0].due_at)).toBe(moved.getTime() - 3_600_000);
    // Cancelling the interview cancels its pending reminder.
    expect((await alice.db().rpc('rpc_record_interview_outcome', { p_interview_id: s.data.id, p_outcome: 'CANCELLED' })).error).toBeNull();
    expect((await rem())[0].status).toBe('CANCELLED');
    record('m6-10-interview-reminders', { reminderTask: true, offsetMinutes: 60, noReminderByDefault: true, rescheduleShifts: true, cancelCancels: true });
  });

  it('M6-11 · "Done, set next" for an application next action writes NEXT_ACTION_CHANGED; follow-up completion is timeline activity', async () => {
    expect((await alice.db().from('applications').update({ next_action: 'Final follow-up or close', next_action_date: dayIn('America/Chicago', -4) }).eq('id', aliceApp)).error).toBeNull();
    const d = await alice.db().rpc('rpc_complete_next_action', { p_application_id: aliceApp, p_next_action: 'Prepare for panel', p_next_action_date: dayIn('America/Chicago', 7) });
    expect(d.error).toBeNull();
    const app = (await admin.from('applications').select('next_action, next_action_date, next_action_completed_at').eq('id', aliceApp).single()).data!;
    expect(app).toMatchObject({ next_action: 'Prepare for panel', next_action_date: dayIn('America/Chicago', 7) });
    expect(app.next_action_completed_at).toBeTruthy();
    const ev = (await admin.from('application_events').select('event_type, payload').eq('application_id', aliceApp).eq('event_type', 'NEXT_ACTION_CHANGED')).data!;
    expect(ev.at(-1)!.payload).toMatchObject({ completed_action: 'Final follow-up or close', next_action: 'Prepare for panel' });
    const none = await alice.db().rpc('rpc_complete_next_action', { p_application_id: aliceApp });
    expect(none.error).toBeNull(); // completes "Prepare for panel" with no next one
    expect((await alice.db().rpc('rpc_complete_next_action', { p_application_id: aliceApp })).error?.message).toMatch(/NO_NEXT_ACTION/);
    expect((await bob.db().rpc('rpc_complete_next_action', { p_application_id: aliceApp, p_next_action: 'x' })).error?.code).toBe('42501');

    const fuEvents = async () => (await admin.from('application_events').select('id').eq('application_id', aliceApp).eq('event_type', 'FOLLOW_UP')).data!.length;
    const before = await fuEvents();
    expect((await alice.db().rpc('rpc_complete_task', { p_task_id: aliceTask })).error).toBeNull();
    expect(await fuEvents()).toBe(before + 1);
    record('m6-11-next-action', { doneSetNext: 'NEXT_ACTION_CHANGED', noNextActionError: true, peer: '42501', followUpTimelineEvent: true });
  });

  it('M6-12 · habits: RLS, idempotent check-ins, uncomplete, paused/archived, target snapshot, owner time zone', async () => {
    const h = await alice.db().from('habits').insert({ workspace_id: ws, user_id: alice.userId!, title: 'Apply to 3 roles', frequency: 'DAILY', target_count: 3 }).select().single();
    expect(h.error).toBeNull();
    const hid = h.data.id as string;
    const today = dayIn('America/Chicago');
    expect((await alice.db().rpc('rpc_set_habit_log', { p_habit_id: hid, p_log_date: today, p_count: 2 })).error).toBeNull();
    expect((await alice.db().rpc('rpc_set_habit_log', { p_habit_id: hid, p_log_date: today, p_count: 3 })).error).toBeNull();
    const logs = async () => (await alice.db().from('habit_logs').select('log_date, completed_count, target_count').eq('habit_id', hid)).data!;
    expect(await logs()).toEqual([{ log_date: today, completed_count: 3, target_count: 3 }]); // one row per day
    // Changing the target does not rewrite past days.
    expect((await alice.db().from('habits').update({ target_count: 5 }).eq('id', hid)).error).toBeNull();
    expect((await alice.db().rpc('rpc_set_habit_log', { p_habit_id: hid, p_log_date: addDays(today, -1), p_count: 5 })).error).toBeNull();
    expect((await logs()).find((l) => l.log_date === today)!.target_count).toBe(3);
    // Uncomplete removes the check-in.
    expect((await alice.db().rpc('rpc_set_habit_log', { p_habit_id: hid, p_log_date: addDays(today, -1), p_count: 0 })).error).toBeNull();
    expect(await logs()).toHaveLength(1);
    // "Today" is the owner's profile day: tomorrow is refused.
    expect((await alice.db().rpc('rpc_set_habit_log', { p_habit_id: hid, p_log_date: addDays(today, 1), p_count: 1 })).error?.message).toMatch(/FUTURE_DATE/);
    // Paused habits keep history and refuse new check-ins; archive keeps logs.
    expect((await alice.db().from('habits').update({ is_active: false }).eq('id', hid)).error).toBeNull();
    expect((await alice.db().rpc('rpc_set_habit_log', { p_habit_id: hid, p_log_date: today, p_count: 1 })).error?.message).toMatch(/HABIT_PAUSED/);
    expect((await alice.db().rpc('rpc_archive_habit', { p_habit_id: hid })).error).toBeNull();
    expect(await logs()).toHaveLength(1);
    expect((await alice.db().rpc('rpc_restore_habit', { p_habit_id: hid })).error).toBeNull();
    // Boundary: no direct log writes, no hard delete of habits, peer denied.
    expect((await alice.db().from('habit_logs').insert({ habit_id: hid, workspace_id: ws, user_id: alice.userId!, log_date: today })).error?.code).toBe('42501');
    expect((await alice.db().from('habits').delete().eq('id', hid).select()).error?.code).toBe('42501');
    expect((await bob.db().from('habits').select('id').eq('id', hid)).data).toHaveLength(0);
    expect((await bob.db().from('habit_logs').select('id').eq('habit_id', hid)).data).toHaveLength(0);
    expect((await bob.db().rpc('rpc_set_habit_log', { p_habit_id: hid, p_log_date: today, p_count: 1 })).error?.code).toBe('42501');
    expect((await bob.db().from('habits').insert({ workspace_id: ws, user_id: alice.userId!, title: 'forged' })).error?.code).toBe('42501');
    // Manager check-in for a member: attributed to the member, audited.
    const mg = await charlie.db().rpc('rpc_set_habit_log', { p_habit_id: hid, p_log_date: addDays(today, -2), p_count: 1 });
    expect(mg.error).toBeNull();
    const mgLog = (await admin.from('habit_logs').select('id, user_id').eq('habit_id', hid).eq('log_date', addDays(today, -2)).single()).data!;
    expect(mgLog.user_id).toBe(alice.userId);
    expect((await audit(mgLog.id)).map((a) => a.action)).toEqual(['RECORD_CREATED']);
    expect((await dave.db().from('habits').select('id').eq('id', hid)).data).toHaveLength(0);
    // Weekdays cadence is accepted (approved UI), unknown cadence is not.
    expect((await alice.db().from('habits').insert({ workspace_id: ws, user_id: alice.userId!, title: 'Weekday outreach', frequency: 'WEEKDAYS' })).error).toBeNull();
    expect((await alice.db().from('habits').insert({ workspace_id: ws, user_id: alice.userId!, title: 'x', frequency: 'HOURLY' })).error?.code).toBe('23514');
    record('m6-12-habits', { idempotent: true, targetSnapshot: true, uncomplete: true, futureRefused: true, paused: true, archiveKeepsLogs: true, directWrites: '42501', peer: 'denied', managerAudited: true });
  });

  it('M6-13 · anon is denied on the new tables and RPCs', async () => {
    const anon = anonDb();
    for (const t of ['tasks', 'habits', 'habit_logs']) expect((await anon.from(t).select('id')).error, t).toBeTruthy();
    for (const [fn, args] of [
      ['rpc_complete_task', { p_task_id: aliceTask }],
      ['rpc_complete_next_action', { p_application_id: aliceApp }],
      ['rpc_set_habit_log', { p_habit_id: aliceTask, p_log_date: '2026-01-01', p_count: 1 }],
      ['rpc_set_contact_follow_up', { p_contact_id: aliceContact, p_due_date: null }],
    ] as const) {
      expect((await anon.rpc(fn, args)).error, fn).toBeTruthy();
    }
    record('m6-13-anon', { denied: true });
  });
});
