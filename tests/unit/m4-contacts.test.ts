import { describe, it, expect } from 'vitest';
import {
  computeFollowUpStatus,
  formatRelationshipType,
  getRelationshipPillVariant,
  getInitials,
} from '../../apps/web/src/types/contacts';

describe('Milestone 4 — Contacts & Networking Unit Tests', () => {
  describe('computeFollowUpStatus', () => {
    it('returns none when dateStr is null or empty', () => {
      expect(computeFollowUpStatus(null)).toEqual({
        status: 'none',
        label: 'None',
        rawDate: null,
      });
      expect(computeFollowUpStatus('')).toEqual({
        status: 'none',
        label: 'None',
        rawDate: null,
      });
    });

    const toDateStr = (d: Date) =>
      [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');

    it('identifies today follow-up as warning', () => {
      const today = toDateStr(new Date());
      const res = computeFollowUpStatus(today);
      expect(res.status).toBe('warning');
      expect(res.label).toBe('Today');
    });

    it('identifies past dates as danger with overdue count', () => {
      const past = new Date();
      past.setDate(past.getDate() - 3);
      const pastStr = toDateStr(past);
      const res = computeFollowUpStatus(pastStr);
      expect(res.status).toBe('danger');
      expect(res.label).toBe('3d overdue');
    });

    it('identifies future dates as upcoming', () => {
      const future = new Date();
      future.setDate(future.getDate() + 10);
      const futureStr = toDateStr(future);
      const res = computeFollowUpStatus(futureStr);
      expect(res.status).toBe('upcoming');
      expect(res.label).toBeTruthy();
    });
  });

  describe('formatRelationshipType & getRelationshipPillVariant', () => {
    it('formats relationship types correctly', () => {
      expect(formatRelationshipType('RECRUITER')).toBe('Recruiter');
      expect(formatRelationshipType('HIRING_MANAGER')).toBe('Hiring manager');
      expect(formatRelationshipType('REFERRAL')).toBe('Referral');
      expect(formatRelationshipType('INTERVIEWER')).toBe('Interviewer');
      expect(formatRelationshipType('PEER')).toBe('Peer');
      expect(formatRelationshipType('CONTACT')).toBe('Networking');
    });

    it('returns appropriate color variants for relationship types', () => {
      expect(getRelationshipPillVariant('RECRUITER')).toBe('info');
      expect(getRelationshipPillVariant('HIRING_MANAGER')).toBe('accent');
      expect(getRelationshipPillVariant('REFERRAL')).toBe('success');
      expect(getRelationshipPillVariant('INTERVIEWER')).toBe('muted');
      expect(getRelationshipPillVariant('PEER')).toBe('muted');
      expect(getRelationshipPillVariant('CONTACT')).toBe('muted');
    });
  });

  describe('getInitials', () => {
    it('generates two-letter initials from full name', () => {
      expect(getInitials('Dana Cole')).toBe('DC');
      expect(getInitials('Elena Ruiz')).toBe('ER');
      expect(getInitials('Marcus Bell')).toBe('MB');
      expect(getInitials('Cher')).toBe('CH');
      expect(getInitials('')).toBe('??');
    });
  });
});
