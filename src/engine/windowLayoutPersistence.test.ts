import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveWindowLayout, loadWindowLayout } from './windowLayoutPersistence';
import { createDefaultLayout, WINDOW_KINDS } from './windowManager';

const VIEWPORT = { width: 1280, height: 800 };

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

describe('windowLayoutPersistence', () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
  });

  it('round-trips a saved layout', () => {
    const layout = createDefaultLayout(VIEWPORT);
    saveWindowLayout(layout);
    const loaded = loadWindowLayout(VIEWPORT);
    expect(loaded).toEqual(layout);
  });

  it('falls back to a default layout when nothing is stored', () => {
    const loaded = loadWindowLayout(VIEWPORT);
    expect(loaded).toEqual(createDefaultLayout(VIEWPORT));
  });

  it('falls back to a default layout on corrupt JSON', () => {
    mockStorage.getItem.mockReturnValueOnce('{not json');
    const loaded = loadWindowLayout(VIEWPORT);
    expect(loaded).toEqual(createDefaultLayout(VIEWPORT));
  });

  it('falls back to a default layout on a version mismatch', () => {
    mockStorage.getItem.mockReturnValueOnce(
      JSON.stringify({ version: 999, windows: createDefaultLayout(VIEWPORT) }),
    );
    const loaded = loadWindowLayout(VIEWPORT);
    expect(loaded).toEqual(createDefaultLayout(VIEWPORT));
  });

  it('re-clamps a layout saved at a larger viewport', () => {
    const bigLayout = createDefaultLayout({ width: 3000, height: 2000 });
    saveWindowLayout(bigLayout);
    const loaded = loadWindowLayout(VIEWPORT);
    for (const kind of WINDOW_KINDS) {
      expect(loaded[kind].x).toBeLessThanOrEqual(VIEWPORT.width);
      expect(loaded[kind].y).toBeLessThanOrEqual(VIEWPORT.height);
    }
  });

  it('never trusts a stored layout that marks the terminal closed or minimized', () => {
    const corrupted = createDefaultLayout(VIEWPORT);
    corrupted.terminal.open = false;
    corrupted.terminal.minimized = true;
    mockStorage.getItem.mockReturnValueOnce(JSON.stringify({ version: 1, windows: corrupted }));
    const loaded = loadWindowLayout(VIEWPORT);
    expect(loaded.terminal.open).toBe(true);
    expect(loaded.terminal.minimized).toBe(false);
  });
});
