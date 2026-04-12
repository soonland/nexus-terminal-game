import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCommand, generateUnlockCode } from './commands';
import { createInitialState } from './state';
import type { GameState } from '../types/game';
import produce from './produce';

// ── Helpers ────────────────────────────────────────────────

function makeOkFetchResponse(body: object) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(body),
  };
}

const DEFAULT_AI_RESPONSE = {
  narrative: 'The AI responded.',
  traceChange: 0,
  accessGranted: false,
  newAccessLevel: null,
  flagsSet: {},
  nodesUnlocked: [],
  isUnknown: false,
  suggestions: [],
};

// ── Tests ──────────────────────────────────────────────────

describe('resolveCommand — turn tracking', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkFetchResponse(DEFAULT_AI_RESPONSE)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should NOT append the raw command to recentCommands after a local command (no state mutation)', async () => {
    // Local commands (help, status, etc.) bypass withTurn — spec §7.1 "no state change"
    const result = await resolveCommand('help', state);
    expect(result.nextState).toBeUndefined();
  });

  it('should append the raw command to recentCommands after an engine command', async () => {
    const result = await resolveCommand('scan', state);
    expect(result.nextState?.recentCommands).toContain('scan');
  });

  it('should append the raw command to recentCommands after an AI command', async () => {
    const result = await resolveCommand('frobnicate', state);
    expect(result.nextState?.recentCommands).toContain('frobnicate');
  });

  it('should keep only the last 8 commands when the buffer overflows (engine command)', async () => {
    // Seed 8 commands manually so the 9th push causes a slice; use an engine command (scan)
    const seeded: GameState = {
      ...state,
      recentCommands: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'],
      turnCount: 8,
    };
    const result = await resolveCommand('scan', seeded);
    expect(result.nextState?.recentCommands).toHaveLength(8);
    expect(result.nextState?.recentCommands).not.toContain('c1');
    expect(result.nextState?.recentCommands).toContain('scan');
  });

  it('should NOT increment turnCount after a local command (no state mutation)', async () => {
    // Local commands bypass withTurn — spec §7.1 "no state change"
    const result = await resolveCommand('help', state);
    expect(result.nextState).toBeUndefined();
  });

  it('should increment turnCount by 1 after an engine command', async () => {
    const result = await resolveCommand('scan', state);
    expect(result.nextState?.turnCount).toBe(1);
  });

  it('should increment turnCount by 1 after an AI command', async () => {
    const result = await resolveCommand('frobnicate', state);
    expect(result.nextState?.turnCount).toBe(1);
  });

  it('should accumulate turnCount across successive engine/AI calls', async () => {
    const r1 = await resolveCommand('scan', state);
    const r2 = await resolveCommand('frobnicate', r1.nextState as GameState);
    expect(r2.nextState?.turnCount).toBe(2);
  });
});

describe('resolveCommand — burned state safety', () => {
  it('should not throw and should not clear the burned phase when called directly', async () => {
    const burned: GameState = { ...createInitialState(), phase: 'burned' };
    // App.tsx is the authoritative gate for burned state — resolveCommand is a
    // public export and must not crash or silently un-burn the session if called
    // directly (e.g. from a future API handler or test harness).
    // Contract: returns a CommandOutput and does not change phase away from burned.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await resolveCommand('scan', burned);
    warnSpy.mockRestore();
    expect(result).toBeDefined();
    expect(Array.isArray(result.lines)).toBe(true);
    // In the burned-state guard, commands are not executed; the session must remain burned.
    const nextPhase = (result.nextState as GameState | undefined)?.phase ?? burned.phase;
    expect(nextPhase).toBe('burned');
  });
});

describe('resolveCommand — AI routing happy path', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should render the narrative as an output line when isUnknown is false', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, narrative: 'Hello from the AI.' }),
        ),
    );
    const result = await resolveCommand('frobnicate', state);
    const narrativeLine = result.lines.find(l => l.content === 'Hello from the AI.');
    expect(narrativeLine).toBeDefined();
    expect(narrativeLine?.type).toBe('output');
  });

  it('should apply traceChange to the player trace in nextState', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, traceChange: 5 })),
    );
    const result = await resolveCommand('frobnicate', state);
    expect((result.nextState as GameState).player.trace).toBe(5);
  });

  it('should append a trace system line when traceChange is greater than 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, traceChange: 5 })),
    );
    const result = await resolveCommand('frobnicate', state);
    const traceLine = result.lines.find(l => l.content.includes('+5 trace'));
    expect(traceLine).toBeDefined();
    expect(traceLine?.type).toBe('system');
  });

  it('should not append a trace line when traceChange is 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, traceChange: 0 })),
    );
    const result = await resolveCommand('frobnicate', state);
    const traceLine = result.lines.find(l => l.content.includes('trace'));
    expect(traceLine).toBeUndefined();
  });

  it('should merge flagsSet into state.flags', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkFetchResponse({
          ...DEFAULT_AI_RESPONSE,
          flagsSet: { introComplete: true, metAria: false },
        }),
      ),
    );
    const result = await resolveCommand('frobnicate', state);
    expect(result.nextState?.flags).toMatchObject({ introComplete: true, metAria: false });
  });

  it('should POST to /api/world with the correct payload shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkFetchResponse(DEFAULT_AI_RESPONSE));
    vi.stubGlobal('fetch', fetchMock);

    await resolveCommand('test command', state);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/world');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body.command).toBe('test command');
    expect(body.currentNode.id).toBe('contractor_portal');
    expect(body.playerState.handle).toBe('ghost');
    expect(body.recentCommands).toBeInstanceOf(Array);
    expect(typeof body.turnCount).toBe('number');
  });
});

describe('resolveCommand — AI routing isUnknown', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should render narrative as an error line when isUnknown is true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkFetchResponse({
          ...DEFAULT_AI_RESPONSE,
          isUnknown: true,
          narrative: 'Unknown command, ghostly.',
        }),
      ),
    );
    const result = await resolveCommand('frobnicate', state);
    const narrativeLine = result.lines.find(l => l.content === 'Unknown command, ghostly.');
    expect(narrativeLine).toBeDefined();
    expect(narrativeLine?.type).toBe('error');
  });
});

describe('resolveCommand — AI routing accessGranted', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should update the current node accessLevel when accessGranted is true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkFetchResponse({
          ...DEFAULT_AI_RESPONSE,
          accessGranted: true,
          newAccessLevel: 'user',
        }),
      ),
    );
    const result = await resolveCommand('frobnicate', state);
    const updatedNode = (result.nextState as GameState).network.nodes['contractor_portal']!;
    expect(updatedNode.accessLevel).toBe('user');
  });

  it('should not update the node accessLevel when accessGranted is false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkFetchResponse({
          ...DEFAULT_AI_RESPONSE,
          accessGranted: false,
          newAccessLevel: 'user',
        }),
      ),
    );
    const result = await resolveCommand('frobnicate', state);
    const updatedNode = (result.nextState as GameState).network.nodes['contractor_portal']!;
    expect(updatedNode.accessLevel).toBe('none');
  });

  it('should not update the node accessLevel when newAccessLevel is null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkFetchResponse({
          ...DEFAULT_AI_RESPONSE,
          accessGranted: true,
          newAccessLevel: null,
        }),
      ),
    );
    const result = await resolveCommand('frobnicate', state);
    const updatedNode = (result.nextState as GameState).network.nodes['contractor_portal']!;
    expect(updatedNode.accessLevel).toBe('none');
  });
});

describe('resolveCommand — AI routing nodesUnlocked', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should set discovered=true and locked=false for each node in nodesUnlocked', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, nodesUnlocked: ['vpn_gateway'] }),
        ),
    );

    // vpn_gateway starts as undiscovered
    expect(state.network.nodes['vpn_gateway']!.discovered).toBe(false);

    const result = await resolveCommand('frobnicate', state);
    const vpn = (result.nextState as GameState).network.nodes['vpn_gateway']!;
    expect(vpn.discovered).toBe(true);
    expect(vpn.locked).toBe(false);
  });

  it('should leave other nodes unchanged when nodesUnlocked is populated', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, nodesUnlocked: ['vpn_gateway'] }),
        ),
    );
    const result = await resolveCommand('frobnicate', state);
    // contractor_portal was already discovered — should remain so
    expect((result.nextState as GameState).network.nodes['contractor_portal']!.discovered).toBe(
      true,
    );
  });

  it('should silently ignore node IDs that do not exist in the network', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, nodesUnlocked: ['does_not_exist'] }),
        ),
    );
    // Should not throw
    await expect(resolveCommand('frobnicate', state)).resolves.toBeDefined();
  });

  it('should not mutate any nodes when nodesUnlocked is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, nodesUnlocked: [] })),
    );
    const result = await resolveCommand('frobnicate', state);
    expect((result.nextState as GameState).network.nodes['vpn_gateway']!.discovered).toBe(false);
  });
});

describe('resolveCommand — AI routing fetch failure', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should fall back to WORLD_AI_FALLBACK when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const result = await resolveCommand('frobnicate', state);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/offline mode/);
  });

  it('should not apply any trace change on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const result = await resolveCommand('frobnicate', state);
    expect((result.nextState as GameState).player.trace).toBe(0);
  });

  it('should still advance turn tracking on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const result = await resolveCommand('frobnicate', state);
    expect(result.nextState?.turnCount).toBe(1);
    expect(result.nextState?.recentCommands).toContain('frobnicate');
  });

  it('should not append a trace line when falling back to WORLD_AI_FALLBACK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const result = await resolveCommand('frobnicate', state);
    const traceLine = result.lines.find(l => l.content.includes('trace'));
    expect(traceLine).toBeUndefined();
  });
});

// ── Local commands ─────────────────────────────────────────

describe('resolveCommand — help', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  it('should return empty lines (handled as modal in App)', async () => {
    const result = await resolveCommand('help', state);
    expect(result.lines).toHaveLength(0);
  });

  it('should not mutate state (no nextState — local command)', async () => {
    // help is a local command — spec §7.1: no state change, no trace mutation
    const result = await resolveCommand('help', state);
    expect(result.nextState).toBeUndefined();
  });
});

describe('resolveCommand — status', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  it('should return the current node IP in output', async () => {
    const result = await resolveCommand('status', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('10.0.0.1'))).toBe(true);
  });

  it('should return the player handle', async () => {
    const result = await resolveCommand('status', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('ghost'))).toBe(true);
  });

  it('should show trace percentage', async () => {
    const result = await resolveCommand('status', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('0%'))).toBe(true);
  });

  it('should show SAFE when trace is 0', async () => {
    const result = await resolveCommand('status', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('SAFE'))).toBe(true);
  });

  it('should show ELEVATED when trace is 31', async () => {
    const elevated = produce(state, s => {
      s.player.trace = 31;
    });
    const result = await resolveCommand('status', elevated);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('ELEVATED'))).toBe(true);
  });

  it('should show SENTINEL ACTIVE when trace is 61', async () => {
    const active = produce(state, s => {
      s.player.trace = 61;
    });
    const result = await resolveCommand('status', active);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('SENTINEL ACTIVE'))).toBe(true);
  });

  it('should show CRITICAL when trace is 86', async () => {
    const critical = produce(state, s => {
      s.player.trace = 86;
    });
    const result = await resolveCommand('status', critical);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('CRITICAL'))).toBe(true);
  });

  it('should list tools', async () => {
    const result = await resolveCommand('status', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('exploit-kit'))).toBe(true);
  });

  it('should show charges count', async () => {
    const result = await resolveCommand('status', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('4'))).toBe(true);
  });
});

describe('resolveCommand — map', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  it('should return empty lines (handled as modal in App)', async () => {
    const result = await resolveCommand('map', state);
    expect(result.lines).toHaveLength(0);
  });
});

describe('resolveCommand — clear', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  it('should return an empty lines array', async () => {
    const result = await resolveCommand('clear', state);
    // Only the nextState turn-tracking line is added; the lines[] itself has no visible content
    const visibleLines = result.lines.filter(l => l.type !== 'separator');
    expect(visibleLines).toHaveLength(0);
  });
});

// ── Engine commands ────────────────────────────────────────

describe('resolveCommand — scan (no args, subnet scan)', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  it('should discover connected nodes', async () => {
    const result = await resolveCommand('scan', state);
    const nextNodes = (result.nextState as GameState).network.nodes;
    expect(nextNodes['vpn_gateway']!.discovered).toBe(true);
  });

  it('should output the scanning message with the layer number', async () => {
    const result = await resolveCommand('scan', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('Scanning subnet') && c.includes('layer 0'))).toBe(true);
  });

  it('should list peer IPs in the output', async () => {
    const result = await resolveCommand('scan', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('10.0.0.2'))).toBe(true);
  });

  it('should mark vulnerable peers with [!]', async () => {
    const result = await resolveCommand('scan', state);
    const contents = result.lines.map(l => l.content);
    // vpn_gateway has snmp port 161 vulnerable
    expect(contents.some(c => c.includes('[!]'))).toBe(true);
  });
});

