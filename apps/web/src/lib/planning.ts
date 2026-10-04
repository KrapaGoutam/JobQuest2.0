import type { Application, ApplicationEvent } from '../types/applications';
import type { Interview } from '../types/interviews';
import { interviewStatus, typeLabel as interviewTypeLabel } from '../types/interviews';
import type { Task } from '../types/tasks';
import { taskDay, typeLabel as taskTypeLabel } from '../types/tasks';
import { dayKey } from './time';

export type CalendarItemType = 'interview' | 'task' | 'follow_up' | 'next_action';

export type PlanningApplication = Pick<
  Application,
  | 'id'
  | 'workspace_id'
  | 'user_id'
  | 'company_name'
  | 'role_title'
  | 'stage'
  | 'status'
  | 'outcome'
  | 'closed_at'
  | 'next_action'
  | 'next_action_date'
  | 'applied_at'
  | 'archived_at'
  | 'created_at'
  | 'last_activity_at'
>;

export interface PlanningEvent extends ApplicationEvent {
  applications?: Pick<PlanningApplication, 'id' | 'user_id' | 'company_name' | 'role_title'> | null;
}

export interface CalendarItem {
  id: string;
  type: CalendarItemType;
  title: string;
  context: string;
  day: string;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  status: string;
  ownerId: string;
  applicationId: string | null;
  contactId: string | null;
  sourcePath: string;
}

export interface CalendarSourceData {
  tasks: Task[];
  interviews: Interview[];
  applications: PlanningApplication[];
}

export interface TimelineInterval {
  id: string;
  kind: 'stage' | 'interview';
  label: string;
  startAt: string;
  endAt: string;
  openEnded?: boolean;
}

export interface TimelineMilestone {
  id: string;
  kind: 'application' | 'stage' | 'outcome' | 'interview' | 'task' | 'follow_up' | 'next_action' | 'archive' | 'activity';
  title: string;
  detail: string;
  at: string;
  dateOnly?: boolean;
  ownerId: string;
  applicationId: string;
}

export interface TimelineLane {
  application: PlanningApplication;
  intervals: TimelineInterval[];
  milestones: TimelineMilestone[];
}

export interface TimelineSourceData {
  applications: PlanningApplication[];
  events: PlanningEvent[];
  interviews: Interview[];
  tasks: Task[];
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: string | null | undefined): value is string {
  if (!value || !DATE_KEY.test(value)) return false;
  const [year, month, date] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, date!));
  return parsed.toISOString().slice(0, 10) === value;
}

export function shiftDateKey(value: string, days: number): string {
  const [year, month, date] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, date! + days)).toISOString().slice(0, 10);
}

export function monthAnchor(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

export function shiftMonth(value: string, months: number): string {
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1 + months, 1)).toISOString().slice(0, 10);
}

export function calendarMonthDays(value: string, weekStart: 0 | 1): string[] {
  const first = monthAnchor(value);
  const [year, month, date] = first.split('-').map(Number);
  const weekday = new Date(Date.UTC(year!, month! - 1, date!)).getUTCDay();
  const offset = (weekday - weekStart + 7) % 7;
  const gridStart = shiftDateKey(first, -offset);
  return Array.from({ length: 42 }, (_, index) => shiftDateKey(gridStart, index));
}

export function formatDateKey(value: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  const [year, month, date] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(new Date(Date.UTC(year!, month! - 1, date!)));
}

export function normalizeCalendarItems(data: CalendarSourceData, timeZone: string, now = Date.now()): CalendarItem[] {
  const items: CalendarItem[] = [];

  for (const task of data.tasks) {
    const day = taskDay(task, timeZone);
    if (!day) continue;
    const type: CalendarItemType = task.task_type === 'FOLLOW_UP' ? 'follow_up' : 'task';
    const application = task.applications;
    const contact = task.contacts;
    const context = application
      ? `${application.company_name} · ${application.role_title}`
      : contact?.full_name ?? taskTypeLabel(task.task_type);
    const sourcePath = contact
      ? `/w/${encodeURIComponent(task.workspace_id)}/contacts/${encodeURIComponent(contact.id)}`
      : application
        ? `/w/${encodeURIComponent(task.workspace_id)}/applications/${encodeURIComponent(application.id)}`
        : '/tasks';
    items.push({
      id: `task:${task.id}`,
      type,
      title: task.title,
      context,
      day,
      startAt: task.due_at,
      endAt: null,
      allDay: !task.due_at,
      status: task.status.toLowerCase(),
      ownerId: task.user_id,
      applicationId: task.application_id,
      contactId: task.contact_id,
      sourcePath,
    });
  }

  for (const interview of data.interviews) {
    const application = interview.applications;
    items.push({
      id: `interview:${interview.id}`,
      type: 'interview',
      title: `${interviewTypeLabel(interview.interview_type)} · round ${interview.round_number}`,
      context: application ? `${application.company_name} · ${application.role_title}` : 'Interview',
      day: dayKey(interview.scheduled_at, timeZone),
      startAt: interview.scheduled_at,
      endAt: new Date(Date.parse(interview.scheduled_at) + interview.duration_minutes * 60_000).toISOString(),
      allDay: false,
      status: interviewStatus(interview, now),
      ownerId: interview.user_id,
      applicationId: interview.application_id,
      contactId: null,
      sourcePath: '/interviews',
    });
  }

  for (const application of data.applications) {
    if (!application.next_action || !isDateKey(application.next_action_date)) continue;
    items.push({
      id: `next-action:${application.id}`,
      type: 'next_action',
      title: application.next_action,
      context: `${application.company_name} · ${application.role_title}`,
      day: application.next_action_date,
      startAt: null,
      endAt: null,
      allDay: true,
      status: 'pending',
      ownerId: application.user_id,
      applicationId: application.id,
      contactId: null,
      sourcePath: `/w/${encodeURIComponent(application.workspace_id)}/applications/${encodeURIComponent(application.id)}`,
    });
  }

  return items.sort((left, right) => {
    if (left.day !== right.day) return left.day.localeCompare(right.day);
    if (left.startAt && right.startAt) return left.startAt.localeCompare(right.startAt);
    if (left.startAt) return -1;
    if (right.startAt) return 1;
    return left.title.localeCompare(right.title);
  });
}

