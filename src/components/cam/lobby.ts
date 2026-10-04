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

// The ground floor's accent: IronGate blue.
const ACCENT = floorAccent('ground');

// An accent door frame: a top bar and two posts around a door `w` wide and `h` tall.
const doorFrame = (
  scene: Scene,
  x: number,
  z: number,
  w: number,
  h: number,
  depth: number,
): void => {
  scene.add(trim(w + 0.3, 0.14, depth, ACCENT, x, h + 0.07, z));
  for (const side of [-1, 1])
    scene.add(trim(0.14, h, depth, ACCENT, x + side * (w / 2 + 0.07), h / 2, z));
};

// The four walls in white with an accent band and baseboard, the front wall's service door, and the
// back wall: a lit company sign made of abstract letter blocks, panelling, a door and an exit sign.
const addWalls = (scene: Scene): void => {
  scene.add(wall(16, 4.4, 0.2, WALL_WHITE, 0, 2.2, -8));
  scene.add(wall(16, 4.4, 0.2, WALL_WHITE, 0, 2.2, 8));
  scene.add(wall(0.2, 4.4, 16, WALL_WHITE, 8, 2.2, 0));
  scene.add(wall(0.2, 4.4, 16, WALL_WHITE, -8, 2.2, 0));
  wallTrim(scene, ACCENT, 'x', 16, -7.9, 0, 1);
  wallTrim(scene, ACCENT, 'x', 16, 7.9, 0, -1);
  wallTrim(scene, ACCENT, 'z', 16, 7.9, 0, -1);
  wallTrim(scene, ACCENT, 'z', 16, -7.9, 0, 1);

  for (let i = 0; i < 15; i += 1) scene.add(box(0.1, 4.2, 0.05, 0xdde3e7, -7 + i, 2.2, -7.86));
  const letters = [0.5, 0.3, 0.45, 0.3, 0.5, 0.35, 0.4, 0.3, 0.45];
  let x = -2.6;
  for (const width of letters) {
    scene.add(glow(width, 0.42, 0.04, ACCENT, x + width / 2, 3.3, -7.82));
    x += width + 0.18;
  }
  scene.add(glow(5.4, 0.04, 0.04, ACCENT, 0, 2.95, -7.82)); // underline
  scene.add(box(1.5, 2.6, 0.1, 0xb9c3ca, 6, 1.3, -7.84)); // service door, back wall
  doorFrame(scene, 6, -7.83, 1.5, 2.6, 0.12);
  scene.add(glow(0.6, 0.2, 0.05, 0x39ff7a, 6, 3.1, -7.8)); // exit sign
  scene.add(box(2.4, 2.8, 0.1, 0xb9c3ca, 0, 1.4, 7.84)); // service door, front wall
  doorFrame(scene, 0, 7.83, 2.4, 2.8, 0.12);
  scene.add(glow(0.6, 0.2, 0.05, 0x39ff7a, 0, 3.3, 7.8)); // and its exit sign
  scene.add(box(1.6, 1.0, 0.04, 0x9aa5ad, 0, 2.2, -7.78)); // notice board
};

// A reception desk with a counter, screens, an accent strip and a chair behind it.
const addReception = (scene: Scene): void => {
  scene.add(box(5.2, 1.1, 1.1, 0xd4dade, 0, 0.55, -5.4));
  scene.add(box(5.5, 0.08, 1.35, 0xf2f4f5, 0, 1.14, -5.4));
  scene.add(trim(5.0, 0.12, 0.04, ACCENT, 0, 0.5, -4.83)); // front accent strip
  scene.add(glow(0.55, 0.36, 0.04, 0x4fa7c8, -1.2, 1.5, -5.55)); // monitors
  scene.add(glow(0.55, 0.36, 0.04, 0x4fa7c8, -0.5, 1.5, -5.55));
  scene.add(box(0.4, 0.05, 0.2, 0x3a444c, -0.5, 1.22, -5.45)); // keyboard
  scene.add(cylinder(0.28, 0.08, 0x2b333a, 1.2, 0.5, -6.3)); // chair seat
  scene.add(cylinder(0.04, 0.45, 0x2b333a, 1.2, 0.25, -6.3));
  scene.add(box(0.5, 0.55, 0.08, 0x2b333a, 1.2, 0.85, -6.55));
};

// Four pillars, each with a base, an accent ring and a capital.
const addPillars = (scene: Scene): void => {
  for (const x of [-6, -3, 3, 6]) {
    scene.add(box(0.55, 4.2, 0.55, 0xe6ebee, x, 2.1, -3.2));
    scene.add(box(0.8, 0.25, 0.8, 0xcfd6db, x, 0.125, -3.2));
    scene.add(trim(0.62, 0.12, 0.62, ACCENT, x, 1.1, -3.2));
    scene.add(box(0.75, 0.2, 0.75, 0xcfd6db, x, 4.1, -3.2));
  }
};

// The elevator bank on the right wall, with call lights and a row of turnstile posts in front.
const addElevators = (scene: Scene): void => {
  for (let i = 0; i < 3; i += 1) {
    const z = -1.5 - i * 2.2;
    scene.add(box(0.1, 2.8, 1.5, 0xb9c3ca, 7.78, 1.4, z));
    scene.add(box(0.05, 2.7, 0.03, 0x7d8a93, 7.72, 1.4, z)); // door seam
    scene.add(glow(0.05, 0.18, 0.3, 0xffb347, 7.72, 3.1, z)); // floor indicator
    scene.add(glow(0.04, 0.25, 0.1, ACCENT, 7.72, 1.2, z + 1.0)); // call button
    scene.add(box(0.2, 1.0, 0.45, 0xaeb8bf, 6.2, 0.5, z + 0.4)); // turnstile post
    scene.add(glow(0.02, 0.02, 0.5, 0x39ff7a, 6.2, 1.02, z + 0.4)); // lane light
  }
};

