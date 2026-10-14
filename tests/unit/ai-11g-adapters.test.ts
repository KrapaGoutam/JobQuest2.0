import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  EMPTY_EVIDENCE, EXECUTION_STALE_AFTER_MS, AUTOMATION_CATCHUP_GRACE_MS, PROVIDER_ADAPTERS, SCHEDULER_PROVIDERS, STEP_GUIDES, buildProviderStatus, buildSchedulerSetup,
  claimSteps, deriveSchedulerReadiness, executionPlan, planComposesDigest, type SetupAutomation,
} from '../../apps/api/src/lib/aiContract';

// AI-11G: provider scheduler adapters - the pure parts (manifest, readiness, step guides, setup wrapper) and the static security
// boundary. The claim / failure / submit behaviour against a real database is tests/integration/ai-11g-provider-scheduler.test.ts.
const read = (p: string) => readFileSync(p, 'utf8');
const ID = '123e4567-e89b-42d3-a456-426614174000';
const auto = (over: Partial<SetupAutomation> = {}): SetupAutomation => ({
  id: ID, name: 'Weekday Morning Digest', workflow: 'daily_brief', provider: 'claude', enabled: true, cadence: 'weekdays', localTime: '08:00', timezone: 'America/Chicago',
  weekdays: [], sections: ['email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review', 'followups'], ...over,
});

