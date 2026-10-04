import { AmbientLight, PerspectiveCamera, PointLight } from 'three';
import type { Mesh, Scene, MeshBasicMaterial } from 'three';
import { aimCamera, pickMount } from './pan';
import type { Mount } from './pan';
import { ASPECT, base, box, cylinder, floor, glass, glow, sphere } from './shapes';
import type { FeedScene } from './scenes';

// Back wall: a lit company sign made of abstract letter blocks, vertical wall panelling, a door
// and an exit sign.
const addBackWall = (scene: Scene): void => {
  scene.add(box(16, 4.4, 0.2, 0x202a31, 0, 2.2, -8));
  for (let i = 0; i < 15; i += 1) scene.add(box(0.12, 4.2, 0.06, 0x2b3942, -7 + i, 2.2, -7.88));
  const letters = [0.5, 0.3, 0.45, 0.3, 0.5, 0.35, 0.4, 0.3, 0.45];
  let x = -2.6;
  for (const width of letters) {
    scene.add(glow(width, 0.42, 0.04, 0xd7ecf7, x + width / 2, 3.3, -7.84));
    x += width + 0.18;
  }
  scene.add(glow(5.4, 0.04, 0.04, 0x7fb4cf, 0, 2.95, -7.84)); // underline
  scene.add(box(1.5, 2.6, 0.1, 0x12181d, 6, 1.3, -7.85)); // service door
  scene.add(glow(0.6, 0.2, 0.05, 0x39ff7a, 6, 2.85, -7.8)); // exit sign
};

// A reception desk with a counter, screens, an accent strip and a chair behind it.
const addReception = (scene: Scene): void => {
  scene.add(box(5.2, 1.1, 1.1, 0x2d3b45, 0, 0.55, -5.4));
  scene.add(box(5.5, 0.08, 1.35, 0x3d4f5b, 0, 1.14, -5.4));
  scene.add(glow(5.0, 0.05, 0.03, 0x62b6d6, 0, 0.12, -4.84)); // base accent strip
  scene.add(glow(0.55, 0.36, 0.04, 0x4fa7c8, -1.2, 1.5, -5.55)); // monitors
  scene.add(glow(0.55, 0.36, 0.04, 0x4fa7c8, -0.5, 1.5, -5.55));
  scene.add(box(0.4, 0.05, 0.2, 0x151c21, -0.5, 1.22, -5.45)); // keyboard
  scene.add(cylinder(0.28, 0.08, 0x1b2329, 1.2, 0.5, -6.3)); // chair seat
  scene.add(cylinder(0.04, 0.45, 0x1b2329, 1.2, 0.25, -6.3));
  scene.add(box(0.5, 0.55, 0.08, 0x1b2329, 1.2, 0.85, -6.55));
};

// Four pillars, each with a base and a capital.
const addPillars = (scene: Scene): void => {
  for (const x of [-6, -3, 3, 6]) {
    scene.add(box(0.55, 4.2, 0.55, 0x2c3a42, x, 2.1, -3.2));
    scene.add(box(0.8, 0.25, 0.8, 0x34444d, x, 0.125, -3.2));
    scene.add(box(0.75, 0.2, 0.75, 0x34444d, x, 4.1, -3.2));
  }
};

// The elevator bank on the right wall, with call lights and a row of turnstile posts in front.
const addElevators = (scene: Scene): void => {
  scene.add(box(0.2, 4.4, 14, 0x202a31, 8, 2.2, -1));
  for (let i = 0; i < 3; i += 1) {
    const z = -1.5 - i * 2.2;
    scene.add(box(0.1, 2.8, 1.5, 0x4a5861, 7.85, 1.4, z));
    scene.add(box(0.05, 2.7, 0.03, 0x20282e, 7.8, 1.4, z)); // door seam
    scene.add(glow(0.05, 0.18, 0.3, 0xffb347, 7.78, 3.1, z)); // floor indicator
    scene.add(glow(0.04, 0.25, 0.1, 0x62b6d6, 7.78, 1.2, z + 1.0)); // call button
    scene.add(box(0.2, 1.0, 0.45, 0x35434c, 6.2, 0.5, z + 0.4)); // turnstile post
    scene.add(glow(0.02, 0.02, 0.5, 0x39ff7a, 6.2, 1.02, z + 0.4)); // lane light
  }
};

// The glass street entrance on the left wall.
const addEntrance = (scene: Scene): void => {
  scene.add(box(0.2, 4.4, 14, 0x202a31, -8, 2.2, -1));
  scene.add(box(0.12, 3.0, 0.15, 0x10161a, -7.9, 1.5, 0.4));
  scene.add(box(0.12, 3.0, 0.15, 0x10161a, -7.9, 1.5, 3.6));
  scene.add(box(0.12, 0.15, 3.35, 0x10161a, -7.9, 3.0, 2.0));
  scene.add(glass(0.05, 2.9, 1.5, -7.85, 1.45, 1.15));
  scene.add(glass(0.05, 2.9, 1.5, -7.85, 1.45, 2.85));
  scene.add(box(0.06, 0.1, 0.9, 0x6b7a84, -7.78, 1.05, 1.5)); // door handles
  scene.add(box(0.06, 0.1, 0.9, 0x6b7a84, -7.78, 1.05, 2.5));
  scene.add(glow(0.05, 1.6, 4, 0x1d3a52, -7.9, 2.1, -3)); // night glow from outside
};

