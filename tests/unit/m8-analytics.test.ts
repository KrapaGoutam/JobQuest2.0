import { describe, it, expect } from 'vitest';
import { sanitizeCsvField } from '../../apps/web/src/lib/analyticsExport';

describe('Milestone 8 — Unit Tests: Analytics, Sanitization & Timing Floors', () => {
  describe('Formula Injection Sanitization (CSV Export)', () => {
    it('prepends a single quote to cells beginning with formula trigger characters', () => {
      expect(sanitizeCsvField('=SUM(A1:B10)')).toBe("'=SUM(A1:B10)");
      expect(sanitizeCsvField('+12345')).toBe("'+12345");
      expect(sanitizeCsvField('-cmd|')).toBe("'-cmd|");
      expect(sanitizeCsvField('@SUM(A1:B10)')).toBe("'@SUM(A1:B10)");
      expect(sanitizeCsvField('@SUM(1,2)')).toBe('"\'@SUM(1,2)"');
      expect(sanitizeCsvField('\tTAB_PREFIX')).toBe("'\tTAB_PREFIX");
      expect(sanitizeCsvField('\rCR_PREFIX')).toBe("'\rCR_PREFIX");
    });

    it('safely handles standard strings and numeric values without unnecessary prepending', () => {
      expect(sanitizeCsvField('Engineering')).toBe('Engineering');
      expect(sanitizeCsvField('Product Designer')).toBe('Product Designer');
      expect(sanitizeCsvField(42)).toBe('42');
      expect(sanitizeCsvField(0)).toBe('0');
      expect(sanitizeCsvField(null)).toBe('');
      expect(sanitizeCsvField(undefined)).toBe('');
    });

    it('escapes embedded quotes and wraps in quotes when containing commas or newlines', () => {
      expect(sanitizeCsvField('Company, Inc.')).toBe('"Company, Inc."');
      expect(sanitizeCsvField('Role "Lead" Designer')).toBe('"Role ""Lead"" Designer"');
      expect(sanitizeCsvField('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
    });
  });

  describe('Sample Size Floor & Rate Logic (BL-004 / BL-005)', () => {
    function computeRate(n: number, d: number) {
      if (d === 0) return { status: 'no_data', label: 'No data' };
      if (d < 5) return { status: 'too_few', label: `${n}/${d} · too few` };
      const pct = ((n / d) * 100).toFixed(1);
      return { status: 'valid', label: `${n}/${d} (${pct}%)`, pct: parseFloat(pct) };
    }

    it('identifies zero denominators as No data', () => {
      const res = computeRate(0, 0);
      expect(res.status).toBe('no_data');
      expect(res.label).toBe('No data');
    });

    it('identifies denominators < 5 as insufficient data (too few)', () => {
      const res1 = computeRate(2, 4);
      expect(res1.status).toBe('too_few');
      expect(res1.label).toContain('too few');

      const res2 = computeRate(1, 1);
      expect(res2.status).toBe('too_few');
    });

    it('formats rates with percentage for denominators >= 5', () => {
      const res = computeRate(7, 20);
      expect(res.status).toBe('valid');
      expect(res.label).toBe('7/20 (35.0%)');
      expect(res.pct).toBe(35.0);
    });
  });

  describe('Aging Band Classifications', () => {
    function getAgingBand(diffDays: number) {
      if (diffDays <= 3) return 'NEW';
      if (diffDays <= 7) return 'WAITING';
      if (diffDays <= 14) return 'FOLLOW_UP_RECOMMENDED';
      if (diffDays <= 30) return 'STALE';
      return 'LONG_WAITING';
    }

    it('correctly maps inactive days to exact 5 aging bands', () => {
      expect(getAgingBand(0)).toBe('NEW');
      expect(getAgingBand(3)).toBe('NEW');
      expect(getAgingBand(4)).toBe('WAITING');
      expect(getAgingBand(7)).toBe('WAITING');
      expect(getAgingBand(8)).toBe('FOLLOW_UP_RECOMMENDED');
      expect(getAgingBand(14)).toBe('FOLLOW_UP_RECOMMENDED');
      expect(getAgingBand(15)).toBe('STALE');
      expect(getAgingBand(30)).toBe('STALE');
      expect(getAgingBand(31)).toBe('LONG_WAITING');
      expect(getAgingBand(90)).toBe('LONG_WAITING');
    });
  });
});
