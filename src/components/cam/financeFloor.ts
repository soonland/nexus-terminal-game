import { PerspectiveCamera } from 'three';
import type { Mesh, Scene } from 'three';
import { aimCamera, pickMount } from './pan';
import type { Mount } from './pan';
import { floorAccent } from '../../data/cameras';
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

// The finance floor's accent: green.
const ACCENT = floorAccent('finance');

const MOUNTS: readonly [Mount, ...Mount[]] = [
  { position: [0, 2.8, 6.5], heading: 0, range: 0.5, sweep: 9, hold: 3, offset: 2 },
];

// White walls with green trim, a tiled floor and a ceiling with light panels.
const addShell = (scene: Scene): void => {
  tiledFloor(scene, 16, 16, 0, -1, ACCENT);
  scene.add(wall(16, 4.4, 0.2, WALL_WHITE, 0, 2.2, -9));
  scene.add(wall(16, 4.4, 0.2, WALL_WHITE, 0, 2.2, 7));
  for (const x of [-8, 8]) scene.add(wall(0.2, 4.4, 16, WALL_WHITE, x, 2.2, -1));
  wallTrim(scene, ACCENT, 'x', 16, -8.9, 0, 1);
  wallTrim(scene, ACCENT, 'x', 16, 6.9, 0, -1);
  wallTrim(scene, ACCENT, 'z', 16, -7.9, -1, 1);
  wallTrim(scene, ACCENT, 'z', 16, 7.9, -1, -1);
  const ceiling = floor(16, 16, CEILING_WHITE);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 4.4, -1);
  scene.add(ceiling);
  for (const x of [-4, 0, 4]) {
    for (const z of [-6, -2, 2]) {
      const panel = glow(1.8, 0.04, 0.5, 0xffffff, x, 4.36, z);
      scene.add(panel);
    }
  }
};

// Three rows of five desks with paired dormant monitors and chairs, and glass partitions.
const addDesks = (scene: Scene): void => {
  for (const z of [-6.5, -3.5, -0.5]) {
    for (const x of [-6, -3, 0, 3, 6]) {
      scene.add(box(2.02, 0.06, 0.9, 0xeef1f3, x, 0.74, z));
      scene.add(box(2, 0.7, 0.06, 0xc9d0d5, x, 0.38, z - 0.4));
      scene.add(trim(2.04, 0.05, 0.04, ACCENT, x, 0.76, z + 0.46)); // green front edge
      scene.add(glow(0.55, 0.34, 0.03, 0x14303f, x - 0.5, 1.1, z - 0.2));
      scene.add(glow(0.55, 0.34, 0.03, 0x14303f, x + 0.5, 1.1, z - 0.2));
      scene.add(cylinder(0.25, 0.08, 0x2b333a, x, 0.5, z + 0.9));
      scene.add(cylinder(0.04, 0.45, 0x2b333a, x, 0.25, z + 0.9));
      scene.add(box(0.45, 0.5, 0.07, 0x2b333a, x, 0.85, z + 1.15));
    }
    for (const x of [-4.5, -1.5, 1.5, 4.5]) scene.add(glass(0.05, 1.2, 2.0, x, 1.0, z));
  }
};

interface Bar {
  mesh: Mesh;
  phase: number;
  rate: number;
}

// The ticker wall: a row of glowing bars that rise and fall.
const addTickerWall = (scene: Scene): Bar[] => {
  scene.add(trim(13.8, 0.12, 0.05, ACCENT, 0, 0.94, -8.77)); // green frame under the bars
  const bars: Bar[] = [];
  for (let i = 0; i < 14; i += 1) {
    const mesh = glow(0.5, 1, 0.05, i % 2 === 0 ? 0x34ff7a : 0xff3a2a, -6.5 + i, 1.5, -8.76);
    scene.add(mesh);
    bars.push({ mesh, phase: i * 0.9, rate: 0.4 + (i % 4) * 0.15 });
  }
  return bars;
};

// The finance floor after hours: desks, partitions, a ticker wall still moving. Empty.
export const buildFinanceFloor = (mountIndex: number): FeedScene => {
  const mount = pickMount(MOUNTS, mountIndex);
  const scene = litBase(12, 70);
  litRoom(scene);

  addShell(scene);
  addDesks(scene);
  const bars = addTickerWall(scene);

  const camera = new PerspectiveCamera(62, ASPECT, 0.1, 44);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    aimCamera(camera, t, mount);
    for (const bar of bars) {
      const height = 0.6 + (Math.sin(t * bar.rate + bar.phase) + 1) * 0.9;
      bar.mesh.scale.y = height;
      bar.mesh.position.y = 1.0 + height / 2;
    }
  };
  update(0);
  return { scene, camera, update };
};
