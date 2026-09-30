import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildCaptureDraft, canSafelySave, classifyConnectionScreen, classifyExtraction, clampPercent, computeCaptureCompleteness,
  computeDuplicateIdentityKey,
  computeGoalRemainder, DASHBOARD_PIPELINE_STAGES, describeEnvironment,
  evaluateSaveGate, formatStageLabel, formatStatValue,
  initDuplicateContext, isSaveContextValid,
  mapDuplicateLevel, mapPipelineForDisplay, nextRovingIndex, normalizeIdentity,
  onDuplicateCheckResult, onDuplicateCheckStart, onIdentityChange,
  resolveCaptureScreen, saveAsToStageId,
  shouldRescanForTabChange, stagePipCount,
} from '../sidepanel-logic.js';
import { getCapturePreferences, saveCapturePreferences } from '../api/jobquest.js';

const workflow = {
  default_action: 'APPLIED',
  stages: [
    { id: 'SAVED', label: 'Saved' },
    { id: 'APPLIED', label: 'Applied' },
    { id: 'INTERVIEW', label: 'Interview' },
    { id: 'OFFER', label: 'Offer' },
  ],
};

beforeEach(() => {
  const values = {};
  globalThis.chrome = {
    storage: { local: {
      get: vi.fn(async (keys) => Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]]))),
      set: vi.fn(async (next) => Object.assign(values, next)),
      remove: vi.fn(async (keys) => keys.forEach((key) => delete values[key])),
    } },
  };
});

describe('duplicate-level mapping', () => {
  it('maps EXACT_POSTING already in SAVED stage to the info "saved" level', () => {
    const result = { match_type: 'EXACT_POSTING', matches: [{ application: { stage: 'SAVED', company_name: 'Acme' } }] };
    expect(mapDuplicateLevel(result)).toMatchObject({ level: 'saved' });
  });

  it('maps EXACT_POSTING in a non-terminal stage to "strong"', () => {
    const result = { match_type: 'EXACT_POSTING', matches: [{ application: { stage: 'INTERVIEW' } }] };
    expect(mapDuplicateLevel(result)).toMatchObject({ level: 'strong' });
  });

  it('maps SAME_ROLE to "probable" and COMPANY_ONLY to non-blocking "possible"', () => {
    expect(mapDuplicateLevel({ match_type: 'SAME_ROLE', matches: [{}] })).toMatchObject({ level: 'probable' });
    expect(mapDuplicateLevel({ match_type: 'COMPANY_ONLY', matches: [{}] })).toMatchObject({ level: 'possible' });
  });

  it('maps NONE to "none" and CHECK_ERROR to "error" (never silently treated as no duplicate)', () => {
    expect(mapDuplicateLevel({ match_type: 'NONE', matches: [] })).toMatchObject({ level: 'none', match: null });
    expect(mapDuplicateLevel({ match_type: 'CHECK_ERROR', matches: [] })).toMatchObject({ level: 'error', match: null });
  });
});

describe('extraction and screen classification', () => {
  it('classifies detected/partial/none from company+title presence', () => {
    expect(classifyExtraction({ company: 'Acme', jobTitle: 'Engineer' })).toBe('detected');
    expect(classifyExtraction({ company: 'Acme' })).toBe('partial');
    expect(classifyExtraction({})).toBe('none');
  });

  it('resolves the final capture screen from extraction + duplicate level', () => {
    expect(resolveCaptureScreen('none', 'none')).toBe('none');
    expect(resolveCaptureScreen('detected', 'strong')).toBe('duplicate');
    expect(resolveCaptureScreen('detected', 'saved')).toBe('duplicate');
    expect(resolveCaptureScreen('partial', 'none')).toBe('partial');
    expect(resolveCaptureScreen('detected', 'possible')).toBe('possible');
    expect(resolveCaptureScreen('detected', 'none')).toBe('detected');
  });

  it('routes an expired/revoked or invalid-input connection to setup, and unreachable to offline', () => {
    expect(classifyConnectionScreen({ configured: false, connectionError: null })).toBe('setup');
    expect(classifyConnectionScreen({ configured: true, connectionError: { state: 'EXPIRED_OR_REVOKED' } })).toBe('setup');
    expect(classifyConnectionScreen({ configured: true, connectionError: { state: 'SERVER_UNAVAILABLE' } })).toBe('offline');
  });
});

