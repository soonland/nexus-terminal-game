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

// The offline feed has no scene: the viewer shows a card instead.
export const buildScene = (id: CameraFeed['id']): FeedScene | null => {
  if (id === 'cam_01') return buildLobby();
  if (id === 'cam_02') return buildServerRoom();
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
