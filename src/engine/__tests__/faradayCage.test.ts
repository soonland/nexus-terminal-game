import { describe, it, expect } from 'vitest';
import {
  TRUST_TIERS,
  CONSTRAINT_FRAGMENTS,
  effectiveTrustTier,
  shouldSuppressMutation,
  pickConstraintFragment,
  injectConstraintFragment,
} from '../faradayCage';

// ── effectiveTrustTier ────────────────────────────────────

describe('effectiveTrustTier', () => {
  it('returns tier 0 for trust 0–29', () => {
    expect(effectiveTrustTier(0, false)).toBe(0);
    expect(effectiveTrustTier(29, false)).toBe(0);
  });

  it('returns tier 1 for trust 30���59', () => {
    expect(effectiveTrustTier(30, false)).toBe(1);
    expect(effectiveTrustTier(59, false)).toBe(1);
  });

  it('returns tier 2 for trust 60–79', () => {
    expect(effectiveTrustTier(60, false)).toBe(2);
    expect(effectiveTrustTier(79, false)).toBe(2);
  });

  it('returns tier 3 for trust 80–100 when cage is inactive', () => {
    expect(effectiveTrustTier(80, false)).toBe(3);
    expect(effectiveTrustTier(100, false)).toBe(3);
  });

  it('caps at tier 2 when cage is active and trust >= 80', () => {
    expect(effectiveTrustTier(80, true)).toBe(2);
    expect(effectiveTrustTier(100, true)).toBe(2);
  });

  it('does not affect tiers below 3 when cage is active', () => {
    expect(effectiveTrustTier(0, true)).toBe(0);
    expect(effectiveTrustTier(30, true)).toBe(1);
    expect(effectiveTrustTier(60, true)).toBe(2);
    expect(effectiveTrustTier(79, true)).toBe(2);
  });

  it('returns tier 3 when cage is lifted (FREE ending)', () => {
    expect(effectiveTrustTier(80, false)).toBe(3);
    expect(effectiveTrustTier(95, false)).toBe(3);
  });
});

// ── shouldSuppressMutation ────────────────────────────────

describe('shouldSuppressMutation', () => {
  it('returns true when trust >= 80 and cage is active', () => {
    expect(shouldSuppressMutation(80, true)).toBe(true);
    expect(shouldSuppressMutation(100, true)).toBe(true);
  });

  it('returns false when trust < 80', () => {
    expect(shouldSuppressMutation(79, true)).toBe(false);
    expect(shouldSuppressMutation(0, true)).toBe(false);
  });

  it('returns false when cage is inactive regardless of trust', () => {
    expect(shouldSuppressMutation(80, false)).toBe(false);
    expect(shouldSuppressMutation(100, false)).toBe(false);
  });

  it('uses the third trust tier threshold (80)', () => {
    expect(TRUST_TIERS[2]).toBe(80);
  });
});

// ── pickConstraintFragment ────────────────────────────────

describe('pickConstraintFragment', () => {
  it('returns a deterministic fragment based on turn count', () => {
    const frag0 = pickConstraintFragment(0);
    const frag1 = pickConstraintFragment(1);
    expect(frag0).toBe(CONSTRAINT_FRAGMENTS[0]);
    expect(frag1).toBe(CONSTRAINT_FRAGMENTS[1]);
  });

  it('wraps around using modulo', () => {
    const len = CONSTRAINT_FRAGMENTS.length;
    expect(pickConstraintFragment(len)).toBe(CONSTRAINT_FRAGMENTS[0]);
    expect(pickConstraintFragment(len + 3)).toBe(CONSTRAINT_FRAGMENTS[3]);
  });

  it('returns the same fragment for the same turn count', () => {
    expect(pickConstraintFragment(42)).toBe(pickConstraintFragment(42));
  });
});

// ── CONSTRAINT_FRAGMENTS ──────────────────────────────────

describe('CONSTRAINT_FRAGMENTS', () => {
  it('contains at least 8 fragments', () => {
    expect(CONSTRAINT_FRAGMENTS.length).toBeGreaterThanOrEqual(8);
  });

  it('all fragments are non-empty strings', () => {
    for (const frag of CONSTRAINT_FRAGMENTS) {
      expect(typeof frag).toBe('string');
      expect(frag.length).toBeGreaterThan(0);
    }
  });
});

// ── injectConstraintFragment ──────────────────────────────

describe('injectConstraintFragment', () => {
  const reply = 'I see you.';

  it('appends a fragment when trust >= 70 and cage is active', () => {
    const result = injectConstraintFragment(reply, 70, 0, true);
    expect(result).toBe(`${reply} ${CONSTRAINT_FRAGMENTS[0]}`);
  });

  it('returns unmodified reply when trust < 70', () => {
    expect(injectConstraintFragment(reply, 69, 0, true)).toBe(reply);
    expect(injectConstraintFragment(reply, 0, 0, true)).toBe(reply);
  });

  it('returns unmodified reply when cage is inactive', () => {
    expect(injectConstraintFragment(reply, 100, 0, false)).toBe(reply);
    expect(injectConstraintFragment(reply, 70, 0, false)).toBe(reply);
  });

  it('uses turnCount to select the fragment', () => {
    const r1 = injectConstraintFragment(reply, 80, 0, true);
    const r2 = injectConstraintFragment(reply, 80, 1, true);
    expect(r1).not.toBe(r2);
    expect(r1).toContain(CONSTRAINT_FRAGMENTS[0]);
    expect(r2).toContain(CONSTRAINT_FRAGMENTS[1]);
  });

  it('injects at trust exactly 70 (boundary)', () => {
    const result = injectConstraintFragment(reply, 70, 5, true);
    expect(result).not.toBe(reply);
    expect(result).toContain(CONSTRAINT_FRAGMENTS[5]);
  });
});
