import { normalizeUrl, normalizeString, fuzzyMatchScore } from './utils';

export interface LegacyApplication {
  id: number;
  company: string;
  job_title: string;
  date_applied: string;
  stage: string;
  job_url: string;
  location: string;
  external_job_id: string;
  source: string;
  created_at: string;
  [key: string]: unknown;
}

export interface CurrentApplication {
  id: string;
  legacy_id: number | null;
  company_name: string;
  role_title: string;
  applied_at: string | null;
  stage: string;
  status: string;
  job_url: string | null;
  location: string | null;
  external_job_id: string | null;
  source: string | null;
  created_at: string;
  [key: string]: unknown;
}

export type MatchClassification = 
  | 'PRESENT_BOTH_EXACT'
  | 'PRESENT_BOTH_FIELD_MISMATCH'
  | 'LEGACY_ONLY'
  | 'CURRENT_ONLY_EXPECTED_POST_CUTOVER'
  | 'CURRENT_ONLY_NEEDS_REVIEW'
  | 'POSSIBLE_MATCH_MANUAL_REVIEW'
  | 'DUPLICATE_LEGACY'
  | 'DUPLICATE_CURRENT'
  | 'AMBIGUOUS_MULTIPLE_MATCHES'
  | 'UNMAPPABLE';

export interface MatchResult {
  legacyId: number | null;
  currentId: string | null;
  classification: MatchClassification;
  matchType: string | null; // e.g. EXACT_LEGACY_ID, EXACT_EXTERNAL_ID, EXACT_NORMALIZED_URL, EXACT_COMPOSITE, FUZZY
  confidence: number;
  mismatches: string[];
}

export class ApplicationMatcher {
  private cutoverDate: Date;
  
  constructor(cutoverDateStr: string) {
    // If "NEEDS VERIFICATION", fallback to the roughly known date.
    this.cutoverDate = new Date(cutoverDateStr === 'NEEDS VERIFICATION' ? '2026-10-04T00:00:00Z' : cutoverDateStr);
  }

  match(legacyApps: LegacyApplication[], currentApps: CurrentApplication[]): MatchResult[] {
    const results: MatchResult[] = [];
    const matchedLegacyIds = new Set<number>();
    const matchedCurrentIds = new Set<string>();

    // 1. EXACT_LEGACY_ID
    for (const c of currentApps) {
      if (c.legacy_id) {
        const l = legacyApps.find(x => x.id === c.legacy_id);
        if (l) {
          matchedLegacyIds.add(l.id);
          matchedCurrentIds.add(c.id);
          results.push(this.createMatch(l, c, 'EXACT_LEGACY_ID', 1.0));
        }
      }
    }

    // 2. EXACT_EXTERNAL_ID
    for (const c of currentApps) {
      if (matchedCurrentIds.has(c.id)) continue;
      if (c.external_job_id && c.source) {
        const l = legacyApps.find(x => !matchedLegacyIds.has(x.id) && x.external_job_id === c.external_job_id && x.source === c.source);
        if (l) {
          matchedLegacyIds.add(l.id);
          matchedCurrentIds.add(c.id);
          results.push(this.createMatch(l, c, 'EXACT_EXTERNAL_ID', 1.0));
        }
      }
    }

    // 3. EXACT_NORMALIZED_URL
    for (const c of currentApps) {
      if (matchedCurrentIds.has(c.id)) continue;
      const cUrl = normalizeUrl(c.job_url);
      if (cUrl) {
        const l = legacyApps.find(x => !matchedLegacyIds.has(x.id) && normalizeUrl(x.job_url) === cUrl);
        if (l) {
          matchedLegacyIds.add(l.id);
          matchedCurrentIds.add(c.id);
          results.push(this.createMatch(l, c, 'EXACT_NORMALIZED_URL', 0.95));
        }
      }
    }

    // 4. COMPOSITE KEY (company + title + location)
    for (const c of currentApps) {
      if (matchedCurrentIds.has(c.id)) continue;
      const cComp = normalizeString(c.company_name);
      const cTitle = normalizeString(c.role_title);
      const cLoc = normalizeString(c.location);
      
      const matches = legacyApps.filter(x => {
        if (matchedLegacyIds.has(x.id)) return false;
        return normalizeString(x.company) === cComp && 
               normalizeString(x.job_title) === cTitle &&
               normalizeString(x.location) === cLoc;
      });

      if (matches.length === 1) {
        const l = matches[0]!;
        matchedLegacyIds.add(l.id);
        matchedCurrentIds.add(c.id);
        results.push(this.createMatch(l, c, 'EXACT_COMPOSITE', 0.9));
      }
    }

    // 5. FUZZY MATCHING (Manual Review)
    for (const c of currentApps) {
      if (matchedCurrentIds.has(c.id)) continue;
      const cComp = normalizeString(c.company_name);
      const cTitle = normalizeString(c.role_title);
      
      let bestMatch: LegacyApplication | null = null;
      let bestScore = 0;

      for (const l of legacyApps) {
        if (matchedLegacyIds.has(l.id)) continue;
        const lComp = normalizeString(l.company);
        const lTitle = normalizeString(l.job_title);
        
        const compScore = fuzzyMatchScore(lComp, cComp);
        const titleScore = fuzzyMatchScore(lTitle, cTitle);
        const totalScore = (compScore * 0.6) + (titleScore * 0.4);

        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestMatch = l;
        }
      }

      if (bestMatch && bestScore >= 0.75) {
        matchedLegacyIds.add(bestMatch.id);
        matchedCurrentIds.add(c.id);
        const res = this.createMatch(bestMatch, c, 'FUZZY_MATCH', bestScore);
        res.classification = 'POSSIBLE_MATCH_MANUAL_REVIEW';
        results.push(res);
      }
    }

