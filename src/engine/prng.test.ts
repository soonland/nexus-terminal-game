import { describe, it, expect } from 'vitest';
import { createPRNG } from './prng';

describe('createPRNG', () => {
  it('returns values in [0, 1)', () => {
    const prng = createPRNG(12345);
    for (let i = 0; i < 1000; i++) {
      const v = prng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic: same seed produces same sequence', () => {
    const a = createPRNG(99999);
    const b = createPRNG(99999);
    for (let i = 0; i < 50; i++) {
      expect(a()).toBe(b());
    }
  });

  it('different seeds produce different sequences', () => {
    const a = createPRNG(1);
    const b = createPRNG(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('seed 0 works without infinite loop or NaN', () => {
    const prng = createPRNG(0);
    const v = prng();
    expect(typeof v).toBe('number');
    expect(Number.isFinite(v)).toBe(true);
  });

  it('produces distinct values across multiple calls', () => {
    const prng = createPRNG(42);
    const values = new Set(Array.from({ length: 100 }, () => prng()));
    // With 100 draws from a uniform 32-bit space, collisions are astronomically unlikely
    expect(values.size).toBeGreaterThan(90);
  });
});
