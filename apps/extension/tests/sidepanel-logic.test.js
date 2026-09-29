import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCaptureDraft, classifyConnectionScreen, classifyExtraction, clampPercent, computeCaptureCompleteness,
  computeGoalRemainder, DASHBOARD_PIPELINE_STAGES, describeEnvironment, formatStageLabel, formatStatValue,
  mapDuplicateLevel, mapPipelineForDisplay, nextRovingIndex, resolveCaptureScreen, saveAsToStageId,
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
  it('builds the same shape popup.js\'s save() posts to /captures', () => {
    const draft = buildCaptureDraft({
      captured: { externalJobId: 'ext-1', salaryCurrency: 'USD', description: 'desc' },
      company: 'Acme', jobTitle: 'Engineer', stageId: 'APPLIED', jobUrl: 'https://a.test',
      source: 'LinkedIn', location: 'Remote', workArrangement: 'Remote', employmentType: 'Full-time',
      salary: { min: 100000, max: 150000 }, notes: 'note', appliedAtDate: '2026-01-01',
      duplicateOverride: true, resumeId: 'r1', resumeLabel: null,
    });
    expect(draft).toMatchObject({
      company: 'Acme', job_title: 'Engineer', stage: 'APPLIED', external_job_id: 'ext-1',
      salary_min: 100000, salary_max: 150000, duplicate_override: true, resume_id: 'r1',
      applied_at: '2026-01-01T12:00:00.000Z',
    });
    expect(draft.snapshot.description).toBe('desc');
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
