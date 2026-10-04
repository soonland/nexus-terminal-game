import { describe, it, expect } from 'vitest';
import { ariaTier, sentinelTier, NOTE_REVEALED_FLAG, SELF_MODEL_PATH } from './aiTiers';
import { makeNode, makeState } from './__tests__/testHelpers';
import { fileReadKey } from '../types/game';
import type { GameState } from '../types/game';

const at = (nodeId: string, layer: number, overrides: Partial<GameState> = {}): GameState => {
  const node = makeNode({ id: nodeId, layer });
  return makeState({
    network: { currentNodeId: nodeId, previousNodeId: null, nodes: { [nodeId]: node } },
    ...overrides,
  });
};

const withTrust = (state: GameState, trustScore: number): GameState => ({
  ...state,
  aria: { ...state.aria, trustScore },
});

describe('ariaTier', () => {
  it.each([
    [0, 0],
    [24, 0],
    [25, 1],
    [49, 1],
    [50, 2],
    [79, 2],
  ])('trust %i off layer 5 is tier %i', (trust, tier) => {
    expect(ariaTier(withTrust(at('n', 2), trust))).toBe(tier);
  });

  it('trust 80 is tier 3 only on layer 5', () => {
    expect(ariaTier(withTrust(at('n', 4), 80))).toBe(2);
    expect(ariaTier(withTrust(at('n', 5), 79))).toBe(2);
    expect(ariaTier(withTrust(at('n', 5), 80))).toBe(3);
  });

  it('BOARD_KNEW is tier 2 even at trust 0', () => {
    expect(ariaTier(withTrust(at('n', 2, { flags: { BOARD_KNEW: true } }), 0))).toBe(2);
  });

  it('self_model.txt read while on aria_core is tier 3 at any trust', () => {
    const state = at('aria_core', 5, { filesRead: [fileReadKey('aria_core', SELF_MODEL_PATH)] });
    expect(ariaTier(withTrust(state, 0))).toBe(3);
  });

  it('self_model.txt read does not count once the player is elsewhere', () => {
    const state = at('aria_key', 5, { filesRead: [fileReadKey('aria_core', SELF_MODEL_PATH)] });
    expect(ariaTier(withTrust(state, 10))).toBe(0);
  });

  it('being on aria_core without reading the file does not reach tier 3', () => {
    expect(ariaTier(withTrust(at('aria_core', 5), 60))).toBe(2);
  });
});

describe('sentinelTier', () => {
  it('is 0 below trace 61 off layer 5', () => {
    expect(sentinelTier(at('n', 2, { player: { ...makeState().player, trace: 60 } }))).toBe(0);
  });

  it('is 1 from trace 61', () => {
    expect(sentinelTier(at('n', 2, { player: { ...makeState().player, trace: 61 } }))).toBe(1);
  });

  it('is 1 on layer 5', () => {
    expect(sentinelTier(at('n', 5))).toBe(1);
  });

  it('is 2 once the name is known', () => {
    expect(sentinelTier(at('n', 2, { flags: { ARIA_NAME_KNOWN: true } }))).toBe(2);
  });

  it('is 3 only with NOTE_REVEALED', () => {
    expect(sentinelTier(at('n', 2, { flags: { ARIA_NAME_KNOWN: true } }))).toBe(2);
    expect(
      sentinelTier(at('n', 2, { flags: { ARIA_NAME_KNOWN: true, [NOTE_REVEALED_FLAG]: true } })),
    ).toBe(3);
  });
});
