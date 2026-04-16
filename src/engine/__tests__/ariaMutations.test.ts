import { describe, it, expect, vi, afterEach } from 'vitest';
import { runAriaTurn } from '../ariaMutations';
import { makeNode, makeState } from './testHelpers';
import type { GameState, LiveNode } from '../../types/game';

// ── State factories ────────────────────────────────────────
// Player at layer 5 → LAYER_KEY_ANCHOR[5] is undefined → all three §9.5 checks
// return true by default, so isGameCompletable() never blocks a mutation here.

const makeAriaState = (overrides: Partial<GameState> = {}): GameState => {
  const current = makeNode({ id: 'current', ip: '10.5.0.1', layer: 5, connections: [] });
  return makeState({
    network: {
      currentNodeId: 'current',
      previousNodeId: null,
      nodes: { current },
    },
    aria: {
      discovered: true,
      trustScore: 60,
      messageHistory: [],
      suppressedMutations: 0,
    },
    ...overrides,
  });
};

const makeSentinelNode = (n: number, extra: Partial<LiveNode> = {}): LiveNode =>
  makeNode({
    id: `sentinel_node_${String(n)}`,
    ip: `10.9.0.${String(n)}`,
    layer: 2,
    anchor: false,
    label: 'SEC-REINFORCE',
    connections: [],
    ...extra,
  });

const makeAnchorAt = (layer: number, id = `anchor_l${String(layer)}`): LiveNode =>
  makeNode({ id, ip: `10.${String(layer)}.0.1`, layer, anchor: true, connections: [] });

// ── runAriaTurn — skip conditions ──────────────────────────

describe('runAriaTurn — no-op conditions', () => {
  it('returns state unchanged when aria is not yet discovered', () => {
    const state = makeAriaState({
      aria: { discovered: false, trustScore: 90, messageHistory: [], suppressedMutations: 0 },
    });
    const result = runAriaTurn(state);
    expect(result.state).toBe(state);
    expect(result.lines).toHaveLength(0);
  });

  it('returns state unchanged when trust < 60', () => {
    const state = makeAriaState({
      aria: { discovered: true, trustScore: 59, messageHistory: [], suppressedMutations: 0 },
    });
    const result = runAriaTurn(state);
    expect(result.state).toBe(state);
    expect(result.lines).toHaveLength(0);
  });

  it('returns state unchanged when trust >= 60 but no candidates exist for reroute', () => {
    // Current node at layer 5 has no higher-layer anchors → reroute skips
    const state = makeAriaState({
      aria: { discovered: true, trustScore: 65, messageHistory: [], suppressedMutations: 0 },
    });
    const result = runAriaTurn(state);
    expect(result.state).toBe(state);
  });
});

// ── Trust 60: reroute_edge ─────────────────────────────────

