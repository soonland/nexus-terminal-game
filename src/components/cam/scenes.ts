import type { Mesh } from 'three';
import type { Object3D, PerspectiveCamera, Scene } from 'three';
import type { CameraFeed } from '../../data/cameras';
import { buildLobby } from './lobby';
import { buildServerRoom } from './serverRoom';

export interface FeedScene {
  scene: Scene;
  camera: PerspectiveCamera;
  update: (t: number) => void;
}

// The offline feeds still map to a scene: whether a feed is live is the engine's decision.
export const buildScene = (feed: Pick<CameraFeed, 'scene' | 'mount'>): FeedScene | null => {
  if (feed.scene === 'lobby') return buildLobby();
  if (feed.scene === 'serverRoom') return buildServerRoom();
  return null;
};

const isMesh = (object: Object3D): object is Mesh => 'isMesh' in object && object.isMesh === true;

export const disposeScene = (scene: Scene): void => {
  scene.traverse(object => {
    if (!isMesh(object)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const m of materials) m.dispose();
  });
};