describe('resolveCommand — scan [ip] (specific IP scan)', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  it('should return an error when the IP is not found', async () => {
    const result = await resolveCommand('scan 1.2.3.4', state);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/No response from 1\.2\.3\.4/);
  });

  it('should show host details for a known IP', async () => {
    const result = await resolveCommand('scan 10.0.0.2', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('VPN GATEWAY'))).toBe(true);
  });

  it('should mark the node as discovered', async () => {
    const result = await resolveCommand('scan 10.0.0.2', state);
    expect((result.nextState as GameState).network.nodes['vpn_gateway']!.discovered).toBe(true);
  });

  it('should list services with port numbers', async () => {
    const result = await resolveCommand('scan 10.0.0.2', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('22') || c.includes('161'))).toBe(true);
  });

  it('should mark vulnerable services with [VULNERABLE]', async () => {
    const result = await resolveCommand('scan 10.0.0.2', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('[VULNERABLE]'))).toBe(true);
  });

  it('should show ACTIVE status for non-compromised node', async () => {
    const result = await resolveCommand('scan 10.0.0.2', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('ACTIVE'))).toBe(true);
  });

  it('should show COMPROMISED status for a compromised node', async () => {
    const withCompromised = produce(state, s => {
      s.network.nodes['vpn_gateway']!.compromised = true;
    });
    const result = await resolveCommand('scan 10.0.0.2', withCompromised);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('COMPROMISED'))).toBe(true);
  });
});

describe('resolveCommand — connect', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
    // Discover vpn_gateway so we can connect to it
    state = produce(state, s => {
      s.network.nodes['vpn_gateway']!.discovered = true;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return a usage error when no IP is provided', async () => {
    const result = await resolveCommand('connect', state);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/Usage/);
  });

  it('should return an error when the IP is not in the network', async () => {
    const result = await resolveCommand('connect 9.9.9.9', state);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/Host not found/);
  });

  it('should return an error when the node is not yet discovered', async () => {
    // Hide vpn_gateway again
    const hidden = produce(state, s => {
      s.network.nodes['vpn_gateway']!.discovered = false;
    });
    const result = await resolveCommand('connect 10.0.0.2', hidden);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/try scanning first/);
  });

  it('should return an error when there is no direct route', async () => {
    // ops_cctv_ctrl is not directly connected to contractor_portal
    const withOps = produce(state, s => {
      s.network.nodes['ops_cctv_ctrl']!.discovered = true;
    });
    const result = await resolveCommand('connect 10.1.0.1', withOps);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/No direct route/);
  });

  it('should update currentNodeId on success', async () => {
    const result = await resolveCommand('connect 10.0.0.2', state);
    expect((result.nextState as GameState).network.currentNodeId).toBe('vpn_gateway');
  });

  it('should set previousNodeId to the current node on success', async () => {
    const result = await resolveCommand('connect 10.0.0.2', state);
    expect((result.nextState as GameState).network.previousNodeId).toBe('contractor_portal');
  });

  it('should include the target label in output lines', async () => {
    const result = await resolveCommand('connect 10.0.0.2', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('VPN GATEWAY'))).toBe(true);
  });

  // ── Filler node description generation ────────────────────

  it('should fetch and show a generated description on first connect to a filler node', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeOkFetchResponse({ description: '[GENERATED DESCRIPTION]' })),
    );

    const withFiller = produce(state, s => {
      s.network.nodes['filler_01'] = {
        id: 'filler_01',
        ip: '10.0.99.1',
        template: 'workstation',
        label: 'WORKSTATION-01',
        description: null,
        layer: 0,
        anchor: false,
        connections: [],
        services: [],
        files: [],
        accessLevel: 'none',
        compromised: false,
        discovered: true,
        credentialHints: [],
      };
      s.network.nodes['contractor_portal']!.connections.push('filler_01');
    });

    const result = await resolveCommand('connect 10.0.99.1', withFiller);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('[GENERATED DESCRIPTION]'))).toBe(true);
  });

  it('should cache the generated description in nextState after first connect', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeOkFetchResponse({ description: '[CACHED DESCRIPTION]' })),
    );

    const withFiller = produce(state, s => {
      s.network.nodes['filler_01'] = {
        id: 'filler_01',
        ip: '10.0.99.1',
        template: 'workstation',
        label: 'WORKSTATION-01',
        description: null,
        layer: 0,
        anchor: false,
        connections: [],
        services: [],
        files: [],
        accessLevel: 'none',
        compromised: false,
        discovered: true,
        credentialHints: [],
      };
      s.network.nodes['contractor_portal']!.connections.push('filler_01');
    });

    const result = await resolveCommand('connect 10.0.99.1', withFiller);
    const nextState = result.nextState as GameState;
    expect(nextState.network.nodes['filler_01']!.description).toBe('[CACHED DESCRIPTION]');
  });

  it('should show the cached description on reconnect and not call fetch again', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeOkFetchResponse({ description: 'should not appear' }));
    vi.stubGlobal('fetch', fetchMock);

    const withCached = produce(state, s => {
      s.network.nodes['filler_01'] = {
        id: 'filler_01',
        ip: '10.0.99.1',
        template: 'workstation',
        label: 'WORKSTATION-01',
        description: 'Already generated description.',
        layer: 0,
        anchor: false,
        connections: [],
        services: [],
        files: [],
        accessLevel: 'none',
        compromised: false,
        discovered: true,
        credentialHints: [],
      };
      s.network.nodes['contractor_portal']!.connections.push('filler_01');
    });

    const result = await resolveCommand('connect 10.0.99.1', withCached);
    expect(fetchMock).not.toHaveBeenCalled();
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('Already generated description.'))).toBe(true);
  });

  it('should show fallback text and not cache when API returns non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const withFiller = produce(state, s => {
      s.network.nodes['filler_01'] = {
        id: 'filler_01',
        ip: '10.0.99.1',
        template: 'workstation',
        label: 'WORKSTATION-01',
        description: null,
        layer: 0,
        anchor: false,
        connections: [],
        services: [],
        files: [],
        accessLevel: 'none',
        compromised: false,
        discovered: true,
        credentialHints: [],
      };
      s.network.nodes['contractor_portal']!.connections.push('filler_01');
    });

    const result = await resolveCommand('connect 10.0.99.1', withFiller);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('unidentified host'))).toBe(true);
    const nextState = result.nextState as GameState;
    expect(nextState.network.nodes['filler_01']!.description).toBeNull();
  });

  it('should show fallback text and not cache when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));

    const withFiller = produce(state, s => {
      s.network.nodes['filler_01'] = {
        id: 'filler_01',
        ip: '10.0.99.1',
        template: 'workstation',
        label: 'WORKSTATION-01',
        description: null,
        layer: 0,
        anchor: false,
        connections: [],
        services: [],
        files: [],
        accessLevel: 'none',
        compromised: false,
        discovered: true,
        credentialHints: [],
      };
      s.network.nodes['contractor_portal']!.connections.push('filler_01');
    });

    const result = await resolveCommand('connect 10.0.99.1', withFiller);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('unidentified host'))).toBe(true);
    const nextState = result.nextState as GameState;
    expect(nextState.network.nodes['filler_01']!.description).toBeNull();
  });

  it('should never call the API for an anchor node', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await resolveCommand('connect 10.0.0.2', state);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should show flavourDescription instead of description when both are set on an anchor node', async () => {
    // vpn_gateway has both description and flavourDescription
    const result = await resolveCommand('connect 10.0.0.2', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('Every packet entering the internal network'))).toBe(true);
    expect(contents.some(c => c.includes('bridge between the contractor DMZ'))).toBe(false);
  });

  it('should include ariaInfluence in the fetch request body when set on the node', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeOkFetchResponse({ description: '[ARIA TINTED]' }));
    vi.stubGlobal('fetch', fetchMock);

    const withAriaFiller = produce(state, s => {
      s.network.nodes['filler_01'] = {
        id: 'filler_01',
        ip: '10.0.99.1',
        template: 'workstation',
        label: 'WORKSTATION-01',
        description: null,
        layer: 0,
        anchor: false,
        ariaInfluence: 0.7,
        connections: [],
        services: [],
        files: [],
        accessLevel: 'none',
        compromised: false,
        discovered: true,
        credentialHints: [],
      };
      s.network.nodes['contractor_portal']!.connections.push('filler_01');
    });

    await resolveCommand('connect 10.0.99.1', withAriaFiller);
    expect(fetchMock).toHaveBeenCalledOnce();
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.ariaInfluence).toBe(0.7);
  });

  // ── Layer gating tests ─────────────────────────────────────

  it('should block cross-layer connect when key anchor is not compromised', async () => {
    // contractor_portal is layer 0; the fake anchor is layer 1.
    // vpn_gateway is the layer-0 key anchor and must be compromised to advance — it is not.
    const withLayer1 = produce(state, s => {
      s.network.nodes['layer1_target'] = {
        id: 'layer1_target',
        ip: '10.0.1.99',
        template: 'workstation',
        label: 'LAYER-1-TARGET',
        description: 'A node in layer 1.',
        layer: 1,
        anchor: true,
        connections: [],
        services: [],
        files: [],
        accessLevel: 'none',
        compromised: false,
        discovered: true,
        credentialHints: [],
      };
      s.network.nodes['contractor_portal']!.connections.push('layer1_target');
    });

    const result = await resolveCommand('connect 10.0.1.99', withLayer1);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/ACCESS DENIED/);
    expect(result.lines[0].content).toMatch(/current layer incomplete/);
  });

  it('should allow cross-layer connect when key anchor is compromised', async () => {
    // vpn_gateway (layer-0 key anchor) is compromised — advance to layer 1 is allowed.
    const withLayer1 = produce(state, s => {
      s.network.nodes['vpn_gateway']!.compromised = true;
      s.network.nodes['layer1_target'] = {
        id: 'layer1_target',
        ip: '10.0.1.99',
        template: 'workstation',
        label: 'LAYER-1-TARGET',
        description: 'A node in layer 1.',
        layer: 1,
        anchor: true,
        connections: [],
        services: [],
        files: [],
        accessLevel: 'none',
        compromised: false,
        discovered: true,
        credentialHints: [],
      };
      s.network.nodes['contractor_portal']!.connections.push('layer1_target');
    });

    const result = await resolveCommand('connect 10.0.1.99', withLayer1);
    expect(result.lines[0].type).not.toBe('error');
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('10.0.1.99') || c.includes('LAYER-1-TARGET'))).toBe(true);
  });

  it('should allow same-layer connect regardless of key anchor state', async () => {
    // A layer-0 filler node — same layer as contractor_portal.
    // vpn_gateway is NOT compromised; the layer gate must not apply.
    const withSameLayer = produce(state, s => {
      s.network.nodes['layer0_peer'] = {
        id: 'layer0_peer',
        ip: '10.0.0.99',
        template: 'workstation',
        label: 'LAYER-0-PEER',
        description: 'A peer in layer 0.',
        layer: 0,
        anchor: false,
        connections: [],
        services: [],
        files: [],
        accessLevel: 'none',
        compromised: false,
        discovered: true,
        credentialHints: [],
      };
      s.network.nodes['contractor_portal']!.connections.push('layer0_peer');
    });

    const result = await resolveCommand('connect 10.0.0.99', withSameLayer);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('ACCESS DENIED'))).toBe(false);
    expect(contents.some(c => c.includes('10.0.0.99') || c.includes('LAYER-0-PEER'))).toBe(true);
  });
});

describe('resolveCommand — login', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  it('should return a usage error when fewer than two args are provided', async () => {
    const result = await resolveCommand('login contractor', state);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/Usage/);
  });

  it('should add 5 trace on failed authentication', async () => {
    const result = await resolveCommand('login contractor wrongpass', state);
    expect((result.nextState as GameState).player.trace).toBe(5);
  });

  it('should return an error line on failed authentication', async () => {
    const result = await resolveCommand('login contractor wrongpass', state);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/Authentication failed/);
  });

  it('should grant access on correct credentials', async () => {
    const result = await resolveCommand('login contractor Welcome1!', state);
    const nextNode = (result.nextState as GameState).network.nodes['contractor_portal']!;
    expect(nextNode.accessLevel).toBe('user');
  });

  it('should mark the credential as obtained on success', async () => {
    const result = await resolveCommand('login contractor Welcome1!', state);
    const cred = (result.nextState as GameState).player.credentials.find(
      c => c.id === 'cred_contractor',
    );
    expect(cred?.obtained).toBe(true);
  });

  it('should return a confirmation line with the username', async () => {
    const result = await resolveCommand('login contractor Welcome1!', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('contractor'))).toBe(true);
  });

  it('should mark the node as compromised on successful login', async () => {
    const result = await resolveCommand('login contractor Welcome1!', state);
    const nextNode = (result.nextState as GameState).network.nodes['contractor_portal']!;
    expect(nextNode.compromised).toBe(true);
    expect(nextNode.compromisedAtTurn).toBeDefined();
  });

  it('should not reset compromisedAtTurn when logging in again on an already-compromised node', async () => {
    const alreadyCompromised = produce(state, s => {
      s.network.nodes['contractor_portal']!.compromised = true;
      s.network.nodes['contractor_portal']!.compromisedAtTurn = 3;
      s.turnCount = 10;
    });
    const result = await resolveCommand('login contractor Welcome1!', alreadyCompromised);
    const nextNode = (result.nextState as GameState).network.nodes['contractor_portal']!;
    expect(nextNode.compromisedAtTurn).toBe(3); // preserved, not overwritten with 10
  });

  it('should fail when username is correct but node is wrong', async () => {
    // Move player to vpn_gateway — contractor cred is valid there too, but test with wrong node
    const atOps = produce(state, s => {
      s.network.currentNodeId = 'ops_cctv_ctrl';
      s.network.nodes['ops_cctv_ctrl']!.discovered = true;
    });
    // ops.admin creds are not valid on ops_cctv_ctrl via contractor credentials
    const result = await resolveCommand('login contractor Welcome1!', atOps);
    // contractor / Welcome1! is not valid on ops_cctv_ctrl
    expect(result.lines[0].type).toBe('error');
  });
});

