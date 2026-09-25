import { supabase } from '../supabase';
import {
  INTERVIEW_EDITABLE_FIELDS,
  type Interview,
  type InterviewOutcome,
  type InterviewTab,
  type InterviewUpdate,
  type ThankYouStatus,
} from '../types/interviews';

/** Interview row plus its application and participant contacts (RLS decides what is visible). */
const SELECT = `
  *,
  applications(id, company_name, role_title, stage, status, archived_at),
  interview_contacts(contact_id, contacts(id, full_name, relationship_type))
`;

export const INTERVIEWS_PAGE_SIZE = 50;

export interface InterviewFilters {
  ownerId?: string;
  interviewType?: string;
}

// Supabase's builder types are deep generics; keep the filter helper structural.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyTab<Q extends { is: any; not: any; gte: any; lt: any }>(q: Q, tab: InterviewTab, nowIso: string): Q {
  if (tab === 'upcoming') return q.is('outcome', null).gte('scheduled_at', nowIso);
  if (tab === 'needs_outcome') return q.is('outcome', null).lt('scheduled_at', nowIso);
  return q.not('outcome', 'is', null);
}

/** One page of a tab, filtered and ordered on the server (bounded by `range`). */
export async function fetchInterviews(
  workspaceId: string,
  tab: InterviewTab,
  filters: InterviewFilters = {},
  page = 0,
  pageSize = INTERVIEWS_PAGE_SIZE,
): Promise<{ interviews: Interview[]; total: number }> {
  const nowIso = new Date().toISOString();
  let q = supabase.from('interviews').select(SELECT, { count: 'exact' }).eq('workspace_id', workspaceId);
  q = applyTab(q, tab, nowIso);
  if (filters.ownerId) q = q.eq('user_id', filters.ownerId);
  if (filters.interviewType) q = q.eq('interview_type', filters.interviewType);
  q = q.order('scheduled_at', { ascending: tab === 'upcoming' }).range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, error, count } = await q;
  if (error) throw new Error(`Could not load interviews: ${error.message}`);
  return { interviews: (data ?? []) as Interview[], total: count ?? 0 };
}

/** Tab counts (head-only count queries; no rows transferred). */
export async function fetchInterviewCounts(workspaceId: string, filters: InterviewFilters = {}): Promise<Record<InterviewTab, number>> {
  const nowIso = new Date().toISOString();
  const count = async (tab: InterviewTab) => {
    let q = supabase.from('interviews').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
    q = applyTab(q, tab, nowIso);
    if (filters.ownerId) q = q.eq('user_id', filters.ownerId);
    if (filters.interviewType) q = q.eq('interview_type', filters.interviewType);
    const { count: c, error } = await q;
    if (error) throw new Error(`Could not count interviews: ${error.message}`);
    return c ?? 0;
  };
  const [upcoming, needs_outcome, past] = await Promise.all([count('upcoming'), count('needs_outcome'), count('past')]);
  return { upcoming, needs_outcome, past };
}

/** All interviews of one application, oldest first (application drawer). */
export async function fetchApplicationInterviews(applicationId: string): Promise<Interview[]> {
  const { data, error } = await supabase
    .from('interviews')
    .select(SELECT)
    .eq('application_id', applicationId)
    .order('scheduled_at', { ascending: true })
    .limit(100);
  if (error) throw new Error(`Could not load interviews: ${error.message}`);
  return (data ?? []) as Interview[];
}

export async function fetchInterview(id: string): Promise<Interview> {
  const { data, error } = await supabase.from('interviews').select(SELECT).eq('id', id).single();
  if (error) throw new Error(`Could not load interview: ${error.message}`);
  return data as Interview;
}

export interface ScheduleInterviewParams {
  applicationId: string;
  interviewType: string;
  scheduledAtUtc: string;
  durationMinutes: number;
  format: string;
  roundNumber?: number | null;
  locationOrLink?: string;
  interviewerNames?: string;
  preparationNotes?: string;
  questionsExpected?: string;
  contactIds?: string[];
  /** Explicit, optional stage move (existing workflow RPC, same transaction). */
  moveToStage?: string | null;
}

export async function scheduleInterview(p: ScheduleInterviewParams): Promise<Interview> {
  const { data, error } = await supabase.rpc('rpc_schedule_interview', {
    p_application_id: p.applicationId,
    p_interview_type: p.interviewType,
    p_scheduled_at: p.scheduledAtUtc,
    p_duration_minutes: p.durationMinutes,
    p_format: p.format,
    p_round_number: p.roundNumber ?? null,
    p_location_or_link: p.locationOrLink ?? null,
    p_interviewer_names: p.interviewerNames ?? null,
    p_preparation_notes: p.preparationNotes ?? null,
    p_questions_expected: p.questionsExpected ?? null,
    p_contact_ids: p.contactIds ?? [],
    p_move_to_stage: p.moveToStage ?? null,
  });
  if (error) throw new Error(friendlyError(error.message));
  return data as Interview;
}

