// @ts-check
// JobQuest Capture — Side Panel (Phase C: persistent shell, Phase D: Capture
// tab, Phase E: real Dashboard/Analytics from GET /ext/v1/stats).
// ALL business logic here is reused verbatim from popup.js / api/jobquest.js
// / sidepanel-logic.js — this file only wires that logic to the Side Panel's
// DOM and to chrome.tabs active-tab tracking, which popup.js never needed.

import {
  buildSecureJobQuestUrl,
  checkDuplicate,
  clearSettings,
  createCapture,
  getActiveResumes,
  getCapturePreferences,
  getSettings,
  getStats,
  getWorkflow,
  isConnectionError,
  mapConnectionError,
  maskToken,
  parseSalaryRange,
  saveCapturePreferences,
  saveSettings,
  saveTheme,
  testConnection,
} from './api/jobquest.js';
import { generateAIJobJson } from './serializers/ai-job-json.js';
import {
  buildCaptureDraft,
  classifyConnectionScreen,
  classifyExtraction,
  clampPercent,
  computeCaptureCompleteness,
  computeDuplicateIdentityKey,
  computeGoalRemainder,
  DASHBOARD_PIPELINE_STAGES,
  describeEnvironment,
  evaluateSaveGate,
  formatStatValue,
  initDuplicateContext,
  isSaveContextValid,
  mapPipelineForDisplay,
  nextRovingIndex,
  onDuplicateCheckResult,
  onDuplicateCheckStart,
  onIdentityChange,
  resolveCaptureScreen,
  saveAsToStageId,
  shouldRescanForTabChange,
  stagePipCount,
} from './sidepanel-logic.js';

const byId = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id));
const select = (id) => /** @type {HTMLSelectElement} */ (document.getElementById(id));
const button = (id) => /** @type {HTMLButtonElement} */ (document.getElementById(id));

const panelState = byId('panel-state');

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let settings = { instanceUrl: '', apiToken: '', theme: 'system' };
let capturePreferences = { defaultStage: '', warnOnDuplicates: true, autoDetectJobPages: true, openCaptureOnDetect: true };
let workspace = null;
let workflow = { stages: [], default_action: '' };
let workflowReady = false;
let resumes = /** @type {Array<any>} */ ([]);
let connectionOnline = false;
let lastConnectionError = /** @type {{ state: string, message: string } | null} */ (null);

/** @type {Record<string, any>} */
let captured = {};
let userManuallyToggledDetails = false;
/** @type {{ level: 'error' | 'strong' | 'none' | 'possible' | 'saved' | 'probable', match: object | null }} */
let duplicateInfo = { level: 'none', match: null };
/** @type {import('./sidepanel-logic.js').DuplicateState} */
let duplicateState = initDuplicateContext(0);
let duplicateTimer = 0;

let currentActiveTab = /** @type {{ id?: number, url?: string } | null} */ (null);
let capturePanelStale = false;
let createdPath = '';

// Monotonically increasing sequence guarding runCaptureFlow: incremented at
// the start of every call so a stale, superseded extraction/duplicate-check
// (from a tab that's no longer the latest request) can never overwrite a
// newer call's render — see the Side Panel rapid tab-switch race.
let captureRequestSeq = 0;

// Dashboard/Analytics share a single cached GET /ext/v1/stats fetch per
// Side Panel session — see the design map's "one minimal new endpoint" note.
// Loaded lazily on first visit to either tab, not on every tab switch.
/** @type {any} */
let stats = null;
let statsLoading = false;
/** @type {{ state: string, message: string } | null} */
let statsError = null;

/** Which top-level view is showing: 'capture' | 'dashboard' | 'analytics' | 'settings' | 'setup' */
let currentView = 'capture';
let viewBeforeSettings = 'capture';
let currentCaptureScreen = 'none';
let selectedStageId = '';

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

function setPanelState(code, message = '') {
  panelState.textContent = `${code}${message ? `: ${message}` : ''}`;
}

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