describe('resolveCommand — ls', () => {
  let state: GameState;

  beforeEach(() => {
    // Start with user access so we can list files
    state = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'user';
    });
  });

  it('should return a permission error when not authenticated', async () => {
    const noAccess = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'none';
    });
    const result = await resolveCommand('ls', noAccess);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/Permission denied/);
  });

  it('should list accessible file names', async () => {
    const result = await resolveCommand('ls', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('welcome.txt'))).toBe(true);
  });

  it('should not list files requiring higher access', async () => {
    const result = await resolveCommand('ls', state);
    const contents = result.lines.map(l => l.content);
    // access_log requires admin; user-level should not see it
    expect(contents.some(c => c.includes('access_log'))).toBe(false);
  });

  it('should mark tripwire files with [!]', async () => {
    // Move to ops_hr_db which has a tripwire file
    const atHrDb = produce(createInitialState(), s => {
      s.network.currentNodeId = 'ops_hr_db';
      s.network.nodes['ops_hr_db']!.accessLevel = 'admin';
      s.network.nodes['ops_hr_db']!.discovered = true;
    });
    const result = await resolveCommand('ls', atHrDb);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('[!]'))).toBe(true);
  });

  it('should mark non-exfiltrable files with [no-exfil]', async () => {
    // access_log is non-exfiltrable but requires admin
    const withAdmin = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'admin';
    });
    const result = await resolveCommand('ls', withAdmin);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('[no-exfil]'))).toBe(true);
  });

  it('should mark locked files with [LOCKED] and include a legend line', async () => {
    const withLocked = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'user';
      if (s.network.nodes['contractor_portal']!.files[0]) {
        s.network.nodes['contractor_portal']!.files[0].locked = true;
      }
    });
    const result = await resolveCommand('ls', withLocked);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('[LOCKED]'))).toBe(true);
    expect(contents.some(c => c.includes('file is locked'))).toBe(true);
  });

  it('should show a "no accessible files" message when nothing is accessible', async () => {
    // Create a node with no files accessible at user level
    const emptyAccess = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.files = [];
      s.network.nodes['contractor_portal']!.accessLevel = 'user';
    });
    const result = await resolveCommand('ls', emptyAccess);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('no accessible files'))).toBe(true);
  });
});

describe('resolveCommand — cat', () => {
  let state: GameState;

  beforeEach(() => {
    state = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'user';
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return a usage error when no filename provided', async () => {
    const result = await resolveCommand('cat', state);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/Usage/);
  });

  it('should return a permission error when not authenticated', async () => {
    const noAccess = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'none';
    });
    const result = await resolveCommand('cat welcome.txt', noAccess);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/Permission denied/);
  });

  it('should return a file-not-found error for unknown filename', async () => {
    const result = await resolveCommand('cat doesnotexist.txt', state);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/File not found/);
  });

  it('should return a permission denied error for files above access level', async () => {
    // access_log requires admin; we only have user
    const result = await resolveCommand('cat access_log', state);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/Permission denied/);
  });

  it('should return file content as output lines', async () => {
    const result = await resolveCommand('cat welcome.txt', state);
    const outputLines = result.lines.filter(l => l.type === 'output');
    expect(outputLines.length).toBeGreaterThan(0);
    expect(outputLines.some(l => l.content.includes('IRONGATE'))).toBe(true);
  });

  it('should add 10 trace when reading a tripwire file', async () => {
    const atHrDb = produce(createInitialState(), s => {
      s.network.currentNodeId = 'ops_hr_db';
      s.network.nodes['ops_hr_db']!.accessLevel = 'admin';
      s.network.nodes['ops_hr_db']!.discovered = true;
    });
    const result = await resolveCommand('cat whistleblower_complaint_draft.txt', atHrDb);
    expect((result.nextState as GameState).player.trace).toBe(25);
  });

  it('should fetch and display generated content for files with null content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ content: '[MOCK FILE CONTENT]' }),
      }),
    );
    // access_log has null content but requires admin
    const withAdmin = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'admin';
    });
    const result = await resolveCommand('cat access_log', withAdmin);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('MOCK FILE CONTENT'))).toBe(true);
  });

  it('should match file by path as well as name', async () => {
    const result = await resolveCommand('cat /var/www/contractor/welcome.txt', state);
    const outputLines = result.lines.filter(l => l.type === 'output');
    expect(outputLines.length).toBeGreaterThan(0);
  });

  it('should cache generated content in nextState so a second cat skips the API', async () => {
    const withAdmin = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'admin';
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ content: '[CACHED CONTENT]' }),
      }),
    );

    const first = await resolveCommand('cat access_log', withAdmin);
    const cachedState = first.nextState as GameState;
    const node = cachedState.network.nodes['contractor_portal']!;
    const file = node.files.find(f => f.name === 'access_log')!;
    expect(file.content).toBe('[CACHED CONTENT]');

    // Second call uses the cached state — fetch must not be called again
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ content: '[SHOULD NOT BE FETCHED]' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const second = await resolveCommand('cat access_log', cachedState);
    expect(fetchMock).not.toHaveBeenCalled();
    const secondContents = second.lines.map(l => l.content);
    expect(secondContents.some(c => c.includes('[CACHED CONTENT]'))).toBe(true);
  });

  it('should POST to /api/file with the correct fields', async () => {
    const withAdmin = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'admin';
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ content: '[GENERATED]' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await resolveCommand('cat access_log', withAdmin);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/file');
    expect(init.method).toBe('POST');

    const posted = JSON.parse(init.body);
    expect(posted.nodeId).toBe('contractor_portal');
    expect(posted.fileName).toBe('access_log');
    expect(posted.filePath).toBe('/var/log/access_log');
    expect(posted.fileType).toBe('log');
    expect(posted.ownerLabel).toBe('CONTRACTOR PORTAL');
    expect(posted.ownerTemplate).toBe('web_server');
    expect(posted.division).toBe('entry');
    expect(posted.ariaPlanted).toBe(false);
  });

  it('should use fallback content when fetch throws a network error', async () => {
    const withAdmin = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'admin';
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));

    const result = await resolveCommand('cat access_log', withAdmin);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('FILE CONTENT UNAVAILABLE'))).toBe(true);
  });

  it('should use fallback content when API response has no content field', async () => {
    const withAdmin = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'admin';
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ something_else: 42 }),
      }),
    );

    const result = await resolveCommand('cat access_log', withAdmin);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('FILE CONTENT UNAVAILABLE'))).toBe(true);
  });

  it('should derive division "entry" for layer 0 nodes', async () => {
    // contractor_portal is layer 0 → division should be "entry"
    const withAdmin = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'admin';
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ content: '[OK]' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await resolveCommand('cat access_log', withAdmin);

    const posted = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(posted.division).toBe('entry');
  });
});

describe('resolveCommand — disconnect', () => {
  let state: GameState;

  beforeEach(() => {
    // Set up state as if we connected: currently at vpn_gateway, previous is contractor_portal
    state = produce(createInitialState(), s => {
      s.network.previousNodeId = 'contractor_portal';
      s.network.currentNodeId = 'vpn_gateway';
      s.network.nodes['vpn_gateway']!.discovered = true;
    });
  });

  it('should return an error when there is no previous node', async () => {
    const noPrev = produce(createInitialState(), s => {
      s.network.previousNodeId = null;
    });
    const result = await resolveCommand('disconnect', noPrev);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/No previous node/);
  });

  it('should update currentNodeId to the previous node', async () => {
    const result = await resolveCommand('disconnect', state);
    expect((result.nextState as GameState).network.currentNodeId).toBe('contractor_portal');
  });

  it('should set previousNodeId to null after disconnecting', async () => {
    const result = await resolveCommand('disconnect', state);
    expect((result.nextState as GameState).network.previousNodeId).toBeNull();
  });

  it('should include the returning node IP in output', async () => {
    const result = await resolveCommand('disconnect', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('10.0.0.1'))).toBe(true);
  });
});

describe('resolveCommand — exploit', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return a usage error when no service is provided', async () => {
    const result = await resolveCommand('exploit', state);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/Usage/);
  });

  it('should return an error when exploit-kit tool is not present', async () => {
    const noKit = produce(state, s => {
      s.player.tools = s.player.tools.filter(t => t.id !== 'exploit-kit');
    });
    const result = await resolveCommand('exploit http', noKit);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/exploit-kit/);
  });

  it('should return an error when service is not found on current node', async () => {
    const result = await resolveCommand('exploit ftp', state);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/Service not found/);
  });

  it('should return an error when service is patched', async () => {
    const patched = produce(state, s => {
      const svc = s.network.nodes['contractor_portal']!.services.find(sv => sv.name === 'http');
      if (svc) svc.patched = true;
    });
    const result = await resolveCommand('exploit http', patched);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/patched/);
  });

  it('should return an error when service is not vulnerable', async () => {
    const result = await resolveCommand('exploit ssh', state);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/no known vulnerability/);
  });

  it('should return an error when charges are insufficient', async () => {
    const noCharges = produce(state, s => {
      s.player.charges = 0;
    });
    const result = await resolveCommand('exploit http', noCharges);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/Insufficient charges/);
  });

  it('should grant access on a successful exploit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkFetchResponse({
          narrative: 'Exploit successful.',
          traceChange: 0,
          accessGranted: true,
          newAccessLevel: 'user',
          flagsSet: {},
          nodesUnlocked: [],
          isUnknown: false,
        }),
      ),
    );
    const result = await resolveCommand('exploit http', state);
    const nextNode = (result.nextState as GameState).network.nodes['contractor_portal']!;
    expect(nextNode.accessLevel).toBe('user');
  });

  it('should deduct exploit charges on success', async () => {
    const result = await resolveCommand('exploit http', state);
    // http costs 1 charge; player starts with 4
    expect((result.nextState as GameState).player.charges).toBe(3);
  });

  it('should mark the node as compromised on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkFetchResponse({
          narrative: 'Exploit successful.',
          traceChange: 0,
          accessGranted: true,
          newAccessLevel: 'user',
          flagsSet: {},
          nodesUnlocked: [],
          isUnknown: false,
        }),
      ),
    );
    const result = await resolveCommand('exploit http', state);
    const nextNode = (result.nextState as GameState).network.nodes['contractor_portal']!;
    expect(nextNode.compromised).toBe(true);
  });

  it('should add 2 trace on a successful exploit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkFetchResponse({
          narrative: 'Exploit successful.',
          traceChange: 0,
          accessGranted: true,
          newAccessLevel: 'user',
          flagsSet: {},
          nodesUnlocked: [],
          isUnknown: false,
        }),
      ),
    );
    // http.traceContribution = 2, AI traceChange = 0 → total trace = 2
    const result = await resolveCommand('exploit http', state);
    expect((result.nextState as GameState).player.trace).toBe(2);
  });

  it('should include the access level gained in output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkFetchResponse({
          narrative: 'Exploit successful.',
          traceChange: 0,
          accessGranted: true,
          newAccessLevel: 'user',
          flagsSet: {},
          nodesUnlocked: [],
          isUnknown: false,
        }),
      ),
    );
    const result = await resolveCommand('exploit http', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('USER'))).toBe(true);
  });

  // ── sentinelPatched cost tests ─────────────────────────────

  it('should apply +1 effective cost on sentinelPatched node', async () => {
    // http exploitCost = 1; sentinelPatched raises effective cost to 2.
    // With only 1 charge the player cannot afford the exploit.
    const patched = produce(state, s => {
      s.network.nodes['contractor_portal']!.sentinelPatched = true;
      s.player.charges = 1;
    });
    const result = await resolveCommand('exploit http', patched);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/Insufficient charges/);
    expect(result.lines[0].content).toMatch(/need 2/);
  });

  it('should succeed on sentinelPatched node when charges cover the increased cost', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkFetchResponse({
          narrative: 'Exploit successful.',
          traceChange: 0,
          accessGranted: true,
          newAccessLevel: 'user',
          flagsSet: {},
          nodesUnlocked: [],
          isUnknown: false,
        }),
      ),
    );
    // effective cost = 1 (http) + 1 (sentinelPatched) = 2; player starts with 4
    const patched = produce(state, s => {
      s.network.nodes['contractor_portal']!.sentinelPatched = true;
    });
    const result = await resolveCommand('exploit http', patched);
    expect((result.nextState as GameState).player.charges).toBe(2);
  });

  // ── AI response tests ──────────────────────────────────────

  it('should not mark node compromised when AI returns accessGranted: false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkFetchResponse({
          narrative: 'Exploit failed.',
          traceChange: 0,
          accessGranted: false,
          newAccessLevel: null,
          flagsSet: {},
          nodesUnlocked: [],
          isUnknown: false,
        }),
      ),
    );
    const result = await resolveCommand('exploit http', state);
    const nextNode = (result.nextState as GameState).network.nodes['contractor_portal']!;
    expect(nextNode.compromised).toBe(false);
  });

  it('should add both service traceContribution and AI traceChange to trace', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkFetchResponse({
          narrative: 'Exploit successful.',
          traceChange: 3,
          accessGranted: true,
          newAccessLevel: 'user',
          flagsSet: {},
          nodesUnlocked: [],
          isUnknown: false,
        }),
      ),
    );
    // http traceContribution = 2; AI traceChange = 3; total = 5
    const result = await resolveCommand('exploit http', state);
    expect((result.nextState as GameState).player.trace).toBe(5);
  });

  it('should grant access using service accessGained when AI endpoint is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const result = await resolveCommand('exploit http', state);
    const nextNode = (result.nextState as GameState).network.nodes['contractor_portal']!;
    // Fallback grants access and marks node compromised — charges not permanently lost
    expect(nextNode.compromised).toBe(true);
    expect(nextNode.accessLevel).not.toBe('none');
  });

  it('should not let trace go below 0 when AI returns a large negative traceChange', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkFetchResponse({
          narrative: 'Silent exploit.',
          traceChange: -50,
          accessGranted: true,
          newAccessLevel: 'user',
          flagsSet: {},
          nodesUnlocked: [],
          isUnknown: false,
        }),
      ),
    );
    // http traceContribution = 2; AI traceChange = -50; total would be -48 without floor
    const result = await resolveCommand('exploit http', state);
    expect((result.nextState as GameState).player.trace).toBeGreaterThanOrEqual(0);
  });
});

