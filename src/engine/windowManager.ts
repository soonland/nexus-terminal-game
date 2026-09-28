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

// Must match .window-titlebar's height and .taskbar's height in globals.css —
// clamping needs to know these to keep the title bar reachable above the taskbar.
export const TITLEBAR_HEIGHT = 26;
export const TASKBAR_HEIGHT = 28;

// How much of a window must remain reachable on-screen horizontally.
const HORIZONTAL_VISIBLE_MARGIN = 24;

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
  // The taskbar occupies the bottom TASKBAR_HEIGHT px — nothing may be dragged or
  // resized into that band, or the title bar (and the resize handle) become
  // unreachable with no way to recover except clearing localStorage.
  const usableHeight = Math.max(TITLEBAR_HEIGHT, viewport.height - TASKBAR_HEIGHT);

  const width = Math.min(Math.max(instance.width, MIN_WINDOW_WIDTH), viewport.width);

  const maxX = Math.max(0, viewport.width - HORIZONTAL_VISIBLE_MARGIN);
  const maxY = Math.max(0, usableHeight - TITLEBAR_HEIGHT);
  const x = Math.min(Math.max(instance.x, 0), maxX);
  const y = Math.min(Math.max(instance.y, 0), maxY);

  // Height is capped relative to the window's own (already-clamped) y — not just
  // relative to the top of the screen — so a window already dragged down can't be
  // resized so tall that its bottom edge still slides under the taskbar.
  const maxHeightFromY = Math.max(MIN_WINDOW_HEIGHT, usableHeight - y);
  const height = Math.min(Math.max(instance.height, MIN_WINDOW_HEIGHT), maxHeightFromY);

  return { ...instance, x, y, width, height };
};

export const createDefaultLayout = (viewport: Viewport): WindowManagerState => {
  const state = {} as WindowManagerState;
  // Dense 1..N from the start, with terminal last (highest) — matches the invariant
  // focusWindow/compactZIndices maintain everywhere else, so a freshly created
  // layout is never itself in need of compaction.
  const nonTerminalKinds = WINDOW_KINDS.filter(k => k !== 'terminal');
  WINDOW_KINDS.forEach((kind, i) => {
    const size = DEFAULT_SIZE[kind];
    const zIndex = kind === 'terminal' ? WINDOW_KINDS.length : nonTerminalKinds.indexOf(kind) + 1;
    const raw: WindowInstance = {
      kind,
      x: 24 + i * CASCADE_STEP,
      y: 24 + i * CASCADE_STEP,
      width: size.width,
      height: size.height,
      zIndex,
      open: kind === 'terminal',
      minimized: false,
    };
    state[kind] = clampInstance(raw, viewport);
  });
  return state;
};

const isStrictlyOnTop = (state: WindowManagerState, kind: WindowKind): boolean =>
  WINDOW_KINDS.every(k => k === kind || state[k].zIndex < state[kind].zIndex);

export const isWindowVisible = (state: WindowManagerState, kind: WindowKind): boolean =>
  state[kind].open && !state[kind].minimized;

// Re-ranks every kind to a dense 1..N sequence by current relative order. Used by
// focusWindow (so repeated clicks never grow z-index unboundedly, since every click
// would otherwise write a new, ever-larger value to localStorage) and by
// loadWindowLayout (so a corrupted/hand-edited huge z-index can't break ordering).
export const compactZIndices = (state: WindowManagerState): WindowManagerState => {
  const order = [...WINDOW_KINDS].sort((a, b) => state[a].zIndex - state[b].zIndex);
  const next = { ...state };
  order.forEach((k, i) => {
    next[k] = { ...state[k], zIndex: i + 1 };
  });
  return next;
};

export const focusWindow = (state: WindowManagerState, kind: WindowKind): WindowManagerState => {
  if (isStrictlyOnTop(state, kind)) return state;
  // Give kind a z-index above the current max so it sorts last, then delegate
  // the actual dense reindexing to compactZIndices instead of duplicating it.
  const currentMax = Math.max(...WINDOW_KINDS.map(k => state[k].zIndex));
  const boosted: WindowManagerState = {
    ...state,
    [kind]: { ...state[kind], zIndex: currentMax + 1 },
  };
  return compactZIndices(boosted);
};

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
