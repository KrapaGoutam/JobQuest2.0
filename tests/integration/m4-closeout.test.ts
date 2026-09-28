/**
 * M4 closeout integrity suite (migration 20260925100000), real Supabase stack, Option B tokens.
 *  - Archive-first: direct hard DELETE of contacts / companies is denied for USER and MANAGER.
 *  - Archive state changes only through rpc_archive_contact / rpc_restore_contact.
 *  - contact_interactions are append-only and written only by rpc_log_contact_interaction.
 *  - Composite tenant FKs: a record can never reference another workspace's company.
 *  - Contact ownership / workspace are immutable for direct clients.
 *  - rpc_unlink_application_contact requires access to the application (peer denied).
 *  - Cross-user (MANAGER) mutations write audit_events atomically; owner self-edits do not.
 *  - audit_events is SYSTEM/SECURITY: no client read/write, append-only even for service_role.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, serviceDb, anonDb, makeRecorder } from './harness';

const record = makeRecorder('migration-upgrade/m4/evidence', 'closeout');
const ready = loadEnv();

describe.skipIf(!ready)('Milestone 4 closeout — archive-first, append-only, tenant FKs, manager audit', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();

  let alice: Actor;
  let bob: Actor;
  let charlie: Actor; // MANAGER of the shared workspace
  let dave: Actor; // MANAGER of a foreign workspace

  let sharedWsId: string;
  let foreignWsId: string;
  let aliceAppId: string;
  let aliceContactId: string;
  let foreignCompanyId: string;

  const pw = (tag: string) => `Valid-M4C-Pass-${run}-${tag}!`;

  const auditFor = async (entityId: string) => {
    const { data, error } = await admin.from('audit_events').select('*').eq('target_entity_id', entityId).order('created_at');
    expect(error).toBeNull();
    return data as { actor_id: string; target_user_id: string; target_entity_type: string; action: string; metadata: Record<string, unknown>; workspace_id: string }[];
  };

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();

    alice = new Actor(); bob = new Actor(); charlie = new Actor(); dave = new Actor();
    for (const [a, tag] of [[alice, 'alice'], [bob, 'bob'], [charlie, 'charlie'], [dave, 'dave']] as const) {
      const r = await a.call('/auth/register', { username: `m4c_${tag}_${run}`, password: pw(tag) });
      expect(r.status).toBe(201);
    }

    const ws = await charlie.db().rpc('rpc_create_workspace', { p_name: `M4C Shared ${run}` });
    expect(ws.error).toBeNull();
    sharedWsId = ws.data as string;
    const mem = await admin.from('workspace_members').insert([
      { workspace_id: sharedWsId, user_id: alice.userId!, role: 'USER' },
      { workspace_id: sharedWsId, user_id: bob.userId!, role: 'USER' },
    ]);
    expect(mem.error).toBeNull();

    const fws = await dave.db().rpc('rpc_create_workspace', { p_name: `M4C Foreign ${run}` });
    expect(fws.error).toBeNull();
    foreignWsId = fws.data as string;
    const fc = await dave.db().from('companies').insert({ workspace_id: foreignWsId, name: `Foreign Co ${run}` }).select().single();
    expect(fc.error).toBeNull();
    foreignCompanyId = fc.data.id;

    const app = await alice.db().from('applications').insert({
      workspace_id: sharedWsId, user_id: alice.userId!, company_name: 'Closeout Corp', role_title: 'Engineer', stage: 'APPLIED', status: 'OPEN',
    }).select().single();
    expect(app.error).toBeNull();
    aliceAppId = app.data.id;

    const c = await alice.db().rpc('rpc_create_contact', { p_workspace_id: sharedWsId, p_full_name: 'Closeout Contact', p_company_name: `Shared Co ${run}` });
    expect(c.error).toBeNull();
    aliceContactId = c.data.id;
  });

  it('M4C-01 · USER direct hard DELETE of own contact is denied (42501); the row survives', async () => {
    const del = await alice.db().from('contacts').delete().eq('id', aliceContactId).select();
    expect(del.error?.code).toBe('42501');
    const mgrDel = await charlie.db().from('contacts').delete().eq('id', aliceContactId).select();
    expect(mgrDel.error?.code).toBe('42501');
    const still = await alice.db().from('contacts').select('id').eq('id', aliceContactId).single();
    expect(still.data?.id).toBe(aliceContactId);
    record('m4c-01-hard-delete-denied', { userDelete: del.error?.code, managerDelete: mgrDel.error?.code, rowSurvives: true });
  });

  it('M4C-02 · archive state changes only via RPC; archive/restore RPCs work', async () => {
    const direct = await alice.db().from('contacts').update({ archived_at: new Date().toISOString() }).eq('id', aliceContactId).select();
    expect(direct.error?.code).toBe('42501');
    expect(direct.error?.message).toMatch(/ARCHIVE_REQUIRES_RPC/);

    const insArchived = await alice.db().from('contacts').insert({
      workspace_id: sharedWsId, user_id: alice.userId!, full_name: 'Pre-archived', archived_at: new Date().toISOString(),
    }).select();
    expect(insArchived.error?.code).toBe('42501');

    const arc = await alice.db().rpc('rpc_archive_contact', { p_contact_id: aliceContactId });
    expect(arc.error).toBeNull();
    const archived = await alice.db().from('contacts').select('archived_at').eq('id', aliceContactId).single();
    expect(archived.data?.archived_at).toBeTruthy();
    const res = await alice.db().rpc('rpc_restore_contact', { p_contact_id: aliceContactId });
    expect(res.error).toBeNull();
    const restored = await alice.db().from('contacts').select('archived_at').eq('id', aliceContactId).single();
    expect(restored.data?.archived_at).toBeNull();

    // Ordinary edits still work directly (hybrid boundary: simple fields via Data API).
    const edit = await alice.db().from('contacts').update({ notes: 'plain edit' }).eq('id', aliceContactId).select('notes').single();
    expect(edit.error).toBeNull();
    expect(edit.data?.notes).toBe('plain edit');
    record('m4c-02-archive-via-rpc-only', { directArchive: direct.error?.code, insertArchived: insArchived.error?.code, rpcArchiveRestore: 'OK', plainEdit: 'OK' });
  });

  it('M4C-03 · contact interactions are append-only and RPC-written', async () => {
    const id = await alice.db().rpc('rpc_log_contact_interaction', { p_contact_id: aliceContactId, p_interaction_type: 'EMAIL', p_notes: 'Intro email' });
    expect(id.error).toBeNull();

    const ins = await alice.db().from('contact_interactions').insert({
      contact_id: aliceContactId, workspace_id: sharedWsId, user_id: alice.userId!, interaction_type: 'NOTE', notes: 'direct',
    });
    expect(ins.error?.code).toBe('42501');
    const upd = await alice.db().from('contact_interactions').update({ notes: 'rewritten history' }).eq('id', id.data as string).select();
    expect(upd.error?.code).toBe('42501');
    const del = await alice.db().from('contact_interactions').delete().eq('id', id.data as string).select();
    expect(del.error?.code).toBe('42501');

    // Peer cannot append to another member's contact through the RPC either.
    const peer = await bob.db().rpc('rpc_log_contact_interaction', { p_contact_id: aliceContactId, p_interaction_type: 'NOTE', p_notes: 'peer note' });
    expect(peer.error?.code).toBe('42501');

    const after = await admin.from('contact_interactions').select('notes').eq('id', id.data as string).single();
    expect(after.data?.notes).toBe('Intro email');
    record('m4c-03-interactions-append-only', { directInsert: ins.error?.code, update: upd.error?.code, delete: del.error?.code, peerRpc: peer.error?.code });
  });

  it('M4C-04 · companies cannot be hard-deleted by USER or MANAGER', async () => {
    const co = await alice.db().from('companies').select('id').eq('workspace_id', sharedWsId).eq('name', `Shared Co ${run}`).single();
    expect(co.error).toBeNull();
    const u = await alice.db().from('companies').delete().eq('id', co.data!.id).select();
    expect(u.error?.code).toBe('42501');
    const m = await charlie.db().from('companies').delete().eq('id', co.data!.id).select();
    expect(m.error?.code).toBe('42501');
    const mv = await charlie.db().from('companies').update({ workspace_id: foreignWsId }).eq('id', co.data!.id).select();
    expect(mv.error?.code).toBe('42501');
    record('m4c-04-company-delete-denied', { userDelete: u.error?.code, managerDelete: m.error?.code, moveWorkspace: mv.error?.code });
  });

  it('M4C-05 · composite tenant FKs reject cross-workspace company references (23503)', async () => {
    // Even the service role cannot create the inconsistency.
    const c = await admin.from('contacts').insert({
      workspace_id: sharedWsId, user_id: alice.userId!, full_name: 'Cross-ws', company_id: foreignCompanyId,
    });
    expect(c.error?.code).toBe('23503');
    const a = await alice.db().from('applications').update({ company_id: foreignCompanyId }).eq('id', aliceAppId).select();
    expect(a.error?.code).toBe('23503');
    const k = await alice.db().from('contacts').update({ company_id: foreignCompanyId }).eq('id', aliceContactId).select();
    expect(k.error?.code).toBe('23503');

    // ON DELETE SET NULL (company_id) keeps workspace_id intact when a company is removed server-side.
    const tmp = await admin.from('companies').insert({ workspace_id: sharedWsId, name: `Temp Co ${run}` }).select().single();
    expect(tmp.error).toBeNull();
    const link = await admin.from('contacts').update({ company_id: tmp.data.id }).eq('id', aliceContactId);
    expect(link.error).toBeNull();
    const rm = await admin.from('companies').delete().eq('id', tmp.data.id);
    expect(rm.error).toBeNull();
    const after = await admin.from('contacts').select('company_id, workspace_id').eq('id', aliceContactId).single();
    expect(after.data).toEqual({ company_id: null, workspace_id: sharedWsId });
    record('m4c-05-composite-company-fk', { serviceInsert: c.error?.code, appUpdate: a.error?.code, contactUpdate: k.error?.code, onDeleteSetNullKeepsWorkspace: true });
  });

  it('M4C-06 · peer cannot unlink another member application contact; manager can', async () => {
    const link = await alice.db().rpc('rpc_link_application_contact', { p_application_id: aliceAppId, p_contact_id: aliceContactId, p_role_in_process: 'RECRUITER' });
    expect(link.error).toBeNull();
    const peer = await bob.db().rpc('rpc_unlink_application_contact', { p_application_id: aliceAppId, p_contact_id: aliceContactId });
    expect(peer.error?.code).toBe('42501');
    const stillLinked = await admin.from('application_contacts').select('contact_id').eq('application_id', aliceAppId).eq('contact_id', aliceContactId);
    expect(stillLinked.data).toHaveLength(1);
    const foreign = await dave.db().rpc('rpc_unlink_application_contact', { p_application_id: aliceAppId, p_contact_id: aliceContactId });
    expect(foreign.error?.code).toBe('42501');

    const mgr = await charlie.db().rpc('rpc_unlink_application_contact', { p_application_id: aliceAppId, p_contact_id: aliceContactId });
    expect(mgr.error).toBeNull();
    expect(mgr.data).toBe(true);
    const audit = await auditFor(aliceAppId);
    expect(audit.some((e) => e.action === 'LINK_REMOVED' && e.actor_id === charlie.userId && e.target_user_id === alice.userId)).toBe(true);
    record('m4c-06-unlink-authorization', { peer: peer.error?.code, foreign: foreign.error?.code, manager: 'OK', audited: true });
  });

  it('M4C-07 · contact owner and workspace cannot be reassigned by direct writes', async () => {
    const own = await alice.db().from('contacts').update({ user_id: bob.userId! }).eq('id', aliceContactId).select();
    expect(own.error?.code).toBe('42501');
    const mgr = await charlie.db().from('contacts').update({ user_id: bob.userId! }).eq('id', aliceContactId).select();
    expect(mgr.error?.code).toBe('42501');
    expect(mgr.error?.message).toMatch(/CONTACT_OWNERSHIP_IMMUTABLE/);
    const wsMove = await charlie.db().from('contacts').update({ workspace_id: foreignWsId }).eq('id', aliceContactId).select();
    expect(wsMove.error?.code).toBe('42501');
    const owner = await admin.from('contacts').select('user_id, workspace_id').eq('id', aliceContactId).single();
    expect(owner.data).toEqual({ user_id: alice.userId, workspace_id: sharedWsId });
    record('m4c-07-ownership-immutable', { ownerReassign: own.error?.code, managerReassign: mgr.error?.code, workspaceMove: wsMove.error?.code });
  });

  it('M4C-08 · MANAGER cross-user mutations are audited atomically; owner self-edits are not', async () => {
    const before = await auditFor(aliceContactId);

    // Owner self-edit: no audit row.
    const self = await alice.db().from('contacts').update({ job_title: 'Self edit' }).eq('id', aliceContactId);
    expect(self.error).toBeNull();
    expect(await auditFor(aliceContactId)).toHaveLength(before.length);

    // Manager edit, archive, restore of Alice's contact.
    const upd = await charlie.db().from('contacts').update({ notes: 'Manager review' }).eq('id', aliceContactId);
    expect(upd.error).toBeNull();
    expect((await charlie.db().rpc('rpc_archive_contact', { p_contact_id: aliceContactId })).error).toBeNull();
    expect((await charlie.db().rpc('rpc_restore_contact', { p_contact_id: aliceContactId })).error).toBeNull();
    const contactAudit = (await auditFor(aliceContactId)).slice(before.length);
    expect(contactAudit.map((e) => e.action)).toEqual(['RECORD_UPDATED', 'RECORD_ARCHIVED', 'RECORD_RESTORED']);
    for (const e of contactAudit) {
      expect(e).toMatchObject({ actor_id: charlie.userId, target_user_id: alice.userId, target_entity_type: 'CONTACT', workspace_id: sharedWsId });
    }
    expect(contactAudit[0]!.metadata.changed_columns).toEqual(['notes']);
    // Audit payload carries column names, never the edited values.
    expect(JSON.stringify(contactAudit)).not.toContain('Manager review');

    // Manager stage move on Alice's application (via the workflow RPC).
    const mv = await charlie.db().rpc('rpc_move_application_stage', { p_application_id: aliceAppId, p_new_stage: 'INTERVIEW' });
    expect(mv.error).toBeNull();
    const appAudit = await auditFor(aliceAppId);
    const stage = appAudit.find((e) => e.action === 'RECORD_UPDATED' && e.metadata.to_stage === 'INTERVIEW');
    expect(stage).toMatchObject({ actor_id: charlie.userId, target_user_id: alice.userId, target_entity_type: 'APPLICATION' });
    expect(stage!.metadata.from_stage).toBe('APPLIED');

    // Manager-logged interaction on Alice's contact: audited, and visible to Alice.
    const li = await charlie.db().rpc('rpc_log_contact_interaction', { p_contact_id: aliceContactId, p_interaction_type: 'CALL', p_notes: 'Manager check-in' });
    expect(li.error).toBeNull();
    const liAudit = await auditFor(li.data as string);
    expect(liAudit).toHaveLength(1);
    expect(liAudit[0]).toMatchObject({ action: 'RECORD_CREATED', target_entity_type: 'CONTACT_INTERACTION', actor_id: charlie.userId, target_user_id: alice.userId });
    const aliceSees = await alice.db().from('contact_interactions').select('id').eq('id', li.data as string);
    expect(aliceSees.data).toHaveLength(1);
    const bobSees = await bob.db().from('contact_interactions').select('id').eq('contact_id', aliceContactId);
    expect(bobSees.data).toHaveLength(0);

    // Owner's own stage move: no audit row.
    const selfMove = await alice.db().rpc('rpc_move_application_stage', { p_application_id: aliceAppId, p_new_stage: 'OFFER' });
    expect(selfMove.error).toBeNull();
    expect((await auditFor(aliceAppId)).some((e) => e.metadata.to_stage === 'OFFER')).toBe(false);

    record('m4c-08-manager-audit', {
      contactActions: contactAudit.map((e) => e.action),
      stageAudit: { from: stage!.metadata.from_stage, to: stage!.metadata.to_stage },
      interactionAudit: liAudit[0]!.action,
      ownerSelfEditsAudited: false,
      managerInteractionVisibleToOwner: true,
    });
  });

  it('M4C-09 · audit_events is not reachable by clients and is append-only', async () => {
    for (const actor of [alice, charlie]) {
      const sel = await actor.db().from('audit_events').select('id').limit(1);
      expect(sel.error?.code).toBe('42501');
      const ins = await actor.db().from('audit_events').insert({
        workspace_id: sharedWsId, actor_id: actor.userId!, target_entity_type: 'CONTACT', action: 'FORGED',
      });
      expect(ins.error?.code).toBe('42501');
    }
    const anon = await anonDb().from('audit_events').select('id').limit(1);
    expect(anon.error).toBeTruthy();

    const one = (await auditFor(aliceContactId))[0]!;
    expect(one).toBeTruthy();
    const svcUpd = await admin.from('audit_events').update({ action: 'TAMPERED' }).eq('target_entity_id', aliceContactId);
    expect(svcUpd.error?.message).toMatch(/AUDIT_EVENTS_APPEND_ONLY|permission denied/);
    const svcDel = await admin.from('audit_events').delete().eq('target_entity_id', aliceContactId);
    expect(svcDel.error?.message).toMatch(/AUDIT_EVENTS_APPEND_ONLY|permission denied/);
    record('m4c-09-audit-events-locked', { clientSelect: '42501', clientInsert: '42501', anon: 'denied', serviceUpdateDelete: 'denied' });
  });
});
