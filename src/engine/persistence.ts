import type {
  GameState,
  GamePhase,
  AccessLevel,
  AriaState,
  Tool,
  MutationEvent,
  LiveNode,
  Credential,
  GameFile,
  SentinelMessage,
  ActiveContract,
} from '../types/game';
import { createInitialState } from './state';
import { AI_GENERATED_FILE_PATHS } from '../data/anchorNodes';

const SAVE_KEY = 'irongate_save';
const SAVE_VERSION = 6;

// ── Delta types (what actually goes into localStorage) ─────

interface NodeDelta {
  discovered: boolean;
  accessLevel: AccessLevel;
  compromised: boolean;
  compromisedAtTurn?: number;
  sentinelPatched?: boolean;
  locked?: boolean;
  lockedFilePaths?: string[]; // file paths locked by watchlist protocol
  deletedFilePaths?: string[]; // file paths deleted by sentinel P3
  plantedFiles?: GameFile[]; // files added dynamically (e.g. sentinel RESET_NOTICE.txt)
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
    burnCount: number;
    tools: Tool[];
    credentialsObtained: string[]; // credential IDs only — no username/password
    credentialsRevoked: string[]; // IDs of credentials revoked by sentinel
    exfiltratedPaths: string[]; // file paths only — content reconstructed on load
  };
  network: {
    currentNodeId: string;
    previousNodeId: string | null;
    nodes: Record<string, NodeDelta>;
    sentinelNodes: LiveNode[]; // nodes dynamically spawned by sentinel P4
  };
  aria: AriaState;
  forks: Record<string, 'pending' | 'path_a' | 'path_b'>;
  flags: Record<string, boolean>;
  sentinel: {
    active: boolean;
    sentinelInterval: number;
    mutationLog: MutationEvent[];
    pendingFileDeletes: Array<{ filePath: string; nodeId: string; targetTurn: number }>;
    messageHistory: SentinelMessage[];
    channelEstablished: boolean;
  };
  worldCredentialsAdded: Credential[]; // credentials dynamically added by sentinel P2
  contract: ActiveContract | null;
  unlockAttempts?: Record<string, number>; // optional for backwards compat
}

// ── Serialisation ──────────────────────────────────────────

// Nodes dynamically spawned by sentinel (not in the seed-generated static map)
const isSentinelNode = (nodeId: string): boolean => nodeId.startsWith('sentinel_node_');

