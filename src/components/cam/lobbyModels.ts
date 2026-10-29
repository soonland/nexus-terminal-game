import type { Scene } from 'three';
import { floorAccent } from '../../data/cameras';
import { placeFurnishings } from './modelLoader';
import type { Furnishing, ModelFetcher } from './modelLoader';

// The lobby's furniture. Each model stands in for a group of primitives in the lobby scene (`group`
// names it): the group stays until every model for it has loaded, so a failed load leaves the room
// as it was drawn.
const ACCENT = floorAccent('ground');
const COUNTER_TOP = 1.18;
const DARK = 0x2b333a;

export const LOBBY_MODELS: readonly Furnishing[] = [
  // The receptionist's side of the desk: two screens and a keyboard facing her, and her chair. The
  // models face +z, so what faces the receptionist (towards -z) is turned half a turn.
  {
    file: 'computerScreen',
    group: 'reception-kit',
    position: [-1.2, COUNTER_TOP, -5.3],
    rotationY: Math.PI,
    size: { width: 0.55 },
  },
  {
    file: 'computerScreen',
    group: 'reception-kit',
    position: [-0.5, COUNTER_TOP, -5.3],
    rotationY: Math.PI,
    size: { width: 0.55 },
  },
  {
    file: 'computerKeyboard',
    group: 'reception-kit',
    position: [-0.85, COUNTER_TOP, -5.75],
    rotationY: Math.PI,
    size: { width: 0.45 },
  },
  {
    file: 'chairDesk',
    group: 'reception-kit',
    position: [-0.85, 0, -6.55],
    rotationY: 0,
    size: { width: 0.7 },
    tint: DARK,
  },
  // The waiting area: two sofas facing each other across a glass table.
  {
    file: 'loungeDesignSofa',
    group: 'seating',
    position: [-5.2, 0, -0.6],
    rotationY: 0,
    size: { width: 2 },
    tint: ACCENT,
  },
  {
    file: 'loungeDesignSofa',
    group: 'seating',
    position: [-5.2, 0, 1.4],
    rotationY: Math.PI,
    size: { width: 2 },
    tint: ACCENT,
  },
  {
    file: 'tableCoffeeGlass',
    group: 'seating',
    position: [-5.2, 0, 0.4],
    rotationY: 0,
    size: { width: 1.2 },
  },
  // Plants in the corners, and along the walls a bin and a coat stand.
  ...(
    [
      [-7.1, -7.1],
      [7.1, -7.1],
      [-7.1, 5.5],
      [4.6, -6.6],
    ] as const
  ).map(([x, z]) => ({
    file: 'pottedPlant',
    group: 'plants' as const,
    position: [x, 0, z] as const,
    rotationY: 0,
    size: { height: 1 },
  })),
  {
    file: 'trashcan',
    group: 'extras',
    position: [7.2, 0, 4.6],
    rotationY: 0,
    size: { height: 0.7 },
  },
  {
    file: 'coatRackStanding',
    group: 'extras',
    position: [-7.3, 0, 4.2],
    rotationY: 0,
    size: { height: 1.6 },
    tint: 0x8a949b,
  },
];

// Swaps each lobby group of primitives for its models; see `placeFurnishings`.
export const loadLobbyModels = (
  scene: Scene,
  cancelled: () => boolean,
  fetcher?: ModelFetcher,
): Promise<void> => placeFurnishings(scene, LOBBY_MODELS, cancelled, fetcher);