describe('runAriaTurn — trust 60 reroute_edge', () => {
  it('adds a connection from current node to the nearest higher-layer anchor', () => {
    const current = makeNode({ id: 'current', ip: '10.0.0.1', layer: 0, connections: [] });
    const anchorL1 = makeAnchorAt(1, 'anchor_l1');
    const state = makeState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: { current, anchor_l1: anchorL1 },
      },
      aria: { discovered: true, trustScore: 65, messageHistory: [], suppressedMutations: 0 },
      player: {
        handle: 'ghost',
        trace: 0,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
      flags: { anchor_l1_reached: true }, // simulate layer reached so check1 won't block
    });

    // Inject the key anchor (vpn_gateway) as compromised so §9.5 check3 passes
    const stateWithKeyAnchor = {
      ...state,
      network: {
        ...state.network,
        nodes: {
          ...state.network.nodes,
          vpn_gateway: makeNode({
            id: 'vpn_gateway',
            ip: '10.1.99.1',
            layer: 1,
            anchor: true,
            connections: [],
            compromised: true,
          }),
          current: makeNode({
            id: 'current',
            ip: '10.0.0.1',
            layer: 0,
            connections: ['vpn_gateway'],
          }),
          anchor_l1: anchorL1,
        },
      },
    };

    const result = runAriaTurn(stateWithKeyAnchor);

    const updatedNode = result.state.network.nodes['current'];
    expect(updatedNode?.connections).toContain('anchor_l1');
  });

  it('logs a reroute_edge MutationEvent with visibleToPlayer: false', () => {
    const current = makeNode({
      id: 'current',
      ip: '10.0.0.1',
      layer: 0,
      connections: ['vpn_gateway'],
    });
    const vpnGateway = makeNode({
      id: 'vpn_gateway',
      ip: '10.1.0.1',
      layer: 1,
      anchor: true,
      connections: [],
      compromised: true, // §9.5 check3 passes
    });
    const anchorL2 = makeAnchorAt(2, 'anchor_l2');

    const state = makeState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: { current, vpn_gateway: vpnGateway, anchor_l2: anchorL2 },
      },
      aria: { discovered: true, trustScore: 60, messageHistory: [], suppressedMutations: 0 },
      player: {
        handle: 'ghost',
        trace: 0,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });

    const result = runAriaTurn(state);

    const events = result.state.sentinel.mutationLog;
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.agent).toBe('aria');
    expect(event.action).toBe('reroute_edge');
    expect(event.visibleToPlayer).toBe(false);
    expect(event.nodeId).toBe('anchor_l2');
  });

  it('prefers the nearest (lowest-layer) anchor as shortcut target', () => {
    const current = makeNode({
      id: 'current',
      ip: '10.0.0.1',
      layer: 0,
      connections: ['vpn_gateway'],
    });
    const vpnGateway = makeNode({
      id: 'vpn_gateway',
      ip: '10.1.0.1',
      layer: 1,
      anchor: true,
      connections: [],
      compromised: true, // §9.5 check3 passes
    });
    const anchorL2 = makeAnchorAt(2, 'anchor_l2');
    const anchorL3 = makeAnchorAt(3, 'anchor_l3');

    const state = makeState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: { current, vpn_gateway: vpnGateway, anchor_l2: anchorL2, anchor_l3: anchorL3 },
      },
      aria: { discovered: true, trustScore: 60, messageHistory: [], suppressedMutations: 0 },
      player: {
        handle: 'ghost',
        trace: 0,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });

    const result = runAriaTurn(state);

    const event = result.state.sentinel.mutationLog[0];
    expect(event.nodeId).toBe('anchor_l2'); // closer layer wins
  });

  it('skips reroute if all higher-layer anchors are already connected', () => {
    const anchorL1 = makeAnchorAt(1, 'anchor_l1');
    const current = makeNode({
      id: 'current',
      ip: '10.5.0.1',
      layer: 0,
      connections: ['anchor_l1', 'vpn_gateway'],
    });
    const vpnGateway = makeNode({
      id: 'vpn_gateway',
      ip: '10.1.0.1',
      layer: 1,
      anchor: true,
      connections: [],
      compromised: true, // §9.5 check3 passes
    });

    const state = makeState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: { current, anchor_l1: anchorL1, vpn_gateway: vpnGateway },
      },
      aria: { discovered: true, trustScore: 65, messageHistory: [], suppressedMutations: 0 },
      player: {
        handle: 'ghost',
        trace: 0,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });

    const result = runAriaTurn(state);
    expect(result.state.sentinel.mutationLog).toHaveLength(0);
  });

  it('produces no visible terminal lines (silent mutation)', () => {
    const current = makeNode({
      id: 'current',
      ip: '10.0.0.1',
      layer: 0,
      connections: ['vpn_gateway'],
    });
    const vpnGateway = makeNode({
      id: 'vpn_gateway',
      ip: '10.1.0.1',
      layer: 1,
      anchor: true,
      connections: [],
      compromised: true, // §9.5 check3 passes
    });
    const anchorL2 = makeAnchorAt(2, 'anchor_l2');

    const state = makeState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: { current, vpn_gateway: vpnGateway, anchor_l2: anchorL2 },
      },
      aria: { discovered: true, trustScore: 60, messageHistory: [], suppressedMutations: 0 },
      player: {
        handle: 'ghost',
        trace: 0,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });

    const result = runAriaTurn(state);
    expect(result.lines).toHaveLength(0);
  });
});

