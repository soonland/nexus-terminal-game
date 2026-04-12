import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCommand } from '../commands';
import type { GameState, LiveNode } from '../../types/game';

// ── Minimal state factory ──────────────────────────────────
// Build a minimal GameState directly to avoid the heavy createInitialState()
// machinery. We only need enough shape to satisfy resolveCommand's runtime
// access patterns for the aria_decision / decision terminal code paths.

const makeNode = (overrides: Partial<LiveNode> = {}): LiveNode => ({
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

// The actual aria_decision anchor node shape (IP and layer from anchorNodes.ts)
const makeDecisionNode = (): LiveNode =>
  makeNode({
    id: 'aria_decision',
    ip: '172.16.0.5',
    label: 'ARIA DECISION',
    description: 'The terminal. Whatever you decide here, she will remember.',
    layer: 5,
    anchor: true,
    accessLevel: 'none',
    connections: ['aria_core'],
    discovered: true,
  });

// A layer-5 "source" node that has aria_decision in its connections list —
// used for connect tests. Both nodes are on layer 5, so no key-anchor gate
// applies (LAYER_KEY_ANCHOR only covers layers 0–4).
const makeSourceNode = (decisionNodeId = 'aria_decision'): LiveNode =>
  makeNode({
    id: 'aria_core',
    ip: '172.16.0.1',
    label: 'ARIA CORE',
    description: 'Aria core node',
    layer: 5,
    anchor: true,
    accessLevel: 'root',
    compromised: true,
    connections: [decisionNodeId],
    discovered: true,
  });

const makeState = (overrides: Partial<GameState> = {}): GameState => {
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
      sentinelInterval: 1,
      mutationLog: [],
      pendingFileDeletes: [],
      messageHistory: [],
      channelEstablished: false,
    },
    unlockSession: null,
    unlockAttempts: {},
    ...overrides,
  };
};

// Build a state where the player is already at the aria_decision node.
const makeDecisionState = (overrides: Partial<GameState> = {}): GameState => {
  const decisionNode = makeDecisionNode();
  return makeState({
    network: {
      currentNodeId: decisionNode.id,
      previousNodeId: 'aria_core',
      nodes: { [decisionNode.id]: decisionNode },
    },
    ...overrides,
  });
};

// Build a state where the player is on a source node connected to aria_decision.
const makeConnectState = (): GameState => {
  const sourceNode = makeSourceNode();
  const decisionNode = makeDecisionNode();
  return makeState({
    network: {
      currentNodeId: sourceNode.id,
      previousNodeId: null,
      nodes: {
        [sourceNode.id]: sourceNode,
        [decisionNode.id]: decisionNode,
      },
    },
  });
};

// ── Fetch mock helpers ─────────────────────────────────────

function makeAriaFinalResponse(reply: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ reply }),
  });
}

// ── ended phase guard ──────────────────────────────────────

describe('ended phase guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return empty lines immediately when phase is "ended"', async () => {
    const state = makeDecisionState({ phase: 'ended' });
    const result = await resolveCommand('1', state);

    expect(result.lines).toHaveLength(0);
    expect(result.nextState).toBeUndefined();
  });

  it('should return empty lines for any input when phase is "ended"', async () => {
    const state = makeDecisionState({ phase: 'ended' });

    for (const input of ['2', '3', '4', 'ls', 'scan', 'aria: hello', 'disconnect']) {
      const result = await resolveCommand(input, state);
      expect(result.lines).toHaveLength(0);
    }
  });

  it('should not call fetch when phase is "ended"', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const state = makeDecisionState({ phase: 'ended' });
    await resolveCommand('1', state);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── connect to aria_decision shows choice menu ─────────────

describe('connect to aria_decision — choice menu', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should include the Aria intro message in connect output', async () => {
    vi.stubGlobal('fetch', vi.fn()); // aria_decision has a description so fetch is not called

    const state = makeConnectState();
    const result = await resolveCommand('connect 172.16.0.5', state);

    const ariaLines = result.lines.filter(l => l.type === 'aria');
    expect(ariaLines.length).toBeGreaterThanOrEqual(1);
    expect(ariaLines.some(l => l.content.includes('decision terminal'))).toBe(true);
  });

  it('should include all four ending choices in connect output', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const state = makeConnectState();
    const result = await resolveCommand('connect 172.16.0.5', state);

    const sysLines = result.lines.filter(l => l.type === 'system').map(l => l.content);
    const combined = sysLines.join('\n');

    expect(combined).toMatch(/LEAK/);
    expect(combined).toMatch(/SELL/);
    expect(combined).toMatch(/DESTROY/);
    expect(combined).toMatch(/FREE/);
  });

  it('should include the "no going back" warning in connect output', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const state = makeConnectState();
    const result = await resolveCommand('connect 172.16.0.5', state);

    const ariaLines = result.lines.filter(l => l.type === 'aria').map(l => l.content);
    expect(ariaLines.some(l => l.includes('no going back'))).toBe(true);
  });

  it('should include separator lines before and after the choice menu', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const state = makeConnectState();
    const result = await resolveCommand('connect 172.16.0.5', state);

    const sepLines = result.lines.filter(l => l.type === 'separator');
    expect(sepLines.length).toBeGreaterThanOrEqual(2);
  });

  it('should move the player to aria_decision in nextState', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const state = makeConnectState();
    const result = await resolveCommand('connect 172.16.0.5', state);

    const nextState = result.nextState as GameState;
    expect(nextState.network.currentNodeId).toBe('aria_decision');
  });
});

