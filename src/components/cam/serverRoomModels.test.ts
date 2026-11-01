import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { furnitureUrl } from './modelLoader';
import type { ModelFetcher } from './modelLoader';
import { buildScene } from './scenes';
import { SERVER_ROOM_MODELS, loadServerRoomModels } from './serverRoomModels';
import { box } from './shapes';

const cube: ModelFetcher = () => {
  const model = new Group();
  model.add(box(1, 1, 1, 0xffffff, 0.5, 0.5, 0.5));
  return Promise.resolve(model);
};

describe('server room models', () => {
  it('ships every model it names', () => {
    for (const m of SERVER_ROOM_MODELS) {
      const url = furnitureUrl(m);
      expect(existsSync(join(process.cwd(), 'public', url)), url).toBe(true);
    }
  });

  it('stands everything against the front wall, beside the airlock door, where the airlock camera can see', () => {
    for (const m of SERVER_ROOM_MODELS) {
      const [x, , z] = m.position;
      expect(z, m.file).toBeGreaterThan(2.3);
      expect(z, m.file).toBeLessThan(4);
      // The racks end at z = -1 and the airlock door spans x = -1.15..1.15.
      expect(Math.abs(x), m.file).toBeGreaterThan(1.4);
      expect(Math.abs(x), m.file).toBeLessThan(3.6);
    }
  });

  it('offers its models after the first draw', () => {
    expect(buildScene({ scene: 'serverRoom', mount: 0 }).load).toBeTypeOf('function');
  });

  it('adds both sets once they load, without removing anything from the room', async () => {
    const { scene } = buildScene({ scene: 'serverRoom', mount: 0 });
    const before = scene.children.length;
    await loadServerRoomModels(scene, () => false, cube);
    expect(scene.children).toHaveLength(before + SERVER_ROOM_MODELS.length);
  });

  it('adds nothing of a set when any of its models fails, and nothing once stopped', async () => {
    const { scene } = buildScene({ scene: 'serverRoom', mount: 0 });
    const before = scene.children.length;
    const flaky: ModelFetcher = url =>
      url.includes('laptop') ? Promise.reject(new Error('404')) : cube(url);
    await loadServerRoomModels(scene, () => false, flaky);
    const storage = SERVER_ROOM_MODELS.filter(m => m.group === 'storage').length;
    expect(scene.children).toHaveLength(before + storage);
    const { scene: stopped } = buildScene({ scene: 'serverRoom', mount: 0 });
    await loadServerRoomModels(stopped, () => true, cube);
    expect(stopped.children).toHaveLength(before);
  });
});
