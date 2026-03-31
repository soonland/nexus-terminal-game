// mulberry32 — fast, seedable, 32-bit PRNG, uniform distribution in [0, 1).
// Reference: https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32
export const createPRNG = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return (): number => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
