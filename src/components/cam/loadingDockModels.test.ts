import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Group, PointLight, Raycaster, Vector3 } from 'three';
import { CAMERA_FEEDS } from '../../data/cameras';
import {
  DOCK_EDGE_Z,
  DOCK_HEIGHT,
  LOADING_DOCK_MODELS,
  loadLoadingDockModels,
} from './loadingDockModels';
import { furnitureUrl } from './modelLoader';
import type { ModelFetcher } from './modelLoader';
import { buildScene } from './scenes';
import { box } from './shapes';

const feed = CAMERA_FEEDS.find(f => f.id === 'loading-dock')!;

const cube: ModelFetcher = () => {
  const model = new Group();
  model.add(box(1, 1, 1, 0xffffff, 0.5, 0.5, 0.5));
  return Promise.resolve(model);
};

describe('the loading dock feed', () => {
  it('is on the ground floor and live with the lobby, at no trace cost', () => {
    const lobby = CAMERA_FEEDS.find(f => f.id === 'lobby-reception')!;
    expect(feed.floor).toBe('ground');
    expect(feed.unlockLayer).toBe(lobby.unlockLayer);
    expect(feed.offlineReason).toBeNull();
    expect(feed.traceCost).toBe(0);
  });

  it('is lit without point lights and has a roller door the camera can see', () => {
    const built = buildScene(feed);
    let points = 0;
    built.scene.traverse(o => {
      if (o instanceof PointLight) points += 1;
    });
    expect(points).toBe(0);
    built.scene.updateMatrixWorld(true);
    const door = new Vector3(0, 3, -7.9);
    const direction = door.clone().sub(built.camera.position).normalize();
    // Start just in front of the lens, clear of the camera's own housing.
    const origin = built.camera.position.clone().addScaledVector(direction, 0.6);
    const hits = new Raycaster(origin, direction, 0, origin.distanceTo(door) + 0.5)
      .intersectObjects(built.scene.children, true)
      .filter(h => h.object.type === 'Mesh');
    // Nothing stands between the camera and the door.
    expect(hits.at(0)?.point.z).toBeLessThan(-7.8);
  });

  it('offers its models after the first draw', () => {
    expect(buildScene(feed).load).toBeTypeOf('function');
  });
});

describe('loading dock models', () => {
  it('ships every model and the colormap beside it', () => {
    for (const m of LOADING_DOCK_MODELS) {
      const url = furnitureUrl(m);
      expect(existsSync(join(process.cwd(), 'public', url)), url).toBe(true);
      if (m.pack !== undefined) {
        const colormap = join(
          process.cwd(),
          'public/models/exterior',
          m.pack,
          'Textures/colormap.png',
        );
        expect(existsSync(colormap), m.pack).toBe(true);
      }
    }
  });

  it('backs the truck up to the dock and keeps the cargo on the dock or in the yard', () => {
    const truck = LOADING_DOCK_MODELS.find(m => m.file === 'delivery')!;
    expect(truck.position[2]).toBeGreaterThan(DOCK_EDGE_Z);
    expect(truck.rotationY).toBe(0);
    for (const m of LOADING_DOCK_MODELS.filter(m => m.group === 'dock-boxes')) {
      expect(m.position[1]).toBeGreaterThanOrEqual(DOCK_HEIGHT);
      expect(m.position[2]).toBeLessThan(DOCK_EDGE_Z);
    }
    for (const m of LOADING_DOCK_MODELS.filter(m => m.group === 'containers')) {
      expect(Math.abs(m.position[0])).toBeGreaterThan(9);
    }
  });

  it('adds every set once loaded, a failed one not at all, and nothing once stopped', async () => {
    const { scene } = buildScene(feed);
    const before = scene.children.length;
    await loadLoadingDockModels(scene, () => false, cube);
    expect(scene.children).toHaveLength(before + LOADING_DOCK_MODELS.length);

    const { scene: partial } = buildScene(feed);
    const flaky: ModelFetcher = url =>
      url.includes('shipping-container') ? Promise.reject(new Error('404')) : cube(url);
    await loadLoadingDockModels(partial, () => false, flaky);
    const containers = LOADING_DOCK_MODELS.filter(m => m.group === 'containers').length;
    expect(partial.children).toHaveLength(before + LOADING_DOCK_MODELS.length - containers);

    const { scene: stopped } = buildScene(feed);
    await loadLoadingDockModels(stopped, () => true, cube);
    expect(stopped.children).toHaveLength(before);
  });
});
