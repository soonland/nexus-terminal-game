import type { Scene } from 'three';
import { placeFurnishings } from './modelLoader';
import type { Furnishing, ModelFetcher } from './modelLoader';

// The loading dock's vehicles and cargo, all added on top of the primitive yard: a delivery truck
// backed up to the roller door, shipping containers stacked at the far side of the yard (the camera is on the near side, so they
// stay out of its way), and boxes waiting on the dock.
// The dock platform's edge is at z = -6.4 and its top at y = 1.2. The models face +z, so a truck
// at rotation 0 has its back to the door.
export const DOCK_EDGE_Z = -6.4;
export const DOCK_HEIGHT = 1.2;

export const LOADING_DOCK_MODELS: readonly Furnishing[] = [
  {
    pack: 'cars',
    file: 'delivery',
    group: 'truck',
    position: [0, 0, DOCK_EDGE_Z + 2.8],
    rotationY: 0,
    size: { width: 2.5 },
  },
  {
    pack: 'industrial',
    file: 'shipping-container-a',
    group: 'containers',
    position: [-11.5, 0, -3.5],
    rotationY: 0,
    size: { height: 2.6 },
  },
  {
    pack: 'industrial',
    file: 'shipping-container-b',
    group: 'containers',
    position: [-11.5, 2.6, -3.5],
    rotationY: 0.04,
    size: { height: 2.6 },
  },
  {
    pack: 'industrial',
    file: 'shipping-container-b',
    group: 'containers',
    position: [-11.2, 0, 3.4],
    rotationY: 0.08,
    size: { height: 2.6 },
  },
  {
    file: 'cardboardBoxClosed',
    group: 'dock-boxes',
    position: [-3.8, DOCK_HEIGHT, -7.2],
    rotationY: 0.2,
    size: { height: 0.55 },
  },
  {
    file: 'cardboardBoxClosed',
    group: 'dock-boxes',
    position: [-3.8, DOCK_HEIGHT + 0.55, -7.2],
    rotationY: -0.15,
    size: { height: 0.5 },
  },
  {
    file: 'cardboardBoxClosed',
    group: 'dock-boxes',
    position: [-4.6, DOCK_HEIGHT, -7.1],
    rotationY: 0.4,
    size: { height: 0.5 },
  },
  {
    file: 'cardboardBoxOpen',
    group: 'dock-boxes',
    position: [4.2, DOCK_HEIGHT, -7.2],
    rotationY: 0.3,
    size: { height: 0.5 },
  },
];

// Adds each set once all of its models have loaded; see `placeFurnishings`.
export const loadLoadingDockModels = (
  scene: Scene,
  cancelled: () => boolean,
  fetcher?: ModelFetcher,
): Promise<void> => placeFurnishings(scene, LOADING_DOCK_MODELS, cancelled, fetcher);
