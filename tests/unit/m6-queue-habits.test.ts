import { describe, expect, it } from 'vitest';
import { buildQueue, daysOverdue, sectionQueue, todayBounds, type NextActionSource } from '../../apps/web/src/lib/queue';
import { habitProgress, weekStartKey } from '../../apps/web/src/lib/habits';
import { dueLabel, dueState, taskDay, type Task } from '../../apps/web/src/types/tasks';
import { upcomingBand } from '../../apps/web/src/types/interviews';
import { zonedWallTimeToUtcIso } from '../../apps/web/src/lib/time';

const NOW = Date.parse('2026-09-23T18:00:00Z'); // Wed Sep 23, 1:00 PM in Chicago (CDT)
const TZ = 'America/Chicago';
const task = (over: Partial<Task>): Task => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  workspace_id: 'w', user_id: 'u', application_id: null, contact_id: null, interview_id: null,
  task_type: 'TASK', title: 't', details: null, due_date: null, due_at: null, priority: 'MEDIUM',
  status: 'PENDING', completed_at: null, recurrence_rule: null, parent_task_id: null,
  created_at: '', updated_at: '', ...over,
});

describe('M6 tasks: due state in the profile zone', () => {
  it('date-only tasks never shift with UTC conversion', () => {
    const t = task({ due_date: '2026-09-23' });
    expect(taskDay(t, 'Pacific/Kiritimati')).toBe('2026-09-23');
    expect(taskDay(t, 'Pacific/Pago_Pago')).toBe('2026-09-23');
    expect(dueState(t, TZ, NOW)).toBe('today');
  });
  it('timed items are overdue once the instant passes; later today is today', () => {
    expect(dueState(task({ due_at: '2026-09-23T17:00:00Z' }), TZ, NOW)).toBe('overdue');
    expect(dueState(task({ due_at: '2026-09-23T21:30:00Z' }), TZ, NOW)).toBe('today');
    expect(dueLabel(task({ due_at: '2026-09-23T21:30:00Z' }), TZ, NOW)).toBe('4:30 PM');
  });
  it('a timed item late in the UTC day belongs to the profile day', () => {
    // 2026-09-24T03:00Z is still Sep 23 (10 PM) in Chicago but already Sep 24 in UTC.
    expect(taskDay(task({ due_at: '2026-09-24T03:00:00Z' }), TZ)).toBe('2026-09-23');
    expect(dueState(task({ due_at: '2026-09-24T03:00:00Z' }), TZ, NOW)).toBe('today');
  });
  it('labels', () => {
    expect(dueLabel(task({ due_date: '2026-09-18' }), TZ, NOW)).toBe('5d overdue');
    expect(dueLabel(task({ due_date: '2026-09-24' }), TZ, NOW)).toBe('Tomorrow');
    expect(dueLabel(task({ due_date: '2026-09-30' }), TZ, NOW)).toBe('Sep 30');
    expect(dueLabel(task({}), TZ, NOW)).toBe('No date');
  });
});

describe('M6 unified queue', () => {
  const na = (over: Partial<NextActionSource>): NextActionSource => ({
    id: 'a', company_name: 'Meridian Bank', role_title: 'UX Designer', stage: 'APPLIED', priority: 'MEDIUM',
    next_action: 'Final follow-up or close', next_action_date: '2026-09-19', last_activity_at: '', user_id: 'u', ...over,
  });
  const items = buildQueue(
    {
      tasks: [
        task({ id: '1', title: 'Send 2nd follow-up', due_date: '2026-09-18', task_type: 'FOLLOW_UP' }),
        task({ id: '2', title: 'Coffee chat', due_at: '2026-09-23T21:30:00Z', task_type: 'REMINDER', priority: 'LOW' }),
        task({ id: '3', title: 'Tailor resume', due_date: '2026-09-23', priority: 'HIGH' }),
        task({ id: '4', title: 'Later', due_date: '2026-10-02' }),
        task({ id: '5', title: 'Someday' }),
        task({ id: '6', title: 'Done already', due_date: '2026-09-01', status: 'COMPLETED', completed_at: 'x' }),
      ],
      nextActions: [na({})],
      outcomes: [{ id: 'i', interview_type: 'PANEL', round_number: 2, scheduled_at: '2026-09-22T15:00:00Z', user_id: 'u', applications: { id: 'a2', company_name: 'Corvid Labs', role_title: 'Staff' } }],
    },
    TZ,
    NOW,
  );
  const s = sectionQueue(items);
  it('groups overdue / today / upcoming / no date, excluding finished tasks', () => {
    expect(s.overdue.map((i) => i.title)).toEqual(['Send 2nd follow-up', 'Final follow-up or close', 'Record outcome: Panel · round 2']);
    expect(s.today.map((i) => i.title)).toEqual(['Coffee chat', 'Tailor resume']);
    expect(s.upcoming.map((i) => i.title)).toEqual(['Later']);
    expect(s.nodate.map((i) => i.title)).toEqual(['Someday']);
    expect(items.some((i) => i.title === 'Done already')).toBe(false);
  });
  it('most urgent first, with each item typed by its source', () => {
    expect(s.overdue.map((i) => i.kind)).toEqual(['FOLLOW_UP', 'NEXT_ACTION', 'INTERVIEW_OUTCOME']);
    expect(daysOverdue(s.overdue[0]!, TZ, NOW)).toBe(5);
  });
  it('today bounds follow the profile zone', () => {
    const b = todayBounds(TZ, NOW, zonedWallTimeToUtcIso);
    expect(b).toEqual({ today: '2026-09-23', tomorrow: '2026-09-24', start: '2026-09-23T05:00:00.000Z', end: '2026-09-24T05:00:00.000Z' });
  });
});

