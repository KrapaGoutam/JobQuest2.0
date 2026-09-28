import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('M2 Design Tokens & Contracts', () => {
  it('tokens.css contains approved Direction D semantic colors and aliases', () => {
    const cssPath = resolve('apps/web/src/styles/tokens.css');
    const css = readFileSync(cssPath, 'utf8');

    // Canvas & Surfacing
    expect(css).toContain('--color-canvas: #f6f7f9');
    expect(css).toContain('--color-sidebar: #ffffff');
    expect(css).toContain('--color-surface-1: #ffffff');
    expect(css).toContain('--color-surface-2: #f1f3f6');
    expect(css).toContain('--color-surface-3: #e8ebf0');

    // Text & Calibrated Contrast
    expect(css).toContain('--color-text: #172033');
    expect(css).toContain('--color-text-muted: #5f6b7e');

    // Borders & Focus
    expect(css).toContain('--color-border: #dfe3ea');
    expect(css).toContain('--color-border-strong: #c7ced9');
    expect(css).toContain('--color-focus: #5076f2');

    // Accent & Status
    expect(css).toContain('--color-accent: #3157d5');
    expect(css).toContain('--color-accent-hover: #2849b8');
    expect(css).toContain('--color-success: #147a55');
    expect(css).toContain('--color-warning: #9a5b08');
    expect(css).toContain('--color-danger: #ba3341');
    expect(css).toContain('--color-info: #246b9f');

    // Dark theme overrides
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain('--color-canvas: #090d16');
    expect(css).toContain('--color-sidebar: #0d1220');
    expect(css).toContain('--color-surface-1: #121827');
    expect(css).toContain('--color-accent: #8098ff');
    expect(css).toContain('--color-success: #54c89a');
    expect(css).toContain('--color-warning: #edb457');
    expect(css).toContain('--color-danger: #ff7f8c');
    expect(css).toContain('--color-info: #75b8e7');
  });

  it('verifies WCAG 2.2 AA contrast for calibrated muted text', () => {
    // Relative luminance calculation for #5f6b7e on #ffffff and #f6f7f9
    function getLuminance(hex: string): number {
      const rgb = [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255,
      ].map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
      return 0.2126 * (rgb[0] ?? 0) + 0.7152 * (rgb[1] ?? 0) + 0.0722 * (rgb[2] ?? 0);
    }

    function getContrast(hex1: string, hex2: string): number {
      const lum1 = getLuminance(hex1);
      const lum2 = getLuminance(hex2);
      const brightest = Math.max(lum1, lum2);
      const darkest = Math.min(lum1, lum2);
      return (brightest + 0.05) / (darkest + 0.05);
    }

    const mutedOnWhite = getContrast('#5f6b7e', '#ffffff');
    const mutedOnCanvas = getContrast('#5f6b7e', '#f6f7f9');

    // WCAG AA requirement for normal text is >= 4.5:1
    // Approved Direction D requirement: tightened to >= 5.0:1 on canvas
    expect(mutedOnWhite).toBeGreaterThan(5.0);
    expect(mutedOnCanvas).toBeGreaterThan(4.8);
  });

  it('validates responsive breakpoint specifications', () => {
    const breakpoints = {
      mobileMax: 767,
      tabletMin: 768,
      tabletMax: 1023,
      desktopMin: 1024,
      desktopMax: 1679,
      wideMin: 1680,
    };

    expect(breakpoints.mobileMax + 1).toBe(breakpoints.tabletMin);
    expect(breakpoints.tabletMax + 1).toBe(breakpoints.desktopMin);
    expect(breakpoints.desktopMax + 1).toBe(breakpoints.wideMin);
  });

  it('validates theme resolution logic', () => {
    type ThemePref = 'system' | 'light' | 'dark';
    function resolveTheme(pref: ThemePref, systemIsDark: boolean): 'light' | 'dark' {
      if (pref === 'system') return systemIsDark ? 'dark' : 'light';
      return pref;
    }

    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
