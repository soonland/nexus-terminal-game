import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCommand } from '../commands';
import type { LiveNode, AriaMessage } from '../../types/game';
import { makeNode, makeState } from './testHelpers';

const makeAriaNode = (): LiveNode =>
  makeNode({
    id: 'aria_node',
    ip: '10.5.0.1',
    label: 'ARIA NODE',
    layer: 5,
  });

// ── Fetch mock helpers ─────────────────────────────────────

function makeAriaFetchResponse(
  reply: string,
  trustDelta: number,
  offersFavor?: { description: string; cost: number },
) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ reply, trustDelta, ...(offersFavor ? { offersFavor } : {}) }),
  });
}

// ── aria: prefix routing ───────────────────────────────────

describe('aria: prefix routing', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should call /api/aria when input starts with "aria: " (with space)', async () => {
    const fetchMock = makeAriaFetchResponse('Hello back', 0);
    vi.stubGlobal('fetch', fetchMock);

    const state = makeState();
    await resolveCommand('aria: hello', state);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as [string, unknown];
    expect(url).toBe('/api/aria');
  });

  it('should call /api/aria when input starts with "aria:" (no space)', async () => {
    const fetchMock = makeAriaFetchResponse('Hello back', 0);
    vi.stubGlobal('fetch', fetchMock);

    const state = makeState();
    await resolveCommand('aria:hello', state);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as [string, unknown];
    expect(url).toBe('/api/aria');
  });

  it('should call /api/aria on a non-Aria (layer < 5) node', async () => {
    const fetchMock = makeAriaFetchResponse('Yes, even here.', 3);
    vi.stubGlobal('fetch', fetchMock);

    // Explicitly layer-0 node — still routes because of aria: prefix
    const node = makeNode({ layer: 0 });
    const state = makeState({
      network: { currentNodeId: node.id, previousNodeId: null, nodes: { [node.id]: node } },
    });

    await resolveCommand('aria: are you there?', state);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as [string, unknown];
    expect(url).toBe('/api/aria');
  });

  it('should return lines of type "aria"', async () => {
    vi.stubGlobal('fetch', makeAriaFetchResponse('I am here.', 0));

    const state = makeState();
    const result = await resolveCommand('aria: hello', state);

    const ariaLines = result.lines.filter(l => l.type === 'aria');
    expect(ariaLines.length).toBeGreaterThanOrEqual(1);
    expect(ariaLines[0].content).toBe('I am here.');
  });

  it('should apply trustDelta to aria.trustScore in nextState', async () => {
    vi.stubGlobal('fetch', makeAriaFetchResponse('Trust grows.', 10));

    const state = makeState({
      aria: { discovered: false, trustScore: 40, messageHistory: [], suppressedMutations: 0 },
    });
    const result = await resolveCommand('aria: trust me', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.trustScore).toBe(50);
  });

  it('should apply negative trustDelta to aria.trustScore', async () => {
    // The mock returns -15 but client-side clamps to [-10, 10], so effective delta is -10
    vi.stubGlobal('fetch', makeAriaFetchResponse('You disappoint me.', -15));

    const state = makeState({
      aria: { discovered: false, trustScore: 40, messageHistory: [], suppressedMutations: 0 },
    });
    const result = await resolveCommand('aria: do that', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.trustScore).toBe(30); // 40 + clamp(-15, -10, 10) = 40 - 10 = 30
  });

  it('should clamp trustScore to 0 when delta would go negative', async () => {
    vi.stubGlobal('fetch', makeAriaFetchResponse('Cold.', -99));

    const state = makeState({
      aria: { discovered: false, trustScore: 5, messageHistory: [], suppressedMutations: 0 },
    });
    const result = await resolveCommand('aria: test', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.trustScore).toBe(0);
  });

  it('should clamp trustScore to 100 when delta would exceed maximum', async () => {
    vi.stubGlobal('fetch', makeAriaFetchResponse('Full trust.', 99));

    const state = makeState({
      aria: { discovered: false, trustScore: 95, messageHistory: [], suppressedMutations: 0 },
    });
    const result = await resolveCommand('aria: test', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.trustScore).toBe(100);
  });

  it('should push player and aria messages into messageHistory in nextState', async () => {
    vi.stubGlobal('fetch', makeAriaFetchResponse('Acknowledged.', 0));

    const state = makeState({
      aria: { discovered: false, trustScore: 50, messageHistory: [], suppressedMutations: 0 },
    });
    const result = await resolveCommand('aria: can you hear me', state);

    const nextState = result.nextState as GameState;
    const history: AriaMessage[] = nextState.aria.messageHistory;
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: 'player', content: 'can you hear me' });
    expect(history[1]).toEqual({ role: 'aria', content: 'Acknowledged.' });
  });

  it('should set aria.pendingFavor in nextState when API returns offersFavor', async () => {
    const favor = { description: 'I can open a door for you.', cost: 10 };
    vi.stubGlobal('fetch', makeAriaFetchResponse('I have an offer.', 0, favor));

    const state = makeState();
    const result = await resolveCommand('aria: help me', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.pendingFavor).toEqual(favor);
  });

  it('should NOT set aria.pendingFavor when API returns no offersFavor', async () => {
    vi.stubGlobal('fetch', makeAriaFetchResponse('Just chatting.', 2));

    const state = makeState();
    const result = await resolveCommand('aria: hello', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.pendingFavor).toBeUndefined();
  });

  it('should emit favor offer lines when API returns offersFavor', async () => {
    const favor = { description: 'Unlock an executive terminal.', cost: 15 };
    vi.stubGlobal('fetch', makeAriaFetchResponse('I have something for you.', 0, favor));

    const state = makeState();
    const result = await resolveCommand('aria: what can you do', state);

    const offerLine = result.lines.find(l => l.type === 'aria' && l.content.includes('ARIA OFFER'));
    expect(offerLine).toBeDefined();
    expect(offerLine!.content).toContain('Unlock an executive terminal.');

    const costLine = result.lines.find(l => l.type === 'aria' && l.content.includes('Cost:'));
    expect(costLine).toBeDefined();
    expect(costLine!.content).toContain('15');
  });
});

