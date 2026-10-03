import { describe, it, expect } from 'vitest';
import {
  toggleMaximizeWindow,
  WINDOW_KINDS,
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  TITLEBAR_HEIGHT,
  TASKBAR_HEIGHT,
  createDefaultLayout,
  clampInstance,
  openWindow,
  closeWindow,
  minimizeWindow,
  restoreWindow,
  focusWindow,
  moveWindow,
  resizeWindow,
} from './windowManager';

const VIEWPORT = { width: 1280, height: 800 };

describe('createDefaultLayout', () => {
  it('creates exactly one instance per window kind', () => {
    const layout = createDefaultLayout(VIEWPORT);
    expect(Object.keys(layout).sort()).toEqual([...WINDOW_KINDS].sort());
  });

  it('includes a closed explorer window', () => {
    const layout = createDefaultLayout(VIEWPORT);
    expect(layout.explorer.open).toBe(false);
    expect(layout.explorer.minimized).toBe(false);
  });

  it('only opens the terminal by default', () => {
    const layout = createDefaultLayout(VIEWPORT);
    expect(layout.terminal.open).toBe(true);
    for (const kind of WINDOW_KINDS) {
      if (kind === 'terminal') continue;
      expect(layout[kind].open).toBe(false);
    }
  });

  it('gives every kind a distinct default position (no exact overlap)', () => {
    const layout = createDefaultLayout(VIEWPORT);
    const positions = WINDOW_KINDS.map(k => `${String(layout[k].x)},${String(layout[k].y)}`);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('makes terminal the initially focused (highest z-index) window', () => {
    const layout = createDefaultLayout(VIEWPORT);
    const maxZ = Math.max(...WINDOW_KINDS.map(k => layout[k].zIndex));
    expect(layout.terminal.zIndex).toBe(maxZ);
  });

  it('gives terminal a strictly higher z-index than every other kind (no ties)', () => {
    const layout = createDefaultLayout(VIEWPORT);
    for (const kind of WINDOW_KINDS) {
      if (kind === 'terminal') continue;
      expect(layout.terminal.zIndex).toBeGreaterThan(layout[kind].zIndex);
    }
  });
});

describe('clampInstance', () => {
  it("pulls a window's origin (title bar) back within the viewport from the right/bottom edge", () => {
    const instance = {
      kind: 'map' as const,
      x: 5000,
      y: 5000,
      width: 400,
      height: 300,
      zIndex: 1,
      open: true,
      minimized: false,
    };
    const clamped = clampInstance(instance, VIEWPORT);
    expect(clamped.x).toBeLessThan(VIEWPORT.width);
    expect(clamped.y).toBeLessThan(VIEWPORT.height);
  });

  it('pulls a window back on-screen if it is off the left/top edge', () => {
    const instance = {
      kind: 'map' as const,
      x: -500,
      y: -500,
      width: 400,
      height: 300,
      zIndex: 1,
      open: true,
      minimized: false,
    };
    const clamped = clampInstance(instance, VIEWPORT);
    expect(clamped.x).toBeGreaterThanOrEqual(0);
    expect(clamped.y).toBeGreaterThanOrEqual(0);
  });

  it('never lets the title bar go under the taskbar, even when dragged to the bottom edge', () => {
    const instance = {
      kind: 'terminal' as const,
      x: 0,
      y: 99999,
      width: 400,
      height: 300,
      zIndex: 1,
      open: true,
      minimized: false,
    };
    const clamped = clampInstance(instance, VIEWPORT);
    // The title bar spans [y, y + TITLEBAR_HEIGHT) and must stay fully above the
    // taskbar, which occupies the bottom TASKBAR_HEIGHT px of the viewport.
    expect(clamped.y + TITLEBAR_HEIGHT).toBeLessThanOrEqual(VIEWPORT.height - TASKBAR_HEIGHT);
  });

  it('never resizes a window taller than the space above the taskbar', () => {
    const instance = {
      kind: 'terminal' as const,
      x: 0,
      y: 0,
      width: 400,
      height: 99999,
      zIndex: 1,
      open: true,
      minimized: false,
    };
    const clamped = clampInstance(instance, VIEWPORT);
    expect(clamped.height).toBeLessThanOrEqual(VIEWPORT.height - TASKBAR_HEIGHT);
  });

  it("caps height relative to the window's current y — not just relative to the top of the screen", () => {
    // A window already dragged down (y > 0) must not be resizable so tall that its
    // bottom edge still slides under the taskbar, even though `height` alone would
    // fit if the window started at y=0.
    const instance = {
      kind: 'terminal' as const,
      x: 0,
      y: 300,
      width: 400,
      height: 99999,
      zIndex: 1,
      open: true,
      minimized: false,
    };
    const clamped = clampInstance(instance, VIEWPORT);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(VIEWPORT.height - TASKBAR_HEIGHT);
  });

  it('enforces the minimum width/height', () => {
    const instance = {
      kind: 'map' as const,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      zIndex: 1,
      open: true,
      minimized: false,
    };
    const clamped = clampInstance(instance, VIEWPORT);
    expect(clamped.width).toBeGreaterThanOrEqual(MIN_WINDOW_WIDTH);
    expect(clamped.height).toBeGreaterThanOrEqual(MIN_WINDOW_HEIGHT);
  });
});

describe('openWindow', () => {
  it('opens a closed window and focuses it', () => {
    const layout = createDefaultLayout(VIEWPORT);
    const next = openWindow(layout, 'map');
    expect(next.map.open).toBe(true);
    expect(next.map.minimized).toBe(false);
    const maxZ = Math.max(...WINDOW_KINDS.map(k => next[k].zIndex));
    expect(next.map.zIndex).toBe(maxZ);
  });

  it('is idempotent — opening an already-open window does not duplicate or throw', () => {
    const layout = openWindow(createDefaultLayout(VIEWPORT), 'map');
    expect(() => openWindow(layout, 'map')).not.toThrow();
    const next = openWindow(layout, 'map');
    expect(Object.keys(next)).toEqual(Object.keys(layout));
    expect(next.map.open).toBe(true);
  });
});

describe('closeWindow / minimizeWindow', () => {
  it('closes a non-terminal window', () => {
    const layout = openWindow(createDefaultLayout(VIEWPORT), 'map');
    expect(closeWindow(layout, 'map').map.open).toBe(false);
  });

  it('is a no-op closing/minimizing the terminal', () => {
    const layout = createDefaultLayout(VIEWPORT);
    expect(closeWindow(layout, 'terminal').terminal.open).toBe(true);
    expect(minimizeWindow(layout, 'terminal').terminal.minimized).toBe(false);
  });

  it('is a no-op closing an already-closed window', () => {
    const layout = createDefaultLayout(VIEWPORT); // map starts closed
    expect(() => closeWindow(layout, 'map')).not.toThrow();
    expect(closeWindow(layout, 'map').map.open).toBe(false);
  });

  it('is a no-op minimizing an already-minimized window', () => {
    const layout = minimizeWindow(openWindow(createDefaultLayout(VIEWPORT), 'map'), 'map');
    expect(() => minimizeWindow(layout, 'map')).not.toThrow();
    expect(minimizeWindow(layout, 'map').map.minimized).toBe(true);
  });
});

describe('restoreWindow / focusWindow', () => {
  it('restoring un-minimizes, opens, and focuses', () => {
    let layout = openWindow(createDefaultLayout(VIEWPORT), 'map');
    layout = minimizeWindow(layout, 'map');
    const next = restoreWindow(layout, 'map');
    expect(next.map.minimized).toBe(false);
    expect(next.map.open).toBe(true);
    const maxZ = Math.max(...WINDOW_KINDS.map(k => next[k].zIndex));
    expect(next.map.zIndex).toBe(maxZ);
  });

  it('focusing a window raises it strictly above every other window', () => {
    let layout = openWindow(createDefaultLayout(VIEWPORT), 'map');
    layout = openWindow(layout, 'notes');
    const next = focusWindow(layout, 'map');
    for (const kind of WINDOW_KINDS) {
      if (kind === 'map') continue;
      expect(next.map.zIndex).toBeGreaterThan(next[kind].zIndex);
    }
  });

  it('is a no-op (same reference) when focusing a window that is already strictly on top', () => {
    const layout = openWindow(createDefaultLayout(VIEWPORT), 'map'); // map is now on top
    const next = focusWindow(layout, 'map');
    expect(next).toBe(layout);
  });

  it('keeps z-indices dense (1..N) after repeated focus calls, instead of growing unbounded', () => {
    let layout = createDefaultLayout(VIEWPORT);
    for (let i = 0; i < 50; i++) {
      layout = focusWindow(layout, 'map');
      layout = focusWindow(layout, 'notes');
    }
    const zIndices = WINDOW_KINDS.map(k => layout[k].zIndex).sort((a, b) => a - b);
    expect(zIndices).toEqual(WINDOW_KINDS.map((_, i) => i + 1));
  });
});

describe('moveWindow / resizeWindow', () => {
  it('moves and clamps to viewport', () => {
    const layout = createDefaultLayout(VIEWPORT);
    const next = moveWindow(layout, 'map', 9999, 9999, VIEWPORT);
    expect(next.map.x).toBeLessThanOrEqual(VIEWPORT.width);
    expect(next.map.y).toBeLessThanOrEqual(VIEWPORT.height);
  });

  it('resizes and enforces minimum size', () => {
    const layout = createDefaultLayout(VIEWPORT);
    const next = resizeWindow(layout, 'map', 1, 1, VIEWPORT);
    expect(next.map.width).toBeGreaterThanOrEqual(MIN_WINDOW_WIDTH);
    expect(next.map.height).toBeGreaterThanOrEqual(MIN_WINDOW_HEIGHT);
  });
});

describe('toggleMaximizeWindow', () => {
  it('fills the viewport above the taskbar and remembers prior bounds', () => {
    const layout = createDefaultLayout(VIEWPORT);
    const before = layout.map;
    const next = toggleMaximizeWindow(layout, 'map', VIEWPORT);
    expect(next.map).toMatchObject({
      x: 0,
      y: 0,
      width: VIEWPORT.width,
      height: VIEWPORT.height - TASKBAR_HEIGHT,
      maximized: true,
      restoreBounds: { x: before.x, y: before.y, width: before.width, height: before.height },
    });
  });

  it('restores the original bounds when toggled again', () => {
    const layout = createDefaultLayout(VIEWPORT);
    const before = layout.map;
    const back = toggleMaximizeWindow(
      toggleMaximizeWindow(layout, 'map', VIEWPORT),
      'map',
      VIEWPORT,
    );
    expect(back.map).toEqual({ ...before, maximized: undefined, restoreBounds: undefined });
    expect(back.map.maximized).toBeFalsy();
  });

  it('re-fits to a new viewport and ignores move/resize while maximized', () => {
    const layout = toggleMaximizeWindow(createDefaultLayout(VIEWPORT), 'map', VIEWPORT);
    const small = { width: 900, height: 600 };
    expect(clampInstance(layout.map, small)).toMatchObject({
      width: 900,
      height: 600 - TASKBAR_HEIGHT,
    });
    expect(moveWindow(layout, 'map', 50, 50, VIEWPORT)).toBe(layout);
    expect(resizeWindow(layout, 'map', 300, 300, VIEWPORT)).toBe(layout);
  });
});
