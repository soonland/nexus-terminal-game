import { Box3, Color, Group, Vector3 } from 'three';
import type { Material, Mesh, Object3D, Scene } from 'three';

const isMesh = (object: Object3D): object is Mesh => 'isMesh' in object && object.isMesh === true;

export type ModelFetcher = (url: string) => Promise<Object3D>;

// A glTF loader that fetches each url once; later asks for the same url share the result (callers
// clone it). three's loader is loaded lazily, so it stays out of the main bundle.
export const createModelFetcher = async (): Promise<ModelFetcher> => {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const loaded = new Map<string, Promise<Object3D>>();
  return url => {
    let pending = loaded.get(url);
    if (pending === undefined) {
      pending = loader.loadAsync(url).then(gltf => gltf.scene);
      loaded.set(url, pending);
    }
    return pending;
  };
};

export interface ModelSize {
  width?: number;
  height?: number;
}

// A copy of `source` scaled so its width (x) or height (y) is `size` metres, with its pivot at the
// centre of its footprint on the floor. Kenney models keep their origin at a corner, so fitting
// them this way lets callers place and turn them by where they stand.
export const fitted = (source: Object3D, size: ModelSize): Group => {
  const inner = source.clone();
  const bounds = new Box3().setFromObject(inner);
  const extent = bounds.getSize(new Vector3());
  const centre = bounds.getCenter(new Vector3());
  inner.position.set(-centre.x, -bounds.min.y, -centre.z);
  const holder = new Group();
  holder.add(inner);
  const scale =
    size.width !== undefined ? size.width / extent.x : (size.height ?? extent.y) / extent.y;
  holder.scale.setScalar(scale);
  return holder;
};

// Gives every mesh in `object` its own copy of its material in `colour`, so a model can wear the
// building's palette without changing the shared original.
export const tint = (object: Object3D, colour: number): void => {
  object.traverse(o => {
    if (!isMesh(o)) return;
    const recolour = (m: Material): Material => {
      const copy = m.clone();
      if ('color' in copy && copy.color instanceof Color) copy.color.setHex(colour);
      return copy;
    };
    o.material = Array.isArray(o.material) ? o.material.map(recolour) : recolour(o.material);
  });
};

// Frees the geometry and materials of a group the scene no longer shows.
export const disposeObject = (object: Object3D): void => {
  object.traverse(o => {
    if (!isMesh(o)) return;
    o.geometry.dispose();
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of materials) m.dispose();
  });
};

// A piece of furniture from the Kenney furniture kit (CC0), served from public/models/furniture/.
export interface Furnishing {
  file: string;
  // Another Kenney pack under public/models/exterior/<pack>/ (cars, industrial, ...); without it the
  // model comes from the furniture kit.
  pack?: string;
  // The named group in the scene it belongs to. If the scene has primitives under that name, the
  // models stand in for them; otherwise the models are simply added.
  group: string;
  // Where it stands: x, height of its base above the floor, z.
  position: readonly [number, number, number];
  // Turn about the vertical axis, in radians. The models face +z at 0.
  rotationY: number;
  size: ModelSize;
  tint?: number;
}

export const furnitureUrl = (m: Pick<Furnishing, 'file' | 'pack'>): string =>
  m.pack === undefined
    ? `${import.meta.env.BASE_URL}models/furniture/${m.file}.glb`
    : `${import.meta.env.BASE_URL}models/exterior/${m.pack}/${m.file}.glb`;

// Places each group of models once all of its models have arrived, removing the group of primitives
// of the same name if there is one. A group with a model that fails to load is left as it was, so a
// room never shows half a set. `cancelled` turns true when the feed is stopped, so nothing is added
// to a scene that has been disposed. `fetcher` is for tests.
export const placeFurnishings = async (
  scene: Scene,
  models: readonly Furnishing[],
  cancelled: () => boolean,
  fetcher?: ModelFetcher,
): Promise<void> => {
  const fetchModel = fetcher ?? (await createModelFetcher());
  const groups = [...new Set(models.map(m => m.group))];
  await Promise.allSettled(
    groups.map(async name => {
      const placed = await Promise.all(
        models
          .filter(m => m.group === name)
          .map(async m => {
            const model = fitted(await fetchModel(furnitureUrl(m)), m.size);
            if (m.tint !== undefined) tint(model, m.tint);
            model.position.set(...m.position);
            model.rotation.y = m.rotationY;
            return model;
          }),
      );
      if (cancelled()) return;
      const primitives = scene.getObjectByName(name);
      if (primitives !== undefined) {
        scene.remove(primitives);
        disposeObject(primitives);
      }
      for (const model of placed) scene.add(model);
    }),
  );
};
