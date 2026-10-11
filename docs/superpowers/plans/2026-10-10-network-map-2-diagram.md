# Network Map Part 2 — The Read-Only Diagram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `NETWORK MAP` tab in the doc pane that draws the discovered network as a pannable, zoomable SVG diagram (no actions yet), and rename the aux pane's `MAP` tab to `NETWORK LIST`.

**Architecture:** Two pure modules (`src/engine/mapLayout.ts`: deterministic columns, filler grouping and links; `src/engine/mapView.ts`: pan/zoom/fit maths) feed one component (`src/components/NetworkMap.tsx`). `Workspace` gains a third doc-pane tab and a `showNetworkMap()` handle; `App` points the `map` command at it. Nothing in the game state or the engine rules changes.

**Tech Stack:** React 19 + TypeScript, plain SVG and CSS (no new dependency), Vitest + Testing Library (jsdom), Playwright playthrough script.

**Spec:** `docs/superpowers/specs/2026-10-10-network-map-design.md` (sections "Placement and navigation" and "The diagram"; the node menu, effects and `diffMap` are parts 3 and 4). Part 1 (already merged) provided `GameState.scanned` and `nodeActions`; this part uses neither.

## Global Constraints

- No new dependency, no graph library, no 3D (spec: "SVG, not 3D and not a graph library").
- The diagram draws only `discovered` nodes plus the current node; a link needs **both** ends shown; no placeholder or fog nodes; the number of undiscovered nodes must not be inferable.
- Layout is deterministic: columns by level `L0`–`L5` (only levels with shown nodes); in a column anchors in their order in `state.network.nodes`, then fillers by id; a turn that discovers nothing moves nothing.
- Grouping: 3 or more **hideable** filler nodes of the same template in one column collapse into one `+N <template>` group; a node is never hidden if it is the current node, `accessLevel !== 'none'`, `compromised`, or `sentinelPatched`.
- Level labels come from the existing table (`ENTRY, OPS, SECURITY, FINANCE, EXECUTIVE, CASSANDRA`). Before `ARIA_NAME_KNOWN` no rendered text or accessible name may match `/\baria\b/i` (CLAUDE.md naming rule).
- Expanded groups persist in `sessionStorage` key `irongate_map_groups` only: validated, every access in try/catch, never in the game save.
- `prefers-reduced-motion`: the current-node pulse must be off.
- Aux tab ids change `map` → `list` (label `NETWORK LIST`); the `map` command shows the doc pane's NETWORK MAP tab and focuses the doc pane only when it is off screen (the `showMail` rule).
- Selecting a file in the explorer, or opening a casebook/mail source, flips the doc pane back to DOC. Running commands never flips it away from NETWORK MAP.
- Code style: arrow functions only (`func-style`), no `console`, Prettier (single quotes, trailing commas, 100 cols), commitlint lowercase conventional subjects. Run `pnpm format` before each commit. Coverage threshold is 75% per file.
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A brand-new game (only the entry node discovered): one column, one node, `fit` works, nothing throws.
- A discovered node whose neighbour is undiscovered: no link and no placeholder is drawn toward it.
- A hidden filler becomes accessed, compromised, patched or current: it leaves its group on the next render.
- `sessionStorage` holds garbage, a non-array, or ids that no longer exist: ignored, no throw.
- The current node moves out of view (travel to another level): the view re-centres on it; a node the player pans away from is not yanked back on an unrelated turn.
- Layer-5 nodes discovered before `ARIA_NAME_KNOWN`: no `aria` text anywhere in the diagram or its accessible names.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/layout/auxTabs.ts` (modify) | `AuxTab = 'list' \| 'case' \| 'cam'`, tab labels |
| `src/engine/mapLayout.ts` (create) | Pure: shown nodes → columns, grouped items, positions, links |
| `src/engine/mapView.ts` (create) | Pure: `View` (translate + scale), zoom at a point, fit, pan, visibility, centre |
| `src/components/NetworkMap.tsx` (create) | SVG render, glyphs, group toggle + sessionStorage, pan/zoom controls, keyboard, re-centre |
| `src/components/Workspace.tsx` (modify) | Third doc tab `NETWORK MAP`, `showNetworkMap()` |
| `src/components/MapModal.tsx` (modify) | Import the shared `LAYER_LABELS` (it is the NETWORK LIST text) |
| `src/App.tsx` (modify) | `map` → `showNetworkMap()` |
| `src/styles/globals.css` (modify) | `.network-map` styles |
| `playwright-playthrough.mjs` (modify) | Aux button is now `NETWORK LIST` |
| `CLAUDE.md` (modify) | Document the tab |

Pane ids and the `map` prop name on `Workspace` stay (the prop is the NETWORK LIST content); only the tab id/labels change.

---

### Task 1: Rename the aux MAP tab to NETWORK LIST

**Files:**
- Modify: `src/layout/auxTabs.ts`, `src/layout/auxTabs.test.ts`
- Modify: `src/components/Workspace.tsx` (aux tab state, buttons, pane choice)
- Modify: `src/components/Workspace.test.tsx` (the `inPane('aux', 'MAP')` assertion, any `'map'` aux usage)
- Modify: `src/App.tsx:586` (`showAux('map')` → `showAux('list')` for now; Task 4 replaces it)
- Modify: `playwright-playthrough.mjs` (every aux `MAP` button click)

**Interfaces:**
- Produces: `type AuxTab = 'list' | 'case' | 'cam'`; `AUX_TAB_LABELS: Record<AuxTab, string>`; `availableAuxTabs(hasCam)`/`resolveAuxTab(tab, hasCam)` unchanged in shape, `'list'` replacing `'map'`.

- [ ] **Step 1: Update the tab unit test first**

Replace the body of `src/layout/auxTabs.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { AUX_TAB_LABELS, availableAuxTabs, resolveAuxTab } from './auxTabs';

