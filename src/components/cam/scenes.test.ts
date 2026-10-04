import { describe, it, expect } from 'vitest';
import { Mesh, Vector3 } from 'three';
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
    const built = buildScene('cam_01');
    expect(built).not.toBeNull();
    expect(meshCount(built!.scene)).toBeGreaterThan(4);
    expect(() => {
      built!.update(0);
      built!.update(12.5);
    }).not.toThrow();
  });

  it('builds the server room with racks and blinking LEDs', () => {
    const built = buildScene('cam_02');
    expect(meshCount(built!.scene)).toBeGreaterThan(20);
    expect(() => {
      built!.update(3.3);
    }).not.toThrow();
  });

  it('has no scene for the offline executive-floor feed', () => {
    expect(buildScene('cam_03')).toBeNull();
  });

  it('pans the lobby camera in place: the view turns, the camera does not move', () => {
    const built = buildScene('cam_01')!;
    built.update(0);
    const from = built.camera.getWorldDirection(new Vector3()).x;
    const position = built.camera.position.clone();
    built.update(7);
    expect(built.camera.getWorldDirection(new Vector3()).x).not.toBeCloseTo(from);
    expect(built.camera.position.equals(position)).toBe(true);
  });

  it('pans the server-room camera in place too', () => {
    const built = buildScene('cam_02')!;
    built.update(0);
    const from = built.camera.getWorldDirection(new Vector3()).x;
    built.update(10);
    expect(built.camera.getWorldDirection(new Vector3()).x).not.toBeCloseTo(from);
  });

  it('disposes geometries and materials without throwing', () => {
    const built = buildScene('cam_02')!;
    expect(() => {
      disposeScene(built.scene);
    }).not.toThrow();
  });
});
