import { describe, expect, it } from 'vitest';
import {
  buildTimelineLanes,
  calendarMonthDays,
  normalizeCalendarItems,
  timelinePosition,
  type PlanningApplication,
  type PlanningEvent,
} from '../../apps/web/src/lib/planning';
import type { Interview } from '../../apps/web/src/types/interviews';
import type { Task } from '../../apps/web/src/types/tasks';

const application = (over: Partial<PlanningApplication> = {}): PlanningApplication => ({
  id: 'app-1',
  workspace_id: 'ws-1',
  user_id: 'user-1',
  company_name: 'Northstar Labs',
  role_title: 'Product Engineer',
  stage: 'INTERVIEW',
  status: 'OPEN',
  outcome: null,
  closed_at: null,
  next_action: 'Send portfolio',
  next_action_date: '2026-10-04',
  applied_at: '2026-09-01T15:00:00.000Z',
  archived_at: null,
  created_at: '2026-09-01T15:00:00.000Z',
  last_activity_at: '2026-10-01T15:00:00.000Z',
  ...over,
});

const task = (over: Partial<Task> = {}): Task => ({
  id: 'task-1',
  workspace_id: 'ws-1',
  user_id: 'user-1',
  application_id: 'app-1',
  contact_id: null,
  interview_id: null,
  task_type: 'TASK',
  title: 'Tailor portfolio',
  details: null,
  due_date: '2026-10-03',
  due_at: null,
  priority: 'HIGH',
  status: 'PENDING',
  completed_at: null,
  recurrence_rule: null,
  parent_task_id: null,
  created_at: '2026-10-01T12:00:00.000Z',
  updated_at: '2026-10-01T12:00:00.000Z',
  applications: { id: 'app-1', company_name: 'Northstar Labs', role_title: 'Product Engineer', stage: 'INTERVIEW' },
  contacts: null,
  interviews: null,
  ...over,
});

const interview = (over: Partial<Interview> = {}): Interview => ({
  id: 'interview-1',
  application_id: 'app-1',
  workspace_id: 'ws-1',
  user_id: 'user-1',
  round_number: 2,
  interview_type: 'TECHNICAL',
  scheduled_at: '2026-10-05T00:30:00.000Z',
  duration_minutes: 45,
  format: 'VIDEO',
  location_or_link: null,
  interviewer_names: null,
  preparation_notes: null,
  questions_expected: null,
  completed_at: null,
  outcome: null,
  feedback_notes: null,
  questions_asked: null,
  next_step: null,
  thank_you_status: null,
  created_at: '2026-10-01T12:00:00.000Z',
  updated_at: '2026-10-01T12:00:00.000Z',
  applications: { id: 'app-1', company_name: 'Northstar Labs', role_title: 'Product Engineer', stage: 'INTERVIEW', status: 'OPEN', archived_at: null },
  interview_contacts: [],
  ...over,
});

const event = (over: Partial<PlanningEvent> = {}): PlanningEvent => ({
  id: 'event-1',
  application_id: 'app-1',
  workspace_id: 'ws-1',
  actor_id: 'user-1',
  event_type: 'STAGE_CHANGED',
  payload_version: 1,
  payload: { from_stage: 'APPLIED', to_stage: 'INTERVIEW' },
  created_at: '2026-10-01T15:00:00.000Z',
  applications: { id: 'app-1', user_id: 'user-1', company_name: 'Northstar Labs', role_title: 'Product Engineer' },
  ...over,
});

