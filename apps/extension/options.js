// @ts-check
import { getSettings, saveSettings, saveTheme, testConnection, maskToken, mapConnectionError } from './api/jobquest.js';

const form = document.getElementById('options-form');
const instanceInput = /** @type {HTMLInputElement} */ (document.getElementById('instance-url'));
const tokenInput = /** @type {HTMLInputElement} */ (document.getElementById('api-token'));
const themeInput = /** @type {HTMLSelectElement} */ (document.getElementById('theme'));
const saveButton = /** @type {HTMLButtonElement} */ (document.getElementById('save-btn'));
const testButton = /** @type {HTMLButtonElement} */ (document.getElementById('test-btn'));
const statusBox = /** @type {HTMLElement} */ (document.getElementById('status-box'));

/** @type {{ instanceUrl: string, apiToken: string, theme: string } | null} */
let storedSettings = null;

function status(message, kind = '') {
  statusBox.textContent = message;
  statusBox.className = `status-box ${kind}`.trim();
}

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

/** The token to act on: whatever was freshly typed, or the already-stored
 *  token if the field was left blank (so re-testing/re-saving the URL or
 *  theme doesn't force re-pasting an unchanged token). */
function effectiveToken() {
  const typed = tokenInput.value.trim();
  return typed || storedSettings?.apiToken || '';
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

/** Never populate the token field with the real secret. Show a masked
 *  placeholder for an already-configured token, and only require a fresh
 *  paste for first-time setup. */
function showStoredTokenState() {
  tokenInput.value = '';
  if (storedSettings?.apiToken) {
    tokenInput.required = false;
    tokenInput.placeholder = `${maskToken(storedSettings.apiToken)} — paste a new token to replace it`;
  } else {
    tokenInput.required = true;
    tokenInput.placeholder = 'Paste your jqx_dev_ or jqx_live_ token';
  }
}

async function load() {
  storedSettings = await getSettings();
  instanceInput.value = storedSettings.instanceUrl || await presetInstanceUrl();
  themeInput.value = storedSettings.theme;
  applyTheme(storedSettings.theme);
  showStoredTokenState();
  if (storedSettings.instanceUrl && storedSettings.apiToken) {
    status('Connection settings are stored locally in this browser.', 'success');
  }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveButton.disabled = true;
  status('Saving…');
  try {
    const saved = await saveSettings({ instanceUrl: instanceInput.value, apiToken: effectiveToken(), theme: themeInput.value });
    storedSettings = saved;
    showStoredTokenState();
    status('Saved. Testing connection…');
    await testConnection(saved.instanceUrl, saved.apiToken);
    status('Saved. Connected — JobQuest accepted this token.', 'success');
  } catch (error) {
    const mapped = mapConnectionError(error);
    if (mapped.state === 'INVALID_INPUT') {
      status(mapped.message, 'error');
    } else {
      status(`Saved, but the connection test failed: ${mapped.message}`, 'error');
    }
  } finally {
    saveButton.disabled = false;
  }
});

testButton.addEventListener('click', async () => {
  testButton.disabled = true;
  status('Testing connection…');
  try {
    const token = effectiveToken();
    if (!token) throw new Error('Enter a token to test, or save one first.');
    await testConnection(instanceInput.value, token);
    status('Connection successful.', 'success');
  } catch (error) {
    status(mapConnectionError(error).message, 'error');
  } finally {
    testButton.disabled = false;
  }
});

themeInput.addEventListener('change', () => {
  void saveTheme(themeInput.value).then(applyTheme);
});

void load();
