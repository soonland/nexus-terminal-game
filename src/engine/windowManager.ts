export type WindowKind = 'terminal' | 'map' | 'notes' | 'help' | 'briefing' | 'dossier';

export const WINDOW_KINDS: readonly WindowKind[] = [
  'terminal',
  'map',
  'notes',
  'help',
  'briefing',
  'dossier',
];

export interface Viewport {
  width: number;
  height: number;
}

export interface WindowInstance {
  kind: WindowKind;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  open: boolean;
  minimized: boolean;
}

export type WindowManagerState = Record<WindowKind, WindowInstance>;

export const MIN_WINDOW_WIDTH = 280;
export const MIN_WINDOW_HEIGHT = 160;

// How much of a window must remain reachable on-screen.
const VISIBLE_MARGIN = 24;

const DEFAULT_SIZE: Record<WindowKind, { width: number; height: number }> = {
  terminal: { width: 640, height: 420 },
  map: { width: 460, height: 360 },
  notes: { width: 460, height: 360 },
  help: { width: 460, height: 400 },
  briefing: { width: 520, height: 380 },
  dossier: { width: 420, height: 340 },
};

// Cascade offset (in window-count order) so first-time windows don't stack exactly.
const CASCADE_STEP = 32;

export const clampInstance = (instance: WindowInstance, viewport: Viewport): WindowInstance => {
  const width = Math.min(Math.max(instance.width, MIN_WINDOW_WIDTH), viewport.width);
  const height = Math.min(Math.max(instance.height, MIN_WINDOW_HEIGHT), viewport.height);
  const maxX = Math.max(0, viewport.width - VISIBLE_MARGIN);
  const maxY = Math.max(0, viewport.height - VISIBLE_MARGIN);
  const x = Math.min(Math.max(instance.x, 0), maxX);
  const y = Math.min(Math.max(instance.y, 0), maxY);
  return { ...instance, x, y, width, height };
};

export const createDefaultLayout = (viewport: Viewport): WindowManagerState => {
  const state = {} as WindowManagerState;
  WINDOW_KINDS.forEach((kind, i) => {
    const size = DEFAULT_SIZE[kind];
    const raw: WindowInstance = {
      kind,
      x: 24 + i * CASCADE_STEP,
      y: 24 + i * CASCADE_STEP,
      width: size.width,
      height: size.height,
      zIndex: kind === 'terminal' ? WINDOW_KINDS.length : i + 1,
      open: kind === 'terminal',
      minimized: false,
    };
    state[kind] = clampInstance(raw, viewport);
  });
  return state;
};

const nextZIndex = (state: WindowManagerState): number =>
  Math.max(...WINDOW_KINDS.map(k => state[k].zIndex)) + 1;

export const focusWindow = (state: WindowManagerState, kind: WindowKind): WindowManagerState => ({
  ...state,
  [kind]: { ...state[kind], zIndex: nextZIndex(state) },
});

export const openWindow = (state: WindowManagerState, kind: WindowKind): WindowManagerState =>
  focusWindow({ ...state, [kind]: { ...state[kind], open: true, minimized: false } }, kind);

export const closeWindow = (state: WindowManagerState, kind: WindowKind): WindowManagerState => {
  if (kind === 'terminal') return state;
  return { ...state, [kind]: { ...state[kind], open: false } };
};

export const minimizeWindow = (state: WindowManagerState, kind: WindowKind): WindowManagerState => {
  if (kind === 'terminal') return state;
  return { ...state, [kind]: { ...state[kind], minimized: true } };
};

export const restoreWindow = (state: WindowManagerState, kind: WindowKind): WindowManagerState =>
  openWindow(state, kind);

export const moveWindow = (
  state: WindowManagerState,
  kind: WindowKind,
  x: number,
  y: number,
  viewport: Viewport,
): WindowManagerState => ({
  ...state,
  [kind]: clampInstance({ ...state[kind], x, y }, viewport),
});

export const resizeWindow = (
  state: WindowManagerState,
  kind: WindowKind,
  width: number,
  height: number,
  viewport: Viewport,
): WindowManagerState => ({
  ...state,
  [kind]: clampInstance({ ...state[kind], width, height }, viewport),
});
