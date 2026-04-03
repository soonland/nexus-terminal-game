import type { GameState, LiveNode } from '../types/game';
import { buildNodeMap, ANCHOR_CREDENTIALS, LAYER_ENTRY_NODES } from '../data/anchorNodes';
import { generateFillerNodes } from './generateFillerNodes';
import { generateEmployeePool } from './generateEmployeePool';
import { buildCredentialChains } from './buildCredentialChains';

export const createInitialState = (sessionSeed?: number): GameState => {
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

  return {
    phase: 'playing',
    runId: crypto.randomUUID(),
    startedAt: Date.now(),
    sessionSeed: resolvedSeed,
    turnCount: 0,
    recentCommands: [],
    player: {
      handle: 'ghost',
      trace: 0,
      charges: 3,
      credentials: ANCHOR_CREDENTIALS.map(c => ({ ...c })),
      exfiltrated: [],
      tools: [
        {
          id: 'port-scanner',
          name: 'Port Scanner',
          description: 'Reduces trace cost of scan by 1.',
        },
        {
          id: 'exploit-kit',
          name: 'Exploit Kit',
          description: 'Required to run exploit commands.',
        },
      ],
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
    },
    forks: {},
    flags: {},
    employees,
    worldCredentials: employeeCredentials,
  };
};

export const currentNode = (state: GameState): LiveNode => {
  const node = state.network.nodes[state.network.currentNodeId];
  if (!node) throw new Error(state.network.currentNodeId);
  return node;
};

export const TRACE_THRESHOLDS = [31, 61, 86] as const;
export const thresholdFlag = (pct: number): string => `threshold_${String(pct)}_crossed`;

export const addTrace = (state: GameState, amount: number): GameState => {
  const prevTrace = state.player.trace;
  const trace = Math.min(100, prevTrace + amount);
  let next: GameState = {
    ...state,
    player: { ...state.player, trace },
    phase: trace >= 100 ? 'burned' : state.phase,
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
    if (!n || n.layer !== burnedLayer) continue;
    nodes[id] = {
      ...n,
      accessLevel: 'none',
      compromised: false,
      files: n.files.map(f => ({ ...f, locked: false })),
      services: n.services.map(s => ({ ...s, patched: false })),
    };
  }

  const thresholdFlagsToRemove = new Set(TRACE_THRESHOLDS.map(thresholdFlag));
  const flags = Object.fromEntries(
    Object.entries(state.flags).filter(([k]) => !thresholdFlagsToRemove.has(k)),
  );

  return {
    ...state,
    phase: 'playing',
    player: { ...state.player, trace: 0 },
    network: { ...state.network, currentNodeId: entryNodeId, previousNodeId: null, nodes },
    flags,
  };
};
