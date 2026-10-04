import { PerspectiveCamera } from 'three';
import type { MeshBasicMaterial, Scene } from 'three';
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
  tiledFloor,
  trim,
  wall,
  wallTrim,
} from './shapes';
import type { FeedScene } from './scenes';

// Sub-level B's accent: cyan.
const ACCENT = floorAccent('sublevel');
const BRIGHT_CYAN = 0x00b5d8;
const DIM_CYAN = 0x0a7a90;

const MOUNTS: readonly [Mount, ...Mount[]] = [
  { position: [0, 2.6, 7], heading: 0, range: 0.4, sweep: 10, hold: 3, offset: 5 },
];

interface Standby {
  material: MeshBasicMaterial;
  phase: number;
}

// Four rows of sealed cabinets facing the aisles: a cyan standby strip, a grill and a red seal each.
const addCabinets = (scene: Scene): Standby[] => {
  const standby: Standby[] = [];
  let n = 0;
  for (const x of [-6, -2.6, 2.6, 6]) {
    const facing = x < 0 ? 1 : -1;
    for (let i = 0; i < 6; i += 1) {
      const z = -1 - i * 2;
      scene.add(box(1.2, 2.8, 1.4, 0x4a5560, x, 1.4, z));
      const strip = glow(0.04, 2.2, 0.2, BRIGHT_CYAN, x + facing * 0.62, 1.4, z);
      strip.name = 'blink';
      scene.add(strip);
      standby.push({ material: strip.material as MeshBasicMaterial, phase: n });
      scene.add(box(0.02, 0.5, 0.9, 0x20282e, x + facing * 0.62, 0.6, z));
      scene.add(glow(0.04, 0.08, 1.2, 0xff3a2a, x + facing * 0.64, 2.0, z));
      n += 1;
    }
  }
  return standby;
};

// White walls with cyan trim, a tiled floor with a cyan stripe, a ceiling with light strips, and the
// glass wall in front of the hall.
const addShell = (scene: Scene): void => {
  tiledFloor(scene, 16, 22, 0, -3, ACCENT);
  scene.add(wall(16, 4.2, 0.2, WALL_WHITE, 0, 2.1, -14));
  scene.add(wall(16, 4.2, 0.2, WALL_WHITE, 0, 2.1, 8));
  for (const x of [-8, 8]) scene.add(wall(0.2, 4.2, 22, WALL_WHITE, x, 2.1, -3));
  wallTrim(scene, ACCENT, 'x', 16, -13.9, 0, 1);
  wallTrim(scene, ACCENT, 'x', 16, 7.9, 0, -1);
  wallTrim(scene, ACCENT, 'z', 22, -7.9, -3, 1);
  wallTrim(scene, ACCENT, 'z', 22, 7.9, -3, -1);
  const ceiling = floor(16, 22, CEILING_WHITE);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 4.2, -3);
  scene.add(ceiling);
  for (const x of [-4, 0, 4]) scene.add(glow(0.25, 0.04, 16, 0xffffff, x, 4.16, -3));
  for (const x of [-0.9, 0.9]) scene.add(glow(0.05, 0.02, 20, ACCENT, x, 0.03, -3));
  scene.add(glass(16, 3.4, 0.05, 0, 1.7, 2)); // the glass wall in front of the hall
};

// The vault door at the far end, locked: white-grey steel with a cyan ring and a hazard frame.
const addVault = (scene: Scene): void => {
  scene.add(box(3.4, 3.4, 0.3, 0xc2cad0, 0, 1.7, -13.72));
  for (let i = 0; i < 9; i += 1) {
    const stripe = trim(
      0.3,
      0.12,
      0.05,
      i % 2 === 0 ? 0xf2c500 : 0x20262b,
      -1.2 + i * 0.3,
      3.5,
      -13.6,
    );
    stripe.name = 'hazard';
    scene.add(stripe);
  }
  const wheel = cylinder(0.5, 0.12, 0x4a5861, 0, 1.6, -13.55);
  wheel.rotation.x = Math.PI / 2;
  scene.add(wheel);
  scene.add(trim(1.4, 0.08, 0.06, ACCENT, 0, 1.6, -13.58));
  scene.add(glow(1.6, 0.08, 0.04, 0xff3a2a, 0, 3.7, -13.6));
};

// Data hall B: sealed cold-storage and accelerator cabinets under white light with cyan standby
// strips. Empty.
export const buildDataHall = (mountIndex: number): FeedScene => {
  const mount = pickMount(MOUNTS, mountIndex);
  const scene = litBase(14, 80);
  litRoom(scene);

  addShell(scene);
  addVault(scene);
  const standby = addCabinets(scene);

  const camera = new PerspectiveCamera(62, ASPECT, 0.1, 44);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    aimCamera(camera, t, mount);
    for (const s of standby) {
      s.material.color.setHex(Math.sin(t * 0.8 + s.phase) > 0 ? BRIGHT_CYAN : DIM_CYAN);
    }
  };
  update(0);
  return { scene, camera, update };
};
