// @ts-check

/** @typedef {'system' | 'light' | 'dark'} ExtensionTheme */
/** @typedef {{ instanceUrl: string, apiToken: string, theme: ExtensionTheme }} ExtensionSettings */

export function normalizeInstanceUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  // A colon followed by digits is a host port (for example localhost:5173),
  // while other explicit schemes must be an approved HTTP(S) URL.
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(raw) && !/^https?:\/\//i.test(raw)) {
    throw new Error('JobQuest URL must use http: or https:');
  }
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  const url = new URL(withProtocol);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('JobQuest URL must use http: or https:');
  return url.origin;
}

export function buildSecureJobQuestUrl(instanceUrl, pathAndQuery = '/') {
  const base = normalizeInstanceUrl(instanceUrl);
  if (!base) throw new Error('JobQuest is not configured');
  const path = String(pathAndQuery || '/');
  if (path.startsWith('//')) throw new Error('Navigation must stay within the JobQuest origin boundary');
  const target = new URL(path.startsWith('?') || path.startsWith('#') ? `/${path}` : path, `${base}/`);
  if (target.origin !== base) throw new Error('Navigation must stay within the JobQuest origin boundary');
  return target.toString();
}

export async function getSettings() {
  const stored = await chrome.storage.local.get(['instanceUrl', 'apiToken', 'theme']);
  const instanceUrl = typeof stored.instanceUrl === 'string' ? stored.instanceUrl : '';
  const apiToken = typeof stored.apiToken === 'string' ? stored.apiToken : '';
  const theme = stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : 'system';
  return { instanceUrl, apiToken, theme };
}

export async function saveSettings(settings) {
  const normalized = normalizeInstanceUrl(settings.instanceUrl);
  const token = String(settings.apiToken || '').trim();
  const theme = ['light', 'dark'].includes(settings.theme) ? settings.theme : 'system';
  if (!normalized || !/^jqx_(?:dev|live)_[A-Za-z0-9]{43}$/.test(token)) {
    throw new Error('Enter a valid JobQuest URL and extension token');
  }
  await chrome.storage.local.set({ instanceUrl: normalized, apiToken: token, theme });
  return { instanceUrl: normalized, apiToken: token, theme };
}

export async function saveTheme(theme) {
  const value = ['light', 'dark'].includes(theme) ? theme : 'system';
  await chrome.storage.local.set({ theme: value });
  return value;
}

export async function clearSettings() {
  await chrome.storage.local.remove(['instanceUrl', 'apiToken', 'pendingCapture']);
}

export class JobQuestApiError extends Error {
  constructor(message, status, code = 'REQUEST_FAILED') {
    super(message);
    this.name = 'JobQuestApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(instanceUrl, apiToken, path, init = {}) {
  const base = normalizeInstanceUrl(instanceUrl);
  if (!base || !apiToken) throw new JobQuestApiError('JobQuest is not connected', 401, 'NOT_CONNECTED');
  const response = await fetch(`${base}/api/ext/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new JobQuestApiError(
      payload?.error?.message || `JobQuest request failed (${response.status})`,
      response.status,
      payload?.error?.code,
    );
  }
  return payload;
}

export const testConnection = (instanceUrl, apiToken) => request(instanceUrl, apiToken, '/me');
export const getWorkflow = (instanceUrl, apiToken) => request(instanceUrl, apiToken, '/workflow');
export async function getActiveResumes(instanceUrl, apiToken) {
  const payload = await request(instanceUrl, apiToken, '/documents?kind=resume');
  return payload.documents || [];
}

export async function checkDuplicate(instanceUrl, apiToken, capture) {
  try {
    return await request(instanceUrl, apiToken, '/duplicates/check', {
      method: 'POST',
      body: JSON.stringify({
        job_url: capture.jobUrl || '',
        external_job_id: capture.externalJobId || '',
        source: capture.source || '',
        company: capture.company || '',
        job_title: capture.jobTitle || '',
        location: capture.location || '',
      }),
    });
  } catch (error) {
    return {
      match_type: 'CHECK_ERROR',
      has_duplicate: false,
      matches: [],
      error: error instanceof Error ? error.message : 'Could not check for duplicates',
    };
  }
}

export const createCapture = (instanceUrl, apiToken, capture) => request(instanceUrl, apiToken, '/captures', {
  method: 'POST', body: JSON.stringify(capture),
});

export function isConnectionError(error) {
  return error instanceof JobQuestApiError && error.status === 401;
}
