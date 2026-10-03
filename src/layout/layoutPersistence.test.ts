import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveLayout, loadLayout, LAYOUT_KEY } from './layoutPersistence';
import { createDefaultLayout, setRatio, cyclePreset, PRESET_TREES } from './layoutTree';

const makeMockStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((k: string) => store.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      store.set(k, v);
    }),
    removeItem: vi.fn((k: string) => {
      store.delete(k);
    }),
  };
};

describe('layoutPersistence', () => {
  let storage: ReturnType<typeof makeMockStorage>;

  beforeEach(() => {
    storage = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stored = (value: unknown) => {
    storage.getItem.mockReturnValueOnce(JSON.stringify(value));
  };

  it('round-trips preset and adjusted ratios, but never focus or zoom', () => {
    let s = createDefaultLayout();
    s = setRatio(s, [], 0.4);
    s = cyclePreset(s);
    saveLayout(s);
    const raw = JSON.parse(storage.setItem.mock.calls[0][1]) as Record<string, unknown>;
    expect(raw.version).toBe(1);
    expect(raw).not.toHaveProperty('focused');
    expect(raw).not.toHaveProperty('zoomed');
    storage.getItem.mockReturnValueOnce(storage.setItem.mock.calls[0][1]);
    const loaded = loadLayout();
    expect(loaded.preset).toBe('analyze');
    expect(loaded.trees.hunt).toEqual(s.trees.hunt);
    expect(loaded.focused).toBe('term');
    expect(loaded.zoomed).toBeNull();
  });

  it('returns the default layout when nothing is stored', () => {
    expect(loadLayout()).toEqual(createDefaultLayout());
  });

  it('returns the default layout for corrupt JSON', () => {
    storage.getItem.mockReturnValueOnce('{not json');
    expect(loadLayout()).toEqual(createDefaultLayout());
  });

  it('returns the default layout for a version mismatch', () => {
    stored({ version: 999, preset: 'watch', trees: PRESET_TREES });
    expect(loadLayout()).toEqual(createDefaultLayout());
  });

  it('falls back to hunt for an unknown preset name', () => {
    stored({ version: 1, preset: 'nope', trees: PRESET_TREES });
    expect(loadLayout().preset).toBe('hunt');
  });

  it('falls back to the default tree only for a preset whose tree is invalid', () => {
    const good = setRatio(createDefaultLayout(), [], 0.4).trees.hunt;
    stored({
      version: 1,
      preset: 'hunt',
      trees: {
        hunt: good,
        analyze: { kind: 'split', dir: 'row', ratio: 0.5, a: { kind: 'pane', pane: 'term' } },
        watch: PRESET_TREES.watch,
      },
    });
    const loaded = loadLayout();
    expect(loaded.trees.hunt).toEqual(good);
    expect(loaded.trees.analyze).toEqual(PRESET_TREES.analyze);
  });

  it('rejects a tree with a duplicated or missing pane', () => {
    const dup = {
      kind: 'split',
      dir: 'row',
      ratio: 0.5,
      a: { kind: 'pane', pane: 'term' },
      b: { kind: 'pane', pane: 'term' },
    };
    stored({ version: 1, preset: 'hunt', trees: { ...PRESET_TREES, hunt: dup } });
    expect(loadLayout().trees.hunt).toEqual(PRESET_TREES.hunt);
  });

  it('clamps out-of-range ratios and rejects non-numeric ones', () => {
    const wild = JSON.parse(JSON.stringify(PRESET_TREES.hunt)) as {
      ratio: unknown;
      b: { ratio: unknown };
    };
    wild.ratio = 7;
    wild.b.ratio = 'wide';
    stored({ version: 1, preset: 'hunt', trees: { ...PRESET_TREES, hunt: wild } });
    // A string ratio makes the tree invalid → default; clamping is tested separately.
    expect(loadLayout().trees.hunt).toEqual(PRESET_TREES.hunt);

    const clampOnly = JSON.parse(JSON.stringify(PRESET_TREES.hunt)) as { ratio: number };
    clampOnly.ratio = 7;
    stored({ version: 1, preset: 'hunt', trees: { ...PRESET_TREES, hunt: clampOnly } });
    const t = loadLayout().trees.hunt;
    expect(t.kind === 'split' && t.ratio).toBe(0.85);
  });

  it('ignores non-object payloads and unknown pane names', () => {
    stored(null);
    expect(loadLayout()).toEqual(createDefaultLayout());
    stored({ version: 1, preset: 'hunt', trees: { hunt: { kind: 'pane', pane: 'bogus' } } });
    expect(loadLayout().trees.hunt).toEqual(PRESET_TREES.hunt);
  });

  it('survives storage that throws', () => {
    storage.getItem.mockImplementationOnce(() => {
      throw new Error('denied');
    });
    expect(loadLayout()).toEqual(createDefaultLayout());
    storage.setItem.mockImplementationOnce(() => {
      throw new Error('quota');
    });
    expect(() => {
      saveLayout(createDefaultLayout());
    }).not.toThrow();
  });
});

describe('LAYOUT_KEY', () => {
  it('is its own key, not the old window-manager key', () => {
    expect(LAYOUT_KEY).toBe('irongate_layout');
  });
});
