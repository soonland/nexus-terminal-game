import { DirectionalLight, HemisphereLight, PerspectiveCamera } from 'three';
import type { Scene } from 'three';
import { floorAccent } from '../../data/cameras';
import { DOCK_EDGE_Z, DOCK_HEIGHT, loadLoadingDockModels } from './loadingDockModels';
import { aimCamera } from './pan';
import type { Mount } from './pan';
import { ASPECT, base, box, cylinder, floor, glow, trim } from './shapes';
import type { FeedScene } from './scenes';

// The ground floor's accent: IronGate blue.
const ACCENT = floorAccent('ground');

const NIGHT_SKY = 0x0b1220;
const ASPHALT = 0x1c2026;
const CONCRETE = 0x59616a;
const WAREHOUSE = 0xaeb8c0;
const STEEL = 0x4a525b;
const DOOR_GREY = 0x8a949b;
const WARM = 0xfff1c9;
const YELLOW = 0xe0b020;

// The warehouse's loading dock at night, in the yard behind IronGate: the warehouse wall runs along x
// at z = -8 with a raised dock platform in front of it, a roller door in the middle, rubber bumpers
// either side, and the yard (open asphalt) in front.
const addYard = (scene: Scene): void => {
  const yard = floor(70, 40, ASPHALT);
  yard.position.set(0, 0, 4);
  scene.add(yard);
  // Painted truck bays: a line either side of the door's bay.
  for (const x of [-2.1, 2.1]) scene.add(glow(0.14, 0.02, 7, 0xd8dde2, x, 0.03, -2.9));
  scene.add(glow(16, 0.02, 0.14, YELLOW, 0, DOCK_HEIGHT + 0.01, DOCK_EDGE_Z - 0.1)); // dock edge line
};

const addWarehouse = (scene: Scene): void => {
  scene.add(box(26, 7, 1, WAREHOUSE, 0, 3.5, -8.5));
  scene.add(trim(26.1, 0.25, 0.1, ACCENT, 0, 6.4, -7.95)); // the blue band under the roof
  scene.add(box(16, DOCK_HEIGHT, 1.6, CONCRETE, 0, DOCK_HEIGHT / 2, -7.2)); // the dock platform
  scene.add(box(2.6, 0.06, 1.4, 0x39424a, 0, DOCK_HEIGHT + 0.03, -7.1)); // the dock leveller
  // The roller door in a blue frame, with slats, and a lit sign above it.
  scene.add(box(4, 3.8, 0.12, DOOR_GREY, 0, 3.1, -7.94));
  for (let i = 0; i < 8; i += 1)
    scene.add(box(3.9, 0.04, 0.14, 0x6f7a84, 0, 1.55 + i * 0.45, -7.9));
  scene.add(trim(4.5, 0.2, 0.2, ACCENT, 0, 5.1, -7.9));
  for (const side of [-1, 1]) scene.add(trim(0.2, 3.9, 0.2, ACCENT, side * 2.15, 3.15, -7.9));
  scene.add(glow(1.6, 0.3, 0.04, ACCENT, 0, 5.65, -7.96));
  for (const x of [-3.6, 3.6]) scene.add(glow(0.45, 0.14, 0.25, WARM, x, 5.3, -7.85)); // wall lamps
  // Rubber bumpers on the edge of the dock, either side of the bay.
  for (const x of [-1.9, 1.9])
    scene.add(box(0.35, 0.6, 0.14, 0x15181b, x, 0.6, DOCK_EDGE_Z + 0.07));
  // Yellow bollards guarding the apron.
  for (const x of [-3.2, 3.2, -7, 7]) scene.add(cylinder(0.12, 1, YELLOW, x, 0.5, -1.6));
};

// A floodlight: a pole, an arm and a glowing lamp head (no point lights, as elsewhere).
const addFloodlight = (scene: Scene, x: number): void => {
  scene.add(cylinder(0.08, 6, STEEL, x, 3, -5));
  scene.add(box(0.15, 0.1, 0.9, STEEL, x, 6, -4.6));
  scene.add(glow(0.8, 0.15, 0.4, WARM, x, 5.9, -4.2));
};

// The camera hangs on a pole at the yard's edge.
const CAMERA_POLE = [8, 4.6, 6] as const;

const addCameraHardware = (scene: Scene): void => {
  scene.add(
    cylinder(0.08, CAMERA_POLE[1], STEEL, CAMERA_POLE[0], CAMERA_POLE[1] / 2, CAMERA_POLE[2]),
  );
  scene.add(box(0.5, 0.26, 0.5, 0x2c3238, CAMERA_POLE[0], CAMERA_POLE[1] + 0.13, CAMERA_POLE[2]));
};

interface DockMount extends Mount {
  fov: number;
}

const MOUNTS: readonly [DockMount, ...DockMount[]] = [
  // Yard: from a pole at the edge of the yard, turned on the roller door and the truck at the dock.
  { position: CAMERA_POLE, heading: -0.52, range: 0.45, sweep: 9, hold: 3, offset: 2, fov: 62 },
];

export const buildLoadingDock = (mountIndex: number): FeedScene => {
  const mount = MOUNTS.at(mountIndex) ?? MOUNTS[0];
  const scene: Scene = base(NIGHT_SKY, 26, 80);
  scene.add(new HemisphereLight(0x6f84b0, 0x1a2230, 1.1));
  const moon = new DirectionalLight(0xaec3ff, 0.8);
  moon.position.set(-6, 14, 8);
  scene.add(moon);

  addYard(scene);
  addWarehouse(scene);
  for (const x of [-9, 9]) addFloodlight(scene, x);
  addCameraHardware(scene);

  const camera = new PerspectiveCamera(mount.fov, ASPECT, 0.1, 70);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    aimCamera(camera, t, mount);
  };
  update(0);
  return { scene, camera, update, load: cancelled => loadLoadingDockModels(scene, cancelled) };
};
