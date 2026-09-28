export type DocumentType = 'RESUME' | 'COVER_LETTER';
export type ApplicationDocumentType = 'RESUME' | 'COVER_LETTER' | 'TRANSCRIPT' | 'PORTFOLIO' | 'OTHER';

export interface ResumeRecord {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  document_type: DocumentType;
  version_label: string;
  base_resume_id: string | null;
  target_role: string | null;
  category: string | null;
  change_summary: string | null;
  file_storage_path: string | null;
  content_text: string | null;
  is_default: boolean;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  legacy_id?: number | null;

  // Computed analytics / performance metrics
  used_count?: number;
  responses_count?: number;
  interviews_count?: number;
  offers_count?: number;
  rejections_count?: number;
}

export interface ApplicationDocumentRecord {
  id: string;
  application_id: string;
  workspace_id: string;
  document_type: ApplicationDocumentType;
  resume_id: string | null;
  file_storage_path: string | null;
  notes: string | null;
  created_at: string;
  resume?: ResumeRecord | null;
}

export interface ResumePerformanceStats {
  used_count: number;
  responses_count: number;
  interviews_count: number;
  offers_count: number;
  rejections_count: number;
  response_rate_pct: number;
  interview_rate_pct: number;
}

/**
 * Gate 02B rate formatting rule:
 * If sample size d < 5, render as "n/d · too few"
 * Otherwise render as "n/d (X.X%)"
 */
export function formatResumeRate(n: number, d: number): {
  ratioText: string;
  percentText: string;
  isTooFew: boolean;
} {
  if (d < 5) {
    return {
      ratioText: `${n}/${d}`,
      percentText: 'too few',
      isTooFew: true,
    };
  }
  const pct = ((n / d) * 100).toFixed(1);
  return {
    ratioText: `${n}/${d}`,
    percentText: `(${pct}%)`,
    isTooFew: false,
  };
}