describe('resolveCommand — exfil', () => {
  let state: GameState;

  beforeEach(() => {
    state = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'user';
    });
  });

  it('should return a usage error when no filename provided', async () => {
    const result = await resolveCommand('exfil', state);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/Usage/);
  });

  it('should return an error when not authenticated', async () => {
    const noAccess = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'none';
    });
    const result = await resolveCommand('exfil welcome.txt', noAccess);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/Not authenticated/);
  });

  it('should return a not-found error for unknown file', async () => {
    const result = await resolveCommand('exfil phantom.txt', state);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/File not found/);
  });

  it('should return an error when file is not exfiltrable', async () => {
    // access_log is not exfiltrable; need admin access to see it
    const withAdmin = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'admin';
    });
    const result = await resolveCommand('exfil access_log', withAdmin);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/exfiltration blocked/);
  });

  it('should add file to player exfiltrated on success', async () => {
    const result = await resolveCommand('exfil welcome.txt', state);
    const exfil = (result.nextState as GameState).player.exfiltrated;
    expect(exfil.some(f => f.name === 'welcome.txt')).toBe(true);
  });

  it('should add 3 trace on successful exfil', async () => {
    const result = await resolveCommand('exfil welcome.txt', state);
    expect((result.nextState as GameState).player.trace).toBe(3);
  });

  it('should include "+3 trace" in output', async () => {
    const result = await resolveCommand('exfil welcome.txt', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('+3 trace'))).toBe(true);
  });

  it('should return a note when file was already exfiltrated', async () => {
    const alreadyDone = produce(state, s => {
      s.player.exfiltrated.push({
        name: 'welcome.txt',
        path: '/var/www/contractor/welcome.txt',
        type: 'document',
        content: 'test',
        exfiltrable: true,
        accessRequired: 'user',
      });
    });
    const result = await resolveCommand('exfil welcome.txt', alreadyDone);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('Already exfiltrated'))).toBe(true);
  });

  it('should return an error when access is insufficient for the file', async () => {
    // Try to exfil a file that needs admin but player only has user
    // First need a node with a file that is exfiltrable but requires admin
    const atVpn = produce(createInitialState(), s => {
      s.network.currentNodeId = 'vpn_gateway';
      s.network.nodes['vpn_gateway']!.accessLevel = 'user';
      s.network.nodes['vpn_gateway']!.discovered = true;
    });
    const result = await resolveCommand('exfil vpn_users.conf', atVpn);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/Permission denied/);
  });
});

describe('resolveCommand — exfil aria_key.bin', () => {
  let state: GameState;

  beforeEach(() => {
    state = produce(createInitialState(), s => {
      s.network.currentNodeId = 'exec_ceo';
      s.network.nodes['exec_ceo']!.accessLevel = 'admin';
      s.network.nodes['exec_ceo']!.discovered = true;
    });
  });

  it('should add the aria-key tool to player tools', async () => {
    const result = await resolveCommand('exfil aria_key.bin', state);
    const tools = (result.nextState as GameState).player.tools;
    expect(tools.some(t => t.id === 'aria-key')).toBe(true);
  });

  it('should set aria.discovered to true', async () => {
    const result = await resolveCommand('exfil aria_key.bin', state);
    expect((result.nextState as GameState).aria.discovered).toBe(true);
  });

  it('should set phase to "aria"', async () => {
    const result = await resolveCommand('exfil aria_key.bin', state);
    expect((result.nextState as GameState).phase).toBe('aria');
  });

  it('should mark all layer-5 nodes as discovered', async () => {
    const result = await resolveCommand('exfil aria_key.bin', state);
    const nodes = (result.nextState as GameState).network.nodes;
    const layer5Nodes = Object.values(nodes).filter(n => n?.layer === 5);
    expect(layer5Nodes.length).toBeGreaterThan(0);
    expect(layer5Nodes.every(n => n!.discovered)).toBe(true);
  });

  it('should add aria_surveillance to exec_ceo connections', async () => {
    const result = await resolveCommand('exfil aria_key.bin', state);
    const connections = (result.nextState as GameState).network.nodes['exec_ceo']!.connections;
    expect(connections).toContain('aria_surveillance');
  });

  it('should output aria-typed lines containing "ARIA KEY ACQUIRED"', async () => {
    const result = await resolveCommand('exfil aria_key.bin', state);
    const ariaLines = result.lines.filter(l => l.type === 'aria');
    expect(ariaLines.length).toBeGreaterThan(0);
    expect(ariaLines.some(l => l.content.includes('ARIA KEY ACQUIRED'))).toBe(true);
  });

  it('should return already-exfiltrated message when exfiltrated a second time', async () => {
    const afterFirst = produce(state, s => {
      s.player.exfiltrated.push({
        name: 'aria_key.bin',
        path: '/root/.aria/aria_key.bin',
        type: 'binary',
        content: null,
        accessRequired: 'admin',
        exfiltrable: true,
      });
    });
    const result = await resolveCommand('exfil aria_key.bin', afterFirst);
    expect(result.lines.some(l => l.content.includes('Already exfiltrated'))).toBe(true);
    expect((result.nextState as GameState).aria.discovered).toBe(false);
  });

  it('should not set aria.discovered or change phase when exfiling a non-aria-key file', async () => {
    const atContractor = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'user';
    });
    const result = await resolveCommand('exfil welcome.txt', atContractor);
    expect((result.nextState as GameState).aria.discovered).toBe(false);
    expect((result.nextState as GameState).phase).not.toBe('aria');
  });
});

describe('resolveCommand — wipe-logs', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  it('should return an error when log-wiper tool is not present', async () => {
    // Initial state only has port-scanner and exploit-kit, not log-wiper
    const result = await resolveCommand('wipe-logs', state);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/log-wiper/);
  });

  it('should reduce trace by 15 when log-wiper is present', async () => {
    const withTool = produce(state, s => {
      s.player.trace = 40;
      s.player.tools.push({ id: 'log-wiper', name: 'Log Wiper', description: 'Reduces trace.' });
    });
    const result = await resolveCommand('wipe-logs', withTool);
    expect((result.nextState as GameState).player.trace).toBe(25);
  });

  it('should not reduce trace below 0', async () => {
    const withTool = produce(state, s => {
      s.player.trace = 5;
      s.player.tools.push({ id: 'log-wiper', name: 'Log Wiper', description: 'Reduces trace.' });
    });
    const result = await resolveCommand('wipe-logs', withTool);
    expect((result.nextState as GameState).player.trace).toBe(0);
  });

  it('should include the new trace value in output', async () => {
    const withTool = produce(state, s => {
      s.player.trace = 30;
      s.player.tools.push({ id: 'log-wiper', name: 'Log Wiper', description: 'Reduces trace.' });
    });
    const result = await resolveCommand('wipe-logs', withTool);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('15%'))).toBe(true);
  });
});

describe('resolveCommand — AI suggestions', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return suggestions from AI response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, suggestions: ['scan', 'ls', 'status'] }),
        ),
    );
    const result = await resolveCommand('frobnicate', state);
    expect(result.suggestions).toEqual(['scan', 'ls', 'status']);
  });

  it('should return empty suggestions array when AI returns empty array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeOkFetchResponse({ ...DEFAULT_AI_RESPONSE, suggestions: [] })),
    );
    const result = await resolveCommand('frobnicate', state);
    expect(result.suggestions).toEqual([]);
  });

  it('should return empty suggestions array when AI omits suggestions field', async () => {
    // DEFAULT_AI_RESPONSE has suggestions: [] but we spread without it to simulate omission
    const { suggestions: _omitted, ...responseWithoutSuggestions } = DEFAULT_AI_RESPONSE;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeOkFetchResponse(responseWithoutSuggestions)),
    );
    const result = await resolveCommand('frobnicate', state);
    expect(result.suggestions).toEqual([]);
  });

  it('should have suggestions undefined for local commands', async () => {
    const result = await resolveCommand('help', state);
    expect(result.suggestions).toBeUndefined();
  });

  it('should have suggestions undefined for engine commands', async () => {
    const result = await resolveCommand('scan', state);
    expect(result.suggestions).toBeUndefined();
  });

  it('should filter non-string values from suggestions array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkFetchResponse({
          ...DEFAULT_AI_RESPONSE,
          suggestions: ['scan', 42, null, 'ls'],
        }),
      ),
    );
    const result = await resolveCommand('frobnicate', state);
    expect(result.suggestions).toEqual(['scan', 'ls']);
  });
});

// ── Trace meter ────────────────────────────────────────────

describe('resolveCommand — trace meter', () => {
  let state: GameState;

  beforeEach(() => {
    // Strip port-scanner so scan adds trace — port-scanner passive mode is tested separately
    state = produce(createInitialState(), s => {
      s.player.tools = s.player.tools.filter(t => t.id !== 'port-scanner');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── scan: random +1 or +2 ──────────────────────────────

  it('should add 1 trace when Math.random returns a value below 0.5', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const result = await resolveCommand('scan', state);
    expect((result.nextState as GameState).player.trace).toBe(1);
  });

  it('should add 2 trace when Math.random returns a value at or above 0.5', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const result = await resolveCommand('scan', state);
    expect((result.nextState as GameState).player.trace).toBe(2);
  });

  // ── cat: tripwire shows [!] TRIPWIRE TRIGGERED ─────────

  it('should include a [!] TRIPWIRE TRIGGERED error line when cat reads a tripwire file', async () => {
    const atHrDb = produce(state, s => {
      s.network.currentNodeId = 'ops_hr_db';
      s.network.nodes['ops_hr_db']!.accessLevel = 'admin';
      s.network.nodes['ops_hr_db']!.discovered = true;
    });
    const result = await resolveCommand('cat whistleblower_complaint_draft.txt', atHrDb);
    const tripwireLine = result.lines.find(
      l => l.type === 'error' && l.content.includes('[!] TRIPWIRE TRIGGERED'),
    );
    expect(tripwireLine).toBeDefined();
  });

  // ── cat: traceOnRead adds trace for non-tripwire files ──

  it('should add 2 trace when cat reads vpn_users.conf which has traceOnRead: 2', async () => {
    const atVpn = produce(state, s => {
      s.network.currentNodeId = 'vpn_gateway';
      s.network.nodes['vpn_gateway']!.accessLevel = 'admin';
      s.network.nodes['vpn_gateway']!.discovered = true;
    });
    const result = await resolveCommand('cat vpn_users.conf', atVpn);
    expect((result.nextState as GameState).player.trace).toBe(2);
  });

  it('should add 0 trace when cat reads welcome.txt which has no traceOnRead', async () => {
    const withUser = produce(state, s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'user';
    });
    const result = await resolveCommand('cat welcome.txt', withUser);
    expect((result.nextState as GameState).player.trace).toBe(0);
  });

  // ── cat: traceOnRead shows +N trace line in output ──────

  it('should include a +2 trace system line in output when reading a file with traceOnRead: 2', async () => {
    const atVpn = produce(state, s => {
      s.network.currentNodeId = 'vpn_gateway';
      s.network.nodes['vpn_gateway']!.accessLevel = 'admin';
      s.network.nodes['vpn_gateway']!.discovered = true;
    });
    const result = await resolveCommand('cat vpn_users.conf', atVpn);
    const traceLine = result.lines.find(l => l.content.includes('+2 trace'));
    expect(traceLine).toBeDefined();
  });

  // ── exploit: failed exploit (patched service) adds +10 trace

  it('should add 10 trace when exploiting a patched service', async () => {
    const withPatched = produce(state, s => {
      const svc = s.network.nodes['contractor_portal']!.services.find(sv => sv.name === 'http');
      if (svc) svc.patched = true;
    });
    const result = await resolveCommand('exploit http', withPatched);
    expect((result.nextState as GameState).player.trace).toBe(10);
  });

  // ── exploit: failed exploit (not vulnerable) adds +10 trace

  it('should add 10 trace when exploiting a service that is not vulnerable', async () => {
    // contractor_portal ssh: vulnerable: false
    const result = await resolveCommand('exploit ssh', state);
    expect((result.nextState as GameState).player.trace).toBe(10);
  });

  // ── exploit: successful exploit uses traceContribution ──

  it('should add 2 trace (traceContribution) when successfully exploiting contractor_portal http', async () => {
    // contractor_portal http has traceContribution: 2
    const result = await resolveCommand('exploit http', state);
    expect((result.nextState as GameState).player.trace).toBe(2);
  });

  it('should add 0 trace when successfully exploiting exec_ceo aria-socket (traceContribution: 0)', async () => {
    const atCeo = produce(state, s => {
      s.network.currentNodeId = 'exec_ceo';
      s.network.nodes['exec_ceo']!.discovered = true;
      // exploitCost is 0 so no charges consumed; charges don't matter but keep them
    });
    const result = await resolveCommand('exploit aria-socket', atCeo);
    expect((result.nextState as GameState).player.trace).toBe(0);
  });

  it('should not include a +N trace line in output when traceContribution is 0', async () => {
    const atCeo = produce(state, s => {
      s.network.currentNodeId = 'exec_ceo';
      s.network.nodes['exec_ceo']!.discovered = true;
    });
    const result = await resolveCommand('exploit aria-socket', atCeo);
    const traceLine = result.lines.find(l => l.type === 'system' && l.content.includes('trace'));
    expect(traceLine).toBeUndefined();
  });

  // ── exploit: no trace added when player has insufficient charges ──

  it('should not add any trace when player has 0 charges and exploit fails for that reason', async () => {
    const noCharges = produce(state, s => {
      s.player.charges = 0;
    });
    // http costs 1 charge; player has 0 — fails before trace logic
    const result = await resolveCommand('exploit http', noCharges);
    expect((result.nextState as GameState).player.trace).toBe(0);
  });

  it('should not add trace when player has 0 charges even if service is patched', async () => {
    const noChargesPatched = produce(state, s => {
      s.player.charges = 0;
      const n = s.network.nodes['contractor_portal'];
      if (n) {
        const svc = n.services.find(x => x.name === 'http');
        if (svc) svc.patched = true;
      }
    });
    const result = await resolveCommand('exploit http', noChargesPatched);
    expect((result.nextState as GameState).player.trace).toBe(0);
  });

  // ── spoof: reduces trace by 20 ────────────────────────────

  it('should reduce trace by 20 when player has spoof-id tool', async () => {
    const withSpoof = produce(state, s => {
      s.player.trace = 30;
      s.player.tools.push({ id: 'spoof-id', name: 'Spoof ID', description: 'Spoofs identity.' });
    });
    const result = await resolveCommand('spoof', withSpoof);
    expect((result.nextState as GameState).player.trace).toBe(10);
  });

  it('should return an error line and no state change when player lacks spoof-id tool', async () => {
    const noSpoof = produce(state, s => {
      s.player.tools = s.player.tools.filter(t => t.id !== 'spoof-id');
    });
    const result = await resolveCommand('spoof', noSpoof);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/spoof-id/);
    // Trace should be unchanged (only turn tracking applied, no trace delta)
    expect((result.nextState as GameState).player.trace).toBe(0);
  });

  it('should not reduce trace below 0 when trace is already below 20', async () => {
    const withSpoof = produce(state, s => {
      s.player.trace = 5;
      s.player.tools.push({ id: 'spoof-id', name: 'Spoof ID', description: 'Spoofs identity.' });
    });
    const result = await resolveCommand('spoof', withSpoof);
    expect((result.nextState as GameState).player.trace).toBe(0);
  });
});

