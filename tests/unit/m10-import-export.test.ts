import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildPreview, parseCsvRows, parseImport, suggestedField, validateImportRow } from '../../apps/api/src/services/import';
import { buildApplicationsWorkbook, CSV_EXPORT_TYPES, rowsToCsv, safeCell } from '../../apps/api/src/services/export';

describe('Milestone 10 — import and export primitives', () => {
  it('parses RFC-style CSV, JSON, and first-colon structured records', async () => {
    expect(parseCsvRows('company,notes\r\n"Acme, Inc.","line 1\nline 2"')).toEqual([
      ['company', 'notes'], ['Acme, Inc.', 'line 1\nline 2'],
    ]);
    const json = await parseImport('JSON', JSON.stringify([{ company: 'Acme', job_title: 'Engineer', date_applied: '2026-09-26' }]));
    expect(json.headers).toContain('company');
    const structured = await parseImport('STRUCTURED_TEXT', 'company: Acme: Labs\njob_title: Engineer\ndate_applied: 2026-09-26\n---\ncompany: Beta\njob_title: Dev\ndate_applied: 2026-09-25');
    expect(structured.rows).toHaveLength(2);
    expect(structured.rows[0]?.company).toBe('Acme: Labs');
  });

  it('applies every approved alias and rejects ownership/security fields', () => {
    const aliases = {
      company_name: 'company', title: 'job_title', role: 'job_title', application_status: 'stage',
      status: 'stage', application_stage: 'stage', applied_date: 'date_applied', date: 'date_applied',
      url: 'job_url', job_link: 'job_url', work_type: 'work_arrangement', resume: 'resume_version',
      resume_name: 'resume_version', resume_used: 'resume_version', cover_letter: 'cover_letter_version',
    } as const;
    for (const [source, target] of Object.entries(aliases)) expect(suggestedField(source)).toBe(target);
    for (const field of ['user_id', 'owner_id', 'workspace_id', 'created_by', 'actor_id', 'password', 'token']) {
      expect(() => suggestedField(field)).toThrow(/not allowed/);
    }
    expect(suggestedField('made_up_field')).toBeNull();
  });

  it('validates canonical values, normalizes terminal stages, and identifies exact duplicates', () => {
    const checked = validateImportRow({
      company: ' Acme ', job_title: ' Engineer ', date_applied: '2026-09-26', stage: 'Accepted',
      priority: 'high', job_url: 'https://example.test/job/', tags: 'one, two', pinned: '=yes',
    });
    expect(checked.errors).toEqual([]);
    expect(checked.data).toMatchObject({ company: 'Acme', stage: 'ACCEPTED', priority: 'HIGH', tags: ['one', 'two'] });

    const preview = buildPreview({
      headers: ['Company Name', 'Title', 'Applied Date', 'URL'],
      rows: [{ 'Company Name': 'Acme', Title: 'Engineer', 'Applied Date': '2026-09-26', URL: 'https://example.test/job' }],
    }, undefined, [{ id: 'app-1', company_name: 'acme', role_title: 'engineer', applied_at: '2026-09-26T00:00:00Z', job_url: 'https://example.test/job/' }]);
    expect(preview[0]?.validation_status).toBe('DUPLICATE');
    expect(preview[0]?.duplicate_id).toBe('app-1');
  });

  it('neutralizes formula injection in every CSV export type and every cell', () => {
    for (const type of CSV_EXPORT_TYPES) {
      const csv = rowsToCsv(type, [{ id: '=1+1', owner_id: '+cmd', company: '-SUM(A1)', notes: '@evil' }]);
      expect(csv).not.toContain('"=1+1"');
      expect(csv).not.toContain('"+cmd"');
      expect(csv).not.toContain('"-SUM(A1)"');
      expect(csv).not.toContain('"@evil"');
    }
    expect(safeCell('=HYPERLINK("bad")')).toBe("'=HYPERLINK(\"bad\")");
  });

  it('creates a styled, frozen XLSX with formula-safe application cells', async () => {
    const buffer = await buildApplicationsWorkbook([{ id: '1', company: '=2+2', job_title: '@cmd', owner_id: 'owner' }]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet('Applications')!;
    expect(sheet.views[0]?.state).toBe('frozen');
    expect(sheet.autoFilter).toBeTruthy();
    expect(sheet.getCell('A1').font.bold).toBe(true);
    expect(sheet.getCell('C2').value).toBe("'=2+2");
    expect(sheet.getCell('D2').value).toBe("'@cmd");
  });
});
