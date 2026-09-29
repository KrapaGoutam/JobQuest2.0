// @ts-check
// Pure, framework-free helpers for the Side Panel UI (Phase C/D). None of
// these touch the DOM or `chrome` at module-load time, so they can be unit
// tested directly in the existing Node vitest environment — see
// tests/sidepanel-logic.test.js. `sidepanel.js` imports these and wires them
// to real DOM/chrome state; it intentionally contains no business logic of
// its own that isn't already covered by popup.js/api/jobquest.js.

/** @typedef {'detected' | 'possible' | 'saved' | 'duplicate' | 'partial' | 'none' | 'offline' | 'dash' | 'analytics' | 'empty' | 'settings' | 'setup'} PanelScreen */

export const CAPTURE_SCREENS = /** @type {const} */ ([
  'detected', 'possible', 'saved', 'duplicate', 'partial', 'none', 'offline',
]);

/**
 * Maps the real duplicate-check response (`match_type`: EXACT_POSTING |
 * SAME_ROLE | COMPANY_ONLY | NONE | CHECK_ERROR — the same four+error states
 * `popup.js`'s `renderDuplicate()` already switches on) onto the design's
 * four duplicate levels. Do not invent new categories server-side doesn't
 * have.
 * @param {{ match_type?: string, matches?: Array<{ application?: { stage?: string } }> }} result
 * @returns {{ level: 'strong' | 'probable' | 'saved' | 'possible' | 'error' | 'none', match: object | null }}
 */
export function mapDuplicateLevel(result) {
  const type = result?.match_type;
  const match = result?.matches?.[0] || null;
  if (type === 'CHECK_ERROR') return { level: 'error', match: null };
  if (type === 'EXACT_POSTING' && match?.application?.stage === 'SAVED') return { level: 'saved', match };
  if (type === 'EXACT_POSTING') return { level: 'strong', match };
  if (type === 'SAME_ROLE') return { level: 'probable', match };
  if (type === 'COMPANY_ONLY') return { level: 'possible', match };
  return { level: 'none', match: null };
}

/**
 * Normalizes capture identity fields to a stable representation.
 * @param {Record<string, unknown>} [raw]
 * @returns {{ company: string, jobTitle: string, jobUrl: string, externalJobId: string, source: string, location: string }}
 */
export function normalizeIdentity(raw = {}) {
  return {
    company: String(raw.company || '').trim(),
    jobTitle: String(raw.jobTitle || '').trim(),
    jobUrl: String(raw.jobUrl || '').trim(),
    externalJobId: String(raw.externalJobId || '').trim(),
    source: String(raw.source || '').trim(),
    location: String(raw.location || '').trim(),
  };
}

/**
 * Computes a stable fingerprint string for duplicate identity comparison.
 * Any difference in company, jobTitle, jobUrl, externalJobId, source, or location
 * yields a different key.
 * @param {Record<string, unknown>} [raw]
 * @returns {string}
 */
export function computeDuplicateIdentityKey(raw = {}) {
  const id = normalizeIdentity(raw);
  return [
    id.company.toLowerCase(),
    id.jobTitle.toLowerCase(),
    id.jobUrl.toLowerCase(),
    id.externalJobId,
    id.source.toLowerCase(),
    id.location.toLowerCase(),
  ].join('::');
}

/**
 * @typedef {Object} DuplicateState
 * @property {number} contextSeq - Active capture context sequence
 * @property {number} checkSeq - Sequence for in-flight duplicate checks within context
 * @property {string | null} checkedKey - Identity key of last completed check
 * @property {{ level: 'strong' | 'probable' | 'saved' | 'possible' | 'error' | 'none', match: object | null }} info - Cached result
 * @property {boolean} isStale - True if identity changed or check is pending
 * @property {string | null} overrideKey - Identity key explicitly authorized for duplicate bypass
 */

/**
 * Creates a fresh, isolated duplicate lifecycle state for a given capture context.
 * B1 guarantee: overrideKey starts as null, preventing any previous override from leaking.
 * @param {number} [contextSeq=0]
 * @returns {DuplicateState}
 */
