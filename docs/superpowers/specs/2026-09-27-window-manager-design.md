# Window Manager (Sub-project 1 of the cybernetic UI overhaul)

## Context

The player asked for a more polished, "cybernetic" UI — specifically a multi-windowed
interface similar to a modern desktop OS, rather than the current single fixed
terminal with at-most-one centered modal on top.

**Current state:**
- `App.tsx` renders a single fixed-layout `<Terminal>` (header → scrolling output →
  suggestion bar → input) filling the viewport during the `playing`/`aria` phases.
- Four overlay dialogs (`MapModal`, `NotesModal`, `HelpModal`, `BriefingModal`) each
  wrap `DosModal` — a single, centered, non-draggable ASCII-bordered box
  (`position: fixed; inset: 0`, dead-centered, `z-index: 100`). Only one is ever shown
  at a time in practice; `App.tsx` tracks each with its own boolean
  (`mapOpen`, `notesOpen`, `helpOpen`, `briefingOpen`) and refocuses the terminal
  `<input>` whenever all four are closed.
- Their *content* is fixed-width ASCII box art: a `boxRow(IW, text)` helper pads text
  to an inner width (`IW = 58`) and wraps it in `║...║` pipes, matching the DosModal
  border's `╔══...══╗` characters exactly.
- The color/theme system (`engine/themes.ts`) already supports 4 selectable palettes
  (classic/green/amber/slate) via `.theme-*` classes on `<html>`, persisted to its own
  `localStorage` key (`irongate_theme`) — independent of the versioned game save
  (`persistence.ts`, `SAVE_KEY = 'irongate_save'`, `SAVE_VERSION = 6`).

**Decisions made during brainstorming:**
- Interaction model: **true floating windows** — draggable, resizable, overlapping,
  with focus/z-order — not a fixed docked-panel layout.
- Window scope: Terminal (anchor) + Map + Notes + Help + Briefing (migrated) + a new
  **Dossier/status** panel.
- Persistence: window layout (position/size/open/minimized) persists across reloads,
  via its own `localStorage` key — same pattern as `themes.ts`, not folded into the
  versioned `GameState` save.
- Terminal is a fixed anchor: it cannot be closed or minimized, but it can be moved
  and resized like any other window.
- A taskbar/dock is included, for reopening closed windows and restoring minimized
  ones without needing to retype a command.
- Visual skin: **sleek-minimal** — flat dark panels, thin cool-gray borders, a subtle
  accent color per window kind, no glow/blur effects. Chosen first among three
  options (neon-glass, retro-glow, sleek-minimal) shown via mockup; more skins may be
  added later as alternates, following the same pattern as the existing color themes.

**Scope split (why this spec covers only "sub-project 1"):**
Migrating the *content* of Map/Notes/Help/Briefing away from ASCII box art to real
HTML/CSS layouts matching the sleek-minimal skin is substantial, independent work.
This spec covers only the window-manager mechanism itself: the four existing modals
get wrapped in the new chrome **as-is** (their ASCII content will visibly clash with
the flat modern frame — a known, deliberate, temporary seam). The new Dossier panel
is built directly in the sleek-minimal style since it has no legacy content to carry
over. Content modernization for the four migrated modals is a separate follow-up
spec (sub-project 2), out of scope here.

**Explicitly out of scope for this spec:**
- Rewriting Map/Notes/Help/Briefing's internal content/layout (sub-project 2).
- Mobile/narrow-screen support — the app has no `@media` queries anywhere today;
  this spec doesn't add any either. Floating windows assume a desktop-sized viewport.
- Additional visual skins (neon-glass, retro-glow) beyond sleek-minimal.
- Any new panels beyond Dossier (a camera-feed viewer was considered and deferred).

## Architecture

Window layout (position, size, z-order, open/minimized) is **UI-only state** — it has
no bearing on game logic or win/loss conditions, so it lives outside `GameState` and
outside the versioned save entirely. A new `Desktop` component owns this state and
renders one `<Window>` per instance plus a `<Taskbar>`. `App.tsx` keeps all of its
existing game logic (`handleSubmit`, command resolution, etc.) unchanged; the only
change at the App level is that the four `if (raw.trim().toLowerCase() === 'map')`-style
branches (and a new `dossier` branch) call into the window manager instead of setting
a one-off boolean, and the fixed `<Terminal>` + modal JSX block at the bottom of
`App.tsx`'s render is replaced by `<Desktop ... />`.

```
App.tsx (unchanged game logic)
  └─ Desktop.tsx (new — owns WindowManagerState, loads/saves layout)
       ├─ Window.tsx × N (terminal, map, notes, help, briefing, dossier)
       │    └─ existing modal content (MapModal/NotesModal/HelpModal/BriefingModal
       │         content, DosModal chrome removed) or DossierWindow content
       └─ Taskbar.tsx
```

## Components

### `src/engine/windowManager.ts` (new)

Pure, DOM-free state module.

