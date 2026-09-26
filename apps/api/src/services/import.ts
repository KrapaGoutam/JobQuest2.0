import ExcelJS from 'exceljs';

export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export const IMPORT_FIELDS = [
  'company', 'job_title', 'job_url', 'location', 'work_arrangement',
  'employment_type', 'date_applied', 'source', 'stage', 'priority',
  'salary_min', 'salary_max', 'salary_currency', 'salary_range',
  'resume_version', 'cover_letter_version', 'recruiter_name',
  'recruiter_email', 'recruiter_phone', 'job_description', 'notes',
  'next_action', 'next_action_date', 'last_response_date', 'external_job_id',
  'tags', 'pinned', 'important', 'favorite',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ImportFormat = 'CSV' | 'XLSX' | 'JSON' | 'STRUCTURED_TEXT';

const fieldSet = new Set<string>(IMPORT_FIELDS);
const aliases: Record<string, ImportField> = {
  company_name: 'company',
  title: 'job_title',
  role: 'job_title',
  application_status: 'stage',
  status: 'stage',
  application_stage: 'stage',
  applied_date: 'date_applied',
  date: 'date_applied',
  url: 'job_url',
  job_link: 'job_url',
  work_type: 'work_arrangement',
  resume: 'resume_version',
  resume_name: 'resume_version',
  resume_used: 'resume_version',
  cover_letter: 'cover_letter_version',
};
const forbidden = new Set([
  'user_id', 'userid', 'owner_id', 'ownerid', 'workspace_id', 'workspaceid',
  'created_by', 'createdby', 'updated_by', 'updatedby', 'actor_id', 'actorid',
  'is_manager', 'password', 'password_hash', 'token', 'refresh_token',
]);

const stageMap: Record<string, string> = {
  saved: 'SAVED', preparing: 'PREPARING', applied: 'APPLIED', assessment: 'ASSESSMENT',
  recruiter_screen: 'RECRUITER_SCREEN', interview: 'INTERVIEW',
  final_interview: 'FINAL_INTERVIEW', offer: 'OFFER', rejected: 'REJECTED',
  withdrawn: 'WITHDRAWN', ghosted: 'GHOSTED', position_closed: 'POSITION_CLOSED',
  accepted: 'ACCEPTED',
};
const workMap: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'Onsite', 'on-site': 'Onsite' };
const employmentMap: Record<string, string> = {
  'full-time': 'Full-time', full_time: 'Full-time', fulltime: 'Full-time',
  contract: 'Contract', 'part-time': 'Part-time', part_time: 'Part-time', parttime: 'Part-time',
  internship: 'Internship', temporary: 'Temporary', other: 'Other',
};

export interface ParsedImport {
  headers: string[];
  rows: Record<string, unknown>[];
}

export interface PreviewRow {
  row_number: number;
  validation_status: 'VALID' | 'WARNING' | 'INVALID' | 'DUPLICATE';
  data: Record<string, unknown>;
  summary: { company: string; job_title: string; date_applied: string };
  messages: string[];
  duplicate_id: string | null;
  duplicate_action?: 'SKIP' | 'IMPORT_ANYWAY' | 'UPDATE_EXISTING';
}

export interface ExistingApplication {
  id: string;
  company_name: string;
  role_title: string;
  applied_at: string;
  job_url: string | null;
}

export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function suggestedField(header: string): ImportField | null {
  const normalized = normalizeHeader(header);
  if (forbidden.has(normalized)) throw new Error(`Ownership or security field is not allowed: ${header}`);
  if (fieldSet.has(normalized)) return normalized as ImportField;
  return aliases[normalized] ?? null;
}

export function parseCsvRows(text: string): string[][] {
  const table: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); table.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (field.length || row.length) { row.push(field); table.push(row); }
  return table.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

