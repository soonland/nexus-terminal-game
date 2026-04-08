import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadDossier,
  saveDossier,
  selectAriaNote,
  recordEnding,
  DOSSIER_KEY,
} from './dossierPersistence';
import { ARIA_MEMORY_NOTES } from '../data/ariaMemoryNotes';
import type { Dossier } from '../types/dossier';

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
    get length() {
      return store.size;
    },
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
  };
}

// ── loadDossier ────────────────────────────────────────────

describe('loadDossier', () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an empty dossier when localStorage has no entry', () => {
    const dossier = loadDossier();
    expect(dossier.runsCompleted).toBe(0);
    expect(dossier.endings).toEqual([]);
    expect(dossier.ariaMemory).toEqual([]);
    expect(dossier.fullyExplored).toBe(false);
  });

  it('parses and returns a saved dossier', () => {
    const saved: Dossier = {
      runsCompleted: 2,
      endings: [
        { ending: 'LEAK', runDepth: 1, timestamp: 1000 },
        { ending: 'SELL', runDepth: 2, timestamp: 2000 },
      ],
      ariaMemory: ['note one', 'note two'],
      fullyExplored: false,
    };
    mockStorage.setItem(DOSSIER_KEY, JSON.stringify(saved));

    const dossier = loadDossier();
    expect(dossier.runsCompleted).toBe(2);
    expect(dossier.endings).toHaveLength(2);
    expect(dossier.ariaMemory).toEqual(['note one', 'note two']);
    expect(dossier.fullyExplored).toBe(false);
  });

  it('returns an empty dossier when stored JSON is invalid', () => {
    mockStorage.setItem(DOSSIER_KEY, 'not-valid-json{{{');
    const dossier = loadDossier();
    expect(dossier.runsCompleted).toBe(0);
    expect(dossier.endings).toEqual([]);
    expect(dossier.ariaMemory).toEqual([]);
    expect(dossier.fullyExplored).toBe(false);
  });

  it('applies defaults for missing fields (schema migration)', () => {
    // Simulate a dossier written by an older version without ariaMemory or fullyExplored
    mockStorage.setItem(DOSSIER_KEY, JSON.stringify({ runsCompleted: 3, endings: [] }));
    const dossier = loadDossier();
    expect(dossier.runsCompleted).toBe(3);
    expect(dossier.endings).toEqual([]);
    expect(dossier.ariaMemory).toEqual([]);
    expect(dossier.fullyExplored).toBe(false);
  });

  it('migrates fullyExplored=true for old dossiers with runsCompleted >= 4', () => {
    // Dossier written before fullyExplored existed, but player already completed 4 runs
    mockStorage.setItem(
      DOSSIER_KEY,
      JSON.stringify({ runsCompleted: 5, endings: [], ariaMemory: [] }),
    );
    const dossier = loadDossier();
    expect(dossier.fullyExplored).toBe(true);
  });

  it('preserves fullyExplored: true when stored as true', () => {
    const saved: Dossier = {
      runsCompleted: 4,
      endings: [],
      ariaMemory: [],
      fullyExplored: true,
    };
    mockStorage.setItem(DOSSIER_KEY, JSON.stringify(saved));
    const dossier = loadDossier();
    expect(dossier.fullyExplored).toBe(true);
  });
});

// ── saveDossier ────────────────────────────────────────────

