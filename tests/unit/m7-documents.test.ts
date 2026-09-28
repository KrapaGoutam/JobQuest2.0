import { describe, it, expect } from 'vitest';
import { formatResumeRate } from '../../apps/web/src/types/documents';

describe('M7 Unit Tests — Documents & Resumes', () => {
  describe('formatResumeRate', () => {
    it('returns "too few" when sample size (denominator) is less than 5', () => {
      const res0 = formatResumeRate(0, 3);
      expect(res0.isTooFew).toBe(true);
      expect(res0.ratioText).toBe('0/3');
      expect(res0.percentText).toBe('too few');

      const res4 = formatResumeRate(2, 4);
      expect(res4.isTooFew).toBe(true);
      expect(res4.ratioText).toBe('2/4');
      expect(res4.percentText).toBe('too few');
    });

    it('calculates formatted percentage when sample size is >= 5', () => {
      const res58 = formatResumeRate(17, 58);
      expect(res58.isTooFew).toBe(false);
      expect(res58.ratioText).toBe('17/58');
      expect(res58.percentText).toBe('(29.3%)');

      const res49 = formatResumeRate(8, 49);
      expect(res49.isTooFew).toBe(false);
      expect(res49.ratioText).toBe('8/49');
      expect(res49.percentText).toBe('(16.3%)');

      const resExact = formatResumeRate(5, 10);
      expect(resExact.isTooFew).toBe(false);
      expect(resExact.ratioText).toBe('5/10');
      expect(resExact.percentText).toBe('(50.0%)');
    });

    it('handles 0 out of >= 5 cleanly', () => {
      const resZero = formatResumeRate(0, 10);
      expect(resZero.isTooFew).toBe(false);
      expect(resZero.ratioText).toBe('0/10');
      expect(resZero.percentText).toBe('(0.0%)');
    });
  });
});