/** Direct update of simple fields only (whitelist = column-level UPDATE grant). */
export async function updateInterview(id: string, updates: InterviewUpdate): Promise<void> {
  const payload: Record<string, unknown> = {};
  for (const key of INTERVIEW_EDITABLE_FIELDS) {
    if (key in updates) payload[key] = updates[key];
  }
  const { error } = await supabase.from('interviews').update(payload).eq('id', id);
  if (error) throw new Error(friendlyError(error.message));
}

/** Replace the participant contacts of an interview (insert/delete under RLS). */
export async function setInterviewParticipants(interview: Pick<Interview, 'id' | 'workspace_id'>, current: string[], next: string[]): Promise<void> {
  const add = next.filter((c) => !current.includes(c));
  const remove = current.filter((c) => !next.includes(c));
  if (add.length) {
    const { error } = await supabase
      .from('interview_contacts')
      .insert(add.map((contact_id) => ({ interview_id: interview.id, contact_id, workspace_id: interview.workspace_id })));
    if (error) throw new Error(friendlyError(error.message));
  }
  if (remove.length) {
    const { error } = await supabase.from('interview_contacts').delete().eq('interview_id', interview.id).in('contact_id', remove);
    if (error) throw new Error(friendlyError(error.message));
  }
}

export interface RecordOutcomeParams {
  interviewId: string;
  outcome: InterviewOutcome;
  feedbackNotes?: string;
  questionsAsked?: string;
  nextStep?: string;
  thankYouStatus?: ThankYouStatus | null;
  nextAction?: string;
  nextActionDate?: string | null;
  moveToStage?: string | null;
}

export async function recordInterviewOutcome(p: RecordOutcomeParams): Promise<Interview> {
  const { data, error } = await supabase.rpc('rpc_record_interview_outcome', {
    p_interview_id: p.interviewId,
    p_outcome: p.outcome,
    p_feedback_notes: p.feedbackNotes ?? null,
    p_questions_asked: p.questionsAsked ?? null,
    p_next_step: p.nextStep ?? null,
    p_thank_you_status: p.thankYouStatus ?? null,
    p_next_action: p.nextAction ?? null,
    p_next_action_date: p.nextActionDate || null,
    p_move_to_stage: p.moveToStage ?? null,
  });
  if (error) throw new Error(friendlyError(error.message));
  return data as Interview;
}

export interface SchedulableApplication {
  id: string;
  company_name: string;
  role_title: string;
  stage: string;
  user_id: string;
}

/** Open, unarchived applications a new interview can be attached to (bounded). */
export async function fetchSchedulableApplications(workspaceId: string): Promise<SchedulableApplication[]> {
  const { data, error } = await supabase
    .from('applications')
    .select('id, company_name, role_title, stage, user_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'OPEN')
    .is('archived_at', null)
    .order('last_activity_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`Could not load applications: ${error.message}`);
  return (data ?? []) as SchedulableApplication[];
}

/** Contacts that can be participants: the application owner's own, active contacts. */
export async function fetchParticipantCandidates(workspaceId: string, ownerId: string): Promise<{ id: string; full_name: string; relationship_type: string }[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, full_name, relationship_type')
    .eq('workspace_id', workspaceId)
    .eq('user_id', ownerId)
    .is('archived_at', null)
    .order('full_name')
    .limit(200);
  if (error) throw new Error(`Could not load contacts: ${error.message}`);
  return data ?? [];
}

const MESSAGES: Record<string, string> = {
  APPLICATION_NOT_ACTIVE: 'Interviews can only be scheduled on open, unarchived applications.',
  CONTACT_NOT_LINKABLE: 'Participants must be contacts that belong to the application owner.',
  INTERVIEW_NOT_YET_HELD: 'This interview has not started yet. Cancel or reschedule it instead.',
  STAGE_UNCHANGED: 'The application is already at that stage.',
  INVALID_STAGE: 'That stage is not part of the workflow.',
  NOT_AUTHORIZED: 'You do not have access to this record.',
  INVALID_TIMEZONE: 'That is not a valid time zone.',
};
function friendlyError(message: string): string {
  const key = Object.keys(MESSAGES).find((k) => message.includes(k));
  return key ? MESSAGES[key]! : message;
}
