# CCTV floors, names and unlocks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The CCTV feeds are reachable from anywhere while the player holds a session on `ops_cctv_ctrl`; the controller enables floors and cameras as the player reaches deeper layers; the camera switcher becomes a floor menu with the cameras as submenus; cameras have names, not numbers.

**Architecture:** Still pure derived UI. `deepestLayer(state)` and each feed's `unlockLayer` decide which feeds are listed and live. A feed is a readable-slug id on a floor, plus a scene and a mount (camera position/heading/pan), so a floor's second camera reuses the room. `cameraFeeds` returns `ListedFeed[]` (`CameraFeed & { live }`); `CamPane`, `CamMenu`, `view-cam` and the unread marker all read it.

**Tech Stack:** React 19, TypeScript, three.js (already a dependency), Vitest (jsdom for components), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-cctv-unlock-design.md` (extends `2026-10-04-cctv-feeds-design.md`).

## Global Constraints

- No flags, saves or trace effects from the viewer; `SAVE_VERSION` stays 6. State is derived from node `accessLevel`.
- Feeds are available while `nodes.ops_cctv_ctrl.accessLevel !== 'none'`, from any current node.
- A feed is **live** when `deepestLayer(state) >= unlockLayer`. A feed with an `offlineReason` is always listed (card until live); every other feed is listed only once live. Order is the data order (by floor).
- Floors, in order: Ground floor, Operations, Security, Finance, Executive, Sub-level B. Cameras (id · name · floor · scene/mount · unlock): `lobby-reception` (alias `cam_01`) · Lobby (reception) · Ground · lobby/0 · 1; `lobby-entrance` · Lobby (entrance) · Ground · lobby/1 · 1; `server-aisle` (alias `cam_02`) · Server room (aisle) · Operations · serverRoom/0 · 1; `server-airlock` · Server room (airlock) · Operations · serverRoom/1 · 1; `security-office` · Security office · Security · securityOffice/0 · 2; `finance-floor` · Finance floor · Finance · financeFloor/0 · 3; `executive-corridor` (alias `cam_03`) · Executive corridor · Executive · executiveFloor/0 · 4 (offline "FEED DISABLED — CEO OFFICE" until then); `executive-office` · Corner office · Executive · executiveFloor/1 · 4 (same); `data-hall-b` · Data hall B · Sub-level B · dataHall/0 · 5.
- Both executive cameras cost +1 trace, offline or live; the rest cost none. `view-cam` and the viewer read the same data; `view-cam` accepts an id or an alias.
- Names, floor names, descriptions and offline reasons never contain the secret name (`/aria/i`).
- New scenes are empty, clue-free, same night-vision look, pan in place, one flickering light; each builder is bounded to its room and takes a mount index.
- Animations only inside `@media (prefers-reduced-motion: no-preference)`; `src/components/**` is excluded from coverage.
- ESLint strictTypeChecked, arrow functions, Prettier, 75% per-file coverage, lowercase conventional-commit subjects, commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never pipe a `git commit` into `tail` (it hides a rejected commit).
- Before the final PR: `pnpm format` first, then `pnpm build`, `pnpm lint`, `pnpm test:coverage`, `pnpm knip`.

## Review Focus

- Losing the controller session while on CAM: the aux pane falls back to MAP, no empty pane (existing `resolveAuxTab`; Task 6 test).
- A feed that becomes live while it is selected: the card swaps for the scene and starts exactly one renderer (Task 1 CamPane test).
- `view-cam` with an unlisted or not-yet-unlocked id or alias must not reveal that it exists or what it shows (Task 1 test).
- A resumed or reloaded run must not show every unlock as unread (Task 6 test: initial render is read).
- A run holding deeper sessions without ever taking the controller shows no cameras (Task 1 test).
- The menu in the small aux pane: it must not trap focus, must close on Esc and outside click, and a camera that disappears (session lost) while selected must not leave the menu pointing at nothing (Task 5 tests).

---

### Task 1: The camera model — floors, names, unlocks, `view-cam`

**Files:**

- Rewrite: `src/data/cameras.ts`, `src/engine/cameras.ts`
- Modify: `src/engine/commands.ts` (`cmdViewCam`, imports)
- Modify: `src/components/CamPane.tsx` (minimal: `ListedFeed`, `live`, names; the menu comes in Task 5)
- Modify: `src/components/cam/render.ts`, `src/components/cam/scenes.ts` (signature: scenes are chosen by `{ scene, mount }`)
- Modify tests: `src/engine/__tests__/cameras.test.ts` (rewrite), `src/engine/commands.test.ts` (view-cam describe), `src/components/CamPane.test.tsx`, `src/components/cam/render.test.ts`, `src/components/cam/scenes.test.ts`, `src/data/__tests__/ariaNameLeak.test.ts`

**Interfaces:**

- Produces: `FLOORS`, `type FloorId`, `floorName(id)`, `type SceneId = 'lobby' | 'serverRoom' | 'securityOffice' | 'financeFloor' | 'executiveFloor' | 'dataHall'`, `CameraFeed { id: string; aliases: readonly string[]; floor: FloorId; name: string; scene: SceneId; mount: number; unlockLayer: number; offlineReason: string | null; description: string; traceCost: number }`, `CAMERA_FEEDS`, `CCTV_NODE_ID`; `ListedFeed extends CameraFeed { live: boolean }`, `deepestLayer(state): number`, `cameraFeeds(state): readonly ListedFeed[]`; `buildScene(feed: Pick<CameraFeed, 'scene' | 'mount'>): FeedScene | null`; `startFeed(canvas, feed: Pick<CameraFeed, 'scene' | 'mount'>, reducedMotion)`.

- [ ] **Step 1: Write the failing tests**

Replace `src/engine/__tests__/cameras.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { cameraFeeds, deepestLayer } from '../cameras';
import { CAMERA_FEEDS, FLOORS } from '../../data/cameras';
import { createInitialState } from '../state';
import produce from '../produce';
import type { GameState } from '../../types/game';

// Grants a session on each node and puts the player at `current`.
const held = (nodeIds: string[], current = 'contractor_portal'): GameState =>
  produce(createInitialState(), s => {
    for (const id of nodeIds) s.network.nodes[id]!.accessLevel = 'user';
    s.network.currentNodeId = current;
  });

const ids = (state: GameState) => cameraFeeds(state).map(f => f.id);
const liveIds = (state: GameState) =>
  cameraFeeds(state)
    .filter(f => f.live)
    .map(f => f.id);

const L1 = 'ops_cctv_ctrl';
const L2 = 'sec_access_ctrl';
const L3 = 'fin_payments_db';
const L4 = 'exec_cfo';
const L5 = 'aria_core';

describe('deepestLayer', () => {
  it('is 0 before any session is held', () => {
    expect(deepestLayer(createInitialState())).toBe(0);
  });

  it('is the highest layer where a session is held', () => {
    expect(deepestLayer(held([L1]))).toBe(1);
    expect(deepestLayer(held([L1, L3, L2]))).toBe(3);
  });

  it('drops when the deepest session is lost', () => {
    const state = produce(held([L1, L3]), s => {
      s.network.nodes[L3]!.accessLevel = 'none';
    });
    expect(deepestLayer(state)).toBe(1);
  });
});

describe('cameraFeeds', () => {
  it('is empty without a session on the controller', () => {
    expect(cameraFeeds(createInitialState())).toEqual([]);
  });

  it('is empty when deeper sessions are held but the controller was never taken', () => {
    expect(cameraFeeds(held([L2, L3, L4]))).toEqual([]);
  });

  it('lists the layer-1 cameras, with the executive floor offline', () => {
    const feeds = cameraFeeds(held([L1], L1));
    expect(feeds.map(f => f.id)).toEqual([
      'lobby-reception',
      'lobby-entrance',
      'server-aisle',
      'server-airlock',
      'executive-corridor',
      'executive-office',
    ]);
    expect(feeds.filter(f => !f.live).map(f => f.id)).toEqual([
      'executive-corridor',
      'executive-office',
    ]);
  });

  it('keeps the feeds after leaving the controller, from any node', () => {
    expect(ids(held([L1, 'ops_hr_db'], 'ops_hr_db'))).toContain('lobby-reception');
  });

  it('adds cameras with each layer, and the executive floor goes live at layer 4', () => {
    expect(liveIds(held([L1, L2]))).toContain('security-office');
    expect(liveIds(held([L1, L2]))).not.toContain('finance-floor');
    expect(liveIds(held([L1, L2, L3]))).toContain('finance-floor');
    expect(liveIds(held([L1, L2, L3]))).not.toContain('executive-corridor');
    const four = liveIds(held([L1, L2, L3, L4]));
    expect(four).toEqual(expect.arrayContaining(['executive-corridor', 'executive-office']));
    expect(four).not.toContain('data-hall-b');
    expect(liveIds(held([L1, L2, L3, L4, L5]))).toContain('data-hall-b');
  });

  it('never lists a camera before its layer', () => {
    expect(ids(held([L1, L2]))).not.toContain('finance-floor');
    expect(ids(held([L1, L2, L3, L4]))).not.toContain('data-hall-b');
  });

  it('lists every camera once, in data order', () => {
    const all = ids(held([L1, L2, L3, L4, L5]));
    expect(all).toEqual(CAMERA_FEEDS.map(f => f.id));
  });
});

describe('camera data', () => {
  it('has unique ids, and aliases that never collide with ids or each other', () => {
    const names = CAMERA_FEEDS.flatMap(f => [f.id, ...f.aliases]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('puts every camera on a known floor', () => {
    const floors = new Set(FLOORS.map(f => f.id));
    for (const feed of CAMERA_FEEDS) expect(floors.has(feed.floor)).toBe(true);
  });

  it('keeps the three numbered aliases that camera_config.ini names', () => {
    const ini = createInitialState().network.nodes[L1]!.files.find(
      f => f.name === 'camera_config.ini',
    );
    const expected = {
      cam_01: 'lobby-reception',
      cam_02: 'server-aisle',
      cam_03: 'executive-corridor',
    } as const;
    for (const [alias, id] of Object.entries(expected)) {
      expect(ini?.content).toContain(`${alias}=`);
      expect(CAMERA_FEEDS.find(f => f.id === id)?.aliases).toContain(alias);
    }
  });

  it('describes the server-room lights as red and green, like the scene', () => {
    expect(CAMERA_FEEDS.find(f => f.id === 'server-aisle')?.description).toMatch(/red and green/);
  });

  it('has a description for every camera that can go live', () => {
    for (const feed of CAMERA_FEEDS) expect(feed.description.length).toBeGreaterThan(40);
  });

  it('charges trace only on the restricted executive cameras', () => {
    expect(CAMERA_FEEDS.filter(f => f.traceCost > 0).map(f => f.id)).toEqual([
      'executive-corridor',
      'executive-office',
    ]);
  });
});
```

In `src/data/__tests__/ariaNameLeak.test.ts`, replace the body of the test `the camera feeds (view-cam and the CAM tab) never say it` with:

```ts
    const text = [
      ...FLOORS.map(f => f.name),
      ...CAMERA_FEEDS.flatMap(f => [f.id, f.name, f.description, f.offlineReason ?? '']),
    ];
    expect(text.filter(t => ARIA.test(t))).toEqual([]);
```

and change its import to `import { CAMERA_FEEDS, FLOORS } from '../cameras';`.

In `src/engine/commands.test.ts`, inside `describe('view-cam command', …)` add (keep the existing tests; `cam_01`/`cam_03`/`cam_99` still work through aliases):

```ts
  const deepState = (nodeIds: string[], current: string): GameState =>
    produce(createInitialState(), draft => {
      for (const id of nodeIds) draft.network.nodes[id]!.accessLevel = 'user';
      draft.network.currentNodeId = current;
    });
  const text = (lines: { content: string }[]) => lines.map(l => l.content).join('\n');

  it('works from another node while a session is held on the controller', async () => {
    const s = deepState(['ops_cctv_ctrl', 'ops_hr_db'], 'ops_hr_db');
    const result = await resolveCommand('view-cam lobby-reception', s);
    expect(result.lines.some(l => l.type === 'error')).toBe(false);
    expect(text(result.lines)).toContain('Main lobby, night');
    expect(text(result.lines)).toContain('GROUND FLOOR — LOBBY (RECEPTION)');
  });

  it('accepts the old numbered alias', async () => {
    const result = await resolveCommand('view-cam cam_02', deepState(['ops_cctv_ctrl'], 'ops_cctv_ctrl'));
    expect(text(result.lines)).toContain('Server room');
  });

  it('shows a newly unlocked camera once its layer is reached', async () => {
    const s = deepState(['ops_cctv_ctrl', 'sec_access_ctrl'], 'sec_access_ctrl');
    const result = await resolveCommand('view-cam security-office', s);
    expect(text(result.lines)).toContain('Security operations office');
  });

  it('does not reveal a camera that is not unlocked yet', async () => {
    const s = deepState(['ops_cctv_ctrl'], 'ops_cctv_ctrl');
    const result = await resolveCommand('view-cam finance-floor', s);
    expect(result.lines.some(l => l.type === 'error')).toBe(true);
    expect(text(result.lines)).toContain('Unknown camera: finance-floor');
    expect(text(result.lines)).toContain('lobby-reception');
    expect(text(result.lines)).not.toContain('security-office');
    expect(text(result.lines)).not.toContain('finance floor');
  });

  it('shows the live executive cameras once layer 4 is held, still at +1 trace', async () => {
    const s = deepState(['ops_cctv_ctrl', 'exec_cfo'], 'exec_cfo');
    const corridor = await resolveCommand('view-cam executive-corridor', s);
    expect(text(corridor.lines)).toContain('Executive floor corridor');
    expect(text(corridor.lines)).not.toContain('FEED DISABLED');
    expect((corridor.nextState as GameState).player.trace).toBe(s.player.trace + 1);
    const office = await resolveCommand('view-cam executive-office', s);
    expect(text(office.lines)).toContain('Corner office');
  });

  it('refuses when no session is held on the controller, wherever the player is', async () => {
    const s = deepState(['sec_access_ctrl'], 'sec_access_ctrl');
    const result = await resolveCommand('view-cam lobby-reception', s);
    expect(result.lines.some(l => l.type === 'error')).toBe(true);
  });
```

Replace the contents of `src/components/CamPane.test.tsx` with:

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

const FEEDS = CAMERA_FEEDS.filter(f =>
  ['lobby-reception', 'server-aisle', 'executive-corridor'].includes(f.id),
).map(f => ({ ...f, live: f.offlineReason === null }));

beforeEach(() => {
  stop.mockReset();
  setPaused.mockReset();
  startFeed.mockReset();
  startFeed.mockReturnValue({ stop, setPaused });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
  localStorage.clear();
});

const setup = (over: { visible?: boolean } = {}) => {
  const onToggleFullscreen = vi.fn();
  const view = render(
    <CamPane
      feeds={FEEDS}
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
      expect(startFeed).toHaveBeenCalledWith(
        screen.getByTestId('cam-canvas'),
        { scene: 'lobby', mount: 0 },
        false,
      );
    });
    expect(screen.getByTestId('cam-timestamp').textContent).toMatch(
      /^2024-11-27 \d{2}:\d{2}:\d{2}$/,
    );
    expect(screen.getByText('GROUND FLOOR — LOBBY (RECEPTION)')).toBeTruthy();
  });

  it('switches feeds, stopping the previous one', async () => {
    setup();
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Server room (aisle)' }));
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalledTimes(2);
    });
    expect(startFeed.mock.calls[1]?.[1]).toEqual({ scene: 'serverRoom', mount: 0 });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('shows the offline card for a disabled feed, with no renderer', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Executive corridor' }));
    expect(screen.getByTestId('cam-offline').textContent).toContain('FEED DISABLED — CEO OFFICE');
    expect(screen.queryByTestId('cam-canvas')).toBeNull();
  });

  it('swaps the card for the scene when the selected feed goes live', async () => {
    const view = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Executive corridor' }));
    expect(screen.getByTestId('cam-offline')).toBeTruthy();
    expect(startFeed).not.toHaveBeenCalled();

    const live = FEEDS.map(f => ({ ...f, live: true }));
    view.rerender(<CamPane feeds={live} visible fullscreen={false} onToggleFullscreen={vi.fn()} />);
    expect(screen.queryByTestId('cam-offline')).toBeNull();
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalledTimes(1);
    });
    expect(startFeed.mock.calls[0]?.[1]).toEqual({ scene: 'executiveFloor', mount: 0 });
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
      <CamPane feeds={FEEDS} visible={false} fullscreen={false} onToggleFullscreen={vi.fn()} />,
    );
    expect(setPaused).toHaveBeenLastCalledWith(true);
    view.rerender(
      <CamPane feeds={FEEDS} visible fullscreen={false} onToggleFullscreen={vi.fn()} />,
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

  it('has night vision on by default and toggles it off and on', () => {
    setup();
    const toggle = screen.getByRole('button', { name: 'NIGHT VISION' });
    const stage = screen.getByTestId('cam-stage');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(stage.className).toContain('cam-nv');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(stage.className).not.toContain('cam-nv');
    fireEvent.click(toggle);
    expect(stage.className).toContain('cam-nv');
  });

  it('remembers the night-vision choice when the tab is reopened', () => {
    const first = setup();
    fireEvent.click(screen.getByRole('button', { name: 'NIGHT VISION' }));
    first.unmount();
    setup();
    expect(screen.getByRole('button', { name: 'NIGHT VISION' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('does not restart the feed when night vision is toggled', async () => {
    setup();
    await vi.waitFor(() => {
      expect(startFeed).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole('button', { name: 'NIGHT VISION' }));
    expect(startFeed).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
  });
});
```

In `src/components/cam/render.test.ts` change the call to
`startFeed(document.createElement('canvas'), { scene: 'lobby', mount: 0 }, true)`.

In `src/components/cam/scenes.test.ts`: replace every `buildScene('cam_01')` with `buildScene({ scene: 'lobby', mount: 0 })` and every `buildScene('cam_02')` with `buildScene({ scene: 'serverRoom', mount: 0 })`, and delete the test `has no scene for the offline executive-floor feed`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/engine/__tests__/cameras.test.ts src/engine/commands.test.ts src/components src/data/__tests__/ariaNameLeak.test.ts`
Expected: FAIL — `deepestLayer`, `FLOORS`, `aliases`, `scene`/`mount` do not exist; `buildScene`/`startFeed` signatures differ.

- [ ] **Step 3: Implement**

`src/data/cameras.ts` (replace the whole file):

```ts
export const CCTV_NODE_ID = 'ops_cctv_ctrl';

// The building's floors, in the order the menu shows them.
export const FLOORS = [
  { id: 'ground', name: 'Ground floor' },
  { id: 'operations', name: 'Operations' },
  { id: 'security', name: 'Security' },
  { id: 'finance', name: 'Finance' },
  { id: 'executive', name: 'Executive' },
  { id: 'sublevel', name: 'Sub-level B' },
] as const;

export type FloorId = (typeof FLOORS)[number]['id'];

export const floorName = (id: FloorId): string => FLOORS.find(f => f.id === id)?.name ?? id;

export type SceneId =
  | 'lobby'
  | 'serverRoom'
  | 'securityOffice'
  | 'financeFloor'
  | 'executiveFloor'
  | 'dataHall';

export interface CameraFeed {
  // A readable slug: what the menu shows and what `view-cam` takes.
  id: string;
  // Older ids that camera_config.ini and the incident report use; `view-cam` still accepts them.
  aliases: readonly string[];
  floor: FloorId;
  name: string;
  // The room, and which camera mount in it (position, heading and pan).
  scene: SceneId;
  mount: number;
  // The deepest layer the player must have reached (holding a session) for this feed to be live.
  unlockLayer: number;
  // Set when the feed is listed before it is live: the card shown until then.
  offlineReason: string | null;
  // What `view-cam` prints for a live feed. Authored to match the viewer's scene.
  description: string;
  // Trace added when the player opens this feed.
  traceCost: number;
}

const DISABLED = 'FEED DISABLED — CEO OFFICE';

export const CAMERA_FEEDS: readonly CameraFeed[] = [
  {
    id: 'lobby-reception',
    aliases: ['cam_01'],
    floor: 'ground',
    name: 'Lobby (reception)',
    scene: 'lobby',
    mount: 0,
    unlockLayer: 1,
    offlineReason: null,
    description:
      'Main lobby, night. Emergency lighting only, and one ceiling fixture flickers over the reception desk. The hall is empty and the camera pans slowly from left to right.',
    traceCost: 0,
  },
  {
    id: 'lobby-entrance',
    aliases: [],
    floor: 'ground',
    name: 'Lobby (entrance)',
    scene: 'lobby',
    mount: 1,
    unlockLayer: 1,
    offlineReason: null,
    description:
      'Lobby, seen from the street entrance. The glass doors are dark and locked, and beyond the turnstiles the elevator indicators sit idle. The hall is empty.',
    traceCost: 0,
  },
  {
    id: 'server-aisle',
    aliases: ['cam_02'],
    floor: 'operations',
    name: 'Server room (aisle)',
    scene: 'serverRoom',
    mount: 0,
    unlockLayer: 1,
    offlineReason: null,
    description:
      'Server room. Two rows of racks, status lights blinking red and green in no particular order. Nothing moves; the cooling units hold a steady note.',
    traceCost: 0,
  },
  {
    id: 'server-airlock',
    aliases: [],
    floor: 'operations',
    name: 'Server room (airlock)',
    scene: 'serverRoom',
    mount: 1,
    unlockLayer: 1,
    offlineReason: null,
    description:
      'Server room, from the airlock door. The aisle runs away between the racks, lights winking in the dark. Nothing moves.',
    traceCost: 0,
  },
  {
    id: 'security-office',
    aliases: [],
    floor: 'security',
    name: 'Security office',
    scene: 'securityOffice',
    mount: 0,
    unlockLayer: 2,
    offlineReason: null,
    description:
      'Security operations office. A wall of monitors, all dark but one that shows only static. Chairs pushed back from the desks, a cold mug beside a keyboard. Nothing moves.',
    traceCost: 0,
  },
  {
    id: 'finance-floor',
    aliases: [],
    floor: 'finance',
    name: 'Finance floor',
    scene: 'financeFloor',
    mount: 0,
    unlockLayer: 3,
    offlineReason: null,
    description:
      'Finance floor, after hours. Rows of desks with paired monitors asleep behind glass partitions, and a ticker wall still sliding bars of light across the far wall. No one is at a desk.',
    traceCost: 0,
  },
  {
    id: 'executive-corridor',
    aliases: ['cam_03'],
    floor: 'executive',
    name: 'Executive corridor',
    scene: 'executiveFloor',
    mount: 0,
    unlockLayer: 4,
    offlineReason: DISABLED,
    description:
      'Executive floor corridor, night. Closed doors on either side and a runner down the middle; at the far end, the corner office. Nobody is here.',
    traceCost: 1,
  },
  {
    id: 'executive-office',
    aliases: [],
    floor: 'executive',
    name: 'Corner office',
    scene: 'executiveFloor',
    mount: 1,
    unlockLayer: 4,
    offlineReason: DISABLED,
    description:
      'Corner office, night. The desk lamp is off and the city glows through the window behind an empty chair. Nothing has been touched.',
    traceCost: 1,
  },
  {
    id: 'data-hall-b',
    aliases: [],
    floor: 'sublevel',
    name: 'Data hall B',
    scene: 'dataHall',
    mount: 0,
    unlockLayer: 5,
    offlineReason: null,
    description:
      'Data hall B. Sealed cold-storage arrays and accelerator racks stand in long rows under blue standby light, and a vault door closes the far end. The air is still.',
    traceCost: 0,
  },
];
```

`src/engine/cameras.ts` (replace the whole file):

```ts
import { CAMERA_FEEDS, CCTV_NODE_ID } from '../data/cameras';
import type { CameraFeed } from '../data/cameras';
import type { GameState } from '../types/game';

export interface ListedFeed extends CameraFeed {
  live: boolean;
}

// How deep the player has got: the highest layer where they hold a session. Derived from saved node
// state, so a reload rebuilds it and nothing new is saved.
export const deepestLayer = (state: GameState): number =>
  Object.values(state.network.nodes).reduce(
    (deepest, node) => (node.accessLevel === 'none' ? deepest : Math.max(deepest, node.layer)),
    0,
  );

// The feeds the player can see, from any node, while they hold a session on the CCTV controller.
// A feed with an offline reason is listed from the start and shows its card until it is live; any
// other feed does not exist for the player until its layer is reached.
export const cameraFeeds = (state: GameState): readonly ListedFeed[] => {
  const controller = state.network.nodes[CCTV_NODE_ID];
  if (controller === undefined || controller.accessLevel === 'none') return [];
  const deepest = deepestLayer(state);
  return CAMERA_FEEDS.flatMap(feed => {
    const live = deepest >= feed.unlockLayer;
    return live || feed.offlineReason !== null ? [{ ...feed, live }] : [];
  });
};
```

In `src/engine/commands.ts`, change the camera imports to:

```ts
import { CCTV_NODE_ID, floorName } from '../data/cameras';
import { cameraFeeds } from './cameras';
```

and replace `cmdViewCam` (and its `// ── view-cam` header comment) with:

```ts
// ── view-cam ─────────────────────────────────────────────
// Authored, like the CAM tab's footage: both read the same feed list, so they cannot disagree.
// Feeds are available from any node while a session is held on the controller, and the controller
// enables more of them as the player reaches deeper layers. A camera is named by id or by an alias.
const cmdViewCam = (args: string[], state: GameState): CommandOutput => {
  if (!args[0]) return { lines: [err('Usage: view-cam <camera>')] };

  const feeds = cameraFeeds(state);
  if (feeds.length === 0) {
    const here = currentNode(state);
    return {
      lines: [
        err(
          here.id === CCTV_NODE_ID
            ? 'Permission denied — not authenticated'
            : 'No camera feed available — you hold no session on the CCTV controller.',
        ),
      ],
    };
  }

  const wanted = args[0];
  const cam = feeds.find(f => f.id === wanted || f.aliases.includes(wanted));
  if (!cam) {
    const known = feeds.map(f => f.id).join(', ');
    return { lines: [err(`Unknown camera: ${wanted}. Known cameras: ${known}`)] };
  }

  const nextState =
    cam.traceCost > 0 ? addTrace(state, cam.traceCost, `view-cam:${cam.id}`) : undefined;

  const lines: Out = [
    sep(),
    line(`// CCTV — ${floorName(cam.floor).toUpperCase()} — ${cam.name.toUpperCase()}`, 'aria'),
    ...(cam.live ? cam.description : (cam.offlineReason ?? ''))
      .split('\n')
      .map(l => line(l, 'aria')),
    sep(),
  ];

  if (cam.traceCost > 0) {
    lines.push(line(`  +${String(cam.traceCost)} trace (restricted feed accessed)`, 'system'));
  }

  return { lines, nextState };
};
```

`src/components/cam/scenes.ts`: change `buildScene` to take the feed:

```ts
// The offline feeds still map to a scene: whether a feed is live is the engine's decision.
export const buildScene = (feed: Pick<CameraFeed, 'scene' | 'mount'>): FeedScene | null => {
  if (feed.scene === 'lobby') return buildLobby();
  if (feed.scene === 'serverRoom') return buildServerRoom();
  return null;
};
```

(`feed.mount` is used from Task 2; until then both mounts of a scene show the same view.)

`src/components/cam/render.ts`: change the signature and first lines:

```ts
export const startFeed = (
  canvas: HTMLCanvasElement,
  feed: Pick<CameraFeed, 'scene' | 'mount'>,
  reducedMotion: boolean,
): FeedHandle => {
  const built = buildScene(feed);
  if (built === null) throw new Error(`feed ${feed.scene} has no scene`);
```

`src/components/CamPane.tsx`: replace `import type { CameraFeed } from '../data/cameras';` with `import { floorName } from '../data/cameras';` and `import type { ListedFeed } from '../engine/cameras';`; replace every `CameraFeed` with `ListedFeed`; delete `camNumber`; in `Canvas` destructure `const { id, scene, mount } = feed;`, call `startFeed(canvas, { scene, mount }, reduced)` and use `[id, scene, mount]` as the effect's dependencies; make the switcher buttons show `f.name` (the menu replaces them in Task 5); render the stage from `feed.live`:

```tsx
        {feed.live ? (
          <Canvas key={feed.id} feed={feed} visible={visible} />
        ) : (
          <div className="cam-card cam-static" data-testid="cam-offline">
            {feed.offlineReason ?? 'NO SIGNAL'}
          </div>
        )}
```

and the overlay id text: `{`${floorName(feed.floor)} — ${feed.name}`.toUpperCase()}`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx eslint --fix src; pnpm format >/dev/null; pnpm vitest run && pnpm build 2>&1 | grep -E "error|built in"`
Expected: the whole suite PASSES and the build succeeds. If `deepestLayer(createInitialState())` is not 0, a node starts with a session: read `createInitialState`; the contractor portal starts at `none`, so look for a seeded filler node.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat: cctv floors and named cameras that unlock with the deepest layer" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Mounts, and the lobby and server-room second cameras

**Files:**

- Modify: `src/components/cam/pan.ts` (`Mount`, `pickMount`, `aimCamera`)
- Modify: `src/components/cam/lobby.ts`, `src/components/cam/serverRoom.ts`, `src/components/cam/scenes.ts`
- Modify: `src/components/cam/pan.test.ts`, `src/components/cam/scenes.test.ts`

**Interfaces:**

- Produces: `interface Mount { position: readonly [number, number, number]; heading: number; range: number; sweep: number; hold: number; offset: number }`, `pickMount(mounts: readonly [Mount, ...Mount[]], index: number): Mount`, `aimCamera(camera: PerspectiveCamera, t: number, mount: Mount): void`; `buildLobby(mount: number)`, `buildServerRoom(mount: number)`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/cam/pan.test.ts` (and add `PerspectiveCamera, Vector3` from `three` and `aimCamera, pickMount` plus `type Mount` from `./pan` to its imports):

```ts
const MOUNT: Mount = { position: [0, 2, 5], heading: 0, range: 0.5, sweep: SWEEP, hold: HOLD, offset: 0 };

describe('aimCamera', () => {
  it('turns the view without moving the camera', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(...MOUNT.position);
    aimCamera(camera, 0, MOUNT);
    const from = camera.getWorldDirection(new Vector3()).x;
    aimCamera(camera, SWEEP, MOUNT);
    expect(camera.getWorldDirection(new Vector3()).x).toBeGreaterThan(from);
    expect(camera.position.toArray()).toEqual([0, 2, 5]);
  });

  it('looks back down +z when the heading is a half turn', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 2, -10);
    aimCamera(camera, SWEEP / 2, { ...MOUNT, position: [0, 2, -10], heading: Math.PI });
    expect(camera.getWorldDirection(new Vector3()).z).toBeGreaterThan(0.9);
  });
});

describe('pickMount', () => {
  const second: Mount = { ...MOUNT, heading: 1 };
  it('returns the mount at the index, and the first for an unknown index', () => {
    expect(pickMount([MOUNT, second], 1)).toBe(second);
    expect(pickMount([MOUNT, second], 7)).toBe(MOUNT);
  });
});
```

Append to `src/components/cam/scenes.test.ts`:

```ts
describe('second mounts', () => {
  it.each(['lobby', 'serverRoom'] as const)('%s: mount 1 is another position that also pans in place', scene => {
    const first = buildScene({ scene, mount: 0 })!;
    const second = buildScene({ scene, mount: 1 })!;
    expect(second.camera.position.equals(first.camera.position)).toBe(false);
    second.update(0);
    const from = second.camera.getWorldDirection(new Vector3()).x;
    const position = second.camera.position.clone();
    second.update(10);
    expect(second.camera.getWorldDirection(new Vector3()).x).not.toBeCloseTo(from);
    expect(second.camera.position.equals(position)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/components/cam`
Expected: FAIL — `aimCamera`/`pickMount` are not exported; mount 1 equals mount 0.

- [ ] **Step 3: Implement**

Append to `src/components/cam/pan.ts` (add `import type { PerspectiveCamera } from 'three';` at the top):

```ts
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
```

In `src/components/cam/lobby.ts`: change the imports (`import { aimCamera, pickMount } from './pan';` plus `import type { Mount } from './pan';`, dropping `panAngle`), add above `buildLobby`:

```ts
const MOUNTS: readonly [Mount, ...Mount[]] = [
  // Reception: from the front of the hall, sweeping the whole room.
  { position: [0, 2.6, 5], heading: 0, range: 0.6, sweep: 7, hold: 2.5, offset: 0 },
  // Entrance: from the glass doors, turned across the hall toward the desk and the elevators.
  { position: [-7, 2.6, 6], heading: 0.7, range: 0.45, sweep: 8, hold: 3, offset: 2 },
];
```

Change the signature to `export const buildLobby = (mountIndex: number): FeedScene => {`, add `const mount = pickMount(MOUNTS, mountIndex);` at its top, replace `camera.position.set(0, 2.6, 5);` with `camera.position.set(...mount.position);`, and replace the `yaw`/`lookAt` pair (and the comment above it) in `update` with `aimCamera(camera, t, mount);`.

In `src/components/cam/serverRoom.ts` do the same: `MOUNTS`:

```ts
const MOUNTS: readonly [Mount, ...Mount[]] = [
  // Aisle: from the front, down the cold aisle.
  { position: [0, 2.2, 2], heading: 0, range: 0.45, sweep: 9, hold: 3, offset: 3 },
  // Airlock: from the vault door, looking back down the aisle.
  { position: [0, 2.2, -10.8], heading: Math.PI, range: 0.4, sweep: 9, hold: 3, offset: 0 },
];
```

`buildServerRoom = (mountIndex: number)`, `const mount = pickMount(MOUNTS, mountIndex);`, `camera.position.set(...mount.position);` (replacing `camera.position.set(0, 2.2, 2);`), `aimCamera(camera, t, mount);` replacing the `yaw`/`lookAt` pair, and drop the now-unused `panAngle` import.

In `src/components/cam/scenes.ts`: `return buildLobby(feed.mount);` and `return buildServerRoom(feed.mount);`.

- [ ] **Step 4: Run to verify they pass, and look at it**

Run: `npx eslint --fix src/components/cam; pnpm format >/dev/null; pnpm vitest run src/components/cam && pnpm build 2>&1 | grep -E "error|built in"`
Expected: PASS and the build succeeds. Then screenshot `lobby-entrance` and `server-airlock` (throwaway Playwright script, or the playthrough in Task 7) and check the second views read well: nothing clipped by a wall, the airlock camera not inside a rack. Adjust the mount position or heading, not the scene, if it does.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat: camera mounts, with a second lobby and server-room view" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Security office and finance floor scenes

**Files:**

- Create: `src/components/cam/securityOffice.ts`, `src/components/cam/financeFloor.ts`
- Modify: `src/components/cam/scenes.ts` (map the two scenes)
- Modify: `src/components/cam/scenes.test.ts`

**Interfaces:**

- Produces: `buildSecurityOffice(mount: number): FeedScene`, `buildFinanceFloor(mount: number): FeedScene`.
- Consumes: `shapes.ts` (`base, floor, box, glow, cylinder, glass, ASPECT`), `aimCamera`, `pickMount`, `Mount`, `FeedScene`.

- [ ] **Step 1: Write the failing test**

Append to `src/components/cam/scenes.test.ts`:

```ts
describe.each([
  ['securityOffice', 80, 8, -8],
  ['financeFloor', 80, 9, -10],
] as const)('scene %s', (scene, minMeshes, maxX, minZ) => {
  it('is dressed, inside its room, and pans in place', () => {
    const built = buildScene({ scene, mount: 0 })!;
    expect(built).not.toBeNull();
    expect(meshCount(built.scene)).toBeGreaterThan(minMeshes);
    built.scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(built.scene);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-maxX);
    expect(bounds.max.x).toBeLessThanOrEqual(maxX);
    expect(bounds.max.y).toBeLessThanOrEqual(5);
    expect(bounds.min.z).toBeGreaterThanOrEqual(minZ - 0.5);

    built.update(0);
    const from = built.camera.getWorldDirection(new Vector3()).x;
    const position = built.camera.position.clone();
    built.update(10);
    expect(built.camera.getWorldDirection(new Vector3()).x).not.toBeCloseTo(from);
    expect(built.camera.position.equals(position)).toBe(true);
    expect(() => {
      disposeScene(built.scene);
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/components/cam/scenes.test.ts`
Expected: FAIL — `buildScene({ scene: 'securityOffice', … })` is `null`.

- [ ] **Step 3: Implement**

`src/components/cam/securityOffice.ts`:

```ts
import { AmbientLight, PerspectiveCamera, PointLight } from 'three';
import type { Mesh, MeshBasicMaterial, Scene } from 'three';
import { aimCamera, pickMount } from './pan';
import type { Mount } from './pan';
import { ASPECT, base, box, cylinder, floor, glow } from './shapes';
import type { FeedScene } from './scenes';

const MOUNTS: readonly [Mount, ...Mount[]] = [
  { position: [0, 2.4, 4.5], heading: 0, range: 0.5, sweep: 8, hold: 3, offset: 1 },
];

// Walls, floor and a ceiling light strip that stutters.
const addShell = (scene: Scene): MeshBasicMaterial => {
  scene.add(floor(14, 14, 0x141a1f));
  scene.add(box(14, 4, 0.2, 0x1d262c, 0, 2, -7));
  for (const x of [-7, 7]) scene.add(box(0.2, 4, 14, 0x1d262c, x, 2, 0));
  const ceiling = floor(14, 14, 0x0e1317);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 4;
  scene.add(ceiling);
  let flicker: Mesh | null = null;
  for (const z of [-4.5, -0.5, 3.5]) {
    const strip = glow(5, 0.04, 0.35, 0xcfe8ff, 0, 3.96, z);
    scene.add(strip);
    if (z === -0.5) flicker = strip;
  }
  return (flicker as Mesh).material as MeshBasicMaterial;
};

// A wall of monitors, all dark but one that shows static.
const addMonitorWall = (scene: Scene): MeshBasicMaterial => {
  let staticScreen: Mesh | null = null;
  for (let col = 0; col < 6; col += 1) {
    for (let row = 0; row < 3; row += 1) {
      const x = -5 + col * 2;
      const y = 1.2 + row * 0.95;
      scene.add(box(1.8, 0.85, 0.08, 0x0b0f12, x, y, -6.85));
      const lit = col === 3 && row === 1;
      const dark = 0x0b1c26 + ((col + row) % 3) * 0x020406;
      const screen = glow(1.62, 0.7, 0.02, lit ? 0xb8c4cc : dark, x, y, -6.78);
      scene.add(screen);
      if (lit) staticScreen = screen;
    }
  }
  return (staticScreen as Mesh).material as MeshBasicMaterial;
};

// Two console desks with small monitors, keyboards and chairs pushed back; one cold mug.
const addDesks = (scene: Scene): void => {
  for (const z of [-2.2, 0.8]) {
    scene.add(box(8, 0.08, 1.1, 0x2a343b, 0, 0.75, z));
    scene.add(box(8, 0.7, 0.1, 0x1f272c, 0, 0.4, z - 0.5));
    for (const x of [-3.5, -1.2, 1.2, 3.5]) {
      scene.add(glow(0.6, 0.38, 0.04, 0x143846, x, 1.15, z - 0.3));
      scene.add(box(0.45, 0.03, 0.18, 0x0f1418, x, 0.8, z + 0.1));
      scene.add(cylinder(0.26, 0.08, 0x1b2329, x, 0.5, z + 1.1));
      scene.add(cylinder(0.04, 0.45, 0x1b2329, x, 0.25, z + 1.1));
      scene.add(box(0.5, 0.55, 0.08, 0x1b2329, x, 0.85, z + 1.4));
    }
  }
  scene.add(cylinder(0.07, 0.1, 0xe8e0d0, 2.0, 0.84, -1.9));
};

// The security office: a monitor wall, console desks, a stuttering light, a camera panning on its
// mount. Empty.
export const buildSecurityOffice = (mountIndex: number): FeedScene => {
  const mount = pickMount(MOUNTS, mountIndex);
  const scene = base(0x04070a, 8, 24);
  scene.add(new AmbientLight(0x88aacc, 1.5));
  const light = new PointLight(0xcfe8ff, 50, 18);
  light.position.set(0, 3.4, -1);
  scene.add(light);

  const flickerMaterial = addShell(scene);
  const staticMaterial = addMonitorWall(scene);
  addDesks(scene);

  const camera = new PerspectiveCamera(62, ASPECT, 0.1, 40);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    aimCamera(camera, t, mount);
    staticMaterial.color.setHex(Math.sin(t * 40) > 0 ? 0xb8c4cc : 0x8e9aa2);
    const stutter = Math.sin(t * 19) * Math.sin(t * 2.7) > 0.93;
    flickerMaterial.color.setHex(stutter ? 0x383c40 : 0xcfe8ff);
    light.intensity = stutter ? 20 : 50;
  };
  update(0);
  return { scene, camera, update };
};
```

`src/components/cam/financeFloor.ts`:

```ts
import { AmbientLight, PerspectiveCamera, PointLight } from 'three';
import type { Mesh, MeshBasicMaterial, Scene } from 'three';
import { aimCamera, pickMount } from './pan';
import type { Mount } from './pan';
import { ASPECT, base, box, cylinder, floor, glass, glow } from './shapes';
import type { FeedScene } from './scenes';

const MOUNTS: readonly [Mount, ...Mount[]] = [
  { position: [0, 2.8, 6.5], heading: 0, range: 0.5, sweep: 9, hold: 3, offset: 2 },
];

const addShell = (scene: Scene): MeshBasicMaterial => {
  const ground = floor(16, 16, 0x151c22);
  ground.position.z = -1;
  scene.add(ground);
  scene.add(box(16, 4.4, 0.2, 0x1d262c, 0, 2.2, -9));
  for (const x of [-8, 8]) scene.add(box(0.2, 4.4, 16, 0x1d262c, x, 2.2, -1));
  const ceiling = floor(16, 16, 0x0e1317);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 4.4, -1);
  scene.add(ceiling);
  let flicker: Mesh | null = null;
  for (const x of [-4, 0, 4]) {
    for (const z of [-6, -2, 2]) {
      const panel = glow(1.8, 0.04, 0.5, 0xcfe8ff, x, 4.36, z);
      scene.add(panel);
      if (x === 0 && z === -2) flicker = panel;
    }
  }
  return (flicker as Mesh).material as MeshBasicMaterial;
};

// Three rows of five desks with paired dormant monitors and chairs, and glass partitions.
const addDesks = (scene: Scene): void => {
  for (const z of [-6.5, -3.5, -0.5]) {
    for (const x of [-6, -3, 0, 3, 6]) {
      scene.add(box(2, 0.06, 0.9, 0x2b353d, x, 0.74, z));
      scene.add(box(2, 0.7, 0.06, 0x20282e, x, 0.38, z - 0.4));
      scene.add(glow(0.55, 0.34, 0.03, 0x14303f, x - 0.5, 1.1, z - 0.2));
      scene.add(glow(0.55, 0.34, 0.03, 0x14303f, x + 0.5, 1.1, z - 0.2));
      scene.add(cylinder(0.25, 0.08, 0x1b2329, x, 0.5, z + 0.9));
      scene.add(cylinder(0.04, 0.45, 0x1b2329, x, 0.25, z + 0.9));
      scene.add(box(0.45, 0.5, 0.07, 0x1b2329, x, 0.85, z + 1.15));
    }
    for (const x of [-4.5, -1.5, 1.5, 4.5]) scene.add(glass(0.05, 1.2, 2.0, x, 1.0, z));
  }
};

interface Bar {
  mesh: Mesh;
  phase: number;
  rate: number;
}

// The ticker wall: a row of glowing bars that rise and fall.
const addTickerWall = (scene: Scene): Bar[] => {
  scene.add(glow(13.5, 0.03, 0.05, 0x7fb4cf, 0, 1.0, -8.85));
  const bars: Bar[] = [];
  for (let i = 0; i < 14; i += 1) {
    const mesh = glow(0.5, 1, 0.05, i % 2 === 0 ? 0x34ff7a : 0xff3a2a, -6.5 + i, 1.5, -8.85);
    scene.add(mesh);
    bars.push({ mesh, phase: i * 0.9, rate: 0.4 + (i % 4) * 0.15 });
  }
  return bars;
};

// The finance floor after hours: desks, partitions, a ticker wall still moving. Empty.
export const buildFinanceFloor = (mountIndex: number): FeedScene => {
  const mount = pickMount(MOUNTS, mountIndex);
  const scene = base(0x04070a, 10, 28);
  scene.add(new AmbientLight(0x88aacc, 1.5));
  const light = new PointLight(0xcfe8ff, 55, 20);
  light.position.set(0, 3.8, -2);
  scene.add(light);

  const flickerMaterial = addShell(scene);
  addDesks(scene);
  const bars = addTickerWall(scene);

  const camera = new PerspectiveCamera(62, ASPECT, 0.1, 44);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    aimCamera(camera, t, mount);
    for (const bar of bars) {
      const height = 0.6 + (Math.sin(t * bar.rate + bar.phase) + 1) * 0.9;
      bar.mesh.scale.y = height;
      bar.mesh.position.y = 1.0 + height / 2;
    }
    const stutter = Math.sin(t * 21) * Math.sin(t * 2.9) > 0.94;
    flickerMaterial.color.setHex(stutter ? 0x383c40 : 0xcfe8ff);
    light.intensity = stutter ? 25 : 55;
  };
  update(0);
  return { scene, camera, update };
};
```

In `src/components/cam/scenes.ts` add the imports and mappings:

```ts
import { buildFinanceFloor } from './financeFloor';
import { buildSecurityOffice } from './securityOffice';
```

```ts
  if (feed.scene === 'securityOffice') return buildSecurityOffice(feed.mount);
  if (feed.scene === 'financeFloor') return buildFinanceFloor(feed.mount);
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx eslint --fix src/components/cam; pnpm format >/dev/null; pnpm vitest run src/components/cam && pnpm build 2>&1 | grep -E "error|built in"`
Expected: PASS and the build succeeds. If a mesh-count assertion fails, count the `scene.add` calls and add decor (a plant, a bin) rather than lowering the bar. Then screenshot both feeds and check them; fix lighting that reads too dark.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat: security office and finance floor camera scenes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Executive floor (two cameras) and data hall scenes

**Files:**

- Create: `src/components/cam/executiveFloor.ts`, `src/components/cam/dataHall.ts`
- Modify: `src/components/cam/scenes.ts`, `src/components/cam/scenes.test.ts`

**Interfaces:**

- Produces: `buildExecutiveFloor(mount: number)` (mount 0 corridor, mount 1 corner office), `buildDataHall(mount: number)`.

- [ ] **Step 1: Write the failing tests**

In `src/components/cam/scenes.test.ts`, extend the table from Task 3:

```ts
describe.each([
  ['securityOffice', 80, 8, -8],
  ['financeFloor', 80, 9, -10],
  ['executiveFloor', 80, 3, -16],
  ['dataHall', 80, 9, -14],
] as const)('scene %s', (scene, minMeshes, maxX, minZ) => {
```

(only the table changes) and append:

```ts
describe('every camera has a scene', () => {
  it('builds each feed in the data, and the two executive cameras differ', () => {
    for (const feed of CAMERA_FEEDS) expect(buildScene(feed)).not.toBeNull();
    const corridor = buildScene({ scene: 'executiveFloor', mount: 0 })!;
    const office = buildScene({ scene: 'executiveFloor', mount: 1 })!;
    expect(office.camera.position.equals(corridor.camera.position)).toBe(false);
  });
});
```

(import `CAMERA_FEEDS` from `'../../data/cameras'`).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/components/cam/scenes.test.ts`
Expected: FAIL — `buildScene` returns `null` for `executiveFloor` and `dataHall`.

- [ ] **Step 3: Implement**

`src/components/cam/executiveFloor.ts`:

```ts
import { AmbientLight, PerspectiveCamera, PointLight } from 'three';
import type { Mesh, MeshBasicMaterial, Scene } from 'three';
import { aimCamera, pickMount } from './pan';
import type { Mount } from './pan';
import { ASPECT, base, box, cylinder, floor, glass, glow, sphere } from './shapes';
import type { FeedScene } from './scenes';

const MOUNTS: readonly [Mount, ...Mount[]] = [
  // Corridor: from the elevator end, down the runner.
  { position: [0, 2.2, 5.5], heading: 0, range: 0.3, sweep: 10, hold: 3.5, offset: 4 },
  // Corner office: from the window corner, back toward the desk and the corridor.
  { position: [1.8, 2.3, -15], heading: Math.PI, range: 0.5, sweep: 9, hold: 3, offset: 0 },
];

// A long corridor: floor with a runner, panelled walls, a ceiling with light panels (one stutters).
const addCorridor = (scene: Scene): MeshBasicMaterial => {
  const ground = floor(5, 22, 0x1a1816);
  ground.position.z = -5;
  scene.add(ground);
  const runner = floor(1.6, 22, 0x3a1f22);
  runner.position.set(0, 0.01, -5);
  scene.add(runner);
  for (const x of [-2.5, 2.5]) {
    scene.add(box(0.2, 3.6, 22, 0x2a2622, x, 1.8, -5));
    scene.add(box(0.06, 1.0, 22, 0x3a2f26, x * 0.96, 0.5, -5));
  }
  const ceiling = floor(5, 22, 0x0f0e0d);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 3.6, -5);
  scene.add(ceiling);
  let flicker: Mesh | null = null;
  for (const z of [4, 0, -4, -8, -12]) {
    const panel = glow(1.2, 0.04, 0.4, 0xcfe8ff, 0, 3.56, z);
    scene.add(panel);
    if (z === -8) flicker = panel;
  }
  return (flicker as Mesh).material as MeshBasicMaterial;
};

// Closed doors with handles and nameplates, paintings, side tables with vases.
const addDoors = (scene: Scene): void => {
  for (const side of [-1, 1]) {
    for (const z of [2, -1, -4, -7, -10]) {
      scene.add(box(0.08, 2.4, 1.1, 0x3a2c22, side * 2.4, 1.2, z));
      scene.add(box(0.05, 0.05, 0.18, 0x8a7a5a, side * 2.34, 1.1, z + 0.4));
      scene.add(glow(0.02, 0.1, 0.3, 0x6f6a58, side * 2.36, 1.7, z));
    }
    for (const z of [0.5, -2.5, -5.5, -8.5]) {
      scene.add(box(0.04, 0.8, 0.6, 0x1a1612, side * 2.42, 1.9, z - 0.2));
      scene.add(box(0.4, 0.8, 0.9, 0x2f241c, side * 2.2, 0.4, z - 1.2));
      scene.add(cylinder(0.08, 0.3, 0x405060, side * 2.2, 0.95, z - 1.2));
    }
  }
};

// The corner office at the end: window wall with a city skyline glow, a large desk, chairs, a lamp
// that is off, and two plants.
const addOffice = (scene: Scene): void => {
  scene.add(box(5, 3.6, 0.2, 0x1a1f24, 0, 1.8, -16));
  scene.add(glass(3.6, 2.0, 0.06, 0, 2.0, -15.88));
  scene.add(glow(3.4, 1.8, 0.02, 0x1d3a52, 0, 2.0, -15.95));
  for (let i = 0; i < 10; i += 1) {
    const h = 0.4 + ((i * 7) % 5) * 0.25;
    scene.add(box(0.3, h, 0.02, 0x0a1018, -1.5 + i * 0.33, 1.1 + h / 2, -15.9));
  }
  scene.add(box(2.4, 0.08, 1.1, 0x3a2c22, 0, 0.78, -13.5));
  scene.add(box(2.4, 0.7, 1.0, 0x2f241c, 0, 0.4, -13.5));
  scene.add(cylinder(0.27, 0.08, 0x1b1816, 0, 0.55, -14.6));
  scene.add(cylinder(0.04, 0.5, 0x1b1816, 0, 0.28, -14.6));
  scene.add(box(0.55, 0.7, 0.08, 0x1b1816, 0, 1.0, -14.9));
  scene.add(cylinder(0.04, 0.4, 0x3a3a3a, 0.9, 1.0, -13.6));
  scene.add(glow(0.3, 0.1, 0.3, 0x2a2820, 0.9, 1.25, -13.6));
  for (const x of [-1.2, 1.2]) scene.add(cylinder(0.24, 0.08, 0x2a2622, x, 0.5, -11.8));
  for (const x of [-2.1, 2.1]) {
    scene.add(cylinder(0.28, 0.5, 0x2a2f33, x, 0.25, -15.3));
    scene.add(sphere(0.5, 0x2f5a3a, x, 0.95, -15.3));
  }
};

// The executive floor at night: a corridor of closed doors and a corner office at the end. Empty.
export const buildExecutiveFloor = (mountIndex: number): FeedScene => {
  const mount = pickMount(MOUNTS, mountIndex);
  const scene = base(0x050607, 8, 26);
  scene.add(new AmbientLight(0xaa9988, 1.2));
  const light = new PointLight(0xffe8cf, 45, 20);
  light.position.set(0, 3.2, -8);
  scene.add(light);

  const flickerMaterial = addCorridor(scene);
  addDoors(scene);
  addOffice(scene);

  const camera = new PerspectiveCamera(60, ASPECT, 0.1, 44);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    aimCamera(camera, t, mount);
    const stutter = Math.sin(t * 15) * Math.sin(t * 2.1) > 0.94;
    flickerMaterial.color.setHex(stutter ? 0x383c40 : 0xcfe8ff);
    light.intensity = stutter ? 20 : 45;
  };
  update(0);
  return { scene, camera, update };
};
```

`src/components/cam/dataHall.ts`:

```ts
import { AmbientLight, PerspectiveCamera, PointLight } from 'three';
import type { MeshBasicMaterial, Scene } from 'three';
import { aimCamera, pickMount } from './pan';
import type { Mount } from './pan';
import { ASPECT, base, box, cylinder, floor, glass, glow } from './shapes';
import type { FeedScene } from './scenes';

const MOUNTS: readonly [Mount, ...Mount[]] = [
  { position: [0, 2.6, 7], heading: 0, range: 0.4, sweep: 10, hold: 3, offset: 5 },
];

interface Standby {
  material: MeshBasicMaterial;
  phase: number;
}

// Four rows of sealed cabinets facing the aisles: a standby strip, a grill and a red seal each.
const addCabinets = (scene: Scene): Standby[] => {
  const standby: Standby[] = [];
  let n = 0;
  for (const x of [-6, -2.6, 2.6, 6]) {
    const facing = x < 0 ? 1 : -1;
    for (let i = 0; i < 6; i += 1) {
      const z = -1 - i * 2;
      scene.add(box(1.2, 2.8, 1.4, 0x1a232b, x, 1.4, z));
      const strip = glow(0.04, 2.2, 0.2, 0x4a90e0, x + facing * 0.62, 1.4, z);
      scene.add(strip);
      standby.push({ material: strip.material as MeshBasicMaterial, phase: n });
      scene.add(box(0.02, 0.5, 0.9, 0x0c1013, x + facing * 0.62, 0.6, z));
      scene.add(glow(0.04, 0.08, 1.2, 0xff3a2a, x + facing * 0.62, 2.0, z));
      n += 1;
    }
  }
  return standby;
};

const addShell = (scene: Scene): void => {
  const ground = floor(16, 22, 0x10151a);
  ground.position.z = -3;
  scene.add(ground);
  scene.add(box(16, 4.2, 0.2, 0x1c242a, 0, 2.1, -14));
  for (const x of [-8, 8]) scene.add(box(0.2, 4.2, 22, 0x1c242a, x, 2.1, -3));
  const ceiling = floor(16, 22, 0x0d1115);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 4.2, -3);
  scene.add(ceiling);
  for (const x of [-4, 0, 4]) scene.add(glow(0.25, 0.04, 16, 0x5aa0ff, x, 4.16, -3));
  for (const x of [-0.9, 0.9]) scene.add(glow(0.05, 0.02, 20, 0x4fa7c8, x, 0.03, -3));
  scene.add(glass(16, 3.4, 0.05, 0, 1.7, 2)); // the glass wall in front of the hall
};

// The vault door at the far end, locked.
const addVault = (scene: Scene): void => {
  scene.add(box(3, 3.2, 0.3, 0x2a3238, 0, 1.6, -13.8));
  const wheel = cylinder(0.5, 0.12, 0x4a5861, 0, 1.6, -13.6);
  wheel.rotation.x = Math.PI / 2;
  scene.add(wheel);
  scene.add(glow(1.6, 0.08, 0.04, 0xff3a2a, 0, 3.3, -13.6));
};

// Data hall B: sealed cold-storage and accelerator cabinets under blue standby light. Empty.
export const buildDataHall = (mountIndex: number): FeedScene => {
  const mount = pickMount(MOUNTS, mountIndex);
  const scene = base(0x03060a, 8, 28);
  scene.add(new AmbientLight(0x7799cc, 1.8));
  const light = new PointLight(0x8ab8ff, 60, 22);
  light.position.set(0, 3.6, -3);
  scene.add(light);

  addShell(scene);
  addVault(scene);
  const standby = addCabinets(scene);

  const camera = new PerspectiveCamera(62, ASPECT, 0.1, 44);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    aimCamera(camera, t, mount);
    for (const s of standby) {
      s.material.color.setHex(Math.sin(t * 0.8 + s.phase) > 0 ? 0x4a90e0 : 0x2a5a9a);
    }
    const stutter = Math.sin(t * 13) * Math.sin(t * 1.7) > 0.95;
    light.intensity = stutter ? 30 : 60;
  };
  update(0);
  return { scene, camera, update };
};
```

In `src/components/cam/scenes.ts` add:

```ts
import { buildDataHall } from './dataHall';
import { buildExecutiveFloor } from './executiveFloor';
```

```ts
  if (feed.scene === 'executiveFloor') return buildExecutiveFloor(feed.mount);
  if (feed.scene === 'dataHall') return buildDataHall(feed.mount);
```

Every scene now exists. If lint reports `return null` as unreachable-by-type, narrow `buildScene`'s return type to `FeedScene`, drop `| null`, and remove the `if (built === null)` guard in `render.ts`; otherwise leave both alone.

- [ ] **Step 4: Run to verify they pass**

Run: `npx eslint --fix src/components/cam; pnpm format >/dev/null; pnpm vitest run src/components/cam && pnpm build 2>&1 | grep -E "error|built in" && pnpm lint 2>&1 | tail -4`
Expected: PASS, build succeeds, lint clean. Then screenshot each new feed (executive corridor, corner office, data hall) and fix lighting that reads too dark, the way the lobby did, then re-run.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat: executive floor and data hall camera scenes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The floor menu

**Files:**

- Create: `src/components/CamMenu.tsx`
- Modify: `src/components/CamPane.tsx` (use the menu instead of the name buttons), `src/styles/globals.css`
- Create: `src/components/CamMenu.test.tsx`
- Modify: `src/components/CamPane.test.tsx` (select through the menu)

**Interfaces:**

- Produces: `<CamMenu feeds={readonly ListedFeed[]} selectedId={string} onSelect={(id: string) => void} />`. Roles: the opener is a `button` with `aria-haspopup="menu"` and `aria-expanded`; the popover is `role="menu"`; floor headings are `role="menuitem"` with `aria-expanded`; cameras are `role="menuitemradio"` with `aria-checked`.
- Consumes: `FLOORS`, `floorName` (Task 1), `ListedFeed`.

- [ ] **Step 1: Write the failing tests**

`src/components/CamMenu.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CamMenu } from './CamMenu';
import { CAMERA_FEEDS } from '../data/cameras';

const feedsUpTo = (layer: number) =>
  CAMERA_FEEDS.flatMap(f => {
    const live = layer >= f.unlockLayer;
    return live || f.offlineReason !== null ? [{ ...f, live }] : [];
  });

const setup = (layer = 1, selectedId = 'lobby-reception') => {
  const onSelect = vi.fn();
  const view = render(<CamMenu feeds={feedsUpTo(layer)} selectedId={selectedId} onSelect={onSelect} />);
  return { onSelect, ...view };
};

const opener = () => screen.getByRole('button', { name: /GROUND FLOOR › Lobby \(reception\)/i });

describe('CamMenu', () => {
  it('shows where the player is on the opener, and starts closed', () => {
    setup();
    expect(opener().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('lists only floors that have a listed camera, in order', () => {
    setup(1);
    fireEvent.click(opener());
    const floors = screen.getAllByRole('menuitem').map(el => el.textContent ?? '');
    expect(floors.map(t => t.replace(/[▸▾]\s*/, ''))).toEqual(['GROUND FLOOR', 'OPERATIONS', 'EXECUTIVE']);
  });

  it('adds floors as layers are reached', () => {
    setup(5);
    fireEvent.click(opener());
    const floors = screen.getAllByRole('menuitem').map(el => (el.textContent ?? '').replace(/[▸▾]\s*/, ''));
    expect(floors).toEqual([
      'GROUND FLOOR',
      'OPERATIONS',
      'SECURITY',
      'FINANCE',
      'EXECUTIVE',
      'SUB-LEVEL B',
    ]);
  });

  it('opens with the current floor expanded and the others collapsed', () => {
    setup();
    fireEvent.click(opener());
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitemradio', { name: 'Lobby (reception)' })).toBeTruthy();
    expect(within(menu).getByRole('menuitemradio', { name: 'Lobby (entrance)' })).toBeTruthy();
    expect(within(menu).queryByRole('menuitemradio', { name: 'Server room (aisle)' })).toBeNull();
  });

  it('expands and collapses a floor', () => {
    setup();
    fireEvent.click(opener());
    const operations = screen.getByRole('menuitem', { name: /OPERATIONS/ });
    expect(operations.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(operations);
    expect(screen.getByRole('menuitemradio', { name: 'Server room (aisle)' })).toBeTruthy();
    fireEvent.click(operations);
    expect(screen.queryByRole('menuitemradio', { name: 'Server room (aisle)' })).toBeNull();
  });

  it('selects a camera, calls back and closes', () => {
    const { onSelect } = setup();
    fireEvent.click(opener());
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Lobby (entrance)' }));
    expect(onSelect).toHaveBeenCalledWith('lobby-entrance');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('marks the selected camera and dims the offline ones', () => {
    setup(1);
    fireEvent.click(opener());
    expect(
      screen.getByRole('menuitemradio', { name: 'Lobby (reception)' }).getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('menuitem', { name: /EXECUTIVE/ }));
    const corridor = screen.getByRole('menuitemradio', { name: /Executive corridor/ });
    expect(corridor.textContent).toContain('offline');
    expect(corridor.className).toContain('cam-menu-off');
  });

  it('closes on Escape and on a click outside', () => {
    setup();
    fireEvent.click(opener());
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(opener());
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves through the items with the arrow keys, wrapping around', () => {
    setup();
    fireEvent.click(opener());
    const items = screen.getAllByRole(/menuitem/);
    items[0]!.focus();
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items.at(-1));
  });

  it('shows a neutral label when the selected camera is no longer listed', () => {
    setup(1, 'finance-floor');
    expect(screen.getByRole('button', { name: /CAMERAS/ })).toBeTruthy();
  });

  it('never uses the secret name', () => {
    const { container } = setup(5);
    fireEvent.click(opener());
    expect(container.textContent).not.toMatch(/aria/i);
  });
});
```

In `src/components/CamPane.test.tsx`, add a helper and replace the switcher clicks:

```tsx
const pick = (floor: RegExp, camera: string) => {
  fireEvent.click(screen.getByRole('button', { name: /›/ }));
  const heading = screen.getByRole('menuitem', { name: floor });
  if (heading.getAttribute('aria-expanded') === 'false') fireEvent.click(heading);
  fireEvent.click(screen.getByRole('menuitemradio', { name: new RegExp(camera) }));
};
```

then in the tests that did `fireEvent.click(screen.getByRole('button', { name: 'Server room (aisle)' }))` use `pick(/OPERATIONS/, 'Server room \\(aisle\\)')`, and for the executive corridor `pick(/EXECUTIVE/, 'Executive corridor')`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/components/CamMenu.test.tsx src/components/CamPane.test.tsx`
Expected: FAIL — `./CamMenu` not found; `CamPane` still renders name buttons.

