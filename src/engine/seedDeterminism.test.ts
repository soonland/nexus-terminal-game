import { describe, it, expect } from 'vitest';
import { createInitialState } from './state';

const shape = (seed: number) => {
  const s = createInitialState(seed);
  return Object.fromEntries(
    Object.entries(s.network.nodes).map(([id, n]) => [
      id,
      {
        ip: n?.ip,
        layer: n?.layer,
        connections: [...(n?.connections ?? [])].sort(),
        label: n?.label,
      },
    ]),
  );
};

describe('the same session seed rebuilds the same network', () => {
  it.each([1, 42, 12345, 987654321])('seed %i', seed => {
    expect(shape(seed)).toEqual(shape(seed));
  });

  it('a random seed also rebuilds identically (the seed is what a save stores)', () => {
    const s = createInitialState();
    const again = createInitialState(s.sessionSeed);
    expect(Object.keys(again.network.nodes).sort()).toEqual(Object.keys(s.network.nodes).sort());
    for (const [id, n] of Object.entries(s.network.nodes)) {
      expect(again.network.nodes[id]?.ip, id).toBe(n?.ip);
      expect([...(again.network.nodes[id]?.connections ?? [])].sort(), id).toEqual(
        [...(n?.connections ?? [])].sort(),
      );
    }
  });
});
