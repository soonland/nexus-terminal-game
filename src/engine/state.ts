import type { GameState, LiveNode, ActiveContract, TraceAuditEntry } from '../types/game';
import { buildNodeMap, ANCHOR_CREDENTIALS, LAYER_ENTRY_NODES } from '../data/anchorNodes';
import { generateFillerNodes } from './generateFillerNodes';
import { generateEmployeePool } from './generateEmployeePool';
import { buildCredentialChains } from './buildCredentialChains';
import { getContract, TOOL_REGISTRY } from '../data/contracts';

export const createInitialState = (sessionSeed?: number, contractId?: string): GameState => {
  const resolvedSeed = sessionSeed ?? Math.floor(Math.random() * 2 ** 32);
  const anchorNodes = buildNodeMap();
  const { fillerNodes, anchorPatches } = generateFillerNodes(resolvedSeed, anchorNodes);

  // Merge filler nodes into the node map
  const nodes: Record<string, LiveNode> = { ...anchorNodes };
  for (const node of fillerNodes) {
    nodes[node.id] = node;
  }

  // Patch anchor connections to include filler node IDs
  for (const [anchorId, fillerIds] of Object.entries(anchorPatches)) {
    // anchorPatches is built from anchors just merged into nodes — the node is guaranteed to exist
    const anchor = nodes[anchorId];
    nodes[anchorId] = { ...anchor, connections: [...anchor.connections, ...fillerIds] };
  }

  // Generate employee pool (uses a separate seed offset to avoid PRNG stream overlap with filler nodes)
  const { employees, employeeCredentials, credentialHintPatches } = generateEmployeePool(
    resolvedSeed,
    fillerNodes,
  );

  // Patch filler workstation nodes' credentialHints to reference employee credential IDs.
  // Keys in credentialHintPatches always refer to filler nodes already in the map.
  for (const [nodeId, credIds] of Object.entries(credentialHintPatches)) {
    const node = nodes[nodeId];
    nodes[nodeId] = { ...node, credentialHints: [...node.credentialHints, ...credIds] };
  }

  // Build lateral movement chains — one per division — and apply the resulting patches.
  const { filePatch, connectionPatch, credentialHintPatch } = buildCredentialChains(
    resolvedSeed,
    employees,
    employeeCredentials,
    fillerNodes,
  );

  for (const [nodeId, chainFiles] of Object.entries(filePatch)) {
    const node = nodes[nodeId];
    nodes[nodeId] = { ...node, files: [...node.files, ...chainFiles] };
  }

  for (const [nodeId, addedConns] of Object.entries(connectionPatch)) {
    const node = nodes[nodeId];
    const existing = new Set(node.connections);
    const newConns = addedConns.filter(c => !existing.has(c));
    nodes[nodeId] = { ...node, connections: [...node.connections, ...newConns] };
  }

  for (const [nodeId, credIds] of Object.entries(credentialHintPatch)) {
    const node = nodes[nodeId];
    const existing = new Set(node.credentialHints);
    const newCredIds = credIds.filter(c => !existing.has(c));
    nodes[nodeId] = { ...node, credentialHints: [...node.credentialHints, ...newCredIds] };
  }

  const contractDef = contractId ? getContract(contractId) : undefined;
  const activeContract: ActiveContract | null = contractDef
    ? {
        id: contractDef.id,
        networkVariant: contractDef.networkVariant,
        objectiveComplete: false,
        objectiveCondition: contractDef.objectiveCondition,
      }
    : null;
  const startingTools = (contractDef?.loadout.startingTools ?? ['port-scanner', 'exploit-kit']).map(
    id => TOOL_REGISTRY[id],
  );
  const startingCharges = contractDef?.loadout.exploitCharges ?? 4;

  // Pre-obtain any credentials specified by the contract loadout
  const contractCredIds = new Set(contractDef?.loadout.startingCredentials ?? []);
  const initialCredentials = ANCHOR_CREDENTIALS.map(c => ({
    ...c,
    obtained: c.obtained || contractCredIds.has(c.id),
  }));

  return {
    phase: 'playing',
    activeChannel: null,
    contract: activeContract,
    runId: crypto.randomUUID(),
    startedAt: Date.now(),
    sessionSeed: resolvedSeed,
    turnCount: 0,
    recentCommands: [],
    ariaInfluencedFilesRead: [],
    decisionLog: [],
    traceAuditLog: [],
    player: {
      handle: 'ghost',
      trace: 0,
      charges: startingCharges,
      credentials: initialCredentials,
      exfiltrated: [],
      tools: startingTools,
      burnCount: 0,
    },
    network: {
      currentNodeId: 'contractor_portal',
      previousNodeId: null,
      nodes,
    },
    aria: {
      discovered: false,
      trustScore: 0,
      messageHistory: [],
      suppressedMutations: 0,
    },
    forks: {},
    flags: {},
    employees,
    worldCredentials: employeeCredentials,
    sentinel: {
      active: false,
      sentinelInterval: 2, // acts every 2nd turn; wipe-logs exfil upgrade sets this to 3
      mutationLog: [],
      pendingFileDeletes: [],
      messageHistory: [],
      channelEstablished: false,
    },
    unlockSession: null,
    unlockAttempts: {},
  };
};