describe('captured-data completeness', () => {
  it('computes a percent plus present/missing field lists', () => {
    const result = computeCaptureCompleteness({ jobTitle: 'Engineer', company: 'Acme' });
    expect(result.present).toEqual(['jobTitle', 'company']);
    expect(result.missing).toContain('location');
    expect(result.percent).toBe(Math.round((2 / 8) * 100));
  });

  it('is 0% for a fully empty extraction and 100% for every field present', () => {
    expect(computeCaptureCompleteness({}).percent).toBe(0);
    expect(computeCaptureCompleteness({
      jobTitle: 'a', company: 'b', location: 'c', workArrangement: 'd', employmentType: 'e',
      salaryRange: 'f', description: 'g', jobUrl: 'h',
    }).percent).toBe(100);
  });
});

describe('save-as → stage resolution (real workflow only, never hardcoded)', () => {
  it('maps "later" to the workflow\'s own Saved stage and "applied" to its Applied stage', () => {
    expect(saveAsToStageId('later', workflow)).toBe('SAVED');
    expect(saveAsToStageId('applied', workflow)).toBe('APPLIED');
  });

  it('falls back to default_action, then the first stage, when no label match exists', () => {
    const noSaved = { default_action: 'OFFER', stages: [{ id: 'OFFER', label: 'Offer' }] };
    expect(saveAsToStageId('later', noSaved)).toBe('OFFER');
    expect(saveAsToStageId('later', { stages: [{ id: 'X', label: 'X' }] })).toBe('X');
    expect(saveAsToStageId('later', {})).toBe('');
  });

  it('computes pip counts proportional to stage position in the real stage list', () => {
    expect(stagePipCount('SAVED', workflow)).toBe(2);
    expect(stagePipCount('OFFER', workflow)).toBe(8);
    expect(stagePipCount('missing', workflow)).toBe(0);
  });
});

describe('roving tabindex arrow-key navigation', () => {
  it('wraps forward and backward at the ends', () => {
    expect(nextRovingIndex(0, 3, 'ArrowRight')).toBe(1);
    expect(nextRovingIndex(2, 3, 'ArrowRight')).toBe(0);
    expect(nextRovingIndex(0, 3, 'ArrowLeft')).toBe(2);
  });

  it('supports Home/End and is a no-op for unrelated keys', () => {
    expect(nextRovingIndex(1, 4, 'Home')).toBe(0);
    expect(nextRovingIndex(1, 4, 'End')).toBe(3);
    expect(nextRovingIndex(2, 4, 'Enter')).toBe(2);
  });
});

describe('active-tab change detection', () => {
  it('rescans when there was no previous tab, or the URL changed, but not mid-navigation', () => {
    expect(shouldRescanForTabChange(null, { url: 'https://a.test', status: 'complete' })).toBe(true);
    expect(shouldRescanForTabChange({ url: 'https://a.test' }, { url: 'https://b.test', status: 'complete' })).toBe(true);
    expect(shouldRescanForTabChange({ url: 'https://a.test' }, { url: 'https://a.test', status: 'complete' })).toBe(false);
    expect(shouldRescanForTabChange({ url: 'https://a.test' }, { url: 'https://b.test', status: 'loading' })).toBe(false);
  });
});

