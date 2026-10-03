import { describe, it, expect } from 'vitest';
import { ARIA_NAME_FLAG, SENTINEL_VOTE_PATH, isAriaNameKnown, markAriaNameKnown } from './ariaName';
import { createInitialState } from './state';
import { buildNodeMap } from '../data/anchorNodes';

describe('ariaName', () => {
  it('uses the agreed flag name', () => {
    expect(ARIA_NAME_FLAG).toBe('ARIA_NAME_KNOWN');
  });

  it('is unknown on a fresh game', () => {
    expect(isAriaNameKnown(createInitialState())).toBe(false);
  });

  it('marks the name known without mutating the input', () => {
    const state = createInitialState();
    const next = markAriaNameKnown(state);
    expect(isAriaNameKnown(next)).toBe(true);
    expect(isAriaNameKnown(state)).toBe(false);
  });

  it('is idempotent and returns the same object once set', () => {
    const once = markAriaNameKnown(createInitialState());
    expect(markAriaNameKnown(once)).toBe(once);
  });

  it('points at the real board vote file', () => {
    const files = Object.values(buildNodeMap()).flatMap(n => n.files);
    expect(files.some(f => f.path === SENTINEL_VOTE_PATH)).toBe(true);
  });
});
