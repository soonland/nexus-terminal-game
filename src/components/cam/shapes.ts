import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Fog,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  SphereGeometry,
} from 'three';

export const ASPECT = 16 / 9;

export const base = (background: number, fogNear: number, fogFar: number): Scene => {
  const scene = new Scene();
  scene.background = new Color(background);
  scene.fog = new Fog(background, fogNear, fogFar);
  return scene;
};

export const floor = (width: number, depth: number, color: number): Mesh => {
  const mesh = new Mesh(
    new PlaneGeometry(width, depth),
    new MeshStandardMaterial({ color, roughness: 0.9 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
};

export const box = (
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

// A wall: a box tagged so tests can check a room is closed all the way round.
export const wall = (
  w: number,
  h: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number,
): Mesh => {
  const mesh = box(w, h, d, color, x, y, z);
  mesh.name = 'wall';
  return mesh;
};

// A box that emits its own light colour (signs, screens, panels): unaffected by scene lighting.
export const glow = (
  w: number,
  h: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number,
): Mesh => {
  const mesh = new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial({ color }));
  mesh.position.set(x, y, z);
  return mesh;
};

export const cylinder = (
  radius: number,
  height: number,
  color: number,
  x: number,
  y: number,
  z: number,
): Mesh => {
  const mesh = new Mesh(
    new CylinderGeometry(radius, radius, height, 16),
    new MeshStandardMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  return mesh;
};

export const sphere = (radius: number, color: number, x: number, y: number, z: number): Mesh => {
  const mesh = new Mesh(new SphereGeometry(radius, 12, 8), new MeshStandardMaterial({ color }));
  mesh.position.set(x, y, z);
  return mesh;
};

// A see-through pane (glass doors, partitions).
export const glass = (w: number, h: number, d: number, x: number, y: number, z: number): Mesh => {
  const mesh = new Mesh(
    new BoxGeometry(w, h, d),
    new MeshStandardMaterial({ color: 0x9fc4d8, transparent: true, opacity: 0.18 }),
  );
  mesh.position.set(x, y, z);
  return mesh;
};
