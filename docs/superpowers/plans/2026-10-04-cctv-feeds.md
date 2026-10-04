# CCTV feeds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While the player holds a session on `ops_cctv_ctrl`, the aux pane gets a CAM tab with looping three.js CCTV footage (lobby, server room, a disabled executive-floor feed) and a full-screen toggle.

**Architecture:** Pure derived UI: `cameraFeeds(state)` decides when the tab exists; nothing is saved and no flag is set. Scenes are pure builders in `src/components/cam/scenes.ts`; `render.ts` owns the WebGL renderer and loop. `CamPane` loads `render.ts` with a dynamic `import()` so three.js stays out of the main bundle. A CSS overlay supplies the CCTV look.

**Tech Stack:** React 19, TypeScript, Vite, three.js (+ `@types/three`), Vitest (jsdom for components), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-cctv-feeds-design.md`

## Global Constraints

- No effect on story, casebook, trace, flags or saves; `SAVE_VERSION` stays 6.
- The CAM tab exists only while `currentNodeId === 'ops_cctv_ctrl'` and that node's `accessLevel !== 'none'`.
- Feeds: `cam_01` lobby, `cam_02` server room, `cam_03` executive floor (offline: "FEED DISABLED — CEO OFFICE", no WebGL scene). Labels/text must never contain the secret name (`/aria/i`).
- three.js loads via dynamic `import()` only; the main bundle must not contain it.
- Full screen = the existing pane zoom (`zoomed: 'aux'`); no new shortcut, no browser Fullscreen API.
- Pixel ratio capped at 1.5; render pauses when the tab is not visible or the page is hidden; `prefers-reduced-motion` renders a single still frame.
- WebGL unavailable or chunk load failure → a "NO SIGNAL" card, nothing in the terminal, nothing thrown.
- ESLint strictTypeChecked, arrow functions, Prettier, 75% per-file coverage (`src/components/**` is excluded from coverage), commit subjects lowercase conventional commits, commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Run `pnpm format` first, then `pnpm build`, `pnpm lint`, `pnpm test:coverage`, `pnpm knip` before the final commit/PR.

## Review Focus

- CAM selected, then the player disconnects or leaves the node: the aux pane must fall back to MAP, not render an empty pane (Task 1 `resolveAuxTab`).
- The CAM tab is opened and closed before the lazy chunk resolves, or feeds are switched quickly: a late-resolving import must not start a renderer on a dead canvas (Task 3 test).
- WebGL missing (`WebGLRenderer` throws) or the dynamic import rejects: NO SIGNAL card, no uncaught error (Task 3 tests).
- The pane is hidden behind another zoomed pane or the page tab is hidden: the loop must pause, and resume when visible (Task 3 `setPaused` test).
- A reload while connected to the node: the tab returns because it is derived, and a disconnected save never shows it (Task 1 tests on `cameraFeeds`).

---

### Task 1: Camera data, visibility rule, aux-tab resolution

**Files:**

- Create: `src/data/cameras.ts`
- Create: `src/engine/cameras.ts`
- Create: `src/layout/auxTabs.ts`
- Test: `src/engine/__tests__/cameras.test.ts`
- Test: `src/layout/auxTabs.test.ts`

**Interfaces:**

- Produces: `CAMERA_FEEDS: readonly CameraFeed[]`, `CCTV_NODE_ID`, `type CameraFeed = { id: 'cam_01' | 'cam_02' | 'cam_03'; label: string; offlineReason: string | null }`, `cameraFeeds(state: GameState): readonly CameraFeed[]`, `type AuxTab = 'map' | 'case' | 'cam'`, `availableAuxTabs(hasCam: boolean): readonly AuxTab[]`, `resolveAuxTab(tab: AuxTab, hasCam: boolean): AuxTab`.

- [ ] **Step 1: Write the failing tests**

`src/engine/__tests__/cameras.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cameraFeeds } from '../cameras';
import { CAMERA_FEEDS } from '../../data/cameras';
import { createInitialState } from '../state';
import produce from '../produce';

const onCctv = (access: 'none' | 'user' | 'admin') =>
  produce(createInitialState(), s => {
    s.network.currentNodeId = 'ops_cctv_ctrl';
    s.network.nodes['ops_cctv_ctrl']!.accessLevel = access;
  });

describe('cameraFeeds', () => {
  it('is empty away from the CCTV controller', () => {
    expect(cameraFeeds(createInitialState())).toEqual([]);
  });

  it('is empty on the controller without a session', () => {
    expect(cameraFeeds(onCctv('none'))).toEqual([]);
  });

  it('lists the three feeds with a session, and the executive floor is offline', () => {
    const feeds = cameraFeeds(onCctv('user'));
    expect(feeds.map(f => f.id)).toEqual(['cam_01', 'cam_02', 'cam_03']);
    expect(feeds.filter(f => f.offlineReason !== null).map(f => f.id)).toEqual(['cam_03']);
  });

  it('matches the cameras named in camera_config.ini', () => {
    const state = createInitialState();
    const ini = state.network.nodes['ops_cctv_ctrl']!.files.find(f => f.name === 'camera_config.ini');
    for (const feed of CAMERA_FEEDS) {
      expect(ini?.content).toContain(`${feed.id}=${feed.label.replace(' ', '_')}`);
    }
  });

  it('never uses the secret name in player-visible text', () => {
    for (const feed of CAMERA_FEEDS) {
      expect(`${feed.label} ${feed.offlineReason ?? ''}`).not.toMatch(/aria/i);
    }
  });
});
```

`src/layout/auxTabs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { availableAuxTabs, resolveAuxTab } from './auxTabs';

describe('aux tabs', () => {
  it('offers CAM only when there are feeds', () => {
    expect(availableAuxTabs(false)).toEqual(['map', 'case']);
    expect(availableAuxTabs(true)).toEqual(['map', 'case', 'cam']);
  });

  it('falls back to MAP when CAM is selected but there are no feeds', () => {
    expect(resolveAuxTab('cam', false)).toBe('map');
  });

  it('leaves every other choice alone', () => {
    expect(resolveAuxTab('cam', true)).toBe('cam');
    expect(resolveAuxTab('case', false)).toBe('case');
    expect(resolveAuxTab('map', false)).toBe('map');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/engine/__tests__/cameras.test.ts src/layout/auxTabs.test.ts`
Expected: FAIL — modules `../cameras` / `./auxTabs` not found.

- [ ] **Step 3: Implement**

`src/data/cameras.ts`:

```ts
export const CCTV_NODE_ID = 'ops_cctv_ctrl';

export interface CameraFeed {
  id: 'cam_01' | 'cam_02' | 'cam_03';
  label: string;
  // Set when the feed is offline: shown on a card instead of a live scene.
  offlineReason: string | null;
}

// Matches camera_config.ini on the CCTV controller.
export const CAMERA_FEEDS: readonly CameraFeed[] = [
  { id: 'cam_01', label: 'lobby', offlineReason: null },
  { id: 'cam_02', label: 'server room', offlineReason: null },
  { id: 'cam_03', label: 'executive floor', offlineReason: 'FEED DISABLED — CEO OFFICE' },
];
```

`src/engine/cameras.ts`:

```ts
import { CAMERA_FEEDS, CCTV_NODE_ID } from '../data/cameras';
import type { CameraFeed } from '../data/cameras';
import type { GameState } from '../types/game';

// The CAM tab is derived from where the player is and what they hold: nothing is saved, so a
// reload while connected brings it back and a disconnect removes it.
export const cameraFeeds = (state: GameState): readonly CameraFeed[] => {
  const node = state.network.nodes[CCTV_NODE_ID];
  if (state.network.currentNodeId !== CCTV_NODE_ID || node === undefined) return [];
  return node.accessLevel === 'none' ? [] : CAMERA_FEEDS;
};
```

`src/layout/auxTabs.ts`:

```ts
export type AuxTab = 'map' | 'case' | 'cam';

export const availableAuxTabs = (hasCam: boolean): readonly AuxTab[] =>
  hasCam ? ['map', 'case', 'cam'] : ['map', 'case'];

// A selected CAM tab with no feeds left (disconnected, moved on) shows the map instead.
export const resolveAuxTab = (tab: AuxTab, hasCam: boolean): AuxTab =>
  tab === 'cam' && !hasCam ? 'map' : tab;
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run src/engine/__tests__/cameras.test.ts src/layout/auxTabs.test.ts`
Expected: PASS (8 tests). If the camera_config test fails on the `server_room` form, the ini line is `cam_02=server_room` (underscore) — that is what the test builds with `replace(' ', '_')`.

- [ ] **Step 5: Commit**

```bash
git add src/data/cameras.ts src/engine/cameras.ts src/layout/auxTabs.ts src/engine/__tests__/cameras.test.ts src/layout/auxTabs.test.ts
git commit -m "feat: derive the camera feeds and the cam aux tab" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: three.js dependency, scenes and renderer

**Files:**

- Modify: `package.json`, `pnpm-lock.yaml` (via `pnpm add`)
- Create: `src/components/cam/scenes.ts`
- Create: `src/components/cam/render.ts`
- Test: `src/components/cam/scenes.test.ts`

**Interfaces:**

- Consumes: `CameraFeed['id']` from `src/data/cameras.ts`.
- Produces: `interface FeedScene { scene: Scene; camera: PerspectiveCamera; update: (t: number) => void }`, `buildScene(id: CameraFeed['id']): FeedScene | null` (null for the offline feed), `disposeScene(scene: Scene): void`, and in `render.ts` `interface FeedHandle { setPaused: (paused: boolean) => void; stop: () => void }` and `startFeed(canvas: HTMLCanvasElement, id: CameraFeed['id'], reducedMotion: boolean): FeedHandle` (throws when WebGL is unavailable).

- [ ] **Step 1: Add the dependency**

Run: `pnpm add three && pnpm add -D @types/three`
Expected: both added to `package.json`.

- [ ] **Step 2: Write the failing test**

`src/components/cam/scenes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Mesh } from 'three';
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

  it('moves the camera over time (the lobby sweep)', () => {
    const built = buildScene('cam_01')!;
    built.update(0);
    const x0 = built.camera.position.x;
    built.update(10);
    expect(built.camera.position.x).not.toBe(x0);
  });

  it('disposes geometries and materials without throwing', () => {
    const built = buildScene('cam_02')!;
    expect(() => {
      disposeScene(built.scene);
    }).not.toThrow();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm vitest run src/components/cam/scenes.test.ts`
Expected: FAIL — `./scenes` not found.

- [ ] **Step 4: Implement the scenes**

`src/components/cam/scenes.ts`:

```ts
import {
  AmbientLight,
  BoxGeometry,
  Color,
  Fog,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
} from 'three';
import type { CameraFeed } from '../../data/cameras';

export interface FeedScene {
  scene: Scene;
  camera: PerspectiveCamera;
  update: (t: number) => void;
}

const ASPECT = 16 / 9;

const base = (background: number, fogNear: number, fogFar: number): FeedScene['scene'] => {
  const scene = new Scene();
  scene.background = new Color(background);
  scene.fog = new Fog(background, fogNear, fogFar);
  return scene;
};

const floor = (width: number, depth: number, color: number): Mesh => {
  const mesh = new Mesh(
    new PlaneGeometry(width, depth),
    new MeshStandardMaterial({ color, roughness: 0.9 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
};

const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number) => {
  const mesh = new Mesh(new BoxGeometry(w, h, d), new MeshStandardMaterial({ color }));
  mesh.position.set(x, y, z);
  return mesh;
};

// An empty lobby at night: a slow camera sweep and one tired ceiling light.
const buildLobby = (): FeedScene => {
  const scene = base(0x05080a, 6, 22);
  scene.add(new AmbientLight(0x6688aa, 0.35));
  const light = new PointLight(0xcfe8ff, 18, 16);
  light.position.set(0, 3.2, -3);
  scene.add(light);

  scene.add(floor(14, 14, 0x1a2228));
  const wall = box(14, 4, 0.2, 0x222c33, 0, 2, -7);
  scene.add(wall);
  for (const x of [-4.5, -1.5, 1.5, 4.5]) scene.add(box(0.5, 4, 0.5, 0x2c3a42, x, 2, -4));
  scene.add(box(4, 1.1, 1, 0x30404a, 0, 0.55, -5.4)); // reception desk
  scene.add(box(1.2, 0.5, 1.2, 0x303a30, -5, 0.25, -1)); // a bench

  const camera = new PerspectiveCamera(60, ASPECT, 0.1, 40);
  camera.position.set(0, 2.6, 5);
  const update = (t: number) => {
    camera.position.x = Math.sin(t * 0.15) * 3;
    camera.lookAt(0, 1.2, -5);
    // Mostly steady, with an occasional stutter.
    const stutter = Math.sin(t * 23) * Math.sin(t * 3.1) > 0.92 ? 0.3 : 1;
    light.intensity = 18 * stutter;
  };
  update(0);
  return { scene, camera, update };
};

// Two rows of racks; every status LED blinks on its own rhythm.
const buildServerRoom = (): FeedScene => {
  const scene = base(0x020407, 4, 18);
  scene.add(new AmbientLight(0x334466, 0.4));
  const light = new PointLight(0x88aaff, 10, 14);
  light.position.set(0, 3, 0);
  scene.add(light);

  scene.add(floor(12, 14, 0x10151a));
  const leds: { material: MeshBasicMaterial; rate: number; phase: number; color: number }[] = [];
  for (const side of [-2.2, 2.2]) {
    for (let i = 0; i < 6; i += 1) {
      const z = -1 - i * 1.6;
      scene.add(box(1.1, 2.4, 1, 0x1b2630, side, 1.2, z));
      for (let row = 0; row < 3; row += 1) {
        const color = row === 0 ? 0xff3a2a : 0x34ff7a;
        const material = new MeshBasicMaterial({ color });
        const led = new Mesh(new BoxGeometry(0.08, 0.05, 0.02), material);
        const facing = side < 0 ? 0.56 : -0.56;
        led.position.set(side + facing, 0.7 + row * 0.5, z);
        scene.add(led);
        leds.push({ material, rate: 1 + ((i * 3 + row * 7) % 5), phase: i + row, color });
      }
    }
  }

  const camera = new PerspectiveCamera(65, ASPECT, 0.1, 30);
  camera.position.set(0, 2.2, 2);
  const update = (t: number) => {
    camera.position.x = Math.sin(t * 0.1) * 0.8;
    camera.lookAt(0, 1.2, -8);
    for (const led of leds) {
      const on = Math.sin(t * led.rate + led.phase) > -0.2;
      led.material.color.setHex(on ? led.color : 0x101010);
    }
  };
  update(0);
  return { scene, camera, update };
};

// The offline feed has no scene: the viewer shows a card instead.
export const buildScene = (id: CameraFeed['id']): FeedScene | null => {
  if (id === 'cam_01') return buildLobby();
  if (id === 'cam_02') return buildServerRoom();
  return null;
};

export const disposeScene = (scene: Scene): void => {
  scene.traverse(object => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const materials: Material[] = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const m of materials) m.dispose();
  });
};
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run src/components/cam/scenes.test.ts`
Expected: PASS (5 tests). If the server-room mesh-count assertion fails, count: 12 racks + 36 LEDs + floor = 49 (> 20).

- [ ] **Step 6: Implement the renderer**

`src/components/cam/render.ts`:

```ts
import { WebGLRenderer } from 'three';
import type { CameraFeed } from '../../data/cameras';
import { buildScene, disposeScene } from './scenes';

export interface FeedHandle {
  setPaused: (paused: boolean) => void;
  stop: () => void;
}

const MAX_PIXEL_RATIO = 1.5;

// Starts a feed on `canvas`. `new WebGLRenderer` throws when WebGL is unavailable: the caller
// turns that into the NO SIGNAL card.
export const startFeed = (
  canvas: HTMLCanvasElement,
  id: CameraFeed['id'],
  reducedMotion: boolean,
): FeedHandle => {
  const built = buildScene(id);
  if (built === null) throw new Error(`feed ${id} has no scene`);
  const renderer = new WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

  const resize = () => {
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    renderer.setSize(width, height, false);
    built.camera.aspect = width / height;
    built.camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const start = performance.now();
  let frame = 0;
  let paused = false;
  let stopped = false;

  const draw = () => {
    built.update((performance.now() - start) / 1000);
    renderer.render(built.scene, built.camera);
  };
  const loop = () => {
    if (stopped || paused || document.hidden) return;
    draw();
    frame = requestAnimationFrame(loop);
  };
  const resume = () => {
    cancelAnimationFrame(frame);
    if (reducedMotion) draw();
    else loop();
  };
  const onVisibility = () => {
    resume();
  };
  document.addEventListener('visibilitychange', onVisibility);
  resume();

  return {
    setPaused: next => {
      paused = next;
      resume();
    },
    stop: () => {
      stopped = true;
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
      disposeScene(built.scene);
      renderer.dispose();
    },
  };
};
```

- [ ] **Step 7: Type check and commit**

Run: `pnpm build 2>&1 | tail -15`
Expected: succeeds (render.ts is not imported yet; knip complaints are resolved in Task 3).

```bash
git add package.json pnpm-lock.yaml src/components/cam/scenes.ts src/components/cam/render.ts src/components/cam/scenes.test.ts
git commit -m "feat: three.js scenes and renderer for the cctv feeds" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: CamPane component and CCTV styling

**Files:**

- Create: `src/components/CamPane.tsx`
- Modify: `src/styles/globals.css` (append CAM styles after `.aux-tabs button[aria-pressed='true']`)
- Test: `src/components/CamPane.test.tsx`

**Interfaces:**

- Consumes: `CameraFeed` (Task 1); dynamic `import('./cam/render')` → `startFeed`, `FeedHandle` (Task 2).
- Produces: `<CamPane feeds={readonly CameraFeed[]} visible={boolean} fullscreen={boolean} onToggleFullscreen={() => void} />`. Test ids: `cam-canvas`, `cam-offline`, `cam-nosignal`, `cam-timestamp`; feed buttons are `<button aria-pressed>` labelled `CAM n`; fullscreen button labelled `FULL SCREEN` / `EXIT FULL SCREEN`.

- [ ] **Step 1: Write the failing tests**

`src/components/CamPane.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CamPane } from './CamPane';
import { CAMERA_FEEDS } from '../data/cameras';

const stop = vi.fn();
const setPaused = vi.fn();
const startFeed = vi.fn();

vi.mock('./cam/render', () => ({
  startFeed: (...args: unknown[]) => startFeed(...args) as unknown,
}));

beforeEach(() => {
  stop.mockReset();
  setPaused.mockReset();
  startFeed.mockReset();
  startFeed.mockReturnValue({ stop, setPaused });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
});

const setup = (over: { visible?: boolean } = {}) => {
  const onToggleFullscreen = vi.fn();
  const view = render(
    <CamPane
      feeds={CAMERA_FEEDS}
      visible={over.visible ?? true}
      fullscreen={false}
      onToggleFullscreen={onToggleFullscreen}
    />,
  );
  return { onToggleFullscreen, ...view };
};

describe('CamPane', () => {
  it('starts the first feed on its canvas and shows the CCTV overlay', async () => {
    setup();
    await screen.findByTestId('cam-canvas');
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalledWith(screen.getByTestId('cam-canvas'), 'cam_01', false);
    });
    expect(screen.getByTestId('cam-timestamp').textContent).toMatch(
      /^2024-11-27 \d{2}:\d{2}:\d{2}$/,
    );
    expect(screen.getByText(/CAM 01/)).toBeTruthy();
  });

  it('switches feeds, stopping the previous one', async () => {
    setup();
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole('button', { name: 'CAM 02' }));
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalledTimes(2);
    });
    expect(startFeed.mock.calls[1]?.[1]).toBe('cam_02');
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('shows the offline card for the disabled feed, with no renderer', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'CAM 03' }));
    expect(screen.getByTestId('cam-offline').textContent).toContain('FEED DISABLED — CEO OFFICE');
    expect(screen.queryByTestId('cam-canvas')).toBeNull();
  });

  it('shows NO SIGNAL when WebGL is unavailable', async () => {
    startFeed.mockImplementation(() => {
      throw new Error('WebGL not supported');
    });
    setup();
    expect(await screen.findByTestId('cam-nosignal')).toBeTruthy();
  });

  it('pauses the feed while the pane is hidden and resumes when shown', async () => {
    const view = setup({ visible: true });
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalled();
    });
    view.rerender(
      <CamPane feeds={CAMERA_FEEDS} visible={false} fullscreen={false} onToggleFullscreen={vi.fn()} />,
    );
    expect(setPaused).toHaveBeenLastCalledWith(true);
    view.rerender(
      <CamPane feeds={CAMERA_FEEDS} visible fullscreen={false} onToggleFullscreen={vi.fn()} />,
    );
    expect(setPaused).toHaveBeenLastCalledWith(false);
  });

  it('does not start a renderer if it unmounts before the chunk resolves', async () => {
    const view = setup();
    view.unmount();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(startFeed).not.toHaveBeenCalled();
  });

  it('asks to toggle full screen', () => {
    const { onToggleFullscreen } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'FULL SCREEN' }));
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it('never uses the secret name', () => {
    const { container } = setup();
    expect(container.textContent).not.toMatch(/aria/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/components/CamPane.test.tsx`
Expected: FAIL — `./CamPane` not found.

- [ ] **Step 3: Implement CamPane**

`src/components/CamPane.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { CameraFeed } from '../data/cameras';

interface Props {
  feeds: readonly CameraFeed[];
  // False while the aux pane is hidden (another pane zoomed, another narrow tab).
  visible: boolean;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

const STORY_DATE = '2024-11-27';

const camNumber = (feed: CameraFeed): string => feed.id.slice(-2);

// The story's date with the real time of day: decoration, not game time.
const useStamp = (): string => {
  const read = () => `${STORY_DATE} ${new Date().toTimeString().slice(0, 8)}`;
  const [stamp, setStamp] = useState(read);
  useEffect(() => {
    const timer = setInterval(() => {
      setStamp(read());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return stamp;
};

interface FeedHandleLike {
  setPaused: (paused: boolean) => void;
  stop: () => void;
}

// three.js is loaded on first use, so the main bundle never carries it.
const Canvas = ({ feed, visible }: { feed: CameraFeed; visible: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<FeedHandleLike | null>(null);
  const visibleRef = useRef(visible);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    visibleRef.current = visible;
    handleRef.current?.setPaused(!visible);
  }, [visible]);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    import('./cam/render')
      .then(({ startFeed }) => {
        const canvas = canvasRef.current;
        if (cancelled || canvas === null) return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const handle = startFeed(canvas, feed.id, reduced);
        handle.setPaused(!visibleRef.current);
        handleRef.current = handle;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      handleRef.current?.stop();
      handleRef.current = null;
    };
  }, [feed.id]);

  if (failed) {
    return (
      <div className="cam-card" data-testid="cam-nosignal">
        NO SIGNAL
      </div>
    );
  }
  return <canvas ref={canvasRef} className="cam-canvas" data-testid="cam-canvas" />;
};

export const CamPane = ({ feeds, visible, fullscreen, onToggleFullscreen }: Props) => {
  const [selected, setSelected] = useState(feeds[0]?.id);
  const stamp = useStamp();
  const feed = feeds.find(f => f.id === selected) ?? feeds[0];
  if (feed === undefined) return null;

  return (
    <div className="cam-pane">
      <div className="cam-bar">
        {feeds.map(f => (
          <button
            key={f.id}
            type="button"
            aria-pressed={f.id === feed.id}
            onClick={() => {
              setSelected(f.id);
            }}>
            {`CAM ${camNumber(f)}`}
          </button>
        ))}
        <button type="button" className="cam-full" onClick={onToggleFullscreen}>
          {fullscreen ? 'EXIT FULL SCREEN' : 'FULL SCREEN'}
        </button>
      </div>
      <div className="cam-stage">
        {feed.offlineReason === null ? (
          <Canvas key={feed.id} feed={feed} visible={visible} />
        ) : (
          <div className="cam-card cam-static" data-testid="cam-offline">
            {feed.offlineReason}
          </div>
        )}
        <div className="cam-overlay" aria-hidden="true">
          <span className="cam-id">{`CAM ${camNumber(feed)} — ${feed.label.toUpperCase()}`}</span>
          <span className="cam-rec">REC ●</span>
          <span className="cam-stamp" data-testid="cam-timestamp">
            {stamp}
          </span>
        </div>
      </div>
    </div>
  );
};
```

Note: the overlay is `aria-hidden`, so `screen.getByText(/CAM 01/)` in the first test must match the switcher button (`CAM 01`), which it does; `getByTestId('cam-timestamp')` ignores aria-hidden.

- [ ] **Step 4: Add the styles**

Append to `src/styles/globals.css` after the `.aux-tabs button[aria-pressed='true']` rule:

```css
.cam-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #000;
}

.cam-bar {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-bottom: 1px solid var(--win-border);
}

.cam-bar button {
  background: transparent;
  border: 1px solid var(--win-border);
  color: var(--win-title-color);
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 0 6px;
  cursor: pointer;
  opacity: 0.55;
}

.cam-bar button[aria-pressed='true'] {
  opacity: 1;
}

.cam-bar .cam-full {
  margin-left: auto;
  opacity: 1;
}

.cam-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.cam-canvas {
  width: 100%;
  height: 100%;
  display: block;
  filter: grayscale(0.7) contrast(1.15) brightness(0.95);
}

.cam-card {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #c8d2da;
  font-family: var(--font-mono);
  letter-spacing: 0.15em;
  text-align: center;
  padding: 0 16px;
}

.cam-static {
  background: repeating-linear-gradient(0deg, #151515 0 2px, #0a0a0a 2px 4px);
}

.cam-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  font-family: var(--font-mono);
  font-size: 11px;
  color: #e6eef2;
  text-shadow: 0 0 2px #000;
  background:
    repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.22) 0 1px, transparent 1px 3px),
    radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.55) 100%);
}

.cam-id {
  position: absolute;
  top: 8px;
  left: 10px;
}

.cam-rec {
  position: absolute;
  top: 8px;
  right: 10px;
  color: #ff4a3a;
  animation: cam-blink 1.4s steps(2, start) infinite;
}

.cam-stamp {
  position: absolute;
  bottom: 8px;
  left: 10px;
}

@keyframes cam-blink {
  to {
    visibility: hidden;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cam-rec {
    animation: none;
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run src/components/CamPane.test.tsx`
Expected: PASS (8 tests). If "does not start a renderer if it unmounts" fails, the `cancelled` guard in the `.then` is missing.

- [ ] **Step 6: Commit**

```bash
git add src/components/CamPane.tsx src/components/CamPane.test.tsx src/styles/globals.css
git commit -m "feat: cam pane with cctv overlay, nosignal fallback and pause" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Wire the CAM tab into the workspace

**Files:**

- Modify: `src/components/Workspace.tsx` (imports; `AuxTab` type; `auxTab` use; `auxTabs`; `panes.aux`)

**Interfaces:**

- Consumes: `cameraFeeds`, `availableAuxTabs`, `resolveAuxTab`, `AuxTab` (Task 1), `CamPane` (Task 3), `focusPane`/`toggleZoom` layout helpers already imported.
- Produces: nothing new; `showAux(tab)` keeps its signature and now accepts `'cam'`.

- [ ] **Step 1: Edit the imports and the type**

In `src/components/Workspace.tsx`, replace `export type AuxTab = 'map' | 'case';` with:

```ts
export type { AuxTab };
```

and add imports:

```ts
import { CamPane } from './CamPane';
import { cameraFeeds } from '../engine/cameras';
import { availableAuxTabs, resolveAuxTab } from '../layout/auxTabs';
import type { AuxTab } from '../layout/auxTabs';
```

- [ ] **Step 2: Derive the effective tab**

Keep `const [auxTab, setAuxTab] = useState<AuxTab>('map');` (the user's choice) and add directly after it:

```ts
    const feeds = gameState ? cameraFeeds(gameState) : [];
    const hasCam = feeds.length > 0;
    const shownAuxTab = resolveAuxTab(auxTab, hasCam);
```

- [ ] **Step 3: Use `shownAuxTab` in the visibility rules, tab strip and pane**

Change `caseVisible` to use `shownAuxTab === 'case'`, add:

```ts
    const camVisible = narrow
      ? layout.focused === 'aux'
      : layout.zoomed === null || layout.zoomed === 'aux';
    const camFullscreen = layout.zoomed === 'aux';
    const toggleCamFullscreen = () => {
      setLayout(prev =>
        prev.zoomed === 'aux' ? { ...prev, zoomed: null } : { ...prev, focused: 'aux', zoomed: 'aux' },
      );
    };
```

Replace the tab list `(['map', 'case'] as const).map(tab => (` with `availableAuxTabs(hasCam).map(tab => (`, and `aria-pressed={auxTab === tab}` with `aria-pressed={shownAuxTab === tab}`. Replace the `aux:` entry in `panes` with:

```tsx
      aux:
        shownAuxTab === 'map' ? (
          map
        ) : shownAuxTab === 'cam' ? (
          <CamPane
            feeds={feeds}
            visible={camVisible}
            fullscreen={camFullscreen}
            onToggleFullscreen={toggleCamFullscreen}
          />
        ) : (
          gameState && <CasePane gameState={gameState} onOpenSource={openSource} />
        ),
```

- [ ] **Step 4: Verify types, lint and the existing suite**

Run: `pnpm format && pnpm build 2>&1 | tail -8 && pnpm lint 2>&1 | tail -8 && pnpm test 2>&1 | tail -8`
Expected: build succeeds; lint clean; all tests pass. The build output lists a separate chunk containing three.js (check: `ls dist/assets | head` shows a second large JS file) and the main chunk size is unchanged within a few KB.

- [ ] **Step 5: Run the game and look at it**

Run `pnpm dev`, play to the CCTV node (`login contractor Welcome1!`, `scan`, `connect 10.0.0.2`, `login contractor Welcome1!`, `scan`, `connect 10.1.0.1`, `exploit http`), and confirm: the CAM tab appears, the lobby and server-room feeds animate, CAM 03 shows the disabled card, FULL SCREEN fills the screen with the terminal still usable via Alt+Z, and `disconnect` returns the aux pane to MAP. Report anything off rather than assuming.

- [ ] **Step 6: Commit**

```bash
git add src/components/Workspace.tsx
git commit -m "feat: show the cam tab while connected to the cctv controller" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Playthrough check and docs

**Files:**

- Modify: `playwright-playthrough.mjs` (one check after `cat camera_config.ini`)
- Modify: `CLAUDE.md` (Tiled layout paragraph)

- [ ] **Step 1: Add the playthrough check**

In `playwright-playthrough.mjs`, directly after `await cmd('cat camera_config.ini'); // ops.admin in plain text`, add:

```js
  // The CAM tab exists while connected to the controller, and its feed renders (or reports NO SIGNAL).
  await page.getByRole('button', { name: 'CAM', exact: true }).click();
  await page.waitForTimeout(1500);
  check(
    'the CAM tab shows a live camera feed',
    (await page.locator('[data-testid="cam-canvas"]').count()) === 1 &&
      (await page.locator('[data-testid="cam-nosignal"]').count()) === 0,
  );
  await page.getByRole('button', { name: 'MAP', exact: true }).click();
```

- [ ] **Step 2: Run the playthrough**

Run: `pnpm dev` in the background, then `node playwright-playthrough.mjs --headless`.
Expected: all checks PASS including the new one. If headless Chromium has no WebGL the check fails with a NO SIGNAL card: rerun without `--headless` to confirm it is the environment, and say so in the PR rather than weakening the check.

- [ ] **Step 3: Document it**

In `CLAUDE.md`, in the "Tiled layout" paragraph, after the sentence about the CASE tab's design doc, add:

```
While you hold a session on the CCTV controller the aux pane also gets a **CAM** tab (`src/components/CamPane.tsx`): looping three.js footage of the lobby and server room, with `cam_03` disabled, a CCTV overlay and a FULL SCREEN toggle (the aux pane's zoom). It is pure derived UI (`cameraFeeds` in `src/engine/cameras.ts`) with no flags or saves, and three.js loads lazily from `src/components/cam/`. Design: `docs/superpowers/specs/2026-10-04-cctv-feeds-design.md`.
```

- [ ] **Step 4: Full pre-PR checks**

Run: `pnpm format && pnpm build && pnpm lint && pnpm test:coverage 2>&1 | tail -15 && pnpm knip 2>&1 | tail -15`
Expected: all pass; knip shows only its pre-existing unrelated findings, nothing about `three`, `cameras` or `auxTabs`.

- [ ] **Step 5: Commit**

```bash
git add playwright-playthrough.mjs CLAUDE.md
git commit -m "test: check the cam tab in the playthrough and document it" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
