/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Vitest blanks CSS imports, so read the stylesheet as text.
const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8');

const rule = (selector: string): string => {
  const match = new RegExp(`${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css);
  return match?.[1] ?? '';
};

describe('the photo backdrop (pre-game screens)', () => {
  it('is defined once, as a shared custom property, and both backdrops are built from it', () => {
    expect(css.match(/images\.unsplash\.com/g)).toHaveLength(1);
    expect(css).toMatch(/--desktop-photo:[^;]*unsplash/);
    expect(css).toMatch(/--desktop-backdrop:[^;]*var\(--desktop-photo\)/);
    expect(css).toMatch(/--desktop-backdrop-tiled:[^;]*var\(--desktop-photo\)/);
  });

  it('tints the tiled backdrop lighter than the pre-game one, since the panes cover it again', () => {
    const alpha = (name: string): number => {
      const match = new RegExp(`${name}:\\s*linear-gradient\\(rgba\\([^)]*,\\s*([\\d.]+)\\)`).exec(
        css,
      );
      return Number(match?.[1]);
    };
    expect(alpha('--desktop-backdrop')).toBeGreaterThan(alpha('--desktop-backdrop-tiled'));
  });

  it('is used by the welcome and prologue screens', () => {
    expect(rule('.desktop')).toContain('var(--desktop-backdrop)');
  });

  it('is also used by the bare terminal (login, boot, resume) before a game exists', () => {
    expect(rule('.workspace-solo')).toContain('var(--desktop-backdrop)');
  });

  it('shows through the bare terminal: its pane is transparent and its header translucent', () => {
    expect(rule('.layout-bare .pane')).toMatch(/background:\s*transparent/);
    expect(rule('.layout-bare .terminal-header')).toMatch(/background:\s*rgba\(/);
  });

  it('puts the photo behind the tiled panes', () => {
    expect(rule('.workspace')).toContain('var(--desktop-backdrop-tiled)');
  });

  it('makes the in-game panes translucent glass, so the photo is visible through them', () => {
    expect(rule('.pane')).toMatch(/background:\s*color-mix\(in srgb, var\(--win-bg\)/);
    expect(rule('.pane')).toMatch(/backdrop-filter:\s*blur\(/);
  });

  it('does the same for the pane chrome: title strips, narrow tabs, header and status bar', () => {
    for (const selector of ['.pane-title', '.pane-tabs', '.terminal-header', '.statusbar']) {
      expect(rule(selector), selector).toMatch(
        /background:\s*color-mix\(in srgb, var\(--win-titlebar-bg\)/,
      );
    }
  });

  it('keeps the alert tint working: an alert pane overrides the colour the glass is mixed from', () => {
    expect(rule(".pane[data-alert='true']")).toContain('--win-bg:');
  });

  it('keeps the Help, Briefing and Dossier overlays opaque', () => {
    expect(rule('.overlay')).toMatch(/background:\s*var\(--win-bg\)/);
  });
});
