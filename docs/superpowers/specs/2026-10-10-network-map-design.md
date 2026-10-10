# Network map — design

An interactive network diagram: the mouse front end for the commands a player already types.

## Intent

The map today is a text list of discovered nodes grouped by level. It shows what has been found, not how it connects, and it cannot be acted on. The player wants a **network diagram whose main job is mouse control**: click a node to connect, scan, log in, exploit and so on, the GUI side of the same command lines, while the graph itself makes the network feel like a living place that grows as it is explored.

Success: a player can travel and probe the network with the mouse alone; every click is exactly a command they could have typed (the terminal echoes and prints it as usual, costs and rules unchanged); the diagram never shows more than `scan` has told them; and nothing moves under the cursor while they aim.

## Decisions

- **Placement:** a new tab in the **doc pane**, `DOC | MAIL | NETWORK MAP` (the doc pane is the wide one). No new pane, no preset changes, no new shortcut, no change to the saved layout.
- **Old map:** the aux pane's MAP tab is renamed **NETWORK LIST** (same text list, now the keyboard-friendly fallback). The `map` command selects the NETWORK MAP tab.
- **Style:** a 2D graphical topology in SVG, not 3D and not a graph library. Fixed layered layout, left to right. No new dependency.
- **Interaction:** clicking a node opens an action menu beside it, listing only the actions valid right now with their costs.
- **Actions:** Connect, Scan (host and subnet), Disconnect, Exploit (per scanned vulnerable service), Login (per held credential), and the one-shot tools (Wipe logs, Spoof).
- **Mis-click guard:** anything that costs something (scan, exploit, wipe logs, spoof) asks for a second click. Connect, login and disconnect run on the first click.
- **No new game rules and no new commands.** Every click runs an existing command string through the existing path.

## Placement and navigation

- The doc pane header tab strip gains `NETWORK MAP` (the strip already holds `DOC` and `MAIL`).
- `WorkspaceHandle` gains `showNetworkMap()`: selects the tab and focuses the doc pane only when it is off screen (the rule `showMail` follows). The `map` command (intercepted in `App.tsx` today) calls it.
- Selecting a file in the explorer, or opening a casebook or mail source, flips the doc pane to DOC, as for MAIL. The map is hidden while the player reads; the commands they click still run in the terminal and the doc pane stays on the map while they do.
- `Alt+Z` zooms the doc pane, which gives the diagram the whole window. The diagram also has `+`, `−` and `fit` controls.
- Aux tab ids change from `map` to `list` (label `NETWORK LIST`); `AuxTab`, `availableAuxTabs`, `resolveAuxTab`, their tests and the `showAux('map')` call sites follow.

## The diagram

**What is drawn.** Every `discovered` node (always including the current node), and a link for each `connections` pair whose **both** ends are discovered, drawn once. No placeholder nodes, no dangling links: the map shows no more than the terminal's `scan` has revealed, and the number of undiscovered nodes stays hidden.

**Layout (deterministic, left to right).**

- One column per level (L0 to L5), only for levels with discovered nodes, with a header (`L2 SECURITY`; layer 5 reads `CASSANDRA` until `ARIA_NAME_KNOWN`, using the existing label table).
- Within a column: anchors in their authored order, then fillers by id. A node's position is a function of that order only, so nothing moves on a turn; positions shift only when a new node is discovered, never while the player aims.
- If the diagram is taller or wider than the pane the player pans and zooms; `fit` shows everything.

**Filler grouping.** When 3 or more filler nodes of the same template sit in one column they collapse into one `+N <template>` group node; clicking it expands the members inline. A node is never hidden in a group if it is the current node, the player holds access on it (`accessLevel !== 'none'`), it is compromised, or `sentinelPatched`. Expanded groups are kept in component state and `sessionStorage` (validated, in try/catch, per viewer, never in the game save), like the old level toggles.

**Node look.** A glyph per template (workstation, database server, file server, web server, security node, mail server, IoT device, router/switch, printer, dev server), with name and IP beneath. State: current node a pulsing ring; access level a small badge (user, admin, root); compromised lit with `!`; Sentinel-patched a hatched border; locked a lock glyph. Links are dim by default, brighter when they touch the current node, dashed when they lead to a patched node. Colours come from the existing palette variables.

**Navigation.** Drag the background to pan, wheel or buttons to zoom. The view re-centres on the current node when the player moves to one that is out of view. Keyboard: `Tab` steps through nodes (column order), `Enter` opens a node's menu, `Esc` closes it, arrows pan. Each node is a focusable element with an accessible name (label, IP, state).

**Immersion effects, derived from state.** A pure `diffMap(prev, next)` turns two game states into events (node discovered, current node changed, node compromised, node patched). The effects are CSS/SVG: new nodes fade in; a packet runs along the route on `connect`; a ripple leaves the current node on `scan`; an exploit flashes the target; a Sentinel patch makes the node flicker, then settle into the hatched look. All of it is off under `prefers-reduced-motion`. No engine change is needed for effects.

## The node menu

Entries, by node:

- **A node the player is not on:**
  - `Connect` → `connect <ip>`. Enabled when `connect` would succeed: a route from the current node (`connections`), or a session already held there (the pivot rule). Otherwise disabled with the reason ("no route from here", "locked").
  - `Scan` → `scan <ip>`.
