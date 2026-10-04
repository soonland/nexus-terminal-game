import { describe, it, expect } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { aimCamera, panAngle, panPhase, pickMount } from './pan';
import type { Mount } from './pan';

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

const MOUNT: Mount = {
  position: [0, 2, 5],
  heading: 0,
  range: 0.5,
  sweep: SWEEP,
  hold: HOLD,
  offset: 0,
};

describe('aimCamera', () => {
  it('turns the view without moving the camera', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(...MOUNT.position);
    aimCamera(camera, 0, MOUNT);
    const from = camera.getWorldDirection(new Vector3()).x;
    aimCamera(camera, SWEEP, MOUNT);
    expect(camera.getWorldDirection(new Vector3()).x).toBeGreaterThan(from);
    expect(camera.position.toArray()).toEqual([0, 2, 5]);
  });

  it('looks back down +z when the heading is a half turn', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 2, -10);
    aimCamera(camera, SWEEP / 2, { ...MOUNT, position: [0, 2, -10], heading: Math.PI });
    expect(camera.getWorldDirection(new Vector3()).z).toBeGreaterThan(0.9);
  });
});

describe('pickMount', () => {
  const second: Mount = { ...MOUNT, heading: 1 };
  it('returns the mount at the index, and the first for an unknown index', () => {
    expect(pickMount([MOUNT, second], 1)).toBe(second);
    expect(pickMount([MOUNT, second], 7)).toBe(MOUNT);
  });
});