function humanize(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function clampIso(value: string, lower: number, upper: number): string {
  return new Date(Math.min(upper, Math.max(lower, Date.parse(value)))).toISOString();
}

function eventMilestone(event: PlanningEvent): TimelineMilestone | null {
  const application = event.applications;
  if (!application) return null;
  const payload = event.payload ?? {};
  const base = {
    id: `event:${event.id}`,
    at: event.created_at,
    ownerId: application.user_id,
    applicationId: event.application_id,
  };
  switch (event.event_type) {
    case 'CREATED':
      return { ...base, kind: 'application', title: 'Application created', detail: humanize(payload.stage) };
    case 'APPLIED':
      return { ...base, kind: 'application', title: 'Application submitted', detail: '' };
    case 'STAGE_CHANGED':
      return { ...base, kind: 'stage', title: `Stage changed to ${humanize(payload.to_stage)}`, detail: `From ${humanize(payload.from_stage)}` };
    case 'OUTCOME_CHANGED':
      return { ...base, kind: 'outcome', title: `Outcome: ${humanize(payload.outcome)}`, detail: humanize(payload.closure_reason) };
    case 'INTERVIEW_COMPLETED':
      return { ...base, kind: 'interview', title: `${humanize(payload.interview_type)} completed`, detail: humanize(payload.outcome) };
    case 'NEXT_ACTION_CHANGED':
      return { ...base, kind: 'next_action', title: 'Next action updated', detail: String(payload.next_action ?? '') };
    case 'ARCHIVED':
      return { ...base, kind: 'archive', title: 'Application archived', detail: '' };
    case 'RESTORED':
      return { ...base, kind: 'archive', title: 'Application restored', detail: '' };
    case 'KEEP_ACTIVE':
      return { ...base, kind: 'activity', title: 'Application reviewed', detail: 'Kept active' };
    default:
      return null;
  }
}

export function buildTimelineLanes(
  data: TimelineSourceData,
  rangeStartIso: string,
  rangeEndIso: string,
  now = Date.now(),
): TimelineLane[] {
  const rangeStart = Date.parse(rangeStartIso);
  const rangeEnd = Date.parse(rangeEndIso);
  const eventsByApplication = new Map<string, PlanningEvent[]>();
  const interviewsByApplication = new Map<string, Interview[]>();
  const tasksByApplication = new Map<string, Task[]>();

  for (const event of data.events) {
    const list = eventsByApplication.get(event.application_id) ?? [];
    list.push(event);
    eventsByApplication.set(event.application_id, list);
  }
  for (const interview of data.interviews) {
    const list = interviewsByApplication.get(interview.application_id) ?? [];
    list.push(interview);
    interviewsByApplication.set(interview.application_id, list);
  }
  for (const task of data.tasks) {
    if (!task.application_id) continue;
    const list = tasksByApplication.get(task.application_id) ?? [];
    list.push(task);
    tasksByApplication.set(task.application_id, list);
  }

  const lanes: TimelineLane[] = [];
  for (const application of data.applications) {
    const created = Date.parse(application.created_at);
    const observationEnd = application.status === 'OPEN' && !application.archived_at
      ? Math.min(rangeEnd, now)
      : rangeEnd;
    const lifecycleEnd = Math.min(
      observationEnd,
      application.archived_at ? Date.parse(application.archived_at) : observationEnd,
      application.closed_at ? Date.parse(application.closed_at) : observationEnd,
    );
    const events = (eventsByApplication.get(application.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const interviews = (interviewsByApplication.get(application.id) ?? []).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    const tasks = tasksByApplication.get(application.id) ?? [];
    const intervals: TimelineInterval[] = [];
    const milestones: TimelineMilestone[] = [];

    const stageEvents = events.filter((event) => event.event_type === 'STAGE_CHANGED');
    let cursor = Math.max(rangeStart, created);
    let stage = stageEvents.length > 0
      ? String(stageEvents[0]!.payload?.from_stage ?? application.stage)
      : application.stage;

    for (const event of stageEvents) {
      const at = Date.parse(event.created_at);
      if (at > cursor && cursor < lifecycleEnd) {
        intervals.push({
          id: `stage:${application.id}:${event.id}`,
          kind: 'stage',
          label: humanize(stage),
          startAt: new Date(cursor).toISOString(),
          endAt: new Date(Math.min(at, lifecycleEnd)).toISOString(),
        });
      }
      cursor = Math.max(cursor, at);
      stage = String(event.payload?.to_stage ?? stage);
    }
    if (cursor < lifecycleEnd && lifecycleEnd > rangeStart && created < observationEnd) {
      intervals.push({
        id: `stage:${application.id}:current`,
        kind: 'stage',
        label: humanize(stage),
        startAt: new Date(cursor).toISOString(),
        endAt: new Date(lifecycleEnd).toISOString(),
        openEnded: application.status === 'OPEN' && !application.archived_at,
      });
    }

    if (created >= rangeStart && created < rangeEnd && !events.some((event) => event.event_type === 'CREATED')) {
      milestones.push({
        id: `created:${application.id}`,
        kind: 'application',
        title: 'Application created',
        detail: humanize(application.stage),
        at: application.created_at,
        ownerId: application.user_id,
        applicationId: application.id,
      });
    }
    for (const event of events) {
      const milestone = eventMilestone(event);
      if (milestone) milestones.push(milestone);
    }

    for (const interview of interviews) {
      const start = Date.parse(interview.scheduled_at);
      const end = start + interview.duration_minutes * 60_000;
      if (end <= rangeStart || start >= rangeEnd) continue;
      const label = `${interviewTypeLabel(interview.interview_type)} · round ${interview.round_number}`;
      intervals.push({
        id: `interview:${interview.id}`,
        kind: 'interview',
        label,
        startAt: clampIso(interview.scheduled_at, rangeStart, rangeEnd),
        endAt: new Date(Math.min(rangeEnd, end)).toISOString(),
      });
      milestones.push({
        id: `interview-milestone:${interview.id}`,
        kind: 'interview',
        title: label,
        detail: interviewStatus(interview),
        at: interview.scheduled_at,
        ownerId: interview.user_id,
        applicationId: interview.application_id,
      });
    }

    for (const task of tasks) {
      const at = task.due_at ?? (task.due_date ? `${task.due_date}T12:00:00.000Z` : null);
      if (!at || Date.parse(at) < rangeStart || Date.parse(at) >= rangeEnd) continue;
      milestones.push({
        id: `task:${task.id}`,
        kind: task.task_type === 'FOLLOW_UP' ? 'follow_up' : 'task',
        title: task.title,
        detail: `${taskTypeLabel(task.task_type)} · ${humanize(task.status)}`,
        at,
        dateOnly: !task.due_at,
        ownerId: task.user_id,
        applicationId: application.id,
      });
    }

    if (application.next_action && isDateKey(application.next_action_date)) {
      const at = `${application.next_action_date}T12:00:00.000Z`;
      if (Date.parse(at) >= rangeStart && Date.parse(at) < rangeEnd) {
        milestones.push({
          id: `next-action:${application.id}`,
          kind: 'next_action',
          title: application.next_action,
          detail: 'Next action',
          at,
          dateOnly: true,
          ownerId: application.user_id,
          applicationId: application.id,
        });
      }
    }

    intervals.sort((a, b) => a.startAt.localeCompare(b.startAt));
    milestones.sort((a, b) => a.at.localeCompare(b.at));
    if (intervals.length || milestones.length) lanes.push({ application, intervals, milestones });
  }

  return lanes.sort((left, right) => {
    const leftAt = left.milestones.at(-1)?.at ?? left.intervals.at(-1)?.endAt ?? left.application.created_at;
    const rightAt = right.milestones.at(-1)?.at ?? right.intervals.at(-1)?.endAt ?? right.application.created_at;
    return rightAt.localeCompare(leftAt);
  });
}

export function timelinePosition(iso: string, rangeStartIso: string, rangeEndIso: string): number {
  const start = Date.parse(rangeStartIso);
  const end = Date.parse(rangeEndIso);
  if (end <= start) return 0;
  return Math.max(0, Math.min(100, ((Date.parse(iso) - start) / (end - start)) * 100));
}