- **The current node:**
  - `Scan host` → `scan <ip>`; `Scan subnet` → `scan`.
  - `Login as <user>` → `login <user> <password>`, one entry per credential with `obtained && !revoked`, valid on this node (`validOnNodes`) and granting more access than the player has here. The command line echoes in the terminal as typed commands do, so the password appears in the transcript exactly as when typed.
  - `Exploit <service>` → `exploit <service>`, one entry per service on a **scanned** node with `vulnerable && !patched`. On an unscanned host the menu says "Scan this host to find services". Disabled, with the reason, without the exploit kit or with too few charges.
  - `Disconnect` (labelled "Back to `<previous node>`") → `disconnect`, when there is a previous node.
  - `Wipe logs` → `wipe-logs` and `Spoof` → `spoof`, only when the player holds the tool and it is unused.

Costs and confirmation:

- Every costed entry shows its price before the click: scan `+0 trace (port scanner)` or `+1–2 trace`; exploit `N charge(s)` (`exploitCost`, plus 1 on a Sentinel-patched node) and `+T trace` (`traceContribution`), noting that a failure adds `+10`; wipe logs `−15 trace, uses the log wiper`; spoof `uses the spoof tool`.
- Scan, exploit, wipe logs and spoof turn the entry into an inline confirm (`spends 1 charge, +1 trace — Run / Cancel`); a second click runs it, `Esc` cancels. Connect, login and disconnect run on the first click.

Behaviour:

- A click calls `onRunCommand(command)`, the same path the explorer's Open and Exfil buttons use, so `handleSubmit` echoes and runs it. Entries are disabled while a command is running or the explorer is disabled (`explorerDisabled`).
- A real menu: `role="menu"`, `role="menuitem"` entries reachable by arrow keys. It opens beside the node, flips to stay inside the pane, and closes on `Esc`, on an outside click, or on pan and zoom. Focus returns to the node.

## Game state change: `scanned`

The game does not track which nodes the player has scanned, and `connect` does not reveal services (only `scan <ip>` lists them, with `[VULNERABLE]`). Listing a node's vulnerable services in the menu without that knowledge would leak vulnerabilities the player has not earned.

- `GameState.scanned: string[]`: ids of nodes the player has scanned by IP. Set by `cmdScan` when `scan <ip>` finds the target (bare `scan` lists peers only and does not mark anything). A node the player has compromised counts as scanned for the menu.
- Saved as an **optional** `scanned?` on `SaveState` (no `SAVE_VERSION` bump: a mismatch discards the save); older saves load with `[]`. It changes no command output or rule.

## Shared logic (so the menu cannot drift from the engine)

- `nodeActions(state, nodeId): NodeAction[]` is a pure function in `src/engine/mapActions.ts`: `{ id, label, command, cost?, disabledReason?, confirm }` per entry. The diagram only renders it.
- The cost rules come from small helpers exported from `src/engine/commands.ts` and used by both the commands and `nodeActions` (the exploit charge cost including the patched surcharge, the scan trace range given the port scanner). A contract test runs each **enabled** entry's command through `resolveCommand` on the same state and requires that it does not come back as a usage error or "not found".
- Layout and grouping are pure (`src/engine/mapLayout.ts`); events are pure (`src/engine/mapDiff.ts`); the components render them (`src/components/NetworkMap.tsx`, `NodeMenu.tsx`).

## Testing

- **Pure units.**
  - Layout is deterministic; turns do not move nodes; a new node shifts only later nodes in its column.
  - Grouping rules: threshold 3; current, accessed, compromised and patched nodes are never hidden in a group.
  - Links need both ends discovered and are drawn once; the layout output never contains an undiscovered node or link.
  - `nodeActions` per state: route versus pivot, locked, the credential filter, exploit gating on kit and charges, tools, costs.
  - The contract test described above.
  - `diffMap` events.
- **State.** `scanned` round-trips through a save; an older save loads with `[]`; only a successful `scan <ip>` marks a host.
- **Components.** The tab exists; the menu opens, confirms and cancels; disabled reasons show; keyboard (`Tab`, `Enter`, `Esc`, arrows) and focus return; group expansion; zoom controls; garbage in `sessionStorage` is ignored; reduced motion switches the effects off.
- **Naming rule.** A guard test renders the whole diagram before `ARIA_NAME_KNOWN` and requires that no text matches `/\baria\b/i`.
- **Real browser** (Playwright, seeded save): click a node, open the menu, confirm, and check the terminal echoes the command; pan and zoom; the narrow layout; a screenshot checked by eye. The full playthrough gains a step that moves with a diagram click.

## Delivery: four PRs, each shippable

1. **Foundation, no UI.** `scanned` (state, save, `scan <ip>`), the shared cost helpers, `nodeActions` and its contract test.
2. **The read-only diagram.** The NETWORK MAP tab in the doc pane, `showNetworkMap` and the `map` command, the aux tab rename to NETWORK LIST, the layout engine, node and link styling, grouping, pan and zoom, keyboard focus. No actions yet.
3. **The menu.** Actions, the confirm flow, keyboard, the wiring to `onRunCommand`, and the playthrough step.
4. **The immersion effects.** `diffMap`, the animations, reduced motion.

## Out of scope

Drag-to-connect, right-click, long-press, multi-select, file actions (those stay in the explorer), 3D, a graph library, fog-of-war placeholders, per-run saved camera or zoom, and any new command or rule.

## Risks

- Positioning the menu over a panned and zoomed SVG: transform the node's bounding box to pane coordinates, flip at the edges.
- The cost rules drifting from the engine: the shared helpers and the contract test guard it.
- A short doc pane in the default `hunt` preset: levels flow left to right, `fit` shows everything, `Alt+Z` gives the whole window.
- Touch: a tap acts as a click; no long-press.