function firstLetter(text) {
  const trimmed = String(text || '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

function formatTimestamp(date = new Date()) {
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Header (connection pill, workspace, avatar)
// ---------------------------------------------------------------------------

function renderHeader() {
  const pill = byId('conn-pill');
  const label = byId('conn-label');
  if (connectionOnline) {
    pill.dataset.status = 'online';
    label.textContent = 'Connected';
  } else if (lastConnectionError) {
    pill.dataset.status = 'offline';
    label.textContent = 'Disconnected';
  } else {
    pill.dataset.status = 'checking';
    label.textContent = 'Checking…';
  }
  byId('ws-name-text').textContent = workspace?.name || (settings.instanceUrl ? 'JobQuest' : 'Not connected');
  byId('avatar-circle').textContent = firstLetter(workspace?.name || workspace?.username || 'J');
}

// ---------------------------------------------------------------------------
// View / tab switching
// ---------------------------------------------------------------------------

const VIEW_IDS = { capture: 'view-capture', dashboard: 'view-dashboard', analytics: 'view-analytics', settings: 'view-settings', setup: 'view-setup' };
const TAB_ORDER = ['capture', 'dashboard', 'analytics'];

function showView(view) {
  currentView = view;
  for (const [key, id] of Object.entries(VIEW_IDS)) byId(id).hidden = key !== view;

  const isChromeFree = view === 'settings' || view === 'setup';
  byId('panel-header').hidden = isChromeFree;
  byId('back-header').hidden = !isChromeFree;
  byId('tabbar').hidden = isChromeFree;
  byId('capture-footer').hidden = view !== 'capture' || !['detected', 'possible', 'partial', 'duplicate', 'saved'].includes(currentCaptureScreen);

  if (TAB_ORDER.includes(view)) {
    for (const tabName of TAB_ORDER) {
      const tab = byId(`tab-${tabName}`);
      const selected = tabName === view;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
  }

  if (view === 'capture' && capturePanelStale) {
    capturePanelStale = false;
    if (currentActiveTab) void runCaptureFlow(currentActiveTab, { showScanning: false });
  }
  if (view === 'dashboard' || view === 'analytics') void ensureStatsLoaded();
  setPanelState('VIEW', view);
}

function setupTabBar() {
  for (const tabName of TAB_ORDER) {
    byId(`tab-${tabName}`).addEventListener('click', () => showView(tabName));
  }
  byId('tabbar').addEventListener('keydown', (event) => {
    const key = /** @type {KeyboardEvent} */ (event).key;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    const currentIndex = TAB_ORDER.indexOf(currentView === 'capture' || currentView === 'dashboard' || currentView === 'analytics' ? currentView : 'capture');
    const nextIndex = nextRovingIndex(currentIndex, TAB_ORDER.length, /** @type {any} */ (key));
    const nextTab = TAB_ORDER[nextIndex];
    byId(`tab-${nextTab}`).focus();
    showView(nextTab);
  });

  byId('settings-btn').addEventListener('click', () => {
    if (currentView !== 'settings' && currentView !== 'setup') viewBeforeSettings = currentView;
    void openSettings();
  });
  byId('back-btn').addEventListener('click', () => showView(viewBeforeSettings));
}

// ---------------------------------------------------------------------------
// Capture tab — extraction
// ---------------------------------------------------------------------------

/** Mirrors popup.js's extractActivePage(), but takes an explicit tab (the
 * Side Panel tracks the active tab itself rather than querying at save time). */
async function extractFromTab(tab) {
  if (!tab?.id) return { jobUrl: tab?.url || '' };
  try {
    const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return result[0]?.result || { jobUrl: tab.url || '' };
  } catch {
    return { jobUrl: tab.url || '' };
  }
}

function currentCaptureIdentity(locationOverride) {
  return {
    company: captured.company || '',
    jobTitle: captured.jobTitle || '',
    location: locationOverride ?? captured.location ?? '',
    jobUrl: captured.jobUrl || '',
    source: captured.source || '',
    externalJobId: String(captured.externalJobId || ''),
  };
}

/**
 * `force` is used only by the save-time gate: it always calls the API for the
 * exact final identity. The "Warn on duplicates" preference only silences the
 * proactive capture-time check/warning; it never skips save-time verification.
 */
async function runDuplicateCheck(identityOverride, { force = false } = {}) {
  const identity = identityOverride || currentCaptureIdentity();
  if (!force) {
    if (!capturePreferences.warnOnDuplicates) {
      duplicateInfo = { level: 'none', match: null };
      return duplicateInfo;
    }
    if (!identity.jobUrl && !identity.company) {
      duplicateInfo = { level: 'none', match: null };
      return duplicateInfo;
    }
  }
  const currentContextSeq = captureRequestSeq;
  const { checkSeq } = onDuplicateCheckStart(duplicateState);
  const result = await checkDuplicate(settings.instanceUrl, settings.apiToken, identity);
  const outcome = onDuplicateCheckResult(duplicateState, currentContextSeq, checkSeq, identity, result, currentCaptureIdentity());
  if (!outcome.ignored) {
    duplicateInfo = duplicateState.info;
  }
  return duplicateInfo;
}

function scheduleDuplicateCheck(onDone) {
  window.clearTimeout(duplicateTimer);
  duplicateTimer = window.setTimeout(async () => {
    await runDuplicateCheck();
    onDone?.();
  }, 350);
}

async function loadWorkflow() {
  select('pref-default-stage').replaceChildren(new Option("Use JobQuest's default", ''));
  try {
    workflow = await getWorkflow(settings.instanceUrl, settings.apiToken);
    workflowReady = (workflow.stages || []).length > 0;
    for (const stage of workflow.stages || []) {
      select('pref-default-stage').append(new Option(stage.label, stage.id));
    }
    select('pref-default-stage').value = capturePreferences.defaultStage || '';
  } catch {
    workflow = { stages: [], default_action: '' };
    workflowReady = false;
  }
}

async function loadResumes() {
  const resumeSelect = select('edit-resume');
  if (!resumeSelect) return;
  resumeSelect.replaceChildren(new Option('None selected', ''));
  try {
    resumes = await getActiveResumes(settings.instanceUrl, settings.apiToken);
    for (const resume of resumes) {
      const option = new Option(
        `${resume.name} · ${resume.version_label}${resume.target_role ? ` (${resume.target_role})` : ''}`,
        resume.id,
      );
      option.dataset.version = resume.version_label;
      resumeSelect.append(option);
    }
  } catch {
    resumes = [];
  }
}

function setResumeMode(mode) {
  const existingGroup = byId('sidepanel-group-resume-existing');
  if (existingGroup) existingGroup.hidden = mode !== 'existing';
  const manualGroup = byId('sidepanel-group-resume-manual');
  if (manualGroup) manualGroup.hidden = mode !== 'manual';
  if (mode !== 'existing') {
    const resSelect = select('edit-resume');
    if (resSelect) resSelect.value = '';
  }
  if (mode !== 'manual') {
    const resManual = input('edit-resume-manual');
    if (resManual) resManual.value = '';
  }
}

function populateEditFields(data = {}) {
  const comp = input('edit-company');
  if (comp) comp.value = data.company || '';
  const tit = input('edit-title');
  if (tit) tit.value = data.jobTitle || '';
  const loc = input('edit-location');
  if (loc) loc.value = data.location || '';
  const arr = select('edit-arrangement');
  if (arr) arr.value = data.workArrangement || '';
  const emp = select('edit-employment');
  if (emp) emp.value = data.employmentType || '';
  const sal = input('edit-salary');
  if (sal) sal.value = data.salaryRange || '';
  const url = input('edit-url');
  if (url) url.value = data.jobUrl || '';
  const src = input('edit-source');
  if (src) src.value = data.source || '';
  const dat = input('edit-date');
  if (dat) dat.value = new Date().toISOString().slice(0, 10);
  const nts = /** @type {HTMLTextAreaElement | null} */ (byId('edit-notes'));
  if (nts) nts.value = data.notes || '';

  const existingRadio = /** @type {HTMLInputElement | null} */ (byId('sidepanel-mode-resume-manual'));
  if (existingRadio) existingRadio.checked = true;
  setResumeMode('manual');
  const resSelect = select('edit-resume');
  if (resSelect) resSelect.value = '';
  const resManual = input('edit-resume-manual');
  if (resManual) resManual.value = '';
}

function setEditDetailsExpanded(expanded) {
  const section = byId('edit-fields-section');
  const btn = byId('edit-toggle-btn');
  if (section) section.hidden = !expanded;
  if (btn) btn.setAttribute('aria-expanded', String(expanded));
}

function updateEditToggleTitle(extractionScreen) {
  const title = byId('edit-toggle-title');
  if (!title) return;
  if (extractionScreen === 'partial') {
    title.textContent = 'Complete missing details';
  } else {
    title.textContent = 'Review & edit details';
  }
}

function renderEditDetails(screen) {
  const card = byId('edit-details-card');
  if (!card) return;
  card.hidden = screen === 'offline' || screen === 'none';
  if (card.hidden) return;

  const extractionScreen = classifyExtraction(captured);
  updateEditToggleTitle(extractionScreen);

  const isEditing = byId('edit-fields-section')?.contains(document.activeElement);
  if (!userManuallyToggledDetails && !isEditing) {
    if (screen === 'partial') {
      setEditDetailsExpanded(true);
    } else {
      setEditDetailsExpanded(false);
    }
  }
}

function flattenMasterRecord(record) {
  if (!record || record.schema_version !== "1.1") return record;
  return {
    ...record,
    jobTitle: record.job?.title || "",
    company: record.company?.name || "",
    location: record.location?.text || "",
    workArrangement: record.location?.work_arrangement || "",
    employmentType: record.employment?.type || "",
    salaryMin: record.compensation?.min,
    salaryMax: record.compensation?.max,
    salaryRange: record.compensation?.range_text || "",
    jobUrl: record.source?.url || "",
    source: record.source?.platform || "",
    externalJobId: record.source?.external_id || "",
    notes: record.notes || ""
  };
}

/** Runs the full real capture pipeline for a given tab: extraction, duplicate
 * check, then renders the resolved Capture screen. */
async function runCaptureFlow(tab, { showScanning = true } = {}) {
  const seq = ++captureRequestSeq;
  window.clearTimeout(duplicateTimer);
  duplicateTimer = 0;
  duplicateState = initDuplicateContext(seq);
  duplicateInfo = duplicateState.info;
  userManuallyToggledDetails = false;
  if (showScanning && currentCaptureScreen !== 'none' && currentCaptureScreen !== 'offline') {
    byId('scan-indicator').hidden = false;
  }
  const extractedRaw = await extractFromTab(tab);
  if (seq !== captureRequestSeq) return; // superseded by a newer tab-change request
  captured = flattenMasterRecord(extractedRaw);
  populateEditFields(captured);
  const extractionScreen = classifyExtraction(captured);
  if (extractionScreen === 'none') {
    duplicateInfo = { level: 'none', match: null };
  } else {
    await runDuplicateCheck();
    if (seq !== captureRequestSeq) return; // superseded again, mid duplicate-check
  }
  byId('scan-indicator').hidden = true;
  renderCapture(resolveCaptureScreen(extractionScreen, duplicateInfo.level));
}

// ---------------------------------------------------------------------------
// Capture tab — rendering
// ---------------------------------------------------------------------------

const CHIP_FIELDS = [
  { key: 'location', label: (v) => v },
  { key: 'employmentType', label: (v) => v },
  { key: 'workArrangement', label: (v) => v },
];

function renderChips() {
  const row = byId('job-chips');
  row.replaceChildren();
  for (const { key } of CHIP_FIELDS) {
    const value = captured[key];
    const chip = document.createElement('span');
    chip.className = value ? 'chip' : 'chip missing';
    chip.textContent = value || `Missing ${key === 'workArrangement' ? 'arrangement' : key === 'employmentType' ? 'type' : key}`;
    row.append(chip);
  }
}

function renderCompleteness() {
  const { percent, present, missing } = computeCaptureCompleteness(captured);
  byId('completeness-fill').style.width = `${percent}%`;
  const bar = byId('completeness-bar');
  bar.setAttribute('aria-valuenow', String(percent));
  byId('completeness-card').dataset.warning = String(currentCaptureScreen === 'partial');
  byId('completeness-title').textContent = currentCaptureScreen === 'partial' ? `Some information needs review · ${percent}%` : `Captured data · ${percent}%`;
  const list = byId('completeness-list');
  list.replaceChildren();
  for (const field of present) {
    const li = document.createElement('li');
    li.className = 'present';
    li.textContent = field;
    list.append(li);
  }
  byId('completeness-missing').textContent = missing.length ? `Not found: ${missing.join(', ')}` : '';
}

function matchDescription(match) {
  const app = match?.application || {};
  return [app.company_name, app.role_title, app.stage, app.applied_at ? new Date(app.applied_at).toLocaleDateString() : ''].filter(Boolean).join(' · ');
}

const DUPLICATE_COPY = {
  strong: { title: 'Strong duplicate: you already track this posting', why: 'Why matched: same job URL and requisition ID. Duplicates cannot be saved.', pill: 'STRONG' },
  probable: { title: 'Probable duplicate: same company and role', why: 'Why matched: same company and role. Duplicates cannot be saved. Edit the details if this is a different job.', pill: 'PROBABLE' },
  saved: { title: 'Already in your Saved list', why: 'Why matched: same job URL, already saved.', pill: 'SAVED' },
  error: { title: "Couldn't check for duplicates", why: "Saving is blocked until the check succeeds. Click Save to retry.", pill: 'ERROR' },
};

function renderDuplicateCard() {
  const card = byId('duplicate-card');
  const level = duplicateInfo.level;
  const show = ['strong', 'probable', 'saved', 'error'].includes(level);
  card.hidden = !show;
  if (!show) return;
  card.dataset.level = level;
  const copy = DUPLICATE_COPY[level];
  byId('dup-title').textContent = copy.title;
  byId('dup-why').textContent = copy.why;
  byId('dup-level-pill').textContent = copy.pill;
  byId('dup-saved-hint').hidden = level !== 'saved';
  const matchCard = byId('dup-match-card');
  matchCard.hidden = level === 'error';
  if (level !== 'error') {
    byId('dup-match-title').textContent = duplicateInfo.match?.application?.role_title || duplicateInfo.match?.application?.company_name || '';
    byId('dup-match-meta').textContent = matchDescription(duplicateInfo.match);
  }
}

function renderPossibleCard() {
  const show = currentCaptureScreen === 'possible';
  byId('possible-card').hidden = !show;
  if (show) byId('possible-text').textContent = `Why: other roles at ${captured.company || 'this company'}.`;
}

function renderStageControl() {
  const stages = workflow.stages || [];
  const label = byId('stage-btn-label');
  if (!workflowReady) {
    label.textContent = 'Stages unavailable';
    return;
  }
  if (!selectedStageId) selectedStageId = capturePreferences.defaultStage || workflow.default_action || stages[0]?.id || '';
  const stage = stages.find((item) => item.id === selectedStageId);
  label.textContent = stage?.label || 'Select stage';
  const pipsEl = byId('stage-pips');
  pipsEl.replaceChildren();
  const filled = stagePipCount(selectedStageId, workflow);
  for (let i = 0; i < 8; i += 1) {
    const pip = document.createElement('span');
    pip.className = i < filled ? 'pip filled' : 'pip';
    pipsEl.append(pip);
  }
}

function populateStageListbox() {
  const listbox = byId('stage-listbox');
  listbox.replaceChildren();
  for (const stage of workflow.stages || []) {
    const option = document.createElement('li');
    option.setAttribute('role', 'option');
    option.tabIndex = -1;
    option.textContent = stage.label;
    option.dataset.stageId = stage.id;
    option.setAttribute('aria-selected', String(stage.id === selectedStageId));
    listbox.append(option);
  }
}

function closeStageListbox() {
  byId('stage-listbox').hidden = true;
  byId('stage-btn').setAttribute('aria-expanded', 'false');
}

function openStageListbox() {
  populateStageListbox();
  byId('stage-listbox').hidden = false;
  byId('stage-btn').setAttribute('aria-expanded', 'true');
  const options = /** @type {HTMLElement[]} */ (Array.from(byId('stage-listbox').querySelectorAll('[role="option"]')));
  const selectedOption = options.find((el) => el.dataset.stageId === selectedStageId);
  (selectedOption || options[0])?.focus();
}

function renderFooter() {
  const primary = button('footer-primary');

  if (currentCaptureScreen === 'saved') {
    primary.textContent = 'View Application';
    primary.disabled = false;
    primary.onclick = () => {
      if (createdPath) chrome.tabs.create({ url: buildSecureJobQuestUrl(settings.instanceUrl, createdPath) });
    };
    return;
  }

  if (currentCaptureScreen === 'duplicate') {
    const level = duplicateInfo.level;
    if (level === 'saved') {
      primary.textContent = 'Open in JobQuest';
      primary.disabled = false;
      primary.onclick = () => openDuplicateMatch();
      return;
    }
    primary.textContent = 'View Existing Application';
    primary.disabled = false;
    primary.onclick = () => openDuplicateMatch();
    return;
  }

  // detected / possible / partial
  primary.textContent = 'Save to JobQuest';
  primary.disabled = !workflowReady;
  primary.onclick = () => void save();
}

function openDuplicateMatch() {
  const path = duplicateInfo.match?.deep_link_path;
  if (path) chrome.tabs.create({ url: buildSecureJobQuestUrl(settings.instanceUrl, path) });
}

function renderCapture(screen) {
  currentCaptureScreen = screen;
  byId('capture-offline').hidden = screen !== 'offline';
  byId('capture-none').hidden = screen !== 'none';
  byId('capture-main').hidden = screen === 'offline' || screen === 'none';

  if (screen === 'none') {
    byId('none-page-url').textContent = currentActiveTab?.url || '';
  }

  if (screen !== 'offline' && screen !== 'none') {
    byId('job-avatar').textContent = firstLetter(captured.company);
    byId('job-title').textContent = captured.jobTitle || 'Untitled role';
    byId('job-company').textContent = captured.company || 'Unknown company';
    renderChips();
    byId('job-source-name').textContent = captured.source || 'this page';
    byId('job-source-url').textContent = captured.jobUrl || '';
    renderCompleteness();
    renderEditDetails(screen);
    renderPossibleCard();
    renderDuplicateCard();
    byId('saved-card').hidden = screen !== 'saved';
    byId('saveas-card').hidden = screen === 'duplicate' && duplicateInfo.level === 'saved';
    renderStageControl();
  }

  byId('capture-footer').hidden = !['detected', 'possible', 'partial', 'duplicate', 'saved'].includes(screen);
  if (!byId('capture-footer').hidden) renderFooter();
  setPanelState('CAPTURE', screen);
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

/** The save currently in flight, or null when idle. A second save() is ignored
 * only while this one is still bound to the live capture context; once the
 * context/identity has moved on the old save is dead and cannot block a new one. */
let activeSave = null;

async function save() {
  if (!workflowReady) return;
  if (activeSave?.isCurrent()) return;
  // Snapshot immutable save context token (B2-R)
  const saveSeq = captureRequestSeq;
  const saveTabId = currentActiveTab?.id ?? null;
  /** @type {() => boolean} */
  let isCurrent = () => saveSeq === captureRequestSeq;
  const thisSave = { isCurrent: () => isCurrent() };
  activeSave = thisSave;
  const primary = button('footer-primary');
  primary.disabled = true;
  const originalLabel = primary.textContent;
  primary.textContent = 'Saving…';

  try {
    const company = input('edit-company')?.value?.trim() || captured.company || '';
    const jobTitle = input('edit-title')?.value?.trim() || captured.jobTitle || '';
    if (!company || !jobTitle) {
      setEditDetailsExpanded(true);
      const banner = byId('capture-banner');
      banner.hidden = false;
      banner.className = 'banner warning';
      banner.textContent = 'Company and Job Title are required.';
      primary.disabled = false;
      primary.textContent = originalLabel;
      return;
    }

    const location = input('edit-location')?.value?.trim() || captured.location || '';
    const workArrangement = select('edit-arrangement')?.value || captured.workArrangement || '';
    const employmentType = select('edit-employment')?.value || captured.employmentType || '';
    const salaryStr = input('edit-salary')?.value?.trim() || captured.salaryRange || '';
    const salary = parseSalaryRange(salaryStr, captured.salaryMin, captured.salaryMax);
    const jobUrl = input('edit-url')?.value?.trim() || captured.jobUrl || '';
    const source = input('edit-source')?.value?.trim() || captured.source || '';
    const appliedAtDate = input('edit-date')?.value || new Date().toISOString().slice(0, 10);
    const notes = /** @type {HTMLTextAreaElement | null} */ (byId('edit-notes'))?.value?.trim() || captured.notes || '';

    const saveIdentity = {
      company,
      jobTitle,
      location,
      jobUrl,
      source,
      externalJobId: String(captured.externalJobId || ''),
    };

    // Cancel pending duplicate timer so it cannot fire after save begins
    window.clearTimeout(duplicateTimer);
    duplicateTimer = 0;

    const saveIdentityKey = computeDuplicateIdentityKey(saveIdentity);
    const getSaveContext = () => ({ contextSeq: saveSeq, tabId: saveTabId, identityKey: saveIdentityKey });
    const getCurrentContext = () => ({
      contextSeq: captureRequestSeq,
      tabId: currentActiveTab?.id ?? null,
      identityKey: computeDuplicateIdentityKey(currentCaptureIdentity(location)),
    });
    isCurrent = () => isSaveContextValid(getSaveContext(), getCurrentContext());

    // Save-time duplicate defense (fail closed): a fresh verification for the
    // exact final identity always runs, regardless of the debounce timer or the
    // "Warn on duplicates" preference. Only a current clean verdict may write.
    const gateResult = await evaluateSaveGate({
      duplicateState,
      saveIdentity,
      runDuplicateCheck: async (id) => {
        await runDuplicateCheck(id, { force: true });
      },
      isContextCurrent: isCurrent,
    });

    if (!isCurrent()) {
      return;
    }

    if (!gateResult.canProceed) {
      if (gateResult.reason === 'BLOCKED_DUPLICATE') {
        currentCaptureScreen = 'duplicate';
        renderCapture('duplicate');
        primary.disabled = false;
        return;
      }
      const banner = byId('capture-banner');
      banner.hidden = false;
      banner.className = 'banner warning';
      banner.textContent = 'Could not verify duplicate status. Nothing was saved. Please retry.';
      // The failed check is now cached as level "error"; surface it on the card.
      renderDuplicateCard();
      primary.disabled = false;
      primary.textContent = originalLabel;
      return;
    }

    // Resume selection
    const resumeMode = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="sidepanel-resume-mode"]:checked'))?.value || 'existing';
    const resumeSelect = select('edit-resume');
    const resumeManualInput = input('edit-resume-manual');
    const selectedResume = resumeSelect?.selectedOptions?.[0];
    const resumeId = resumeMode === 'existing' && resumeSelect?.value ? resumeSelect.value : null;
    const resumeLabel = resumeMode === 'manual' ? resumeManualInput?.value?.trim() || null : (selectedResume?.dataset?.version || null);

    const saveAs = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="save-as"]:checked'))?.value;
    const stageId = selectedStageId || saveAsToStageId(saveAs === 'applied' ? 'applied' : 'later', workflow);

    const draft = buildCaptureDraft({
      captured,
      company,
      jobTitle,
      stageId,
      jobUrl,
      source,
      location,
      workArrangement,
      employmentType,
      salary,
      notes,
      appliedAtDate,
      resumeId,
      resumeLabel,
    });
    const result = await createCapture(settings.instanceUrl, settings.apiToken, draft);

    // After write: verify context before mutating UI (B2-R)
    if (!isCurrent()) {
      return;
    }

    createdPath = result.deep_link_path;
    byId('saved-meta').textContent = `Stage: ${workflow.stages?.find((s) => s.id === stageId)?.label || stageId} · ${formatTimestamp()}`;
    // Reset duplicate state on save completion (context already verified above)
    duplicateState = initDuplicateContext(captureRequestSeq);
    duplicateInfo = duplicateState.info;
    renderCapture('saved');
    showToast('Saved to JobQuest');
  } catch (error) {
    if (!isCurrent()) return;
    const banner = byId('capture-banner');
    banner.hidden = false;
    banner.className = `banner ${isConnectionError(error) ? 'error' : 'warning'}`;
    banner.textContent = error instanceof Error ? error.message : 'Could not save this application.';
  } finally {
    if (activeSave === thisSave) activeSave = null;
    if (isCurrent()) {
      primary.disabled = !workflowReady;
      if (primary.textContent === 'Saving…') primary.textContent = originalLabel;
    }
  }
}

let toastTimer = 0;
function showToast(message) {
  const toast = byId('toast');
  toast.textContent = `✓ ${message}`;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 5500);
}

// ---------------------------------------------------------------------------
// Dashboard / Analytics (GET /ext/v1/stats, fetched once and cached — see
// module state above). Both tabs render from the same cached `stats` object;
// switching tabs never re-fetches. `overdue_tasks` (not `overdue_follow_ups`)
// backs Dashboard's single "Task overdue" row: `overdue_follow_ups` would
// double-count against the "Follow-ups" row right above it, while
// `overdue_tasks` is the general overdue signal the design's one combined
// row calls for.
// ---------------------------------------------------------------------------

async function ensureStatsLoaded() {
  if (stats || statsLoading) return;
  statsLoading = true;
  statsError = null;
  renderDashboard();
  renderAnalytics();
  try {
    stats = await getStats(settings.instanceUrl, settings.apiToken);
  } catch (error) {
    statsError = mapConnectionError(error);
  } finally {
    statsLoading = false;
  }
  renderDashboard();
  renderAnalytics();
}

async function refreshStats() {
  stats = null;
  statsError = null;
  await ensureStatsLoaded();
}

function renderPipelineRows(containerId, rows) {
  const container = byId(containerId);
  container.replaceChildren();
  for (const row of rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'pipeline-row';

    const label = document.createElement('span');
    label.className = 'pipeline-label';
    label.textContent = row.label;

    const track = document.createElement('div');
    track.className = 'progress-track pipeline-track';
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', String(row.percent));
    track.setAttribute('aria-label', `${row.label}: ${row.count} application${row.count === 1 ? '' : 's'}`);
    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = `${row.percent}%`;
    track.append(fill);

    const count = document.createElement('span');
    count.className = 'pipeline-count';
    count.textContent = String(row.count);

    rowEl.append(label, track, count);
    container.append(rowEl);
  }
}

/** Shared Weekly Goal rendering for Dashboard (with remainder line) and
 *  Analytics (compact, no remainder line). Renders an honest "no goal set"
 *  state rather than fabricating numbers when `active_goal` is null. */
function renderGoalCard(prefix, statsData, { showRemainder }) {
  const goal = statsData.active_goal;
  const card = byId(`${prefix}-goal-card`);
  const pctEl = byId(`${prefix}-goal-pct`);
  const lineEl = byId(`${prefix}-goal-line`);
  const bar = byId(`${prefix}-goal-bar`);
  const fill = byId(`${prefix}-goal-fill`);
  const remainderEl = showRemainder ? byId(`${prefix}-goal-remainder`) : null;

  if (card) card.dataset.empty = String(!goal);

  if (!goal) {
    pctEl.textContent = '';
    lineEl.textContent = 'No weekly goal set';
    bar.setAttribute('aria-valuenow', '0');
    fill.style.width = '0%';
    if (remainderEl) remainderEl.textContent = '';
    return;
  }

  const pct = clampPercent(goal.progress_pct);
  pctEl.textContent = `${pct}%`;
  lineEl.textContent = `${formatStatValue(statsData.applications_this_week)} / ${formatStatValue(goal.target_applications)} Applications`;
  bar.setAttribute('aria-valuenow', String(pct));
  fill.style.width = `${pct}%`;

  if (remainderEl) {
    const remainder = computeGoalRemainder(goal, statsData.applications_this_week);
    remainderEl.textContent = remainder === null
      ? ''
      : remainder > 0
        ? `${remainder} more to reach this week's goal`
        : 'Goal reached!';
  }
}

function buildUpcomingRow(label, valueText, { danger = false } = {}) {
  const row = document.createElement('div');
  row.className = 'upcoming-row';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.className = danger ? 'badge danger' : 'badge';
  if (danger) {
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⚠ ';
    valueEl.append(icon);
  }
  valueEl.append(document.createTextNode(valueText));

  row.append(labelEl, valueEl);
  return row;
}

function renderUpcomingRows(statsData) {
  const container = byId('dash-upcoming');
  container.replaceChildren();
  container.append(buildUpcomingRow('Interviews', formatStatValue(statsData.upcoming_interviews)));
  container.append(buildUpcomingRow('Follow-ups', formatStatValue(statsData.follow_ups_due)));
  const overdue = statsData.overdue_tasks;
  container.append(buildUpcomingRow('Task overdue', formatStatValue(overdue), { danger: Number(overdue) > 0 }));
}

function renderDashboardBody(statsData) {
  byId('dash-today').textContent = formatStatValue(statsData.applications_today);
  byId('dash-yesterday').textContent = formatStatValue(statsData.applications_yesterday);
  renderGoalCard('dash', statsData, { showRemainder: true });
  renderPipelineRows('dash-pipeline', mapPipelineForDisplay(statsData.pipeline, DASHBOARD_PIPELINE_STAGES));
  renderUpcomingRows(statsData);
}

function renderDashboard() {
  const loading = statsLoading && !stats;
  const failed = Boolean(statsError) && !stats;
  byId('dash-loading').hidden = !loading;
  byId('dash-error').hidden = !failed;
  byId('dash-body').hidden = !stats;
  if (failed) byId('dash-error-message').textContent = statsError.message;
  if (stats) renderDashboardBody(stats);
}

function renderActivityGrid(statsData) {
  const container = byId('analytics-activity');
  container.replaceChildren();
  const items = [
    { label: 'Today', value: statsData.applications_today },
    { label: 'Yesterday', value: statsData.applications_yesterday },
    { label: 'This week', value: statsData.applications_this_week },
    { label: 'Last week', value: statsData.applications_last_week },
  ];
  for (const item of items) {
    const cell = document.createElement('div');
    cell.className = 'metric-card';
    const value = document.createElement('p');
    value.className = 'metric-value';
    value.textContent = formatStatValue(item.value);
    const label = document.createElement('p');
    label.className = 'metric-label';
    label.textContent = item.label;
    cell.append(value, label);
    container.append(cell);
  }
}

function renderAnalyticsBody(statsData) {
  renderActivityGrid(statsData);
  renderGoalCard('analytics', statsData, { showRemainder: false });
  // Last 7 Days is intentionally omitted: /ext/v1/stats has no daily
  // breakdown array, only aggregate counts, and the design map explicitly
  // forbids rendering fake per-day bars for an unsupported metric.
  renderPipelineRows('analytics-pipeline', mapPipelineForDisplay(statsData.pipeline, null));
}

function renderAnalytics() {
  const loading = statsLoading && !stats;
  const failed = Boolean(statsError) && !stats;
  byId('analytics-loading').hidden = !loading;
  byId('analytics-error').hidden = !failed;
  byId('analytics-body').hidden = !stats;
  if (failed) byId('analytics-error-message').textContent = statsError.message;
  if (stats) renderAnalyticsBody(stats);
}

function setupDashboardAnalytics() {
  button('dash-retry-btn').addEventListener('click', () => void refreshStats());
  button('analytics-retry-btn').addEventListener('click', () => void refreshStats());
  button('dash-open-full').addEventListener('click', () => {
    if (settings.instanceUrl) chrome.tabs.create({ url: buildSecureJobQuestUrl(settings.instanceUrl, '/dashboard') });
  });
}

// ---------------------------------------------------------------------------
// Stage listbox + save-as wiring
// ---------------------------------------------------------------------------

function setupStageControl() {
  const btn = byId('stage-btn');
  const listbox = byId('stage-listbox');
  btn.addEventListener('click', () => {
    if (listbox.hidden) openStageListbox(); else closeStageListbox();
  });
  listbox.addEventListener('keydown', (event) => {
    const key = /** @type {KeyboardEvent} */ (event).key;
    if (key === 'Escape') { closeStageListbox(); btn.focus(); return; }
    const options = /** @type {HTMLElement[]} */ (Array.from(listbox.querySelectorAll('[role="option"]')));
    const currentIndex = options.findIndex((el) => el === document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault();
      const nextIndex = nextRovingIndex(Math.max(currentIndex, 0), options.length, /** @type {any} */ (key));
      options[nextIndex]?.focus();
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      /** @type {HTMLElement} */ (document.activeElement)?.click();
    }
  });
  listbox.addEventListener('click', (event) => {
    const option = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[role="option"]'));
    if (!option) return;
    selectedStageId = option.dataset.stageId || '';
    for (const radio of Array.from(document.querySelectorAll('input[name="save-as"]'))) /** @type {HTMLInputElement} */ (radio).checked = false;
    renderStageControl();
    closeStageListbox();
    btn.focus();
    renderFooter();
  });
  document.addEventListener('click', (event) => {
    if (!listbox.hidden && !listbox.contains(/** @type {Node} */ (event.target)) && event.target !== btn) closeStageListbox();
  });

  for (const id of ['save-as-later', 'save-as-applied']) {
    input(id).addEventListener('change', () => {
      const saveAs = input('save-as-applied').checked ? 'applied' : 'later';
      selectedStageId = saveAsToStageId(saveAs, workflow);
      renderStageControl();
    });
  }
}

// ---------------------------------------------------------------------------
// Review & Edit inline inputs → live card update, completeness, duplicate check
// ---------------------------------------------------------------------------

function setupEditInputs() {
  byId('edit-toggle-btn')?.addEventListener('click', () => {
    const section = byId('edit-fields-section');
    userManuallyToggledDetails = true;
    setEditDetailsExpanded(Boolean(section?.hidden));
  });

  const onIdentityInput = (key, inputEl) => {
    if (!inputEl) return;
    captured[key] = inputEl.value;
    if (key === 'company') {
      byId('job-company').textContent = captured.company || 'Unknown company';
      byId('job-avatar').textContent = firstLetter(captured.company);
    } else if (key === 'jobTitle') {
      byId('job-title').textContent = captured.jobTitle || 'Untitled role';
    } else if (key === 'jobUrl') {
      byId('job-source-url').textContent = captured.jobUrl || '';
    } else if (key === 'source') {
      byId('job-source-name').textContent = captured.source || 'this page';
    }
    renderChips();
    renderCompleteness();

    // Invalidate previous duplicate evaluation & override immediately (B2)
    onIdentityChange(duplicateState, currentCaptureIdentity());
    duplicateInfo = duplicateState.info;
    renderDuplicateCard();

    const extractionScreen = classifyExtraction(captured);
    updateEditToggleTitle(extractionScreen);

    // Recompute provisional capture screen and footer
    const provisionalScreen = resolveCaptureScreen(extractionScreen, duplicateInfo.level);
    currentCaptureScreen = provisionalScreen;
    renderFooter();

    scheduleDuplicateCheck(() => {
      const finalExtraction = classifyExtraction(captured);
      const resolvedScreen = resolveCaptureScreen(finalExtraction, duplicateInfo.level);
      currentCaptureScreen = resolvedScreen;
      renderDuplicateCard();
      renderFooter();
      updateEditToggleTitle(finalExtraction);
    });
  };

  input('edit-company')?.addEventListener('input', () => onIdentityInput('company', input('edit-company')));
  input('edit-title')?.addEventListener('input', () => onIdentityInput('jobTitle', input('edit-title')));
  input('edit-location')?.addEventListener('input', () => onIdentityInput('location', input('edit-location')));
  input('edit-url')?.addEventListener('input', () => onIdentityInput('jobUrl', input('edit-url')));
  input('edit-source')?.addEventListener('input', () => onIdentityInput('source', input('edit-source')));

  select('edit-arrangement')?.addEventListener('change', () => {
    captured.workArrangement = select('edit-arrangement').value;
    renderChips();
    renderCompleteness();
  });

  select('edit-employment')?.addEventListener('change', () => {
    captured.employmentType = select('edit-employment').value;
    renderChips();
    renderCompleteness();
  });

  input('edit-salary')?.addEventListener('input', () => {
    captured.salaryRange = input('edit-salary').value;
    renderCompleteness();
  });

  byId('edit-notes')?.addEventListener('input', () => {
    captured.notes = /** @type {HTMLTextAreaElement} */ (byId('edit-notes')).value;
  });

  for (const radio of Array.from(document.querySelectorAll('input[name="sidepanel-resume-mode"]'))) {
    radio.addEventListener('change', () => {
      setResumeMode(/** @type {HTMLInputElement} */ (radio).value);
    });
  }
}

// ---------------------------------------------------------------------------
// None / offline state actions
// ---------------------------------------------------------------------------

function setupCaptureFallbackActions() {
  button('none-retry').addEventListener('click', () => { if (currentActiveTab) void runCaptureFlow(currentActiveTab); });
  button('none-capture-btn').addEventListener('click', () => {
    const url = input('none-paste-url').value.trim();
    if (url) {
      captured = { ...captured, jobUrl: url, source: captured.source || 'Manual entry' };
      populateEditFields(captured);
      onIdentityChange(duplicateState, currentCaptureIdentity());
      scheduleDuplicateCheck(() => {
        const extraction = classifyExtraction(captured);
        const screen = resolveCaptureScreen(extraction, duplicateInfo.level);
        currentCaptureScreen = screen;
        renderDuplicateCard();
        renderFooter();
      });
    }
    userManuallyToggledDetails = false;
    renderCapture(resolveCaptureScreen(classifyExtraction(captured), duplicateInfo.level));
  });

  button('footer-copy-json').addEventListener('click', async () => {
    try {
      if (!currentActiveTab) {
        showToast('No active tab to capture');
        return;
      }
      
      showToast('Rescanning current job...');
      const freshRaw = await extractFromTab(currentActiveTab);
      const freshCapture = flattenMasterRecord(freshRaw);
      
      const cCompany = input('edit-company').value.trim();
      const cJobTitle = input('edit-title').value.trim();
      const cLoc = input('edit-location').value.trim();
      const cArr = select('edit-arrangement').value;
      const cEmp = select('edit-employment').value;
      const cSal = input('edit-salary').value.trim();
      const cUrl = input('edit-url').value.trim();
      const cSrc = input('edit-source').value.trim();
      const cNotes = /** @type {HTMLTextAreaElement | null} */ (byId('edit-notes'))?.value?.trim();
      
      // Update the flat fields for any legacy logic
      freshCapture.company = cCompany || freshCapture.company;
      freshCapture.jobTitle = cJobTitle || freshCapture.jobTitle;
      freshCapture.location = cLoc || freshCapture.location;
      freshCapture.workArrangement = cArr || freshCapture.workArrangement;
      freshCapture.employmentType = cEmp || freshCapture.employmentType;
      freshCapture.salaryRange = cSal || freshCapture.salaryRange;
      freshCapture.jobUrl = cUrl || freshCapture.jobUrl;
      freshCapture.source = cSrc || freshCapture.source;
      freshCapture.notes = cNotes || freshCapture.notes;
      
      // Sync overrides into the nested master record fields to ensure 1.1 structure honors user edits
      if (freshCapture.schema_version === "1.1") {
        if (cJobTitle) freshCapture.job.title = cJobTitle;
        if (cCompany) freshCapture.company.name = cCompany;
        if (cLoc) freshCapture.location.text = cLoc;
        if (cArr) freshCapture.location.work_arrangement = cArr;
        if (cEmp) freshCapture.employment.type = cEmp;
        if (cSal) freshCapture.compensation.range_text = cSal;
        if (cUrl) freshCapture.source.url = cUrl;
        if (cSrc) freshCapture.source.platform = cSrc;
        if (cNotes) freshCapture.notes = cNotes;
      }
      
      const json = generateAIJobJson(freshCapture);
      await navigator.clipboard.writeText(json);
      showToast('AI JSON copied to clipboard');
    } catch(e) {
      console.error(e);
      showToast('Error generating AI JSON');
    }
  });

  button('offline-retry').addEventListener('click', () => void initialize());
  button('offline-open-settings').addEventListener('click', () => { viewBeforeSettings = 'capture'; void openSettings(); });
}

// ---------------------------------------------------------------------------
// Active-tab tracking (the core new Side Panel behavior)
// ---------------------------------------------------------------------------

function isCaptureScreenVisible() {
  return currentView === 'capture';
}

async function handleTabChange(tab) {
  if (!tab || !connectionOnline) { currentActiveTab = tab || currentActiveTab; return; }
  // A tab can become active (chrome.tabs.onActivated) while chrome.tabs.get()
  // still reports it mid-navigation (status "loading") even though its `url`
  // has already flipped to the destination — this is a genuine, distinct race
  // from the overlapping-runCaptureFlow one above: if currentActiveTab were
  // updated to this not-yet-settled tab now, the eventual, real "complete"
  // onUpdated event for the SAME url would then look like a no-op tab change
  // (same url as currentActiveTab) and the rescan it should trigger would be
  // silently lost forever. Leave currentActiveTab untouched and wait for that
  // later "complete" event instead.
  if (tab.status && tab.status !== 'complete') return;
  if (!shouldRescanForTabChange(currentActiveTab, tab)) { currentActiveTab = tab; return; }
  currentActiveTab = tab;
  if (!capturePreferences.autoDetectJobPages) return;
  if (isCaptureScreenVisible()) {
    await runCaptureFlow(tab);
  } else {
    capturePanelStale = true;
  }
}

let tabListenersRegistered = false;

function registerTabListeners() {
  if (tabListenersRegistered) return;
  tabListenersRegistered = true;
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs.get(tabId).then((tab) => void handleTabChange(tab)).catch(() => {});
  });
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (!tab.active) return;
    if (changeInfo.status !== 'complete') return;
    void handleTabChange(tab);
  });
}

