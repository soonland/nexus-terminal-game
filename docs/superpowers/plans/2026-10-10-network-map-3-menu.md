# Network Map Part 3 — The Node Action Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a node on the NETWORK MAP opens a menu of what that node allows right now (`nodeActions`), runs the chosen entry as an ordinary command, and asks for a second click on anything that costs something.

**Architecture:** Two small pure helpers (`placeMenu`/`estimateMenuSize` in `mapView.ts`, `menuLockReason` in `mapActions.ts`), one presentational `NodeMenu` component (list, inline confirm, arrow-key focus, Esc), and `NetworkMap` owning which node's menu is open, where it sits, and when it closes. `Workspace` passes `onRunCommand` and `disabled` down; every click ends in the same `handleSubmit` path the explorer's Open button uses.

**Tech Stack:** React 19 + TypeScript, plain CSS, Vitest + Testing Library (jsdom), Playwright playthrough script.

**Spec:** `docs/superpowers/specs/2026-10-10-network-map-design.md` ("The node menu", "Costs and confirmation", "Behaviour", Risks: unlock sequence). Already built: `nodeActions(state, nodeId)` returning `NodeAction[]` (`src/engine/mapActions.ts`, part 1) and the read-only `NetworkMap` (part 2).

## Global Constraints

- No new rules and no new commands: a click runs `onRunCommand(action.command)`, nothing else changes game state. The menu only renders `nodeActions` (labels, `cost`, `confirm`, `disabledReason`); it never recomputes a rule.
- Spec, verbatim: "Scan, exploit, wipe logs, spoof and login turn the entry into an inline confirm (`spends 1 charge, +1 trace — Run / Cancel`); a second click runs it, `Esc` cancels. Only Connect and Disconnect run on the first click." The `confirm` flag of each `NodeAction` already encodes which; the menu follows it.
- Spec, verbatim: "A real menu: `role="menu"`, `role="menuitem"` entries reachable by arrow keys. It opens beside the node, flips to stay inside the pane, and closes on `Esc`, on an outside click, or on pan and zoom. Focus returns to the node."
- Spec, verbatim: "Entries are disabled while a command is running or the explorer is disabled (`explorerDisabled`)." Disabled entries stay visible with their reason.
- Spec Risks, verbatim: "While an unlock sequence is pending (`state.unlockSession` set) any command counts as abandoning it and records a failed attempt ... so the menu UI (part 3) must be disabled, or warn, while an unlock is pending." This plan disables every entry and shows a note.
- Nothing is offered where `nodeActions` returns `[]` (decision terminal, burned or ended run): the menu says so instead of staying empty.
- Naming rule: no rendered text or accessible name may match `/\baria\b/i` before `ARIA_NAME_KNOWN`, menus included. The login entry shows the username only; the password lives in `command` and must never be rendered or placed in an attribute.
- Group nodes (`+N <template>`) keep toggling on click; only real nodes open menus.
- Code style: arrow functions only (`func-style`), no `console`, Prettier (single quotes, trailing commas, 100 cols), commitlint lowercase conventional subjects. Run `pnpm format` before each commit. Coverage threshold is 75% per file (components are excluded from coverage). `pnpm knip` must show only the 13 baseline unused-type findings plus 1 config hint.
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- An unlock sequence is pending: every entry is inert with an explanation; clicking one sends no command.
- A costly entry never runs on the first click; `Cancel`, `Esc`, an outside click, zooming and panning all discard the pending confirm without sending anything; focus defaults to `Cancel`, so a stray Enter spends nothing.
- A node at the pane edge: the menu stays inside the pane (flips left / clamps up).
- `nodeActions` returns `[]` (burned run, decision terminal): the menu opens with "No actions available" and nothing throws.
- A command is running (`disabled`) or the run advances while the menu is open: entries are inert while busy, and the menu closes once the turn changes.
- Arrow keys inside the menu move between entries without panning the map; `Esc` closes the menu only.
- The password never appears in the DOM (text, `aria-label`, `title`, data attributes).
- A node that leaves the layout while its menu is open (a group collapsed, a refresh of the state) closes the menu instead of leaving it floating.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/engine/mapView.ts` (modify) | `estimateMenuSize`, `placeMenu`: where the menu goes inside the pane |
| `src/engine/mapActions.ts` (modify) | `menuLockReason(state, busy)`: why every entry is inert, or `null` |
| `src/components/NodeMenu.tsx` (create) | The menu: entries, inline confirm, arrow keys, `Esc` |
| `src/components/NetworkMap.tsx` (modify) | Which node's menu is open, anchor from the view, closing rules, focus return |
| `src/components/Workspace.tsx` (modify) | Pass `onRunCommand` and `disabled` to `NetworkMap` |
| `src/styles/globals.css` (modify) | `.node-menu*` styles, `data-menu-open` node look |
| `src/components/HelpModal.tsx` (modify) | `map` help line mentions clicking a node |
| `playwright-playthrough.mjs` (modify) | Move and scan through the diagram |
| `CLAUDE.md` (modify) | Document the menu |

---

### Task 1: Pure helpers — menu placement and the lock reason

**Files:**
- Modify: `src/engine/mapView.ts`, `src/engine/mapView.test.ts`
- Modify: `src/engine/mapActions.ts`, `src/engine/mapActions.test.ts`

**Interfaces:**
- Produces (`mapView.ts`):
  ```ts
  export const MENU_W = 240;
  export const estimateMenuSize: (rows: number, hasNote: boolean) => Size;   // h = 8 + max(1, rows) * 34 + (hasNote ? 40 : 0)
  export const placeMenu: (anchor: { x: number; y: number }, menu: Size, box: Size, gap?: number) => { left: number; top: number };
  ```
  `anchor` is the node's centre in pane coordinates (`world * k + view offset`). `placeMenu` prefers the right of the node (`anchor.x + gap`), flips to the left when it would not fit, then clamps into `[0, box - menu]` on both axes (never negative, even when the box is smaller than the menu); `top` starts 16px above the anchor. Default `gap` is 34.
- Produces (`mapActions.ts`):
  ```ts
  export const menuLockReason: (state: GameState, busy: boolean) => string | null;
  ```
  `busy` (the command line is busy or the explorer is disabled) → `'Not available right now'`; else an unlock sequence pending (`state.unlockSession !== null`) → `'An unlock sequence is waiting in the terminal. Any other command abandons it and records a failed attempt.'`; else `null`. `busy` wins.

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/mapView.test.ts` (import `MENU_W, estimateMenuSize, placeMenu`):

