/** M9 · Dashboard preference persistence on owner-private profiles. */
import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, anonDb, loadEnv, makeRecorder, serviceDb } from './harness';

const ready = loadEnv();
const record = makeRecorder('migration-upgrade/m9/evidence', 'integration');

describe.skipIf(!ready)('Milestone 9 — dashboard preferences', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const alice = new Actor();
  const bob = new Actor();
  const manager = new Actor();
  let workspaceId: string;

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache();
    resetSigningMaterial();
    resetAdminClient();

    for (const [actor, name] of [[alice, 'alice'], [bob, 'bob'], [manager, 'manager']] as const) {
      const result = await actor.call('/auth/register', {
        username: `m9_${name}_${run}`,
        password: `Valid-M9-${name}-${run}!`,
      });
      expect(result.status).toBe(201);
    }
    workspaceId = (await manager.db().rpc('rpc_create_workspace', { p_name: `M9 Shared ${run}` })).data as string;
    await admin.from('workspace_members').insert([
      { workspace_id: workspaceId, user_id: alice.userId!, role: 'USER' },
      { workspace_id: workspaceId, user_id: bob.userId!, role: 'USER' },
    ]);
  });

  it('M9-01 · owner can round-trip an object layout while invalid JSON shapes are constrained', async () => {
    const payload = {
      density: 'compact',
      dashboards: {
        [workspaceId]: {
          user: [{ widgetId: 'applications-month', enabled: true, position: 0, width: 1, height: 1 }],
        },
      },
    };
    const saved = await alice.db().from('profiles')
      .update({ ui_preferences: payload })
      .eq('user_id', alice.userId!)
      .select('ui_preferences')
      .single();
    expect(saved.error).toBeNull();
    expect(saved.data?.ui_preferences).toEqual(payload);

    const malformed = await alice.db().from('profiles')
      .update({ ui_preferences: [] })
      .eq('user_id', alice.userId!);
    expect(malformed.error?.code).toBe('23514');
    const unchanged = await alice.db().from('profiles').select('ui_preferences').eq('user_id', alice.userId!).single();
    expect(unchanged.data?.ui_preferences).toEqual(payload);
    record('m9-01-owner-round-trip', { objectSaved: true, malformedRejected: '23514' });
  });

  it('M9-02 · peer, same-workspace manager, and anonymous callers cannot read or mutate another profile', async () => {
    const peerRead = await bob.db().from('profiles').select('ui_preferences').eq('user_id', alice.userId!);
    expect(peerRead.data).toHaveLength(0);
    const peerUpdate = await bob.db().from('profiles')
      .update({ ui_preferences: { compromised: true } })
      .eq('user_id', alice.userId!)
      .select('user_id');
    expect(peerUpdate.data).toHaveLength(0);

    const managerRead = await manager.db().from('profiles').select('ui_preferences').eq('user_id', alice.userId!);
    expect(managerRead.data).toHaveLength(0);
    const managerUpdate = await manager.db().from('profiles')
      .update({ ui_preferences: { managerOverwrite: true } })
      .eq('user_id', alice.userId!)
      .select('user_id');
    expect(managerUpdate.data).toHaveLength(0);

    const anonymous = await anonDb().from('profiles').select('ui_preferences');
    expect(anonymous.error).toBeTruthy();
    const ownerState = await alice.db().from('profiles').select('ui_preferences').eq('user_id', alice.userId!).single();
    expect(ownerState.data?.ui_preferences).not.toHaveProperty('compromised');
    expect(ownerState.data?.ui_preferences).not.toHaveProperty('managerOverwrite');
    record('m9-02-profile-isolation', { peerRows: 0, managerRows: 0, anonymousDenied: true });
  });
});
