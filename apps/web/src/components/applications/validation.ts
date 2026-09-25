/** Client-side validation shared by the create and edit forms (AC-CREATE-02). Returns a message or null. */
export function validateApplicationFields(f: {
  companyName: string;
  roleTitle: string;
  jobUrl: string;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
}): string | null {
  if (!f.companyName.trim()) return 'Company name is required.';
  if (!f.roleTitle.trim()) return 'Role title is required.';
  if (f.companyName.trim().length > 128) return 'Company name must be 128 characters or fewer.';
  if (f.roleTitle.trim().length > 128) return 'Role title must be 128 characters or fewer.';

  const url = f.jobUrl.trim();
  if (url) {
    let parsed: URL | null;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
      return 'Job posting URL must start with http:// or https://.';
    }
  }

  const min = f.salaryMin.trim() === '' ? null : Number(f.salaryMin);
  const max = f.salaryMax.trim() === '' ? null : Number(f.salaryMax);
  if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0))) {
    return 'Salary values must be positive numbers.';
  }
  if (min !== null && max !== null && max < min) return 'Salary max must be greater than or equal to salary min.';

  if (!/^[A-Za-z]{3}$/.test(f.salaryCurrency.trim())) return 'Currency must be a 3-letter code (e.g. USD).';
  return null;
}