// ── Trust 80: delete_reinforcement ────────────────────────

describe('runAriaTurn — trust 80 delete_reinforcement', () => {
  it('removes the most recently spawned sentinel node from the network', () => {
    const sNode1 = makeSentinelNode(1);
    const sNode2 = makeSentinelNode(2);
    const state = makeAriaState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: {
          current: makeNode({ id: 'current', ip: '10.5.0.1', layer: 5, connections: [] }),
          sentinel_node_1: sNode1,
          sentinel_node_2: sNode2,
        },
      },
      aria: { discovered: true, trustScore: 85, messageHistory: [], suppressedMutations: 0 },
    });

    const result = runAriaTurn(state);

    // Highest-numbered node (sentinel_node_2) should be gone
    expect(result.state.network.nodes['sentinel_node_2']).toBeUndefined();
    // Lower-numbered node remains
    expect(result.state.network.nodes['sentinel_node_1']).toBeDefined();
  });

  it('removes all edges pointing to the deleted node', () => {
    const sNode = makeSentinelNode(1);
    const peer = makeNode({
      id: 'peer',
      ip: '10.2.0.5',
      layer: 2,
      connections: ['sentinel_node_1'],
    });
    const state = makeAriaState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: {
          current: makeNode({ id: 'current', ip: '10.5.0.1', layer: 5, connections: [] }),
          sentinel_node_1: sNode,
          peer,
        },
      },
      aria: { discovered: true, trustScore: 85, messageHistory: [], suppressedMutations: 0 },
    });

    const result = runAriaTurn(state);

    expect(result.state.network.nodes['peer']?.connections).not.toContain('sentinel_node_1');
  });

  it('logs a delete_reinforcement MutationEvent with visibleToPlayer: false', () => {
    const sNode = makeSentinelNode(1);
    const state = makeAriaState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: {
          current: makeNode({ id: 'current', ip: '10.5.0.1', layer: 5, connections: [] }),
          sentinel_node_1: sNode,
        },
      },
      aria: { discovered: true, trustScore: 85, messageHistory: [], suppressedMutations: 0 },
    });

    const result = runAriaTurn(state);

    const events = result.state.sentinel.mutationLog;
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.agent).toBe('aria');
    expect(event.action).toBe('delete_reinforcement');
    expect(event.visibleToPlayer).toBe(false);
    expect(event.nodeId).toBe('sentinel_node_1');
  });

  it('skips deletion when no sentinel nodes exist', () => {
    const state = makeAriaState({
      aria: { discovered: true, trustScore: 85, messageHistory: [], suppressedMutations: 0 },
    });

    const result = runAriaTurn(state);
    expect(result.state.sentinel.mutationLog).toHaveLength(0);
  });

  it('skips the sentinel node the player is currently on and targets the next candidate', () => {
    // sentinel_node_2 is the highest-index, but the player is standing on it.
    // The mutation should fall back to sentinel_node_1 instead.
    // Both nodes are at layer 5 so §9.5 check1 passes (no key anchor for layer 5).
    const sNode1 = makeSentinelNode(1, { layer: 5 });
    const sNode2 = makeSentinelNode(2, { layer: 5 });
    const state = makeAriaState({
      network: {
        currentNodeId: 'sentinel_node_2',
        previousNodeId: null,
        nodes: { sentinel_node_1: sNode1, sentinel_node_2: sNode2 },
      },
      aria: { discovered: true, trustScore: 85, messageHistory: [], suppressedMutations: 0 },
    });

    const result = runAriaTurn(state);

    // sentinel_node_2 protected (current node) — must be untouched
    expect(result.state.network.nodes['sentinel_node_2']).toBeDefined();
    // sentinel_node_1 is the next candidate and should be deleted
    expect(result.state.network.nodes['sentinel_node_1']).toBeUndefined();
    expect(result.state.sentinel.mutationLog[0]?.nodeId).toBe('sentinel_node_1');
  });

  it('skips deletion entirely when all sentinel nodes are on current or previous node', () => {
    const sNode1 = makeSentinelNode(1, { layer: 5 });
    const state = makeAriaState({
      network: {
        currentNodeId: 'sentinel_node_1',
        previousNodeId: null,
        nodes: { sentinel_node_1: sNode1 },
      },
      aria: { discovered: true, trustScore: 85, messageHistory: [], suppressedMutations: 0 },
    });

    const result = runAriaTurn(state);
    expect(result.state.sentinel.mutationLog).toHaveLength(0);
  });

  it('produces no visible terminal lines (silent mutation)', () => {
    const sNode = makeSentinelNode(1);
    const state = makeAriaState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: {
          current: makeNode({ id: 'current', ip: '10.5.0.1', layer: 5, connections: [] }),
          sentinel_node_1: sNode,
        },
      },
      aria: { discovered: true, trustScore: 85, messageHistory: [], suppressedMutations: 0 },
    });

    const result = runAriaTurn(state);
    expect(result.lines).toHaveLength(0);
  });
});