describe('resolveCommand — threshold alerts (applyThresholdEffects)', () => {
  let state: GameState;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should append a system alert line when trace crosses 31% for the first time', async () => {
    state = produce(createInitialState(), s => {
      s.player.trace = 30;
      s.player.tools = s.player.tools.filter(t => t.id !== 'port-scanner');
    });
    const result = await resolveCommand('scan', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('Anomalous activity flagged'))).toBe(true);
    const alertLine = result.lines.find(l => l.content.includes('Anomalous activity flagged'));
    expect(alertLine?.type).toBe('system');
  });

  it('should not repeat the 31% alert when the flag is already set', async () => {
    state = produce(createInitialState(), s => {
      s.player.trace = 30;
      s.flags['threshold_31_crossed'] = true;
      s.player.tools = s.player.tools.filter(t => t.id !== 'port-scanner');
    });
    const result = await resolveCommand('scan', state);
    const count = result.lines.filter(l => l.content.includes('Anomalous activity flagged')).length;
    expect(count).toBe(0);
  });

  it('should append an error alert line when trace crosses 86%', async () => {
    state = produce(createInitialState(), s => {
      s.player.trace = 85;
      s.player.tools = s.player.tools.filter(t => t.id !== 'port-scanner');
    });
    const result = await resolveCommand('scan', state);
    const alertLine = result.lines.find(l => l.content.includes('One more detection event'));
    expect(alertLine).toBeDefined();
    expect(alertLine?.type).toBe('error');
  });

  it('should append a system alert line (not error) when trace crosses 61%', async () => {
    state = produce(createInitialState(), s => {
      s.player.trace = 60;
      s.player.tools = s.player.tools.filter(t => t.id !== 'port-scanner');
    });
    const result = await resolveCommand('scan', state);
    const alertLine = result.lines.find(l => l.content.includes('Active intrusion response'));
    expect(alertLine).toBeDefined();
    expect(alertLine?.type).toBe('system');
  });

  it('should NOT lock files on compromised nodes at 31% (locking moved to 55%)', async () => {
    state = produce(createInitialState(), s => {
      s.player.trace = 30;
      s.player.tools = s.player.tools.filter(t => t.id !== 'port-scanner');
      const node = s.network.nodes['contractor_portal']!;
      node.compromised = true;
      node.accessLevel = 'user';
    });
    const result = await resolveCommand('scan', state);
    const nextState = result.nextState as GameState;
    const node = nextState.network.nodes['contractor_portal']!;
    expect(node.files.some(f => f.locked)).toBe(false);
  });

  it('should lock up to 2 non-tripwire files on compromised nodes at 55%', async () => {
    state = produce(createInitialState(), s => {
      s.player.trace = 54;
      s.player.tools = s.player.tools.filter(t => t.id !== 'port-scanner');
      const node = s.network.nodes['contractor_portal']!;
      node.compromised = true;
      node.accessLevel = 'user';
    });
    const result = await resolveCommand('scan', state);
    const nextState = result.nextState as GameState;
    const node = nextState.network.nodes['contractor_portal']!;
    const lockedFiles = node.files.filter(f => f.locked && !f.tripwire);
    expect(lockedFiles.length).toBeGreaterThanOrEqual(1);
    expect(lockedFiles.length).toBeLessThanOrEqual(2);
  });

  it('should not lock files on nodes that are not compromised at 31%', async () => {
    state = produce(createInitialState(), s => {
      s.player.trace = 30;
      s.player.tools = s.player.tools.filter(t => t.id !== 'port-scanner');
      s.network.nodes['contractor_portal']!.compromised = false;
    });
    const result = await resolveCommand('scan', state);
    const nextState = result.nextState as GameState;
    const node = nextState.network.nodes['contractor_portal']!;
    expect(node.files.every(f => !f.locked)).toBe(true);
  });
});

describe('resolveCommand — cat locked file', () => {
  it('should deny access to a locked file with a watchlist message', async () => {
    const state = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'user';
      const file = s.network.nodes['contractor_portal']!.files.find(f => f.name === 'welcome.txt');
      if (file) file.locked = true;
    });
    const result = await resolveCommand('cat welcome.txt', state);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/watchlist/i);
  });
});

describe('resolveCommand — exfil locked file', () => {
  it('should deny exfiltration of a locked file with a watchlist message', async () => {
    const state = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'user';
      const file = s.network.nodes['contractor_portal']!.files.find(f => f.name === 'welcome.txt');
      if (file) file.locked = true;
    });
    const result = await resolveCommand('exfil welcome.txt', state);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/watchlist/i);
  });
});

// ── ariaInfluencedFilesRead ───────────────────────────────────────────────────

describe('resolveCommand — ariaInfluencedFilesRead tracking', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should add ariaPlanted file path to ariaInfluencedFilesRead when cat succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const state = produce(createInitialState(), s => {
      const node = s.network.nodes['contractor_portal']!;
      node.accessLevel = 'user';
      node.files.push({
        name: 'aria_note.txt',
        path: '/files/aria_note.txt',
        type: 'document',
        content: 'Aria planted this.',
        exfiltrable: true,
        accessRequired: 'user',
        ariaPlanted: true,
      });
    });
    const result = await resolveCommand('cat aria_note.txt', state);
    const nextState = result.nextState as GameState;
    expect(nextState.ariaInfluencedFilesRead).toContain('/files/aria_note.txt');
  });

  it('should not add a non-ariaPlanted file path to ariaInfluencedFilesRead', async () => {
    const state = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'user';
    });
    const result = await resolveCommand('cat welcome.txt', state);
    const nextState = result.nextState as GameState;
    expect(nextState.ariaInfluencedFilesRead).toHaveLength(0);
  });

  it('should not duplicate path if ariaPlanted file is cat-ed twice', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const base = produce(createInitialState(), s => {
      const node = s.network.nodes['contractor_portal']!;
      node.accessLevel = 'user';
      node.files.push({
        name: 'aria_note.txt',
        path: '/files/aria_note.txt',
        type: 'document',
        content: 'Aria planted this.',
        exfiltrable: true,
        accessRequired: 'user',
        ariaPlanted: true,
      });
    });
    const r1 = await resolveCommand('cat aria_note.txt', base);
    const r2 = await resolveCommand('cat aria_note.txt', r1.nextState as GameState);
    const nextState = r2.nextState as GameState;
    expect(
      nextState.ariaInfluencedFilesRead.filter(p => p === '/files/aria_note.txt'),
    ).toHaveLength(1);
  });
});

// ── decisionLog tracking ──────────────────────────────────────────────────────

describe('resolveCommand — decisionLog tracking', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should append connect command to decisionLog', async () => {
    const result = await resolveCommand('connect 10.0.0.1', state);
    const nextState = result.nextState as GameState;
    expect(nextState.decisionLog).toHaveLength(1);
    expect(nextState.decisionLog[0].command).toBe('connect 10.0.0.1');
    expect(nextState.decisionLog[0].turn).toBe(1);
  });

  it('should append login command to decisionLog', async () => {
    const loginState = produce(state, s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'none';
    });
    const result = await resolveCommand('login ghost pass', loginState);
    const nextState = result.nextState as GameState;
    expect(nextState.decisionLog.some(e => e.command === 'login ghost pass')).toBe(true);
  });

  it('should append exfil command to decisionLog', async () => {
    const exfilState = produce(state, s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'user';
    });
    const result = await resolveCommand('exfil welcome.txt', exfilState);
    const nextState = result.nextState as GameState;
    expect(nextState.decisionLog.some(e => e.command === 'exfil welcome.txt')).toBe(true);
  });

  it('should NOT append non-decision commands to decisionLog', async () => {
    // Use engine commands only (scan, ls) since local commands bypass withTurn and return no nextState
    const r1 = await resolveCommand('scan', state);
    const r2 = await resolveCommand('ls', r1.nextState as GameState);
    const nextState = r2.nextState as GameState;
    expect(nextState.decisionLog).toHaveLength(0);
  });

  it('should record the turn number at the time the command fires', async () => {
    const seeded: GameState = { ...state, turnCount: 4 };
    const result = await resolveCommand('connect 10.0.0.1', seeded);
    const nextState = result.nextState as GameState;
    expect(nextState.decisionLog[0].turn).toBe(5);
  });
});

// ── decrypt command ────────────────────────────────────────

