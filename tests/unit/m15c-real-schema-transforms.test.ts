import { describe, it, expect } from 'vitest';
import {
  mapLegacyUser,
  mapLegacyApplication,
  normalizeLegacyTimestamp,
  mapLegacyTask,
  mapLegacyReminder,
  mapLegacyNote,
  mapLegacyResume
} from '../../scripts/migrate-legacy-data.mjs';

describe('M15-C Real Schema Transformation Unit Tests', () => {
  describe('User Transformation (mapLegacyUser)', () => {
    it('correctly maps real legacy user (jack) with null email and MANAGER role', () => {
      const realUser = {
        id: 1,
        username: 'jack',
        email: null,
        full_name: 'Jack',
        role: 'MANAGER',
        theme_preference: 'dark',
        week_start: 1,
        pin_hash: 'pbkdf2_secret_pin_hash'
      };

      const mapped = mapLegacyUser(realUser);
      expect(mapped.username).toBe('jack');
      expect(mapped.cleanUsername).toBe('jack');
      expect(mapped.fullName).toBe('Jack');
      expect(mapped.email).toBeNull();
      expect(mapped.role).toBe('MANAGER');
      expect(mapped.themePref).toBe('dark');
      expect(mapped.weekStart).toBe(1);
    });

    it('correctly maps M14 synthetic user with email and lowercase role', () => {
      const synthUser = {
        id: 2,
        email: 'alice.walker@example.com',
        full_name: 'Alice Walker',
        role: 'user',
        theme_preference: 'system',
        week_start: 0
      };

      const mapped = mapLegacyUser(synthUser);
      expect(mapped.username).toBe('alice.walker');
      expect(mapped.cleanUsername).toBe('alice.walker');
      expect(mapped.fullName).toBe('Alice Walker');
      expect(mapped.email).toBe('alice.walker@example.com');
      expect(mapped.role).toBe('USER');
      expect(mapped.themePref).toBe('system');
      expect(mapped.weekStart).toBe(0);
    });
  });

  describe('Application Transformation (mapLegacyApplication)', () => {
    it('correctly maps standard legacy application with work_arrangement', () => {
      const app = {
        id: 101,
        company: 'Stripe',
        job_title: 'Software Engineer',
        stage: 'Applied',
        work_arrangement: 'Remote',
        employment_type: 'Full-time',
        priority: 'High',
        salary_min: 150000,
        salary_max: 200000,
        salary_currency: 'USD',
        job_description: 'Build financial infrastructure.',
        date_applied: '2026-08-15',
        created_at: '2026-08-15 10:00:00+00',
        updated_at: '2026-08-15 10:00:00+00'
      };

      const mapped = mapLegacyApplication(app, ['Fintech', 'Payments']);
      expect(mapped.companyName).toBe('Stripe');
      expect(mapped.roleTitle).toBe('Software Engineer');
      expect(mapped.stage).toBe('APPLIED');
      expect(mapped.status).toBe('OPEN');
      expect(mapped.workArrangement).toBe('Remote');
      expect(mapped.employmentType).toBe('Full-time');
      expect(mapped.priority).toBe('HIGH');
      expect(mapped.salaryMin).toBe(150000);
      expect(mapped.salaryMax).toBe(200000);
      expect(mapped.tags).toEqual(['Fintech', 'Payments']);
      expect(mapped.hasSnapshot).toBe(true);
      expect(mapped.jobDescription).toBe('Build financial infrastructure.');
      expect(mapped.appliedAt).toBe('2026-08-15T00:00:00.000Z');
    });

    it('preserves "Internship" employment_type as a tag to satisfy target check constraints', () => {
      const app = {
        id: 102,
        company: 'Google',
        job_title: 'SWE Intern',
        stage: 'Applied',
        work_arrangement: 'Hybrid',
        employment_type: 'Internship',
        priority: 'Medium',
        created_at: '2026-08-01 10:00:00+00'
      };

      const mapped = mapLegacyApplication(app, ['MountainView']);
      expect(mapped.employmentType).toBeNull(); // Target check constraint compliance
      expect(mapped.tags).toContain('Internship'); // Zero data loss guarantee
      expect(mapped.tags).toContain('MountainView');
    });

    it('preserves unparsed salary_range in notes when numeric min/max are absent', () => {
      const app = {
        id: 103,
        company: 'Meta',
        job_title: 'Research Intern',
        stage: 'Saved',
        salary_min: null,
        salary_max: null,
        salary_range: '$50 - $70/hr',
        notes: 'Referred by Bob',
        created_at: '2026-08-10 12:00:00+00'
      };

      const mapped = mapLegacyApplication(app);
      expect(mapped.salaryMin).toBeNull();
      expect(mapped.salaryMax).toBeNull();
      expect(mapped.notes).toContain('Referred by Bob');
      expect(mapped.notes).toContain('[Salary Range: $50 - $70/hr]');
    });

    it('correctly maps Withdrawn stage to closed outcome', () => {
      const app = {
        id: 104,
        company: 'Amazon',
        job_title: 'SDE II',
        stage: 'Withdrawn',
        created_at: '2026-07-01 10:00:00+00'
      };

      const mapped = mapLegacyApplication(app);
      expect(mapped.stage).toBe('APPLIED');
      expect(mapped.status).toBe('CLOSED');
      expect(mapped.outcome).toBe('WITHDRAWN');
      expect(mapped.eventType).toBe('OUTCOME_CHANGED');
    });

    it('correctly maps Rejected stage to closed outcome', () => {
      const app = {
        id: 105,
        company: 'Apple',
        job_title: 'iOS Developer',
        stage: 'Rejected',
        created_at: '2026-07-05 10:00:00+00'
      };

      const mapped = mapLegacyApplication(app);
      expect(mapped.stage).toBe('APPLIED');
      expect(mapped.status).toBe('CLOSED');
      expect(mapped.outcome).toBe('REJECTED');
      expect(mapped.eventType).toBe('OUTCOME_CHANGED');
    });
  });

  describe('Timestamp Normalization (normalizeLegacyTimestamp)', () => {
    it('normalizes ISO string with timezone', () => {
      const ts = '2026-08-03 22:51:27.648646+00';
      const normalized = normalizeLegacyTimestamp(ts);
      expect(normalized).toBe(new Date(ts).toISOString());
    });

    it('returns null for null or invalid timestamp input', () => {
      expect(normalizeLegacyTimestamp(null)).toBeNull();
      expect(normalizeLegacyTimestamp('')).toBeNull();
      expect(normalizeLegacyTimestamp('invalid-date')).toBeNull();
    });
  });

  describe('Other Domain Transformations', () => {
    it('maps legacy task correctly', () => {
      const t = {
        id: 1,
        title: 'Review Offer',
        notes: 'Check benefits',
        due_date: '2026-10-01',
        priority: 'high',
        status: 'completed',
        completed_at: '2026-09-28 12:00:00+00',
        recurrence: 'weekly'
      };
      const mapped = mapLegacyTask(t);
      expect(mapped.taskType).toBe('TASK');
      expect(mapped.status).toBe('COMPLETED');
      expect(mapped.priority).toBe('HIGH');
      expect(mapped.recurrenceRule).toBe('WEEKLY');
      expect(mapped.completedAt).toBe(new Date('2026-09-28 12:00:00+00').toISOString());
    });

    it('maps legacy reminder/follow_up correctly', () => {
      const f = {
        id: 2,
        contact_name: 'Sarah Connor',
        notes: 'Follow up on interview',
        due_date: '2026-10-05',
        status: 'Completed',
        completed_at: '2026-09-27 15:00:00+00'
      };
      const mapped = mapLegacyReminder(f);
      expect(mapped.taskType).toBe('FOLLOW_UP');
      expect(mapped.title).toBe('Follow up: Sarah Connor');
      expect(mapped.status).toBe('COMPLETED');
      expect(mapped.completedAt).toBe(new Date('2026-09-27 15:00:00+00').toISOString());
    });

    it('maps legacy note correctly', () => {
      const n = {
        id: 3,
        note_type: 'interview',
        title: 'System Design Notes',
        body: 'Distributed cache discussion',
        pinned: 1
      };
      const mapped = mapLegacyNote(n);
      expect(mapped.entryType).toBe('INTERVIEW_PREP');
      expect(mapped.title).toBe('System Design Notes');
      expect(mapped.content).toBe('Distributed cache discussion');
      expect(mapped.isPinned).toBe(true);
    });

    it('maps legacy resume correctly', () => {
      const r = {
        id: 4,
        version_name: 'Full Stack 2026',
        revision_label: 'v2.1',
        target_role: 'Senior Staff Engineer',
        is_default: 1,
        is_active: 1
      };
      const mapped = mapLegacyResume(r);
      expect(mapped.name).toBe('Full Stack 2026');
      expect(mapped.documentType).toBe('RESUME');
      expect(mapped.versionLabel).toBe('v2.1');
      expect(mapped.targetRole).toBe('Senior Staff Engineer');
      expect(mapped.isDefault).toBe(true);
      expect(mapped.isActive).toBe(true);
    });
  });
});
