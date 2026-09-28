# Window Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed single-terminal + at-most-one-centered-modal UI with a
floating, draggable/resizable window manager (Terminal as a protected anchor window,
Map/Notes/Help/Briefing migrated to the new chrome, a new Dossier panel), a taskbar,
and its own persisted layout — in the sleek-minimal visual skin.

**Architecture:** A new pure, DOM-free `windowManager.ts` reducer owns window
position/size/z-order/open/minimized state. A new `Desktop` component (owned by
`App.tsx`, replacing its fixed `<Terminal>` + modal JSX block) renders that state as
`<Window>` instances plus a `<Taskbar>`. Window layout persists to its own
localStorage key, independent of the versioned game save — mirroring how
`engine/themes.ts` already keeps theme choice separate from `persistence.ts`.

**Tech Stack:** React 19, TypeScript (`strictTypeChecked` ESLint), Vitest, React
Testing Library (installed, unused until this plan — see Task 3), pnpm.

**Spec:** `docs/superpowers/specs/2026-09-27-window-manager-design.md`

## Global Constraints

- Window layout state (position/size/z-order/open/minimized) is UI-only — never part
  of `GameState` or the versioned save (`SAVE_KEY`/`SAVE_VERSION` in `persistence.ts`).
- The `terminal` window can never be closed or minimized — enforced inside the
  reducer functions themselves, not by callers remembering to check.
- Every position/size change is clamped to the current viewport — on every
  move/resize call *and* on load *and* on browser-window resize while running.
- Sub-project 1 scope only: Map/Notes/Help/Briefing get new chrome, **not** new
  content — their ASCII `boxRow`-padded body content is unchanged and will visually
  clash with the flat sleek-minimal frame. That's expected, not a bug to fix here.
- No new runtime dependency: RTL (`@testing-library/react`) is already installed;
  do not add `@testing-library/jest-dom` — use plain `screen`/`container` queries and
  Vitest's built-in matchers.
- This repo has zero component tests today (`vitest.config.ts` runs `environment:
  'node'`, `include` only matches `*.test.ts`). New component test files use a
  per-file `// @vitest-environment jsdom` docblock rather than changing the global
  environment, to avoid any risk to the existing 1459 passing tests.
- Mirror existing defensive patterns exactly: `vi.stubGlobal('localStorage', ...)`
  with a hand-rolled mock (see `themes.test.ts`/`persistence.test.ts`), and
  `console.warn('[tag] ...', e)` on caught storage errors (see
  `dossierPersistence.ts`) — `no-console` allows `'warn'` in `src/**`.
- Conventional Commits; `main` is protected — all work lands via PR, never a direct
  push to `main`.

## Review Focus

- **Reopening an already-open window** (typing `map` twice) must not create a
  duplicate instance or throw — it should just (re)focus the existing one.
  → Task 1, `windowManager.test.ts`.
- **Two windows opened for the first time land at different default positions** —
  the default cascade must not stack every kind at an identical `(x, y)`.
  → Task 1, `windowManager.test.ts`.
- **Closing/minimizing something already closed/minimized is a no-op, not a throw.**
  → Task 1, `windowManager.test.ts`.
- **A corrupted or hand-edited layout blob that marks the terminal closed/minimized
  is corrected back**, not trusted — the player's only input surface can never
  disappear because of a bad localStorage value. → Task 2,
  `windowLayoutPersistence.test.ts`.
- **Resizing the actual browser window mid-session** (not just on reload) must
  re-clamp any window that's now out of bounds. → Task 5, `Desktop.test.tsx`.

---

## File Structure

**New files:**
- `src/engine/windowManager.ts` — pure types + reducer functions, no DOM.
- `src/engine/windowManager.test.ts`
- `src/engine/windowLayoutPersistence.ts` — localStorage save/load for the above.
- `src/engine/windowLayoutPersistence.test.ts`
- `src/components/Window.tsx` — generic draggable/resizable chrome.
- `src/components/Window.test.tsx` (jsdom)
- `src/components/Taskbar.tsx`
- `src/components/Taskbar.test.tsx` (jsdom)
- `src/components/Desktop.tsx` — owns state, renders `Window`s + `Taskbar`.
- `src/components/Desktop.test.tsx` (jsdom)
- `src/components/DossierWindow.tsx` — new panel, built in sleek-minimal HTML/CSS.
- `src/components/DossierWindow.test.tsx` (jsdom)

**Modified files:**
- `vitest.config.ts` — `include` gains `src/**/*.test.tsx` (Task 3).
- `src/styles/globals.css` — sleek-minimal window chrome variables/classes (Tasks 3–4).
- `src/engine/commands.ts` — add a `dossier` local no-op case (Task 6).
- `src/components/HelpModal.tsx` — add a `dossier` line to the command list; drop
  `DosModal`/`onClose` (Tasks 6–7).
- `src/components/MapModal.tsx`, `NotesModal.tsx`, `BriefingModal.tsx` — drop
  `DosModal`/`onClose`, return content directly (Task 7).
- `src/components/DosModal.tsx` — deleted once unreferenced (Task 7).
- `src/App.tsx` — replace the 4 modal booleans, the "refocus on all-closed" effect,
  the 5 command branches, and the final render block with `Desktop` wiring (Task 8).
- `CLAUDE.md` — document the window manager and the new `dossier` command (Task 9).

---

### Task 1: `windowManager.ts` — pure state reducer

**Files:**
- Create: `src/engine/windowManager.ts`
- Test: `src/engine/windowManager.test.ts`

**Interfaces:**
- Produces: `WindowKind`, `Viewport`, `WindowInstance`, `WindowManagerState`,
  `WINDOW_KINDS`, `MIN_WINDOW_WIDTH`, `MIN_WINDOW_HEIGHT`, `createDefaultLayout(viewport)`,
  `clampInstance(instance, viewport)`, `openWindow(state, kind)`,
  `closeWindow(state, kind)`, `minimizeWindow(state, kind)`, `restoreWindow(state, kind)`,
  `focusWindow(state, kind)`, `moveWindow(state, kind, x, y, viewport)`,
  `resizeWindow(state, kind, width, height, viewport)` — every later task imports
  from here.

- [ ] **Step 1: Write the failing tests for types, defaults, and clamping**

