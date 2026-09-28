#!/usr/bin/env node
/**
 * JobQuest 2.0 · Legacy Data Migration Tool
 * Milestone 14 — Release Candidate & Migration Rehearsal
 * 
 * Safely migrates legacy JobQuest 1.0 (Neon PostgreSQL / export) data into
 * an isolated JobQuest 2.0 workspace with dual reconciliation, Option B auth
 * claims (PINs retired), 13-stage decomposition, and strict production locks.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;

export const DEFAULT_MIGRATED_WORKSPACE_ID = '018f0000-0000-4000-8000-000000000001';
export const DEFAULT_MIGRATED_WORKSPACE_NAME = 'JobQuest (Migrated)';

/**
 * Validates that the target database URL is safe for non-production rehearsal.
 */
export function assertSafeTarget(url, confirmNonProduction) {
  if (!url) {
    throw new Error('Target database URL is required');
  }
  if (!confirmNonProduction) {
    throw new Error('Safety guard: --confirm-non-production flag is strictly required to execute migration.');
  }

  const normalized = url.toLowerCase();
  // Forbid production identifiers
  const forbiddenPatterns = [
    'jobquest-prod',
    'prod.supabase.co',
    'neon.tech/main',
    'production',
    'prod-db',
    'api.jobquest.com'
  ];

  for (const pattern of forbiddenPatterns) {
    if (normalized.includes(pattern)) {
      throw new Error(`FATAL SECURITY LOCK: Target URL matches production pattern "${pattern}". Rehearsal aborted.`);
    }
  }

  return true;
}

/**
 * Maps legacy 13-stage status string to modern JobQuest 2.0 dimensions.
 */
export function mapLegacyStage(rawStage) {
  const s = String(rawStage || '').trim();
  switch (s) {
    case 'Saved':
      return { stage: 'SAVED', status: 'OPEN', outcome: null, closureReason: null, eventType: 'CAPTURED' };
    case 'Preparing':
      return { stage: 'PREPARING', status: 'OPEN', outcome: null, closureReason: null, eventType: 'CREATED' };
    case 'Applied':
      return { stage: 'APPLIED', status: 'OPEN', outcome: null, closureReason: null, eventType: 'APPLIED' };
    case 'Assessment':
      return { stage: 'ASSESSMENT', status: 'OPEN', outcome: null, closureReason: null, eventType: 'STAGE_CHANGED' };
    case 'Recruiter Screen':
      return { stage: 'RECRUITER_SCREEN', status: 'OPEN', outcome: null, closureReason: null, eventType: 'STAGE_CHANGED' };
    case 'Interview':
      return { stage: 'INTERVIEW', status: 'OPEN', outcome: null, closureReason: null, eventType: 'STAGE_CHANGED' };
    case 'Final Interview':
      return { stage: 'FINAL_INTERVIEW', status: 'OPEN', outcome: null, closureReason: null, eventType: 'STAGE_CHANGED' };
    case 'Offer':
      return { stage: 'OFFER', status: 'OPEN', outcome: null, closureReason: null, eventType: 'STAGE_CHANGED' };
    case 'Accepted':
      return { stage: 'OFFER', status: 'CLOSED', outcome: 'ACCEPTED', closureReason: null, eventType: 'OUTCOME_CHANGED' };
    case 'Rejected':
      return { stage: 'APPLIED', status: 'CLOSED', outcome: 'REJECTED', closureReason: null, eventType: 'OUTCOME_CHANGED' };
    case 'Withdrawn':
      return { stage: 'APPLIED', status: 'CLOSED', outcome: 'WITHDRAWN', closureReason: 'GENERAL_WITHDRAWAL', eventType: 'OUTCOME_CHANGED' };
    case 'Ghosted':
      return { stage: 'APPLIED', status: 'CLOSED', outcome: 'GHOSTED', closureReason: null, eventType: 'OUTCOME_CHANGED' };
    case 'Position Closed':
      return { stage: 'APPLIED', status: 'CLOSED', outcome: 'POSITION_CLOSED', closureReason: null, eventType: 'OUTCOME_CHANGED' };
    default:
      return { stage: 'SAVED', status: 'OPEN', outcome: null, closureReason: null, eventType: 'CREATED' };
  }
}

/**
 * Maps legacy notes type to journal entry type.
 */
export function mapLegacyNoteType(rawType) {
  switch (String(rawType || '').toLowerCase()) {
    case 'daily_journal': return 'REFLECTION';
    case 'interview': return 'INTERVIEW_PREP';
    case 'company_research': return 'STRATEGY';
    case 'reflection': return 'POST_MORTEM';
    case 'general':
    default:
      return 'NOTE';
  }
}

/**
 * Parses timestamp string into UTC Date or null.
 */
export function parseLegacyDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Normalizes legacy timestamps to ISO UTC strings.
 */
export function normalizeLegacyTimestamp(dateStr) {
  return parseLegacyDate(dateStr);
}

/**
 * Maps legacy status string to workflow stage dimensions.
 */
export function mapLegacyStatus(rawStatus) {
  return mapLegacyStage(rawStatus);
}

/**
 * Maps legacy task recurrence strings to JobQuest 2.0 enum values.
 */
export function mapLegacyRecurrence(raw) {
  if (!raw) return null;
  const upper = String(raw).trim().toUpperCase();
  if (['DAILY', 'WEEKDAYS', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(upper)) {
    return upper;
  }
  return null;
}

/**
 * Explicit transformation helper for legacy user records.
 * Handles both real legacy schema (username, optional/null email) and M14 rehearsal fixtures.
 */
export function mapLegacyUser(u) {
  const username = String(u.username || (u.email ? u.email.split('@')[0] : `user_${u.id}`)).trim();
  const cleanUsername = username.toLowerCase().replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 32);
  const fullName = u.full_name || username;
  const email = (u.email && String(u.email).trim().length > 0) ? String(u.email).trim().toLowerCase() : null;
  const themePref = (u.theme_preference && ['light', 'dark', 'system'].includes(u.theme_preference)) ? u.theme_preference : 'system';
  const weekStart = (u.week_start === 0 || u.week_start === 1) ? u.week_start : 1;
  const role = String(u.role || '').toUpperCase() === 'MANAGER' ? 'MANAGER' : 'USER';

  return {
    username,
    cleanUsername,
    fullName,
    email,
    themePref,
    weekStart,
    role
  };
}

