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

interface Led {
  material: MeshBasicMaterial;
  rate: number;
  phase: number;
  color: number;
}

// The operations floor's accent: orange.
const ACCENT = floorAccent('operations');

const RACK_Z = (i: number): number => -1 - i * 1.6;

// One rack: a body, rows of server units on the front face, and two status LEDs per unit.
// `facing` is the side of the aisle the front looks toward (+1 faces +x, -1 faces -x).
const addRack = (
  scene: Scene,
  leds: Led[],
  x: number,
  z: number,
  facing: 1 | -1,
  units: number,
  seed: number,
): void => {
  scene.add(box(1.1, 2.4, 1, 0x1b2630, x, 1.2, z));
  for (let u = 0; u < units; u += 1) {
    const y = 0.35 + u * (2.0 / units);
    scene.add(
      box(0.04, 1.6 / units, 0.9, u % 2 === 0 ? 0x26323c : 0x2e3c47, x + facing * 0.52, y, z),
    );
    scene.add(box(0.02, 0.04, 0.45, 0x0c1114, x + facing * 0.55, y - 0.05, z + 0.12)); // vent slot
    for (let k = 0; k < 2; k += 1) {
      const color = (u + k + seed) % 3 === 0 ? 0xff3a2a : 0x34ff7a;
      const led = glow(0.03, 0.05, 0.05, color, x + facing * 0.56, y + 0.06, z - 0.32 + k * 0.1);
      scene.add(led);
      leds.push({
        material: led.material as MeshBasicMaterial,
        rate: 1 + ((seed * 3 + u * 5 + k * 7) % 5),
        phase: seed + u + k,
        color,
      });
    }
  }
  // Two cable drops from the tray into the top of the rack.
  scene.add(cylinder(0.03, 0.9, seed % 2 === 0 ? 0x2b6cb0 : ACCENT, x + facing * 0.2, 2.85, z));
  scene.add(cylinder(0.03, 0.9, 0x1a1a1a, x - facing * 0.2, 2.85, z + 0.15));
};

// Two inner rows of full racks and two outer rows of simpler ones.
const addRacks = (scene: Scene, leds: Led[]): void => {
  for (let i = 0; i < 7; i += 1) {
    addRack(scene, leds, -2.2, RACK_Z(i), 1, 6, i);
    addRack(scene, leds, 2.2, RACK_Z(i), -1, 6, i + 3);
  }
  for (let i = 0; i < 5; i += 1) {
    addRack(scene, leds, -4.8, RACK_Z(i) - 0.8, 1, 4, i + 7);
    addRack(scene, leds, 4.8, RACK_Z(i) - 0.8, -1, 4, i + 11);
  }
};

// Raised-floor tiles with an orange stripe, and glowing aisle lines.
const addFloor = (scene: Scene): void => {
  tiledFloor(scene, 14, 16, 0, -4, ACCENT);
  for (const x of [-1, 1]) scene.add(glow(0.05, 0.02, 15, ACCENT, x, 0.03, -4)); // aisle lights
};

// Cable trays over each inner row, with rungs.
const addTrays = (scene: Scene): void => {
  for (const x of [-2.2, 2.2]) {
    scene.add(box(0.6, 0.08, 14, 0xb5bec5, x, 3.25, -5.5));
    for (let z = 0.5; z > -12; z -= 1.1) scene.add(box(0.62, 0.05, 0.06, 0xc7ced3, x, 3.2, z));
  }
};

// Ceiling with light strips along the aisle; the central one stutters.
const addCeiling = (scene: Scene): MeshBasicMaterial => {
  const ceiling = floor(14, 16, CEILING_WHITE);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 3.9;
  scene.add(ceiling);
  let flicker: Mesh | null = null;
  for (const x of [-3.6, 0, 3.6]) {
    const strip = glow(0.3, 0.04, 12, 0xffffff, x, 3.86, -5);
    scene.add(strip);
    if (x === 0) flicker = strip;
  }
  return (flicker as Mesh).material as MeshBasicMaterial;
};

// An orange door frame: a top bar and two posts around a door `w` wide and `h` tall.
const doorFrame = (scene: Scene, z: number, w: number, h: number): void => {
  scene.add(trim(w + 0.3, 0.14, 0.12, ACCENT, 0, h + 0.07, z));
  for (const side of [-1, 1])
    scene.add(trim(0.14, h, 0.12, ACCENT, side * (w / 2 + 0.07), h / 2, z));
};

// The back wall: white, with an airlock door in an orange frame, a red status light, a keypad and a
// lit abstract sign.
const addBackWall = (scene: Scene): void => {
  scene.add(wall(14, 4, 0.2, WALL_WHITE, 0, 2, -11.6));
  wallTrim(scene, ACCENT, 'x', 14, -11.5, 0, 1);
  scene.add(box(2, 2.7, 0.1, 0xb9c3ca, 0, 1.35, -11.45));
  doorFrame(scene, -11.44, 2, 2.7);
  scene.add(box(0.05, 2.6, 0.03, 0x7d8a93, 0, 1.35, -11.38)); // door seam
  scene.add(glow(1.2, 0.08, 0.04, 0xff3a2a, 0, 3.05, -11.45)); // locked indicator
  scene.add(glow(0.12, 0.2, 0.04, 0x34ff7a, 1.3, 1.3, -11.45)); // keypad
  const widths = [0.4, 0.3, 0.45, 0.3, 0.4, 0.3, 0.35];
  let x = -1.4;
  for (const w of widths) {
    scene.add(glow(w, 0.3, 0.03, ACCENT, x + w / 2, 3.5, -11.48));
    x += w + 0.15;
  }
};