function recordsFromTable(table: unknown[][]): ParsedImport {
  if (table.length < 2) throw new Error('The file must include a header row and at least one data row.');
  const headers = table[0]!.map((cell) => String(cell ?? '').trim());
  if (headers.some((header) => !header)) throw new Error('Every import column must have a header.');
  if (new Set(headers.map(normalizeHeader)).size !== headers.length) throw new Error('Import headers must be unique.');
  const rows = table.slice(1).filter((cells) => cells.some((cell) => String(cell ?? '').trim() !== '')).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])),
  );
  if (!rows.length) throw new Error('The file does not contain any data rows.');
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Imports are limited to ${MAX_IMPORT_ROWS} rows per batch.`);
  return { headers, rows };
}

function excelCellValue(value: ExcelJS.CellValue): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === 'object') {
    if ('text' in value) return String(value.text);
    if ('result' in value) return value.result ?? '';
    if ('richText' in value) return value.richText.map((item) => item.text).join('');
  }
  return value ?? '';
}

export async function parseImport(format: ImportFormat, content: string): Promise<ParsedImport> {
  if (!content.trim()) throw new Error('Import input is required.');
  if (Buffer.byteLength(content, format === 'XLSX' ? 'base64' : 'utf8') > MAX_IMPORT_BYTES) {
    throw new Error('Import input exceeds the 5 MB limit.');
  }
  if (format === 'CSV') return recordsFromTable(parseCsvRows(content));
  if (format === 'JSON') {
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw new Error('Input is not valid JSON.'); }
    if (!Array.isArray(parsed) || !parsed.length || parsed.some((item) => !item || Array.isArray(item) || typeof item !== 'object')) {
      throw new Error('JSON input must be a non-empty array of objects.');
    }
    if (parsed.length > MAX_IMPORT_ROWS) throw new Error(`Imports are limited to ${MAX_IMPORT_ROWS} rows per batch.`);
    const headers = [...new Set(parsed.flatMap((item) => Object.keys(item as Record<string, unknown>)))];
    return { headers, rows: parsed as Record<string, unknown>[] };
  }
  if (format === 'STRUCTURED_TEXT') {
    const rows = content.split(/^\s*---\s*$/m).map((block, index) => {
      const item: Record<string, unknown> = {};
      for (const line of block.split(/\r?\n/).filter((entry) => entry.trim())) {
        const colon = line.indexOf(':');
        if (colon < 1) throw new Error(`Row ${index + 1} has a malformed line: ${line}`);
        item[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
      }
      return item;
    }).filter((item) => Object.keys(item).length);
    if (!rows.length) throw new Error('Structured text does not contain any records.');
    if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Imports are limited to ${MAX_IMPORT_ROWS} rows per batch.`);
    return { headers: [...new Set(rows.flatMap(Object.keys))], rows };
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(content, 'base64') as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('The workbook does not contain a worksheet.');
  const table: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (excelRow) => {
    const values: unknown[] = [];
    for (let col = 1; col <= excelRow.cellCount; col += 1) values.push(excelCellValue(excelRow.getCell(col).value));
    table.push(values);
  });
  return recordsFromTable(table);
}

function asDate(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== text ? null : text;
}

function asBoolean(value: unknown): boolean {
  return [true, 1, '1', 'true', 'yes', 'y'].includes(typeof value === 'string' ? value.trim().toLowerCase() : value as never);
}

function mapRow(
  raw: Record<string, unknown>,
  headers: string[],
  mapping: Record<string, string | null> | undefined,
): { data: Record<string, unknown>; errors: string[] } {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];
  const used = new Set<string>();
  for (const header of headers) {
    let target: string | null;
    try { target = mapping && header in mapping ? (mapping[header] ?? null) : suggestedField(header); }
    catch (error) { errors.push((error as Error).message); continue; }
    if (!target) { errors.push(`Unknown field: ${header}`); continue; }
    const normalizedTarget = normalizeHeader(target);
    if (!fieldSet.has(normalizedTarget)) { errors.push(`Unknown target field: ${target}`); continue; }
    if (used.has(normalizedTarget)) { errors.push(`More than one column maps to ${normalizedTarget}`); continue; }
    used.add(normalizedTarget);
    data[normalizedTarget] = raw[header];
  }
  return { data, errors };
}

