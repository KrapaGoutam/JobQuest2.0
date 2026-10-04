/**
 * PL-4C · Configurable goals, reusable task templates, configurable recurrence.
 * Runs against the real disposable Supabase stack with Option B sessions.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, anonDb, loadEnv, makeRecorder, serviceDb } from './harness';

const ready = loadEnv();
const record = makeRecorder('test-results/evidence', 'integration');
const DAY = 86_400_000;
const day = (offset = 0) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(Date.now() + offset * DAY));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};
const addDays = (key: string, offset: number) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + offset * DAY).toISOString().slice(0, 10);

describe.skipIf(!ready)('PL-4C · goals, task templates, recurrence', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const password = (name: string) => `Valid-PL4C-${run}-${name}!`;

  let alice: Actor;
  let bob: Actor;
  let manager: Actor;
  let outsider: Actor;
  let workspaceId: string;
  let foreignWorkspaceId: string;
  let appA: string;
  let appB: string;
  let foreignApp: string;

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache();
    resetSigningMaterial();
    resetAdminClient();

    alice = new Actor();
    bob = new Actor();
    manager = new Actor();
    outsider = new Actor();
    for (const [actor, name] of [
      [alice, 'alice'],
      [bob, 'bob'],
      [manager, 'manager'],
      [outsider, 'outsider'],
    ] as const) {
      const response = await actor.call('/auth/register', {
        username: `pl4c_${name}_${run}`,
        password: password(name),
      });
      expect(response.status).toBe(201);
    }

    workspaceId = (await manager.db().rpc('rpc_create_workspace', {
      p_name: `PL-4C ${run}`,
    })).data as string;
    foreignWorkspaceId = (await outsider.db().rpc('rpc_create_workspace', {
      p_name: `PL-4C foreign ${run}`,
    })).data as string;
    expect((await admin.from('workspace_members').insert([
      { workspace_id: workspaceId, user_id: alice.userId!, role: 'USER' },
      { workspace_id: workspaceId, user_id: bob.userId!, role: 'USER' },
    ])).error).toBeNull();
    expect((await admin.from('profiles').update({
      timezone: 'America/Chicago',
      week_start: 1,
    }).eq('user_id', alice.userId!)).error).toBeNull();

    const apps = await alice.db().from('applications').insert([
      {
        workspace_id: workspaceId,
        user_id: alice.userId!,
        company_name: `Template A ${run}`,
        role_title: 'Engineer',
        stage: 'APPLIED',
        status: 'OPEN',
      },
      {
        workspace_id: workspaceId,
        user_id: alice.userId!,
        company_name: `Template B ${run}`,
        role_title: 'Engineer',
        stage: 'APPLIED',
        status: 'OPEN',
      },
    ]).select('id');
    expect(apps.error).toBeNull();
    [appA, appB] = apps.data!.map((row) => row.id);
    foreignApp = (await outsider.db().from('applications').insert({
      workspace_id: foreignWorkspaceId,
      user_id: outsider.userId!,
      company_name: `Foreign ${run}`,
      role_title: 'Engineer',
      stage: 'APPLIED',
      status: 'OPEN',
    }).select('id').single()).data!.id;
  });

  it('normalizes independent goal types and reports exact canonical progress', async () => {
    const configs = [
      ['APPLICATIONS', 3, 'DAILY'],
      ['NETWORKING', 4, 'WEEKLY'],
      ['FOLLOW_UPS', 2, 'MONTHLY'],
      ['INTERVIEW_PREP', 2, 'DAILY'],
    ] as const;
    for (const [goalType, target, period] of configs) {
      const result = await alice.db().rpc('rpc_set_goal_for_user', {
        p_workspace_id: workspaceId,
        p_goal_type: goalType,
        p_target_value: target,
        p_period_type: period,
        p_effective_date: day(),
      });
      expect(result.error, `${goalType}: ${result.error?.message}`).toBeNull();
      expect(result.data).toMatchObject({
        goal_type: goalType,
        period_type: period,
        target_value: target,
      });
    }

    const contact = await alice.db().rpc('rpc_create_contact', {
      p_workspace_id: workspaceId,
      p_full_name: `Network ${run}`,
    });
    expect(contact.error).toBeNull();
    expect((await alice.db().rpc('rpc_log_contact_interaction', {
      p_contact_id: contact.data.id,
      p_interaction_type: 'EMAIL',
      p_notes: 'Canonical networking action',
    })).error).toBeNull();

    const followUp = await alice.db().from('tasks').insert({
      workspace_id: workspaceId,
      user_id: alice.userId!,
      application_id: appA,
      task_type: 'FOLLOW_UP',
      title: 'Canonical follow-up',
      due_date: day(),
    }).select('id').single();
    expect(followUp.error).toBeNull();
    expect((await alice.db().rpc('rpc_complete_task', {
      p_task_id: followUp.data!.id,
    })).error).toBeNull();

    expect((await alice.db().rpc('rpc_create_journal_entry', {
      p_workspace_id: workspaceId,
      p_title: 'Prep session',
      p_content: 'Prepared examples and questions.',
      p_entry_type: 'INTERVIEW_PREP',
      p_application_id: appA,
      p_is_pinned: false,
    })).error).toBeNull();

    const progress = await alice.db().rpc('rpc_get_goal_progress', {
      p_workspace_id: workspaceId,
      p_period_count: 12,
    });
    expect(progress.error).toBeNull();
    const active = progress.data.active_goals as Array<Record<string, unknown>>;
    expect(active).toHaveLength(4);
    expect(active.map((goal) => goal.goal_type).sort()).toEqual([
      'APPLICATIONS', 'FOLLOW_UPS', 'INTERVIEW_PREP', 'NETWORKING',
    ]);
    for (const goal of active) expect(Number(goal.actual)).toBeGreaterThanOrEqual(1);
    expect(active.find((goal) => goal.goal_type === 'INTERVIEW_PREP')).toMatchObject({
      actual: 1,
      period_type: 'DAILY',
    });

    const yesterday = await alice.db().rpc('rpc_set_goal_for_user', {
      p_workspace_id: workspaceId,
      p_goal_type: 'APPLICATIONS',
      p_target_value: 99,
      p_period_type: 'DAILY',
      p_effective_date: day(-1),
    });
    expect(yesterday.error?.message).toMatch(/GOAL_HISTORY_IMMUTABLE/);

    const peerRows = await bob.db().from('goals').select('id').eq('user_id', alice.userId!);
    expect(peerRows.data).toHaveLength(0);
    expect((await outsider.db().rpc('rpc_get_goal_progress', {
      p_workspace_id: workspaceId,
      p_user_id: alice.userId,
    })).error?.code).toBe('42501');
    expect((await anonDb().rpc('rpc_get_goal_progress', {
      p_workspace_id: workspaceId,
    })).error).toBeDefined();

    record('pl4c-goals', {
      types: active.map((goal) => goal.goal_type),
      periods: active.map((goal) => goal.period_type),
      immutableHistory: true,
      peerIsolation: true,
    });
  });

  it('preserves manager goal authority and audit while disabling by version', async () => {
    const changed = await manager.db().rpc('rpc_set_goal_for_user', {
      p_workspace_id: workspaceId,
      p_goal_type: 'NETWORKING',
      p_target_value: 6,
      p_period_type: 'WEEKLY',
      p_effective_date: day(),
      p_is_enabled: true,
      p_user_id: alice.userId,
    });
    expect(changed.error).toBeNull();
    const audits = await admin.from('audit_events')
      .select('actor_id, target_user_id, target_entity_type')
      .eq('target_entity_id', changed.data.id);
    expect(audits.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actor_id: manager.userId,
        target_user_id: alice.userId,
        target_entity_type: 'GOAL',
      }),
    ]));

    const disabled = await alice.db().rpc('rpc_set_goal_for_user', {
      p_workspace_id: workspaceId,
      p_goal_type: 'APPLICATIONS',
      p_target_value: 3,
      p_period_type: 'DAILY',
      p_effective_date: day(),
      p_is_enabled: false,
    });
    expect(disabled.error).toBeNull();
    const progress = await alice.db().rpc('rpc_get_goal_progress', {
      p_workspace_id: workspaceId,
    });
    expect((progress.data.active_goals as Array<{ goal_type: string }>)
      .some((goal) => goal.goal_type === 'APPLICATIONS')).toBe(false);
    expect((progress.data.versions as Array<{ goal_type: string; is_enabled: boolean }>)
      .some((goal) => goal.goal_type === 'APPLICATIONS' && !goal.is_enabled)).toBe(true);
  });

  it('creates owner-scoped templates and independent canonical tasks', async () => {
    const created = await alice.db().from('task_templates').insert({
      workspace_id: workspaceId,
      user_id: alice.userId!,
      title: 'Follow up after application',
      details: 'Use the prepared outreach note.',
      task_type: 'FOLLOW_UP',
      priority: 'HIGH',
      due_offset_days: 0,
      recurrence_rule: 'WEEKLY',
      recurrence_interval: 2,
      recurrence_weekdays: [1, 3, 5],
      recurrence_occurrence_limit: 3,
    }).select().single();
    expect(created.error).toBeNull();
    const templateId = created.data.id as string;

    expect((await bob.db().from('task_templates').select('id').eq('id', templateId)).data)
      .toHaveLength(0);
    expect((await manager.db().from('task_templates')
      .update({ title: 'Manager-reviewed follow-up' })
      .eq('id', templateId).select()).error).toBeNull();
    const templateAudits = await admin.from('audit_events')
      .select('actor_id, target_user_id, target_entity_type')
      .eq('target_entity_id', templateId);
    expect(templateAudits.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ target_entity_type: 'TASK_TEMPLATE' }),
    ]));

    const appliedA = await alice.db().rpc('rpc_apply_task_template', {
      p_template_id: templateId,
      p_application_id: appA,
    });
    const appliedB = await alice.db().rpc('rpc_apply_task_template', {
      p_template_id: templateId,
      p_application_id: appB,
    });
    expect(appliedA.error).toBeNull();
    expect(appliedB.error).toBeNull();
    expect(appliedA.data.id).not.toBe(appliedB.data.id);
    expect(appliedA.data).toMatchObject({
      application_id: appA,
      recurrence_rule: 'WEEKLY',
      recurrence_interval: 2,
      recurrence_occurrence_limit: 3,
      status: 'PENDING',
    });

    expect((await alice.db().rpc('rpc_complete_task', {
      p_task_id: appliedA.data.id,
    })).error).toBeNull();
    const states = await admin.from('tasks').select('id,status,title')
      .in('id', [appliedA.data.id, appliedB.data.id]);
    expect(states.data?.find((task) => task.id === appliedA.data.id)?.status).toBe('COMPLETED');
    expect(states.data?.find((task) => task.id === appliedB.data.id)?.status).toBe('PENDING');

    expect((await alice.db().from('task_templates').update({
      title: 'Changed definition only',
    }).eq('id', templateId)).error).toBeNull();
    expect((await admin.from('tasks').select('title').eq('id', appliedB.data.id).single())
      .data?.title).toBe('Manager-reviewed follow-up');

    const duplicate = await alice.db().rpc('rpc_apply_task_template', {
      p_template_id: templateId,
      p_application_id: appB,
    });
    expect(duplicate.error).toBeNull();
    expect(duplicate.data.id).not.toBe(appliedB.data.id);

    expect((await outsider.db().rpc('rpc_apply_task_template', {
      p_template_id: templateId,
      p_application_id: foreignApp,
    })).error?.code).toBe('42501');
    expect((await alice.db().from('task_templates').update({ is_active: false })
      .eq('id', templateId)).error).toBeNull();
    expect((await alice.db().rpc('rpc_apply_task_template', {
      p_template_id: templateId,
      p_application_id: appA,
    })).error?.message).toMatch(/TASK_TEMPLATE_INACTIVE/);
    expect((await anonDb().from('task_templates').select('id')).error).toBeDefined();

    record('pl4c-templates', {
      independentInstances: true,
      completionIsolation: true,
      templateEditIsolation: true,
      duplicateApplicationAllowed: true,
    });
  });

  it('supports interval, selected weekdays, until, and occurrence limits', async () => {
    const intervalBase = day(10);
    const intervalTask = await alice.db().from('tasks').insert({
      workspace_id: workspaceId,
      user_id: alice.userId!,
      title: 'Every two days',
      due_date: intervalBase,
      recurrence_rule: 'DAILY',
      recurrence_interval: 2,
    }).select().single();
    expect(intervalTask.error).toBeNull();
    const intervalComplete = await alice.db().rpc('rpc_complete_task', {
      p_task_id: intervalTask.data.id,
    });
    const intervalNext = await admin.from('tasks').select('*')
      .eq('id', intervalComplete.data.next_task_id).single();
    expect(intervalNext.data?.due_date).toBe(addDays(intervalBase, 2));
    expect(intervalNext.data?.recurrence_occurrence_number).toBe(2);

    const mondayOffset = (8 - new Date(`${day()}T12:00:00Z`).getUTCDay()) % 7 || 7;
    const monday = day(mondayOffset);
    const weekdays = await alice.db().from('tasks').insert({
      workspace_id: workspaceId,
      user_id: alice.userId!,
      title: 'Monday Wednesday Friday',
      due_date: monday,
      recurrence_rule: 'WEEKLY',
      recurrence_interval: 2,
      recurrence_weekdays: [1, 3, 5],
    }).select().single();
    expect(weekdays.error).toBeNull();
    const weekdaysComplete = await alice.db().rpc('rpc_complete_task', {
      p_task_id: weekdays.data.id,
    });
    expect((await admin.from('tasks').select('due_date')
      .eq('id', weekdaysComplete.data.next_task_id).single()).data?.due_date)
      .toBe(addDays(monday, 2));

    const limited = await alice.db().from('tasks').insert({
      workspace_id: workspaceId,
      user_id: alice.userId!,
      title: 'Exactly two occurrences',
      due_date: day(2),
      recurrence_rule: 'DAILY',
      recurrence_occurrence_limit: 2,
    }).select().single();
    const limitedFirst = await alice.db().rpc('rpc_complete_task', {
      p_task_id: limited.data.id,
    });
    expect(limitedFirst.data.next_task_id).toBeTruthy();
    const limitedSecond = await alice.db().rpc('rpc_complete_task', {
      p_task_id: limitedFirst.data.next_task_id,
    });
    expect(limitedSecond.data.next_task_id).toBeNull();

    const until = await alice.db().from('tasks').insert({
      workspace_id: workspaceId,
      user_id: alice.userId!,
      title: 'Ends on first date',
      due_date: day(2),
      recurrence_rule: 'DAILY',
      recurrence_until: day(2),
    }).select().single();
    const untilComplete = await alice.db().rpc('rpc_complete_task', {
      p_task_id: until.data.id,
    });
    expect(untilComplete.data.next_task_id).toBeNull();
  });

  it('keeps concurrent completion at one generated child', async () => {
    const recurring = await alice.db().from('tasks').insert({
      workspace_id: workspaceId,
      user_id: alice.userId!,
      title: 'Concurrent completion',
      due_date: day(3),
      recurrence_rule: 'DAILY',
    }).select('id').single();
    expect(recurring.error).toBeNull();

    const [first, second] = await Promise.all([
      alice.db().rpc('rpc_complete_task', { p_task_id: recurring.data!.id }),
      alice.db().rpc('rpc_complete_task', { p_task_id: recurring.data!.id }),
    ]);
    expect([first.error, second.error].filter(Boolean)).toHaveLength(1);
    expect([first.error, second.error].find(Boolean)?.message).toMatch(/TASK_NOT_PENDING/);
    expect((await admin.from('tasks').select('id')
      .eq('parent_task_id', recurring.data!.id)).data).toHaveLength(1);
  });
});
