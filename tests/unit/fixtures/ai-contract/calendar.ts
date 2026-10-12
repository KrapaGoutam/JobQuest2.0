// AI-7 golden fixtures for jobquest.ai-result 1.0 calendar intelligence (workflow calendar_review,
// kind calendar_event). Sanitized and synthetic: no real people, companies, calendars or meetings.
export const calendarEnvelope = (over: Record<string, unknown> = {}) => ({
  contract: 'jobquest.ai-result',
  schema_version: '1.0',
  provider: 'claude',
  workflow: 'calendar_review',
  run: { external_run_id: 'run-cal-1', generated_at: '2026-10-12T12:00:00Z', model_hint: 'fixture' },
  sources: [{ type: 'calendar', ref: 'primary', observed_at: '2026-10-12T12:00:00Z' }],
  findings: [] as unknown[],
  suggestions: [] as unknown[],
  metadata: {},
  ...over,
});

/** A scheduled interview with a stable provider event id (the preferred, most common shape). */
export const calendarFinding = (over: Record<string, unknown> = {}, payloadOver: Record<string, unknown> = {}) => ({
  kind: 'calendar_event',
  category: 'interview',
  dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: 'evt-cal-001' },
  title: 'Technical interview — Example Corp',
  summary: 'Second-round technical interview with the platform team.',
  priority: 'HIGH',
  confidence: 0.92,
  evidence: 'Invitation: Technical interview, Example Corp platform team.',
  payload: {
    version: '1.0', status: 'scheduled', start_at: '2026-10-15T14:00:00-05:00', end_at: '2026-10-15T15:00:00-05:00', time_zone: 'America/Chicago',
    company: 'Example Corp', job_title: 'Staff Engineer', location: 'Video call', meeting_url: 'https://meet.example.com/abc-defg-hij',
    source_event_url: 'https://calendar.example.com/event?eid=ZXZ0LWNhbC0wMDE', organizer_name: 'Pat Recruiter', organizer_domain: 'example.com',
    ...payloadOver,
  },
  ...over,
});

export const deadlineFinding = (over: Record<string, unknown> = {}, payloadOver: Record<string, unknown> = {}) => calendarFinding({
  category: 'assessment_deadline',
  dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: 'evt-cal-deadline-001' },
  title: 'Coding assessment due — Example Corp',
  summary: 'Complete the online coding assessment.',
  ...over,
}, { start_at: undefined, end_at: undefined, deadline_at: '2026-10-16T17:00:00-05:00', location: undefined, meeting_url: undefined, ...payloadOver });

export const allDayFinding = (over: Record<string, unknown> = {}, payloadOver: Record<string, unknown> = {}) => calendarFinding({
  category: 'application_deadline',
  dedupe: { source_type: 'calendar', source_name: 'google_calendar', source_id: 'evt-cal-allday-001' },
  title: 'Application closes — Example Corp',
  ...over,
}, { start_at: undefined, end_at: undefined, all_day: true, start_date: '2026-10-20', location: undefined, meeting_url: undefined, ...payloadOver });

export const calendar = {
  interview: calendarEnvelope({ findings: [calendarFinding()] }),
  deadline: calendarEnvelope({ findings: [deadlineFinding()] }),
  allDay: calendarEnvelope({ findings: [allDayFinding()] }),
};
