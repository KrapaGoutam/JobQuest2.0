import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));

describe('Manifest V3 package security', () => {
  it('uses the reviewed MV3 entry points and minimum declared APIs', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions.toSorted()).toEqual(['activeTab', 'scripting', 'sidePanel', 'storage']);
    // Side Panel needs no extra host access: chrome.tabs.onActivated/onUpdated
    // fire without the "tabs" permission, and host_permissions: <all_urls>
    // already keeps tab URLs unscrubbed for every site.
    expect(manifest.permissions).not.toContain('tabs');
    expect(manifest.background).toEqual({ service_worker: 'background.js' });
  });

  it('makes the Side Panel the primary UI: no default_popup, side_panel wired to sidepanel.html', () => {
    expect(manifest.action).not.toHaveProperty('default_popup');
    expect(manifest.action.default_icon).toBeTruthy();
    expect(manifest.side_panel).toEqual({ default_path: 'sidepanel.html' });
  });

  it('keeps the reviewed job-page/API host access explicit', () => {
    expect(manifest.host_permissions).toEqual(['<all_urls>']);
    expect(manifest).not.toHaveProperty('content_scripts');
    expect(manifest).not.toHaveProperty('web_accessible_resources');
  });

  it('uses a strict extension-page CSP with no remote or evaluated code', () => {
    expect(manifest.content_security_policy.extension_pages).toBe("script-src 'self'; object-src 'self'");
    expect(manifest.content_security_policy.extension_pages).not.toMatch(/unsafe-eval|https?:/);
    for (const page of ['popup.html', 'options.html', 'sidepanel.html']) {
      expect(readFileSync(new URL(page, root), 'utf8')).not.toMatch(/<script[^>]+src=["']https?:/i);
    }
  });

  it('ships a complete parseable content script without tool truncation markers', () => {
    const content = readFileSync(new URL('content.js', root), 'utf8');
    expect(content).not.toContain('tokens truncated');
    expect(() => new Function(content)).not.toThrow();
  });

  it('packages clean production release without legacy popup assets, but retains them for dev/test', () => {
    const packageScript = readFileSync(new URL('scripts/package.mjs', root), 'utf8');
    expect(packageScript).toContain("...(mode === 'dev' ? ['popup.html', 'popup.css', 'popup.js'] : [])");
  });

  it('built prod package (directory AND zip) contains no legacy popup assets; manifest never references them', () => {
    const cwd = fileURLToPath(root);
    execFileSync(process.execPath, ['scripts/package.mjs', 'prod'], { cwd });
    const prodDir = new URL('dist/jobquest-capture-prod/', root);
    for (const name of ['popup.html', 'popup.css', 'popup.js']) {
      expect(existsSync(new URL(name, prodDir)), `prod dir must not contain ${name}`).toBe(false);
    }
    const zipEntries = Object.keys(unzipSync(new Uint8Array(readFileSync(new URL('dist/jobquest-capture-prod.zip', root)))));
    expect(zipEntries.filter((entry) => /(^|\/)popup\./.test(entry))).toEqual([]);
    expect(zipEntries).toContain('sidepanel.js');
    const builtManifest = readFileSync(new URL('manifest.json', prodDir), 'utf8');
    expect(builtManifest).not.toMatch(/popup/i);
    // No supported build artifact may carry an override control or a true override payload.
    for (const entry of ['sidepanel.js', 'sidepanel-logic.js', 'sidepanel.html']) {
      const built = readFileSync(new URL(entry, prodDir), 'utf8');
      expect(built, entry).not.toMatch(/Save as New Application Anyway|authorizeDuplicateOverride|overrideKey/);
      expect(built, entry).not.toMatch(/duplicate_override\s*:\s*(?!false|\s)/);
    }
  });

  it('built dev package keeps popup assets only for regression testing and its popup has no override control', () => {
    execFileSync(process.execPath, ['scripts/package.mjs', 'dev'], { cwd: fileURLToPath(root) });
    const devDir = new URL('dist/jobquest-capture-dev/', root);
    expect(existsSync(new URL('popup.js', devDir))).toBe(true);
    expect(readFileSync(new URL('popup.html', devDir), 'utf8')).not.toMatch(/Save Anyway|save-anyway/i);
    expect(readFileSync(new URL('popup.js', devDir), 'utf8')).not.toMatch(/overrideIdentityKey|save-anyway/);
  });
});