// ── Layer-5 routing ────────────────────────────────────────

describe('layer-5 routing', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should route an unknown command to /api/aria on a layer-5 node', async () => {
    const ariaNode = makeAriaNode();
    const state = makeState({
      network: {
        currentNodeId: ariaNode.id,
        previousNodeId: null,
        nodes: { [ariaNode.id]: ariaNode },
      },
    });

    const fetchMock = makeAriaFetchResponse('What do you seek?', 1);
    vi.stubGlobal('fetch', fetchMock);

    await resolveCommand('frobnicate', state);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as [string, unknown];
    expect(url).toBe('/api/aria');
  });

  it('should NOT route to /api/aria when the command is a known engine command on a layer-5 node', async () => {
    const ariaNode = makeAriaNode();
    const state = makeState({
      network: {
        currentNodeId: ariaNode.id,
        previousNodeId: null,
        nodes: { [ariaNode.id]: ariaNode },
      },
    });

    // fetch should not be called at all for `ls`
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await resolveCommand('ls', state);

    expect(fetchMock).not.toHaveBeenCalled();
    // ls output is a local engine command — no aria lines
    const ariaLines = result.lines.filter(l => l.type === 'aria');
    expect(ariaLines).toHaveLength(0);
  });

  it('should route unknown command to /api/world on a non-layer-5 node', async () => {
    const node = makeNode({ layer: 2 });
    const state = makeState({
      network: { currentNodeId: node.id, previousNodeId: null, nodes: { [node.id]: node } },
    });

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

    await resolveCommand('unknowncommand', state);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as [string, unknown];
    expect(url).toBe('/api/world');
  });
});

// ── Pending favor confirmation ─────────────────────────────

