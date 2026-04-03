import type { GameState, GamePhase, AccessLevel, AriaState, Tool } from '../types/game';
import { createInitialState } from './state';
import { AI_GENERATED_FILE_PATHS } from '../data/anchorNodes';

const SAVE_KEY = 'irongate_save';
const SAVE_VERSION = 1;

// ── Delta types (what actually goes into localStorage) ─────

interface NodeDelta {
  discovered: boolean;
  accessLevel: AccessLevel;
  compromised: boolean;
  locked?: boolean;
  lockedFilePaths?: string[]; // file paths locked by the 31% watchlist
  cachedFileContents: Record<string, string>; // path → AI-generated content only
}

interface SaveState {
  version: number;
  phase: GamePhase;
  runId: string;
  startedAt: number;
  sessionSeed: number;
  turnCount: number;
  recentCommands: string[];
  player: {
    trace: number;
    charges: number;
    tools: Tool[];
    credentialsObtained: string[]; // credential IDs only — no username/password
    exfiltratedPaths: string[]; // file paths only — content reconstructed on load
  };
  network: {
    currentNodeId: string;
    previousNodeId: string | null;
    nodes: Record<string, NodeDelta>;
  };
  aria: AriaState;
  forks: Record<string, 'pending' | 'path_a' | 'path_b'>;
  flags: Record<string, boolean>;
}

// ── Serialisation ──────────────────────────────────────────

const toSaveState = (state: GameState): SaveState => {
  const nodeDelta: Record<string, NodeDelta> = {};

  for (const [id, node] of Object.entries(state.network.nodes)) {
    if (!node || !node.discovered) continue;
    const cachedFileContents: Record<string, string> = {};
    node.files.forEach(f => {
      if (AI_GENERATED_FILE_PATHS.has(f.path) && f.content !== null) {
        cachedFileContents[f.path] = f.content;
      }
    });
    const lockedFilePaths = node.files.filter(f => f.locked).map(f => f.path);
    const delta: NodeDelta = {
      discovered: node.discovered,
      accessLevel: node.accessLevel,
      compromised: node.compromised,
      cachedFileContents,
    };
    if (node.locked !== undefined) delta.locked = node.locked;
    if (lockedFilePaths.length > 0) delta.lockedFilePaths = lockedFilePaths;
    nodeDelta[id] = delta;
  }

  return {
    version: SAVE_VERSION,
    phase: state.phase,
    runId: state.runId,
    startedAt: state.startedAt,
    sessionSeed: state.sessionSeed,
    turnCount: state.turnCount,
    recentCommands: state.recentCommands,
    player: {
      trace: state.player.trace,
      charges: state.player.charges,
      tools: state.player.tools,
      credentialsObtained: state.player.credentials.filter(c => c.obtained).map(c => c.id),
      exfiltratedPaths: state.player.exfiltrated.map(f => f.path),
    },
    network: {
      currentNodeId: state.network.currentNodeId,
      previousNodeId: state.network.previousNodeId,
      nodes: nodeDelta,
    },
    aria: state.aria,
    forks: state.forks,
    flags: state.flags,
  };
};

// ── Deserialisation ────────────────────────────────────────

const fromSaveState = (save: SaveState): GameState => {
  // Restore with the original session seed so filler nodes are reproduced identically
  const state = createInitialState(save.sessionSeed);

  state.phase = save.phase;
  state.runId = save.runId;
  state.startedAt = save.startedAt;
  state.turnCount = save.turnCount;
  state.recentCommands = save.recentCommands;

  state.player.trace = save.player.trace;
  state.player.charges = save.player.charges;
  state.player.tools = save.player.tools;

  // Mark obtained credentials by ID — username/password come from anchorNodes
  const obtainedIds = new Set(save.player.credentialsObtained);
  state.player.credentials.forEach(c => {
    if (obtainedIds.has(c.id)) c.obtained = true;
  });

  // Restore network position
  state.network.currentNodeId = save.network.currentNodeId;
  state.network.previousNodeId = save.network.previousNodeId;

  // Apply node deltas onto the fresh static node map
  for (const [id, delta] of Object.entries(save.network.nodes)) {
    const node = state.network.nodes[id];
    if (!node) continue;
    node.discovered = delta.discovered;
    node.accessLevel = delta.accessLevel;
    node.compromised = delta.compromised;
    if (delta.locked !== undefined) node.locked = delta.locked;
    // Restore file-level locks and AI-generated content
    const lockedPaths = new Set(delta.lockedFilePaths ?? []);
    node.files.forEach(f => {
      if (lockedPaths.has(f.path)) f.locked = true;
      if (f.path in delta.cachedFileContents) f.content = delta.cachedFileContents[f.path];
    });
  }

  // Reconstruct exfiltrated files from the now-updated node definitions
  // (content for AI-generated files is already applied above)
  state.player.exfiltrated = save.player.exfiltratedPaths.flatMap(path => {
    for (const node of Object.values(state.network.nodes)) {
      if (!node) continue;
      const file = node.files.find(f => f.path === path);
      if (file) return [{ ...file }];
    }
    return [];
  });

  state.aria = save.aria;
  state.forks = save.forks;
  state.flags = save.flags;

  return state;
};

// ── Public API ─────────────────────────────────────────────

export const saveGame = (state: GameState): void => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(toSaveState(state)));
  } catch (e) {
    console.warn('[persistence] saveGame failed', e);
  }
};

export const loadGame = (): GameState | null => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as SaveState;
    if (save.version !== SAVE_VERSION) {
      console.warn('[persistence] save version mismatch — discarding stale save');
      return null;
    }
    return fromSaveState(save);
  } catch (e) {
    console.warn('[persistence] loadGame failed', e);
    return null;
  }
};

export const clearSave = (): void => {
  localStorage.removeItem(SAVE_KEY);
};

export const hasSave = (): boolean => {
  return localStorage.getItem(SAVE_KEY) !== null;
};

const DISCLAIMER_KEY = 'irongate_disclaimer_agreed';
const DISCLAIMER_TTL_MS = 24 * 60 * 60 * 1000;

export const recordDisclaimerAgreement = (): void => {
  localStorage.setItem(DISCLAIMER_KEY, String(Date.now()));
};

export const disclaimerRequired = (): boolean => {
  const raw = localStorage.getItem(DISCLAIMER_KEY);
  if (!raw) return true;
  return Date.now() - Number(raw) > DISCLAIMER_TTL_MS;
};