```ts
describe('menu placement', () => {
  const box = { w: 800, h: 480 };
  const menu = { w: MENU_W, h: 200 };

  it('estimates the height from the row count and the note', () => {
    expect(estimateMenuSize(3, false)).toEqual({ w: MENU_W, h: 8 + 3 * 34 });
    expect(estimateMenuSize(3, true)).toEqual({ w: MENU_W, h: 8 + 3 * 34 + 40 });
    expect(estimateMenuSize(0, false).h).toBe(8 + 34);
  });

  it('opens to the right of the node and a little above it', () => {
    expect(placeMenu({ x: 100, y: 100 }, menu, box)).toEqual({ left: 134, top: 84 });
  });

  it('flips to the left when the right side does not fit', () => {
    const p = placeMenu({ x: 700, y: 100 }, menu, box);
    expect(p.left).toBe(700 - 34 - MENU_W);
  });

  it('clamps the bottom edge into the pane', () => {
    expect(placeMenu({ x: 100, y: 470 }, menu, box).top).toBe(480 - 200);
  });

  it('never goes negative, even in a pane smaller than the menu', () => {
    const p = placeMenu({ x: 5, y: 5 }, menu, { w: 100, h: 100 });
    expect(p.left).toBe(0);
    expect(p.top).toBe(0);
  });
});
```

