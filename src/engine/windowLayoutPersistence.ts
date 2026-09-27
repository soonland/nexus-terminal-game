import type { WindowManagerState, Viewport, WindowInstance, WindowKind } from './windowManager';
import { WINDOW_KINDS, createDefaultLayout, clampInstance } from './windowManager';

const WINDOW_LAYOUT_KEY = 'irongate_windows';
const WINDOW_LAYOUT_VERSION = 1;

interface StoredLayout {
  version: number;
  windows: WindowManagerState;
}

export const saveWindowLayout = (state: WindowManagerState): void => {
  try {
    const payload: StoredLayout = { version: WINDOW_LAYOUT_VERSION, windows: state };
    localStorage.setItem(WINDOW_LAYOUT_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[windowLayout] saveWindowLayout failed', e);
  }
};

const isValidInstance = (value: unknown, kind: WindowKind): value is WindowInstance => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.kind === kind &&
    typeof v.x === 'number' &&
    typeof v.y === 'number' &&
    typeof v.width === 'number' &&
    typeof v.height === 'number' &&
    typeof v.zIndex === 'number' &&
    typeof v.open === 'boolean' &&
    typeof v.minimized === 'boolean'
  );
};

export const loadWindowLayout = (viewport: Viewport): WindowManagerState => {
  const fallback = createDefaultLayout(viewport);
  try {
    const raw = localStorage.getItem(WINDOW_LAYOUT_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<StoredLayout>;
    if (parsed.version !== WINDOW_LAYOUT_VERSION || !parsed.windows) return fallback;

    const result = {} as WindowManagerState;
    for (const kind of WINDOW_KINDS) {
      const stored: unknown = parsed.windows[kind];
      const base = isValidInstance(stored, kind) ? stored : fallback[kind];
      result[kind] = clampInstance(base, viewport);
    }

    // The terminal must survive even a corrupted or hand-edited blob.
    result.terminal = { ...result.terminal, open: true, minimized: false };

    return result;
  } catch (e) {
    console.warn('[windowLayout] loadWindowLayout failed, using default', e);
    return fallback;
  }
};