```ts
export type WindowKind = 'terminal' | 'map' | 'notes' | 'help' | 'briefing' | 'dossier';

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

export const DEFAULT_LAYOUT: WindowManagerState; // cascaded default positions/sizes

export const openWindow = (state, kind): WindowManagerState;   // open: true, minimized: false, focus it
export const closeWindow = (state, kind): WindowManagerState;  // no-op for 'terminal'
export const minimizeWindow = (state, kind): WindowManagerState; // no-op for 'terminal'
export const restoreWindow = (state, kind): WindowManagerState;
export const focusWindow = (state, kind): WindowManagerState;  // raises zIndex above all others
export const moveWindow = (state, kind, x, y, viewport): WindowManagerState;   // clamps
export const resizeWindow = (state, kind, width, height, viewport): WindowManagerState; // clamps, enforces min size
export const clampToViewport = (instance, viewport): WindowInstance;
```

Invariants enforced inside the reducer functions themselves (not by callers
remembering to check):
- `terminal.open` is always `true`; `terminal.minimized` is always `false`.
  `closeWindow`/`minimizeWindow` return `state` unchanged when called with
  `kind: 'terminal'`.
- Every returned state has exactly one window with the highest `zIndex` equal to the
  most recently focused window.
- Position/size are always clamped into `[0, viewport]` bounds by every function that
  can change them (`moveWindow`, `resizeWindow`, and the initial load path) — see
  Error Handling below.

### `src/engine/windowLayoutPersistence.ts` (new)

```ts
const WINDOW_LAYOUT_KEY = 'irongate_windows';
const WINDOW_LAYOUT_VERSION = 1;

export const saveWindowLayout = (state: WindowManagerState): void;
export const loadWindowLayout = (viewport: { width: number; height: number }): WindowManagerState;
```

`loadWindowLayout` returns `DEFAULT_LAYOUT` (re-clamped to the given viewport) on any
of: missing key, JSON parse failure, version mismatch, or shape validation failure —
mirroring the defensive fallback pattern already used in `persistence.ts`. Every
loaded instance is re-clamped to the *current* viewport size, so a layout saved at a
larger window size never leaves a window unreachable after a resize.

### `src/components/Window.tsx` (new)

```ts
interface Props {
  instance: WindowInstance;
  title: string;
  accentColor?: string; // per-kind accent per the sleek-minimal skin
  closable: boolean; // false for terminal
  minimizable: boolean; // false for terminal
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  onMinimize: () => void;
  onClose: () => void;
  children: ReactNode;
}
```

Renders the sleek-minimal chrome: a title bar (drag handle via `pointerdown` on the
bar → `pointermove`/`pointerup` on `window`, not the element, so the drag continues
even if the cursor leaves the title bar) with minimize/close buttons (omitted per
`closable`/`minimizable`), a body (`children`, scrollable), and a bottom-right resize
handle using the same pointer-event pattern. Clicking anywhere on the window (title
bar, body, resize handle) calls `onFocus` first.

A minimized window renders nothing on the desktop at all — no collapsed title bar
floating in place. `Desktop` simply skips rendering any `<Window>` whose `minimized`
is `true`; its `Taskbar` entry is the only remaining affordance to restore it (matches
how minimizing works in real desktop OSes: the window disappears from the desktop
entirely, not just its content).

### `src/components/Desktop.tsx` (new)

Owns `WindowManagerState` (initialized from `loadWindowLayout`), debounced-persists
on every change via `saveWindowLayout`, and exposes an imperative-ish API up to
`App.tsx` — a small object of callbacks (e.g. `openDesktopWindow(kind)`, distinct in
name from the pure `openWindow` reducer it wraps) or a ref exposing equivalent
methods; the exact shape is an implementation detail for the planning phase. Renders:
- The desktop background (sleek-minimal skin, plain dark background — no image asset).
- One `<Window>` per non-minimized instance where `open` is true, sorted by `zIndex`
  so DOM order matches paint order for correct stacking without relying solely on
  the CSS `z-index` property (belt-and-suspenders — `z-index` is still set explicitly
  too).
- `<Taskbar>` pinned to the bottom, always visible.

Also owns the "which window is focused" concept (derived: the instance with the
highest `zIndex` among `open && !minimized` windows) and passes
`isTerminalFocused: boolean` down so `App.tsx`/`Terminal.tsx` know whether to
autofocus the HTML `<input>`.

### `src/components/Taskbar.tsx` (new)

One entry per `WindowKind`, in a fixed order (terminal always first, non-removable).
Click behavior: closed → open; minimized → restore + focus; open-and-focused → no-op
(clicking its own taskbar entry doesn't minimize it — only the window's own minimize
button does that, avoiding an accidental-toggle footgun). Visually distinguishes the
three states (open/focused, open/minimized, closed) via the sleek-minimal accent
color at reduced opacity for non-focused states.

### `src/components/DossierWindow.tsx` (new)

Built directly against the sleek-minimal skin — ordinary HTML/CSS (flex/grid layout,
no `boxRow` ASCII padding). Content: whatever `loadDossier()` currently returns
(reuses the existing `Dossier` type from `src/types/dossier.ts` and the
`loadDossier` function already imported in `App.tsx` — no engine changes needed).
Opened via a new `dossier` local command, following the exact same pattern as the
existing `map`/`notes`/`help`/`briefing` special-cased branches in `App.tsx`'s submit
handler (and the corresponding `case 'dossier':` no-op in `commands.ts`'s local
command switch, matching `case 'map':` etc.).