Add to `src/engine/mapActions.test.ts` (use the file's existing state helpers; read the file first):

```ts
describe('menuLockReason', () => {
  it('is null when nothing blocks the menu', () => {
    expect(menuLockReason(makeState(), false)).toBeNull();
  });
  it('says so when busy', () => {
    expect(menuLockReason(makeState(), true)).toBe('Not available right now');
  });
  it('warns while an unlock sequence is pending', () => {
    const state = produce(makeState(), s => {
      s.unlockSession = { filePath: '/x', codes: ['AAAA-BBBB', 'CCCC-DDDD', 'EEEE-FFFF'], step: 0 };
    });
    expect(menuLockReason(state, false)).toMatch(/unlock sequence is waiting/i);
  });
  it('busy wins over a pending unlock', () => {
    const state = produce(makeState(), s => {
      s.unlockSession = { filePath: '/x', codes: ['AAAA-BBBB', 'CCCC-DDDD', 'EEEE-FFFF'], step: 0 };
    });
    expect(menuLockReason(state, true)).toBe('Not available right now');
  });
});
```
(Match the `UnlockSession` type in `src/types/game.ts` exactly; if `codes` has a different shape, copy what `commands.ts:2041` builds.)

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run src/engine/mapView.test.ts src/engine/mapActions.test.ts`
Expected: FAIL (`placeMenu`, `estimateMenuSize`, `menuLockReason` not exported).

- [ ] **Step 3: Implement**

Append to `src/engine/mapView.ts`:

```ts
export const MENU_W = 240;
const MENU_ROW_H = 34;
const MENU_PAD = 8;
const MENU_NOTE_H = 40;

// The menu is laid out by CSS; this is the room reserved for it when deciding where it goes.
export const estimateMenuSize = (rows: number, hasNote: boolean): Size => ({
  w: MENU_W,
  h: MENU_PAD + Math.max(1, rows) * MENU_ROW_H + (hasNote ? MENU_NOTE_H : 0),
});

// Beside the node (right by preference, left when it does not fit), kept inside the pane.
export const placeMenu = (
  anchor: { x: number; y: number },
  menu: Size,
  box: Size,
  gap = 34,
): { left: number; top: number } => {
  const rawLeft = anchor.x + gap + menu.w <= box.w ? anchor.x + gap : anchor.x - gap - menu.w;
  return {
    left: Math.max(0, Math.min(rawLeft, box.w - menu.w)),
    top: Math.max(0, Math.min(anchor.y - 16, box.h - menu.h)),
  };
};
```

Append to `src/engine/mapActions.ts`:

```ts
// Why every entry of the map menu is inert right now, or null. While an unlock sequence is pending
// any command abandons it (and records a failed attempt), so the menu must not send one.
export const menuLockReason = (state: GameState, busy: boolean): string | null => {
  if (busy) return 'Not available right now';
  if (state.unlockSession) {
    return 'An unlock sequence is waiting in the terminal. Any other command abandons it and records a failed attempt.';
  }
  return null;
};
```

- [ ] **Step 4: Run, expect PASS** — `pnpm vitest run src/engine/mapView.test.ts src/engine/mapActions.test.ts`

- [ ] **Step 5: Gate and commit**

Run: `pnpm format && pnpm build && pnpm lint` (exit 0; the single CommsPane warning is old). If knip flags `MENU_W` or another new export as unused, it is consumed in Task 3: keep it exported only if a test or `NetworkMap` imports it by then, otherwise run `pnpm knip` after Task 3.

```bash
git add -A src
git commit -m "feat: menu placement and lock reason for the network map"
```

---

### Task 2: The NodeMenu component

**Files:**
- Create: `src/components/NodeMenu.tsx`, `src/components/NodeMenu.test.tsx`

**Interfaces:**
- Consumes: `NodeAction` from `src/engine/mapActions.ts`.
- Produces:
  ```ts
  export const NodeMenu: (props: {
    actions: NodeAction[];
    lockReason: string | null;   // when set, every entry is inert and the reason shows once as a note
    left: number;                // pane coordinates, from placeMenu
    top: number;
    onRun: (command: string) => void;
    onClose: () => void;         // Esc on the list, or the owner closing it
  }) => JSX.Element
  ```
  Contract the tests and Task 3 rely on:
  - Root `<div className="node-menu" role="menu" aria-label="Node actions" style={{ left, top }}>`; every entry is a `<button type="button" role="menuitem" className="node-menu-item">`. Entry text: `<span className="node-menu-label">label</span>`, then `<span className="node-menu-cost">cost</span>` when `cost` is set, then `<span className="node-menu-reason">disabledReason</span>` when set. An inert entry has `aria-disabled="true"` (it stays focusable so its reason can be read) and clicking it does nothing. `data-action-id={action.id}`.
  - `lockReason` shows once, as `<div className="node-menu-note" role="note">` above the entries.
  - An empty `actions` list renders one inert entry `No actions available`.
  - A free entry runs `onRun(command)` on click. A `confirm` entry switches the menu to the confirm view: a line `<div className="node-menu-confirm">{label} — {cost}</div>` and two entries `Run` and `Cancel`; `Run` calls `onRun(command)` (ignored while `lockReason` is set); `Cancel` returns to the list. Focus starts on the first entry of the list, and on `Cancel` in the confirm view.
  - Keys inside the menu: `ArrowDown`/`ArrowUp` cycle through the entries (wrapping), `Home`/`End` jump; `Escape` leaves the confirm view if open, otherwise calls `onClose`. All of these call `preventDefault` and `stopPropagation`.
  - The menu never renders `command`.

- [ ] **Step 1: Write the failing tests**

`src/components/NodeMenu.test.tsx` (jsdom). Build `NodeAction`s with a tiny local factory:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NodeMenu } from './NodeMenu';
import type { NodeAction } from '../engine/mapActions';

const act = (over: Partial<NodeAction> & { id: string }): NodeAction => ({
  kind: 'scan-host',
  label: over.id,
  command: over.id,
  cost: null,
  confirm: false,
  disabledReason: null,
  ...over,
});

const FREE = act({ id: 'connect', kind: 'connect', label: 'Connect', command: 'connect 10.0.0.2' });
const COSTLY = act({
  id: 'scan',
  label: 'Scan',
  command: 'scan 10.0.0.2',
  cost: '+1–2 trace',
  confirm: true,
});
const BLOCKED = act({
  id: 'exploit:http',
  kind: 'exploit',
  label: 'Exploit http',
  command: 'exploit http',
  cost: '1 charge, +2–7 trace',
  confirm: true,
  disabledReason: 'exploit-kit tool required',
});

const setup = (actions: NodeAction[], lockReason: string | null = null) => {
  const onRun = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <NodeMenu actions={actions} lockReason={lockReason} left={10} top={20} onRun={onRun} onClose={onClose} />,
  );
  return { onRun, onClose, ...view };
};
```

Write these cases (each an `it`):
1. Renders `role="menu"` positioned at `left: 10px; top: 20px`, one `menuitem` per action, with label, cost and reason text in the accessible name (`getByRole('menuitem', { name: /Exploit http.*exploit-kit tool required/ })`).
2. A free entry runs on the first click: `onRun` called once with `'connect 10.0.0.2'`.
3. A costly entry does not run on the first click: `onRun` not called; the confirm line `Scan — +1–2 trace` and `Run` / `Cancel` show; the list entries are gone.
4. `Run` calls `onRun('scan 10.0.0.2')` once; `Cancel` returns to the list with `onRun` never called.
5. Focus: on open `document.activeElement` is the first entry; in the confirm view it is `Cancel`.
6. `Escape` in the confirm view returns to the list and does NOT call `onClose`; a second `Escape` calls `onClose` once.
7. A blocked entry (`disabledReason`) has `aria-disabled="true"`, a click does nothing (neither `onRun` nor the confirm view).
8. `lockReason`: the note shows once (`getAllByRole('note')` length 1, text matches), every entry is `aria-disabled`, clicking a free entry sends nothing; in the confirm view (open it first with no lock via rerender, then rerender with a `lockReason`) `Run` sends nothing.
9. Empty `actions` renders one inert `No actions available` entry; no throw.
10. Arrow keys: `ArrowDown` from the first entry focuses the second, wraps from the last to the first; `ArrowUp` wraps from the first to the last; `End` and `Home` jump.
11. The password is never rendered: use a login action `act({ id: 'login:x', kind: 'login', label: 'Login as ops.admin', command: 'login ops.admin IronG8te#Ops', cost: '+5 trace if it does not work here', confirm: true })`; open it and its confirm view; `container.innerHTML` does not contain `IronG8te#Ops`.

- [ ] **Step 2: Run, expect failure** — `pnpm vitest run src/components/NodeMenu.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement `NodeMenu.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { NodeAction } from '../engine/mapActions';

interface Props {
  actions: NodeAction[];
  lockReason: string | null;
  left: number;
  top: number;
  onRun: (command: string) => void;
  onClose: () => void;
}

export const NodeMenu = ({ actions, lockReason, left, top, onRun, onClose }: Props) => {
  const [confirming, setConfirming] = useState<NodeAction | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const items = (): HTMLElement[] =>
    Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  // The list opens on its first entry; the confirm view opens on Cancel, so a stray Enter spends
  // nothing.
  useEffect(() => {
    const all = items();
    (confirming ? all[all.length - 1] : all[0])?.focus();
  }, [confirming]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (confirming) setConfirming(null);
      else onClose();
      return;
    }
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'ArrowDown'
        ? (at + 1) % all.length
        : e.key === 'ArrowUp'
          ? (at - 1 + all.length) % all.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? all.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    e.stopPropagation();
    all[next]?.focus();
  };

  const choose = (a: NodeAction) => {
    if (a.confirm) setConfirming(a);
    else onRun(a.command);
  };

  return (
    <div
      ref={ref}
      className="node-menu"
      role="menu"
      aria-label="Node actions"
      style={{ left, top }}
      onKeyDown={onKeyDown}>
      {lockReason && (
        <div className="node-menu-note" role="note">
          {lockReason}
        </div>
      )}
      {confirming ? (
        <>
          <div className="node-menu-confirm">
            {confirming.label}
            {confirming.cost ? ` — ${confirming.cost}` : ''}
          </div>
          <button
            type="button"
            role="menuitem"
            className="node-menu-item"
            aria-disabled={lockReason !== null}
            onClick={() => {
              if (lockReason === null) onRun(confirming.command);
            }}>
            Run
          </button>
          <button
            type="button"
            role="menuitem"
            className="node-menu-item"
            onClick={() => {
              setConfirming(null);
            }}>
            Cancel
          </button>
        </>
      ) : actions.length === 0 ? (
        <button type="button" role="menuitem" className="node-menu-item" aria-disabled="true">
          No actions available
        </button>
      ) : (
        actions.map(a => {
          const blocked = lockReason !== null || a.disabledReason !== null || a.command === '';
          return (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              className="node-menu-item"
              aria-disabled={blocked}
              data-action-id={a.id}
              onClick={() => {
                if (!blocked) choose(a);
              }}>
              <span className="node-menu-label">{a.label}</span>
              {a.cost && <span className="node-menu-cost">{a.cost}</span>}
              {a.disabledReason && <span className="node-menu-reason">{a.disabledReason}</span>}
            </button>
          );
        })
      )}
    </div>
  );
};
```
(Add the `.node-menu*` rules in Task 3 with the rest of the CSS; the component is usable unstyled for the tests.)

- [ ] **Step 4: Run, expect PASS** — `pnpm vitest run src/components/NodeMenu.test.tsx`. Fix the implementation, not the assertions, for failures. If jsdom reports `aria-disabled` as the string `"false"`, assert with `getAttribute('aria-disabled')` against `'true'`/`'false'` accordingly.

- [ ] **Step 5: Gate and commit**

Run: `pnpm format && pnpm build && pnpm lint && pnpm vitest run src/components/NodeMenu.test.tsx` (exit 0).

```bash
git add -A src
git commit -m "feat: the node menu component with an inline confirm"
```

---

### Task 3: Open the menu from the diagram

**Files:**
- Modify: `src/components/NetworkMap.tsx`, `src/components/NetworkMap.test.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**
- Consumes: `nodeActions`, `menuLockReason` (`mapActions.ts`), `estimateMenuSize`, `placeMenu` (`mapView.ts`), `NodeMenu` (Task 2), `layout.positions`, `view`, `boxSize()`.
- Produces: `NetworkMap` props become
  ```ts
  { gameState: GameState; onRunCommand: (command: string) => void; disabled: boolean }
  ```
  (both new props required). Task 4 passes them from `Workspace`.