```ts
// src/engine/windowManager.test.ts
import { describe, it, expect } from 'vitest';
import {
  WINDOW_KINDS,
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
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
    const positions = WINDOW_KINDS.map(k => `${layout[k].x},${layout[k].y}`);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('makes terminal the initially focused (highest z-index) window', () => {
    const layout = createDefaultLayout(VIEWPORT);
    const maxZ = Math.max(...WINDOW_KINDS.map(k => layout[k].zIndex));
    expect(layout.terminal.zIndex).toBe(maxZ);
  });
});

describe('clampInstance', () => {
  it('pulls a window fully back on-screen if it is entirely off the right/bottom edge', () => {
    const instance = { kind: 'map' as const, x: 5000, y: 5000, width: 400, height: 300, zIndex: 1, open: true, minimized: false };
    const clamped = clampInstance(instance, VIEWPORT);
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(VIEWPORT.width);
    expect(clamped.y).toBeLessThanOrEqual(VIEWPORT.height - 1);
  });

  it('pulls a window back on-screen if it is off the left/top edge', () => {
    const instance = { kind: 'map' as const, x: -500, y: -500, width: 400, height: 300, zIndex: 1, open: true, minimized: false };
    const clamped = clampInstance(instance, VIEWPORT);
    expect(clamped.x).toBeGreaterThanOrEqual(0);
    expect(clamped.y).toBeGreaterThanOrEqual(0);
  });

  it('enforces the minimum width/height', () => {
    const instance = { kind: 'map' as const, x: 0, y: 0, width: 10, height: 10, zIndex: 1, open: true, minimized: false };
    const clamped = clampInstance(instance, VIEWPORT);
    expect(clamped.width).toBeGreaterThanOrEqual(MIN_WINDOW_WIDTH);
    expect(clamped.height).toBeGreaterThanOrEqual(MIN_WINDOW_HEIGHT);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/engine/windowManager.test.ts`
Expected: FAIL — `windowManager.ts` doesn't exist yet.

- [ ] **Step 3: Implement types, defaults, and clamping**

```ts
// src/engine/windowManager.ts

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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/engine/windowManager.test.ts`
Expected: PASS (defaults/clamping tests only so far).

- [ ] **Step 5: Write the failing tests for open/close/minimize/restore/focus**

```ts
// append to src/engine/windowManager.test.ts

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
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm vitest run src/engine/windowManager.test.ts`
Expected: FAIL — `openWindow`/`closeWindow`/etc. are not exported yet.

- [ ] **Step 7: Implement the remaining reducer functions**

```ts
// append to src/engine/windowManager.ts

const nextZIndex = (state: WindowManagerState): number =>
  Math.max(...WINDOW_KINDS.map(k => state[k].zIndex)) + 1;

export const focusWindow = (state: WindowManagerState, kind: WindowKind): WindowManagerState => ({
  ...state,
  [kind]: { ...state[kind], zIndex: nextZIndex(state) },
});

export const openWindow = (state: WindowManagerState, kind: WindowKind): WindowManagerState =>
  focusWindow(
    { ...state, [kind]: { ...state[kind], open: true, minimized: false } },
    kind,
  );

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
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm vitest run src/engine/windowManager.test.ts`
Expected: PASS — all tests in the file green.

- [ ] **Step 9: Typecheck, lint, and commit**

Run: `pnpm run build && pnpm run lint`
Expected: both clean.

```bash
git add src/engine/windowManager.ts src/engine/windowManager.test.ts
git commit -m "feat(engine): add pure window manager state reducer"
```

---

### Task 2: `windowLayoutPersistence.ts` — localStorage save/load

**Files:**
- Create: `src/engine/windowLayoutPersistence.ts`
- Test: `src/engine/windowLayoutPersistence.test.ts`

**Interfaces:**
- Consumes: `WindowManagerState`, `Viewport`, `WINDOW_KINDS`, `createDefaultLayout`,
  `clampInstance` from `./windowManager` (Task 1).
- Produces: `saveWindowLayout(state)`, `loadWindowLayout(viewport)` — `Desktop`
  (Task 5) calls both.

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/windowLayoutPersistence.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveWindowLayout, loadWindowLayout } from './windowLayoutPersistence';
import { createDefaultLayout, WINDOW_KINDS } from './windowManager';

const VIEWPORT = { width: 1280, height: 800 };

function makeMockStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  };
}

