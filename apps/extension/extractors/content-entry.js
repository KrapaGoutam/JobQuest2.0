import { extractJobPosting } from './index.js';
// @ts-expect-error: window object extension
window.__jobquest_last_extracted = extractJobPosting(document, window.location.href);
// @ts-expect-error: window object extension
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
window.__jobquest_last_extracted;