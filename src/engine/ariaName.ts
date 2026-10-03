import type { GameState } from '../types/game';

// The player never sees the name "Aria" until this flag is set. It flips when the board
// vote is read (Sentinel's lineage) or, as a fallback, on the first layer-5 connect.
export const ARIA_NAME_FLAG = 'ARIA_NAME_KNOWN';

// The single authored document outside layer 5 allowed to bridge CASSANDRA and ARIA.
export const SENTINEL_VOTE_PATH = '/home/cfo/documents/PROJ_SENTINEL_BOARD_VOTE.pdf';

export const isAriaNameKnown = (state: GameState): boolean => state.flags[ARIA_NAME_FLAG];

export const markAriaNameKnown = (state: GameState): GameState =>
  isAriaNameKnown(state) ? state : { ...state, flags: { ...state.flags, [ARIA_NAME_FLAG]: true } };
