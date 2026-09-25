/**
 * M4 · Contacts & Networking integration suite (real Supabase stack, Option B tokens).
 * Tests:
 * - RLS isolation: USER own contacts (ALLOW), peer contacts (DENY / 0 rows),
 *   MANAGER same-workspace oversight (ALLOW), cross-workspace (DENY).
 * - Contact interactions: owner-scoped append and retrieval, peer denial, manager oversight.
 * - Application-contact linkage: many-to-many relationship, composite FK cross-workspace integrity.
 * - Companies registry: workspace-shared non-private reference data.
 * - Atomic domain RPCs: rpc_create_contact, rpc_log_contact_interaction,
 *   rpc_link_application_contact, rpc_unlink_application_contact, rpc_archive_contact, rpc_restore_contact.
 * - Anon denial: public and anon blocked from tables and RPCs.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, serviceDb, anonDb, makeRecorder } from './harness';

const record = makeRecorder('migration-upgrade/m4/evidence', 'integration');
const ready = loadEnv();

describe.skipIf(!ready)('Milestone 4 — Contacts & Networking Integration Suite', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();

  let alice: Actor;
  let bob: Actor;
  let managerCharlie: Actor;
  let foreignDave: Actor;

  let sharedWsId: string;
  let foreignWsId: string;

  let aliceAppId: string;
  let foreignAppId: string;

  let aliceContactId: string;
  let bobContactId: string;

  const pw = (tag: string) => `Valid-M4-Pass-${run}-${tag}!`;

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();

    alice = new Actor();
    bob = new Actor();
    managerCharlie = new Actor();
    foreignDave = new Actor();

    for (const [a, tag] of [[alice, 'alice'], [bob, 'bob'], [managerCharlie, 'charlie'], [foreignDave, 'dave']] as const) {
      const r = await a.call('/auth/register', { username: `m4_${tag}_${run}`, password: pw(tag) });
      expect(r.status).toBe(201);
      expect(a.userId).toBeTruthy();
    }

    // Charlie creates shared workspace (Charlie = MANAGER); Alice & Bob join as USER/MEMBER
    const { data: wsData, error: wsErr } = await managerCharlie.db().rpc('rpc_create_workspace', { p_name: `M4 Shared WS ${run}` });
    expect(wsErr).toBeNull();
    sharedWsId = wsData as string;

    await admin.from('workspace_members').insert([
      { workspace_id: sharedWsId, user_id: alice.userId!, role: 'USER' },
      { workspace_id: sharedWsId, user_id: bob.userId!, role: 'USER' },
    ]);

    // Dave creates foreign workspace (Dave = MANAGER)
    const { data: foreignWsData, error: fwsErr } = await foreignDave.db().rpc('rpc_create_workspace', { p_name: `M4 Foreign WS ${run}` });
    expect(fwsErr).toBeNull();
    foreignWsId = foreignWsData as string;

    // Alice creates an application in shared workspace
    const { data: appData, error: appErr } = await alice.db().from('applications').insert({
      workspace_id: sharedWsId,
      user_id: alice.userId!,
      company_name: 'Acme Corp',
      role_title: 'Senior Engineer',
      stage: 'APPLIED',
      status: 'OPEN',
    }).select().single();
    expect(appErr).toBeNull();
    aliceAppId = appData.id;

    // Dave creates an application in foreign workspace
    const { data: fAppData, error: fAppErr } = await foreignDave.db().from('applications').insert({
      workspace_id: foreignWsId,
      user_id: foreignDave.userId!,
      company_name: 'Foreign Co',
      role_title: 'Staff Architect',
      stage: 'APPLIED',
      status: 'OPEN',
    }).select().single();
    expect(fAppErr).toBeNull();
    foreignAppId = fAppData.id;
  });

  it('M4-01 · USER creates a contact via direct PostgREST and via rpc_create_contact', async () => {
    // 1. Direct PostgREST insert
    const { data: c1, error: err1 } = await alice.db().from('contacts').insert({
      workspace_id: sharedWsId,
      user_id: alice.userId!,
      full_name: 'Sarah Connor',
      job_title: 'Director of Talent',
      relationship_type: 'RECRUITER',
      email: 'sarah@acme.example',
      company_name: 'Acme Corp',
      next_follow_up_date: '2026-10-15',
    }).select().single();
    expect(err1).toBeNull();
    expect(c1.id).toBeTruthy();
    expect(c1.full_name).toBe('Sarah Connor');
    aliceContactId = c1.id;

    // 2. Atomic RPC creation with company upsert and application link
    const { data: c2, error: err2 } = await alice.db().rpc('rpc_create_contact', {
      p_workspace_id: sharedWsId,
      p_full_name: 'John Doe',
      p_company_name: 'Acme Corp',
      p_job_title: 'Engineering Manager',
      p_relationship_type: 'HIRING_MANAGER',
      p_email: 'john.doe@acme.example',
      p_application_id: aliceAppId,
      p_role_in_process: 'HIRING_MANAGER',
    });
    expect(err2).toBeNull();
    expect(c2).toBeTruthy();
    expect(c2.full_name).toBe('John Doe');
    expect(c2.company_id).toBeTruthy();

    record('m4-01-create-contact', { directContactId: c1.id, rpcContactId: c2.id });
  });

  it('M4-02 · RLS: USER can read own contacts, PEER cannot read other member contacts', async () => {
    // Bob creates a contact in shared workspace
    const { data: bobContact, error: bErr } = await bob.db().from('contacts').insert({
      workspace_id: sharedWsId,
      user_id: bob.userId!,
      full_name: 'Bob Confidential Recruiter',
      relationship_type: 'RECRUITER',
    }).select().single();
    expect(bErr).toBeNull();
    bobContactId = bobContact.id;

    // Alice reads contacts: should see her contacts, MUST NOT see Bob's contact
    const { data: aliceList, error: aListErr } = await alice.db().from('contacts').select('*').eq('workspace_id', sharedWsId);
    expect(aListErr).toBeNull();
    const aliceContactIds = aliceList!.map((c: { id: string }) => c.id);
    expect(aliceContactIds).toContain(aliceContactId);
    expect(aliceContactIds).not.toContain(bobContactId);

    // Bob reads contacts: should see his contact, MUST NOT see Alice's contact
    const { data: bobList, error: bListErr } = await bob.db().from('contacts').select('*').eq('workspace_id', sharedWsId);
    expect(bListErr).toBeNull();
    const bobContactIds = bobList!.map((c: { id: string }) => c.id);
    expect(bobContactIds).toContain(bobContactId);
    expect(bobContactIds).not.toContain(aliceContactId);

    // Direct fetch of peer contact by ID returns 0 rows (empty/PGRST116)
    const { data: peerProbe, error: pErr } = await alice.db().from('contacts').select('*').eq('id', bobContactId).maybeSingle();
    expect(pErr).toBeNull();
    expect(peerProbe).toBeNull();

    record('m4-02-rls-peer-isolation', { aliceCount: aliceList!.length, bobCount: bobList!.length });
  });

  it('M4-03 · RLS: PEER cannot update or delete other member contact', async () => {
    // Alice attempts to update Bob's contact
    const { data: updData, error: updErr } = await alice.db()
      .from('contacts')
      .update({ full_name: 'Hacked by Alice' })
      .eq('id', bobContactId)
      .select();
    expect(updErr).toBeNull();
    expect(updData).toHaveLength(0); // 0 rows updated

    // Alice attempts to delete Bob's contact
    const { data: delData, error: delErr } = await alice.db()
      .from('contacts')
      .delete()
      .eq('id', bobContactId)
      .select();
    expect(delErr).toBeNull();
    expect(delData).toHaveLength(0);

    // Verify Bob's contact is unchanged
    const { data: checkBob } = await bob.db().from('contacts').select('*').eq('id', bobContactId).single();
    expect(checkBob.full_name).toBe('Bob Confidential Recruiter');

    record('m4-03-peer-mutation-denied', { updatedRows: updData?.length, deletedRows: delData?.length });
  });

  it('M4-04 · RLS: MANAGER can read and manage all contacts in their workspace, but DENIED in foreign workspace', async () => {
    // Charlie is MANAGER in sharedWsId: should see both Alice's and Bob's contacts
    const { data: charlieList, error: cErr } = await managerCharlie.db().from('contacts').select('*').eq('workspace_id', sharedWsId);
    expect(cErr).toBeNull();
    const charlieContactIds = charlieList!.map((c: { id: string }) => c.id);
    expect(charlieContactIds).toContain(aliceContactId);
    expect(charlieContactIds).toContain(bobContactId);

    // Charlie can update Alice's contact (manager oversight)
    const { error: mgrUpdErr } = await managerCharlie.db()
      .from('contacts')
      .update({ notes: 'Reviewed by manager Charlie' })
      .eq('id', aliceContactId);
    expect(mgrUpdErr).toBeNull();

    // Charlie attempts to query foreign workspace contacts: DENIED / 0 rows
    const { data: foreignList, error: fErr } = await managerCharlie.db().from('contacts').select('*').eq('workspace_id', foreignWsId);
    expect(fErr).toBeNull();
    expect(foreignList).toHaveLength(0);

    record('m4-04-manager-access', { sharedVisible: charlieList!.length, foreignVisible: foreignList!.length });
  });

  it('M4-05 · Contact interactions: create, retrieve, peer isolation, and manager oversight', async () => {
    // Alice logs an interaction via rpc_log_contact_interaction
    const { data: intId, error: intErr } = await alice.db().rpc('rpc_log_contact_interaction', {
      p_contact_id: aliceContactId,
      p_interaction_type: 'CALL',
      p_notes: 'Phone call regarding team culture and upcoming technical interview.',
      p_next_follow_up_date: '2026-10-20',
    });
    expect(intErr).toBeNull();
    expect(intId).toBeTruthy();

    // Alice reads interactions for her contact
    const { data: aliceInts, error: aIntErr } = await alice.db().from('contact_interactions').select('*').eq('contact_id', aliceContactId);
    expect(aIntErr).toBeNull();
    expect(aliceInts).toHaveLength(1);
    expect(aliceInts![0].interaction_type).toBe('CALL');

    // Bob attempts to read Alice's contact interactions: DENIED / 0 rows
    const { data: bobInts, error: bIntErr } = await bob.db().from('contact_interactions').select('*').eq('contact_id', aliceContactId);
    expect(bIntErr).toBeNull();
    expect(bobInts).toHaveLength(0);

    // Charlie (MANAGER) can view Alice's contact interactions
    const { data: charlieInts, error: cIntErr } = await managerCharlie.db().from('contact_interactions').select('*').eq('contact_id', aliceContactId);
    expect(cIntErr).toBeNull();
    expect(charlieInts).toHaveLength(1);

    record('m4-05-contact-interactions', { interactionId: intId, bobVisible: bobInts!.length, managerVisible: charlieInts!.length });
  });

  it('M4-06 · Application ↔ Contact relationships: linking, querying, and unlinking', async () => {
    // Alice links her contact to her application via RPC
    const { data: linkOk, error: linkErr } = await alice.db().rpc('rpc_link_application_contact', {
      p_application_id: aliceAppId,
      p_contact_id: aliceContactId,
      p_role_in_process: 'RECRUITER',
    });
    expect(linkErr).toBeNull();
    expect(linkOk).toBe(true);

    // Query application_contacts
    const { data: links, error: qErr } = await alice.db()
      .from('application_contacts')
      .select('*, contacts(full_name, relationship_type)')
      .eq('application_id', aliceAppId)
      .eq('contact_id', aliceContactId);
    expect(qErr).toBeNull();
    expect(links).toHaveLength(1);
    expect(links![0].contact_id).toBe(aliceContactId);
    expect(links![0].role_in_process).toBe('RECRUITER');

    // Bob cannot see Alice's application-contact link
    const { data: bobLinks } = await bob.db().from('application_contacts').select('*').eq('application_id', aliceAppId);
    expect(bobLinks).toHaveLength(0);

    // Alice unlinks
    const { data: unlinkOk, error: unlinkErr } = await alice.db().rpc('rpc_unlink_application_contact', {
      p_application_id: aliceAppId,
      p_contact_id: aliceContactId,
    });
    expect(unlinkErr).toBeNull();
    expect(unlinkOk).toBe(true);

    const { data: afterUnlink } = await alice.db()
      .from('application_contacts')
      .select('*')
      .eq('application_id', aliceAppId)
      .eq('contact_id', aliceContactId);
    expect(afterUnlink).toHaveLength(0);

    record('m4-06-application-contact-linkage', { linked: linkOk, unlinked: unlinkOk });
  });

  it('M4-07 · Database-level cross-workspace integrity: prevents cross-workspace links', async () => {
    // Attempt to link Alice's contact (in sharedWsId) to Dave's application (in foreignWsId)
    // 1. Via RPC: should be rejected with CROSS_WORKSPACE_LINK_FORBIDDEN
    const { error: rpcCrossErr } = await alice.db().rpc('rpc_link_application_contact', {
      p_application_id: foreignAppId,
      p_contact_id: aliceContactId,
    });
    expect(rpcCrossErr).toBeTruthy();

    // 2. Direct insert violating composite foreign keys (application_id, workspace_id)
    const { error: fkErr } = await admin.from('application_contacts').insert({
      application_id: foreignAppId, // belongs to foreignWsId
      contact_id: aliceContactId,   // belongs to sharedWsId
      workspace_id: sharedWsId,
    });
    // Violates foreign key constraint fk_app_contacts_app
    expect(fkErr).toBeTruthy();

    record('m4-07-cross-workspace-integrity', { rpcCrossError: rpcCrossErr?.message, fkError: fkErr?.code });
  });

  it('M4-08 · Companies registry: workspace-shared reference data', async () => {
    // Alice inserts a company in shared workspace
    const { data: comp, error: cErr } = await alice.db().from('companies').insert({
      workspace_id: sharedWsId,
      name: `Innovatech ${run}`,
      website: 'https://innovatech.example',
    }).select().single();
    expect(cErr).toBeNull();
    expect(comp.id).toBeTruthy();

    // Bob (same workspace) can read Innovatech
    const { data: bobComp, error: bErr } = await bob.db().from('companies').select('*').eq('id', comp.id).single();
    expect(bErr).toBeNull();
    expect(bobComp.name).toBe(`Innovatech ${run}`);

    // Dave (foreign workspace) CANNOT read Innovatech
    const { data: daveComp } = await foreignDave.db().from('companies').select('*').eq('id', comp.id).maybeSingle();
    expect(daveComp).toBeNull();

    record('m4-08-companies-shared', { companyId: comp.id, bobCanRead: !!bobComp, daveBlocked: daveComp === null });
  });

  it('M4-09 · Contact soft archive and restore', async () => {
    // Alice archives her contact
    const { data: arcOk, error: arcErr } = await alice.db().rpc('rpc_archive_contact', {
      p_contact_id: aliceContactId,
    });
    expect(arcErr).toBeNull();
    expect(arcOk).toBe(true);

    const { data: arcContact } = await alice.db().from('contacts').select('archived_at').eq('id', aliceContactId).single();
    expect(arcContact!.archived_at).toBeTruthy();

    // Alice restores her contact
    const { data: resOk, error: resErr } = await alice.db().rpc('rpc_restore_contact', {
      p_contact_id: aliceContactId,
    });
    expect(resErr).toBeNull();
    expect(resOk).toBe(true);

    const { data: resContact } = await alice.db().from('contacts').select('archived_at').eq('id', aliceContactId).single();
    expect(resContact!.archived_at).toBeNull();

    record('m4-09-archive-restore', { archived: arcOk, restored: resOk });
  });

  it('M4-10 · Anon client denial across all contacts tables and RPCs', async () => {
    const anon = anonDb();

    // Tables
    const { data: cData, error: cErr } = await anon.from('contacts').select('*');
    expect(cData).toBeNull();
    expect(cErr).toBeTruthy();

    const { data: iData, error: iErr } = await anon.from('contact_interactions').select('*');
    expect(iData).toBeNull();
    expect(iErr).toBeTruthy();

    const { data: acData, error: acErr } = await anon.from('application_contacts').select('*');
    expect(acData).toBeNull();
    expect(acErr).toBeTruthy();

    const { data: coData, error: coErr } = await anon.from('companies').select('*');
    expect(coData).toBeNull();
    expect(coErr).toBeTruthy();

    // RPCs
    const { error: rpcErr } = await anon.rpc('rpc_create_contact', {
      p_workspace_id: sharedWsId,
      p_full_name: 'Anon Hacker',
    });
    expect(rpcErr).toBeTruthy();

    record('m4-10-anon-denial', { tablesBlocked: true, rpcsBlocked: true });
  });
});