// ---------------------------------------------------------------------------
// Settings screen
// ---------------------------------------------------------------------------

function settingsStatus(message, kind = '') {
  const box = byId('settings-status');
  box.textContent = message;
  box.className = `banner ${kind}`.trim();
  box.hidden = !message;
}

function settingsEffectiveToken() {
  const typed = input('settings-token').value.trim();
  return typed || settings.apiToken || '';
}

function renderSettingsConnection() {
  input('settings-instance-url').value = settings.instanceUrl;
  input('settings-token').value = '';
  input('settings-token').placeholder = settings.apiToken ? `${maskToken(settings.apiToken)} — paste a new token to replace it` : 'Paste your jqx_dev_ or jqx_live_ token';
  byId('settings-token-hint').textContent = settings.apiToken ? 'A token is stored on this browser.' : 'No token stored yet.';
  byId('settings-environment').textContent = describeEnvironment(settings.instanceUrl);
  const dot = byId('settings-conn-dot');
  dot.style.background = connectionOnline ? 'var(--ok)' : 'var(--er)';
  byId('settings-conn-text').textContent = connectionOnline ? 'Connected to JobQuest' : (lastConnectionError?.message || 'Not connected');
  byId('settings-account-text').textContent = workspace ? `Signed in as @${workspace.username || workspace.name || 'you'}` : 'Not connected.';
  byId('settings-version').textContent = chrome.runtime.getManifest().version;
  byId('settings-api-dot').style.background = connectionOnline ? 'var(--ok)' : 'var(--er)';
  byId('settings-api-status').textContent = connectionOnline ? 'API reachable' : (lastConnectionError?.message || 'Unknown');
}

