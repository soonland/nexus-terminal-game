import { describe, it, expect } from 'vitest';
import {
  ALLOWED_HEADER,
  ARIA_FORBIDDEN_TERMS,
  ARIA_TIERS,
  FORBIDDEN_HEADER,
  SENTINEL_FORBIDDEN_TERMS,
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
  ['aria', (t: Tier) => buildAriaPrompt(t, 10), ARIA_TIERS, ARIA_FORBIDDEN_TERMS],
  ['sentinel', (t: Tier) => buildSentinelPrompt(t, 10), SENTINEL_TIERS, SENTINEL_FORBIDDEN_TERMS],
] as const)('%s prompt assembly', (_name, build, tiers, forbiddenTerms) => {
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

  it('a lower tier never gains the previous tier forbidden list', () => {
    expect(build(3)).not.toContain(tiers[0].never[0]);
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
    'tier %i uses supersedes/oversight, never keeper, and forbids a preferred outcome',
    tier => {
      const prompt = buildSentinelPrompt(tier, 10);
      expect(prompt).toMatch(/supersedes/i);
      expect(prompt).toMatch(/oversight/i);
      expect(prompt).not.toMatch(/keeper/i);
      expect(prompt).toContain('Never state or hint which outcome you prefer.');
      expect(prompt).toContain('"reply"');
    },
  );

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