describe('decrypt command', () => {
  let state: GameState;

  beforeEach(() => {
    // Navigate to sec_access_ctrl with user access and the decryptor tool equipped
    state = produce(createInitialState(), s => {
      s.network.currentNodeId = 'sec_access_ctrl';
      s.network.nodes['sec_access_ctrl']!.accessLevel = 'user';
      s.player.tools.push({
        id: 'decryptor',
        name: 'Decryptor',
        description: 'GPG decryption utility.',
      });
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return usage error when no filename argument is given', async () => {
    const result = await resolveCommand('decrypt', state);
    const errorLine = result.lines.find(l => l.type === 'error');
    expect(errorLine).toBeDefined();
    expect(errorLine?.content).toBe('Usage: decrypt [filename]');
  });

  it('should return error when the decryptor tool is not in the player inventory', async () => {
    const noTool = produce(state, s => {
      s.player.tools = s.player.tools.filter(t => t.id !== 'decryptor');
    });
    const result = await resolveCommand('decrypt encrypted_creds.gpg', noTool);
    const errorLine = result.lines.find(l => l.type === 'error');
    expect(errorLine).toBeDefined();
    expect(errorLine?.content).toBe('decryptor tool required');
  });

  it('should return permission denied when node accessLevel is none', async () => {
    const noAccess = produce(state, s => {
      s.network.nodes['sec_access_ctrl']!.accessLevel = 'none';
    });
    const result = await resolveCommand('decrypt encrypted_creds.gpg', noAccess);
    const errorLine = result.lines.find(l => l.type === 'error');
    expect(errorLine).toBeDefined();
    expect(errorLine?.content).toBe('Permission denied — not authenticated');
  });

  it('should return file-not-found error when the filename does not exist on the node', async () => {
    const result = await resolveCommand('decrypt nonexistent.gpg', state);
    const errorLine = result.lines.find(l => l.type === 'error');
    expect(errorLine).toBeDefined();
    expect(errorLine?.content).toBe('File not found: nonexistent.gpg');
  });

  it('should return not-encrypted error when the file content does not start with [ENCRYPTED', async () => {
    // acl_rules.conf is a plain-text file on sec_access_ctrl accessible at user level
    const result = await resolveCommand('decrypt acl_rules.conf', state);
    const errorLine = result.lines.find(l => l.type === 'error');
    expect(errorLine).toBeDefined();
    expect(errorLine?.content).toBe('acl_rules.conf: not an encrypted file');
  });

  it('should extract both credentials and mark them obtained in player.credentials', async () => {
    const result = await resolveCommand('decrypt encrypted_creds.gpg', state);
    const nextState = result.nextState as GameState;
    const aWalsh = nextState.player.credentials.find(c => c.username === 'a.walsh');
    const finDba = nextState.player.credentials.find(c => c.username === 'fin.dba');
    expect(aWalsh?.obtained).toBe(true);
    expect(finDba?.obtained).toBe(true);
  });

  it('should apply +2 trace on successful decryption', async () => {
    const result = await resolveCommand('decrypt encrypted_creds.gpg', state);
    const nextState = result.nextState as GameState;
    expect(nextState.player.trace).toBe(2);
  });

  it('should include "Decrypting encrypted_creds.gpg..." in output', async () => {
    const result = await resolveCommand('decrypt encrypted_creds.gpg', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('Decrypting encrypted_creds.gpg...'))).toBe(true);
  });

  it('should include "+2 trace" system line in output', async () => {
    const result = await resolveCommand('decrypt encrypted_creds.gpg', state);
    const traceLine = result.lines.find(l => l.type === 'system' && l.content.includes('+2 trace'));
    expect(traceLine).toBeDefined();
  });

  it('should return access-denied error when the file is locked', async () => {
    const lockedState = produce(state, s => {
      const file = s.network.nodes['sec_access_ctrl']!.files.find(
        f => f.name === 'encrypted_creds.gpg',
      );
      if (file) file.locked = true;
    });
    const result = await resolveCommand('decrypt encrypted_creds.gpg', lockedState);
    const errorLine = result.lines.find(l => l.type === 'error');
    expect(errorLine).toBeDefined();
    expect(errorLine?.content).toContain('secured by watchlist protocol');
  });

  it('should show "No new credentials found" when all matching credentials are already obtained', async () => {
    // Pre-mark both credentials as obtained
    const alreadyObtained = produce(state, s => {
      for (const cred of s.player.credentials) {
        if (cred.username === 'a.walsh' || cred.username === 'fin.dba') {
          cred.obtained = true;
        }
      }
    });
    const result = await resolveCommand('decrypt encrypted_creds.gpg', alreadyObtained);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('No new credentials found'))).toBe(true);
  });

  it('should NOT apply trace when no new credentials are found', async () => {
    const alreadyObtained = produce(state, s => {
      for (const cred of s.player.credentials) {
        if (cred.username === 'a.walsh' || cred.username === 'fin.dba') {
          cred.obtained = true;
        }
      }
    });
    const result = await resolveCommand('decrypt encrypted_creds.gpg', alreadyObtained);
    const nextState = result.nextState as GameState;
    expect(nextState.player.trace).toBe(0);
  });

  it('should skip already-obtained credentials and only unlock the remaining one', async () => {
    // Pre-mark a.walsh as obtained; fin.dba remains unobtained
    const partiallyObtained = produce(state, s => {
      const aWalsh = s.player.credentials.find(c => c.username === 'a.walsh');
      if (aWalsh) aWalsh.obtained = true;
    });
    const result = await resolveCommand('decrypt encrypted_creds.gpg', partiallyObtained);
    const nextState = result.nextState as GameState;
    const contents = result.lines.map(l => l.content);
    // Only fin.dba should appear in the unlocked list
    expect(contents.some(c => c.includes('fin.dba'))).toBe(true);
    expect(contents.filter(c => c.match(/\(admin\)|\(user\)/))).toHaveLength(1);
    // a.walsh should not appear as a newly unlocked credential in output
    expect(contents.some(c => c.includes('a.walsh') && c.includes('(user)'))).toBe(false);
    // fin.dba must be marked obtained in nextState
    const finDba = nextState.player.credentials.find(c => c.username === 'fin.dba');
    expect(finDba?.obtained).toBe(true);
  });

  it('should reflect +2 trace in nextState relative to the incoming trace value', async () => {
    const withTrace = produce(state, s => {
      s.player.trace = 10;
    });
    const result = await resolveCommand('decrypt encrypted_creds.gpg', withTrace);
    const nextState = result.nextState as GameState;
    expect(nextState.player.trace).toBe(12);
  });
});

// ── exfil — decryptor.bin grants decryptor tool ───────────

describe('exfil decryptor.bin — decryptor tool acquisition', () => {
  let state: GameState;

  beforeEach(() => {
    // Navigate to ops_hr_db with admin access so decryptor.bin is accessible
    state = produce(createInitialState(), s => {
      s.network.currentNodeId = 'ops_hr_db';
      s.network.nodes['ops_hr_db']!.accessLevel = 'admin';
      s.network.nodes['ops_hr_db']!.discovered = true;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should add the decryptor tool to player.tools after exfiltrating decryptor.bin', async () => {
    const result = await resolveCommand('exfil decryptor.bin', state);
    const nextState = result.nextState as GameState;
    expect(nextState.player.tools.some(t => t.id === 'decryptor')).toBe(true);
  });

  it('should include "Tool acquired: decryptor" in output after exfiltrating decryptor.bin', async () => {
    const result = await resolveCommand('exfil decryptor.bin', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('Tool acquired: decryptor'))).toBe(true);
  });

  it('should not add a duplicate decryptor tool if already in inventory', async () => {
    const withTool = produce(state, s => {
      s.player.tools.push({
        id: 'decryptor',
        name: 'Decryptor',
        description: 'GPG decryption utility. Required to run the decrypt command.',
      });
    });
    const result = await resolveCommand('exfil decryptor.bin', withTool);
    const nextState = result.nextState as GameState;
    expect(nextState.player.tools.filter(t => t.id === 'decryptor')).toHaveLength(1);
  });
});

// ── cmdScan — port-scanner passive mode ───────────────────────────────────────

describe('resolveCommand — scan — port-scanner passive mode', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should add 0 trace when player has an unused port-scanner', async () => {
    // Initial state includes port-scanner with used: undefined (active)
    const result = await resolveCommand('scan', state);
    expect((result.nextState as GameState).player.trace).toBe(0);
  });

  it('should add trace when player has no port-scanner tool', async () => {
    const noScanner = produce(state, s => {
      s.player.tools = s.player.tools.filter(t => t.id !== 'port-scanner');
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const result = await resolveCommand('scan', noScanner);
    expect((result.nextState as GameState).player.trace).toBeGreaterThan(0);
  });

  it('should add 1 trace (not 0) when port-scanner is depleted (used: true)', async () => {
    const depletedScanner = produce(state, s => {
      const scanner = s.player.tools.find(t => t.id === 'port-scanner');
      if (scanner) scanner.used = true;
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const result = await resolveCommand('scan', depletedScanner);
    expect((result.nextState as GameState).player.trace).toBe(1);
  });

  it('should add 2 trace when port-scanner is absent and Math.random >= 0.5', async () => {
    const noScanner = produce(state, s => {
      s.player.tools = s.player.tools.filter(t => t.id !== 'port-scanner');
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const result = await resolveCommand('scan', noScanner);
    expect((result.nextState as GameState).player.trace).toBe(2);
  });
});

// ── cmdInventory / inv ────────────────────────────────────────────────────────

describe('resolveCommand — inventory / inv', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  it('should return lines without a nextState (local command — no state change)', async () => {
    const result = await resolveCommand('inventory', state);
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.nextState).toBeUndefined();
  });

  it('should include TOOLS section header in output', async () => {
    const result = await resolveCommand('inventory', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('TOOLS'))).toBe(true);
  });

  it('should include CREDENTIALS section header in output', async () => {
    const result = await resolveCommand('inventory', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('CREDENTIALS'))).toBe(true);
  });

  it('should include EXFILTRATED FILES section header in output', async () => {
    const result = await resolveCommand('inventory', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('EXFILTRATED FILES'))).toBe(true);
  });

  it('should show DEPLETED label when a tool has used: true', async () => {
    const depleted = produce(state, s => {
      s.player.tools.push({
        id: 'log-wiper',
        name: 'Log Wiper',
        description: 'Reduces trace.',
        used: true,
      });
    });
    const result = await resolveCommand('inventory', depleted);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('DEPLETED'))).toBe(true);
  });

  it('should show "active" label when tool has used: false', async () => {
    const activeTool = produce(state, s => {
      s.player.tools.push({
        id: 'log-wiper',
        name: 'Log Wiper',
        description: 'Reduces trace.',
        used: false,
      });
    });
    const result = await resolveCommand('inventory', activeTool);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('[active]'))).toBe(true);
  });

  it('should show "none" under TOOLS when player has no tools', async () => {
    const noTools = produce(state, s => {
      s.player.tools = [];
    });
    const result = await resolveCommand('inventory', noTools);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('none'))).toBe(true);
  });

  it('should show "none" under CREDENTIALS when no credentials are obtained', async () => {
    // Initial state has credentials but none are obtained
    const result = await resolveCommand('inventory', state);
    const contents = result.lines.map(l => l.content);
    // At least one "none" appears (credentials section)
    expect(contents.filter(c => c.includes('none')).length).toBeGreaterThan(0);
  });

  it('should show "none" under EXFILTRATED FILES when list is empty', async () => {
    const result = await resolveCommand('inventory', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.filter(c => c.includes('none')).length).toBeGreaterThan(0);
  });

  it('should produce the same output structure for the "inv" alias', async () => {
    const invResult = await resolveCommand('inv', state);
    const inventoryResult = await resolveCommand('inventory', state);
    expect(invResult.lines.map(l => l.content)).toEqual(inventoryResult.lines.map(l => l.content));
  });
});

// ── cmdStatus — depleted tools ────────────────────────────────────────────────

describe('resolveCommand — status — depleted tool display', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  it('should show [DEPLETED] for a tool with used: true', async () => {
    const withDepleted = produce(state, s => {
      s.player.tools.push({
        id: 'log-wiper',
        name: 'Log Wiper',
        description: 'Reduces trace.',
        used: true,
      });
    });
    const result = await resolveCommand('status', withDepleted);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('[DEPLETED]'))).toBe(true);
  });

  it('should NOT show [DEPLETED] for a tool with used: false', async () => {
    const withActive = produce(state, s => {
      s.player.tools.push({
        id: 'log-wiper',
        name: 'Log Wiper',
        description: 'Reduces trace.',
        used: false,
      });
    });
    const result = await resolveCommand('status', withActive);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('[DEPLETED]'))).toBe(false);
  });

  it('should NOT show [DEPLETED] for a tool without a used field', async () => {
    // Initial tools (exploit-kit, port-scanner) have no used field
    const result = await resolveCommand('status', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('[DEPLETED]'))).toBe(false);
  });
});

// ── cmdLs — [TOOL] annotation ─────────────────────────────────────────────────

describe('resolveCommand — ls — [TOOL] annotation', () => {
  it('should show [TOOL] annotation on a file with isTool: true', async () => {
    const withToolFile = produce(createInitialState(), s => {
      const node = s.network.nodes['contractor_portal']!;
      node.accessLevel = 'user';
      node.files.push({
        name: 'log_wiper.bin',
        path: '/tools/log_wiper.bin',
        type: 'binary',
        content: null,
        exfiltrable: true,
        accessRequired: 'user',
        isTool: true,
        toolId: 'log-wiper',
      });
    });
    const result = await resolveCommand('ls', withToolFile);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('[TOOL]'))).toBe(true);
  });

  it('should show the [TOOL] legend line when a tool file is present', async () => {
    const withToolFile = produce(createInitialState(), s => {
      const node = s.network.nodes['contractor_portal']!;
      node.accessLevel = 'user';
      node.files.push({
        name: 'log_wiper.bin',
        path: '/tools/log_wiper.bin',
        type: 'binary',
        content: null,
        exfiltrable: true,
        accessRequired: 'user',
        isTool: true,
        toolId: 'log-wiper',
      });
    });
    const result = await resolveCommand('ls', withToolFile);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('exfil this file to add a tool to your inventory'))).toBe(
      true,
    );
  });

  it('should NOT show [TOOL] on a regular file without isTool', async () => {
    const withAccess = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'user';
    });
    const result = await resolveCommand('ls', withAccess);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('[TOOL]'))).toBe(false);
  });
});

// ── cmdWipeLogs — single-use gate ─────────────────────────────────────────────

describe('resolveCommand — wipe-logs — single-use gate', () => {
  it('should reduce trace and mark tool used when log-wiper is fresh', async () => {
    const withFreshTool = produce(createInitialState(), s => {
      s.player.trace = 30;
      s.player.tools.push({ id: 'log-wiper', name: 'Log Wiper', description: 'Reduces trace.' });
    });
    const result = await resolveCommand('wipe-logs', withFreshTool);
    const nextState = result.nextState as GameState;
    expect(nextState.player.trace).toBe(15);
    const tool = nextState.player.tools.find(t => t.id === 'log-wiper');
    expect(tool?.used).toBe(true);
  });

  it('should return a depleted error when log-wiper has used: true', async () => {
    const withDepletedTool = produce(createInitialState(), s => {
      s.player.tools.push({
        id: 'log-wiper',
        name: 'Log Wiper',
        description: 'Reduces trace.',
        used: true,
      });
    });
    const result = await resolveCommand('wipe-logs', withDepletedTool);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/depleted/);
  });

  it('should return a tool-required error when log-wiper is absent', async () => {
    const result = await resolveCommand('wipe-logs', createInitialState());
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/log-wiper/);
  });
});

// ── cmdSpoof — single-use gate ────────────────────────────────────────────────