describe('windowLayoutPersistence', () => {
  let mockStorage: ReturnType<typeof makeMockStorage>;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
  });

  it('round-trips a saved layout', () => {
    const layout = createDefaultLayout(VIEWPORT);
    saveWindowLayout(layout);
    const loaded = loadWindowLayout(VIEWPORT);
    expect(loaded).toEqual(layout);
  });

  it('falls back to a default layout when nothing is stored', () => {
    const loaded = loadWindowLayout(VIEWPORT);
    expect(loaded).toEqual(createDefaultLayout(VIEWPORT));
  });

  it('falls back to a default layout on corrupt JSON', () => {
    mockStorage.getItem.mockReturnValueOnce('{not json');
    const loaded = loadWindowLayout(VIEWPORT);
    expect(loaded).toEqual(createDefaultLayout(VIEWPORT));
  });

  it('falls back to a default layout on a version mismatch', () => {
    mockStorage.getItem.mockReturnValueOnce(
      JSON.stringify({ version: 999, windows: createDefaultLayout(VIEWPORT) }),
    );
    const loaded = loadWindowLayout(VIEWPORT);
    expect(loaded).toEqual(createDefaultLayout(VIEWPORT));
  });

  it('re-clamps a layout saved at a larger viewport', () => {
    const bigLayout = createDefaultLayout({ width: 3000, height: 2000 });
    saveWindowLayout(bigLayout);
    const loaded = loadWindowLayout(VIEWPORT);
    for (const kind of WINDOW_KINDS) {
      expect(loaded[kind].x).toBeLessThanOrEqual(VIEWPORT.width);
      expect(loaded[kind].y).toBeLessThanOrEqual(VIEWPORT.height);
    }
  });

  it('never trusts a stored layout that marks the terminal closed or minimized', () => {
    const corrupted = createDefaultLayout(VIEWPORT);
    corrupted.terminal.open = false;
    corrupted.terminal.minimized = true;
    mockStorage.getItem.mockReturnValueOnce(
      JSON.stringify({ version: 1, windows: corrupted }),
    );
    const loaded = loadWindowLayout(VIEWPORT);
    expect(loaded.terminal.open).toBe(true);
    expect(loaded.terminal.minimized).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/engine/windowLayoutPersistence.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement save/load**

```ts
// src/engine/windowLayoutPersistence.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/engine/windowLayoutPersistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, and commit**

Run: `pnpm run build && pnpm run lint`

```bash
git add src/engine/windowLayoutPersistence.ts src/engine/windowLayoutPersistence.test.ts
git commit -m "feat(engine): add window layout localStorage persistence"
```

---

### Task 3: `Window.tsx` — draggable/resizable chrome + test infrastructure

This task also sets up component testing for the whole project (see Global
Constraints) — it's the first task that needs a DOM.

**Files:**
- Modify: `vitest.config.ts:8` (the `include` array)
- Modify: `src/styles/globals.css` (append sleek-minimal window chrome section)
- Create: `src/components/Window.tsx`
- Test: `src/components/Window.test.tsx`

**Interfaces:**
- Consumes: `WindowInstance`, `MIN_WINDOW_WIDTH`, `MIN_WINDOW_HEIGHT` from
  `../engine/windowManager` (Task 1).
- Produces: `Window` component with props `{ instance: WindowInstance; title: string;
  accentColor: string; closable: boolean; minimizable: boolean; onFocus: () => void;
  onMove: (x: number, y: number) => void; onResize: (width: number, height: number)
  => void; onMinimize: () => void; onClose: () => void; children: ReactNode }` —
  `Desktop` (Task 5) and the modal migration (Task 7) both render this.

- [ ] **Step 1: Enable `.test.tsx` files in Vitest**

```ts
// vitest.config.ts — change the include line
    include: ['api/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
```

- [ ] **Step 2: Write the failing tests**

```tsx
// src/components/Window.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Window } from './Window';
import type { WindowInstance } from '../engine/windowManager';

const baseInstance: WindowInstance = {
  kind: 'map',
  x: 100,
  y: 80,
  width: 400,
  height: 300,
  zIndex: 1,
  open: true,
  minimized: false,
};

const renderWindow = (overrides: Partial<Parameters<typeof Window>[0]> = {}) => {
  const props = {
    instance: baseInstance,
    title: 'NETWORK MAP',
    accentColor: '#55ffaa',
    closable: true,
    minimizable: true,
    onFocus: vi.fn(),
    onMove: vi.fn(),
    onResize: vi.fn(),
    onMinimize: vi.fn(),
    onClose: vi.fn(),
    children: <div>content</div>,
    ...overrides,
  };
  render(<Window {...props} />);
  return props;
};

describe('Window', () => {
  it('renders its title and children', () => {
    renderWindow();
    expect(screen.getByText('NETWORK MAP')).toBeTruthy();
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('calls onFocus when clicked anywhere in the window', () => {
    const props = renderWindow();
    fireEvent.pointerDown(screen.getByText('content'));
    expect(props.onFocus).toHaveBeenCalled();
  });

  it('hides the minimize/close buttons when not closable/minimizable', () => {
    renderWindow({ closable: false, minimizable: false });
    expect(screen.queryByLabelText('Minimize NETWORK MAP')).toBeNull();
    expect(screen.queryByLabelText('Close NETWORK MAP')).toBeNull();
  });

  it('calls onMinimize / onClose from their buttons', () => {
    const props = renderWindow();
    fireEvent.click(screen.getByLabelText('Minimize NETWORK MAP'));
    fireEvent.click(screen.getByLabelText('Close NETWORK MAP'));
    expect(props.onMinimize).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('dragging the title bar calls onMove with the dragged delta', () => {
    const props = renderWindow();
    const titlebar = screen.getByTestId('window-titlebar');
    fireEvent.pointerDown(titlebar, { clientX: 50, clientY: 40 });
    fireEvent.pointerMove(window, { clientX: 70, clientY: 65 });
    expect(props.onMove).toHaveBeenCalledWith(120, 105); // origin (100,80) + delta (20,25)
    fireEvent.pointerUp(window);
    fireEvent.pointerMove(window, { clientX: 200, clientY: 200 });
    expect(props.onMove).toHaveBeenCalledTimes(1); // stopped listening after pointerup
  });

  it('dragging the resize handle calls onResize with the dragged delta', () => {
    const props = renderWindow();
    const handle = screen.getByTestId('window-resize-handle');
    fireEvent.pointerDown(handle, { clientX: 500, clientY: 380 });
    fireEvent.pointerMove(window, { clientX: 560, clientY: 410 });
    expect(props.onResize).toHaveBeenCalledWith(460, 330); // origin (400,300) + delta (60,30)
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/components/Window.test.tsx`
Expected: FAIL — `Window.tsx` doesn't exist yet.

- [ ] **Step 4: Add sleek-minimal window chrome CSS**

```css
/* src/styles/globals.css — append */

/* ── Window manager (sleek-minimal) ─────────────────────────── */
:root {
  --win-bg: #11151c;
  --win-border: #2a3040;
  --win-titlebar-bg: #161a22;
  --win-title-color: #c9d4e6;
  --win-body-color: #c9d4e6;
  --win-desktop-bg: #0b0e14;
}

.window {
  position: absolute;
  background: var(--win-bg);
  border: 1px solid var(--win-border);
  border-top-width: 2px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.window-titlebar {
  height: 26px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 8px;
  background: var(--win-titlebar-bg);
  border-bottom: 1px solid var(--win-border);
  font-family: system-ui, sans-serif;
  font-size: 11px;
  color: var(--win-title-color);
  cursor: move;
  user-select: none;
}

.window-title {
  flex: 1;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.window-controls {
  display: flex;
  gap: 4px;
}

.window-controls button {
  background: transparent;
  border: none;
  color: var(--win-title-color);
  font-family: monospace;
  font-size: 12px;
  cursor: pointer;
  width: 20px;
  height: 20px;
}

.window-controls button:hover {
  background: var(--win-border);
}

.window-body {
  flex: 1;
  overflow: auto;
  padding: 8px;
  color: var(--win-body-color);
  font-family: var(--font-mono);
  font-size: var(--font-size);
  line-height: var(--line-height);
}

.window-resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
}
```

- [ ] **Step 5: Implement `Window.tsx`**

```tsx
// src/components/Window.tsx
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { WindowInstance } from '../engine/windowManager';
import { MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT } from '../engine/windowManager';

interface Props {
  instance: WindowInstance;
  title: string;
  accentColor: string;
  closable: boolean;
  minimizable: boolean;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  onMinimize: () => void;
  onClose: () => void;
  children: ReactNode;
}

interface DragOrigin {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

interface ResizeOrigin {
  startX: number;
  startY: number;
  originWidth: number;
  originHeight: number;
}

export const Window = ({
  instance,
  title,
  accentColor,
  closable,
  minimizable,
  onFocus,
  onMove,
  onResize,
  onMinimize,
  onClose,
  children,
}: Props) => {
  const dragOrigin = useRef<DragOrigin | null>(null);
  const resizeOrigin = useRef<ResizeOrigin | null>(null);

  const handleTitleBarPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      dragOrigin.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: instance.x,
        originY: instance.y,
      };
    },
    [instance.x, instance.y],
  );

  const handleResizeHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      resizeOrigin.current = {
        startX: e.clientX,
        startY: e.clientY,
        originWidth: instance.width,
        originHeight: instance.height,
      };
    },
    [instance.width, instance.height],
  );

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (dragOrigin.current) {
        const d = dragOrigin.current;
        onMove(d.originX + (e.clientX - d.startX), d.originY + (e.clientY - d.startY));
      }
      if (resizeOrigin.current) {
        const r = resizeOrigin.current;
        onResize(
          Math.max(MIN_WINDOW_WIDTH, r.originWidth + (e.clientX - r.startX)),
          Math.max(MIN_WINDOW_HEIGHT, r.originHeight + (e.clientY - r.startY)),
        );
      }
    };
    const handlePointerUp = () => {
      dragOrigin.current = null;
      resizeOrigin.current = null;
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [onMove, onResize]);

  return (
    <div
      className="window"
      style={{
        left: instance.x,
        top: instance.y,
        width: instance.width,
        height: instance.height,
        zIndex: instance.zIndex,
        borderTopColor: accentColor,
      }}
      onPointerDown={onFocus}>
      <div
        className="window-titlebar"
        data-testid="window-titlebar"
        onPointerDown={handleTitleBarPointerDown}>
        <span className="window-title">{title}</span>
        <span className="window-controls">
          {minimizable && (
            <button type="button" aria-label={`Minimize ${title}`} onClick={onMinimize}>
              &ndash;
            </button>
          )}
          {closable && (
            <button type="button" aria-label={`Close ${title}`} onClick={onClose}>
              &times;
            </button>
          )}
        </span>
      </div>
      <div className="window-body">{children}</div>
      <div
        className="window-resize-handle"
        data-testid="window-resize-handle"
        onPointerDown={handleResizeHandlePointerDown}
      />
    </div>
  );
};
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run src/components/Window.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck, lint, and commit**

Run: `pnpm run build && pnpm run lint`

```bash
git add vitest.config.ts src/styles/globals.css src/components/Window.tsx src/components/Window.test.tsx
git commit -m "feat(ui): add draggable/resizable Window chrome component"
```

---

### Task 4: `Taskbar.tsx`

**Files:**
- Modify: `src/styles/globals.css` (append taskbar section)
- Create: `src/components/Taskbar.tsx`
- Test: `src/components/Taskbar.test.tsx`

**Interfaces:**
- Consumes: `WindowKind`, `WindowManagerState` from `../engine/windowManager`.
- Produces: `Taskbar` component with props `{ state: WindowManagerState; titles:
  Record<WindowKind, string>; onEntryClick: (kind: WindowKind) => void }` —
  `Desktop` (Task 5) renders this and decides what `onEntryClick` does (open,
  restore, or no-op) based on the clicked kind's current state.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/Taskbar.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Taskbar } from './Taskbar';
import { createDefaultLayout, openWindow, minimizeWindow, WINDOW_KINDS } from '../engine/windowManager';
import type { WindowKind } from '../engine/windowManager';

const TITLES: Record<WindowKind, string> = {
  terminal: 'TERMINAL',
  map: 'NETWORK MAP',
  notes: 'OPERATIVE NOTES',
  help: 'COMMAND REFERENCE',
  briefing: 'OPERATIVE ACTIVATION NOTICE',
  dossier: 'DOSSIER',
};

const VIEWPORT = { width: 1280, height: 800 };

describe('Taskbar', () => {
  it('renders one entry per window kind', () => {
    const state = createDefaultLayout(VIEWPORT);
    render(<Taskbar state={state} titles={TITLES} onEntryClick={vi.fn()} />);
    for (const kind of WINDOW_KINDS) {
      expect(screen.getByText(TITLES[kind])).toBeTruthy();
    }
  });

  it('calls onEntryClick with the clicked kind', () => {
    const state = createDefaultLayout(VIEWPORT);
    const onEntryClick = vi.fn();
    render(<Taskbar state={state} titles={TITLES} onEntryClick={onEntryClick} />);
    fireEvent.click(screen.getByText('NETWORK MAP'));
    expect(onEntryClick).toHaveBeenCalledWith('map');
  });

  it('distinguishes open/focused, minimized, and closed via data-state', () => {
    let state = createDefaultLayout(VIEWPORT);
    state = openWindow(state, 'map'); // open+focused
    state = openWindow(state, 'notes');
    state = minimizeWindow(state, 'notes'); // minimized
    // 'help' stays closed
    render(<Taskbar state={state} titles={TITLES} onEntryClick={vi.fn()} />);
    expect(screen.getByText('NETWORK MAP').closest('[data-state]')).toHaveAttribute(
      'data-state',
      'focused',
    );
    expect(screen.getByText('OPERATIVE NOTES').closest('[data-state]')).toHaveAttribute(
      'data-state',
      'minimized',
    );
    expect(screen.getByText('COMMAND REFERENCE').closest('[data-state]')).toHaveAttribute(
      'data-state',
      'closed',
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/components/Taskbar.test.tsx`
Expected: FAIL — `Taskbar.tsx` doesn't exist yet.

- [ ] **Step 3: Add taskbar CSS**

```css
/* src/styles/globals.css — append */

.taskbar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 28px;
  background: var(--win-titlebar-bg);
  border-top: 1px solid var(--win-border);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  font-family: system-ui, sans-serif;
  font-size: 10px;
  z-index: 10000;
}

.taskbar-entry {
  background: transparent;
  border: 1px solid var(--win-border);
  color: var(--win-title-color);
  padding: 3px 8px;
  cursor: pointer;
  opacity: 0.5;
}

.taskbar-entry[data-state='focused'] {
  opacity: 1;
  border-color: var(--win-title-color);
}

.taskbar-entry[data-state='minimized'] {
  opacity: 0.75;
}
```

- [ ] **Step 4: Implement `Taskbar.tsx`**

```tsx
// src/components/Taskbar.tsx
import type { WindowKind, WindowManagerState } from '../engine/windowManager';
import { WINDOW_KINDS } from '../engine/windowManager';

interface Props {
  state: WindowManagerState;
  titles: Record<WindowKind, string>;
  onEntryClick: (kind: WindowKind) => void;
}

const entryState = (
  state: WindowManagerState,
  kind: WindowKind,
): 'focused' | 'open' | 'minimized' | 'closed' => {
  const instance = state[kind];
  if (!instance.open) return 'closed';
  if (instance.minimized) return 'minimized';
  const maxZ = Math.max(...WINDOW_KINDS.map(k => state[k].zIndex));
  return instance.zIndex === maxZ ? 'focused' : 'open';
};

export const Taskbar = ({ state, titles, onEntryClick }: Props) => (
  <div className="taskbar">
    {WINDOW_KINDS.map(kind => (
      <button
        key={kind}
        type="button"
        className="taskbar-entry"
        data-state={entryState(state, kind)}
        onClick={() => {
          onEntryClick(kind);
        }}>
        {titles[kind]}
      </button>
    ))}
  </div>
);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/components/Taskbar.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck, lint, and commit**

Run: `pnpm run build && pnpm run lint`

```bash
git add src/styles/globals.css src/components/Taskbar.tsx src/components/Taskbar.test.tsx
git commit -m "feat(ui): add Taskbar for reopening/restoring windows"
```

---

### Task 5: `Desktop.tsx` — owns state, renders windows + taskbar

**Files:**
- Modify: `src/styles/globals.css` (append `.desktop` section)
- Create: `src/components/Desktop.tsx`
- Test: `src/components/Desktop.test.tsx`

**Interfaces:**
- Consumes: everything from Task 1 (`windowManager.ts`), Task 2
  (`windowLayoutPersistence.ts`), Task 3 (`Window`), Task 4 (`Taskbar`).
- Produces: `Desktop` (forwardRef component) with props `{ terminal: ReactNode; map:
  ReactNode | null; notes: ReactNode | null; help: ReactNode; briefing: ReactNode;
  dossier: ReactNode; onTerminalFocused: () => void }` and an exposed handle
  `DesktopHandle = { openWindow: (kind: WindowKind) => void }` — `App.tsx` (Task 8)
  renders this in place of its current `<Terminal>` + modal block, and calls
  `desktopRef.current?.openWindow(kind)` from its command handler.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/Desktop.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { createRef } from 'react';
import { Desktop } from './Desktop';
import type { DesktopHandle } from './Desktop';

function makeMockStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  };
}

const renderDesktop = (onTerminalFocused = vi.fn()) => {
  const ref = createRef<DesktopHandle>();
  render(
    <Desktop
      ref={ref}
      terminal={<div>terminal-content</div>}
      map={<div>map-content</div>}
      notes={<div>notes-content</div>}
      help={<div>help-content</div>}
      briefing={<div>briefing-content</div>}
      dossier={<div>dossier-content</div>}
      onTerminalFocused={onTerminalFocused}
    />,
  );
  return ref;
};

describe('Desktop', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeMockStorage());
    vi.stubGlobal('innerWidth', 1280);
    vi.stubGlobal('innerHeight', 800);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('always renders the terminal', () => {
    renderDesktop();
    expect(screen.getByText('terminal-content')).toBeTruthy();
  });

  it('does not render non-terminal windows until opened', () => {
    renderDesktop();
    expect(screen.queryByText('map-content')).toBeNull();
  });

  it('opens a window via the exposed handle', () => {
    const ref = renderDesktop();
    act(() => {
      ref.current?.openWindow('map');
    });
    expect(screen.getByText('map-content')).toBeTruthy();
  });

  it('opening a window via the taskbar shows it', () => {
    renderDesktop();
    fireEvent.click(screen.getByText('NETWORK MAP'));
    expect(screen.getByText('map-content')).toBeTruthy();
  });

  it('minimizing a window via its own button hides it but keeps the taskbar entry', () => {
    renderDesktop();
    fireEvent.click(screen.getByText('NETWORK MAP'));
    fireEvent.click(screen.getByLabelText('Minimize NETWORK MAP'));
    expect(screen.queryByText('map-content')).toBeNull();
    expect(screen.getByText('NETWORK MAP')).toBeTruthy();
  });

  it('the terminal window has no minimize/close buttons', () => {
    renderDesktop();
    expect(screen.queryByLabelText('Minimize TERMINAL')).toBeNull();
    expect(screen.queryByLabelText('Close TERMINAL')).toBeNull();
  });

  it('calls onTerminalFocused when the terminal becomes the focused window', () => {
    const onTerminalFocused = vi.fn();
    renderDesktop(onTerminalFocused);
    onTerminalFocused.mockClear(); // ignore the initial-mount call
    fireEvent.click(screen.getByText('NETWORK MAP')); // focuses map instead
    fireEvent.pointerDown(screen.getByText('terminal-content')); // click back into terminal
    expect(onTerminalFocused).toHaveBeenCalled();
  });

  it('re-clamps windows when the browser window is resized', () => {
    renderDesktop();
    fireEvent.click(screen.getByText('NETWORK MAP'));
    const mapWindow = screen.getByText('map-content').closest('.window') as HTMLElement;
    act(() => {
      vi.stubGlobal('innerWidth', 300);
      vi.stubGlobal('innerHeight', 300);
      window.dispatchEvent(new Event('resize'));
    });
    const styleLeft = Number.parseInt(mapWindow.style.left, 10);
    const styleWidth = Number.parseInt(mapWindow.style.width, 10);
    expect(styleLeft + styleWidth).toBeLessThanOrEqual(300);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/components/Desktop.test.tsx`
Expected: FAIL — `Desktop.tsx` doesn't exist yet.

- [ ] **Step 3: Add desktop CSS**

```css
/* src/styles/globals.css — append */

.desktop {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--win-desktop-bg);
  overflow: hidden;
}
```

- [ ] **Step 4: Implement `Desktop.tsx`**

```tsx
// src/components/Desktop.tsx
import type { ReactNode } from 'react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { WindowKind, WindowManagerState, Viewport } from '../engine/windowManager';
import {
  WINDOW_KINDS,
  openWindow,
  closeWindow,
  minimizeWindow,
  restoreWindow,
  focusWindow,
  moveWindow,
  resizeWindow,
  clampInstance,
} from '../engine/windowManager';
import { loadWindowLayout, saveWindowLayout } from '../engine/windowLayoutPersistence';
import { Window } from './Window';
import { Taskbar } from './Taskbar';

interface Props {
  terminal: ReactNode;
  map: ReactNode | null;
  notes: ReactNode | null;
  help: ReactNode;
  briefing: ReactNode;
  dossier: ReactNode;
  onTerminalFocused: () => void;
}

export interface DesktopHandle {
  openWindow: (kind: WindowKind) => void;
}

const TITLES: Record<WindowKind, string> = {
  terminal: 'TERMINAL',
  map: 'NETWORK MAP',
  notes: 'OPERATIVE NOTES',
  help: 'COMMAND REFERENCE',
  briefing: 'OPERATIVE ACTIVATION NOTICE',
  dossier: 'DOSSIER',
};

const ACCENTS: Record<WindowKind, string> = {
  terminal: '#58a6ff',
  map: '#56d364',
  notes: '#e3b341',
  help: '#a371f7',
  briefing: '#f0883e',
  dossier: '#79c0ff',
};

const currentViewport = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight });

export const Desktop = forwardRef<DesktopHandle, Props>(
  ({ terminal, map, notes, help, briefing, dossier, onTerminalFocused }, ref) => {
    const [state, setState] = useState<WindowManagerState>(() => loadWindowLayout(currentViewport()));
    const onTerminalFocusedRef = useRef(onTerminalFocused);
    onTerminalFocusedRef.current = onTerminalFocused;

    // Notify once on mount if the terminal starts out focused (it does, by default).
    useEffect(() => {
      const maxZ = Math.max(...WINDOW_KINDS.map(k => state[k].zIndex));
      if (state.terminal.zIndex === maxZ) onTerminalFocusedRef.current();
      // Intentionally runs once on mount only.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const handleResize = () => {
        const viewport = currentViewport();
        setState(prev => {
          const next = {} as WindowManagerState;
          for (const kind of WINDOW_KINDS) {
            next[kind] = clampInstance(prev[kind], viewport);
          }
          return next;
        });
      };
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }, []);

    const applyAndMaybeFocusTerminal = useCallback(
      (updater: (prev: WindowManagerState) => WindowManagerState) => {
        setState(prev => {
          const next = updater(prev);
          const maxZ = Math.max(...WINDOW_KINDS.map(k => next[k].zIndex));
          if (next.terminal.zIndex === maxZ && prev.terminal.zIndex !== maxZ) {
            onTerminalFocusedRef.current();
          }
          return next;
        });
      },
      [],
    );

    const handleOpen = useCallback(
      (kind: WindowKind) => {
        applyAndMaybeFocusTerminal(prev => openWindow(prev, kind));
      },
      [applyAndMaybeFocusTerminal],
    );

    useImperativeHandle(ref, () => ({ openWindow: handleOpen }), [handleOpen]);

    const handleTaskbarClick = useCallback(
      (kind: WindowKind) => {
        setState(prev => {
          const instance = prev[kind];
          if (!instance.open) return openWindow(prev, kind);
          if (instance.minimized) return restoreWindow(prev, kind);
          return prev; // already open and focused/visible — no-op
        });
      },
      [],
    );

    const persist = useCallback((next: WindowManagerState) => {
      saveWindowLayout(next);
    }, []);

    const contents: Record<WindowKind, ReactNode | null> = {
      terminal,
      map,
      notes,
      help,
      briefing,
      dossier,
    };

    const visibleKinds = WINDOW_KINDS.filter(
      kind => state[kind].open && !state[kind].minimized && contents[kind] !== null,
    ).sort((a, b) => state[a].zIndex - state[b].zIndex);

    return (
      <div className="desktop">
        {visibleKinds.map(kind => (
          <Window
            key={kind}
            instance={state[kind]}
            title={TITLES[kind]}
            accentColor={ACCENTS[kind]}
            closable={kind !== 'terminal'}
            minimizable={kind !== 'terminal'}
            onFocus={() => {
              applyAndMaybeFocusTerminal(prev => focusWindow(prev, kind));
            }}
            onMove={(x, y) => {
              setState(prev => {
                const next = moveWindow(prev, kind, x, y, currentViewport());
                persist(next);
                return next;
              });
            }}
            onResize={(width, height) => {
              setState(prev => {
                const next = resizeWindow(prev, kind, width, height, currentViewport());
                persist(next);
                return next;
              });
            }}
            onMinimize={() => {
              setState(prev => {
                const next = minimizeWindow(prev, kind);
                persist(next);
                return next;
              });
            }}
            onClose={() => {
              setState(prev => {
                const next = closeWindow(prev, kind);
                persist(next);
                return next;
              });
            }}>
            {contents[kind]}
          </Window>
        ))}
        <Taskbar state={state} titles={TITLES} onEntryClick={handleTaskbarClick} />
      </div>
    );
  },
);

Desktop.displayName = 'Desktop';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/components/Desktop.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck, lint, and commit**

Run: `pnpm run build && pnpm run lint`

```bash
git add src/styles/globals.css src/components/Desktop.tsx src/components/Desktop.test.tsx
git commit -m "feat(ui): add Desktop container owning window layout state"
```

---

### Task 6: `DossierWindow.tsx` + new `dossier` command

**Files:**
- Create: `src/components/DossierWindow.tsx`
- Test: `src/components/DossierWindow.test.tsx`
- Modify: `src/engine/commands.ts` (add local `dossier` case)
- Modify: `src/components/HelpModal.tsx` (document the new command)

**Interfaces:**
- Consumes: `Dossier` type from `../types/dossier`.
- Produces: `DossierWindow` component with props `{ dossier: Dossier }` — `App.tsx`
  (Task 8) passes `loadDossier()`'s result.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/DossierWindow.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DossierWindow } from './DossierWindow';
import type { Dossier } from '../types/dossier';

describe('DossierWindow', () => {
  it('shows "no runs completed yet" when the dossier is empty', () => {
    const dossier: Dossier = {
      runsCompleted: 0,
      endings: [],
      ariaMemory: [],
      fullyExplored: false,
    };
    render(<DossierWindow dossier={dossier} />);
    expect(screen.getByText(/no runs completed/i)).toBeTruthy();
  });

  it('lists completed endings and aria memory notes', () => {
    const dossier: Dossier = {
      runsCompleted: 2,
      endings: [
        { ending: 'LEAK', runDepth: 1, timestamp: 1000 },
        { ending: 'FREE', runDepth: 2, timestamp: 2000 },
      ],
      ariaMemory: ['She remembers the note.'],
      fullyExplored: false,
    };
    render(<DossierWindow dossier={dossier} />);
    expect(screen.getByText(/LEAK/)).toBeTruthy();
    expect(screen.getByText(/FREE/)).toBeTruthy();
    expect(screen.getByText('She remembers the note.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/components/DossierWindow.test.tsx`
Expected: FAIL — `DossierWindow.tsx` doesn't exist yet.

- [ ] **Step 3: Implement `DossierWindow.tsx`**

```tsx
// src/components/DossierWindow.tsx
import type { Dossier } from '../types/dossier';

interface Props {
  dossier: Dossier;
}

export const DossierWindow = ({ dossier }: Props) => (
  <div>
    <div>Runs completed: {dossier.runsCompleted}</div>
    <div style={{ marginTop: 8 }}>
      <strong>Endings</strong>
      {dossier.endings.length === 0 ? (
        <div>No runs completed yet.</div>
      ) : (
        <ul>
          {dossier.endings.map((record, i) => (
            <li key={i}>
              {record.ending} — run depth {record.runDepth}
            </li>
          ))}
        </ul>
      )}
    </div>
    <div style={{ marginTop: 8 }}>
      <strong>Aria memory</strong>
      {dossier.ariaMemory.length === 0 ? (
        <div>-- none --</div>
      ) : (
        <ul>
          {dossier.ariaMemory.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  </div>
);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/components/DossierWindow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the `dossier` local command**

```ts
// src/engine/commands.ts — in the local-commands switch, alongside the existing
// 'map'/'notes'/'help'/'briefing' cases:
    case 'dossier':
      result = { lines: [] }; // handled as a window in App
      break;
```

- [ ] **Step 6: Document the new command in `HelpModal.tsx`**

```ts
// src/components/HelpModal.tsx — add to BODY, next to the 'notes' line:
  { text: r('  dossier       -cross-run dossier & aria memory'), color: 'var(--color-system)' },
```

- [ ] **Step 7: Run the full test suite, typecheck, lint, and commit**

Run: `pnpm run test:coverage && pnpm run build && pnpm run lint`

```bash
git add src/components/DossierWindow.tsx src/components/DossierWindow.test.tsx src/engine/commands.ts src/components/HelpModal.tsx
git commit -m "feat(ui): add Dossier window and 'dossier' command"
```

---

### Task 7: Migrate Map/Notes/Help/Briefing to `Window` chrome; delete `DosModal`

**Files:**
- Modify: `src/components/MapModal.tsx`
- Modify: `src/components/NotesModal.tsx`
- Modify: `src/components/HelpModal.tsx`
- Modify: `src/components/BriefingModal.tsx`
- Delete: `src/components/DosModal.tsx`

**Interfaces:**
- Each modal drops its `onClose` prop entirely — `Window` (rendered by `Desktop`)
  now owns close/minimize. `MapModal`/`NotesModal` keep `{ gameState: GameState }` as
  their only prop; `HelpModal`/`BriefingModal` take no props at all.

This task only changes each file's outer wrapper — content generation (the
`boxRow`/`BODY`/`body` arrays) is untouched, per the spec's sub-project-1 scope.

- [ ] **Step 1: Update `MapModal.tsx`**

```tsx
// src/components/MapModal.tsx — replace the import and the final return
import type { GameState } from '../types/game';
import { boxRow } from './dosModalHelpers';

interface Props {
  gameState: GameState;
}

// ...(IW, LAYER_LABELS, mono, and the body/legend-building logic are unchanged)...

export const MapModal = ({ gameState }: Props) => {
  // ...(unchanged body-building logic)...

  return (
    <>
      {[...body, ...legend].map((line, i) => (
        <div key={i} style={{ ...mono, color: line.color }}>
          {line.text}
        </div>
      ))}
    </>
  );
};
```

- [ ] **Step 2: Update `NotesModal.tsx`** the same way (drop `DosModal` import and
  `onClose` from `Props`, wrap the final return in a fragment instead of `<DosModal
  title=" OPERATIVE NOTES " innerWidth={IW} onClose={onClose}>`).

- [ ] **Step 3: Update `HelpModal.tsx`** — drop the `DosModal` import and the `Props`/
  `onClose` entirely (it takes no props):

```tsx
// src/components/HelpModal.tsx — replace the import and final export
import { boxRow } from './dosModalHelpers';

// ...(IW, BODY unchanged, including the 'dossier' line added in Task 6)...

export const HelpModal = () => (
  <>
    {BODY.map((line, i) => (
      <div key={i} style={{ ...mono, color: line.color }}>
        {line.text}
      </div>
    ))}
  </>
);
```

- [ ] **Step 4: Update `BriefingModal.tsx`** the same way — no props at all:

```tsx
// src/components/BriefingModal.tsx — replace the import and final export
import { boxRow } from './dosModalHelpers';

// ...(IW, BODY, mono unchanged)...

export const BriefingModal = () => (
  <>
    {BODY.map((line, i) => (
      <div key={i} style={{ ...mono, color: line.color }}>
        {line.text}
      </div>
    ))}
  </>
);
```

- [ ] **Step 5: Confirm nothing else references `DosModal`, then delete it**

Run: `grep -rn "DosModal" src/ --include="*.tsx" --include="*.ts" | grep -v "\.test\."`
Expected: no output.

```bash
git rm src/components/DosModal.tsx
```

- [ ] **Step 6: Typecheck, lint, knip, and commit**

Run: `pnpm run build && pnpm run lint && pnpm run knip`
Expected: clean (App.tsx still importing these components with the old props will
fail typecheck until Task 8 — if this task is executed standalone, temporarily note
the expected App.tsx errors and proceed; Task 8 resolves them immediately after).

```bash
git add src/components/MapModal.tsx src/components/NotesModal.tsx src/components/HelpModal.tsx src/components/BriefingModal.tsx
git commit -m "refactor(ui): migrate Map/Notes/Help/Briefing to Window chrome"
```

---

### Task 8: Wire `Desktop` into `App.tsx`

**Files:**
- Modify: `src/App.tsx`

This is the integration task — it removes the old modal-boolean plumbing and
replaces it with `Desktop`.

- [ ] **Step 1: Update imports**

```tsx
// src/App.tsx — replace these import lines:
import { BriefingModal } from './components/BriefingModal';
import { MapModal } from './components/MapModal';
import { HelpModal } from './components/HelpModal';
import { NotesModal } from './components/NotesModal';
// with:
import { BriefingModal } from './components/BriefingModal';
import { MapModal } from './components/MapModal';
import { HelpModal } from './components/HelpModal';
import { NotesModal } from './components/NotesModal';
import { DossierWindow } from './components/DossierWindow';
import { Desktop } from './components/Desktop';
import type { DesktopHandle } from './components/Desktop';
```

- [ ] **Step 2: Replace the four modal booleans with a `desktopRef`**

```tsx
// src/App.tsx — remove these four lines:
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
```

```tsx
// src/App.tsx — add alongside the existing `terminalRef`:
  const desktopRef = useRef<DesktopHandle>(null);
```

- [ ] **Step 3: Remove the now-obsolete refocus effect**

```tsx
// src/App.tsx — delete this effect entirely (Desktop's onTerminalFocused
// callback replaces it):
  // Refocus terminal input whenever all modals close
  useEffect(() => {
    if (!helpOpen && !briefingOpen && !mapOpen && !notesOpen) {
      terminalRef.current?.focus();
    }
  }, [helpOpen, briefingOpen, mapOpen, notesOpen]);
```

- [ ] **Step 4: Update the five command branches**

```tsx
// src/App.tsx — replace:
      if (raw.trim().toLowerCase() === 'help') {
        push([makeLine('input', raw)]);
        setHelpOpen(true);
        return;
      }

      if (raw.trim().toLowerCase() === 'briefing') {
        push([makeLine('input', raw)]);
        setBriefingOpen(true);
        return;
      }

      if (raw.trim().toLowerCase() === 'map') {
        push([makeLine('input', raw)]);
        setMapOpen(true);
        return;
      }

      if (raw.trim().toLowerCase() === 'notes') {
        push([makeLine('input', raw)]);
        setNotesOpen(true);
        return;
      }
// with:
      if (raw.trim().toLowerCase() === 'help') {
        push([makeLine('input', raw)]);
        desktopRef.current?.openWindow('help');
        return;
      }

      if (raw.trim().toLowerCase() === 'briefing') {
        push([makeLine('input', raw)]);
        desktopRef.current?.openWindow('briefing');
        return;
      }

      if (raw.trim().toLowerCase() === 'map') {
        push([makeLine('input', raw)]);
        desktopRef.current?.openWindow('map');
        return;
      }

      if (raw.trim().toLowerCase() === 'notes') {
        push([makeLine('input', raw)]);
        desktopRef.current?.openWindow('notes');
        return;
      }

      if (raw.trim().toLowerCase() === 'dossier') {
        push([makeLine('input', raw)]);
        desktopRef.current?.openWindow('dossier');
        return;
      }
```

- [ ] **Step 5: Replace the final render block**

```tsx
// src/App.tsx — replace:
  return (
    <>
      <Terminal
        ref={terminalRef}
        lines={allLines}
        nodeIp={nodeIp}
        trace={trace}
        suggestions={
          appPhase === 'playing' || appPhase === 'aria'
            ? aiSuggestions.length > 0
              ? aiSuggestions
              : gameState
                ? computeContextSuggestions(gameState)
                : []
            : []
        }
        onSubmit={cmd => {
          void handleSubmit(cmd);
        }}
        inputDisabled={inputDisabled}
        inputPrompt={promptStr}
        inputMasked={isMasked}
        inputNoHistory={isNoHistory}
      />
      {helpOpen && (
        <HelpModal
          onClose={() => {
            setHelpOpen(false);
          }}
        />
      )}
      {briefingOpen && (
        <BriefingModal
          onClose={() => {
            setBriefingOpen(false);
          }}
        />
      )}
      {mapOpen && gameState && (
        <MapModal
          gameState={gameState}
          onClose={() => {
            setMapOpen(false);
          }}
        />
      )}
      {notesOpen && gameState && (
        <NotesModal
          gameState={gameState}
          onClose={() => {
            setNotesOpen(false);
          }}
        />
      )}
    </>
  );
};
// with:
  return (
    <Desktop
      ref={desktopRef}
      onTerminalFocused={() => {
        terminalRef.current?.focus();
      }}
      terminal={
        <Terminal
          ref={terminalRef}
          lines={allLines}
          nodeIp={nodeIp}
          trace={trace}
          suggestions={
            appPhase === 'playing' || appPhase === 'aria'
              ? aiSuggestions.length > 0
                ? aiSuggestions
                : gameState
                  ? computeContextSuggestions(gameState)
                  : []
              : []
          }
          onSubmit={cmd => {
            void handleSubmit(cmd);
          }}
          inputDisabled={inputDisabled}
          inputPrompt={promptStr}
          inputMasked={isMasked}
          inputNoHistory={isNoHistory}
        />
      }
      map={gameState ? <MapModal gameState={gameState} /> : null}
      notes={gameState ? <NotesModal gameState={gameState} /> : null}
      help={<HelpModal />}
      briefing={<BriefingModal />}
      dossier={<DossierWindow dossier={loadDossier()} />}
    />
  );
};
```

- [ ] **Step 6: Run the full test suite, typecheck, lint, and knip**

Run: `pnpm run test:coverage && pnpm run build && pnpm run lint && pnpm run knip`
Expected: all clean; test coverage numbers should be roughly unchanged (App.tsx and
components are already excluded from the coverage gate per `vitest.config.ts`).

- [ ] **Step 7: Manually verify in the browser**

Run: `pnpm run dev`, open the app, log in, and confirm: `map`/`notes`/`help`/
`briefing`/`dossier` each open a draggable/resizable window; dragging and resizing
work; the taskbar reopens/restores windows; the terminal cannot be closed or
minimized; reloading the page restores the previous window layout.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): wire Desktop window manager into App"
```

---

### Task 9: Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the "Terminal rendering" section**

Add a new subsection after "Terminal rendering" in `CLAUDE.md` describing the window
manager: `Desktop`/`Window`/`Taskbar` own floating window layout (position/size/
z-order/open/minimized), persisted to its own `localStorage` key (`irongate_windows`)
separate from the versioned game save, following the same pattern as
`engine/themes.ts`. Terminal is a protected anchor window (cannot close/minimize).
Map/Notes/Help/Briefing/Dossier are floating windows opened via their respective
commands or the taskbar.

- [ ] **Step 2: Update the local commands list** (wherever `map`/`notes`/`help`/
  `briefing` are listed) to include `dossier`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the window manager"
```

---

## Self-Review

**Spec coverage:** `windowManager.ts`/`windowLayoutPersistence.ts` (spec's Engine
section) → Tasks 1–2. `Window`/`Desktop`/`Taskbar` (spec's Components section) →
Tasks 3–5. `DossierWindow` + new command → Task 6. Modal chrome migration + `DosModal`
deletion → Task 7. `App.tsx` data-flow wiring (spec's Data flow section) → Task 8.
Sleek-minimal skin → CSS in Tasks 3–5. Terminal-protection and viewport-clamping
error handling → enforced inside Task 1's reducer and exercised by Tasks 1, 2, and 5.
Documentation → Task 9. No spec section is without a task.

**Placeholder scan:** no TBD/TODO; every step has real code, not descriptions of code.

**Type consistency:** `WindowKind`, `WindowInstance`, `WindowManagerState`, `Viewport`
are defined once in Task 1 and imported (never redefined) in every later task.
`DesktopHandle.openWindow(kind)` (Task 5) matches how Task 8 calls
`desktopRef.current?.openWindow('map')`. `TITLES`/`ACCENTS` keys in Task 5's `Desktop`
match `WINDOW_KINDS` exactly (both are `Record<WindowKind, ...>`, so a missing key is
a compile error, not a silent runtime gap).

**Review Focus:** all five items listed above are each pinned to a specific task's
test, as noted next to each one.