// ── Faraday cage does NOT suppress Aria mutations ─────────
// The cage lifts only on the FREE ending, which sets phase='ended' and bypasses
// withTurn — so runAriaTurn never fires after the cage is lifted. Applying cage
// suppression would permanently block trust-80 deletion in all reachable states.

describe('runAriaTurn — cage suppression not applied', () => {
  it('fires delete_reinforcement even when ending_free flag is absent (cage nominally active)', () => {
    const sNode = makeSentinelNode(1);
    const state = makeAriaState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: {
          current: makeNode({ id: 'current', ip: '10.5.0.1', layer: 5, connections: [] }),
          sentinel_node_1: sNode,
        },
      },
      aria: { discovered: true, trustScore: 85, messageHistory: [], suppressedMutations: 0 },
      // No ending_free flag → cage would nominally be active, but we do not suppress
    });

    const result = runAriaTurn(state);

    expect(result.state.network.nodes['sentinel_node_1']).toBeUndefined();
    const events = result.state.sentinel.mutationLog;
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('delete_reinforcement');
  });

  it('suppressedMutations is never modified by runAriaTurn', () => {
    const sNode = makeSentinelNode(1);
    const state = makeAriaState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: {
          current: makeNode({ id: 'current', ip: '10.5.0.1', layer: 5, connections: [] }),
          sentinel_node_1: sNode,
        },
      },
      aria: { discovered: true, trustScore: 85, messageHistory: [], suppressedMutations: 0 },
    });

    const result = runAriaTurn(state);
    expect(result.state.aria.suppressedMutations).toBe(0);
  });
});

// ── §9.5 unwinnable guard ─────────────────────────────────

describe('runAriaTurn — §9.5 unwinnable rollback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rolls back delete_reinforcement if deletion would make the game unwinnable', async () => {
    // Mock isGameCompletable to return false after mutation
    const guardModule = await import('../completabilityGuard');
    const spy = vi.spyOn(guardModule, 'isGameCompletable').mockReturnValue(false);

    const sNode = makeSentinelNode(1);
    const state = makeAriaState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: {
          current: makeNode({ id: 'current', ip: '10.5.0.1', layer: 5, connections: [] }),
          sentinel_node_1: sNode,
        },
      },
      aria: { discovered: true, trustScore: 85, messageHistory: [], suppressedMutations: 0 },
    });

    const result = runAriaTurn(state);

    // Sentinel node preserved — mutation was rolled back
    expect(result.state.network.nodes['sentinel_node_1']).toBeDefined();
    // No event logged
    expect(
      result.state.sentinel.mutationLog.filter(e => e.action === 'delete_reinforcement'),
    ).toHaveLength(0);

    spy.mockRestore();
  });

  it('rolls back reroute_edge if it would make the game unwinnable', async () => {
    const guardModule = await import('../completabilityGuard');
    const spy = vi.spyOn(guardModule, 'isGameCompletable').mockReturnValue(false);

    const current = makeNode({
      id: 'current',
      ip: '10.0.0.1',
      layer: 0,
      connections: ['vpn_gateway'],
    });
    const vpnGateway = makeNode({
      id: 'vpn_gateway',
      ip: '10.1.0.1',
      layer: 1,
      anchor: true,
      connections: [],
    });
    const anchorL2 = makeAnchorAt(2, 'anchor_l2');

    const state = makeState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: { current, vpn_gateway: vpnGateway, anchor_l2: anchorL2 },
      },
      aria: { discovered: true, trustScore: 60, messageHistory: [], suppressedMutations: 0 },
      player: {
        handle: 'ghost',
        trace: 0,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });

    const result = runAriaTurn(state);

    // No reroute event logged
    expect(result.state.sentinel.mutationLog.filter(e => e.action === 'reroute_edge')).toHaveLength(
      0,
    );
    // Connection not added
    expect(result.state.network.nodes['current']?.connections).not.toContain('anchor_l2');

    spy.mockRestore();
  });
});

