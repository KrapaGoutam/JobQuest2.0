import { describe, it, expect } from 'vitest';

export const JOURNAL_ENTRY_TYPES = [
  'REFLECTION',
  'STRATEGY',
  'INTERVIEW_PREP',
  'NOTE',
  'POST_MORTEM',
] as const;

export function isValidJournalType(type: string): boolean {
  return (JOURNAL_ENTRY_TYPES as readonly string[]).includes(type.toUpperCase());
}

export function validateJournalEntry(title: string | null | undefined, content: string): { valid: boolean; error?: string } {
  if (!content || content.trim().length === 0) {
    return { valid: false, error: 'Content is required' };
  }
  if (content.length > 50000) {
    return { valid: false, error: 'Content exceeds 50,000 character limit' };
  }
  if (title && title.length > 255) {
    return { valid: false, error: 'Title exceeds 255 character limit' };
  }
  return { valid: true };
}

export function filterSearchResults(results: Array<{ domain: string; title: string }>, activeDomain: string) {
  if (activeDomain === 'all') return results;
  return results.filter((r) => r.domain === activeDomain);
}

describe('Milestone 13 Unit Tests — Journal & Global Search', () => {
  it('validates approved journal entry types', () => {
    for (const t of ['REFLECTION', 'STRATEGY', 'INTERVIEW_PREP', 'NOTE', 'POST_MORTEM']) {
      expect(isValidJournalType(t)).toBe(true);
      expect(isValidJournalType(t.toLowerCase())).toBe(true);
    }
    expect(isValidJournalType('RANDOM_TYPE')).toBe(false);
    expect(isValidJournalType('')).toBe(false);
  });

  it('validates journal content and title constraints', () => {
    expect(validateJournalEntry('My Note', 'Valid content').valid).toBe(true);
    expect(validateJournalEntry(null, 'Valid content without title').valid).toBe(true);
    expect(validateJournalEntry('', '').valid).toBe(false);
    expect(validateJournalEntry('Title', '   ').valid).toBe(false);

    const longTitle = 'a'.repeat(256);
    expect(validateJournalEntry(longTitle, 'Valid content').valid).toBe(false);

    const longContent = 'x'.repeat(50001);
    expect(validateJournalEntry('Title', longContent).valid).toBe(false);
  });

  it('filters multi-domain search results by domain pill', () => {
    const mockResults = [
      { domain: 'application', title: 'Acme Corp — Staff Engineer' },
      { domain: 'contact', title: 'Sarah Connor' },
      { domain: 'note', title: 'Interview strategy note' },
      { domain: 'interview', title: 'System Architecture round' },
      { domain: 'document', title: 'Staff Resume v2' },
    ];

    expect(filterSearchResults(mockResults, 'all')).toHaveLength(5);
    expect(filterSearchResults(mockResults, 'application')).toHaveLength(1);
    expect(filterSearchResults(mockResults, 'note')).toHaveLength(1);
    expect(filterSearchResults(mockResults, 'interview')).toHaveLength(1);
    expect(filterSearchResults(mockResults, 'contact')).toHaveLength(1);
    expect(filterSearchResults(mockResults, 'document')).toHaveLength(1);
  });
});
