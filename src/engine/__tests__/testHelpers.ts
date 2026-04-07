import type { GameState, LiveNode } from '../../types/game';

// ── Minimal state factories ────────────────────────────────
// Build minimal GameState/LiveNode objects directly to avoid the heavy
// createInitialState() machinery (anchor nodes, filler nodes, employees).
// We only need enough shape to satisfy resolveCommand's runtime access patterns.

export const makeNode = (overrides: Partial<LiveNode> = {}): LiveNode => ({
  id: 'test_node',
  ip: '10.0.0.1',
  template: 'workstation',
  label: 'TEST NODE',
  description: null,
  layer: 0,
  anchor: false,
  connections: [],
  services: [],
  files: [],
  accessLevel: 'user',
  compromised: false,
  discovered: true,
  credentialHints: [],
  ...overrides,
});

export const makeState = (overrides: Partial<GameState> = {}): GameState => {
  const node = makeNode();
  return {
    phase: 'playing',
    activeChannel: null,
    contract: null,
    runId: 'test-run-id',
    startedAt: 0,
    sessionSeed: 0,
    turnCount: 0,
    recentCommands: [],
    ariaInfluencedFilesRead: [],
    decisionLog: [],
    player: {
      handle: 'ghost',
      trace: 0,
      charges: 3,
      credentials: [],
      exfiltrated: [],
      tools: [],
      burnCount: 0,
    },
    network: {
      currentNodeId: node.id,
      previousNodeId: null,
      nodes: { [node.id]: node },
    },
    aria: {
      discovered: false,
      trustScore: 50,
      messageHistory: [],
      suppressedMutations: 0,
    },
    forks: {},
    flags: {},
    employees: [],
    worldCredentials: [],
    sentinel: {
      active: false,
      mutationLog: [],
      pendingFileDeletes: [],
      messageHistory: [],
      channelEstablished: false,
    },
    ...overrides,
  };
};
