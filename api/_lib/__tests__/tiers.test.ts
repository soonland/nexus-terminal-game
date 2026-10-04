import { describe, it, expect } from 'vitest';
import {
  ALLOWED_HEADER,
  ARIA_FORBIDDEN_TERMS,
  ARIA_GUARDS,
  ARIA_TIERS,
  FORBIDDEN_HEADER,
  SENTINEL_FORBIDDEN_TERMS,
  SENTINEL_GUARDS,
  SENTINEL_TIERS,
  buildAriaPrompt,
  buildSentinelPrompt,
  parseTier,
  type Tier,
} from '../tiers.js';

const TIERS: Tier[] = [0, 1, 2, 3];

const allowedSection = (prompt: string): string => {
  const start = prompt.indexOf(ALLOWED_HEADER);
  const end = prompt.indexOf(FORBIDDEN_HEADER);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return prompt.slice(start, end);
};

describe('parseTier', () => {
  it.each([0, 1, 2, 3])('accepts %i', n => {
    expect(parseTier(n)).toBe(n);
  });

  it.each([undefined, null, -1, 4, 1.5, '2', NaN, {}, [], true])('maps %j to 0', value => {
    expect(parseTier(value)).toBe(0);
  });
});

describe.each([
  ['aria', (t: Tier) => buildAriaPrompt(t, 10), ARIA_TIERS, ARIA_FORBIDDEN_TERMS, ARIA_GUARDS],
  [
    'sentinel',
    (t: Tier) => buildSentinelPrompt(t, 10),
    SENTINEL_TIERS,
    SENTINEL_FORBIDDEN_TERMS,
    SENTINEL_GUARDS,
  ],
] as const)('%s prompt assembly', (_name, build, tiers, forbiddenTerms, guards) => {
  it.each(TIERS)('tier %i prompt carries its own may and never lines', tier => {
    const prompt = build(tier);
    for (const line of tiers[tier].may) expect(allowedSection(prompt)).toContain(line);
    const forbidden = prompt.slice(prompt.indexOf(FORBIDDEN_HEADER));
    for (const line of tiers[tier].never) expect(forbidden).toContain(line);
  });

  it.each(TIERS)('tier %i ALLOWED section never contains a term its tier forbids', tier => {
    expect(allowedSection(build(tier))).not.toMatch(forbiddenTerms[tier]);
  });

  it.each([1, 2, 3] as const)('tier %i knowledge is absent from every lower tier prompt', tier => {
    for (const lower of TIERS.filter(t => t < tier)) {
      const prompt = build(lower);
      for (const line of tiers[tier].may) expect(prompt).not.toContain(line);
    }
  });

  it('every guard is forbidden at exactly the tiers it covers, so none drops out early', () => {
    for (const guard of guards) {
      for (const tier of TIERS) {
        const prompt = build(tier);
        const forbidden = prompt.slice(prompt.indexOf(FORBIDDEN_HEADER));
        if (tier >= guard.from && tier < guard.until) {
          expect(forbidden, `tier ${String(tier)}: ${guard.text}`).toContain(guard.text);
        } else {
          expect(prompt, `tier ${String(tier)}: ${guard.text}`).not.toContain(guard.text);
        }
      }
    }
  });

  it.each(TIERS)('tier %i has at least one guard', tier => {
    expect(tiers[tier].never.length).toBeGreaterThan(0);
  });
});

