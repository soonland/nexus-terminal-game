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

Each feed has `unlockLayer`. A feed is **live** when `deepestLayer >= unlockLayer`. Every camera is
**listed** from the start (see the amendment below); one that is not live shows a card: its
`offlineReason` ("FEED DISABLED — CEO OFFICE") if it has one, otherwise "FEED LOCKED".

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

## Amendment — locked cameras, the vault door, and the building's look

Requested after the first review; it overrides anything above that contradicts it.

### The menu and `view-cam` list every camera

The floor menu lists all cameras, live or not. A camera has one of three states: **live**, **disabled**
(it has an `offlineReason`, shown on its card) or **locked** (not live, no reason: its card reads
"FEED LOCKED" and says nothing about which layer opens it). Locked and disabled entries are dimmed in
the menu and marked "— locked" / "— offline". Every floor is listed from the start. `view-cam <id>` knows every
id: a locked camera prints its header and "FEED LOCKED" and costs no trace (the executive cameras
keep +1 trace, live or disabled); "Known cameras" names them all. The unread marker still fires only
when a camera goes live. Because every name is visible from layer 1, every camera and floor name stays
neutral (the naming guard test covers them all).

### A vault-door camera

A tenth camera: `vault-door`, name "Vault door", floor Sub-level B, unlock layer 5, scene
`vaultApproach`, one mount. The room is a short sealed corridor ending in a large circular vault door;
the camera sits at the far end pointing straight at the door and only drifts a few degrees. The door
has a thick frame, a wheel, a ring of bolts, hinges, a keypad, pressure gauges, a red status light,
hazard stripes on the floor and a faint cyan glow under it. The description says only that it is
sealed, the light is red and the floor hums; it never names what is behind it, and the room behind is
not viewable.

### The building's look

IronGate's floors share one look: **white walls, a tiled floor, and one accent colour per floor**.
The accent is data (`FLOORS[].accent`), so the scenes and the menu use one source: Ground floor
`0x2b6cb0` (blue), Operations `0xed8936` (orange), Security `0xe53e3e` (red), Finance `0x38a169`
(green), Executive `0xd69e2e` (gold), Sub-level B `0x00b5d8` (cyan, with yellow-black hazard stripes at
the vault). In a scene the accent colours a trim band at eye level, the baseboard, door frames, signs
and a stripe inlaid in the floor tiles; the floor menu shows it as a swatch beside the floor name.

- **Walls** are white; the **floor** is light tiles with visible grout lines; the **ceiling** is white
  with light panels. Props keep their own colours.
- **Lit, not dark:** the fluorescents stay on around the clock and the rooms are empty after hours.
  Scenes use a light haze (fog and background) instead of black, brighter lighting, and the flicker
  stays as one tired fixture per room. Descriptions are reworded from "emergency lighting only" to
  lit-but-empty.
- **Night vision is off by default** (still a remembered toggle), so the colours show; with it on the
  rooms go green and monochrome as before.

### Testing (additions)

Every `wall` mesh in every scene is white; every scene has accent-coloured `trim` meshes in its floor's
accent and `grout` meshes for the tiled floor; the menu lists every camera and marks locked ones;
`view-cam` answers "FEED LOCKED" for a locked camera and still rejects an id that does not exist;
the vault scene is bounded, closed and pans in place; night vision is off by default.
