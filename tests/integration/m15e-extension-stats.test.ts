import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Actor, loadEnv, makeRecorder, serviceDb } from './harness';

const ready = loadEnv();
const record = makeRecorder('test-results/evidence', 'integration');

/**
 * Milestone 15E · GET /ext/v1/stats. All expected numbers below are derived from
 * first-principles calendar math (ISO week = Monday-start; the harness's
 * `profiles.timezone`/`week_start` defaults are 'UTC'/1), not by re-running the
 * route's own implementation, so a bug in the route's date-bucketing would show
 * up as a mismatch rather than agreeing with itself.
 */
describe.skipIf(!ready)('Milestone 15E — extension stats endpoint', () => {
  const run = randomBytes(3).toString('hex');
  const admin = serviceDb();
  const alice = new Actor();
  const bob = new Actor();
  let workspaceId: string;
  let bobWorkspaceId: string;
  let mainToken: string;

  async function createToken(actor: Actor, name: string, targetWorkspace: string, expires = 90) {
    const response = await actor.call('/extension/tokens', { workspace_id: targetWorkspace, name, expires_in_days: expires });
    expect(response.status).toBe(201);
    return { raw: response.json.token as string, id: response.json.metadata.id as string };
  }
  async function extensionCall(actor: Actor, token: string, path: string) {
    return actor.call(path, undefined, { bearer: token, origin: null });
  }

  // --- Ground-truth calendar math (independent of the route under test) ---
  const now = new Date();
  const utcDayKey = (d: Date) => d.toISOString().slice(0, 10);
  const todayKey = utcDayKey(now);
  const dow = now.getUTCDay(); // 0=Sun..6=Sat
  const isodow = dow === 0 ? 7 : dow; // 1=Mon..7=Sun
  const daysSinceMonday = isodow - 1; // 0 when today IS the ISO week start (Monday)
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekStartKey = utcDayKey(weekStart);
  const yesterdayKey = utcDayKey(new Date(now.getTime() - 86_400_000));
  const tomorrowKey = utcDayKey(new Date(now.getTime() + 86_400_000));
  // A timestamp guaranteed inside the current ISO week (start-of-week + 1 minute).
  // Its calendar day equals `todayKey` only when today itself is Monday.
  const withinWeekAt = new Date(weekStart.getTime() + 60_000);
  const withinWeekIsAlsoToday = daysSinceMonday === 0;
  // Ground truth for the yesterday/last-week windows, same first-principles math.
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86_400_000);
  const yesterdayAt = new Date(now.getTime() - 86_400_000); // same wall-clock time, one calendar day earlier
  const lastWeekAt = new Date(weekStart.getTime() - 3 * 86_400_000); // well inside [lastWeekStart, weekStart)
  // "Week Co" (weekStart + 1min) lands in yesterday's window only when yesterday IS the
  // current week's Monday, i.e. today is Tuesday (daysSinceMonday === 1).
  const weekCoIsYesterday = daysSinceMonday === 1;
  // "Old Co" (now - 8 days) lands in last week's window whenever today is NOT Monday
  // (same condition, inverted, as `withinWeekIsAlsoToday`): see route comment math.
  const oldCoInLastWeek = !withinWeekIsAlsoToday;

  beforeAll(async () => {
    const { resetEnvCache } = await import('../../apps/api/src/env');
    const { resetSigningMaterial } = await import('../../apps/api/src/lib/tokens');
    const { resetAdminClient } = await import('../../apps/api/src/lib/db');
    resetEnvCache(); resetSigningMaterial(); resetAdminClient();
    for (const [actor, name] of [[alice, 'alice'], [bob, 'bob']] as const) {
      const result = await actor.call('/auth/register', {
        username: `m15e_${name}_${run}`,
        password: `Valid-M15E-${name}-${run}!`,
      });
      expect(result.status).toBe(201);
    }
    workspaceId = (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', alice.userId!).single()).data!.last_active_workspace_id;
    bobWorkspaceId = (await admin.from('profiles').select('last_active_workspace_id').eq('user_id', bob.userId!).single()).data!.last_active_workspace_id;
    const created = await createToken(alice, 'Stats token', workspaceId);
    mainToken = created.raw;
  });

  it('M15E-01 · returns real, seeded pipeline, today/this-week, goal, interview, and task counts', async () => {
    // Applications: pipeline stages + applied_at-scoped today/week windows.
    const apps = await admin.from('applications').insert([
      { workspace_id: workspaceId, user_id: alice.userId!, company_name: 'Today Co A', role_title: 'Eng', stage: 'SAVED', status: 'OPEN', applied_at: now.toISOString() },
      { workspace_id: workspaceId, user_id: alice.userId!, company_name: 'Today Co B', role_title: 'Eng', stage: 'SAVED', status: 'OPEN', applied_at: now.toISOString() },
      { workspace_id: workspaceId, user_id: alice.userId!, company_name: 'Week Co', role_title: 'Eng', stage: 'APPLIED', status: 'OPEN', applied_at: withinWeekAt.toISOString() },
      { workspace_id: workspaceId, user_id: alice.userId!, company_name: 'Old Co', role_title: 'Eng', stage: 'INTERVIEW', status: 'OPEN', applied_at: new Date(now.getTime() - 8 * 86_400_000).toISOString() },
      { workspace_id: workspaceId, user_id: alice.userId!, company_name: 'Closed Co', role_title: 'Eng', stage: 'OFFER', status: 'CLOSED', outcome: 'ACCEPTED', applied_at: now.toISOString() },
      // Status CLOSED so these two never affect the OPEN-only pipeline counts below.
      { workspace_id: workspaceId, user_id: alice.userId!, company_name: 'Yesterday Co', role_title: 'Eng', stage: 'APPLIED', status: 'CLOSED', outcome: 'REJECTED', applied_at: yesterdayAt.toISOString() },
      { workspace_id: workspaceId, user_id: alice.userId!, company_name: 'Last Week Co', role_title: 'Eng', stage: 'APPLIED', status: 'CLOSED', outcome: 'REJECTED', applied_at: lastWeekAt.toISOString() },
    ]).select('id, stage');
    expect(apps.error).toBeNull();
    const interviewStageAppId = apps.data!.find((a) => a.stage === 'INTERVIEW')!.id as string;
    const savedAppId = apps.data!.find((a) => a.stage === 'SAVED')!.id as string;

    // Goal: WEEKLY, effective at the current week start, so it is picked up as active.
    const goal = await admin.from('goals').insert({
      workspace_id: workspaceId, user_id: alice.userId!, period_type: 'WEEKLY',
      target_applications: 5, target_outreach: 2, effective_date: weekStartKey,
    });
    expect(goal.error).toBeNull();

    // Interviews: only a future, outcome-less one should count as "upcoming".
    const interviews = await admin.from('interviews').insert([
      { workspace_id: workspaceId, user_id: alice.userId!, application_id: interviewStageAppId, interview_type: 'TECHNICAL', scheduled_at: new Date(now.getTime() + 2 * 86_400_000).toISOString() },
      { workspace_id: workspaceId, user_id: alice.userId!, application_id: interviewStageAppId, interview_type: 'RECRUITER_SCREEN', scheduled_at: new Date(now.getTime() - 2 * 86_400_000).toISOString() },
      { workspace_id: workspaceId, user_id: alice.userId!, application_id: interviewStageAppId, interview_type: 'FINAL', scheduled_at: new Date(now.getTime() + 3 * 86_400_000).toISOString(), outcome: 'PASSED', completed_at: now.toISOString() },
    ]);
    expect(interviews.error).toBeNull();

    // Tasks: one due today (FOLLOW_UP), one overdue FOLLOW_UP, one overdue plain TASK,
    // one completed FOLLOW_UP (excluded), one upcoming FOLLOW_UP (excluded).
    const tasks = await admin.from('tasks').insert([
      { workspace_id: workspaceId, user_id: alice.userId!, application_id: savedAppId, task_type: 'FOLLOW_UP', title: 'Due today', due_date: todayKey, status: 'PENDING' },
      { workspace_id: workspaceId, user_id: alice.userId!, application_id: savedAppId, task_type: 'FOLLOW_UP', title: 'Overdue follow-up', due_date: yesterdayKey, status: 'PENDING' },
      { workspace_id: workspaceId, user_id: alice.userId!, task_type: 'TASK', title: 'Overdue plain task', due_date: yesterdayKey, status: 'PENDING' },
      { workspace_id: workspaceId, user_id: alice.userId!, application_id: savedAppId, task_type: 'FOLLOW_UP', title: 'Completed follow-up', due_date: yesterdayKey, status: 'COMPLETED', completed_at: now.toISOString() },
      { workspace_id: workspaceId, user_id: alice.userId!, application_id: savedAppId, task_type: 'FOLLOW_UP', title: 'Future follow-up', due_date: tomorrowKey, status: 'PENDING' },
    ]);
    expect(tasks.error).toBeNull();

    const expectedToday = 3 + (withinWeekIsAlsoToday ? 1 : 0); // 2 "Today Co" + "Closed Co", plus "Week Co" iff today is Monday
    // "Today Co A/B", "Week Co", "Closed Co" always land in [weekStart, now]; "Old Co" excluded;
    // "Yesterday Co" also lands in-week whenever today isn't Monday (yesterday is still this week).
    const expectedThisWeek = 4 + (withinWeekIsAlsoToday ? 0 : 1);
    const expectedProgressPct = Math.round((expectedThisWeek / 5) * 100);
    // "Yesterday Co" always lands in [yesterdayStart, todayStart); "Week Co" also lands there
    // iff yesterday IS the current week's Monday (today is Tuesday).
    const expectedYesterday = 1 + (weekCoIsYesterday ? 1 : 0);
    // "Last Week Co" always lands in [lastWeekStart, weekStart); "Old Co" also lands there
    // whenever today isn't Monday (same condition that puts "Old Co" outside "this week").
    const expectedLastWeek = 1 + (oldCoInLastWeek ? 1 : 0);

    const res = await extensionCall(alice, mainToken, '/ext/v1/stats');
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      applications_today: expectedToday,
      applications_this_week: expectedThisWeek,
      applications_yesterday: expectedYesterday,
      applications_last_week: expectedLastWeek,
      active_goal: { period_type: 'WEEKLY', target_applications: 5, target_outreach: 2, progress_pct: expectedProgressPct },
      upcoming_interviews: 1,
      follow_ups_due: 1,
      overdue_follow_ups: 1,
      overdue_tasks: 2,
    });
    expect(res.json.pipeline).toEqual(
      expect.arrayContaining([
        { stage: 'SAVED', count: 2 },
        { stage: 'PREPARING', count: 0 },
        { stage: 'APPLIED', count: 1 },
        { stage: 'ASSESSMENT', count: 0 },
        { stage: 'RECRUITER_SCREEN', count: 0 },
        { stage: 'INTERVIEW', count: 1 },
        { stage: 'FINAL_INTERVIEW', count: 0 },
        { stage: 'OFFER', count: 0 }, // the OFFER-stage application is CLOSED, so it is excluded
      ]),
    );
    expect(res.json.pipeline).toHaveLength(8);
    record('m15e-01-real-stats', {
      status: 200, expectedToday, expectedThisWeek, expectedYesterday, expectedLastWeek, expectedProgressPct,
      lastWeekStart: lastWeekStart.toISOString(),
      upcomingInterviews: res.json.upcoming_interviews, followUpsDue: res.json.follow_ups_due,
      overdueFollowUps: res.json.overdue_follow_ups, overdueTasks: res.json.overdue_tasks,
    });
  });

  it('M15E-02 · returns active_goal: null when the user has no goal configured', async () => {
    const bobToken = await createToken(bob, 'Bob stats token', bobWorkspaceId);
    const res = await extensionCall(bob, bobToken.raw, '/ext/v1/stats');
    expect(res.status).toBe(200);
    expect(res.json.active_goal).toBeNull();
    expect(res.json.applications_today).toBe(0);
    expect(res.json.applications_this_week).toBe(0);
    expect(res.json.upcoming_interviews).toBe(0);
    expect(res.json.follow_ups_due).toBe(0);
    expect(res.json.overdue_follow_ups).toBe(0);
    expect(res.json.overdue_tasks).toBe(0);
    record('m15e-02-no-goal', { activeGoal: null });
  });

  it('M15E-03 · a token cannot see another workspace\'s stats (tenant isolation)', async () => {
    // Bob's workspace has no seeded data; Alice's token (scoped to her own workspace)
    // must never be able to read Bob's data, and Bob's token must never see Alice's.
    const bobToken = await createToken(bob, 'Bob isolation token', bobWorkspaceId);
    const bobRes = await extensionCall(bob, bobToken.raw, '/ext/v1/stats');
    expect(bobRes.status).toBe(200);
    // Bob's workspace must not see any of Alice's seeded applications/tasks/interviews/goal.
    expect(bobRes.json).toMatchObject({
      applications_today: 0, applications_this_week: 0, active_goal: null,
      upcoming_interviews: 0, follow_ups_due: 0, overdue_follow_ups: 0, overdue_tasks: 0,
    });
    expect(bobRes.json.pipeline.every((p: { count: number }) => p.count === 0)).toBe(true);
    record('m15e-03-tenant-isolation', { bobSeesOwnEmptyStats: true });
  });

  it('M15E-04 · a revoked or expired token is rejected with 401', async () => {
    const revoked = await createToken(alice, 'Revoked stats token', workspaceId);
    expect((await alice.call(`/extension/tokens/${revoked.id}/revoke`, {})).status).toBe(200);
    expect((await extensionCall(alice, revoked.raw, '/ext/v1/stats')).status).toBe(401);

    const expired = await createToken(alice, 'Expired stats token', workspaceId);
    await admin.from('extension_tokens').update({
      created_at: new Date(Date.now() - 100 * 86_400_000).toISOString(),
      expires_at: new Date(Date.now() - 86_400_000).toISOString(),
    }).eq('id', expired.id);
    expect((await extensionCall(alice, expired.raw, '/ext/v1/stats')).status).toBe(401);
    record('m15e-04-token-lifecycle', { revoked: 401, expired: 401 });
  });

  // Rate limiting on /ext/v1/stats reuses the exact same per-token `extensionRateLimit`
  // limiter already covered end-to-end for this Hono app in
  // tests/integration/m11-extension.test.ts (M11-07): the limiter is shared middleware
  // applied to all `extensionV1` routes, not per-route state, so re-proving it here
  // against a second route would not exercise any new code path.
});
