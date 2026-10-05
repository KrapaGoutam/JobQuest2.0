import { describe, expect, it } from 'vitest';
import {
  applicationSuggestionToggleLabel,
  applicationSuggestionView,
  DESKTOP_APPLICATION_SUGGESTION_LIMIT,
  MOBILE_APPLICATION_SUGGESTION_LIMIT,
} from '../../apps/web/src/lib/applicationSuggestions';

const suggestions = ['one', 'two', 'three', 'four', 'five'];

describe('M15-F application suggestion density', () => {
  it('keeps short desktop lists fully visible without overflow controls', () => {
    const view = applicationSuggestionView(suggestions.slice(0, 3), false, false);

    expect(view.visible).toEqual(['one', 'two', 'three']);
    expect(view.defaultLimit).toBe(DESKTOP_APPLICATION_SUGGESTION_LIMIT);
    expect(view.hiddenCount).toBe(0);
    expect(view.hasOverflow).toBe(false);
  });

  it('shows three desktop suggestions by default and preserves source order', () => {
    const view = applicationSuggestionView(suggestions, false, false);

    expect(view.visible).toEqual(['one', 'two', 'three']);
    expect(view.hiddenCount).toBe(2);
    expect(view.hasOverflow).toBe(true);
    expect(applicationSuggestionToggleLabel(view.hiddenCount, false)).toBe('View 2 more');
  });

  it('shows two mobile suggestions by default', () => {
    const view = applicationSuggestionView(suggestions, true, false);

    expect(view.visible).toEqual(['one', 'two']);
    expect(view.defaultLimit).toBe(MOBILE_APPLICATION_SUGGESTION_LIMIT);
    expect(view.hiddenCount).toBe(3);
  });

  it('reveals every suggestion when expanded and returns a collapse label', () => {
    const view = applicationSuggestionView(suggestions, false, true);

    expect(view.visible).toEqual(suggestions);
    expect(view.hasOverflow).toBe(true);
    expect(applicationSuggestionToggleLabel(view.hiddenCount, true)).toBe('Show fewer');
  });
});
