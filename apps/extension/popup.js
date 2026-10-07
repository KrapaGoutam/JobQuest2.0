// @ts-check
import {
  buildSecureJobQuestUrl,
  checkDuplicate,
  createCapture,
  getActiveResumes,
  getSettings,
  getWorkflow,
  isConnectionError,
  parseSalaryRange,
  testConnection,
  flattenMasterRecord,
} from './api/jobquest.js';

const byId = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id));
const select = (id) => /** @type {HTMLSelectElement} */ (document.getElementById(id));
const button = (id) => /** @type {HTMLButtonElement} */ (document.getElementById(id));

const screens = ['screen-loading', 'screen-unconfigured', 'screen-capture', 'screen-success'].map(byId);
const stateOutput = byId('popup-state');
const statusBanner = byId('state-banner');
const statusText = byId('state-message');
const retryButton = button('state-retry-btn');
const duplicateBanner = byId('dup-banner');
const duplicateHeading = byId('dup-heading');
const duplicateMessage = byId('dup-message');
const duplicateActions = byId('dup-actions');
const duplicateOpen = button('dup-open-btn');
const duplicateCancel = button('dup-cancel-btn');
const formError = byId('form-error');
const saveButton = button('save-btn');
const resumeExisting = input('mode-resume-existing');
const resumeManual = input('mode-resume-manual');
const resumeNone = input('mode-resume-none');
const resumeSelect = select('input-resume');
const resumeManualInput = input('input-resume-manual');

let settings = { instanceUrl: '', apiToken: '', theme: 'system' };
let captured = {};
let workspace = null;
let createdPath = '';
let currentMatch = null;
let workflowReady = false;
let duplicateTimer = 0;

function setState(code, screen, message = '') {
  document.body.dataset.state = code;
  stateOutput.textContent = `${code}${message ? `: ${message}` : ''}`;
  for (const item of screens) item.hidden = item.id !== screen;
}

function showStatus(message, kind = 'info', retry = false) {
  statusText.textContent = message;
  statusBanner.className = `banner ${kind}`;
  statusBanner.hidden = false;
  retryButton.hidden = !retry;
}

function clearStatus() {
  statusBanner.hidden = true;
  retryButton.hidden = true;
  statusText.textContent = '';
}

function clearDuplicate() {
  duplicateBanner.hidden = true;
  duplicateBanner.className = 'banner warning';
  duplicateHeading.textContent = '';
  duplicateMessage.textContent = '';
  duplicateActions.hidden = true;
  duplicateOpen.hidden = true;
  duplicateCancel.hidden = true;
  currentMatch = null;
}

function currentCaptureIdentity() {
  return {
    company: input('input-company').value.trim(),
    jobTitle: input('input-title').value.trim(),
    location: input('input-location').value.trim(),
    jobUrl: input('input-url').value.trim(),
    source: input('input-source').value.trim(),
    externalJobId: String(captured.externalJobId || ''),
  };
}

function matchDescription(match) {
  const app = match?.application || {};
  return [app.company_name, app.role_title, app.stage, app.applied_at ? new Date(app.applied_at).toLocaleDateString() : ''].filter(Boolean).join(' · ');
}