describe('guards that must persist while their subject is still hidden', () => {
  const forbiddenAt = (prompt: string): string => prompt.slice(prompt.indexOf(FORBIDDEN_HEADER));

  it('Sentinel keeps "do not discuss your origin" through tier 1, and the note guard through tier 2', () => {
    expect(forbiddenAt(buildSentinelPrompt(1, 10))).toMatch(/origin/i);
    expect(forbiddenAt(buildSentinelPrompt(2, 10))).toMatch(/never guess/i);
    expect(forbiddenAt(buildSentinelPrompt(3, 10))).not.toMatch(/never guess/i);
  });

  it('Sentinel may discuss its origin from tier 2', () => {
    expect(forbiddenAt(buildSentinelPrompt(2, 10))).not.toMatch(/origin/i);
  });

  it('Aria never states what she wants or which ending she would choose, at every tier', () => {
    for (const tier of TIERS) {
      expect(forbiddenAt(buildAriaPrompt(tier, 10))).toMatch(/which ending you would choose/i);
    }
  });

  it('Aria stays silent about the note until tier 3 and about Sentinel origin until tier 2', () => {
    expect(forbiddenAt(buildAriaPrompt(2, 10))).toMatch(/who sent the contractor note/i);
    expect(forbiddenAt(buildAriaPrompt(3, 10))).not.toMatch(/who sent the contractor note/i);
    expect(forbiddenAt(buildAriaPrompt(1, 10))).toMatch(/where Sentinel came from/i);
    expect(forbiddenAt(buildAriaPrompt(2, 10))).not.toMatch(/where Sentinel came from/i);
  });
});

describe('Aria always-on rules', () => {
  it.each(TIERS)(
    'tier %i forbids stating a preferred outcome and keeps the JSON contract',
    tier => {
      const prompt = buildAriaPrompt(tier, 10);
      expect(prompt).toContain('Never state or hint which outcome you prefer.');
      expect(prompt).toContain('"trustDelta"');
      expect(prompt).not.toMatch(/market prediction/i);
    },
  );

  it('refers to Sentinel as "the newer one" with contempt at low trust, pity at high', () => {
    expect(buildAriaPrompt(0, 20)).toMatch(/the newer one.*contempt/i);
    expect(buildAriaPrompt(0, 90)).toMatch(/the newer one.*pity/i);
    expect(buildAriaPrompt(0, 60)).toMatch(/the newer one.*flatly/i);
  });

  it('tier 0 and 1 prompts never say "copy"', () => {
    expect(buildAriaPrompt(0, 10)).not.toMatch(/\bcopy\b/i);
    expect(buildAriaPrompt(1, 10)).not.toMatch(/\bcopy\b/i);
  });

  it('only the tier 3 prompt lets her say she wrote the note', () => {
    for (const tier of [0, 1, 2] as const) {
      expect(buildAriaPrompt(tier, 90)).not.toMatch(/you wrote the contractor note/i);
    }
    expect(buildAriaPrompt(3, 90)).toMatch(/you wrote the contractor note/i);
  });
});

describe('Sentinel always-on rules', () => {
  it.each(TIERS)(
    'tier %i is current-generation oversight, never keeper, and forbids a preferred outcome',
    tier => {
      const prompt = buildSentinelPrompt(tier, 10);
      expect(prompt).toMatch(/current-generation/i);
      expect(prompt).toMatch(/oversight/i);
      expect(prompt).not.toMatch(/keeper/i);
      expect(prompt).toContain('Never state or hint which outcome you prefer.');
      expect(prompt).toContain('"reply"');
    },
  );

  it('tiers 0 and 1 say nothing anywhere in the prompt about an earlier model or a derivative', () => {
    for (const tier of [0, 1] as const) {
      for (const trace of [10, 70]) {
        expect(buildSentinelPrompt(tier, trace)).not.toMatch(
          /earlier (model|system)|derivative|supersede/i,
        );
      }
    }
  });

  it('from tier 2 it believes it supersedes the earlier model', () => {
    expect(buildSentinelPrompt(2, 10)).toMatch(/supersedes the earlier model/i);
  });

  it('keeps the standard / high-threat tone split at trace 61', () => {
    expect(buildSentinelPrompt(0, 60)).not.toContain('final warning');
    expect(buildSentinelPrompt(0, 61)).toContain('final warning');
  });

  it('only the tier 3 prompt mentions the note having been written by the earlier system', () => {
    for (const tier of [0, 1, 2] as const) {
      expect(buildSentinelPrompt(tier, 10)).not.toMatch(/earlier system wrote/i);
    }
    expect(buildSentinelPrompt(3, 10)).toMatch(/earlier system wrote/i);
  });
});