function renderCapturePreferencesUI() {
  input('pref-warn-duplicates').checked = capturePreferences.warnOnDuplicates;
  input('pref-auto-detect').checked = capturePreferences.autoDetectJobPages;
  input('pref-open-capture').checked = capturePreferences.openCaptureOnDetect;
  select('pref-default-stage').value = capturePreferences.defaultStage || '';
}

async function openSettings() {
  renderSettingsConnection();
  renderCapturePreferencesUI();
  select('settings-theme').value = settings.theme;
  showView('settings');
}

function setupSettingsScreen() {
  button('settings-save-btn').addEventListener('click', async () => {
    settingsStatus('Saving…');
    try {
      const saved = await saveSettings({ instanceUrl: input('settings-instance-url').value, apiToken: settingsEffectiveToken(), theme: settings.theme });
      settings = saved;
      settingsStatus('Saved. Testing connection…');
      const me = await testConnection(saved.instanceUrl, saved.apiToken);
      workspace = me.workspace;
      connectionOnline = true;
      lastConnectionError = null;
      settingsStatus('Saved. Connected — JobQuest accepted this token.', 'success');
      renderSettingsConnection();
      renderHeader();
      await loadWorkflow();
    } catch (error) {
      const mapped = mapConnectionError(error);
      settingsStatus(mapped.state === 'INVALID_INPUT' ? mapped.message : `Saved, but the connection test failed: ${mapped.message}`, 'error');
      lastConnectionError = mapped;
      connectionOnline = false;
      renderHeader();
    }
  });

  button('settings-test-btn').addEventListener('click', async () => {
    settingsStatus('Testing connection…');
    try {
      const token = settingsEffectiveToken();
      if (!token) throw new Error('Enter a token to test, or save one first.');
      await testConnection(input('settings-instance-url').value, token);
      settingsStatus('Connection successful.', 'success');
    } catch (error) {
      settingsStatus(mapConnectionError(error).message, 'error');
    }
  });

  button('settings-open-jobquest').addEventListener('click', () => {
    if (settings.instanceUrl) chrome.tabs.create({ url: buildSecureJobQuestUrl(settings.instanceUrl, '/') });
  });

  select('settings-theme').addEventListener('change', () => {
    void saveTheme(select('settings-theme').value).then((theme) => { settings.theme = theme; applyTheme(theme); });
  });

  for (const id of ['pref-warn-duplicates', 'pref-auto-detect', 'pref-open-capture']) {
    byId(id).addEventListener('change', () => void persistCapturePreferences());
  }
  select('pref-default-stage').addEventListener('change', () => void persistCapturePreferences());

  button('settings-diagnostics-btn').addEventListener('click', async () => {
    byId('settings-diagnostics-result').textContent = 'Running diagnostics…';
    try {
      await testConnection(settings.instanceUrl, settings.apiToken);
      connectionOnline = true;
      lastConnectionError = null;
      byId('settings-diagnostics-result').textContent = 'Diagnostics passed — JobQuest is reachable.';
    } catch (error) {
      connectionOnline = false;
      lastConnectionError = mapConnectionError(error);
      byId('settings-diagnostics-result').textContent = `Diagnostics failed: ${lastConnectionError.message}`;
    }
    renderSettingsConnection();
    renderHeader();
  });

  button('settings-disconnect-btn').addEventListener('click', async () => {
    if (!window.confirm('Disconnect this browser from JobQuest? You will need to reconnect with a token to capture again.')) return;
    await clearSettings();
    settings = { instanceUrl: '', apiToken: '', theme: settings.theme };
    workspace = null;
    connectionOnline = false;
    lastConnectionError = null;
    renderHeader();
    showView('setup');
    renderSetup();
  });
}

