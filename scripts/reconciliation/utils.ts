export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    parsed.hostname = parsed.hostname.toLowerCase();
    
    // Remove typical tracking queries
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source'];
    for (const p of trackingParams) {
      parsed.searchParams.delete(p);
    }
    
    // Remove trailing slash
    let normalized = parsed.toString();
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    
    return normalized;
  } catch {
    // If not a valid URL, just lowercase and trim
    return url.trim().toLowerCase();
  }
}

export function normalizeString(str: string | null | undefined): string | null {
  if (!str) return null;
  return str.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,/#!$%^&*;:{}=\-_`~()]/g,"");
}

export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function fuzzyMatchScore(a: string | null, b: string | null): number {
  if (!a && !b) return 1.0;
  if (!a || !b) return 0.0;
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1.0 : (maxLen - dist) / maxLen;
}
