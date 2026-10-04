import { AmbientLight, PerspectiveCamera, PointLight } from 'three';
import type { Mesh, MeshBasicMaterial, Scene } from 'three';
import { aimCamera, pickMount } from './pan';
import type { Mount } from './pan';
import { ASPECT, base, box, cylinder, floor, glass, glow, sphere } from './shapes';
import type { FeedScene } from './scenes';

const MOUNTS: readonly [Mount, ...Mount[]] = [
  // Corridor: from the elevator end, down the runner.
  { position: [0, 2.2, 5.5], heading: 0, range: 0.3, sweep: 10, hold: 3.5, offset: 4 },
  // Corner office: from the doorway, looking in at the desk and the window.
  { position: [0, 2.7, -10.2], heading: 0, range: 0.4, sweep: 9, hold: 3, offset: 0 },
];

// A long corridor: floor with a runner, panelled walls, a ceiling with light panels (one stutters).
const addCorridor = (scene: Scene): MeshBasicMaterial => {
  const ground = floor(5, 22, 0x1a1816);
  ground.position.z = -5;
  scene.add(ground);
  const runner = floor(1.6, 22, 0x3a1f22);
  runner.position.set(0, 0.01, -5);
  scene.add(runner);
  for (const x of [-2.5, 2.5]) {
    scene.add(box(0.2, 3.6, 22, 0x2a2622, x, 1.8, -5));
    scene.add(box(0.06, 1.0, 22, 0x3a2f26, x * 0.96, 0.5, -5));
  }
  const ceiling = floor(5, 22, 0x0f0e0d);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 3.6, -5);
  scene.add(ceiling);
  let flicker: Mesh | null = null;
  for (const z of [4, 0, -4, -8, -12]) {
    const panel = glow(1.2, 0.04, 0.4, 0xcfe8ff, 0, 3.56, z);
    scene.add(panel);
    if (z === -8) flicker = panel;
  }
  return (flicker as Mesh).material as MeshBasicMaterial;
};

// Closed doors with handles and nameplates, paintings, side tables with vases.
const addDoors = (scene: Scene): void => {
  for (const side of [-1, 1]) {
    for (const z of [2, -1, -4, -7, -10]) {
      scene.add(box(0.08, 2.4, 1.1, 0x3a2c22, side * 2.4, 1.2, z));
      scene.add(box(0.05, 0.05, 0.18, 0x8a7a5a, side * 2.34, 1.1, z + 0.4));
      scene.add(glow(0.02, 0.1, 0.3, 0x6f6a58, side * 2.36, 1.7, z));
    }
    for (const z of [0.5, -2.5, -5.5, -8.5]) {
      scene.add(box(0.04, 0.8, 0.6, 0x1a1612, side * 2.42, 1.9, z - 0.2));
      scene.add(box(0.4, 0.8, 0.9, 0x2f241c, side * 2.2, 0.4, z - 1.2));
      scene.add(cylinder(0.08, 0.3, 0x405060, side * 2.2, 0.95, z - 1.2));
    }
  }
};

// The corner office at the end: window wall with a city skyline glow, a large desk, chairs, a lamp
// that is off, and two plants.
const addOffice = (scene: Scene): void => {
  scene.add(box(5, 3.6, 0.2, 0x1a1f24, 0, 1.8, -16));
  scene.add(glass(3.6, 2.0, 0.06, 0, 2.0, -15.88));
  scene.add(glow(3.4, 1.8, 0.02, 0x1d3a52, 0, 2.0, -15.95));
  for (let i = 0; i < 10; i += 1) {
    const h = 0.4 + ((i * 7) % 5) * 0.25;
    scene.add(box(0.3, h, 0.02, 0x0a1018, -1.5 + i * 0.33, 1.1 + h / 2, -15.9));
  }
  scene.add(box(2.4, 0.08, 1.1, 0x3a2c22, 0, 0.78, -13.5));
  scene.add(box(2.4, 0.7, 1.0, 0x2f241c, 0, 0.4, -13.5));
  scene.add(cylinder(0.27, 0.08, 0x1b1816, 0, 0.55, -14.6));
  scene.add(cylinder(0.04, 0.5, 0x1b1816, 0, 0.28, -14.6));
  scene.add(box(0.55, 0.7, 0.08, 0x1b1816, 0, 1.0, -14.9));
  scene.add(cylinder(0.04, 0.4, 0x3a3a3a, 0.9, 1.0, -13.6));
  scene.add(glow(0.3, 0.1, 0.3, 0x2a2820, 0.9, 1.25, -13.6));
  for (const x of [-1.2, 1.2]) scene.add(cylinder(0.24, 0.08, 0x2a2622, x, 0.5, -11.8));
  for (const x of [-2.1, 2.1]) {
    scene.add(cylinder(0.28, 0.5, 0x2a2f33, x, 0.25, -15.3));
    scene.add(sphere(0.5, 0x2f5a3a, x, 0.95, -15.3));
  }
};

// The executive floor at night: a corridor of closed doors and a corner office at the end. Empty.
export const buildExecutiveFloor = (mountIndex: number): FeedScene => {
  const mount = pickMount(MOUNTS, mountIndex);
  const scene = base(0x050607, 8, 26);
  scene.add(new AmbientLight(0xaa9988, 2.0));
  const light = new PointLight(0xffe8cf, 70, 22);
  light.position.set(0, 3.2, -8);
  scene.add(light);

  const flickerMaterial = addCorridor(scene);
  addDoors(scene);
  addOffice(scene);

  const camera = new PerspectiveCamera(60, ASPECT, 0.1, 44);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    aimCamera(camera, t, mount);
    const stutter = Math.sin(t * 15) * Math.sin(t * 2.1) > 0.94;
    flickerMaterial.color.setHex(stutter ? 0x383c40 : 0xcfe8ff);
    light.intensity = stutter ? 30 : 70;
  };
  update(0);
  return { scene, camera, update };
};
