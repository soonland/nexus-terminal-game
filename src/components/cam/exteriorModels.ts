import type { Object3D, Scene } from 'three';
import { createModelFetcher } from './modelLoader';

// Kenney city models (CC0) for the street outside IronGate, served from public/models/exterior/<pack>/.
// Each .glb finds its colormap at Textures/colormap.png beside it.
export interface ExteriorModel {
  pack: 'commercial' | 'roads' | 'cars';
  file: string;
  position: readonly [number, number, number];
  // Turn about the vertical axis, in radians.
  rotationY: number;
  scale: number;
}

const TOWER_SCALE = 7;
const ROAD_SCALE = 12;
const CAR_SCALE = 1.8;

// IronGate is on the negative-z side and the road runs along x; its centre line is at z = ROAD_Z and
// each tile is one unit wide, scaled up to the road's width. The kerb on IronGate's side is at z = -0.85,
// so the road runs from there to z = 11.15.
export const ROAD_Z = 5.15;
const roadTiles = (): ExteriorModel[] =>
  [-4, -3, -2, -1, 0, 1, 2, 3, 4].map(i => ({
    pack: 'roads',
    file: 'road-straight',
    position: [i * ROAD_SCALE, 0.02, ROAD_Z],
    rotationY: 0,
    scale: ROAD_SCALE,
  }));

export const EXTERIOR_MODELS: readonly ExteriorModel[] = [
  // Towers flanking the IronGate frontage, and a mid-rise further along each side.
  {
    pack: 'commercial',
    file: 'building-skyscraper-a',
    position: [-13, 0, -9],
    rotationY: 0,
    scale: TOWER_SCALE,
  },
  {
    pack: 'commercial',
    file: 'building-skyscraper-b',
    position: [13, 0, -9],
    rotationY: 0,
    scale: TOWER_SCALE,
  },
  {
    pack: 'commercial',
    file: 'building-n',
    position: [-26, 0, -9],
    rotationY: 0,
    scale: TOWER_SCALE - 1,
  },
  {
    pack: 'commercial',
    file: 'building-n',
    position: [26, 0, -9],
    rotationY: 0,
    scale: TOWER_SCALE - 1,
  },
  // The buildings on the far side of the street, turned to face IronGate.
  {
    pack: 'commercial',
    file: 'building-skyscraper-b',
    position: [-24, 0, 22],
    rotationY: Math.PI,
    scale: TOWER_SCALE,
  },
  { pack: 'commercial', file: 'building-n', position: [-6, 0, 22], rotationY: Math.PI, scale: 6 },
  {
    pack: 'commercial',
    file: 'building-skyscraper-a',
    position: [12, 0, 22],
    rotationY: Math.PI,
    scale: TOWER_SCALE,
  },
  { pack: 'commercial', file: 'building-n', position: [30, 0, 22], rotationY: Math.PI, scale: 6 },
  ...roadTiles(),
  // A parked sedan and an SUV at IronGate's kerb. Car models reach 0.3 below their origin.
  {
    pack: 'cars',
    file: 'sedan',
    position: [-7, 0.3 * CAR_SCALE, ROAD_Z - 4.25],
    rotationY: Math.PI / 2,
    scale: CAR_SCALE,
  },
  {
    pack: 'cars',
    file: 'suv',
    position: [8, 0.3 * CAR_SCALE, ROAD_Z - 4.25],
    rotationY: -Math.PI / 2,
    scale: CAR_SCALE,
  },
];

// Traffic: vehicles that drive along the road and loop. `speed` is metres per second along x
// (negative drives towards -x), `x0` where it is at t = 0. The lanes sit clear of the parked cars: +x traffic on the far side of the centre line, -x on the near side.
export interface Vehicle {
  pack: 'cars';
  file: string;
  lane: number;
  x0: number;
  speed: number;
}

// The loop is wider than the view and sits inside the fog, so a vehicle leaves and re-enters unseen.
export const TRAFFIC_SPAN = 140;

export const TRAFFIC: readonly Vehicle[] = [
  { pack: 'cars', file: 'taxi', lane: ROAD_Z + 2.45, x0: -58, speed: 8 },
  { pack: 'cars', file: 'van', lane: ROAD_Z + 2.45, x0: 18, speed: 6.5 },
  { pack: 'cars', file: 'sedan', lane: ROAD_Z - 1.35, x0: 34, speed: -9 },
  { pack: 'cars', file: 'suv', lane: ROAD_Z - 1.35, x0: -36, speed: -7 },
];

// Where a vehicle is along x after `t` seconds, wrapped into the loop.
export const trafficX = (v: Vehicle, t: number): number => {
  const half = TRAFFIC_SPAN / 2;
  return ((((v.x0 + v.speed * t + half) % TRAFFIC_SPAN) + TRAFFIC_SPAN) % TRAFFIC_SPAN) - half;
};

export const exteriorModelUrl = (m: Pick<ExteriorModel, 'pack' | 'file'>): string =>
  `${import.meta.env.BASE_URL}models/exterior/${m.pack}/${m.file}.glb`;

// Adds the models to `scene` as they arrive. A model that fails to load is left out: the street
// is already drawn from primitives, so the feed never depends on them. `cancelled` turns true when the
// feed is stopped, so nothing is added to a scene that has been disposed.
export const loadExteriorModels = async (
  scene: Scene,
  cancelled: () => boolean,
  onVehicle: (model: Object3D, vehicle: Vehicle) => void,
): Promise<void> => {
  const fetchUrl = await createModelFetcher();
  const fetchModel = (m: Pick<ExteriorModel, 'pack' | 'file'>): Promise<Object3D> =>
    fetchUrl(exteriorModelUrl(m));
  await Promise.allSettled(
    EXTERIOR_MODELS.map(async m => {
      const source = await fetchModel(m);
      if (cancelled()) return;
      const model = source.clone();
      model.position.set(...m.position);
      model.rotation.y = m.rotationY;
      model.scale.setScalar(m.scale);
      scene.add(model);
    }),
  );
  await Promise.allSettled(
    TRAFFIC.map(async v => {
      const source = await fetchModel(v);
      if (cancelled()) return;
      const model = source.clone();
      // Car models reach 0.3 below their origin; they face +x when turned a quarter turn.
      model.position.set(trafficX(v, 0), 0.3 * CAR_SCALE, v.lane);
      model.rotation.y = v.speed > 0 ? Math.PI / 2 : -Math.PI / 2;
      model.scale.setScalar(CAR_SCALE);
      scene.add(model);
      onVehicle(model, v);
    }),
  );
};