- [ ] **Step 3: Implement**

`src/components/CamMenu.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { FLOORS, floorName } from '../data/cameras';
import type { ListedFeed } from '../engine/cameras';

interface Props {
  feeds: readonly ListedFeed[];
  selectedId: string;
  onSelect: (id: string) => void;
}

// Floors that have at least one listed camera, in the building's order.
const floorsWithFeeds = (feeds: readonly ListedFeed[]) =>
  FLOORS.flatMap(floor => {
    const own = feeds.filter(f => f.floor === floor.id);
    return own.length > 0 ? [{ ...floor, feeds: own }] : [];
  });

export const CamMenu = ({ feeds, selectedId, onSelect }: Props) => {
  const selected = feeds.find(f => f.id === selectedId);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  const toggleMenu = () => {
    if (!open && selected) setExpanded(prev => new Set(prev).add(selected.floor));
    setOpen(!open);
  };

  const toggleFloor = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false);
      event.stopPropagation();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-menu-item]') ?? []);
    if (items.length === 0) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    items[(next + items.length) % items.length]?.focus();
  };

  const label = selected ? `${floorName(selected.floor)} › ${selected.name}` : 'CAMERAS';

  return (
    <div className="cam-menu" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="cam-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggleMenu}>
        {`${label.toUpperCase() === label ? label : label} ▾`}
      </button>
      {open && (
        <div className="cam-menu-popover" role="menu">
          {floorsWithFeeds(feeds).map(floor => (
            <div key={floor.id} role="group" aria-label={floor.name}>
              <button
                type="button"
                role="menuitem"
                data-menu-item
                className="cam-menu-floor"
                aria-expanded={expanded.has(floor.id)}
                onClick={() => {
                  toggleFloor(floor.id);
                }}>
                {`${expanded.has(floor.id) ? '▾' : '▸'} ${floor.name.toUpperCase()}`}
              </button>
              {expanded.has(floor.id) &&
                floor.feeds.map(feed => (
                  <button
                    key={feed.id}
                    type="button"
                    role="menuitemradio"
                    data-menu-item
                    aria-checked={feed.id === selectedId}
                    className={feed.live ? 'cam-menu-item' : 'cam-menu-item cam-menu-off'}
                    onClick={() => {
                      onSelect(feed.id);
                      setOpen(false);
                    }}>
                    {feed.live ? feed.name : `${feed.name} — offline`}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

(Simplify the opener text to `{`${label} ▾`}` — the conditional above is a leftover and must not be kept. The test matches `GROUND FLOOR › Lobby (reception)` case-insensitively, so keep the floor name as `floorName` returns it.)

In `src/components/CamPane.tsx`, import `CamMenu`, and replace the `feeds.map(f => <button …>)` switcher with:

```tsx
        <CamMenu feeds={feeds} selectedId={feed.id} onSelect={setSelected} />
