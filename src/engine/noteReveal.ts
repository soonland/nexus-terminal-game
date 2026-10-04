import type { GameState } from '../types/game';

// Set when the player reads the self-model at the core: Aria wrote the note (#218).
export const NOTE_REVEALED_FLAG = 'NOTE_REVEALED';
export const SELF_MODEL_PATH = '/aria/core/self_model.txt';
export const ARIA_CORE_NODE_ID = 'aria_core';

export const isNoteRevealed = (state: GameState): boolean =>
  NOTE_REVEALED_FLAG in state.flags && state.flags[NOTE_REVEALED_FLAG];

export const markNoteRevealed = (state: GameState): GameState =>
  isNoteRevealed(state)
    ? state
    : { ...state, flags: { ...state.flags, [NOTE_REVEALED_FLAG]: true } };
