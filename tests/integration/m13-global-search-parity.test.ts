import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, anonDb, loadEnv, makeRecorder, serviceDb } from './harness';

const ready = loadEnv();
const record = makeRecorder('migration-upgrade/m13/evidence', 'integration');

describe.skipIf(!ready)('Milestone 13 — Global Search, Hardening & Final Product Parity Sweep', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();

  const alice = new Actor();   // Manager of shared workspace
  const bob = new Actor();     // User member in shared workspace
  const charlie = new Actor(); // Another user member in shared workspace
  const dave = new Actor();    // Foreign user in an isolated workspace

  let sharedWsId: string;
  let daveWsId: string;
  let testAppId: string;
  let testJournalId: string;

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
        username: `m13_${name}_${run}`,
        password: `Valid-M13-${name}-${run}!`,
      });
      expect(result.status).toBe(201);
    }

    // Alice creates shared workspace
    const createRes = await alice.db().rpc('rpc_create_workspace', {
      p_name: `M13 Parity Workspace ${run}`,
      p_color: 'oklch(0.50 0.12 180)',
      p_description: 'Global search and final parity validation workspace',
    });
    expect(createRes.error).toBeNull();
    sharedWsId = createRes.data as string;
    expect(sharedWsId).toBeDefined();

    // Alice invites Bob and Charlie as USER members
    const inviteRes = await alice.db().rpc('rpc_create_workspace_invitation', {
      p_workspace_id: sharedWsId,
      p_role: 'USER',
      p_max_uses: 5,
      p_expires_days: 7,
      p_label: 'M13 Intake',
    });
    expect(inviteRes.error).toBeNull();
    const inviteCode = inviteRes.data.code as string;

    const bobJoin = await bob.db().rpc('rpc_join_workspace', { p_code: inviteCode });
    expect(bobJoin.error).toBeNull();

    const charlieJoin = await charlie.db().rpc('rpc_join_workspace', { p_code: inviteCode });
    expect(charlieJoin.error).toBeNull();

    // Dave gets his personal workspace ID
    const { data: daveMemberships } = await dave.db()
      .from('workspace_members')
      .select('workspace_id')
      .eq('status', 'ACTIVE');
    daveWsId = daveMemberships?.[0]?.workspace_id ?? '';
    expect(daveWsId).toBeTruthy();
  });

  // ==========================================================================
  // 1. Journal / Notes CRUD Lifecycle & Application Linkage
  // ==========================================================================
  it('M13-01 · Journal CRUD lifecycle, entry types, application linking, and CASCADE safety', async () => {
    // 1. Bob creates an application in shared workspace
    const appRes = await bob.db().from('applications').insert({
      workspace_id: sharedWsId,
      user_id: bob.userId,
      company_name: `QuantumLeap_${run}`,
      role_title: 'Principal Systems Architect',
      stage: 'APPLIED',
      status: 'OPEN',
      notes: 'Initial outreach through alumni network',
    }).select('id').single();
    expect(appRes.error).toBeNull();
    testAppId = appRes.data!.id;

    // 2. Bob creates a linked journal entry via RPC
    const createEntryRes = await bob.db().rpc('rpc_create_journal_entry', {
      p_workspace_id: sharedWsId,
      p_title: `Strategy for QuantumLeap Interview ${run}`,
      p_content: 'Focus on distributed consensus, Paxos protocol, and fault-tolerant storage architectures.',
      p_entry_type: 'STRATEGY',
      p_application_id: testAppId,
      p_is_pinned: true,
    });
    expect(createEntryRes.error).toBeNull();
    testJournalId = createEntryRes.data as string;
    expect(testJournalId).toBeDefined();

    // 3. Read back via PostgREST with application join
    const { data: entryRow, error: fetchErr } = await bob.db()
      .from('journal_entries')
      .select('id, workspace_id, user_id, application_id, entry_type, title, content, is_pinned')
      .eq('id', testJournalId)
      .single();
    expect(fetchErr).toBeNull();
    expect(entryRow?.title).toBe(`Strategy for QuantumLeap Interview ${run}`);
    expect(entryRow?.entry_type).toBe('STRATEGY');
    expect(entryRow?.is_pinned).toBe(true);
    expect(entryRow?.application_id).toBe(testAppId);

    // 4. Update entry
    const updateRes = await bob.db().rpc('rpc_update_journal_entry', {
      p_entry_id: testJournalId,
      p_title: `Updated Strategy for QuantumLeap ${run}`,
      p_content: 'Revised notes with distributed tracing details.',
      p_entry_type: 'INTERVIEW_PREP',
      p_application_id: testAppId,
      p_is_pinned: false,
    });
    expect(updateRes.error).toBeNull();

    const { data: updatedRow } = await bob.db()
      .from('journal_entries')
      .select('title, content, entry_type, is_pinned')
      .eq('id', testJournalId)
      .single();
    expect(updatedRow?.title).toBe(`Updated Strategy for QuantumLeap ${run}`);
    expect(updatedRow?.entry_type).toBe('INTERVIEW_PREP');
    expect(updatedRow?.is_pinned).toBe(false);

    // 5. Test ON DELETE SET NULL: deleting the application must NOT delete the journal entry
    const tempApp = await bob.db().from('applications').insert({
      workspace_id: sharedWsId,
      user_id: bob.userId,
      company_name: `TempCompany_${run}`,
      role_title: 'Temp Role',
      stage: 'APPLIED',
      status: 'OPEN',
    }).select('id').single();

    const tempJournal = await bob.db().rpc('rpc_create_journal_entry', {
      p_workspace_id: sharedWsId,
      p_title: `Temp Note ${run}`,
      p_content: 'Note linked to temp company.',
      p_application_id: tempApp.data!.id,
    });

    // Delete the temp application
    await admin.from('applications').delete().eq('id', tempApp.data!.id);

    // Verify temp journal entry still exists with application_id set to NULL
    const { data: preservedJournal } = await bob.db()
      .from('journal_entries')
      .select('id, application_id, title')
      .eq('id', tempJournal.data)
      .single();
    expect(preservedJournal).toBeDefined();
    expect(preservedJournal?.application_id).toBeNull();

    // Clean up temp note
    await bob.db().rpc('rpc_delete_journal_entry', { p_entry_id: tempJournal.data });

    record('m13-01-journal-lifecycle', { testJournalId, testAppId });
  });

  // ==========================================================================
  // 2. Journal RLS & Cross-User Security Matrix
  // ==========================================================================
  it('M13-02 · Journal RLS, peer isolation, and manager cross-user mutation audit', async () => {
    // 1. Charlie (peer USER) tries to select Bob's journal entry -> 0 rows returned
    const { data: peerSelect } = await charlie.db()
      .from('journal_entries')
      .select('id')
      .eq('id', testJournalId);
    expect(peerSelect).toEqual([]);

    // 2. Charlie tries to update Bob's journal entry -> PERMISSION_DENIED
    const charlieUpdate = await charlie.db().rpc('rpc_update_journal_entry', {
      p_entry_id: testJournalId,
      p_title: 'Hacked Title',
      p_content: 'Hacked content',
    });
    expect(charlieUpdate.error).not.toBeNull();

    // 3. Charlie tries to delete Bob's journal entry -> PERMISSION_DENIED
    const charlieDelete = await charlie.db().rpc('rpc_delete_journal_entry', {
      p_entry_id: testJournalId,
    });
    expect(charlieDelete.error).not.toBeNull();

    // 4. Dave (foreign user) tries to select or update -> rejected
    const { data: daveSelect } = await dave.db()
      .from('journal_entries')
      .select('id')
      .eq('id', testJournalId);
    expect(daveSelect).toEqual([]);

    // 5. Alice (MANAGER) can view Bob's journal entry in the workspace
    const { data: managerSelect, error: mgrErr } = await alice.db()
      .from('journal_entries')
      .select('id, title, user_id')
      .eq('id', testJournalId)
      .single();
    expect(mgrErr).toBeNull();
    expect(managerSelect?.id).toBe(testJournalId);
    expect(managerSelect?.user_id).toBe(bob.userId);

    // 6. Alice (MANAGER) updates Bob's entry -> triggers app.audit_cross_user_mutation
    const mgrUpdate = await alice.db().rpc('rpc_update_journal_entry', {
      p_entry_id: testJournalId,
      p_title: `Manager Reviewed: Strategy for QuantumLeap ${run}`,
      p_content: 'Added coaching guidance on architectural tradeoffs.',
      p_entry_type: 'INTERVIEW_PREP',
      p_application_id: testAppId,
      p_is_pinned: true,
    });
    expect(mgrUpdate.error).toBeNull();

    // Verify manager cross-user mutation audit event
    const { data: auditLogs, error: auditErr } = await admin
      .from('audit_events')
      .select('action, actor_id, target_user_id, workspace_id, target_entity_type')
      .eq('workspace_id', sharedWsId)
      .eq('actor_id', alice.userId!)
      .eq('target_entity_type', 'JOURNAL_ENTRY')
      .order('created_at', { ascending: false });
    expect(auditErr).toBeNull();
    expect(auditLogs && auditLogs.length > 0).toBe(true);
    expect(auditLogs?.[0]?.target_user_id).toBe(bob.userId);

    record('m13-02-journal-rls', { auditCount: auditLogs?.length });
  });

  // ==========================================================================
  // 3. Global Search: Multi-Domain Coverage
  // ==========================================================================
  it('M13-03 · Global Search matches Applications, Contacts, Notes, Interviews, and Documents', async () => {
    // Seed remaining domains for Bob in shared workspace:
    // 1. Contact
    const contactRes = await bob.db().from('contacts').insert({
      workspace_id: sharedWsId,
      user_id: bob.userId,
      full_name: `Seraphina Vance_${run}`,
      company_name: `VanceRobotics_${run}`,
      job_title: 'VP of Autonomous Infrastructure',
      email: `seraphina_${run}@vancerobotics.internal`,
      notes: 'Key hiring executive for autonomous perception team',
    }).select('id').single();
    expect(contactRes.error).toBeNull();

    // 2. Interview
    const interviewRes = await bob.db().rpc('rpc_schedule_interview', {
      p_application_id: testAppId,
      p_interview_type: 'TECHNICAL',
      p_scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      p_duration_minutes: 60,
      p_format: 'VIDEO',
      p_round_number: 1,
      p_interviewer_names: `Dr. Nikolai Tesla_${run}`,
      p_preparation_notes: `Review vector indexing and GPU clustering ${run}`,
    });
    expect(interviewRes.error).toBeNull();

    // 3. Document / Resume
    const resumeRes = await bob.db().from('resumes').insert({
      workspace_id: sharedWsId,
      user_id: bob.userId,
      name: `Autonomous Robotics Tailored Resume_${run}`,
      document_type: 'RESUME',
      version_label: 'v2.1-robotics',
      target_role: `Robotics Platform Lead ${run}`,
      change_summary: `Added specialized GPU kernel optimization section ${run}`,
    }).select('id').single();
    expect(resumeRes.error).toBeNull();

    // 4. Query Application domain
    const searchApp = await bob.db().rpc('rpc_global_search', {
      p_query: `QuantumLeap_${run}`,
      p_workspace_id: sharedWsId,
    });
    expect(searchApp.error).toBeNull();
    const appResults = searchApp.data as any[];
    expect(appResults.length).toBeGreaterThanOrEqual(1);
    expect(appResults.some((r) => r.domain === 'application' && r.title.includes(`QuantumLeap_${run}`))).toBe(true);

    // 5. Query Contact domain
    const searchContact = await bob.db().rpc('rpc_global_search', {
      p_query: `Seraphina Vance_${run}`,
      p_workspace_id: sharedWsId,
    });
    expect(searchContact.error).toBeNull();
    const contactResults = searchContact.data as any[];
    expect(contactResults.some((r) => r.domain === 'contact' && r.title.includes(`Seraphina Vance_${run}`))).toBe(true);

    // 6. Query Note / Journal domain
    const searchNote = await bob.db().rpc('rpc_global_search', {
      p_query: 'coaching guidance',
      p_workspace_id: sharedWsId,
    });
    expect(searchNote.error).toBeNull();
    const noteResults = searchNote.data as any[];
    expect(noteResults.some((r) => r.domain === 'note' && r.snippet.includes('coaching guidance'))).toBe(true);

    // 7. Query Interview domain
    const searchInterview = await bob.db().rpc('rpc_global_search', {
      p_query: `Nikolai Tesla_${run}`,
      p_workspace_id: sharedWsId,
    });
    expect(searchInterview.error).toBeNull();
    const interviewResults = searchInterview.data as any[];
    expect(interviewResults.some((r) => r.domain === 'interview' && r.snippet.includes(`Nikolai Tesla_${run}`))).toBe(true);

    // 8. Query Document domain
    const searchDoc = await bob.db().rpc('rpc_global_search', {
      p_query: `Robotics Tailored Resume_${run}`,
      p_workspace_id: sharedWsId,
    });
    expect(searchDoc.error).toBeNull();
    const docResults = searchDoc.data as any[];
    expect(docResults.some((r) => r.domain === 'document' && r.title.includes(`Robotics Tailored Resume_${run}`))).toBe(true);

    record('m13-03-search-domains', {
      appFound: appResults.length,
      contactFound: contactResults.length,
      noteFound: noteResults.length,
      interviewFound: interviewResults.length,
      docFound: docResults.length,
    });
  });

  // ==========================================================================
  // 4. Global Search: Security, Workspace Isolation & Peer Privacy
  // ==========================================================================
  it('M13-04 · Global Search enforces workspace boundaries and peer privacy (zero leakage)', async () => {
    // 1. Charlie (peer USER) searches for Bob's unique keywords -> returns 0 results
    const peerSearchApp = await charlie.db().rpc('rpc_global_search', {
      p_query: `QuantumLeap_${run}`,
      p_workspace_id: sharedWsId,
    });
    expect(peerSearchApp.error).toBeNull();
    expect(peerSearchApp.data).toEqual([]); // Zero peer data leakage

    const peerSearchContact = await charlie.db().rpc('rpc_global_search', {
      p_query: `Seraphina Vance_${run}`,
      p_workspace_id: sharedWsId,
    });
    expect(peerSearchContact.error).toBeNull();
    expect(peerSearchContact.data).toEqual([]);

    const peerSearchNote = await charlie.db().rpc('rpc_global_search', {
      p_query: 'coaching guidance',
      p_workspace_id: sharedWsId,
    });
    expect(peerSearchNote.error).toBeNull();
    expect(peerSearchNote.data).toEqual([]);

    // 2. Alice (MANAGER) searches for the same keywords -> returns all items in workspace
    const mgrSearch = await alice.db().rpc('rpc_global_search', {
      p_query: `QuantumLeap_${run}`,
      p_workspace_id: sharedWsId,
    });
    expect(mgrSearch.error).toBeNull();
    expect((mgrSearch.data as any[]).length).toBeGreaterThanOrEqual(1);

    // 3. Dave (foreign user) attempts search in sharedWsId -> WORKSPACE_ACCESS_DENIED
    const daveForeignSearch = await dave.db().rpc('rpc_global_search', {
      p_query: 'QuantumLeap',
      p_workspace_id: sharedWsId,
    });
    expect(daveForeignSearch.error).not.toBeNull();
    expect(daveForeignSearch.error?.message).toMatch(/WORKSPACE_ACCESS_DENIED/);

    // 4. Anonymous caller attempts search -> AUTH_REQUIRED
    const anonSearch = await anonDb().rpc('rpc_global_search', {
      p_query: 'QuantumLeap',
      p_workspace_id: sharedWsId,
    });
    expect(anonSearch.error).not.toBeNull();

    record('m13-04-search-security', { peerResultsCount: peerSearchApp.data?.length });
  });

  // ==========================================================================
  // 5. Global Search: Suspended and Removed Member Denial
  // ==========================================================================
  it('M13-05 · Suspended and removed members are denied search execution immediately', async () => {
    // 1. Alice suspends Charlie
    const suspendRes = await alice.db().rpc('rpc_update_member_status', {
      p_workspace_id: sharedWsId,
      p_target_user_id: charlie.userId,
      p_new_status: 'SUSPENDED',
    });
    expect(suspendRes.error).toBeNull();

    // Charlie attempts search while suspended -> WORKSPACE_ACCESS_DENIED
    const suspendedSearch = await charlie.db().rpc('rpc_global_search', {
      p_query: 'test',
      p_workspace_id: sharedWsId,
    });
    expect(suspendedSearch.error).not.toBeNull();
    expect(suspendedSearch.error?.message).toMatch(/WORKSPACE_ACCESS_DENIED/);

    // 2. Alice removes Charlie completely from workspace
    const removeRes = await alice.db().rpc('rpc_remove_workspace_member', {
      p_workspace_id: sharedWsId,
      p_target_user_id: charlie.userId,
    });
    expect(removeRes.error).toBeNull();

    // Charlie attempts search after removal -> WORKSPACE_ACCESS_DENIED
    const removedSearch = await charlie.db().rpc('rpc_global_search', {
      p_query: 'test',
      p_workspace_id: sharedWsId,
    });
    expect(removedSearch.error).not.toBeNull();
    expect(removedSearch.error?.message).toMatch(/WORKSPACE_ACCESS_DENIED/);

    record('m13-05-member-denial', { charlieUserId: charlie.userId });
  });

  // ==========================================================================
  // 6. Security Hardening Regression Sweep
  // ==========================================================================
  it('M13-06 · Hardening sweep: Option B token rotation, replay revocation, CSRF, and SQL safety', async () => {
    // 1. Refresh rotation & replay protection
    const initialRefreshToken = bob.jar.get('jq_rt');
    expect(initialRefreshToken).toBeTruthy();

    const refresh1 = await bob.call('/auth/refresh', {});
    expect(refresh1.status).toBe(200);

    const rotatedRefreshToken = bob.jar.get('jq_rt');
    expect(rotatedRefreshToken).toBeTruthy();
    expect(rotatedRefreshToken).not.toBe(initialRefreshToken);

    // Attempting to reuse the spent refresh token -> REPLAY ATTACK DETECTED -> 401 REFRESH_REUSED
    const attacker = new Actor();
    attacker.jar.set('jq_rt', initialRefreshToken!);
    attacker.jar.set('jq_csrf', bob.jar.get('jq_csrf')!);
    const replayRes = await attacker.call('/auth/refresh', {});
    expect(replayRes.status).toBe(401);
    expect(replayRes.json.error.code).toBe('REFRESH_REUSED');

    // 2. CSRF Origin defense on state-changing endpoint
    const csrfFail = await bob.call('/auth/password', {
      current_password: `Valid-M13-bob-${run}!`,
      new_password: `New-Valid-M13-bob-${run}!`,
    }, { origin: 'https://evil-attacker.site' });
    expect(csrfFail.status).toBe(403);

    // 3. SQL injection safety in search queries
    const injectionQueries = [
      "'; DROP TABLE journal_entries; --",
      "' OR '1'='1",
      "\\x00",
      "%%%",
      "_*_[]()",
    ];

    for (const inj of injectionQueries) {
      const searchRes = await bob.db().rpc('rpc_global_search', {
        p_query: inj,
        p_workspace_id: sharedWsId,
      });
      expect(searchRes.error).toBeNull(); // Executed safely without syntax error or drop
    }

    // Verify journal_entries table is intact
    const { count, error: countErr } = await admin
      .from('journal_entries')
      .select('*', { count: 'exact', head: true });
    expect(countErr).toBeNull();
    expect(count).toBeGreaterThan(0);

    record('m13-06-hardening-sweep', { tableCount: count });
  });
});
