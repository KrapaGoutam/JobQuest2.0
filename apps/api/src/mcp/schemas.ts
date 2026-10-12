// AI-3: strict input/output schemas for the MCP tool registry. Inputs are
// `strictObject`s: unknown keys (including any attempt to pass user_id /
// workspace_id / role) are rejected, never silently honoured. Enums come from the
// same constants the database CHECKs and the AI contract use.
import { z } from 'zod';
import {
  AI_FINDING_KINDS, AI_FINDING_STATUSES, AI_LIMITS, AI_PRIORITIES, AI_PROVIDERS, AI_RUN_STATUSES,
  AI_SUGGESTION_ACTIONS, AI_SUGGESTION_STATUSES, AI_WORKFLOWS, CALENDAR_CATEGORIES, CALENDAR_STATUSES, EMAIL_CATEGORIES,
  JOB_EMPLOYMENT_TYPES, JOB_WORK_ARRANGEMENTS,
} from '../lib/aiContract';
import { CALENDAR_ORDERS } from '../services/aiCalendarService';
import { SOURCE_SEARCH_MAX, SOURCE_STATUS_FILTERS } from '../services/aiExternalIntelligenceService';
import {
  APPLICATION_STAGES, APPLICATION_STATUSES, APP_READ_MAX_PAGE, APP_READ_MAX_PAGE_SIZE, APP_SEARCH_MAX_LENGTH,
} from '../services/applicationReadService';
import { AI_DIGEST_MAX_PAGE_SIZE, AI_READ_MAX_PAGE, AI_READ_MAX_PAGE_SIZE } from '../services/aiReadService';

const iso = z.string().max(40).describe('ISO-8601 timestamp with offset, e.g. 2026-10-01T12:00:00Z');
const id = z.uuid();

const appPaging = {
  page: z.number().int().min(0).max(APP_READ_MAX_PAGE).optional().describe('0-based page index'),
  pageSize: z.number().int().min(1).max(APP_READ_MAX_PAGE_SIZE).optional().describe(`Rows per page (max ${APP_READ_MAX_PAGE_SIZE}, default 20)`),
};
const aiPaging = {
  page: z.number().int().min(0).max(AI_READ_MAX_PAGE).optional().describe('0-based page index'),
  pageSize: z.number().int().min(1).max(AI_READ_MAX_PAGE_SIZE).optional().describe(`Rows per page (max ${AI_READ_MAX_PAGE_SIZE}, default 20)`),
};

export const listApplicationsInput = z.strictObject({
  status: z.enum(APPLICATION_STATUSES).optional(),
  stage: z.enum(APPLICATION_STAGES).optional(),
  search: z.string().max(APP_SEARCH_MAX_LENGTH * 2).optional().describe('Matches company name or role title'),
  ...appPaging,
});
export const getApplicationInput = z.strictObject({ applicationId: id });