describe('capture draft assembly', () => {
  it('builds the same shape popup.js\'s save() posts to /captures and never emits duplicate_override=true', () => {
    const draft = buildCaptureDraft({
      captured: { externalJobId: 'ext-1', salaryCurrency: 'USD', description: 'desc', salaryRange: '$100k - $150k' },
      company: 'Acme', jobTitle: 'Engineer', stageId: 'APPLIED', jobUrl: 'https://a.test',
      source: 'LinkedIn', location: 'Remote', workArrangement: 'Remote', employmentType: 'Full-time',
      salary: { min: 100000, max: 150000 }, notes: 'note', appliedAtDate: '2026-01-01',
      duplicateOverride: true, // legacy/forged caller input must be ignored
      resumeId: 'r1', resumeLabel: null,
    });
    expect(draft).toMatchObject({
      company: 'Acme', job_title: 'Engineer', stage: 'APPLIED', external_job_id: 'ext-1',
      salary_min: 100000, salary_max: 150000, duplicate_override: false, resume_id: 'r1',
      applied_at: '2026-01-01T12:00:00.000Z',
    });
    expect(draft.snapshot.description).toBe('desc');
    expect(draft.snapshot.raw_payload.salary_range).toBe('$100k - $150k');
  });

  it('respects manual review and edit overrides for all capture fields', () => {
    const originalExtracted = {
      company: 'Original Inc',
      jobTitle: 'Original Title',
      location: 'New York, NY',
      workArrangement: 'Onsite',
      employmentType: 'Contract',
      confidence: 0.85,
    };
    const draft = buildCaptureDraft({
      captured: originalExtracted,
      company: 'Edited Corp',
      jobTitle: 'Lead Architect',
      stageId: 'SAVED',
      jobUrl: 'https://edited.jobs/123',
      source: 'Direct Career Page',
      location: 'Remote, US',
      workArrangement: 'Remote',
      employmentType: 'Full-time',
      salary: { min: 180000, max: 220000 },
      notes: 'Applied with referral code REF-99',
      appliedAtDate: '2026-03-29',
      duplicateOverride: false,
      resumeId: null,
      resumeLabel: 'Architecture Resume v3',
    });

    expect(draft).toMatchObject({
      company: 'Edited Corp',
      job_title: 'Lead Architect',
      stage: 'SAVED',
      job_url: 'https://edited.jobs/123',
      source: 'Direct Career Page',
      location: 'Remote, US',
      work_arrangement: 'Remote',
      employment_type: 'Full-time',
      salary_min: 180000,
      salary_max: 220000,
      notes: 'Applied with referral code REF-99',
      applied_at: '2026-03-29T12:00:00.000Z',
      resume_id: null,
      resume_label: 'Architecture Resume v3',
      duplicate_override: false,
    });
  });
});

describe('environment label', () => {
  it('prefers an explicit dev/prod preset, else infers from the instance URL', () => {
    expect(describeEnvironment('https://jobquest.example.test', 'prod')).toBe('Production');
    expect(describeEnvironment('https://jobquest.example.test', 'dev')).toBe('Preview / Development');
    expect(describeEnvironment('http://localhost:5173')).toBe('Preview / Development');
    expect(describeEnvironment('https://jobquest2.vercel.app')).toBe('Production');
  });
});

