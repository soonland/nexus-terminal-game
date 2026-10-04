# Tiled "Surveillance Room" UI — Design

## Purpose

Replace the floating-window desktop with a tmux-style tiled layout. The in-game screen should
feel like the pre-game screens (welcome, prologue, uplink) — claustrophobic, terminal-native —
instead of a generic desktop app. A persistent comms pane lets Sentinel and Aria feel like
presences, and a scripted Nexus line fills that pane until they speak, so the pane itself never
gives the twist away (see `docs/story-bible.md` §1b).

Baseline: screenshots taken 2026-10-03 showed a small 640×420 terminal floating over a photo
wallpaper, mixed fonts and palettes inside one window, a clipped ASCII banner, overlapping
cascaded windows, and no visible presence for Sentinel or Aria.

## Decisions (agreed)

| Question | Decision |
| --- | --- |
| Overall feel | Surveillance-room multi-pane, tmux-style tiling. |
| Layout control | **Approach A — hybrid split tree**: a small tree of splits, draggable dividers, zoom, presets. Players cannot create or close panes. |
| Keyboard scope (v1) | Simple shortcuts only: `Alt+1…5` focus, `Alt+Z` zoom, `Alt+P` cycle presets. No tmux prefix-key scheme. |
| Where the player types when a channel opens | **(a)** COMMS has its own input and takes focus; TERM stays live behind it; `Esc` returns to TERM. |
| COMMS before Sentinel/Aria speak | Scripted, **receive-only** Nexus line ("encrypted line"), filler only. |
| Delivery | Three PRs (below). |

## Out of scope

- Creating, closing, or re-assigning panes; a full tmux key prefix scheme.
- Two-way or AI-driven Nexus messages (the handler Odessa Rhee never answers in v1).
- Narrative changes: the lore pass, the name reveal and prompt gating are tracked in #211–#219.
  This spec only reserves the UI surface for them.
- New themes. The existing theme system (classic / green / amber) keeps working.

## Architecture

### Layout engine (`src/layout/`, replaces `src/engine/windowManager.ts`)

```ts
type PaneId = 'term' | 'files' | 'doc' | 'aux' | 'comms';

type LayoutNode =
  | { kind: 'pane'; pane: PaneId }
  | { kind: 'split'; dir: 'row' | 'col'; ratio: number; a: LayoutNode; b: LayoutNode };

interface LayoutState {
  preset: PresetId;            // 'hunt' | 'analyze' | 'watch'
  trees: Record<PresetId, LayoutNode>; // per-preset trees; ratios are player-adjustable
  focused: PaneId;
  zoomed: PaneId | null;
}
```

- Pure functions (no React): `setRatio(tree, path, ratio)` (clamped so no pane falls below a
  minimum width/height), `cyclePreset`, `focusPane`, `toggleZoom`, `resetPreset`.
- `LayoutRoot` renders the tree recursively with CSS flex; a `Divider` component handles pointer
  drags and keyboard nudges (arrow keys when focused). Zoom renders only the zoomed leaf.
- Presets are constant trees in `presets.ts`. All three contain all five panes:
  - `hunt`: TERM large on the left; FILES + AUX stacked right; DOC under TERM; COMMS right edge.
  - `analyze`: FILES + DOC dominant; TERM and COMMS smaller.
  - `watch`: COMMS and AUX (map) dominant; TERM medium.
- Persistence: own `localStorage` key `irongate_layout`, versioned and validated on load (same
  pattern as the old `irongate_windows` and `irongate_theme`; corrupt or unknown data falls back to
  defaults). The old `irongate_windows` key is ignored and may be removed.
- Narrow screens: below a width threshold (default 900px) the tree is ignored and one pane shows
  at a time with a tab strip; `Alt+1…5` still switches. Zoom is a no-op there.

### Panes

