import { describe, it, expect } from 'vitest';
import { cameraFeeds, deepestLayer } from '../cameras';
import { CAMERA_FEEDS, FLOORS, floorName } from '../../data/cameras';
import { createInitialState } from '../state';
import produce from '../produce';
import type { GameState } from '../../types/game';

// Grants a session on each node and puts the player at `current`.
const held = (nodeIds: string[], current = 'contractor_portal'): GameState =>
  produce(createInitialState(), s => {
    for (const id of nodeIds) s.network.nodes[id]!.accessLevel = 'user';
    s.network.currentNodeId = current;
  });

const ids = (state: GameState) => cameraFeeds(state).map(f => f.id);
const liveIds = (state: GameState) =>
  cameraFeeds(state)
    .filter(f => f.live)
    .map(f => f.id);

const L1 = 'ops_cctv_ctrl';
const L2 = 'sec_access_ctrl';
const L3 = 'fin_payments_db';
const L4 = 'exec_cfo';
const L5 = 'aria_core';

describe('deepestLayer', () => {
  it('is 0 before any session is held', () => {
    expect(deepestLayer(createInitialState())).toBe(0);
  });

  it('is the highest layer where a session is held', () => {
    expect(deepestLayer(held([L1]))).toBe(1);
    expect(deepestLayer(held([L1, L3, L2]))).toBe(3);
  });

  it('drops when the deepest session is lost', () => {
    const state = produce(held([L1, L3]), s => {
      s.network.nodes[L3]!.accessLevel = 'none';
    });
    expect(deepestLayer(state)).toBe(1);
  });
});

describe('cameraFeeds', () => {
  it('is empty without a session on the controller', () => {
    expect(cameraFeeds(createInitialState())).toEqual([]);
  });

  it('is empty when deeper sessions are held but the controller was never taken', () => {
    expect(cameraFeeds(held([L2, L3, L4]))).toEqual([]);
  });

  it('lists the layer-1 cameras, with the executive floor offline', () => {
    const feeds = cameraFeeds(held([L1], L1));
    expect(feeds.map(f => f.id)).toEqual([
      'lobby-reception',
      'lobby-entrance',
      'server-aisle',
      'server-airlock',
      'executive-corridor',
      'executive-office',
    ]);
    expect(feeds.filter(f => !f.live).map(f => f.id)).toEqual([
      'executive-corridor',
      'executive-office',
    ]);
  });

  it('keeps the feeds after leaving the controller, from any node', () => {
    expect(ids(held([L1, 'ops_hr_db'], 'ops_hr_db'))).toContain('lobby-reception');
  });

  it('adds cameras with each layer, and the executive floor goes live at layer 4', () => {
    expect(liveIds(held([L1, L2]))).toContain('security-office');
    expect(liveIds(held([L1, L2]))).not.toContain('finance-floor');
    expect(liveIds(held([L1, L2, L3]))).toContain('finance-floor');
    expect(liveIds(held([L1, L2, L3]))).not.toContain('executive-corridor');
    const four = liveIds(held([L1, L2, L3, L4]));
    expect(four).toEqual(expect.arrayContaining(['executive-corridor', 'executive-office']));
    expect(four).not.toContain('data-hall-b');
    expect(liveIds(held([L1, L2, L3, L4, L5]))).toContain('data-hall-b');
  });

  it('never lists a camera before its layer', () => {
    expect(ids(held([L1, L2]))).not.toContain('finance-floor');
    expect(ids(held([L1, L2, L3, L4]))).not.toContain('data-hall-b');
  });

  it('lists every camera once, in data order', () => {
    const all = ids(held([L1, L2, L3, L4, L5]));
    expect(all).toEqual(CAMERA_FEEDS.map(f => f.id));
  });
});

describe('camera data', () => {
  it('has unique ids, and aliases that never collide with ids or each other', () => {
    const names = CAMERA_FEEDS.flatMap(f => [f.id, ...f.aliases]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('puts every camera on a known floor', () => {
    const floors = new Set(FLOORS.map(f => f.id));
    for (const feed of CAMERA_FEEDS) expect(floors.has(feed.floor)).toBe(true);
  });

  it('keeps the three numbered aliases that camera_config.ini names', () => {
    const ini = createInitialState().network.nodes[L1]!.files.find(
      f => f.name === 'camera_config.ini',
    );
    const expected = {
      cam_01: 'lobby-reception',
      cam_02: 'server-aisle',
      cam_03: 'executive-corridor',
    } as const;
    for (const [alias, id] of Object.entries(expected)) {
      expect(ini?.content).toContain(`${alias}=`);
      expect(CAMERA_FEEDS.find(f => f.id === id)?.aliases).toContain(alias);
    }
  });

  it('describes the server-room lights as red and green, like the scene', () => {
    expect(CAMERA_FEEDS.find(f => f.id === 'server-aisle')?.description).toMatch(/red and green/);
  });

  it('has a description for every camera that can go live', () => {
    for (const feed of CAMERA_FEEDS) expect(feed.description.length).toBeGreaterThan(40);
  });

  it('charges trace only on the restricted executive cameras', () => {
    expect(CAMERA_FEEDS.filter(f => f.traceCost > 0).map(f => f.id)).toEqual([
      'executive-corridor',
      'executive-office',
    ]);
  });
});

describe('floorName', () => {
  it('names a floor, and falls back to the id for one it does not know', () => {
    expect(floorName('ground')).toBe('Ground floor');
    expect(floorName('basement' as never)).toBe('basement');
  });
});
