/**
 * M1 mandatory test matrix (migration-upgrade/gate-03/M1_SPIKE_PLAN.md §3), run against
 * the dev Supabase project through the real Node façade. Sequential by design.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { Actor, ALIAS, RUN, STRONG, anonDb, decodeJwt, loadEnv, record, serviceDb, transcript } from './harness';

const ready = loadEnv();
const d = describe.skipIf(!ready);

const A = new Actor('203.0.113.10'); // USER in shared workspace
const B = new Actor('203.0.113.11'); // USER in shared workspace (peer)
const M = new Actor('203.0.113.12'); // MANAGER of shared workspace
const pw: Record<string, string> = { A: STRONG(), B: STRONG(), M: STRONG(), S: STRONG() };
const uname = (x: string) => `m1_${RUN}_${x}`;
let codesA: string[] = [];
let personalA = '';
let shared = '';
const createdUsers: string[] = [];

async function registerActor(actor: Actor, key: string) {
  const r = await actor.call('/auth/register', { username: uname(key), password: pw[key] });
  if (r.status === 201) createdUsers.push(r.json.user.id);
  return r;
}

d('M1 · Auth Option A architecture spike', () => {
  beforeAll(async () => {
    const { resetLimiters } = await import('../../apps/api/src/routes/auth');
    const { resetEnvCache } = await import('../../apps/api/src/env');
    resetEnvCache();
    resetLimiters();
  });

  afterAll(async () => {
    // Keep test users for evidence review unless M1_CLEANUP=1. Never touches non-test data.
    if (process.env.M1_CLEANUP !== '1') return;
    const svc = serviceDb();
    if (shared) await svc.from('workspaces').delete().eq('id', shared);
  });

  it('T01 · username account provisioning creates account, profile, personal workspace (MANAGER) and 10 recovery codes', async () => {
    const r = await registerActor(A, 'A');
    expect(r.status).toBe(201);
    codesA = r.json.recovery_codes;
    personalA = r.json.workspace.id;
    expect(codesA).toHaveLength(10);
    expect(new Set(codesA).size).toBe(10);
    const svc = serviceDb();
    const acct = await svc.from('user_accounts').select('*').eq('user_id', A.userId!).single();
    const prof = await svc.from('profiles').select('user_id, display_name, email, phone').eq('user_id', A.userId!).single();
    const ws = await svc.from('workspaces').select('workspace_type, created_by').eq('id', personalA).single();
    const mem = await svc.from('workspace_members').select('role').eq('workspace_id', personalA).eq('user_id', A.userId!).single();
    const rc = await svc.from('auth_recovery_codes').select('code_hash, is_used').eq('user_id', A.userId!);
    expect(acct.data.username).toBe(uname('A'));
    expect(Object.keys(acct.data).some((k) => /pass|hash|pin/i.test(k))).toBe(false); // no credential columns
    expect(prof.data?.email).toBeNull();
    expect(prof.data?.phone).toBeNull();
    expect(ws.data?.workspace_type).toBe('PERSONAL');
    expect(mem.data?.role).toBe('MANAGER');
    expect(rc.data).toHaveLength(10);
    expect(rc.data!.every((x) => x.code_hash.startsWith('$argon2id$') && !x.is_used)).toBe(true);
    expect(rc.data!.some((x) => codesA.some((c) => x.code_hash.includes(c.replace(/-/g, ''))))).toBe(false);

    const dup = await new Actor('203.0.113.99').call('/auth/register', { username: uname('A').toUpperCase(), password: STRONG() });
    expect(dup.status).toBe(409); // case-insensitive uniqueness
    const weak = await new Actor('203.0.113.98').call('/auth/register', { username: uname('weak'), password: 'password123' });
    expect(weak.status).toBe(422);

    record('T01', {
      status: 'PASS', recovery_codes: 10, code_format: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (160 bits; 140 secret)',
      stored: 'argon2id verifiers only', personal_workspace: 'PERSONAL', membership_role: 'MANAGER',
      email_optional: true, phone_optional: true, user_accounts_columns: Object.keys(acct.data),
      duplicate_username_case_insensitive: dup.status, weak_password: weak.status,
    });
  });

  it('T02 · username/password login returns HttpOnly session cookies and no internal identity', async () => {
    await registerActor(B, 'B');
    await registerActor(M, 'M');
    const r = await A.call('/auth/login', { username: uname('A'), password: pw.A });
    expect(r.status).toBe(200);
    const rt = r.setCookies.find((c) => c.startsWith('jq_rt='))!;
    expect(rt).toMatch(/HttpOnly/i);
    expect(rt).toMatch(/Secure/i);
    expect(rt).toMatch(/SameSite=Strict/i);
    expect(rt).toMatch(/Path=\/api\/auth/i);
    expect(JSON.stringify(r.json)).not.toContain(ALIAS);
    expect(Object.keys(r.json.user).sort()).toEqual(['active_workspace_id', 'display_name', 'id', 'username']);
    const wrong = await A.call('/auth/login', { username: uname('A'), password: 'Wrong-password-000' }, { bearer: null });
    const unknown = await A.call('/auth/login', { username: uname('nobody'), password: 'Wrong-password-000' }, { bearer: null });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.json).toEqual(unknown.json); // no username enumeration
    await A.call('/auth/login', { username: uname('A'), password: pw.A }); // reset failure counter
    record('T02', { status: 'PASS', http: r.status, refresh_cookie: 'HttpOnly; Secure; SameSite=Strict; Path=/api/auth', body_user_keys: Object.keys(r.json.user), wrong_vs_unknown_identical: true });
  });

  it('T04 · auth.uid() resolves natively under PostgREST RLS', async () => {
    const own = await A.db().from('profiles').select('user_id');
    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(1);
    expect(own.data![0]!.user_id).toBe(A.userId);
    const claims = decodeJwt(A.token!);
    expect(claims.sub).toBe(A.userId);
    const forged = await A.db().from('applications').insert({ workspace_id: personalA, user_id: B.userId, company_name: 'X', role_title: 'Y' });
    expect(forged.error).not.toBeNull(); // WITH CHECK user_id = auth.uid()
    record('T04', { status: 'PASS', profiles_visible: own.data!.length, jwt_sub_equals_user_accounts_user_id: true, forged_owner_insert: forged.error?.code });
  });

  it('T05 · RLS: USER own vs peer, MANAGER workspace-wide, cross-workspace + removed-member denial, last-manager protection', async () => {
    const created = await M.db().rpc('rpc_create_workspace', { p_name: `M1 shared ${RUN}` });
    expect(created.error).toBeNull();
    shared = created.data as string;
    const addA = await M.db().from('workspace_members').insert({ workspace_id: shared, user_id: A.userId, role: 'USER' });
    const addB = await M.db().from('workspace_members').insert({ workspace_id: shared, user_id: B.userId, role: 'USER' });
    expect(addA.error).toBeNull();
    expect(addB.error).toBeNull();
    const userAddsMember = await A.db().from('workspace_members').insert({ workspace_id: shared, user_id: M.userId, role: 'MANAGER' });
    expect(userAddsMember.error).not.toBeNull();

    const insA = await A.db().from('applications').insert({ workspace_id: shared, user_id: A.userId, company_name: 'Corvid Labs', role_title: 'Designer' }).select('id').single();
    const insB = await B.db().from('applications').insert({ workspace_id: shared, user_id: B.userId, company_name: 'Halcyon', role_title: 'Researcher' }).select('id').single();
    expect(insA.error).toBeNull();
    expect(insB.error).toBeNull();
    const aInsForB = await A.db().from('applications').insert({ workspace_id: shared, user_id: B.userId, company_name: 'X', role_title: 'Y' });
    expect(aInsForB.error).not.toBeNull();
    const mInsForA = await M.db().from('applications').insert({ workspace_id: shared, user_id: A.userId, company_name: 'Tessellate', role_title: 'Coach-added' }).select('id').single();
    expect(mInsForA.error).toBeNull();
    const S = new Actor('203.0.113.13'); // registered, but NOT a member of the shared workspace
    await registerActor(S, 'S');
    const mInsForStranger = await M.db().from('applications').insert({ workspace_id: shared, user_id: S.userId, company_name: 'X', role_title: 'Y' });
    expect(mInsForStranger.error).not.toBeNull(); // manager cannot create records owned by non-members

    const seenBy = async (x: Actor) => (await x.db().from('applications').select('id, user_id').eq('workspace_id', shared)).data ?? [];
    const aSees = await seenBy(A);
    const bSees = await seenBy(B);
    const mSees = await seenBy(M);
    expect(aSees.every((r) => r.user_id === A.userId)).toBe(true);
    expect(aSees.some((r) => r.id === insB.data!.id)).toBe(false);
    expect(bSees.every((r) => r.user_id === B.userId)).toBe(true);
    expect(mSees.map((r) => r.id)).toEqual(expect.arrayContaining([insA.data!.id, insB.data!.id]));

    const bUpdatesA = await B.db().from('applications').update({ role_title: 'hijack' }).eq('id', insA.data!.id).select('id');
    expect(bUpdatesA.data ?? []).toHaveLength(0);
    const mUpdatesA = await M.db().from('applications').update({ next_action: 'Coach follow-up' }).eq('id', insA.data!.id).select('id');
    expect(mUpdatesA.data).toHaveLength(1);
    const moveTenant = await A.db().from('applications').update({ workspace_id: personalA }).eq('id', insA.data!.id);
    expect(moveTenant.error?.message ?? '').toMatch(/APPLICATION_TENANT_IMMUTABLE|row-level security/);

    await A.db().from('applications').insert({ workspace_id: personalA, user_id: A.userId, company_name: 'Private A', role_title: 'Only mine' });
    const mCross = await M.db().from('applications').select('id').eq('workspace_id', personalA);
    expect(mCross.data ?? []).toHaveLength(0); // manager of shared ws gets nothing in A's personal ws
    const bCross = await B.db().from('applications').select('id').eq('workspace_id', personalA);
    expect(bCross.data ?? []).toHaveLength(0);
    const anon = await anonDb().from('applications').select('id');
    expect(anon.data ?? []).toHaveLength(0);
    const anonAccounts = await anonDb().from('user_accounts').select('user_id');
    const userAccounts = await A.db().from('user_accounts').select('user_id');
    const userCodes = await A.db().from('auth_recovery_codes').select('id');
    expect(anonAccounts.data ?? []).toHaveLength(0);
    expect(userAccounts.data ?? []).toHaveLength(0);
    expect(userCodes.data ?? []).toHaveLength(0);

    // Last-manager protection (database-enforced).
    const mMem = (await M.db().from('workspace_members').select('id').eq('workspace_id', shared).eq('user_id', M.userId!).single()).data!;
    const demoteLast = await M.db().from('workspace_members').update({ role: 'USER' }).eq('id', mMem.id);
    const removeLast = await M.db().from('workspace_members').delete().eq('id', mMem.id);
    expect(demoteLast.error?.message).toMatch(/CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER/);
    expect(removeLast.error?.message).toMatch(/CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER/);
    const svcDemote = await serviceDb().from('workspace_members').update({ role: 'USER' }).eq('id', mMem.id);
    expect(svcDemote.error?.message).toMatch(/CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER/); // even the trusted path
    const personalMem = (await A.db().from('workspace_members').select('id').eq('workspace_id', personalA).single()).data!;
    const leavePersonal = await A.db().from('workspace_members').delete().eq('id', personalMem.id);
    expect(leavePersonal.error?.message).toMatch(/CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER/);

    // Removed member loses access immediately; records stay attributed.
    const bMem = (await M.db().from('workspace_members').select('id').eq('workspace_id', shared).eq('user_id', B.userId!).single()).data!;
    const removeB = await M.db().from('workspace_members').delete().eq('id', bMem.id);
    expect(removeB.error).toBeNull();
    const bAfter = await seenBy(B);
    expect(bAfter).toHaveLength(0);
    const stillThere = await M.db().from('applications').select('id, user_id').eq('id', insB.data!.id).single();
    expect(stillThere.data?.user_id).toBe(B.userId);

    record('T05', {
      status: 'PASS',
      user_A_rows_all_own: true, user_B_rows_all_own: true, manager_sees_both: true,
      peer_update_rows: 0, manager_update_rows: 1, user_insert_for_peer: 'denied', user_adds_member: 'denied', manager_insert_for_non_member: 'denied',
      manager_cross_workspace_rows: 0, peer_cross_workspace_rows: 0, anon_rows: 0,
      system_tables_via_postgrest: { user_accounts: 0, auth_recovery_codes: 0 },
      last_manager: { demote: 'blocked', remove: 'blocked', service_role_demote: 'blocked', leave_personal: 'blocked' },
      removed_member_rows: 0, removed_member_records_retained_and_attributed: true,
      tenant_move: 'blocked',
    });
  });

  it('T06 · canonical workflow via PostgREST and Node API; mutation blocked', async () => {
    const direct = await A.db().from('workflow_definitions').select('stages, outcomes, closure_reasons').is('workspace_id', null).single();
    expect(direct.error).toBeNull();
    const stages = (direct.data!.stages as { id: string }[]).map((s) => s.id);
    const outcomes = (direct.data!.outcomes as { id: string }[]).map((o) => o.id);
    expect(stages).toEqual(['SAVED', 'PREPARING', 'APPLIED', 'ASSESSMENT', 'RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER']);
    expect(outcomes).toEqual(['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'GHOSTED', 'POSITION_CLOSED']);
    const legacy = [...(direct.data!.stages as { legacy: string }[]), ...(direct.data!.outcomes as { legacy: string }[])].map((x) => x.legacy);
    expect(legacy).toHaveLength(13); // all 13 verified legacy values (Saved … Accepted) are represented
    const node = await A.call('/workflow');
    expect(node.status).toBe(200);
    expect(node.json.workflow.stages).toEqual(direct.data!.stages);
    const upd = await M.db().from('workflow_definitions').update({ version: 99 }).is('workspace_id', null).select('id');
    const ins = await M.db().from('workflow_definitions').insert({ workspace_id: shared, stages: [], outcomes: [], closure_reasons: [] });
    expect(upd.data ?? []).toHaveLength(0);
    expect(ins.error).not.toBeNull();
    const anon = await anonDb().from('workflow_definitions').select('id');
    expect(anon.data ?? []).toHaveLength(0);
    const badStage = await A.db().from('applications').insert({ workspace_id: personalA, user_id: A.userId, company_name: 'X', role_title: 'Y', stage: 'BOOKMARKED' });
    expect(badStage.error?.code).toBe('23514'); // CHECK: an unknown stage can never be stored
    record('T06', { status: 'PASS', stages, outcomes, legacy_values_represented: legacy.length, node_equals_postgrest: true, manager_update_rows: 0, manager_insert: 'denied', anon_rows: 0, unknown_stage_insert: 'rejected (23514)' });
  });

  it('T07 · refresh rotates the HttpOnly refresh token and invalidates the old one', async () => {
    const before = A.jar.get('jq_rt')!;
    const tokenBefore = A.token!;
    const noCsrf = await A.call('/auth/refresh', {}, { csrf: false });
    expect(noCsrf.status).toBe(403);
    const badOrigin = await A.call('/auth/refresh', {}, { origin: 'https://evil.example' });
    expect(badOrigin.status).toBe(403);
    const r = await A.call('/auth/refresh', {});
    expect(r.status).toBe(200);
    const after = A.jar.get('jq_rt')!;
    expect(after).not.toBe(before);
    expect(A.token).not.toBe(tokenBefore);
    const works = await A.db().from('profiles').select('user_id');
    expect(works.data).toHaveLength(1);
    await new Promise((res) => setTimeout(res, 11_000)); // beyond refresh_token_reuse_interval (10s)
    const replay = new Actor(A.ip);
    replay.jar.set('jq_rt', before);
    replay.jar.set('jq_csrf', A.jar.get('jq_csrf')!);
    const reuse = await replay.call('/auth/refresh', {});
    expect(reuse.status).toBe(401);
    record('T07', { status: 'PASS', rotated: true, new_access_token: true, old_refresh_token_reuse_after_11s: reuse.status, missing_csrf: noCsrf.status, foreign_origin: badOrigin.status });
    // Reuse of a rotated token may revoke the token family (GoTrue reuse detection): sign in again.
    const again = await A.call('/auth/login', { username: uname('A'), password: pw.A });
    expect(again.status).toBe(200);
  });

  it('T08 · logout revokes the session (local and global)', async () => {
    const s1 = new Actor(A.ip);
    const s2 = new Actor(A.ip);
    await s1.call('/auth/login', { username: uname('A'), password: pw.A });
    await s2.call('/auth/login', { username: uname('A'), password: pw.A });
    const oldToken = s1.token!;
    const out = await s1.call('/auth/logout', { scope: 'global' });
    expect(out.status).toBe(200);
    expect(out.setCookies.some((c) => c.startsWith('jq_rt=') && /Max-Age=0/i.test(c))).toBe(true);
    const rows = await s1.db(oldToken).from('profiles').select('user_id');
    const gotrue = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY!, authorization: `Bearer ${oldToken}` } });
    const s2Refresh = await s2.call('/auth/refresh', {});
    expect(rows.data ?? []).toHaveLength(0);
    expect([401, 403]).toContain(gotrue.status);
    expect(s2Refresh.status).toBe(401);
    record('T08', {
      status: 'PASS',
      logout_http: out.status, cookies_cleared: true,
      old_access_token_postgrest_rows: rows.data?.length ?? 0, old_access_token_postgrest_http: rows.status,
      old_access_token_gotrue_http: gotrue.status, other_session_refresh_after_global: s2Refresh.status,
      note: 'PostgREST returns 200 [] (RLS session check) rather than 401: access JWTs are stateless until expiry.',
    });
    await A.call('/auth/login', { username: uname('A'), password: pw.A });
  });

  it('T09 · password change: old password rejected, other sessions revoked, current kept', async () => {
    const other = new Actor(A.ip);
    await other.call('/auth/login', { username: uname('A'), password: pw.A });
    const next = STRONG();
    const wrongCurrent = await A.call('/auth/password', { current_password: 'Not-the-password-1', new_password: next });
    expect(wrongCurrent.status).toBe(401);
    const r = await A.call('/auth/password', { current_password: pw.A, new_password: next });
    expect(r.status).toBe(200);
    const old = await new Actor('198.51.100.7').call('/auth/login', { username: uname('A'), password: pw.A });
    const fresh = await new Actor('198.51.100.8').call('/auth/login', { username: uname('A'), password: next });
    const currentStill = await A.db().from('profiles').select('user_id');
    const otherRows = await other.db().from('profiles').select('user_id');
    const otherRefresh = await other.call('/auth/refresh', {});
    expect(old.status).toBe(401);
    expect(fresh.status).toBe(200);
    expect(currentStill.data).toHaveLength(1);
    expect(otherRows.data ?? []).toHaveLength(0);
    expect(otherRefresh.status).toBe(401);
    pw.A = next;
    record('T09', { status: 'PASS', wrong_current: wrongCurrent.status, change: r.status, old_password_login: old.status, new_password_login: fresh.status, current_session_rows: 1, other_session_rows: 0, other_session_refresh: otherRefresh.status });
  });

  it('T10 · rate limiting: per-account lockout (6th → 429), per-IP limit, recovery lockout, Supabase shared-IP behaviour', async () => {
    const C = new Actor('203.0.113.50');
    const pwC = STRONG();
    await C.call('/auth/register', { username: uname('C'), password: pwC });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await new Actor(`198.51.100.${20 + i}`).call('/auth/login', { username: uname('C'), password: 'Bad-guess-pass-01' })).status);
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
    const correctWhileLocked = await new Actor('198.51.100.40').call('/auth/login', { username: uname('C'), password: pwC });
    expect(correctWhileLocked.status).toBe(429);
    expect(Number(correctWhileLocked.headers.get('retry-after'))).toBeGreaterThan(0);

    const ipStatuses: number[] = [];
    for (let i = 0; i < 21; i++) ipStatuses.push((await new Actor('198.51.100.200').call('/auth/login', { username: `nobody_${RUN}_${i}`, password: 'x'.repeat(12) })).status);
    const otherIp = await new Actor('198.51.100.201').call('/auth/login', { username: `nobody_${RUN}_z`, password: 'x'.repeat(12) });
    expect(ipStatuses[20]).toBe(429);
    expect(otherIp.status).toBe(401);

    const D = new Actor('203.0.113.60');
    await D.call('/auth/register', { username: uname('D'), password: STRONG() });
    const rec: number[] = [];
    for (let i = 0; i < 4; i++) rec.push((await new Actor(`198.51.100.${60 + i}`).call('/auth/recover', { username: uname('D'), code: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ', new_password: STRONG() })).status);
    expect(rec).toEqual([401, 401, 401, 429]);

    // T10b — Does Supabase Auth throttle the façade as ONE client? 35 valid logins, 35 client IPs.
    const E = new Actor('203.0.113.70');
    const pwE = STRONG();
    await E.call('/auth/register', { username: uname('E'), password: pwE });
    const bulk: number[] = [];
    for (let i = 0; i < 35; i++) bulk.push((await new Actor(`192.0.2.${i + 1}`).call('/auth/login', { username: uname('E'), password: pwE })).status);
    const supabaseThrottled = bulk.filter((s) => s === 429).length;
    record('T10', {
      status: 'PASS', per_account: statuses, correct_password_while_locked: correctWhileLocked.status,
      per_ip_21st: ipStatuses[20], different_ip_unaffected: otherIp.status, recovery_attempts: rec,
      shared_ip_probe: { valid_logins_attempted: 35, throttled_by_supabase_auth: supabaseThrottled, statuses: bulk },
    });
    expect(supabaseThrottled).toBe(0);
  });

  it('T11 · direct browser-equivalent PostgREST CRUD under RLS', async () => {
    const db = A.db();
    const ins = await db.from('applications').insert({ workspace_id: personalA, user_id: A.userId, company_name: 'Brightline', role_title: 'Lead UX', stage: 'SAVED' }).select('id, stage').single();
    expect(ins.error).toBeNull();
    const sel = await db.from('applications').select('id').eq('id', ins.data!.id).single();
    expect(sel.data?.id).toBe(ins.data!.id);
    const upd = await db.from('applications').update({ stage: 'INTERVIEW' }).eq('id', ins.data!.id).select('stage').single();
    expect(upd.data?.stage).toBe('INTERVIEW');
    const arch = await db.from('applications').update({ archived_at: new Date().toISOString() }).eq('id', ins.data!.id).select('archived_at').single();
    expect(arch.data?.archived_at).not.toBeNull();
    const del = await db.from('applications').delete().eq('id', ins.data!.id).select('id');
    expect(del.error).not.toBeNull(); // hard delete is not a client capability (archive-first)
    const fk = await db.from('applications').insert({ workspace_id: '00000000-0000-4000-8000-000000000000', user_id: A.userId, company_name: 'X', role_title: 'Y' });
    expect(fk.error).not.toBeNull();
    const badOutcome = await db.from('applications').update({ status: 'CLOSED', outcome: 'WITHDRAWN' }).eq('id', ins.data!.id);
    expect(badOutcome.error?.code).toBe('23514'); // WITHDRAWN requires a closure_reason
    record('T11', { status: 'PASS', insert: 'ok', select: 'ok', update_stage: 'ok', archive: 'ok', hard_delete: 'denied', fk_to_unknown_workspace: 'rejected', withdrawn_without_reason: 'rejected (23514)' });
  });

  it('SEC-01/02 · recovery code single use, session revocation, regeneration invalidates the old set', async () => {
    const other = new Actor(A.ip);
    await other.call('/auth/login', { username: uname('A'), password: pw.A });
    const newPw = STRONG();
    const r = await new Actor('198.51.100.90').call('/auth/recover', { username: uname('A'), code: codesA[2], new_password: newPw });
    expect(r.status).toBe(200);
    expect(r.json.remaining_codes).toBe(9);
    const replay = await new Actor('198.51.100.91').call('/auth/recover', { username: uname('A'), code: codesA[2], new_password: STRONG() });
    expect(replay.status).toBe(401);
    const otherRows = await other.db().from('profiles').select('user_id');
    expect(otherRows.data ?? []).toHaveLength(0); // recovery revoked prior sessions
    const used = await serviceDb().from('auth_recovery_codes').select('is_used, used_at').eq('user_id', A.userId!).eq('is_used', true);
    expect(used.data).toHaveLength(1);
    pw.A = newPw;
    await A.call('/auth/login', { username: uname('A'), password: pw.A });
    const regen = await A.call('/auth/recovery-codes', { password: pw.A });
    expect(regen.status).toBe(200);
    expect(regen.json.recovery_codes).toHaveLength(10);
    const oldUnused = await new Actor('198.51.100.92').call('/auth/recover', { username: uname('A'), code: codesA[5], new_password: STRONG() });
    expect(oldUnused.status).toBe(401);
    record('SEC-01_02', { status: 'PASS', recover: r.status, remaining_after_use: r.json.remaining_codes, replay: replay.status, prior_session_rows_after_recovery: 0, used_at_tracked: true, regenerate: regen.status, old_unused_code_after_regeneration: oldUnused.status });
  });

  it('T03 · ZERO synthetic identity leakage (hard fail)', async () => {
    const { aliasLeakCounter } = await import('../../apps/api/src/lib/security');
    const apiHits = transcript.filter((t) => t.body.includes(ALIAS) || t.headers.includes(ALIAS)).map((t) => t.path);
    const claims = decodeJwt(A.token!);
    const claimsLeak = JSON.stringify(claims).includes(ALIAS);
    // What `supabase.auth.getUser()` does in a browser that holds the access token:
    const gotrue = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY!, authorization: `Bearer ${A.token}` } });
    const gotrueBody = await gotrue.text();
    const gotrueLeak = gotrueBody.includes(ALIAS);
    const result = {
      api_responses_scanned: transcript.length,
      api_responses_with_alias: apiHits.length,
      responses_blocked_by_guard: aliasLeakCounter.blocked,
      jwt_claim_keys: Object.keys(claims).sort(),
      jwt_email_claim_empty: claims.email === '',
      jwt_claims_contain_alias: claimsLeak,
      gotrue_user_endpoint_http: gotrue.status,
      gotrue_user_endpoint_with_browser_token_contains_alias: gotrueLeak,
    };
    const pass = apiHits.length === 0 && aliasLeakCounter.blocked === 0 && !claimsLeak && !gotrueLeak;
    record('T03', { status: pass ? 'PASS' : 'FAIL', ...result });
    expect(apiHits).toEqual([]);
    expect(aliasLeakCounter.blocked).toBe(0);
    expect(claimsLeak).toBe(false);
    expect(gotrueLeak).toBe(false);
  });

  it('T12 · zero outbound email to synthetic identities', async () => {
    const url = process.env.SUPABASE_DB_URL;
    expect(url, 'SUPABASE_DB_URL required for T12 evidence').toBeTruthy();
    const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      const sent = await client.query(`
        select count(*)::int as users,
               count(*) filter (where confirmation_sent_at is not null or recovery_sent_at is not null
                                   or email_change_sent_at is not null or reauthentication_sent_at is not null
                                   or invited_at is not null)::int as with_mail_timestamp
          from auth.users where email like $1`, [`%@${ALIAS}`]);
      const audit = await client.query(`
        select coalesce(payload->>'action', 'unknown') as action, count(*)::int as n
          from auth.audit_log_entries where created_at > now() - interval '3 hours'
         group by 1 order by 1`);
      const mailActions = audit.rows.filter((r) => /confirmation_requested|recovery_requested|invited|reauthenticate|email_change|magiclink|otp/i.test(r.action));
      record('T12', {
        status: sent.rows[0].with_mail_timestamp === 0 && mailActions.length === 0 ? 'PASS' : 'FAIL',
        alias_identities: sent.rows[0].users,
        identities_with_any_mail_sent_timestamp: sent.rows[0].with_mail_timestamp,
        auth_audit_actions_last_3h: audit.rows,
        mail_triggering_actions: mailActions,
      });
      expect(sent.rows[0].with_mail_timestamp).toBe(0);
      expect(mailActions).toEqual([]);
    } finally {
      await client.end();
    }
  });
});
