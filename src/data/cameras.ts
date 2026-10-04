export const CCTV_NODE_ID = 'ops_cctv_ctrl';

export interface CameraFeed {
  id: 'cam_01' | 'cam_02' | 'cam_03';
  label: string;
  // Set when the feed is offline: shown on a card instead of a live scene.
  offlineReason: string | null;
  // What `view-cam` prints for a live feed. Authored to match the viewer's scene.
  description: string;
  // Trace added when the player opens this feed.
  traceCost: number;
}

// Matches camera_config.ini on the CCTV controller.
export const CAMERA_FEEDS: readonly CameraFeed[] = [
  {
    id: 'cam_01',
    label: 'lobby',
    offlineReason: null,
    description:
      'Main lobby, night. Emergency lighting only, and one ceiling fixture flickers over the reception desk. The hall is empty and the camera pans slowly from left to right.',
    traceCost: 0,
  },
  {
    id: 'cam_02',
    label: 'server room',
    offlineReason: null,
    description:
      'Server room. Two rows of racks, status lights blinking amber and green in no particular order. Nothing moves; the cooling units hold a steady note.',
    traceCost: 0,
  },
  {
    id: 'cam_03',
    label: 'executive floor',
    offlineReason: 'FEED DISABLED — CEO OFFICE',
    description: '',
    traceCost: 1,
  },
];
