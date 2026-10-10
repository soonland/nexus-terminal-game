import { describe, it, expect } from 'vitest';
import { MAX_K, MIN_K, centreOn, fitView, isVisible, panBy, zoomAt } from './mapView';

describe('mapView', () => {
  it('zoomAt keeps the point under the cursor fixed', () => {
    const v = { x: 10, y: 20, k: 1 };
    const next = zoomAt(v, 2, 100, 80);
    // world point under (100, 80) before: ((100-10)/1, (80-20)/1) = (90, 60)
    expect(90 * next.k + next.x).toBeCloseTo(100);
    expect(60 * next.k + next.y).toBeCloseTo(80);
    expect(next.k).toBe(2);
  });

  it('zoomAt clamps the scale', () => {
    expect(zoomAt({ x: 0, y: 0, k: 1 }, 100, 0, 0).k).toBe(MAX_K);
    expect(zoomAt({ x: 0, y: 0, k: 1 }, 0.0001, 0, 0).k).toBe(MIN_K);
  });

  it('panBy moves the translation', () => {
    expect(panBy({ x: 1, y: 2, k: 1.5 }, 10, -4)).toEqual({ x: 11, y: -2, k: 1.5 });
  });

  it('fitView shrinks big content into the box and centres it', () => {
    const v = fitView({ w: 2000, h: 1000 }, { w: 1000, h: 500 }, 0);
    expect(v.k).toBeCloseTo(0.5);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(0);
  });

  it('fitView never zooms in past 1.5 and centres small content', () => {
    const v = fitView({ w: 100, h: 100 }, { w: 1000, h: 1000 }, 0);
    expect(v.k).toBe(1.5);
    expect(v.x).toBeCloseTo((1000 - 150) / 2);
    expect(v.y).toBeCloseTo((1000 - 150) / 2);
  });

  it('fitView survives empty content and an empty box', () => {
    expect(fitView({ w: 0, h: 0 }, { w: 0, h: 0 })).toEqual({ x: 0, y: 0, k: 1 });
  });

  it('isVisible honours the margin', () => {
    const v = { x: 0, y: 0, k: 1 };
    const box = { w: 100, h: 100 };
    expect(isVisible(v, { x: 50, y: 50 }, box)).toBe(true);
    expect(isVisible(v, { x: 99, y: 50 }, box, 20)).toBe(false);
    expect(isVisible(v, { x: -5, y: 50 }, box, 0)).toBe(false);
  });

  it('centreOn puts the point at the middle and keeps the scale', () => {
    const v = centreOn({ x: 0, y: 0, k: 2 }, { x: 100, y: 50 }, { w: 400, h: 200 });
    expect(v.k).toBe(2);
    expect(100 * v.k + v.x).toBeCloseTo(200);
    expect(50 * v.k + v.y).toBeCloseTo(100);
  });
});