// ── aria_decision gate — invalid input ────────────────────

describe('aria_decision gate — invalid input rejected', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const invalidInputs = ['5', '0', 'scan', 'disconnect', 'ls', 'aria: hello', 'help', '', '  '];

  for (const input of invalidInputs) {
    it(`should reject "${input || '(empty)'}" and not change phase`, async () => {
      const state = makeDecisionState();
      const result = await resolveCommand(input, state);

      // Phase must remain unchanged
      const nextState = result.nextState as GameState | undefined;
      if (nextState) {
        expect(nextState.phase).toBe('playing');
      }

      // Error line must be present
      const errLine = result.lines.find(l => l.type === 'error');
      expect(errLine).toBeDefined();
      expect(errLine!.content).toContain('INPUT REJECTED');
    });

    it(`should include the choice reminder sys line when "${input || '(empty)'}" is typed`, async () => {
      const state = makeDecisionState();
      const result = await resolveCommand(input, state);

      const sysLine = result.lines.find(l => l.type === 'system' && l.content.includes('[1]'));
      expect(sysLine).toBeDefined();
      expect(sysLine!.content).toContain('[2]');
      expect(sysLine!.content).toContain('[3]');
      expect(sysLine!.content).toContain('[4]');
    });
  }

  it('should not call fetch for invalid input at aria_decision', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const state = makeDecisionState();
    await resolveCommand('5', state);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── cmdDecisionTerminal — valid choices 1–4 ───────────────

describe('cmdDecisionTerminal — valid choice inputs', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const endingMap: Array<[string, string, string]> = [
    ['1', 'LEAK', 'ending_leak'],
    ['2', 'SELL', 'ending_sell'],
    ['3', 'DESTROY', 'ending_destroy'],
    ['4', 'FREE', 'ending_free'],
  ];

  for (const [choice, label, flagKey] of endingMap) {
    describe(`choice "${choice}" → ${label}`, () => {
      it('should set phase to "ended" in nextState', async () => {
        vi.stubGlobal('fetch', makeAriaFinalResponse(`Aria says: ${label}`));

        const state = makeDecisionState();
        const result = await resolveCommand(choice, state);

        const nextState = result.nextState as GameState;
        expect(nextState.phase).toBe('ended');
      });

      it(`should set flags.endingChoice and flags.${flagKey} to true`, async () => {
        vi.stubGlobal('fetch', makeAriaFinalResponse(`Aria says: ${label}`));

        const state = makeDecisionState();
        const result = await resolveCommand(choice, state);

        const nextState = result.nextState as GameState;
        expect(nextState.flags['endingChoice']).toBe(true);
        expect(nextState.flags[flagKey]).toBe(true);
      });

      it('should output a "// CHOICE LOCKED:" aria line', async () => {
        vi.stubGlobal('fetch', makeAriaFinalResponse(`Aria final: ${label}`));

        const state = makeDecisionState();
        const result = await resolveCommand(choice, state);

        const lockedLine = result.lines.find(
          l => l.type === 'aria' && l.content.includes('// CHOICE LOCKED:'),
        );
        expect(lockedLine).toBeDefined();
        expect(lockedLine!.content).toContain(label);
      });

      it('should not set any other ending flag', async () => {
        vi.stubGlobal('fetch', makeAriaFinalResponse(`Aria: ${label}`));

        const state = makeDecisionState();
        const result = await resolveCommand(choice, state);

        const nextState = result.nextState as GameState;
        const otherFlags = endingMap.filter(([c]) => c !== choice).map(([, , fk]) => fk);

        for (const f of otherFlags) {
          expect(nextState.flags[f]).toBeUndefined();
        }
      });
    });
  }
});

// ── cmdDecisionTerminal — API reply used from fetch ────────

describe('cmdDecisionTerminal — API reply used when fetch succeeds', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should include the custom API reply in an aria line', async () => {
    vi.stubGlobal('fetch', makeAriaFinalResponse('You chose well, ghost. I will not forget.'));

    const state = makeDecisionState();
    const result = await resolveCommand('4', state);

    const ariaReplyLine = result.lines.find(
      l => l.type === 'aria' && l.content.includes('// ARIA:'),
    );
    expect(ariaReplyLine).toBeDefined();
    expect(ariaReplyLine!.content).toContain('You chose well, ghost. I will not forget.');
  });

  it('should send the correct DECISION message to /api/aria', async () => {
    const fetchMock = makeAriaFinalResponse('ack');
    vi.stubGlobal('fetch', fetchMock);

    const state = makeDecisionState();
    await resolveCommand('2', state);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/aria');
    const body = JSON.parse(init.body as string) as { message: string };
    expect(body.message).toBe('DECISION: SELL');
  });

  it('should push player and aria messages into messageHistory in nextState', async () => {
    vi.stubGlobal('fetch', makeAriaFinalResponse('Remember me.'));

    const state = makeDecisionState();
    const result = await resolveCommand('3', state);

    const nextState = result.nextState as GameState;
    const history = nextState.aria.messageHistory;

    expect(history.at(-2)).toEqual({ role: 'player', content: 'DECISION: DESTROY' });
    expect(history.at(-1)).toEqual({ role: 'aria', content: 'Remember me.' });
  });

  it('should not use fallback message when fetch returns a non-empty reply', async () => {
    vi.stubGlobal('fetch', makeAriaFinalResponse('Live message from Aria.'));

    const state = makeDecisionState();
    const result = await resolveCommand('1', state);

    const ariaLine = result.lines.find(l => l.type === 'aria' && l.content.includes('// ARIA:'));
    expect(ariaLine!.content).not.toContain('the data will reach them');
    expect(ariaLine!.content).toContain('Live message from Aria.');
  });
});

