import type {
  WindowManagerState,
  Viewport,
  WindowInstance,
  WindowKind,
  WindowBounds,
} from './windowManager';
import {
  WINDOW_KINDS,
  createDefaultLayout,
  clampInstance,
  compactZIndices,
  focusWindow,
} from './windowManager';

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

const isValidBounds = (value: unknown): value is WindowBounds => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.x === 'number' &&
    typeof v.y === 'number' &&
    typeof v.width === 'number' &&
    typeof v.height === 'number'
  );
};

// Drops maximize fields a hand-edited/corrupt blob left inconsistent; a maximized
// window without usable restore bounds simply loads un-maximized.
const sanitizeMaximize = (instance: WindowInstance): WindowInstance => {
  const { maximized, restoreBounds, ...rest } = instance;
  if (maximized === true && isValidBounds(restoreBounds)) {
    return { ...rest, maximized: true, restoreBounds };
  }
  return rest;
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

    let result = {} as WindowManagerState;
    for (const kind of WINDOW_KINDS) {
      const stored: unknown = parsed.windows[kind];
      const base = isValidInstance(stored, kind) ? stored : fallback[kind];
      result[kind] = clampInstance(sanitizeMaximize(base), viewport);
    }

    // A corrupted/hand-edited huge z-index must not break stacking order.
    result = compactZIndices(result);

    // The terminal must survive even a corrupted or hand-edited blob — not just
    // "open", but restored to the top so it's immediately usable, not hidden
    // behind whatever else the blob claimed was open.
    result.terminal = { ...result.terminal, open: true, minimized: false };
    result = focusWindow(result, 'terminal');

    return result;
  } catch (e) {
    console.warn('[windowLayout] loadWindowLayout failed, using default', e);
    return fallback;
  }
};
