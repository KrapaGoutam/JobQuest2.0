#!/usr/bin/env node
/**
 * JobQuest 2.0 · M15-E · Step 16A-2 — APPLICATION-DOMAIN legacy import tool.
 *
 * One-time migration tooling (not application code, not part of any release bundle).
 * Reads the LOCKED, checksum-verified JobQuest 1.0 export and produces:
 *   - a DRY-RUN report (no database access whatsoever), and
 *   - resumable, atomic SQL batches for the application domain only.
 *
 * Scope (by operator decision): applications, job_snapshots, application_events,
 * application_documents(resume-version label) and migration audit rows.
 * NEVER migrated: users, passwords/PIN hashes, sessions, refresh tokens, recovery codes,
 * claim codes, extension tokens, rate-limit rows, contacts, interviews, tasks, habits,
 * journal, goals, resumes, preferences.
 *
 * Usage:
 *   node import-legacy-applications.mjs --export <json> --out <dir>                     # dry run (default)
 *   node import-legacy-applications.mjs --export <json> --out <dir> --emit-sql \
 *        --owner-id <uuid> --workspace-id <uuid> [--batch-size 20] [--rehearsal]
 *
 * The tool never connects to a database and never prints credentials.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const LOCKED_EXPORT_SHA256 = 'f7eff96083bc2d825631de91d0f8301d51da716f31fd39dbcdc2e1a547e6422e';
const SOURCE_SYSTEM = 'JobQuest 1.0 (Neon) locked export legacy_neon_export_20260928_120500.json';

// ------------------------------------------------------------------ args
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const flag = (name) => args.includes(`--${name}`);
const EXPORT_PATH = opt('export');
const OUT_DIR = resolve(opt('out', 'test-results/step16a2'));
const BATCH_SIZE = Number(opt('batch-size', 20));
if (!EXPORT_PATH) { console.error('--export <path> is required'); process.exit(2); }

// ------------------------------------------------------------------ load + verify
const raw = readFileSync(EXPORT_PATH);
const sha = createHash('sha256').update(raw).digest('hex');
if (sha !== LOCKED_EXPORT_SHA256) {
  console.error(`FATAL: export checksum ${sha} does not match the locked M15-D checksum. Refusing to continue.`);
  process.exit(3);
}
const data = JSON.parse(raw.toString('utf8'));

// ------------------------------------------------------------------ helpers
const txt = (v) => { if (v === null || v === undefined) return null; const t = String(v).trim(); return t === '' ? null : t; };
const norm = (v) => (txt(v) ?? '').toLowerCase();
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** '2026-08-03 22:51:27.1234+00' -> '2026-08-03T22:51:27.123400Z' (microsecond precision preserved). */
function canonTs(v) {
  if (v === null || v === undefined || v === '') return null;
  const m = String(v).trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:\s*(Z|[+-]\d{2}(?::?\d{2})?))?$/);
  if (!m) return undefined; // unparseable
  const tz = m[4];
  if (tz && tz !== 'Z' && !/^[+-]00(:?00)?$/.test(tz)) return undefined; // only UTC accepted (all source rows are +00)
  return `${m[1]}T${m[2]}.${(m[3] ?? '').padEnd(6, '0')}Z`;
}
const dateOnly = (v) => { const t = txt(v); return t && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t)) ? t : null; };

// Canonical workflow (Saved … Accepted). Anything else is quarantined, never defaulted.
const STAGE_MAP = {
  Saved:              { stage: 'SAVED',            status: 'OPEN' },
  Preparing:          { stage: 'PREPARING',        status: 'OPEN' },
  Applied:            { stage: 'APPLIED',          status: 'OPEN' },
  Assessment:         { stage: 'ASSESSMENT',       status: 'OPEN' },
  'Recruiter Screen': { stage: 'RECRUITER_SCREEN', status: 'OPEN' },
  Interview:          { stage: 'INTERVIEW',        status: 'OPEN' },
  'Final Interview':  { stage: 'FINAL_INTERVIEW',  status: 'OPEN' },
  Offer:              { stage: 'OFFER',            status: 'OPEN' },
  // Closed outcomes: JQ2 keeps stage independent of outcome. Legacy has no "stage before closing", and a
  // withdrawn/rejected/ghosted/closed application implies it was applied -> APPLIED (Accepted -> OFFER).
  Accepted:           { stage: 'OFFER',   status: 'CLOSED', outcome: 'ACCEPTED' },
  Rejected:           { stage: 'APPLIED', status: 'CLOSED', outcome: 'REJECTED' },
  Withdrawn:          { stage: 'APPLIED', status: 'CLOSED', outcome: 'WITHDRAWN', closureReason: 'GENERAL_WITHDRAWAL' },
  Ghosted:            { stage: 'APPLIED', status: 'CLOSED', outcome: 'GHOSTED' },
  'Position Closed':  { stage: 'APPLIED', status: 'CLOSED', outcome: 'POSITION_CLOSED' },
};
const WORK = new Set(['Remote', 'Hybrid', 'Onsite']);
const EMP = new Set(['Full-time', 'Contract', 'Part-time', 'Internship', 'Temporary', 'Other']); // chk_app_employment_type (M10)
const PRIORITY = new Set(['LOW', 'MEDIUM', 'HIGH']);

