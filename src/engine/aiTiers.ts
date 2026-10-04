import type { GameState } from '../types/game';
import { fileReadKey } from '../types/game';
import { isAriaNameKnown } from './ariaName';

export type AiTier = 0 | 1 | 2 | 3;

// Set by the reveal event (#218); nothing sets it yet, so Sentinel tier 3 is unreachable.
export const NOTE_REVEALED_FLAG = 'NOTE_REVEALED';
export const SELF_MODEL_PATH = '/aria/core/self_model.txt';

const ARIA_CORE_NODE_ID = 'aria_core';
const ARIA_LAYER = 5;

const hasFlag = (state: GameState, flag: string): boolean =>
  flag in state.flags && state.flags[flag];

const currentLayer = (state: GameState): number =>
  state.network.nodes[state.network.currentNodeId]?.layer ?? 0;

export const ariaTier = (state: GameState): AiTier => {
  const { trustScore } = state.aria;
  const onCore = state.network.currentNodeId === ARIA_CORE_NODE_ID;
  const readSelfModel =
    onCore && state.filesRead.includes(fileReadKey(ARIA_CORE_NODE_ID, SELF_MODEL_PATH));
  if (readSelfModel || (trustScore >= 80 && currentLayer(state) === ARIA_LAYER)) return 3;
  if (trustScore >= 50 || hasFlag(state, 'BOARD_KNEW')) return 2;
  if (trustScore >= 25) return 1;
  return 0;
};

export const sentinelTier = (state: GameState): AiTier => {
  if (hasFlag(state, NOTE_REVEALED_FLAG)) return 3;
  if (isAriaNameKnown(state)) return 2;
  if (state.player.trace >= 61 || currentLayer(state) === ARIA_LAYER) return 1;
  return 0;
};
