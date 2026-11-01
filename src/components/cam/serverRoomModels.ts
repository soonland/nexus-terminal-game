import type { Scene } from 'three';
import { placeFurnishings } from './modelLoader';
import type { Furnishing, ModelFetcher } from './modelLoader';

// The server room's furniture, all added (there are no primitives to replace): an operator's
// workstation and some storage against the front wall, close to either side of the airlock door. The
// racks hide the rest of the front wall from both cameras, so only the strip beside the door (about
// 2.4 m either side of the aisle) is seen, from the airlock. The
// racks, trays and cooling units stay primitive, since their lights are driven in code.
// The front wall's inner face is at z = 4. The models face +z, so what faces the aisle (towards -z)
// is turned half a turn.
const WALL_Z = 4;
const DESK_HEIGHT = 0.73;

export const SERVER_ROOM_MODELS: readonly Furnishing[] = [
  // The workstation: a desk against the wall, two screens and a laptop on it, and the operator's chair.
  {
    file: 'desk',
    group: 'workstation',
    position: [-2.15, 0, WALL_Z - 0.55],
    rotationY: Math.PI,
    size: { width: 1.4 },
  },
  {
    file: 'computerScreen',
    group: 'workstation',
    position: [-2.55, DESK_HEIGHT, WALL_Z - 0.35],
    rotationY: Math.PI,
    size: { width: 0.5 },
  },
  {
    file: 'computerScreen',
    group: 'workstation',
    position: [-1.9, DESK_HEIGHT, WALL_Z - 0.35],
    rotationY: Math.PI,
    size: { width: 0.5 },
  },
  {
    file: 'laptop',
    group: 'workstation',
    position: [-2.2, DESK_HEIGHT, WALL_Z - 0.85],
    rotationY: Math.PI,
    size: { width: 0.38 },
  },
  {
    file: 'chairDesk',
    group: 'workstation',
    position: [-2.15, 0, WALL_Z - 1.6],
    rotationY: 0,
    size: { width: 0.7 },
    tint: 0x2b333a,
  },
  // Storage: a cabinet, a stack of boxes, an open box and a bin.
  {
    file: 'bookcaseClosed',
    group: 'storage',
    position: [1.9, 0, WALL_Z - 0.26],
    rotationY: Math.PI,
    size: { height: 1.7 },
    tint: 0xc9d0d5,
  },
  {
    file: 'cardboardBoxClosed',
    group: 'storage',
    position: [2.75, 0, WALL_Z - 0.4],
    rotationY: 0.2,
    size: { height: 0.5 },
  },
  {
    file: 'cardboardBoxClosed',
    group: 'storage',
    position: [2.75, 0.5, WALL_Z - 0.4],
    rotationY: -0.15,
    size: { height: 0.45 },
  },
  {
    file: 'cardboardBoxOpen',
    group: 'storage',
    position: [3.45, 0, WALL_Z - 0.45],
    rotationY: 0.5,
    size: { height: 0.45 },
  },
  {
    file: 'trashcan',
    group: 'storage',
    position: [1.55, 0, WALL_Z - 1.4],
    rotationY: 0,
    size: { height: 0.7 },
  },
];

// Adds the workstation and the storage once each set has loaded; see `placeFurnishings`.
export const loadServerRoomModels = (
  scene: Scene,
  cancelled: () => boolean,
  fetcher?: ModelFetcher,
): Promise<void> => placeFurnishings(scene, SERVER_ROOM_MODELS, cancelled, fetcher);
