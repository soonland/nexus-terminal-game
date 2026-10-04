import { describe, it, expect, vi, afterEach } from 'vitest';
import { appendAriaExchange, ariaChannelLines, ariaReplyCount, ariaTabLabel } from './ariaChannel';
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

describe('past the 50-entry history cap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // 25 exchanges fill the 50-entry history; `exchanges` says how many have really happened.
  const atCap = (exchanges: number): GameState => {
    const history: GameState['aria']['messageHistory'] = [];
    for (let i = exchanges - 24; i <= exchanges; i++) {
      history.push(
        { role: 'player', content: `q${String(i)}` },
        { role: 'aria', content: `a${String(i)}` },
      );
    }
    const base = makeState();
    return { ...base, aria: { ...base.aria, messageHistory: history, exchangeCount: exchanges } };
  };

  it('counts every reply ever given, not the entries still in the history', () => {
    expect(atCap(60).aria.messageHistory).toHaveLength(50);
    expect(ariaReplyCount(atCap(60))).toBe(60);
  });

  it('an older save without the counter falls back to the replies in its history', () => {
    const legacy = withHistory([
      { role: 'player', content: 'a' },
      { role: 'aria', content: 'b' },
      { role: 'player', content: 'c' },
      { role: 'aria', content: 'd' },
    ]);
    expect(legacy.aria.exchangeCount).toBeUndefined();
    expect(ariaReplyCount(legacy)).toBe(2);
  });

  it('appendAriaExchange adds a pair, bumps the counter and keeps the last 50 entries', () => {
    const state = atCap(40);
    const next = appendAriaExchange(state.aria, 'new question', 'new answer');
    expect(next.messageHistory).toHaveLength(50);
    expect(next.messageHistory.at(-1)).toEqual({ role: 'aria', content: 'new answer' });
    expect(next.messageHistory.at(-2)).toEqual({ role: 'player', content: 'new question' });
    expect(next.exchangeCount).toBe(41);
    expect(state.aria.exchangeCount).toBe(40); // input untouched
  });

  it('a new reply at the cap still raises the reply count (the unread marker keeps working)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ reply: 'still here.', trustDelta: 0 }),
      }),
    );
    const before = atCap(40);
    const result = await resolveCommand('msg aria again', before);
    const after = result.nextState as GameState;
    expect(after.aria.messageHistory).toHaveLength(50);
    expect(ariaReplyCount(after)).toBe(ariaReplyCount(before) + 1);
  });

  it('line ids stay stable when the history is trimmed, and the newest line gets a new id', () => {
    const before = atCap(40);
    const after = { ...before, aria: appendAriaExchange(before.aria, 'q', 'a') };
    const idsBefore = new Map(ariaChannelLines(before).map(l => [l.id, l.content]));
    const linesAfter = ariaChannelLines(after);
    // Every line that survived the trim keeps its id and its content.
    for (const line of linesAfter) {
      if (idsBefore.has(line.id)) expect(idsBefore.get(line.id)).toBe(line.content);
    }
    const survivors = linesAfter.filter(l => idsBefore.has(l.id));
    expect(survivors).toHaveLength(48); // two oldest entries dropped, two new ones added
    expect(idsBefore.has(linesAfter.at(-1)!.id)).toBe(false);
    expect(new Set(linesAfter.map(l => l.id)).size).toBe(linesAfter.length);
  });

  it('the final decision exchange counts too', () => {
    const next = appendAriaExchange(atCap(10).aria, 'DECISION: SELL', 'so it continues.');
    expect(next.exchangeCount).toBe(11);
  });
});

describe('the exchange counter survives a save and a load', () => {
  it('persists exchangeCount, so the unread count and line ids are the same after a reload', async () => {
    const { saveGame, loadGame } = await import('./persistence');
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    try {
      const base = createInitialState();
      const state = {
        ...base,
        aria: {
          ...base.aria,
          exchangeCount: 77,
          messageHistory: [
            { role: 'player' as const, content: 'q' },
            { role: 'aria' as const, content: 'a' },
          ],
        },
      };
      saveGame(state);
      const loaded = loadGame();
      expect(loaded?.aria.exchangeCount).toBe(77);
      expect(ariaReplyCount(loaded as GameState)).toBe(77);
      expect(ariaChannelLines(loaded as GameState).map(l => l.id)).toEqual(
        ariaChannelLines(state).map(l => l.id),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
