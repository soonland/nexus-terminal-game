import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveGame, loadGame, clearSave, hasSave } from './persistence';
import { createInitialState } from './state';
import type { GameState } from '../types/game';

// ── localStorage mock ──────────────────────────────────────
// Vitest runs in a node environment with no DOM, so we stub localStorage
// with a minimal Map-based implementation before each test.

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

const SAVE_KEY = 'irongate_save';

describe('saveGame', () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;
  let state: GameState;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
    state = createInitialState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should store JSON-serialized state under the save key', () => {
    saveGame(state);
    expect(mockStorage.setItem).toHaveBeenCalledOnce();
    const [key, value] = mockStorage.setItem.mock.calls[0] as [string, string];
    expect(key).toBe(SAVE_KEY);
    const parsed = JSON.parse(value) as GameState;
    expect(parsed.runId).toBe(state.runId);
  });

  it('should serialize the full player state', () => {
    saveGame(state);
    const [, value] = mockStorage.setItem.mock.calls[0] as [string, string];
    const parsed = JSON.parse(value) as GameState;
    expect(parsed.player.handle).toBe('ghost');
    expect(parsed.player.trace).toBe(0);
  });

  it('should not throw when localStorage.setItem throws (storage full)', () => {
    mockStorage.setItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => {
      saveGame(state);
    }).not.toThrow();
  });
});

describe('loadGame', () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;
  let state: GameState;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
    state = createInitialState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return null when no save exists', () => {
    expect(loadGame()).toBeNull();
  });

  it('should parse and return a saved GameState', () => {
    mockStorage.getItem.mockReturnValue(JSON.stringify(state));
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded?.runId).toBe(state.runId);
    expect(loaded?.player.handle).toBe('ghost');
  });

  it('should return null when the saved JSON is malformed', () => {
    mockStorage.getItem.mockReturnValue('not valid json {{{');
    expect(loadGame()).toBeNull();
  });

  it('should migrate missing turnCount to 0', () => {
    const noTurnCount = { ...state } as Partial<GameState>;
    delete (noTurnCount as Record<string, unknown>)['turnCount'];
    mockStorage.getItem.mockReturnValue(JSON.stringify(noTurnCount));
    const loaded = loadGame();
    expect(loaded?.turnCount).toBe(0);
  });

  it('should migrate missing recentCommands to empty array', () => {
    const noRecent = { ...state } as Partial<GameState>;
    delete (noRecent as Record<string, unknown>)['recentCommands'];
    mockStorage.getItem.mockReturnValue(JSON.stringify(noRecent));
    const loaded = loadGame();
    expect(loaded?.recentCommands).toEqual([]);
  });

  it('should preserve existing turnCount when it is present', () => {
    const withTurn = { ...state, turnCount: 42 };
    mockStorage.getItem.mockReturnValue(JSON.stringify(withTurn));
    const loaded = loadGame();
    expect(loaded?.turnCount).toBe(42);
  });

  it('should preserve existing recentCommands when they are present', () => {
    const withRecent = { ...state, recentCommands: ['help', 'scan'] };
    mockStorage.getItem.mockReturnValue(JSON.stringify(withRecent));
    const loaded = loadGame();
    expect(loaded?.recentCommands).toEqual(['help', 'scan']);
  });
});

describe('clearSave', () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should call removeItem with the save key', () => {
    clearSave();
    expect(mockStorage.removeItem).toHaveBeenCalledWith(SAVE_KEY);
  });

  it('should remove the key so hasSave returns false', () => {
    // Pre-populate then clear
    mockStorage.setItem(SAVE_KEY, '{}');
    clearSave();
    // After removeItem the store is empty; getItem returns null
    expect(mockStorage.getItem(SAVE_KEY)).toBeNull();
  });
});

describe('hasSave', () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return false when no save key exists', () => {
    expect(hasSave()).toBe(false);
  });

  it('should return true when a save key exists', () => {
    mockStorage.getItem.mockReturnValue('{"phase":"playing"}');
    expect(hasSave()).toBe(true);
  });
});
