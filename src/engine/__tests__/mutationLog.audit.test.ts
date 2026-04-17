/**
 * §9.2 Mutation log completeness audit
 *
 * Formally verifies that every mutation path (4 sentinel + 5 aria) produces a
 * MutationEvent with the complete required field set, and that the visibleToPlayer
 * flag is set correctly per agent.
 */

import { describe, it, expect } from 'vitest';
import { runSentinelTurn } from '../sentinel';
import { runAriaTurn } from '../ariaMutations';
import { createInitialState } from '../state';
import produce from '../produce';
import { makeNode, makeState } from './testHelpers';
import type { GameState, LiveNode, MutationEvent } from '../../types/game';

// ── Required-field assertion ───────────────────────────────────────────────────

const assertCompleteEvent = (
  event: MutationEvent | undefined,
  expectedAgent: 'sentinel' | 'aria',
  expectedAction: MutationEvent['action'],
  expectedVisible: boolean,
): void => {
  expect(event).toBeDefined();
  if (!event) return;

  expect(event.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(typeof event.turnCount).toBe('number');
  expect(event.agent).toBe(expectedAgent);
  expect(event.action).toBe(expectedAction);
  expect(event.visibleToPlayer).toBe(expectedVisible);
  expect(typeof event.reason).toBe('string');
  expect((event.reason ?? '').length).toBeGreaterThan(0);
};

// ── Sentinel state factories (mirror sentinel.test.ts helpers) ────────────────

const sentinelActive = (): GameState =>
  produce(createInitialState(), s => {
    s.player.trace = 65;
  });

const patchAllCompromised = (state: GameState): GameState =>
  produce(state, s => {
    for (const n of Object.values(s.network.nodes)) {
      if (n?.compromised) n.sentinelPatched = true;
    }
  });

const revokeAllCredentials = (state: GameState): GameState =>
  produce(state, s => {
    for (const c of s.player.credentials) {
      if (c.obtained && !c.revoked) c.revoked = true;
    }
  });

// ── §9.2 Sentinel mutations ────────────────────────────────────────────────────

describe('Mutation log audit — sentinel: all actions log with visibleToPlayer: true', () => {
  it('patch_node: complete event with visibleToPlayer true', () => {
    const state = produce(sentinelActive(), s => {
      const n = s.network.nodes['contractor_portal'];
      if (n) {
        n.compromised = true;
        n.compromisedAtTurn = 1;
      }
    });

    const event = runSentinelTurn(state).state.sentinel.mutationLog.find(
      e => e.action === 'patch_node',
    );
    assertCompleteEvent(event, 'sentinel', 'patch_node', true);
    expect(event?.nodeId).toBeTruthy();
  });

  it('revoke_credential: complete event with visibleToPlayer true', () => {
    const state = produce(patchAllCompromised(sentinelActive()), s => {
      s.player.credentials[0].obtained = true;
      s.player.credentials[0].revoked = false;
    });

    const event = runSentinelTurn(state).state.sentinel.mutationLog.find(
      e => e.action === 'revoke_credential',
    );
    assertCompleteEvent(event, 'sentinel', 'revoke_credential', true);
    expect(event?.credentialId).toBeTruthy();
    expect(event?.nodeId).toBeTruthy();
  });

  it('delete_file: complete event with visibleToPlayer true', () => {
    const state = produce(revokeAllCredentials(patchAllCompromised(sentinelActive())), s => {
      const n = s.network.nodes['contractor_portal'];
      if (n) {
        n.files.push({
          name: 'audit.txt',
          path: '/tmp/audit.txt',
          type: 'document',
          content: 'x',
          exfiltrable: true,
          accessRequired: 'user',
        });
      }
      s.turnCount = 0;
      s.sentinel.pendingFileDeletes.push({
        filePath: '/tmp/audit.txt',
        nodeId: 'contractor_portal',
        targetTurn: 0,
      });
    });

    const event = runSentinelTurn(state).state.sentinel.mutationLog.find(
      e => e.action === 'delete_file',
    );
    assertCompleteEvent(event, 'sentinel', 'delete_file', true);
    expect(event?.nodeId).toBe('contractor_portal');
    expect(event?.filePath).toBe('/tmp/audit.txt');
  });

  it('spawn_node: complete event with visibleToPlayer true', () => {
    const event = runSentinelTurn(sentinelActive()).state.sentinel.mutationLog.find(
      e => e.action === 'spawn_node',
    );
    assertCompleteEvent(event, 'sentinel', 'spawn_node', true);
    expect(event?.nodeId).toBeTruthy();
  });
});

// ── §9.2 Aria mutations ────────────────────────────────────────────────────────

describe('Mutation log audit — aria: all actions log with visibleToPlayer: false', () => {
  it('plant_file (trust 40): complete event with visibleToPlayer false', () => {
    const nodeA = makeNode({ id: 'node_a', ip: '10.0.0.2', layer: 0, discovered: true });
    const current = makeNode({ id: 'current', ip: '10.5.0.1', layer: 5, connections: [] });
    const state = makeState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: { current, node_a: nodeA },
      },
      aria: { discovered: true, trustScore: 40, messageHistory: [], suppressedMutations: 0 },
    });

    const event = runAriaTurn(state).state.sentinel.mutationLog.find(
      e => e.action === 'plant_file',
    );
    assertCompleteEvent(event, 'aria', 'plant_file', false);
    expect(event?.nodeId).toBe('node_a');
    expect(event?.filePath).toBeTruthy();
  });

  it('modify_file (trust 50): complete event with visibleToPlayer false', () => {
    const fileNode: LiveNode = makeNode({
      id: 'node_b',
      ip: '10.1.0.2',
      layer: 1,
      discovered: true,
      files: [
        {
          name: 'report.txt',
          path: '/data/report.txt',
          type: 'document',
          content: 'original',
          exfiltrable: false,
          accessRequired: 'user',
        },
      ],
    });
    const current = makeNode({ id: 'current', ip: '10.5.0.1', layer: 5, connections: [] });
    const state = makeState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: { current, node_b: fileNode },
      },
      aria: { discovered: true, trustScore: 50, messageHistory: [], suppressedMutations: 0 },
    });

    const event = runAriaTurn(state).state.sentinel.mutationLog.find(
      e => e.action === 'modify_file',
    );
    assertCompleteEvent(event, 'aria', 'modify_file', false);
    expect(event?.nodeId).toBe('node_b');
    expect(event?.filePath).toBe('/data/report.txt');
  });

  it('nudge_trust (any trust): complete event with visibleToPlayer false', () => {
    // trace >= 61 triggers the high-trace nudge at any trust level
    const state = makeState({
      turnCount: 0,
      player: {
        handle: 'ghost',
        trace: 70,
        charges: 3,
        credentials: [],
        exfiltrated: [],
        tools: [],
        burnCount: 0,
      },
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: { current: makeNode({ id: 'current', ip: '10.5.0.1', layer: 5, connections: [] }) },
      },
      aria: { discovered: true, trustScore: 30, messageHistory: [], suppressedMutations: 0 },
    });

    const event = runAriaTurn(state).state.sentinel.mutationLog.find(
      e => e.action === 'nudge_trust',
    );
    assertCompleteEvent(event, 'aria', 'nudge_trust', false);
    // nudge_trust legitimately has no nodeId — trust adjustment has no target node
    expect(event?.nodeId).toBeUndefined();
  });

  it('reroute_edge (trust 60): complete event with visibleToPlayer false', () => {
    // Use the real key anchor ID (vpn_gateway) at layer 1, compromised, so the
    // completability guard passes for the layer-0 current node.
    const current = makeNode({
      id: 'current',
      ip: '10.0.0.1',
      layer: 0,
      connections: ['vpn_gateway'],
    });
    const vpnGateway = makeNode({
      id: 'vpn_gateway',
      ip: '10.1.0.1',
      layer: 1,
      anchor: true,
      connections: [],
      compromised: true,
    });
    const anchorL2 = makeNode({
      id: 'anchor_l2',
      ip: '10.2.0.1',
      layer: 2,
      anchor: true,
      connections: [],
    });
    const state = makeState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: { current, vpn_gateway: vpnGateway, anchor_l2: anchorL2 },
      },
      aria: { discovered: true, trustScore: 60, messageHistory: [], suppressedMutations: 0 },
    });

    const event = runAriaTurn(state).state.sentinel.mutationLog.find(
      e => e.action === 'reroute_edge',
    );
    assertCompleteEvent(event, 'aria', 'reroute_edge', false);
    expect(event?.nodeId).toBe('anchor_l2');
  });

  it('delete_reinforcement (trust 80): complete event with visibleToPlayer false', () => {
    const sNode = makeNode({
      id: 'sentinel_node_1',
      ip: '10.9.0.1',
      layer: 2,
      anchor: false,
      connections: [],
    });
    const current = makeNode({ id: 'current', ip: '10.5.0.1', layer: 5, connections: [] });
    const state = makeState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: { current, sentinel_node_1: sNode },
      },
      aria: { discovered: true, trustScore: 85, messageHistory: [], suppressedMutations: 0 },
    });

    const event = runAriaTurn(state).state.sentinel.mutationLog.find(
      e => e.action === 'delete_reinforcement',
    );
    assertCompleteEvent(event, 'aria', 'delete_reinforcement', false);
    expect(event?.nodeId).toBe('sentinel_node_1');
  });
});