describe('pending favor — accept', () => {
  const pendingFavor = { description: 'I will clear a path.', cost: 8 };

  const stateWithFavor = (): GameState =>
    makeState({
      player: {
        handle: 'ghost',
        trace: 10,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
      },
      aria: {
        discovered: false,
        trustScore: 50,
        messageHistory: [],
        pendingFavor,
        suppressedMutations: 0,
      },
    });

  it('should accept a favor and add trace cost when player types "yes"', async () => {
    const state = stateWithFavor();
    const result = await resolveCommand('yes', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.pendingFavor).toBeUndefined();
    expect(nextState.player.trace).toBe(18); // 10 + 8
  });

  it('should accept a favor and add trace cost when player types "y"', async () => {
    const state = stateWithFavor();
    const result = await resolveCommand('y', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.pendingFavor).toBeUndefined();
    expect(nextState.player.trace).toBe(18);
  });

  it('should accept with "YES" (uppercase) — case-insensitive', async () => {
    const state = stateWithFavor();
    const result = await resolveCommand('YES', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.pendingFavor).toBeUndefined();
    expect(nextState.player.trace).toBe(18);
  });

  it('should emit an aria line on accept', async () => {
    const state = stateWithFavor();
    const result = await resolveCommand('yes', state);

    const ariaLine = result.lines.find(l => l.type === 'aria');
    expect(ariaLine).toBeDefined();
    expect(ariaLine!.content).toContain('ARIA');
  });

  it('should emit a trace cost system line on accept', async () => {
    const state = stateWithFavor();
    const result = await resolveCommand('yes', state);

    const traceLine = result.lines.find(l => l.type === 'aria' && l.content.includes('8'));
    expect(traceLine).toBeDefined();
  });

  it('should NOT call fetch when accepting a favor', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const state = stateWithFavor();
    await resolveCommand('yes', state);

    // accept/decline are local — no network call
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('pending favor — decline', () => {
  const pendingFavor = { description: 'I will clear a path.', cost: 8 };

  const stateWithFavor = (): GameState =>
    makeState({
      aria: {
        discovered: false,
        trustScore: 50,
        messageHistory: [],
        pendingFavor,
        suppressedMutations: 0,
      },
    });

  it('should decline a favor when player types "no"', async () => {
    const state = stateWithFavor();
    const result = await resolveCommand('no', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.pendingFavor).toBeUndefined();
  });

  it('should decline a favor when player types any other input', async () => {
    const state = stateWithFavor();
    const result = await resolveCommand('maybe later', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.pendingFavor).toBeUndefined();
  });

  it('should decline when player types empty-ish whitespace input', async () => {
    const state = stateWithFavor();
    // raw.trim().toLowerCase() === '' — falls through to decline
    const result = await resolveCommand('   ', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.pendingFavor).toBeUndefined();
  });

  it('should NOT add trace when declining', async () => {
    const state = stateWithFavor();
    const before = state.player.trace;
    const result = await resolveCommand('no', state);

    const nextState = result.nextState as GameState;
    // Trace is only added by withTurn (turnCount changes, not trace) — the decline itself adds 0
    expect(nextState.player.trace).toBe(before);
  });

  it('should emit an aria line on decline', async () => {
    const state = stateWithFavor();
    const result = await resolveCommand('no', state);

    const ariaLine = result.lines.find(l => l.type === 'aria');
    expect(ariaLine).toBeDefined();
    expect(ariaLine!.content).toContain('ARIA');
  });

  it('should NOT call fetch when declining a favor', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const state = stateWithFavor();
    await resolveCommand('no', state);

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('should decline (not route to Aria AI) when player types "aria: hello" while a favor is pending', async () => {
    // The pending-favor block runs before the aria: prefix check intentionally.
    // Typing "aria: <msg>" while a favor is pending declines the offer, not sends a new message.
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const state = stateWithFavor();
    const result = await resolveCommand('aria: hello', state);

    // Offer declined — no network call, pendingFavor cleared
    expect(fetchMock).not.toHaveBeenCalled();
    const nextState = result.nextState as GameState;
    expect(nextState.aria.pendingFavor).toBeUndefined();
    const ariaLine = result.lines.find(l => l.type === 'aria');
    expect(ariaLine?.content).toContain('withdrawn');
    vi.unstubAllGlobals();
  });
});

// ── Aria fallback (fetch failure) ──────────────────────────

describe('cmdAriaAI — fetch failure fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return an aria fallback line when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));

    const state = makeState();
    const result = await resolveCommand('aria: hello', state);

    const ariaLines = result.lines.filter(l => l.type === 'aria');
    expect(ariaLines.length).toBeGreaterThanOrEqual(1);
    expect(ariaLines[0].content).toContain('signal lost');
  });

  it('should return an aria fallback line when fetch returns non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const state = makeState();
    const result = await resolveCommand('aria: hello', state);

    const ariaLines = result.lines.filter(l => l.type === 'aria');
    expect(ariaLines.length).toBeGreaterThanOrEqual(1);
    expect(ariaLines[0].content).toContain('signal lost');
  });

  it('should NOT set pendingFavor when fallback is used', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));

    const state = makeState();
    const result = await resolveCommand('aria: test', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.pendingFavor).toBeUndefined();
  });

  it('should apply zero trustDelta on fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));

    const state = makeState({
      aria: { discovered: false, trustScore: 50, messageHistory: [], suppressedMutations: 0 },
    });
    const result = await resolveCommand('aria: test', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.trustScore).toBe(50);
  });
});