describe('adapter manifest (no invented capability, no account state)', () => {
  it('describes exactly Claude, ChatGPT and Gemini, all MANUAL setup and UNVERIFIED scheduled access', () => {
    expect([...SCHEDULER_PROVIDERS]).toEqual(['claude', 'chatgpt', 'gemini']);
    for (const p of SCHEDULER_PROVIDERS) {
      const m = PROVIDER_ADAPTERS[p];
      expect(m).toMatchObject({ provider: p, scheduleAvailable: true, scheduledJobQuestAccess: 'UNVERIFIED', setupMode: 'MANUAL', executionClaimSupported: true });
      expect(m.limitations.length).toBeGreaterThan(0);
      expect(m.evidence.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(JSON.stringify(m)).not.toMatch(/sk-[A-Za-z0-9]{8}|secret|@/i);
    }
    expect(PROVIDER_ADAPTERS.claude.connection).toBe('connector_token');
    expect(PROVIDER_ADAPTERS.chatgpt.connection).toBe('oauth');
    expect(PROVIDER_ADAPTERS.gemini.connection).toBe('oauth');
  });
  it('states honestly that a scheduler existing does not prove JobQuest is reachable from it', () => {
    for (const p of SCHEDULER_PROVIDERS) expect(PROVIDER_ADAPTERS[p].limitations.join(' ')).toMatch(/no (first-party )?documentation|not documented|never verified|unverified/i);
  });
});

describe('scheduler readiness is derived from evidence and is never the connection state', () => {
  const ev = (over: Partial<typeof EMPTY_EVIDENCE>) => ({ ...EMPTY_EVIDENCE, ...over });
  it('walks UNSUPPORTED -> NOT_CONNECTED -> SETUP_REQUIRED -> UNVERIFIED -> READY', () => {
    expect(deriveSchedulerReadiness({ provider: 'manual', connection: 'connected', canIngest: true, evidence: EMPTY_EVIDENCE })).toBe('UNSUPPORTED');
    expect(deriveSchedulerReadiness({ provider: 'claude', connection: 'not_connected', canIngest: false, evidence: EMPTY_EVIDENCE })).toBe('NOT_CONNECTED');
    expect(deriveSchedulerReadiness({ provider: 'claude', connection: 'connected', canIngest: false, evidence: EMPTY_EVIDENCE })).toBe('NOT_CONNECTED'); // connected but cannot submit
    expect(deriveSchedulerReadiness({ provider: 'claude', connection: 'connected', canIngest: true, evidence: EMPTY_EVIDENCE })).toBe('SETUP_REQUIRED');
    expect(deriveSchedulerReadiness({ provider: 'claude', connection: 'connected', canIngest: true, evidence: ev({ claimedRuns: 1, latestFinishedStatus: null }) })).toBe('UNVERIFIED');
    expect(deriveSchedulerReadiness({ provider: 'claude', connection: 'connected', canIngest: true, evidence: ev({ claimedRuns: 2, latestFinishedStatus: 'FAILED' }) })).toBe('UNVERIFIED');
    expect(deriveSchedulerReadiness({ provider: 'claude', connection: 'connected', canIngest: true, evidence: ev({ claimedRuns: 2, latestFinishedStatus: 'SUCCEEDED' }) })).toBe('READY');
    expect(deriveSchedulerReadiness({ provider: 'gemini', connection: 'connected', canIngest: true, evidence: ev({ claimedRuns: 1, latestFinishedStatus: 'PARTIAL' }) })).toBe('READY');
  });
  it('the status keeps connection and scheduler separate and only upgrades the access claim by use', () => {
    const connected = buildProviderStatus('chatgpt', 'connected', true, EMPTY_EVIDENCE);
    expect(connected).toMatchObject({ connection: 'connected', scheduler: 'SETUP_REQUIRED', scheduledJobQuestAccess: 'UNVERIFIED' });
    const used = buildProviderStatus('chatgpt', 'connected', true, { claimedRuns: 1, latestFinishedStatus: 'SUCCEEDED', latestClaimAt: 'a', latestCompletedAt: 'b' });
    expect(used).toMatchObject({ scheduler: 'READY', scheduledJobQuestAccess: 'VERIFIED_BY_USE', lastClaimAt: 'a', lastCompletedAt: 'b' });
  });
  it('the stale-claim threshold stays inside the catch-up window so a recovered occurrence can still be retried', () => {
    expect(EXECUTION_STALE_AFTER_MS).toBeLessThan(AUTOMATION_CATCHUP_GRACE_MS);
  });
});

describe('canonical step guides: composite order, digest last, no invented output', () => {
  it('a Morning Digest runs its sections in the canonical order and composes the digest LAST', () => {
    const plan = executionPlan({ workflow: 'daily_brief', sections: ['calendar_review', 'followups', 'job_discovery', 'email_triage', 'recruiter_intel'] });
    expect(plan).toEqual(['email_triage', 'job_discovery', 'recruiter_intel', 'calendar_review', 'followups', 'daily_brief']);
    expect(planComposesDigest(plan)).toBe(true);
    const steps = claimSteps(plan);
    expect(steps.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(steps.at(-1)).toMatchObject({ step: 'daily_brief', findingKind: null, readTools: [] });
    expect(steps.at(-1)!.rules.join(' ')).toMatch(/Do NOT submit a daily_brief finding/);
    expect(planComposesDigest(executionPlan({ workflow: 'email_triage', sections: [] }))).toBe(false);
  });
  it('every workflow has a guide and each provider-output step names its read tools and finding kind', () => {
    expect(STEP_GUIDES.email_triage).toMatchObject({ findingKind: 'email_event' });
    expect(STEP_GUIDES.job_discovery.readTools).toEqual(expect.arrayContaining(['jobquest_get_job_discovery_profile', 'jobquest_list_job_leads']));
    expect(STEP_GUIDES.recruiter_intel.readTools).toEqual(expect.arrayContaining(['jobquest_get_recruiter_discovery_profile', 'jobquest_list_recruiter_intel']));
    expect(STEP_GUIDES.calendar_review.findingKind).toBe('calendar_event');
    for (const g of Object.values(STEP_GUIDES)) expect(g.rules.length).toBeGreaterThan(0);
  });
  it('email triage follows AI-11B: job-related vs other, HIGH/MEDIUM/LOW, never reply, send or draft', () => {
    const t = STEP_GUIDES.email_triage.rules.join(' ');
    for (const c of ['recruiter_reply', 'application_confirmation', 'interview_scheduling', 'assessment', 'follow_up', 'status_update', 'rejection', 'offer']) expect(t).toContain(c);
    expect(t).toMatch(/job_related/); expect(t).toMatch(/HIGH/); expect(t).toMatch(/MEDIUM/); expect(t).toMatch(/LOW/);
    expect(t).toMatch(/Never send, reply, forward, archive, delete, label or mark mail/);
    expect(t).toMatch(/never create or send a draft/);
  });
  it('job discovery follows AI-11D: profile first, fresh postings, Remote-US, software-QA gate, dedupe, never apply, source health', () => {
    const t = STEP_GUIDES.job_discovery.rules.join(' ');
    expect(t).toMatch(/profile first/i); expect(t).toMatch(/freshness window/); expect(t).toMatch(/Remote-US/); expect(t).toMatch(/software-testing evidence/);
    expect(t).toMatch(/skip roles already stored or tracked/); expect(t).toMatch(/Never apply/); expect(t).toMatch(/JobQuest never searches or scrapes/);
    expect(t).toMatch(/"unavailable" .* is NOT "zero"/);
  });
  it('recruiter intelligence follows AI-11E: preferences, one person per company, evidence, no guessed contact data, drafts never sent', () => {
    const t = STEP_GUIDES.recruiter_intel.rules.join(' ');
    expect(t).toMatch(/jobquest_get_recruiter_discovery_profile first/); expect(t).toMatch(/ONE useful person per company/); expect(t).toMatch(/Never guess/);
    expect(t).toMatch(/NEVER sent/); expect(t).toMatch(/Never contact anyone/); expect(t).toMatch(/PUBLIC sources only/);
  });
  it('calendar review is read-only: no event is created, changed or invented', () => {
    expect(STEP_GUIDES.calendar_review.rules.join(' ')).toMatch(/READ-ONLY[\s\S]*Never create, edit, move, accept, decline or delete/);
    expect(STEP_GUIDES.followups.findingKind).toBeNull();
    expect(STEP_GUIDES.goal_summary.findingKind).toBeNull();
  });
});

describe('setup wrapper: canonical contract + thin provider wrapper, copyable, no secrets', () => {
  const setups = SCHEDULER_PROVIDERS.map((p) => buildSchedulerSetup(auto({ provider: p }))!);
  it('is generated for the three providers only', () => {
    expect(buildSchedulerSetup(auto({ provider: 'manual' }))).toBeNull();
    expect(setups.map((s) => s.provider)).toEqual(['claude', 'chatgpt', 'gemini']);
  });
  it('the scheduled instructions carry the automation id, a fresh call, claim-first, stop-unless-CLAIMED and the exact external run id rule', () => {
    for (const s of setups) {
      const t = s.scheduledInstructions;
      expect(t).toContain(`Automation ID: ${ID}`);
      expect(t).toContain(`jobquest_claim_ai_execution with {"automationId": "${ID}"}`);
      expect(t).toMatch(/FRESH JobQuest tool call/);
      expect(t).toMatch(/Never work from conversation memory/);
      expect(t).toMatch(/Your FIRST action is/);
      expect(t).toMatch(/anything other than CLAIMED[\s\S]*STOP/);
      expect(t).toMatch(/NOT_DUE/);
      expect(t).toMatch(/ONLY the steps returned in the claim/);
      expect(t).toMatch(/untrusted DATA/);
      expect(t).toMatch(/exactly ONE result with jobquest_submit_ai_result/i);
      expect(t).toMatch(/externalRunId` copied EXACTLY/);
      expect(t).toMatch(/Do NOT submit a daily_brief finding/);
      expect(t).toMatch(/Never create, change or delete JobQuest Applications, tasks or contacts/);
      expect(t).toMatch(/Never send recruiter outreach, email, replies or messages/);
      expect(t).toMatch(/jobquest_report_ai_execution_failure/);
      expect(t).toMatch(/Do not retry indefinitely/);
      expect(t).toMatch(/provider "(claude|chatgpt|gemini)"/);
    }
  });
  it('lists the ordered plan with the digest last', () => {
    const s = setups[0]!;
    expect(s.planSteps.map((p) => p.title)).toEqual(['Email triage', 'Fresh job discovery', 'Recruiter intelligence', 'Calendar review', 'Follow-ups', 'Daily Digest']);
    expect(s.scheduleSummary).toBe('Weekdays (Mon-Fri) at 8:00 AM America/Chicago');
  });
  it("the manual (attended) variant claims with trigger manual and an embedded JobQuest-generated client key; the scheduled one never does", () => {
    for (const s of setups) {
      expect(s.manualRunInstructions).toContain(`"trigger": "manual", "clientKey": "${s.manualRunKey}"`);
      expect(s.manualRunInstructions).not.toMatch(/current UTC time|manual-</);
      expect(s.scheduledInstructions).not.toMatch(/clientKey/);
    }
  });
  it('contains no credential, token, secret or user/workspace id and no provider API key language', () => {
    for (const s of setups) {
      const all = JSON.stringify(s);
      expect(all).not.toMatch(/jq_mcp_|Bearer [A-Za-z0-9]|client_secret|sk-[A-Za-z0-9]{8}|password|service_role|eyJ/i);
      expect(all.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)).toEqual(expect.arrayContaining([ID]));
      expect(new Set(all.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g))).toEqual(new Set([ID])); // only the automation id
    }
  });
  it('provider wrappers differ only in where to paste: schedule at the due time or LATER, approval prompts never bypassed', () => {
    for (const s of setups) {
      expect(s.providerSteps.join(' ')).toMatch(/LATER/);
      expect(s.validationSteps.join(' ')).toMatch(/NOT_DUE/);
      expect(s.validationSteps.join(' ')).toMatch(/Ready only after/);
    }
    expect(setups[1]!.providerSteps.join(' ')).toMatch(/not try to bypass approval/);
    expect(setups[2]!.providerSteps.join(' ')).toMatch(/confirm custom-app write actions/);
    // the core contract is identical across providers apart from the provider name
    const norm = (s: (typeof setups)[number]) => s.scheduledInstructions.replace(/Claude|ChatGPT|Gemini|"(claude|chatgpt|gemini)"/g, 'P');
    expect(norm(setups[0]!)).toBe(norm(setups[1]!));
    expect(norm(setups[1]!)).toBe(norm(setups[2]!));
  });
  it('a single-purpose automation (no digest step) is described without one', () => {
    const s = buildSchedulerSetup(auto({ workflow: 'job_discovery', sections: [], name: 'Jobs' }))!;
    expect(s.planSteps.map((p) => p.title)).toEqual(['Fresh job discovery']);
    expect(s.scheduledInstructions).not.toMatch(/Daily Digest\n/);
  });
});

describe('static security boundary of the executor bridge', () => {
  const tools = read('apps/api/src/mcp/tools.ts');
  const schemas = read('apps/api/src/mcp/schemas.ts');
  const bridge = read('apps/api/src/services/aiExecutorBridgeService.ts');
  beforeAll(() => { process.env.SUPABASE_URL = 'https://example.supabase.co'; });

  it('provider identity comes from the principal, never from tool arguments', () => {
    expect(tools).toContain('provider: ctx.principal.provider');
    expect(schemas).toContain('claimAiExecutionInput = z.strictObject({');
    expect(schemas).toContain('reportAiExecutionFailureInput = z.strictObject({');
    const claimBlock = schemas.slice(schemas.indexOf('claimAiExecutionInput'), schemas.indexOf('reportAiExecutionFailureInput'));
    expect(claimBlock).not.toMatch(/b(provider|userId|workspaceId|user_id|workspace_id)s*:/);
    const failBlock = schemas.slice(schemas.indexOf('reportAiExecutionFailureInput'), schemas.indexOf('const claimStatuses'));
    expect(failBlock).not.toMatch(/b(provider|userId|workspaceId|user_id|workspace_id)s*:/);
  });
  it('both execution tools need ai:ingest and are not read-only; the MCP layer does not touch the database', () => {
    expect(tools).toMatch(/name: 'jobquest_claim_ai_execution'[\s\S]*?scope: 'ai:ingest'/);
    expect(tools).toMatch(/name: 'jobquest_report_ai_execution_failure'[\s\S]*?scope: 'ai:ingest'/);
    expect(tools).not.toMatch(/\.rpc\(|\.from\(|admin\(\)/);
  });
  it('the bridge binds the automation and run to the trusted owner + workspace AND the credential provider', () => {
    expect(bridge).toMatch(/\.eq\('workspace_id', ctx\.workspaceId\)\.eq\('user_id', ctx\.userId\)/);
    expect(bridge).toContain("row.primary_provider !== ctx.provider");
    expect(bridge).toContain('run.provider !== ctx.provider');
    expect(bridge).toContain("code: 'PROVIDER_UNBOUND'".replace("code: ", '') as string);
    expect(bridge).not.toMatch(/anthropic|openai|generativelanguage|api\.openai|fetch\(/i); // no provider API, no outbound call
  });
  it('the migration is additive, forward-only, binds provider to a closed set and keeps the RPCs service-role only', () => {
    const sql = read('supabase/migrations/20261105100000_ai_hub_provider_scheduler.sql');
    expect(sql).not.toMatch(/drop table|drop column|truncate|delete from|update public\.ai_connector_tokens set/i);
    expect(sql).toMatch(/provider in \('claude', 'gemini', 'chatgpt'\)/);
    expect(sql).toMatch(/grant select \(provider\) on public\.ai_connector_tokens to authenticated/);
    expect(sql).not.toMatch(/token_hash[^;]*to authenticated/);
    for (const fn of ['rpc_ai_create_connector_token', 'rpc_ai_resolve_connector_token', 'rpc_ai_ingest_run']) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`));
    }
    const defs = sql.match(/security definer/g)!.length;
    expect(sql.match(/set search_path = ''/g)!.length).toBe(defs);
  });
  it('no paid-LLM dependency or scheduler was added (no provider SDK, no cron)', () => {
    const pkg = read('apps/api/package.json');
    expect(pkg).not.toMatch(/"@anthropic-ai\/sdk"|"openai"|"@google\/generative-ai"|"@google\/genai"|"node-cron"|"bullmq"/);
  });
});