Behaviour to implement:
- State `menuNodeId: string | null`. A real node (`MapNode`) now has `role="button"`, `aria-haspopup="menu"`, `aria-expanded={menuOpen}`, `data-menu-open={String(menuOpen)}`; `onClick` and `Enter`/`Space` (with `preventDefault` and `stopPropagation`) call `onOpen(id)`, which toggles: opening another node switches the menu, the same node closes it. The accessible name (`nodeName`) is unchanged. Groups are untouched.
- The menu is rendered by `NetworkMap` (an HTML sibling of the `<svg>`, inside the root div, keyed by node id): `actions = nodeActions(gameState, menuNodeId)`, `lockReason = menuLockReason(gameState, disabled)`, anchor = `layout.positions[menuNodeId]` mapped to pane coordinates (`x * view.k + view.x`, `y * view.k + view.y`), `placeMenu(anchor, estimateMenuSize(Math.max(1, actions.length), lockReason !== null), boxSize())`.
- Running: `onRun(command)` calls `props.onRunCommand(command)` then closes the menu and returns focus to the node.
- Closing, all discarding any pending confirm (the menu unmounts): `Esc` from the menu (`onClose`, focus returns to the node), an outside `pointerdown` (document listener only while open; ignore targets inside `.node-menu` or `.map-node`), `zoom()`, `fit()`, `onWheel`, a keyboard pan, a drag that moves (in `onPointerMove` once it actually moves), the turn changing (`gameState.turnCount` differs from when it opened), and the node no longer being in `layout.positions`.
- Focus return: `closeMenu(returnFocus)` focuses `root.querySelector('[data-node-id="<id>"]')` when asked (Esc and after running); not for outside clicks, zooming or panning.
- The root `onKeyDown` already ignores keys that come from a `button`, so arrow keys inside the menu do not pan the map; verify with a test.