function renderDuplicate(result) {
  clearDuplicate();
  const type = result.match_type;
  if (type === 'NONE') return;
  duplicateBanner.hidden = false;
  duplicateActions.hidden = false;
  currentMatch = result.matches?.[0] || null;
  if (type === 'CHECK_ERROR') {
    setState('X13', 'screen-capture', 'Duplicate check failed');
    duplicateBanner.className = 'banner danger';
    duplicateHeading.textContent = "Couldn't check for duplicates";
    duplicateMessage.textContent = "Saving is blocked until the check succeeds. Retry.";
    duplicateCancel.hidden = false;
    return;
  }
  if (type === 'EXACT_POSTING' && currentMatch?.application?.stage === 'SAVED') {
    setState('X12', 'screen-capture', 'Already saved');
    duplicateBanner.className = 'banner info';
    duplicateHeading.textContent = 'Already in your Saved list';
    duplicateMessage.textContent = matchDescription(currentMatch);
    duplicateOpen.textContent = 'Open in JobQuest';
    duplicateOpen.hidden = false;
    duplicateCancel.hidden = false;
    return;
  }
  if (type === 'EXACT_POSTING') {
    setState('X9', 'screen-capture', 'Strong duplicate');
    duplicateBanner.className = 'banner danger';
    duplicateHeading.textContent = 'Strong duplicate: you already track this posting';
    duplicateMessage.textContent = matchDescription(currentMatch);
    duplicateOpen.hidden = false; duplicateCancel.hidden = false;
  } else if (type === 'SAME_ROLE') {
    setState('X10', 'screen-capture', 'Probable duplicate');
    duplicateHeading.textContent = 'Probable duplicate: same company and role';
    duplicateMessage.textContent = matchDescription(currentMatch);
    duplicateOpen.hidden = false; duplicateCancel.hidden = false;
  } else if (type === 'COMPANY_ONLY') {
    setState('X11', 'screen-capture', 'Possible duplicate');
    duplicateBanner.className = 'banner info';
    duplicateHeading.textContent = 'Possible: you have other applications at this company';
    duplicateMessage.textContent = result.matches.map(matchDescription).filter(Boolean).join(' | ');
    duplicateActions.hidden = true;
  }
}

async function runDuplicateCheck() {
  const identity = currentCaptureIdentity();
  if (!identity.jobUrl && !identity.company) { clearDuplicate(); return; }
  renderDuplicate(await checkDuplicate(settings.instanceUrl, settings.apiToken, identity));
}

function scheduleDuplicateCheck() {
  window.clearTimeout(duplicateTimer);
  duplicateTimer = window.setTimeout(() => void runDuplicateCheck(), 350);
}

function setResumeMode(mode) {
  byId('group-resume-existing').hidden = mode !== 'existing';
  byId('group-resume-manual').hidden = mode !== 'manual';
  if (mode !== 'existing') resumeSelect.value = '';
  if (mode !== 'manual') resumeManualInput.value = '';
}

async function loadWorkflowAndDocuments() {
  const [workflowResult, documentResult] = await Promise.allSettled([
    getWorkflow(settings.instanceUrl, settings.apiToken),
    getActiveResumes(settings.instanceUrl, settings.apiToken),
  ]);
  select('input-stage').replaceChildren();
  if (workflowResult.status === 'rejected') {
    workflowReady = false;
    saveButton.disabled = true;
    setState('X14', 'screen-capture', 'Workflow load failed');
    showStatus("Couldn't load your stages. Saving is paused so the extension never submits an invalid stage.", 'warning', true);
  } else {
    const workflow = workflowResult.value;
    for (const stage of workflow.stages || []) {
      const option = document.createElement('option');
      option.value = stage.id;
      option.textContent = stage.label;
      option.selected = stage.id === workflow.default_action;
      select('input-stage').append(option);
    }
    workflowReady = select('input-stage').options.length > 0;
    saveButton.disabled = !workflowReady;
  }
  resumeSelect.replaceChildren(new Option('None selected', ''));
  if (documentResult.status === 'fulfilled') {
    for (const resume of documentResult.value) {
      const option = new Option(`${resume.name} · ${resume.version_label}${resume.target_role ? ` (${resume.target_role})` : ''}`, resume.id);
      option.dataset.version = resume.version_label;
      resumeSelect.append(option);
    }
  }
}

async function extractActivePage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { jobUrl: tab?.url || '' };
  try {
    const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return flattenMasterRecord(result[0]?.result) || { jobUrl: tab.url || '' };
  } catch {
    return { jobUrl: tab.url || '' };
  }
}

