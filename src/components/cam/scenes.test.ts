import { describe, it, expect } from 'vitest';
import type { MeshBasicMaterial, MeshStandardMaterial } from 'three';
import {
  Box3,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  PointLight,
  Raycaster,
  Scene,
  Vector3,
} from 'three';
import { CAMERA_FEEDS, FLOORS } from '../../data/cameras';
import { buildScene, disposeScene } from './scenes';
import { WALL_WHITE, tiledFloor, wallTrim } from './shapes';

const meshCount = (root: { traverse: (cb: (o: object) => void) => void }): number => {
  let n = 0;
  root.traverse(o => {
    if (o instanceof Mesh) n += 1;
  });
  return n;
};

describe('camera scenes', () => {
  it('builds the lobby with geometry and an update function', () => {
    const built = buildScene({ scene: 'lobby', mount: 0 });
    expect(built).not.toBeNull();
    expect(meshCount(built.scene)).toBeGreaterThan(60);
    expect(() => {
      built.update(0);
      built.update(12.5);
    }).not.toThrow();
  });

  it('keeps every lobby object inside the room', () => {
    const built = buildScene({ scene: 'lobby', mount: 0 });
    built.scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(built.scene);
    expect(box.min.x).toBeGreaterThanOrEqual(-9);
    expect(box.max.x).toBeLessThanOrEqual(9);
    expect(box.max.y).toBeLessThanOrEqual(5);
    expect(box.min.z).toBeGreaterThanOrEqual(-10);
  });

  it('builds the server room with racks and blinking LEDs', () => {
    const built = buildScene({ scene: 'serverRoom', mount: 0 });
    expect(meshCount(built.scene)).toBeGreaterThan(200);
    expect(() => {
      built.update(3.3);
    }).not.toThrow();
  });

  it('keeps every server-room object inside the room', () => {
    const built = buildScene({ scene: 'serverRoom', mount: 0 });
    built.scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(built.scene);
    expect(box.min.x).toBeGreaterThanOrEqual(-7.5);
    expect(box.max.x).toBeLessThanOrEqual(7.5);
    expect(box.max.y).toBeLessThanOrEqual(4.5);
    expect(box.min.z).toBeGreaterThanOrEqual(-12.5);
  });

  it('pans the lobby camera in place: the view turns, the camera does not move', () => {
    const built = buildScene({ scene: 'lobby', mount: 0 });
    built.update(0);
    const from = built.camera.getWorldDirection(new Vector3()).x;
    const position = built.camera.position.clone();
    built.update(7);
    expect(built.camera.getWorldDirection(new Vector3()).x).not.toBeCloseTo(from);
    expect(built.camera.position.equals(position)).toBe(true);
  });

  it('pans the server-room camera in place too', () => {
    const built = buildScene({ scene: 'serverRoom', mount: 0 });
    built.update(0);
    const from = built.camera.getWorldDirection(new Vector3()).x;
    built.update(10);
    expect(built.camera.getWorldDirection(new Vector3()).x).not.toBeCloseTo(from);
  });

  it('disposes geometries and materials without throwing', () => {
    const built = buildScene({ scene: 'serverRoom', mount: 0 });
    expect(() => {
      disposeScene(built.scene);
    }).not.toThrow();
  });
});

describe('second mounts', () => {
  it.each(['lobby', 'serverRoom'] as const)(
    '%s: mount 1 is another position that also pans in place',
    scene => {
      const first = buildScene({ scene, mount: 0 });
      const second = buildScene({ scene, mount: 1 });
      expect(second.camera.position.equals(first.camera.position)).toBe(false);
      second.update(0);
      const from = second.camera.getWorldDirection(new Vector3()).x;
      const position = second.camera.position.clone();
      second.update(10);
      expect(second.camera.getWorldDirection(new Vector3()).x).not.toBeCloseTo(from);
      expect(second.camera.position.equals(position)).toBe(true);
    },
  );
});

describe.each([
  ['securityOffice', 80, 8, -8],
  ['financeFloor', 80, 9, -10],
  ['executiveFloor', 80, 3, -16],
  ['dataHall', 80, 9, -14],
  ['vaultApproach', 60, 2.65, -9],
] as const)('scene %s', (scene, minMeshes, maxX, minZ) => {
  it('is dressed, inside its room, and pans in place', () => {
    const built = buildScene({ scene, mount: 0 });
    expect(built).not.toBeNull();
    expect(meshCount(built.scene)).toBeGreaterThan(minMeshes);
    built.scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(built.scene);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-maxX);
    expect(bounds.max.x).toBeLessThanOrEqual(maxX);
    expect(bounds.max.y).toBeLessThanOrEqual(5);
    expect(bounds.min.z).toBeGreaterThanOrEqual(minZ - 0.5);

    built.update(0);
    const from = built.camera.getWorldDirection(new Vector3()).x;
    const position = built.camera.position.clone();
    built.update(10);
    expect(built.camera.getWorldDirection(new Vector3()).x).not.toBeCloseTo(from);
    expect(built.camera.position.equals(position)).toBe(true);
    expect(() => {
      disposeScene(built.scene);
    }).not.toThrow();
  });
});

