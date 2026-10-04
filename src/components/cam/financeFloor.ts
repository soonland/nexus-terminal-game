import { AmbientLight, PerspectiveCamera, PointLight } from 'three';
import type { Mesh, MeshBasicMaterial, Scene } from 'three';
import { aimCamera, pickMount } from './pan';
import type { Mount } from './pan';
import { ASPECT, base, box, cylinder, floor, glass, glow } from './shapes';
import type { FeedScene } from './scenes';

const MOUNTS: readonly [Mount, ...Mount[]] = [
  { position: [0, 2.8, 6.5], heading: 0, range: 0.5, sweep: 9, hold: 3, offset: 2 },
];

const addShell = (scene: Scene): MeshBasicMaterial => {
  const ground = floor(16, 16, 0x151c22);
  ground.position.z = -1;
  scene.add(ground);
  scene.add(box(16, 4.4, 0.2, 0x1d262c, 0, 2.2, -9));
  for (const x of [-8, 8]) scene.add(box(0.2, 4.4, 16, 0x1d262c, x, 2.2, -1));
  const ceiling = floor(16, 16, 0x0e1317);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 4.4, -1);
  scene.add(ceiling);
  let flicker: Mesh | null = null;
  for (const x of [-4, 0, 4]) {
    for (const z of [-6, -2, 2]) {
      const panel = glow(1.8, 0.04, 0.5, 0xcfe8ff, x, 4.36, z);
      scene.add(panel);
      if (x === 0 && z === -2) flicker = panel;
    }
  }
  return (flicker as Mesh).material as MeshBasicMaterial;
};

// Three rows of five desks with paired dormant monitors and chairs, and glass partitions.
const addDesks = (scene: Scene): void => {
  for (const z of [-6.5, -3.5, -0.5]) {
    for (const x of [-6, -3, 0, 3, 6]) {
      scene.add(box(2, 0.06, 0.9, 0x2b353d, x, 0.74, z));
      scene.add(box(2, 0.7, 0.06, 0x20282e, x, 0.38, z - 0.4));
      scene.add(glow(0.55, 0.34, 0.03, 0x14303f, x - 0.5, 1.1, z - 0.2));
      scene.add(glow(0.55, 0.34, 0.03, 0x14303f, x + 0.5, 1.1, z - 0.2));
      scene.add(cylinder(0.25, 0.08, 0x1b2329, x, 0.5, z + 0.9));
      scene.add(cylinder(0.04, 0.45, 0x1b2329, x, 0.25, z + 0.9));
      scene.add(box(0.45, 0.5, 0.07, 0x1b2329, x, 0.85, z + 1.15));
    }
    for (const x of [-4.5, -1.5, 1.5, 4.5]) scene.add(glass(0.05, 1.2, 2.0, x, 1.0, z));
  }
};

interface Bar {
  mesh: Mesh;
  phase: number;
  rate: number;
}

// The ticker wall: a row of glowing bars that rise and fall.
const addTickerWall = (scene: Scene): Bar[] => {
  scene.add(glow(13.5, 0.03, 0.05, 0x7fb4cf, 0, 1.0, -8.85));
  const bars: Bar[] = [];
  for (let i = 0; i < 14; i += 1) {
    const mesh = glow(0.5, 1, 0.05, i % 2 === 0 ? 0x34ff7a : 0xff3a2a, -6.5 + i, 1.5, -8.85);
    scene.add(mesh);
    bars.push({ mesh, phase: i * 0.9, rate: 0.4 + (i % 4) * 0.15 });
  }
  return bars;
};

// The finance floor after hours: desks, partitions, a ticker wall still moving. Empty.
export const buildFinanceFloor = (mountIndex: number): FeedScene => {
  const mount = pickMount(MOUNTS, mountIndex);
  const scene = base(0x04070a, 10, 28);
  scene.add(new AmbientLight(0x88aacc, 1.5));
  const light = new PointLight(0xcfe8ff, 55, 20);
  light.position.set(0, 3.8, -2);
  scene.add(light);

  const flickerMaterial = addShell(scene);
  addDesks(scene);
  const bars = addTickerWall(scene);

  const camera = new PerspectiveCamera(62, ASPECT, 0.1, 44);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    aimCamera(camera, t, mount);
    for (const bar of bars) {
      const height = 0.6 + (Math.sin(t * bar.rate + bar.phase) + 1) * 0.9;
      bar.mesh.scale.y = height;
      bar.mesh.position.y = 1.0 + height / 2;
    }
    const stutter = Math.sin(t * 21) * Math.sin(t * 2.9) > 0.94;
    flickerMaterial.color.setHex(stutter ? 0x383c40 : 0xcfe8ff);
    light.intensity = stutter ? 25 : 55;
  };
  update(0);
  return { scene, camera, update };
};