    // Unmatched Legacy
    for (const l of legacyApps) {
      if (!matchedLegacyIds.has(l.id)) {
        results.push({
          legacyId: l.id,
          currentId: null,
          classification: 'LEGACY_ONLY',
          matchType: null,
          confidence: 0,
          mismatches: []
        });
      }
    }

    // Unmatched Current
    for (const c of currentApps) {
      if (!matchedCurrentIds.has(c.id)) {
        const isPostCutover = new Date(c.created_at) >= this.cutoverDate;
        results.push({
          legacyId: null,
          currentId: c.id,
          classification: isPostCutover ? 'CURRENT_ONLY_EXPECTED_POST_CUTOVER' : 'CURRENT_ONLY_NEEDS_REVIEW',
          matchType: null,
          confidence: 0,
          mismatches: []
        });
      }
    }

    return results;
  }

  private createMatch(l: LegacyApplication, c: CurrentApplication, matchType: string, confidence: number): MatchResult {
    const mismatches: string[] = [];
    if (normalizeString(l.company) !== normalizeString(c.company_name)) mismatches.push('Company');
    if (normalizeString(l.job_title) !== normalizeString(c.role_title)) mismatches.push('Title');
    
    // Status mapping check roughly
    // Just flag if they seem completely disjoint
    
    return {
      legacyId: l.id,
      currentId: c.id,
      classification: mismatches.length > 0 ? 'PRESENT_BOTH_FIELD_MISMATCH' : 'PRESENT_BOTH_EXACT',
      matchType,
      confidence,
      mismatches
    };
  }

  detectDuplicatesLegacy(apps: LegacyApplication[]): unknown[] {
    const groups = new Map<string, number[]>();
    for (const a of apps) {
      if (a.external_job_id) {
        const key = `ext:${a.source}:${a.external_job_id}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(a.id);
      }
      const url = normalizeUrl(a.job_url);
      if (url) {
        const key = `url:${url}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(a.id);
      }
    }
    const duplicates = [];
    for (const [key, ids] of groups.entries()) {
      if (ids.length > 1) duplicates.push({ key, ids });
    }
    return duplicates;
  }

  detectDuplicatesCurrent(apps: CurrentApplication[]): unknown[] {
    const groups = new Map<string, string[]>();
    for (const a of apps) {
      if (a.external_job_id) {
        const key = `ext:${a.source}:${a.external_job_id}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(a.id);
      }
      const url = normalizeUrl(a.job_url);
      if (url) {
        const key = `url:${url}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(a.id);
      }
    }
    const duplicates = [];
    for (const [key, ids] of groups.entries()) {
      if (ids.length > 1) duplicates.push({ key, ids });
    }
    return duplicates;
  }
}
