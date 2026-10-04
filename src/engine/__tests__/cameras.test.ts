import { describe, it, expect } from 'vitest';
import { cameraFeeds } from '../cameras';
import { CAMERA_FEEDS } from '../../data/cameras';
import { createInitialState } from '../state';
import produce from '../produce';

const onCctv = (access: 'none' | 'user' | 'admin') =>
  produce(createInitialState(), s => {
    s.network.currentNodeId = 'ops_cctv_ctrl';
    s.network.nodes['ops_cctv_ctrl']!.accessLevel = access;
  });

describe('cameraFeeds', () => {
  it('is empty away from the CCTV controller', () => {
    expect(cameraFeeds(createInitialState())).toEqual([]);
  });

  it('is empty on the controller without a session', () => {
    expect(cameraFeeds(onCctv('none'))).toEqual([]);
  });

  it('lists the three feeds with a session, and the executive floor is offline', () => {
    const feeds = cameraFeeds(onCctv('user'));
    expect(feeds.map(f => f.id)).toEqual(['cam_01', 'cam_02', 'cam_03']);
    expect(feeds.filter(f => f.offlineReason !== null).map(f => f.id)).toEqual(['cam_03']);
  });

  it('matches the cameras named in camera_config.ini', () => {
    const state = createInitialState();
    const ini = state.network.nodes['ops_cctv_ctrl']!.files.find(
      f => f.name === 'camera_config.ini',
    );
    for (const feed of CAMERA_FEEDS) {
      expect(ini?.content).toContain(`${feed.id}=${feed.label.replace(' ', '_')}`);
    }
  });

  it('never uses the secret name in player-visible text', () => {
    for (const feed of CAMERA_FEEDS) {
      expect(`${feed.label} ${feed.offlineReason ?? ''}`).not.toMatch(/aria/i);
    }
  });
});

describe('camera text matches the footage', () => {
  it('describes the server-room lights as red and green, like the scene', () => {
    const cam = CAMERA_FEEDS.find(f => f.id === 'cam_02');
    expect(cam?.description).toMatch(/red and green/);
  });
});
