import {
  AmbientLight,
  BoxGeometry,
  Color,
  Fog,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
} from 'three';
import type { Object3D } from 'three';
import type { CameraFeed } from '../../data/cameras';

export interface FeedScene {
  scene: Scene;
  camera: PerspectiveCamera;
  update: (t: number) => void;
}

const ASPECT = 16 / 9;

const base = (background: number, fogNear: number, fogFar: number): Scene => {
  const scene = new Scene();
  scene.background = new Color(background);
  scene.fog = new Fog(background, fogNear, fogFar);
  return scene;
};

const floor = (width: number, depth: number, color: number): Mesh => {
  const mesh = new Mesh(
    new PlaneGeometry(width, depth),
    new MeshStandardMaterial({ color, roughness: 0.9 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
};

const box = (
  w: number,
  h: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number,
): Mesh => {
  const mesh = new Mesh(new BoxGeometry(w, h, d), new MeshStandardMaterial({ color }));
  mesh.position.set(x, y, z);
  return mesh;
};

// An empty lobby at night: a slow camera sweep and one tired ceiling light.
const buildLobby = (): FeedScene => {
  const scene = base(0x05080a, 6, 22);
  scene.add(new AmbientLight(0x88aacc, 1.6));
  const light = new PointLight(0xcfe8ff, 60, 18);
  light.position.set(0, 3.2, -3);
  scene.add(light);

  scene.add(floor(14, 14, 0x1a2228));
  scene.add(box(14, 4, 0.2, 0x222c33, 0, 2, -7));
  for (const x of [-4.5, -1.5, 1.5, 4.5]) scene.add(box(0.5, 4, 0.5, 0x2c3a42, x, 2, -4));
  scene.add(box(4, 1.1, 1, 0x30404a, 0, 0.55, -5.4)); // reception desk
  scene.add(box(1.2, 0.5, 1.2, 0x303a30, -5, 0.25, -1)); // a bench

  const camera = new PerspectiveCamera(60, ASPECT, 0.1, 40);
  camera.position.set(0, 2.6, 5);
  const update = (t: number) => {
    camera.position.x = Math.sin(t * 0.15) * 3;
    camera.lookAt(0, 1.2, -5);
    // Mostly steady, with an occasional stutter.
    const stutter = Math.sin(t * 23) * Math.sin(t * 3.1) > 0.92 ? 0.3 : 1;
    light.intensity = 60 * stutter;
  };
  update(0);
  return { scene, camera, update };
};

interface Led {
  material: MeshBasicMaterial;
  rate: number;
  phase: number;
  color: number;
}

// Two rows of racks; every status LED blinks on its own rhythm.
const buildServerRoom = (): FeedScene => {
  const scene = base(0x020407, 4, 18);
  scene.add(new AmbientLight(0x5577aa, 1.2));
  const light = new PointLight(0x88aaff, 35, 16);
  light.position.set(0, 3, 0);
  scene.add(light);

  scene.add(floor(12, 14, 0x10151a));
  const leds: Led[] = [];
  for (const side of [-2.2, 2.2]) {
    for (let i = 0; i < 6; i += 1) {
      const z = -1 - i * 1.6;
      scene.add(box(1.1, 2.4, 1, 0x1b2630, side, 1.2, z));
      for (let row = 0; row < 3; row += 1) {
        const color = row === 0 ? 0xff3a2a : 0x34ff7a;
        const material = new MeshBasicMaterial({ color });
        const led = new Mesh(new BoxGeometry(0.08, 0.05, 0.02), material);
        const facing = side < 0 ? 0.56 : -0.56;
        led.position.set(side + facing, 0.7 + row * 0.5, z);
        scene.add(led);
        leds.push({ material, rate: 1 + ((i * 3 + row * 7) % 5), phase: i + row, color });
      }
    }
  }

  const camera = new PerspectiveCamera(65, ASPECT, 0.1, 30);
  camera.position.set(0, 2.2, 2);
  const update = (t: number) => {
    camera.position.x = Math.sin(t * 0.1) * 0.8;
    camera.lookAt(0, 1.2, -8);
    for (const led of leds) {
      const on = Math.sin(t * led.rate + led.phase) > -0.2;
      led.material.color.setHex(on ? led.color : 0x101010);
    }
  };
  update(0);
  return { scene, camera, update };
};

// The offline feed has no scene: the viewer shows a card instead.
export const buildScene = (id: CameraFeed['id']): FeedScene | null => {
  if (id === 'cam_01') return buildLobby();
  if (id === 'cam_02') return buildServerRoom();
  return null;
};

const isMesh = (object: Object3D): object is Mesh => 'isMesh' in object && object.isMesh === true;

export const disposeScene = (scene: Scene): void => {
  scene.traverse(object => {
    if (!isMesh(object)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const m of materials) m.dispose();
  });
};
