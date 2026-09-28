import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));

describe('Manifest V3 package security', () => {
  it('uses the reviewed MV3 entry points and minimum declared APIs', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions.toSorted()).toEqual(['activeTab', 'scripting', 'storage']);
    expect(manifest.permissions).not.toContain('tabs');
    expect(manifest.action.default_popup).toBe('popup.html');
    expect(manifest.background).toEqual({ service_worker: 'background.js' });
  });

  it('keeps the reviewed job-page/API host access explicit', () => {
    expect(manifest.host_permissions).toEqual(['<all_urls>']);
    expect(manifest).not.toHaveProperty('content_scripts');
    expect(manifest).not.toHaveProperty('web_accessible_resources');
  });

  it('uses a strict extension-page CSP with no remote or evaluated code', () => {
    expect(manifest.content_security_policy.extension_pages).toBe("script-src 'self'; object-src 'self'");
    expect(manifest.content_security_policy.extension_pages).not.toMatch(/unsafe-eval|https?:/);
    for (const page of ['popup.html', 'options.html']) {
      expect(readFileSync(new URL(page, root), 'utf8')).not.toMatch(/<script[^>]+src=["']https?:/i);
    }
  });

  it('ships a complete parseable content script without tool truncation markers', () => {
    const content = readFileSync(new URL('content.js', root), 'utf8');
    expect(content).not.toContain('tokens truncated');
    expect(() => new Function(content)).not.toThrow();
  });
});
