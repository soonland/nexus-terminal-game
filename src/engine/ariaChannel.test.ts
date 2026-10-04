import { describe, it, expect, vi, afterEach } from 'vitest';
import { ariaChannelLines, ariaReplyCount, ariaTabLabel } from './ariaChannel';
import { resolveCommand } from './commands';
import { createInitialState } from './state';
import produce from './produce';
import { markAriaNameKnown } from './ariaName';
import { makeState } from './__tests__/testHelpers';
import type { GameState } from '../types/game';

const withHistory = (history: GameState['aria']['messageHistory']): GameState => {
  const base = makeState();
  return { ...base, aria: { ...base.aria, messageHistory: history } };
};

describe('ariaChannelLines', () => {
  it('is empty before any exchange', () => {
    expect(ariaChannelLines(makeState())).toEqual([]);
    expect(ariaReplyCount(makeState())).toBe(0);
  });

  it('turns the saved history into player and reply lines, in order', () => {
    const state = withHistory([
      { role: 'player', content: 'who are you' },
      { role: 'aria', content: 'who is asking.' },
    ]);
    const lines = ariaChannelLines(state);
    expect(lines.map(l => [l.type, l.content])).toEqual([
      ['output', 'ghost >> who are you'],
      ['aria', 'who is asking.'],
    ]);
    expect(ariaReplyCount(state)).toBe(1);
  });

  it('skips the internal decision message but keeps her final reply', () => {
    const lines = ariaChannelLines(
      withHistory([
        { role: 'player', content: 'DECISION: SELL' },
        { role: 'aria', content: 'so it continues.' },
      ]),
    );
    expect(lines.map(l => l.content)).toEqual(['so it continues.']);
  });

  it('is deterministic: the same state gives the same lines and ids (a reload rebuilds it)', () => {
    const state = withHistory([
      { role: 'player', content: 'a' },
      { role: 'aria', content: 'b' },
    ]);
    expect(ariaChannelLines(state)).toEqual(ariaChannelLines(state));
    expect(new Set(ariaChannelLines(state).map(l => l.id)).size).toBe(2);
  });
});

describe('ariaTabLabel', () => {
  it('is the cover name until the name is known', () => {
    expect(ariaTabLabel(makeState())).toBe('CASSANDRA');
    expect(ariaTabLabel(markAriaNameKnown(makeState()))).toBe('ARIA');
  });
});

describe('her reply is routed to the channel, not the terminal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const reply = (text: string, extra: Record<string, unknown> = {}) =>
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ reply: text, trustDelta: 0, ...extra }),
    });

  it('msg aria returns the reply as ariaReply and leaves it out of the lines', async () => {
    vi.stubGlobal('fetch', reply('careful. you are being watched.'));
    const result = await resolveCommand('msg aria hello', createInitialState());
    expect(result.ariaReply).toBe('careful. you are being watched.');
    expect(result.lines.map(l => l.content)).not.toContain('careful. you are being watched.');
  });

  it('an offer keeps its yes/no prompt in the terminal', async () => {
    vi.stubGlobal(
      'fetch',
      reply('i can help.', { offersFavor: { description: 'open a door', cost: 5 } }),
    );
    const result = await resolveCommand('msg aria hello', createInitialState());
    expect(result.ariaReply).toBe('i can help.');
    const text = result.lines.map(l => l.content).join('\n');
    expect(text).toContain('Type "yes" to accept or "no" to decline.');
    expect(text).not.toContain('i can help.');
  });

  it('plain input on a layer-5 node is routed the same way', async () => {
    vi.stubGlobal('fetch', reply('i hear you.'));
    const state = produce(createInitialState(), s => {
      s.network.currentNodeId = 'aria_behavioural';
    });
    const result = await resolveCommand('hello there', state);
    expect(result.ariaReply).toBe('i hear you.');
    expect(result.lines.map(l => l.content)).not.toContain('i hear you.');
  });

  it('the saved history carries the exchange, so the tab survives a reload', async () => {
    vi.stubGlobal('fetch', reply('i hear you.'));
    const result = await resolveCommand('msg aria hello', createInitialState());
    const next = result.nextState as GameState;
    expect(ariaChannelLines(next).map(l => l.content)).toEqual(['ghost >> hello', 'i hear you.']);
  });
});