describe('PL-4B planning models', () => {
  it('keeps date-only records on their stored day and maps timed records in the profile zone', () => {
    const items = normalizeCalendarItems(
      {
        tasks: [
          task(),
          task({ id: 'follow-1', task_type: 'FOLLOW_UP', title: 'Email recruiter', due_date: '2026-10-04' }),
          task({ id: 'timed-1', title: 'Evening reminder', due_date: null, due_at: '2026-10-05T01:00:00.000Z' }),
        ],
        interviews: [interview()],
        applications: [application()],
      },
      'America/Chicago',
      Date.parse('2026-10-02T12:00:00.000Z'),
    );

    expect(items.find((item) => item.id === 'task:task-1')?.day).toBe('2026-10-03');
    expect(items.find((item) => item.id === 'task:timed-1')?.day).toBe('2026-10-04');
    expect(items.find((item) => item.id === 'interview:interview-1')).toMatchObject({
      day: '2026-10-04',
      endAt: '2026-10-05T01:15:00.000Z',
      allDay: false,
    });
    expect(items.find((item) => item.id === 'task:follow-1')?.type).toBe('follow_up');
    expect(items.filter((item) => item.type === 'follow_up')).toHaveLength(1);
    expect(items.find((item) => item.id === 'next-action:app-1')).toMatchObject({ day: '2026-10-04', allDay: true });
  });

  it('honours the profile week start in the 42-day month grid', () => {
    expect(calendarMonthDays('2026-10-18', 0)[0]).toBe('2026-09-27');
    expect(calendarMonthDays('2026-10-18', 1)[0]).toBe('2026-09-28');
    expect(calendarMonthDays('2026-10-18', 1)).toHaveLength(42);
  });

  it('builds stage occupancy and interview duration bars while leaving tasks and next actions as milestones', () => {
    const lanes = buildTimelineLanes(
      {
        applications: [application()],
        events: [event()],
        interviews: [interview({ scheduled_at: '2026-10-02T16:00:00.000Z', duration_minutes: 60 })],
        tasks: [task({ due_date: '2026-10-03' })],
      },
      '2026-09-20T00:00:00.000Z',
      '2026-10-10T00:00:00.000Z',
      Date.parse('2026-10-04T00:00:00.000Z'),
    );

    expect(lanes).toHaveLength(1);
    expect(lanes[0]!.intervals.filter((interval) => interval.kind === 'stage').map((interval) => interval.label)).toEqual(['Applied', 'Interview']);
    expect(lanes[0]!.intervals.find((interval) => interval.kind === 'interview')).toMatchObject({
      startAt: '2026-10-02T16:00:00.000Z',
      endAt: '2026-10-02T17:00:00.000Z',
    });
    expect(lanes[0]!.intervals.filter((interval) => interval.kind === 'stage').at(-1)).toMatchObject({
      endAt: '2026-10-04T00:00:00.000Z',
      openEnded: true,
    });
    expect(lanes[0]!.intervals.some((interval) => interval.id.includes('task'))).toBe(false);
    expect(lanes[0]!.milestones.find((milestone) => milestone.id === 'task:task-1')?.dateOnly).toBe(true);
    expect(lanes[0]!.milestones.find((milestone) => milestone.id === 'next-action:app-1')?.dateOnly).toBe(true);
  });

  it('ends lifecycle occupancy at the exact close instant rather than forecasting a duration', () => {
    const closedAt = '2026-10-03T18:00:00.000Z';
    const lanes = buildTimelineLanes(
      { applications: [application({ status: 'CLOSED', closed_at: closedAt, outcome: 'REJECTED' })], events: [event()], interviews: [], tasks: [] },
      '2026-09-20T00:00:00.000Z',
      '2026-10-10T00:00:00.000Z',
      Date.parse('2026-10-04T00:00:00.000Z'),
    );
    expect(lanes[0]!.intervals.at(-1)).toMatchObject({ endAt: closedAt, openEnded: false });
  });

  it('clamps timeline positions to the visible range', () => {
    const start = '2026-10-01T00:00:00.000Z';
    const end = '2026-10-11T00:00:00.000Z';
    expect(timelinePosition('2026-09-01T00:00:00.000Z', start, end)).toBe(0);
    expect(timelinePosition('2026-10-06T00:00:00.000Z', start, end)).toBe(50);
    expect(timelinePosition('2026-11-01T00:00:00.000Z', start, end)).toBe(100);
  });
});
