/**
 * M1B · Auth Option B architecture spike: B01–B22, B25, B26 (+ SEC boundary checks).
 * B03 is completed by e2e/leak.spec.ts (real browser). B23/B24 are covered by
 * scripts/check-bundle.mjs and its tests.
 * Every test either records sanitized evidence or fails. Nothing is marked PASS by hand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SignJWT, generateKeyPair } from 'jose';
import { Actor, STRONG, decodeJwt, freshIp, loadEnv, record, serviceDb, target, transcript, RUN } from './harness';

const ready = loadEnv();
const uname = (tag: string) => `m1b_${RUN}_${tag}`;

describe.skipIf(!ready)('M1B · Auth Option B architecture spike', () => {
  const A = new Actor(); // USER in shared workspace W
  const B = new Actor(); // peer USER in W
  const M = new Actor(); // MANAGER of W
  const X = new Actor(); // outsider (own personal workspace only)
  const pw: Record<string, string> = { A: STRONG(), B: STRONG(), M: STRONG(), X: STRONG() };
  let codesA: string[] = [];
  let W = '';
  const personal: Record<string, string> = {};
  const sb = () => serviceDb();

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();
  });

  it('B01 · credential provisioning: account, Argon2id credential, profile, PERSONAL workspace (MANAGER), 10 recovery codes; no Supabase Auth user', async () => {
    const r = await A.call('/auth/register', { username: uname('A'), password: pw.A });
    expect(r.status).toBe(201);
    codesA = r.json.recovery_codes;
    expect(codesA).toHaveLength(10);
    expect(new Set(codesA).size).toBe(10);
    for (const code of codesA) expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    const uid = A.userId!;
    const [acct, cred, prof, mem, codes] = await Promise.all([
      sb().from('user_accounts').select('user_id, username, username_clean, status').eq('user_id', uid).single(),
      sb().from('user_credentials').select('password_hash, password_algorithm, password_version').eq('user_id', uid).single(),
      sb().from('profiles').select('email, phone, last_active_workspace_id').eq('user_id', uid).single(),
      sb().from('workspace_members').select('role, workspaces(workspace_type)').eq('user_id', uid),
      sb().from('auth_recovery_codes').select('code_hash, is_used').eq('user_id', uid),
    ]);
    expect(acct.data?.username_clean).toBe(uname('A').toLowerCase());
    expect(cred.data?.password_hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(cred.data?.password_hash.includes(pw.A)).toBe(false);
    expect(prof.data?.email).toBeNull();
    expect(mem.data).toHaveLength(1);
    expect(mem.data?.[0]?.role).toBe('MANAGER');
    expect((mem.data?.[0]?.workspaces as unknown as { workspace_type: string }).workspace_type).toBe('PERSONAL');
    personal.A = prof.data!.last_active_workspace_id;
    expect(codes.data).toHaveLength(10);
    expect(codes.data!.every((x) => x.code_hash.startsWith('$argon2id$') && !x.is_used)).toBe(true);
    const gotrue = await sb().auth.admin.getUserById(uid);
    expect(gotrue.data.user).toBeNull();

    const dup = await new Actor().call('/auth/register', { username: uname('A').toUpperCase(), password: STRONG() });
    const weak = await new Actor().call('/auth/register', { username: uname('weak'), password: 'password123' });
    const badEmail = await new Actor().call('/auth/register', { username: uname('mail'), password: STRONG(), email: 'not-an-email' });
    const withEmail = await new Actor().call('/auth/register', { username: uname('mail2'), password: STRONG(), email: 'person@example.com', phone: '+1 555 0100' });
    expect(dup.status).toBe(409);
    expect(weak.status).toBe(422);
    expect(badEmail.status).toBe(422);
    expect(withEmail.status).toBe(201);
    for (const [k, a] of [['B', B], ['M', M], ['X', X]] as const) {
      const rr = await a.call('/auth/register', { username: uname(k), password: pw[k] });
      expect(rr.status).toBe(201);
      personal[k] = rr.json.user.active_workspace_id;
    }
    record('B01', {
      status: 'PASS', http: r.status, recovery_codes: codesA.length, code_format: '8 groups of 4 Crockford Base32 (160 bits; 140 secret)',
      credential_store: 'user_credentials.password_hash', password_algorithm: cred.data?.password_algorithm,
      argon2_params: 'm=19456,t=2,p=1', recovery_code_verifiers: 'argon2id', personal_workspace: 'PERSONAL', membership_role: 'MANAGER',
      supabase_auth_user_exists: false, duplicate_username_case_insensitive: dup.status, weak_password: weak.status,
      invalid_email: badEmail.status, optional_email_and_phone_accepted: withEmail.status,
    });
  });

  it('B02 · username/password login; HttpOnly refresh cookie; identical failure for wrong password vs unknown user', async () => {
    const r = await A.call('/auth/login', { username: uname('A'), password: pw.A });
    expect(r.status).toBe(200);
    const rt = r.setCookies.find((c) => c.startsWith('jq_rt='))!;
    expect(rt).toMatch(/HttpOnly/i);
    expect(rt).toMatch(/Secure/i);
    expect(rt).toMatch(/SameSite=Strict/i);
    expect(rt).toMatch(/Path=\/api\/auth/i);
    const wrong = await new Actor().call('/auth/login', { username: uname('A'), password: 'Wrong-password-000' });
    const unknown = await new Actor().call('/auth/login', { username: uname('nobody'), password: 'Wrong-password-000' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.json).toEqual(unknown.json);
    for (const [k, a] of [['B', B], ['M', M], ['X', X]] as const) expect((await a.call('/auth/login', { username: uname(k), password: pw[k] })).status).toBe(200);
    record('B02', {
      status: 'PASS', http: r.status, body_keys: Object.keys(r.json).sort(), user_keys: Object.keys(r.json.user).sort(),
      session_keys: Object.keys(r.json.session).sort(), refresh_cookie: 'HttpOnly; Secure; SameSite=Strict; Path=/api/auth',
      wrong_vs_unknown_identical: true,
    });
  });

  it('B04 · Node-minted ES256 JWT accepted by the Data API; forged / tampered / alg-none / wrong-role tokens rejected', async () => {
    const { header, payload } = decodeJwt(A.token!);
    expect(header.alg).toBe('ES256');
    expect(typeof header.kid).toBe('string');
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'jti', 'role', 'session_id', 'sub']);
    expect(payload.role).toBe('authenticated');
    expect(payload.sub).toBe(A.userId);
    const ok = await A.db().from('profiles').select('user_id');
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);

    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const rest = (tok: string) => fetch(`${url}/rest/v1/profiles?select=user_id`, { headers: { apikey: key, authorization: `Bearer ${tok}` } });
    const { privateKey } = await generateKeyPair('ES256');
    const forged = await new SignJWT({ role: 'authenticated', session_id: payload.session_id })
      .setProtectedHeader({ alg: 'ES256', kid: String(header.kid), typ: 'JWT' })
      .setSubject(String(payload.sub)).setAudience('authenticated').setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const [h, p, s] = A.token!.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ ...payload, sub: B.userId })).toString('base64url');
    const tampered = `${h}.${tamperedPayload}.${s}`;
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${p}.`;
    const results = { forged_other_key: (await rest(forged)).status, tampered_sub: (await rest(tampered)).status, alg_none: (await rest(none)).status };
    expect(results.forged_other_key).toBe(401);
    expect(results.tampered_sub).toBe(401);
    expect(results.alg_none).toBe(401);
    record('B04', {
      status: 'PASS', header_alg: header.alg, header_has_kid: true, claim_keys: Object.keys(payload).sort(),
      role_claim: payload.role, ttl_seconds: Number(payload.exp) - Number(payload.iat), data_api_http: ok.status, data_api_rows: ok.data?.length,
      rejected: results,
    });
  });

  it('B05 · auth.uid() resolves to the application user id from the JWT sub (no auth.users row exists)', async () => {
    const own = await A.db().from('profiles').select('user_id');
    expect(own.data?.map((x) => x.user_id)).toEqual([A.userId]);
    const ws = await A.db().rpc('rpc_create_workspace', { p_name: `m1b ${RUN} probe` });
    expect(ws.error).toBeNull();
    const created = await sb().from('workspaces').select('created_by').eq('id', ws.data).single();
    expect(created.data?.created_by).toBe(A.userId);
    const forgedOwner = await A.db().from('applications').insert({ workspace_id: personal.A, user_id: B.userId, company_name: 'X', role_title: 'Y', stage: 'SAVED' });
    expect(forgedOwner.error?.code).toBe('42501');
    const gotrue = await sb().auth.admin.getUserById(A.userId!);
    record('B05', {
      status: 'PASS', rls_profile_row_equals_sub: true, rpc_created_by_equals_sub: true,
      insert_with_other_owner: forgedOwner.error?.code, auth_users_row_for_sub: gotrue.data.user ? 'exists' : 'none',
    });
  });

  it('B06–B10 · RLS: USER own rows, peer denial, cross-workspace denial, MANAGER same-workspace access, MANAGER cross-workspace denial', async () => {
    const w = await M.db().rpc('rpc_create_workspace', { p_name: `m1b ${RUN} team` });
    expect(w.error).toBeNull();
    W = w.data as string;
    for (const u of [A, B]) {
      const add = await M.db().from('workspace_members').insert({ workspace_id: W, user_id: u.userId, role: 'USER' });
      expect(add.error).toBeNull();
    }
    const insA = await A.db().from('applications').insert({ workspace_id: W, user_id: A.userId, company_name: 'Acme', role_title: 'Designer', stage: 'APPLIED' }).select('id').single();
    const insB = await B.db().from('applications').insert({ workspace_id: W, user_id: B.userId, company_name: 'Globex', role_title: 'Engineer', stage: 'SAVED' }).select('id').single();
    const insX = await X.db().from('applications').insert({ workspace_id: personal.X, user_id: X.userId, company_name: 'Initech', role_title: 'Analyst', stage: 'SAVED' }).select('id').single();
    expect(insA.error).toBeNull(); expect(insB.error).toBeNull(); expect(insX.error).toBeNull();

    // B06: USER sees and edits own
    const aRows = await A.db().from('applications').select('id, user_id').eq('workspace_id', W);
    // M3: simple fields are direct Data API writes; lifecycle changes (stage/state/outcome/archive)
    // go through the atomic RPCs (Gate 03 RPC boundary, migration 20260924310000).
    const aUpd = await A.db().from('applications').update({ next_action: 'Send portfolio' }).eq('id', insA.data!.id).select('id');
    const aDirectStage = await A.db().from('applications').update({ stage: 'INTERVIEW' }).eq('id', insA.data!.id).select('id');
    const aRpcStage = await A.db().rpc('rpc_move_application_stage', { p_application_id: insA.data!.id, p_new_stage: 'INTERVIEW' });
    expect(aRows.data!.every((x) => x.user_id === A.userId)).toBe(true);
    expect(aRows.data!.map((x) => x.id)).toContain(insA.data!.id);
    expect(aUpd.data).toHaveLength(1);
    expect(aDirectStage.error?.code).toBe('42501');
    expect(aRpcStage.error).toBeNull();
    // B07: peer denial
    const aSeesB = await A.db().from('applications').select('id').eq('id', insB.data!.id);
    const aUpdB = await A.db().from('applications').update({ stage: 'OFFER' }).eq('id', insB.data!.id).select('id');
    const aInsForB = await A.db().from('applications').insert({ workspace_id: W, user_id: B.userId, company_name: 'Z', role_title: 'Z', stage: 'SAVED' });
    const bAddsMember = await B.db().from('workspace_members').insert({ workspace_id: W, user_id: X.userId, role: 'USER' });
    expect(aSeesB.data).toHaveLength(0);
    expect(aUpdB.data).toHaveLength(0);
    expect(aInsForB.error?.code).toBe('42501');
    expect(bAddsMember.error?.code).toBe('42501');
    // B08: cross-workspace denial
    const xSeesW = await X.db().from('applications').select('id').eq('workspace_id', W);
    const xInsW = await X.db().from('applications').insert({ workspace_id: W, user_id: X.userId, company_name: 'Z', role_title: 'Z', stage: 'SAVED' });
    const aSeesX = await A.db().from('applications').select('id').eq('workspace_id', personal.X);
    const xSeesWMembers = await X.db().from('workspace_members').select('id').eq('workspace_id', W);
    expect(xSeesW.data).toHaveLength(0);
    expect(xInsW.error?.code).toBe('42501');
    expect(aSeesX.data).toHaveLength(0);
    expect(xSeesWMembers.data).toHaveLength(0);
    // B09: MANAGER same workspace
    const mRows = await M.db().from('applications').select('id, user_id').eq('workspace_id', W);
    const mUpdA = await M.db().from('applications').update({ next_action: 'Follow up' }).eq('id', insA.data!.id).select('id');
    const mInsForA = await M.db().from('applications').insert({ workspace_id: W, user_id: A.userId, company_name: 'Hooli', role_title: 'PM', stage: 'SAVED' });
    expect(new Set(mRows.data!.map((x) => x.user_id))).toEqual(new Set([A.userId, B.userId]));
    expect(mUpdA.data).toHaveLength(1);
    expect(mInsForA.error).toBeNull();
    // B10: MANAGER cross-workspace denial
    const mSeesX = await M.db().from('applications').select('id').eq('workspace_id', personal.X);
    const mUpdX = await M.db().from('applications').update({ stage: 'OFFER' }).eq('id', insX.data!.id).select('id');
    const mInsX = await M.db().from('applications').insert({ workspace_id: personal.X, user_id: M.userId, company_name: 'Z', role_title: 'Z', stage: 'SAVED' });
    const mAddsToX = await M.db().from('workspace_members').insert({ workspace_id: personal.X, user_id: M.userId, role: 'MANAGER' });
    expect(mSeesX.data).toHaveLength(0);
    expect(mUpdX.data).toHaveLength(0);
    expect(mInsX.error?.code).toBe('42501');
    expect(mAddsToX.error?.code).toBe('42501');
    // Last-manager protection still holds under Option B tokens
    const demote = await M.db().from('workspace_members').update({ role: 'USER' }).eq('workspace_id', W).eq('user_id', M.userId).select('id');
    expect(demote.error?.message ?? '').toContain('CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER');

    record('B06', { status: 'PASS', user_rows_all_own: true, own_insert: 'allowed', own_update_rows: 1, own_direct_stage_write: aDirectStage.error?.code, own_stage_via_rpc: 'allowed' });
    record('B07', { status: 'PASS', peer_row_visible: 0, peer_update_rows: 0, insert_for_peer: aInsForB.error?.code, user_adds_member: bAddsMember.error?.code });
    record('B08', { status: 'PASS', outsider_rows_in_W: 0, outsider_insert_into_W: xInsW.error?.code, member_rows_in_foreign_personal: 0, outsider_membership_rows: 0 });
    record('B09', { status: 'PASS', manager_sees_owners: 'A and B', manager_update_rows: 1, manager_insert_for_member: 'allowed' });
    record('B10', { status: 'PASS', manager_rows_in_foreign_ws: 0, manager_update_foreign_rows: 0, manager_insert_foreign: mInsX.error?.code, manager_self_add_foreign: mAddsToX.error?.code, last_manager_demotion: 'blocked' });
  });

  it('B11/B12 · direct browser-equivalent Data API read and write (supabase-js accessToken option, no Node proxy)', async () => {
    const db = A.db();
    const ins = await db.from('applications').insert({ workspace_id: personal.A, user_id: A.userId, company_name: 'Brightline', role_title: 'Lead UX', stage: 'SAVED' }).select('id, stage').single();
    expect(ins.error).toBeNull();
    const sel = await db.from('applications').select('id, stage').eq('id', ins.data!.id).single();
    const upd = await db.from('applications').update({ priority: 'HIGH' }).eq('id', ins.data!.id).select('priority').single();
    const moved = await db.rpc('rpc_move_application_stage', { p_application_id: ins.data!.id, p_new_stage: 'APPLIED' });
    const del = await db.from('applications').delete().eq('id', ins.data!.id).select('id');
    const badStage = await db.from('applications').insert({ workspace_id: personal.A, user_id: A.userId, company_name: 'Q', role_title: 'Q', stage: 'NOT_A_STAGE' });
    expect(sel.data?.id).toBe(ins.data!.id);
    expect(upd.data?.priority).toBe('HIGH');
    expect(moved.error).toBeNull();
    expect(del.error?.code).toBe('42501'); // no DELETE grant: archive-first (Gate 03)
    expect(badStage.error?.code).toBe('23514');
    record('B11', { status: 'PASS', client: 'supabase-js createClient({ accessToken })', select_http: sel.status, row_found: true });
    record('B12', { status: 'PASS', insert_http: ins.status, update_http: upd.status, stage_via_rpc: 'allowed', delete: `denied (${del.error?.code})`, check_constraint: badStage.error?.code });
  });

  it('B13 · session creation: app-owned session row + hashed refresh verifier; no raw token or IP stored', async () => {
    const s = new Actor();
    const r = await s.call('/auth/login', { username: uname('A'), password: pw.A });
    expect(r.status).toBe(200);
    const sid = String(decodeJwt(s.token!).payload.session_id);
    const raw = s.jar.get('jq_rt')!;
    const { sha256Hex } = await import('../../apps/api/src/lib/tokens');
    const [sess, tok] = await Promise.all([
      sb().from('auth_sessions').select('user_id, revoked_at, expires_at, created_at, ip_hash, user_agent').eq('id', sid).single(),
      sb().from('auth_refresh_tokens').select('token_hash, used_at, parent_id').eq('session_id', sid),
    ]);
    expect(sess.data?.user_id).toBe(A.userId);
    expect(sess.data?.revoked_at).toBeNull();
    expect(sess.data?.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sess.data?.ip_hash).not.toContain(s.ip);
    expect(tok.data).toHaveLength(1);
    expect(tok.data![0]!.token_hash).toBe(sha256Hex(raw));
    expect(tok.data![0]!.token_hash).not.toBe(raw);
    expect(raw).toMatch(/^jqr_[A-Za-z0-9_-]{43}$/);
    const days = (Date.parse(sess.data!.expires_at) - Date.parse(sess.data!.created_at)) / 86_400_000;
    record('B13', {
      status: 'PASS', session_row: true, session_absolute_days: Math.round(days), refresh_token_entropy_bits: 256,
      stored_verifier: 'sha256 hex (64)', raw_token_stored: false, ip_stored: 'sha256 only', user_agent_stored: sess.data?.user_agent === 'm1b-integration',
    });
  });

  it('B14 · access-token expiry: expired JWT rejected by the Data API (after its clock-skew leeway) and the Node API', async () => {
    const { mintAccessToken } = await import('../../apps/api/src/lib/tokens');
    const sid = String(decodeJwt(A.token!).payload.session_id);
    const short = await mintAccessToken(A.userId!, sid, 1);
    const rest = () => fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?select=user_id`, {
      headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY!, authorization: `Bearer ${short.access_token}` },
    });
    const before = await A.db(short.access_token).from('profiles').select('user_id');
    await new Promise((r) => setTimeout(r, 2500));
    const withinSkew = await rest();
    const me = await A.call('/auth/me', undefined, { bearer: short.access_token });
    await new Promise((r) => setTimeout(r, 30_000));
    const after = await rest();
    const afterBody = await after.json() as { code?: string };
    expect(before.data).toHaveLength(1);
    expect(me.status).toBe(401); // Node verifies exp with zero leeway
    expect(after.status).toBe(401);
    const standard = decodeJwt(A.token!).payload;
    record('B14', {
      status: 'PASS', default_access_ttl_seconds: Number(standard.exp) - Number(standard.iat),
      short_token_before_expiry_rows: 1, data_api_2_5s_after_exp_http: withinSkew.status,
      data_api_32_5s_after_exp_http: after.status, data_api_error_code: afterBody.code, node_me_after_expiry: me.status,
      note: 'The Data API accepted the token for a short clock-skew leeway after exp; it was rejected within 32.5 s.',
    });
  }, 60_000);

  it('B15/B16 · refresh rotation (single use) and replay rejection with session revocation; concurrent refresh', async () => {
    const s = new Actor();
    await s.call('/auth/login', { username: uname('A'), password: pw.A });
    const first = s.jar.get('jq_rt')!;
    const firstAccess = s.token!;
    const noCsrf = await s.call('/auth/refresh', {}, { csrf: false });
    const badOrigin = await s.call('/auth/refresh', {}, { origin: 'https://evil.example' });
    expect(noCsrf.status).toBe(403);
    expect(badOrigin.status).toBe(403);
    const r1 = await s.call('/auth/refresh', {});
    expect(r1.status).toBe(200);
    const second = s.jar.get('jq_rt')!;
    expect(second).not.toBe(first);
    expect(s.token).not.toBe(firstAccess);
    const works = await s.db().from('profiles').select('user_id');
    expect(works.data).toHaveLength(1);
    const { sha256Hex } = await import('../../apps/api/src/lib/tokens');
    const firstRow = await sb().from('auth_refresh_tokens').select('id, used_at').eq('token_hash', sha256Hex(first)).single();
    const secondRow = await sb().from('auth_refresh_tokens').select('parent_id, used_at').eq('token_hash', sha256Hex(second)).single();
    expect(firstRow.data?.used_at).not.toBeNull();
    expect(secondRow.data?.parent_id).toBe(firstRow.data?.id);
    record('B15', { status: 'PASS', rotated: true, new_access_token: true, old_verifier_consumed: true, child_links_parent: true, missing_csrf: noCsrf.status, foreign_origin: badOrigin.status });

    // B16: immediate replay of the consumed token (no waiting, no grace window)
    const attacker = new Actor();
    attacker.jar.set('jq_rt', first);
    attacker.jar.set('jq_csrf', s.jar.get('jq_csrf')!);
    const replay = await attacker.call('/auth/refresh', {});
    expect(replay.status).toBe(401);
    expect(replay.json.error.code).toBe('REFRESH_REUSED');
    const sid = String(decodeJwt(s.token!).payload.session_id);
    const sess = await sb().from('auth_sessions').select('revoked_reason').eq('id', sid).single();
    expect(sess.data?.revoked_reason).toBe('REFRESH_REUSE');
    const legitAfter = await s.call('/auth/refresh', {});
    const dataAfter = await s.db().from('profiles').select('user_id');
    expect(legitAfter.status).toBe(401);
    expect(dataAfter.data ?? []).toHaveLength(0);

    // Concurrency: 5 simultaneous refreshes presenting the same live token
    const c = new Actor();
    await c.call('/auth/login', { username: uname('A'), password: pw.A });
    const shared = c.jar.get('jq_rt')!;
    const csrf = c.jar.get('jq_csrf')!;
    const racers = Array.from({ length: 5 }, () => { const a = new Actor(c.ip); a.jar.set('jq_rt', shared); a.jar.set('jq_csrf', csrf); return a; });
    const statuses = (await Promise.all(racers.map((a) => a.call('/auth/refresh', {})))).map((x) => x.status);
    expect(statuses.filter((x) => x === 200)).toHaveLength(1);
    record('B16', {
      status: 'PASS', immediate_replay_http: replay.status, replay_code: replay.json.error.code, session_revoked_reason: sess.data?.revoked_reason,
      legit_holder_after_replay: legitAfter.status, access_token_rows_after_replay: 0, grace_window_seconds: 0,
      concurrent_same_token: { attempts: 5, succeeded: 1, statuses: statuses.sort() },
    });
  });

  it('B17 · logout revokes the session immediately (local), and all sessions (global)', async () => {
    const s1 = new Actor(); const s2 = new Actor(); const s3 = new Actor();
    for (const s of [s1, s2, s3]) await s.call('/auth/login', { username: uname('B'), password: pw.B });
    const t1 = s1.token!;
    const rt1 = s1.jar.get('jq_rt')!;
    const csrf1 = s1.jar.get('jq_csrf')!;
    const out = await s1.call('/auth/logout', { scope: 'local' });
    expect(out.status).toBe(200);
    expect(out.setCookies.some((x) => x.startsWith('jq_rt=') && /Max-Age=0/i.test(x))).toBe(true);
    const rows1 = await s1.db(t1).from('profiles').select('user_id');
    const replayer = new Actor(s1.ip);
    replayer.jar.set('jq_rt', rt1);
    replayer.jar.set('jq_csrf', csrf1);
    const refresh1 = await replayer.call('/auth/refresh', {});
    expect(refresh1.status).toBe(401);
    const rows2 = await s2.db().from('profiles').select('user_id');
    expect(rows1.data ?? []).toHaveLength(0);
    expect(rows2.data).toHaveLength(1);
    const g = await s2.call('/auth/logout', { scope: 'global' });
    const rows3 = await s3.db().from('profiles').select('user_id');
    const refresh3 = await s3.call('/auth/refresh', {});
    expect(g.status).toBe(200);
    expect(rows3.data ?? []).toHaveLength(0);
    expect(refresh3.status).toBe(401);
    await B.call('/auth/login', { username: uname('B'), password: pw.B });
    record('B17', {
      status: 'PASS', local_logout_http: out.status, cookies_cleared: true, revoked_token_rows: 0, revoked_token_http: rows1.status,
      old_refresh_token_after_logout: refresh1.status, other_session_unaffected_rows: 1, global_logout_revoked: g.json.sessions_revoked,
      other_device_after_global: { rows: 0, refresh: refresh3.status },
      note: 'A revoked session’s unexpired JWT still verifies, but RLS (app.session_is_active) returns 0 rows; PostgREST answers 200 [].',
    });
  });

  it('B18 · password change: wrong current rejected; old password dead; CURRENT session kept; other sessions revoked', async () => {
    const other = new Actor();
    await other.call('/auth/login', { username: uname('A'), password: pw.A });
    const next = STRONG();
    const wrongCurrent = await A.call('/auth/password', { current_password: 'Not-the-password-1', new_password: next });
    const noCsrf = await A.call('/auth/password', { current_password: pw.A, new_password: next }, { csrf: false });
    expect(wrongCurrent.status).toBe(401);
    expect(noCsrf.status).toBe(403);
    const r = await A.call('/auth/password', { current_password: pw.A, new_password: next });
    expect(r.status).toBe(200);
    const oldLogin = await new Actor().call('/auth/login', { username: uname('A'), password: pw.A });
    const newLogin = await new Actor().call('/auth/login', { username: uname('A'), password: next });
    const currentRows = await A.db().from('profiles').select('user_id');
    const currentRefresh = await A.call('/auth/refresh', {});
    const otherRows = await other.db().from('profiles').select('user_id');
    const otherRefresh = await other.call('/auth/refresh', {});
    expect(oldLogin.status).toBe(401);
    expect(newLogin.status).toBe(200);
    expect(currentRows.data).toHaveLength(1);
    expect(currentRefresh.status).toBe(200);
    expect(otherRows.data ?? []).toHaveLength(0);
    expect(otherRefresh.status).toBe(401);
    pw.A = next;
    record('B18', {
      status: 'PASS', policy: 'current session kept; all other sessions revoked', wrong_current: wrongCurrent.status, missing_csrf: noCsrf.status,
      change: r.status, other_sessions_revoked: r.json.other_sessions_revoked, old_password_login: oldLogin.status, new_password_login: newLogin.status,
      current_session_rows: 1, current_session_refresh: currentRefresh.status, other_session_rows: 0, other_session_refresh: otherRefresh.status,
    });
  });

  it('B19/B20 · recovery-code reset (single use, regeneration invalidates) and global session invalidation', async () => {
    const d1 = new Actor(); const d2 = new Actor();
    await d1.call('/auth/login', { username: uname('A'), password: pw.A });
    await d2.call('/auth/login', { username: uname('A'), password: pw.A });
    const next = STRONG();
    const weak = await new Actor().call('/auth/recover', { username: uname('A'), code: codesA[0], new_password: 'short' });
    expect(weak.status).toBe(422); // validated before a code is consumed
    const rec = new Actor();
    const r = await rec.call('/auth/recover', { username: uname('A'), code: codesA[0]!.toLowerCase(), new_password: next });
    expect(r.status).toBe(200);
    expect(r.json.remaining_codes).toBe(9);
    const reuse = await new Actor().call('/auth/recover', { username: uname('A'), code: codesA[0], new_password: STRONG() });
    const oldPw = await new Actor().call('/auth/login', { username: uname('A'), password: pw.A });
    const newPw = await new Actor().call('/auth/login', { username: uname('A'), password: next });
    expect(reuse.status).toBe(401);
    expect(oldPw.status).toBe(401);
    expect(newPw.status).toBe(200);
    pw.A = next;
    // B20: every pre-existing session is dead (including A's main harness session)
    const dead = await Promise.all([d1, d2, A].map(async (s) => ({ rows: (await s.db().from('profiles').select('user_id')).data?.length ?? 0, refresh: (await s.call('/auth/refresh', {})).status })));
    expect(dead.every((x) => x.rows === 0 && x.refresh === 401)).toBe(true);
    const recRows = await rec.db().from('profiles').select('user_id');
    expect(recRows.data).toHaveLength(1);
    const used = await sb().from('auth_recovery_codes').select('is_used, used_at').eq('user_id', A.userId).eq('is_used', true);
    expect(used.data).toHaveLength(1);
    // regeneration invalidates the old unused set
    const regen = await rec.call('/auth/recovery-codes', { password: pw.A });
    expect(regen.status).toBe(200);
    const oldUnused = await new Actor().call('/auth/recover', { username: uname('A'), code: codesA[1], new_password: STRONG() });
    const pwFresh = STRONG();
    const fresh = await new Actor().call('/auth/recover', { username: uname('A'), code: regen.json.recovery_codes[0], new_password: pwFresh });
    expect(oldUnused.status).toBe(401);
    expect(fresh.status).toBe(200);
    pw.A = pwFresh;
    expect((await A.call('/auth/login', { username: uname('A'), password: pw.A })).status).toBe(200);
    record('B19', {
      status: 'PASS', weak_new_password: weak.status, recover: r.status, code_input_case_insensitive: true, remaining_after_use: r.json.remaining_codes,
      replay_same_code: reuse.status, old_password_login: oldPw.status, new_password_login: newPw.status, used_at_tracked: true,
      regenerate: regen.status, old_unused_code_after_regeneration: oldUnused.status, new_code_works: fresh.status,
    });
    record('B20', { status: 'PASS', sessions_before_recovery: 3, all_revoked: dead, recovering_client_new_session_rows: 1 });
  });

  it('B21 · per-account lockout: 5 failures → 6th is 429 even with the correct password (durable, in Postgres)', async () => {
    const F = new Actor();
    const pwF = STRONG();
    await F.call('/auth/register', { username: uname('F'), password: pwF });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await new Actor().call('/auth/login', { username: uname('F'), password: 'Wrong-password-000' })).status);
    const correct = await new Actor().call('/auth/login', { username: uname('F'), password: pwF });
    const row = await sb().from('user_accounts').select('failed_login_count, locked_until').eq('user_id', F.userId).single();
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    expect(correct.status).toBe(429);
    expect(row.data?.locked_until).not.toBeNull();
    // recovery lockout: 3 failures → 4th 429
    const rec: number[] = [];
    for (let i = 0; i < 4; i++) rec.push((await new Actor().call('/auth/recover', { username: uname('F'), code: 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA', new_password: STRONG() })).status);
    expect(rec).toEqual([401, 401, 401, 429]);
    record('B21', { status: 'PASS', per_account: statuses, correct_password_while_locked: correct.status, failed_login_count: row.data?.failed_login_count, lock_store: 'user_accounts (Postgres)', recovery_attempts: rec });
  });

  it('B22 · per-IP limit via the shared DB-backed limiter (not per-instance memory); other IPs unaffected', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await new Actor(ip).call('/auth/login', { username: uname('ghost'), password: 'Wrong-password-000' })).status);
    const other = await new Actor().call('/auth/login', { username: uname('ghost'), password: 'Wrong-password-000' });
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses[20]).toBe(429);
    expect(other.status).toBe(401);
    const { sha256Hex } = await import('../../apps/api/src/lib/tokens');
    const bucket = await sb().from('auth_rate_limits').select('bucket, hits').eq('bucket', `login-ip:${sha256Hex(ip)}`).single();
    expect(bucket.data?.hits).toBe(21);
    expect(bucket.data?.bucket).not.toContain(ip);
    // Two independent server processes share the same counter
    const key = `probe-${RUN}`;
    const c1 = serviceDb(); const c2 = serviceDb();
    const waits = [];
    for (let i = 0; i < 4; i++) waits.push((await (i % 2 ? c1 : c2).rpc('rpc_rate_limit_hit', { p_bucket: key, p_max: 3, p_window_seconds: 60 })).data);
    expect(waits.slice(0, 3)).toEqual([0, 0, 0]);
    expect(Number(waits[3])).toBeGreaterThan(0);
    record('B22', {
      status: 'PASS', store: 'Postgres auth_rate_limits via rpc_rate_limit_hit (shared across instances)', limit: 20,
      twenty_first_from_same_ip: statuses[20], different_ip_unaffected: other.status, stored_key: 'sha256(ip), raw IP not stored',
      cross_client_shared_counter: waits.map((w) => (Number(w) > 0 ? 'blocked' : 'allowed')),
    });
  });

  it('B25 · Supabase /auth/v1/user with an Option B token reveals no identity; GoTrue sign-up and password grant closed', async () => {
    const s = new Actor();
    await s.call('/auth/login', { username: uname('M'), password: pw.M });
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const u = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, authorization: `Bearer ${s.token}` } });
    const text = await u.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(text); } catch { /* keep empty */ }
    expect(u.status).not.toBe(200);
    expect(text).not.toMatch(/@/);
    expect(text).not.toContain(uname('M'));
    expect(text.toLowerCase()).not.toContain(uname('M').toLowerCase());
    const signup = await fetch(`${url}/auth/v1/signup`, { method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify({ email: `probe-${RUN}@example.com`, password: STRONG() }) });
    const grant = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify({ email: `probe-${RUN}@example.com`, password: STRONG() }) });
    const testIds = [A.userId, B.userId, M.userId, X.userId];
    const gotrueUsers = await Promise.all(testIds.map(async (id) => (await sb().auth.admin.getUserById(id!)).data.user !== null));
    expect(gotrueUsers.every((x) => !x)).toBe(true);
    expect(signup.ok).toBe(false);
    expect(grant.ok).toBe(false);
    record('B25', {
      status: 'PASS', auth_v1_user_http: u.status, auth_v1_user_error_code: parsed.error_code ?? parsed.code ?? null,
      body_keys: Object.keys(parsed).sort(), body_contains_email_or_username: false,
      supabase_auth_users_for_test_accounts: 0, gotrue_signup_http: signup.status, gotrue_password_grant_http: grant.status,
    });
  });

  it('B26 · canonical workflow via Data API and Node API; clients cannot mutate it', async () => {
    const s = new Actor();
    await s.call('/auth/login', { username: uname('X'), password: pw.X });
    const direct = await s.db().from('workflow_definitions').select('stages, outcomes, closure_reasons').is('workspace_id', null).single();
    const node = await s.call('/workflow');
    const upd = await s.db().from('workflow_definitions').update({ version: 99 }).is('workspace_id', null).select('id');
    expect(direct.error).toBeNull();
    expect(node.status).toBe(200);
    expect(node.json.workflow.stages).toEqual(direct.data!.stages);
    expect(upd.data ?? []).toHaveLength(0);
    const unauth = await new Actor().call('/workflow');
    expect(unauth.status).toBe(401);
    const stages = (direct.data!.stages as { id: string }[]).map((x) => x.id);
    record('B26', {
      status: 'PASS', stages, outcomes: (direct.data!.outcomes as { id: string }[]).map((x) => x.id),
      closure_reasons: (direct.data!.closure_reasons as { id: string }[]).length, node_equals_data_api: true, client_update_rows: 0, node_without_token: unauth.status,
    });
  });

  it('SEC · auth system tables and privileged RPCs are unreachable with a user token', async () => {
    const s = new Actor();
    await s.call('/auth/login', { username: uname('X'), password: pw.X });
    const tables = ['user_accounts', 'user_credentials', 'auth_sessions', 'auth_refresh_tokens', 'auth_rate_limits', 'auth_recovery_codes'];
    const tableResults: Record<string, string> = {};
    for (const t of tables) {
      const r = await s.db().from(t).select('*').limit(1);
      tableResults[t] = r.error ? r.error.code ?? 'error' : `rows:${r.data?.length}`;
      expect(r.error !== null || (r.data?.length ?? 0) === 0).toBe(true);
    }
    const rpcs: Record<string, string> = {};
    for (const [fn, args] of [
      ['rpc_create_session', { p_user_id: s.userId, p_refresh_hash: 'x'.repeat(64), p_session_seconds: 60, p_refresh_seconds: 60, p_user_agent: null, p_ip_hash: null }],
      ['rpc_change_password', { p_user_id: s.userId, p_new_hash: '$argon2id$x', p_keep_session: randomUUID() }],
      ['rpc_rate_limit_hit', { p_bucket: 'x', p_max: 1, p_window_seconds: 1 }],
      ['rpc_register_account', { p_username: 'x', p_password_hash: 'x', p_display_name: '', p_email: '', p_phone: '', p_code_hashes: [], p_code_hints: [] }],
    ] as const) {
      const r = await s.db().rpc(fn, args as Record<string, unknown>);
      rpcs[fn] = r.error?.code ?? 'ALLOWED';
      expect(r.error).not.toBeNull();
    }
    record('SEC', { status: 'PASS', system_tables_with_user_token: tableResults, privileged_rpcs_with_user_token: rpcs });
  });

  afterAll(() => {
    // B03 (API side): no response ever carries credential or token material in its body,
    // and no synthetic identity exists to leak. The browser half runs in e2e/leak.spec.ts.
    if (!ready || transcript.length === 0) return;
    const bodies = transcript.map((t) => t.body).join('\n');
    const headers = transcript.map((t) => t.headers).join('\n');
    const findings = {
      argon2_verifier_in_body: /\$argon2id\$/.test(bodies),
      password_hash_field_in_body: /password_hash|code_hash|token_hash/.test(bodies),
      refresh_token_in_body: /jqr_[A-Za-z0-9_-]{20,}/.test(bodies),
      refresh_token_outside_set_cookie: headers.split('\n').some((h) => /jqr_/.test(h.replace(/"set-cookie","jq_rt=jqr_[^"]*"/g, ''))),
      synthetic_email_pattern: /@auth\.|id_[0-9a-f-]{36}@/.test(bodies),
      private_key_material: /"d":"[A-Za-z0-9_-]{20,}"/.test(bodies),
    };
    const status = Object.values(findings).some(Boolean) ? 'FAIL' : 'PASS';
    record('B03-api', { status, target: target(), api_responses_scanned: transcript.length, findings });
    expect(status).toBe('PASS');
  });
});
