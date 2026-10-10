export interface View {
  x: number;
  y: number;
  k: number;
}
export interface Size {
  w: number;
  h: number;
}

export const MIN_K = 0.4;
export const MAX_K = 2.5;
const FIT_MAX_K = 1.5;

const clampK = (k: number, max = MAX_K): number => Math.min(max, Math.max(MIN_K, k));

export const zoomAt = (v: View, factor: number, cx: number, cy: number): View => {
  const k = clampK(v.k * factor);
  const ratio = k / v.k;
  return { k, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio };
};

export const panBy = (v: View, dx: number, dy: number): View => ({
  ...v,
  x: v.x + dx,
  y: v.y + dy,
});

export const fitView = (content: Size, box: Size, pad = 24): View => {
  if (content.w <= 0 || content.h <= 0 || box.w <= 0 || box.h <= 0) return { x: 0, y: 0, k: 1 };
  const k = clampK(
    Math.min((box.w - pad * 2) / content.w, (box.h - pad * 2) / content.h),
    FIT_MAX_K,
  );
  return { k, x: (box.w - content.w * k) / 2, y: (box.h - content.h * k) / 2 };
};

export const isVisible = (
  v: View,
  p: { x: number; y: number },
  box: Size,
  margin = 40,
): boolean => {
  const sx = p.x * v.k + v.x;
  const sy = p.y * v.k + v.y;
  return sx >= margin && sx <= box.w - margin && sy >= margin && sy <= box.h - margin;
};

export const centreOn = (v: View, p: { x: number; y: number }, box: Size): View => ({
  ...v,
  x: box.w / 2 - p.x * v.k,
  y: box.h / 2 - p.y * v.k,
});
