import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene } from 'three';
import type { Object3D } from 'three';

const loadAsync = vi.fn<(url: string) => Promise<{ scene: Object3D }>>();

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    loadAsync = loadAsync;
  },
}));

const model = (): Group => {
  const group = new Group();
  group.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
  return group;
};

// The shared fetcher lives in module state, so each test gets a fresh copy of the module.
const loadModule = async () => {
  vi.resetModules();
  return import('./modelLoader');
};

describe('modelFetcher', () => {
  beforeEach(() => {
    loadAsync.mockReset();
    loadAsync.mockImplementation(() => Promise.resolve({ scene: model() }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the same fetcher on every call', async () => {
    const { modelFetcher } = await loadModule();
    expect(await modelFetcher()).toBe(await modelFetcher());
  });

  it('loads each url once across feeds', async () => {
    const { modelFetcher } = await loadModule();
    const first = await (await modelFetcher())('a.glb');
    const second = await (await modelFetcher())('a.glb');
    await (
      await modelFetcher()
    )('b.glb');
    expect(second).toBe(first);
    expect(loadAsync.mock.calls.map(([url]) => url)).toEqual(['a.glb', 'b.glb']);
  });

  it('places furnishings in a second scene without loading again', async () => {
    const { placeFurnishings } = await loadModule();
    const models = [
      { file: 'desk', group: 'kit', position: [0, 0, 0], rotationY: 0, size: { width: 1 } },
    ] as const;
    const first = new Scene();
    const second = new Scene();
    await placeFurnishings(first, models, () => false);
    await placeFurnishings(second, models, () => false);
    expect(loadAsync).toHaveBeenCalledTimes(1);
    expect(first.children).toHaveLength(1);
    expect(second.children).toHaveLength(1);
  });

  it('tries a failed url again on the next request', async () => {
    const { modelFetcher } = await loadModule();
    loadAsync.mockRejectedValueOnce(new Error('offline'));
    const fetchModel = await modelFetcher();
    await expect(fetchModel('a.glb')).rejects.toThrow('offline');
    await expect(fetchModel('a.glb')).resolves.toBeDefined();
    expect(loadAsync).toHaveBeenCalledTimes(2);
  });

  it('keeps the cached model usable after a feed disposes its copy', async () => {
    const { modelFetcher, disposeObject } = await loadModule();
    const fetchModel = await modelFetcher();
    const source = await fetchModel('a.glb');
    disposeObject(source.clone());
    const again = (await fetchModel('a.glb')).clone();
    let meshes = 0;
    again.traverse(o => {
      if (o instanceof Mesh) {
        meshes += 1;
        expect((o.geometry as BoxGeometry).attributes.position.count).toBeGreaterThan(0);
      }
    });
    expect(meshes).toBe(1);
  });
});
