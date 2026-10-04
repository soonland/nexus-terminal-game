import { CAMERA_FEEDS, CCTV_NODE_ID } from '../data/cameras';
import type { CameraFeed } from '../data/cameras';
import type { GameState } from '../types/game';

export interface ListedFeed extends CameraFeed {
  live: boolean;
}

// How deep the player has got: the highest layer where they hold a session. Derived from saved node
// state, so a reload rebuilds it and nothing new is saved.
export const deepestLayer = (state: GameState): number =>
  Object.values(state.network.nodes).reduce(
    (deepest, node) =>
      node === undefined || node.accessLevel === 'none' ? deepest : Math.max(deepest, node.layer),
    0,
  );

// The feeds the player can see, from any node, while they hold a session on the CCTV controller.
// A feed with an offline reason is listed from the start and shows its card until it is live; any
// other feed does not exist for the player until its layer is reached.
export const cameraFeeds = (state: GameState): readonly ListedFeed[] => {
  const controller = state.network.nodes[CCTV_NODE_ID];
  if (controller === undefined || controller.accessLevel === 'none') return [];
  const deepest = deepestLayer(state);
  return CAMERA_FEEDS.flatMap(feed => {
    const live = deepest >= feed.unlockLayer;
    return live || feed.offlineReason !== null ? [{ ...feed, live }] : [];
  });
};
