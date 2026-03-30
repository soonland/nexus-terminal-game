import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveGame,
  loadGame,
  clearSave,
  hasSave,
  recordDisclaimerAgreement,
  disclaimerRequired,
} from './persistence';
import { createInitialState } from './state';
import produce from './produce';
import type { GameState } from '../types/game';

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

const SAVE_KEY = 'irongate_save';

// Helper: save a state and parse the raw JSON written to storage
function savedJson(mockStorage: ReturnType<typeof makeMockStorage>, state: GameState) {
  saveGame(state);
  const [, value] = mockStorage.setItem.mock.calls[0] as [string, string];
  return JSON.parse(value) as Record<string, unknown>;
}

describe('saveGame — save format', () => {
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

  it('writes to the correct localStorage key', () => {
    saveGame(state);
    expect(mockStorage.setItem).toHaveBeenCalledOnce();
    const [key] = mockStorage.setItem.mock.calls[0] as [string, string];
    expect(key).toBe(SAVE_KEY);
  });

  it('includes a version field', () => {
    const json = savedJson(mockStorage, state);
    expect(json['version']).toBe(1);
  });

  it('preserves runId, phase, turnCount, recentCommands', () => {
    const json = savedJson(mockStorage, state);
    expect(json['runId']).toBe(state.runId);
    expect(json['phase']).toBe('playing');
    expect(json['turnCount']).toBe(0);
    expect(json['recentCommands']).toEqual([]);
  });

  it('does NOT store credential usernames or passwords', () => {
    const raw = JSON.stringify(savedJson(mockStorage, state));
    expect(raw).not.toContain('Welcome1!');
    expect(raw).not.toContain('IronG8te#Ops');
    expect(raw).not.toContain('Ar1aKn0wsAll');
  });

  it('stores only credential IDs for obtained credentials', () => {
    const withObtained = produce(state, s => {
      const cred = s.player.credentials.find(c => c.id === 'cred_contractor');
      if (cred) cred.obtained = true;
    });
    const json = savedJson(mockStorage, withObtained);
    const player = json['player'] as Record<string, unknown>;
    expect(player['credentialsObtained']).toEqual(['cred_contractor']);
    expect(player).not.toHaveProperty('credentials');
  });

  it('stores only file paths for exfiltrated files, not their contents', () => {
    const withExfil = produce(state, s => {
      const node = s.network.nodes['contractor_portal'];
      const file = node?.files.find(f => f.name === 'welcome.txt');
      if (file) s.player.exfiltrated.push({ ...file });
    });
    const json = savedJson(mockStorage, withExfil);
    const player = json['player'] as Record<string, unknown>;
    expect(player['exfiltratedPaths']).toEqual(['/var/www/contractor/welcome.txt']);
  });

  it('does NOT store static file contents in node data', () => {
    const raw = JSON.stringify(savedJson(mockStorage, state));
    // Static file content from contractor_portal welcome.txt
    expect(raw).not.toContain('IRONGATE CORP — CONTRACTOR ONBOARDING');
  });

  it('stores only mutable node fields (discovered, accessLevel, compromised)', () => {
    const json = savedJson(mockStorage, state);
    const network = json['network'] as Record<string, unknown>;
    const nodes = network['nodes'] as Record<string, Record<string, unknown>>;
    const portalDelta = nodes['contractor_portal'];
    expect(portalDelta).toHaveProperty('discovered');
    expect(portalDelta).toHaveProperty('accessLevel');
    expect(portalDelta).toHaveProperty('compromised');
    expect(portalDelta).not.toHaveProperty('services');
    expect(portalDelta).not.toHaveProperty('connections');
    expect(portalDelta).not.toHaveProperty('label');
  });

  it('does not include undiscovered nodes in the save', () => {
    const json = savedJson(mockStorage, state);
    const network = json['network'] as Record<string, unknown>;
    const nodes = network['nodes'] as Record<string, unknown>;
    // vpn_gateway starts undiscovered — must not appear in the delta
    expect(nodes).not.toHaveProperty('vpn_gateway');
    // contractor_portal starts discovered — must appear
    expect(nodes).toHaveProperty('contractor_portal');
  });

  it('does not throw when localStorage.setItem throws (storage full)', () => {
    mockStorage.setItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => {
      saveGame(state);
    }).not.toThrow();
  });
});

