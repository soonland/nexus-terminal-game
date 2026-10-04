import {
  AmbientLight,
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PointLight,
} from 'three';
import type { Object3D, Scene } from 'three';
import type { CameraFeed } from '../../data/cameras';
import { buildLobby } from './lobby';
import { panAngle } from './pan';
import { ASPECT, base, box, floor } from './shapes';

export interface FeedScene {
  scene: Scene;
  camera: PerspectiveCamera;
  update: (t: number) => void;
}

interface Led {
  material: MeshBasicMaterial;
  rate: number;
  phase: number;
  color: number;
}

// Two rows of racks; every status LED blinks on its own rhythm.
const buildServerRoom = (): FeedScene => {
  const scene = base(0x020407, 4, 18);
  scene.add(new AmbientLight(0x88aadd, 2.6));
  const light = new PointLight(0xaaccff, 80, 18);
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
    const yaw = panAngle(t + 3, 0.45, 9, 3);
    camera.lookAt(Math.sin(yaw) * 10, 1.2, camera.position.z - Math.cos(yaw) * 10);
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
