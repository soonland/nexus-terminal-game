import type { PerspectiveCamera } from 'three';

const smooth = (x: number): number => x * x * (3 - 2 * x);

// A security-camera pan: sweep one way, hold, sweep back, hold. Returns 0..1, where 0 is one end
// of the sweep and 1 the other. `sweep` and `hold` are in seconds.
export const panPhase = (t: number, sweep: number, hold: number): number => {
  const cycle = 2 * (sweep + hold);
  const m = ((t % cycle) + cycle) % cycle;
  if (m < sweep) return smooth(m / sweep);
  if (m < sweep + hold) return 1;
  if (m < 2 * sweep + hold) return 1 - smooth((m - sweep - hold) / sweep);
  return 0;
};

// The camera's yaw in radians, swinging between -range and +range.
export const panAngle = (t: number, range: number, sweep: number, hold: number): number =>
  (panPhase(t, sweep, hold) * 2 - 1) * range;

// Where a camera hangs and how it pans: position, a heading (0 looks down -z, π looks back down
// +z), and the pan's range in radians, sweep and hold in seconds, and a time offset so rooms do
// not all sweep in step.
export interface Mount {
  position: readonly [number, number, number];
  heading: number;
  range: number;
  sweep: number;
  hold: number;
  offset: number;
}

export const pickMount = (mounts: readonly [Mount, ...Mount[]], index: number): Mount =>
  mounts.at(index) ?? mounts[0];

// Points a camera that stays on its mount along its panning view: ten units ahead, at a fixed
// height.
export const aimCamera = (camera: PerspectiveCamera, t: number, mount: Mount): void => {
  const yaw = mount.heading + panAngle(t + mount.offset, mount.range, mount.sweep, mount.hold);
  camera.lookAt(
    camera.position.x + Math.sin(yaw) * 10,
    1.2,
    camera.position.z - Math.cos(yaw) * 10,
  );
};