// ------------------------------------------------------------------ index legacy relations
const apps = data.applications;
const tagName = new Map(data.tags.map((t) => [t.id, txt(t.name)]));
const tagsByApp = new Map();
for (const at of [...data.application_tags].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) {
  const n = tagName.get(at.tag_id);
  if (!n) continue;
  const list = tagsByApp.get(at.application_id) ?? [];
  if (!list.some((x) => x.toLowerCase() === n.toLowerCase())) list.push(n);
  tagsByApp.set(at.application_id, list);
}
const historyByApp = new Map();
for (const h of data.stage_history) (historyByApp.get(h.application_id) ?? historyByApp.set(h.application_id, []).get(h.application_id)).push(h);
for (const l of historyByApp.values()) l.sort((a, b) => Date.parse(a.entered_at) - Date.parse(b.entered_at) || a.id - b.id);

// ------------------------------------------------------------------ transform
const issues = []; // { legacyId, level: 'ERROR'|'WARN', field, message }
const issue = (legacyId, level, field, message) => issues.push({ legacyId, level, field, message });

function transform(a) {
  const id = a.id;
  const errs0 = issues.length;
  const map = STAGE_MAP[txt(a.stage) ?? ''];
  if (!map) issue(id, 'ERROR', 'stage', `unmapped legacy stage "${a.stage}" (quarantined, not defaulted)`);

  const company = txt(a.company); const title = txt(a.job_title);
  if (!company) issue(id, 'ERROR', 'company', 'missing company');
  if (!title) issue(id, 'ERROR', 'job_title', 'missing job title');
  if (company && company.length > 128) issue(id, 'ERROR', 'company', 'longer than 128');
  if (title && title.length > 128) issue(id, 'ERROR', 'job_title', 'longer than 128');

  const appliedDate = dateOnly(a.date_applied);
  if (!appliedDate) issue(id, 'ERROR', 'date_applied', 'missing/invalid date');
  const createdAt = canonTs(a.created_at); const updatedAt = canonTs(a.updated_at);
  if (!createdAt) issue(id, 'ERROR', 'created_at', 'missing/invalid timestamp');
  if (!updatedAt) issue(id, 'ERROR', 'updated_at', 'missing/invalid timestamp');

  const jobUrl = txt(a.job_url);
  if (jobUrl && !/^https?:\/\//i.test(jobUrl)) issue(id, 'WARN', 'job_url', 'not an http(s) URL (kept verbatim)');
  const ext = txt(a.external_job_id); if (ext && ext.length > 128) issue(id, 'ERROR', 'external_job_id', 'longer than 128');
  const location = txt(a.location); if (location && location.length > 128) issue(id, 'ERROR', 'location', 'longer than 128');
  const source = txt(a.source); if (source && source.length > 128) issue(id, 'ERROR', 'source', 'longer than 128');

  let work = txt(a.work_arrangement);
  if (work && !WORK.has(work)) { issue(id, 'WARN', 'work_arrangement', `unknown value "${work}" -> NULL`); work = null; }
  let emp = txt(a.employment_type);
  if (emp && !EMP.has(emp)) { issue(id, 'WARN', 'employment_type', `unknown value "${emp}" -> NULL`); emp = null; }
  let priority = (txt(a.priority) ?? 'MEDIUM').toUpperCase();
  if (!PRIORITY.has(priority)) { issue(id, 'WARN', 'priority', `unknown value "${a.priority}" -> MEDIUM`); priority = 'MEDIUM'; }

  const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const salaryMin = num(a.salary_min); const salaryMax = num(a.salary_max);
  if (salaryMin !== null && salaryMin < 0) issue(id, 'ERROR', 'salary_min', 'negative');
  if (salaryMin !== null && salaryMax !== null && salaryMax < salaryMin) issue(id, 'ERROR', 'salary_max', 'below salary_min');
  const cur = txt(a.salary_currency);
  const currency = cur && cur.length === 3 ? cur.toUpperCase() : 'USD'; // schema default; only present with salary in source

  // notes keep the verbatim legacy salary text (it carries the unit, e.g. "per hour", which the numeric columns cannot)
  const salaryRange = txt(a.salary_range);
  let notes = txt(a.notes);
  if (salaryRange) notes = notes ? `${notes}\n[Salary Range: ${salaryRange}]` : `[Salary Range: ${salaryRange}]`;

  const nextAction = txt(a.next_action); if (nextAction && nextAction.length > 255) issue(id, 'ERROR', 'next_action', 'longer than 255');
  let nextDate = null;
  if (txt(a.next_action_date)) { nextDate = dateOnly(a.next_action_date); if (!nextDate) issue(id, 'ERROR', 'next_action_date', 'invalid date'); }
  const lastResp = txt(a.last_response_date) ? dateOnly(a.last_response_date) : null;
  const resumeLabel = txt(a.resume_version); if (resumeLabel && resumeLabel.length > 100) issue(id, 'ERROR', 'resume_version', 'longer than 100');
  const description = txt(a.job_description);

  // history-derived timestamps (evidence-based, never invented)
  const hist = historyByApp.get(id) ?? [];
  const extraEvents = [];
  let closedAt = null;
  if (map?.status === 'CLOSED') {
    const closing = hist.find((h) => h.new_stage === a.stage);
    closedAt = canonTs(closing?.entered_at);
    if (!closedAt) issue(id, 'ERROR', 'closed_at', 'no stage_history evidence for closure time');
    extraEvents.push({
      type: 'OUTCOME_CHANGED', at: closedAt,
      payload: { outcome: map.outcome, closure_reason: map.closureReason ?? null, stage_at_close: map.stage, legacy_import: true },
    });
  }
  for (const h of hist.filter((x) => x.previous_stage)) {
    const from = STAGE_MAP[h.previous_stage]; const to = STAGE_MAP[h.new_stage];
    if (!from || !to || from.status !== 'OPEN' || to.status !== 'OPEN') { issue(id, 'WARN', 'stage_history', `non-canonical transition ${h.previous_stage}->${h.new_stage} not imported`); continue; }
    extraEvents.push({
      type: 'STAGE_CHANGED', at: canonTs(h.entered_at),
      payload: { from_stage: from.stage, to_stage: to.stage, notes: null, status: 'OPEN', legacy_import: true },
    });
  }

  return {
    ok: issues.length === errs0 || !issues.slice(errs0).some((i) => i.level === 'ERROR'),
    legacyId: id,
    companyName: company, roleTitle: title,
    stage: map?.stage, status: map?.status, outcome: map?.outcome ?? null, closureReason: map?.closureReason ?? null,
    closedAt, priority, nextAction, nextActionDate: nextDate,
    lastActivityAt: updatedAt, archivedAt: canonTs(a.archived_at) ?? null,
    createdAt, updatedAt,
    jobUrl, externalJobId: ext, location, workArrangement: work, employmentType: emp,
    salaryMin, salaryMax, salaryCurrency: currency, tags: tagsByApp.get(id) ?? [], notes,
    appliedAt: appliedDate ? `${appliedDate}T00:00:00.000000Z` : null, appliedDate,
    source, lastResponseDate: lastResp, pinned: a.pinned === true, important: a.important === true, favorite: a.favorite === true,
    description, resumeLabel, events: extraEvents,
  };
}

const rows = apps.map(transform);
const accepted = rows.filter((r) => r.ok);
const quarantined = rows.filter((r) => !r.ok);

// ------------------------------------------------------------------ duplicate analysis (current JQ2 tier semantics)
function groups(keyFn) {
  const m = new Map();
  for (const r of accepted) { const k = keyFn(r); if (k === null) continue; (m.get(k) ?? m.set(k, []).get(k)).push(r.legacyId); }
  return [...m.values()].filter((g) => g.length > 1);
}
const strongUrl = groups((r) => (r.jobUrl ? r.jobUrl.toLowerCase() : null));
const strongExt = groups((r) => r.externalJobId);
const probable = groups((r) => `${norm(r.companyName)}\u0000${norm(r.roleTitle)}`);
const exact = groups((r) => `${norm(r.companyName)}\u0000${norm(r.roleTitle)}\u0000${r.appliedDate}\u0000${norm(r.jobUrl)}\u0000${r.externalJobId ?? ''}`);
const inAny = (gs) => new Set(gs.flat());
const strongSet = new Set([...inAny(strongUrl), ...inAny(strongExt)]);
const exactSet = inAny(exact);
const probableOnly = [...inAny(probable)].filter((i) => !strongSet.has(i) && !exactSet.has(i));

// ------------------------------------------------------------------ expected event / row counts
const expected = {
  applications: accepted.length,
  job_snapshots: accepted.filter((r) => r.description).length,
  application_documents: accepted.filter((r) => r.resumeLabel).length,
  events: {
    CREATED: accepted.length,
    CAPTURED: accepted.filter((r) => r.description).length,
    STAGE_CHANGED: accepted.flatMap((r) => r.events).filter((e) => e.type === 'STAGE_CHANGED').length,
    OUTCOME_CHANGED: accepted.flatMap((r) => r.events).filter((e) => e.type === 'OUTCOME_CHANGED').length,
  },
};
expected.events.TOTAL = Object.values(expected.events).reduce((s, n) => s + n, 0);

const dist = (list, f) => Object.fromEntries(Object.entries(list.reduce((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort());
const stageMapping = {};
for (const a of apps) { const k = `${a.stage} -> ${STAGE_MAP[txt(a.stage) ?? '']?.stage ?? 'QUARANTINE'}/${STAGE_MAP[txt(a.stage) ?? '']?.status ?? '-'}${STAGE_MAP[txt(a.stage) ?? '']?.outcome ? '/' + STAGE_MAP[txt(a.stage) ?? ''].outcome : ''}`; stageMapping[k] = (stageMapping[k] ?? 0) + 1; }

// unmapped source columns that actually carry data
const MAPPED = new Set(['id', 'company', 'job_title', 'date_applied', 'stage', 'job_url', 'location', 'work_arrangement', 'employment_type', 'source', 'priority', 'salary_min', 'salary_max', 'salary_currency', 'salary_range', 'resume_version', 'job_description', 'notes', 'next_action', 'next_action_date', 'last_response_date', 'external_job_id', 'created_at', 'updated_at', 'pinned', 'important', 'favorite', 'archived_at']);
const nonEmpty = (v) => v !== null && v !== undefined && v !== '' && v !== 0 && v !== false;
const unmapped = {};
for (const k of Object.keys(apps[0])) if (!MAPPED.has(k)) unmapped[k] = apps.filter((a) => nonEmpty(a[k])).length;
const droppedHistory = {
  application_created_activities: data.activities.filter((x) => x.activity_type === 'application_created').length,
  stage_changed_activities: data.activities.filter((x) => x.activity_type === 'stage_changed').length,
  application_updated_activities_not_importable: data.activities.filter((x) => x.activity_type === 'application_updated').length,
  timeline_resume_changed_not_importable: data.timeline_events.filter((x) => x.event_type === 'resume_changed').length,
};

const report = {
  tool: 'import-legacy-applications.mjs (Step 16A-2)',
  mode: flag('emit-sql') ? 'emit-sql' : 'dry-run',
  source: { file: 'legacy_neon_export_20260928_120500.json', sha256: sha, sha256_matches_locked: true, applications: apps.length, users_in_export_NOT_MIGRATED: data.users.length },
  accepted: accepted.length, quarantined: quarantined.length, warnings: issues.filter((i) => i.level === 'WARN').length,
  stage_mapping: stageMapping,
  target_stage_distribution: dist(accepted, (r) => `${r.stage}/${r.status}${r.outcome ? '/' + r.outcome : ''}`),
  duplicates: { exact_duplicate_rows: exact.reduce((s, g) => s + g.length, 0), exact_groups: exact.length, strong_url_groups: strongUrl.length, strong_external_id_groups: strongExt.length, strong_rows: strongSet.size, probable_company_role_groups: probable.length, probable_rows: inAny(probable).size, probable_only_rows: probableOnly.length, policy: 'all imported; none dropped; listed as exceptions' },
  distinct_companies_normalised: new Set(accepted.map((r) => norm(r.companyName))).size,
  companies_table_rows_to_create: 0,
  expected_rows: expected,
  tags: { rows_with_tags: accepted.filter((r) => r.tags.length).length, tag_links: accepted.reduce((s, r) => s + r.tags.length, 0) },
  unmapped_source_columns_with_data: Object.fromEntries(Object.entries(unmapped).filter(([, n]) => n > 0)),
  unmapped_source_columns_all_empty: Object.entries(unmapped).filter(([, n]) => n === 0).map(([k]) => k),
  legacy_history_not_imported: droppedHistory,
  issue_counts: { errors: issues.filter((i) => i.level === 'ERROR').length, warnings: issues.filter((i) => i.level === 'WARN').length },
  never_migrated_confirmation: ['users', 'password_hash', 'pin_hash', 'sessions', 'refresh tokens', 'recovery codes', 'claim codes', 'extension_tokens', 'rate limits', 'contacts', 'interviews', 'tasks', 'habits', 'notes/journal', 'goals', 'resumes', 'preferences'],
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'dry_run_report.json'), JSON.stringify(report, null, 2));
writeFileSync(resolve(OUT_DIR, 'exceptions.json'), JSON.stringify({
  quarantined: quarantined.map((r) => r.legacyId),
  issues,
  exact_duplicate_groups: exact, strong_url_groups: strongUrl, strong_external_id_groups: strongExt, probable_company_role_groups: probable,
  probable_group_detail: probable.map((g) => g.map((id) => { const r = accepted.find((x) => x.legacyId === id); return { legacyId: id, stage: r.stage, status: r.status, appliedDate: r.appliedDate, hasUrl: Boolean(r.jobUrl), extId: r.externalJobId }; })),
}, null, 2));

// ------------------------------------------------------------------ expected-fingerprint (for post-import reconciliation)
const money = (n) => (n === null ? '' : n.toFixed(2));
const fpApp = (r) => [r.legacyId, r.companyName, r.roleTitle, r.stage, r.status, r.outcome ?? '', r.closureReason ?? '', r.appliedDate, r.jobUrl ?? '', r.externalJobId ?? '', r.location ?? '', r.source ?? '', r.employmentType ?? '', r.workArrangement ?? '', money(r.salaryMin), money(r.salaryMax), r.salaryCurrency, r.priority, r.nextAction ?? '', r.nextActionDate ?? '', r.createdAt, r.updatedAt, r.closedAt ?? '', md5(r.notes ?? ''), [...r.tags].sort().join(',')].join('|');
const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
const fpAll = md5(accepted.slice().sort((a, b) => a.legacyId - b.legacyId).map(fpApp).join('\n'));
const fpSnap = md5(accepted.filter((r) => r.description).sort((a, b) => a.legacyId - b.legacyId).map((r) => `${r.legacyId}:${md5(r.description)}`).join('\n'));
const fpDocs = md5(accepted.filter((r) => r.resumeLabel).sort((a, b) => a.legacyId - b.legacyId).map((r) => `${r.legacyId}:${r.resumeLabel}`).join('\n'));
writeFileSync(resolve(OUT_DIR, 'expected_fingerprints.json'), JSON.stringify({ applications: fpAll, snapshots: fpSnap, documents: fpDocs, expected_rows: expected }, null, 2));

console.log(JSON.stringify({ ...report, expected_fingerprints: { applications: fpAll, snapshots: fpSnap, documents: fpDocs } }, null, 2));

// ------------------------------------------------------------------ SQL emission
if (flag('emit-sql')) {
  const owner = opt('owner-id'); const ws = opt('workspace-id');
  if (!owner || !uuidRe.test(owner) || !ws || !uuidRe.test(ws)) { console.error('--owner-id and --workspace-id must be UUIDs'); process.exit(2); }
  if (quarantined.length) { console.error('Refusing to emit SQL while rows are quarantined.'); process.exit(4); }
  const rehearsal = flag('rehearsal');
  const batchId = opt('batch-id', randomUUID());
  const list = accepted.slice().sort((a, b) => a.legacyId - b.legacyId);
  const toJson = (r) => ({
    legacy_id: r.legacyId, company_name: r.companyName, role_title: r.roleTitle, stage: r.stage, status: r.status, outcome: r.outcome,
    closure_reason: r.closureReason, closed_at: r.closedAt, priority: r.priority, next_action: r.nextAction, next_action_date: r.nextActionDate,
    last_activity_at: r.lastActivityAt, archived_at: r.archivedAt, created_at: r.createdAt, updated_at: r.updatedAt,
    job_url: r.jobUrl, external_job_id: r.externalJobId, location: r.location, work_arrangement: r.workArrangement, employment_type: r.employmentType,
    salary_min: r.salaryMin, salary_max: r.salaryMax, salary_currency: r.salaryCurrency, tags: r.tags, notes: r.notes, applied_at: r.appliedAt,
    source: r.source, last_response_date: r.lastResponseDate, pinned: r.pinned, important: r.important, favorite: r.favorite,
    description: r.description, resume_label: r.resumeLabel, events: r.events,
  });
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const TAG = 'jq16a2d'; // dollar-quote tag; asserted absent from data below

  const batchSql = (chunk, { withHeader, pre = '', post = '' }) => {
    const json = JSON.stringify(chunk.map(toJson));
    if (json.includes(`$${TAG}$`) || json.includes('$jq$')) throw new Error('dollar-quote collision');
    return `do $jq$
declare
  v_ws    constant uuid := ${q(ws)};
  v_owner constant uuid := ${q(owner)};
  v_batch constant uuid := ${q(batchId)};
  v_j     constant jsonb := $${TAG}$${json}$${TAG}$::jsonb;
  v_new   int; v_snap int; v_ev int; v_docs int;
begin
  ${pre}
  if not exists (select 1 from public.workspace_members m where m.workspace_id = v_ws and m.user_id = v_owner and m.role = 'MANAGER' and m.status = 'ACTIVE') then
    raise exception 'IMPORT_OWNER_IS_NOT_ACTIVE_MANAGER_OF_WORKSPACE';
  end if;
  ${withHeader ? `insert into public.migration_batches (batch_id, source_system, target_workspace_id, status, summary)
    values (v_batch, ${q(SOURCE_SYSTEM)}, v_ws, 'RUNNING', '{"scope":"application-domain-only","step":"16A-2"}'::jsonb)
    on conflict (batch_id) do nothing;` : ''}
  create temp table _src on commit drop as
    select * from jsonb_to_recordset(v_j) as x(
      legacy_id int, company_name text, role_title text, stage text, status text, outcome text, closure_reason text, closed_at timestamptz,
      priority text, next_action text, next_action_date date, last_activity_at timestamptz, archived_at timestamptz, created_at timestamptz,
      updated_at timestamptz, job_url text, external_job_id text, location text, work_arrangement text, employment_type text,
      salary_min numeric, salary_max numeric, salary_currency text, tags jsonb, notes text, applied_at timestamptz, source text,
      last_response_date date, pinned boolean, important boolean, favorite boolean, description text, resume_label text, events jsonb);
  create temp table _new on commit drop as
    select s.*, gen_random_uuid() as app_id from _src s
     where not exists (select 1 from public.applications a where a.workspace_id = v_ws and a.legacy_id = s.legacy_id);
  insert into public.applications (id, workspace_id, user_id, company_name, role_title, stage, status, outcome, closure_reason, closed_at, priority,
      next_action, next_action_date, last_activity_at, archived_at, created_at, updated_at, job_url, external_job_id, location, work_arrangement,
      employment_type, salary_min, salary_max, salary_currency, tags, notes, applied_at, source, last_response_date, pinned, important, favorite, legacy_id)
    select app_id, v_ws, v_owner, company_name, role_title, stage, status, outcome, closure_reason, closed_at, priority,
      next_action, next_action_date, last_activity_at, archived_at, created_at, updated_at, job_url, external_job_id, location, work_arrangement,
      employment_type, salary_min, salary_max, salary_currency, array(select jsonb_array_elements_text(tags)), notes, applied_at, source, last_response_date,
      pinned, important, favorite, legacy_id from _new;
  get diagnostics v_new = row_count;
  insert into public.job_snapshots (application_id, workspace_id, job_description, raw_payload, captured_at)
    select app_id, v_ws, description, jsonb_build_object('source', 'legacy_import', 'legacy_application_id', legacy_id, 'source_url', job_url), created_at
      from _new where description is not null;
  get diagnostics v_snap = row_count;
  -- CREATED / CAPTURED are written by triggers at now(); restore the legacy timestamps.
  update public.application_events e set created_at = n.created_at
    from _new n where e.application_id = n.app_id and e.event_type in ('CREATED', 'CAPTURED');
  insert into public.application_events (application_id, workspace_id, actor_id, event_type, payload, created_at)
    select n.app_id, v_ws, v_owner, ev ->> 'type', ev -> 'payload', (ev ->> 'at')::timestamptz
      from _new n cross join lateral jsonb_array_elements(n.events) ev;
  get diagnostics v_ev = row_count;
  insert into public.application_documents (application_id, workspace_id, document_type, label, created_at)
    select app_id, v_ws, 'RESUME', resume_label, created_at from _new where resume_label is not null;
  get diagnostics v_docs = row_count;
  insert into public.migration_id_mappings (batch_id, source_table, legacy_id, target_table, target_id)
    select v_batch, 'applications', legacy_id, 'applications', app_id from _new;
  raise notice 'batch applied: % applications, % snapshots, % legacy events, % documents', v_new, v_snap, v_ev, v_docs;
  ${post}
end
$jq$;`;
  };

  // Shared with verify.sql and the rehearsal so the SQL-side and JS-side fingerprints can be proven identical.
  const TS = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;
  const FP_ROW = `concat_ws('|', a.legacy_id, a.company_name, a.role_title, a.stage, a.status, coalesce(a.outcome,''), coalesce(a.closure_reason,''),
    to_char(a.applied_at at time zone 'UTC','YYYY-MM-DD'), coalesce(a.job_url,''), coalesce(a.external_job_id,''), coalesce(a.location,''), coalesce(a.source,''),
    coalesce(a.employment_type,''), coalesce(a.work_arrangement,''), coalesce(a.salary_min::text,''), coalesce(a.salary_max::text,''), a.salary_currency, a.priority,
    coalesce(a.next_action,''), coalesce(to_char(a.next_action_date,'YYYY-MM-DD'),''), to_char(a.created_at at time zone 'UTC',${TS}),
    to_char(a.updated_at at time zone 'UTC',${TS}), coalesce(to_char(a.closed_at at time zone 'UTC',${TS}),''),
    md5(coalesce(a.notes,'')), coalesce((select string_agg(t, ',' order by t collate "C") from unnest(a.tags) t),''))`;
  const byId = (a, b) => a.legacyId - b.legacyId;

  mkdirSync(resolve(OUT_DIR, 'sql'), { recursive: true });
  const files = [];
  if (rehearsal) {
    // Rolled-back rehearsal on the REAL schema: synthetic owner/workspace + a representative chunk, then ABORT with a summary.
    // Representative sample: plain, snapshot, tags, salary, both closed outcomes, the stage-change app, resume label.
    const first = (f) => list.find(f);
    const sample = [...new Map([
      list[0], first((r) => r.description), first((r) => r.tags.length), first((r) => r.salaryMin !== null),
      first((r) => r.outcome === 'WITHDRAWN'), first((r) => r.outcome === 'REJECTED'), first((r) => r.events.some((e) => e.type === 'STAGE_CHANGED')),
      first((r) => r.employmentType === 'Internship'), first((r) => r.source),
    ].filter(Boolean).map((r) => [r.legacyId, r])).values()];
    const sortedSample = sample.slice().sort(byId);
    const sampleFpApps = md5(sortedSample.map(fpApp).join('\n'));
    const sampleFpSnaps = md5(sortedSample.filter((r) => r.description).map((r) => `${r.legacyId}:${md5(r.description)}`).join('\n'));
    const sampleFpDocs = md5(sortedSample.filter((r) => r.resumeLabel).map((r) => `${r.legacyId}:${r.resumeLabel}`).join('\n'));
    const pre = `insert into public.user_accounts (user_id, username, username_clean) values (${q(owner)}, 'zz_rehearsal_owner', 'zz_rehearsal_owner');
  insert into public.workspaces (id, name, slug, workspace_type, created_by) values (${q(ws)}, 'REHEARSAL', 'zz-rehearsal-${randomUUID().slice(0, 8)}', 'PERSONAL', ${q(owner)});
  insert into public.workspace_members (workspace_id, user_id, role) values (${q(ws)}, ${q(owner)}, 'MANAGER');`;
    const post = `declare_summary := format('apps=%s snaps=%s events=%s by_type=%s docs=%s mappings=%s created_ts_restored=%s closed_with_closed_at=%s sample=%s',
     (select count(*) from public.applications where workspace_id = v_ws),
     (select count(*) from public.job_snapshots where workspace_id = v_ws),
     (select count(*) from public.application_events where workspace_id = v_ws),
     (select jsonb_object_agg(event_type, c) from (select event_type, count(*) c from public.application_events where workspace_id = v_ws group by 1) t),
     (select count(*) from public.application_documents where workspace_id = v_ws),
     (select count(*) from public.migration_id_mappings where batch_id = v_batch),
     (select count(*) from public.application_events e join public.applications a on a.id = e.application_id where e.workspace_id = v_ws and e.event_type = 'CREATED' and e.created_at = a.created_at),
     (select count(*) from public.applications where workspace_id = v_ws and status = 'CLOSED' and closed_at is not null),
     ${sample.length});
  declare_summary := declare_summary || format(' | fp_apps expected=${sampleFpApps} actual=%s | fp_snaps expected=${sampleFpSnaps} actual=%s | fp_docs expected=${sampleFpDocs} actual=%s',
     (select md5(string_agg(${FP_ROW}, E'\\n' order by a.legacy_id)) from public.applications a where a.workspace_id = v_ws),
     (select md5(string_agg(a.legacy_id || ':' || md5(sn.job_description), E'\\n' order by a.legacy_id)) from public.job_snapshots sn join public.applications a on a.id = sn.application_id where a.workspace_id = v_ws),
     (select md5(string_agg(a.legacy_id || ':' || d.label, E'\\n' order by a.legacy_id)) from public.application_documents d join public.applications a on a.id = d.application_id where a.workspace_id = v_ws));
  raise exception 'REHEARSAL_OK_ROLLED_BACK: %', declare_summary;`;
    let sql = batchSql(sample, { withHeader: true, pre, post });
    sql = sql.replace('v_new   int;', 'declare_summary text; v_new   int;');
    writeFileSync(resolve(OUT_DIR, 'sql', 'rehearsal.sql'), sql);
    files.push('rehearsal.sql');
  } else {
    for (let i = 0, n = 1; i < list.length; i += BATCH_SIZE, n++) {
      const name = `batch_${String(n).padStart(2, '0')}.sql`;
      writeFileSync(resolve(OUT_DIR, 'sql', name), batchSql(list.slice(i, i + BATCH_SIZE), { withHeader: n === 1 }));
      files.push(name);
    }
    // ---- post-import reconciliation: one PASS/FAIL table, computed database-side against pre-computed expectations
    const sortedTs = (f) => list.map(f).sort();
    const expTags = list.reduce((n, r) => n + r.tags.length, 0);
    const stageDist = Object.entries(dist(list, (r) => `${r.stage}/${r.status}/${r.outcome ?? '-'}`)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, c]) => `${k}=${c}`).join(',');
    const verify = `with
w as (select ${q(ws)}::uuid id, ${q(owner)}::uuid owner),
apps as (select * from public.applications where workspace_id = (select id from w)),
fp_app as (select md5(string_agg(${FP_ROW}, E'\\n' order by a.legacy_id)) h from apps a),
checks(name, expected, actual) as (values
 ('applications_count', '${expected.applications}', (select count(*)::text from apps)),
 ('applications_fingerprint', '${fpAll}', (select h from fp_app)),
 ('snapshots_count', '${expected.job_snapshots}', (select count(*)::text from public.job_snapshots where workspace_id = (select id from w))),
 ('snapshots_fingerprint', '${fpSnap}', (select md5(string_agg(a.legacy_id || ':' || md5(s.job_description), E'\\n' order by a.legacy_id)) from public.job_snapshots s join apps a on a.id = s.application_id)),
 ('documents_count', '${expected.application_documents}', (select count(*)::text from public.application_documents where workspace_id = (select id from w))),
 ('documents_fingerprint', '${fpDocs}', (select md5(string_agg(a.legacy_id || ':' || d.label, E'\\n' order by a.legacy_id)) from public.application_documents d join apps a on a.id = d.application_id)),
 ('events_CREATED', '${expected.events.CREATED}', (select count(*)::text from public.application_events where workspace_id = (select id from w) and event_type = 'CREATED')),
 ('events_CAPTURED', '${expected.events.CAPTURED}', (select count(*)::text from public.application_events where workspace_id = (select id from w) and event_type = 'CAPTURED')),
 ('events_STAGE_CHANGED', '${expected.events.STAGE_CHANGED}', (select count(*)::text from public.application_events where workspace_id = (select id from w) and event_type = 'STAGE_CHANGED')),
 ('events_OUTCOME_CHANGED', '${expected.events.OUTCOME_CHANGED}', (select count(*)::text from public.application_events where workspace_id = (select id from w) and event_type = 'OUTCOME_CHANGED')),
 ('events_total', '${expected.events.TOTAL}', (select count(*)::text from public.application_events where workspace_id = (select id from w))),
 ('all_apps_owned_by_new_owner_in_workspace', 'true', (select (count(*) = ${expected.applications} and bool_and(user_id = (select owner from w)))::text from apps)),
 ('apps_outside_workspace', '0', (select count(*)::text from public.applications where workspace_id <> (select id from w))),
 ('orphan_snapshots_events_docs', '0', (select ((select count(*) from public.job_snapshots s where not exists (select 1 from public.applications a where a.id = s.application_id))
     + (select count(*) from public.application_events e where not exists (select 1 from public.applications a where a.id = e.application_id))
     + (select count(*) from public.application_documents d where not exists (select 1 from public.applications a where a.id = d.application_id)))::text)),
 ('unvalidated_constraints', '0', (select count(*)::text from pg_constraint c join pg_namespace n on n.oid = c.connamespace where not c.convalidated and n.nspname = 'public')),
 ('created_at_min', '${sortedTs((r) => r.createdAt)[0]}', (select to_char(min(created_at) at time zone 'UTC',${TS}) from apps)),
 ('created_at_max', '${sortedTs((r) => r.createdAt).at(-1)}', (select to_char(max(created_at) at time zone 'UTC',${TS}) from apps)),
 ('updated_at_max', '${sortedTs((r) => r.updatedAt).at(-1)}', (select to_char(max(updated_at) at time zone 'UTC',${TS}) from apps)),
 ('urls_present_all_http', '${list.filter((r) => r.jobUrl).length}', (select count(*)::text from apps where job_url ~* '^https?://')),
 ('tag_links_total', '${expTags}', (select coalesce(sum(cardinality(tags)),0)::text from apps)),
 ('created_ts_restored_on_CREATED_events', '${expected.events.CREATED}', (select count(*)::text from public.application_events e join apps a on a.id = e.application_id where e.event_type = 'CREATED' and e.created_at = a.created_at)),
 ('closed_apps_have_closed_at', '${list.filter((r) => r.status === 'CLOSED').length}', (select count(*)::text from apps where status = 'CLOSED' and closed_at is not null)),
 ('probable_dup_groups_company_role', '${probable.length}', (select count(*)::text from (select 1 from apps group by lower(btrim(company_name)), lower(btrim(role_title)) having count(*) > 1) g)),
 ('migration_batch_completed', '1', (select count(*)::text from public.migration_batches where target_workspace_id = (select id from w) and status = 'COMPLETED')),
 ('id_mappings', '${expected.applications}', (select count(*)::text from public.migration_id_mappings)),
 ('users_total', '1', (select count(*)::text from public.user_accounts)),
 ('workspaces_total', '1', (select count(*)::text from public.workspaces)),
 ('legacy_user_id_set_anywhere', '0', (select count(*)::text from public.profiles where legacy_user_id is not null)),
 ('legacy_claim_codes', '0', (select count(*)::text from public.legacy_claim_codes)),
 ('extension_tokens', '0', (select count(*)::text from public.extension_tokens)),
 ('legacy_sessions_or_refresh_tokens', '0', (select ((select count(*) from public.auth_sessions) + (select count(*) from public.auth_refresh_tokens))::text)),
 ('auth_rate_limits', '0', (select count(*)::text from public.auth_rate_limits)),
 ('credential_rows_total_only_new_owner', '1', (select count(*)::text from public.user_credentials where user_id = (select owner from w))),
 ('credential_rows_total', '1', (select count(*)::text from public.user_credentials)),
 ('out_of_scope_domains_empty', '0', (select ((select count(*) from public.contacts) + (select count(*) from public.interviews) + (select count(*) from public.tasks) + (select count(*) from public.habits) + (select count(*) from public.journal_entries) + (select count(*) from public.goals) + (select count(*) from public.resumes) + (select count(*) from public.companies))::text))
)
select name, expected, actual, (expected = actual) as pass from checks
union all
select 'stage_distribution', ${q(stageDist)}, x.a, x.a = ${q(stageDist)}
  from (select coalesce((select string_agg(k || '=' || c, ',' order by k collate "C") from (select stage||'/'||status||'/'||coalesce(outcome,'-') k, count(*) c from apps group by 1) t), '') a) x
order by 1;`;
    writeFileSync(resolve(OUT_DIR, 'sql', 'verify.sql'), verify);
    files.push('verify.sql');
    writeFileSync(resolve(OUT_DIR, 'sql', 'finalize.sql'), `update public.migration_batches set status = 'COMPLETED', completed_at = now(),
  summary = ${q(JSON.stringify({ scope: 'application-domain-only', step: '16A-2', source_sha256: sha, applications: expected.applications, job_snapshots: expected.job_snapshots, application_documents: expected.application_documents, events: expected.events }))}::jsonb
 where batch_id = ${q(batchId)};`);
    files.push('finalize.sql');
  }
  console.log(JSON.stringify({ emitted: files, batchId, batchSize: BATCH_SIZE }, null, 2));
}
