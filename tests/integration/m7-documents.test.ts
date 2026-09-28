/**
 * M7 · Documents & Resumes integration suite (real Supabase stack, Option B tokens).
 *  - Resumes RLS (own / peer / manager / foreign / anon).
 *  - Guarded deletion (blocked if used in active applications; archive permitted).
 *  - Cross-workspace tenant integrity: composite FKs reject cross-workspace application-resume links.
 *  - Version cloning (base_resume_id link, version increment) and default toggling.
 *  - Application document attachments.
 *  - Soft-archive and restore lifecycle.
 *  - Manager mutation audit.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, serviceDb, anonDb, makeRecorder } from './harness';

const record = makeRecorder('migration-upgrade/m7/evidence', 'integration');
const ready = loadEnv();

describe.skipIf(!ready)('Milestone 7 — Documents & Resumes', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();

  let alice: Actor; // USER
  let bob: Actor; // USER (peer in same workspace)
  let charlie: Actor; // MANAGER of shared workspace
  let dave: Actor; // MANAGER of foreign workspace

  let ws: string;
  let foreignWs: string;
  let aliceApp: string;
  let foreignApp: string;

  const pw = (t: string) => `Valid-M7-Pass-${run}-${t}!`;
  const audit = async (id: string) =>
    (await admin.from('audit_events').select('action, actor_id, target_user_id, target_entity_type').eq('target_entity_id', id)).data ?? [];

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
      const r = await a.call('/auth/register', { username: `m7_${t}_${run}`, password: pw(t) });
      expect(r.status).toBe(201);
    }

    // Charlie creates shared workspace (Charlie = MANAGER); Alice & Bob join as USER
    ws = (await charlie.db().rpc('rpc_create_workspace', { p_name: `M7 Shared ${run}` })).data as string;
    await admin.from('workspace_members').insert([
      { workspace_id: ws, user_id: alice.userId!, role: 'USER' },
      { workspace_id: ws, user_id: bob.userId!, role: 'USER' },
    ]);

    // Dave creates foreign workspace
    foreignWs = (await dave.db().rpc('rpc_create_workspace', { p_name: `M7 Foreign ${run}` })).data as string;

    // Create an application for Alice in shared workspace
    const appRes = await alice
      .db()
      .from('applications')
      .insert({
        workspace_id: ws,
        user_id: alice.userId!,
        company_name: 'Tech Corp',
        role_title: 'Product Designer',
        stage: 'APPLIED',
      })
      .select('id')
      .single();
    expect(appRes.error).toBeNull();
    aliceApp = appRes.data!.id;

    // Create an application for Dave in foreign workspace
    const fAppRes = await dave
      .db()
      .from('applications')
      .insert({
        workspace_id: foreignWs,
        user_id: dave.userId!,
        company_name: 'Foreign Corp',
        role_title: 'Engineer',
        stage: 'APPLIED',
      })
      .select('id')
      .single();
    expect(fAppRes.error).toBeNull();
    foreignApp = fAppRes.data!.id;
  });

  it('M7-01: Creates resume variants via direct insert and rpc_create_resume', async () => {
    // 1. Direct insert
    const directRes = await alice
      .db()
      .from('resumes')
      .insert({
        workspace_id: ws,
        user_id: alice.userId!,
        name: 'Product v1',
        document_type: 'RESUME',
        version_label: 'v1',
        target_role: 'Product Designer',
        category: 'Product Design',
        content_text: 'Summary of skills for v1',
        is_default: true,
      })
      .select('id, name, is_default')
      .single();

    expect(directRes.error).toBeNull();
    expect(directRes.data!.name).toBe('Product v1');
    expect(directRes.data!.is_default).toBe(true);

    // 2. RPC create with is_default=true (clears default on previous resume)
    const rpcRes = await alice.db().rpc('rpc_create_resume', {
      p_workspace_id: ws,
      p_name: 'Product v2',
      p_document_type: 'RESUME',
      p_version_label: 'v2',
      p_target_role: 'Senior Product Designer',
      p_category: 'Product Design',
      p_change_summary: 'Added lead experience',
      p_is_default: true,
    });

    expect(rpcRes.error).toBeNull();
    const v2Id = rpcRes.data.id;
    expect(v2Id).toBeDefined();

    // Verify v1 default was cleared and v2 is now default
    const v1Check = await alice.db().from('resumes').select('is_default').eq('id', directRes.data!.id).single();
    expect(v1Check.data!.is_default).toBe(false);

    const v2Check = await alice.db().from('resumes').select('is_default').eq('id', v2Id).single();
    expect(v2Check.data!.is_default).toBe(true);

    record('m7-01-create-resume', { v1Id: directRes.data!.id, v2Id });
  });

  it('M7-02: Enforces RLS peer read isolation in shared workspace', async () => {
    // Alice has resumes in ws. Bob is in ws too. Bob queries resumes.
    const bobRes = await bob.db().from('resumes').select('*').eq('workspace_id', ws);
    expect(bobRes.error).toBeNull();
    expect(bobRes.data?.length).toBe(0);

    record('m7-02-peer-isolation', { bobVisibleCount: bobRes.data?.length });
  });

  it('M7-03: Rejects peer mutation and deletion', async () => {
    // Bob tries to update Alice's resume
    const aliceResumes = await admin.from('resumes').select('id').eq('workspace_id', ws).eq('user_id', alice.userId!);
    expect(aliceResumes.data).toBeTruthy();
    const targetId = aliceResumes.data![0]!.id;

    const updateRes = await bob.db().from('resumes').update({ name: 'Hacked by Bob' }).eq('id', targetId);
    expect(updateRes.error).toBeNull(); // PostgREST returns empty update on 0 visible rows

    // Verify name untouched
    const check = await admin.from('resumes').select('name').eq('id', targetId).single();
    expect(check.data!.name).not.toBe('Hacked by Bob');

    // Bob tries to delete Alice's resume
    const deleteRes = await bob.db().from('resumes').delete().eq('id', targetId);
    expect(deleteRes.error).toBeNull();

    // Verify still exists
    const check2 = await admin.from('resumes').select('id').eq('id', targetId).single();
    expect(check2.data?.id).toBe(targetId);

    record('m7-03-peer-mutation-denied', { targetId, protected: true });
  });

  it('M7-04: Allows manager workspace access and audits manager mutations', async () => {
    // Charlie (MANAGER of ws) can read Alice's resumes
    const charlieRead = await charlie.db().from('resumes').select('*').eq('workspace_id', ws);
    expect(charlieRead.error).toBeNull();
    expect(charlieRead.data!.length).toBeGreaterThan(0);

    const targetId = charlieRead.data![0].id;

    // Charlie updates Alice's resume
    const charlieUpdate = await charlie
      .db()
      .from('resumes')
      .update({ target_role: 'Staff Product Designer' })
      .eq('id', targetId);
    expect(charlieUpdate.error).toBeNull();

    // Verify audit event recorded for manager modifying member's record
    const auditLogs = await audit(targetId);
    expect(auditLogs.length).toBeGreaterThan(0);
    const lastAudit = auditLogs[auditLogs.length - 1]!;
    expect(lastAudit.action).toBe('RECORD_UPDATED');
    expect(lastAudit.actor_id).toBe(charlie.userId);
    expect(lastAudit.target_user_id).toBe(alice.userId);
    expect(lastAudit.target_entity_type).toBe('RESUME');

    // Dave (manager of foreign workspace) cannot see resumes in ws
    const daveRead = await dave.db().from('resumes').select('*').eq('workspace_id', ws);
    expect(daveRead.error).toBeNull();
    expect(daveRead.data?.length).toBe(0);

    record('m7-04-manager-access-audit', { auditCount: auditLogs.length, foreignManagerBlocked: true });
  });

  it('M7-05: Rejects cross-workspace application-document linkage', async () => {
    // Alice tries to link her resume in ws to foreignApp (which belongs to foreignWs)
    const aliceRes = await admin.from('resumes').select('id').eq('workspace_id', ws).eq('user_id', alice.userId!).limit(1).single();
    const aliceResumeId = aliceRes.data!.id;

    // Foreign app cannot be accessed by Alice anyway, but let's test via direct insert with admin to check composite FK
    const crossFkRes = await admin.from('application_documents').insert({
      application_id: foreignApp,
      workspace_id: foreignWs,
      document_type: 'RESUME',
      resume_id: aliceResumeId, // Belongs to ws, not foreignWs!
    });

    expect(crossFkRes.error).not.toBeNull();
    expect(crossFkRes.error!.code).toBe('23503'); // Foreign key violation

    // Also test RPC rejection
    const rpcCross = await alice.db().rpc('rpc_link_application_document', {
      p_application_id: aliceApp,
      p_resume_id: aliceResumeId,
    });
    // This succeeds because both are in ws
    expect(rpcCross.error).toBeNull();

    record('m7-05-cross-workspace-integrity', { fkCode: crossFkRes.error!.code });
  });

  it('M7-06: Guarded deletion prevents deleting resumes in active use, allows archive', async () => {
    // Create a dedicated resume
    const newRes = await alice.db().rpc('rpc_create_resume', {
      p_workspace_id: ws,
      p_name: 'Guarded Resume v1',
    });
    const resumeId = newRes.data.id;

    // Link resume to Alice's application
    const linkRes = await alice.db().rpc('rpc_link_application_document', {
      p_application_id: aliceApp,
      p_resume_id: resumeId,
      p_document_type: 'RESUME',
    });
    expect(linkRes.error).toBeNull();
    const docId = linkRes.data.id;

    // Attempt to delete used resume: must be BLOCKED
    const delRes = await alice.db().rpc('rpc_delete_resume', {
      p_resume_id: resumeId,
    });
    expect(delRes.error).not.toBeNull();
    expect(delRes.error!.message).toContain('CANNOT_DELETE_USED_RESUME');

    // Soft-archive is permitted even when linked
    const archRes = await alice.db().rpc('rpc_archive_resume', {
      p_resume_id: resumeId,
    });
    expect(archRes.error).toBeNull();

    const archCheck = await alice.db().from('resumes').select('archived_at, is_active').eq('id', resumeId).single();
    expect(archCheck.data!.archived_at).not.toBeNull();
    expect(archCheck.data!.is_active).toBe(false);

    // Unlink the document
    const unlinkRes = await alice.db().rpc('rpc_unlink_application_document', {
      p_document_id: docId,
    });
    expect(unlinkRes.error).toBeNull();

    // Now delete succeeds because it is no longer used by applications
    const delRes2 = await alice.db().rpc('rpc_delete_resume', {
      p_resume_id: resumeId,
    });
    expect(delRes2.error).toBeNull();

    const finalCheck = await admin.from('resumes').select('id').eq('id', resumeId).maybeSingle();
    expect(finalCheck.data).toBeNull();

    record('m7-06-guarded-deletion', { guarded: true, archiveAllowed: true, deleteAfterUnlink: true });
  });

  it('M7-07: Clones resume into new version and toggles defaults atomically', async () => {
    // Base resume
    const base = await alice.db().rpc('rpc_create_resume', {
      p_workspace_id: ws,
      p_name: 'Engineering v1',
      p_document_type: 'RESUME',
      p_version_label: 'v1.0',
      p_target_role: 'Full Stack Engineer',
      p_category: 'Engineering',
      p_is_default: true,
    });
    const baseId = base.data.id;

    // Clone resume
    const cloned = await alice.db().rpc('rpc_clone_resume', {
      p_resume_id: baseId,
      p_new_name: '↳ Engineering v1.1 · cloud focus',
      p_new_version_label: 'v1.1',
      p_change_summary: 'Tailored with AWS/GCP architecture highlights',
    });
    expect(cloned.error).toBeNull();
    const cloneId = cloned.data.id;

    // Verify clone links to base
    const cloneRow = await alice.db().from('resumes').select('*').eq('id', cloneId).single();
    expect(cloneRow.data!.base_resume_id).toBe(baseId);
    expect(cloneRow.data!.version_label).toBe('v1.1');
    expect(cloneRow.data!.is_default).toBe(false);
    expect(cloneRow.data!.category).toBe('Engineering');

    // Switch default to cloned resume
    const defRes = await alice.db().rpc('rpc_set_default_resume', {
      p_resume_id: cloneId,
    });
    expect(defRes.error).toBeNull();

    const checkBase = await alice.db().from('resumes').select('is_default').eq('id', baseId).single();
    expect(checkBase.data!.is_default).toBe(false);

    const checkClone = await alice.db().from('resumes').select('is_default').eq('id', cloneId).single();
    expect(checkClone.data!.is_default).toBe(true);

    record('m7-07-clone-and-default', { baseId, cloneId, defaultSwitched: true });
  });

  it('M7-08: Creates cover letter variants and links multiple documents', async () => {
    const cl = await alice.db().rpc('rpc_create_resume', {
      p_workspace_id: ws,
      p_name: 'General Cover Letter',
      p_document_type: 'COVER_LETTER',
      p_version_label: 'v1',
      p_content_text: 'Dear Hiring Team, I am writing to express my strong interest...',
      p_is_default: true,
    });
    expect(cl.error).toBeNull();
    const clId = cl.data.id;

    // Link both resume and cover letter to aliceApp
    const linkCL = await alice.db().rpc('rpc_link_application_document', {
      p_application_id: aliceApp,
      p_resume_id: clId,
      p_document_type: 'COVER_LETTER',
      p_notes: 'Tailored for senior role',
    });
    expect(linkCL.error).toBeNull();

    // Query application documents
    const docs = await alice.db().from('application_documents').select('id, document_type, resume_id').eq('application_id', aliceApp);
    expect(docs.error).toBeNull();
    expect(docs.data!.length).toBeGreaterThan(0);

    record('m7-08-cover-letter-and-links', { clId, docsCount: docs.data!.length });
  });

  it('M7-09: Soft-archives and restores resumes', async () => {
    const res = await alice.db().rpc('rpc_create_resume', {
      p_workspace_id: ws,
      p_name: 'Temporary Resume',
    });
    const id = res.data.id;

    // Archive
    const arch = await alice.db().rpc('rpc_archive_resume', { p_resume_id: id });
    expect(arch.error).toBeNull();
    let row = await alice.db().from('resumes').select('archived_at, is_active').eq('id', id).single();
    expect(row.data!.archived_at).not.toBeNull();
    expect(row.data!.is_active).toBe(false);

    // Restore
    const rest = await alice.db().rpc('rpc_restore_resume', { p_resume_id: id });
    expect(rest.error).toBeNull();
    row = await alice.db().from('resumes').select('archived_at, is_active').eq('id', id).single();
    expect(row.data!.archived_at).toBeNull();
    expect(row.data!.is_active).toBe(true);

    record('m7-09-archive-restore', { id, archivedAndRestored: true });
  });

  it('M7-10: Denies all access and RPC execution to anonymous callers', async () => {
    const anon = anonDb();

    const t1 = await anon.from('resumes').select('*');
    expect(t1.error).not.toBeNull();
    expect(t1.error!.code).toBe('42501');

    const t2 = await anon.from('application_documents').select('*');
    expect(t2.error).not.toBeNull();
    expect(t2.error!.code).toBe('42501');

    const rpcCall = await anon.rpc('rpc_create_resume', {
      p_workspace_id: ws,
      p_name: 'Anon Resume',
    });
    expect(rpcCall.error).not.toBeNull();
    expect(rpcCall.error!.code).toBe('42501');

    record('m7-10-anon-denial', { tablesBlocked: true, rpcBlocked: true });
  });
});