describe('every camera has a scene', () => {
  it('builds each feed in the data, and the two executive cameras differ', () => {
    for (const feed of CAMERA_FEEDS) expect(buildScene(feed)).not.toBeNull();
    const corridor = buildScene({ scene: 'executiveFloor', mount: 0 });
    const office = buildScene({ scene: 'executiveFloor', mount: 1 });
    expect(office.camera.position.equals(corridor.camera.position)).toBe(false);
  });
});

describe('every room is closed', () => {
  // Walls are tagged by the builders; a ray looking in any direction from a camera must hit one.
  it.each(CAMERA_FEEDS.map(f => [f.id, f] as const))(
    '%s: no direction from the camera looks out of the room',
    (_id, feed) => {
      const built = buildScene(feed);
      built.scene.updateMatrixWorld(true);
      const raycaster = new Raycaster();
      const missed: number[] = [];
      for (let i = 0; i < 24; i += 1) {
        const angle = (i / 24) * Math.PI * 2;
        raycaster.set(built.camera.position, new Vector3(Math.sin(angle), 0, -Math.cos(angle)));
        const hits = raycaster.intersectObjects(built.scene.children, true);
        if (!hits.some(h => h.object.name === 'wall')) missed.push(i);
      }
      expect(missed).toEqual([]);
    },
  );
});

// Rooms that have been given the building's look; each recolour task adds its feeds here.
const BUILDING_FEEDS: string[] = [
  'lobby-reception',
  'lobby-entrance',
  'server-aisle',
  'server-airlock',
  'security-office',
  'finance-floor',
  'executive-corridor',
  'executive-office',
  'data-hall-b',
  'vault-door',
];

const colourOf = (mesh: Mesh): number =>
  (mesh.material as MeshStandardMaterial | MeshBasicMaterial).color.getHex();

describe('the building look', () => {
  // A point light close to a white ceiling burns a bright pool into it; lit rooms use soft fill and a
  // directional light instead.
  it.each(BUILDING_FEEDS.map(id => [id] as const))('%s: no point lights, so no hot spots', id => {
    const built = buildScene(CAMERA_FEEDS.find(f => f.id === id)!);
    let points = 0;
    built.scene.traverse(o => {
      if (o instanceof PointLight) points += 1;
    });
    expect(points).toBe(0);
  });

  it('has helpers that tag their meshes', () => {
    const scene = new Scene();
    tiledFloor(scene, 6, 6, 0, 0, 0x2b6cb0);
    wallTrim(scene, 0x2b6cb0, 'x', 6, -3, 0, 1);
    const names = scene.children.map(c => c.name);
    expect(names.filter(n => n === 'grout').length).toBeGreaterThan(10);
    expect(names.filter(n => n === 'trim').length).toBeGreaterThanOrEqual(3);
  });

  it.each(BUILDING_FEEDS.map(id => [id] as const))(
    "%s: white walls, a tiled floor and trim in the floor's accent colour",
    id => {
      const feed = CAMERA_FEEDS.find(f => f.id === id)!;
      const built = buildScene(feed);
      const accent = FLOORS.find(f => f.id === feed.floor)!.accent;
      const walls: number[] = [];
      const trims: number[] = [];
      let grout = 0;
      built.scene.traverse(o => {
        if (!(o instanceof Mesh)) return;
        if (o.name === 'wall') walls.push(colourOf(o));
        if (o.name === 'trim') trims.push(colourOf(o));
        if (o.name === 'grout') grout += 1;
      });
      expect(walls.length).toBeGreaterThan(3);
      expect(walls.every(c => c === WALL_WHITE)).toBe(true);
      expect(trims.filter(c => c === accent).length).toBeGreaterThan(6);
      expect(grout).toBeGreaterThan(20);
    },
  );
});

describe('the vault approach', () => {
  it('has a door that faces the camera, straight ahead', () => {
    const built = buildScene({ scene: 'vaultApproach', mount: 0 });
    built.scene.updateMatrixWorld(true);
    built.update(0);
    const raycaster = new Raycaster();
    raycaster.set(built.camera.position, built.camera.getWorldDirection(new Vector3()));
    const first = raycaster.intersectObjects(built.scene.children, true).at(0);
    expect(first?.object.name).toBe('vault');
  });

  it('keeps the door in view across the whole drift', () => {
    const built = buildScene({ scene: 'vaultApproach', mount: 0 });
    built.scene.updateMatrixWorld(true);
    const raycaster = new Raycaster();
    for (const t of [0, 4, 8, 14, 20]) {
      built.update(t);
      raycaster.set(built.camera.position, built.camera.getWorldDirection(new Vector3()));
      expect(raycaster.intersectObjects(built.scene.children, true).at(0)?.object.name).toBe(
        'vault',
      );
    }
  });
});

