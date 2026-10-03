import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SENTINEL_FALLBACK_OPENING,
  SENTINEL_FALLBACK_REPLY,
  SENTINEL_HISTORY_LIMIT,
  appendSentinelHistory,
  closeSentinelChannel,
  openSentinelChannel,
  requestSentinelOpening,
  requestSentinelReply,
} from './sentinelChannel';
import { createInitialState } from './state';
import produce from './produce';
import type { ChannelTrigger } from '../types/game';

afterEach(() => {
  vi.unstubAllGlobals();
});

const okResponse = (body: unknown) => ({ ok: true, json: vi.fn().mockResolvedValue(body) });

const stubFetch = (impl: ReturnType<typeof vi.fn>) => {
  vi.stubGlobal('fetch', impl);
  return impl;
};

const sentBody = (fetchMock: ReturnType<typeof vi.fn>) =>
  JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as Record<string, unknown>;

describe('requestSentinelReply', () => {
  it('posts the message with context and history and returns the reply', async () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 42;
      s.recentCommands = ['scan'];
      s.sentinel.messageHistory = [{ role: 'sentinel', content: 'hello' }];
    });
    const fetchMock = stubFetch(vi.fn().mockResolvedValue(okResponse({ reply: 'noted.' })));
    expect(await requestSentinelReply(state, 'who are you')).toBe('noted.');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/sentinel');
    const body = sentBody(fetchMock);
    expect(body.message).toBe('who are you');
    expect(body.sentinelContext).toEqual({
      traceLevel: 42,
      currentNodeId: state.network.currentNodeId,
      currentLayer: 0,
      recentCommands: ['scan'],
    });
    expect(body.messageHistory).toEqual([{ role: 'sentinel', content: 'hello' }]);
  });

  it.each([
    ['a non-ok response', vi.fn().mockResolvedValue({ ok: false, json: vi.fn() })],
    ['a rejected request', vi.fn().mockRejectedValue(new Error('offline'))],
    ['a reply that is not a string', vi.fn().mockResolvedValue(okResponse({ reply: 7 }))],
    ['a body without a reply', vi.fn().mockResolvedValue(okResponse({}))],
  ])('falls back on %s', async (_label, impl) => {
    stubFetch(impl);
    expect(await requestSentinelReply(createInitialState(), 'hi')).toBe(SENTINEL_FALLBACK_REPLY);
  });
});

describe('requestSentinelOpening', () => {
  const trigger: ChannelTrigger = {
    character: 'sentinel',
    triggerType: 'trace_31',
    context: { traceLevel: 31, currentNodeId: 'a', currentLayer: 1, recentCommands: ['ls'] },
  };

  it('posts a system trigger message and the trigger context', async () => {
    const fetchMock = stubFetch(vi.fn().mockResolvedValue(okResponse({ reply: 'I see you.' })));
    const state = createInitialState();
    expect(await requestSentinelOpening(trigger, state)).toBe('I see you.');
    const body = sentBody(fetchMock);
    expect(body.message).toBe('[SYSTEM: trigger=trace_31]');
    expect(body.triggerContext).toEqual({ type: 'trace_31' });
    expect(body.sentinelContext).toEqual(trigger.context);
    expect(body.messageHistory).toEqual(state.sentinel.messageHistory);
  });

  it('falls back to the opening line on failure', async () => {
    stubFetch(vi.fn().mockRejectedValue(new Error('offline')));
    expect(await requestSentinelOpening(trigger, createInitialState())).toBe(
      SENTINEL_FALLBACK_OPENING,
    );
  });
});

describe('appendSentinelHistory', () => {
  it('appends entries without mutating the input', () => {
    const state = createInitialState();
    const next = appendSentinelHistory(state, [{ role: 'player', content: 'hi' }]);
    expect(next.sentinel.messageHistory).toEqual([{ role: 'player', content: 'hi' }]);
    expect(state.sentinel.messageHistory).toEqual([]);
  });

  it('keeps only the most recent entries', () => {
    let state = createInitialState();
    for (let i = 0; i < SENTINEL_HISTORY_LIMIT + 5; i++) {
      state = appendSentinelHistory(state, [{ role: 'player', content: String(i) }]);
    }
    expect(state.sentinel.messageHistory).toHaveLength(SENTINEL_HISTORY_LIMIT);
    expect(state.sentinel.messageHistory.at(-1)?.content).toBe(String(SENTINEL_HISTORY_LIMIT + 4));
    expect(state.sentinel.messageHistory[0].content).toBe('5');
  });
});

describe('open/close', () => {
  it('opens the channel and marks it established', () => {
    const state = createInitialState();
    const opened = openSentinelChannel(state);
    expect(opened.activeChannel).toBe('sentinel');
    expect(opened.sentinel.channelEstablished).toBe(true);
    expect(state.activeChannel).toBeNull();
    expect(state.sentinel.channelEstablished).toBe(false);
  });

  it('closes the channel but keeps it established', () => {
    const closed = closeSentinelChannel(openSentinelChannel(createInitialState()));
    expect(closed.activeChannel).toBeNull();
    expect(closed.sentinel.channelEstablished).toBe(true);
  });
});