export function initDuplicateContext(contextSeq = 0) {
  return {
    contextSeq,
    checkSeq: 0,
    checkedKey: null,
    info: { level: 'none', match: null },
    isStale: true,
    overrideKey: null,
  };
}

/**
 * Called when any identity field changes.
 * B2 guarantee: invalidates previous duplicate result and revokes any prior override.
 * @param {DuplicateState} state
 * @param {Record<string, unknown>} nextIdentity
 * @returns {DuplicateState}
 */
export function onIdentityChange(state, nextIdentity) {
  const nextKey = computeDuplicateIdentityKey(nextIdentity);
  if (state.checkedKey !== nextKey) {
    state.isStale = true;
    state.info = { level: 'none', match: null };
  }
  if (state.overrideKey && state.overrideKey !== nextKey) {
    state.overrideKey = null;
  }
  return state;
}

/**
 * Authorizes a duplicate override exclusively for the current identity.
 * @param {DuplicateState} state
 * @param {Record<string, unknown>} identity
 * @returns {DuplicateState}
 */
export function authorizeDuplicateOverride(state, identity) {
  state.overrideKey = computeDuplicateIdentityKey(identity);
  return state;
}

/**
 * Checks whether duplicate bypass is authorized for a specific identity.
 * B1 guarantee: only returns true if the exact identity matches the authorized overrideKey.
 * @param {DuplicateState} state
 * @param {Record<string, unknown>} identity
 * @returns {boolean}
 */
export function isDuplicateOverriddenFor(state, identity) {
  if (!state.overrideKey) return false;
  return state.overrideKey === computeDuplicateIdentityKey(identity);
}

/**
 * Determines whether save can proceed safely without risking saving a duplicate.
 * B2 guarantee: verifies that the duplicate check was run against the exact current identity
 * and was not a blocking duplicate, or that an explicit override was authorized for this exact identity.
 * @param {DuplicateState} state
 * @param {Record<string, unknown>} identity
 * @returns {{ canSave: boolean, duplicateOverride?: boolean, reason: 'OVERRIDDEN' | 'VERIFIED_SAFE' | 'NEEDS_CHECK' | 'BLOCKED_DUPLICATE' }}
 */
export function canSafelySave(state, identity) {
  if (isDuplicateOverriddenFor(state, identity)) {
    return { canSave: true, duplicateOverride: true, reason: 'OVERRIDDEN' };
  }

  const key = computeDuplicateIdentityKey(identity);
  if (state.isStale || state.checkedKey !== key) {
    return { canSave: false, reason: 'NEEDS_CHECK' };
  }

  const level = state.info.level;
  if (level === 'strong' || level === 'probable' || level === 'saved') {
    return { canSave: false, reason: 'BLOCKED_DUPLICATE' };
  }

  return { canSave: true, duplicateOverride: false, reason: 'VERIFIED_SAFE' };
}

/**
 * Marks the start of a duplicate check request.
 * @param {DuplicateState} state
 * @returns {{ checkSeq: number }}
 */
export function onDuplicateCheckStart(state) {
  state.checkSeq += 1;
  return { checkSeq: state.checkSeq };
}

/**
 * Processes a completed duplicate check response.
 * N1 guarantee: checks both contextSeq (tab switch) and checkSeq (newer check within context)
 * to prevent late responses from overwriting newer state or other tabs.
 * @param {DuplicateState} state
 * @param {number} contextSeq
 * @param {number} checkSeq
 * @param {Record<string, unknown>} identity
 * @param {{ match_type?: string, matches?: Array<{ application?: { stage?: string } }> }} result
 * @returns {{ ignored: boolean, reason?: string, level?: string, match?: object | null }}
 */
export function onDuplicateCheckResult(state, contextSeq, checkSeq, identity, result) {
  if (contextSeq !== state.contextSeq) {
    return { ignored: true, reason: 'CONTEXT_SUPERSEDED' };
  }
  if (checkSeq !== state.checkSeq) {
    return { ignored: true, reason: 'CHECK_SUPERSEDED' };
  }

  state.checkedKey = computeDuplicateIdentityKey(identity);
  state.info = mapDuplicateLevel(result);
  state.isStale = false;
  return { ignored: false, level: state.info.level, match: state.info.match };
}