describe('loadGame — round-trip', () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function roundTrip(state: GameState): GameState | null {
    saveGame(state);
    const [, value] = mockStorage.setItem.mock.calls[0] as [string, string];
    mockStorage.getItem.mockReturnValue(value);
    return loadGame();
  }

  it('returns null when no save exists', () => {
    expect(loadGame()).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    mockStorage.getItem.mockReturnValue('not valid json {{{');
    expect(loadGame()).toBeNull();
  });

  it('returns null for a mismatched version (stale full-state save)', () => {
    mockStorage.getItem.mockReturnValue(JSON.stringify({ version: 0, phase: 'playing' }));
    expect(loadGame()).toBeNull();
  });

  it('preserves runId and scalar fields', () => {
    const state = createInitialState();
    const loaded = roundTrip(state);
    expect(loaded?.runId).toBe(state.runId);
    expect(loaded?.phase).toBe('playing');
    expect(loaded?.turnCount).toBe(0);
  });

  it('preserves trace and charges', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 17;
      s.player.charges = 1;
    });
    const loaded = roundTrip(state);
    expect(loaded?.player.trace).toBe(17);
    expect(loaded?.player.charges).toBe(1);
  });

  it('restores obtained credential flag with full static data', () => {
    const state = produce(createInitialState(), s => {
      const cred = s.player.credentials.find(c => c.id === 'cred_contractor');
      if (cred) cred.obtained = true;
    });
    const loaded = roundTrip(state);
    const cred = loaded?.player.credentials.find(c => c.id === 'cred_contractor');
    expect(cred?.obtained).toBe(true);
    expect(cred?.username).toBe('contractor');
    expect(cred?.password).toBe('Welcome1!');
  });

  it('restores node discovered and accessLevel', () => {
    const state = produce(createInitialState(), s => {
      const node = s.network.nodes['vpn_gateway'];
      if (node) {
        node.discovered = true;
        node.accessLevel = 'user';
      }
    });
    const loaded = roundTrip(state);
    const node = loaded?.network.nodes['vpn_gateway'];
    expect(node?.discovered).toBe(true);
    expect(node?.accessLevel).toBe('user');
  });

  it('restores exfiltrated files with full static content', () => {
    const state = produce(createInitialState(), s => {
      const node = s.network.nodes['contractor_portal'];
      const file = node?.files.find(f => f.name === 'welcome.txt');
      if (file) s.player.exfiltrated.push({ ...file });
    });
    const loaded = roundTrip(state);
    expect(loaded?.player.exfiltrated).toHaveLength(1);
    expect(loaded?.player.exfiltrated[0]?.path).toBe('/var/www/contractor/welcome.txt');
    expect(loaded?.player.exfiltrated[0]?.content).toContain('IRONGATE CORP');
  });

  it('restores static node label and services from anchorNodes', () => {
    const state = createInitialState();
    const loaded = roundTrip(state);
    const node = loaded?.network.nodes['contractor_portal'];
    expect(node?.label).toBe('CONTRACTOR PORTAL');
    expect(node?.services.length).toBeGreaterThan(0);
  });

  it('preserves aria state', () => {
    const state = produce(createInitialState(), s => {
      s.aria.discovered = true;
      s.aria.trustScore = 42;
    });
    const loaded = roundTrip(state);
    expect(loaded?.aria.discovered).toBe(true);
    expect(loaded?.aria.trustScore).toBe(42);
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

  it('removes the save key', () => {
    clearSave();
    expect(mockStorage.removeItem).toHaveBeenCalledWith(SAVE_KEY);
  });

  it('causes hasSave to return false after clearing', () => {
    mockStorage.setItem(SAVE_KEY, '{}');
    clearSave();
    expect(mockStorage.getItem(SAVE_KEY)).toBeNull();
  });
});

describe('loadGame — orphaned exfil path', () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('silently drops an exfiltrated path that no longer exists in any node', () => {
    const state = createInitialState();
    saveGame(state);
    const [, value] = mockStorage.setItem.mock.calls[0] as [string, string];
    const save = JSON.parse(value) as Record<string, unknown>;
    const player = save['player'] as Record<string, unknown>;
    player['exfiltratedPaths'] = ['/nonexistent/ghost.txt'];
    mockStorage.getItem.mockReturnValue(JSON.stringify(save));
    const loaded = loadGame();
    expect(loaded?.player.exfiltrated).toHaveLength(0);
  });
});

describe('disclaimerRequired / recordDisclaimerAgreement', () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when no disclaimer key exists', () => {
    expect(disclaimerRequired()).toBe(true);
  });

  it('returns false when agreement was recorded within the TTL', () => {
    recordDisclaimerAgreement();
    expect(disclaimerRequired()).toBe(false);
  });

  it('returns true when agreement timestamp is older than 24 hours', () => {
    const expired = Date.now() - 25 * 60 * 60 * 1000;
    mockStorage.getItem.mockReturnValue(String(expired));
    expect(disclaimerRequired()).toBe(true);
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

  it('returns false when no save exists', () => {
    expect(hasSave()).toBe(false);
  });

  it('returns true when a save key exists', () => {
    mockStorage.getItem.mockReturnValue('{"version":1}');
    expect(hasSave()).toBe(true);
  });
});
