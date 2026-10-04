import { describe, it, expect } from 'vitest';
import { isNoteRevealed, markNoteRevealed, NOTE_REVEALED_FLAG } from './noteReveal';
import { makeState } from './__tests__/testHelpers';

describe('noteReveal', () => {
  it('is not revealed by default', () => {
    expect(isNoteRevealed(makeState())).toBe(false);
  });

  it('markNoteRevealed sets the flag and is idempotent', () => {
    const once = markNoteRevealed(makeState());
    expect(isNoteRevealed(once)).toBe(true);
    expect(once.flags[NOTE_REVEALED_FLAG]).toBe(true);
    expect(markNoteRevealed(once)).toBe(once);
  });

  it('does not mutate its input', () => {
    const state = makeState();
    markNoteRevealed(state);
    expect(state.flags).toEqual({});
  });
});
