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

  it('should return lines containing command descriptions', async () => {
    const result = await resolveCommand('help', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('help'))).toBe(true);
    expect(contents.some(c => c.includes('status'))).toBe(true);
    expect(contents.some(c => c.includes('scan'))).toBe(true);
    expect(contents.some(c => c.includes('connect'))).toBe(true);
    expect(contents.some(c => c.includes('login'))).toBe(true);
    expect(contents.some(c => c.includes('exploit'))).toBe(true);
  });

  it('should include separator lines', async () => {
    const result = await resolveCommand('help', state);
    const separators = result.lines.filter(l => l.type === 'separator');
    expect(separators.length).toBeGreaterThan(0);
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

describe('resolveCommand — inventory', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  it('should show "none" for credentials when no creds are obtained', async () => {
    const result = await resolveCommand('inventory', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('none'))).toBe(true);
  });

  it('should show "none" for exfiltrated when inventory is empty', async () => {
    const result = await resolveCommand('inventory', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.toLowerCase().includes('none'))).toBe(true);
  });

  it('should list obtained credentials', async () => {
    const withCred = produce(state, s => {
      const cred = s.player.credentials.find(c => c.id === 'cred_contractor');
      if (cred) cred.obtained = true;
    });
    const result = await resolveCommand('inventory', withCred);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('contractor') && c.includes('Welcome1!'))).toBe(true);
  });

  it('should list exfiltrated files', async () => {
    const withExfil = produce(state, s => {
      s.player.exfiltrated.push({
        name: 'welcome.txt',
        path: '/var/www/contractor/welcome.txt',
        type: 'document',
        content: 'test',
        exfiltrable: true,
        accessRequired: 'user',
      });
    });
    const result = await resolveCommand('inventory', withExfil);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('welcome.txt'))).toBe(true);
  });

  it('should show CREDENTIALS header when creds are obtained', async () => {
    const withCred = produce(state, s => {
      const cred = s.player.credentials.find(c => c.id === 'cred_contractor');
      if (cred) cred.obtained = true;
    });
    const result = await resolveCommand('inventory', withCred);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('CREDENTIALS'))).toBe(true);
  });

  it('should show EXFILTRATED header when files are present', async () => {
    const withExfil = produce(state, s => {
      s.player.exfiltrated.push({
        name: 'welcome.txt',
        path: '/var/www/contractor/welcome.txt',
        type: 'document',
        content: 'test',
        exfiltrable: true,
        accessRequired: 'user',
      });
    });
    const result = await resolveCommand('inventory', withExfil);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('EXFILTRATED'))).toBe(true);
  });
});

describe('resolveCommand — map', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  it('should show NETWORK MAP header', async () => {
    const result = await resolveCommand('map', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('NETWORK MAP'))).toBe(true);
  });

  it('should list discovered nodes by layer', async () => {
    const result = await resolveCommand('map', state);
    const contents = result.lines.map(l => l.content);
    // contractor_portal is discovered at layer 0
    expect(contents.some(c => c.includes('10.0.0.1'))).toBe(true);
  });

  it('should mark the current node with a marker', async () => {
    const result = await resolveCommand('map', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('◄'))).toBe(true);
  });

  it('should not show undiscovered nodes', async () => {
    const result = await resolveCommand('map', state);
    const contents = result.lines.map(l => l.content);
    // vpn_gateway starts undiscovered
    expect(contents.some(c => c.includes('10.0.0.2'))).toBe(false);
  });

  it('should show layer label for each discovered layer', async () => {
    const result = await resolveCommand('map', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('ENTRY'))).toBe(true);
  });

  it('should show access level in brackets when node has access', async () => {
    const withAccess = produce(state, s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'user';
    });
    const result = await resolveCommand('map', withAccess);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('[USER]'))).toBe(true);
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

  it('should add 1 trace', async () => {
    const result = await resolveCommand('scan', state);
    expect((result.nextState as GameState).player.trace).toBe(1);
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

  it('should add 1 trace even when scanning a specific IP', async () => {
    const result = await resolveCommand('scan 10.0.0.2', state);
    expect((result.nextState as GameState).player.trace).toBe(1);
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
    expect((result.nextState as GameState).player.trace).toBe(10);
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
    vi.unstubAllGlobals();
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
    vi.unstubAllGlobals();
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
    vi.unstubAllGlobals();
  });

  it('should use fallback content when fetch throws a network error', async () => {
    const withAdmin = produce(createInitialState(), s => {
      s.network.nodes['contractor_portal']!.accessLevel = 'admin';
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));

    const result = await resolveCommand('cat access_log', withAdmin);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('FILE CONTENT UNAVAILABLE'))).toBe(true);
    vi.unstubAllGlobals();
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
    vi.unstubAllGlobals();
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
    vi.unstubAllGlobals();
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
    const result = await resolveCommand('exploit http', state);
    const nextNode = (result.nextState as GameState).network.nodes['contractor_portal']!;
    expect(nextNode.compromised).toBe(true);
  });

  it('should add 2 trace on a successful exploit', async () => {
    const result = await resolveCommand('exploit http', state);
    expect((result.nextState as GameState).player.trace).toBe(2);
  });

  it('should include the access level gained in output', async () => {
    const result = await resolveCommand('exploit http', state);
    const contents = result.lines.map(l => l.content);
    expect(contents.some(c => c.includes('USER'))).toBe(true);
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