```

Append to `src/styles/globals.css` after the `.cam-bar` rules:

```css
.cam-menu {
  position: relative;
}

.cam-menu-button,
.cam-menu-floor,
.cam-menu-item {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--win-title-color);
  background: transparent;
  border: 1px solid var(--win-border);
  cursor: pointer;
}

.cam-menu-button {
  padding: 0 6px;
}

.cam-menu-popover {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  z-index: 5;
  min-width: 240px;
  max-height: 190px;
  overflow-y: auto;
  background: #0b1015;
  border: 1px solid var(--win-border);
}

.cam-menu-floor,
.cam-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  padding: 3px 8px;
}

.cam-menu-item {
  padding-left: 22px;
}

.cam-menu-item[aria-checked='true'] {
  background: rgba(255, 255, 255, 0.12);
}

.cam-menu-off {
  opacity: 0.5;
}

.cam-menu-floor:focus-visible,
.cam-menu-item:focus-visible,
.cam-menu-button:focus-visible {
  outline: 1px solid var(--win-title-color);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx eslint --fix src/components; pnpm format >/dev/null; pnpm vitest run src/components && pnpm build 2>&1 | grep -E "error|built in" && pnpm lint 2>&1 | tail -4`
Expected: PASS, build succeeds, lint clean. Then screenshot the open menu in the aux pane and check it fits (about 550×290) and scrolls rather than clipping; shorten `max-height` if it covers the bar.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat: a floor menu with the cameras as submenus" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Keep the CAM tab while moving, and mark new cameras unread

**Files:**

- Modify: `src/components/Workspace.tsx`
- Modify: `src/components/Workspace.cam.test.tsx`

**Interfaces:**

- Consumes: `cameraFeeds` / `ListedFeed` (Task 1), `useUnread` (existing).

- [ ] **Step 1: Write the failing tests**

Add to `src/components/Workspace.cam.test.tsx` (below the existing `at` helper):

```tsx
const held = (nodeIds: string[], current: string): GameState =>
  produce(createInitialState(), s => {
    for (const id of nodeIds) s.network.nodes[id]!.accessLevel = 'user';
    s.network.currentNodeId = current;
  });
```

and, inside `describe('Workspace CAM tab', …)`:

```tsx
  it('keeps the CAM tab while moving deeper, as long as the controller session is held', () => {
    render(view(held(['ops_cctv_ctrl', 'ops_hr_db'], 'ops_hr_db')));
    expect(screen.getByRole('button', { name: 'CAM' })).toBeTruthy();
  });

  it('shows no CAM tab for a run that went deep without ever taking the controller', () => {
    render(view(held(['sec_access_ctrl'], 'sec_access_ctrl')));
    expect(screen.queryByRole('button', { name: 'CAM' })).toBeNull();
  });

  it('falls back to the map when the controller session is lost while on CAM', () => {
    const v = render(view(held(['ops_cctv_ctrl'], 'ops_cctv_ctrl')));
    fireEvent.click(screen.getByRole('button', { name: 'CAM' }));
    v.rerender(view(held([], 'ops_cctv_ctrl')));
    expect(screen.queryByTestId('cam-pane')).toBeNull();
    expect(screen.getByTestId('map-pane')).toBeTruthy();
  });

  it('starts read, then marks the aux pane unread when a camera unlocks off-screen', () => {
    const v = render(view(held(['ops_cctv_ctrl'], 'ops_cctv_ctrl')));
    expect(document.body.textContent).not.toMatch(/4:aux\*?!/);
    v.rerender(view(held(['ops_cctv_ctrl', 'sec_access_ctrl'], 'sec_access_ctrl')));
    expect(document.body.textContent).toMatch(/4:aux\*?!/);
  });

  it('reads the unlock once the CAM tab is open', () => {
    const v = render(view(held(['ops_cctv_ctrl'], 'ops_cctv_ctrl')));
    fireEvent.click(screen.getByRole('button', { name: 'CAM' }));
    v.rerender(view(held(['ops_cctv_ctrl', 'sec_access_ctrl'], 'sec_access_ctrl')));
    expect(document.body.textContent).not.toMatch(/4:aux\*?!/);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/components/Workspace.cam.test.tsx`
Expected: FAIL — the "unread" test fails (a camera unlocking raises no marker). The others may already pass from Task 1.

- [ ] **Step 3: Implement**

In `src/components/Workspace.tsx`, after the `camVisible` definition add:

```tsx
    // A camera going live is news for the aux pane, like a new case entry: unread until the CAM tab
    // is actually on screen. A resumed run starts read.
    const camUnread = useUnread(
      feeds.filter(f => f.live).length,
      shownAuxTab === 'cam' && camVisible,
      gameState?.runId ?? null,
      true,
    );
    const auxUnread = caseUnread || camUnread;
```

then change `unread={{ comms: commsUnread, aux: caseUnread }}` to `aux: auxUnread` and, in the `StatusBar` props, `...(caseUnread ? (['aux'] as const) : [])` to `...(auxUnread ? (['aux'] as const) : [])`.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run src/components/Workspace.cam.test.tsx && pnpm lint 2>&1 | tail -4`
Expected: PASS and lint clean. If the regex does not match the status bar's real text, read `src/layout/StatusBar.tsx` for how `unread` renders and adjust the regex, not the behaviour.

- [ ] **Step 5: Commit**

```bash
git add src/components/Workspace.tsx src/components/Workspace.cam.test.tsx
git commit -m "feat: mark the aux pane unread when a camera comes online" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Playthrough checks and docs

**Files:**

- Modify: `playwright-playthrough.mjs`
- Modify: `CLAUDE.md` (the CAM sentence in the Tiled layout paragraph)

- [ ] **Step 1: Add the playthrough checks**

In `playwright-playthrough.mjs`, add helpers above the `try {` block (next to the other helpers):

```js
// The floors the CAM menu lists right now (opens the CAM tab and the menu, then closes the menu).
const camFloors = async () => {
  await page.getByRole('button', { name: 'CAM', exact: true }).click();
  await page.waitForTimeout(400);
  await page.locator('.cam-menu-button').click();
  const floors = await page.getByRole('menuitem').allInnerTexts();
  await page.keyboard.press('Escape');
  return floors.map(f => f.replace(/^[▸▾]\s*/, ''));
};

// Opens a camera through the menu: expand its floor if needed, then pick it.
const pickCamera = async (floor, camera) => {
  await page.locator('.cam-menu-button').click();
  const heading = page.getByRole('menuitem', { name: new RegExp(floor, 'i') });
  if ((await heading.getAttribute('aria-expanded')) === 'false') await heading.click();
  await page.getByRole('menuitemradio', { name: new RegExp(camera) }).click();
  await page.waitForTimeout(600);
};
```

After `await cmd('cat calendar_access.cfg'); // e.torres in plain text` (layer 3) add:

```js
  const floorsAtThree = await camFloors();
  check(
    'layer 3 has unlocked the security and finance floors',
    floorsAtThree.includes('SECURITY') && floorsAtThree.includes('FINANCE'),
    floorsAtThree.join(', '),
  );
  await pickCamera('EXECUTIVE', 'Executive corridor');
  check(
    'the executive floor is still disabled at layer 3',
    (await page.locator('[data-testid="cam-offline"]').count()) === 1,
  );
  await page.getByRole('button', { name: 'MAP', exact: true }).click();
```

After `await cmd('exfil subnet_key.bin'); // opens the way into the restricted subnet` (layer 4) add:

```js
  await camFloors();
  await pickCamera('EXECUTIVE', 'Corner office');
  check(
    'layer 4 brings the executive floor online',
    (await page.locator('[data-testid="cam-offline"]').count()) === 0 &&
      (await page.locator('[data-testid="cam-canvas"]').count()) === 1,
  );
  await page.getByRole('button', { name: 'MAP', exact: true }).click();
```

Immediately before the existing `check('reading the self-model shows the note as draft 7', …)` add:

```js
  const floorsAtFive = await camFloors();
  check(
    'the restricted subnet unlocks the last floor',
    floorsAtFive.includes('SUB-LEVEL B'),
    floorsAtFive.join(', '),
  );
  await page.getByRole('button', { name: 'MAP', exact: true }).click();
```

- [ ] **Step 2: Run the playthrough**

Run: start `pnpm dev` (background), then `node playwright-playthrough.mjs --headless 2>&1 | grep -E "PASS|FAIL|checks? failed"`
Expected: every check passes, including the new ones (the earlier "CAM tab shows a live camera feed" check still has to pass: it clicks the CAM tab and looks for a canvas on the first camera). If a check fails on timing the first time after a dependency change, rerun once before touching code. If a name misses, the `check` detail prints the floors it saw.

- [ ] **Step 3: Update the docs**

In `CLAUDE.md`, replace the sentence beginning `While you hold a session on the CCTV controller the aux pane also gets a **CAM** tab` (through `there is no AI call for camera feeds.`, and any `Design:` sentence that follows it for the cameras) with:

```
While you hold a session on the CCTV controller the aux pane also gets a **CAM** tab (`src/components/CamPane.tsx`), from any node: looping three.js night-vision footage with a camera pan, a floor menu (`CamMenu`: floors, each expanding to its named cameras), a NIGHT VISION toggle and a FULL SCREEN toggle (the aux pane's zoom). Cameras have readable ids (`lobby-reception`, `server-aisle`, …) on floors, and a scene plus a mount (position, heading, pan) so one room can host two cameras; `cam_01`–`cam_03` survive as aliases because `camera_config.ini` and the incident report use them. The controller enables more as you go deeper: `deepestLayer` (highest layer where you hold a session) against each feed's `unlockLayer` in `src/data/cameras.ts` decides which are listed and which are live (the executive cameras are listed from the start as disabled and come alive at layer 4); a camera coming online marks the aux pane unread. It is pure derived UI (`cameraFeeds` in `src/engine/cameras.ts`) with no flags or saves, and three.js loads lazily from `src/components/cam/` (one builder per scene). `view-cam <id|alias>` reads the same feed data, so the terminal and the viewer cannot disagree; there is no AI call for camera feeds. Designs: `docs/superpowers/specs/2026-10-04-cctv-feeds-design.md`, `docs/superpowers/specs/2026-10-04-cctv-unlock-design.md`.
```

- [ ] **Step 4: Full pre-PR checks**

Run: `pnpm format && pnpm build && pnpm lint && pnpm test:coverage 2>&1 | tail -15 && pnpm knip 2>&1 | grep -i -E "camera|cam/|CamPane|CamMenu|auxTabs|cameras" ; echo done`
Expected: all pass; knip prints nothing about these files.

- [ ] **Step 5: Commit**

```bash
git add playwright-playthrough.mjs CLAUDE.md
git commit -m "test: check the unlocking floors in the playthrough and document them" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
