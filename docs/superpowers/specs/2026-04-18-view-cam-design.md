# view-cam Command — Design Spec

**Date:** 2026-04-18
**Status:** Approved

## Summary

Add a `view-cam <id>` command that lets the player read AI-generated surveillance descriptions from the CCTV controller node (`ops_cctv_ctrl`). Read-only, zero trace cost for cam_01 and cam_02. cam_03 (disabled by CEO office) triggers +1% trace as a risk/reward mechanic.

## Architecture

Three layers of new code:

### 1. `/api/camera-feed.ts` — Vercel serverless endpoint

- **Method:** POST
- **Request body:** `{ cameraId: string, location: string, nodeContext?: string }`
- **Response:** `{ description: string }`
- **AI provider:** Gemini (same pattern as `/api/file.ts`) — `GEMINI_API_KEY` required, `ARIA_AI_API_KEY` as universal override
- **System prompt:** establishes IronGate Corp surveillance tone — terse, clinical, sci-fi noir; describes what the camera sees at this moment (people, activity, lighting, anomalies)
- **Fallback:** static `"FEED DEGRADED — signal lost"` on Gemini error or missing key; always returns HTTP 200

### 2. `src/engine/cmdViewCam.ts` — engine command

- Gate: player must be connected to `ops_cctv_ctrl` with at least `user` access; otherwise return an error line
- Camera list derived from `camera_config.ini` content already on the node: `cam_01=lobby`, `cam_02=server_room`, `cam_03=executive_floor`
- Unknown camera ID → error line, no state change
- cam_03: apply `+1` trace to `nextState` **before** the fetch (trace registers even on network failure)
- cam_01, cam_02: zero trace cost, no state change
- Response lines typed as `aria` for visual distinction in the terminal
- No turn counter increment (zero-cost like `ls`)

### 3. `src/engine/commands.ts`

- Add `case 'view-cam'` to the engine command switch, delegating to `cmdViewCam`

## Data Flow

```
player: view-cam 02
  → resolveCommand: verb=view-cam, args=['02']
  → cmdViewCam: on ops_cctv_ctrl? user access? known cam?
  → cam_03? nextState = apply trace +1
  → POST /api/camera-feed { cameraId: 'cam_02', location: 'server_room' }
  → Gemini returns surveillance description
  → lines (aria type) + nextState returned to App.tsx
```

## Error Handling

| Scenario | Behaviour |
|---|---|
| Wrong node | Error line: "No camera feed available from this node." |
| Insufficient access | Error line: "Access denied." |
| Unknown camera ID | Error line: "Unknown camera: <id>." |
| Gemini unavailable / key missing | Fallback line: "FEED DEGRADED — signal lost" |
| cam_03 (any outcome) | Trace +1 applied regardless of feed success |

## Testing

### `api/__tests__/camera.test.ts`
- Valid request returns `{ description }` from Gemini
- Missing required fields return 400
- Missing `GEMINI_API_KEY` returns fallback description
- Gemini HTTP error returns fallback description

### `src/engine/cmdViewCam.test.ts`
- Wrong node returns error, no state change
- Insufficient access returns error
- Unknown camera ID returns error
- cam_01 / cam_02: no trace added, lines typed `aria`
- cam_03: trace +1 in nextState before fetch; trace registered even on Gemini failure
- Gemini fallback renders gracefully as `aria` line

### `src/mocks/handlers.ts`
- Add MSW handler for `POST /api/camera-feed` returning a static description

## Out of Scope

- Camera control (pan, tilt, disable) — read-only only
- Caching / per-run seed consistency — freshly generated each view
- Extending `view-cam` to other nodes
