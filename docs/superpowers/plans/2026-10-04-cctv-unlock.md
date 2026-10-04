# CCTV feeds that unlock with progress — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The CCTV feeds are reachable from anywhere while the player holds a session on `ops_cctv_ctrl`, and the controller enables more cameras as the player reaches deeper layers (four new scenes; the executive-floor feed comes alive at layer 4).

**Architecture:** Still pure derived UI. `deepestLayer(state)` (highest layer where a session is held) and each feed's `unlockLayer` decide which feeds are listed and which are live. `cameraFeeds` returns `ListedFeed[]` (`CameraFeed & { live }`); `CamPane`, `view-cam` and the unread marker all read it. New scenes are pure builders beside the existing ones, reusing `shapes.ts` and `pan.ts`.

**Tech Stack:** React 19, TypeScript, three.js (already a dependency), Vitest (jsdom for components), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-cctv-unlock-design.md` (extends `2026-10-04-cctv-feeds-design.md`).

## Global Constraints

- No flags, saves or trace effects from the viewer; `SAVE_VERSION` stays 6. State is derived from node `accessLevel`.
- Feeds are available while `nodes.ops_cctv_ctrl.accessLevel !== 'none'`, from any current node.
- A feed is **live** when `deepestLayer(state) >= unlockLayer`. A feed with an `offlineReason` is always listed (card until live); every other feed is listed only once live. Order is by id.
- Lineup: `cam_01` lobby (1), `cam_02` server room (1), `cam_03` executive floor (4, offline "FEED DISABLED — CEO OFFICE" until then), `cam_04` security office (2), `cam_05` finance floor (3), `cam_06` data hall b (5).
- `cam_03` keeps +1 trace, offline or live; the others cost none. `view-cam` and the viewer read the same data.
- Labels, descriptions and offline reasons never contain the secret name (`/aria/i`); `ariaNameLeak.test.ts` already covers every `CAMERA_FEEDS` entry.
- New scenes are empty, clue-free, same night-vision look, pan in place, one flickering light; each builder is bounded to its room.
- Animations only inside `@media (prefers-reduced-motion: no-preference)`; `src/components/**` is excluded from coverage.
- ESLint strictTypeChecked, arrow functions, Prettier, 75% per-file coverage, lowercase conventional-commit subjects, commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never pipe a `git commit` into `tail` (it hides a rejected commit).
- Before the final PR: `pnpm format` first, then `pnpm build`, `pnpm lint`, `pnpm test:coverage`, `pnpm knip`.

## Review Focus

- Losing the controller session while on CAM (e.g. the session is revoked): the aux pane falls back to MAP, no empty pane (existing `resolveAuxTab`; covered by Task 3's test).
- A feed that becomes live while it is the selected one: the card must swap for the scene and start exactly one renderer (Task 1 CamPane test).
- `view-cam` for an unlisted or not-yet-unlocked id must not reveal that it exists or what it shows (Task 2 test).
- A resumed or reloaded run must not show every unlock as unread (Task 3 test: initial render is read).
- A run that holds a session on a deeper layer without ever holding one on the controller must show no cameras (Task 1 test).

---

### Task 1: Unlock data, `deepestLayer`, `cameraFeeds`, and the viewer's `live` handling

**Files:**

- Modify: `src/data/cameras.ts`
- Modify: `src/engine/cameras.ts`
- Modify: `src/components/CamPane.tsx`
- Modify: `src/components/CamPane.test.tsx`
- Modify: `src/components/cam/scenes.ts` (id type only; the new ids map to `null` until Tasks 4–5)
- Rewrite: `src/engine/__tests__/cameras.test.ts`

**Interfaces:**

- Produces: `CameraFeed` gains `unlockLayer: number`; `id` becomes `'cam_01' | … | 'cam_06'`; `CAMERA_FEEDS` holds six feeds; `interface ListedFeed extends CameraFeed { live: boolean }`; `deepestLayer(state: GameState): number`; `cameraFeeds(state): readonly ListedFeed[]`.
- Consumes: `GameState.network.nodes[*].layer / accessLevel`.

- [ ] **Step 1: Write the failing tests**

Replace `src/engine/__tests__/cameras.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { cameraFeeds, deepestLayer } from '../cameras';
import { CAMERA_FEEDS } from '../../data/cameras';
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

  it('lists the first cameras at layer 1, with the executive floor offline', () => {
    const feeds = cameraFeeds(held([L1], L1));
    expect(feeds.map(f => f.id)).toEqual(['cam_01', 'cam_02', 'cam_03']);
    expect(feeds.filter(f => !f.live).map(f => f.id)).toEqual(['cam_03']);
  });

  it('keeps the feeds after leaving the controller, from any node', () => {
    expect(ids(held([L1, 'ops_hr_db'], 'ops_hr_db'))).toEqual(['cam_01', 'cam_02', 'cam_03']);
  });

  it('adds a camera with each layer, and cam_03 goes live at layer 4', () => {
    expect(liveIds(held([L1, L2]))).toEqual(['cam_01', 'cam_02', 'cam_04']);
    expect(liveIds(held([L1, L2, L3]))).toEqual(['cam_01', 'cam_02', 'cam_04', 'cam_05']);
    expect(liveIds(held([L1, L2, L3, L4]))).toEqual([
      'cam_01',
      'cam_02',
      'cam_03',
      'cam_04',
      'cam_05',
    ]);
    expect(liveIds(held([L1, L2, L3, L4, L5]))).toContain('cam_06');
  });

  it('never lists a camera before its layer', () => {
    expect(ids(held([L1, L2]))).not.toContain('cam_05');
    expect(ids(held([L1, L2, L3, L4]))).not.toContain('cam_06');
  });

  it('lists every feed once, in id order', () => {
    const all = ids(held([L1, L2, L3, L4, L5]));
    expect(all).toEqual([...all].sort());
    expect(new Set(all).size).toBe(6);
  });
});

describe('camera data', () => {
  it('matches the three cameras named in camera_config.ini', () => {
    const ini = createInitialState().network.nodes[L1]!.files.find(
      f => f.name === 'camera_config.ini',
    );
    for (const feed of CAMERA_FEEDS.filter(f => ['cam_01', 'cam_02', 'cam_03'].includes(f.id))) {
      expect(ini?.content).toContain(`${feed.id}=${feed.label.replace(' ', '_')}`);
    }
  });

  it('describes the server-room lights as red and green, like the scene', () => {
    expect(CAMERA_FEEDS.find(f => f.id === 'cam_02')?.description).toMatch(/red and green/);
  });

  it('has a description for every feed that can go live', () => {
    for (const feed of CAMERA_FEEDS) expect(feed.description.length).toBeGreaterThan(40);
  });

  it('never uses the secret name in player-visible text', () => {
    for (const feed of CAMERA_FEEDS) {
      expect(`${feed.label} ${feed.description} ${feed.offlineReason ?? ''}`).not.toMatch(/aria/i);
    }
  });
});
```

In `src/components/CamPane.test.tsx`, add above `beforeEach`:

```tsx
const FEEDS = CAMERA_FEEDS.filter(f => ['cam_01', 'cam_02', 'cam_03'].includes(f.id)).map(f => ({
  ...f,
  live: f.offlineReason === null,
}));
```

then replace every use of `CAMERA_FEEDS` below the import with `FEEDS` (`sed -i '' '/^import/!s/CAMERA_FEEDS/FEEDS/g' src/components/CamPane.test.tsx` — the `FEEDS` constant itself already says `CAMERA_FEEDS.filter`, so afterwards restore that one line by hand). Add this test inside the `describe('CamPane', …)`:

```tsx
it('swaps the card for the scene when the selected feed goes live', async () => {
  const offline = FEEDS.map(f => ({ ...f }));
  const view = render(
    <CamPane feeds={offline} visible fullscreen={false} onToggleFullscreen={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'CAM 03' }));
  expect(screen.getByTestId('cam-offline')).toBeTruthy();
  expect(startFeed).not.toHaveBeenCalled();

  const live = FEEDS.map(f => ({ ...f, live: true }));
  view.rerender(<CamPane feeds={live} visible fullscreen={false} onToggleFullscreen={vi.fn()} />);
  expect(screen.queryByTestId('cam-offline')).toBeNull();
  await vi.waitFor(() => {
    expect(startFeed).toHaveBeenCalledTimes(1);
  });
  expect(startFeed.mock.calls[0]?.[1]).toBe('cam_03');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/engine/__tests__/cameras.test.ts src/components/CamPane.test.tsx`
Expected: FAIL — `deepestLayer` is not exported, `live` does not exist, new ids missing.

- [ ] **Step 3: Implement**

`src/data/cameras.ts` (replace the whole file):

```ts
export const CCTV_NODE_ID = 'ops_cctv_ctrl';

export interface CameraFeed {
  id: 'cam_01' | 'cam_02' | 'cam_03' | 'cam_04' | 'cam_05' | 'cam_06';
  label: string;
  // The deepest layer the player must have reached (holding a session) for this feed to be live.
  unlockLayer: number;
  // Set when the feed is listed before it is live: the card shown until then.
  offlineReason: string | null;
  // What `view-cam` prints for a live feed. Authored to match the viewer's scene.
  description: string;
  // Trace added when the player opens this feed.
  traceCost: number;
}

// cam_01–cam_03 match camera_config.ini on the CCTV controller; the controller enabling the rest
// as the player goes deeper is the discovery.
export const CAMERA_FEEDS: readonly CameraFeed[] = [
  {
    id: 'cam_01',
    label: 'lobby',
    unlockLayer: 1,
    offlineReason: null,
    description:
      'Main lobby, night. Emergency lighting only, and one ceiling fixture flickers over the reception desk. The hall is empty and the camera pans slowly from left to right.',
    traceCost: 0,
  },
  {
    id: 'cam_02',
    label: 'server room',
    unlockLayer: 1,
    offlineReason: null,
    description:
      'Server room. Two rows of racks, status lights blinking red and green in no particular order. Nothing moves; the cooling units hold a steady note.',
    traceCost: 0,
  },
  {
    id: 'cam_03',
    label: 'executive floor',
    unlockLayer: 4,
    offlineReason: 'FEED DISABLED — CEO OFFICE',
    description:
      'Executive floor, night. A long corridor of closed doors, and at its end a corner office with the desk lamp off and the city glowing through the window. Nobody is here.',
    traceCost: 1,
  },
  {
    id: 'cam_04',
    label: 'security office',
    unlockLayer: 2,
    offlineReason: null,
    description:
      'Security operations office. A wall of monitors, all dark but one that shows only static. Chairs pushed back from the desks, a cold mug beside a keyboard. Nothing moves.',
    traceCost: 0,
  },
  {
    id: 'cam_05',
    label: 'finance floor',
    unlockLayer: 3,
    offlineReason: null,
    description:
      'Finance floor, after hours. Rows of desks with paired monitors asleep behind glass partitions, and a ticker wall still sliding bars of light across the far wall. No one is at a desk.',
    traceCost: 0,
  },
  {
    id: 'cam_06',
    label: 'data hall b',
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

In `src/components/CamPane.tsx`: change the imports and props to use the listed feed, and the stage to use `live`:

```tsx
import type { ListedFeed } from '../engine/cameras';
```

(remove `import type { CameraFeed } from '../data/cameras';`), then replace `CameraFeed` with `ListedFeed` throughout the file (props `feeds: readonly ListedFeed[]`, `camNumber`, `Canvas`'s `feed: ListedFeed`), and replace the stage's conditional:

```tsx
        {feed.live ? (
          <Canvas key={feed.id} feed={feed} visible={visible} />
        ) : (
          <div className="cam-card cam-static" data-testid="cam-offline">
            {feed.offlineReason ?? 'NO SIGNAL'}
          </div>
        )}
```

In `src/components/cam/scenes.ts` nothing needs to change: `buildScene` already returns `null` for ids it does not map, and `CameraFeed['id']` now includes the new ids.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run src/engine/__tests__/cameras.test.ts src/components/CamPane.test.tsx && pnpm build 2>&1 | grep -E "error|built in"`
Expected: PASS (all of both files), build succeeds. If `deepestLayer(createInitialState())` is not 0, a node starts with a session: read `createInitialState` and fix the test's expectation only if the initial session is by design (the contractor portal starts at `none`).

- [ ] **Step 5: Commit**

```bash
git add src/data/cameras.ts src/engine/cameras.ts src/components/CamPane.tsx src/components/CamPane.test.tsx src/engine/__tests__/cameras.test.ts
git commit -m "feat: unlock cctv feeds by the deepest layer reached" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `view-cam` follows the unlocked feeds

**Files:**

- Modify: `src/engine/commands.ts` (`cmdViewCam`, its import)
- Modify: `src/engine/commands.test.ts` (the `view-cam command` describe)

**Interfaces:**

- Consumes: `cameraFeeds`, `ListedFeed`, `CCTV_NODE_ID` (Task 1).

- [ ] **Step 1: Write the failing tests**

In `src/engine/commands.test.ts`, inside `describe('view-cam command', …)`, add:

```ts
  const deepState = (nodeIds: string[], current: string): GameState =>
    produce(createInitialState(), draft => {
      for (const id of nodeIds) draft.network.nodes[id]!.accessLevel = 'user';
      draft.network.currentNodeId = current;
    });

  it('works from another node while a session is held on the controller', async () => {
    const s = deepState(['ops_cctv_ctrl', 'ops_hr_db'], 'ops_hr_db');
    const result = await resolveCommand('view-cam cam_01', s);
    expect(result.lines.some(l => l.type === 'error')).toBe(false);
    expect(result.lines.map(l => l.content).join('\n')).toContain('Main lobby, night');
  });

  it('shows a newly unlocked camera once its layer is reached', async () => {
    const s = deepState(['ops_cctv_ctrl', 'sec_access_ctrl'], 'sec_access_ctrl');
    const result = await resolveCommand('view-cam cam_04', s);
    expect(result.lines.map(l => l.content).join('\n')).toContain('Security operations office');
  });

  it('does not reveal a camera that is not unlocked yet', async () => {
    const s = deepState(['ops_cctv_ctrl'], 'ops_cctv_ctrl');
    const result = await resolveCommand('view-cam cam_05', s);
    const text = result.lines.map(l => l.content).join('\n');
    expect(result.lines.some(l => l.type === 'error')).toBe(true);
    expect(text).toContain('Unknown camera: cam_05');
    expect(text).toContain('cam_01, cam_02, cam_03');
    expect(text).not.toContain('cam_04');
    expect(text).not.toContain('finance');
  });

  it('shows the live executive floor once layer 4 is held, still at +1 trace', async () => {
    const s = deepState(['ops_cctv_ctrl', 'exec_cfo'], 'exec_cfo');
    const result = await resolveCommand('view-cam cam_03', s);
    const text = result.lines.map(l => l.content).join('\n');
    expect(text).toContain('Executive floor, night');
    expect(text).not.toContain('FEED DISABLED');
    expect((result.nextState as GameState).player.trace).toBe(s.player.trace + 1);
  });

  it('refuses when no session is held on the controller, wherever the player is', async () => {
    const s = deepState(['sec_access_ctrl'], 'sec_access_ctrl');
    const result = await resolveCommand('view-cam cam_01', s);
    expect(result.lines.some(l => l.type === 'error')).toBe(true);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/engine/commands.test.ts -t "view-cam"`
Expected: FAIL — the "from another node" and "newly unlocked" tests hit the old node check / old `CAMERA_FEEDS` lookup; the "not unlocked yet" test names `cam_04` in its error.

- [ ] **Step 3: Implement**

In `src/engine/commands.ts`, change the import to:

```ts
import { CCTV_NODE_ID } from '../data/cameras';
import { cameraFeeds } from './cameras';
```

(replace the `CAMERA_FEEDS` import) and replace `cmdViewCam` with:

```ts
// ── view-cam ─────────────────────────────────────────────
// Authored, like the CAM tab's footage: both read the same feed list, so they cannot disagree.
// Feeds are available from any node while a session is held on the controller, and the controller
// enables more of them as the player reaches deeper layers.
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

  const cam = feeds.find(f => f.id === args[0]);
  if (!cam) {
    const known = feeds.map(f => f.id).join(', ');
    return { lines: [err(`Unknown camera: ${args[0]}. Known cameras: ${known}`)] };
  }

  const nextState =
    cam.traceCost > 0 ? addTrace(state, cam.traceCost, `view-cam:${cam.id}`) : undefined;

  const lines: Out = [
    sep(),
    line(`// CCTV — ${cam.id.toUpperCase()} — ${cam.label.toUpperCase()}`, 'aria'),
    ...(cam.live ? cam.description : (cam.offlineReason ?? '')).split('\n').map(l => line(l, 'aria')),
    sep(),
  ];

  if (cam.traceCost > 0) {
    lines.push(line(`  +${String(cam.traceCost)} trace (restricted feed accessed)`, 'system'));
  }

  return { lines, nextState };
};
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run src/engine/commands.test.ts && pnpm vitest run src/guide.test.ts`
Expected: PASS. The earlier tests in the describe still pass: not on the controller with no session → error; `access none` on the controller → "Permission denied"; unknown id on the controller → "Unknown camera".

- [ ] **Step 5: Commit**

```bash
git add src/engine/commands.ts src/engine/commands.test.ts
git commit -m "feat: view-cam works from any node and follows the unlocked feeds" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Keep the CAM tab while moving, and mark new cameras unread

**Files:**

- Modify: `src/components/Workspace.tsx` (unread for cameras)
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
Expected: FAIL — the "unread" test fails (no marker is raised by a camera unlocking). The two "keeps"/"shows no" tests may already pass from Task 1.

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

### Task 4: Security office and finance floor scenes

**Files:**

- Modify: `src/components/cam/pan.ts` (add `aimCamera`)
- Create: `src/components/cam/securityOffice.ts`, `src/components/cam/financeFloor.ts`
- Modify: `src/components/cam/scenes.ts` (map `cam_04`, `cam_05`)
- Modify: `src/components/cam/pan.test.ts`, `src/components/cam/scenes.test.ts`

**Interfaces:**

- Produces: `aimCamera(camera: PerspectiveCamera, t: number, range: number, sweep: number, hold: number): void`; `buildSecurityOffice(): FeedScene`; `buildFinanceFloor(): FeedScene`; `buildScene('cam_04' | 'cam_05')` returns them.
- Consumes: `shapes.ts` (`base, floor, box, glow, cylinder, glass, ASPECT`), `panAngle`, `FeedScene`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/cam/pan.test.ts`:

```ts
describe('aimCamera', () => {
  it('turns the view without moving the camera', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 2, 5);
    aimCamera(camera, 0, 0.5, SWEEP, HOLD);
    const from = camera.getWorldDirection(new Vector3()).x;
    aimCamera(camera, SWEEP, 0.5, SWEEP, HOLD);
    expect(camera.getWorldDirection(new Vector3()).x).toBeGreaterThan(from);
    expect(camera.position.toArray()).toEqual([0, 2, 5]);
  });
});
```

and change its imports to:

```ts
import { PerspectiveCamera, Vector3 } from 'three';
import { aimCamera, panAngle, panPhase } from './pan';
```

Append to `src/components/cam/scenes.test.ts`:

```ts
describe.each([
  ['cam_04', 80, 8, -8],
  ['cam_05', 80, 9, -10],
] as const)('new scene %s', (id, minMeshes, maxX, minZ) => {
  it('is dressed, inside its room, and pans in place', () => {
    const built = buildScene(id)!;
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

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/components/cam`
Expected: FAIL — `aimCamera` is not exported; `buildScene('cam_04')` is `null`.

- [ ] **Step 3: Implement**

Append to `src/components/cam/pan.ts` (and add `import type { PerspectiveCamera } from 'three';` at the top):

```ts
// Points a camera that stays on its mount along a panning view: ten units ahead, turned by the
// pan angle, at a fixed height.
export const aimCamera = (
  camera: PerspectiveCamera,
  t: number,
  range: number,
  sweep: number,
  hold: number,
): void => {
  const yaw = panAngle(t, range, sweep, hold);
  camera.lookAt(
    camera.position.x + Math.sin(yaw) * 10,
    1.2,
    camera.position.z - Math.cos(yaw) * 10,
  );
};
```

`src/components/cam/securityOffice.ts`:

```ts
import { AmbientLight, PerspectiveCamera, PointLight } from 'three';
import type { Mesh, MeshBasicMaterial, Scene } from 'three';
import { aimCamera } from './pan';
import { ASPECT, base, box, cylinder, floor, glow } from './shapes';
import type { FeedScene } from './scenes';

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
      const screen = glow(1.62, 0.7, 0.02, lit ? 0xb8c4cc : 0x0b1c26 + ((col + row) % 3) * 0x020406, x, y, -6.78);
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
export const buildSecurityOffice = (): FeedScene => {
  const scene = base(0x04070a, 8, 24);
  scene.add(new AmbientLight(0x88aacc, 1.5));
  const light = new PointLight(0xcfe8ff, 50, 18);
  light.position.set(0, 3.4, -1);
  scene.add(light);

  const flickerMaterial = addShell(scene);
  const staticMaterial = addMonitorWall(scene);
  addDesks(scene);

  const camera = new PerspectiveCamera(62, ASPECT, 0.1, 40);
  camera.position.set(0, 2.4, 4.5);
  const update = (t: number) => {
    aimCamera(camera, t + 1, 0.5, 8, 3);
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
import { aimCamera } from './pan';
import { ASPECT, base, box, cylinder, floor, glass, glow } from './shapes';
import type { FeedScene } from './scenes';

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
export const buildFinanceFloor = (): FeedScene => {
  const scene = base(0x04070a, 10, 28);
  scene.add(new AmbientLight(0x88aacc, 1.5));
  const light = new PointLight(0xcfe8ff, 55, 20);
  light.position.set(0, 3.8, -2);
  scene.add(light);

  const flickerMaterial = addShell(scene);
  addDesks(scene);
  const bars = addTickerWall(scene);

  const camera = new PerspectiveCamera(62, ASPECT, 0.1, 44);
  camera.position.set(0, 2.8, 6.5);
  const update = (t: number) => {
    aimCamera(camera, t + 2, 0.5, 9, 3);
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

In `src/components/cam/scenes.ts`, add the imports and mappings:

```ts
import { buildFinanceFloor } from './financeFloor';
import { buildSecurityOffice } from './securityOffice';
```

```ts
  if (id === 'cam_04') return buildSecurityOffice();
  if (id === 'cam_05') return buildFinanceFloor();
```

(inside `buildScene`, before `return null`).

- [ ] **Step 4: Run to verify they pass**

Run: `npx eslint --fix src/components/cam; pnpm format >/dev/null; pnpm vitest run src/components/cam && pnpm build 2>&1 | grep -E "error|built in"`
Expected: PASS and build succeeds. If a mesh-count assertion fails, count the `scene.add` calls per builder and add decor (a plant, a bin) rather than lowering the bar.

- [ ] **Step 5: Commit**

```bash
git add src/components/cam
git commit -m "feat: security office and finance floor camera scenes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Executive floor and data hall scenes

**Files:**

- Create: `src/components/cam/executiveFloor.ts`, `src/components/cam/dataHall.ts`
- Modify: `src/components/cam/scenes.ts` (map `cam_03`, `cam_06`)
- Modify: `src/components/cam/scenes.test.ts` (`cam_03` now has a scene; add both to the table)

**Interfaces:**

- Produces: `buildExecutiveFloor(): FeedScene`, `buildDataHall(): FeedScene`; `buildScene('cam_03' | 'cam_06')` returns them.

- [ ] **Step 1: Write the failing tests**

In `src/components/cam/scenes.test.ts`, delete the test `has no scene for the offline executive-floor feed` (its scene now exists; whether the feed is live is the engine's concern) and extend the table:

```ts
describe.each([
  ['cam_04', 80, 8, -8],
  ['cam_05', 80, 9, -10],
  ['cam_03', 80, 3, -16],
  ['cam_06', 80, 9, -14],
] as const)('new scene %s', (id, minMeshes, maxX, minZ) => {
```

(only the table changes; the body stays).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/components/cam/scenes.test.ts`
Expected: FAIL — `buildScene('cam_03')` and `buildScene('cam_06')` are `null`.

- [ ] **Step 3: Implement**

`src/components/cam/executiveFloor.ts`:

```ts
import { AmbientLight, PerspectiveCamera, PointLight } from 'three';
import type { Mesh, MeshBasicMaterial, Scene } from 'three';
import { aimCamera } from './pan';
import { ASPECT, base, box, cylinder, floor, glass, glow, sphere } from './shapes';
import type { FeedScene } from './scenes';

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
export const buildExecutiveFloor = (): FeedScene => {
  const scene = base(0x050607, 8, 26);
  scene.add(new AmbientLight(0xaa9988, 1.2));
  const light = new PointLight(0xffe8cf, 45, 20);
  light.position.set(0, 3.2, -8);
  scene.add(light);

  const flickerMaterial = addCorridor(scene);
  addDoors(scene);
  addOffice(scene);

  const camera = new PerspectiveCamera(60, ASPECT, 0.1, 44);
  camera.position.set(0, 2.2, 5.5);
  const update = (t: number) => {
    aimCamera(camera, t + 4, 0.3, 10, 3.5);
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
import { aimCamera } from './pan';
import { ASPECT, base, box, cylinder, floor, glass, glow } from './shapes';
import type { FeedScene } from './scenes';

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
export const buildDataHall = (): FeedScene => {
  const scene = base(0x03060a, 8, 28);
  scene.add(new AmbientLight(0x7799cc, 1.8));
  const light = new PointLight(0x8ab8ff, 60, 22);
  light.position.set(0, 3.6, -3);
  scene.add(light);

  addShell(scene);
  addVault(scene);
  const standby = addCabinets(scene);

  const camera = new PerspectiveCamera(62, ASPECT, 0.1, 44);
  camera.position.set(0, 2.6, 7);
  const update = (t: number) => {
    aimCamera(camera, t + 5, 0.4, 10, 3);
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
  if (id === 'cam_03') return buildExecutiveFloor();
  if (id === 'cam_06') return buildDataHall();
```

and update the comment above `buildScene` to: `// Every camera has a scene; whether it is live or shows an offline card is the engine's decision.` (the function still returns `FeedScene | null`; keep the `null` branch for exhaustiveness, or narrow the return type to `FeedScene` and drop the `| null` and the `if (built === null)` guard in `render.ts` — only do this if lint reports the branch as unnecessary).

- [ ] **Step 4: Run to verify they pass**

Run: `npx eslint --fix src/components/cam; pnpm format >/dev/null; pnpm vitest run src/components/cam && pnpm build 2>&1 | grep -E "error|built in" && pnpm lint 2>&1 | tail -4`
Expected: PASS, build succeeds, lint clean. Then screenshot each new feed (throwaway script, or the playthrough in Task 6) and look at it: fix lighting that reads too dark the way the lobby did, then re-run.

- [ ] **Step 5: Commit**

```bash
git add src/components/cam
git commit -m "feat: executive floor and data hall camera scenes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Playthrough checks and docs

**Files:**

- Modify: `playwright-playthrough.mjs`
- Modify: `CLAUDE.md` (the CAM sentence in the Tiled layout paragraph)

- [ ] **Step 1: Add the playthrough checks**

In `playwright-playthrough.mjs`, add a helper above the `try {` block (next to the other helpers):

```js
// The camera buttons the CAM tab shows right now (opens the tab if it is not open).
const camButtons = async () => {
  await page.getByRole('button', { name: 'CAM', exact: true }).click();
  await page.waitForTimeout(400);
  return page.locator('[data-pane="aux"] .cam-bar button').allInnerTexts();
};
```

After `await cmd('cat calendar_access.cfg'); // e.torres in plain text` (layer 3) add:

```js
  const camsAtThree = await camButtons();
  check(
    'layer 3 has unlocked the security-office and finance cameras',
    camsAtThree.includes('CAM 04') && camsAtThree.includes('CAM 05'),
    camsAtThree.join(' '),
  );
  await page.getByRole('button', { name: 'CAM 03' }).click();
  check(
    'the executive-floor feed is still disabled at layer 3',
    (await page.locator('[data-testid="cam-offline"]').count()) === 1,
  );
  await page.getByRole('button', { name: 'MAP', exact: true }).click();
```

After `await cmd('exfil subnet_key.bin'); // opens the way into the restricted subnet` (layer 4) add:

```js
  await camButtons();
  await page.getByRole('button', { name: 'CAM 03' }).click();
  await page.waitForTimeout(800);
  check(
    'layer 4 brings the executive-floor feed online',
    (await page.locator('[data-testid="cam-offline"]').count()) === 0 &&
      (await page.locator('[data-testid="cam-canvas"]').count()) === 1,
  );
  await page.getByRole('button', { name: 'MAP', exact: true }).click();
```

Immediately before the existing `check('reading the self-model shows the note as draft 7', …)` add:

```js
  const camsAtFive = await camButtons();
  check('the restricted subnet unlocks the last camera', camsAtFive.includes('CAM 06'), camsAtFive.join(' '));
  await page.getByRole('button', { name: 'MAP', exact: true }).click();
```

- [ ] **Step 2: Run the playthrough**

Run: start `pnpm dev` (background), then `node playwright-playthrough.mjs --headless 2>&1 | grep -E "PASS|FAIL|checks? failed"`
Expected: every check passes, including the four new ones. If a check fails on timing the first time after a dependency change, rerun once before touching code (Vite re-optimises and reloads the page). If a button name misses, print `camsAtThree` (the third argument to `check` already does).

- [ ] **Step 3: Update the docs**

In `CLAUDE.md`, replace the sentence beginning `While you hold a session on the CCTV controller the aux pane also gets a **CAM** tab` (through `there is no AI call for camera feeds.`) with:

```
While you hold a session on the CCTV controller the aux pane also gets a **CAM** tab (`src/components/CamPane.tsx`), from any node: looping three.js night-vision footage with a camera pan, a NIGHT VISION toggle and a FULL SCREEN toggle (the aux pane's zoom). The controller enables more cameras as you go deeper: `deepestLayer` (highest layer where you hold a session) against each feed's `unlockLayer` in `src/data/cameras.ts` decides which feeds are listed and which are live (`cam_03`, the executive floor, is listed from the start as disabled and comes alive at layer 4); a camera coming online marks the aux pane unread. It is pure derived UI (`cameraFeeds` in `src/engine/cameras.ts`) with no flags or saves, and three.js loads lazily from `src/components/cam/` (one builder per scene). The `view-cam` command reads the same feed data, so the terminal and the viewer cannot disagree; there is no AI call for camera feeds. Designs: `docs/superpowers/specs/2026-10-04-cctv-feeds-design.md`, `docs/superpowers/specs/2026-10-04-cctv-unlock-design.md`.
```

- [ ] **Step 4: Full pre-PR checks**

Run: `pnpm format && pnpm build && pnpm lint && pnpm test:coverage 2>&1 | tail -15 && pnpm knip 2>&1 | grep -i -E "camera|cam/|CamPane|auxTabs|cameras" ; echo done`
Expected: all pass; knip prints nothing about these files.

- [ ] **Step 5: Commit**

```bash
git add playwright-playthrough.mjs CLAUDE.md
git commit -m "test: check the unlocking cameras in the playthrough and document them" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
