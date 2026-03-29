import type { GameState, LiveNode } from '../types/game';
import { buildNodeMap, ANCHOR_CREDENTIALS } from '../data/anchorNodes';

export const createInitialState = (): GameState => {
  return {
    phase: 'playing',
    runId: crypto.randomUUID(),
    startedAt: Date.now(),
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
      nodes: buildNodeMap(),
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
