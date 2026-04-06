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

  it('should return true when trace is exactly 86', () => {
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

/** Build a state with trace set, resetting the full player object for simplicity. */
const stateWithTrace = (trace: number, flags: Record<string, boolean> = {}): GameState =>
  makeState({
    player: {
      handle: 'ghost',
      trace,
      charges: 3,
      credentials: [],
      exfiltrated: [],
      tools: [],
      burnCount: 0,
    },
    flags,
  });

describe('detectChannelTrigger — channel blocked in nextState', () => {
  it('should return null when nextState phase is "burned"', () => {
    const prev = makeState();
    const next = makeState({ phase: 'burned' });
    expect(detectChannelTrigger(prev, next, 'scan')).toBeNull();
  });

  it('should return null when nextState trace >= 86', () => {
    const prev = stateWithTrace(85);
    const next = stateWithTrace(86);
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

  it('should fire trace_86 trigger when the 86% flag is newly set BUT channel is still open (trace<86 in nextState is a contradiction — test the flag branch directly via prev/next with trace at 85)', () => {
    // trace_86 threshold flag fires when prevTrace < 86 and nextTrace >= 86 — but the channel
    // blocking check (isChannelBlocked) fires first and returns null when trace >= 86.
    // The trace_86 trigger can therefore only reach the flag check when the flag is
    // stamped by something other than the trace reaching 86 (e.g. test setup).
    // We verify: if channel is open in nextState (trace=85) but flag is freshly set, trigger fires.
    const flag = thresholdFlag(86);
    const prev = stateWithTrace(84, {});
    const next = stateWithTrace(85, { [flag]: true }); // flag stamped but trace still < 86
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

  it('should fire layer_breach when moving to a higher layer for the first time', () => {
    const prev = stateOnLayer(0);
    const next = stateOnLayer(1);
    const trigger = detectChannelTrigger(prev, next, 'connect');
    expect(trigger).not.toBeNull();
    expect(trigger?.triggerType).toBe('layer_breach');
  });

  it('should fire layer_breach when moving from layer 1 to layer 2', () => {
    const prev = stateOnLayer(1);
    const next = stateOnLayer(2);
    const trigger = detectChannelTrigger(prev, next, 'connect');
    expect(trigger).not.toBeNull();
    expect(trigger?.triggerType).toBe('layer_breach');
  });

  it('should NOT fire layer_breach when layers are equal', () => {
    const prev = stateOnLayer(1);
    const next = stateOnLayer(1);
    expect(detectChannelTrigger(prev, next, 'connect')).toBeNull();
  });

  it('should NOT fire layer_breach when nextLayer < prevLayer (moving backward)', () => {
    const prev = stateOnLayer(2);
    const next = stateOnLayer(1);
    expect(detectChannelTrigger(prev, next, 'connect')).toBeNull();
  });

  it('should NOT fire layer_breach when layerReachedFlag is already in prevState', () => {
    const flag = layerReachedFlag(1);
    const prev = stateOnLayer(0, { [flag]: true });
    const next = stateOnLayer(1, {});
    expect(detectChannelTrigger(prev, next, 'connect')).toBeNull();
  });

  it('should NOT fire layer_breach when layerReachedFlag is already in nextState', () => {
    const flag = layerReachedFlag(1);
    const prev = stateOnLayer(0, {});
    const next = stateOnLayer(1, { [flag]: true });
    expect(detectChannelTrigger(prev, next, 'connect')).toBeNull();
  });
});

describe('detectChannelTrigger — high-value commands', () => {
  it('should fire exploit trigger for "exploit" command', () => {
    const prev = makeState();
    const next = makeState();
    const trigger = detectChannelTrigger(prev, next, 'exploit some-service');
    expect(trigger).not.toBeNull();
    expect(trigger?.triggerType).toBe('exploit');
  });

  it('should fire exploit trigger for uppercase "EXPLOIT" command', () => {
    const prev = makeState();
    const next = makeState();
    const trigger = detectChannelTrigger(prev, next, 'EXPLOIT svc');
    expect(trigger).not.toBeNull();
    expect(trigger?.triggerType).toBe('exploit');
  });

  it('should fire exfil trigger for "exfil" command', () => {
    const prev = makeState();
    const next = makeState();
    const trigger = detectChannelTrigger(prev, next, 'exfil /data/report.csv');
    expect(trigger).not.toBeNull();
    expect(trigger?.triggerType).toBe('exfil');
  });

  it('should fire wipe_logs trigger for "wipe-logs" command', () => {
    const prev = makeState();
    const next = makeState();
    const trigger = detectChannelTrigger(prev, next, 'wipe-logs');
    expect(trigger).not.toBeNull();
    expect(trigger?.triggerType).toBe('wipe_logs');
  });

  it('should return null for an unknown command', () => {
    const prev = makeState();
    const next = makeState();
    expect(detectChannelTrigger(prev, next, 'scan')).toBeNull();
  });

  it('should return null for an empty command string', () => {
    const prev = makeState();
    const next = makeState();
    expect(detectChannelTrigger(prev, next, '   ')).toBeNull();
  });
});

describe('detectChannelTrigger — returned trigger shape', () => {
  it('should have character "sentinel" on every trigger', () => {
    const prev = makeState();
    const next = makeState();
    const trigger = detectChannelTrigger(prev, next, 'exploit svc');
    expect(trigger?.character).toBe('sentinel');
  });

  it('should include context fields from nextState', () => {
    const node = makeNode({ id: 'ctx_node', layer: 2 });
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
    expect(trigger?.context.currentLayer).toBe(2);
    expect(trigger?.context.recentCommands).toEqual(['scan', 'connect ctx_node']);
  });
});