function populateForm(value) {
  input('input-company').value = value.company || '';
  input('input-title').value = value.jobTitle || '';
  input('input-location').value = value.location || '';
  select('input-arrangement').value = value.workArrangement || '';
  select('input-employment').value = value.employmentType || '';
  input('input-salary').value = value.salaryRange || '';
  input('input-url').value = value.jobUrl || '';
  input('input-source').value = value.source || '';
  input('input-date').value = new Date().toISOString().slice(0, 10);
}

function readyStateCode() {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  return settings.theme === 'dark' || (settings.theme === 'system' && prefersDark) ? 'X5' : 'X4';
}

async function initialize() {
  setState('LOADING', 'screen-loading', 'Extracting job details');
  clearStatus(); clearDuplicate();
  formError.hidden = true;
  settings = await getSettings();
  if (settings.theme === 'light' || settings.theme === 'dark') document.documentElement.dataset.theme = settings.theme;
  else delete document.documentElement.dataset.theme;
  if (!settings.instanceUrl || !settings.apiToken) {
    byId('unconfigured-title').textContent = 'Not connected';
    byId('unconfigured-desc').textContent = 'Create a browser token in JobQuest Settings, then paste it into extension settings.';
    setState('X1', 'screen-unconfigured', 'Not connected');
    return;
  }
  try {
    const me = await testConnection(settings.instanceUrl, settings.apiToken);
    workspace = me.workspace;
  } catch (error) {
    if (isConnectionError(error)) {
      byId('unconfigured-title').textContent = 'Connection expired or revoked';
      byId('unconfigured-desc').textContent = 'Nothing was saved. Reconnect with a new token from JobQuest Settings.';
      setState('X2', 'screen-unconfigured', 'Connection expired or revoked');
    } else {
      byId('unconfigured-title').textContent = "Can't reach JobQuest";
      byId('unconfigured-desc').textContent = 'Check your connection and try again. Captured data stays in this browser.';
      setState('X3', 'screen-unconfigured', 'API unavailable or offline');
    }
    return;
  }
  const pending = (await chrome.storage.local.get(['pendingCapture'])).pendingCapture;
  captured = pending || await extractActivePage();
  clearDuplicate();
  populateForm(captured);
  setState(captured.company && captured.jobTitle ? readyStateCode() : captured.company || captured.jobTitle ? 'X6' : 'X7', 'screen-capture');
  if (!captured.company && !captured.jobTitle) showStatus("No job posting found. Enter the company and role manually, or open JobQuest.", 'warning');
  else if (!captured.company || !captured.jobTitle) showStatus("Some details weren't found. Check the highlighted fields before saving.", 'warning');
  else showStatus(`Detected from ${captured.source || 'this page'} · ${captured.confidence || 'page data'}`, 'info');
  await loadWorkflowAndDocuments();
  if (workflowReady) await runDuplicateCheck();
}