describe('aux tabs', () => {
  it('offers CAM only when there are feeds', () => {
    expect(availableAuxTabs(false)).toEqual(['list', 'case']);
    expect(availableAuxTabs(true)).toEqual(['list', 'case', 'cam']);
  });

  it('falls back to the network list when CAM is selected but there are no feeds', () => {
    expect(resolveAuxTab('cam', false)).toBe('list');
  });

  it('leaves every other choice alone', () => {
    expect(resolveAuxTab('cam', true)).toBe('cam');
    expect(resolveAuxTab('case', false)).toBe('case');
    expect(resolveAuxTab('list', false)).toBe('list');
  });

  it('labels the list tab NETWORK LIST', () => {
    expect(AUX_TAB_LABELS).toEqual({ list: 'NETWORK LIST', case: 'CASE', cam: 'CAM' });
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `pnpm vitest run src/layout/auxTabs.test.ts`
Expected: FAIL (`AUX_TAB_LABELS` is not exported / `'list'` not assignable).

- [ ] **Step 3: Implement `auxTabs.ts`**

```ts
export type AuxTab = 'list' | 'case' | 'cam';

export const AUX_TAB_LABELS: Record<AuxTab, string> = {
  list: 'NETWORK LIST',
  case: 'CASE',
  cam: 'CAM',
};

export const availableAuxTabs = (hasCam: boolean): readonly AuxTab[] =>
  hasCam ? ['list', 'case', 'cam'] : ['list', 'case'];

// A selected CAM tab with no feeds left (disconnected, moved on) shows the network list instead.
export const resolveAuxTab = (tab: AuxTab, hasCam: boolean): AuxTab =>
  tab === 'cam' && !hasCam ? 'list' : tab;
```

- [ ] **Step 4: Follow the type through `Workspace.tsx`, `App.tsx`, tests and the playthrough**

In `Workspace.tsx`: import `AUX_TAB_LABELS`; `useState<AuxTab>('list')`; the tab button text becomes `{AUX_TAB_LABELS[tab]}` (was `tab.toUpperCase()`); the aux pane's first branch becomes `shownAuxTab === 'list' ? (map) : …`. In `App.tsx`: `showAux('list')` in the `map` branch. In `Workspace.test.tsx` change `inPane('aux', 'MAP')` to `inPane('aux', 'NETWORK LIST')`; run `grep -rnE "showAux\('map'\)|aria-pressed.*MAP" src` and fix anything left. In `playwright-playthrough.mjs` replace every aux click `getByRole('button', { name: 'MAP', exact: true })` with `{ name: 'NETWORK LIST', exact: true }` and the non-exact one near the casebook check (`{ name: 'MAP' }`) the same way.

- [ ] **Step 5: Run the affected tests and the type check**

Run: `pnpm vitest run src/layout src/components/Workspace.test.tsx src/components/Workspace.cam.test.tsx && pnpm build`
Expected: PASS, build exits 0.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add -A src playwright-playthrough.mjs
git commit -m "refactor: rename the aux map tab to network list"
```

---

### Task 2: The pure layout and view maths

**Files:**
- Create: `src/engine/mapLayout.ts`, `src/engine/mapLayout.test.ts`
- Create: `src/engine/mapView.ts`, `src/engine/mapView.test.ts`
- Modify: `src/components/MapModal.tsx` (import `LAYER_LABELS` instead of defining it)

**Interfaces:**
- Produces (`mapLayout.ts`):
  ```ts
  export const LAYER_LABELS: readonly string[];            // ['ENTRY','OPS','SECURITY','FINANCE','EXECUTIVE','CASSANDRA']
  export const COL_W = 220, ROW_H = 96, TOP = 56, LEFT = 40, GROUP_MIN = 3;
  export interface PlacedNode  { kind: 'node';  id: string; node: LiveNode; x: number; y: number }
  export interface PlacedGroup { kind: 'group'; id: string; template: NodeTemplate; layer: number;
                                  memberIds: string[]; expanded: boolean; x: number; y: number }
  export type PlacedItem = PlacedNode | PlacedGroup;
  export interface PlacedColumn { layer: number; label: string; x: number }
  export interface PlacedLink { id: string; from: string; to: string; x1: number; y1: number;
                                 x2: number; y2: number; touchesCurrent: boolean; patched: boolean }
  export interface MapLayout { columns: PlacedColumn[]; items: PlacedItem[]; links: PlacedLink[];
                                width: number; height: number; positions: Record<string, { x: number; y: number }> }
  export const groupId: (layer: number, template: NodeTemplate) => string;   // `group:<layer>:<template>`
  export const layoutMap: (state: GameState, expanded: ReadonlySet<string>) => MapLayout;
  ```
  `x`,`y` of items are node/group **centres**. `positions` maps every shown node id (and every group id) to its centre; a node hidden in a collapsed group maps to its group's centre.
- Produces (`mapView.ts`):
  ```ts
  export interface View { x: number; y: number; k: number }          // screen = world * k + (x, y)
  export interface Size { w: number; h: number }
  export const MIN_K = 0.4, MAX_K = 2.5;
  export const zoomAt: (v: View, factor: number, cx: number, cy: number) => View;  // screen point stays fixed; k clamped
  export const panBy: (v: View, dx: number, dy: number) => View;
  export const fitView: (content: Size, box: Size, pad?: number) => View;           // k clamped to [MIN_K, 1.5]
  export const isVisible: (v: View, p: { x: number; y: number }, box: Size, margin?: number) => boolean;
  export const centreOn: (v: View, p: { x: number; y: number }, box: Size) => View;  // keeps k
  ```

- [ ] **Step 1: Write the failing `mapView` tests**

`src/engine/mapView.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MAX_K, MIN_K, centreOn, fitView, isVisible, panBy, zoomAt } from './mapView';

describe('mapView', () => {
  it('zoomAt keeps the point under the cursor fixed', () => {
    const v = { x: 10, y: 20, k: 1 };
    const next = zoomAt(v, 2, 100, 80);
    // world point under (100, 80) before: ((100-10)/1, (80-20)/1) = (90, 60)
    expect((90 * next.k) + next.x).toBeCloseTo(100);
    expect((60 * next.k) + next.y).toBeCloseTo(80);
    expect(next.k).toBe(2);
  });

  it('zoomAt clamps the scale', () => {
    expect(zoomAt({ x: 0, y: 0, k: 1 }, 100, 0, 0).k).toBe(MAX_K);
    expect(zoomAt({ x: 0, y: 0, k: 1 }, 0.0001, 0, 0).k).toBe(MIN_K);
  });

  it('panBy moves the translation', () => {
    expect(panBy({ x: 1, y: 2, k: 1.5 }, 10, -4)).toEqual({ x: 11, y: -2, k: 1.5 });
  });

  it('fitView shrinks big content into the box and centres it', () => {
    const v = fitView({ w: 2000, h: 1000 }, { w: 1000, h: 500 }, 0);
    expect(v.k).toBeCloseTo(0.5);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(0);
  });

  it('fitView never zooms in past 1.5 and centres small content', () => {
    const v = fitView({ w: 100, h: 100 }, { w: 1000, h: 1000 }, 0);
    expect(v.k).toBe(1.5);
    expect(v.x).toBeCloseTo((1000 - 150) / 2);
    expect(v.y).toBeCloseTo((1000 - 150) / 2);
  });

  it('fitView survives empty content and an empty box', () => {
    expect(fitView({ w: 0, h: 0 }, { w: 0, h: 0 })).toEqual({ x: 0, y: 0, k: 1 });
  });

  it('isVisible honours the margin', () => {
    const v = { x: 0, y: 0, k: 1 };
    const box = { w: 100, h: 100 };
    expect(isVisible(v, { x: 50, y: 50 }, box)).toBe(true);
    expect(isVisible(v, { x: 99, y: 50 }, box, 20)).toBe(false);
    expect(isVisible(v, { x: -5, y: 50 }, box, 0)).toBe(false);
  });

  it('centreOn puts the point at the middle and keeps the scale', () => {
    const v = centreOn({ x: 0, y: 0, k: 2 }, { x: 100, y: 50 }, { w: 400, h: 200 });
    expect(v.k).toBe(2);
    expect((100 * v.k) + v.x).toBeCloseTo(200);
    expect((50 * v.k) + v.y).toBeCloseTo(100);
  });
});
```

- [ ] **Step 2: Run, expect failure** — `pnpm vitest run src/engine/mapView.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `mapView.ts`**

```ts
export interface View {
  x: number;
  y: number;
  k: number;
}
export interface Size {
  w: number;
  h: number;
}

export const MIN_K = 0.4;
export const MAX_K = 2.5;
const FIT_MAX_K = 1.5;

const clampK = (k: number, max = MAX_K): number => Math.min(max, Math.max(MIN_K, k));

export const zoomAt = (v: View, factor: number, cx: number, cy: number): View => {
  const k = clampK(v.k * factor);
  const ratio = k / v.k;
  return { k, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio };
};

export const panBy = (v: View, dx: number, dy: number): View => ({
  ...v,
  x: v.x + dx,
  y: v.y + dy,
});

export const fitView = (content: Size, box: Size, pad = 24): View => {
  if (content.w <= 0 || content.h <= 0 || box.w <= 0 || box.h <= 0) return { x: 0, y: 0, k: 1 };
  const k = clampK(
    Math.min((box.w - pad * 2) / content.w, (box.h - pad * 2) / content.h),
    FIT_MAX_K,
  );
  return { k, x: (box.w - content.w * k) / 2, y: (box.h - content.h * k) / 2 };
};

export const isVisible = (
  v: View,
  p: { x: number; y: number },
  box: Size,
  margin = 40,
): boolean => {
  const sx = p.x * v.k + v.x;
  const sy = p.y * v.k + v.y;
  return sx >= margin && sx <= box.w - margin && sy >= margin && sy <= box.h - margin;
};

export const centreOn = (v: View, p: { x: number; y: number }, box: Size): View => ({
  ...v,
  x: box.w / 2 - p.x * v.k,
  y: box.h / 2 - p.y * v.k,
});
```

- [ ] **Step 4: Run, expect PASS** — `pnpm vitest run src/engine/mapView.test.ts`.

- [ ] **Step 5: Write the failing `mapLayout` tests**

`src/engine/mapLayout.test.ts`. Build states with the real `createInitialState()` for the shape tests and `makeState`/`makeNode` (`src/engine/__tests__/testHelpers.ts`, `network.nodes` is a plain record) for exact scenarios. First read `makeState` to see how `network` is built, then write a local helper:

```ts
import { describe, it, expect } from 'vitest';
import { GROUP_MIN, groupId, layoutMap, LAYER_LABELS } from './mapLayout';
import { createInitialState } from './state';
import produce from './produce';
import { makeNode, makeState } from './__tests__/testHelpers';
import type { GameState, LiveNode } from '../types/game';

const none = new Set<string>();

// A state whose network is exactly `nodes`, current node `current`.
const stateWith = (nodes: LiveNode[], current: string): GameState => {
  const base = makeState();
  return produce(base, s => {
    s.network.nodes = Object.fromEntries(nodes.map(n => [n.id, n]));
    s.network.currentNodeId = current;
  });
};

const ws = (id: string, over: Partial<LiveNode> = {}): LiveNode =>
  makeNode({
    id,
    label: id,
    ip: `10.0.0.${String(id.length)}`,
    layer: 1,
    template: 'workstation',
    accessLevel: 'none', // makeNode defaults to 'user', which would pin every node
    ...over,
  });

describe('layoutMap', () => {
  it('shows only discovered nodes plus the current node, in one column per level', () => {
    const state = stateWith(
      [
        ws('a', { layer: 0, anchor: true, discovered: true }),
        ws('b', { layer: 1, anchor: true, discovered: false }),
        ws('c', { layer: 2, anchor: true, discovered: true }),
      ],
      'a',
    );
    const l = layoutMap(state, none);
    expect(l.items.map(i => i.id)).toEqual(['a', 'c']);
    expect(l.columns.map(c => c.layer)).toEqual([0, 2]);
    expect(l.columns[0]?.label).toBe(LAYER_LABELS[0]);
  });

  it('always includes the current node even if not flagged discovered', () => {
    const state = stateWith([ws('a', { layer: 0, discovered: false })], 'a');
    expect(layoutMap(state, none).items.map(i => i.id)).toEqual(['a']);
  });

  it('orders anchors first (as stored), then fillers by id', () => {
    const state = stateWith(
      [
        ws('z_anchor', { anchor: true }),
        ws('filler_b'),
        ws('a_anchor', { anchor: true }),
        ws('filler_a'),
      ],
      'z_anchor',
    );
    expect(layoutMap(state, none).items.map(i => i.id)).toEqual([
      'z_anchor',
      'a_anchor',
      'filler_a',
      'filler_b',
    ]);
  });

  it('draws a link once, only when both ends are shown, and never toward an undiscovered node', () => {
    const state = stateWith(
      [
        ws('a', { layer: 0, anchor: true, connections: ['b', 'ghost'] }),
        ws('b', { layer: 1, anchor: true, connections: ['a'] }),
        ws('hidden', { layer: 1, anchor: true, discovered: false, connections: ['a'] }),
      ],
      'a',
    );
    // 'a' reaches the undiscovered node too:
    const withHiddenLink = produce(state, s => {
      s.network.nodes['a']?.connections.push('hidden');
    });
    const l = layoutMap(withHiddenLink, none);
    expect(l.links).toHaveLength(1);
    expect(l.links[0]?.id).toBe('a|b');
    expect(l.items.some(i => i.id === 'hidden')).toBe(false);
  });

  it('flags links that touch the current node and links to patched nodes', () => {
    const state = stateWith(
      [
        ws('a', { layer: 0, anchor: true, connections: ['b'] }),
        ws('b', { layer: 1, anchor: true, connections: ['c'], sentinelPatched: true }),
        ws('c', { layer: 2, anchor: true }),
      ],
      'a',
    );
    const links = Object.fromEntries(layoutMap(state, none).links.map(x => [x.id, x]));
    expect(links['a|b']?.touchesCurrent).toBe(true);
    expect(links['a|b']?.patched).toBe(true);
    expect(links['b|c']?.touchesCurrent).toBe(false);
    expect(links['b|c']?.patched).toBe(true);
  });

  it('is deterministic and a turn that discovers nothing moves nothing', () => {
    const state = createInitialState();
    const a = layoutMap(state, none);
    const b = layoutMap(produce(state, s => void (s.turnCount += 1)), none);
    expect(b.positions).toEqual(a.positions);
  });

  it('discovering a node shifts only later nodes in its column', () => {
    const base = stateWith(
      [
        ws('a1', { anchor: true, layer: 1 }),
        ws('f1', { layer: 1 }),
        ws('f3', { layer: 1 }),
      ],
      'a1',
    );
    const before = layoutMap(base, none).positions;
    const after = layoutMap(
      produce(base, s => {
        s.network.nodes['f2'] = ws('f2', { layer: 1 });
      }),
      none,
    ).positions;
    expect(after['a1']).toEqual(before['a1']);
    expect(after['f1']).toEqual(before['f1']);
    expect(after['f3']?.y).toBeGreaterThan(before['f3']?.y ?? 0);
  });

  describe('grouping', () => {
    const fillers = (n: number, over: Partial<LiveNode> = {}) =>
      Array.from({ length: n }, (_, i) => ws(`f${String(i)}`, { layer: 1, ...over }));

    it(`collapses ${String(GROUP_MIN)} or more same-template fillers into one group`, () => {
      const state = stateWith([ws('a', { anchor: true, layer: 1 }), ...fillers(GROUP_MIN)], 'a');
      const l = layoutMap(state, none);
      const group = l.items.find(i => i.kind === 'group');
      expect(group?.id).toBe(groupId(1, 'workstation'));
      expect(group?.kind === 'group' && group.memberIds).toHaveLength(GROUP_MIN);
      expect(l.items.filter(i => i.kind === 'node').map(i => i.id)).toEqual(['a']);
    });

    it('does not group fewer than the threshold', () => {
      const state = stateWith(
        [ws('a', { anchor: true, layer: 1 }), ...fillers(GROUP_MIN - 1)],
        'a',
      );
      expect(layoutMap(state, none).items.some(i => i.kind === 'group')).toBe(false);
    });

    it('does not group different templates together', () => {
      const state = stateWith(
        [
          ws('a', { anchor: true, layer: 1 }),
          ws('p1', { layer: 1, template: 'printer' }),
          ws('p2', { layer: 1, template: 'printer' }),
          ws('w1', { layer: 1 }),
          ws('w2', { layer: 1 }),
        ],
        'a',
      );
      expect(layoutMap(state, none).items.some(i => i.kind === 'group')).toBe(false);
    });

    it.each([
      ['accessed', { accessLevel: 'user' as const }],
      ['compromised', { compromised: true }],
      ['patched', { sentinelPatched: true }],
    ])('never hides an %s filler, and the rest no longer reach the threshold if too few remain', (_n, over) => {
      const nodes = [ws('a', { anchor: true, layer: 1 }), ...fillers(GROUP_MIN)];
      const state = produce(stateWith(nodes, 'a'), s => {
        Object.assign(s.network.nodes['f0']!, { accessLevel: 'none' }, over);
      });
      const l = layoutMap(state, none);
      expect(l.items.find(i => i.id === 'f0')?.kind).toBe('node');
      // only GROUP_MIN-1 hideable fillers remain, below the threshold: all shown
      expect(l.items.some(i => i.kind === 'group')).toBe(false);
    });

    it('never hides the current filler node', () => {
      const state = stateWith([...fillers(GROUP_MIN + 1)], 'f0');
      const l = layoutMap(state, none);
      expect(l.items.find(i => i.id === 'f0')?.kind).toBe('node');
      expect(l.items.find(i => i.kind === 'group')).toBeDefined();
    });

    it('an expanded group lists its members after the group item', () => {
      const state = stateWith([ws('a', { anchor: true, layer: 1 }), ...fillers(GROUP_MIN)], 'a');
      const gid = groupId(1, 'workstation');
      const l = layoutMap(state, new Set([gid]));
      expect(l.items.map(i => i.id)).toEqual(['a', gid, 'f0', 'f1', 'f2']);
      const group = l.items.find(i => i.kind === 'group');
      expect(group?.kind === 'group' && group.expanded).toBe(true);
    });

    it('ignores expanded ids for groups that do not exist', () => {
      const state = stateWith([ws('a', { anchor: true, layer: 1 })], 'a');
      expect(layoutMap(state, new Set(['group:3:printer', 'junk'])).items).toHaveLength(1);
    });

    it('routes a link to a hidden node to its group and drops duplicates and self links', () => {
      const nodes = [
        ws('a', { anchor: true, layer: 1, connections: ['f0', 'f1', 'f2'] }),
        ws('f0', { layer: 1, connections: ['f1'] }),
        ws('f1', { layer: 1 }),
        ws('f2', { layer: 1 }),
      ];
      const l = layoutMap(stateWith(nodes, 'a'), none);
      const gid = groupId(1, 'workstation');
      expect(l.links.map(x => x.id)).toEqual([`a|${gid}`]);
      expect(l.positions['f0']).toEqual(l.positions[gid]);
    });
  });

  it('labels layer 5 CASSANDRA and never prints the secret name', () => {
    const state = stateWith([ws('core', { layer: 5, anchor: true })], 'core');
    const l = layoutMap(state, none);
    expect(l.columns[0]?.label).toBe('CASSANDRA');
    expect(JSON.stringify(l.columns)).not.toMatch(/\baria\b/i);
  });

  it('copes with a state whose only shown node is the current one', () => {
    const l = layoutMap(createInitialState(), none);
    expect(l.items.length).toBeGreaterThanOrEqual(1);
    expect(l.width).toBeGreaterThan(0);
    expect(l.height).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Run, expect failure** — `pnpm vitest run src/engine/mapLayout.test.ts` → FAIL (module not found).

- [ ] **Step 7: Implement `mapLayout.ts`**

```ts
import type { GameState, LiveNode, NodeTemplate } from '../types/game';

export const LAYER_LABELS: readonly string[] = [
  'ENTRY',
  'OPS',
  'SECURITY',
  'FINANCE',
  'EXECUTIVE',
  'CASSANDRA',
];

export const COL_W = 220;
export const ROW_H = 96;
export const TOP = 56;
export const LEFT = 40;
export const GROUP_MIN = 3;

export interface PlacedNode {
  kind: 'node';
  id: string;
  node: LiveNode;
  x: number;
  y: number;
}
export interface PlacedGroup {
  kind: 'group';
  id: string;
  template: NodeTemplate;
  layer: number;
  memberIds: string[];
  expanded: boolean;
  x: number;
  y: number;
}
export type PlacedItem = PlacedNode | PlacedGroup;
export interface PlacedColumn {
  layer: number;
  label: string;
  x: number;
}
export interface PlacedLink {
  id: string;
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  touchesCurrent: boolean;
  patched: boolean;
}
export interface MapLayout {
  columns: PlacedColumn[];
  items: PlacedItem[];
  links: PlacedLink[];
  width: number;
  height: number;
  positions: Record<string, { x: number; y: number }>;
}

export const groupId = (layer: number, template: NodeTemplate): string =>
  `group:${String(layer)}:${template}`;

// Nodes that must stay visible whatever the grouping.
const pinned = (n: LiveNode, currentId: string): boolean =>
  n.id === currentId || n.accessLevel !== 'none' || n.compromised || !!n.sentinelPatched;

// What a column holds before positions: nodes and groups in order.
type Slot =
  | { kind: 'node'; node: LiveNode }
  | { kind: 'group'; id: string; template: NodeTemplate; memberIds: string[]; expanded: boolean };

const columnSlots = (
  nodes: LiveNode[],
  layer: number,
  currentId: string,
  expanded: ReadonlySet<string>,
): Slot[] => {
  const anchors = nodes.filter(n => n.anchor);
  const fillers = nodes.filter(n => !n.anchor).sort((a, b) => a.id.localeCompare(b.id));

  const hideable = new Map<NodeTemplate, string[]>();
  for (const n of fillers) {
    if (pinned(n, currentId)) continue;
    hideable.set(n.template, [...(hideable.get(n.template) ?? []), n.id]);
  }
  const grouped = new Map<NodeTemplate, string[]>(
    [...hideable].filter(([, ids]) => ids.length >= GROUP_MIN),
  );

  const slots: Slot[] = anchors.map(node => ({ kind: 'node', node }));
  const emitted = new Set<NodeTemplate>();
  for (const n of fillers) {
    const ids = grouped.get(n.template);
    if (!ids?.includes(n.id)) {
      slots.push({ kind: 'node', node: n });
      continue;
    }
    const gid = groupId(layer, n.template);
    const open = expanded.has(gid);
    if (!emitted.has(n.template)) {
      emitted.add(n.template);
      slots.push({ kind: 'group', id: gid, template: n.template, memberIds: ids, expanded: open });
    }
    if (open) slots.push({ kind: 'node', node: n });
  }
  return slots;
};

export const layoutMap = (state: GameState, expanded: ReadonlySet<string>): MapLayout => {
  const { nodes, currentNodeId } = state.network;
  const shown = Object.values(nodes).filter(
    (n): n is LiveNode => !!n && (n.discovered || n.id === currentNodeId),
  );
  const shownIds = new Set(shown.map(n => n.id));

  const layers = [...new Set(shown.map(n => n.layer))].sort((a, b) => a - b);
  const columns: PlacedColumn[] = [];
  const items: PlacedItem[] = [];
  const positions: Record<string, { x: number; y: number }> = {};
  const representative = new Map<string, string>();
  let maxRows = 0;

  layers.forEach((layer, col) => {
    const x = LEFT + col * COL_W + COL_W / 2;
    columns.push({ layer, label: LAYER_LABELS[layer] ?? '', x });
    const slots = columnSlots(
      shown.filter(n => n.layer === layer),
      layer,
      currentNodeId,
      expanded,
    );
    maxRows = Math.max(maxRows, slots.length);
    slots.forEach((slot, row) => {
      const y = TOP + row * ROW_H + ROW_H / 2;
      if (slot.kind === 'node') {
        items.push({ kind: 'node', id: slot.node.id, node: slot.node, x, y });
        positions[slot.node.id] = { x, y };
        representative.set(slot.node.id, slot.node.id);
        return;
      }
      items.push({
        kind: 'group',
        id: slot.id,
        template: slot.template,
        layer,
        memberIds: slot.memberIds,
        expanded: slot.expanded,
        x,
        y,
      });
      positions[slot.id] = { x, y };
      if (!slot.expanded) {
        for (const m of slot.memberIds) {
          representative.set(m, slot.id);
          positions[m] = { x, y };
        }
      }
    });
  });

  const links: PlacedLink[] = [];
  const seen = new Set<string>();
  for (const a of shown) {
    for (const bId of a.connections) {
      if (!shownIds.has(bId)) continue;
      const from = representative.get(a.id) ?? a.id;
      const to = representative.get(bId) ?? bId;
      if (from === to) continue;
      const id = [from, to].sort().join('|');
      if (seen.has(id)) continue;
      seen.add(id);
      const p1 = positions[from];
      const p2 = positions[to];
      if (!p1 || !p2) continue;
      const b = nodes[bId];
      links.push({
        id,
        from,
        to,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        touchesCurrent: a.id === currentNodeId || bId === currentNodeId,
        patched: !!a.sentinelPatched || !!b?.sentinelPatched,
      });
    }
  }

  return {
    columns,
    items,
    links,
    positions,
    width: LEFT * 2 + Math.max(1, columns.length) * COL_W,
    height: TOP + Math.max(1, maxRows) * ROW_H + 24,
  };
};
```

A link's `id` is its two representative ids sorted and joined with `|` (`a|b`, `a|group:1:workstation`).

- [ ] **Step 8: Run, expect PASS** — `pnpm vitest run src/engine/mapLayout.test.ts src/engine/mapView.test.ts`. Fix the implementation, not the assertions, for any failure.

- [ ] **Step 9: Share the label table**

In `src/components/MapModal.tsx` delete its local `LAYER_LABELS` and `import { LAYER_LABELS } from '../engine/mapLayout';`. Run `pnpm vitest run src/components/MapModal.test.tsx` → PASS.

- [ ] **Step 10: Gate and commit**

Run: `pnpm format && pnpm build && pnpm lint && pnpm vitest run src/engine/mapLayout.test.ts src/engine/mapView.test.ts src/components/MapModal.test.tsx`
Expected: all exit 0.

```bash
git add -A src
git commit -m "feat: pure layout and view maths for the network map"
```

---

### Task 3: The NetworkMap component

**Files:**
- Create: `src/components/NetworkMap.tsx`, `src/components/NetworkMap.test.tsx`
- Modify: `src/styles/globals.css` (append `.network-map` rules)

**Interfaces:**
- Consumes: `layoutMap`, `groupId`, `COL_W`, `ROW_H`, `PlacedItem`, `MapLayout` (Task 2); `View`, `zoomAt`, `panBy`, `fitView`, `isVisible`, `centreOn` (Task 2).
- Produces: `export const NetworkMap: (props: { gameState: GameState }) => JSX.Element`. No actions: Enter/click on a node does nothing in this part (group nodes toggle). Part 3 adds the menu through the same node elements.

Rendering contract (tests rely on it):
- Root `<div className="network-map" role="region" aria-label="Network map" data-testid="network-map">` containing an `<svg>` (class `network-map-svg`) and a control bar `<div className="network-map-controls">` with buttons named `Zoom in`, `Zoom out`, `Fit to window` (visible text `+`, `−`, `fit`).
- World group `<g data-testid="map-world" transform="translate(x y) scale(k)">`.
- Column headers `<text className="map-col">` with text `L<n> <LABEL>`.
- Each node `<g className="map-node" tabIndex={0} role="img" aria-label="<label>, <ip>[, current][, <access> access][, compromised][, patched][, locked]" data-node-id data-current data-access data-compromised data-patched data-locked>`; shows label (truncated to 18 chars with `…`) and ip as `<text>`.
- Each group `<g className="map-group" tabIndex={0} role="button" aria-expanded aria-label="<N> <template> hosts, press to expand|collapse" data-group-id>`; visible text `+N <template with spaces>` (collapsed) or `− N <template>` (expanded). Click, `Enter` and `Space` toggle it.
- Links `<line className="map-link" data-link-id data-current="true|false" data-patched="true|false">`, drawn before nodes.
- Keyboard on the root: arrows pan 40px, `+`/`=` zoom in, `-` zoom out, `0` fit.

- [ ] **Step 1: Write the failing component tests**

`src/components/NetworkMap.test.tsx` (jsdom). Helpers: `shown = (ids) => state with only those discovered`. Cases (write them all; each is one `it`):

1. Brand-new game: `render(<NetworkMap gameState={createInitialState()} />)` shows a `[data-node-id]` for the current node, one column header, and the three control buttons.
2. Discovered node only: an undiscovered neighbour has no `[data-node-id]` and no `[data-link-id]` mentions it (`container.innerHTML` does not contain its id).
3. Level headers read `L1 OPS` etc.; layer 5 reads `CASSANDRA`.
4. Node accessible name carries state: set a node `accessLevel = 'admin'`, `compromised = true`, `sentinelPatched = true`, current → name matches `/current/`, `/admin access/`, `/compromised/`, `/patched/`; attributes `data-current="true"` etc.
5. Group: build a state with 3+ same-template unpinned fillers in one column (copy the `stateWith` approach from `mapLayout.test.ts`; `createInitialState` has real fillers, so you may instead discover every node and assert at least one `[data-group-id]` appears and member nodes are absent). Clicking the group's button expands it (`aria-expanded="true"`, members present as `[data-node-id]`), clicking again collapses.
6. Expansion persists: after expanding, `sessionStorage.getItem('irongate_map_groups')` parses to an array containing the group id; unmount, remount → still expanded.
7. Garbage in `sessionStorage` (`'not json'`, `'{"a":1}'`, `'[1,"x","group:9:junk"]'`) is ignored: renders, nothing expanded, no throw. Storage that throws (`vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('x'); })`) is ignored too.
8. Zoom buttons change the world transform scale (read the `transform` attribute of `[data-testid="map-world"]`): `Zoom in` raises `scale(k)`, `Zoom out` lowers it, `Fit to window` returns to the initial transform.
9. Arrow keys pan: `fireEvent.keyDown(root, { key: 'ArrowRight' })` changes the translate x by +40 (use the parsed transform).
10. Drag pans: dispatch `new MouseEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true })` on the svg, then `pointermove` to (130, 90), then `pointerup`; translate changes by (+30, −10). (jsdom may lack `PointerEvent`; dispatching a `MouseEvent` with the `pointer*` type name is what React listens to, and carries `clientX`.)
11. Wheel zooms: `fireEvent.wheel(svg, { deltaY: -100, clientX: 10, clientY: 10 })` raises `k`; `deltaY: 100` lowers it.
12. Re-centre: render with the current node on L0; rerender with `currentNodeId` set to a discovered node on a far level after panning so it is off screen (`fireEvent.keyDown` ArrowLeft × 40 first) → the transform changes so the new current node is inside the visible box. Also: rerender with only `turnCount` changed after the player panned → the transform is unchanged.
13. Naming guard: discover every node incl. layer 5 with `ARIA_NAME_KNOWN` unset; collect `container.textContent` and every `aria-label` value; none matches `/\baria\b/i`.
14. Reduced motion: the CSS file contains an `@media (prefers-reduced-motion: reduce)` block that sets `animation: none` for `.map-ring` (read `src/styles/globals.css` with `fs.readFileSync` and assert the rule text), because jsdom does not evaluate media queries.

- [ ] **Step 2: Run, expect failure** — `pnpm vitest run src/components/NetworkMap.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement `NetworkMap.tsx`**

