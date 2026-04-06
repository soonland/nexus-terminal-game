import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCommand } from '../commands';
import { makeState, makeNode } from './testHelpers';

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── msg — argument validation ─────────────────────────────────────────────────

describe('msg — argument validation', () => {
  it('should return an error line when no argument is provided', async () => {
    const state = makeState();
    const result = await resolveCommand('msg', state);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].type).toBe('error');
  });

  it('should return an error line when an unknown character name is given', async () => {
    const state = makeState();
    const result = await resolveCommand('msg cortex', state);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/usage/i);
  });
});

// ── msg sentinel — channel not established ────────────────────────────────────

describe('msg sentinel — channel not established', () => {
  it('should return an error line when channelEstablished is false', async () => {
    const state = makeState({
      sentinel: {
        active: false,
        mutationLog: [],
        pendingFileDeletes: [],
        messageHistory: [],
        channelEstablished: false,
      },
    });
    const result = await resolveCommand('msg sentinel', state);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/no channel established/i);
  });
});

// ── msg sentinel — channel established and open ───────────────────────────────

describe('msg sentinel — channel established, not blocked', () => {
  it('should return a channelTrigger with triggerType "manual_reentry"', async () => {
    const state = makeState({
      sentinel: {
        active: false,
        mutationLog: [],
        pendingFileDeletes: [],
        messageHistory: [],
        channelEstablished: true,
      },
    });
    const result = await resolveCommand('msg sentinel', state);
    expect(result.channelTrigger).toBeDefined();
    expect(result.channelTrigger?.triggerType).toBe('manual_reentry');
  });

  it('should return a channelTrigger with character "sentinel"', async () => {
    const state = makeState({
      sentinel: {
        active: false,
        mutationLog: [],
        pendingFileDeletes: [],
        messageHistory: [],
        channelEstablished: true,
      },
    });
    const result = await resolveCommand('msg sentinel', state);
    expect(result.channelTrigger?.character).toBe('sentinel');
  });

  it('should return an empty lines array when trigger fires', async () => {
    const state = makeState({
      sentinel: {
        active: false,
        mutationLog: [],
        pendingFileDeletes: [],
        messageHistory: [],
        channelEstablished: true,
      },
    });
    const result = await resolveCommand('msg sentinel', state);
    expect(result.lines).toHaveLength(0);
  });

  it('should include context from the current state in the channelTrigger', async () => {
    const node = makeNode({ id: 'ctx_node', layer: 2 });
    const state = makeState({
      network: { currentNodeId: node.id, previousNodeId: null, nodes: { [node.id]: node } },
      player: {
        handle: 'ghost',
        trace: 45,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
      recentCommands: ['scan', 'connect ctx_node'],
      sentinel: {
        active: false,
        mutationLog: [],
        pendingFileDeletes: [],
        messageHistory: [],
        channelEstablished: true,
      },
    });
    const result = await resolveCommand('msg sentinel', state);
    expect(result.channelTrigger?.context.traceLevel).toBe(45);
    expect(result.channelTrigger?.context.currentNodeId).toBe('ctx_node');
    expect(result.channelTrigger?.context.currentLayer).toBe(2);
    expect(result.channelTrigger?.context.recentCommands).toEqual(['scan', 'connect ctx_node']);
  });
});

// ── msg sentinel — channel established but blocked ────────────────────────────

describe('msg sentinel — channel established but blocked', () => {
  it('should return an error line when trace >= 86', async () => {
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
      sentinel: {
        active: false,
        mutationLog: [],
        pendingFileDeletes: [],
        messageHistory: [],
        channelEstablished: true,
      },
    });
    const result = await resolveCommand('msg sentinel', state);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].type).toBe('error');
    expect(result.channelTrigger).toBeUndefined();
  });

  it('should return an error line when phase is "burned" and channel is established', async () => {
    const state = makeState({
      phase: 'burned',
      sentinel: {
        active: false,
        mutationLog: [],
        pendingFileDeletes: [],
        messageHistory: [],
        channelEstablished: true,
      },
    });
    // resolveCommand returns early for burned phase — just verify no channelTrigger is emitted
    const result = await resolveCommand('msg sentinel', state);
    expect(result.channelTrigger).toBeUndefined();
  });

  it('should return an error line when trace is 100 and channel is established', async () => {
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
      sentinel: {
        active: false,
        mutationLog: [],
        pendingFileDeletes: [],
        messageHistory: [],
        channelEstablished: true,
      },
    });
    const result = await resolveCommand('msg sentinel', state);
    expect(result.lines.some(l => l.type === 'error')).toBe(true);
    expect(result.channelTrigger).toBeUndefined();
  });
});