// A waiting area: two sofas around a low table, a magazine rack and a bench.
const addSeating = (scene: Scene): void => {
  for (const [x, z, face] of [
    [-5.2, -0.6, 1],
    [-5.2, 1.4, -1],
  ] as const) {
    scene.add(box(2, 0.45, 0.8, 0x3a4c3f, x, 0.225, z)); // seat
    scene.add(box(2, 0.55, 0.18, 0x34443a, x, 0.72, z + face * 0.4)); // back
    scene.add(box(0.18, 0.5, 0.8, 0x34443a, x - 1.0, 0.45, z)); // arms
    scene.add(box(0.18, 0.5, 0.8, 0x34443a, x + 1.0, 0.45, z));
  }
  scene.add(box(1.4, 0.06, 0.7, 0x4a3a2c, -5.2, 0.38, 0.4)); // coffee table top
  scene.add(box(0.08, 0.35, 0.08, 0x2a2018, -5.8, 0.18, 0.2));
  scene.add(box(0.08, 0.35, 0.08, 0x2a2018, -4.6, 0.18, 0.6));
  scene.add(box(0.5, 0.04, 0.35, 0x8a9aa4, -5.4, 0.43, 0.4)); // a magazine
  scene.add(box(0.9, 1.4, 0.3, 0x2f3b44, -7.4, 0.7, -5)); // magazine rack
  scene.add(box(1.8, 0.4, 0.5, 0x2c3a42, 3.2, 0.2, 3.2)); // bench
};

// Potted plants, a bin and an umbrella stand add clutter along the walls.
const addDecor = (scene: Scene): void => {
  for (const [x, z] of [
    [-7.1, -7.1],
    [7.1, -7.1],
    [-7.1, 5.5],
    [4.6, -6.6],
  ] as const) {
    scene.add(cylinder(0.32, 0.55, 0x2a2f33, x, 0.275, z));
    scene.add(sphere(0.55, 0x2f5a3a, x, 1.0, z));
    scene.add(sphere(0.35, 0x3a6d46, x + 0.2, 1.45, z - 0.1));
  }
  scene.add(cylinder(0.22, 0.7, 0x20282d, 7.2, 0.35, 4.6)); // bin
  scene.add(cylinder(0.2, 0.6, 0x3a2f2f, -7.3, 0.3, 4.2)); // umbrella stand
  scene.add(box(1.6, 1.0, 0.04, 0x1a2228, 0, 2.2, -7.8)); // notice board
};

// The floor: a lighter central inlay and a border, so the room reads as tiled.
const addFloor = (scene: Scene): void => {
  scene.add(floor(16, 18, 0x182026));
  const inlay = floor(7, 12, 0x232e35);
  inlay.position.set(0, 0.01, -2);
  scene.add(inlay);
  for (const z of [-6.5, -2, 2.5]) {
    const strip = floor(7, 0.12, 0x34444d);
    strip.position.set(0, 0.02, z);
    scene.add(strip);
  }
  for (const x of [-3.5, 3.5]) {
    const strip = floor(0.12, 12, 0x34444d);
    strip.position.set(x, 0.02, -2);
    scene.add(strip);
  }
};

// The ceiling with recessed light panels; one of them flickers.
const addCeiling = (scene: Scene): MeshBasicMaterial => {
  const ceiling = floor(16, 18, 0x10161a);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 4.4;
  scene.add(ceiling);
  let flicker: Mesh | null = null;
  for (const x of [-4, 0, 4]) {
    for (const z of [-5, -1, 3]) {
      const panel = glow(1.6, 0.04, 0.5, 0xcfe8ff, x, 4.36, z);
      scene.add(panel);
      if (x === 0 && z === -1) flicker = panel;
    }
  }
  return (flicker as Mesh).material as MeshBasicMaterial;
};

// An empty lobby at night: a camera panning on its mount, and one tired ceiling light.
const MOUNTS: readonly [Mount, ...Mount[]] = [
  // Reception: from the front of the hall, sweeping the whole room.
  { position: [0, 2.6, 5], heading: 0, range: 0.6, sweep: 7, hold: 2.5, offset: 0 },
  // Entrance: from the glass doors, turned across the hall toward the desk and the elevators.
  { position: [-7, 2.6, 6], heading: 0.7, range: 0.45, sweep: 8, hold: 3, offset: 2 },
];

export const buildLobby = (mountIndex: number): FeedScene => {
  const mount = pickMount(MOUNTS, mountIndex);
  const scene = base(0x05080a, 8, 26);
  scene.add(new AmbientLight(0x88aacc, 1.6));
  const light = new PointLight(0xcfe8ff, 60, 18);
  light.position.set(0, 3.6, -2);
  scene.add(light);
  // A second, dimmer light over the elevator bank, so the entrance camera is not left in the dark.
  const sideLight = new PointLight(0xcfe8ff, 45, 14);
  sideLight.position.set(5.5, 3.4, -2);
  scene.add(sideLight);

  addFloor(scene);
  addBackWall(scene);
  addReception(scene);
  addPillars(scene);
  addElevators(scene);
  addEntrance(scene);
  addSeating(scene);
  addDecor(scene);
  const flickerMaterial = addCeiling(scene);

  const camera = new PerspectiveCamera(60, ASPECT, 0.1, 44);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    // The camera stays on its mount and turns, holding for a moment at each end.
    aimCamera(camera, t, mount);
    // Mostly steady, with an occasional stutter.
    const stutter = Math.sin(t * 23) * Math.sin(t * 3.1) > 0.92;
    light.intensity = stutter ? 18 : 60;
    flickerMaterial.color.setHex(stutter ? 0x383c40 : 0xcfe8ff);
  };
  update(0);
  return { scene, camera, update };
};
