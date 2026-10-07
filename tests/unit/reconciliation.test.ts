import { expect, test, describe } from 'vitest';
import { ApplicationMatcher, LegacyApplication, CurrentApplication } from '../../scripts/reconciliation/application-matcher';
import { normalizeUrl } from '../../scripts/reconciliation/utils';

describe('Reconciliation Matcher', () => {
  const matcher = new ApplicationMatcher('2026-10-04T00:00:00Z');

  test('1. exact legacy ID matching', () => {
    const l: LegacyApplication = { id: 10, company: 'A', job_title: 'B', date_applied: '', stage: '', job_url: '', location: '', external_job_id: '', source: '', created_at: '' };
    const c: CurrentApplication = { id: 'C1', legacy_id: 10, company_name: 'A', role_title: 'B', applied_at: null, stage: '', status: '', job_url: null, location: null, external_job_id: null, source: null, created_at: '2026-10-01' };
    const result = matcher.match([l], [c]);
    expect(result[0].matchType).toBe('EXACT_LEGACY_ID');
  });

  test('2. exact external ID matching', () => {
    const l: LegacyApplication = { id: 10, company: 'A', job_title: 'B', date_applied: '', stage: '', job_url: '', location: '', external_job_id: 'EXT1', source: 'SRC1', created_at: '' };
    const c: CurrentApplication = { id: 'C1', legacy_id: null, company_name: 'A', role_title: 'B', applied_at: null, stage: '', status: '', job_url: null, location: null, external_job_id: 'EXT1', source: 'SRC1', created_at: '2026-10-01' };
    const result = matcher.match([l], [c]);
    expect(result[0].matchType).toBe('EXACT_EXTERNAL_ID');
  });

  test('3. canonical URL matching', () => {
    const l: LegacyApplication = { id: 10, company: 'A', job_title: 'B', date_applied: '', stage: '', job_url: 'https://example.com/job1/', location: '', external_job_id: '', source: '', created_at: '' };
    const c: CurrentApplication = { id: 'C1', legacy_id: null, company_name: 'A', role_title: 'B', applied_at: null, stage: '', status: '', job_url: 'https://example.com/job1?utm_source=test', location: null, external_job_id: null, source: null, created_at: '2026-10-01' };
    const result = matcher.match([l], [c]);
    expect(result[0].matchType).toBe('EXACT_NORMALIZED_URL');
  });

  test('4. URL query/tracking normalization', () => {
    expect(normalizeUrl('https://ex.com/?utm_campaign=x')).toBe('https://ex.com');
  });

  test('5. distinct URLs with different job IDs remain distinct', () => {
    expect(normalizeUrl('https://ex.com/123')).not.toBe(normalizeUrl('https://ex.com/456'));
  });

  test('6. company/title/date composite matching', () => {
    const l: LegacyApplication = { id: 10, company: 'Acme Inc.', job_title: 'Engineer', date_applied: '', stage: '', job_url: '', location: 'NY', external_job_id: '', source: '', created_at: '' };
    const c: CurrentApplication = { id: 'C1', legacy_id: null, company_name: 'acme inc', role_title: 'engineer', applied_at: null, stage: '', status: '', job_url: null, location: 'ny', external_job_id: null, source: null, created_at: '2026-10-01' };
    const result = matcher.match([l], [c]);
    expect(result[0].matchType).toBe('EXACT_COMPOSITE');
  });

  test('7. fuzzy candidate remains manual-review', () => {
    const l: LegacyApplication = { id: 10, company: 'Acme', job_title: 'Software Engineer', date_applied: '', stage: '', job_url: '', location: '', external_job_id: '', source: '', created_at: '' };
    const c: CurrentApplication = { id: 'C1', legacy_id: null, company_name: 'Acme', role_title: 'Software Enginee', applied_at: null, stage: '', status: '', job_url: null, location: null, external_job_id: null, source: null, created_at: '2026-10-01' };
    const result = matcher.match([l], [c]);
    const match = result.find(r => r.legacyId === 10 && r.currentId === 'C1');
    expect(match!.classification).toBe('POSSIBLE_MATCH_MANUAL_REVIEW');
  });

  test('8. duplicate legacy detection', () => {
    const l1: LegacyApplication = { id: 10, company: 'A', job_title: 'B', date_applied: '', stage: '', job_url: 'https://ex.com/1', location: '', external_job_id: '', source: '', created_at: '' };
    const l2: LegacyApplication = { id: 11, company: 'A', job_title: 'B', date_applied: '', stage: '', job_url: 'https://ex.com/1', location: '', external_job_id: '', source: '', created_at: '' };
    const dups = matcher.detectDuplicatesLegacy([l1, l2]);
    expect(dups.length).toBe(1);
    expect(dups[0].ids).toEqual([10, 11]);
  });

  test('9. duplicate current detection', () => {
    const c1: CurrentApplication = { id: 'C1', legacy_id: null, company_name: 'A', role_title: 'B', applied_at: null, stage: '', status: '', job_url: 'https://ex.com/1', location: null, external_job_id: null, source: null, created_at: '' };
    const c2: CurrentApplication = { id: 'C2', legacy_id: null, company_name: 'A', role_title: 'B', applied_at: null, stage: '', status: '', job_url: 'https://ex.com/1', location: null, external_job_id: null, source: null, created_at: '' };
    const dups = matcher.detectDuplicatesCurrent([c1, c2]);
    expect(dups.length).toBe(1);
    expect(dups[0].ids).toEqual(['C1', 'C2']);
  });

  test('13. expected post-cutover current-only record', () => {
    const c: CurrentApplication = { id: 'C1', legacy_id: null, company_name: 'A', role_title: 'B', applied_at: null, stage: '', status: '', job_url: null, location: null, external_job_id: null, source: null, created_at: '2026-10-05T00:00:00Z' }; // after cutover 10-04
    const result = matcher.match([], [c]);
    expect(result[0].classification).toBe('CURRENT_ONLY_EXPECTED_POST_CUTOVER');
  });
  
  test('14. field mismatch classification', () => {
    const l: LegacyApplication = { id: 10, company: 'A', job_title: 'B', date_applied: '', stage: '', job_url: '', location: '', external_job_id: '', source: '', created_at: '' };
    const c: CurrentApplication = { id: 'C1', legacy_id: 10, company_name: 'A', role_title: 'C', applied_at: null, stage: '', status: '', job_url: null, location: null, external_job_id: null, source: null, created_at: '2026-10-01' };
    const result = matcher.match([l], [c]);
    expect(result[0].classification).toBe('PRESENT_BOTH_FIELD_MISMATCH');
    expect(result[0].mismatches).toContain('Title');
  });

});