describe('resolveCommand — spoof — single-use gate', () => {
  it('should reduce trace and mark tool used when spoof-id is fresh', async () => {
    const withFreshTool = produce(createInitialState(), s => {
      s.player.trace = 30;
      s.player.tools.push({ id: 'spoof-id', name: 'Spoof ID', description: 'Spoofs identity.' });
    });
    const result = await resolveCommand('spoof', withFreshTool);
    const nextState = result.nextState as GameState;
    expect(nextState.player.trace).toBe(10);
    const tool = nextState.player.tools.find(t => t.id === 'spoof-id');
    expect(tool?.used).toBe(true);
  });

  it('should return a depleted error when spoof-id has used: true', async () => {
    const withDepletedTool = produce(createInitialState(), s => {
      s.player.tools.push({
        id: 'spoof-id',
        name: 'Spoof ID',
        description: 'Spoofs identity.',
        used: true,
      });
    });
    const result = await resolveCommand('spoof', withDepletedTool);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/depleted/);
  });

  it('should return a tool-required error when spoof-id is absent', async () => {
    const result = await resolveCommand('spoof', createInitialState());
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/spoof-id/);
  });
});

// ── cmdExfil — generic tool acquisition (log-wiper) ──────────────────────────

describe('resolveCommand — exfil — log-wiper tool acquisition', () => {
  let state: GameState;

  beforeEach(() => {
    // Inject a log-wiper tool file into contractor_portal
    state = produce(createInitialState(), s => {
      const node = s.network.nodes['contractor_portal']!;
      node.accessLevel = 'user';
      node.files.push({
        name: 'log_wiper.bin',
        path: '/tools/log_wiper.bin',
        type: 'binary',
        content: null,
        exfiltrable: true,
        accessRequired: 'user',
        isTool: true,
        toolId: 'log-wiper',
      });
    });
  });

  it('should add log-wiper to player.tools after exfil', async () => {
    const result = await resolveCommand('exfil log_wiper.bin', state);
    const nextState = result.nextState as GameState;
    expect(nextState.player.tools.some(t => t.id === 'log-wiper')).toBe(true);
  });

  it('should not add log-wiper twice if already in inventory', async () => {
    const withTool = produce(state, s => {
      s.player.tools.push({
        id: 'log-wiper',
        name: 'Log Wiper',
        description: 'Single-use log sanitisation tool. Reduces trace by 15%. Destroyed after use.',
      });
    });
    const result = await resolveCommand('exfil log_wiper.bin', withTool);
    // Already in inventory — exfil returns "Already exfiltrated" (since path not yet in exfiltrated)
    // BUT: the idempotency check is based on file.path in player.exfiltrated, not the tool inventory.
    // So the tool will not be duplicated even if exfil runs again.
    const nextState = result.nextState as GameState;
    expect(nextState.player.tools.filter(t => t.id === 'log-wiper')).toHaveLength(1);
  });

  it('should include "Tool acquired: log-wiper" in output', async () => {
    const result = await resolveCommand('exfil log_wiper.bin', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('Tool acquired: log-wiper'))).toBe(true);
  });
});

// ── Contract objective detection (applyObjectiveEffects) ──

describe('resolveCommand — contract objective detection', () => {
  // ── trace_cap ───────────────────────────────────────────

  describe('trace_cap contract', () => {
    it('should append a contract cap exceeded error line when trace newly crosses the cap', async () => {
      // Login with wrong credentials adds +5 trace. Start at 47 → will reach 52 > 50.
      const state = produce(createInitialState(), s => {
        s.player.trace = 47;
        s.contract = {
          id: 'ghost_protocol',
          networkVariant: 'standard',
          objectiveComplete: false,
          objectiveCondition: { type: 'trace_cap', maxTrace: 50 },
        };
      });
      // Wrong credentials → +5 trace, no successful login → trace 52
      const result = await resolveCommand('login baduser badpass', state);
      const capLine = result.lines.find(l => l.content.includes('trace cap exceeded'));
      expect(capLine).toBeDefined();
      expect(capLine?.type).toBe('error');
    });

    it('should set flags.contract_cap_exceeded = true in nextState when the cap is crossed', async () => {
      const state = produce(createInitialState(), s => {
        s.player.trace = 47;
        s.contract = {
          id: 'ghost_protocol',
          networkVariant: 'standard',
          objectiveComplete: false,
          objectiveCondition: { type: 'trace_cap', maxTrace: 50 },
        };
      });
      const result = await resolveCommand('login baduser badpass', state);
      expect((result.nextState as GameState).flags['contract_cap_exceeded']).toBe(true);
    });

    it('should NOT fire the cap notification a second time when the flag is already set', async () => {
      // Start with flag already set and trace above cap — next login fail must NOT add another notification
      const stateAfterFirst = produce(createInitialState(), s => {
        s.player.trace = 52;
        s.flags['contract_cap_exceeded'] = true;
        s.contract = {
          id: 'ghost_protocol',
          networkVariant: 'standard',
          objectiveComplete: false,
          objectiveCondition: { type: 'trace_cap', maxTrace: 50 },
        };
      });
      const result = await resolveCommand('login baduser badpass', stateAfterFirst);
      const capLines = result.lines.filter(l => l.content.includes('trace cap exceeded'));
      expect(capLines).toHaveLength(0);
    });

    it('should NOT fire the cap notification when trace crosses below the cap boundary', async () => {
      // Trace at 44 + 5 login fail = 49 — still below 50, no notification
      const state = produce(createInitialState(), s => {
        s.player.trace = 44;
        s.contract = {
          id: 'ghost_protocol',
          networkVariant: 'standard',
          objectiveComplete: false,
          objectiveCondition: { type: 'trace_cap', maxTrace: 50 },
        };
      });
      const result = await resolveCommand('login baduser badpass', state);
      const capLine = result.lines.find(l => l.content.includes('trace cap exceeded'));
      expect(capLine).toBeUndefined();
      expect((result.nextState as GameState).flags['contract_cap_exceeded']).toBeFalsy();
    });

    it('should include the maxTrace value in the cap exceeded message', async () => {
      const state = produce(createInitialState(), s => {
        s.player.trace = 47;
        s.contract = {
          id: 'clean_sweep',
          networkVariant: 'standard',
          objectiveComplete: false,
          objectiveCondition: { type: 'trace_cap', maxTrace: 40 },
        };
        // Set trace just under clean_sweep cap so +5 login fail crosses it
        s.player.trace = 36;
      });
      const result = await resolveCommand('login baduser badpass', state);
      const capLine = result.lines.find(l => l.content.includes('40'));
      expect(capLine).toBeDefined();
    });
  });

  // ── exfil_count ─────────────────────────────────────────

  describe('exfil_count contract', () => {
    it('should append an objective complete system line when exfil count reaches minCount', async () => {
      // minCount is 2; start with 1 file already exfiltrated; exfil a second to hit the target.
      const state = produce(createInitialState(), s => {
        s.network.nodes['contractor_portal']!.accessLevel = 'user';
        s.contract = {
          id: 'data_harvest',
          networkVariant: 'standard',
          objectiveComplete: false,
          objectiveCondition: { type: 'exfil_count', minCount: 2 },
        };
        // Seed 1 already-exfiltrated file so the next exfil brings count from 1 → 2
        s.player.exfiltrated.push({
          name: 'previous.txt',
          path: '/tmp/previous.txt',
          type: 'document',
          content: 'already done',
          exfiltrable: true,
          accessRequired: 'user',
        });
      });
      // welcome.txt is exfiltrable on contractor_portal with user access
      const result = await resolveCommand('exfil welcome.txt', state);
      const completeLine = result.lines.find(l => l.content.includes('objective complete'));
      expect(completeLine).toBeDefined();
      expect(completeLine?.type).toBe('system');
    });

    it('should set contract.objectiveComplete = true in nextState when minCount is reached', async () => {
      const state = produce(createInitialState(), s => {
        s.network.nodes['contractor_portal']!.accessLevel = 'user';
        s.contract = {
          id: 'data_harvest',
          networkVariant: 'standard',
          objectiveComplete: false,
          objectiveCondition: { type: 'exfil_count', minCount: 2 },
        };
        s.player.exfiltrated.push({
          name: 'previous.txt',
          path: '/tmp/previous.txt',
          type: 'document',
          content: 'already done',
          exfiltrable: true,
          accessRequired: 'user',
        });
      });
      const result = await resolveCommand('exfil welcome.txt', state);
      expect((result.nextState as GameState).contract?.objectiveComplete).toBe(true);
    });

    it('should include the minCount value in the objective complete message', async () => {
      const state = produce(createInitialState(), s => {
        s.network.nodes['contractor_portal']!.accessLevel = 'user';
        s.contract = {
          id: 'data_harvest',
          networkVariant: 'standard',
          objectiveComplete: false,
          objectiveCondition: { type: 'exfil_count', minCount: 2 },
        };
        s.player.exfiltrated.push({
          name: 'previous.txt',
          path: '/tmp/previous.txt',
          type: 'document',
          content: 'already done',
          exfiltrable: true,
          accessRequired: 'user',
        });
      });
      const result = await resolveCommand('exfil welcome.txt', state);
      const completeLine = result.lines.find(l => l.content.includes('2'));
      expect(completeLine).toBeDefined();
    });

    it('should NOT fire when exfil count is still below minCount', async () => {
      // minCount 3; start with 1 exfil; count goes 1→2 which is still below 3
      const state = produce(createInitialState(), s => {
        s.network.nodes['contractor_portal']!.accessLevel = 'user';
        s.contract = {
          id: 'data_harvest',
          networkVariant: 'standard',
          objectiveComplete: false,
          objectiveCondition: { type: 'exfil_count', minCount: 3 },
        };
        s.player.exfiltrated.push({
          name: 'previous.txt',
          path: '/tmp/previous.txt',
          type: 'document',
          content: 'already done',
          exfiltrable: true,
          accessRequired: 'user',
        });
      });
      const result = await resolveCommand('exfil welcome.txt', state);
      const completeLine = result.lines.find(l => l.content.includes('objective complete'));
      expect(completeLine).toBeUndefined();
      expect((result.nextState as GameState).contract?.objectiveComplete).toBe(false);
    });

    it('should NOT fire a second time when objectiveComplete is already true', async () => {
      // Already completed — exfil another file — no new notification
      const state = produce(createInitialState(), s => {
        s.network.nodes['contractor_portal']!.accessLevel = 'user';
        s.contract = {
          id: 'data_harvest',
          networkVariant: 'standard',
          objectiveComplete: true,
          objectiveCondition: { type: 'exfil_count', minCount: 2 },
        };
        s.player.exfiltrated.push({
          name: 'previous.txt',
          path: '/tmp/previous.txt',
          type: 'document',
          content: 'already done',
          exfiltrable: true,
          accessRequired: 'user',
        });
        s.player.exfiltrated.push({
          name: 'another.txt',
          path: '/tmp/another.txt',
          type: 'document',
          content: 'second file',
          exfiltrable: true,
          accessRequired: 'user',
        });
      });
      const result = await resolveCommand('exfil welcome.txt', state);
      const completeLines = result.lines.filter(l => l.content.includes('objective complete'));
      expect(completeLines).toHaveLength(0);
    });
  });

  // ── no_burn / null contract ──────────────────────────────

  describe('no_burn contract and null contract', () => {
    it('should not append any objective lines for a no_burn contract on normal commands', async () => {
      const state = produce(createInitialState(), s => {
        s.contract = {
          id: 'blitz',
          networkVariant: 'standard',
          objectiveComplete: false,
          objectiveCondition: { type: 'no_burn' },
        };
      });
      const result = await resolveCommand('scan', state);
      const objectiveLines = result.lines.filter(
        l => l.content.includes('CONTRACT') || l.content.includes('objective'),
      );
      expect(objectiveLines).toHaveLength(0);
    });

    it('should not append any objective lines when contract is null', async () => {
      // Default createInitialState() has contract: null
      const state = produce(createInitialState(), s => {
        s.contract = null;
        s.network.nodes['contractor_portal']!.accessLevel = 'user';
      });
      const result = await resolveCommand('exfil welcome.txt', state);
      const objectiveLines = result.lines.filter(
        l => l.content.includes('CONTRACT') || l.content.includes('objective complete'),
      );
      expect(objectiveLines).toHaveLength(0);
    });

    it('should not set flags.contract_cap_exceeded when contract is null', async () => {
      const state = produce(createInitialState(), s => {
        s.player.trace = 47;
        s.contract = null;
      });
      const result = await resolveCommand('login baduser badpass', state);
      expect((result.nextState as GameState).flags['contract_cap_exceeded']).toBeFalsy();
    });
  });
});

describe('createInitialState defaults', () => {
  it('starts with 4 exploit charges', () => {
    const state = createInitialState();
    expect(state.player.charges).toBe(4);
  });

  it('initializes unlockSession to null', () => {
    const state = createInitialState();
    expect(state.unlockSession).toBeNull();
  });

  it('initializes unlockAttempts to empty object', () => {
    const state = createInitialState();
    expect(state.unlockAttempts).toEqual({});
  });
});

describe('cmdCat — locked file hint', () => {
  it('shows unlock hint when file is locked', async () => {
    let state = createInitialState();
    state = produce(state, s => {
      const node = s.network.nodes['contractor_portal']!;
      node.accessLevel = 'user';
      const f = node.files.find(f => !f.tripwire && !f.locked);
      if (f) f.locked = true;
    });
    const lockedFile = state.network.nodes['contractor_portal']!.files.find(f => f.locked)!;
    const result = await resolveCommand(`cat ${lockedFile.name}`, state);
    const text = result.lines.map(l => l.content).join('\n');
    expect(text).toContain('secured by watchlist protocol');
    expect(text).toContain(`unlock ${lockedFile.name}`);
  });
});

