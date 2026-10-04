import {
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  TorusGeometry,
} from 'three';
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
  glow,
  litBase,
  litRoom,
  tiledFloor,
  trim,
  wall,
  wallTrim,
} from './shapes';
import type { FeedScene } from './scenes';

const ACCENT = floorAccent('sublevel');
const STEEL = 0x9aa5ad;
const DARK_STEEL = 0x56626b;

// The camera hangs at the open end of the corridor, pointing straight at the door, and only drifts a
// few degrees.
const MOUNTS: readonly [Mount, ...Mount[]] = [
  { position: [0, 2.1, 1.5], heading: 0, range: 0.05, sweep: 14, hold: 4, offset: 0 },
];

const tag = (mesh: Mesh): Mesh => {
  mesh.name = 'vault';
  return mesh;
};

const ring = (radius: number, tube: number, color: number, z: number): Mesh => {
  const mesh = tag(
    new Mesh(new TorusGeometry(radius, tube, 10, 32), new MeshStandardMaterial({ color })),
  );
  mesh.position.set(0, 1.9, z);
  return mesh;
};

const disc = (radius: number, depth: number, color: number, z: number): Mesh => {
  const mesh = tag(
    new Mesh(new CylinderGeometry(radius, radius, depth, 40), new MeshStandardMaterial({ color })),
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(0, 1.9, z);
  return mesh;
};

// The corridor: white walls with cyan trim, a tiled floor, a ceiling with light panels and pipe runs.
const addCorridor = (scene: Scene): void => {
  tiledFloor(scene, 5, 16, 0, 0, ACCENT);
  for (const x of [-2.5, 2.5]) {
    scene.add(wall(0.2, 4.2, 16, WALL_WHITE, x, 2.1, 0));
    wallTrim(scene, ACCENT, 'z', 16, x * 0.96, 0, x < 0 ? 1 : -1);
  }
  scene.add(wall(5, 4.2, 0.2, WALL_WHITE, 0, 2.1, -8));
  wallTrim(scene, ACCENT, 'x', 5, -7.9, 0, 1);
  scene.add(wall(5, 4.2, 0.2, WALL_WHITE, 0, 2.1, 8));
  const ceiling = floor(5, 16, CEILING_WHITE);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 4.2;
  scene.add(ceiling);
  for (const z of [5, 1, -3]) {
    const panel = glow(1.4, 0.04, 0.5, 0xffffff, 0, 4.16, z);
    scene.add(panel);
  }
  for (const x of [-1.8, 1.8]) {
    const pipe = cylinder(0.12, 15, 0xc2cad0, x, 3.7, 0);
    pipe.rotation.x = Math.PI / 2;
    scene.add(pipe);
  }
};

// The door: a thick frame, the circular leaf, a ring of bolts, a wheel with spokes, hinges, a keypad,
// gauges, a red status light, a cyan glow under it, and hazard stripes on the floor in front.
const addDoor = (scene: Scene): void => {
  const z = -7.7;
  scene.add(tag(box(4.4, 4.0, 0.5, DARK_STEEL, 0, 2.0, z)));
  scene.add(disc(1.75, 0.35, STEEL, z + 0.3));
  scene.add(ring(1.55, 0.07, DARK_STEEL, z + 0.5));
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const bolt = disc(0.09, 0.14, 0xd2d8dc, z + 0.55);
    bolt.position.set(Math.sin(angle) * 1.55, 1.9 + Math.cos(angle) * 1.55, z + 0.55);
    scene.add(bolt);
  }
  scene.add(ring(0.6, 0.08, 0x2f3a42, z + 0.6));
  for (let i = 0; i < 3; i += 1) {
    const spoke = tag(box(1.3, 0.1, 0.1, 0x2f3a42, 0, 1.9, z + 0.6));
    spoke.rotation.z = (i / 3) * Math.PI;
    scene.add(spoke);
  }
  for (const y of [0.9, 1.9, 2.9]) scene.add(tag(box(0.2, 0.4, 0.3, 0x3a444c, -2.0, y, z + 0.25)));
  scene.add(box(0.5, 0.7, 0.12, 0x2a3238, 2.7, 1.6, z + 0.5)); // keypad
  scene.add(glow(0.3, 0.12, 0.04, 0x34ff7a, 2.7, 1.8, z + 0.57));
  for (const y of [2.4, 2.9]) {
    const gauge = cylinder(0.16, 0.08, 0xe8edf0, 2.7, y, z + 0.5);
    gauge.rotation.x = Math.PI / 2;
    scene.add(gauge);
    scene.add(glow(0.1, 0.1, 0.04, 0xff3a2a, 2.7, y, z + 0.56));
  }
  scene.add(glow(1.0, 0.1, 0.05, 0xff3a2a, 0, 3.95, z + 0.28)); // sealed: the status light
  scene.add(glow(3.2, 0.04, 0.4, ACCENT, 0, 0.04, z + 0.6)); // light spilling from under the door
  for (let i = 0; i < 8; i += 1) {
    scene.add(trim(0.5, 0.01, 0.4, i % 2 === 0 ? 0xf2c500 : 0x20262b, -1.75 + i * 0.5, 0.03, -5.6));
  }
};

// The approach to the vault door on Sub-level B: a clean white corridor ending in a sealed round door.
// Seen only from outside. Empty.
export const buildVaultApproach = (mountIndex: number): FeedScene => {
  const mount = pickMount(MOUNTS, mountIndex);
  const scene = litBase(14, 60);
  litRoom(scene);

  addCorridor(scene);
  addDoor(scene);

  const camera = new PerspectiveCamera(58, ASPECT, 0.1, 44);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    aimCamera(camera, t, mount);
  };
  update(0);
  return { scene, camera, update };
};
