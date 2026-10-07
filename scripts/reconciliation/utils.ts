export function normalizeString(str: string | null | undefined): string {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeUrl(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    const hostRegex = /^https?:\/\/(www\.)?/i;
    let base = u.hostname + u.pathname;
    base = base.replace(hostRegex, '').replace(/\/$/, '').toLowerCase();
    return base;
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').toLowerCase();
  }
}

export function fuzzyMatchScore(a: string | null, b: string | null): number {
  if (!a && !b) return 1.0;
  if (!a || !b) return 0.0;
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1.0 : (maxLen - dist) / maxLen;
}

export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1] as number;
      } else {
        matrix[i]![j] = Math.min(
          (matrix[i - 1]![j - 1] as number) + 1,
          Math.min((matrix[i]![j - 1] as number) + 1, (matrix[i - 1]![j] as number) + 1)
        );
      }
    }
  }
  return matrix[b.length]![a.length] as number;
}
