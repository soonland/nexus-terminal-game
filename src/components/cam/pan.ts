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
