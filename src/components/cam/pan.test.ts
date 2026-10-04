import { describe, it, expect } from 'vitest';
import { panAngle, panPhase } from './pan';

const SWEEP = 6;
const HOLD = 2;

describe('panPhase', () => {
  it('starts at 0, reaches 1 and holds, returns to 0 and holds', () => {
    expect(panPhase(0, SWEEP, HOLD)).toBe(0);
    expect(panPhase(SWEEP, SWEEP, HOLD)).toBe(1);
    expect(panPhase(SWEEP + HOLD / 2, SWEEP, HOLD)).toBe(1);
    expect(panPhase(SWEEP + HOLD + SWEEP, SWEEP, HOLD)).toBe(0);
    expect(panPhase(SWEEP + HOLD + SWEEP + HOLD / 2, SWEEP, HOLD)).toBe(0);
  });

  it('moves smoothly between the ends and stays within 0..1', () => {
    expect(panPhase(SWEEP / 2, SWEEP, HOLD)).toBeCloseTo(0.5);
    for (let t = -30; t < 60; t += 0.37) {
      const phase = panPhase(t, SWEEP, HOLD);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThanOrEqual(1);
    }
  });

  it('repeats every full cycle', () => {
    const cycle = 2 * (SWEEP + HOLD);
    expect(panPhase(3.3 + cycle, SWEEP, HOLD)).toBeCloseTo(panPhase(3.3, SWEEP, HOLD));
  });
});

describe('panAngle', () => {
  it('swings between minus and plus the range', () => {
    expect(panAngle(0, 0.5, SWEEP, HOLD)).toBeCloseTo(-0.5);
    expect(panAngle(SWEEP, 0.5, SWEEP, HOLD)).toBeCloseTo(0.5);
    expect(panAngle(SWEEP / 2, 0.5, SWEEP, HOLD)).toBeCloseTo(0);
  });
});
