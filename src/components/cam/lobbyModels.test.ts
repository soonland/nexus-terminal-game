import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Box3, Group, Mesh } from 'three';
import type { MeshStandardMaterial } from 'three';
import { buildScene } from './scenes';
import { LOBBY_MODELS, loadLobbyModels } from './lobbyModels';
import { fitted, furnitureUrl, tint } from './modelLoader';
import type { ModelFetcher } from './modelLoader';
import { box } from './shapes';

const PUBLIC = join(process.cwd(), 'public');

describe('lobby models', () => {
  it('ships every model it names', () => {
    for (const m of LOBBY_MODELS) {
      const url = furnitureUrl(m);
      expect(existsSync(join(PUBLIC, url)), url).toBe(true);
    }
  });

  it('stands every model inside the room, 16 m square', () => {
    for (const m of LOBBY_MODELS) {
      expect(Math.abs(m.position[0]), m.file).toBeLessThan(7.9);
      expect(Math.abs(m.position[2]), m.file).toBeLessThan(7.9);
    }
  });

  it('replaces only groups the lobby actually builds', () => {
    const scene = buildScene({ scene: 'lobby', mount: 0 }).scene;
    for (const name of new Set(LOBBY_MODELS.map(m => m.group))) {
      const group = scene.getObjectByName(name);
      expect(group, name).toBeInstanceOf(Group);
      expect((group as Group).children.length, name).toBeGreaterThan(0);
    }
  });

  // A stand-in for the glTF loader: every model is a 1 m cube.
  const cube: ModelFetcher = () => {
    const model = new Group();
    model.add(box(1, 1, 1, 0xffffff, 0.5, 0.5, 0.5));
    return Promise.resolve(model);
  };

  it('swaps each group of primitives for its models once they have all loaded', async () => {
    const { scene } = buildScene({ scene: 'lobby', mount: 0 });
    await loadLobbyModels(scene, () => false, cube);
    for (const name of new Set(LOBBY_MODELS.map(m => m.group))) {
      expect(scene.getObjectByName(name), name).toBeUndefined();
    }
    // Each model stands where it was told to, turned as it was told to.
    for (const m of LOBBY_MODELS) {
      const [x, y, z] = m.position;
      expect(
        scene.children.some(
          c =>
            c.position.x === x &&
            c.position.y === y &&
            c.position.z === z &&
            c.rotation.y === m.rotationY,
        ),
        `${m.file} at ${String(x)},${String(z)}`,
      ).toBe(true);
    }
  });

  it('keeps a group of primitives when any one of its models fails to load', async () => {
    const { scene } = buildScene({ scene: 'lobby', mount: 0 });
    const flaky: ModelFetcher = url =>
      url.includes('loungeDesignSofa') ? Promise.reject(new Error('404')) : cube(url);
    await loadLobbyModels(scene, () => false, flaky);
    expect(scene.getObjectByName('seating')).toBeDefined();
    expect(scene.getObjectByName('reception-kit')).toBeUndefined();
  });

  it('adds nothing, and keeps the primitives, when the feed has already stopped', async () => {
    const { scene } = buildScene({ scene: 'lobby', mount: 0 });
    const before = scene.children.length;
    await loadLobbyModels(scene, () => true, cube);
    expect(scene.children).toHaveLength(before);
    expect(scene.getObjectByName('seating')).toBeDefined();
  });
});

describe('model helpers', () => {
  it('fits a model to a width on the floor, centred on its footprint', () => {
    const source = new Group();
    source.add(box(2, 1, 4, 0xffffff, 5, 3, 7));
    const holder = fitted(source, { width: 1 });
    holder.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(holder);
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(1);
    expect(bounds.min.y).toBeCloseTo(0);
    expect((bounds.min.x + bounds.max.x) / 2).toBeCloseTo(0);
    expect((bounds.min.z + bounds.max.z) / 2).toBeCloseTo(0);
  });

  it('fits a model to a height', () => {
    const source = new Group();
    source.add(box(1, 2, 1, 0xffffff, 0, 0, 0));
    const holder = fitted(source, { height: 1 });
    holder.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(holder);
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(1);
  });

  it('tints a copy and leaves the original material alone', () => {
    const source = new Group();
    const mesh = box(1, 1, 1, 0x112233, 0, 0, 0);
    source.add(mesh);
    const copy = fitted(source, { width: 1 });
    tint(copy, 0xabcdef);
    const colours: number[] = [];
    copy.traverse(o => {
      if (o instanceof Mesh) colours.push((o.material as MeshStandardMaterial).color.getHex());
    });
    expect(colours).toEqual([0xabcdef]);
    expect((mesh.material as MeshStandardMaterial).color.getHex()).toBe(0x112233);
  });
});
