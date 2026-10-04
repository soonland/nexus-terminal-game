import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  SphereGeometry,
} from 'three';

export const ASPECT = 16 / 9;

const base = (background: number, fogNear: number, fogFar: number): Scene => {
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

// IronGate's rooms: white walls, light tiles, one accent colour per floor, lit around the clock.
export const WALL_WHITE = 0xeef1f3;
const TILE_LIGHT = 0xdde3e7;
const GROUT = 0xaab4bb;
export const CEILING_WHITE = 0xf5f7f8;
const HAZE = 0xe3e8ec;

// A lit, hazy room: a light fog and background instead of black.
export const litBase = (fogNear: number, fogFar: number): Scene => base(HAZE, fogNear, fogFar);

const named = (mesh: Mesh, name: string): Mesh => {
  mesh.name = name;
  return mesh;
};

// Accent trim: a box tagged `trim` so tests can check a room wears its floor's colour.
export const trim = (
  w: number,
  h: number,
  d: number,
  accent: number,
  x: number,
  y: number,
  z: number,
): Mesh => named(box(w, h, d, accent, x, y, z), 'trim');

// A tiled floor: light tiles with grout lines every metre (tagged `grout`) and an accent stripe down
// the middle (tagged `trim`).
export const tiledFloor = (
  scene: Scene,
  width: number,
  depth: number,
  cx: number,
  cz: number,
  accent: number,
): void => {
  const tiles = floor(width, depth, TILE_LIGHT);
  tiles.position.set(cx, 0, cz);
  scene.add(tiles);
  for (let x = Math.ceil(cx - width / 2); x <= cx + width / 2; x += 1) {
    const line = named(floor(0.04, depth, GROUT), 'grout');
    line.position.set(x, 0.01, cz);
    scene.add(line);
  }
  for (let z = Math.ceil(cz - depth / 2); z <= cz + depth / 2; z += 1) {
    const line = named(floor(width, 0.04, GROUT), 'grout');
    line.position.set(cx, 0.01, z);
    scene.add(line);
  }
  const stripe = named(floor(0.5, depth, accent), 'trim');
  stripe.position.set(cx, 0.02, cz);
  scene.add(stripe);
};

// A baseboard and an eye-level band along a wall, in the accent colour. `axis 'x'` is a wall running
// along x at z = `fixed`; `'z'` one running along z at x = `fixed`. `inward` is the sign pointing into
// the room, so the trim sits on the room's side of the wall.
export const wallTrim = (
  scene: Scene,
  accent: number,
  axis: 'x' | 'z',
  length: number,
  fixed: number,
  center: number,
  inward: 1 | -1,
): void => {
  const place = (height: number, y: number, depth: number) => {
    const offset = fixed + (inward * depth) / 2;
    scene.add(
      axis === 'x'
        ? trim(length, height, depth, accent, center, y, offset)
        : trim(depth, height, length, accent, offset, y, center),
    );
  };
  place(0.3, 0.15, 0.1);
  place(0.28, 1.15, 0.08);
};

// Light for a lit room: soft sky/ground fill plus one directional light for shading. No point lights:
// near a white ceiling they burn bright pools into it. Returns the directional light, which the
// room dims for its flicker.
export const litRoom = (scene: Scene): DirectionalLight => {
  scene.add(new HemisphereLight(0xffffff, 0xe6ebee, 1.0));
  const sun = new DirectionalLight(0xffffff, 1.1);
  sun.position.set(4, 8, 6);
  scene.add(sun);
  return sun;
};
