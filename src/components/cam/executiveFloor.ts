import { PerspectiveCamera } from 'three';
import type { Scene } from 'three';
import { floorAccent } from '../../data/cameras';
import { aimCamera, pickMount } from './pan';
import type { Mount } from './pan';
import {
  ASPECT,
  CEILING_WHITE,
  WALL_WHITE,
  box,
  cylinder,
  floor,
  glass,
  glow,
  litBase,
  litRoom,
  sphere,
  tiledFloor,
  trim,
  wall,
  wallTrim,
} from './shapes';
import type { FeedScene } from './scenes';

// The executive floor's accent: gold.
const ACCENT = floorAccent('executive');
const WOOD = 0x6b4a32;
const DARK_WOOD = 0x5a3e2a;

const MOUNTS: readonly [Mount, ...Mount[]] = [
  // Corridor: from the elevator end, down the runner.
  { position: [0, 2.2, 5.5], heading: 0, range: 0.3, sweep: 10, hold: 3.5, offset: 4 },
  // Corner office: from the doorway, looking in at the desk and the window.
  { position: [0, 2.7, -10.2], heading: 0, range: 0.4, sweep: 9, hold: 3, offset: 0 },
];

// A long corridor: white walls with gold trim, a tiled floor with a gold runner, and a ceiling with
// light panels.
const addCorridor = (scene: Scene): void => {
  tiledFloor(scene, 5, 22, 0, -5, ACCENT);
  scene.add(wall(5, 3.6, 0.2, WALL_WHITE, 0, 1.8, 6)); // the elevator-end wall, behind the camera
  wallTrim(scene, ACCENT, 'x', 5, 5.9, 0, -1);
  for (const x of [-2.5, 2.5]) {
    scene.add(wall(0.2, 3.6, 22, WALL_WHITE, x, 1.8, -5));
    wallTrim(scene, ACCENT, 'z', 22, x * 0.96, -5, x < 0 ? 1 : -1);
  }
  const ceiling = floor(5, 22, CEILING_WHITE);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 3.6, -5);
  scene.add(ceiling);
  for (const z of [4, 0, -4, -8, -12]) {
    const panel = glow(1.2, 0.04, 0.4, 0xffffff, 0, 3.56, z);
    scene.add(panel);
  }
};

// Closed wooden doors in gold frames, with handles and nameplates, paintings, and side tables with
// vases.
const addDoors = (scene: Scene): void => {
  for (const side of [-1, 1]) {
    for (const z of [2, -1, -4, -7, -10]) {
      scene.add(box(0.08, 2.4, 1.1, WOOD, side * 2.33, 1.2, z));
      scene.add(trim(0.1, 0.14, 1.4, ACCENT, side * 2.31, 2.47, z));
      for (const dz of [-0.62, 0.62])
        scene.add(trim(0.1, 2.4, 0.12, ACCENT, side * 2.31, 1.2, z + dz));
      scene.add(box(0.05, 0.05, 0.18, 0xc9a24a, side * 2.27, 1.1, z + 0.4));
      scene.add(glow(0.02, 0.1, 0.3, ACCENT, side * 2.285, 1.75, z));
    }
    for (const z of [0.5, -2.5, -5.5, -8.5]) {
      scene.add(box(0.04, 0.8, 0.6, 0x3a2c22, side * 2.4, 1.9, z - 0.2));
      scene.add(box(0.4, 0.8, 0.9, 0xf2f4f5, side * 2.15, 0.4, z - 1.2));
      scene.add(cylinder(0.08, 0.3, 0x405060, side * 2.15, 0.95, z - 1.2));
    }
  }
};

// The corner office at the end: a window wall with a city skyline, a large desk, chairs, a lamp that
// is off, and two plants.
const addOffice = (scene: Scene): void => {
  scene.add(wall(5, 3.6, 0.2, WALL_WHITE, 0, 1.8, -16));
  wallTrim(scene, ACCENT, 'x', 5, -15.9, 0, 1);
  scene.add(glass(3.6, 2.0, 0.06, 0, 2.0, -15.8));
  scene.add(glow(3.4, 1.8, 0.02, 0x8fb0d0, 0, 2.0, -15.86)); // the city beyond the glass
  for (let i = 0; i < 10; i += 1) {
    const h = 0.4 + ((i * 7) % 5) * 0.25;
    scene.add(box(0.3, h, 0.02, 0x3a4f66, -1.5 + i * 0.33, 1.1 + h / 2, -15.82));
  }
  scene.add(box(2.4, 0.08, 1.1, WOOD, 0, 0.78, -13.5));
  scene.add(box(2.36, 0.7, 0.96, DARK_WOOD, 0, 0.4, -13.5));
  scene.add(trim(2.4, 0.05, 0.04, ACCENT, 0, 0.84, -12.97)); // gold edge on the desk
  scene.add(cylinder(0.27, 0.08, 0x2b333a, 0, 0.55, -14.6));
  scene.add(cylinder(0.04, 0.5, 0x2b333a, 0, 0.28, -14.6));
  scene.add(box(0.55, 0.7, 0.08, 0x2b333a, 0, 1.0, -14.9));
  scene.add(cylinder(0.04, 0.4, 0x6b7a84, 0.9, 1.0, -13.6));
  scene.add(glow(0.3, 0.1, 0.3, 0x9aa5ad, 0.9, 1.25, -13.6)); // the lamp, off
  for (const x of [-1.2, 1.2]) scene.add(cylinder(0.24, 0.08, 0x8a949b, x, 0.5, -11.8));
  for (const x of [-2.1, 2.1]) {
    scene.add(cylinder(0.28, 0.5, 0xdfe5e9, x, 0.25, -15.3));
    scene.add(sphere(0.5, 0x3f8f52, x, 0.95, -15.3));
  }
};

// The executive floor after hours: lit and empty, a corridor of closed doors and a corner office at
// the end.
export const buildExecutiveFloor = (mountIndex: number): FeedScene => {
  const mount = pickMount(MOUNTS, mountIndex);
  const scene = litBase(14, 70);
  litRoom(scene);

  addCorridor(scene);
  addDoors(scene);
  addOffice(scene);

  const camera = new PerspectiveCamera(60, ASPECT, 0.1, 44);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    aimCamera(camera, t, mount);
  };
  update(0);
  return { scene, camera, update };
};