/** The real field superset content.js's extractors populate (see its return
 * shapes) that the Capture tab's completeness checklist tracks. Core fields
 * missing from EITHER company or jobTitle drive the `partial` classification;
 * the rest are informational and never block Save. */
export const CAPTURE_CORE_FIELDS = ['jobTitle', 'company', 'location', 'workArrangement', 'employmentType'];
export const CAPTURE_OPTIONAL_FIELDS = ['salaryRange', 'description', 'jobUrl'];

/**
 * @param {Record<string, unknown>} captured
 * @returns {{ percent: number, present: string[], missing: string[] }}
 */
export function computeCaptureCompleteness(captured = {}) {
  const all = [...CAPTURE_CORE_FIELDS, ...CAPTURE_OPTIONAL_FIELDS];
  const present = all.filter((field) => Boolean(String(captured[field] ?? '').trim()));
  const missing = all.filter((field) => !present.includes(field));
  const percent = all.length === 0 ? 0 : Math.round((present.length / all.length) * 100);
  return { percent, present, missing };
}

/**
 * `detected` / `partial` / `none` — mirrors popup.js's X4/X6/X7 branching
 * (company+title both present vs. one-or-neither present).
 * @param {Record<string, unknown>} captured
 * @returns {'detected' | 'partial' | 'none'}
 */
export function classifyExtraction(captured = {}) {
  const hasCompany = Boolean(String(captured.company || '').trim());
  const hasTitle = Boolean(String(captured.jobTitle || '').trim());
  if (!hasCompany && !hasTitle) return 'none';
  if (!hasCompany || !hasTitle) return 'partial';
  return 'detected';
}

/**
 * Real connection-state → initial screen decision, mirroring popup.js's
 * X1 (unconfigured) / X2 (expired or revoked) / X3 (unreachable) branching,
 * expressed as the Side Panel's screen enum. An expired/revoked/invalid
 * token routes to `setup` (it needs a fresh token, same as X2's copy already
 * says); a reachability failure routes to `offline` (nothing wrong with the
 * stored token, just can't reach the server right now).
 * @param {{ configured: boolean, connectionError: { state: string } | null }} state
 * @returns {'setup' | 'offline'}
 */
export function classifyConnectionScreen({ configured, connectionError }) {
  if (!configured) return 'setup';
  if (connectionError?.state === 'EXPIRED_OR_REVOKED' || connectionError?.state === 'INVALID_INPUT') return 'setup';
  return 'offline';
}

/**
 * Combines extraction + duplicate classification into the final Capture
 * screen. A `possible` duplicate is non-blocking (renders as an info card
 * above the normal detected content); strong/probable/saved duplicates take
 * over the screen per the design's "Duplicate levels" table.
 * @param {'detected' | 'partial' | 'none'} extractionScreen
 * @param {'strong' | 'probable' | 'saved' | 'possible' | 'error' | 'none'} duplicateLevel
 * @returns {PanelScreen}
 */
export function resolveCaptureScreen(extractionScreen, duplicateLevel) {
  if (extractionScreen === 'none') return 'none';
  if (duplicateLevel === 'strong' || duplicateLevel === 'probable' || duplicateLevel === 'saved') return 'duplicate';
  if (extractionScreen === 'partial') return 'partial';
  if (duplicateLevel === 'possible') return 'possible';
  return 'detected';
}

/**
 * Save-as toggle → workflow stage id, using the REAL getWorkflow() stage
 * list (never a hardcoded stage). "Save for later" resolves to whichever
 * stage is literally labelled/idd "Saved"; "I applied" to "Applied". Falls
 * back to the workflow's own `default_action` (and then its first stage) so
 * the extension never invents a stage id the server doesn't have.
 * @param {'later' | 'applied'} saveAs
 * @param {{ stages?: Array<{ id: string, label: string }>, default_action?: string }} workflow
 * @returns {string}
 */
