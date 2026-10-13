import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, makeRecorder, serviceDb } from './harness';
import { calendarEnvelope, calendarFinding, deadlineFinding, allDayFinding } from '../unit/fixtures/ai-contract/calendar';
import { jobLeadFinding } from '../unit/fixtures/ai-contract/external';

// AI-7: calendar intelligence (ai_calendar_events child) against a REAL database: projection, identity,
// dedupe, reschedule / cancellation history, constraints, RLS (owner / manager / peer / other workspace /
// suspended / forged), reads, source availability and Daily Digest integration. Local stack only.
const ready = loadEnv();
const local = /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.SUPABASE_URL ?? '');
const record = makeRecorder('test-results/evidence', 'integration');
const ON = { AI_HUB_ENABLED: 'true' };
const quiet = { env: ON, log: () => undefined };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
type AnyRow = Record<string, any>;

describe.skipIf(!ready || !local)('AI-7 — calendar intelligence (real DB, RLS)', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const alice = new Actor(); // workspace manager
  const carol = new Actor(); // member, owner of the data
  const eve = new Actor(); // member, peer
  const frank = new Actor(); // member who is suspended later
  const dave = new Actor(); // unrelated workspace
  let ws: string;
  let daveWs: string;
  let svc: typeof import('../../apps/api/src/services/aiCalendarService');
  let digestSvc: typeof import('../../apps/api/src/services/aiDigestService');
  let ingest: typeof import('../../apps/api/src/services/aiIntegrationService').ingestAiResult;
  let n = 0;
  const uniq = (p: string) => `${p}-${run}-${++n}`;
  const as = (a: Actor, workspaceId = ws) => ({ workspaceId, accessToken: a.token! });

  /** A calendar envelope whose event identity is unique to this test run. */
  const calDoc = (tag: string, opts: {
    provider?: string; finding?: Record<string, unknown>; payload?: Record<string, unknown>; kind?: 'interview' | 'deadline' | 'allDay'; source?: string; noId?: boolean;
  } = {}) => {
    const make = opts.kind === 'deadline' ? deadlineFinding : opts.kind === 'allDay' ? allDayFinding : calendarFinding;
    const dedupe = opts.noId
      ? { source_type: 'calendar' }
      : { source_type: 'calendar', source_name: opts.source ?? 'google_calendar', source_id: `evt-${run}-${tag}` };
    return {
      ...clone(calendarEnvelope()),
      provider: opts.provider ?? 'claude',
      run: { external_run_id: uniq('cal'), generated_at: '2026-10-12T12:00:00Z' },
      findings: [make({ dedupe, title: `Interview ${tag}`, ...opts.finding }, { company: `Cal ${tag}`, ...opts.payload })],
    };
  };
  const submit = async (doc: unknown, owner: Actor = carol, workspaceId = ws) => {
    const r = await ingest({ workspaceId, userId: owner.userId!, actorKind: 'SERVICE_INGEST' }, doc, quiet);
    expect(r.runId, JSON.stringify(r.errors)).not.toBeNull();
    return r;
  };
  const findingOf = async (runId: string) => (await admin.from('ai_findings').select('*').eq('run_id', runId).single()).data as AnyRow;
  const eventOf = async (findingId: string) => (await admin.from('ai_calendar_events').select('*').eq('finding_id', findingId).maybeSingle()).data as AnyRow | null;
  const countFindings = async (company: string) =>
    ((await admin.from('ai_calendar_events').select('id').eq('user_id', carol.userId!).eq('company', company)).data ?? []).length;
  const listOf = async (a: Actor, filters = {}, page = {}, workspaceId = ws) => {
    const r = await svc.listCalendarIntelligence(as(a, workspaceId), filters, page, { env: ON });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return r.data;
  };
  const countApplications = async () => (await admin.from('applications').select('id', { count: 'exact', head: true }).eq('workspace_id', ws)).count ?? 0;

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();
    svc = await import('../../apps/api/src/services/aiCalendarService');
    digestSvc = await import('../../apps/api/src/services/aiDigestService');
    ({ ingestAiResult: ingest } = await import('../../apps/api/src/services/aiIntegrationService'));
    for (const [a, name] of [[alice, 'alice'], [carol, 'carol'], [eve, 'eve'], [frank, 'frank'], [dave, 'dave']] as const) {
      expect((await a.call('/auth/register', { username: `ai7_${name}_${run}`, password: `Valid-AI7-${name}-${run}!` })).status).toBe(201);
    }
    const prof = async (a: Actor) => (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', a.userId!).single()).data!.last_active_workspace_id as string;
    ws = await prof(alice);
    daveWs = await prof(dave);
    expect((await admin.from('workspace_members').insert([
      { workspace_id: ws, user_id: carol.userId!, role: 'USER', status: 'ACTIVE' },
      { workspace_id: ws, user_id: eve.userId!, role: 'USER', status: 'ACTIVE' },
      { workspace_id: ws, user_id: frank.userId!, role: 'USER', status: 'ACTIVE' },
    ])).error).toBeNull();
  });

  // ---- storage, projection, audit -----------------------------------------------------------

  it('AI7-01 · a calendar event is a finding plus a child row; times are normalized; the parent is audited once; no raw data; no application', async () => {
    const apps0 = await countApplications();
    const r = await submit(calDoc('01', { payload: { attendees: ['a@example.com'], description: 'RAW-INVITE-CANARY', meeting_url: 'https://zoom.example.com/j/1?pwd=SECRETPWD&lang=en' } }));
    expect(r.status).toBe('SUCCEEDED');
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['raw_calendar_rejected', 'url_secret_param_removed']));
    const f = await findingOf(r.runId!);
    expect(f).toMatchObject({ kind: 'calendar_event', provider: 'claude', status: 'NEW', category: 'interview', user_id: carol.userId, workspace_id: ws });
    expect(new Date(f.occurred_at).toISOString()).toBe('2026-10-15T19:00:00.000Z'); // 14:00 CDT stored as UTC
    expect(f.due_at).toBeNull();
    expect(JSON.stringify(f)).not.toMatch(/RAW-INVITE-CANARY|a@example\.com|SECRETPWD|attendees/);
    const child = await eventOf(f.id);
    expect(child).toMatchObject({
      workspace_id: ws, user_id: carol.userId, category: 'interview', is_deadline: false, status: 'scheduled', all_day: false, time_zone: 'America/Chicago',
      company: 'Cal 01', job_title: 'Staff Engineer', calendar_source: 'google_calendar', source_event_id: `evt-${run}-01`, organizer_domain: 'example.com',
      reschedule_count: 0, original_start_at: null, cancelled_at: null, start_date: null, end_date: null, deadline_at: null,
    });
    expect(new Date(child!.start_at).toISOString()).toBe('2026-10-15T19:00:00.000Z');
    expect(new Date(child!.end_at).toISOString()).toBe('2026-10-15T20:00:00.000Z');
    expect(new Date(child!.sort_at).toISOString()).toBe('2026-10-15T19:00:00.000Z');
    expect(child!.meeting_url).toBe('https://zoom.example.com/j/1?lang=en');
    expect(JSON.stringify(child)).not.toMatch(/RAW-INVITE-CANARY|SECRETPWD/);
    expect(new Date(child!.discovered_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
    const audits = (await admin.from('audit_events').select('action').eq('target_entity_id', f.id)).data!.map((x) => x.action);
    expect(audits).toEqual(['AI_FINDING_CREATED']); // the child projection adds no audit event
    expect(await countApplications()).toBe(apps0); // calendar intelligence never touches applications
    record('ai7-01-calendar', { child: true, audits, applicationsCreated: 0, rawStored: false });
  });

  it('AI7-02 · deadlines and all-day items: the deadline is the anchor (and the parent due time); all-day is a date, not an instant', async () => {
    const d = await submit(calDoc('02d', { kind: 'deadline' }));
    const df = await findingOf(d.runId!);
    expect(df.category).toBe('assessment_deadline');
    expect(new Date(df.due_at).toISOString()).toBe('2026-10-16T22:00:00.000Z');
    const dc = await eventOf(df.id);
    expect(dc).toMatchObject({ is_deadline: true, all_day: false, start_at: null, start_date: null });
    expect(new Date(dc!.deadline_at).toISOString()).toBe('2026-10-16T22:00:00.000Z');
    expect(new Date(dc!.sort_at).toISOString()).toBe('2026-10-16T22:00:00.000Z');

    const a = await submit(calDoc('02a', { kind: 'allDay', payload: { time_zone: 'America/Chicago', end_date: '2026-10-22' } }));
    const af = await findingOf(a.runId!);
    const ac = await eventOf(af.id);
    expect(ac).toMatchObject({ is_deadline: true, all_day: true, start_at: null, end_at: null, deadline_at: null, start_date: '2026-10-20', end_date: '2026-10-22' });
    expect(new Date(ac!.sort_at).toISOString()).toBe('2026-10-20T05:00:00.000Z'); // local midnight in the item's own zone (CDT)
    // a date-only item is not shifted by the viewer: the stored date is the calendar date
    expect(ac!.start_date).toBe('2026-10-20');
  });

  it('AI7-03 · invalid times are rejected item-by-item (PARTIAL) and never break the other findings; DST gaps and ambiguity are explicit', async () => {
    const doc = clone(calendarEnvelope()) as AnyRow;
    doc.run = { external_run_id: uniq('cal'), generated_at: '2026-10-12T12:00:00Z' };
    const ok = calendarFinding({ dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: `evt-${run}-03ok` }, title: `Interview 03ok` }, { company: 'Cal 03' });
    const endBefore = calendarFinding({ dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: `evt-${run}-03a` }, title: 'End before start' }, { end_at: '2026-10-15T13:00:00-05:00' });
    const badZone = calendarFinding({ dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: `evt-${run}-03b` }, title: 'Bad zone' }, { time_zone: 'Mars/Olympus' });
    const gap = calendarFinding({ dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: `evt-${run}-03c` }, title: 'Gap' }, { start_at: undefined, end_at: undefined, start_local: '2026-03-08T02:30', time_zone: 'America/Chicago' });
    const ambiguous = calendarFinding({ dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: `evt-${run}-03d` }, title: 'Fall back' }, { start_at: undefined, end_at: undefined, start_local: '2026-11-01T01:30', time_zone: 'America/Chicago', company: 'Cal 03d' });
    doc.findings = [ok, endBefore, badZone, gap, ambiguous];
    const r = await submit(doc);
    expect(r.status).toBe('PARTIAL');
    expect(r.counts).toMatchObject({ findingsCreated: 2, rejectedItems: 3 });
    expect(r.validationErrors.map((e) => e.code)).toEqual(expect.arrayContaining(['end_before_start', 'time_zone', 'nonexistent_local_time']));
    expect(r.warnings.map((w) => w.code)).toContain('ambiguous_local_time');
    const fall = (await admin.from('ai_findings').select('id').eq('run_id', r.runId!).eq('title', 'Fall back').single()).data!;
    expect(new Date((await eventOf(fall.id))!.start_at).toISOString()).toBe('2026-11-01T06:30:00.000Z'); // the FIRST 01:30 (CDT, UTC-5)
  });

  // ---- identity, dedupe -----------------------------------------------------------------------------

  it('AI7-04 · reschedule keeps ONE event: same id, moved time; the first known start and the move count are kept by the server', async () => {
    const first = await submit(calDoc('04'));
    const f = await findingOf(first.runId!);
    // the provider just reports the current state (status scheduled); the server derives that it was moved
    const second = await submit(calDoc('04', { payload: { start_at: '2026-10-16T14:00:00-05:00', end_at: '2026-10-16T15:00:00-05:00' } }));
    expect(second.counts).toMatchObject({ findingsCreated: 0, findingsUpdated: 1 });
    expect(await countFindings('Cal 04')).toBe(1);
    let child = await eventOf(f.id);
    expect(child).toMatchObject({ status: 'rescheduled', reschedule_count: 1 });
    expect(new Date(child!.original_start_at).toISOString()).toBe('2026-10-15T19:00:00.000Z');
    expect(new Date(child!.sort_at).toISOString()).toBe('2026-10-16T19:00:00.000Z');
    const third = await submit(calDoc('04', { payload: { start_at: '2026-10-19T09:00:00-05:00', end_at: '2026-10-19T10:00:00-05:00' } }));
    expect(third.counts.findingsUpdated).toBe(1);
    child = await eventOf(f.id);
    expect(child).toMatchObject({ status: 'rescheduled', reschedule_count: 2 });
    expect(new Date(child!.original_start_at).toISOString()).toBe('2026-10-15T19:00:00.000Z'); // history is never overwritten
    // an identical re-submission changes nothing
    await submit(calDoc('04', { payload: { start_at: '2026-10-19T09:00:00-05:00', end_at: '2026-10-19T10:00:00-05:00' } }));
    expect(await eventOf(f.id)).toMatchObject({ status: 'rescheduled', reschedule_count: 2 });
    const audits = (await admin.from('audit_events').select('action').eq('target_entity_id', f.id)).data!.map((x) => x.action).sort();
    expect(audits).toEqual(['AI_FINDING_CREATED', 'AI_FINDING_UPDATED', 'AI_FINDING_UPDATED']); // one audit per parent mutation; the projection adds none
    record('ai7-04-reschedule', { findings: 1, rescheduleCount: 2, originalKept: true });
  });

  it('AI7-05 · a reschedule that arrives under a NEW event id, or with no id at all, still resolves to the same event', async () => {
    const first = await submit(calDoc('05'));
    const f = await findingOf(first.runId!);
    const moved = await submit(calDoc('05b', {
      finding: { title: 'Interview 05' },
      payload: { company: 'Cal 05', status: 'rescheduled', start_at: '2026-10-17T14:00:00-05:00', end_at: '2026-10-17T15:00:00-05:00', previous_event: { source_event_id: `evt-${run}-05`, start_at: '2026-10-15T14:00:00-05:00' } },
    }));
    expect(moved.counts.findingsCreated).toBe(0);
    expect(await countFindings('Cal 05')).toBe(1);
    expect(await eventOf(f.id)).toMatchObject({ status: 'rescheduled', reschedule_count: 1, source_event_id: `evt-${run}-05b`, previous_source_event_id: `evt-${run}-05` });

    // no event id at all: the previous start identifies it
    const a = await submit(calDoc('05n', { noId: true, finding: { title: 'Interview 05n' } }));
    const af = await findingOf(a.runId!);
    const b = await submit(calDoc('05n', { noId: true, finding: { title: 'Interview 05n' }, payload: { status: 'rescheduled', start_at: '2026-10-18T14:00:00-05:00', end_at: '2026-10-18T15:00:00-05:00', previous_event: { start_at: '2026-10-15T14:00:00-05:00' } } }));
    expect(b.counts.findingsCreated).toBe(0);
    expect(await countFindings('Cal 05n')).toBe(1);
    expect(await eventOf(af.id)).toMatchObject({ status: 'rescheduled', reschedule_count: 1 });
    // resubmitting the identical id-less event is idempotent
    const again = await submit(calDoc('05n', { noId: true, finding: { title: 'Interview 05n' } }));
    expect(again.counts.findingsCreated).toBe(0);
  });

  it('AI7-06 · cancellation is state, not deletion: original time kept, cancelled_at recorded, history survives, reinstatement is possible', async () => {
    const first = await submit(calDoc('06'));
    const f = await findingOf(first.runId!);
    await submit(calDoc('06', { payload: { start_at: '2026-10-16T14:00:00-05:00', end_at: '2026-10-16T15:00:00-05:00' } })); // moved once
    const cancelled = await submit(calDoc('06', { payload: { status: 'cancelled', start_at: '2026-10-16T14:00:00-05:00', end_at: '2026-10-16T15:00:00-05:00', cancelled_at: '2026-10-14T09:00:00-05:00' } }));
    expect(cancelled.counts.findingsUpdated).toBe(1);
    let child = await eventOf(f.id);
    expect(child).toMatchObject({ status: 'cancelled', reschedule_count: 1 });
    expect(new Date(child!.cancelled_at).toISOString()).toBe('2026-10-14T14:00:00.000Z'); // the provider-stated time
    expect(new Date(child!.original_start_at).toISOString()).toBe('2026-10-15T19:00:00.000Z'); // first known start survives
    expect(new Date(child!.sort_at).toISOString()).toBe('2026-10-16T19:00:00.000Z'); // the last scheduled time is not erased
    expect(await countFindings('Cal 06')).toBe(1);
    expect((await admin.from('ai_findings').select('id').eq('id', f.id)).data).toHaveLength(1);
    // the "cancellation" word as the category is normalised to a status (never a second event)
    const alias = await submit(calDoc('06', { finding: { category: 'cancellation' }, payload: { start_at: '2026-10-16T14:00:00-05:00', end_at: '2026-10-16T15:00:00-05:00' } }));
    expect(alias.warnings.map((w) => w.code)).toContain('category_alias');
    // a cancellation without a provider time gets the time JobQuest recorded it
    const bare = await submit(calDoc('06b', { payload: { status: 'cancelled' } }));
    const bf = await findingOf(bare.runId!);
    expect((await eventOf(bf.id))!.cancelled_at).not.toBeNull();
    // reinstated: scheduled again clears the cancellation
    await submit(calDoc('06', { payload: { start_at: '2026-10-16T14:00:00-05:00', end_at: '2026-10-16T15:00:00-05:00' } }));
    child = await eventOf(f.id);
    expect(child).toMatchObject({ status: 'rescheduled', cancelled_at: null });
    record('ai7-06-cancel', { retained: true, reinstated: true });
  });

  it('AI7-07 · identity: cross-provider convergence, distinct dates stay distinct, same-provider distinct ids are never merged', async () => {
    const first = await submit(calDoc('07', { provider: 'claude' }));
    const f = await findingOf(first.runId!);
    // another provider sees the same interview under Outlook's own id
    const other = await submit(calDoc('07x', { provider: 'gemini', source: 'outlook', finding: { title: 'Interview 07' }, payload: { company: 'Cal 07' } }));
    expect(other.counts.findingsCreated).toBe(0);
    expect(await countFindings('Cal 07')).toBe(1);
    expect(await eventOf(f.id)).toMatchObject({ calendar_source: 'outlook' });
    // two interviews with the SAME title on different dates stay distinct (with ids and without)
    await submit(calDoc('07a', { finding: { title: 'Interview' }, payload: { company: 'Cal 07d' } }));
    await submit(calDoc('07b', { finding: { title: 'Interview' }, payload: { company: 'Cal 07d', start_at: '2026-10-22T14:00:00-05:00', end_at: '2026-10-22T15:00:00-05:00' } }));
    expect(await countFindings('Cal 07d')).toBe(2);
    await submit(calDoc('07c', { noId: true, finding: { title: 'Interview' }, payload: { company: 'Cal 07e' } }));
    await submit(calDoc('07c', { noId: true, finding: { title: 'Interview' }, payload: { company: 'Cal 07e', start_at: '2026-10-23T14:00:00-05:00', end_at: '2026-10-23T15:00:00-05:00' } }));
    expect(await countFindings('Cal 07e')).toBe(2);
    // identical logical event, but two DIFFERENT events of one calendar source: never merged
    await submit(calDoc('07f', { finding: { title: 'Interview' }, payload: { company: 'Cal 07g' } }));
    await submit(calDoc('07g', { finding: { title: 'Interview' }, payload: { company: 'Cal 07g' } }));
    expect(await countFindings('Cal 07g')).toBe(2);
    // different organizer domains block a cross-provider merge
    await submit(calDoc('07h', { finding: { title: 'Same slot' }, payload: { company: 'Cal 07h', organizer_domain: 'one.example.com' } }));
    await submit(calDoc('07i', { source: 'outlook', provider: 'gemini', finding: { title: 'Same slot' }, payload: { company: 'Cal 07h', organizer_domain: 'two.example.com' } }));
    expect(await countFindings('Cal 07h')).toBe(2);
    // a company-less event is never merged across providers
    await submit(calDoc('07j', { finding: { title: 'No company' }, payload: { company: undefined } }));
    await submit(calDoc('07k', { source: 'outlook', provider: 'gemini', finding: { title: 'No company' }, payload: { company: undefined } }));
    const noCo = (await admin.from('ai_calendar_events').select('id').eq('user_id', carol.userId!).is('company', null).like('source_event_id', `evt-${run}-07%`)).data!;
    expect(noCo).toHaveLength(2);
    record('ai7-07-dedupe', { crossProvider: 1, distinctDates: 2, sameProviderDistinctIds: 2 });
  });

  // ---- closed findings ---------------------------------------------------------------------------

  it('AI7-08 · a dismissed event is never rewritten; a REVIEWED one still receives a cancellation (the parent stays closed)', async () => {
    const a = await submit(calDoc('08a'));
    const af = await findingOf(a.runId!);
    expect((await carol.db().rpc('rpc_ai_dismiss_finding', { p_finding_id: af.id })).error).toBeNull();
    const again = await submit(calDoc('08a', { payload: { status: 'cancelled' } }));
    expect(again.counts.findingsClosed).toBe(1);
    expect(await eventOf(af.id)).toMatchObject({ status: 'scheduled', cancelled_at: null });
    expect((await admin.from('ai_findings').select('status').eq('id', af.id).single()).data!.status).toBe('DISMISSED');

    const b = await submit(calDoc('08b'));
    const bf = await findingOf(b.runId!);
    expect((await admin.from('ai_findings').update({ status: 'REVIEWED' }).eq('id', bf.id)).error).toBeNull();
    const cancel = await submit(calDoc('08b', { payload: { status: 'cancelled' } }));
    expect(cancel.counts.findingsClosed).toBe(1); // the parent observation is left alone...
    expect(await eventOf(bf.id)).toMatchObject({ status: 'cancelled' }); // ...but a cancellation is never hidden behind a review
    expect((await admin.from('ai_findings').select('status').eq('id', bf.id).single()).data!.status).toBe('REVIEWED');
  });

  // ---- database guarantees --------------------------------------------------------------------------

  it('AI7-09 · the child cannot drift from its parent; shape, cancellation, https and range constraints hold; RPC failures are controlled item codes', async () => {
    const r = await submit(calDoc('09'));
    const f = await findingOf(r.runId!);
    const owner = { workspace_id: ws, user_id: carol.userId! };
    const base = { category: 'interview', sort_at: '2026-10-15T19:00:00Z', start_at: '2026-10-15T19:00:00Z' };
    const probe = async (over: Record<string, unknown>, who = owner, finding = f.id) => {
      await admin.from('ai_calendar_events').delete().eq('finding_id', finding);
      return admin.from('ai_calendar_events').insert({ finding_id: finding, ...who, ...base, ...over });
    };
    expect((await probe({ user_id: eve.userId! })).error?.code).toBe('23503'); // composite FK: owner must equal the parent's
    expect((await probe({}, owner, '00000000-0000-4000-8000-000000000000')).error?.code).toBe('23503');
    expect((await probe({ category: 'party' })).error?.code).toBe('23514');
    expect((await probe({ status: 'maybe' })).error?.code).toBe('23514');
    expect((await probe({ status: 'cancelled' })).error?.code).toBe('23514'); // cancelled needs cancelled_at
    expect((await probe({ cancelled_at: '2026-10-14T00:00:00Z' })).error?.code).toBe('23514'); // cancelled_at needs cancelled
    expect((await probe({ end_at: '2026-10-15T18:00:00Z' })).error?.code).toBe('23514'); // end before start
    expect((await probe({ all_day: true })).error?.code).toBe('23514'); // all-day needs dates, no instants
    expect((await probe({ start_at: null })).error?.code).toBe('23514'); // timed needs a start or a deadline
    expect((await probe({ deadline_at: '2026-10-15T19:00:00Z' })).error?.code).toBe('23514'); // deadline only for deadline items
    expect((await probe({ meeting_url: 'http://insecure.example.com' })).error?.code).toBe('23514'); // https only
    expect((await probe({ start_date: '2026-10-15', end_date: '2026-10-15' })).error?.code).toBe('23514'); // timed items carry no dates
    expect((await probe({})).error).toBeNull();
    await admin.from('ai_calendar_events').delete().eq('finding_id', f.id);

    const ev = { category: 'interview', sort_at: '2026-10-15T19:00:00Z', start_at: '2026-10-15T19:00:00Z' };
    const rpc = (actor: string, finding: string, event: unknown) => admin.rpc('rpc_ai_upsert_calendar_event', { p_actor_id: actor, p_finding_id: finding, p_event: event });
    expect((await rpc(eve.userId!, f.id, ev)).error?.message).toBe('AI_FINDING_NOT_FOUND'); // not the owner
    expect((await rpc(carol.userId!, f.id, { sort_at: ev.sort_at })).error?.message).toBe('AI_FINDING_INVALID_CALENDAR_EVENT');
    expect((await rpc(carol.userId!, f.id, { ...ev, sort_at: 'soon' })).error?.message).toBe('AI_FINDING_INVALID_CALENDAR_EVENT');
    expect((await rpc(carol.userId!, f.id, { ...ev, category: 'party' })).error?.message).toBe('AI_FINDING_INVALID_CALENDAR_EVENT');
    const email = await submit({ ...clone(calendarEnvelope()), workflow: 'email_triage', run: { external_run_id: uniq('mail'), generated_at: '2026-10-12T12:00:00Z' }, findings: [{
      kind: 'email_event', category: 'scheduling', dedupe: { source_type: 'gmail', source_id: `msg-${run}-09` }, title: 'Mail 09', occurred_at: '2026-10-12T10:00:00Z', payload: { company: 'Cal 09' },
    }] });
    const ef = await findingOf(email.runId!);
    expect((await rpc(carol.userId!, ef.id, ev)).error?.message).toBe('AI_FINDING_NOT_FOUND'); // wrong kind
    expect((await rpc(carol.userId!, f.id, ev)).error).toBeNull();
    // deleting the finding removes the child
    expect((await carol.db().rpc('rpc_ai_delete_finding', { p_finding_id: f.id })).error).toBeNull();
    expect(await eventOf(f.id)).toBeNull();
  });

  // ---- RLS ----------------------------------------------------------------------------------------------

  it('AI7-10 · RLS: owner and manager see the event; peer, other workspace, suspended member and a forged workspace see nothing; clients cannot write', async () => {
    const r = await submit(calDoc('10'));
    const f = await findingOf(r.runId!);
    const fr = await submit(calDoc('10f'), frank);
    const ff = await findingOf(fr.runId!);
    const seen = async (a: Actor, id: string) => ((await a.db().from('ai_calendar_events').select('finding_id').eq('finding_id', id)).data ?? []).length;
    expect(await seen(carol, f.id)).toBe(1);
    expect(await seen(alice, f.id)).toBe(1); // manager parity with ai_findings
    expect(await seen(eve, f.id)).toBe(0); // peer
    expect(await seen(dave, f.id)).toBe(0); // other workspace
    const parentSeen = async (a: Actor) => ((await a.db().from('ai_findings').select('id').eq('id', f.id)).data ?? []).length;
    expect([await parentSeen(carol), await parentSeen(alice), await parentSeen(eve), await parentSeen(dave)]).toEqual([1, 1, 0, 0]); // child visibility == parent visibility
    // service-layer reads obey the same boundary, including a forged workspace id
    expect((await listOf(carol)).items.some((e) => e.id === f.id)).toBe(true);
    expect((await listOf(alice)).items.some((e) => e.id === f.id)).toBe(true);
    expect((await listOf(eve)).items.some((e) => e.id === f.id)).toBe(false);
    expect((await listOf(dave, {}, {}, daveWs)).items).toHaveLength(0);
    expect((await listOf(dave, {}, {}, ws)).items).toHaveLength(0); // forged workspace id
    // suspended member: their own event disappears with their access
    expect(await seen(frank, ff.id)).toBe(1);
    expect((await admin.from('workspace_members').update({ status: 'SUSPENDED' }).eq('workspace_id', ws).eq('user_id', frank.userId!)).error).toBeNull();
    expect(await seen(frank, ff.id)).toBe(0);
    expect(await seen(alice, ff.id)).toBe(1); // the manager still sees it
    // clients cannot write
    for (const a of [carol, alice, eve]) {
      expect((await a.db().from('ai_calendar_events').insert({ finding_id: f.id, workspace_id: ws, user_id: a.userId!, category: 'interview', sort_at: '2026-10-15T19:00:00Z', start_at: '2026-10-15T19:00:00Z' })).error).not.toBeNull();
      await a.db().from('ai_calendar_events').update({ company: 'hacked' }).eq('finding_id', f.id);
      await a.db().from('ai_calendar_events').delete().eq('finding_id', f.id);
    }
    expect(await eventOf(f.id)).toMatchObject({ company: 'Cal 10' });
    for (const [fn, args] of [
      ['rpc_ai_upsert_calendar_event', { p_actor_id: carol.userId!, p_finding_id: f.id, p_event: { category: 'interview', sort_at: '2026-10-15T19:00:00Z' } }],
      ['rpc_ai_resolve_calendar_key', { p_actor_id: carol.userId!, p_workspace_id: ws, p_calendar_source: 'x', p_source_event_ids: ['y'], p_logical_keys: [], p_organizer_domain: null, p_company: 'z' }],
    ] as const) expect((await carol.db().rpc(fn, args)).error).not.toBeNull(); // not executable by clients
    record('ai7-10-rls', { owner: 1, manager: 1, peer: 0, otherWorkspace: 0, suspended: 0, forgedWorkspace: 0, clientWrites: 'denied' });
  });

  // ---- reads ----------------------------------------------------------------------------------------------

  it('AI7-11 · listCalendarIntelligence: chronological, filters, ranges, deadlines, pagination, privacy and strict input', async () => {
    const co = `Read${run}`;
    const mk = (tag: string, over: Record<string, unknown> = {}, payload: Record<string, unknown> = {}, finding: Record<string, unknown> = {}) =>
      submit(calDoc(`11${tag}`, { ...over, finding: { title: `Event ${tag}`, ...finding }, payload: { company: co, ...payload } }));
    await mk('c', {}, { start_at: '2026-11-03T14:00:00-06:00', end_at: undefined });
    await mk('a', {}, { start_at: '2026-11-01T14:00:00-05:00', end_at: undefined }, { category: 'recruiter_call' });
    await mk('b', {}, { start_at: '2026-11-02T14:00:00-06:00', end_at: undefined, status: 'tentative' });
    await mk('d', { kind: 'deadline' }, { deadline_at: '2026-11-04T17:00:00-06:00' });
    await mk('e', { kind: 'allDay', provider: 'chatgpt' }, { start_date: '2026-11-05' });
    const all = await listOf(carol, { company: co.toLowerCase() });
    expect(all.items.map((e) => e.title)).toEqual(['Event a', 'Event b', 'Event c', 'Event d', 'Event e']); // soonest first
    expect((await listOf(carol, { company: co, order: 'desc' })).items.map((e) => e.title)).toEqual(['Event e', 'Event d', 'Event c', 'Event b', 'Event a']);
    expect(all.items[0]).toMatchObject({ category: 'recruiter_call', status: 'scheduled', provider: 'claude', isDeadline: false, timeZone: 'America/Chicago', meetingUrl: 'https://meet.example.com/abc-defg-hij' });
    expect(all.items[1]!.status).toBe('tentative');
    expect(all.items[3]).toMatchObject({ isDeadline: true });
    expect(new Date(all.items[3]!.deadlineAt!).toISOString()).toBe('2026-11-04T23:00:00.000Z');
    expect(all.items[4]).toMatchObject({ allDay: true, startDate: '2026-11-05', endDate: '2026-11-05', startAt: null, provider: 'chatgpt' });
    const privacy = JSON.stringify(all);
    expect(privacy).not.toMatch(/evt-|source_event_id|dedupe|attendee|description/i);
    expect((await listOf(carol, { company: co, category: 'recruiter_call' })).items.map((e) => e.title)).toEqual(['Event a']);
    expect((await listOf(carol, { company: co, eventStatus: 'tentative' })).items.map((e) => e.title)).toEqual(['Event b']);
    expect((await listOf(carol, { company: co, deadlinesOnly: true })).items.map((e) => e.title)).toEqual(['Event d', 'Event e']);
    expect((await listOf(carol, { company: co, startsSince: '2026-11-02T00:00:00Z', startsBefore: '2026-11-04T00:00:00Z' })).items.map((e) => e.title)).toEqual(['Event b', 'Event c']);
    expect((await listOf(carol, { company: co, provider: 'chatgpt' })).items.map((e) => e.title)).toEqual(['Event e']);
    expect((await listOf(carol, { company: co, provider: 'gemini' })).items).toHaveLength(0);
    const p0 = await listOf(carol, { company: co }, { page: 0, pageSize: 2 });
    const p2 = await listOf(carol, { company: co }, { page: 2, pageSize: 2 });
    expect([p0.items.length, p0.hasNext, p2.items.length, p2.hasNext]).toEqual([2, true, 1, false]);
    // cancelled items are listed (a cancellation is information) and filterable
    await mk('x', {}, { start_at: '2026-11-06T14:00:00-06:00', end_at: undefined, status: 'cancelled' });
    expect((await listOf(carol, { company: co, eventStatus: 'cancelled' })).items.map((e) => e.title)).toEqual(['Event x']);
    // review status
    const x = all.items[0]!;
    expect((await carol.db().rpc('rpc_ai_dismiss_finding', { p_finding_id: x.id })).error).toBeNull();
    expect((await listOf(carol, { company: co, status: 'ACTIVE' })).items.map((e) => e.id)).not.toContain(x.id);
    expect((await listOf(carol, { company: co, status: 'DISMISSED' })).items.map((e) => e.id)).toEqual([x.id]);
    for (const bad of [{ category: 'party' }, { eventStatus: 'moved' }, { startsSince: 'tomorrow' }, { deadlinesOnly: 'yes' }, { order: 'sideways' }, { nope: 1 }, { status: 'WEIRD' }]) {
      expect(await svc.listCalendarIntelligence(as(carol), bad as never, {}, { env: ON })).toMatchObject({ ok: false, error: { code: 'INVALID_FILTER' } });
    }
    expect(await svc.listCalendarIntelligence(as(carol), {}, { pageSize: 51 }, { env: ON })).toMatchObject({ ok: false, error: { code: 'INVALID_FILTER' } });
    expect(await svc.listCalendarIntelligence(as(carol), {}, {}, { env: {} })).toMatchObject({ ok: false, error: { code: 'AI_HUB_DISABLED' } });
    expect((await listOf(carol, { company: 'x),company.neq.(' })).items).toHaveLength(0); // search text cannot inject filter syntax
  });

  // ---- Daily Digest ---------------------------------------------------------------------------------------

  it('AI7-12 · Daily Digest: not_configured vs zero vs available, owner-zone day, cancelled excluded and rescheduled surfaced in Upcoming (AI-11C), historical snapshot immutable', async () => {
    const date = '2026-11-10';
    const digest = async (a: Actor, workspaceId = ws) => {
      const d = await digestSvc.buildDeterministicDigest({ workspaceId, userId: a.userId!, accessToken: a.token! }, date, { env: ON });
      if (!d.ok) throw new Error(JSON.stringify(d.error));
      return d.data.payload as AnyRow;
    };
    // dave never ran a calendar workflow: NOT zero
    const fresh = await digest(dave, daveWs);
    expect(fresh.sections.upcoming).toEqual({ status: 'not_configured', items: [] });

    // a clean owner: one SUCCEEDED calendar run with nothing for the week => zero
    expect((await admin.from('profiles').update({ timezone: 'America/Chicago' }).eq('user_id', alice.userId!)).error).toBeNull();
    const now = new Date().toISOString();
    expect((await admin.from('ai_runs').insert({ workspace_id: ws, user_id: alice.userId!, provider: 'claude', workflow: 'calendar_review', status: 'SUCCEEDED', trigger_type: 'scheduled', started_at: now, completed_at: now })).error).toBeNull();
    const zero = await digest(alice);
    expect(zero.sections.upcoming).toEqual({ status: 'zero', count: 0, items: [] });
    expect(zero.summary).toMatchObject({ upcoming: 0 });

    // carol: events around 2026-11-10 in America/Chicago (UTC-6 in November)
    expect((await admin.from('profiles').update({ timezone: 'America/Chicago' }).eq('user_id', carol.userId!)).error).toBeNull();
    const co = `Digest${run}`;
    const mk = (tag: string, over: Record<string, unknown>, payload: Record<string, unknown>) => submit(calDoc(`12${tag}`, { ...over, finding: { title: `Digest ${tag}`, ...(over.finding as object | undefined) }, payload: { company: co, ...payload } }));
    await mk('today', {}, { start_at: '2026-11-11T03:00:00Z', end_at: undefined }); // Nov 10, 21:00 Chicago => TODAY there, tomorrow in UTC
    await mk('tomorrow', {}, { start_at: '2026-11-11T16:00:00Z', end_at: undefined }); // Nov 11 10:00 Chicago
    await mk('dl', { kind: 'deadline' }, { deadline_at: '2026-11-12T23:00:00Z' });
    await mk('cancelled', {}, { start_at: '2026-11-13T16:00:00Z', end_at: undefined, status: 'cancelled' });
    await mk('later', {}, { start_at: '2026-11-30T16:00:00Z', end_at: undefined }); // outside the 7-day window
    await mk('allday', { kind: 'allDay' }, { start_date: '2026-11-10' }); // an all-day deadline dated today
    const moved = await mk('moved', {}, { start_at: '2026-11-14T16:00:00Z', end_at: undefined });
    await mk('moved', {}, { start_at: '2026-11-15T16:00:00Z', end_at: undefined });
    expect(moved.status).toBe('SUCCEEDED');
    const p = await digest(carol);
    // AI-11C: calendar intelligence feeds the canonical Upcoming section (active work only) and Needs attention
    expect(p.sections.upcoming.status).toBe('available');
    expect(p.sections.upcoming.count).toBe(5); // all-day, today, tomorrow, deadline, moved; the cancelled item is NOT active work and "later" is outside the 7-day horizon
    expect(p.sections.upcoming.items.length).toBeLessThanOrEqual(6); // bounded
    const titles = p.sections.upcoming.items.map((i: AnyRow) => i.title);
    expect(titles).not.toContain('Digest later');
    expect(titles).not.toContain('Digest cancelled');
    expect(JSON.stringify(p)).not.toContain('Digest cancelled');
    expect(titles).toEqual(expect.arrayContaining(['Digest moved', 'Digest today', 'Digest tomorrow']));
    const byTitle = Object.fromEntries(p.sections.upcoming.items.map((i: AnyRow) => [i.title, i]));
    expect(byTitle['Digest moved'].detail).toMatch(/rescheduled from Nov 14/);
    expect(byTitle['Digest today'].detail).toMatch(/Nov 10, 9:00\sPM CST/); // rendered in the owner's zone (21:00 Chicago = tomorrow in UTC)
    expect(p.sections.needs_attention.items.map((i: AnyRow) => i.title)).toContain('Digest today'); // a meeting later today needs attention
    expect(p.summary.upcoming).toBe(5);
    expect(JSON.stringify(p)).not.toMatch(/evt-|source_event_id|attendee/i);

    // immutability: the stored snapshot is created through the ingestion boundary; an event discovered AFTER it was stored
    // never rewrites it (a system digest run id is stable per date, so a second generation is a no-op duplicate run).
    const wire = digestSvc.toSystemDigestWire({ digestDate: date, timeZone: 'America/Chicago', payload: p }, '2026-11-10T20:00:00Z');
    const stored = await submit(wire);
    expect(stored.status).toBe('SUCCEEDED');
    const sf = await findingOf(stored.runId!);
    const before = JSON.stringify(sf.payload.sections.upcoming);
    await mk('after', {}, { start_at: '2026-11-11T20:00:00Z', end_at: undefined }); // discovered AFTER the digest was stored
    const p2 = await digest(carol);
    expect(JSON.stringify(p2.sections.upcoming)).not.toBe(before); // a fresh computation sees it...
    const regen = await submit(digestSvc.toSystemDigestWire({ digestDate: date, timeZone: 'America/Chicago', payload: p2 }, '2026-11-10T21:00:00Z'));
    expect(regen).toMatchObject({ duplicateRun: true });
    expect(JSON.stringify((await findingOf(stored.runId!)).payload.sections.upcoming)).toBe(before); // ...but the stored snapshot is untouched
    record('ai7-12-digest', { dave: 'not_configured', alice: 'zero', carol: 'available', snapshotStable: true });
  });

  // ---- isolation --------------------------------------------------------------------------------------------

  it('AI7-13 · a malformed calendar finding never breaks job leads, the rest of the run, or core data', async () => {
    const apps0 = await countApplications();
    const doc = clone(calendarEnvelope()) as AnyRow;
    doc.run = { external_run_id: uniq('multi'), generated_at: '2026-10-12T12:00:00Z' };
    doc.findings = [
      jobLeadFinding({ dedupe: { job_url: `https://jobs.example.com/${run}/13` }, source: { url: `https://jobs.example.com/${run}/13` } }, { job_url: `https://jobs.example.com/${run}/13`, external_job_id: `EX-${run}-13`, role_title: 'Multi 13' }),
      calendarFinding({ dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: `evt-${run}-13bad` }, category: 'party' }),
      calendarFinding({ dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: `evt-${run}-13ok` }, title: 'Multi 13 ok' }, { company: 'Cal 13' }),
    ];
    const r = await submit(doc);
    expect(r.status).toBe('PARTIAL');
    expect(r.counts).toMatchObject({ findingsCreated: 2, rejectedItems: 1 });
    expect(r.validationErrors.map((e) => e.code)).toContain('calendar_category');
    expect(await countApplications()).toBe(apps0);
  });

  it('AI7-14 · server kill switch: with AI Hub off nothing is read or written', async () => {
    const off = await ingest({ workspaceId: ws, userId: carol.userId!, actorKind: 'SERVICE_INGEST' }, calDoc('14'), { env: {}, log: () => undefined });
    expect(off.errors[0]?.code).toBe('AI_HUB_DISABLED');
    expect(await countFindings('Cal 14')).toBe(0);
  });
});