- [ ] **Step 1: Update the existing tests for the new props, then write the failing menu tests**

Add a helper to `NetworkMap.test.tsx` and replace every existing `<NetworkMap gameState={…} />` with it (`render(mapOf(state))` / pass overrides where a test needs them):

```tsx
const mapOf = (
  state: GameState,
  over: Partial<{ onRunCommand: (c: string) => void; disabled: boolean }> = {},
) => <NetworkMap gameState={state} onRunCommand={vi.fn()} disabled={false} {...over} />;
```
Rerenders (`rerender(<NetworkMap … />)`) use the same helper. Run the file: it must still pass before you add anything (the props are just unused at this point; TypeScript will force you to add them in step 3).

New cases, in a `describe('NetworkMap node menu')`. Use `createInitialState()`; the current node is `contractor_portal`; discover one neighbour it connects to (read its `connections`) so `Connect` is enabled. Open a node by `fireEvent.click(container.querySelector('[data-node-id="…"]')!)`; query the menu with `screen.getByRole('menu')` / `getByRole('menuitem', { name: /…/ })`.
1. Clicking a neighbour opens a menu with `Connect` and `Scan`; clicking the same node again closes it; clicking another node switches it. The node has `aria-haspopup="menu"`, `aria-expanded` follows, `data-menu-open` follows.
2. `Connect` runs on the first click: `onRunCommand` called once with `connect <ip>`, and the menu closes.
3. `Scan` asks first: after the click `onRunCommand` has NOT been called and `Run` / `Cancel` show; `Run` sends `scan <ip>` and closes; reopening and choosing `Cancel` sends nothing.
4. The current node's menu has `Scan host` and `Scan subnet`; `Scan subnet` → confirm → `Run` sends exactly `scan`.
5. `Esc` closes the menu and focus returns to the node (`document.activeElement` is the `[data-node-id]` element); `Esc` while confirming only leaves the confirm view.
6. An outside `pointerdown` (`document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))`) closes it; a `pointerdown` inside the menu does not.
7. Zoom button, `Fit to window`, the wheel and an arrow-key pan on the root each close the menu; a drag that moves closes it.
8. Arrow keys inside the menu move focus between entries and do NOT change the world transform.
9. `disabled` = true: every entry `aria-disabled="true"`, the note `Not available right now` shows, clicking `Connect` sends nothing. An unlock sequence (`s.unlockSession = {…}` on the state) shows the unlock note and sends nothing.
10. Closing on the turn changing: open a menu, `rerender` with the same state plus `turnCount + 1` → no menu.
11. A node that leaves the layout while open closes the menu: open a menu on a filler that sits in an expanded group, then collapse that group (click the group) → no menu.
12. A group still toggles on click and opens no menu.
13. A burned run (`phase: 'burned'`): clicking a node opens the menu with `No actions available`.
14. The password never appears: give the state an obtained credential that would raise access on the current node, open the current node's menu, choose `Login as …` → confirm view; `container.innerHTML` does not contain the credential's password.
15. Naming guard: with every node discovered and `ARIA_NAME_KNOWN` unset, open the menu on each real node in turn (loop over `[data-node-id]`, click, collect `menu.textContent` and every `aria-label` inside the menu, click again to close) and require that none matches `/\baria\b/i`.
16. Edge placement: with the stubbed 1190×205 pane (see the existing "fits to the real pane size" test for how `clientWidth`/`clientHeight` are stubbed) the open menu's inline `left`/`top` are non-negative and `left + 240 ≤ 1190`, `top + estimated height ≤ 205` or clamped to `0`.