// The glass street entrance on the left wall, with daylight outside.
const addEntrance = (scene: Scene): void => {
  scene.add(trim(0.12, 3.0, 0.15, ACCENT, -7.82, 1.5, 0.4));
  scene.add(trim(0.12, 3.0, 0.15, ACCENT, -7.82, 1.5, 3.6));
  scene.add(trim(0.12, 0.15, 3.35, ACCENT, -7.82, 3.0, 2.0));
  scene.add(glass(0.05, 2.9, 1.5, -7.8, 1.45, 1.15));
  scene.add(glass(0.05, 2.9, 1.5, -7.8, 1.45, 2.85));
  scene.add(box(0.06, 0.1, 0.9, 0x6b7a84, -7.72, 1.05, 1.5)); // door handles
  scene.add(box(0.06, 0.1, 0.9, 0x6b7a84, -7.72, 1.05, 2.5));
  scene.add(glow(0.02, 2.9, 3.3, 0x9ec5e8, -7.86, 1.45, 2.0)); // the street, lit, behind the glass
};

// A waiting area: two accent sofas around a low table, a magazine rack and a bench.
const addSeating = (scene: Scene): void => {
  for (const [x, z, face] of [
    [-5.2, -0.6, 1],
    [-5.2, 1.4, -1],
  ] as const) {
    scene.add(box(2, 0.45, 0.8, ACCENT, x, 0.225, z)); // seat
    scene.add(box(2, 0.55, 0.18, ACCENT, x, 0.72, z + face * 0.4)); // back
    scene.add(box(0.18, 0.5, 0.8, ACCENT, x - 1.0, 0.45, z)); // arms
    scene.add(box(0.18, 0.5, 0.8, ACCENT, x + 1.0, 0.45, z));
  }
  scene.add(box(1.4, 0.06, 0.7, 0xf2f4f5, -5.2, 0.38, 0.4)); // coffee table top
  scene.add(box(0.08, 0.35, 0.08, 0x8a949b, -5.8, 0.18, 0.2));
  scene.add(box(0.08, 0.35, 0.08, 0x8a949b, -4.6, 0.18, 0.6));
  scene.add(box(0.5, 0.04, 0.35, 0xc7ced3, -5.4, 0.43, 0.4)); // a magazine
  scene.add(box(0.9, 1.4, 0.3, 0xc9d0d5, -7.4, 0.7, -5)); // magazine rack
  scene.add(box(1.8, 0.4, 0.5, 0xc9d0d5, 3.2, 0.2, 3.2)); // bench
};

// Potted plants, a bin and an umbrella stand add clutter along the walls.
const addDecor = (scene: Scene): void => {
  for (const [x, z] of [
    [-7.1, -7.1],
    [7.1, -7.1],
    [-7.1, 5.5],
    [4.6, -6.6],
  ] as const) {
    scene.add(cylinder(0.32, 0.55, 0xdfe5e9, x, 0.275, z));
    scene.add(sphere(0.55, 0x3f8f52, x, 1.0, z));
    scene.add(sphere(0.35, 0x4aa561, x + 0.2, 1.45, z - 0.1));
  }
  scene.add(cylinder(0.22, 0.7, 0x9aa5ad, 7.2, 0.35, 4.6)); // bin
  scene.add(cylinder(0.2, 0.6, 0x7d8a93, -7.3, 0.3, 4.2)); // umbrella stand
};

// The ceiling with recessed light panels.
const addCeiling = (scene: Scene): void => {
  const ceiling = floor(16, 16, CEILING_WHITE);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 4.4;
  scene.add(ceiling);
  for (const x of [-4, 0, 4]) {
    for (const z of [-5, -1, 3]) {
      const panel = glow(1.6, 0.04, 0.5, 0xffffff, x, 4.36, z);
      scene.add(panel);
    }
  }
};

const MOUNTS: readonly [Mount, ...Mount[]] = [
  // Reception: from the front of the hall, sweeping the whole room.
  { position: [0, 2.6, 5], heading: 0, range: 0.6, sweep: 7, hold: 2.5, offset: 0 },
  // Entrance: from the glass doors, turned across the hall toward the desk and the elevators.
  { position: [-7, 2.6, 6], heading: 0.7, range: 0.45, sweep: 8, hold: 3, offset: 2 },
];

// The lobby after hours: lit and empty, with a camera panning on its mount.
export const buildLobby = (mountIndex: number): FeedScene => {
  const mount = pickMount(MOUNTS, mountIndex);
  const scene = litBase(14, 70);
  litRoom(scene);

  tiledFloor(scene, 16, 16, 0, 0, ACCENT);
  addWalls(scene);
  addReception(scene);
  addPillars(scene);
  addElevators(scene);
  addEntrance(scene);
  addSeating(scene);
  addDecor(scene);
  addCeiling(scene);

  const camera = new PerspectiveCamera(60, ASPECT, 0.1, 44);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    // The camera stays on its mount and turns, holding for a moment at each end.
    aimCamera(camera, t, mount);
  };
  update(0);
  return { scene, camera, update };
};
