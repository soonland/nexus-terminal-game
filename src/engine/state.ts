import type { GameState, LiveNode } from '../types/game';
import { buildNodeMap, ANCHOR_CREDENTIALS } from '../data/anchorNodes';
import { generateFillerNodes } from './generateFillerNodes';

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