export function validateImportRow(input: Record<string, unknown>): { data: Record<string, unknown>; errors: string[]; warnings: string[] } {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const [key, raw] of Object.entries(input)) {
    if (!fieldSet.has(key)) { errors.push(`Unknown field: ${key}`); continue; }
    data[key] = typeof raw === 'string' ? raw.trim() : raw;
  }
  for (const required of ['company', 'job_title'] as const) {
    if (!String(data[required] ?? '').trim()) errors.push(`${required === 'company' ? 'Company' : 'Job title'} is required`);
    if (String(data[required] ?? '').trim().length > 128) errors.push(`${required} must be 128 characters or fewer`);
  }
  const applied = asDate(data.date_applied);
  if (!applied) errors.push('Date applied must be a real date in YYYY-MM-DD format');
  else data.date_applied = applied;
  for (const field of ['next_action_date', 'last_response_date'] as const) {
    if (data[field]) {
      const date = asDate(data[field]);
      if (!date) errors.push(`${field} must be a real date in YYYY-MM-DD format`);
      else data[field] = date;
    }
  }
  const stageKey = normalizeHeader(String(data.stage ?? 'Applied'));
  if (!stageMap[stageKey]) errors.push(`Unsupported stage: ${String(data.stage)}`);
  else data.stage = stageMap[stageKey];
  const priority = String(data.priority ?? 'MEDIUM').toUpperCase();
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(priority)) errors.push(`Unsupported priority: ${String(data.priority)}`);
  else data.priority = priority;
  if (data.work_arrangement) {
    const work = workMap[String(data.work_arrangement).toLowerCase()];
    if (!work) errors.push(`Unsupported work arrangement: ${String(data.work_arrangement)}`);
    else data.work_arrangement = work;
  }
  if (data.employment_type) {
    const employment = employmentMap[normalizeHeader(String(data.employment_type)).replace(/^full_time$/, 'full_time')]
      ?? employmentMap[String(data.employment_type).toLowerCase()];
    if (!employment) errors.push(`Unsupported employment type: ${String(data.employment_type)}`);
    else data.employment_type = employment;
  }
  if (data.job_url) {
    try {
      const url = new URL(String(data.job_url));
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      data.job_url = url.toString();
    } catch { errors.push('Job URL must be a valid http(s) URL'); }
  }
  if (data.recruiter_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(data.recruiter_email))) {
    errors.push('Recruiter email is invalid');
  }
  for (const field of ['salary_min', 'salary_max'] as const) {
    if (data[field] !== undefined && data[field] !== '') {
      const numeric = Number(data[field]);
      if (!Number.isFinite(numeric) || numeric < 0) errors.push(`${field} must be a non-negative number`);
      else data[field] = numeric;
    } else delete data[field];
  }
  if (data.salary_range && data.salary_min === undefined && data.salary_max === undefined) {
    const match = String(data.salary_range).replaceAll(',', '').match(/^\s*\$?(\d+(?:\.\d+)?)\s*[-–]\s*\$?(\d+(?:\.\d+)?)\s*$/);
    if (match) { data.salary_min = Number(match[1]); data.salary_max = Number(match[2]); }
    else warnings.push('Salary range was retained as text but could not be split into minimum and maximum');
  }
  if (Number(data.salary_min) > Number(data.salary_max)) errors.push('salary_min cannot exceed salary_max');
  if (data.tags !== undefined) data.tags = Array.isArray(data.tags)
    ? data.tags.map(String).map((tag) => tag.trim()).filter(Boolean)
    : String(data.tags).split(',').map((tag) => tag.trim()).filter(Boolean);
  for (const field of ['pinned', 'important', 'favorite'] as const) if (field in data) data[field] = asBoolean(data[field]);
  for (const field of ['resume_version', 'cover_letter_version'] as const) {
    if (String(data[field] ?? '').length > 100) errors.push(`${field} must be 100 characters or fewer`);
  }
  delete data.salary_range;
  return { data, errors, warnings };
}

function normalizedUrl(value: unknown): string {
  return String(value ?? '').trim().replace(/\/+$/, '').toLowerCase();
}

export function buildPreview(
  parsed: ParsedImport,
  mapping: Record<string, string | null> | undefined,
  existing: ExistingApplication[],
): PreviewRow[] {
  return parsed.rows.map((raw, index) => {
    const mapped = mapRow(raw, parsed.headers, mapping);
    const checked = validateImportRow(mapped.data);
    const errors = [...mapped.errors, ...checked.errors];
    const date = String(checked.data.date_applied ?? '');
    const url = normalizedUrl(checked.data.job_url);
    const duplicate = errors.length ? undefined : existing.find((application) =>
      application.company_name.trim().toLowerCase() === String(checked.data.company).trim().toLowerCase()
      && application.role_title.trim().toLowerCase() === String(checked.data.job_title).trim().toLowerCase()
      && application.applied_at.slice(0, 10) === date
      && (!url || normalizedUrl(application.job_url) === url),
    );
    const messages = [...errors, ...checked.warnings, ...(duplicate ? ['Possible duplicate application'] : [])];
    const validation_status: PreviewRow['validation_status'] = errors.length
      ? 'INVALID' : duplicate ? 'DUPLICATE' : checked.warnings.length ? 'WARNING' : 'VALID';
    return {
      row_number: index + 1,
      validation_status,
      data: checked.data,
      summary: {
        company: String(checked.data.company ?? ''),
        job_title: String(checked.data.job_title ?? ''),
        date_applied: date,
      },
      messages,
      duplicate_id: duplicate?.id ?? null,
    };
  });
}