export function saveAsToStageId(saveAs, workflow) {
  const stages = workflow?.stages || [];
  const wanted = saveAs === 'applied' ? 'applied' : 'saved';
  const found = stages.find((stage) => (
    String(stage.label || '').trim().toLowerCase() === wanted
    || String(stage.id || '').trim().toLowerCase() === wanted
  ));
  return found?.id || workflow?.default_action || stages[0]?.id || '';
}

/**
 * How many of the 8 pipeline "pips" should render filled for a given stage,
 * proportional to its position in the real stage list.
 * @param {string} stageId
 * @param {{ stages?: Array<{ id: string }> }} workflow
 */
export function stagePipCount(stageId, workflow) {
  const stages = workflow?.stages || [];
  const index = stages.findIndex((stage) => stage.id === stageId);
  if (index === -1 || stages.length === 0) return 0;
  return Math.max(1, Math.round(((index + 1) / stages.length) * 8));
}

/**
 * Roving-tabindex arrow-key helper shared by the tablist and the Stage
 * listbox popup. Wraps at both ends; Home/End jump to the first/last item.
 * @param {number} currentIndex
 * @param {number} count
 * @param {'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'} key
 */
export function nextRovingIndex(currentIndex, count, key) {
  if (count <= 0) return 0;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const delta = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0;
  return (((currentIndex + delta) % count) + count) % count;
}

/**
 * True when a browser tab change should trigger a Capture re-scan: the
 * panel wasn't tracking a tab yet, a different tab became active, or the
 * same tab finished loading a different URL. Mid-navigation updates
 * (status !== 'complete') never trigger a rescan — only the design's
 * documented "keep old summary, scan, swap" transition once loading settles.
 * @param {{ url?: string } | undefined | null} previousTab
 * @param {{ url?: string, status?: string } | undefined | null} updatedTab
 */
export function shouldRescanForTabChange(previousTab, updatedTab) {
  if (!updatedTab) return false;
  if (updatedTab.status && updatedTab.status !== 'complete') return false;
  if (!previousTab?.url) return true;
  return previousTab.url !== updatedTab.url;
}

/**
 * Assembles the capture draft object exactly like popup.js's save() does,
 * extracted so it — and the Settings "Default Stage" preference / Save-as
 * toggle that feed it — can be unit tested without a DOM.
 * @param {{
 *   captured?: Record<string, unknown>, company: string, jobTitle: string, stageId: string,
 *   jobUrl?: string | null, source?: string | null, location?: string | null,
 *   workArrangement?: string | null, employmentType?: string | null,
 *   salary?: { min: number | null, max: number | null }, notes?: string | null,
 *   appliedAtDate: string, duplicateOverride?: boolean, resumeId?: string | null,
 *   resumeLabel?: string | null,
 * }} params
 */
export function buildCaptureDraft({
  captured = {}, company, jobTitle, stageId, jobUrl, source, location, workArrangement,
  employmentType, salary, notes, appliedAtDate, duplicateOverride, resumeId, resumeLabel,
}) {
  return {
    company,
    job_title: jobTitle,
    stage: stageId,
    job_url: jobUrl || null,
    source: source || null,
    external_job_id: captured.externalJobId || null,
    location: location || null,
    work_arrangement: workArrangement || null,
    employment_type: employmentType || null,
    salary_min: salary?.min ?? null,
    salary_max: salary?.max ?? null,
    salary_currency: captured.salaryCurrency || 'USD',
    duplicate_override: Boolean(duplicateOverride),
    notes: notes || null,
    applied_at: `${appliedAtDate}T12:00:00.000Z`,
    snapshot: {
      description: captured.description || null,
      requirements: captured.requirements || null,
      skills: captured.skills || null,
      raw_payload: {
        extraction_confidence: captured.confidence || null,
        salary_range: captured.salaryRange || null,
      },
    },
    resume_id: resumeId || null,
    resume_label: resumeLabel || null,
  };
}

/**
 * A first-pass "Environment" label for Settings/Setup, reusing the same
 * signal `options.js`'s `instance-preset.json` convention already encodes
 * (dev vs prod) with a same-origin fallback purely off the instance URL
 * itself when no preset is available. This deliberately does NOT invent a
 * new server-reported environment concept — see the design map's explicit
 * instruction to keep this a label only absent one.
 * @param {string} instanceUrl
 * @param {string} [presetEnvironment]
 */