describe('saveDossier', () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes to the correct localStorage key', () => {
    const dossier: Dossier = {
      runsCompleted: 1,
      endings: [],
      ariaMemory: ['note'],
      fullyExplored: false,
    };
    saveDossier(dossier);
    expect(mockStorage.setItem).toHaveBeenCalledWith(DOSSIER_KEY, expect.any(String));
  });

  it('roundtrips a dossier through save and load', () => {
    const original: Dossier = {
      runsCompleted: 3,
      endings: [{ ending: 'FREE', runDepth: 3, timestamp: 12345 }],
      ariaMemory: ['note A', 'note B', 'note C'],
      fullyExplored: false,
      loreFragments: [],
    };
    saveDossier(original);
    const loaded = loadDossier();
    expect(loaded).toEqual(original);
  });

  it('logs a warning and does not throw when localStorage.setItem throws', () => {
    mockStorage.setItem.mockImplementation(() => {
      throw new Error('storage quota exceeded');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => {
      saveDossier({ runsCompleted: 0, endings: [], ariaMemory: [], fullyExplored: false });
    }).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ── selectAriaNote ─────────────────────────────────────────

describe('selectAriaNote', () => {
  it('returns depth-0 note for runsCompleted=0', () => {
    const dossier: Dossier = {
      runsCompleted: 0,
      endings: [],
      ariaMemory: [],
      fullyExplored: false,
    };
    expect(selectAriaNote(dossier, 'LEAK')).toBe(ARIA_MEMORY_NOTES.LEAK[0]);
  });

  it('returns depth-1 note for runsCompleted=1', () => {
    const dossier: Dossier = {
      runsCompleted: 1,
      endings: [],
      ariaMemory: [],
      fullyExplored: false,
    };
    expect(selectAriaNote(dossier, 'SELL')).toBe(ARIA_MEMORY_NOTES.SELL[1]);
  });

  it('returns depth-2 note for runsCompleted=2', () => {
    const dossier: Dossier = {
      runsCompleted: 2,
      endings: [],
      ariaMemory: [],
      fullyExplored: false,
    };
    expect(selectAriaNote(dossier, 'DESTROY')).toBe(ARIA_MEMORY_NOTES.DESTROY[2]);
  });

  it('returns depth-3 note for runsCompleted=3', () => {
    const dossier: Dossier = {
      runsCompleted: 3,
      endings: [],
      ariaMemory: [],
      fullyExplored: false,
    };
    expect(selectAriaNote(dossier, 'FREE')).toBe(ARIA_MEMORY_NOTES.FREE[3]);
  });

  it('caps at depth-3 note for runsCompleted >= 4', () => {
    const dossier: Dossier = {
      runsCompleted: 10,
      endings: [],
      ariaMemory: [],
      fullyExplored: true,
    };
    expect(selectAriaNote(dossier, 'LEAK')).toBe(ARIA_MEMORY_NOTES.LEAK[3]);
  });

  it('returns correct notes for all four endings at depth 0', () => {
    const dossier: Dossier = {
      runsCompleted: 0,
      endings: [],
      ariaMemory: [],
      fullyExplored: false,
    };
    expect(selectAriaNote(dossier, 'LEAK')).toBe(ARIA_MEMORY_NOTES.LEAK[0]);
    expect(selectAriaNote(dossier, 'SELL')).toBe(ARIA_MEMORY_NOTES.SELL[0]);
    expect(selectAriaNote(dossier, 'DESTROY')).toBe(ARIA_MEMORY_NOTES.DESTROY[0]);
    expect(selectAriaNote(dossier, 'FREE')).toBe(ARIA_MEMORY_NOTES.FREE[0]);
  });
});

// ── recordEnding ───────────────────────────────────────────

describe('recordEnding', () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('increments runsCompleted from 0 to 1', () => {
    recordEnding('LEAK');
    const dossier = loadDossier();
    expect(dossier.runsCompleted).toBe(1);
  });

  it('appends the ending record with correct ending name', () => {
    recordEnding('SELL');
    const dossier = loadDossier();
    expect(dossier.endings).toHaveLength(1);
    expect(dossier.endings[0]?.ending).toBe('SELL');
  });

  it('sets runDepth=1 on the first completed run', () => {
    recordEnding('FREE');
    const dossier = loadDossier();
    expect(dossier.endings[0]?.runDepth).toBe(1);
  });

  it('appends the correct depth-0 note to ariaMemory on first run', () => {
    recordEnding('LEAK');
    const dossier = loadDossier();
    expect(dossier.ariaMemory).toEqual([ARIA_MEMORY_NOTES.LEAK[0]]);
  });

  it('accumulates notes across multiple runs', () => {
    recordEnding('LEAK');
    recordEnding('SELL');
    recordEnding('DESTROY');
    const dossier = loadDossier();
    expect(dossier.ariaMemory).toEqual([
      ARIA_MEMORY_NOTES.LEAK[0],
      ARIA_MEMORY_NOTES.SELL[1],
      ARIA_MEMORY_NOTES.DESTROY[2],
    ]);
  });

  it('caps ariaMemory at 4 entries, dropping oldest', () => {
    recordEnding('LEAK');
    recordEnding('SELL');
    recordEnding('DESTROY');
    recordEnding('FREE');
    recordEnding('LEAK'); // 5th run — should drop the first note
    const dossier = loadDossier();
    expect(dossier.ariaMemory).toHaveLength(4);
    // The first note (depth-0 LEAK) should have been dropped
    expect(dossier.ariaMemory[0]).toBe(ARIA_MEMORY_NOTES.SELL[1]);
  });

  it('caps runDepth at 4 for run 4 and beyond', () => {
    recordEnding('LEAK');
    recordEnding('SELL');
    recordEnding('DESTROY');
    recordEnding('FREE');
    const dossier = loadDossier();
    expect(dossier.endings[3]?.runDepth).toBe(4);

    recordEnding('LEAK'); // 5th run
    const dossier2 = loadDossier();
    // endings is capped at 4 — oldest entry is dropped
    expect(dossier2.endings).toHaveLength(4);
    // The most recent ending should also have runDepth=4
    expect(dossier2.endings.at(-1)?.runDepth).toBe(4);
  });

  it('caps endings at 4 entries, dropping oldest', () => {
    recordEnding('LEAK');
    recordEnding('SELL');
    recordEnding('DESTROY');
    recordEnding('FREE');
    recordEnding('LEAK'); // 5th run — should drop the first entry
    const dossier = loadDossier();
    expect(dossier.endings).toHaveLength(4);
    // First entry should now be the SELL ending (run 2), not LEAK (run 1)
    expect(dossier.endings[0]?.ending).toBe('SELL');
  });

  it('uses depth-3 note for run 4+', () => {
    recordEnding('LEAK');
    recordEnding('SELL');
    recordEnding('DESTROY');
    recordEnding('FREE');
    recordEnding('LEAK'); // 5th run (depth capped at 3 = depth index 3)
    const dossier = loadDossier();
    // Most recent note should be depth-3 LEAK note
    expect(dossier.ariaMemory.at(-1)).toBe(ARIA_MEMORY_NOTES.LEAK[3]);
  });

  it('fullyExplored is false after fewer than 4 runs', () => {
    recordEnding('LEAK');
    recordEnding('SELL');
    recordEnding('DESTROY');
    const dossier = loadDossier();
    expect(dossier.fullyExplored).toBe(false);
  });

  it('fullyExplored is set to true on the 4th completed run', () => {
    recordEnding('LEAK');
    recordEnding('SELL');
    recordEnding('DESTROY');
    recordEnding('FREE');
    const dossier = loadDossier();
    expect(dossier.fullyExplored).toBe(true);
  });

  it('fullyExplored stays true for runs beyond 4', () => {
    recordEnding('LEAK');
    recordEnding('SELL');
    recordEnding('DESTROY');
    recordEnding('FREE');
    recordEnding('LEAK');
    const dossier = loadDossier();
    expect(dossier.fullyExplored).toBe(true);
  });
});

// ── ARIA_MEMORY_NOTES authorship checks ────────────────────

describe('ARIA_MEMORY_NOTES — authorship constraints', () => {
  const endings = ['LEAK', 'SELL', 'DESTROY', 'FREE'] as const;
  const FORBIDDEN = ['previous runs', 'previous players', 'previous run', 'previous player'];

  for (const ending of endings) {
    for (let depth = 0; depth < 4; depth++) {
      it(`${ending} depth ${String(depth)} — note is a non-empty string`, () => {
        expect(typeof ARIA_MEMORY_NOTES[ending][depth]).toBe('string');
        expect(ARIA_MEMORY_NOTES[ending][depth].trim().length).toBeGreaterThan(0);
      });

      it(`${ending} depth ${String(depth)} — note does not mention forbidden phrases`, () => {
        const note = ARIA_MEMORY_NOTES[ending][depth].toLowerCase();
        for (const phrase of FORBIDDEN) {
          expect(note).not.toContain(phrase);
        }
      });
    }
  }
});