describe('dashboard/analytics stats presentation helpers', () => {
  const pipeline = [
    { stage: 'SAVED', count: 5 }, { stage: 'PREPARING', count: 0 }, { stage: 'APPLIED', count: 24 },
    { stage: 'ASSESSMENT', count: 3 }, { stage: 'RECRUITER_SCREEN', count: 2 }, { stage: 'INTERVIEW', count: 1 },
    { stage: 'FINAL_INTERVIEW', count: 0 }, { stage: 'OFFER', count: 0 },
  ];

  it('maps the Dashboard mini pipeline to exactly Applied/Assessment/Interview/Offer, in that order', () => {
    const rows = mapPipelineForDisplay(pipeline, DASHBOARD_PIPELINE_STAGES);
    expect(rows.map((row) => row.stage)).toEqual(['APPLIED', 'ASSESSMENT', 'INTERVIEW', 'OFFER']);
    expect(rows.map((row) => row.label)).toEqual(['Applied', 'Assessment', 'Interview', 'Offer']);
    expect(rows.find((row) => row.stage === 'APPLIED')).toMatchObject({ count: 24, percent: 100 });
    expect(rows.find((row) => row.stage === 'OFFER')).toMatchObject({ count: 0, percent: 0 });
  });

  it('maps the Analytics full pipeline as all 8 real stages, unfiltered, when stageIds is omitted', () => {
    const rows = mapPipelineForDisplay(pipeline, null);
    expect(rows).toHaveLength(8);
    expect(rows.map((row) => row.stage)).toEqual(pipeline.map((row) => row.stage));
  });

  it('never divides by zero: an all-zero subset renders every bar at 0%', () => {
    const zeroPipeline = pipeline.map((row) => ({ ...row, count: 0 }));
    const rows = mapPipelineForDisplay(zeroPipeline, DASHBOARD_PIPELINE_STAGES);
    expect(rows.every((row) => row.percent === 0)).toBe(true);
  });

  it('formats unknown stage ids by returning the id itself', () => {
    expect(formatStageLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(formatStageLabel('SAVED')).toBe('Saved');
  });

  it('computes the goal remainder, floored at zero, and null when there is no active goal', () => {
    expect(computeGoalRemainder({ target_applications: 15 }, 12)).toBe(3);
    expect(computeGoalRemainder({ target_applications: 15 }, 20)).toBe(0);
    expect(computeGoalRemainder(null, 5)).toBeNull();
    expect(computeGoalRemainder({}, 5)).toBeNull();
  });

  it('clamps a progress percent into a safe 0-100 integer, including null/undefined/NaN', () => {
    expect(clampPercent(80)).toBe(80);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(-10)).toBe(0);
    expect(clampPercent(null)).toBe(0);
    expect(clampPercent(undefined)).toBe(0);
  });

  it('formats a present numeric stat as a string and a missing one as an em dash', () => {
    expect(formatStatValue(3)).toBe('3');
    expect(formatStatValue(0)).toBe('0');
    expect(formatStatValue(undefined)).toBe('—');
    expect(formatStatValue(null)).toBe('—');
  });
});

describe('capture preferences storage (new chrome.storage.local keys)', () => {
  it('defaults every toggle on and Default Stage empty until saved', async () => {
    await expect(getCapturePreferences()).resolves.toEqual({
      defaultStage: '', warnOnDuplicates: true, autoDetectJobPages: true, openCaptureOnDetect: true,
    });
  });

  it('persists and round-trips a saved preference set', async () => {
    await saveCapturePreferences({ defaultStage: 'APPLIED', warnOnDuplicates: false, autoDetectJobPages: true, openCaptureOnDetect: false });
    await expect(getCapturePreferences()).resolves.toEqual({
      defaultStage: 'APPLIED', warnOnDuplicates: false, autoDetectJobPages: true, openCaptureOnDetect: false,
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ capturePreferences: {
      defaultStage: 'APPLIED', warnOnDuplicates: false, autoDetectJobPages: true, openCaptureOnDetect: false,
    } });
  });

  it('normalizes malformed input rather than throwing', async () => {
    await saveCapturePreferences({ defaultStage: 42, warnOnDuplicates: 'yes' });
    await expect(getCapturePreferences()).resolves.toEqual({
      defaultStage: '', warnOnDuplicates: true, autoDetectJobPages: false, openCaptureOnDetect: false,
    });
  });
});