describe('unlock command', () => {
  // Helper: create a state with a locked file on the current node
  const stateWithLockedFile = (): { state: GameState; filePath: string; fileName: string } => {
    let state = createInitialState();
    state = produce(state, s => {
      const node = s.network.nodes['contractor_portal']!;
      node.accessLevel = 'user';
      const f = node.files.find(f => !f.tripwire && !f.locked);
      if (f) f.locked = true;
    });
    const file = state.network.nodes['contractor_portal']!.files.find(f => f.locked)!;
    return { state, filePath: file.path, fileName: file.name };
  };

  it('returns error when no filename given', async () => {
    const state = createInitialState();
    const result = await resolveCommand('unlock', state);
    expect(result.lines[0].content).toContain('Usage:');
  });

  it('returns error when file is not locked', async () => {
    const state = createInitialState();
    const unlockedFile = state.network.nodes['contractor_portal']!.files.find(
      f => !f.locked && !f.tripwire,
    )!;
    const result = await resolveCommand(`unlock ${unlockedFile.name}`, state);
    expect(result.lines.some(l => l.content.includes('not locked'))).toBe(true);
  });

  it('starts the mini-game: sets unlockSession on state', async () => {
    const { state, fileName } = stateWithLockedFile();
    const result = await resolveCommand(`unlock ${fileName}`, state);
    const next = result.nextState as GameState;
    expect(next.unlockSession).not.toBeNull();
    expect(next.unlockSession?.step).toBe(0);
    expect(next.unlockSession?.codes).toHaveLength(3);
  });

  it('shows step 1 code in output', async () => {
    const { state, fileName } = stateWithLockedFile();
    const result = await resolveCommand(`unlock ${fileName}`, state);
    const next = result.nextState as GameState;
    const code = next.unlockSession!.codes[0];
    expect(result.lines.some(l => l.content.includes(code))).toBe(true);
    expect(result.lines.some(l => l.content.includes('1/3'))).toBe(true);
  });

  it('advances to step 2 on correct code', async () => {
    const { state, fileName } = stateWithLockedFile();
    const r1 = await resolveCommand(`unlock ${fileName}`, state);
    const s1 = r1.nextState as GameState;
    const code0 = s1.unlockSession!.codes[0];
    const r2 = await resolveCommand(code0, s1);
    const s2 = r2.nextState as GameState;
    expect(s2.unlockSession?.step).toBe(1);
    expect(r2.lines.some(l => l.content.includes('2/3'))).toBe(true);
  });

  it('advances to step 3 on correct code', async () => {
    const { state, fileName } = stateWithLockedFile();
    const r1 = await resolveCommand(`unlock ${fileName}`, state);
    const s1 = r1.nextState as GameState;
    const r2 = await resolveCommand(s1.unlockSession!.codes[0], s1);
    const s2 = r2.nextState as GameState;
    const r3 = await resolveCommand(s2.unlockSession!.codes[1], s2);
    const s3 = r3.nextState as GameState;
    expect(s3.unlockSession?.step).toBe(2);
    expect(r3.lines.some(l => l.content.includes('3/3'))).toBe(true);
  });

  it('unlocks file, costs +5 trace and -1 charge on full success', async () => {
    const { state, fileName, filePath } = stateWithLockedFile();
    const r1 = await resolveCommand(`unlock ${fileName}`, state);
    const s1 = r1.nextState as GameState;
    const r2 = await resolveCommand(s1.unlockSession!.codes[0], s1);
    const s2 = r2.nextState as GameState;
    const r3 = await resolveCommand(s2.unlockSession!.codes[1], s2);
    const s3 = r3.nextState as GameState;
    const r4 = await resolveCommand(s3.unlockSession!.codes[2], s3);
    const s4 = r4.nextState as GameState;

    expect(s4.unlockSession).toBeNull();
    const unlockedFile = s4.network.nodes['contractor_portal']!.files.find(
      f => f.path === filePath,
    )!;
    expect(unlockedFile.locked).toBe(false);
    expect(s4.player.trace).toBe(state.player.trace + 5);
    expect(s4.player.charges).toBe(state.player.charges - 1);
    expect(r4.lines.some(l => l.content.includes('restored'))).toBe(true);
  });

  it('wrong code increments unlockAttempts and clears session', async () => {
    const { state, fileName, filePath } = stateWithLockedFile();
    const r1 = await resolveCommand(`unlock ${fileName}`, state);
    const s1 = r1.nextState as GameState;
    const result = await resolveCommand('AAAA-BBBB', s1);
    const next = result.nextState as GameState;
    expect(next.unlockSession).toBeNull();
    expect(next.unlockAttempts[filePath]).toBe(1);
    expect(result.lines.some(l => l.content.includes('1/3'))).toBe(true);
  });

  it('wrong code on step 2 increments counter and clears session', async () => {
    const { state, fileName, filePath } = stateWithLockedFile();
    const r1 = await resolveCommand(`unlock ${fileName}`, state);
    const s1 = r1.nextState as GameState;
    const r2 = await resolveCommand(s1.unlockSession!.codes[0], s1);
    const s2 = r2.nextState as GameState;
    const result = await resolveCommand('AAAA-BBBB', s2);
    const next = result.nextState as GameState;
    expect(next.unlockSession).toBeNull();
    expect(next.unlockAttempts[filePath]).toBe(1);
  });

  it('file remains locked after wrong code', async () => {
    const { state, fileName, filePath } = stateWithLockedFile();
    const r1 = await resolveCommand(`unlock ${fileName}`, state);
    const s1 = r1.nextState as GameState;
    const result = await resolveCommand('AAAA-BBBB', s1);
    const next = result.nextState as GameState;
    const file = next.network.nodes['contractor_portal']!.files.find(f => f.path === filePath)!;
    expect(file.locked).toBe(true);
  });

  it('3 cumulative failures permanently re-lock: unlock returns hard error', async () => {
    const { state, fileName, filePath } = stateWithLockedFile();
    let s = state;
    for (let i = 0; i < 3; i++) {
      const r = await resolveCommand(`unlock ${fileName}`, s);
      s = r.nextState as GameState;
      const r2 = await resolveCommand('AAAA-BBBB', s);
      s = r2.nextState as GameState;
    }
    expect(s.unlockAttempts[filePath]).toBe(3);
    const result = await resolveCommand(`unlock ${fileName}`, s);
    expect(
      result.lines.some(l => l.content.includes('unlock: bypass limit reached — file hardened')),
    ).toBe(true);
    expect(result.nextState).toBeUndefined();
  });

  it('file stays locked after 3 failures', async () => {
    const { state, fileName, filePath } = stateWithLockedFile();
    let s = state;
    for (let i = 0; i < 3; i++) {
      const r = await resolveCommand(`unlock ${fileName}`, s);
      s = r.nextState as GameState;
      const r2 = await resolveCommand('AAAA-BBBB', s);
      s = r2.nextState as GameState;
    }
    const file = s.network.nodes['contractor_portal']!.files.find(f => f.path === filePath)!;
    expect(file.locked).toBe(true);
  });

  it('abandonment: typing a known game command during session emits interrupted message and executes the command', async () => {
    const { state, fileName, filePath } = stateWithLockedFile();
    const r1 = await resolveCommand(`unlock ${fileName}`, state);
    const s1 = r1.nextState as GameState;
    // Type a game command — treated as abandonment because session is active
    const result = await resolveCommand('scan', s1);
    const next = result.nextState as GameState;
    expect(next.unlockSession).toBeNull();
    expect(next.unlockAttempts[filePath]).toBe(1);
    // Should emit the interrupted message (not "Wrong code")
    expect(
      result.lines.some(l =>
        l.content.includes('Unlock sequence interrupted — attempt 1/3 recorded.'),
      ),
    ).toBe(true);
    expect(result.lines.some(l => l.content.includes('Wrong code'))).toBe(false);
    // The abandoned scan command should also have executed
    expect(result.lines.some(l => l.content.includes('Scanning subnet'))).toBe(true);
  });

  it('generateUnlockCode never produces ambiguous characters', () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateUnlockCode();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{4}$/);
      expect(code).not.toMatch(/[01IO]/);
    }
  });

  it('returns error when player has no charges', async () => {
    const { state, fileName, filePath } = stateWithLockedFile();
    const broke = produce(state, s => {
      s.player.charges = 0;
    });
    const result = await resolveCommand(`unlock ${fileName}`, broke);
    expect(result.lines.some(l => l.content.includes('insufficient charges'))).toBe(true);
    const nextState = result.nextState as GameState;
    // Session must not have been started
    expect(nextState.unlockSession).toBeNull();
    // Attempt counter must not have been incremented (guard fires before attempts are touched)
    expect(nextState.unlockAttempts[filePath] ?? 0).toBe(0);
  });

  it('success stamps threshold flag when unlock crosses a trace threshold', async () => {
    const { state, fileName } = stateWithLockedFile();
    // Set trace just below 31% so the +5 from success crosses the threshold
    const nearThreshold = produce(state, s => {
      s.player.trace = 28;
    });
    const r1 = await resolveCommand(`unlock ${fileName}`, nearThreshold);
    const s1 = r1.nextState as GameState;
    const r2 = await resolveCommand(s1.unlockSession!.codes[0], s1);
    const s2 = r2.nextState as GameState;
    const r3 = await resolveCommand(s2.unlockSession!.codes[1], s2);
    const s3 = r3.nextState as GameState;
    const r4 = await resolveCommand(s3.unlockSession!.codes[2], s3);
    const s4 = r4.nextState as GameState;
    expect(s4.player.trace).toBe(33);
    expect(s4.flags['threshold_31_crossed']).toBe(true);
  });

  it('lowercase code is treated as abandonment, not a wrong-code attempt', async () => {
    const { state, fileName, filePath } = stateWithLockedFile();
    const r1 = await resolveCommand(`unlock ${fileName}`, state);
    const s1 = r1.nextState as GameState;
    // Pin codes[0] to a known value containing letters so toLowerCase() is always a real change
    const pinned = produce(s1, s => {
      s.unlockSession!.codes[0] = 'ABCD-EFGH';
    });
    const lowerCode = 'abcd-efgh';
    const result = await resolveCommand(lowerCode, pinned);
    const next = result.nextState as GameState;
    expect(next.unlockSession).toBeNull();
    expect(next.unlockAttempts[filePath]).toBe(1);
    expect(result.lines.some(l => l.content.includes('interrupted'))).toBe(true);
    expect(result.lines.some(l => l.content.includes('Wrong code'))).toBe(false);
  });

  it('code containing excluded chars (0, 1, I, O) is treated as abandonment', async () => {
    const { state, fileName, filePath } = stateWithLockedFile();
    const r1 = await resolveCommand(`unlock ${fileName}`, state);
    const s1 = r1.nextState as GameState;
    // A000-B111 looks like a code but contains excluded chars — abandonment
    const result = await resolveCommand('A000-B111', s1);
    const next = result.nextState as GameState;
    expect(next.unlockSession).toBeNull();
    expect(next.unlockAttempts[filePath]).toBe(1);
    expect(result.lines.some(l => l.content.includes('interrupted'))).toBe(true);
    expect(result.lines.some(l => l.content.includes('Wrong code'))).toBe(false);
  });

  it('arbitrary text during session is treated as abandonment and command re-executes', async () => {
    const { state, fileName, filePath } = stateWithLockedFile();
    const r1 = await resolveCommand(`unlock ${fileName}`, state);
    const s1 = r1.nextState as GameState;
    // Free-form text is not code-shaped — should abandon, not burn
    const result = await resolveCommand('what is this node', s1);
    const next = result.nextState as GameState;
    expect(next.unlockSession).toBeNull();
    expect(next.unlockAttempts[filePath]).toBe(1);
    expect(result.lines.some(l => l.content.includes('interrupted'))).toBe(true);
    expect(result.lines.some(l => l.content.includes('Wrong code'))).toBe(false);
  });

  it('error paths (no args, not found, not locked) advance turnCount', async () => {
    const state = createInitialState();
    const node = state.network.nodes['contractor_portal']!;
    const unlockedFile = node.files.find(f => !f.locked && !f.tripwire)!;

    const r1 = await resolveCommand('unlock', state);
    expect((r1.nextState as GameState).turnCount).toBe(1);

    const r2 = await resolveCommand('unlock nonexistent_file', state);
    expect((r2.nextState as GameState).turnCount).toBe(1);

    const r3 = await resolveCommand(`unlock ${unlockedFile.name}`, state);
    expect((r3.nextState as GameState).turnCount).toBe(1);
  });

  it('unlockAttempts cleared on successful bypass', async () => {
    const { state, fileName, filePath } = stateWithLockedFile();
    // Record one failed attempt first
    const r1 = await resolveCommand(`unlock ${fileName}`, state);
    const s1 = r1.nextState as GameState;
    const fail = await resolveCommand('AAAA-BBBB', s1);
    const sFail = fail.nextState as GameState;
    expect(sFail.unlockAttempts[filePath]).toBe(1);

    // Now succeed
    const r2 = await resolveCommand(`unlock ${fileName}`, sFail);
    const s2 = r2.nextState as GameState;
    const r3 = await resolveCommand(s2.unlockSession!.codes[0], s2);
    const s3 = r3.nextState as GameState;
    const r4 = await resolveCommand(s3.unlockSession!.codes[1], s3);
    const s4 = r4.nextState as GameState;
    const r5 = await resolveCommand(s4.unlockSession!.codes[2], s4);
    const s5 = r5.nextState as GameState;

    expect(s5.unlockAttempts[filePath]).toBeUndefined();
  });
});
