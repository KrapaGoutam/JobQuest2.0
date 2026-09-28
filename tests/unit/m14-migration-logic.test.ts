import { describe, it, expect } from 'vitest';
import {
  mapLegacyStage,
  mapLegacyNoteType,
  parseLegacyDate,
  generateClaimCode,
  assertSafeTarget
} from '../../scripts/migrate-legacy-data.mjs';

describe('M14 Migration Logic Unit Tests', () => {
  describe('13-Stage Workflow Decomposition (mapLegacyStage)', () => {
    it('decomposes "Saved" stage into BOOKMARK/SAVED open status', () => {
      const res = mapLegacyStage('Saved');
      expect(res.stage).toBe('SAVED');
      expect(res.status).toBe('OPEN');
      expect(res.outcome).toBeNull();
      expect(res.closureReason).toBeNull();
      expect(res.eventType).toBe('CAPTURED');
    });

    it('decomposes "Preparing" stage into PREPARING open status', () => {
      const res = mapLegacyStage('Preparing');
      expect(res.stage).toBe('PREPARING');
      expect(res.status).toBe('OPEN');
      expect(res.outcome).toBeNull();
      expect(res.closureReason).toBeNull();
      expect(res.eventType).toBe('CREATED');
    });

    it('decomposes "Applied" stage into APPLIED open status', () => {
      const res = mapLegacyStage('Applied');
      expect(res.stage).toBe('APPLIED');
      expect(res.status).toBe('OPEN');
      expect(res.outcome).toBeNull();
      expect(res.closureReason).toBeNull();
      expect(res.eventType).toBe('APPLIED');
    });

    it('decomposes "Assessment" stage into ASSESSMENT open status', () => {
      const res = mapLegacyStage('Assessment');
      expect(res.stage).toBe('ASSESSMENT');
      expect(res.status).toBe('OPEN');
      expect(res.outcome).toBeNull();
      expect(res.closureReason).toBeNull();
      expect(res.eventType).toBe('STAGE_CHANGED');
    });

    it('decomposes "Recruiter Screen" stage into RECRUITER_SCREEN open status', () => {
      const res = mapLegacyStage('Recruiter Screen');
      expect(res.stage).toBe('RECRUITER_SCREEN');
      expect(res.status).toBe('OPEN');
      expect(res.outcome).toBeNull();
      expect(res.closureReason).toBeNull();
      expect(res.eventType).toBe('STAGE_CHANGED');
    });

    it('decomposes "Interview" stage into INTERVIEW open status', () => {
      const res = mapLegacyStage('Interview');
      expect(res.stage).toBe('INTERVIEW');
      expect(res.status).toBe('OPEN');
      expect(res.outcome).toBeNull();
      expect(res.closureReason).toBeNull();
      expect(res.eventType).toBe('STAGE_CHANGED');
    });

    it('decomposes "Final Interview" stage into FINAL_INTERVIEW open status', () => {
      const res = mapLegacyStage('Final Interview');
      expect(res.stage).toBe('FINAL_INTERVIEW');
      expect(res.status).toBe('OPEN');
      expect(res.outcome).toBeNull();
      expect(res.closureReason).toBeNull();
      expect(res.eventType).toBe('STAGE_CHANGED');
    });

    it('decomposes "Offer" stage into OFFER open status', () => {
      const res = mapLegacyStage('Offer');
      expect(res.stage).toBe('OFFER');
      expect(res.status).toBe('OPEN');
      expect(res.outcome).toBeNull();
      expect(res.closureReason).toBeNull();
      expect(res.eventType).toBe('STAGE_CHANGED');
    });

    it('decomposes "Accepted" into OFFER/CLOSED with ACCEPTED outcome', () => {
      const res = mapLegacyStage('Accepted');
      expect(res.stage).toBe('OFFER');
      expect(res.status).toBe('CLOSED');
      expect(res.outcome).toBe('ACCEPTED');
      expect(res.closureReason).toBeNull();
      expect(res.eventType).toBe('OUTCOME_CHANGED');
    });

    it('decomposes "Rejected" into CLOSED with REJECTED outcome', () => {
      const res = mapLegacyStage('Rejected');
      expect(res.status).toBe('CLOSED');
      expect(res.outcome).toBe('REJECTED');
      expect(res.closureReason).toBeNull();
      expect(res.eventType).toBe('OUTCOME_CHANGED');
    });

    it('decomposes "Withdrawn" into CLOSED with WITHDRAWN outcome and closure reason', () => {
      const res = mapLegacyStage('Withdrawn');
      expect(res.status).toBe('CLOSED');
      expect(res.outcome).toBe('WITHDRAWN');
      expect(res.closureReason).toBe('GENERAL_WITHDRAWAL');
      expect(res.eventType).toBe('OUTCOME_CHANGED');
    });

    it('decomposes "Ghosted" into CLOSED with GHOSTED outcome', () => {
      const res = mapLegacyStage('Ghosted');
      expect(res.status).toBe('CLOSED');
      expect(res.outcome).toBe('GHOSTED');
      expect(res.closureReason).toBeNull();
      expect(res.eventType).toBe('OUTCOME_CHANGED');
    });

    it('decomposes "Position Closed" into CLOSED with POSITION_CLOSED outcome', () => {
      const res = mapLegacyStage('Position Closed');
      expect(res.status).toBe('CLOSED');
      expect(res.outcome).toBe('POSITION_CLOSED');
      expect(res.closureReason).toBeNull();
      expect(res.eventType).toBe('OUTCOME_CHANGED');
    });
  });

  describe('Career Journal Note Type Mapping (mapLegacyNoteType)', () => {
    it('maps daily_journal to REFLECTION', () => {
      expect(mapLegacyNoteType('daily_journal')).toBe('REFLECTION');
    });

    it('maps interview to INTERVIEW_PREP', () => {
      expect(mapLegacyNoteType('interview')).toBe('INTERVIEW_PREP');
    });

    it('maps company_research to STRATEGY', () => {
      expect(mapLegacyNoteType('company_research')).toBe('STRATEGY');
    });

    it('maps reflection to POST_MORTEM', () => {
      expect(mapLegacyNoteType('reflection')).toBe('POST_MORTEM');
    });

    it('maps general or unrecognized to NOTE', () => {
      expect(mapLegacyNoteType('general')).toBe('NOTE');
      expect(mapLegacyNoteType(null)).toBe('NOTE');
      expect(mapLegacyNoteType('unknown')).toBe('NOTE');
    });
  });

  describe('Timestamp Parsing (parseLegacyDate)', () => {
    it('parses SQLite / ISO date strings correctly to UTC ISO', () => {
      const parsed = parseLegacyDate('2026-09-01 10:15:00');
      expect(parsed).not.toBeNull();
      expect(new Date(parsed!).getUTCFullYear()).toBe(2026);
    });

    it('returns null for null or empty input', () => {
      expect(parseLegacyDate(null)).toBeNull();
      expect(parseLegacyDate('')).toBeNull();
    });

    it('returns null for invalid date strings', () => {
      expect(parseLegacyDate('not-a-date')).toBeNull();
    });
  });

  describe('Option B Claim Code Generator (generateClaimCode)', () => {
    it('generates secure 32-character hex tokens with matching SHA-256 hash', () => {
      const { token, hint, hash } = generateClaimCode();
      expect(token).toHaveLength(32);
      expect(/^[0-9a-f]{32}$/.test(token)).toBe(true);
      expect(hash).toHaveLength(64);
      expect(hint).toMatch(/^[0-9a-f]{4}\.\.\.[0-9a-f]{2}$/);
    });
  });

  describe('Production Target Safety Lock (assertSafeTarget)', () => {
    it('throws error when target URL is missing', () => {
      expect(() => assertSafeTarget('', true)).toThrow('Target database URL is required');
    });

    it('throws error when confirmNonProduction is false', () => {
      expect(() => assertSafeTarget('postgresql://postgres@localhost:5432/test', false))
        .toThrow('--confirm-non-production flag is strictly required');
    });

    it('throws error when target URL contains production identifiers', () => {
      expect(() => assertSafeTarget('postgresql://admin@jobquest-prod.supabase.co/db', true))
        .toThrow('FATAL SECURITY LOCK');
      expect(() => assertSafeTarget('postgresql://admin@ep-neon.tech/main_production', true))
        .toThrow('FATAL SECURITY LOCK');
    });

    it('passes for local or non-production test URLs with confirmation', () => {
      expect(assertSafeTarget('postgresql://postgres:postgres@127.0.0.1:55322/postgres', true)).toBe(true);
      expect(assertSafeTarget('postgresql://postgres@aws-0-us-west-2.pooler.supabase.com:5432/jobquest-dev', true)).toBe(true);
    });
  });
});
