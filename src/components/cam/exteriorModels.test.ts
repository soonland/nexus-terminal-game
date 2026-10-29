import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import {
  EXTERIOR_MODELS,
  TRAFFIC,
  TRAFFIC_SPAN,
  exteriorModelUrl,
  loadExteriorModels,
  trafficX,
} from './exteriorModels';

const PUBLIC = join(process.cwd(), 'public');

describe('exterior models', () => {
  it('ships every model and the colormap it reads', () => {
    for (const m of [...EXTERIOR_MODELS, ...TRAFFIC]) {
      const url = exteriorModelUrl(m);
      expect(existsSync(join(PUBLIC, url)), url).toBe(true);
      expect(existsSync(join(PUBLIC, 'models/exterior', m.pack, 'Textures/colormap.png'))).toBe(
        true,
      );
    }
  });

  it('keeps every model on the near side of the far sky and off the camera', () => {
    for (const m of EXTERIOR_MODELS) {
      expect(Math.abs(m.position[0])).toBeLessThan(60);
      expect(m.position[2]).toBeGreaterThan(-12);
      expect(m.position[2]).toBeLessThan(30);
    }
  });

  it('adds nothing when the feed has already stopped', async () => {
    const scene = new Scene();
    await loadExteriorModels(
      scene,
      () => true,
      () => undefined,
    );
    expect(scene.children).toHaveLength(0);
  });

  describe('traffic', () => {
    it('drives along x in both directions and stays inside the loop', () => {
      expect(TRAFFIC.some(v => v.speed > 0)).toBe(true);
      expect(TRAFFIC.some(v => v.speed < 0)).toBe(true);
      for (const v of TRAFFIC) {
        for (const t of [0, 1, 7.3, 60, 600, 12345.6]) {
          expect(Math.abs(trafficX(v, t))).toBeLessThanOrEqual(TRAFFIC_SPAN / 2);
        }
        expect(trafficX(v, 1)).not.toBeCloseTo(trafficX(v, 0));
      }
    });

    it('wraps round the loop, a lane at a time, without two vehicles sharing a spot', () => {
      for (const v of TRAFFIC) {
        expect(trafficX(v, TRAFFIC_SPAN / Math.abs(v.speed))).toBeCloseTo(trafficX(v, 0));
      }
      for (const a of TRAFFIC) {
        for (const b of TRAFFIC) {
          if (a === b || a.lane !== b.lane) continue;
          expect(Math.abs(a.x0 - b.x0)).toBeGreaterThan(10);
        }
      }
    });

    it('keeps its lanes clear of the parked cars on the near kerb', () => {
      const parked = Math.max(
        ...EXTERIOR_MODELS.filter(m => m.pack === 'cars').map(m => m.position[2]),
      );
      for (const v of TRAFFIC) expect(v.lane).toBeGreaterThan(parked + 2);
    });
  });
});
