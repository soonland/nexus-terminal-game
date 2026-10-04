# CCTV feeds: floors, names and unlocks — design

Extends `2026-10-04-cctv-feeds-design.md` (shipped in #240). Read that first.

## Intent

Said by the user: the cameras should be reachable from anywhere once the player controls the CCTV
controller; the controller should **enable more cameras as the player progresses** (rule: the
deepest layer reached); the camera switcher should be **a menu of floors whose submenus list the
cameras**; **cameras have names, not numbers**; extra cameras only where a floor has a natural
second view. Footage stays atmospheric: empty, clue-free, no effect on story, casebook, flags,
saves or trace.

Success: take the controller at layer 1 and the CAM tab shows a floor menu with the first floors;
the tab stays with you as you go deeper; each layer brings a floor or a camera; the executive
floor, listed as disabled from the start, comes alive at layer 4. A reload rebuilds all of it.

## Access (changes from #240)

`cameraFeeds(state)` no longer requires standing on the controller. It returns feeds while the
player **holds a session on `ops_cctv_ctrl`** (`accessLevel !== 'none'`), from any node. The CAM
tab stays open as the player moves; it disappears only if the session is lost (the existing
`resolveAuxTab` fallback to MAP applies). `view-cam` follows the same rule: "No camera feed
available from this node" is replaced by a message naming the missing session, and "Permission
denied — not authenticated" stays on the controller itself.

## Unlock rule

`deepestLayer(state)` in `src/engine/cameras.ts`: the highest `layer` among nodes where the player
holds a session (`accessLevel !== 'none'`). Derived from saved node state: no flag, no save change
(`SAVE_VERSION` stays 6).

Each feed has `unlockLayer`. A feed is **live** when `deepestLayer >= unlockLayer`. A feed with an
`offlineReason` is always listed and shows its card until live; every other feed is listed only
once live. Unlisted cameras do not exist for the player: `view-cam` answers "Unknown camera" and
names only listed ids.

## Floors and cameras

A camera's id is a readable slug, the player-facing identifier in the menu and in `view-cam`.
`camera_config.ini` and the 2024-09-14 incident report use the old numbers, so three cameras keep
their number as an **alias** that `view-cam` still accepts; nothing else uses numbers.

| Floor        | id (alias)                    | Name                | Scene / mount        | Unlock | Notes |
| ------------ | ----------------------------- | ------------------- | -------------------- | ------ | ----- |
| Ground floor | `lobby-reception` (`cam_01`)  | Lobby (reception)   | lobby / 0            | 1      | the existing view |
| Ground floor | `lobby-entrance`              | Lobby (entrance)    | lobby / 1            | 1      | from the glass doors, across to the desk and elevators |
| Operations   | `server-aisle` (`cam_02`)     | Server room (aisle) | serverRoom / 0       | 1      | the existing view |
| Operations   | `server-airlock`              | Server room (airlock) | serverRoom / 1     | 1      | from the vault door, back down the aisle |
| Security     | `security-office`             | Security office     | securityOffice / 0   | 2      | |
| Finance      | `finance-floor`               | Finance floor       | financeFloor / 0     | 3      | |
| Executive    | `executive-corridor` (`cam_03`) | Executive corridor | executiveFloor / 0  | 4      | listed from the start, offline "FEED DISABLED — CEO OFFICE" until live |
| Executive    | `executive-office`            | Corner office       | executiveFloor / 1   | 4      | listed from the start, offline until live |
| Sub-level B  | `data-hall-b`                 | Data hall B         | dataHall / 0         | 5      | the sealed hall from the Cayman vendor summary |

- **Floor order** is fixed: Ground floor, Operations, Security, Finance, Executive, Sub-level B. A
  floor is shown when at least one of its cameras is listed. Camera order within a floor is the
  table order.
- **Scenes and mounts:** a camera is a scene plus a **mount**, the camera's position, heading and pan
  (`range`, `sweep`, `hold`, `offset`). Two cameras on one floor share a scene, so a second
  camera costs a mount, not a new room. Scene builders take the mount index.
- **Trace:** both executive cameras cost +1 trace (restricted feed), live or offline; the rest cost
  none.
- **Text:** names, floor names, descriptions and offline reasons are player-visible before the
  reveal and never contain the secret name (guard tests cover all of them). New scenes are empty and
  clue-free, with the same night-vision look, pan and one flickering light.
- **New scenes:** security office (a monitor wall with one screen in static, empty console desks, a
  cold mug); finance floor (rows of dormant desks behind glass, a ticker wall of rising and falling
  bars); executive floor (a corridor of closed doors, a corner office with a dark lamp and a city
  glow); data hall B (rows of sealed cabinets under blue standby light, a vault door at the end).

## Menu

The camera bar's `CAM 01 … CAM 0n` buttons are replaced by one **menu button** that shows where the
player is (`Ground floor › Lobby (reception) ▾`). It opens a **cascading menu**: a column of floors,
and beside it a second column with the cameras of the active floor. The current floor is active when
the menu opens; hovering or focusing another floor makes it the active one. Offline cameras are
listed, dimmed and marked "offline". NIGHT VISION and FULL SCREEN stay on the bar.

Behaviour: click or Enter opens; Arrow Up/Down move through the current column (wrapping);
ArrowRight or a click on a floor moves focus into its cameras; ArrowLeft or Escape from a camera
goes back to its floor; Escape on a floor, or a click outside, closes; picking a camera selects it
and closes. Floors are `menuitem`s with `aria-haspopup` and `aria-expanded`; the cameras are
`menuitemradio`s (`aria-checked`) in a labelled group. Two columns of about 150 and 190 px fit the
small aux pane (about 550×290 px); each column scrolls if it is longer. The overlay on the footage
reads `FLOOR — CAMERA NAME`.

## Unread marker

A camera going live while the CAM tab is not on screen marks the aux pane unread, the same way the
CASE tab does (`useUnread` over the number of live feeds; a resumed run starts read).

## `view-cam`

It takes a camera id or an alias (`view-cam lobby-entrance`, `view-cam cam_02`), prints
`// CCTV — FLOOR — NAME` and the authored description (or the offline reason), and applies the
trace cost. Unknown or unlisted ids: "Unknown camera: X. Known cameras: …" listing only listed ids.

## Testing

- `deepestLayer`: none held → 0; a held layer-2 session → 2; a lost session lowers it.
- `cameraFeeds`: empty without a session on the controller (even with deeper sessions); with one,
  any node; the listed set grows with `deepestLayer`; the executive cameras are listed offline until
  layer 4; ids are unique and aliases never collide with ids.
- Data: every feed's scene and mount exist; floors referenced exist; floor and camera text is free of
  the secret name; `camera_config.ini` still matches the three aliased cameras.
- `view-cam`: works from another node; accepts aliases; rejects unlisted ids without revealing them;
  executive cameras print the disabled line before layer 4 and the description after; trace
  unchanged.
- Menu: lists only floors with listed cameras; the active floor's cameras show beside the floors
  (on open, on hover, on click); selecting calls back and closes; offline cameras are marked; Esc
  and outside click close; Arrow keys move through each column and between them.
- Workspace: the CAM tab stays after pivoting; the aux pane is unread when a camera unlocks
  off-screen and starts read.
- Scenes: each builder is complex enough, bounded, pans in place; a second mount differs from the
  first and still pans.
- Playthrough: the floor menu shows more floors at deeper layers; the executive floor is disabled
  at layer 3 and live at layer 4.

## Out of scope

People or events in the footage, an archive of past footage, sound, cameras affecting trace or
Sentinel, a persistent sidebar tree, any command other than `view-cam`.