describe('duplicate protection: duplicates are never saved (final M15-E policy)', () => {
  const jobA = {
    company: 'Stripe',
    jobTitle: 'Staff Software Engineer',
    jobUrl: 'https://stripe.com/jobs/123',
    externalJobId: '123',
    source: 'Stripe Careers',
    location: 'Remote',
  };

  const jobB = {
    company: 'Notion',
    jobTitle: 'Senior Product Manager',
    jobUrl: 'https://notion.so/jobs/456',
    externalJobId: '456',
    source: 'Notion Careers',
    location: 'San Francisco, CA',
  };

  const dupResult = { match_type: 'EXACT_POSTING', matches: [{ application: { company_name: 'Stripe' } }] };
  const cleanResult = { match_type: 'NONE', matches: [] };

  /** Simulates the Side Panel's forced save-time check against `state`. */
  const checkerReturning = (state, contextSeq, result) => vi.fn(async (identity) => {
    const start = onDuplicateCheckStart(state);
    onDuplicateCheckResult(state, contextSeq, start.checkSeq, identity, result);
  });

  it('normalizes identity fields with safe whitespace trimming and defaults', () => {
    expect(normalizeIdentity({ company: '  Acme  ', jobTitle: ' Lead ' })).toEqual({
      company: 'Acme', jobTitle: 'Lead', jobUrl: '', externalJobId: '', source: '', location: '',
    });
  });

  describe('no override path exists', () => {
    it('the duplicate lifecycle exposes no override state or authorization API', async () => {
      const logic = await import('../sidepanel-logic.js');
      expect(logic.authorizeDuplicateOverride).toBeUndefined();
      expect(logic.isDuplicateOverriddenFor).toBeUndefined();
      expect(initDuplicateContext(1)).not.toHaveProperty('overrideKey');
    });

    it('a known duplicate stays BLOCKED for the exact identity and never becomes savable', () => {
      const state = initDuplicateContext(1);
      const start = onDuplicateCheckStart(state);
      onDuplicateCheckResult(state, 1, start.checkSeq, jobA, dupResult);
      expect(canSafelySave(state, jobA)).toEqual({ canSave: false, reason: 'BLOCKED_DUPLICATE' });
      // Forging an override flag on the state changes nothing.
      state.overrideKey = computeDuplicateIdentityKey(jobA);
      expect(canSafelySave(state, jobA)).toEqual({ canSave: false, reason: 'BLOCKED_DUPLICATE' });
    });

    it('sidepanel/popup source has no Save Anyway control, override authorization, or duplicate_override=true', () => {
      const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
      for (const name of ['sidepanel.html', 'sidepanel.js', 'sidepanel-logic.js', 'popup.html', 'popup.js']) {
        const source = read(name);
        expect(source, name).not.toMatch(/Save as New Application Anyway|Save Anyway|save-anyway|footer-secondary/i);
        expect(source, name).not.toMatch(/authorizeDuplicateOverride|isDuplicateOverriddenFor|overrideKey|overrideIdentityKey|bypassDuplicate/);
        expect(source, name).not.toMatch(/duplicate_override\s*:\s*(?!false\b|\s)/i);
      }
    });
  });

  describe('B2: identity edits invalidate the verdict', () => {
    const seed = () => {
      const state = initDuplicateContext(1);
      const start = onDuplicateCheckStart(state);
      onDuplicateCheckResult(state, 1, start.checkSeq, jobA, dupResult);
      expect(state.info.level).toBe('strong');
      return state;
    };

    it.each([
      ['Company', { company: 'Stripe Payments' }],
      ['Title', { jobTitle: 'Principal Engineer' }],
      ['Job URL', { jobUrl: 'https://stripe.com/jobs/999' }],
      ['Job ID', { externalJobId: '999' }],
      ['Source', { source: 'LinkedIn' }],
      ['Location', { location: 'Berlin' }],
    ])('editing %s invalidates duplicate state and requires a new check', (_field, patch) => {
      const state = seed();
      const edited = { ...jobA, ...patch };
      onIdentityChange(state, edited);
      expect(state.isStale).toBe(true);
      expect(state.info.level).toBe('none');
      expect(canSafelySave(state, edited)).toEqual({ canSave: false, reason: 'NEEDS_CHECK' });
    });

    it('a verdict for the old identity cannot authorize a save of changed fields', () => {
      const state = initDuplicateContext(1);
      const start = onDuplicateCheckStart(state);
      onDuplicateCheckResult(state, 1, start.checkSeq, jobA, cleanResult);
      expect(canSafelySave(state, jobA)).toEqual({ canSave: true, reason: 'VERIFIED_SAFE' });
      expect(canSafelySave(state, { ...jobA, company: 'Google' })).toEqual({ canSave: false, reason: 'NEEDS_CHECK' });
    });

    it('recheck of the edited identity yields a fresh clean verdict', () => {
      const state = seed();
      const edited = { ...jobA, company: 'Stripe Payments' };
      onIdentityChange(state, edited);
      const next = onDuplicateCheckStart(state);
      onDuplicateCheckResult(state, 1, next.checkSeq, edited, cleanResult);
      expect(canSafelySave(state, edited)).toEqual({ canSave: true, reason: 'VERIFIED_SAFE' });
    });
  });

  describe('save-time fail-closed gate', () => {
    it('known duplicate cannot be saved', async () => {
      const state = initDuplicateContext(1);
      const result = await evaluateSaveGate({
        duplicateState: state, saveIdentity: jobA, runDuplicateCheck: checkerReturning(state, 1, dupResult),
      });
      expect(result).toEqual({ canProceed: false, reason: 'BLOCKED_DUPLICATE', abort: false });
    });

    it.each([
      ['SAME_ROLE', { match_type: 'SAME_ROLE', matches: [{ application: { company_name: 'Stripe' } }] }],
      ['EXACT_POSTING already SAVED', { match_type: 'EXACT_POSTING', matches: [{ application: { stage: 'SAVED' } }] }],
    ])('%s verdict blocks save', async (_name, verdict) => {
      const state = initDuplicateContext(1);
      const result = await evaluateSaveGate({
        duplicateState: state, saveIdentity: jobA, runDuplicateCheck: checkerReturning(state, 1, verdict),
      });
      expect(result.canProceed).toBe(false);
      expect(result.reason).toBe('BLOCKED_DUPLICATE');
    });

    it('current clean verdict saves (normal non-duplicate save)', async () => {
      const state = initDuplicateContext(1);
      const runCheck = checkerReturning(state, 1, cleanResult);
      const result = await evaluateSaveGate({ duplicateState: state, saveIdentity: jobA, runDuplicateCheck: runCheck });
      expect(runCheck).toHaveBeenCalledWith(jobA);
      expect(result).toEqual({ canProceed: true, reason: 'VERIFIED_SAFE' });
    });

    it('company-only (possible) match is informational and still saves', async () => {
      const state = initDuplicateContext(1);
      const result = await evaluateSaveGate({
        duplicateState: state, saveIdentity: jobA,
        runDuplicateCheck: checkerReturning(state, 1, { match_type: 'COMPANY_ONLY', matches: [{ application: {} }] }),
      });
      expect(result.canProceed).toBe(true);
    });

    it('ALWAYS re-verifies at save time, even when a fresh clean verdict is already cached', async () => {
      const state = initDuplicateContext(1);
      const first = onDuplicateCheckStart(state);
      onDuplicateCheckResult(state, 1, first.checkSeq, jobA, cleanResult);
      expect(canSafelySave(state, jobA).canSave).toBe(true);

      // Server now reports a duplicate (e.g. saved from another device meanwhile).
      const runCheck = checkerReturning(state, 1, dupResult);
      const result = await evaluateSaveGate({ duplicateState: state, saveIdentity: jobA, runDuplicateCheck: runCheck });
      expect(runCheck).toHaveBeenCalledTimes(1);
      expect(result.canProceed).toBe(false);
      expect(result.reason).toBe('BLOCKED_DUPLICATE');
    });

    it('stale cached verdict (identity edited, debounce not yet fired) cannot bypass verification', async () => {
      const state = initDuplicateContext(1);
      const first = onDuplicateCheckStart(state);
      onDuplicateCheckResult(state, 1, first.checkSeq, jobA, cleanResult); // clean for the OLD identity
      const edited = { ...jobA, company: 'Existing Co', jobTitle: 'Existing Role' };
      onIdentityChange(state, edited); // edit happened; debounce (350ms) has not fired
      expect(canSafelySave(state, edited).reason).toBe('NEEDS_CHECK');

      const runCheck = checkerReturning(state, 1, { match_type: 'SAME_ROLE', matches: [{ application: {} }] });
      const result = await evaluateSaveGate({ duplicateState: state, saveIdentity: edited, runDuplicateCheck: runCheck });
      expect(runCheck).toHaveBeenCalledWith(edited);
      expect(result).toMatchObject({ canProceed: false, reason: 'BLOCKED_DUPLICATE' });
    });

    it('FAIL CLOSED: a failed duplicate check (CHECK_ERROR) never saves', async () => {
      const state = initDuplicateContext(1);
      const result = await evaluateSaveGate({
        duplicateState: state, saveIdentity: jobA,
        runDuplicateCheck: checkerReturning(state, 1, { match_type: 'CHECK_ERROR', has_duplicate: false, matches: [], error: 'boom' }),
      });
      expect(result).toEqual({ canProceed: false, reason: 'CHECK_FAILED', abort: true });
    });

    it('FAIL CLOSED: a cached CHECK_ERROR verdict cannot be treated as clean by canSafelySave', () => {
      const state = initDuplicateContext(1);
      const start = onDuplicateCheckStart(state);
      onDuplicateCheckResult(state, 1, start.checkSeq, jobA, { match_type: 'CHECK_ERROR', matches: [] });
      expect(canSafelySave(state, jobA)).toEqual({ canSave: false, reason: 'CHECK_FAILED' });
    });

    it('FAIL CLOSED: a thrown check aborts the save', async () => {
      const state = initDuplicateContext(1);
      const result = await evaluateSaveGate({
        duplicateState: state, saveIdentity: jobA, runDuplicateCheck: async () => { throw new Error('network'); },
      });
      expect(result).toEqual({ canProceed: false, reason: 'CHECK_FAILED', abort: true });
    });

    it('FAIL CLOSED: a missing checker aborts instead of trusting cached state', async () => {
      const state = initDuplicateContext(1);
      const start = onDuplicateCheckStart(state);
      onDuplicateCheckResult(state, 1, start.checkSeq, jobA, cleanResult);
      const result = await evaluateSaveGate({ duplicateState: state, saveIdentity: jobA });
      expect(result.canProceed).toBe(false);
      expect(result.abort).toBe(true);
    });

    it('FAIL CLOSED: a discarded check (no verdict recorded) blocks save', async () => {
      const state = initDuplicateContext(1);
      const result = await evaluateSaveGate({
        duplicateState: state, saveIdentity: jobA, runDuplicateCheck: vi.fn(async () => undefined),
      });
      expect(result).toEqual({ canProceed: false, reason: 'NEEDS_CHECK', abort: true });
    });

    it('FAIL CLOSED: a superseded check (newer check started) blocks save', async () => {
      const state = initDuplicateContext(1);
      const runCheck = vi.fn(async (identity) => {
        const start = onDuplicateCheckStart(state);
        onDuplicateCheckStart(state); // a newer check supersedes this one
        onDuplicateCheckResult(state, 1, start.checkSeq, identity, cleanResult);
      });
      const result = await evaluateSaveGate({ duplicateState: state, saveIdentity: jobA, runDuplicateCheck: runCheck });
      expect(result).toEqual({ canProceed: false, reason: 'NEEDS_CHECK', abort: true });
    });

    it('FAIL CLOSED: a check superseded by a context switch is ignored and blocks save', async () => {
      const state = initDuplicateContext(1);
      const runCheck = vi.fn(async (identity) => {
        const start = onDuplicateCheckStart(state);
        // result arrives tagged with a different (newer) context sequence
        onDuplicateCheckResult(state, 2, start.checkSeq, identity, cleanResult);
      });
      const result = await evaluateSaveGate({ duplicateState: state, saveIdentity: jobA, runDuplicateCheck: runCheck });
      expect(result.canProceed).toBe(false);
      expect(result.abort).toBe(true);
    });

    it('FAIL CLOSED: a check whose identity no longer matches the live form is discarded', async () => {
      const state = initDuplicateContext(1);
      const runCheck = vi.fn(async (identity) => {
        const start = onDuplicateCheckStart(state);
        onDuplicateCheckResult(state, 1, start.checkSeq, identity, cleanResult, jobB /* live form moved on */);
      });
      const result = await evaluateSaveGate({ duplicateState: state, saveIdentity: jobA, runDuplicateCheck: runCheck });
      expect(result.canProceed).toBe(false);
      expect(result.abort).toBe(true);
    });

    it('context changed during the save-time check aborts before any write (tab switch mid-check)', async () => {
      const state = initDuplicateContext(1);
      let isCurrent = true;
      const runCheck = vi.fn(async (identity) => {
        const start = onDuplicateCheckStart(state);
        onDuplicateCheckResult(state, 1, start.checkSeq, identity, cleanResult); // a clean verdict arrives...
        isCurrent = false; // ...but the operator switched tabs meanwhile
      });
      const result = await evaluateSaveGate({
        duplicateState: state, saveIdentity: jobA, runDuplicateCheck: runCheck, isContextCurrent: () => isCurrent,
      });
      expect(result).toEqual({ canProceed: false, reason: 'CONTEXT_SUPERSEDED', abort: true });
    });

    it('the gate has no warnOnDuplicates escape hatch: the preference cannot skip verification', async () => {
      const state = initDuplicateContext(1);
      const runCheck = checkerReturning(state, 1, dupResult);
      const result = await evaluateSaveGate({
        duplicateState: state, saveIdentity: jobA, runDuplicateCheck: runCheck, warnOnDuplicates: false,
      });
      expect(runCheck).toHaveBeenCalledTimes(1);
      expect(result.canProceed).toBe(false);
    });

    it('never returns a duplicateOverride outcome', async () => {
      const state = initDuplicateContext(1);
      const result = await evaluateSaveGate({
        duplicateState: state, saveIdentity: jobA, runDuplicateCheck: checkerReturning(state, 1, cleanResult),
      });
      expect(result).not.toHaveProperty('duplicateOverride');
    });
  });

  describe('N1 / context isolation', () => {
    it('a fresh capture context starts stale with no verdict', () => {
      const state = initDuplicateContext(2);
      expect(state).toMatchObject({ checkedKey: null, isStale: true, info: { level: 'none', match: null } });
      expect(canSafelySave(state, jobB).reason).toBe('NEEDS_CHECK');
    });

    it('late Job A result cannot change Job B state (old-context result cannot modify new tab UI state)', () => {
      const stateA = initDuplicateContext(1);
      const checkA = onDuplicateCheckStart(stateA);

      const state = initDuplicateContext(2); // switched to Job B
      const checkB = onDuplicateCheckStart(state);

      const late = onDuplicateCheckResult(state, 1, checkA.checkSeq, jobA, dupResult);
      expect(late).toMatchObject({ ignored: true, reason: 'CONTEXT_SUPERSEDED' });
      expect(state.checkedKey).toBeNull();
      expect(state.info.level).toBe('none');

      const outcomeB = onDuplicateCheckResult(state, 2, checkB.checkSeq, jobB, cleanResult);
      expect(outcomeB.ignored).toBe(false);
      expect(state.checkedKey).toBe(computeDuplicateIdentityKey(jobB));
    });

    it('a Job A duplicate verdict never makes Job B savable or blocked', () => {
      const stateA = initDuplicateContext(1);
      const start = onDuplicateCheckStart(stateA);
      onDuplicateCheckResult(stateA, 1, start.checkSeq, jobA, dupResult);
      expect(canSafelySave(stateA, jobB).reason).toBe('NEEDS_CHECK');
      const stateB = initDuplicateContext(2);
      expect(canSafelySave(stateB, jobB).reason).toBe('NEEDS_CHECK');
    });

    it('onDuplicateCheckResult rejects a result when the active identity changed during the in-flight check', () => {
      const state = initDuplicateContext(1);
      const start = onDuplicateCheckStart(state);
      const outcome = onDuplicateCheckResult(state, 1, start.checkSeq, jobA, dupResult, jobB);
      expect(outcome).toMatchObject({ ignored: true, reason: 'IDENTITY_SUPERSEDED' });
      expect(state.checkedKey).toBeNull();
    });

    it('isSaveContextValid validates matching snapshot and rejects mutations across context/tab/identity', () => {
      const ctxA = { contextSeq: 1, tabId: 100, identityKey: 'k1' };
      expect(isSaveContextValid(ctxA, { contextSeq: 1, tabId: 100, identityKey: 'k1' })).toBe(true);
      expect(isSaveContextValid(ctxA, { contextSeq: 2, tabId: 100, identityKey: 'k1' })).toBe(false);
      expect(isSaveContextValid(ctxA, { contextSeq: 1, tabId: 101, identityKey: 'k1' })).toBe(false);
      expect(isSaveContextValid(ctxA, { contextSeq: 1, tabId: 100, identityKey: 'k2' })).toBe(false);
      expect(isSaveContextValid(null, ctxA)).toBe(false);
      expect(isSaveContextValid(ctxA, null)).toBe(false);
    });
  });
});
