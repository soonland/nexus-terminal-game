import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCommand } from '../commands';
import { makeNode, makeState } from './testHelpers';

// ── Local commands — no AI, no state mutation ──────────────

describe('local commands — no AI calls', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('help never calls /api/aria or /api/world', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await resolveCommand('help', makeState());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('status never calls any AI endpoint', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await resolveCommand('status', makeState());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('map never calls any AI endpoint', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await resolveCommand('map', makeState());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clear never calls any AI endpoint', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await resolveCommand('clear', makeState());

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── Local commands — no state mutation ────────────────────

describe('local commands — do not mutate state', () => {
  const LOCAL_COMMANDS = ['help', 'status', 'whoami', 'map', 'clear', 'briefing', 'notes'];

  for (const cmd of LOCAL_COMMANDS) {
    it(`${cmd} does not return a nextState`, async () => {
      const state = makeState({ turnCount: 5 });
      const result = await resolveCommand(cmd, state);

      expect(result.nextState).toBeUndefined();
    });
  }
});

// ── Engine commands — scan never calls AI ─────────────────

describe('engine commands — no AI calls', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('scan never calls /api/aria or /api/world', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await resolveCommand('scan', makeState());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('scan increments turnCount (goes through withTurn)', async () => {
    const state = makeState({ turnCount: 3 });
    const result = await resolveCommand('scan', state);

    const nextState = result.nextState as GameState;
    expect(nextState.turnCount).toBe(4);
  });
});

// ── aria: prefix routes to /api/aria on non-Aria nodes ─────

describe('aria: prefix routing — non-Aria node', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('aria: hello routes to /api/aria on a layer-0 node', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ reply: 'I hear you.', trustDelta: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const node = makeNode({ layer: 0 });
    const state = makeState({
      network: { currentNodeId: node.id, previousNodeId: null, nodes: { [node.id]: node } },
    });

    await resolveCommand('aria: hello', state);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as [string, unknown];
    expect(url).toBe('/api/aria');
  });
});

// ── Unknown commands route to World AI on non-layer-5 nodes ─

describe('unknown commands — World AI routing', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('frobnicate on a non-layer-5 node reaches /api/world', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        narrative: 'World response',
        traceChange: 0,
        accessGranted: false,
        newAccessLevel: null,
        flagsSet: {},
        nodesUnlocked: [],
        isUnknown: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const node = makeNode({ layer: 2 });
    const state = makeState({
      network: { currentNodeId: node.id, previousNodeId: null, nodes: { [node.id]: node } },
    });

    await resolveCommand('frobnicate', state);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as [string, unknown];
    expect(url).toBe('/api/world');
  });

  it('unknown command on layer-5 node routes to /api/aria, not /api/world', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ reply: 'What do you seek?', trustDelta: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const node = makeNode({ layer: 5 });
    const state = makeState({
      network: { currentNodeId: node.id, previousNodeId: null, nodes: { [node.id]: node } },
    });

    await resolveCommand('frobnicate', state);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as [string, unknown];
    expect(url).toBe('/api/aria');
  });
});

// ── Resolution priority order ──────────────────────────────

describe('resolution priority order', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('local command takes priority over World AI even on layer-5 node', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const node = makeNode({ layer: 5 });
    const state = makeState({
      network: { currentNodeId: node.id, previousNodeId: null, nodes: { [node.id]: node } },
    });

    // 'status' is a local command — should never reach any AI handler
    await resolveCommand('status', state);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('engine command takes priority over World AI on non-layer-5 node', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const node = makeNode({ layer: 2 });
    const state = makeState({
      network: { currentNodeId: node.id, previousNodeId: null, nodes: { [node.id]: node } },
    });

    // 'scan' is an engine command — should not call AI
    await resolveCommand('scan', state);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