export function describeEnvironment(instanceUrl, presetEnvironment) {
  if (presetEnvironment === 'dev') return 'Preview / Development';
  if (presetEnvironment === 'prod') return 'Production';
  const url = String(instanceUrl || '');
  return /localhost|127\.0\.0\.1|:\d+$/.test(url) ? 'Preview / Development' : 'Production';
}

// ---------------------------------------------------------------------------
// Dashboard / Analytics (GET /ext/v1/stats) — pure presentation helpers
// ---------------------------------------------------------------------------

/** The 4 stages the design's Dashboard "mini" PIPELINE card shows, in
 *  display order. Analytics' "full" PIPELINE SNAPSHOT card instead shows the
 *  real `/stats` `pipeline` array unfiltered (all 8 stages, server order) —
 *  pass `null`/omit `stageIds` to `mapPipelineForDisplay` for that view. */
export const DASHBOARD_PIPELINE_STAGES = /** @type {const} */ (['APPLIED', 'ASSESSMENT', 'INTERVIEW', 'OFFER']);

/** Human labels for the real `/stats` pipeline stage ids. */
const STAGE_LABELS = {
  SAVED: 'Saved',
  PREPARING: 'Preparing',
  APPLIED: 'Applied',
  ASSESSMENT: 'Assessment',
  RECRUITER_SCREEN: 'Recruiter Screen',
  INTERVIEW: 'Interview',
  FINAL_INTERVIEW: 'Final Interview',
  OFFER: 'Offer',
};

/** @param {string} stageId */
export function formatStageLabel(stageId) {
  return STAGE_LABELS[stageId] || String(stageId || '');
}

/**
 * Selects and orders a subset of the real `/stats` `pipeline` array (or all
 * of it, when `stageIds` is omitted) into compact bar-row data, with each
 * row's bar `percent` computed relative to the largest count in the
 * SELECTED subset (never a hardcoded max) so an all-zero subset renders
 * all-empty bars instead of dividing by zero.
 * @param {Array<{ stage: string, count: number }> | undefined | null} pipeline
 * @param {readonly string[] | null} [stageIds]
 * @returns {Array<{ stage: string, label: string, count: number, percent: number }>}
 */
export function mapPipelineForDisplay(pipeline, stageIds) {
  const rows = Array.isArray(pipeline) ? pipeline : [];
  const byStage = new Map(rows.map((row) => [row.stage, row.count]));
  const ids = stageIds && stageIds.length ? stageIds : rows.map((row) => row.stage);
  const selected = ids.map((stage) => ({ stage, label: formatStageLabel(stage), count: byStage.get(stage) ?? 0 }));
  const max = Math.max(0, ...selected.map((row) => row.count));
  return selected.map((row) => ({ ...row, percent: max > 0 ? Math.round((row.count / max) * 100) : 0 }));
}

/**
 * "{N} more to reach this week's goal" remainder. Returns `null` when there
 * is no active goal (or it has no numeric target) — the caller must render
 * an honest "no goal set" empty variant rather than fabricate a goal, per
 * the design map's explicit "do not invent one" instruction.
 * @param {{ target_applications?: number } | null | undefined} activeGoal
 * @param {number | undefined} applicationsThisWeek
 * @returns {number | null}
 */
export function computeGoalRemainder(activeGoal, applicationsThisWeek) {
  if (!activeGoal || typeof activeGoal.target_applications !== 'number') return null;
  const current = Number(applicationsThisWeek) || 0;
  return Math.max(0, activeGoal.target_applications - current);
}

/**
 * Clamps a (possibly null/undefined/out-of-range) percent into a safe
 * `aria-valuenow`/width value for a progress bar.
 * @param {number | null | undefined} value
 */
export function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Renders a stat that may not be present yet (defensive against a `/stats`
 * field the backend hasn't shipped in every environment, e.g.
 * `applications_yesterday`/`applications_last_week`) as an em dash rather
 * than "undefined" or "NaN".
 * @param {unknown} value
 */
export function formatStatValue(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '—';
}