| # | Pane | Content |
| - | --- | --- |
| 1 | `term` | The existing `Terminal` (header, output, suggestion bar, input). Header's trace readout moves to COMMS (see below); node IP stays. |
| 2 | `files` | The explorer **tree** (from today's `ExplorerWindow`): node root and Local root, badges, read marks. Selecting a file selects it in DOC. |
| 3 | `doc` | The explorer **detail and viewer** split out: metadata, tripwire warning, Open and Exfil, content (gated on `filesRead`). Becomes the home for document formatting from the lore pass. |
| 4 | `aux` | Tabs: **MAP** and **NOTES** (existing `MapModal` / `NotesModal` contents). |
| 5 | `comms` | Tabs described below, with the trace meter along the top edge. |

`ExplorerWindow` is refactored into `FilesPane` and `DocPane` that share selection through a small
`useExplorerSelection` state in the layout root (selection is UI state, not game state). The
behaviour pinned by the explorer's tests carries over unchanged: commands still go through
`handleSubmit` (full-path `cat`, `cat local:<path>`, `exfil <path>`), the viewer only shows
content for files in `filesRead`, and actions are disabled while input is.

### Overlays

Help, Briefing and Dossier become centered modal overlays (`Overlay` component, focus trap,
`Esc` closes), opened by the same commands (`help`, `briefing`, `dossier`). They are reference
screens, not workspaces. Their contents are unchanged.

### Chrome and status bar

- Each pane has a 1px border and a title in the tmux style, e.g. `1:term`, `2:files`; the focused
  pane's border uses the accent colour. Titles show the shortcut number.
- A one-line status bar at the bottom: `[preset]  1:term* 2:files 3:doc 4:aux 5:comms   <node ip>  TRC nn%`
  (focus marker `*`, zoom marker `Z`). Trace colour comes from the existing `getTraceLevel`.
- Style: one palette and one monospace font family across panes (`var(--font-mono)` throughout,
  no `system-ui` title bars), using the existing CSS custom properties so all themes work.
  The photo wallpaper stays on pre-game screens only. The final look (phosphor, flat, glow) is
  tuned in PR 3 with screenshots; PRs 1–2 use flat dark panes.

### Shortcuts and input routing

- Global key handler (capture phase) for `Alt+1…5`, `Alt+Z`, `Alt+P` and `Esc` (leave COMMS /
  close overlay). It ignores events while an overlay is open except `Esc`.
- Focus follows pane: focusing `term` focuses the terminal input; focusing `comms` focuses its
  input when the channel accepts input. No pane steals keystrokes from another pane's input.
- Existing commands keep working and also drive the layout: `map` and `notes` select the AUX tab
  and focus AUX; `explorer`/`files` focus FILES.

### COMMS pane

Tabs are data, not hard-coded UI: `ChannelId = 'nexus' | 'sentinel' | 'aria'`.

- **NEXUS** exists from the start and is the only visible tab until another channel opens.
  A pane with one tab hides its tab strip's second slot; the tab list reveals nothing.
- **SENTINEL** and **ARIA** tabs appear only when those channels first open. Opening a channel
  focuses COMMS and its input (decision **(a)**); `Esc` returns focus to TERM and TERM stays
  live (commands can be run while the channel is open).
- **Sentinel interrupt:** when Sentinel first opens a channel, COMMS plays an interruption on
  the NEXUS tab (a short flicker, last Nexus line breaking off mid-sentence), then switches to the
  SENTINEL tab with a red pane border. NEXUS goes quiet afterwards. Reduced-motion users get no
  flicker, just the cut line.
- **Engine change:** the `dm` app phase and the full-screen `body.dm-sentinel` re-skin are removed.
  The phase value stays only if needed to route input; the red appearance becomes a pane-border
  class on COMMS. Sentinel traffic still posts to `/api/sentinel` and `exit`/`quit` still close the
  channel (and the tab stays, closed state shown).
- **Aria:** `msg aria <message>` still works from TERM. Her reply lines go to the ARIA tab in
  COMMS (not TERM), and the tab appears at the first exchange. TERM only echoes the command.
  (The name appears only according to the naming rule, #212/#213.)
- **Trace meter:** a thin bar along COMMS's top edge replaces the readout in the terminal
  header; the status bar repeats the number.

### Nexus line (scripted, receive-only)

- Messages live in `src/data/nexusMessages.ts`: `{ id, trigger, lines[] }` in Odessa Rhee's voice
  (see bible §5/§6). They obey the naming rule: never "Aria"; CASSANDRA only if bible-approved.
- Triggers evaluated after each command: `mission_start`, `trace_31`, `trace_61`, `trace_86`,
  `first_exfil`, `layer_3`, `layer_4`. Each fires once.
- "Already sent" is stored in the existing `flags` map as `NEXUS_MSG_<id>` (already persisted
  in saves; no `SAVE_VERSION` change).
- The NEXUS tab's input shows `[ENCRYPTED LINE — RECEIVE ONLY]` and is disabled.
- New messages while COMMS is not focused show an unread marker on the pane title.

## State and persistence summary

| Data | Where | Persisted |
| --- | --- | --- |
| Layout tree, preset, ratios | `LayoutState` (React state) | `irongate_layout` (own key) |
| Focus, zoom | `LayoutState` | not persisted |
| Explorer selection | `useExplorerSelection` | not persisted |
| Nexus message "sent" markers | `GameState.flags['NEXUS_MSG_*']` | yes (existing flags) |
| Channel tabs (which exist) | derived: `sentinel.channelEstablished`, Aria message history | derived from saved game state |

No change to `SAVE_VERSION`.

## Retired and kept

- **Retired:** `Window`, `Taskbar`, `Desktop`, `windowManager.ts`, `windowLayoutPersistence.ts`,
  maximize/restore logic, their tests, the `body.dm-sentinel` class and the `dm` phase UI.
- **Kept / reused:** `Terminal` (and its input/suggestion components), explorer logic and tests
  (re-homed in FILES/DOC), `MapModal`/`NotesModal`/`HelpModal`/`BriefingModal`/`DossierWindow`
  contents, theme system, `getTraceLevel`.

## Interaction with the narrative issues

- **#212 (naming audit):** help text and any pre-reveal "aria" strings (`msg aria`, dossier
  heading) are audited there; this spec only moves where Aria's replies render.
- **#213 / #217:** COMMS is the surface those issues' prompt gating and tiers write into; no
  new API surfaces are added here.
- **Nexus messages** are new authored content and must pass the #212 guard test.

## Testing

- `layout` unit tests (pure): `setRatio` clamping, `cyclePreset`, `toggleZoom`, `focusPane`,
  persistence round-trip, corrupt/old/unknown-version data fallback, presets all contain the five
  panes exactly once.
- Component tests: `LayoutRoot` renders every preset; divider drag and arrow-key nudges update the
  ratio; zoom shows only the zoomed pane; narrow-width fallback renders tabs.
- Shortcut tests: `Alt+1…5`, `Alt+Z`, `Alt+P`, `Esc`; no action while typing a normal command; no
  action while an overlay is open except `Esc`.
- FILES/DOC tests: carried over from `ExplorerWindow.test.tsx` (full-path commands, unread
  placeholder, local files, vanished-selection, disabled states) plus selection sharing.
- COMMS tests: single NEXUS tab at start; SENTINEL tab appears only after channel open; interrupt
  sequence; `Esc` returns focus; Aria replies go to ARIA tab; red border class only for SENTINEL.
- Nexus tests: each trigger fires once and is persisted; a save/load does not re-fire; text passes
  the naming guard.
- Manual: screenshot pass (Playwright script like the 2026-10-03 baseline) for each preset,
  zoom, narrow width, and a Sentinel-open sequence.
- Coverage stays at or above the 75% per-file threshold; `pnpm knip` clean (old files removed).

## Delivery

1. **PR 1 — layout engine and panes.** Layout engine, five panes, status bar, shortcuts, overlays,
   narrow fallback; retire the window manager. COMMS exists with the NEXUS tab only and no scripted
   messages yet (a static "line open" placeholder).
2. **PR 2 — COMMS channels.** Sentinel/Aria tabs, input routing and focus, interrupt, removal of
   the `dm` takeover and `dm-sentinel` class, Aria reply routing.
3. **PR 3 — Nexus line and polish.** Scripted messages and triggers, unread markers, final visual
   tuning from screenshots.

## Risks

- **Input routing regressions:** keystrokes going to the wrong pane. Mitigated by one global key
  handler, per-pane inputs, and shortcut tests that type ordinary commands.
- **Replacing a recent system:** the window manager and maximize work are retired. Their tests go
  with them; the explorer's behaviour is preserved by carrying its tests over.
- **`dm` removal touches App.tsx's phase machine** (login, burned, ending, contract screens all
  switch on `appPhase`). PR 2 must keep those transitions intact; covered by existing App-level
  behaviour tests and the screenshot pass.
- **Small screens:** the tile layout is dense; the narrow fallback is mandatory in PR 1, not later.

## PR 3 delivered (#229)

Plan: `docs/superpowers/plans/2026-10-03-tiled-ui-pr3.md`. Rulings made while building it:

- Nexus messages are derived state in definition order (flags carry no sequence); `mission_start`
  is always received; thresholds latch so a burn never repeats or removes a message; the layer
  messages fire from the current node's layer.
- The ARIA tab is read-only and rebuilt from the saved conversation; her reply is
  `CommandOutput.ariaReply` and a favor offer's prompt stays in the terminal. The first reply
  prints a one-line pointer in the terminal.
- Unread: a resumed run starts read, a new run starts with the opening message unread.
- The terminal header lost its trace readout (the meter replaces it) and now uses the flat pane
  title colours.

## Open questions

- Exact default pane ratios per preset, and the narrow-width threshold (900px proposed) — settled
  in PR 1 with screenshots.
- Final visual tuning (phosphor glow vs flat) — PR 3.
- Whether the closed SENTINEL tab should remain visible after `exit`: **yes, dimmed** (resolved in PR 2, kept in PR 3).
