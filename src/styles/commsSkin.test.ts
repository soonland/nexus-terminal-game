/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Vitest blanks CSS imports, so read the stylesheet as text.
const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8');

const rule = (selector: string): string => {
  const escaped = selector.replace(/[.[\]()']/g, '\\$&');
  return new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
};

describe('the comms alert skin', () => {
  it('keeps the pane frame in alert: border, title strip and the glass tint', () => {
    const alert = rule(".pane[data-alert='true']");
    for (const name of ['--win-bg', '--win-border', '--win-titlebar-bg', '--win-title-color']) {
      expect(alert, name).toContain(`${name}:`);
    }
  });

  it('does not re-colour the pane content: that belongs to the SENTINEL view', () => {
    const alert = rule(".pane[data-alert='true']");
    for (const name of ['--color-output', '--color-input', '--color-system', '--win-body-color']) {
      expect(alert, name).not.toContain(`${name}:`);
    }
  });

  it('puts the red text palette on the alert view only', () => {
    const view = rule(".comms-view[data-skin='alert']");
    expect(view).toContain('--win-body-color: #ff5555');
    expect(view).toContain('--color-output: #ff5555');
    expect(view).toContain('--color-input: #ff5555');
  });

  it('restores the normal border and title colours in the calm view', () => {
    const calm = rule(".comms-view[data-skin='calm']");
    expect(calm).toContain('--win-border: var(--win-border-calm)');
    expect(calm).toContain('--win-title-color: var(--win-title-color-calm)');
    const root = [...css.matchAll(/(?:^|\n):root\s*\{([^}]*)\}/g)].map(m => m[1]).join('\n');
    expect(root).toContain('--win-border-calm: var(--win-border)');
    expect(root).toContain('--win-title-color-calm: var(--win-title-color)');
  });
});
