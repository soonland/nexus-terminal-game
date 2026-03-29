import type { GameState } from '../types/game';

const SAVE_KEY = 'irongate_save';

export const saveGame = (state: GameState): void => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — silently ignore
  }
};

export const loadGame = (): GameState | null => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GameState> & Record<string, unknown>;
    const state: GameState = {
      ...(parsed as GameState),
      turnCount: typeof parsed['turnCount'] === 'number' ? parsed['turnCount'] : 0,
      recentCommands: Array.isArray(parsed['recentCommands']) ? parsed['recentCommands'] : [],
    };
    return state;
  } catch {
    return null;
  }
};

export const clearSave = (): void => {
  localStorage.removeItem(SAVE_KEY);
};

export const hasSave = (): boolean => {
  return localStorage.getItem(SAVE_KEY) !== null;
};