describe('M6 week_start', () => {
  it('week starts follow profiles.week_start', () => {
    expect(weekStartKey('2026-09-23', 1)).toBe('2026-09-21'); // Monday
    expect(weekStartKey('2026-09-23', 0)).toBe('2026-09-20'); // Sunday
    expect(weekStartKey('2026-09-20', 1)).toBe('2026-09-14'); // a Sunday belongs to the previous Monday week
  });
  it('interview week bands honour week_start (M5 fix)', () => {
    const sat = Date.parse('2026-09-26T17:00:00Z'); // Saturday noon in Chicago
    const sunday = '2026-09-27T17:00:00Z';
    expect(upcomingBand(sunday, TZ, sat, 1)).toBe('THIS_WEEK'); // Monday weeks: Sunday is still this week
    expect(upcomingBand(sunday, TZ, sat, 0)).toBe('NEXT_WEEK'); // Sunday weeks: Sunday starts next week
  });
});

describe('M6 habits: progress and streaks (derived)', () => {
  const log = (d: string, c = 1, t = 1) => ({ log_date: d, completed_count: c, target_count: t });
  it('daily: unfinished today does not break the streak', () => {
    const p = habitProgress({ frequency: 'DAILY', target_count: 1 }, [log('2026-09-20'), log('2026-09-21'), log('2026-09-22')], '2026-09-23', 1);
    expect(p).toMatchObject({ current: 0, done: false, currentStreak: 3, bestStreak: 3 });
    expect(p.heat.slice(-4)).toEqual(['done', 'done', 'done', 'missed']);
  });
  it('counted target with per-day target snapshot', () => {
    const p = habitProgress({ frequency: 'DAILY', target_count: 5 }, [log('2026-09-22', 3, 3), log('2026-09-23', 2, 5)], '2026-09-23', 1);
    expect(p).toMatchObject({ current: 2, target: 5, done: false, currentStreak: 1 }); // yesterday met its target of 3
    expect(p.heat.slice(-2)).toEqual(['done', 'partial']);
  });
  it('weekdays: weekends are skipped, not missed', () => {
    const p = habitProgress({ frequency: 'WEEKDAYS', target_count: 1 }, [log('2026-09-18'), log('2026-09-21'), log('2026-09-22')], '2026-09-23', 1);
    expect(p.currentStreak).toBe(3); // Fri, (weekend skipped), Mon, Tue
    const sat = habitProgress({ frequency: 'WEEKDAYS', target_count: 1 }, [log('2026-09-25')], '2026-09-26', 1);
    expect(sat).toMatchObject({ scheduledToday: false, currentStreak: 1 });
  });
  it('weekly: sums the week by week_start', () => {
    const logs = [log('2026-09-20', 1, 2), log('2026-09-22', 1, 2)];
    expect(habitProgress({ frequency: 'WEEKLY', target_count: 2 }, logs, '2026-09-23', 0)).toMatchObject({ current: 2, done: true, currentStreak: 1 });
    expect(habitProgress({ frequency: 'WEEKLY', target_count: 2 }, logs, '2026-09-23', 1)).toMatchObject({ current: 1, done: false }); // Sunday belongs to the previous Monday week
  });
  it('best streak looks back over history', () => {
    const logs = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-09-22'].map((d) => log(d));
    expect(habitProgress({ frequency: 'DAILY', target_count: 1 }, logs, '2026-09-23', 1)).toMatchObject({ currentStreak: 1, bestStreak: 4 });
  });
});
