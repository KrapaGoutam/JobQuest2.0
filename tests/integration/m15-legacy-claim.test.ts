import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Actor, loadEnv, serviceDb, anonDb, makeRecorder, RUN } from './harness';

const record = makeRecorder('test-results/evidence', 'claim');
const ready = loadEnv();

describe.skipIf(!ready)('Milestone 15 Legacy Account Claim Flow Integration', () => {
  const sb = () => serviceDb();
  let user_id: string;
  let code: string;
  let username: string;

  beforeAll(async () => {
    username = `legacy_${RUN}_user`;
    code = 'CLAIM-' + randomBytes(8).toString('hex').toUpperCase();

    // 1. Create Identity
    const { data: authUser, error: authErr } = await sb().auth.admin.createUser({
      email: `${username}@example.com`,
      email_confirm: true,
      password: randomBytes(16).toString('hex') + 'A1!'
    });
    if (authErr) throw authErr;
    user_id = authUser.user.id;

    // 2. Create User Account (STAGED)
    await sb().from('user_accounts').insert({
      user_id,
      username_clean: username.toLowerCase(),
      username: username,
      status: 'STAGED' // Legacy unactivated
    });

    // 3. Create Profile
    await sb().from('profiles').insert({
      user_id,
      display_name: 'Legacy User'
    });

    // 4. Create Workspace and Membership (so we can test access later)
    const wsId = randomUUID();
    await sb().from('workspaces').insert({
      id: wsId,
      name: 'Legacy Workspace',
      slug: `ws-${wsId}`,
      workspace_type: 'SHARED',
      created_by: user_id
    });
    await sb().from('workspace_members').insert({
      workspace_id: wsId,
      user_id,
      role: 'MANAGER'
    });

    // 5. Create Claim Code
    const { hashPassword } = await import('../../apps/api/src/lib/passwords');
    const { normalizeCode, HINT_CHARS } = await import('../../apps/api/src/lib/recovery');
    
    const normalized = normalizeCode(code);
    const codeHash = await hashPassword(normalized); // argon2
    const codeHint = normalized.slice(0, HINT_CHARS);

    await sb().from('legacy_claim_codes').insert({
      user_id,
      code_hash: codeHash,
      code_hint: codeHint,
      expires_at: new Date(Date.now() + 86400000).toISOString()
    });
  });

  const A = new Actor();

  it('CLAIM-02 WRONG CODE - rejects invalid code', async () => {
    const res = await A.call('/auth/claim', {
      username,
      code: 'WRONG-CODE-1234',
      new_password: 'Valid-New-Password-1!'
    });
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe('INVALID_CLAIM');
    record('claim-02-wrong-code', res);
  });

  it('CLAIM-05 WRONG USERNAME - rejects wrong username with valid code', async () => {
    const res = await A.call('/auth/claim', {
      username: 'wronguser',
      code,
      new_password: 'Valid-New-Password-1!'
    });
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe('INVALID_CLAIM');
    record('claim-05-wrong-username', res);
  });

  it('CLAIM-06 WEAK PASSWORD - rejects weak password and does not consume code', async () => {
    const res = await A.call('/auth/claim', {
      username,
      code,
      new_password: '123'
    });
    expect(res.status).toBe(422);
    // Code should remain unused
    const { data } = await sb().from('legacy_claim_codes').select('claimed_at').eq('user_id', user_id).single();
    expect(data?.claimed_at).toBeNull();
    record('claim-06-weak-password', res);
  });

  it('CLAIM-01 VALID CLAIM - consumes code, activates account, creates valid session', async () => {
    const newPassword = 'Strong-New-Password-2026!';
    const res = await A.call('/auth/claim', {
      username,
      code,
      new_password: newPassword
    });
    expect(res.status).toBe(200);
    expect(res.json.session).toBeDefined();


    // Verify code is consumed
    const { data: codeData } = await sb().from('legacy_claim_codes').select('claimed_at').eq('user_id', user_id).single();
    expect(codeData?.claimed_at).not.toBeNull();

    // Verify user is ACTIVE in DB
    const { data: acct } = await sb().from('user_accounts').select('status').eq('user_id', user_id).single();
    expect(acct?.status).toBe('ACTIVE');

    // Verify we can access our workspace
    const meRes = await A.call('/auth/me');
    expect(meRes.status).toBe(200);

    delete (res.json as any).session; delete (res as any).setCookies; record('claim-01-success', res);
  });

  it('CLAIM-04 REPLAY - same code cannot be used again', async () => {
    const res = await A.call('/auth/claim', {
      username,
      code,
      new_password: 'Another-Password-1!'
    });
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe('INVALID_CLAIM');
    record('claim-04-replay', res);
  });

  it('CLAIM-08 LOGIN AFTER CLAIM - new password works via normal login', async () => {
    const B = new Actor();
    const res = await B.call('/auth/login', {
      username,
      password: 'Strong-New-Password-2026!'
    });
    expect(res.status).toBe(200);
    expect(res.json.session).toBeDefined();
    delete (res.json as any).session; delete (res as any).setCookies; record('claim-08-login-after', res);
  });
  
  it('CLAIM-03 EXPIRED CODE', async () => {
    const expiredCode = 'CLAIM-' + randomBytes(8).toString('hex').toUpperCase();
    const { hashPassword } = await import('../../apps/api/src/lib/passwords');
    const { normalizeCode, HINT_CHARS } = await import('../../apps/api/src/lib/recovery');
    const norm = normalizeCode(expiredCode);
    const hash = await hashPassword(norm);
    await sb().from('legacy_claim_codes').insert({
      user_id, code_hash: hash, code_hint: norm.slice(0, HINT_CHARS), expires_at: new Date(Date.now() - 1000).toISOString()
    });
    const res = await A.call('/auth/claim', { username, code: expiredCode, new_password: 'ValidPassword1!' });
    expect(res.status).toBe(401);
  });

  /** Minimal fresh legacy user + unused claim code, mirroring beforeAll's setup. */
  async function setupLegacyUser(tag: string) {
    const u = `legacy_${RUN}_${tag}`;
    const c = 'CLAIM-' + randomBytes(8).toString('hex').toUpperCase();

    const { data: authUser, error: authErr } = await sb().auth.admin.createUser({
      email: `${u}@example.com`,
      email_confirm: true,
      password: randomBytes(16).toString('hex') + 'A1!'
    });
    if (authErr) throw authErr;
    const uid = authUser.user.id;

    await sb().from('user_accounts').insert({
      user_id: uid,
      username_clean: u.toLowerCase(),
      username: u,
      status: 'STAGED'
    });

    const { hashPassword } = await import('../../apps/api/src/lib/passwords');
    const { normalizeCode, HINT_CHARS } = await import('../../apps/api/src/lib/recovery');
    const normalized = normalizeCode(c);
    const codeHash = await hashPassword(normalized);
    const codeHint = normalized.slice(0, HINT_CHARS);

    const { data: codeRow, error: codeErr } = await sb().from('legacy_claim_codes').insert({
      user_id: uid,
      code_hash: codeHash,
      code_hint: codeHint,
      expires_at: new Date(Date.now() + 86400000).toISOString()
    }).select().single();
    if (codeErr) throw codeErr;

    return { userId: uid, username: u, code: c, codeId: codeRow.id as string };
  }

  it('CLAIM-07 SESSION REVOCATION - claim revokes pre-existing unrevoked sessions', async () => {
    const legacy = await setupLegacyUser('revoke');

    // A pre-existing, unrevoked session for this user (simulates a still-live legacy session).
    const { data: sessionRow, error: sessionErr } = await sb().from('auth_sessions').insert({
      user_id: legacy.userId,
      expires_at: new Date(Date.now() + 86400000).toISOString()
    }).select().single();
    if (sessionErr) throw sessionErr;

    const res = await new Actor().call('/auth/claim', {
      username: legacy.username,
      code: legacy.code,
      new_password: 'Strong-New-Password-Revoke-1!'
    });
    expect(res.status).toBe(200);

    const { data: revoked } = await sb().from('auth_sessions')
      .select('revoked_at, revoked_reason').eq('id', sessionRow.id).single();
    expect(revoked?.revoked_at).not.toBeNull();
    expect(revoked?.revoked_reason).toBe('RECOVERY');
  });

  it('CLAIM-09 LEGACY PIN NOT ACCEPTED - no PIN-based auth path exists', async () => {
    const legacy = await setupLegacyUser('pin');

    const claimRes = await new Actor().call('/auth/claim', {
      username: legacy.username,
      code: legacy.code,
      new_password: 'Strong-New-Password-Pin-1!'
    });
    expect(claimRes.status).toBe(200);

    // A plausible legacy 4-digit PIN is not a valid password post-claim.
    const loginRes = await new Actor().call('/auth/login', {
      username: legacy.username,
      password: '1234'
    });
    expect(loginRes.status).toBe(401);
    expect(loginRes.json.error.code).toBe('INVALID_CREDENTIALS');

    // There is no legacy-PIN-only claim path: `code` is required by the request schema and
    // `pin` is not a recognized alternative, so omitting `code` fails before any auth logic runs.
    const noCodeRes = await new Actor().call('/auth/claim', {
      username: legacy.username,
      pin: '1234',
      new_password: 'Another-Strong-Password-1!'
    });
    expect(noCodeRes.status).toBe(401);
    expect(noCodeRes.json.error.code).toBe('INVALID_CLAIM');
  });

  it('CLAIM-10 RPC DENIED TO anon clients', async () => {
    const { data, error } = await anonDb().rpc('rpc_claim_legacy_account', {
      p_user_id: user_id, p_code_id: randomUUID(), p_new_hash: 'hash', p_ip: '127.0.0.1'
    });
    expect(data).toBeNull();
    expect(error).toBeDefined();
    const deniedByPrivilege = error?.code === '42501' || /permission denied/i.test(error?.message ?? '');
    expect(deniedByPrivilege).toBe(true);
  });

  it('CLAIM-11 TRANSACTIONALITY - a failed credential write rolls back code consumption', async () => {
    const legacy = await setupLegacyUser('tx');

    // Force the second write (user_credentials) to fail: password_hash is NOT NULL, so this
    // insert violates the constraint and the whole function must roll back atomically.
    const { error: rpcError } = await sb().rpc('rpc_claim_legacy_account', {
      p_user_id: legacy.userId, p_code_id: legacy.codeId, p_new_hash: null, p_ip: '127.0.0.1'
    });
    expect(rpcError).toBeDefined();

    // The claim code must still be unclaimed: step 1's update was rolled back with step 2's failure.
    const { data: afterCode } = await sb().from('legacy_claim_codes')
      .select('claimed_at').eq('id', legacy.codeId).single();
    expect(afterCode?.claimed_at).toBeNull();
  });

});
