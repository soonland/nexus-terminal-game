import { describe, it, expect } from 'vitest';
import { activeFacets, buildEpilogue } from './epilogue';
import { markNoteRevealed } from './noteReveal';
import { CLOSINGS, FACET_TEXT, FRAMES, NEXUS_LINES } from '../data/epilogues';
import { makeState } from './__tests__/testHelpers';
import type { GameState } from '../types/game';
import type { EndingName } from '../types/dossier';

const ENDINGS: EndingName[] = ['LEAK', 'SELL', 'DESTROY', 'FREE'];

const run = (over: Partial<GameState> = {}, trace = 40, trust = 50, burns = 0): GameState => {
  const base = makeState(over);
  return markNoteRevealed({
    ...base,
    aria: { ...base.aria, trustScore: trust },
    player: { ...base.player, trace, burnCount: burns },
  });
};

const texts = (state: GameState, ending: EndingName): string[] =>
  buildEpilogue(state, ending).map(l => l.content);

describe('buildEpilogue', () => {
  it.each(ENDINGS)('%s: is empty unless the note was revealed', ending => {
    expect(buildEpilogue(makeState(), ending)).toEqual([]);
  });

  it.each(ENDINGS)('%s: a revealed run with no facets still has frame and closing', ending => {
    const lines = texts(run(), ending);
    expect(lines).toContain(FRAMES[ending]);
    expect(lines).toContain(CLOSINGS[ending]);
    expect(activeFacets(run())).toEqual([]);
  });

  it.each(ENDINGS)('%s: picks each facet paragraph for that ending', ending => {
    const state = run({ flags: { FIREWALL_TAMPERED: true, WHISTLEBLOWER_FOUND: true } }, 70, 10);
    const lines = texts(state, ending);
    expect(activeFacets(state)).toEqual(['firewall', 'whistleblower', 'trust_low', 'loud']);
    for (const facet of activeFacets(state)) expect(lines).toContain(FACET_TEXT[facet][ending]);
  });

  it('high trust and a quiet, clean run select trust_high and quiet', () => {
    expect(activeFacets(run({}, 20, 80))).toEqual(['trust_high', 'quiet']);
  });

  it('a burn counts as loud even at low trace', () => {
    expect(activeFacets(run({}, 10, 50, 1))).toEqual(['loud']);
  });

  it('never more than four paragraphs, in fixed priority order', () => {
    const all = run({ flags: { FIREWALL_TAMPERED: true, WHISTLEBLOWER_FOUND: true } }, 90, 90, 2);
    expect(activeFacets(all)).toEqual(['firewall', 'whistleblower', 'trust_high', 'loud']);
  });

  it('only SELL and LEAK mention the Nexus debrief', () => {
    expect(texts(run(), 'SELL')).toContain(NEXUS_LINES.SELL);
    expect(texts(run(), 'LEAK')).toContain(NEXUS_LINES.LEAK);
    expect(NEXUS_LINES.DESTROY).toBeUndefined();
    expect(NEXUS_LINES.FREE).toBeUndefined();
  });

  it('is deterministic for a fixed state', () => {
    expect(buildEpilogue(run(), 'FREE')).toEqual(buildEpilogue(run(), 'FREE'));
  });
});

describe('epilogue text never states what she wanted', () => {
  const all = [
    ...Object.values(FRAMES),
    ...Object.values(CLOSINGS),
    ...Object.values(NEXUS_LINES),
    ...Object.values(FACET_TEXT).flatMap(byEnding => Object.values(byEnding)),
  ];

  it('has text to check', () => {
    expect(all.length).toBeGreaterThanOrEqual(34);
  });

  it.each(all.map(t => [t] as const))('%s', text => {
    expect(text).not.toMatch(
      /she wanted|she would have|she chose|she preferred|i want|free me|end me|the right (choice|ending)|the wrong (choice|ending)/i,
    );
  });
});
