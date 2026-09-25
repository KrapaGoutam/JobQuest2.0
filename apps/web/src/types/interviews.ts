/** M5 · Interviews & Debriefs: record shapes and canonical values (migration 20260925200000). */
import { dayKey, daysBetweenKeys } from '../lib/time';

/** Approved I3 types (Gate 02B FORM_SPEC 6.1) plus legacy JobQuest1.0 values kept for migrated data. */
export const INTERVIEW_TYPES = [
  { id: 'RECRUITER_SCREEN', label: 'Recruiter screen' },
  { id: 'HIRING_MANAGER', label: 'Hiring manager' },
  { id: 'TECHNICAL', label: 'Technical' },
  { id: 'CODING', label: 'Coding' },
  { id: 'BEHAVIORAL', label: 'Behavioral' },
  { id: 'PANEL', label: 'Panel' },
  { id: 'FINAL', label: 'Final interview' },
  { id: 'OFFER_CALL', label: 'Offer call' },
  { id: 'OTHER', label: 'Other' },
] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number]['id'];

export const INTERVIEW_FORMATS = [
  { id: 'VIDEO', label: 'Video' },
  { id: 'PHONE', label: 'Phone' },
  { id: 'ONSITE', label: 'On-site' },
] as const;
export type InterviewFormat = (typeof INTERVIEW_FORMATS)[number]['id'];

/** Approved I4 results mapped onto the schema outcome (PENDING | PASSED | FAILED + CANCELLED). */
export const INTERVIEW_RESULTS = [
  { id: 'PENDING', label: 'Completed · waiting' },
  { id: 'PASSED', label: 'Advanced' },
  { id: 'FAILED', label: 'Rejected' },
  { id: 'CANCELLED', label: 'Cancelled / moved' },
] as const;
export type InterviewOutcome = (typeof INTERVIEW_RESULTS)[number]['id'];

export const THANK_YOU_OPTIONS = [
  { id: 'NOT_NEEDED', label: 'Not needed' },
  { id: 'TO_SEND', label: 'To send' },
  { id: 'SENT', label: 'Sent' },
] as const;
export type ThankYouStatus = (typeof THANK_YOU_OPTIONS)[number]['id'];

export const DURATION_OPTIONS = [15, 30, 45, 60, 90] as const;

export interface InterviewParticipant {
  contact_id: string;
  contacts: { id: string; full_name: string; relationship_type: string } | null;
}

export interface Interview {
  id: string;
  application_id: string;
  workspace_id: string;
  user_id: string;
  round_number: number;
  interview_type: InterviewType;
  scheduled_at: string;
  duration_minutes: number;
  format: InterviewFormat;
  location_or_link: string | null;
  interviewer_names: string | null;
  preparation_notes: string | null;
  questions_expected: string | null;
  completed_at: string | null;
  outcome: InterviewOutcome | null;
  feedback_notes: string | null;
  questions_asked: string | null;
  next_step: string | null;
  thank_you_status: ThankYouStatus | null;
  created_at: string;
  updated_at: string;
  applications?: { id: string; company_name: string; role_title: string; stage: string; status: string; archived_at: string | null } | null;
  interview_contacts?: InterviewParticipant[] | null;
}

/** Columns a client may change directly (matches the column-level UPDATE grant). */
export const INTERVIEW_EDITABLE_FIELDS = [
  'round_number',
  'interview_type',
  'scheduled_at',
  'duration_minutes',
  'format',
  'location_or_link',
  'interviewer_names',
  'preparation_notes',
  'questions_expected',
  'feedback_notes',
  'questions_asked',
  'next_step',
  'thank_you_status',
] as const;
export type InterviewUpdate = Partial<Pick<Interview, (typeof INTERVIEW_EDITABLE_FIELDS)[number]>>;

export type InterviewTab = 'upcoming' | 'needs_outcome' | 'past';

export const typeLabel = (t: string) => INTERVIEW_TYPES.find((x) => x.id === t)?.label ?? t;
export const formatLabel = (f: string) => INTERVIEW_FORMATS.find((x) => x.id === f)?.label ?? f;
export const resultLabel = (o: string | null) => (o ? INTERVIEW_RESULTS.find((x) => x.id === o)?.label ?? o : '');

/** Display status of one interview at `now`. */
export type InterviewStatus = 'upcoming' | 'needs_outcome' | 'completed' | 'cancelled';
export function interviewStatus(i: Pick<Interview, 'outcome' | 'scheduled_at'>, now: number = Date.now()): InterviewStatus {
  if (i.outcome === 'CANCELLED') return 'cancelled';
  if (i.outcome) return 'completed';
  return Date.parse(i.scheduled_at) <= now ? 'needs_outcome' : 'upcoming';
}

/** Band for the upcoming list, computed on calendar days in the profile time zone (week starts Monday). */
export type UpcomingBand = 'THIS_WEEK' | 'NEXT_WEEK' | 'LATER';
export function upcomingBand(iso: string, timeZone: string, now: number = Date.now()): UpcomingBand {
  const today = dayKey(now, timeZone);
  const [y, m, d] = today.split('-').map(Number);
  const weekday = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0 = Sunday, in the profile zone's calendar
  const daysToNextMonday = ((8 - weekday) % 7) || 7;
  const diff = daysBetweenKeys(today, dayKey(iso, timeZone));
  if (diff < daysToNextMonday) return 'THIS_WEEK';
  if (diff < daysToNextMonday + 7) return 'NEXT_WEEK';
  return 'LATER';
}

export function resultVariant(o: string | null): 'success' | 'danger' | 'info' | 'muted' {
  if (o === 'PASSED') return 'success';
  if (o === 'FAILED') return 'danger';
  if (o === 'PENDING') return 'info';
  return 'muted';
}

/** A meeting link worth rendering as a link (http/https only). */
export function safeMeetingUrl(v: string | null): string | null {
  if (!v) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}
