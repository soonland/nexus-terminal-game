import { CAMERA_FEEDS, CCTV_NODE_ID } from '../data/cameras';
import type { CameraFeed } from '../data/cameras';
import type { GameState } from '../types/game';

// The CAM tab is derived from where the player is and what they hold: nothing is saved, so a
// reload while connected brings it back and a disconnect removes it.
export const cameraFeeds = (state: GameState): readonly CameraFeed[] => {
  const node = state.network.nodes[CCTV_NODE_ID];
  if (state.network.currentNodeId !== CCTV_NODE_ID || node === undefined) return [];
  return node.accessLevel === 'none' ? [] : CAMERA_FEEDS;
};
