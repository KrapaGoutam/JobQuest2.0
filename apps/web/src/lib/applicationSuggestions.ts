export const DESKTOP_APPLICATION_SUGGESTION_LIMIT = 3;
export const MOBILE_APPLICATION_SUGGESTION_LIMIT = 2;

export interface ApplicationSuggestionView<T> {
  visible: T[];
  defaultLimit: number;
  hiddenCount: number;
  hasOverflow: boolean;
}

export function applicationSuggestionView<T>(
  suggestions: readonly T[],
  isMobile: boolean,
  expanded: boolean,
): ApplicationSuggestionView<T> {
  const defaultLimit = isMobile
    ? MOBILE_APPLICATION_SUGGESTION_LIMIT
    : DESKTOP_APPLICATION_SUGGESTION_LIMIT;

  return {
    visible: expanded ? [...suggestions] : suggestions.slice(0, defaultLimit),
    defaultLimit,
    hiddenCount: Math.max(0, suggestions.length - defaultLimit),
    hasOverflow: suggestions.length > defaultLimit,
  };
}

export function applicationSuggestionToggleLabel(hiddenCount: number, expanded: boolean): string {
  return expanded ? 'Show fewer' : `View ${hiddenCount} more`;
}
