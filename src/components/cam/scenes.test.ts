import { describe, it, expect } from 'vitest';
import { Box3, Mesh, Vector3 } from 'three';
import { buildScene, disposeScene } from './scenes';

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
    expect(meshCount(built!.scene)).toBeGreaterThan(60);
    expect(() => {
      built!.update(0);
      built!.update(12.5);
    }).not.toThrow();
  });

  it('keeps every lobby object inside the room', () => {
    const built = buildScene({ scene: 'lobby', mount: 0 })!;
    built.scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(built.scene);
    expect(box.min.x).toBeGreaterThanOrEqual(-9);
    expect(box.max.x).toBeLessThanOrEqual(9);
    expect(box.max.y).toBeLessThanOrEqual(5);
    expect(box.min.z).toBeGreaterThanOrEqual(-10);
  });

  it('builds the server room with racks and blinking LEDs', () => {
    const built = buildScene({ scene: 'serverRoom', mount: 0 });
    expect(meshCount(built!.scene)).toBeGreaterThan(200);
    expect(() => {
      built!.update(3.3);
    }).not.toThrow();
  });

  it('keeps every server-room object inside the room', () => {
    const built = buildScene({ scene: 'serverRoom', mount: 0 })!;
    built.scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(built.scene);
    expect(box.min.x).toBeGreaterThanOrEqual(-7.5);
    expect(box.max.x).toBeLessThanOrEqual(7.5);
    expect(box.max.y).toBeLessThanOrEqual(4.5);
    expect(box.min.z).toBeGreaterThanOrEqual(-12.5);
  });

  it('pans the lobby camera in place: the view turns, the camera does not move', () => {
    const built = buildScene({ scene: 'lobby', mount: 0 })!;
    built.update(0);
    const from = built.camera.getWorldDirection(new Vector3()).x;
    const position = built.camera.position.clone();
    built.update(7);
    expect(built.camera.getWorldDirection(new Vector3()).x).not.toBeCloseTo(from);
    expect(built.camera.position.equals(position)).toBe(true);
  });

  it('pans the server-room camera in place too', () => {
    const built = buildScene({ scene: 'serverRoom', mount: 0 })!;
    built.update(0);
    const from = built.camera.getWorldDirection(new Vector3()).x;
    built.update(10);
    expect(built.camera.getWorldDirection(new Vector3()).x).not.toBeCloseTo(from);
  });

  it('disposes geometries and materials without throwing', () => {
    const built = buildScene({ scene: 'serverRoom', mount: 0 })!;
    expect(() => {
      disposeScene(built.scene);
    }).not.toThrow();
  });
});

describe('second mounts', () => {
  it.each(['lobby', 'serverRoom'] as const)(
    '%s: mount 1 is another position that also pans in place',
    scene => {
      const first = buildScene({ scene, mount: 0 })!;
      const second = buildScene({ scene, mount: 1 })!;
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
] as const)('scene %s', (scene, minMeshes, maxX, minZ) => {
  it('is dressed, inside its room, and pans in place', () => {
    const built = buildScene({ scene, mount: 0 })!;
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