const toSaveState = (state: GameState): SaveState => {
  const nodeDelta: Record<string, NodeDelta> = {};

  for (const [id, node] of Object.entries(state.network.nodes)) {
    if (!node || !node.discovered || isSentinelNode(id)) continue;
    const cachedFileContents: Record<string, string> = {};
    node.files.forEach(f => {
      if (AI_GENERATED_FILE_PATHS.has(f.path) && f.content !== null) {
        cachedFileContents[f.path] = f.content;
      }
    });
    const lockedFilePaths = node.files.filter(f => f.locked && !f.deleted).map(f => f.path);
    const deletedFilePaths = node.files.filter(f => f.deleted).map(f => f.path);
    // Planted files are those explicitly marked as dynamically added at runtime
    const plantedFiles = node.files.filter(f => f.planted);
    const delta: NodeDelta = {
      discovered: node.discovered,
      accessLevel: node.accessLevel,
      compromised: node.compromised,
      cachedFileContents,
    };
    if (node.compromisedAtTurn !== undefined) delta.compromisedAtTurn = node.compromisedAtTurn;
    if (node.sentinelPatched) delta.sentinelPatched = node.sentinelPatched;
    if (node.locked !== undefined) delta.locked = node.locked;
    if (lockedFilePaths.length > 0) delta.lockedFilePaths = lockedFilePaths;
    if (deletedFilePaths.length > 0) delta.deletedFilePaths = deletedFilePaths;
    if (plantedFiles.length > 0) delta.plantedFiles = plantedFiles;
    nodeDelta[id] = delta;
  }

  // Sentinel-spawned nodes are not in the static map — serialize them in full
  const sentinelNodes: LiveNode[] = Object.entries(state.network.nodes)
    .filter(([id, n]) => isSentinelNode(id) && !!n)
    .map(([, n]) => n as LiveNode);

  // World credentials added dynamically by sentinel (explicitly flagged at creation time)
  const worldCredentialsAdded = state.worldCredentials.filter(c => c.sentinelRenewed);

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
      burnCount: state.player.burnCount,
      tools: state.player.tools,
      credentialsObtained: state.player.credentials.filter(c => c.obtained).map(c => c.id),
      credentialsRevoked: state.player.credentials.filter(c => c.revoked).map(c => c.id),
      exfiltratedPaths: state.player.exfiltrated.map(f => f.path),
    },
    network: {
      currentNodeId: state.network.currentNodeId,
      previousNodeId: state.network.previousNodeId,
      nodes: nodeDelta,
      sentinelNodes,
    },
    aria: state.aria,
    forks: state.forks,
    flags: state.flags,
    sentinel: {
      active: state.sentinel.active,
      sentinelInterval: state.sentinel.sentinelInterval,
      mutationLog: state.sentinel.mutationLog,
      pendingFileDeletes: state.sentinel.pendingFileDeletes,
      messageHistory: state.sentinel.messageHistory,
      channelEstablished: state.sentinel.channelEstablished,
    },
    worldCredentialsAdded,
    contract: state.contract,
    ...(Object.keys(state.unlockAttempts).length > 0 && {
      unlockAttempts: state.unlockAttempts,
    }),
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
  state.player.burnCount = save.player.burnCount;
  state.player.tools = save.player.tools;

  // Mark obtained and revoked credentials by ID — username/password come from anchorNodes
  const obtainedIds = new Set(save.player.credentialsObtained);
  const revokedIds = new Set(save.player.credentialsRevoked);
  state.player.credentials.forEach(c => {
    if (obtainedIds.has(c.id)) c.obtained = true;
    if (revokedIds.has(c.id)) c.revoked = true;
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
    if (delta.compromisedAtTurn !== undefined) node.compromisedAtTurn = delta.compromisedAtTurn;
    if (delta.sentinelPatched) node.sentinelPatched = delta.sentinelPatched;
    if (delta.locked !== undefined) node.locked = delta.locked;
    // Restore file-level mutations (locks, deletes, AI content)
    const lockedPaths = new Set(delta.lockedFilePaths);
    const deletedPaths = new Set(delta.deletedFilePaths);
    node.files.forEach(f => {
      if (lockedPaths.has(f.path)) f.locked = true;
      if (deletedPaths.has(f.path)) f.deleted = true;
      if (f.path in delta.cachedFileContents) f.content = delta.cachedFileContents[f.path];
    });
    // Re-add dynamically planted files (e.g. sentinel RESET_NOTICE.txt)
    for (const planted of delta.plantedFiles ?? []) {
      if (!node.files.some(f => f.path === planted.path)) {
        node.files.push(planted);
      }
    }
  }

  // Re-add sentinel-spawned nodes (not in seed-generated static map)
  for (const sentinelNode of save.network.sentinelNodes) {
    state.network.nodes[sentinelNode.id] = sentinelNode;
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
  state.contract = save.contract ?? null;
  state.unlockAttempts = save.unlockAttempts ?? {};

  // Restore sentinel state
  state.sentinel = save.sentinel;

  // Restore dynamically added world credentials (sentinel P2 renewals)
  for (const cred of save.worldCredentialsAdded) {
    if (!state.worldCredentials.some(c => c.id === cred.id)) {
      state.worldCredentials.push(cred);
    }
  }

  return state;
};

// ── Public API ─────────────────────────────────────────────

const TRACE_AUDIT_KEY = 'irongate_trace_audit';

export const saveGame = (state: GameState): void => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(toSaveState(state)));
    // Write audit log to its own key so the Playwright balance script can read it
    // without parsing the full save. Session-only: not restored on page reload by design.
    localStorage.setItem(TRACE_AUDIT_KEY, JSON.stringify(state.traceAuditLog));
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
  localStorage.removeItem(TRACE_AUDIT_KEY);
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
