import { PerspectiveCamera } from 'three';
import type { Mesh, MeshBasicMaterial, Scene } from 'three';
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
  glow,
  litBase,
  litRoom,
  tiledFloor,
  trim,
  wall,
  wallTrim,
} from './shapes';
import type { FeedScene } from './scenes';

// The security floor's accent: red.
const ACCENT = floorAccent('security');

const MOUNTS: readonly [Mount, ...Mount[]] = [
  { position: [0, 2.4, 4.5], heading: 0, range: 0.5, sweep: 8, hold: 3, offset: 1 },
];

// White walls with red trim, a tiled floor and a ceiling light strip that stutters.
const addShell = (scene: Scene): MeshBasicMaterial => {
  tiledFloor(scene, 14, 14, 0, 0, ACCENT);
  scene.add(wall(14, 4, 0.2, WALL_WHITE, 0, 2, -7));
  scene.add(wall(14, 4, 0.2, WALL_WHITE, 0, 2, 7));
  for (const x of [-7, 7]) scene.add(wall(0.2, 4, 14, WALL_WHITE, x, 2, 0));
  wallTrim(scene, ACCENT, 'x', 14, -6.9, 0, 1);
  wallTrim(scene, ACCENT, 'x', 14, 6.9, 0, -1);
  wallTrim(scene, ACCENT, 'z', 14, -6.9, 0, 1);
  wallTrim(scene, ACCENT, 'z', 14, 6.9, 0, -1);
  const ceiling = floor(14, 14, CEILING_WHITE);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 4;
  scene.add(ceiling);
  let flicker: Mesh | null = null;
  for (const z of [-4.5, -0.5, 3.5]) {
    const strip = glow(5, 0.04, 0.35, 0xffffff, 0, 3.96, z);
    scene.add(strip);
    if (z === -0.5) flicker = strip;
  }
  return (flicker as Mesh).material as MeshBasicMaterial;
};

// A wall of monitors, all dark but one that shows static.
const addMonitorWall = (scene: Scene): MeshBasicMaterial => {
  let staticScreen: Mesh | null = null;
  for (let col = 0; col < 6; col += 1) {
    for (let row = 0; row < 3; row += 1) {
      const x = -5 + col * 2;
      const y = 1.2 + row * 0.95;
      scene.add(box(1.8, 0.85, 0.08, 0x2b333a, x, y, -6.85));
      const lit = col === 3 && row === 1;
      const dark = 0x0b1c26 + ((col + row) % 3) * 0x020406;
      const screen = glow(1.62, 0.7, 0.02, lit ? 0xb8c4cc : dark, x, y, -6.78);
      scene.add(screen);
      if (lit) staticScreen = screen;
    }
  }
  return (staticScreen as Mesh).material as MeshBasicMaterial;
};

// Two console desks with small monitors, keyboards and chairs pushed back; one cold mug.
const addDesks = (scene: Scene): void => {
  for (const z of [-2.2, 0.8]) {
    scene.add(box(8, 0.08, 1.1, 0xdde3e7, 0, 0.75, z));
    scene.add(box(8, 0.7, 0.1, 0xc9d0d5, 0, 0.4, z - 0.5));
    scene.add(trim(8, 0.06, 0.04, ACCENT, 0, 0.78, z + 0.56)); // red front edge
    for (const x of [-3.5, -1.2, 1.2, 3.5]) {
      scene.add(glow(0.6, 0.38, 0.04, 0x143846, x, 1.15, z - 0.3));
      scene.add(box(0.45, 0.03, 0.18, 0x3a444c, x, 0.8, z + 0.1));
      scene.add(cylinder(0.26, 0.08, 0x2b333a, x, 0.5, z + 1.1));
      scene.add(cylinder(0.04, 0.45, 0x2b333a, x, 0.25, z + 1.1));
      scene.add(box(0.5, 0.55, 0.08, 0x2b333a, x, 0.85, z + 1.4));
    }
  }
  scene.add(cylinder(0.07, 0.1, 0xe8e0d0, 2.0, 0.84, -1.9));
};

// The security office: a monitor wall, console desks, a stuttering light, a camera panning on its
// mount. Empty.
export const buildSecurityOffice = (mountIndex: number): FeedScene => {
  const mount = pickMount(MOUNTS, mountIndex);
  const scene = litBase(12, 60);
  const light = litRoom(scene);

  const flickerMaterial = addShell(scene);
  const staticMaterial = addMonitorWall(scene);
  addDesks(scene);

  const camera = new PerspectiveCamera(62, ASPECT, 0.1, 40);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    aimCamera(camera, t, mount);
    staticMaterial.color.setHex(Math.sin(t * 40) > 0 ? 0xb8c4cc : 0x8e9aa2);
    const stutter = Math.sin(t * 19) * Math.sin(t * 2.7) > 0.93;
    flickerMaterial.color.setHex(stutter ? 0x9aa5ad : 0xffffff);
    light.intensity = stutter ? 0.55 : 1.1;
  };
  update(0);
  return { scene, camera, update };
};