// ── §9.2 visibleToPlayer invariant — exhaustive check ─────────────────────────

describe('Mutation log audit — visibleToPlayer invariant', () => {
  it('all sentinel events in a full sentinel turn have visibleToPlayer: true', () => {
    const state = produce(sentinelActive(), s => {
      const n = s.network.nodes['contractor_portal'];
      if (n) {
        n.compromised = true;
        n.compromisedAtTurn = 1;
      }
    });
    const { mutationLog } = runSentinelTurn(state).state.sentinel;
    expect(mutationLog.filter(e => e.agent === 'sentinel').length).toBeGreaterThan(0);
    for (const event of mutationLog) {
      if (event.agent === 'sentinel') {
        expect(event.visibleToPlayer).toBe(true);
      }
    }
  });

  it('all aria events in a full aria turn have visibleToPlayer: false', () => {
    const nodeA = makeNode({ id: 'node_a', ip: '10.0.0.2', layer: 0, discovered: true });
    const current = makeNode({ id: 'current', ip: '10.5.0.1', layer: 5, connections: [] });
    const state = makeState({
      network: {
        currentNodeId: 'current',
        previousNodeId: null,
        nodes: { current, node_a: nodeA },
      },
      aria: { discovered: true, trustScore: 45, messageHistory: [], suppressedMutations: 0 },
    });

    const { mutationLog } = runAriaTurn(state).state.sentinel;
    expect(mutationLog.filter(e => e.agent === 'aria').length).toBeGreaterThan(0);
    for (const event of mutationLog) {
      if (event.agent === 'aria') {
        expect(event.visibleToPlayer).toBe(false);
      }
    }
  });
});

