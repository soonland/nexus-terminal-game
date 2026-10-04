export const CCTV_NODE_ID = 'ops_cctv_ctrl';

export interface CameraFeed {
  id: 'cam_01' | 'cam_02' | 'cam_03';
  label: string;
  // Set when the feed is offline: shown on a card instead of a live scene.
  offlineReason: string | null;
}

// Matches camera_config.ini on the CCTV controller.
export const CAMERA_FEEDS: readonly CameraFeed[] = [
  { id: 'cam_01', label: 'lobby', offlineReason: null },
  { id: 'cam_02', label: 'server room', offlineReason: null },
  { id: 'cam_03', label: 'executive floor', offlineReason: 'FEED DISABLED — CEO OFFICE' },
];