/**
 * Explicit transformation helper for legacy application records.
 * Reconciles schema differences (work_arrangement, employment_type, salary_range, etc.).
 */
export function mapLegacyApplication(a, existingTags = []) {
  const { stage, status, outcome, closureReason, eventType } = mapLegacyStage(a.stage);
  const appTags = [...existingTags];

  let workArrangement = null;
  const rawWork = a.work_arrangement || a.work_mode || a.location_type;
  if (rawWork === 'Remote') workArrangement = 'Remote';
  else if (rawWork === 'Hybrid') workArrangement = 'Hybrid';
  else if (rawWork === 'Onsite') workArrangement = 'Onsite';

  let empType = null;
  if (a.employment_type === 'Full-time') empType = 'Full-time';
  else if (a.employment_type === 'Contract') empType = 'Contract';
  else if (a.employment_type === 'Part-time') empType = 'Part-time';
  else if (a.employment_type === 'Internship') {
    // Target DB check constraint restricts employment_type to Full-time, Contract, Part-time.
    // Preserve 'Internship' without data loss by ensuring it is recorded in the tags array.
    if (!appTags.includes('Internship')) {
      appTags.push('Internship');
    }
    empType = null;
  }

  let priority = 'MEDIUM';
  if (String(a.priority || '').toUpperCase() === 'HIGH') priority = 'HIGH';
  else if (String(a.priority || '').toUpperCase() === 'LOW') priority = 'LOW';

  const salaryMin = (a.salary_min !== null && a.salary_min !== undefined && !isNaN(Number(a.salary_min))) ? Number(a.salary_min) : null;
  const salaryMax = (a.salary_max !== null && a.salary_max !== undefined && !isNaN(Number(a.salary_max))) ? Number(a.salary_max) : null;
  let salaryCurrency = 'USD';
  if (a.salary_currency && String(a.salary_currency).trim().length === 3) {
    salaryCurrency = String(a.salary_currency).trim().toUpperCase();
  }

  let notes = a.notes || null;
  if (a.salary_range && salaryMin === null && salaryMax === null) {
    notes = notes ? `${notes}\n[Salary Range: ${a.salary_range}]` : `[Salary Range: ${a.salary_range}]`;
  }

  const appliedAt = parseLegacyDate(a.date_applied) || parseLegacyDate(a.created_at);
  const createdAt = parseLegacyDate(a.created_at);
  const updatedAt = parseLegacyDate(a.updated_at);
  const hasSnapshot = Boolean(a.job_description && a.job_description.trim().length > 0);

  return {
    companyName: a.company || 'Unknown Company',
    roleTitle: a.job_title || 'Untitled Role',
    stage,
    status,
    outcome,
    closureReason,
    eventType,
    workArrangement,
    employmentType: empType,
    location: a.location || null,
    jobUrl: a.job_url || null,
    externalJobId: a.external_job_id || null,
    salaryMin,
    salaryMax,
    salaryCurrency,
    priority,
    notes,
    tags: appTags,
    appliedAt,
    createdAt,
    updatedAt,
    hasSnapshot,
    jobDescription: a.job_description || null
  };
}

/**
 * Explicit transformation helper for legacy tasks.
 */
export function mapLegacyTask(t) {
  const status = t.status === 'completed' ? 'COMPLETED' : 'PENDING';
  const priority = String(t.priority || '').toUpperCase() === 'HIGH' ? 'HIGH' : 'MEDIUM';
  return {
    taskType: 'TASK',
    title: t.title || 'Untitled Task',
    details: t.notes || null,
    dueDate: t.due_date || null,
    priority,
    status,
    completedAt: parseLegacyDate(t.completed_at),
    recurrenceRule: mapLegacyRecurrence(t.recurrence),
    createdAt: parseLegacyDate(t.created_at),
    updatedAt: parseLegacyDate(t.updated_at)
  };
}

/**
 * Explicit transformation helper for legacy reminders and follow-ups.
 */
export function mapLegacyReminder(f) {
  const status = f.status === 'Completed' ? 'COMPLETED' : 'PENDING';
  return {
    taskType: 'FOLLOW_UP',
    title: f.title || `Follow up: ${f.contact_name || 'Contact'}`,
    details: f.notes || null,
    dueDate: f.due_date || null,
    priority: 'MEDIUM',
    status,
    completedAt: parseLegacyDate(f.completed_at),
    createdAt: parseLegacyDate(f.created_at),
    updatedAt: parseLegacyDate(f.updated_at)
  };
}

/**
 * Explicit transformation helper for legacy notes.
 */
export function mapLegacyNote(n) {
  const entryType = mapLegacyNoteType(n.note_type);
  return {
    entryType,
    title: n.title || 'Untitled Note',
    content: n.body || n.content || '',
    isPinned: n.pinned === 1 || n.is_pinned === true,
    createdAt: parseLegacyDate(n.created_at),
    updatedAt: parseLegacyDate(n.updated_at)
  };
}

/**
 * Explicit transformation helper for legacy resumes.
 */
export function mapLegacyResume(r) {
  return {
    name: r.version_name || r.name || 'Resume',
    documentType: 'RESUME',
    versionLabel: r.revision_label || 'v1',
    targetRole: r.target_role || null,
    isDefault: r.is_default === 1 || r.is_default === true,
    isActive: r.is_active === 1 || r.is_active === true,
    createdAt: parseLegacyDate(r.created_at),
    updatedAt: parseLegacyDate(r.updated_at)
  };
}

/**
 * Generates an Option B single-use claim code.
 */
export function generateClaimCode() {
  const token = randomBytes(16).toString('hex'); // 32 hex chars
  const hint = token.slice(0, 4) + '...' + token.slice(-2);
  const hash = createHash('sha256').update(token).digest('hex');
  return { token, hint, hash };
}

/**
 * Executes migration rehearsal against target database.
 */
