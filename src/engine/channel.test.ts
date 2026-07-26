import { describe, it, expect } from 'vitest';
import { layerReachedFlag, isChannelBlocked, detectChannelTrigger } from './channel';
import { thresholdFlag } from './state';
import { makeState, makeNode } from './__tests__/testHelpers';
import type { GameState } from '../types/game';

// ── layerReachedFlag ──────────────────────────────────────────────────────────

describe('layerReachedFlag', () => {
  it('should return the correct flag key for layer 0', () => {
    expect(layerReachedFlag(0)).toBe('layer_0_reached');
  });

  it('should return the correct flag key for layer 1', () => {
    expect(layerReachedFlag(1)).toBe('layer_1_reached');
  });

  it('should return the correct flag key for layer 5', () => {
    expect(layerReachedFlag(5)).toBe('layer_5_reached');
  });
});

// ── isChannelBlocked ─────────────────────────────────────────────────────────

describe('isChannelBlocked', () => {
  it('should return true when phase is "burned"', () => {
    const state = makeState({ phase: 'burned' });
    expect(isChannelBlocked(state)).toBe(true);
  });

  it('should return true when phase is "ended"', () => {
    const state = makeState({ phase: 'ended' });
    expect(isChannelBlocked(state)).toBe(true);
  });

  it('should return false when trace is 85 and phase is playing', () => {
    const state = makeState({
      player: {
        handle: 'ghost',
        trace: 85,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });
    expect(isChannelBlocked(state)).toBe(false);
  });

  it('should return false when trace is exactly 86 (trigger fires at 86, block kicks in above)', () => {
    const state = makeState({
      player: {
        handle: 'ghost',
        trace: 86,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });
    expect(isChannelBlocked(state)).toBe(false);
  });

  it('should return true when trace is exactly 87', () => {
    const state = makeState({
      player: {
        handle: 'ghost',
        trace: 87,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });
    expect(isChannelBlocked(state)).toBe(true);
  });

  it('should return true when trace is 100', () => {
    const state = makeState({
      player: {
        handle: 'ghost',
        trace: 100,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });
    expect(isChannelBlocked(state)).toBe(true);
  });

  it('should return false for a default state with trace 0', () => {
    const state = makeState();
    expect(isChannelBlocked(state)).toBe(false);
  });
});

// ── detectChannelTrigger ─────────────────────────────────────────────────────

/**
 * Build a state with trace set, resetting the full player object for simplicity.
 * Current node defaults to layer 3 so Sentinel's layer floor (SENTINEL_MIN_LAYER)
 * doesn't suppress the trigger under test.
 */
const stateWithTrace = (trace: number, flags: Record<string, boolean> = {}): GameState => {
  const node = makeNode({ id: 'test_node', layer: 3 });
  return makeState({
    player: {
      handle: 'ghost',
      trace,
      charges: 3,
      credentials: [],
      exfiltrated: [],
      tools: [],
      burnCount: 0,
    },
    network: { currentNodeId: node.id, previousNodeId: null, nodes: { [node.id]: node } },
    flags,
  });
};

describe('detectChannelTrigger — channel blocked in nextState', () => {
  it('should return null when nextState phase is "burned"', () => {
    const prev = makeState();
    const next = makeState({ phase: 'burned' });
    expect(detectChannelTrigger(prev, next, 'scan')).toBeNull();
  });

  it('should return null when nextState trace > 86', () => {
    const prev = stateWithTrace(86);
    const next = stateWithTrace(87);
    expect(detectChannelTrigger(prev, next, 'scan')).toBeNull();
  });
});

describe('detectChannelTrigger — trace threshold crossings', () => {
  it('should fire trace_31 when the 31% flag is newly set in nextState', () => {
    const flag = thresholdFlag(31);
    const prev = stateWithTrace(30, {});
    const next = stateWithTrace(31, { [flag]: true });
    const trigger = detectChannelTrigger(prev, next, 'scan');
    expect(trigger).not.toBeNull();
    expect(trigger?.triggerType).toBe('trace_31');
  });

  it('should NOT fire trace_31 when the flag was already set in prevState', () => {
    const flag = thresholdFlag(31);
    const prev = stateWithTrace(31, { [flag]: true });
    const next = stateWithTrace(32, { [flag]: true });
    expect(detectChannelTrigger(prev, next, 'scan')).toBeNull();
  });

  it('should fire trace_61 when the 61% flag is newly set in nextState', () => {
    const flag = thresholdFlag(61);
    const prev = stateWithTrace(60, {});
    // trace 61 is < 86 so the channel is not blocked
    const next = stateWithTrace(61, { [flag]: true });
    const trigger = detectChannelTrigger(prev, next, 'scan');
    expect(trigger).not.toBeNull();
    expect(trigger?.triggerType).toBe('trace_61');
  });

  it('should NOT fire trace_61 when the flag was already set in prevState', () => {
    const flag = thresholdFlag(61);
    const prev = stateWithTrace(62, { [flag]: true });
    const next = stateWithTrace(63, { [flag]: true });
    expect(detectChannelTrigger(prev, next, 'scan')).toBeNull();
  });

  it('should fire trace_86 when trace crosses to exactly 86 (channel open at 86, blocked above)', () => {
    const flag = thresholdFlag(86);
    const prev = stateWithTrace(85, {});
    const next = stateWithTrace(86, { [flag]: true });
    const trigger = detectChannelTrigger(prev, next, 'scan');
    expect(trigger).not.toBeNull();
    expect(trigger?.triggerType).toBe('trace_86');
  });

  it('should NOT fire trace_86 when the flag was already set in prevState', () => {
    const flag = thresholdFlag(86);
    const prev = stateWithTrace(84, { [flag]: true });
    const next = stateWithTrace(85, { [flag]: true });
    expect(detectChannelTrigger(prev, next, 'scan')).toBeNull();
  });
});

describe('detectChannelTrigger — layer_breach', () => {
  /** Build a two-node state where currentNodeId points to a node on the given layer. */
  const stateOnLayer = (layer: number, flags: Record<string, boolean> = {}): GameState => {
    const node = makeNode({ id: `node_layer_${String(layer)}`, layer });
    return makeState({
      network: { currentNodeId: node.id, previousNodeId: null, nodes: { [node.id]: node } },
      flags,
    });
  };

  it('should fire layer_breach when moving to layer 3 for the first time', () => {
    const prev = stateOnLayer(2);
    const next = stateOnLayer(3);
    const trigger = detectChannelTrigger(prev, next, 'connect');
    expect(trigger).not.toBeNull();
    expect(trigger?.triggerType).toBe('layer_breach');
  });

  it('should fire layer_breach when moving from layer 3 to layer 4', () => {
    const prev = stateOnLayer(3);
    const next = stateOnLayer(4);
    const trigger = detectChannelTrigger(prev, next, 'connect');
    expect(trigger).not.toBeNull();
    expect(trigger?.triggerType).toBe('layer_breach');
  });

  it('should NOT fire layer_breach when layers are equal', () => {
    const prev = stateOnLayer(3);
    const next = stateOnLayer(3);
    expect(detectChannelTrigger(prev, next, 'connect')).toBeNull();
  });

  it('should NOT fire layer_breach when nextLayer < prevLayer (moving backward)', () => {
    const prev = stateOnLayer(4);
    const next = stateOnLayer(3);
    expect(detectChannelTrigger(prev, next, 'connect')).toBeNull();
  });

  it('should NOT fire layer_breach when layerReachedFlag is already in prevState', () => {
    const flag = layerReachedFlag(3);
    const prev = stateOnLayer(2, { [flag]: true });
    const next = stateOnLayer(3, {});
    expect(detectChannelTrigger(prev, next, 'connect')).toBeNull();
  });

  it('should NOT fire layer_breach when layerReachedFlag is already in nextState', () => {
    const flag = layerReachedFlag(3);
    const prev = stateOnLayer(2, {});
    const next = stateOnLayer(3, { [flag]: true });
    expect(detectChannelTrigger(prev, next, 'connect')).toBeNull();
  });
});

describe('detectChannelTrigger — Sentinel layer floor (SENTINEL_MIN_LAYER)', () => {
  const stateOnLayer = (layer: number, flags: Record<string, boolean> = {}): GameState => {
    const node = makeNode({ id: `node_layer_${String(layer)}`, layer });
    return makeState({
      network: { currentNodeId: node.id, previousNodeId: null, nodes: { [node.id]: node } },
      flags,
    });
  };

  it('should NOT fire layer_breach when arriving at layer 1 (below the floor)', () => {
    const prev = stateOnLayer(0);
    const next = stateOnLayer(1);
    expect(detectChannelTrigger(prev, next, 'connect')).toBeNull();
  });

  it('should NOT fire layer_breach when arriving at layer 2 (below the floor)', () => {
    const prev = stateOnLayer(1);
    const next = stateOnLayer(2);
    expect(detectChannelTrigger(prev, next, 'connect')).toBeNull();
  });

  it('should NOT fire a trace threshold trigger while still below layer 3', () => {
    const flag = thresholdFlag(61);
    const node = makeNode({ id: 'low_layer_node', layer: 1 });
    const network = { currentNodeId: node.id, previousNodeId: null, nodes: { [node.id]: node } };
    const prev = makeState({
      network,
      player: {
        handle: 'ghost',
        trace: 60,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
    });
    const next = makeState({
      network,
      player: {
        handle: 'ghost',
        trace: 61,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
      flags: { [flag]: true },
    });
    expect(detectChannelTrigger(prev, next, 'scan')).toBeNull();
  });

  it('should NOT fire a high-value command trigger while still below layer 3', () => {
    const node = makeNode({ id: 'low_layer_node', layer: 2 });
    const network = { currentNodeId: node.id, previousNodeId: null, nodes: { [node.id]: node } };
    const prev = makeState({ network });
    const next = makeState({ network });
    expect(detectChannelTrigger(prev, next, 'exploit some-service')).toBeNull();
  });

  it('should fire a high-value command trigger once at layer 3', () => {
    const node = makeNode({ id: 'gated_node', layer: 3 });
    const network = { currentNodeId: node.id, previousNodeId: null, nodes: { [node.id]: node } };
    const prev = makeState({ network });
    const next = makeState({ network });
    const trigger = detectChannelTrigger(prev, next, 'exploit some-service');
    expect(trigger).not.toBeNull();
    expect(trigger?.triggerType).toBe('exploit');
  });
});

describe('detectChannelTrigger — high-value commands', () => {
  // Sentinel is silent below layer 3 (SENTINEL_MIN_LAYER), so these states
  // are anchored on a layer-3 node to isolate the command-trigger logic itself.
  const gatedState = (): GameState => {
    const node = makeNode({ id: 'gated_node', layer: 3 });
    return makeState({
      network: { currentNodeId: node.id, previousNodeId: null, nodes: { [node.id]: node } },
    });
  };

  it('should fire exploit trigger for "exploit" command', () => {
    const prev = gatedState();
    const next = gatedState();
    const trigger = detectChannelTrigger(prev, next, 'exploit some-service');
    expect(trigger).not.toBeNull();
    expect(trigger?.triggerType).toBe('exploit');
  });

  it('should fire exploit trigger for uppercase "EXPLOIT" command', () => {
    const prev = gatedState();
    const next = gatedState();
    const trigger = detectChannelTrigger(prev, next, 'EXPLOIT svc');
    expect(trigger).not.toBeNull();
    expect(trigger?.triggerType).toBe('exploit');
  });

  it('should fire exfil trigger for "exfil" command', () => {
    const prev = gatedState();
    const next = gatedState();
    const trigger = detectChannelTrigger(prev, next, 'exfil /data/report.csv');
    expect(trigger).not.toBeNull();
    expect(trigger?.triggerType).toBe('exfil');
  });

  it('should fire wipe_logs trigger for "wipe-logs" command', () => {
    const prev = gatedState();
    const next = gatedState();
    const trigger = detectChannelTrigger(prev, next, 'wipe-logs');
    expect(trigger).not.toBeNull();
    expect(trigger?.triggerType).toBe('wipe_logs');
  });

  it('should return null for an unknown command', () => {
    const prev = gatedState();
    const next = gatedState();
    expect(detectChannelTrigger(prev, next, 'scan')).toBeNull();
  });

  it('should return null for an empty command string', () => {
    const prev = gatedState();
    const next = gatedState();
    expect(detectChannelTrigger(prev, next, '   ')).toBeNull();
  });
});

describe('detectChannelTrigger — returned trigger shape', () => {
  it('should have character "sentinel" on every trigger', () => {
    const node = makeNode({ id: 'gated_node', layer: 3 });
    const network = { currentNodeId: node.id, previousNodeId: null, nodes: { [node.id]: node } };
    const prev = makeState({ network });
    const next = makeState({ network });
    const trigger = detectChannelTrigger(prev, next, 'exploit svc');
    expect(trigger?.character).toBe('sentinel');
  });

  it('should include context fields from nextState', () => {
    const node = makeNode({ id: 'ctx_node', layer: 3 });
    const next = makeState({
      network: { currentNodeId: node.id, previousNodeId: null, nodes: { [node.id]: node } },
      player: {
        handle: 'ghost',
        trace: 42,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
      recentCommands: ['scan', 'connect ctx_node'],
    });
    const prev = makeState(); // different node/trace so no layer_breach false-positive

    const trigger = detectChannelTrigger(prev, next, 'exploit svc');
    expect(trigger?.context.traceLevel).toBe(42);
    expect(trigger?.context.currentNodeId).toBe('ctx_node');
    expect(trigger?.context.currentLayer).toBe(3);
    expect(trigger?.context.recentCommands).toEqual(['scan', 'connect ctx_node']);
  });
});
