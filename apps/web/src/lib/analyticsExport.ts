import type { AnalyticsOverview, StageTiming } from '../types/analytics';

/**
 * Formula injection protection: prepend single quote if text starts with formula triggers
 */
export function sanitizeCsvField(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  const dangerousChars = ['=', '+', '-', '@', '\t', '\r'];
  let escaped = s;
  if (dangerousChars.some((char) => s.startsWith(char))) {
    escaped = `'${s}`;
  }
  if (escaped.includes('"') || escaped.includes(',') || escaped.includes('\n')) {
    return `"${escaped.replace(/"/g, '""')}"`;
  }
  return escaped;
}

export function exportAnalyticsToCsv(overview: AnalyticsOverview, filename = 'analytics-export.csv') {
  const lines: string[] = [];

  // Summary KPIs
  lines.push('--- SEARCH SUMMARY ---');
  lines.push('Metric,Value');
  lines.push(`Total Applications,${overview.total_applications}`);
  lines.push(`Responses,${overview.response_count}`);
  lines.push(`Interviews Reached,${overview.interview_count}`);
  lines.push(`Offers Reached,${overview.offer_count}`);
  lines.push(`Offers Accepted,${overview.accepted_count}`);
  lines.push(`Median Response Days,${overview.median_response_days ?? 'N/A'}`);
  lines.push('');

  // Weekly Activity
  lines.push('--- WEEKLY PACING (LAST 12 WEEKS) ---');
  lines.push('Week,Applied,Responses,Interviews,Weekly Goal Target');
  for (const w of overview.weekly_pacing) {
    lines.push([
      sanitizeCsvField(w.week_label),
      w.applied,
      w.responses,
      w.interviews,
      w.target,
    ].join(','));
  }
  lines.push('');

  // Historical Funnel
  lines.push('--- HISTORICAL FUNNEL (EVER REACHED) ---');
  lines.push('Stage,Count,Percentage');
  for (const f of overview.historical_funnel) {
    lines.push([
      sanitizeCsvField(f.stage),
      f.count,
      `${f.pct ?? 0}%`,
    ].join(','));
  }
  lines.push('');

  // Sources Breakdown
  lines.push('--- SOURCES BREAKDOWN ---');
  lines.push('Source,Applications,Responses,Interviews');
  for (const s of overview.sources_breakdown) {
    lines.push([
      sanitizeCsvField(s.source),
      s.apps,
      s.responses,
      s.interviews,
    ].join(','));
  }
  lines.push('');

  // Resumes Breakdown
  lines.push('--- RESUMES BREAKDOWN ---');
  lines.push('Resume,Applications,Responses,Interviews');
  for (const r of overview.resumes_breakdown) {
    lines.push([
      sanitizeCsvField(r.title),
      r.apps,
      r.responses,
      r.interviews,
    ].join(','));
  }

  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportAnalyticsToJson(overview: AnalyticsOverview, timing?: StageTiming, filename = 'analytics-export.json') {
  const exportData = {
    exportedAt: new Date().toISOString(),
    overview,
    timing: timing ?? null,
  };
  const jsonContent = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
