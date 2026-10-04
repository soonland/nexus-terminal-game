# CCTV feeds — design

> The unlock rules, floors, the vault door and the building's look are in 2026-10-04-cctv-unlock-design.md.

## Intent

The player can hold a session on `ops_cctv_ctrl`, whose config lists three cameras. This adds a
small, purely atmospheric live-footage viewer for them: low-fi 3D scenes rendered with three.js.

What the user asked for, and the assumptions around it:

- **Said:** something simple, three.js or similar; nothing sensitive to gameplay, just extra
  gameplay; the camera tab appears on its own (not a command); atmosphere only, plus a
  full-screen toggle.
- **Assumed:** the footage never affects story, casebook, trace, saves or flags; it is derived UI.

Success: connect to the CCTV controller, see a CAM tab appear, watch looping footage, switch
cameras, go full screen; leave the node and the tab goes away. Zero effect on the main bundle
until the tab is first shown.

## Visibility (derived, never saved)

`cameraFeeds(state)` in `src/engine/cameras.ts` returns the feed list when
`currentNodeId === 'ops_cctv_ctrl'` and the player's access level on that node is not `none`;
otherwise an empty list. The aux pane's tab strip shows **CAM** only while the list is non-empty.
If CAM is selected and the list becomes empty (disconnect, node change), the aux pane falls back
to MAP. A reload while connected brings the tab back, because it is derived from the current node.

## Data

`src/data/cameras.ts` holds the authored feeds, matching `camera_config.ini`:

| id       | label          | feed                                            |
| -------- | -------------- | ----------------------------------------------- |
| `cam_01` | lobby          | live scene                                      |
| `cam_02` | server room    | live scene                                      |
| `cam_03` | executive floor | offline: "FEED DISABLED — CEO OFFICE", no scene |

Labels are player-visible text, so the naming guard tests cover them (no secret name). The
server-room scene does not depict the 2024-09-14 incident, and no feed shows people or clues.

## Viewer

`src/components/CamPane.tsx`: a feed switcher along the top, the canvas below. The CCTV look is a
CSS overlay: scanlines, vignette, a `REC ●` dot, the camera id and label, a ticking timestamp.
The timestamp runs from the story's date (`2024-11-27`) with the real wall-clock time of day;
it is decoration and not game time.

Scenes are pure builders in `src/components/cam/scenes.ts`:
`buildLobby(scene): (t: number) => void` and `buildServerRoom(scene)` return an `update(t)`
function. Lobby: an empty hall, a slow camera sweep, steady light. Server room: racks
with blinking LEDs. Offline feed: a card with static noise, no WebGL.

## Full screen

A button on the viewer and the existing `Alt+Z` zoom (which fills the screen with the pane
without re-mounting it, so the terminal stays live behind it). No new shortcut, no browser
Fullscreen API.

## Loading and lifecycle

- three.js and the scene code load via dynamic `import()` the first time the CAM tab shows, so
  the main bundle is unchanged.
- The renderer, geometries and materials are disposed on unmount or feed switch.
- Rendering pauses while the tab is not visible (not selected, hidden behind another zoomed
  pane, narrow-layout other pane) and while the page is hidden.
- Pixel ratio capped at 1.5.
- `prefers-reduced-motion`: render one still frame, no loop.

## Failure

If WebGL is unavailable or the chunk fails to load, the viewer shows a "NO SIGNAL" card. Nothing
is written to the terminal and nothing throws.

## Integration

- `AuxTab` becomes `'map' | 'case' | 'cam'`; `Workspace.tsx` renders the CAM button only when
  `cameraFeeds` is non-empty, and resets `auxTab` to `'map'` when it empties.
- The `showAux` handle is unchanged; no command opens the CAM tab.
- No save changes (`SAVE_VERSION` stays 6). No flags.

## Testing

jsdom has no WebGL, so tests cover logic and structure, not pixels:

- `cameraFeeds`: empty elsewhere, empty with `accessLevel: 'none'`, three feeds with a session,
  `cam_03` offline.
- Workspace: CAM tab appears on the node and disappears after `disconnect`, falling back to MAP.
- CamPane: switcher selects feeds; offline feed shows the card; WebGL failure shows NO SIGNAL.
- Scene builders add the expected objects to a plain `Scene` and `update(t)` does not throw.
- Guard tests: camera labels and card text contain no secret name.
- Playwright playthrough: one check that, on the CCTV node, the CAM tab exists and its canvas is
  not blank.

## Out of scope

People or events in the footage, the incident replay, sound, any gameplay effect (e.g. cameras
affecting trace), a command to open the tab.