// Side and front walls in white with orange trim, a fire-suppression panel, wall vents, cooling units
// in the back corners and a maintenance cart in the aisle.
const addFixtures = (scene: Scene): void => {
  for (const x of [-7, 7]) scene.add(wall(0.2, 4, 16, WALL_WHITE, x, 2, -4));
  wallTrim(scene, ACCENT, 'z', 16, -6.9, -4, 1);
  wallTrim(scene, ACCENT, 'z', 16, 6.9, -4, -1);
  scene.add(wall(14, 4, 0.2, WALL_WHITE, 0, 2, 4.1)); // the front wall, behind the aisle camera
  wallTrim(scene, ACCENT, 'x', 14, 4.0, 0, -1);
  // The front wall, as the airlock camera sees it: a door in an orange frame, its status lights and
  // two wall washers.
  scene.add(box(2, 2.7, 0.1, 0xb9c3ca, 0, 1.35, 3.95));
  doorFrame(scene, 3.96, 2, 2.7);
  scene.add(glow(1.2, 0.08, 0.04, 0x34ff7a, 0, 3.05, 3.95));
  scene.add(glow(0.12, 0.2, 0.04, 0xff3a2a, 1.3, 1.3, 3.95));
  for (const x of [-4, 4]) scene.add(glow(0.2, 1.6, 0.04, 0xffffff, x, 2.2, 3.98));
  scene.add(box(0.1, 0.6, 0.4, 0xc23030, -6.85, 1.5, -6)); // fire panel
  scene.add(glow(0.04, 0.08, 0.08, 0xff3a2a, -6.78, 1.65, -6));
  for (let i = 0; i < 4; i += 1) scene.add(box(0.08, 0.1, 1.2, 0xaab4bb, 6.88, 2.4 - i * 0.18, -2));
  for (const x of [-5.6, 5.6]) {
    scene.add(box(1.6, 2.2, 1.2, 0xe6ebee, x, 1.1, -10.8));
    scene.add(trim(1.62, 0.1, 1.22, ACCENT, x, 2.15, -10.8));
    for (let i = 0; i < 6; i += 1) {
      scene.add(box(1.4, 0.04, 0.02, 0x8a949b, x, 0.5 + i * 0.28, -10.18)); // grill
    }
    scene.add(glow(0.1, 0.1, 0.03, 0x34ff7a, x + 0.6, 1.9, -10.18)); // status light
  }
  scene.add(box(0.8, 0.8, 0.5, 0xc9d0d5, -3.6, 0.4, -3.5)); // maintenance cart
  scene.add(box(0.8, 0.04, 0.55, 0xf2f4f5, -3.6, 0.82, -3.5));
  scene.add(glow(0.4, 0.28, 0.04, 0x4fa7c8, -3.6, 1.05, -3.7)); // its screen
  scene.add(cylinder(0.02, 0.5, 0x6b7a84, -3.9, 0.55, -3.3)); // cart handle
};

// Racks of blinking servers, trays, cooling units and an airlock door, seen from a camera
// panning on its mount.
const MOUNTS: readonly [Mount, ...Mount[]] = [
  // Aisle: from the front, down the cold aisle.
  { position: [0, 2.2, 2], heading: 0, range: 0.45, sweep: 9, hold: 3, offset: 3 },
  // Airlock: from the vault door, looking back down the aisle.
  { position: [0, 2.2, -10.8], heading: Math.PI, range: 0.4, sweep: 9, hold: 3, offset: 0 },
];

export const buildServerRoom = (mountIndex: number): FeedScene => {
  const mount = pickMount(MOUNTS, mountIndex);
  const scene = litBase(14, 80);
  const light = litRoom(scene);

  const leds: Led[] = [];
  addFloor(scene);
  addRacks(scene, leds);
  addTrays(scene);
  addBackWall(scene);
  addFixtures(scene);
  const flickerMaterial = addCeiling(scene);

  const camera = new PerspectiveCamera(65, ASPECT, 0.1, 40);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    aimCamera(camera, t, mount);
    for (const led of leds) {
      const on = Math.sin(t * led.rate + led.phase) > -0.2;
      led.material.color.setHex(on ? led.color : 0x101010);
    }
    const stutter = Math.sin(t * 17) * Math.sin(t * 2.3) > 0.93;
    flickerMaterial.color.setHex(stutter ? 0x9aa5ad : 0xffffff);
    light.intensity = stutter ? 0.55 : 1.1;
  };
  update(0);
  return { scene, camera, update };
};