async function save(event) {
  event.preventDefault();
  const company = input('input-company').value.trim();
  const title = input('input-title').value.trim();
  if (!company || !title || !workflowReady) {
    formError.textContent = !workflowReady ? 'Canonical workflow is unavailable. Retry before saving.' : 'Company and job title are required.';
    formError.hidden = false;
    return;
  }
  const resumeMode = resumeManual.checked ? 'manual' : resumeNone.checked ? 'none' : 'existing';
  const selectedResume = resumeSelect.selectedOptions[0];
  // Fail closed: a fresh duplicate verdict for the exact final identity is
  // required. Known duplicates and failed checks never write.
  saveButton.disabled = true;
  const verdict = await checkDuplicate(settings.instanceUrl, settings.apiToken, currentCaptureIdentity());
  if (verdict.match_type !== 'NONE' && verdict.match_type !== 'COMPANY_ONLY') {
    renderDuplicate(verdict);
    formError.textContent = verdict.match_type === 'CHECK_ERROR'
      ? 'Could not verify duplicate status. Nothing was saved. Retry.'
      : 'This looks like a duplicate. Duplicates cannot be saved.';
    formError.hidden = false;
    saveButton.disabled = !workflowReady;
    return;
  }
  const salary = parseSalaryRange(input('input-salary').value, captured.salaryMin, captured.salaryMax);
  const draft = {
    company,
    job_title: title,
    stage: select('input-stage').value,
    job_url: input('input-url').value.trim() || null,
    source: input('input-source').value.trim() || null,
    external_job_id: captured.externalJobId || null,
    location: input('input-location').value.trim() || null,
    work_arrangement: select('input-arrangement').value || null,
    employment_type: select('input-employment').value || null,
    salary_min: salary.min,
    salary_max: salary.max,
    salary_currency: captured.salaryCurrency || 'USD',
    duplicate_override: false, // deprecated compatibility field; duplicates are never saved
    notes: input('input-notes').value.trim() || null,
    applied_at: `${input('input-date').value}T12:00:00.000Z`,
    snapshot: {
      description: captured.description || null,
      requirements: captured.requirements || null,
      skills: captured.skills || null,
      raw_payload: { extraction_confidence: captured.confidence || null, salary_range: input('input-salary').value || null },
    },
    resume_id: resumeMode === 'existing' && resumeSelect.value ? resumeSelect.value : null,
    resume_label: resumeMode === 'manual' ? resumeManualInput.value.trim() || null : selectedResume?.dataset.version || null,
  };
  await chrome.storage.local.set({ pendingCapture: { ...captured, ...currentCaptureIdentity() } });
  saveButton.disabled = true;
  formError.hidden = true;
  try {
    const result = await createCapture(settings.instanceUrl, settings.apiToken, draft);
    createdPath = result.deep_link_path;
    await chrome.storage.local.remove(['pendingCapture']);
    byId('success-summary').textContent = `Saved ${title} at ${company} to ${workspace?.name || 'JobQuest'}.`;
    setState('X8', 'screen-success', 'Capture success');
  } catch (error) {
    formError.textContent = error instanceof Error ? error.message : 'Could not save this application.';
    formError.hidden = false;
    setState(isConnectionError(error) ? 'X2' : 'X3', 'screen-capture', isConnectionError(error) ? 'Connection expired' : 'API unavailable');
  } finally {
    saveButton.disabled = !workflowReady;
  }
}

document.getElementById('capture-form')?.addEventListener('submit', (event) => void save(event));
for (const id of ['input-company', 'input-title', 'input-location', 'input-url', 'input-source']) input(id).addEventListener('input', scheduleDuplicateCheck);
for (const item of [resumeExisting, resumeManual, resumeNone]) item.addEventListener('change', () => setResumeMode(resumeManual.checked ? 'manual' : resumeNone.checked ? 'none' : 'existing'));
button('options-btn').addEventListener('click', () => chrome.runtime.openOptionsPage());
button('open-settings-btn').addEventListener('click', () => chrome.runtime.openOptionsPage());
retryButton.addEventListener('click', () => void initialize());
duplicateCancel.addEventListener('click', () => {
  clearDuplicate();
});
duplicateOpen.addEventListener('click', () => {
  if (currentMatch?.deep_link_path) chrome.tabs.create({ url: buildSecureJobQuestUrl(settings.instanceUrl, currentMatch.deep_link_path) });
});
button('view-app-btn').addEventListener('click', () => {
  if (createdPath) chrome.tabs.create({ url: buildSecureJobQuestUrl(settings.instanceUrl, createdPath) });
});
button('capture-another-btn').addEventListener('click', () => {
  void initialize();
});

void initialize().catch((error) => {
  byId('unconfigured-title').textContent = 'Initialization error';
  byId('unconfigured-desc').textContent = error instanceof Error ? error.message : 'Could not start JobQuest Capture.';
  setState('X3', 'screen-unconfigured', 'Initialization error');
});
