import { describe, it, expect } from 'vitest';
import {
  computeFollowUpStatus,
  formatRelationshipType,
  getRelationshipPillVariant,
  getInitials,
  CONTACT_EDITABLE_FIELDS,
  CONTACT_SEARCH_COLUMNS,
} from '../../apps/web/src/types/contacts';
import { buildSearchFilter } from '../../apps/web/src/types/applications';

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

describe('M4 closeout — contact search filter (PostgREST injection safety)', () => {
  it('quotes the term into exactly the contact columns plus one exact tag clause', () => {
    const f = buildSearchFilter('x),user_id.neq.0,(email.eq.x', CONTACT_SEARCH_COLUMNS)!;
    const clauses = f.split(/,(?=[a-z_]+\.(?:ilike|cs)\.)/);
    expect(clauses).toHaveLength(4);
    for (const c of clauses) expect(c).toMatch(/^(full_name|company_name|email|job_title)\.ilike\."\*.*\*"$/);
  });
  it('adds an exact tag clause only for safe single tokens', () => {
    expect(buildSearchFilter('recruiter', CONTACT_SEARCH_COLUMNS)).toContain('tags.cs.{recruiter}');
    expect(buildSearchFilter('a,b', CONTACT_SEARCH_COLUMNS)).not.toContain('tags.cs');
  });
  it('the editable-field whitelist excludes ownership, tenancy and archive state', () => {
    for (const f of ['user_id', 'workspace_id', 'archived_at', 'id', 'created_at']) {
      expect(CONTACT_EDITABLE_FIELDS as readonly string[]).not.toContain(f);
    }
  });
});
