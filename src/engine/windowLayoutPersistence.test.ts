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
    // createDefaultLayout's own cascade positions (24-184) are already inside the
    // 1280x800 VIEWPORT used below, which would make this test pass even if
    // loadWindowLayout never re-clamped anything — push a window explicitly outside
    // VIEWPORT's bounds so the assertion actually exercises the re-clamp path.
    bigLayout.map = { ...bigLayout.map, x: 2500, y: 1800 };
    saveWindowLayout(bigLayout);
    const loaded = loadWindowLayout(VIEWPORT);
    for (const kind of WINDOW_KINDS) {
      expect(loaded[kind].x).toBeLessThanOrEqual(VIEWPORT.width);
      expect(loaded[kind].y).toBeLessThanOrEqual(VIEWPORT.height);
    }
  });

  it('compacts a hand-edited, unbounded z-index back into a sane dense range on load', () => {
    const corrupted = createDefaultLayout(VIEWPORT);
    corrupted.map = { ...corrupted.map, zIndex: 1e308 };
    mockStorage.getItem.mockReturnValueOnce(JSON.stringify({ version: 1, windows: corrupted }));
    const loaded = loadWindowLayout(VIEWPORT);
    const zIndices = WINDOW_KINDS.map(k => loaded[k].zIndex).sort((a, b) => a - b);
    expect(zIndices).toEqual(WINDOW_KINDS.map((_, i) => i + 1));
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
