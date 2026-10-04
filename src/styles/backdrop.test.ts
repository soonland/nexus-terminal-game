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
  it('is defined once, as a shared custom property', () => {
    expect(css.match(/images\.unsplash\.com/g)).toHaveLength(1);
    expect(css).toMatch(/--desktop-backdrop:[^;]*unsplash/);
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

  it('leaves the in-game panes opaque', () => {
    expect(rule('.pane')).toContain('background: var(--win-bg)');
  });
});
