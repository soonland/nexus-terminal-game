import { CAMERA_FEEDS, CCTV_NODE_ID } from '../data/cameras';
import type { CameraFeed } from '../data/cameras';
import type { GameState } from '../types/game';

export interface ListedFeed extends CameraFeed {
  live: boolean;
  // Not live and no reason given: a camera the controller has not enabled yet.
  locked: boolean;
}

// How deep the player has got: the highest layer where they hold a session. Derived from saved node
// state, so a reload rebuilds it and nothing new is saved.
export const deepestLayer = (state: GameState): number =>
  Object.values(state.network.nodes).reduce(
    (deepest, node) =>
      node === undefined || node.accessLevel === 'none' ? deepest : Math.max(deepest, node.layer),
    0,
  );

// Every camera, from any node, while the player holds a session on the CCTV controller. Whether a
// camera is live (deepest layer reached), disabled (it has a reason) or locked is part of the feed.
export const cameraFeeds = (state: GameState): readonly ListedFeed[] => {
  const controller = state.network.nodes[CCTV_NODE_ID];
  if (controller === undefined || controller.accessLevel === 'none') return [];
  const deepest = deepestLayer(state);
  return CAMERA_FEEDS.map(feed => {
    const live = deepest >= feed.unlockLayer;
    return { ...feed, live, locked: !live && feed.offlineReason === null };
  });
};
