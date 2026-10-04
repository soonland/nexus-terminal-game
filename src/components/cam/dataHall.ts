import { AmbientLight, PerspectiveCamera, PointLight } from 'three';
import type { MeshBasicMaterial, Scene } from 'three';
import { aimCamera, pickMount } from './pan';
import type { Mount } from './pan';
import { ASPECT, base, box, cylinder, floor, glass, glow, wall } from './shapes';
import type { FeedScene } from './scenes';

const MOUNTS: readonly [Mount, ...Mount[]] = [
  { position: [0, 2.6, 7], heading: 0, range: 0.4, sweep: 10, hold: 3, offset: 5 },
];

interface Standby {
  material: MeshBasicMaterial;
  phase: number;
}

// Four rows of sealed cabinets facing the aisles: a standby strip, a grill and a red seal each.
const addCabinets = (scene: Scene): Standby[] => {
  const standby: Standby[] = [];
  let n = 0;
  for (const x of [-6, -2.6, 2.6, 6]) {
    const facing = x < 0 ? 1 : -1;
    for (let i = 0; i < 6; i += 1) {
      const z = -1 - i * 2;
      scene.add(box(1.2, 2.8, 1.4, 0x1a232b, x, 1.4, z));
      const strip = glow(0.04, 2.2, 0.2, 0x4a90e0, x + facing * 0.62, 1.4, z);
      scene.add(strip);
      standby.push({ material: strip.material as MeshBasicMaterial, phase: n });
      scene.add(box(0.02, 0.5, 0.9, 0x0c1013, x + facing * 0.62, 0.6, z));
      scene.add(glow(0.04, 0.08, 1.2, 0xff3a2a, x + facing * 0.62, 2.0, z));
      n += 1;
    }
  }
  return standby;
};

const addShell = (scene: Scene): void => {
  const ground = floor(16, 22, 0x10151a);
  ground.position.z = -3;
  scene.add(ground);
  scene.add(wall(16, 4.2, 0.2, 0x1c242a, 0, 2.1, -14));
  scene.add(wall(16, 4.2, 0.2, 0x1c242a, 0, 2.1, 8));
  for (const x of [-8, 8]) scene.add(wall(0.2, 4.2, 22, 0x1c242a, x, 2.1, -3));
  const ceiling = floor(16, 22, 0x0d1115);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 4.2, -3);
  scene.add(ceiling);
  for (const x of [-4, 0, 4]) scene.add(glow(0.25, 0.04, 16, 0x5aa0ff, x, 4.16, -3));
  for (const x of [-0.9, 0.9]) scene.add(glow(0.05, 0.02, 20, 0x4fa7c8, x, 0.03, -3));
  scene.add(glass(16, 3.4, 0.05, 0, 1.7, 2)); // the glass wall in front of the hall
};

// The vault door at the far end, locked.
const addVault = (scene: Scene): void => {
  scene.add(box(3, 3.2, 0.3, 0x2a3238, 0, 1.6, -13.8));
  const wheel = cylinder(0.5, 0.12, 0x4a5861, 0, 1.6, -13.6);
  wheel.rotation.x = Math.PI / 2;
  scene.add(wheel);
  scene.add(glow(1.6, 0.08, 0.04, 0xff3a2a, 0, 3.3, -13.6));
};

// Data hall B: sealed cold-storage and accelerator cabinets under blue standby light. Empty.
export const buildDataHall = (mountIndex: number): FeedScene => {
  const mount = pickMount(MOUNTS, mountIndex);
  const scene = base(0x03060a, 8, 28);
  scene.add(new AmbientLight(0x7799cc, 1.8));
  const light = new PointLight(0x8ab8ff, 60, 22);
  light.position.set(0, 3.6, -3);
  scene.add(light);

  addShell(scene);
  addVault(scene);
  const standby = addCabinets(scene);

  const camera = new PerspectiveCamera(62, ASPECT, 0.1, 44);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    aimCamera(camera, t, mount);
    for (const s of standby) {
      s.material.color.setHex(Math.sin(t * 0.8 + s.phase) > 0 ? 0x4a90e0 : 0x2a5a9a);
    }
    const stutter = Math.sin(t * 13) * Math.sin(t * 1.7) > 0.95;
    light.intensity = stutter ? 30 : 60;
  };
  update(0);
  return { scene, camera, update };
};