Structure to follow (write the real code; keep the contract above exactly):

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, WheelEvent } from 'react';
import type { GameState, NodeTemplate } from '../types/game';
import { layoutMap } from '../engine/mapLayout';
import type { PlacedGroup, PlacedNode } from '../engine/mapLayout';
import { centreOn, fitView, isVisible, panBy, zoomAt } from '../engine/mapView';
import type { Size, View } from '../engine/mapView';

const GROUPS_KEY = 'irongate_map_groups';
const GROUP_ID = /^group:[0-5]:[a-z_]+$/;
const DEFAULT_BOX: Size = { w: 800, h: 480 };
const PAN_STEP = 40;
const ZOOM_STEP = 1.2;

const readExpanded = (): Set<string> => {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(GROUPS_KEY) ?? 'null');
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string' && GROUP_ID.test(v)));
  } catch {
    return new Set();
  }
};

const writeExpanded = (ids: ReadonlySet<string>) => {
  try {
    sessionStorage.setItem(GROUPS_KEY, JSON.stringify([...ids]));
  } catch {
    // storage unavailable: the choice lasts as long as the component
  }
};
```

Component logic:
- `const [expanded, setExpanded] = useState(readExpanded)`; `useEffect(() => { writeExpanded(expanded); }, [expanded])`.
- `const layout = useMemo(() => layoutMap(gameState, expanded), [gameState, expanded])`.
- `const ref = useRef<HTMLDivElement>(null)`; `const boxSize = (): Size` reads `ref.current` `clientWidth/clientHeight`, returning `DEFAULT_BOX` when either is 0 (jsdom).
- `const [view, setView] = useState<View>(() => fitView({ w: layout.width, h: layout.height }, DEFAULT_BOX))`. An effect on mount (empty deps via a `useRef` "didFit" guard) refits with the real `boxSize()`.
- Re-centre: `const latest = useRef({ layout, view })` updated in an effect; `useEffect(() => { const p = latest.current.layout.positions[gameState.network.currentNodeId]; if (p && !isVisible(latest.current.view, p, boxSize())) setView(centreOn(latest.current.view, p, boxSize())); }, [gameState.network.currentNodeId])`. This runs only when the current node changes, so an unrelated turn never yanks the view back.
- Controls: `zoom(factor)` = `setView(v => zoomAt(v, factor, box.w / 2, box.h / 2))`; fit = `setView(fitView({ w: layout.width, h: layout.height }, boxSize()))`.
- Drag: `dragRef = useRef<{ x: number; y: number } | null>(null)`; `onPointerDown` on the svg only when `e.target === e.currentTarget` or a non-node element (check `!(e.target as Element).closest('.map-node, .map-group')`), store clientX/Y; `onPointerMove` pans by the delta and updates the stored point; `onPointerUp`/`onPointerLeave` clear it. No pointer capture.
- Wheel: `onWheel` → `zoomAt(v, e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, e.clientX - rect.left, e.clientY - rect.top)` using `ref.current.getBoundingClientRect()`.
- Keys on the root div (`onKeyDown`): arrows pan by `PAN_STEP` (ArrowRight pans the content left? No: ArrowRight moves the view right, i.e. `panBy(v, +PAN_STEP, 0)` — the test in step 9 asserts +40), `+`/`=`/`-`/`0` as in the contract. Do not intercept keys when the event target is a button other than a node (the control buttons keep Enter/Space).
- Nodes: a `Glyph` component with `GLYPHS: Record<NodeTemplate, string>` (exhaustive; ten simple 24×24 line-art paths, one per template: workstation = monitor + stand, database_server = stacked discs, file_server = three stacked bars, web_server = globe-ish circle with a meridian, security_node = shield, mail_server = envelope, iot_device = chip square with pins, router_switch = box with two arrows, printer = tray + box, dev_server = `</>` brackets), drawn with `stroke="currentColor" fill="none"` and `transform="translate(-12 -12)"`.
- Node look per spec: circle r=22 (`.map-disc`), `.map-ring` pulsing circle (r=28) only when current, access badge text (`U`/`A`/`R` for user/admin/root) at the top-right, `!` when compromised, hatched stroke via `<pattern id="map-hatch">` in `<defs>` when `sentinelPatched`, a padlock path when `locked`, label and ip beneath.
- Links: `.map-link` lines with `data-current` / `data-patched`; dashed via CSS for patched; drawn first.
- Column headers: `<text className="map-col" x={c.x} y={24}>L{layer} {label}</text>`.
- `aria-label` builder is a small exported-for-test-free pure function inside the file.

- [ ] **Step 4: Add the styles to `globals.css`**

Append a `.network-map` section using only palette variables: root `position: relative; height: 100%; overflow: hidden; background: transparent; outline: none`; `.network-map-svg { width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; }`; links `stroke: var(--color-dim); stroke-width: 1; opacity: .6`, `[data-current='true'] { stroke: var(--color-system); opacity: 1 }`, `[data-patched='true'] { stroke-dasharray: 4 4 }`; `.map-disc { fill: var(--color-bg); stroke: var(--color-border); stroke-width: 2 }`, `.map-node[data-current='true'] .map-disc { stroke: var(--color-output) }`, `[data-compromised='true'] .map-disc { stroke: var(--color-active) }`, `[data-patched='true'] .map-disc { fill: url(#map-hatch); stroke: var(--color-aggressive) }`, access badge in `var(--color-safe)`, text `fill: var(--color-output); font-family: var(--font-mono); font-size: 11px`, ip text `fill: var(--color-dim); font-size: 10px`, `.map-col { fill: var(--color-system); font-size: 11px; font-family: var(--font-mono) }`, focus ring `.map-node:focus-visible .map-disc, .map-group:focus-visible rect { stroke: var(--color-output); stroke-width: 3 }`, controls pinned top-right (`position: absolute; top: 6px; right: 8px; display: flex; gap: 4px`) styled like `.aux-tabs button`. Pulse:

```css
.map-ring {
  fill: none;
  stroke: var(--color-output);
  opacity: 0.7;
  animation: map-pulse 2s ease-in-out infinite;
}
@keyframes map-pulse {
  50% {
    opacity: 0.15;
  }
}
@media (prefers-reduced-motion: reduce) {
  .map-ring {
    animation: none;
  }
}
```

- [ ] **Step 5: Run the component tests until green**

Run: `pnpm vitest run src/components/NetworkMap.test.tsx`
Expected: PASS. Fix the component for failures; adjust a test only if it asserts something this plan's contract does not say (and note it in your report).

- [ ] **Step 6: Gate and commit**

Run: `pnpm format && pnpm build && pnpm lint && pnpm vitest run src/components/NetworkMap.test.tsx`
Expected: exit 0 everywhere.

```bash
git add -A src
git commit -m "feat: the network map diagram component"
```

---

### Task 4: Wire the tab, the handle, the command, docs

**Files:**
- Modify: `src/components/Workspace.tsx`, `src/components/Workspace.test.tsx`
- Modify: `src/App.tsx` (the `map` branch near line 584)
- Modify: `src/components/HelpModal.tsx:39` (help line wording)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `NetworkMap` (Task 3), `AUX_TAB_LABELS` (Task 1).
- Produces: `WorkspaceHandle.showNetworkMap: () => void`; `DocTab = 'doc' | 'mail' | 'map'`.

- [ ] **Step 1: Write the failing Workspace tests**

Add a `describe('Workspace — the NETWORK MAP doc tab', …)` to `src/components/Workspace.test.tsx` (reuse `setup`, `section`, `inPane`):

1. The doc pane header has `DOC`, `MAIL` and `NETWORK MAP` buttons; the aux pane has `NETWORK LIST` and no `NETWORK MAP`.
2. Clicking `NETWORK MAP` shows `[data-testid="network-map"]` inside the doc pane and hides the explorer placeholder; clicking `DOC` brings the explorer back.
3. `ref.current.showNetworkMap()` selects the tab; with the default layout (doc on screen) it does **not** change focus (`section('term').dataset.focused` stays `'true'`); after `Alt+Z` on another pane (doc off screen) it focuses the doc pane.
4. Selecting a file in the explorer while on NETWORK MAP flips to DOC (the file detail shows). (Reuse the explorer interaction used by the existing "DOC → file" tests.)
5. Running a command via a doc-pane Open button is not possible from the map, so instead assert `onRunCommand` calls do not change the tab: re-render with a new `gameState` (turn advanced) and confirm NETWORK MAP is still showing.
6. NETWORK MAP is still selected after `showMail()` is not required; but `showMail()` switches to MAIL (existing behaviour) — assert it so the three-way tab state is pinned.

- [ ] **Step 2: Run, expect failure** — `pnpm vitest run src/components/Workspace.test.tsx` → FAIL.

- [ ] **Step 3: Implement in `Workspace.tsx`**

- `import { NetworkMap } from './NetworkMap';`
- `type DocTab = 'doc' | 'mail' | 'map';` and `const DOC_TAB_LABELS: Record<DocTab, string> = { doc: 'DOC', mail: 'MAIL', map: 'NETWORK MAP' };`
- Handle: add `showNetworkMap: () => void` to `WorkspaceHandle` with the comment "Selects the doc pane's NETWORK MAP tab; focuses the doc pane only if it is off screen." Implementation in `useImperativeHandle`: `setDocTab('map'); if (!docOnScreenRef.current) focus('doc');`.
- `docTabs`: map over `(['doc', 'mail', 'map'] as const)` with `{DOC_TAB_LABELS[tab]}`.
- Pane `doc`: `docTab === 'mail' ? <MailPane …/> : docTab === 'map' ? <NetworkMap gameState={gameState} /> : <DocPane …/>` (keep `gameState &&` guard; give each branch its own `key` is unnecessary since component types differ).

- [ ] **Step 4: Point the `map` command at it**

In `src/App.tsx` replace `workspaceRef.current?.showAux('list');` in the `map` branch with `workspaceRef.current?.showNetworkMap();`. Change the help line in `HelpModal.tsx` to `'  map           -open the network map'` (keep the column alignment of the neighbouring lines; update `HelpModal.test.tsx` if it asserts the old text). Search `grep -rn "discovered network nodes" src` and fix any other copy or test.

- [ ] **Step 5: Document**

`CLAUDE.md`: in the "Tiled layout" paragraph change "`map`/`notes` select the aux tab" to "`notes` selects the aux tab, `map` the doc pane's NETWORK MAP tab"; the aux pane's tabs are now `NETWORK LIST | CASE | CAM`; add a **Network map** paragraph after **Mail**: the tab, `showNetworkMap`, `mapLayout.ts`/`mapView.ts`/`NetworkMap.tsx`, the grouping rule, `irongate_map_groups`, and the spec path. State that actions and effects are parts 3 and 4.

- [ ] **Step 6: Run the tests and the whole gate**

Run: `pnpm format && pnpm build && pnpm lint && pnpm test:coverage && pnpm knip`
Expected: build, lint, test:coverage exit 0; knip shows only the 13 known unused-type findings plus 1 configuration hint (nothing new — if `LAYER_LABELS`, `COL_W` or another new export shows as unused, make it non-exported).

- [ ] **Step 7: Real-browser check**

Start `pnpm dev` (note its PID; stop only that process afterwards), then run `pnpm playthrough --headless` against it. Expected: milestones pass (exit 0) — it clicks `NETWORK LIST` where it used to click `MAP`. Then, by hand with Playwright or the browser, confirm: the `map` command shows the diagram, the three controls work, a drag pans, and a screenshot looks right (columns aligned, labels readable, current node pulsing). Report what you saw; do not claim visual correctness without having looked.

- [ ] **Step 8: Commit**

```bash
git add -A src CLAUDE.md
git commit -m "feat: the network map tab in the doc pane"
```