// ── §9.2 turnCount field accuracy ─────────────────────────────────────────────

describe('Mutation log audit — turnCount accuracy', () => {
  it('sentinel event records the exact turnCount from state', () => {
    const state = produce(sentinelActive(), s => {
      s.turnCount = 7;
      s.sentinel.sentinelInterval = 1;
      const n = s.network.nodes['contractor_portal'];
      if (n) {
        n.compromised = true;
        n.compromisedAtTurn = 1;
      }
    });
    const events = runSentinelTurn(state).state.sentinel.mutationLog;
    expect(events).toHaveLength(1);
    expect(events[0].turnCount).toBe(7);
  });

  it('aria event records the exact turnCount from state', () => {
    const nodeA = makeNode({ id: 'node_a', ip: '10.0.0.2', layer: 0, discovered: true });
    const current = makeNode({ id: 'current', ip: '10.5.0.1', layer: 5, connections: [] });
    const state = {
      ...makeState({
        network: {
          currentNodeId: 'current',
          previousNodeId: null,
          nodes: { current, node_a: nodeA },
        },
        aria: { discovered: true, trustScore: 45, messageHistory: [], suppressedMutations: 0 },
      }),
      turnCount: 9,
    };
    const events = runAriaTurn(state).state.sentinel.mutationLog;
    expect(events).toHaveLength(1);
    expect(events[0].turnCount).toBe(9);
  });
});