### Existing modal migration (chrome only, this sub-project)

`MapModal`, `NotesModal`, `HelpModal`, `BriefingModal` keep their existing content
logic (the ASCII `boxRow` calls, the `IW = 58` fixed width, all of it) — this sub-project
does **not** touch their internals. Only their outer wrapper changes: each currently
does `return <DosModal title={...} innerWidth={IW} onClose={onClose}>{...}</DosModal>`;
this becomes `return <Window instance={...} title={...} ...>{...}</Window>`. `DosModal`
itself is deleted once nothing references it (confirmed via `knip`/grep before removal).

## Data flow

1. Player types `map` (or `notes`/`help`/`briefing`/`dossier`) → the existing
   special-cased branch in `App.tsx`'s submit handler fires (same location as today)
   → calls `Desktop`'s exposed open handler for that kind instead of `setMapOpen(true)`,
   which internally applies the pure `openWindow(state, 'map')` reducer.
2. `Desktop` re-renders: the `map` instance now has `open: true`, top `zIndex` →
   `<Window kind="map">` mounts, showing `MapModal`'s content inside the new chrome.
3. Dragging the title bar: `pointerdown` on the bar records the offset; `pointermove`
   (attached to `window`, removed on `pointerup`) calls `onMove` with clamped
   coordinates on every frame; `Desktop` updates state and schedules a debounced
   `saveWindowLayout`.
4. Resize: same pattern via the corner handle, calling `onResize`.
5. Clicking any window (or its taskbar entry) → `onFocus` → that window's `zIndex`
   becomes `max(all zIndexes) + 1`.
6. Terminal's `<input>` autofocus effect changes from "focus when all 4 modal booleans
   are false" to "focus when `isTerminalFocused` is true" (i.e. terminal has the
   highest z-index among open, non-minimized windows) — clicking the Terminal body
   still calls `.focus()` directly via the existing `onClick` handler in `Terminal.tsx`,
   unchanged.
7. On mount, `Desktop` calls `loadWindowLayout(currentViewportSize)` once; on every
   window resize event, all instances are re-clamped (not persisted immediately —
   only user-initiated moves/resizes trigger a save, to avoid save-storms from window
   resizing).

## Error handling

- **Off-screen windows:** `moveWindow`/`resizeWindow` clamp so at least the title bar
  (and a minimum draggable margin) stays within the current viewport. Applied on every
  move/resize call, not just at creation.
- **Stale layout from a larger viewport:** `loadWindowLayout` re-clamps every instance
  against the *current* viewport immediately after loading, before the first render.
- **Corrupt/missing localStorage:** any parse/shape failure in `loadWindowLayout` logs
  nothing user-facing (consistent with `persistence.ts`'s silent fallback) and returns
  `DEFAULT_LAYOUT`.
- **Terminal window integrity:** `openWindow`/`closeWindow`/`minimizeWindow` treat
  `kind: 'terminal'` as a protected case at the reducer level (not just "don't call
  these UI actions on it") — even a corrupted layout blob that somehow marks
  `terminal.open: false` is corrected back to `true` inside `loadWindowLayout`'s
  post-load normalization step, so the player's only input surface can never
  disappear because of a bad localStorage value.

## Testing

- `windowManager.test.ts` — unit tests for every exported function: open/close/
  minimize/restore/focus/move/resize, viewport clamping at each edge, terminal
  protection invariants (attempting to close/minimize terminal is a no-op), z-order
  correctness after repeated focus calls. No DOM.
- `windowLayoutPersistence.test.ts` — save → load round-trip; missing key; corrupt
  JSON; version mismatch; viewport-mismatch re-clamping — same shape as the existing
  `persistence.test.ts` suite.
- `Window.test.tsx` (RTL) — simulated `pointerdown`/`pointermove`/`pointerup`
  sequences verify `onMove`/`onResize` are called with expected values; minimize/close
  buttons call their callbacks; `closable`/`minimizable` false hides those buttons;
  clicking anywhere calls `onFocus`.
- `Desktop.test.tsx` (RTL) — opening a window via a simulated command renders it;
  focusing changes z-order; minimizing hides the window but keeps its taskbar entry;
  closing a non-terminal window removes it from the desktop; terminal cannot be
  closed/minimized via any path exercised in the test.
- `Taskbar.test.tsx` (RTL) — click behavior for each of the three visual states.
- Existing `MapModal.test.tsx`/`NotesModal.test.tsx`/`HelpModal.test.tsx`/
  `BriefingModal.test.tsx` — expected to need only prop/wrapper updates (swapping
  `DosModal` for `Window` in whatever test setup renders them), not new test cases,
  since their content-generation logic is untouched in this sub-project.
- Target ≥90% coverage on all new files, consistent with this repo's feature-work
  convention; the existing 75%-per-file CI threshold is a floor, not the target.
