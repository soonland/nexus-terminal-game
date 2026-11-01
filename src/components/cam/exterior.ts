import { DirectionalLight, HemisphereLight, PerspectiveCamera } from 'three';
import type { Object3D, Scene } from 'three';
import { floorAccent } from '../../data/cameras';
import { ROAD_Z, loadExteriorModels, trafficX } from './exteriorModels';
import type { Vehicle } from './exteriorModels';
import { aimCamera } from './pan';
import type { Mount } from './pan';
import { ASPECT, base, box, cylinder, floor, glass, glow, trim } from './shapes';
import type { FeedScene } from './scenes';

// The ground floor's accent: IronGate blue.
const ACCENT = floorAccent('ground');

const NIGHT_SKY = 0x0b1220;
const ASPHALT = 0x1c2026;
const PAVEMENT = 0x3a4048;
const FACADE = 0xaeb8c0;

// The street lies along x; IronGate is on the negative-z side and the road runs in front of it. The
// far side has a pavement and, from the models, a row of buildings facing IronGate.
const addStreet = (scene: Scene): void => {
  const road = floor(90, 12, ASPHALT);
  road.position.set(0, 0, ROAD_Z);
  scene.add(road);
  for (const [z, depth] of [
    [-3.5, 5],
    [13.65, 5],
  ] as const) {
    const pavement = floor(90, depth, PAVEMENT);
    pavement.position.set(0, 0.02, z);
    scene.add(pavement);
  }
  scene.add(box(90, 0.16, 0.3, 0x545b64, 0, 0.08, -0.85)); // kerb, IronGate's side
  scene.add(box(90, 0.16, 0.3, 0x545b64, 0, 0.08, 11.3)); // kerb, far side
  // A broken centre line down the road.
  for (let x = -40; x <= 40; x += 6) scene.add(glow(2.4, 0.02, 0.18, 0xc9c27a, x, 0.03, ROAD_Z));
};

// IronGate's frontage: a pale slab, a lit lobby behind glass doors in a blue frame, the company
// sign in blue letter blocks above them, and a blue band along the foot of the wall.
const addFrontage = (scene: Scene): void => {
  scene.add(box(14, 8, 3, FACADE, 0, 4, -7.5));
  scene.add(trim(14.1, 0.5, 0.12, ACCENT, 0, 0.25, -5.94)); // plinth band
  scene.add(trim(14.1, 0.2, 0.12, ACCENT, 0, 5.4, -5.94)); // band above the doors
  scene.add(glow(4.2, 3, 0.04, 0xfff3d6, 0, 1.5, -5.97)); // the lit lobby
  scene.add(glass(4.2, 3, 0.06, 0, 1.5, -5.88));
  // The door frame.
  scene.add(trim(4.6, 0.14, 0.14, ACCENT, 0, 3.07, -5.9));
  for (const side of [-1, 1]) scene.add(trim(0.14, 3, 0.14, ACCENT, side * 2.3, 1.5, -5.9));
  scene.add(box(0.06, 3, 0.08, 0x6f7a84, 0, 1.5, -5.84)); // the door seam
  // Upper windows, lit unevenly: a few offices left on.
  for (let row = 0; row < 2; row += 1) {
    for (let col = -2; col <= 2; col += 1) {
      const lit = (row * 5 + col + 7) % 3 === 0;
      scene.add(glow(1.7, 1.1, 0.04, lit ? 0xffe9b0 : 0x28323d, col * 2.6, 6.2 + row * 1.2, -5.97));
    }
  }
  // The sign: abstract letter blocks and an underline, as in the lobby.
  const letters = [0.5, 0.3, 0.45, 0.3, 0.5, 0.35, 0.4, 0.3, 0.45];
  let x = -2.6;
  for (const width of letters) {
    scene.add(glow(width, 0.42, 0.04, ACCENT, x + width / 2, 4.5, -5.93));
    x += width + 0.18;
  }
  scene.add(glow(5.4, 0.04, 0.04, ACCENT, 0, 4.1, -5.93));
};

// A streetlight: a pole, an arm and a glowing lamp head. No point lights, as elsewhere: the glow
// is a surface, the scene's own light does the shading.
const addStreetlight = (scene: Scene, x: number): void => {
  scene.add(cylinder(0.07, 5.2, 0x4a525b, x, 2.6, -1.4));
  scene.add(box(0.9, 0.08, 0.08, 0x4a525b, x + 0.4, 5.2, -1.4));
  scene.add(glow(0.5, 0.12, 0.3, 0xfff1c9, x + 0.8, 5.12, -1.4));
};

// The cameras hang on IronGate's side of the street and look out across it. A pole on the pavement
// carries the street-level one; the high-angle one sits on the roofline of the frontage.
const CAMERA_POLE = [-6, 5, -1.5] as const;
const ROOFLINE = [0, 8.3, -5.6] as const;

const addCameraHardware = (scene: Scene): void => {
  scene.add(
    cylinder(0.08, CAMERA_POLE[1], 0x4a525b, CAMERA_POLE[0], CAMERA_POLE[1] / 2, CAMERA_POLE[2]),
  );
  scene.add(box(0.5, 0.26, 0.5, 0x2c3238, CAMERA_POLE[0], CAMERA_POLE[1] + 0.13, CAMERA_POLE[2]));
  scene.add(box(0.5, 0.26, 0.5, 0x2c3238, ROOFLINE[0], ROOFLINE[1] - 0.12, ROOFLINE[2] + 0.2));
};

// A mount with its own lens: the high-angle camera is wider than the street-level one.
interface ExteriorMount extends Mount {
  fov: number;
}

const MOUNTS: readonly [ExteriorMount, ...ExteriorMount[]] = [
  // Entrance: from the pole on the pavement, turned across the frontage to the doors and out to the
  // street beyond them.
  { position: CAMERA_POLE, heading: 0.93, range: 0.45, sweep: 8, hold: 3, offset: 1.5, fov: 60 },
  // High angle: from the roofline over the doors, looking down and out across the street with a wide
  // lens and a long sweep that takes in the road running away on both sides and the far pavement.
  { position: ROOFLINE, heading: Math.PI, range: 0.55, sweep: 10, hold: 3, offset: 4, fov: 75 },
];

// The street outside at night, seen from IronGate's side, with a camera panning on its mount. The street is drawn from primitives straight away; the Kenney models arrive through `load`.
export const buildExterior = (mountIndex: number): FeedScene => {
  const mount = MOUNTS.at(mountIndex) ?? MOUNTS[0];
  const scene: Scene = base(NIGHT_SKY, 28, 90);
  scene.add(new HemisphereLight(0x6f84b0, 0x1a2230, 1.1));
  const moon = new DirectionalLight(0xaec3ff, 0.8);
  moon.position.set(-6, 14, 8);
  scene.add(moon);

  addStreet(scene);
  addFrontage(scene);
  for (const x of [-9, 9]) addStreetlight(scene, x);
  addCameraHardware(scene);

  // Vehicles join this list as their models arrive; each frame moves them along the road.
  const traffic: { model: Object3D; vehicle: Vehicle }[] = [];

  const camera = new PerspectiveCamera(mount.fov, ASPECT, 0.1, 90);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    aimCamera(camera, t, mount);
    for (const { model, vehicle } of traffic) model.position.x = trafficX(vehicle, t);
  };
  update(0);
  return {
    scene,
    camera,
    update,
    load: cancelled =>
      loadExteriorModels(scene, cancelled, (model, vehicle) => {
        traffic.push({ model, vehicle });
      }),
  };
};