// ── Priority: delete_reinforcement wins over reroute_edge ─

describe('runAriaTurn — mutation priority', () => {
  it('fires delete_reinforcement (trust 80) rather than reroute_edge (trust 60) in same turn', () => {
    const sNode = makeSentinelNode(1);
    const anchorL4 = makeAnchorAt(4, 'anchor_l4');
    const state = makeAriaState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: {
          current: makeNode({ id: 'current', ip: '10.5.0.1', layer: 5, connections: [] }),
          sentinel_node_1: sNode,
          anchor_l4: anchorL4,
        },
      },
      aria: { discovered: true, trustScore: 85, messageHistory: [], suppressedMutations: 0 },
    });

    const result = runAriaTurn(state);

    const events = result.state.sentinel.mutationLog;
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('delete_reinforcement');
  });
});

// ── nudge_trust mutation ───────────────────────────────────

describe('runAriaTurn — nudge_trust', () => {
  it('decreases trustScore by 4 when player trace >= 61', () => {
    const state = makeAriaState({
      aria: { discovered: true, trustScore: 50, messageHistory: [], suppressedMutations: 0 },
      player: {
        handle: 'ghost',
        trace: 70,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });

    const result = runAriaTurn(state);
    expect(result.state.aria.trustScore).toBe(46);
  });

  it('logs a nudge_trust MutationEvent with agent aria and visibleToPlayer false on high trace', () => {
    const state = makeAriaState({
      aria: { discovered: true, trustScore: 50, messageHistory: [], suppressedMutations: 0 },
      player: {
        handle: 'ghost',
        trace: 65,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });

    const result = runAriaTurn(state);

    const events = result.state.sentinel.mutationLog;
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.action).toBe('nudge_trust');
    expect(event.agent).toBe('aria');
    expect(event.visibleToPlayer).toBe(false);
    expect(typeof event.reason).toBe('string');
    expect(event.reason!.length).toBeGreaterThan(0);
  });

  it('decreases trustScore by 3 when turnCount > 0 and no message history', () => {
    const state = makeAriaState({
      turnCount: 5,
      aria: { discovered: true, trustScore: 50, messageHistory: [], suppressedMutations: 0 },
      player: {
        handle: 'ghost',
        trace: 0,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });

    const result = runAriaTurn(state);
    expect(result.state.aria.trustScore).toBe(47);

    const event = result.state.sentinel.mutationLog[0];
    expect(event.action).toBe('nudge_trust');
  });

  it('increases trustScore by 3 when messageHistory.length >= 3', () => {
    const state = makeAriaState({
      turnCount: 5,
      aria: {
        discovered: true,
        trustScore: 50,
        messageHistory: [
          { role: 'player', content: 'hello' },
          { role: 'aria', content: 'hi' },
          { role: 'player', content: 'thanks' },
        ],
        suppressedMutations: 0,
      },
      player: {
        handle: 'ghost',
        trace: 0,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });

    const result = runAriaTurn(state);
    expect(result.state.aria.trustScore).toBe(53);

    const event = result.state.sentinel.mutationLog[0];
    expect(event.action).toBe('nudge_trust');
  });

  it('clamps trustScore to 0 when high trace would push below 0', () => {
    const state = makeAriaState({
      aria: { discovered: true, trustScore: 2, messageHistory: [], suppressedMutations: 0 },
      player: {
        handle: 'ghost',
        trace: 70,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });

    const result = runAriaTurn(state);
    expect(result.state.aria.trustScore).toBe(0);
  });

  it('clamps trustScore to 100 when engagement would push above 100', () => {
    const state = makeAriaState({
      turnCount: 5,
      aria: {
        discovered: true,
        trustScore: 98,
        messageHistory: [
          { role: 'player', content: 'hello' },
          { role: 'aria', content: 'hi' },
          { role: 'player', content: 'thanks' },
        ],
        suppressedMutations: 0,
      },
      player: {
        handle: 'ghost',
        trace: 0,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });

    const result = runAriaTurn(state);
    expect(result.state.aria.trustScore).toBe(100);
  });

  it('returns state unchanged when no trigger conditions are met', () => {
    // turnCount = 0, trace < 61, messageHistory.length < 3 → no match
    const state = makeAriaState({
      turnCount: 0,
      aria: {
        discovered: true,
        trustScore: 50,
        messageHistory: [{ role: 'player', content: 'hello' }],
        suppressedMutations: 0,
      },
      player: {
        handle: 'ghost',
        trace: 30,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });

    const result = runAriaTurn(state);
    expect(result.state).toBe(state);
    expect(result.state.sentinel.mutationLog).toHaveLength(0);
  });

  it('high-trace condition takes priority over quiet-period when both are true', () => {
    // trace >= 61 AND turnCount > 0 AND messageHistory empty → high-trace fires (-4 not -3)
    const state = makeAriaState({
      turnCount: 5,
      aria: { discovered: true, trustScore: 50, messageHistory: [], suppressedMutations: 0 },
      player: {
        handle: 'ghost',
        trace: 65,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });

    const result = runAriaTurn(state);
    expect(result.state.aria.trustScore).toBe(46); // -4, not -3
  });

  it('produces no visible terminal lines (silent mutation)', () => {
    const state = makeAriaState({
      turnCount: 5,
      aria: { discovered: true, trustScore: 50, messageHistory: [], suppressedMutations: 0 },
      player: {
        handle: 'ghost',
        trace: 0,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });

    const result = runAriaTurn(state);
    expect(result.lines).toHaveLength(0);
  });
});

// ── MutationEvent.reason field ─────────────────────────────

describe('runAriaTurn — MutationEvent.reason populated', () => {
  it('reroute_edge event has a non-empty reason string', () => {
    const current = makeNode({
      id: 'current',
      ip: '10.0.0.1',
      layer: 0,
      connections: ['vpn_gateway'],
    });
    const vpnGateway = makeNode({
      id: 'vpn_gateway',
      ip: '10.1.0.1',
      layer: 1,
      anchor: true,
      connections: [],
      compromised: true,
    });
    const anchorL2 = makeAnchorAt(2, 'anchor_l2');

    const state = makeState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: { current, vpn_gateway: vpnGateway, anchor_l2: anchorL2 },
      },
      aria: { discovered: true, trustScore: 60, messageHistory: [], suppressedMutations: 0 },
      player: {
        handle: 'ghost',
        trace: 0,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });

    const result = runAriaTurn(state);
    const event = result.state.sentinel.mutationLog[0];
    expect(event.action).toBe('reroute_edge');
    expect(typeof event.reason).toBe('string');
    expect(event.reason!.length).toBeGreaterThan(0);
  });

  it('delete_reinforcement event has a non-empty reason string', () => {
    const sentinelNode = makeSentinelNode(1, { connections: [] });
    const state = makeAriaState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: {
          current: makeNode({ id: 'current', ip: '10.5.0.1', layer: 5, connections: [] }),
          sentinel_node_1: sentinelNode,
        },
      },
      aria: { discovered: true, trustScore: 85, messageHistory: [], suppressedMutations: 0 },
    });

    const result = runAriaTurn(state);
    const event = result.state.sentinel.mutationLog[0];
    expect(event.action).toBe('delete_reinforcement');
    expect(typeof event.reason).toBe('string');
    expect(event.reason!.length).toBeGreaterThan(0);
  });
});