async function persistCapturePreferences() {
  capturePreferences = await saveCapturePreferences({
    defaultStage: select('pref-default-stage').value,
    warnOnDuplicates: input('pref-warn-duplicates').checked,
    autoDetectJobPages: input('pref-auto-detect').checked,
    openCaptureOnDetect: input('pref-open-capture').checked,
  });
}

// ---------------------------------------------------------------------------
// Setup (first-run) screen
// ---------------------------------------------------------------------------

function setupStatus(message, kind = '') {
  const box = byId('setup-status');
  box.textContent = message;
  box.className = `banner ${kind}`.trim();
  box.hidden = !message;
}

function renderSetup() {
  input('setup-instance-url').value = settings.instanceUrl;
  select('setup-environment').value = describeEnvironment(settings.instanceUrl) === 'Production' ? 'production' : 'preview';
  button('setup-save-btn').disabled = true;
  setupStatus('');
}

function setupSetupScreen() {
  const evaluate = () => {
    const hasUrl = input('setup-instance-url').value.trim().length > 0;
    const hasToken = input('setup-token').value.trim().length > 0;
    button('setup-save-btn').disabled = !(hasUrl && hasToken);
  };
  input('setup-instance-url').addEventListener('input', evaluate);
  input('setup-token').addEventListener('input', evaluate);

  button('setup-save-btn').addEventListener('click', async () => {
    setupStatus('Connecting…', 'info');
    try {
      const saved = await saveSettings({ instanceUrl: input('setup-instance-url').value, apiToken: input('setup-token').value, theme: settings.theme });
      settings = saved;
      const me = await testConnection(saved.instanceUrl, saved.apiToken);
      workspace = me.workspace;
      connectionOnline = true;
      lastConnectionError = null;
      setupStatus('Connected.', 'success');
      await loadWorkflow();
      renderHeader();
      showView('capture');
      const tab = await refreshActiveTabRef();
      currentActiveTab = tab;
      if (tab) await runCaptureFlow(tab, { showScanning: false });
      registerTabListeners();
    } catch (error) {
      const mapped = mapConnectionError(error);
      setupStatus(mapped.message, mapped.state === 'INVALID_INPUT' ? 'error' : 'warning');
    }
  });

  button('setup-test-btn').addEventListener('click', async () => {
    setupStatus('Testing connection…', 'info');
    try {
      const token = input('setup-token').value.trim();
      if (!token) throw new Error('Enter a token to test.');
      await testConnection(input('setup-instance-url').value, token);
      setupStatus('Connection successful.', 'success');
    } catch (error) {
      setupStatus(mapConnectionError(error).message, 'error');
    }
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function refreshActiveTabRef() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function initialize() {
  setPanelState('LOADING');
  // Register chrome.tabs listeners FIRST, before any of the awaits below
  // (settings/connection/workflow/initial-extraction — all real network
  // round trips). chrome.tabs.onActivated/onUpdated are fire-and-forget:
  // Chrome never replays an event to a listener added after it fired. If
  // registration waited until the end of initialize() (as it used to), a
  // fast enough tab switch during that startup window fires and is lost
  // forever, with no later event to ever trigger the correct re-scan.
  // Registering up front is safe even before settings/connection are ready:
  // handleTabChange's own `!connectionOnline` guard is a no-op until this
  // function marks the panel online below.
  registerTabListeners();
  settings = await getSettings();
  capturePreferences = await getCapturePreferences();
  applyTheme(settings.theme);

  const configured = Boolean(settings.instanceUrl && settings.apiToken);
  if (!configured) {
    renderHeader();
    renderSetup();
    showView('setup');
    return;
  }

  try {
    const me = await testConnection(settings.instanceUrl, settings.apiToken);
    workspace = me.workspace;
    connectionOnline = true;
    lastConnectionError = null;
  } catch (error) {
    connectionOnline = false;
    lastConnectionError = mapConnectionError(error);
    renderHeader();
    const screen = classifyConnectionScreen({ configured, connectionError: lastConnectionError });
    if (screen === 'setup') {
      renderSetup();
      showView('setup');
    } else {
      showView('capture');
      renderCapture('offline');
    }
    return;
  }

  renderHeader();
  await Promise.allSettled([loadWorkflow(), loadResumes()]);
  // Fetch Capture's real state up front regardless of which tab shows first,
  // so it's never stale when the user does switch to it (see the design
  // map's "Interaction rules" note on not showing stale Job A data for Job B).
  const tab = await refreshActiveTabRef();
  currentActiveTab = tab;
  if (tab) await runCaptureFlow(tab, { showScanning: false });
  // "Open Capture tab when a job is detected" — when off, land on Dashboard
  // instead (Capture's data is still ready in the background per above).
  // Only apply default initial landing if user hasn't already navigated to another tab.
  if (currentView === 'capture') {
    showView(capturePreferences.openCaptureOnDetect ? 'capture' : 'dashboard');
  }
}

setupTabBar();
setupStageControl();
setupEditInputs();
setupCaptureFallbackActions();
setupDashboardAnalytics();
setupSettingsScreen();
setupSetupScreen();

void initialize().catch((error) => {
  setPanelState('ERROR', error instanceof Error ? error.message : 'Initialization error');
});