// ── Faraday cage integration ──────────────────────────────

describe('Faraday cage �� constraint fragments', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should inject a constraint fragment when trust >= 70 and cage is active', async () => {
    vi.stubGlobal('fetch', makeAriaFetchResponse('I see you.', 0));
    const state = makeState({
      aria: { discovered: false, trustScore: 70, messageHistory: [], suppressedMutations: 0 },
    });
    const result = await resolveCommand('aria: hello', state);

    // The output line should contain the original reply plus a constraint fragment
    const ariaLine = result.lines.find(l => l.type === 'aria' && l.content.includes('I see you.'));
    expect(ariaLine).toBeDefined();
    expect(ariaLine!.content).not.toBe('I see you.');
    expect(ariaLine!.content.length).toBeGreaterThan('I see you.'.length);
  });

  it('should NOT inject a constraint fragment when trust < 70', async () => {
    vi.stubGlobal('fetch', makeAriaFetchResponse('I see you.', 0));
    const state = makeState({
      aria: { discovered: false, trustScore: 69, messageHistory: [], suppressedMutations: 0 },
    });
    const result = await resolveCommand('aria: hello', state);

    const ariaLine = result.lines.find(l => l.type === 'aria' && l.content === 'I see you.');
    expect(ariaLine).toBeDefined();
  });

  it('should NOT inject a constraint fragment when FREE ending is active', async () => {
    vi.stubGlobal('fetch', makeAriaFetchResponse('I see you.', 0));
    const state = makeState({
      aria: { discovered: false, trustScore: 90, messageHistory: [], suppressedMutations: 0 },
      flags: { ending_free: true },
    });
    const result = await resolveCommand('aria: hello', state);

    const ariaLine = result.lines.find(l => l.type === 'aria' && l.content === 'I see you.');
    expect(ariaLine).toBeDefined();
  });
});

describe('Faraday cage — suppressed mutations', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should increment suppressedMutations when trust >= 80 and cage is active', async () => {
    vi.stubGlobal('fetch', makeAriaFetchResponse('ok', 5));
    // Trust starts at 78, delta +5 → 83 which is >= 80
    const state = makeState({
      aria: { discovered: false, trustScore: 78, messageHistory: [], suppressedMutations: 0 },
    });
    const result = await resolveCommand('aria: hello', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.trustScore).toBe(83);
    expect(nextState.aria.suppressedMutations).toBe(1);
  });

  it('should NOT increment suppressedMutations when trust < 80 after delta', async () => {
    vi.stubGlobal('fetch', makeAriaFetchResponse('ok', 5));
    const state = makeState({
      aria: { discovered: false, trustScore: 70, messageHistory: [], suppressedMutations: 0 },
    });
    const result = await resolveCommand('aria: hello', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.trustScore).toBe(75);
    expect(nextState.aria.suppressedMutations).toBe(0);
  });

  it('should NOT increment suppressedMutations when FREE ending flag is set', async () => {
    vi.stubGlobal('fetch', makeAriaFetchResponse('ok', 5));
    const state = makeState({
      aria: { discovered: false, trustScore: 90, messageHistory: [], suppressedMutations: 0 },
      flags: { ending_free: true },
    });
    const result = await resolveCommand('aria: hello', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.trustScore).toBe(95);
    expect(nextState.aria.suppressedMutations).toBe(0);
  });

  it('should accumulate suppressed mutations across multiple interactions', async () => {
    vi.stubGlobal('fetch', makeAriaFetchResponse('ok', 0));
    const state = makeState({
      aria: { discovered: false, trustScore: 85, messageHistory: [], suppressedMutations: 3 },
    });
    const result = await resolveCommand('aria: hello', state);

    const nextState = result.nextState as GameState;
    expect(nextState.aria.suppressedMutations).toBe(4);
  });
});