- [ ] **Step 2: Run, expect failure** — `pnpm vitest run src/components/NetworkMap.test.tsx` → type errors / FAIL in the new cases.

- [ ] **Step 3: Implement in `NetworkMap.tsx`**

Sketch (adapt to the file; keep the existing structure and the one intended `eslint-disable`):

```tsx
import { nodeActions, menuLockReason } from '../engine/mapActions';
import { NodeMenu } from './NodeMenu';
import { estimateMenuSize, placeMenu } from '../engine/mapView';

interface Props {
  gameState: GameState;
  onRunCommand: (command: string) => void;
  disabled: boolean;
}

// in MapNode: new props `menuOpen: boolean; onOpen: (id: string) => void`
//   role="button" aria-haspopup="menu" aria-expanded={menuOpen} data-menu-open={String(menuOpen)}
//   onClick={() => { onOpen(n.id); }}
//   onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onOpen(n.id); } }}

// in NetworkMap:
const [menu, setMenu] = useState<{ nodeId: string; turn: number } | null>(null);

const closeMenu = (returnFocus = false) => {
  const id = menu?.nodeId;
  setMenu(null);
  if (returnFocus && id) {
    ref.current?.querySelector<SVGGElement>(`[data-node-id="${id}"]`)?.focus();
  }
};
const openMenu = (id: string) => {
  setMenu(prev => (prev?.nodeId === id ? null : { nodeId: id, turn: gameState.turnCount }));
};
```
- Call `setMenu(null)` (not `closeMenu`) from `zoom`, `fit`, `onWheel`, the keyboard pan branch, and from `onPointerMove` after computing a non-zero `dx`/`dy`.
- Close-on-turn and close-on-vanish, one effect:
  ```tsx
  useEffect(() => {
    if (!menu) return;
    const gone = !(menu.nodeId in layout.positions);
    if (gone || gameState.turnCount !== menu.turn) setMenu(null);
  }, [menu, layout, gameState.turnCount]);
  ```
  (`layout.positions` is a plain record; use the same `Partial<Record<…>>` cast the file already uses if lint requires it.)
