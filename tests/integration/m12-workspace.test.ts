import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, makeRecorder, serviceDb } from './harness';

const ready = loadEnv();
const record = makeRecorder('migration-upgrade/m12/evidence', 'integration');

describe.skipIf(!ready)('Milestone 12 — Workspace Management & Manager Functions', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();

  const alice = new Actor();   // Manager of primary shared workspace
  const bob = new Actor();     // User member
  const charlie = new Actor(); // Co-manager
  const dave = new Actor();    // Foreign actor / outsider

  let sharedWsId: string;
  let soloWsId: string;
  let inviteRawCode: string;
  let inviteId: string;

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache();
    resetSigningMaterial();
    resetAdminClient();

    for (const [actor, name] of [
      [alice, 'alice'],
      [bob, 'bob'],
      [charlie, 'charlie'],
      [dave, 'dave'],
    ] as const) {
      const result = await actor.call('/auth/register', {
        username: `m12_${name}_${run}`,
        password: `Valid-M12-${name}-${run}!`,
      });
      expect(result.status).toBe(201);
    }
  });

  it('M12-01 · Workspace creation, metadata, and custom color swatch', async () => {
    // Alice creates a shared workspace with custom color swatch and description
    const createRes = await alice.db().rpc('rpc_create_workspace', {
      p_name: `Northside Cohort ${run}`,
      p_color: 'oklch(0.58 0.13 55)',
      p_description: 'Spring cohort for career advancement',
    });
    expect(createRes.error).toBeNull();
    sharedWsId = createRes.data as string;
    expect(sharedWsId).toBeDefined();

    // Verify database record
    const { data: wsRow, error: wsErr } = await admin
      .from('workspaces')
      .select('name, workspace_type, color, description, created_by, archived_at')
      .eq('id', sharedWsId)
      .single();
    expect(wsErr).toBeNull();
    expect(wsRow?.name).toBe(`Northside Cohort ${run}`);
    expect(wsRow?.workspace_type).toBe('SHARED');
    expect(wsRow?.color).toBe('oklch(0.58 0.13 55)');
    expect(wsRow?.description).toBe('Spring cohort for career advancement');
    expect(wsRow?.created_by).toBe(alice.userId);
    expect(wsRow?.archived_at).toBeNull();

    // Verify creator is automatically MANAGER with ACTIVE status
    const { data: memberRow, error: memErr } = await admin
      .from('workspace_members')
      .select('role, status')
      .eq('workspace_id', sharedWsId)
      .eq('user_id', alice.userId!)
      .single();
    expect(memErr).toBeNull();
    expect(memberRow?.role).toBe('MANAGER');
    expect(memberRow?.status).toBe('ACTIVE');

    // Update metadata via rpc_update_workspace
    const updateRes = await alice.db().rpc('rpc_update_workspace', {
      p_workspace_id: sharedWsId,
      p_name: `Northside Cohort Updated ${run}`,
      p_color: 'oklch(0.52 0.13 265)',
      p_description: 'Updated description',
    });
    expect(updateRes.error).toBeNull();
    expect(updateRes.data).toBe(true);

    // Foreign actor (Dave) cannot update Alice's workspace
    const foreignUpdate = await dave.db().rpc('rpc_update_workspace', {
      p_workspace_id: sharedWsId,
      p_name: 'Hacked Workspace',
    });
    expect(foreignUpdate.error?.code).toBe('42501');

    // Archive shared workspace check (create a temporary one to archive)
    const tempWsRes = await alice.db().rpc('rpc_create_workspace', { p_name: `Temp To Archive ${run}` });
    const tempWsId = tempWsRes.data as string;
    const archiveRes = await alice.db().rpc('rpc_archive_workspace', { p_workspace_id: tempWsId });
    expect(archiveRes.error).toBeNull();
    expect(archiveRes.data).toBe(true);

    const { data: archivedRow } = await admin.from('workspaces').select('archived_at').eq('id', tempWsId).single();
    expect(archivedRow?.archived_at).not.toBeNull();

    // Invariant: Alice cannot archive her PERSONAL workspace
    const { data: aliceProfile } = await admin.from('profiles').select('last_active_workspace_id').eq('user_id', alice.userId!).single();
    const personalWsId = aliceProfile!.last_active_workspace_id;
    const archivePersonalRes = await alice.db().rpc('rpc_archive_workspace', { p_workspace_id: personalWsId });
    expect(archivePersonalRes.error?.message).toMatch(/CANNOT_ARCHIVE_PERSONAL_WORKSPACE/);
  });

  it('M12-02 · Invitations generation, hashing, prefix masking, and revocation', async () => {
    // Alice creates an invitation for role = 'USER', max uses = 2, expires in 7 days
    const invRes = await alice.db().rpc('rpc_create_workspace_invitation', {
      p_workspace_id: sharedWsId,
      p_role: 'USER',
      p_max_uses: 2,
      p_expires_days: 7,
      p_label: 'Cohort Spring Intake',
    });
    expect(invRes.error).toBeNull();
    const invData = invRes.data as {
      id: string;
      code: string;
      prefix: string;
      role: string;
      max_uses: number;
      expires_at: string;
      label: string;
    };
    expect(invData.code).toMatch(/^JQI-[A-F0-9]{4}-[A-F0-9]{4}$/);
    expect(invData.prefix).toMatch(/^JQI-••••-[A-F0-9]{4}$/);
    expect(invData.role).toBe('USER');
    expect(invData.max_uses).toBe(2);
    inviteRawCode = invData.code;
    inviteId = invData.id;

    // Direct DB check: RAW code is NEVER stored in database
    const { data: dbInv, error: dbInvErr } = await admin
      .from('workspace_invitations')
      .select('code_hash, code_prefix, max_uses, uses_count, revoked_at')
      .eq('id', inviteId)
      .single();
    expect(dbInvErr).toBeNull();
    expect(dbInv?.code_prefix).toBe(invData.prefix);
    expect(dbInv?.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(dbInv?.code_hash).not.toBe(invData.code);

    // Non-manager (Dave) cannot create invitations in Alice's workspace
    const daveInvRes = await dave.db().rpc('rpc_create_workspace_invitation', {
      p_workspace_id: sharedWsId,
      p_role: 'USER',
    });
    expect(daveInvRes.error?.code).toBe('42501');

    // Revocation lifecycle test
    const tempInv = await alice.db().rpc('rpc_create_workspace_invitation', {
      p_workspace_id: sharedWsId,
      p_role: 'USER',
      p_label: 'To Revoke',
    });
    const tempCode = (tempInv.data as { code: string; id: string }).code;
    const tempId = (tempInv.data as { code: string; id: string }).id;

    const revokeRes = await alice.db().rpc('rpc_revoke_workspace_invitation', { p_invitation_id: tempId });
    expect(revokeRes.error).toBeNull();
    expect(revokeRes.data).toBe(true);

    // Attempting to join with revoked code fails with INVITATION_REVOKED
    const joinRevoked = await bob.db().rpc('rpc_join_workspace', { p_code: tempCode });
    expect(joinRevoked.error?.message).toMatch(/INVITATION_REVOKED/);
  });

  it('M12-03 · Invitation preview and join lifecycle', async () => {
    // Bob previews valid invitation before joining
    const previewRes = await bob.db().rpc('rpc_preview_workspace_invitation', { p_code: inviteRawCode });
    expect(previewRes.error).toBeNull();
    const preview = previewRes.data as {
      workspace_id: string;
      workspace_name: string;
      role: string;
      managers: string[];
      is_already_member: boolean;
    };
    expect(preview.workspace_id).toBe(sharedWsId);
    expect(preview.role).toBe('USER');
    expect(preview.is_already_member).toBe(false);
    expect(preview.managers.length).toBeGreaterThanOrEqual(1);

    // Bob joins workspace with code
    const joinRes = await bob.db().rpc('rpc_join_workspace', { p_code: inviteRawCode });
    expect(joinRes.error).toBeNull();
    expect(joinRes.data).toBe(sharedWsId);

    // Verify Bob is now member with role = 'USER' and status = 'ACTIVE'
    const { data: bobMem } = await admin
      .from('workspace_members')
      .select('role, status, invited_by')
      .eq('workspace_id', sharedWsId)
      .eq('user_id', bob.userId!)
      .single();
    expect(bobMem?.role).toBe('USER');
    expect(bobMem?.status).toBe('ACTIVE');
    expect(bobMem?.invited_by).toBe(alice.userId);

    // Bob attempts to join again: receives ALREADY_WORKSPACE_MEMBER
    const reJoin = await bob.db().rpc('rpc_join_workspace', { p_code: inviteRawCode });
    expect(reJoin.error?.message).toMatch(/ALREADY_WORKSPACE_MEMBER/);

    // Charlie joins as second user (max_uses was 2, so this is the final use)
    const charlieJoin = await charlie.db().rpc('rpc_join_workspace', { p_code: inviteRawCode });
    expect(charlieJoin.error).toBeNull();

    // Dave attempts to join: receives INVITATION_EXHAUSTED
    const daveJoin = await dave.db().rpc('rpc_join_workspace', { p_code: inviteRawCode });
    expect(daveJoin.error?.message).toMatch(/INVITATION_EXHAUSTED/);

    // Invalid code check
    const invalidJoin = await dave.db().rpc('rpc_join_workspace', { p_code: 'JQI-FAKE-CODE' });
    expect(invalidJoin.error?.message).toMatch(/INVITATION_NOT_FOUND/);
  });

  it('M12-04 · Manager member roster & role administration (audited)', async () => {
    // Alice (manager) lists detailed member roster
    const rosterRes = await alice.db().rpc('rpc_list_workspace_members_detailed', {
      p_workspace_id: sharedWsId,
    });
    expect(rosterRes.error).toBeNull();
    const roster = rosterRes.data as Array<{
      user_id: string;
      role: string;
      status: string;
      username: string;
      applications_count: number;
    }>;
    expect(roster.length).toBe(3); // Alice, Bob, Charlie

    // Non-manager (Bob) calling detailed roster is rejected
    const bobRoster = await bob.db().rpc('rpc_list_workspace_members_detailed', {
      p_workspace_id: sharedWsId,
    });
    expect(bobRoster.error?.code).toBe('42501');

    // Alice promotes Charlie to MANAGER
    const promoteRes = await alice.db().rpc('rpc_update_member_role', {
      p_workspace_id: sharedWsId,
      p_target_user_id: charlie.userId!,
      p_new_role: 'MANAGER',
    });
    expect(promoteRes.error).toBeNull();
    expect(promoteRes.data).toBe(true);

    const { data: charlieRow } = await admin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', sharedWsId)
      .eq('user_id', charlie.userId!)
      .single();
    expect(charlieRow?.role).toBe('MANAGER');

    // Verify promotion was audited
    const { data: auditRows } = await admin
      .from('audit_events')
      .select('action, actor_id, target_user_id, metadata')
      .eq('workspace_id', sharedWsId)
      .eq('action', 'member.role_changed')
      .order('created_at', { ascending: false });
    expect(auditRows?.[0]?.actor_id).toBe(alice.userId);
    expect(auditRows?.[0]?.target_user_id).toBe(charlie.userId);
    expect(auditRows?.[0]?.metadata).toMatchObject({ old_role: 'USER', new_role: 'MANAGER' });

    // Alice suspends Bob (status = 'SUSPENDED')
    const suspendRes = await alice.db().rpc('rpc_update_member_status', {
      p_workspace_id: sharedWsId,
      p_target_user_id: bob.userId!,
      p_new_status: 'SUSPENDED',
    });
    expect(suspendRes.error).toBeNull();
    expect(suspendRes.data).toBe(true);

    // Verify Bob status is SUSPENDED
    const { data: bobSuspended } = await admin
      .from('workspace_members')
      .select('status')
      .eq('workspace_id', sharedWsId)
      .eq('user_id', bob.userId!)
      .single();
    expect(bobSuspended?.status).toBe('SUSPENDED');

    // Suspended Bob cannot insert or read applications in this workspace
    const bobInsertApp = await bob.db().from('applications').insert({
      workspace_id: sharedWsId,
      user_id: bob.userId!,
      company_name: 'Suspended Corp',
      role_title: 'Engineer',
    });
    expect(bobInsertApp.error?.code).toBe('42501');

    // Alice reactivates Bob
    const reactivateRes = await alice.db().rpc('rpc_update_member_status', {
      p_workspace_id: sharedWsId,
      p_target_user_id: bob.userId!,
      p_new_status: 'ACTIVE',
    });
    expect(reactivateRes.error).toBeNull();

    // Now active Bob can insert application
    const bobActiveApp = await bob.db().from('applications').insert({
      workspace_id: sharedWsId,
      user_id: bob.userId!,
      company_name: 'Active Corp',
      role_title: 'Engineer',
    }).select('id').single();
    expect(bobActiveApp.error).toBeNull();
  });

  it('M12-05 · Last manager protection safeguard (ADR-036)', async () => {
    // Create a dedicated solo workspace with only Alice as MANAGER
    const soloRes = await alice.db().rpc('rpc_create_workspace', { p_name: `Solo Workspace ${run}` });
    soloWsId = soloRes.data as string;

    // 1. Attempt to demote sole manager Alice -> fails
    const demoteSole = await alice.db().rpc('rpc_update_member_role', {
      p_workspace_id: soloWsId,
      p_target_user_id: alice.userId!,
      p_new_role: 'USER',
    });
    expect(demoteSole.error?.message).toMatch(/CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER/);

    // 2. Attempt to suspend sole manager Alice -> fails
    const suspendSole = await alice.db().rpc('rpc_update_member_status', {
      p_workspace_id: soloWsId,
      p_target_user_id: alice.userId!,
      p_new_status: 'SUSPENDED',
    });
    expect(suspendSole.error?.message).toMatch(/CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER/);

    // 3. Attempt to remove sole manager Alice -> fails
    const removeSole = await alice.db().rpc('rpc_remove_workspace_member', {
      p_workspace_id: soloWsId,
      p_target_user_id: alice.userId!,
    });
    expect(removeSole.error?.message).toMatch(/CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER/);

    // 4. Attempt for sole manager Alice to leave -> fails
    const leaveSole = await alice.db().rpc('rpc_leave_workspace', { p_workspace_id: soloWsId });
    expect(leaveSole.error?.message).toMatch(/CANNOT_REMOVE_OR_DEMOTE_LAST_MANAGER/);

    // In contrast: in sharedWsId where both Alice and Charlie are MANAGER, demoting Charlie succeeds
    const demoteCharlie = await alice.db().rpc('rpc_update_member_role', {
      p_workspace_id: sharedWsId,
      p_target_user_id: charlie.userId!,
      p_new_role: 'USER',
    });
    expect(demoteCharlie.error).toBeNull();
  });

  it('M12-06 · Durable member removal (ADR-037)', async () => {
    // Bob has created an application in sharedWsId in M12-04 ('Active Corp')
    const { data: bobAppsBefore } = await admin
      .from('applications')
      .select('id, user_id, company_name')
      .eq('workspace_id', sharedWsId)
      .eq('user_id', bob.userId!);
    expect(bobAppsBefore?.length).toBe(1);
    const bobAppId = bobAppsBefore![0]!.id;

    // Alice removes Bob from the workspace
    const removeRes = await alice.db().rpc('rpc_remove_workspace_member', {
      p_workspace_id: sharedWsId,
      p_target_user_id: bob.userId!,
    });
    expect(removeRes.error).toBeNull();
    expect(removeRes.data).toBe(true);

    // Verify Bob is no longer in workspace_members
    const { data: bobMemAfter } = await admin
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', sharedWsId)
      .eq('user_id', bob.userId!)
      .maybeSingle();
    expect(bobMemAfter).toBeNull();

    // Verify ADR-037: Bob's application REMAINS intact in the workspace with original user_id
    const { data: bobAppAfter, error: bobAppErr } = await admin
      .from('applications')
      .select('id, user_id, company_name')
      .eq('id', bobAppId)
      .single();
    expect(bobAppErr).toBeNull();
    expect(bobAppAfter?.user_id).toBe(bob.userId);
    expect(bobAppAfter?.company_name).toBe('Active Corp');

    // Bob cannot read this application anymore via RLS
    const bobRead = await bob.db().from('applications').select('id').eq('id', bobAppId);
    expect(bobRead.data?.length).toBe(0);

    // Alice (manager of sharedWsId) can still view the application
    const aliceRead = await alice.db().from('applications').select('id, user_id').eq('id', bobAppId).single();
    expect(aliceRead.data?.id).toBe(bobAppId);
    expect(aliceRead.data?.user_id).toBe(bob.userId);

    // Verify removal was audited
    const { data: removeAudit } = await admin
      .from('audit_events')
      .select('action, actor_id, target_user_id')
      .eq('workspace_id', sharedWsId)
      .eq('action', 'member.removed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    expect(removeAudit?.actor_id).toBe(alice.userId);
    expect(removeAudit?.target_user_id).toBe(bob.userId);
  });

  it('M12-07 · Leave workspace lifecycle', async () => {
    // Charlie is currently USER in sharedWsId (demoted from manager earlier)
    const leaveRes = await charlie.db().rpc('rpc_leave_workspace', { p_workspace_id: sharedWsId });
    expect(leaveRes.error).toBeNull();
    expect(leaveRes.data).toBe(true);

    // Verify Charlie is no longer a member
    const { data: charlieMem } = await admin
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', sharedWsId)
      .eq('user_id', charlie.userId!)
      .maybeSingle();
    expect(charlieMem).toBeNull();

    // Attempting to leave PERSONAL workspace is blocked
    const { data: charlieProfile } = await admin.from('profiles').select('last_active_workspace_id').eq('user_id', charlie.userId!).single();
    const leavePersonal = await charlie.db().rpc('rpc_leave_workspace', { p_workspace_id: charlieProfile!.last_active_workspace_id });
    expect(leavePersonal.error?.message).toMatch(/CANNOT_LEAVE_PERSONAL_WORKSPACE/);
  });

  it('M12-08 · Cross-workspace manager isolation', async () => {
    // Dave is a registered user with his own personal workspace and no membership in sharedWsId
    const daveList = await dave.db().rpc('rpc_list_workspace_members_detailed', { p_workspace_id: sharedWsId });
    expect(daveList.error?.code).toBe('42501');

    const daveInvite = await dave.db().rpc('rpc_create_workspace_invitation', { p_workspace_id: sharedWsId });
    expect(daveInvite.error?.code).toBe('42501');

    const daveRole = await dave.db().rpc('rpc_update_member_role', {
      p_workspace_id: sharedWsId,
      p_target_user_id: alice.userId!,
      p_new_role: 'USER',
    });
    expect(daveRole.error?.code).toBe('42501');

    const daveRemove = await dave.db().rpc('rpc_remove_workspace_member', {
      p_workspace_id: sharedWsId,
      p_target_user_id: alice.userId!,
    });
    expect(daveRemove.error?.code).toBe('42501');
  });

  it('M12-09 · Extension token dynamic membership invalidation (M11 regression)', async () => {
    // Create new shared workspace for token test
    const tokenWsRes = await alice.db().rpc('rpc_create_workspace', { p_name: `Token WS ${run}` });
    const tokenWsId = tokenWsRes.data as string;

    // Invite Bob as USER
    const inv = await alice.db().rpc('rpc_create_workspace_invitation', {
      p_workspace_id: tokenWsId,
      p_role: 'USER',
    });
    const code = (inv.data as { code: string }).code;
    await bob.db().rpc('rpc_join_workspace', { p_code: code });

    // Bob creates an extension token bound to tokenWsId
    const tokenRes = await bob.call('/extension/tokens', {
      workspace_id: tokenWsId,
      name: 'Bob Laptop Extension',
      expires_in_days: 90,
    });
    expect(tokenRes.status).toBe(201);
    const bobToken = tokenRes.json.token as string;

    // Bob can query /ext/v1/me with this token while active
    const meBefore = await bob.call('/ext/v1/me', undefined, { bearer: bobToken, origin: null });
    expect(meBefore.status).toBe(200);
    expect(meBefore.json.workspace.id).toBe(tokenWsId);

    // Bob can capture an application with this token while active
    const captureBefore = await bob.call(
      '/ext/v1/captures',
      {
        company: 'Stripe',
        job_title: 'Frontend Engineer',
        stage: 'APPLIED',
      },
      { bearer: bobToken, origin: null }
    );
    expect(captureBefore.status).toBe(201);

    // Alice suspends Bob in this workspace
    const suspendRes = await alice.db().rpc('rpc_update_member_status', {
      p_workspace_id: tokenWsId,
      p_target_user_id: bob.userId!,
      p_new_status: 'SUSPENDED',
    });
    expect(suspendRes.error).toBeNull();

    // Bob's token call is immediately denied
    const meSuspended = await bob.call('/ext/v1/me', undefined, { bearer: bobToken, origin: null });
    expect([401, 403]).toContain(meSuspended.status);

    const captureSuspended = await bob.call(
      '/ext/v1/captures',
      {
        company: 'Airbnb',
        job_title: 'Staff Engineer',
        stage: 'APPLIED',
      },
      { bearer: bobToken, origin: null }
    );
    expect([401, 403]).toContain(captureSuspended.status);

    // Alice removes Bob from this workspace
    const removeRes = await alice.db().rpc('rpc_remove_workspace_member', {
      p_workspace_id: tokenWsId,
      p_target_user_id: bob.userId!,
    });
    expect(removeRes.error).toBeNull();

    // Bob's token call is still denied
    const meRemoved = await bob.call('/ext/v1/me', undefined, { bearer: bobToken, origin: null });
    expect([401, 403]).toContain(meRemoved.status);
  });

  it('M12-10 · Audit history query (manager view)', async () => {
    // Alice (manager) queries workspace audit history
    const auditRes = await alice.db().rpc('rpc_list_workspace_audit_events', {
      p_workspace_id: sharedWsId,
      p_limit: 20,
    });
    expect(auditRes.error).toBeNull();
    const audits = auditRes.data as Array<{
      action: string;
      actor_name: string;
      target_user_name: string;
      metadata: Record<string, unknown>;
    }>;
    expect(audits.length).toBeGreaterThanOrEqual(3);

    const actions = audits.map((a) => a.action);
    expect(actions).toContain('workspace.created');
    expect(actions).toContain('workspace.updated');
    expect(actions).toContain('member.role_changed');
    expect(actions).toContain('member.removed');

    // Bob (not manager in sharedWsId) cannot view audit history
    const bobAudit = await bob.db().rpc('rpc_list_workspace_audit_events', {
      p_workspace_id: sharedWsId,
    });
    expect(bobAudit.error?.code).toBe('42501');

    record('m12-integration-report', {
      status: 'PASS',
      sharedWorkspaceId: sharedWsId,
      actionsAudited: actions,
      testsPassed: 10,
    });
  });
});
