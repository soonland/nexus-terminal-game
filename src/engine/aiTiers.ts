import type { GameState } from '../types/game';
import { isAriaNameKnown } from './ariaName';
import { isNoteRevealed } from './noteReveal';

export type AiTier = 0 | 1 | 2 | 3;

const ARIA_LAYER = 5;

const hasFlag = (state: GameState, flag: string): boolean =>
  flag in state.flags && state.flags[flag];

const currentLayer = (state: GameState): number =>
  state.network.nodes[state.network.currentNodeId]?.layer ?? 0;

export const ariaTier = (state: GameState): AiTier => {
  if (isNoteRevealed(state)) return 3;
  const { trustScore } = state.aria;
  if (trustScore >= 50 || hasFlag(state, 'BOARD_KNEW')) return 2;
  if (trustScore >= 25) return 1;
  return 0;
};

export const sentinelTier = (state: GameState): AiTier => {
  if (isNoteRevealed(state)) return 3;
  if (isAriaNameKnown(state)) return 2;
  if (state.player.trace >= 61 || currentLayer(state) === ARIA_LAYER) return 1;
  return 0;
};
