import type { GameState, LiveNode } from '../types/game';
import { buildNodeMap, ANCHOR_CREDENTIALS } from '../data/anchorNodes';
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

export const addTrace = (state: GameState, amount: number): GameState => {
  const trace = Math.min(100, state.player.trace + amount);
  return {
    ...state,
    player: { ...state.player, trace },
    phase: trace >= 100 ? 'burned' : state.phase,
  };
};