- Outside click, effect while `menu` is set:
  ```tsx
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: Event) => {
      if ((e.target as Element).closest('.node-menu, .map-node')) return;
      setMenu(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('pointerdown', onDown); };
  }, [menu]);
  ```
- Render, after the `<svg>` and before the controls:
  ```tsx
  {menu && (() => {
    const p = layout.positions[menu.nodeId];
    if (!p) return null;
    const actions = nodeActions(gameState, menu.nodeId);
    const lockReason = menuLockReason(gameState, disabled);
    const at = placeMenu(
      { x: p.x * view.k + view.x, y: p.y * view.k + view.y },
      estimateMenuSize(actions.length, lockReason !== null),
      boxSize(),
    );
    return (
      <NodeMenu
        key={menu.nodeId}
        actions={actions}
        lockReason={lockReason}
        left={at.left}
        top={at.top}
        onRun={command => { onRunCommand(command); closeMenu(true); }}
        onClose={() => { closeMenu(true); }}
      />
    );
  })()}
  ```
  Prefer extracting that IIFE into a small `renderMenu()` const above the return for readability.
- Pass `menuOpen={menu?.nodeId === item.id}` and `onOpen={openMenu}` to `MapNode`.

CSS (append under the existing `.network-map` rules; palette variables only):

```css
.map-node {
  cursor: pointer;
}
.map-node[data-menu-open='true'] .map-disc {
  stroke: var(--color-system);
  stroke-width: 3;
}

.node-menu {
  position: absolute;
  z-index: 6;
  width: 240px;
  max-height: calc(100% - 8px);
  overflow-y: auto;
  padding: 4px 0;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  font-family: var(--font-mono);
  font-size: var(--font-size-secondary);
}
.node-menu-note,
.node-menu-confirm {
  padding: 4px 8px;
  color: var(--color-system);
}
.node-menu-item {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  align-items: baseline;
  width: 100%;
  padding: 4px 8px;
  border: 0;
  background: transparent;
  color: var(--color-output);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.node-menu-item:hover,
.node-menu-item:focus-visible {
  background: var(--color-border);
  color: var(--color-bg);
  outline: none;
}
.node-menu-item[aria-disabled='true'] {
  color: var(--color-dim);
  cursor: not-allowed;
}
.node-menu-cost {
  color: var(--color-system);
  font-size: 11px;
}
.node-menu-reason {
  flex-basis: 100%;
  color: var(--color-dim);
  font-size: 11px;
}
```
The hover/focus rule must keep a disabled entry readable (use `:not([aria-disabled='true'])` on the hover colour swap if the dim text becomes unreadable on the highlight).

- [ ] **Step 4: Run, expect PASS** — `pnpm vitest run src/components/NetworkMap.test.tsx src/components/NodeMenu.test.tsx`. Fix the component for failures; adjust a test only when it asserts something this task's text does not say (report it).

- [ ] **Step 5: Gate and commit**

Run: `pnpm format && pnpm build && pnpm lint && pnpm vitest run src/components/NetworkMap.test.tsx` (exit 0; `Workspace.tsx` will not compile until Task 4 passes the two new props, so do the one-line wiring below as part of this step to keep the build green).

In `src/components/Workspace.tsx` change `<NetworkMap gameState={gameState} />` to `<NetworkMap gameState={gameState} onRunCommand={onRunCommand} disabled={explorerDisabled} />`.

```bash
git add -A src
git commit -m "feat: click a node on the network map to open its action menu"
```

---

### Task 4: Playthrough, help text, docs

**Files:**
- Modify: `src/components/Workspace.test.tsx` (the NETWORK MAP tab tests use `setup`, which already passes `onRunCommand` and `explorerDisabled={false}`)
- Modify: `src/components/HelpModal.tsx` (the `map` line), and its test only if it asserts the old text
- Modify: `playwright-playthrough.mjs`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `NetworkMap` props (Task 3).

