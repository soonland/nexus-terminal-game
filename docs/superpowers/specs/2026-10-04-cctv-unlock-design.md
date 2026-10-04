# CCTV feeds that unlock with progress — design

Extends `2026-10-04-cctv-feeds-design.md` (shipped in #240). Read that first.

## Intent

Said by the user: the cameras should be reachable from anywhere once the player controls the CCTV
controller, and the controller should **enable more cameras as the player progresses**. The unlock
rule is the deepest layer reached. Footage stays atmospheric: empty, clue-free, no effect on story,
casebook, flags, saves or trace.

Success: take the controller at layer 1 and see the lobby and server room; the CAM tab stays with
you as you go deeper; each new layer brings a new camera, and the executive-floor feed that read
"FEED DISABLED — CEO OFFICE" comes alive at layer 4. A reload rebuilds all of it.

## Access (changes from #240)

`cameraFeeds(state)` no longer requires standing on the controller. It returns feeds when the
player **holds a session on `ops_cctv_ctrl`** (`accessLevel !== 'none'`). The CAM tab therefore
stays open as the player moves; it disappears only if the session is lost (the existing
`resolveAuxTab` fallback to MAP still applies). `view-cam` follows the same rule: the
"No camera feed available from this node" error goes away; "Permission denied — not authenticated"
stays for no session.

## Unlock rule

`deepestLayer(state)`, in `src/engine/cameras.ts`: the highest `layer` among nodes where the player
holds a session (`accessLevel !== 'none'`). Derived from saved node state, so no new flag and no
save change (`SAVE_VERSION` stays 6).

Each feed in `src/data/cameras.ts` gains `unlockLayer`. A feed is **live** when
`deepestLayer >= unlockLayer`. A feed with an `offlineReason` is always listed, and shows its
offline card until it is live; every other feed is listed only once live. Cameras that are not
listed do not exist for the player: `view-cam cam_05` answers "Unknown camera", naming only the
listed ids. List order is by id; the list only ever grows at the end except `cam_03`, which is
present from the start.

## Lineup

| id       | label           | unlockLayer | notes                                                                 |
| -------- | --------------- | ----------- | --------------------------------------------------------------------- |
| `cam_01` | lobby           | 1           | existing scene                                                        |
| `cam_02` | server room     | 1           | existing scene                                                        |
| `cam_03` | executive floor | 4           | listed from the start, offline "FEED DISABLED — CEO OFFICE" until live |
| `cam_04` | security office | 2           | new scene                                                             |
| `cam_05` | finance floor   | 3           | new scene                                                             |
| `cam_06` | data hall b     | 5           | new scene, the sealed hall from the Cayman vendor summary             |

Labels and descriptions are player-visible before the reveal, so they never contain the secret
name (guard tests cover every label, description and offline reason). `cam_03` keeps its +1 trace
whether offline or live; the others cost none. New scenes are empty and clue-free, with the same
night-vision look, pan and flicker as the existing two:

- **security office:** a wall of dark monitors with one screen in static, empty chairs, a desk
  with a cold coffee ring.
- **finance floor:** rows of desks with dual monitors, glass partitions, a glowing ticker wall.
- **executive floor:** a corridor with closed doors, a large office with a desk and a city glow
  through the window.
- **data hall b:** sealed cold-storage arrays and GPU racks behind a glass wall.

`camera_config.ini` is unchanged: it lists the three original cameras, and the controller enabling
more later is the discovery.

## Unread marker

When a camera goes live while the CAM tab is not on screen, the aux pane is marked unread, the same
way the CASE tab already is (`useUnread` over the number of live feeds; a resumed run starts read).
Opening the CAM tab reads it.

## Viewer

`CamPane` is unchanged apart from taking the longer feed list. The switcher shows one button per
listed feed; an offline feed shows its card. A feed that goes live while it is selected swaps its
card for the scene without a remount of the switcher.

## Scenes

New scene builders live beside the existing ones (`securityOffice.ts`, `financeFloor.ts`,
`executiveFloor.ts`, `dataHall.ts`), reusing `shapes.ts` and `pan.ts`. `buildScene` maps the new
ids. Each builder returns the same `FeedScene` and is bounded to its room (a bounds test, like the
lobby and server room).

## Testing

- `deepestLayer`: none held → 0; a held layer-2 session → 2; a lost session lowers it.
- `cameraFeeds`: empty without a session on the controller; with a session from any node, the
  listed set grows with `deepestLayer` (1: `cam_01–03`, `cam_03` offline; 2: + `cam_04`; … 4:
  `cam_03` live; 5: + `cam_06`).
- `view-cam`: works from another node when a session is held; unknown/unlisted ids are rejected;
  `cam_03` prints the disabled line before layer 4 and its description after; trace unchanged.
- Workspace: the CAM tab stays after pivoting away from the controller; the aux pane is marked
  unread when a camera unlocks off-screen.
- Guard tests: every new label, description and offline reason is free of the secret name.
- Scenes: each new builder is complex enough, bounded, and pans in place.
- Playthrough: one check that a later layer exposes more cameras than layer 1.

## Out of scope

People or events in the footage, an archive of past footage, sound, cameras affecting trace or
Sentinel, a command other than `view-cam`.
