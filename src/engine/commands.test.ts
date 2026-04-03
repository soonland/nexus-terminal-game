import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCommand } from './commands';
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

  it('should append the raw command to recentCommands after a local command', async () => {
    const result = await resolveCommand('help', state);
    expect(result.nextState?.recentCommands).toContain('help');
  });

  it('should append the raw command to recentCommands after an engine command', async () => {
    const result = await resolveCommand('scan', state);
    expect(result.nextState?.recentCommands).toContain('scan');
  });

  it('should append the raw command to recentCommands after an AI command', async () => {
    const result = await resolveCommand('frobnicate', state);
    expect(result.nextState?.recentCommands).toContain('frobnicate');
  });

  it('should keep only the last 8 commands when the buffer overflows', async () => {
    // Seed 8 commands manually so the 9th push causes a slice
    const seeded: GameState = {
      ...state,
      recentCommands: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'],
      turnCount: 8,
    };
    const result = await resolveCommand('help', seeded);
    expect(result.nextState?.recentCommands).toHaveLength(8);
    expect(result.nextState?.recentCommands).not.toContain('c1');
    expect(result.nextState?.recentCommands).toContain('help');
  });

  it('should increment turnCount by 1 after a local command', async () => {
    const result = await resolveCommand('help', state);
    expect(result.nextState?.turnCount).toBe(1);
  });

  it('should increment turnCount by 1 after an engine command', async () => {
    const result = await resolveCommand('scan', state);
    expect(result.nextState?.turnCount).toBe(1);
  });

  it('should increment turnCount by 1 after an AI command', async () => {
    const result = await resolveCommand('frobnicate', state);
    expect(result.nextState?.turnCount).toBe(1);
  });

  it('should accumulate turnCount across successive calls', async () => {
    const r1 = await resolveCommand('help', state);
    const r2 = await resolveCommand('status', r1.nextState as GameState);
    expect(r2.nextState?.turnCount).toBe(2);
  });
});

describe('resolveCommand — burned phase guard', () => {
  it('should return a SESSION TERMINATED error and no nextState when phase is burned', async () => {
    const burned: GameState = { ...createInitialState(), phase: 'burned' };
    const result = await resolveCommand('help', burned);
    expect(result.lines[0].type).toBe('error');
    expect(result.lines[0].content).toMatch(/SESSION TERMINATED/);
    expect(result.nextState).toBeUndefined();
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

  it('should not modify player trace', async () => {
    const result = await resolveCommand('help', state);
    expect((result.nextState as GameState).player.trace).toBe(0);
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
    expect(contents.some(c => c.includes('3'))).toBe(true);
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

  it('should never call the API for an anchor node and show its authored description', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    // vpn_gateway is an anchor node with an authored description
    const result = await resolveCommand('connect 10.0.0.2', state);
    expect(fetchMock).not.toHaveBeenCalled();
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('bridge between the contractor DMZ'))).toBe(true);
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
    // http costs 1 charge; player starts with 3
    expect((result.nextState as GameState).player.charges).toBe(2);
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
    // effective cost = 1 (http) + 1 (sentinelPatched) = 2; player starts with 3
    const patched = produce(state, s => {
      s.network.nodes['contractor_portal']!.sentinelPatched = true;
    });
    const result = await resolveCommand('exploit http', patched);
    expect((result.nextState as GameState).player.charges).toBe(1);
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
    state = createInitialState();
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
    });
    const result = await resolveCommand('scan', state);
    const count = result.lines.filter(l => l.content.includes('Anomalous activity flagged')).length;
    expect(count).toBe(0);
  });

  it('should append an error alert line when trace crosses 86%', async () => {
    state = produce(createInitialState(), s => {
      s.player.trace = 85;
    });
    const result = await resolveCommand('scan', state);
    const alertLine = result.lines.find(l => l.content.includes('One more detection event'));
    expect(alertLine).toBeDefined();
    expect(alertLine?.type).toBe('error');
  });

  it('should append a system alert line (not error) when trace crosses 61%', async () => {
    state = produce(createInitialState(), s => {
      s.player.trace = 60;
    });
    const result = await resolveCommand('scan', state);
    const alertLine = result.lines.find(l => l.content.includes('Active intrusion response'));
    expect(alertLine).toBeDefined();
    expect(alertLine?.type).toBe('system');
  });

  it('should lock up to 2 non-tripwire files on compromised nodes at 31%', async () => {
    state = produce(createInitialState(), s => {
      s.player.trace = 30;
      const node = s.network.nodes['contractor_portal']!;
      node.compromised = true;
      node.accessLevel = 'user';
    });
    const result = await resolveCommand('scan', state);
    const nextState = result.nextState as GameState;
    const node = nextState.network.nodes['contractor_portal']!;
    const lockedFiles = node.files.filter(f => f.locked);
    expect(lockedFiles.length).toBeGreaterThanOrEqual(1);
    expect(lockedFiles.length).toBeLessThanOrEqual(2);
  });

  it('should not lock files on nodes that are not compromised at 31%', async () => {
    state = produce(createInitialState(), s => {
      s.player.trace = 30;
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
