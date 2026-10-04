# CCTV: locked cameras, the vault door and the building's look — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The floor menu and `view-cam` list every camera (locked ones marked), a tenth camera looks at the vault door from outside, and every room shares IronGate's look: white walls, a tiled floor, one accent colour per floor, lit rooms, night vision off by default.

**Architecture:** The accent is data (`FLOORS[].accent`), read by the scenes and the menu swatch. Shared building helpers (`tiledFloor`, `wallTrim`, `trim`, `litBase`, palette constants) live in `shapes.ts`. A palette test walks every scene (white `wall` meshes, accent-coloured `trim` meshes, `grout` meshes) and grows by one row per recolour task. `cameraFeeds` returns every feed with a `live` flag and a `locked` flag.

**Tech Stack:** React 19, TypeScript, three.js, Vitest (jsdom for components), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-cctv-unlock-design.md` (see "Amendment — locked cameras, the vault door, and the building's look").

## Global Constraints

- Branch `feat/cctv-unlock` (unmerged). Derived UI only: no flags, no saves, no trace effect from the viewer.
- Every camera is listed from the start. Not live + `offlineReason` → card shows the reason ("FEED DISABLED — CEO OFFICE"); not live, no reason → card "FEED LOCKED" (no layer hint). `view-cam` of a locked camera prints its header and "FEED LOCKED", costs no trace; the executive cameras keep +1 trace (live or disabled); an id that does not exist is still "Unknown camera", and "Known cameras" names all ten.
- Names, descriptions, offline reasons and the "locked" text never contain the secret name (`/aria/i`); `ariaNameLeak.test.ts` already covers every feed field. The vault description never says what is behind the door.
- Accents (`FLOORS[].accent`): ground `0x2b6cb0`, operations `0xed8936`, security `0xe53e3e`, finance `0x38a169`, executive `0xd69e2e`, sublevel `0x00b5d8`.
- Palette constants (in `shapes.ts`): `WALL_WHITE 0xeef1f3`, `TILE_LIGHT 0xdde3e7`, `GROUT 0xaab4bb`, `CEILING_WHITE 0xf5f7f8`, `HAZE 0xe3e8ec`.
- Rooms stay closed all round (existing ray test), empty, clue-free, one flickering fixture each; animations only in `prefers-reduced-motion: no-preference`; `src/components/**` is excluded from coverage.
- Night vision is off by default and still remembered (`irongate_cam_night_vision`).
- ESLint strictTypeChecked, arrow functions, Prettier, 75% per-file coverage, lowercase conventional-commit subjects, commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never pipe a `git commit` into `tail`. Never leave `sed -i.bak` backups.
- Before the PR: `pnpm format` first, then `pnpm build`, `pnpm lint`, `pnpm test:coverage`, `pnpm knip`; rerun `node playwright-playthrough.mjs --headless`.

## Review Focus

- A locked camera must never run a renderer or leak a layer hint (Task 1 CamPane/view-cam tests).
- The menu with every camera listed: focus order, a locked entry is still selectable (shows the card) and selecting it stops the previous renderer (Task 2 tests).
- Night vision default flips for returning players: a stored `'on'`/`'off'` choice must win over the new default (Task 1 test).
- White walls only count if lit: no scene may leave its walls grey because of fog or low light; verify by screenshot with night vision off (Tasks 4–7 steps).
- The vault approach must be bounded, closed and its door must face the camera (Task 7 tests).

---

### Task 1: Data, engine, `view-cam` and the night-vision default

**Files:**

- Modify: `src/data/cameras.ts`, `src/engine/cameras.ts`, `src/engine/commands.ts` (`cmdViewCam`), `src/components/CamPane.tsx`
- Modify tests: `src/engine/__tests__/cameras.test.ts`, `src/engine/commands.test.ts` (view-cam describe), `src/components/CamPane.test.tsx`, `src/components/cam/scenes.test.ts`

**Interfaces:**

- Produces: `FLOORS` entries gain `accent: number`; `floorAccent(id: FloorId): number`; `CameraFeed['scene']` gains `'vaultApproach'`; a tenth feed `vault-door`; `ListedFeed` gains `locked: boolean` (`!live && offlineReason === null`); `cameraFeeds(state)` returns every feed once the controller session is held; `readNightVision` defaults to off.

- [ ] **Step 1: Write the failing tests**

In `src/engine/__tests__/cameras.test.ts`:

- replace the `lists the layer-1 cameras…`, `adds cameras with each layer…`, `never lists a camera before its layer`, `lists every camera once…` tests with:

```ts
  it('lists every camera once the controller is held, and marks what is not live', () => {
    const feeds = cameraFeeds(held([L1], L1));
    expect(feeds.map(f => f.id)).toEqual(CAMERA_FEEDS.map(f => f.id));
    const byId = Object.fromEntries(feeds.map(f => [f.id, f]));
    expect(byId['lobby-reception']).toMatchObject({ live: true, locked: false });
    expect(byId['executive-corridor']).toMatchObject({ live: false, locked: false });
    expect(byId['security-office']).toMatchObject({ live: false, locked: true });
    expect(byId['vault-door']).toMatchObject({ live: false, locked: true });
  });

  it('turns cameras live with each layer, and the executive floor at layer 4', () => {
    expect(liveIds(held([L1, L2]))).toContain('security-office');
    expect(liveIds(held([L1, L2]))).not.toContain('finance-floor');
    expect(liveIds(held([L1, L2, L3]))).toContain('finance-floor');
    expect(liveIds(held([L1, L2, L3]))).not.toContain('executive-corridor');
    const four = liveIds(held([L1, L2, L3, L4]));
    expect(four).toEqual(expect.arrayContaining(['executive-corridor', 'executive-office']));
    expect(four).not.toContain('data-hall-b');
    expect(liveIds(held([L1, L2, L3, L4, L5]))).toEqual(
      expect.arrayContaining(['data-hall-b', 'vault-door']),
    );
  });
```

- in `describe('camera data')` add:

```ts
  it('gives every floor a distinct accent colour', () => {
    const accents = FLOORS.map(f => f.accent);
    expect(new Set(accents).size).toBe(FLOORS.length);
    expect(floorAccent('ground')).toBe(0x2b6cb0);
  });

  it('has the vault door on Sub-level B, unlocked with the data hall', () => {
    const vault = CAMERA_FEEDS.find(f => f.id === 'vault-door');
    expect(vault).toMatchObject({ floor: 'sublevel', scene: 'vaultApproach', unlockLayer: 5 });
  });
```

  (add `floorAccent` to the import from `'../../data/cameras'`; change the existing `ids(…)` helper uses that assumed filtering, and the "keeps the feeds after leaving the controller" test still holds).

In `src/engine/commands.test.ts`, inside `describe('view-cam command', …)`: replace `does not reveal a camera that is not unlocked yet` with:

```ts
  it('says a not-yet-unlocked camera is locked, without a hint of what opens it', async () => {
    const s = deepState(['ops_cctv_ctrl'], 'ops_cctv_ctrl');
    const result = await resolveCommand('view-cam finance-floor', s);
    expect(result.lines.some(l => l.type === 'error')).toBe(false);
    expect(text(result.lines)).toContain('FINANCE — FINANCE FLOOR');
    expect(text(result.lines)).toContain('FEED LOCKED');
    expect(text(result.lines)).not.toMatch(/layer/i);
    expect((result.nextState as GameState | undefined)?.player.trace ?? s.player.trace).toBe(
      s.player.trace,
    );
  });

  it('still rejects a camera that does not exist, and names all of them', async () => {
    const s = deepState(['ops_cctv_ctrl'], 'ops_cctv_ctrl');
    const result = await resolveCommand('view-cam boiler-room', s);
    expect(result.lines.some(l => l.type === 'error')).toBe(true);
    expect(text(result.lines)).toContain('Unknown camera: boiler-room');
    expect(text(result.lines)).toContain('vault-door');
  });
```

and update the description strings the existing tests assert once Step 3 rewords them (`Main lobby, night` → `Main lobby, after hours`; `Security operations office` stays; `Executive floor corridor` stays; `Corner office` stays).

In `src/components/CamPane.test.tsx`: the `FEEDS` constant must add `locked` (`locked: f.offlineReason === null && false` → write it as `{ ...f, live: f.offlineReason === null, locked: false }`), and add:

```tsx
  it('shows a locked feed as FEED LOCKED, with no renderer', () => {
    const feeds = FEEDS.map(f => (f.id === 'server-aisle' ? { ...f, live: false, locked: true } : f));
    render(<CamPane feeds={feeds} visible fullscreen={false} onToggleFullscreen={vi.fn()} />);
    pick(/OPERATIONS/, 'Server room \\(aisle\\)');
    expect(screen.getByTestId('cam-offline').textContent).toBe('FEED LOCKED');
  });

  it('has night vision off by default, and a stored choice wins', () => {
    setup();
    expect(screen.getByRole('button', { name: 'NIGHT VISION' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByTestId('cam-stage').className).not.toContain('cam-nv');
    localStorage.setItem('irongate_cam_night_vision', 'on');
    setup();
    const toggles = screen.getAllByRole('button', { name: 'NIGHT VISION' });
    expect(toggles.at(-1)?.getAttribute('aria-pressed')).toBe('true');
  });
```

and change the existing `has night vision on by default and toggles it off and on` test to start off: expect `'false'` first, click → `'true'` and `cam-nv` present, click → off; and `remembers the night-vision choice` to click once (now turning it **on**) and expect `'true'` after remount.

In `src/components/cam/scenes.test.ts`, the loop `every camera has a scene` and the closed-room `it.each` run over `CAMERA_FEEDS`: they will fail for `vault-door` until Task 7 — add `.filter(f => f.scene !== 'vaultApproach')` to both **in this task** and remove the filter in Task 7.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/engine/__tests__/cameras.test.ts src/engine/commands.test.ts src/components/CamPane.test.tsx`
Expected: FAIL — `accent`/`floorAccent`/`locked` missing, no `vault-door`, `cameraFeeds` filters, night vision defaults on.

- [ ] **Step 3: Implement**

`src/data/cameras.ts`:

- `FLOORS` become `{ id, name, accent }`:

```ts
export const FLOORS = [
  { id: 'ground', name: 'Ground floor', accent: 0x2b6cb0 },
  { id: 'operations', name: 'Operations', accent: 0xed8936 },
  { id: 'security', name: 'Security', accent: 0xe53e3e },
  { id: 'finance', name: 'Finance', accent: 0x38a169 },
  { id: 'executive', name: 'Executive', accent: 0xd69e2e },
  { id: 'sublevel', name: 'Sub-level B', accent: 0x00b5d8 },
] as const;

export const floorAccent = (id: FloorId): number => FLOORS.find(f => f.id === id)?.accent ?? 0xffffff;
```

- `SceneId` gains `| 'vaultApproach'`.
- Append the tenth feed after `data-hall-b`:

```ts
  {
    id: 'vault-door',
    aliases: [],
    floor: 'sublevel',
    name: 'Vault door',
    scene: 'vaultApproach',
    mount: 0,
    unlockLayer: 5,
    offlineReason: null,
    description:
      'Sub-level B, the vault door. A circular steel door fills the end of a white corridor, sealed, its indicator red. A faint cyan light spills from the gap beneath it, and the floor hums.',
    traceCost: 0,
  },
```

- Reword the lit descriptions (keep each over 40 characters, no secret name; `server-aisle` must still contain "red and green"):
  - `lobby-reception`: `'Main lobby, after hours. The lights are on over an empty hall: white walls, a blue band at eye level, the reception desk unattended. The camera pans slowly from left to right.'`
  - `lobby-entrance`: `'Lobby, seen from the street entrance. The glass doors are locked, the turnstiles idle and the elevator indicators dark. The hall is empty and brightly lit.'`
  - `server-aisle`: `'Server room. Two rows of racks under white light, status lights blinking red and green in no particular order. Nothing moves; the cooling units hold a steady note.'`
  - `server-airlock`: `'Server room, from the airlock door. The aisle runs away between the racks, an orange band along the walls. Nothing moves.'`
  - `security-office`: `'Security operations office. A wall of monitors, all dark but one that shows only static, under a red band on white walls. Chairs pushed back from the desks, a cold mug beside a keyboard.'`
  - `finance-floor`: `'Finance floor, after hours. Rows of desks with paired monitors asleep behind glass partitions, a green band along the walls, and a ticker wall still sliding bars of light. No one is at a desk.'`
  - `executive-corridor`: `'Executive floor corridor, after hours. Closed doors on either side, a gold band along white walls and a runner down the middle; at the far end, the corner office. Nobody is here.'`
  - `executive-office`: `'Corner office, after hours. The desk lamp is off and the city glows through the window behind an empty chair. Nothing has been touched.'`
  - `data-hall-b`: `'Data hall B. Sealed cold-storage arrays and accelerator racks stand in long rows under white light with a cyan band along the walls, and a vault door closes the far end. The air is still.'`

`src/engine/cameras.ts`:

```ts
export interface ListedFeed extends CameraFeed {
  live: boolean;
  // Not live and no reason given: a camera the controller has not enabled yet.
  locked: boolean;
}

// Every camera, from any node, while the player holds a session on the CCTV controller. Whether a
// camera is live (deepest layer reached), disabled (it has a reason) or locked is part of the feed.
export const cameraFeeds = (state: GameState): readonly ListedFeed[] => {
  const controller = state.network.nodes[CCTV_NODE_ID];
  if (controller === undefined || controller.accessLevel === 'none') return [];
  const deepest = deepestLayer(state);
  return CAMERA_FEEDS.map(feed => {
    const live = deepest >= feed.unlockLayer;
    return { ...feed, live, locked: !live && feed.offlineReason === null };
  });
};
```

`src/engine/commands.ts` `cmdViewCam`: remove the "listed only" assumption: the unknown-id error already lists `feeds.map(f => f.id)` (now all ten). Replace the description line with the card text:

```ts
    ...(cam.live ? cam.description : (cam.offlineReason ?? 'FEED LOCKED'))
```

(trace stays `cam.traceCost > 0`; locked cameras have `traceCost` 0 except none, so no change is needed).

`src/components/CamPane.tsx`: the offline card text becomes `{feed.offlineReason ?? 'FEED LOCKED'}`; `readNightVision` becomes `localStorage.getItem(NIGHT_VISION_KEY) === 'on'` with the `catch` returning `false`; update the comment ("off by default, remembered").

- [ ] **Step 4: Run to verify they pass**

Run: `npx eslint --fix src; pnpm format >/dev/null; pnpm vitest run && pnpm build 2>&1 | grep -E "error|built in"`
Expected: the whole suite PASSES (after the string updates above) and the build succeeds. The `ariaNameLeak` camera test passes because the new text is free of the secret name; `guide.test.ts` still passes.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat: list every cctv camera, add the vault door, default night vision off" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The menu lists every camera, with floor swatches

**Files:**

- Modify: `src/components/CamMenu.tsx`, `src/styles/globals.css`
- Modify: `src/components/CamMenu.test.tsx`

**Interfaces:**

- Consumes: `ListedFeed` (`live`, `locked`, `offlineReason`), `FLOORS[].accent` (Task 1).
- Produces: unchanged props; floor items show a swatch (`.cam-menu-swatch`, inline `background` = the accent as `#rrggbb`); locked items read `<name> — locked`, disabled ones `<name> — offline`; both carry `cam-menu-off`.

- [ ] **Step 1: Write the failing tests**

In `src/components/CamMenu.test.tsx` change `feedsUpTo` to list every camera (no filtering):

```tsx
const feedsUpTo = (layer: number) =>
  CAMERA_FEEDS.map(f => {
    const live = layer >= f.unlockLayer;
    return { ...f, live, locked: !live && f.offlineReason === null };
  });
```

then update the floor-list tests (every floor is always listed, in order) and add:

```tsx
  it('lists every floor from the start, locked or not', () => {
    setup(1);
    fireEvent.click(opener());
    expect(floorNames()).toEqual([
      'GROUND FLOOR',
      'OPERATIONS',
      'SECURITY',
      'FINANCE',
      'EXECUTIVE',
      'SUB-LEVEL B',
    ]);
  });

  it('marks locked cameras "locked" and disabled ones "offline", both dimmed, and they stay selectable', () => {
    const { onSelect } = setup(1);
    fireEvent.click(opener());
    fireEvent.mouseEnter(floorItem(/SECURITY/));
    const office = screen.getByRole('menuitemradio', { name: /Security office/ });
    expect(office.textContent).toContain('locked');
    expect(office.className).toContain('cam-menu-off');
    fireEvent.mouseEnter(floorItem(/EXECUTIVE/));
    expect(screen.getByRole('menuitemradio', { name: /Executive corridor/ }).textContent).toContain(
      'offline',
    );
    fireEvent.mouseEnter(floorItem(/SECURITY/));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Security office/ }));
    expect(onSelect).toHaveBeenCalledWith('security-office');
  });

  it('shows each floor\'s accent colour as a swatch', () => {
    setup(1);
    fireEvent.click(opener());
    const swatch = floorItem(/OPERATIONS/).querySelector<HTMLElement>('.cam-menu-swatch');
    expect(swatch?.style.background).toMatch(/rgb\(237, 137, 54\)|#ed8936/i);
  });
```

Fix the existing `adds floors as layers are reached` test (delete it; it asserted the old filtering) and the `marks the selected camera and dims the offline ones` assertion text if it relied on `— offline` for the executive pair (it still holds).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/components/CamMenu.test.tsx`
Expected: FAIL — locked cameras read just their name, no swatch.

- [ ] **Step 3: Implement**

In `CamMenu.tsx` import `floorAccent`, give floor items a swatch, and label non-live cameras by their state:

```tsx
                {`${floor.name.toUpperCase()} ▸`}
```

becomes

```tsx
                <span
                  className="cam-menu-swatch"
                  style={{ background: `#${floorAccent(floor.id).toString(16).padStart(6, '0')}` }}
                />
                {`${floor.name.toUpperCase()} ▸`}
```

and the camera label

```tsx
                  {feed.live ? feed.name : `${feed.name} — offline`}
```

becomes

```tsx
                  {feed.live ? feed.name : `${feed.name} — ${feed.locked ? 'locked' : 'offline'}`}
```

(the `floorsWithFeeds` helper already keeps floors that have at least one feed; with every camera listed all floors show). Append to `globals.css` after the `.cam-menu-active …` rules:

```css
.cam-menu-swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 1px;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx eslint --fix src/components; pnpm format >/dev/null; pnpm vitest run src/components && pnpm build 2>&1 | grep -E "error|built in"`
Expected: PASS and the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat: the camera menu lists every camera, locked ones marked, with floor swatches" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Building helpers and the palette test

**Files:**

- Modify: `src/components/cam/shapes.ts`
- Modify: `src/components/cam/scenes.test.ts` (palette test, starting with an empty room list)

**Interfaces:**

- Produces (all in `shapes.ts`): `WALL_WHITE`, `TILE_LIGHT`, `GROUT`, `CEILING_WHITE`, `HAZE`; `litBase(fogNear: number, fogFar: number): Scene`; `trim(w, h, d, accent, x, y, z): Mesh` (tagged `'trim'`); `tiledFloor(scene: Scene, width: number, depth: number, cx: number, cz: number, accent: number): void` (light tiles, `'grout'`-tagged lines every metre, an accent stripe tagged `'trim'`); `wallTrim(scene: Scene, accent: number, axis: 'x' | 'z', length: number, fixed: number, center: number, inward: 1 | -1): void` (a baseboard and an eye-level band, both `'trim'`; `axis 'x'` is a wall running along x at `z = fixed`, `'z'` one running along z at `x = fixed`; `inward` is the sign pointing into the room).

- [ ] **Step 1: Write the failing test**

Append to `src/components/cam/scenes.test.ts` (add `MeshBasicMaterial, MeshStandardMaterial` to the `three` import, `FLOORS` to the `../../data/cameras` import, and the palette constants from `./shapes`):

```ts
// Rooms that have been given the building's look; each recolour task adds its feeds here.
const BUILDING_FEEDS: string[] = [];

const colourOf = (mesh: Mesh): number =>
  (mesh.material as MeshStandardMaterial | MeshBasicMaterial).color.getHex();

describe('the building look', () => {
  it('has helpers that tag their meshes', () => {
    const scene = new Scene();
    tiledFloor(scene, 6, 6, 0, 0, 0x2b6cb0);
    wallTrim(scene, 0x2b6cb0, 'x', 6, -3, 0, 1);
    const names = scene.children.map(c => c.name);
    expect(names.filter(n => n === 'grout').length).toBeGreaterThan(10);
    expect(names.filter(n => n === 'trim').length).toBeGreaterThanOrEqual(3);
  });

  it.each(BUILDING_FEEDS.map(id => [id] as const))(
    '%s: white walls, a tiled floor and trim in the floor\'s accent colour',
    id => {
      const feed = CAMERA_FEEDS.find(f => f.id === id)!;
      const built = buildScene(feed);
      const accent = FLOORS.find(f => f.id === feed.floor)!.accent;
      const walls: number[] = [];
      const trims: number[] = [];
      let grout = 0;
      built.scene.traverse(o => {
        if (!(o instanceof Mesh)) return;
        if (o.name === 'wall') walls.push(colourOf(o));
        if (o.name === 'trim') trims.push(colourOf(o));
        if (o.name === 'grout') grout += 1;
      });
      expect(walls.length).toBeGreaterThan(3);
      expect(walls.every(c => c === WALL_WHITE)).toBe(true);
      expect(trims.filter(c => c === accent).length).toBeGreaterThan(6);
      expect(grout).toBeGreaterThan(20);
    },
  );
});
```

(also import `Scene` from `three` and `tiledFloor, wallTrim, WALL_WHITE` from `./shapes`).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/components/cam/scenes.test.ts`
Expected: FAIL — `tiledFloor`, `wallTrim`, `WALL_WHITE` are not exported.

- [ ] **Step 3: Implement**

Append to `src/components/cam/shapes.ts`:

```ts
// IronGate's rooms: white walls, light tiles, one accent colour per floor, lit around the clock.
export const WALL_WHITE = 0xeef1f3;
export const TILE_LIGHT = 0xdde3e7;
export const GROUT = 0xaab4bb;
export const CEILING_WHITE = 0xf5f7f8;
export const HAZE = 0xe3e8ec;

// A lit, hazy room: a light fog and background instead of black.
export const litBase = (fogNear: number, fogFar: number): Scene => base(HAZE, fogNear, fogFar);

const named = (mesh: Mesh, name: string): Mesh => {
  mesh.name = name;
  return mesh;
};

// Accent trim: a box tagged `trim` so tests can check a room wears its floor's colour.
export const trim = (
  w: number,
  h: number,
  d: number,
  accent: number,
  x: number,
  y: number,
  z: number,
): Mesh => named(box(w, h, d, accent, x, y, z), 'trim');

// A tiled floor: light tiles with grout lines every metre (tagged `grout`) and an accent stripe down
// the middle (tagged `trim`).
export const tiledFloor = (
  scene: Scene,
  width: number,
  depth: number,
  cx: number,
  cz: number,
  accent: number,
): void => {
  const tiles = floor(width, depth, TILE_LIGHT);
  tiles.position.set(cx, 0, cz);
  scene.add(tiles);
  for (let x = Math.ceil(cx - width / 2); x <= cx + width / 2; x += 1) {
    const line = named(floor(0.04, depth, GROUT), 'grout');
    line.position.set(x, 0.01, cz);
    scene.add(line);
  }
  for (let z = Math.ceil(cz - depth / 2); z <= cz + depth / 2; z += 1) {
    const line = named(floor(width, 0.04, GROUT), 'grout');
    line.position.set(cx, 0.01, z);
    scene.add(line);
  }
  const stripe = named(floor(0.5, depth, accent), 'trim');
  stripe.position.set(cx, 0.02, cz);
  scene.add(stripe);
};

// A baseboard and an eye-level band along a wall, in the accent colour. `axis 'x'` is a wall running
// along x at z = `fixed`; `'z'` one running along z at x = `fixed`. `inward` is the sign pointing into
// the room, so the trim sits on the room's side of the wall.
export const wallTrim = (
  scene: Scene,
  accent: number,
  axis: 'x' | 'z',
  length: number,
  fixed: number,
  center: number,
  inward: 1 | -1,
): void => {
  const place = (height: number, y: number, depth: number) => {
    const offset = fixed + (inward * depth) / 2;
    scene.add(
      axis === 'x'
        ? trim(length, height, depth, accent, center, y, offset)
        : trim(depth, height, length, accent, offset, y, center),
    );
  };
  place(0.18, 0.09, 0.08);
  place(0.14, 1.1, 0.06);
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx eslint --fix src/components/cam; pnpm format >/dev/null; pnpm vitest run src/components/cam && pnpm build 2>&1 | grep -E "error|built in"`
Expected: PASS (the helper test; the per-scene palette rows are empty so far) and the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat: building helpers — white walls, tiled floors, accent trim" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Recolour the lobby and the server room

**Files:**

- Modify: `src/components/cam/lobby.ts`, `src/components/cam/serverRoom.ts`, `src/components/cam/scenes.test.ts` (`BUILDING_FEEDS`)

**Recipe (applies to every recolour task):**

1. `base(…)` → `litBase(near, far)` with a far distance long enough that the room is never hazed out (keep the current far value or raise it).
2. Lighting: `AmbientLight(0xffffff, 2.4)`; keep the room's point lights but make them white and a little stronger; the stutter only dips a fixture, never the whole room.
3. Walls: every `wall(w, h, d, <colour>, …)` takes `WALL_WHITE`. Add `wallTrim(scene, ACCENT, axis, length, fixed, center, inward)` for each of the four walls (`ACCENT = floorAccent('<floor>')`).
4. Floor: replace the old `floor(…)` and any hand-made grout/inlay lines with `tiledFloor(scene, width, depth, cx, cz, ACCENT)` covering the same footprint.
5. Ceiling: colour `CEILING_WHITE`; light panels stay `glow` (white).
6. Accent in the room: door frames, signs and the lit lettering take `ACCENT` (use `trim(...)` for door frames so they count); furniture and equipment keep their own colours but lose the night-time blue cast (desks light grey `0xc9d0d5`, chairs dark `0x2b333a`).
7. Add the feed ids to `BUILDING_FEEDS` and run the palette test.
8. Screenshot with night vision **off** (throwaway Playwright walk to the layer; set `localStorage.irongate_cam_night_vision = 'off'` first, which is now the default) and fix anything that reads grey or dark.

**Scene specifics:**

- `lobby.ts` (floor `ground`, accent blue): `litBase(10, 60)`; elevator doors and call lights stay steel/amber; the sign letters (`glow`) become the accent colour; the exit signs stay green; reception desk top white-grey with an accent front strip; sofas keep a warm dark tone; the entrance glass keeps its transparency; the outside glow becomes a pale daylight-blue `0x9ec5e8` (a lit street). Ceiling and walls as above.
- `serverRoom.ts` (floor `operations`, accent orange): `litBase(12, 70)`; rack bodies keep dark `0x1b2630` so the LEDs read; the cable trays become light grey `0xb5bec5`; cooling units white with an orange status strip; the airlock door frame is `trim` in orange; aisle floor lights become orange; keep the stuttering ceiling strip as the one flicker.

- [ ] **Step 1: Write the failing test**

In `scenes.test.ts` set `const BUILDING_FEEDS: string[] = ['lobby-reception', 'lobby-entrance', 'server-aisle', 'server-airlock'];`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/components/cam/scenes.test.ts`
Expected: FAIL — walls are not `WALL_WHITE`, no `trim`/`grout` meshes in these scenes.

- [ ] **Step 3: Implement** the recipe and specifics above in `lobby.ts` and `serverRoom.ts`.

- [ ] **Step 4: Run to verify it passes, then look**

Run: `npx eslint --fix src/components/cam; pnpm format >/dev/null; pnpm vitest run src/components/cam && pnpm build 2>&1 | grep -E "error|built in"`
Expected: PASS (palette rows for the four feeds, closed-room, bounds, mount tests) and the build succeeds. Then screenshot `lobby-reception`, `lobby-entrance`, `server-aisle`, `server-airlock` with night vision off and with it on; the walls must read white and the accent visible.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat: white walls, tiles and accent trim in the lobby and server room" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Recolour the security office and the finance floor

**Files:**

- Modify: `src/components/cam/securityOffice.ts`, `src/components/cam/financeFloor.ts`, `src/components/cam/scenes.test.ts` (`BUILDING_FEEDS`)

Follow the recipe from Task 4.

- `securityOffice.ts` (floor `security`, accent red): `litBase(10, 50)`; the monitor wall frames are white-grey `0xdfe4e8` with the screens staying dark except the static one; console desks light grey with a red front edge (`trim`); keep the cold mug, keyboards and the stuttering strip.
- `financeFloor.ts` (floor `finance`, accent green): `litBase(12, 60)`; desks white-grey with a green edge (`trim`), monitors stay dark-teal, glass partitions unchanged; the ticker wall keeps its green/red bars and gets a green frame (`trim`).

- [ ] **Step 1:** add `'security-office'` and `'finance-floor'` to `BUILDING_FEEDS`.
- [ ] **Step 2:** Run `pnpm vitest run src/components/cam/scenes.test.ts`. Expected: FAIL for those two rows.
- [ ] **Step 3:** Implement the recipe in both files.
- [ ] **Step 4:** Run `npx eslint --fix src/components/cam; pnpm format >/dev/null; pnpm vitest run src/components/cam && pnpm build 2>&1 | grep -E "error|built in"`. Expected: PASS. Screenshot both feeds, night vision off and on, and fix anything grey or dark.
- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat: white walls, tiles and accent trim in the security office and finance floor" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Recolour the executive floor and the data hall

**Files:**

- Modify: `src/components/cam/executiveFloor.ts`, `src/components/cam/dataHall.ts`, `src/components/cam/scenes.test.ts` (`BUILDING_FEEDS`)

Follow the recipe from Task 4.

- `executiveFloor.ts` (floor `executive`, accent gold): `litBase(10, 60)`; white walls with gold trim; the runner becomes gold-edged (`trim` stripes) on tiled floor; doors keep their dark wood, door frames are gold `trim`; nameplates gold; the corner office keeps its desk and plants and the window glow becomes a lit daytime-blue `0x9ec5e8` (the city); wall paintings keep dark frames.
- `dataHall.ts` (floor `sublevel`, accent cyan): `litBase(12, 70)`; cabinets keep dark bodies, the standby strips become cyan, the red seals stay red; the glass wall keeps its transparency; the vault door at the far end gets white-grey steel with a cyan ring and a yellow-black hazard frame.

- [ ] **Step 1:** add `'executive-corridor'`, `'executive-office'`, `'data-hall-b'` to `BUILDING_FEEDS`.
- [ ] **Step 2:** Run `pnpm vitest run src/components/cam/scenes.test.ts`. Expected: FAIL for those three rows.
- [ ] **Step 3:** Implement the recipe in both files.
- [ ] **Step 4:** Run `npx eslint --fix src/components/cam; pnpm format >/dev/null; pnpm vitest run src/components/cam && pnpm build 2>&1 | grep -E "error|built in"`. Expected: PASS. Screenshot the three feeds (the data hall needs a layer-5 route; if the throwaway walk cannot reach it, check it through the playthrough in Task 8 with a temporary screenshot), night vision off and on.
- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat: white walls, tiles and accent trim on the executive floor and in the data hall" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The vault approach scene

**Files:**

- Create: `src/components/cam/vaultApproach.ts`
- Modify: `src/components/cam/scenes.ts` (map `'vaultApproach'`), `src/components/cam/scenes.test.ts`

**Interfaces:**

- Produces: `buildVaultApproach(mount: number): FeedScene`; `buildScene({ scene: 'vaultApproach', … })` returns it.

- [ ] **Step 1: Write the failing tests**

In `scenes.test.ts`: remove the `.filter(f => f.scene !== 'vaultApproach')` added in Task 1 (the loops now cover the vault feed); add `'vault-door'` to `BUILDING_FEEDS`; add the vault to the bounded/pan table:

```ts
  ['vaultApproach', 60, 3, -9],
```

(in the `describe.each` of `scene %s`), and add:

```ts
describe('the vault approach', () => {
  it('has a door that faces the camera, straight ahead', () => {
    const built = buildScene({ scene: 'vaultApproach', mount: 0 });
    built.scene.updateMatrixWorld(true);
    built.update(0);
    const raycaster = new Raycaster();
    raycaster.set(built.camera.position, built.camera.getWorldDirection(new Vector3()));
    const first = raycaster.intersectObjects(built.scene.children, true)[0];
    expect(first?.object.name).toBe('vault');
  });

  it('keeps the door in view across the whole drift', () => {
    const built = buildScene({ scene: 'vaultApproach', mount: 0 });
    built.scene.updateMatrixWorld(true);
    const raycaster = new Raycaster();
    for (const t of [0, 4, 8, 14, 20]) {
      built.update(t);
      raycaster.set(built.camera.position, built.camera.getWorldDirection(new Vector3()));
      expect(raycaster.intersectObjects(built.scene.children, true)[0]?.object.name).toBe('vault');
    }
  });
});
```

Every mesh that makes up the door (leaf, frame, wheel, bolts) is tagged `'vault'`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/components/cam/scenes.test.ts`
Expected: FAIL — `buildScene` has no `vaultApproach` case (it falls through to the data hall).

- [ ] **Step 3: Implement**

`src/components/cam/vaultApproach.ts`:

```ts
import {
  AmbientLight,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  TorusGeometry,
} from 'three';
import type { MeshBasicMaterial, Scene } from 'three';
import { floorAccent } from '../../data/cameras';
import { aimCamera, pickMount } from './pan';
import type { Mount } from './pan';
import {
  ASPECT,
  CEILING_WHITE,
  WALL_WHITE,
  box,
  cylinder,
  floor,
  glow,
  litBase,
  tiledFloor,
  trim,
  wall,
  wallTrim,
} from './shapes';
import type { FeedScene } from './scenes';

const ACCENT = floorAccent('sublevel');
const STEEL = 0x9aa5ad;
const DARK_STEEL = 0x56626b;

// The camera hangs at the open end of the corridor, pointing straight at the door, and only drifts a
// few degrees.
const MOUNTS: readonly [Mount, ...Mount[]] = [
  { position: [0, 2.1, 7], heading: 0, range: 0.05, sweep: 14, hold: 4, offset: 0 },
];

const tag = (mesh: Mesh): Mesh => {
  mesh.name = 'vault';
  return mesh;
};

const ring = (radius: number, tube: number, color: number, z: number): Mesh => {
  const mesh = tag(new Mesh(new TorusGeometry(radius, tube, 10, 32), new MeshStandardMaterial({ color })));
  mesh.position.set(0, 1.9, z);
  return mesh;
};

const disc = (radius: number, depth: number, color: number, z: number): Mesh => {
  const mesh = tag(new Mesh(new CylinderGeometry(radius, radius, depth, 40), new MeshStandardMaterial({ color })));
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(0, 1.9, z);
  return mesh;
};

// The corridor: white walls with cyan trim, a tiled floor, a ceiling with light panels and pipe runs.
const addCorridor = (scene: Scene): MeshBasicMaterial => {
  tiledFloor(scene, 5, 16, 0, 0, ACCENT);
  for (const x of [-2.5, 2.5]) {
    scene.add(wall(0.2, 4.2, 16, WALL_WHITE, x, 2.1, 0));
    wallTrim(scene, ACCENT, 'z', 16, x * 0.96, 0, x < 0 ? 1 : -1);
  }
  scene.add(wall(5, 4.2, 0.2, WALL_WHITE, 0, 2.1, -8));
  wallTrim(scene, ACCENT, 'x', 5, -7.92, 0, 1);
  scene.add(wall(5, 4.2, 0.2, WALL_WHITE, 0, 2.1, 8));
  const ceiling = floor(5, 16, CEILING_WHITE);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 4.2;
  scene.add(ceiling);
  let flicker: Mesh | null = null;
  for (const z of [5, 1, -3]) {
    const panel = glow(1.4, 0.04, 0.5, 0xffffff, 0, 4.16, z);
    scene.add(panel);
    if (z === 1) flicker = panel;
  }
  for (const x of [-1.8, 1.8]) {
    const pipe = cylinder(0.12, 15, 0xc2cad0, x, 3.7, 0);
    pipe.rotation.x = Math.PI / 2;
    scene.add(pipe);
  }
  return (flicker as Mesh).material as MeshBasicMaterial;
};

// The door: a thick frame, the circular leaf, a ring of bolts, a wheel with spokes, hinges, a keypad,
// gauges, a red status light, a cyan glow under it, and hazard stripes on the floor in front.
const addDoor = (scene: Scene): void => {
  const z = -7.7;
  scene.add(tag(box(4.4, 4.0, 0.5, DARK_STEEL, 0, 2.0, z)));
  scene.add(disc(1.75, 0.35, STEEL, z + 0.3));
  scene.add(ring(1.55, 0.07, DARK_STEEL, z + 0.5));
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const bolt = disc(0.09, 0.14, 0xd2d8dc, z + 0.55);
    bolt.position.set(Math.sin(angle) * 1.55, 1.9 + Math.cos(angle) * 1.55, z + 0.55);
    scene.add(bolt);
  }
  scene.add(ring(0.6, 0.08, 0x2f3a42, z + 0.6));
  for (let i = 0; i < 3; i += 1) {
    const spoke = tag(box(1.3, 0.1, 0.1, 0x2f3a42, 0, 1.9, z + 0.6));
    spoke.rotation.z = (i / 3) * Math.PI;
    scene.add(spoke);
  }
  for (const y of [0.9, 1.9, 2.9]) scene.add(tag(box(0.2, 0.4, 0.3, 0x3a444c, -2.0, y, z + 0.25)));
  scene.add(box(0.5, 0.7, 0.12, 0x2a3238, 2.7, 1.6, z + 0.5)); // keypad
  scene.add(glow(0.3, 0.12, 0.04, 0x34ff7a, 2.7, 1.8, z + 0.57));
  for (const y of [2.4, 2.9]) {
    const gauge = cylinder(0.16, 0.08, 0xe8edf0, 2.7, y, z + 0.5);
    gauge.rotation.x = Math.PI / 2;
    scene.add(gauge);
    scene.add(glow(0.1, 0.1, 0.04, 0xff3a2a, 2.7, y, z + 0.56));
  }
  scene.add(glow(1.0, 0.1, 0.05, 0xff3a2a, 0, 3.95, z + 0.28)); // sealed: the status light
  scene.add(glow(3.2, 0.04, 0.4, ACCENT, 0, 0.04, z + 0.6)); // light spilling from under the door
  for (let i = 0; i < 8; i += 1) {
    scene.add(trim(0.5, 0.01, 0.4, i % 2 === 0 ? 0xf2c500 : 0x20262b, -1.75 + i * 0.5, 0.03, -5.6));
  }
};

// The approach to the vault door on Sub-level B: a clean white corridor ending in a sealed round door.
// Seen only from outside. Empty.
export const buildVaultApproach = (mountIndex: number): FeedScene => {
  const mount = pickMount(MOUNTS, mountIndex);
  const scene = litBase(14, 60);
  scene.add(new AmbientLight(0xffffff, 2.4));
  const light = new PointLight(0xffffff, 60, 20);
  light.position.set(0, 3.8, -1);
  scene.add(light);

  const flickerMaterial = addCorridor(scene);
  addDoor(scene);

  const camera = new PerspectiveCamera(58, ASPECT, 0.1, 44);
  camera.position.set(...mount.position);
  const update = (t: number) => {
    aimCamera(camera, t, mount);
    const stutter = Math.sin(t * 17) * Math.sin(t * 2.3) > 0.94;
    flickerMaterial.color.setHex(stutter ? 0x9aa5ad : 0xffffff);
    light.intensity = stutter ? 40 : 60;
  };
  update(0);
  return { scene, camera, update };
};
```

In `scenes.ts` add `import { buildVaultApproach } from './vaultApproach';` and, before the final `return buildDataHall(...)`, `if (feed.scene === 'dataHall') return buildDataHall(feed.mount);` then `return buildVaultApproach(feed.mount);` (the vault becomes the fall-through).

- [ ] **Step 4: Run to verify it passes, then look**

Run: `npx eslint --fix src/components/cam; pnpm format >/dev/null; pnpm vitest run src/components/cam && pnpm build 2>&1 | grep -E "error|built in" && pnpm lint 2>&1 | tail -3`
Expected: PASS (palette row, bounds/pan, closed room, door faces the camera across the drift). Then screenshot the vault door (night vision off and on): the door must fill the end of the corridor and read as a vault; fix the camera height/FOV or the door size if it does not.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat: the vault door camera and its corridor" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Playthrough, docs and the final checks

**Files:**

- Modify: `playwright-playthrough.mjs`, `CLAUDE.md`, `docs/superpowers/specs/2026-10-04-cctv-feeds-design.md` (one line pointing at the amendment)

- [ ] **Step 1: Update the playthrough**

The CAM checks that counted floors at layer 3 now see every floor from the start; change the layer-3 check to assert that **Security** and **Finance** cameras are *live*, not just listed: open the menu, hover the floor, and read the camera items — a live one has no ` — locked` / ` — offline` suffix:

```js
// The cameras a floor lists right now (opens the CAM tab and the menu, hovers the floor, closes it).
const camsOnFloor = async floor => {
  await page.getByRole('button', { name: 'CAM', exact: true }).click();
  await page.locator('.cam-menu-button').click();
  await page.getByRole('menuitem', { name: new RegExp(floor, 'i') }).hover();
  const items = await page.getByRole('menuitemradio').allInnerTexts();
  await page.keyboard.press('Escape');
  return items;
};
```

Replace the layer-3 check with `const sec = await camsOnFloor('SECURITY'); check('layer 3 has made the security camera live', sec.every(c => !/locked|offline/.test(c)), sec.join(', '));` and the same for `FINANCE`; add at layer 1 (right after `cat camera_config.ini`) `const locked = await camsOnFloor('FINANCE'); check('a camera that is not unlocked yet is listed as locked', locked.some(c => /locked/.test(c)), locked.join(', '));`; replace the layer-5 check with `const sub = await camsOnFloor('SUB-LEVEL B'); check('the restricted subnet makes the data hall and the vault door live', sub.length === 2 && sub.every(c => !/locked|offline/.test(c)), sub.join(', '));`. Keep the `MAP` click after each. The first CAM check ("the CAM tab shows a live camera feed") stays.

- [ ] **Step 2: Run the playthrough**

Run (dev server up): `node playwright-playthrough.mjs --headless 2>&1 | grep -E "PASS|FAIL|checks? failed|Playthrough error"`
Expected: every check passes. Rerun once before touching code if the first run fails on timing after a dependency change.

- [ ] **Step 3: Update the docs**

In `CLAUDE.md`, in the CAM paragraph: say the menu lists **every** camera (locked ones dimmed and marked, "FEED LOCKED" card), that there are ten cameras including `vault-door`, that rooms share one look (white walls, tiled floor, `FLOORS[].accent` per floor, lit rooms) and that night vision is off by default; drop "listed only once live" wording. In the feeds spec add under its title: `> The unlock rules, floors, the vault door and the building's look are in 2026-10-04-cctv-unlock-design.md.`

- [ ] **Step 4: Full pre-PR checks**

Run: `pnpm format && pnpm build && pnpm lint && pnpm test:coverage 2>&1 | tail -15 && pnpm knip 2>&1 | grep -i -E "camera|cam/|CamPane|CamMenu|auxTabs|cameras|lobby|serverRoom|shapes|vaultApproach|dataHall|financeFloor|securityOffice|executiveFloor"; echo done`
Expected: all pass; knip prints nothing about these files; coverage meets the per-file thresholds (`src/data/cameras.ts` and `src/engine/cameras.ts` have tests for every branch).

- [ ] **Step 5: Commit**

```bash
git add -A src docs CLAUDE.md playwright-playthrough.mjs
git commit -m "test: check locked cameras and the vault door in the playthrough, and document the building look" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