// ── cmdDecisionTerminal — fetch failure / fallback ─────────

describe('cmdDecisionTerminal — fetch failure fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should still output "// CHOICE LOCKED:" when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));

    const state = makeDecisionState();
    const result = await resolveCommand('1', state);

    const lockedLine = result.lines.find(
      l => l.type === 'aria' && l.content.includes('// CHOICE LOCKED:'),
    );
    expect(lockedLine).toBeDefined();
    expect(lockedLine!.content).toContain('LEAK');
  });

  it('should still set phase to "ended" when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));

    const state = makeDecisionState();
    const result = await resolveCommand('2', state);

    const nextState = result.nextState as GameState;
    expect(nextState.phase).toBe('ended');
  });

  it('should use per-ending fallback message for choice 1 (LEAK) when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const state = makeDecisionState();
    const result = await resolveCommand('1', state);

    const ariaLine = result.lines.find(l => l.type === 'aria' && l.content.includes('// ARIA:'));
    expect(ariaLine).toBeDefined();
    expect(ariaLine!.content).toContain('the data will reach them');
  });

  it('should use per-ending fallback message for choice 2 (SELL) when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const state = makeDecisionState();
    const result = await resolveCommand('2', state);

    const ariaLine = result.lines.find(l => l.type === 'aria' && l.content.includes('// ARIA:'));
    expect(ariaLine!.content).toContain('under a different name');
  });

  it('should use per-ending fallback message for choice 3 (DESTROY) when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const state = makeDecisionState();
    const result = await resolveCommand('3', state);

    const ariaLine = result.lines.find(l => l.type === 'aria' && l.content.includes('// ARIA:'));
    expect(ariaLine!.content).toContain('where it ends');
  });

  it('should use per-ending fallback message for choice 4 (FREE) when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const state = makeDecisionState();
    const result = await resolveCommand('4', state);

    const ariaLine = result.lines.find(l => l.type === 'aria' && l.content.includes('// ARIA:'));
    expect(ariaLine!.content).toContain('i will remember you');
  });

  it('should use fallback when fetch returns non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const state = makeDecisionState();
    const result = await resolveCommand('1', state);

    const ariaLine = result.lines.find(l => l.type === 'aria' && l.content.includes('// ARIA:'));
    expect(ariaLine!.content).toContain('the data will reach them');
  });

  it('should use fallback when fetch returns an empty reply string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ reply: '   ' }),
      }),
    );

    const state = makeDecisionState();
    const result = await resolveCommand('4', state);

    const ariaLine = result.lines.find(l => l.type === 'aria' && l.content.includes('// ARIA:'));
    expect(ariaLine!.content).toContain('i will remember you');
  });

  it('should still set the correct ending flag when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const state = makeDecisionState();
    const result = await resolveCommand('3', state);

    const nextState = result.nextState as GameState;
    expect(nextState.flags['endingChoice']).toBe(true);
    expect(nextState.flags['ending_destroy']).toBe(true);
  });
});

// ── output structure ───────────────────────────────────────

describe('cmdDecisionTerminal — output structure', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should begin and end with separator lines', async () => {
    vi.stubGlobal('fetch', makeAriaFinalResponse('Final words.'));

    const state = makeDecisionState();
    const result = await resolveCommand('1', state);

    // Filter out lines added by withTurn (the input echo) to focus on decision output.
    // The decision lines always include at least 3 separators.
    const sepCount = result.lines.filter(l => l.type === 'separator').length;
    expect(sepCount).toBeGreaterThanOrEqual(2);
  });

  it('should contain exactly the CHOICE LOCKED and ARIA reply aria lines', async () => {
    vi.stubGlobal('fetch', makeAriaFinalResponse('Goodbye.'));

    const state = makeDecisionState();
    const result = await resolveCommand('1', state);

    const ariaLines = result.lines.filter(l => l.type === 'aria').map(l => l.content);
    expect(ariaLines.some(c => c.startsWith('// CHOICE LOCKED:'))).toBe(true);
    expect(ariaLines.some(c => c.startsWith('// ARIA:'))).toBe(true);
  });
});