- [ ] **Step 1: Workspace test — the diagram's menu reaches `onRunCommand`**

In `Workspace.test.tsx`'s NETWORK MAP describe add: with the NETWORK MAP tab selected, discover a neighbour of the current node in the state passed to `setup`, click its `[data-node-id]`, click the `Connect` menuitem → `onRunCommand` (the `setup` mock) was called once with `connect <ip>`. And: with `explorerDisabled: true` the same `Connect` menuitem is `aria-disabled="true"` and nothing is sent. Run `pnpm vitest run src/components/Workspace.test.tsx` (red first if you write it before the wiring in Task 3 step 5 — it is already wired, so the new test should pass immediately; that is acceptable here, say so in your report).

- [ ] **Step 2: Help text**

`HelpModal.tsx:39`: change to `'  map           -open the network map (click a node)'` keeping the column layout of the neighbouring lines.

- [ ] **Step 3: Playthrough — move and scan through the diagram**

Read `playwright-playthrough.mjs` (helpers `cmd`, `type`, `paneText`, `inputReady`, `check`, `phase`). Add a helper next to `cmd`:

```js
// Click a node on the NETWORK MAP, then one of its menu entries (and confirm when asked), the way
// a mouse player would. Returns to the DOC tab afterwards.
const viaMap = async (nodePattern, entry, { confirm = false } = {}) => {
  await page.getByRole('button', { name: 'NETWORK MAP', exact: true }).click();
  const map = page.locator('[data-testid="network-map"]');
  await map.getByRole('button', { name: nodePattern }).first().click();
  const menu = page.locator('.node-menu');
  await menu.getByRole('menuitem', { name: entry }).click();
  if (confirm) await menu.getByRole('menuitem', { name: 'Run', exact: true }).click();
  await page.waitForTimeout(PAUSE);
  await inputReady();
  await page.getByRole('button', { name: 'DOC', exact: true }).click();
};
```
Use it twice at "LAYER 0: entry", replacing the typed lines:
- `await cmd('connect 10.0.0.2');` → `await viaMap(/10\.0\.0\.2/, /^Connect/);`, then `check('the diagram moved us to the gateway', …)` verifying that the node whose accessible name contains `10.0.0.2` now has `data-current="true"` (read it with `page.locator('[data-node-id][data-current="true"]')` and its `aria-label`), and that the terminal echoed `connect 10.0.0.2` (inspect `paneText('term')` to see how an echoed command is rendered, and assert on exactly that).
- The bare `await cmd('scan');` right after the following `login` → `await viaMap(/10\.0\.0\.2/, /^Scan subnet/, { confirm: true });` plus a `check` that the scan output reached the terminal (the terminal text grew and shows the echoed `scan`). Also add one negative check: before the confirm click the terminal has NOT grown (open the menu, choose `Scan subnet`, assert `Run` is visible and the terminal text is unchanged, then click `Run`). Implement that as an inline sequence if the helper cannot express it.

If a node cannot be clicked in the default `hunt` layout because the doc pane is too short to show it, zoom the doc pane for the click (focus it with `Alt+3`, `Alt+Z`, and undo with `Alt+Z` afterwards) rather than forcing clicks; note in the report what you had to do. Keep every later step as it was.

Run it: start your own dev server on a free port (note the PID; stop only that PID; never `pkill`), `pnpm playthrough --headless --url=http://localhost:<port>`. Expected: exit 0, all checks PASS including the new ones. Also take one screenshot of the open menu in the NETWORK MAP tab (scratchpad dir), look at it, and describe it honestly (menu beside the node, readable, inside the pane).

- [ ] **Step 4: Documentation**

`CLAUDE.md`: extend the **Network map** paragraph: clicking a real node opens `NodeMenu` (entries from `nodeActions`, free ones run on the first click, costly ones show an inline `Run / Cancel`; `Esc`, an outside click, zoom/pan or a new turn closes it; all entries are inert with a note while a command is running or an unlock sequence is pending, `menuLockReason`); every entry runs through `onRunCommand`, so the terminal echoes it; the effects are part 4. Update the "Node actions" paragraph's last clause if it still says the UI is future work.

- [ ] **Step 5: Whole gate and commit**

Run: `pnpm format && pnpm build && pnpm lint && pnpm test:coverage && pnpm knip` (knip: only the 13 baseline findings and 1 hint).

```bash
git add -A src CLAUDE.md playwright-playthrough.mjs
git commit -m "feat: move and scan through the network map in the playthrough"
```
Do not commit playthrough artifacts (`git status` first).