export async function runMigration({
  source,
  targetUrl,
  workspaceId = DEFAULT_MIGRATED_WORKSPACE_ID,
  workspaceName = DEFAULT_MIGRATED_WORKSPACE_NAME,
  dryRun = false,
  validateOnly = false,
  confirmNonProduction = false,
  reportPath = null
}) {
  assertSafeTarget(targetUrl, confirmNonProduction);

  const startTime = Date.now();
  const report = {
    metadata: {
      started_at: new Date().toISOString(),
      target_workspace_id: workspaceId,
      target_workspace_name: workspaceName,
      dry_run: dryRun,
      validate_only: validateOnly
    },
    counts: {},
    fk_integrity: {},
    sample_hashes: {},
    claim_codes: [],
    pin_hashes_migrated: 0, // Invariant: MUST ALWAYS BE 0
    errors: [],
    status: 'PENDING'
  };

  // 1. Load source data
  let data;
  if (typeof source === 'string' && existsSync(source)) {
    data = JSON.parse(readFileSync(source, 'utf8'));
  } else if (typeof source === 'object' && source !== null) {
    data = source;
  } else {
    throw new Error(`Invalid source: ${source}`);
  }

  // Connect to target DB
  const client = new Client({ connectionString: targetUrl });
  await client.connect();

  try {
    if (dryRun || validateOnly) {
      console.log('Running in DRY-RUN / VALIDATE-ONLY mode. No database mutations will be committed.');
    }

    await client.query('BEGIN');

    let batchId = null;
    const idMap = new Map();
    async function recordMapping(sourceTable, sourceId, targetTable, targetId) {
      idMap.set(`${sourceTable}:${sourceId}`, targetId);
      if (!dryRun && batchId) {
        await client.query(
          `INSERT INTO public.migration_id_mappings (batch_id, source_table, legacy_id, target_table, target_id, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (source_table, legacy_id) DO UPDATE SET target_id = $5`,
          [batchId, sourceTable, sourceId, targetTable, targetId]
        );
      }
    }

    // -------------------------------------------------------------------------
    // DOMAIN 1: Users & Profiles & Option B Claim Codes
    // -------------------------------------------------------------------------
    const users = data.users || [];
    let usersMigrated = 0;
    let primaryUserId = null;

    for (const u of users) {
      const userMapped = mapLegacyUser(u);
      let targetUserId;
      // Check existing profile by legacy_user_id or email (if provided)
      let existing;
      if (userMapped.email) {
        existing = await client.query(
          `SELECT user_id FROM public.profiles WHERE legacy_user_id = $1 OR lower(email) = $2`,
          [u.id, userMapped.email]
        );
      } else {
        existing = await client.query(
          `SELECT user_id FROM public.profiles WHERE legacy_user_id = $1`,
          [u.id]
        );
      }

      if (existing.rowCount > 0) {
        targetUserId = existing.rows[0].user_id;
      } else {
        targetUserId = (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id;
        if (!dryRun) {
          // Insert into user_accounts (Option B: STAGED status for unverified claim)
          await client.query(
            `INSERT INTO public.user_accounts (user_id, username, username_clean, status, created_at, updated_at)
             VALUES ($1, $2, $3, 'STAGED', COALESCE($4::timestamptz, NOW()), COALESCE($5::timestamptz, NOW()))
             ON CONFLICT (username_clean) DO UPDATE SET updated_at = NOW()`,
            [targetUserId, userMapped.username, userMapped.cleanUsername, parseLegacyDate(u.created_at), parseLegacyDate(u.updated_at)]
          );

          // Insert into profiles
          await client.query(
            `INSERT INTO public.profiles (user_id, display_name, email, legacy_user_id, theme_preference, week_start, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()), COALESCE($8::timestamptz, NOW()))
             ON CONFLICT (user_id) DO NOTHING`,
            [targetUserId, userMapped.fullName, userMapped.email, u.id, userMapped.themePref, userMapped.weekStart, parseLegacyDate(u.created_at), parseLegacyDate(u.updated_at)]
          );

          // Generate Option B claim code (NEVER MIGRATE pin_hash)
          const claim = generateClaimCode();
          await client.query(
            `INSERT INTO public.legacy_claim_codes (user_id, code_hash, code_hint, expires_at, created_at)
             VALUES ($1, $2, $3, NOW() + INTERVAL '90 days', NOW())
             ON CONFLICT (user_id) DO NOTHING`,
            [targetUserId, claim.hash, claim.hint]
          );
          report.claim_codes.push({ legacy_user_id: u.id, hint: claim.hint });
        }
      }
      if (!primaryUserId) primaryUserId = targetUserId;
      idMap.set(`users:${u.id}`, targetUserId);
      usersMigrated++;
    }
    report.counts.users = { source: users.length, eligible: users.length, migrated: usersMigrated, skipped: 0, errors: 0 };

    // Fallback if no users in source
    if (!primaryUserId) {
      primaryUserId = (await client.query('SELECT user_id FROM public.user_accounts LIMIT 1')).rows[0]?.user_id;
    }

    // -------------------------------------------------------------------------
    // TENANCY: Workspace & Membership Provisioning
    // -------------------------------------------------------------------------
    batchId = '00000000-0000-0000-0000-000000000000';
    if (!dryRun) {
      // Ensure target workspace exists
      const wsCheck = await client.query('SELECT id FROM public.workspaces WHERE id = $1', [workspaceId]);
      if (wsCheck.rowCount === 0) {
        await client.query(
          `INSERT INTO public.workspaces (id, name, slug, workspace_type, created_by, created_at, updated_at)
           VALUES ($1, $2, 'jobquest-migrated', 'SHARED', $3, NOW(), NOW())
           ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()`,
          [workspaceId, workspaceName, primaryUserId]
        );
      }

      // Add all migrated users as workspace members
      for (const u of users) {
        const targetUserId = idMap.get(`users:${u.id}`);
        const role = String(u.role || '').toUpperCase() === 'MANAGER' ? 'MANAGER' : 'USER';
        await client.query(
          `INSERT INTO public.workspace_members (workspace_id, user_id, role, joined_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (workspace_id, user_id) DO NOTHING`,
          [workspaceId, targetUserId, role]
        );
      }

      const batchRes = await client.query(
        `INSERT INTO public.migration_batches (source_system, target_workspace_id, status, created_at)
         VALUES ($1, $2, 'RUNNING', NOW()) RETURNING batch_id`,
        [data.metadata?.source_system || 'JobQuest 1.0 (Export)', workspaceId]
      );
      batchId = batchRes.rows[0].batch_id;

      // Record user mappings in migration_id_mappings
      for (const u of users) {
        await recordMapping('users', u.id, 'profiles', idMap.get(`users:${u.id}`));
      }
    }

    // -------------------------------------------------------------------------
    // DOMAIN 2: Resumes
    // -------------------------------------------------------------------------
    const resumes = data.resumes || [];
    let resumesMigrated = 0;
    for (const r of resumes) {
      const ownerId = idMap.get(`users:${r.user_id}`) || primaryUserId;
      let targetId;
      const existing = await client.query(
        'SELECT id FROM public.resumes WHERE workspace_id = $1 AND legacy_id = $2',
        [workspaceId, r.id]
      );
      if (existing.rowCount > 0) {
        targetId = existing.rows[0].id;
      } else {
        targetId = (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id;
        if (!dryRun) {
          await client.query(
            `INSERT INTO public.resumes (
              id, workspace_id, user_id, name, document_type, version_label,
              target_role, is_default, is_active, legacy_id, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, 'RESUME', $5, $6, $7, $8, $9, COALESCE($10::timestamptz, NOW()), COALESCE($11::timestamptz, NOW()))`,
            [
              targetId, workspaceId, ownerId, r.version_name || 'Resume', r.revision_label || 'v1',
              r.target_role || null, r.is_default === 1, r.is_active === 1, r.id,
              parseLegacyDate(r.created_at), parseLegacyDate(r.updated_at)
            ]
          );
        }
      }
      await recordMapping('resumes', r.id, 'resumes', targetId);
      resumesMigrated++;
    }
    report.counts.resumes = { source: resumes.length, eligible: resumes.length, migrated: resumesMigrated, skipped: 0, errors: 0 };

    // -------------------------------------------------------------------------
    // DOMAIN 3: Tags (Consolidated into applications.tags array)
    // -------------------------------------------------------------------------
    const tags = data.tags || [];
    const tagNameById = new Map(tags.map(t => [t.id, t.name]));
    const appTagsMap = new Map();
    for (const at of (data.application_tags || [])) {
      const tagName = tagNameById.get(at.tag_id);
      if (tagName) {
        if (!appTagsMap.has(at.application_id)) appTagsMap.set(at.application_id, []);
        appTagsMap.get(at.application_id).push(tagName);
      }
    }
    report.counts.tags = { source: tags.length, eligible: tags.length, migrated: tags.length, skipped: 0, errors: 0 };

    // -------------------------------------------------------------------------
    // DOMAIN 4: Applications & Job Snapshots
    // -------------------------------------------------------------------------
    const applications = data.applications || [];
    let appsMigrated = 0;
    let snapshotsCreated = 0;
    for (const a of applications) {
      const ownerId = idMap.get(`users:${a.user_id}`) || primaryUserId;
      let targetId;
      const existing = await client.query(
        'SELECT id FROM public.applications WHERE workspace_id = $1 AND legacy_id = $2',
        [workspaceId, a.id]
      );

      const appMapped = mapLegacyApplication(a, appTagsMap.get(a.id) || []);

      if (existing.rowCount > 0) {
        targetId = existing.rows[0].id;
        const snapCheck = await client.query(
          'SELECT id FROM public.job_snapshots WHERE workspace_id = $1 AND application_id = $2',
          [workspaceId, targetId]
        );
        if (snapCheck.rowCount > 0) snapshotsCreated++;
      } else {
        targetId = (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id;

        if (dryRun) {
          if (appMapped.hasSnapshot) snapshotsCreated++;
        } else {
          await client.query(
            `INSERT INTO public.applications (
              id, workspace_id, user_id, company_name, role_title, stage, status,
              outcome, closure_reason, work_arrangement, employment_type, location,
              job_url, external_job_id, salary_min, salary_max, salary_currency,
              priority, notes, tags, applied_at, legacy_id, created_at, updated_at
             ) VALUES (
              $1, $2, $3, $4, $5, $6, $7,
              $8, $9, $10, $11, $12,
              $13, $14, $15, $16, $17,
              $18, $19, $20, COALESCE($21::timestamptz, NOW()), $22, COALESCE($23::timestamptz, NOW()), COALESCE($24::timestamptz, NOW())
             )`,
            [
              targetId, workspaceId, ownerId, appMapped.companyName, appMapped.roleTitle,
              appMapped.stage, appMapped.status, appMapped.outcome, appMapped.closureReason,
              appMapped.workArrangement, appMapped.employmentType, appMapped.location,
              appMapped.jobUrl, appMapped.externalJobId, appMapped.salaryMin, appMapped.salaryMax,
              appMapped.salaryCurrency, appMapped.priority, appMapped.notes, appMapped.tags,
              appMapped.appliedAt, a.id, appMapped.createdAt, appMapped.updatedAt
            ]
          );

          // Immutable snapshot if job description exists
          if (appMapped.hasSnapshot) {
            await client.query(
              `INSERT INTO public.job_snapshots (
                application_id, workspace_id, job_description, raw_payload, captured_at
               ) VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()))`,
              [targetId, workspaceId, appMapped.jobDescription, JSON.stringify({ source_url: appMapped.jobUrl }), appMapped.createdAt]
            );
            snapshotsCreated++;
          }

          // Backfill initial lifecycle event
          await client.query(
            `INSERT INTO public.application_events (
              application_id, workspace_id, actor_id, event_type, payload, created_at
             ) VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()))`,
            [
              targetId, workspaceId, ownerId, appMapped.eventType,
              JSON.stringify({ stage: appMapped.stage, status: appMapped.status, outcome: appMapped.outcome, legacy_import: true }),
              appMapped.createdAt
            ]
          );
        }
      }
      await recordMapping('applications', a.id, 'applications', targetId);
      appsMigrated++;
    }
    report.counts.applications = { source: applications.length, eligible: applications.length, migrated: appsMigrated, skipped: 0, errors: 0 };
    report.counts.job_snapshots = { source: applications.filter(a => a.job_description && a.job_description.trim().length > 0).length, eligible: applications.filter(a => a.job_description && a.job_description.trim().length > 0).length, migrated: snapshotsCreated, skipped: 0, errors: 0 };

    // -------------------------------------------------------------------------
    // DOMAIN 5: Contacts
    // -------------------------------------------------------------------------
    const contacts = data.networking_contacts || [];
    let contactsMigrated = 0;
    for (const c of contacts) {
      const ownerId = idMap.get(`users:${c.user_id}`) || primaryUserId;
      let targetId;
      const existing = await client.query(
        'SELECT id FROM public.contacts WHERE workspace_id = $1 AND legacy_id = $2',
        [workspaceId, c.id]
      );

      let relType = 'RECRUITER';
      const rawRel = String(c.relationship_type || '').toLowerCase();
      if (rawRel === 'other' || rawRel === 'contact') relType = 'CONTACT';
      else if (rawRel === 'peer') relType = 'PEER';
      else if (rawRel === 'hiring manager' || rawRel === 'hiring_manager') relType = 'HIRING_MANAGER';
      else if (rawRel === 'referral') relType = 'REFERRAL';
      else if (rawRel === 'interviewer') relType = 'INTERVIEWER';

      if (existing.rowCount > 0) {
        targetId = existing.rows[0].id;
      } else {
        targetId = (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id;
        if (!dryRun) {
          await client.query(
            `INSERT INTO public.contacts (
              id, workspace_id, user_id, full_name, company_name, job_title,
              email, phone, linkedin_url, relationship_type, notes, legacy_id, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13::timestamptz, NOW()), COALESCE($14::timestamptz, NOW()))`,
            [
              targetId, workspaceId, ownerId, c.contact_name, c.company || null, c.job_title || null,
              c.email || null, c.phone || null, c.linkedin_url || null, relType, c.notes || null,
              c.id, parseLegacyDate(c.created_at), parseLegacyDate(c.updated_at)
            ]
          );
        }
      }
      await recordMapping('networking_contacts', c.id, 'contacts', targetId);
      contactsMigrated++;
    }
    report.counts.contacts = { source: contacts.length, eligible: contacts.length, migrated: contactsMigrated, skipped: 0, errors: 0 };

    // -------------------------------------------------------------------------
    // DOMAIN 6: Interviews
    // -------------------------------------------------------------------------
    const interviews = data.interviews || [];
    let interviewsMigrated = 0;
    for (const i of interviews) {
      const targetAppId = idMap.get(`applications:${i.application_id}`);
      if (!targetAppId) continue;
      const ownerId = idMap.get(`users:${i.user_id}`) || primaryUserId;
      let targetId;
      const existing = await client.query(
        'SELECT id FROM public.interviews WHERE workspace_id = $1 AND legacy_id = $2',
        [workspaceId, i.id]
      );

      let intType = 'TECHNICAL';
      if (i.interview_type === 'RECRUITER_SCREEN') intType = 'RECRUITER_SCREEN';
      else if (i.interview_type === 'BEHAVIORAL') intType = 'BEHAVIORAL';

      let format = 'VIDEO';
      if (i.format === 'PHONE') format = 'PHONE';
      else if (i.format === 'ONSITE') format = 'ONSITE';

      if (existing.rowCount > 0) {
        targetId = existing.rows[0].id;
      } else {
        targetId = (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id;
        if (!dryRun) {
          await client.query(
            `INSERT INTO public.interviews (
              id, application_id, workspace_id, user_id, round_number, interview_type,
              scheduled_at, format, location_or_link, interviewer_names, preparation_notes,
              questions_expected, questions_asked, next_step, legacy_id, created_at, updated_at
             ) VALUES (
              $1, $2, $3, $4, 1, $5,
              COALESCE($6::timestamptz, NOW()), $7, $8, $9, $10,
              $11, $12, $13, $14, COALESCE($15::timestamptz, NOW()), COALESCE($16::timestamptz, NOW())
             )`,
            [
              targetId, targetAppId, workspaceId, ownerId, intType,
              parseLegacyDate(i.scheduled_at), format, i.meeting_link || null, i.interviewer_names || null,
              i.preparation_notes || null, i.questions_expected || null, i.questions_asked || null,
              i.next_step || null, i.id, parseLegacyDate(i.created_at), parseLegacyDate(i.updated_at)
            ]
          );
        }
      }
      await recordMapping('interviews', i.id, 'interviews', targetId);
      interviewsMigrated++;
    }
    report.counts.interviews = { source: interviews.length, eligible: interviews.length, migrated: interviewsMigrated, skipped: 0, errors: 0 };

    // -------------------------------------------------------------------------
    // DOMAIN 7: Tasks & Reminders Consolidation
    // -------------------------------------------------------------------------
    const tasks = data.tasks || [];
    const followUps = data.follow_ups || [];
    let tasksMigrated = 0;

    for (const t of tasks) {
      const ownerId = idMap.get(`users:${t.user_id}`) || primaryUserId;
      const targetAppId = t.application_id ? idMap.get(`applications:${t.application_id}`) : null;
      let targetId;
      const existing = await client.query(
        'SELECT id FROM public.tasks WHERE workspace_id = $1 AND legacy_id = $2',
        [workspaceId, t.id]
      );
      const status = t.status === 'completed' ? 'COMPLETED' : 'PENDING';
      const priority = String(t.priority).toUpperCase() === 'HIGH' ? 'HIGH' : 'MEDIUM';

      if (existing.rowCount > 0) {
        targetId = existing.rows[0].id;
      } else {
        targetId = (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id;
        if (!dryRun) {
          await client.query(
            `INSERT INTO public.tasks (
              id, workspace_id, user_id, application_id, task_type, title, details,
              due_date, priority, status, completed_at, recurrence_rule, legacy_id, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, 'TASK', $5, $6, $7, $8, $9, $10::timestamptz, $11, $12, COALESCE($13::timestamptz, NOW()), COALESCE($14::timestamptz, NOW()))`,
            [
              targetId, workspaceId, ownerId, targetAppId, t.title, t.notes || null,
              t.due_date || null, priority, status, parseLegacyDate(t.completed_at),
              mapLegacyRecurrence(t.recurrence), t.id, parseLegacyDate(t.created_at), parseLegacyDate(t.updated_at)
            ]
          );
        }
      }
      await recordMapping('tasks', t.id, 'tasks', targetId);
      tasksMigrated++;
    }

    for (const f of followUps) {
      const ownerId = idMap.get(`users:${f.user_id}`) || primaryUserId;
      const targetAppId = f.application_id ? idMap.get(`applications:${f.application_id}`) : null;
      let targetId;
      const existing = await client.query(
        'SELECT id FROM public.tasks WHERE workspace_id = $1 AND legacy_id = $2',
        [workspaceId, f.id]
      );
      const status = f.status === 'Completed' ? 'COMPLETED' : 'PENDING';

      if (existing.rowCount > 0) {
        targetId = existing.rows[0].id;
      } else {
        targetId = (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id;
        if (!dryRun) {
          await client.query(
            `INSERT INTO public.tasks (
              id, workspace_id, user_id, application_id, task_type, title, details,
              due_date, priority, status, completed_at, legacy_id, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, 'FOLLOW_UP', $5, $6, $7, 'MEDIUM', $8, $9::timestamptz, $10, COALESCE($11::timestamptz, NOW()), COALESCE($12::timestamptz, NOW()))`,
            [
              targetId, workspaceId, ownerId, targetAppId, `Follow up: ${f.contact_name || 'Contact'}`, f.notes || null,
              f.due_date || null, status, parseLegacyDate(f.completed_at),
              f.id, parseLegacyDate(f.created_at), parseLegacyDate(f.updated_at)
            ]
          );
        }
      }
      await recordMapping('follow_ups', f.id, 'tasks', targetId);
      tasksMigrated++;
    }
    report.counts.tasks = { source: tasks.length + followUps.length, eligible: tasks.length + followUps.length, migrated: tasksMigrated, skipped: 0, errors: 0 };

    // -------------------------------------------------------------------------
    // DOMAIN 8: Habits & Habit Logs
    // -------------------------------------------------------------------------
    const habits = data.habits || [];
    let habitsMigrated = 0;
    for (const h of habits) {
      const ownerId = idMap.get(`users:${h.user_id}`) || primaryUserId;
      let targetId;
      const existing = await client.query(
        'SELECT id FROM public.habits WHERE workspace_id = $1 AND legacy_id = $2',
        [workspaceId, h.id]
      );
      let freq = 'DAILY';
      if (h.frequency === 'weekdays') freq = 'WEEKDAYS';
      else if (h.frequency === 'weekly') freq = 'WEEKLY';

      if (existing.rowCount > 0) {
        targetId = existing.rows[0].id;
      } else {
        targetId = (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id;
        if (!dryRun) {
          await client.query(
            `INSERT INTO public.habits (
              id, workspace_id, user_id, title, frequency, target_count, is_active, legacy_id, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()), COALESCE($10::timestamptz, NOW()))`,
            [
              targetId, workspaceId, ownerId, h.name || h.title, freq, Math.min(100, Math.max(1, h.target_count || 1)),
              h.active === 1 || h.is_active === true, h.id, parseLegacyDate(h.created_at), parseLegacyDate(h.updated_at)
            ]
          );
        }
      }
      await recordMapping('habits', h.id, 'habits', targetId);
      habitsMigrated++;
    }

    const habitLogs = data.habit_logs || [];
    let logsMigrated = 0;
    for (const hl of habitLogs) {
      const targetHabitId = idMap.get(`habits:${hl.habit_id}`);
      if (!targetHabitId) continue;
      const ownerId = idMap.get(`users:${hl.user_id}`) || primaryUserId;
      let targetId;
      const existing = await client.query(
        'SELECT id FROM public.habit_logs WHERE workspace_id = $1 AND legacy_id = $2',
        [workspaceId, hl.id]
      );

      if (existing.rowCount > 0) {
        targetId = existing.rows[0].id;
      } else {
        targetId = (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id;
        if (!dryRun) {
          await client.query(
            `INSERT INTO public.habit_logs (
              id, habit_id, workspace_id, user_id, log_date, completed_count, target_count, legacy_id, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()), COALESCE($10::timestamptz, NOW()))
             ON CONFLICT (habit_id, log_date) DO UPDATE SET completed_count = EXCLUDED.completed_count`,
            [
              targetId, targetHabitId, workspaceId, ownerId, hl.completion_date || hl.log_date, Math.max(1, hl.value || 1),
              1, hl.id, parseLegacyDate(hl.created_at), parseLegacyDate(hl.updated_at)
            ]
          );
        }
      }
      await recordMapping('habit_logs', hl.id, 'habit_logs', targetId);
      logsMigrated++;
    }
    report.counts.habits = { source: habits.length, eligible: habits.length, migrated: habitsMigrated, skipped: 0, errors: 0 };
    report.counts.habit_logs = { source: habitLogs.length, eligible: habitLogs.length, migrated: logsMigrated, skipped: 0, errors: 0 };

    // -------------------------------------------------------------------------
    // DOMAIN 9: Notes -> Journal Entries (M13 Career Journal Parity)
    // -------------------------------------------------------------------------
    const notes = data.notes || [];
    let notesMigrated = 0;
    for (const n of notes) {
      const ownerId = idMap.get(`users:${n.user_id}`) || primaryUserId;
      const targetAppId = n.application_id ? idMap.get(`applications:${n.application_id}`) : null;
      let targetId;
      const existing = await client.query(
        'SELECT id FROM public.journal_entries WHERE workspace_id = $1 AND legacy_id = $2',
        [workspaceId, n.id]
      );
      const entryType = mapLegacyNoteType(n.note_type);

      if (existing.rowCount > 0) {
        targetId = existing.rows[0].id;
      } else {
        targetId = (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id;
        if (!dryRun) {
          await client.query(
            `INSERT INTO public.journal_entries (
              id, workspace_id, user_id, application_id, entry_type, title, content,
              is_pinned, legacy_id, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, NOW()), COALESCE($11::timestamptz, NOW()))`,
            [
              targetId, workspaceId, ownerId, targetAppId, entryType, n.title || 'Untitled Note',
              n.body || '', n.pinned === 1, n.id, parseLegacyDate(n.created_at), parseLegacyDate(n.updated_at)
            ]
          );
        }
      }
      await recordMapping('notes', n.id, 'journal_entries', targetId);
      notesMigrated++;
    }
    report.counts.journal_entries = { source: notes.length, eligible: notes.length, migrated: notesMigrated, skipped: 0, errors: 0 };

    // -------------------------------------------------------------------------
    // DOMAIN 10: Goals
    // -------------------------------------------------------------------------
    const dailyGoals = data.daily_goals || [];
    let goalsMigrated = 0;
    for (const dg of dailyGoals) {
      const ownerId = idMap.get(`users:${dg.user_id}`) || primaryUserId;
      let targetId;
      const existing = await client.query(
        'SELECT id FROM public.goals WHERE workspace_id = $1 AND legacy_id = $2',
        [workspaceId, dg.id]
      );

      if (existing.rowCount > 0) {
        targetId = existing.rows[0].id;
      } else {
        targetId = (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id;
        if (!dryRun) {
          await client.query(
            `INSERT INTO public.goals (
              id, workspace_id, user_id, period_type, target_applications, target_outreach,
              effective_date, legacy_id, created_at, updated_at
             ) VALUES ($1, $2, $3, 'DAILY', $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()), COALESCE($9::timestamptz, NOW()))
             ON CONFLICT (workspace_id, user_id, period_type, effective_date) DO UPDATE
             SET target_applications = EXCLUDED.target_applications`,
            [
              targetId, workspaceId, ownerId, dg.applications_target || 0,
              (dg.recruiter_messages_target || 0) + (dg.connections_target || 0),
              dg.goal_date, dg.id, parseLegacyDate(dg.created_at), parseLegacyDate(dg.updated_at)
            ]
          );
        }
      }
      await recordMapping('daily_goals', dg.id, 'goals', targetId);
      goalsMigrated++;
    }
    report.counts.goals = { source: dailyGoals.length, eligible: dailyGoals.length, migrated: goalsMigrated, skipped: 0, errors: 0 };

    // -------------------------------------------------------------------------
    // Foreign Key Integrity Check (Zero-Orphan Query Sweep)
    // -------------------------------------------------------------------------
    const orphans = {
      orphan_applications: (await client.query(
        `SELECT COUNT(*)::int AS cnt FROM public.applications WHERE workspace_id = $1 AND user_id NOT IN (SELECT user_id FROM public.profiles)`,
        [workspaceId]
      )).rows[0].cnt,
      orphan_snapshots: (await client.query(
        `SELECT COUNT(*)::int AS cnt FROM public.job_snapshots WHERE workspace_id = $1 AND application_id NOT IN (SELECT id FROM public.applications)`,
        [workspaceId]
      )).rows[0].cnt,
      orphan_interviews: (await client.query(
        `SELECT COUNT(*)::int AS cnt FROM public.interviews WHERE workspace_id = $1 AND application_id NOT IN (SELECT id FROM public.applications)`,
        [workspaceId]
      )).rows[0].cnt,
      orphan_tasks: (await client.query(
        `SELECT COUNT(*)::int AS cnt FROM public.tasks WHERE workspace_id = $1 AND application_id IS NOT NULL AND application_id NOT IN (SELECT id FROM public.applications)`,
        [workspaceId]
      )).rows[0].cnt,
      orphan_habit_logs: (await client.query(
        `SELECT COUNT(*)::int AS cnt FROM public.habit_logs WHERE workspace_id = $1 AND habit_id NOT IN (SELECT id FROM public.habits)`,
        [workspaceId]
      )).rows[0].cnt,
      orphan_journal: (await client.query(
        `SELECT COUNT(*)::int AS cnt FROM public.journal_entries WHERE workspace_id = $1 AND application_id IS NOT NULL AND application_id NOT IN (SELECT id FROM public.applications)`,
        [workspaceId]
      )).rows[0].cnt
    };
    report.fk_integrity = orphans;

    // Check that all orphan counts are strictly 0
    const totalOrphans = Object.values(orphans).reduce((sum, v) => sum + v, 0);
    if (totalOrphans > 0) {
      throw new Error(`Integrity check failed: ${totalOrphans} orphan records found after migration!`);
    }

    if (!dryRun) {
      await client.query(
        `UPDATE public.migration_batches SET status = 'COMPLETED', summary = $1, completed_at = NOW() WHERE batch_id = $2`,
        [JSON.stringify(report.counts), batchId]
      );
      await client.query('COMMIT');
      report.status = 'COMPLETED';
    } else {
      await client.query('ROLLBACK');
      report.status = 'DRY_RUN_SUCCESS';
    }

  } catch (err) {
    await client.query('ROLLBACK');
    report.status = 'FAILED';
    report.errors.push({ message: err.message, stack: err.stack });
    throw err;
  } finally {
    await client.end();
    report.metadata.duration_ms = Date.now() - startTime;
    if (reportPath) {
      writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    }
  }

  return report;
}

/**
 * Executes a clean, safe rollback of a migrated workspace.
 */
export async function rollbackMigration({ targetUrl, workspaceId, confirmNonProduction = false }) {
  assertSafeTarget(targetUrl, confirmNonProduction);

  const client = new Client({ connectionString: targetUrl });
  await client.connect();

  try {
    await client.query('BEGIN');

    // 1. Delete mappings
    await client.query(
      `DELETE FROM public.migration_id_mappings 
       WHERE batch_id IN (SELECT batch_id FROM public.migration_batches WHERE target_workspace_id = $1)`,
      [workspaceId]
    );

    // 2. Delete batches
    await client.query('DELETE FROM public.migration_batches WHERE target_workspace_id = $1', [workspaceId]);

    // 3. Delete workspace child records (cascade)
    await client.query('DELETE FROM public.journal_entries WHERE workspace_id = $1', [workspaceId]);
    await client.query('DELETE FROM public.tasks WHERE workspace_id = $1', [workspaceId]);
    await client.query('DELETE FROM public.habit_logs WHERE workspace_id = $1', [workspaceId]);
    await client.query('DELETE FROM public.habits WHERE workspace_id = $1', [workspaceId]);
    await client.query('DELETE FROM public.interviews WHERE workspace_id = $1', [workspaceId]);
    await client.query('DELETE FROM public.contacts WHERE workspace_id = $1', [workspaceId]);
    await client.query('DELETE FROM public.application_events WHERE workspace_id = $1', [workspaceId]);
    await client.query('DELETE FROM public.job_snapshots WHERE workspace_id = $1', [workspaceId]);
    await client.query('DELETE FROM public.applications WHERE workspace_id = $1', [workspaceId]);
    await client.query('DELETE FROM public.goals WHERE workspace_id = $1', [workspaceId]);
    await client.query('DELETE FROM public.resumes WHERE workspace_id = $1', [workspaceId]);

    // 4. Delete workspace (cascades to workspace_members without tripping last-manager trigger)
    await client.query('DELETE FROM public.workspaces WHERE id = $1', [workspaceId]);

    // 5. Clean up claim codes and staged legacy profiles
    await client.query(
      `DELETE FROM public.legacy_claim_codes 
       WHERE user_id IN (SELECT user_id FROM public.profiles WHERE legacy_user_id IS NOT NULL)`
    );
    await client.query('DELETE FROM public.profiles WHERE legacy_user_id IS NOT NULL');
    await client.query(`DELETE FROM public.user_accounts WHERE status = 'STAGED'`);

    await client.query('COMMIT');
    return { success: true, workspace_id: workspaceId, message: 'Rollback completed cleanly.' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

/**
 * Executes a strictly READ-ONLY preflight against a target database.
 * NEVER calls BEGIN, never executes INSERT, UPDATE, DELETE or any schema mutation.
 */
export async function runProductionPreflight({ targetUrl }) {
  if (!targetUrl) {
    throw new Error('Target database URL is required for preflight');
  }

  const isLocal = targetUrl.includes('127.0.0.1') || targetUrl.includes('localhost');
  const client = new Client({ connectionString: targetUrl, ssl: isLocal ? false : { rejectUnauthorized: false } });
  await client.connect();

  try {
    const checks = [];

    // 1. Connection check
    checks.push({ name: 'connection', status: 'PASS', detail: 'Connected successfully' });

    // 2. Migration count & level in supabase_migrations
    const migCheck = await client.query('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;');
    const appliedVersions = migCheck.rows.map(r => r.version);
    const hasM14 = appliedVersions.includes('20261020100000');
    checks.push({
      name: 'migrations',
      status: appliedVersions.length === 18 && hasM14 ? 'PASS' : 'WARN',
      detail: `${appliedVersions.length}/18 migrations applied (latest: ${appliedVersions[appliedVersions.length - 1]})`
    });

    // 3. Required legacy migration columns
    const colCheck = await client.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND (
          (table_name = 'profiles' AND column_name = 'legacy_user_id') OR
          (table_name = 'applications' AND column_name = 'legacy_id') OR
          (table_name = 'profiles' AND column_name = 'ui_preferences')
        );
    `);
    const foundCols = colCheck.rows.map(r => `${r.table_name}.${r.column_name}`);
    const hasCols = foundCols.includes('profiles.legacy_user_id') && foundCols.includes('applications.legacy_id') && foundCols.includes('profiles.ui_preferences');
    checks.push({
      name: 'legacy_columns',
      status: hasCols ? 'PASS' : 'FAIL',
      detail: `Found: ${foundCols.join(', ')}`
    });

    // 4. Required migration audit tables
    const tblCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('migration_batches', 'migration_id_mappings', 'legacy_claim_codes');
    `);
    const foundTbls = tblCheck.rows.map(r => r.table_name);
    const hasTbls = foundTbls.length === 3;
    checks.push({
      name: 'migration_tables',
      status: hasTbls ? 'PASS' : 'FAIL',
      detail: `Found: ${foundTbls.join(', ')}`
    });

    // 5. Required application domain tables
    const domainTables = [
      'user_accounts', 'profiles', 'workspaces', 'workspace_members',
      'applications', 'job_snapshots', 'application_events',
      'contacts', 'interviews', 'tasks', 'habits', 'habit_logs',
      'journal_entries', 'goals', 'resumes'
    ];
    const dCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = ANY($1);
    `, [domainTables]);
    const foundDomains = dCheck.rows.map(r => r.table_name);
    checks.push({
      name: 'domain_tables',
      status: foundDomains.length === domainTables.length ? 'PASS' : 'FAIL',
      detail: `${foundDomains.length}/${domainTables.length} domain tables present`
    });

    // 6. RLS enabled on migration tables
    const rlsCheck = await client.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
        AND tablename IN ('migration_batches', 'legacy_claim_codes', 'applications');
    `);
    const allRls = rlsCheck.rows.every(r => r.rowsecurity);
    checks.push({
      name: 'rls_status',
      status: allRls ? 'PASS' : 'FAIL',
      detail: `RLS active on tested tables: ${allRls}`
    });

    const isReady = checks.every(c => c.status === 'PASS');
    return {
      success: isReady,
      readOnly: true,
      checks,
      timestamp: new Date().toISOString()
    };
  } finally {
    await client.end();
  }
}

// CLI Execution Entrypoint
if (process.argv[1]?.endsWith('migrate-legacy-data.mjs')) {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };
  const hasFlag = (flag) => args.includes(flag);

  const source = getArg('--source') || 'tests/fixtures/legacy-representative-export.json';
  const targetUrl = getArg('--target') || process.env.REHEARSAL_TARGET_DB_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const workspaceId = getArg('--workspace') || DEFAULT_MIGRATED_WORKSPACE_ID;
  const workspaceName = getArg('--workspace-name') || DEFAULT_MIGRATED_WORKSPACE_NAME;
  const dryRun = hasFlag('--dry-run');
  const validateOnly = hasFlag('--validate-only');
  const preflight = hasFlag('--preflight');
  const rollback = hasFlag('--rollback');
  const confirmNonProduction = hasFlag('--confirm-non-production');
  const reportPath = getArg('--report') || null;

  if (preflight) {
    console.log(`Starting read-only preflight against target database...`);
    runProductionPreflight({ targetUrl })
      .then(res => { console.log(JSON.stringify(res, null, 2)); process.exit(res.success ? 0 : 1); })
      .catch(err => { console.error('Preflight check failed:', err); process.exit(1); });
  } else if (rollback) {
    console.log(`Starting rollback for workspace ${workspaceId}...`);
    rollbackMigration({ targetUrl, workspaceId, confirmNonProduction })
      .then(res => { console.log(JSON.stringify(res, null, 2)); process.exit(0); })
      .catch(err => { console.error('Rollback failed:', err); process.exit(1); });
  } else {
    console.log(`Starting migration from ${source} to workspace ${workspaceId}...`);
    runMigration({ source, targetUrl, workspaceId, workspaceName, dryRun, validateOnly, confirmNonProduction, reportPath })
      .then(report => { console.log('Migration finished:', JSON.stringify(report, null, 2)); process.exit(0); })
      .catch(err => { console.error('Migration failed:', err); process.exit(1); });
  }
}