describe('no flicker', () => {
  // Lights and fixtures hold steady; only meshes tagged `blink` (server LEDs, standby strips) pulse,
  // slowly, on purpose.
  it.each(CAMERA_FEEDS.map(f => [f.id, f] as const))(
    '%s: lights and surfaces do not change over time, except the tagged blinkers',
    (_id, feed) => {
      const built = buildScene(feed);
      const snapshot = (): string => {
        const parts: string[] = [];
        built.scene.traverse(o => {
          if (o instanceof DirectionalLight) parts.push(`light:${String(o.intensity)}`);
          if (o instanceof Mesh && o.name !== 'blink') parts.push(`c:${String(colourOf(o))}`);
        });
        return parts.join('|');
      };
      built.update(0);
      const first = snapshot();
      const changed: number[] = [];
      for (let t = 0.37; t < 120; t += 0.37) {
        built.update(t);
        if (snapshot() !== first) changed.push(Math.round(t * 100) / 100);
      }
      expect(changed).toEqual([]);
    },
  );
});

describe('no z-fighting', () => {
  // Two solid boxes that overlap in volume and share a face plane draw that face twice at the same
  // depth, and the GPU flickers between them. Opaque boxes only, and vertical faces only: shared floor
  // and ceiling planes at the room corners are hidden by the floor and ceiling, and surfaces of the
  // same colour cannot visibly fight.
  it.each(CAMERA_FEEDS.map(f => [f.id, f] as const))(
    '%s: no two opaque boxes share a face plane while overlapping',
    (_id, feed) => {
      const built = buildScene(feed);
      built.scene.updateMatrixWorld(true);
      const boxes: { box: Box3; name: string; colour: number }[] = [];
      built.scene.traverse(o => {
        if (!(o instanceof Mesh) || !(o.geometry instanceof BoxGeometry)) return;
        const material = o.material as MeshStandardMaterial | MeshBasicMaterial;
        if (material.transparent) return;
        boxes.push({
          box: new Box3().setFromObject(o),
          name: o.name || 'box',
          colour: colourOf(o),
        });
      });
      const eps = 1e-4;
      const overlap = (a: number, b: number, c: number, d: number) =>
        Math.min(b, d) - Math.max(a, c) > 0.005;
      const clashes: string[] = [];
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i].box;
          const b = boxes[j].box;
          const ox = overlap(a.min.x, a.max.x, b.min.x, b.max.x);
          const oy = overlap(a.min.y, a.max.y, b.min.y, b.max.y);
          const oz = overlap(a.min.z, a.max.z, b.min.z, b.max.z);
          if (!(ox && oy && oz)) continue;
          // Flicker between two surfaces of the same colour cannot be seen.
          if (boxes[i].colour === boxes[j].colour) continue;
          const shared =
            Math.abs(a.min.x - b.min.x) < eps ||
            Math.abs(a.max.x - b.max.x) < eps ||
            Math.abs(a.min.z - b.min.z) < eps ||
            Math.abs(a.max.z - b.max.z) < eps;
          if (shared) {
            clashes.push(
              `${boxes[i].name}@${a.min
                .toArray()
                .map(n => n.toFixed(2))
                .join(',')} / ${boxes[j].name}@${b.min
                .toArray()
                .map(n => n.toFixed(2))
                .join(',')}`,
            );
          }
        }
      }
      expect(clashes.slice(0, 6)).toEqual([]);
    },
  );
});

describe('the lobby entrance', () => {
  it('keeps the wall trim off the glass doors', () => {
    for (const mount of [0, 1]) {
      const built = buildScene({ scene: 'lobby', mount });
      built.scene.updateMatrixWorld(true);
      const across: string[] = [];
      built.scene.traverse(o => {
        if (!(o instanceof Mesh) || o.name !== 'trim') return;
        const b = new Box3().setFromObject(o);
        const onLeftWall = b.min.x < -7.8 && b.max.x < -7.7;
        const band = b.max.y < 1.5 && b.max.y - b.min.y < 0.35 && b.max.z - b.min.z > 1;
        if (onLeftWall && band && b.max.z > 0.45 && b.min.z < 3.55)
          across.push(`${String(b.min.z)}..${String(b.max.z)}`);
      });
      expect(across).toEqual([]);
    }
  });
});
