// AI-11B: pure, deterministic email triage rules shared by the validator and the read services. No I/O and no
// clock (callers pass the reference time), so every rule is unit-testable. The provider CLASSIFIES; these rules
// only validate allowed values and keep the labels coherent (a newsletter is never HIGH, a due-today action is
// never LOW). Nothing here invents a deadline, an action or a match.
import {
  EMAIL_JOB_CATEGORIES, EMAIL_LEGACY_CATEGORY_ALIASES, EMAIL_OTHER_CATEGORIES,
  type AiPriority, type EmailGroup, type EmailUrgency,
} from './constants';

const LEGACY = EMAIL_LEGACY_CATEGORY_ALIASES as Record<string, string>;

/** `interview_invitation` -> `interview`; canonical values and unknown text are returned unchanged. */
export const canonicalEmailCategory = (category: string | null | undefined): string | null => (category ? LEGACY[category] ?? category : null);

/** The group a category belongs to (legacy AI-6 values are job-related). Null for an unknown/absent category. */
export function emailCategoryGroup(category: string | null | undefined): EmailGroup | null {
  const c = canonicalEmailCategory(category);
  if (!c) return null;
  if ((EMAIL_JOB_CATEGORIES as readonly string[]).includes(c)) return 'job_related';
  if ((EMAIL_OTHER_CATEGORIES as readonly string[]).includes(c)) return 'other';
  return null;
}

/** Every STORED category value that reads as `canonical` (itself plus legacy spellings): what a category filter must match. */
export function emailCategoryMembers(canonical: string): string[] {
  return [canonical, ...Object.entries(LEGACY).filter(([, to]) => to === canonical).map(([from]) => from)];
}

/** Every STORED category value in a group (canonical and legacy). */
export function emailGroupCategories(group: EmailGroup): string[] {
  const own = group === 'job_related' ? EMAIL_JOB_CATEGORIES : EMAIL_OTHER_CATEGORIES;
  return [...own, ...Object.entries(LEGACY).filter(([, to]) => (own as readonly string[]).includes(to)).map(([from]) => from)];
}

export const urgencyFromPriority = (p: string | null | undefined): EmailUrgency =>
  p === 'HIGH' || p === 'CRITICAL' ? 'HIGH' : p === 'LOW' || p === 'INFO' ? 'LOW' : 'MEDIUM';

/** The stored priorities that read as an urgency (what an urgency filter must match). */
export const prioritiesForUrgency = (u: EmailUrgency): AiPriority[] => (u === 'HIGH' ? ['HIGH', 'CRITICAL'] : u === 'LOW' ? ['LOW', 'INFO'] : ['NORMAL']);

export const priorityFromUrgency = (u: EmailUrgency): AiPriority => (u === 'HIGH' ? 'HIGH' : u === 'LOW' ? 'LOW' : 'NORMAL');

const RANK: Record<EmailUrgency, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

/** Deadline distance (hours) at or below which an action-needed email is HIGH. */
export const EMAIL_HIGH_DEADLINE_HOURS = 24;
/** Informational categories: never above LOW, whatever the provider says. */
export const EMAIL_LOW_CEILING_CATEGORIES = ['newsletter', 'notification', 'application_confirmation', 'rejection'] as const;
/** Categories that, when they need action, are at least MEDIUM. */
export const EMAIL_ACTION_FLOOR_CATEGORIES = ['interview', 'interview_scheduling', 'assessment', 'offer'] as const;

export interface EmailUrgencyInput {
  category: string | null;
  /** Provider-supplied urgency (validated), if any. */
  urgency: EmailUrgency | null;
  /** Provider-supplied finding priority (validated), only when it was explicitly sent. */
  priority: AiPriority | null;
  /** true = needs action, false = explicitly none, null = unknown. */
  actionNeeded: boolean | null;
  /** Normalized ISO deadline, if the email states one. */
  dueAt: string | null;
  /** Reference instant (ms): the run's generated_at, so the same submission always validates the same way. */
  refTime: number;
}
export interface EmailUrgencyResult {
  urgency: EmailUrgency;
  priority: AiPriority;
  /** Human-readable reason when the provider's label was changed, else null. */
  adjusted: string | null;
  /** Both urgency and priority were sent and disagreed (urgency wins). */
  conflict: boolean;
}

/**
 * Resolves the one stored urgency:
 *   base     = provider urgency, else the urgency of the provider priority, else MEDIUM (the existing NORMAL default)
 *   floor    = action-needed + deadline within 24h (or already past) -> HIGH;
 *              action-needed interview/scheduling/assessment/offer  -> at least MEDIUM
 *   ceiling  = newsletter / notification / application confirmation / rejection -> LOW
 * The ceiling wins last: those categories are informational by definition.
 */
export function resolveEmailUrgency(i: EmailUrgencyInput): EmailUrgencyResult {
  const fromPriority = i.priority ? urgencyFromPriority(i.priority) : null;
  const base: EmailUrgency = i.urgency ?? fromPriority ?? 'MEDIUM';
  let urgency = base;
  const canon = canonicalEmailCategory(i.category);
  let reason: string | null = null;

  if (i.actionNeeded === true) {
    const due = i.dueAt ? Date.parse(i.dueAt) : NaN;
    if (Number.isFinite(due) && due - i.refTime <= EMAIL_HIGH_DEADLINE_HOURS * 3_600_000) {
      if (RANK[urgency] < RANK.HIGH) { urgency = 'HIGH'; reason = 'an action is due within 24 hours'; }
    } else if (canon && (EMAIL_ACTION_FLOOR_CATEGORIES as readonly string[]).includes(canon) && RANK[urgency] < RANK.MEDIUM) {
      urgency = 'MEDIUM'; reason = `${canon} mail that needs action is at least MEDIUM`;
    }
  }
  if (canon && (EMAIL_LOW_CEILING_CATEGORIES as readonly string[]).includes(canon) && urgency !== 'LOW') {
    urgency = 'LOW'; reason = `${canon} mail is informational and never above LOW`;
  }

  const keepExplicit = i.urgency === null && i.priority !== null && fromPriority === urgency;
  return {
    urgency,
    priority: keepExplicit ? (i.priority as AiPriority) : priorityFromUrgency(urgency),
    adjusted: urgency !== base ? reason : null,
    conflict: i.urgency !== null && fromPriority !== null && i.urgency !== fromPriority,
  };
}
