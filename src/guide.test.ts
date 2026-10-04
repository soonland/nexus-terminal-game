import { describe, it, expect } from 'vitest';
import html from '../public/guide.html?raw';

// File names present in public/fonts, as Vite sees them.
const fontFiles = new Set(
  Object.keys(import.meta.glob('../public/fonts/*.woff2')).map(path => path.split('/').pop()),
);
// HTML accessibility attributes (aria-label, ...) are not the character's name.
const visible = html.replace(/\saria-[a-z]+="[^"]*"/g, '');
// The page as a reader sees it: tags stripped, whitespace collapsed.
const text = html
  .replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ');

// The guide is linked from the welcome screen, before the game starts. It is a spoiler-free
// field manual: mechanics, interface and commands only.
describe('guide.html — spoiler-free', () => {
  it('never uses the secret name (the naming rule)', () => {
    expect(visible).not.toMatch(/aria/i);
  });

  it('does not name the files that give the story away', () => {
    expect(html).not.toMatch(
      /aria_key|subnet_key|self_model|project_aria|PROJ_SENTINEL_BOARD_VOTE/i,
    );
  });

  it('does not give Layer 5 hosts or the decision terminal away', () => {
    expect(html).not.toMatch(/172\.16\.0\.[1-5]/);
    expect(html).not.toMatch(/decision (node|terminal)/i);
    expect(html).not.toMatch(/\b(LEAK|SELL|DESTROY|FREE)\b/);
  });
});

describe('guide.html — structure', () => {
  it('has a viewport meta and a phone layout', () => {
    expect(html).toMatch(/<meta name="viewport"/);
    expect(html).toMatch(/@media \(max-width: \d+px\)/);
  });

  it('links every nav entry to a section that exists', () => {
    const hrefs = [...html.matchAll(/href="#([a-z-]+)"/g)].map(m => m[1]);
    expect(hrefs.length).toBeGreaterThan(6);
    for (const id of new Set(hrefs)) {
      expect(html, `#${id}`).toMatch(new RegExp(`id="${id}"`));
    }
  });

  it('keeps anchor targets clear of the sticky phone menu and closes it on tap', () => {
    expect(html).toMatch(/scroll-padding-top: 3\.4rem/);
    expect(html).toMatch(/\.mnav a/);
    expect(html).toMatch(/removeAttribute\('open'\)/);
  });

  it('is self-hosted: no external fonts, styles or scripts', () => {
    expect(html).not.toMatch(/(src|href)="https?:/);
    expect(html).not.toMatch(/url\(\s*['"]?https?:/);
    expect(html).not.toMatch(/@import/);
  });

  it('loads IBM Plex Mono from public/fonts and every file exists', () => {
    const files = [...html.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map(m => m[1]);
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) {
      expect(fontFiles.has(file), file).toBe(true);
    }
    expect(html).toMatch(/IBM Plex Mono/);
  });
});

describe('guide.html — matches the game', () => {
  it('shows the operative login exactly', () => {
    expect(html).toContain('ghost');
    expect(html).toContain('nX-2847');
  });

  it.each([
    'help',
    'whoami',
    'briefing',
    'case',
    'notes',
    'dossier',
    'explorer',
    'status',
    'map',
    'clear',
    'theme',
    'scan',
    'connect',
    'login',
    'ls',
    'cat',
    'disconnect',
    'exploit',
    'exfil',
    'wipe-logs',
    'unlock',
    'spoof',
    'view-cam',
    'decrypt',
    'msg sentinel',
  ])('documents the %s command', command => {
    expect(html).toContain(command);
  });

  it('documents every layout shortcut', () => {
    expect(text).toMatch(/Alt \+ 1 … 5/);
    expect(text).toMatch(/Alt \+ Z/);
    expect(text).toMatch(/Alt \+ P/);
    expect(text).toMatch(/Esc/);
  });

  it('documents every trace threshold, including the 55% file lock', () => {
    for (const range of ['0–30%', '31–54%', '55–60%', '61–85%', '86–99%', '100%']) {
      expect(text, range).toContain(range);
    }
    expect(text).toMatch(/55–60% Files lock/);
  });

  it('explains pivoting with a session you hold', () => {
    expect(html).toMatch(/pivot/i);
  });

  it('lists the real themes', () => {
    for (const theme of ['classic', 'green', 'amber', 'slate']) expect(html).toContain(theme);
  });
});
