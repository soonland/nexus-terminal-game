import type { Mesh } from 'three';
import type { Object3D, PerspectiveCamera, Scene } from 'three';
import type { CameraFeed } from '../../data/cameras';
import { buildDataHall } from './dataHall';
import { buildExecutiveFloor } from './executiveFloor';
import { buildFinanceFloor } from './financeFloor';
import { buildLobby } from './lobby';
import { buildSecurityOffice } from './securityOffice';
import { buildVaultApproach } from './vaultApproach';
import { buildServerRoom } from './serverRoom';

export interface FeedScene {
  scene: Scene;
  camera: PerspectiveCamera;
  update: (t: number) => void;
}

// Every camera has a scene; whether it is live or shows an offline card is the engine's decision.
export const buildScene = (feed: Pick<CameraFeed, 'scene' | 'mount'>): FeedScene => {
  if (feed.scene === 'lobby') return buildLobby(feed.mount);
  if (feed.scene === 'serverRoom') return buildServerRoom(feed.mount);
  if (feed.scene === 'securityOffice') return buildSecurityOffice(feed.mount);
  if (feed.scene === 'financeFloor') return buildFinanceFloor(feed.mount);
  if (feed.scene === 'executiveFloor') return buildExecutiveFloor(feed.mount);
  if (feed.scene === 'dataHall') return buildDataHall(feed.mount);
  return buildVaultApproach(feed.mount);
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