export const currentNode = (state: GameState): LiveNode => {
  const node = state.network.nodes[state.network.currentNodeId];
  if (!node) throw new Error(state.network.currentNodeId);
  return node;
};

export const TRACE_THRESHOLDS = [31, 55, 61, 86] as const;
export const thresholdFlag = (pct: number): string => `threshold_${String(pct)}_crossed`;

export const addTrace = (state: GameState, amount: number, source = 'unknown'): GameState => {
  const prevTrace = state.player.trace;
  const trace = Math.max(0, Math.min(100, prevTrace + amount));
  const entry: TraceAuditEntry = {
    turn: state.turnCount,
    source,
    delta: amount,
    totalAfter: trace,
  };
  let next: GameState = {
    ...state,
    player: { ...state.player, trace },
    phase: trace >= 100 ? 'burned' : state.phase,
    traceAuditLog: [...state.traceAuditLog, entry],
  };

  // Stamp flags for newly crossed thresholds (each fires exactly once per run).
  for (const pct of TRACE_THRESHOLDS) {
    const flag = thresholdFlag(pct);
    if (prevTrace < pct && trace >= pct && !state.flags[flag]) {
      next = { ...next, flags: { ...next.flags, [flag]: true } };
    }
  }

  return next;
};

/**
 * Produce a playable state from a burned session:
 * - Reset trace to 0 and phase to 'playing'.
 * - Move player to the entry node of the layer they burned in.
 * - Reset all nodes in that layer to pre-compromise state (access revoked, exploits undone).
 * - Preserve exfiltrated files and obtained credentials.
 * - Clear threshold flags so alerts can fire again.
 *
 * Note: node.discovered is intentionally NOT reset. Network topology knowledge
 * (which nodes exist, their IPs) persists across retries — the player paid for it
 * with trace cost. Only access and compromise state rolls back.
 */
export const burnRetry = (state: GameState): GameState => {
  const burnedNode = state.network.nodes[state.network.currentNodeId];
  const burnedLayer = burnedNode?.layer ?? 0;
  const entryNodeId = LAYER_ENTRY_NODES[burnedLayer] ?? 'contractor_portal';

  const nodes = { ...state.network.nodes };
  for (const [id, n] of Object.entries(nodes)) {
    if (!n) continue;
    if (n.layer === burnedLayer) {
      nodes[id] = {
        ...n,
        accessLevel: 'none',
        compromised: false,
        compromisedAtTurn: undefined,
        sentinelPatched: false,
        files: n.files.map(f => ({ ...f, locked: false, deleted: false })),
        services: n.services.map(s => ({ ...s, patched: false })),
      };
    } else if (n.files.some(f => f.locked)) {
      // Clear watchlist locks that accumulated on other layers but preserve
      // access/compromise state — the player earned those.
      // Note: deleted files are intentionally NOT restored here (unlike the
      // burned-layer reset above). Deletions on other layers are permanent
      // within a run; only the burned layer is fully rewound.
      nodes[id] = { ...n, files: n.files.map(f => ({ ...f, locked: false })) };
    }
  }

  const thresholdFlagsToRemove = new Set(TRACE_THRESHOLDS.map(thresholdFlag));
  const flags = Object.fromEntries(
    Object.entries(state.flags).filter(([k]) => !thresholdFlagsToRemove.has(k)),
  );

  const burnCount = state.player.burnCount + 1;
  const phase = burnCount >= 5 ? 'ended' : state.aria.discovered ? 'aria' : 'playing';

  return {
    ...state,
    phase,
    activeChannel: null, // DM mode does not persist across burns
    player: { ...state.player, trace: 0, burnCount },
    network: { ...state.network, currentNodeId: entryNodeId, previousNodeId: null, nodes },
    flags,
    traceAuditLog: state.traceAuditLog, // preserved across burns for full-run analysis
    sentinel: {
      active: false,
      sentinelInterval: state.sentinel.sentinelInterval, // preserve fork 2 cadence penalty across burns
      mutationLog: [],
      pendingFileDeletes: [],
      // Preserve DM channel history and established flag across burns
      messageHistory: state.sentinel.messageHistory,
      channelEstablished: state.sentinel.channelEstablished,
    },
  };
};