export const listAiRunsInput = z.strictObject({
  status: z.enum(AI_RUN_STATUSES).optional(),
  provider: z.enum(AI_PROVIDERS).optional(),
  workflow: z.enum(AI_WORKFLOWS).optional(),
  createdSince: iso.optional(),
  createdBefore: iso.optional(),
  ...aiPaging,
});
export const listAiFindingsInput = z.strictObject({
  status: z.enum(AI_FINDING_STATUSES).optional(),
  kind: z.enum(AI_FINDING_KINDS).optional(),
  priority: z.enum(AI_PRIORITIES).optional(),
  runId: id.optional(),
  ...aiPaging,
});
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Calendar date YYYY-MM-DD in the owner profile time zone');
export const listDailyDigestsInput = z.strictObject({
  dateFrom: calendarDate.optional(),
  dateTo: calendarDate.optional(),
  provider: z.enum(AI_PROVIDERS).optional(),
  page: z.number().int().min(0).max(AI_READ_MAX_PAGE).optional().describe('0-based page index'),
  pageSize: z.number().int().min(1).max(AI_DIGEST_MAX_PAGE_SIZE).optional().describe(`Digests per page (max ${AI_DIGEST_MAX_PAGE_SIZE}, default 7)`),
});
// ---- AI-6 external intelligence reads (ai:read). Bounded pages; no ids that cross scope. ----
const sourceCommon = {
  provider: z.enum(AI_PROVIDERS).optional(),
  status: z.enum(SOURCE_STATUS_FILTERS).optional().describe('ACTIVE = NEW or REVIEWED; ALL includes dismissed. Default ALL.'),
  ...aiPaging,
};
const searchText = z.string().max(SOURCE_SEARCH_MAX);
export const listJobLeadsInput = z.strictObject({
  search: searchText.optional().describe('Matches company or title'),
  company: searchText.optional(),
  title: searchText.optional(),
  location: searchText.optional(),
  workArrangement: z.enum(JOB_WORK_ARRANGEMENTS).optional(),
  employmentType: z.enum(JOB_EMPLOYMENT_TYPES).optional(),
  minMatchScore: z.number().int().min(0).max(100).optional().describe('Provider match score 0-100'),
  discoveredSince: iso.optional(),
  discoveredBefore: iso.optional(),
  postedSince: calendarDate.optional(),
  postedBefore: calendarDate.optional(),
  ...sourceCommon,
});
export const listEmailIntelligenceInput = z.strictObject({
  category: z.enum(EMAIL_CATEGORIES).optional(),
  company: searchText.optional(),
  needsAttention: z.boolean().optional(),
  receivedSince: iso.optional(),
  receivedBefore: iso.optional(),
  ...sourceCommon,
});
export const listRecruiterIntelInput = z.strictObject({
  search: searchText.optional().describe('Matches recruiter name or company'),
  company: searchText.optional(),
  discoveredSince: iso.optional(),
  discoveredBefore: iso.optional(),
  ...sourceCommon,
});
// ---- AI-7 calendar intelligence read (ai:read). Chronological, bounded, no provider event ids. ----
export const listCalendarIntelligenceInput = z.strictObject({
  category: z.enum(CALENDAR_CATEGORIES).optional(),
  eventStatus: z.enum(CALENDAR_STATUSES).optional().describe('Calendar lifecycle: scheduled, tentative, rescheduled or cancelled'),
  company: searchText.optional(),
  deadlinesOnly: z.boolean().optional().describe('Only deadline-type items (assessment, application, take-home deadlines, follow-ups)'),
  startsSince: iso.optional().describe('Items at or after this instant (the start, or the deadline for deadline items)'),
  startsBefore: iso.optional().describe('Items before this instant'),
  order: z.enum(CALENDAR_ORDERS).optional().describe('asc = soonest first (default); desc = latest first'),
  ...sourceCommon,
});
export const listAiSuggestionsInput = z.strictObject({
  status: z.enum(AI_SUGGESTION_STATUSES).optional(),
  findingId: id.optional(),
  action: z.enum(AI_SUGGESTION_ACTIONS).optional(),
  ...aiPaging,
});

/**
 * Envelope shape of `jobquest.ai-result`. Item internals stay `unknown` on purpose:
 * the AI-1C validator inside ingestAiResult is the single authority (it drops unknown
 * fields, strips untrusted scope and bounds sizes). Only counts and enums are bounded here.
 */
export const submitAiResultInput = z.strictObject({
  result: z.looseObject({
    contract: z.literal('jobquest.ai-result'),
    schema_version: z.string().max(16),
    provider: z.enum(AI_PROVIDERS),
    workflow: z.enum(AI_WORKFLOWS),
    run: z.looseObject({}).optional(),
    sources: z.array(z.unknown()).max(AI_LIMITS.sourcesPerRun).optional(),
    findings: z.array(z.unknown()).max(AI_LIMITS.findingsPerRun).optional(),
    suggestions: z.array(z.unknown()).max(AI_LIMITS.suggestionsPerRun).optional(),
    metadata: z.looseObject({}).optional(),
  }),
});

/** Output shapes are concise and loose on item internals; every list is page-bounded. */
const notice = z.string();
const page = { page: z.number(), pageSize: z.number(), hasNext: z.boolean() };
export const listOutput = z.object({ items: z.array(z.looseObject({ id: z.string() })), ...page, notice });
export const getApplicationOutput = z.object({ item: z.looseObject({ id: z.string() }), notice });
export const submitAiResultOutput = z.looseObject({ success: z.boolean(), runId: z.string().nullable(), correlationId: z.string() });
