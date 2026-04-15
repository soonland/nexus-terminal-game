import { describe, it, expect, vi, beforeEach } from 'vitest';
import { THEMES, THEME_LABELS, applyTheme, saveTheme, loadTheme } from './themes';
import type { Theme } from './themes';

// ── localStorage mock ──────────────────────────────────────

function makeMockStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  };
}

// ── document.documentElement mock ─────────────────────────

function makeMockRoot() {
  const classes = new Set<string>();
  return {
    classList: {
      add: vi.fn((cls: string) => {
        classes.add(cls);
      }),
      remove: vi.fn((cls: string) => {
        classes.delete(cls);
      }),
      contains: (cls: string) => classes.has(cls),
    },
  };
}

describe('themes', () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;
  let mockRoot: ReturnType<typeof makeMockRoot>;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    mockRoot = makeMockRoot();
    vi.stubGlobal('localStorage', mockStorage);
    vi.stubGlobal('document', { documentElement: mockRoot });
  });

  describe('THEMES / THEME_LABELS', () => {
    it('exports all four theme names', () => {
      expect(THEMES).toEqual(['classic', 'green', 'amber', 'slate']);
    });

    it('has a label for every theme', () => {
      THEMES.forEach(t => {
        expect(THEME_LABELS[t]).toBeTruthy();
      });
    });
  });

  describe('applyTheme', () => {
    it('removes all theme classes before applying', () => {
      applyTheme('amber');
      THEMES.forEach(t => {
        expect(mockRoot.classList.remove).toHaveBeenCalledWith(`theme-${t}`);
      });
    });

    it('adds the correct class for non-classic themes', () => {
      const nonClassic: Theme[] = ['green', 'amber', 'slate'];
      nonClassic.forEach(theme => {
        vi.clearAllMocks();
        applyTheme(theme);
        expect(mockRoot.classList.add).toHaveBeenCalledWith(`theme-${theme}`);
      });
    });

    it('does not add any class for classic theme', () => {
      applyTheme('classic');
      expect(mockRoot.classList.add).not.toHaveBeenCalled();
    });
  });

  describe('saveTheme / loadTheme', () => {
    it('saves and loads a theme', () => {
      saveTheme('slate');
      expect(mockStorage.setItem).toHaveBeenCalledWith('irongate_theme', 'slate');
      expect(loadTheme()).toBe('slate');
    });

    it('returns classic when nothing is stored', () => {
      expect(loadTheme()).toBe('classic');
    });

    it('returns classic when stored value is not a valid theme', () => {
      mockStorage.setItem('irongate_theme', 'banana');
      expect(loadTheme()).toBe('classic');
    });

    it('round-trips all themes', () => {
      THEMES.forEach(theme => {
        saveTheme(theme);
        expect(loadTheme()).toBe(theme);
      });
    });
  });
});
