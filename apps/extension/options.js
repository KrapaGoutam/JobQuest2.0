// @ts-check
import { getSettings, saveSettings, saveTheme, testConnection } from './api/jobquest.js';

const form = document.getElementById('options-form');
const instanceInput = /** @type {HTMLInputElement} */ (document.getElementById('instance-url'));
const tokenInput = /** @type {HTMLInputElement} */ (document.getElementById('api-token'));
const themeInput = /** @type {HTMLSelectElement} */ (document.getElementById('theme'));
const saveButton = /** @type {HTMLButtonElement} */ (document.getElementById('save-btn'));
const testButton = /** @type {HTMLButtonElement} */ (document.getElementById('test-btn'));
const statusBox = /** @type {HTMLElement} */ (document.getElementById('status-box'));

function status(message, kind = '') {
  statusBox.textContent = message;
  statusBox.className = `status-box ${kind}`.trim();
}

async function values() {
  return { instanceUrl: instanceInput.value, apiToken: tokenInput.value, theme: themeInput.value };
}

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

async function presetInstanceUrl() {
  try {
    const response = await fetch(chrome.runtime.getURL('instance-preset.json'));
    if (!response.ok) return '';
    const preset = await response.json();
    return typeof preset.instanceUrl === 'string' ? preset.instanceUrl : '';
  } catch {
    return '';
  }
}

async function load() {
  const settings = await getSettings();
  instanceInput.value = settings.instanceUrl || await presetInstanceUrl();
  tokenInput.value = settings.apiToken;
  themeInput.value = settings.theme;
  applyTheme(settings.theme);
  if (settings.instanceUrl && settings.apiToken) status('Connection settings are stored locally in this browser.', 'success');
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveButton.disabled = true;
  status('Saving…');
  try {
    const settings = await saveSettings(await values());
    await testConnection(settings.instanceUrl, settings.apiToken);
    status('Connected. JobQuest accepted this token.', 'success');
  } catch (error) {
    status(error instanceof Error ? error.message : 'Could not save settings.', 'error');
  } finally {
    saveButton.disabled = false;
  }
});

testButton.addEventListener('click', async () => {
  testButton.disabled = true;
  status('Testing connection…');
  try {
    const settings = await values();
    await testConnection(settings.instanceUrl, settings.apiToken);
    status('Connection successful.', 'success');
  } catch (error) {
    status(error instanceof Error ? error.message : 'Connection failed.', 'error');
  } finally {
    testButton.disabled = false;
  }
});

themeInput.addEventListener('change', () => {
  void saveTheme(themeInput.value).then(applyTheme);
});

void load();
