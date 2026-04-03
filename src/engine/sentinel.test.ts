import { describe, it, expect, beforeEach } from 'vitest';
import { runSentinelTurn } from './sentinel';
import { createInitialState } from './state';
import produce from './produce';
import type { GameState } from '../types/game';

// ── Helpers ────────────────────────────────────────────────

/** Return a base state with trace set to 65 (sentinel-active threshold). */
const activeState = (): GameState =>
  produce(createInitialState(), s => {
    s.player.trace = 65;
  });

/** Mark a node as compromised at a given turn. Layer defaults to 1 (non-aria). */
const compromiseNode = (state: GameState, nodeId: string, turn = 1, layer = 1): GameState =>
  produce(state, s => {
    const n = s.network.nodes[nodeId];
    if (n) {
      n.compromised = true;
      n.compromisedAtTurn = turn;
      n.layer = layer;
    }
  });

/** Mark all currently-compromised nodes as already sentinelPatched so P1 skips them. */
const patchAllCompromised = (state: GameState): GameState =>
  produce(state, s => {
    for (const n of Object.values(s.network.nodes)) {
      if (n?.compromised) n.sentinelPatched = true;
    }
  });

/** Mark the first anchor credential as obtained (not revoked). */
const obtainFirstCredential = (state: GameState): GameState =>
  produce(state, s => {
    s.player.credentials[0].obtained = true;
    s.player.credentials[0].revoked = false;
  });

/** Remove all obtained-but-unrevoked credentials so P2 cannot fire. */
const revokeAllCredentials = (state: GameState): GameState =>
  produce(state, s => {
    for (const c of s.player.credentials) {
      if (c.obtained && !c.revoked) c.revoked = true;
    }
  });

// ── Inactive below trace threshold ─────────────────────────

describe('runSentinelTurn — inactive when trace < 61', () => {
  it('should return unchanged state and empty lines when trace is 0', () => {
    const state = createInitialState();
    const result = runSentinelTurn(state);
    expect(result.lines).toHaveLength(0);
    expect(result.state).toBe(state); // same reference — nothing cloned
  });

  it('should return unchanged state and empty lines when trace is exactly 60', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 60;
    });
    const result = runSentinelTurn(state);
    expect(result.lines).toHaveLength(0);
    expect(result.state.sentinel.active).toBe(false);
  });

  it('should not add to the mutation log when trace < 61', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 50;
    });
    const result = runSentinelTurn(state);
    expect(result.state.sentinel.mutationLog).toHaveLength(0);
  });
});

// ── Sentinel activation ─────────────────────────────────────

describe('runSentinelTurn — activation', () => {
  it('should set sentinel.active to true on first turn with trace >= 61', () => {
    const state = activeState();
    expect(state.sentinel.active).toBe(false);
    const result = runSentinelTurn(state);
    expect(result.state.sentinel.active).toBe(true);
  });

  it('should activate at exactly trace 61', () => {
    const state = produce(createInitialState(), s => {
      s.player.trace = 61;
    });
    const result = runSentinelTurn(state);
    expect(result.state.sentinel.active).toBe(true);
  });

  it('should keep sentinel.active true if it was already true', () => {
    const state = produce(activeState(), s => {
      s.sentinel.active = true;
    });
    const result = runSentinelTurn(state);
    expect(result.state.sentinel.active).toBe(true);
  });
});

// ── Priority 1: patch node ──────────────────────────────────

describe('runSentinelTurn — priority 1: patch node', () => {
  let base: GameState;

  beforeEach(() => {
    base = activeState();
  });

  it('should set sentinelPatched on the compromised node', () => {
    const state = compromiseNode(base, 'contractor_portal', 1);
    const result = runSentinelTurn(state);
    expect(result.state.network.nodes['contractor_portal']?.sentinelPatched).toBe(true);
  });

  it('should log a mutation event with agent sentinel and action patch_node', () => {
    const state = compromiseNode(base, 'contractor_portal', 1);
    const result = runSentinelTurn(state);
    const log = result.state.sentinel.mutationLog;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      agent: 'sentinel',
      action: 'patch_node',
      nodeId: 'contractor_portal',
    });
  });

  it('should log the current turnCount on the mutation event', () => {
    const state = produce(compromiseNode(base, 'contractor_portal', 1), s => {
      s.turnCount = 7;
    });
    const result = runSentinelTurn(state);
    expect(result.state.sentinel.mutationLog[0].turnCount).toBe(7);
  });

  it('should emit system and error lines describing the hardened node', () => {
    const state = compromiseNode(base, 'contractor_portal', 1);
    const result = runSentinelTurn(state);
    expect(result.lines.length).toBeGreaterThan(0);
    const errorLine = result.lines.find(l => l.type === 'error');
    expect(errorLine?.content).toMatch(/SENTINEL.*hardened/i);
  });

  it('should pick the node with the highest compromisedAtTurn when multiple are compromised', () => {
    // contractor_portal at turn 1, vpn_gateway at turn 5 — vpn_gateway is more recent
    const state = compromiseNode(compromiseNode(base, 'contractor_portal', 1), 'vpn_gateway', 5);
    const result = runSentinelTurn(state);
    const log = result.state.sentinel.mutationLog;
    expect(log[0].nodeId).toBe('vpn_gateway');
  });

  it('should skip nodes that are already sentinelPatched', () => {
    const state = produce(compromiseNode(base, 'contractor_portal', 1), s => {
      const n = s.network.nodes['contractor_portal'];
      if (n) n.sentinelPatched = true;
    });
    // No other compromised nodes — so P1 should yield nothing and fall through to P4
    const result = runSentinelTurn(state);
    const log = result.state.sentinel.mutationLog;
    // If P1 was skipped correctly, the log action will not be patch_node
    expect(log[0]?.action).not.toBe('patch_node');
  });

  it('should not fire P2 when P1 fires (strict one-action-per-turn)', () => {
    // Both P1 and P2 conditions are met simultaneously
    const state = obtainFirstCredential(compromiseNode(base, 'contractor_portal', 1));
    const result = runSentinelTurn(state);
    const log = result.state.sentinel.mutationLog;
    expect(log).toHaveLength(1);
    expect(log[0].action).toBe('patch_node');
    // Credential should NOT be revoked
    expect(result.state.player.credentials[0].revoked).toBeFalsy();
  });

  it('should not fire P3 when P1 fires', () => {
    const withPendingDelete = produce(compromiseNode(base, 'contractor_portal', 1), s => {
      const n = s.network.nodes['contractor_portal'];
      if (n) {
        n.files.push({
          name: 'bait.txt',
          path: '/tmp/bait.txt',
          type: 'document',
          content: 'x',
          exfiltrable: true,
          accessRequired: 'user',
        });
      }
      s.sentinel.pendingFileDeletes.push({
        filePath: '/tmp/bait.txt',
        nodeId: 'contractor_portal',
        targetTurn: 0,
      });
    });
    const result = runSentinelTurn(withPendingDelete);
    const log = result.state.sentinel.mutationLog;
    expect(log).toHaveLength(1);
    expect(log[0].action).toBe('patch_node');
  });
});

// ── Priority 1: aria exclusion (layer 5) ───────────────────

describe('runSentinelTurn — priority 1: aria node exclusion', () => {
  it('should not patch a compromised layer-5 node', () => {
    // aria_surveillance is layer 5 in the game data
    const state = produce(activeState(), s => {
      const n = s.network.nodes['aria_surveillance'];
      if (n) {
        n.compromised = true;
        n.compromisedAtTurn = 1;
        // layer is already 5
      }
    });
    const result = runSentinelTurn(state);
    // P1 should skip the aria node; it will fall through to P4 (spawn_node)
    const log = result.state.sentinel.mutationLog;
    expect(log[0]?.action).not.toBe('patch_node');
    expect(result.state.network.nodes['aria_surveillance']?.sentinelPatched).not.toBe(true);
  });

  it('should patch a non-aria node even when an aria node is also compromised', () => {
    const state = produce(activeState(), s => {
      const aria = s.network.nodes['aria_surveillance'];
      if (aria) {
        aria.compromised = true;
        aria.compromisedAtTurn = 10;
      }
      const ops = s.network.nodes['contractor_portal'];
      if (ops) {
        ops.compromised = true;
        ops.compromisedAtTurn = 5;
        ops.layer = 1;
      }
    });
    const result = runSentinelTurn(state);
    const log = result.state.sentinel.mutationLog;
    expect(log[0].action).toBe('patch_node');
    expect(log[0].nodeId).toBe('contractor_portal');
  });
});

// ── Priority 2: revoke credential ──────────────────────────

describe('runSentinelTurn — priority 2: revoke credential', () => {
  let base: GameState;

  beforeEach(() => {
    // No compromised nodes so P1 cannot fire; P2 gets a clear shot
    base = patchAllCompromised(obtainFirstCredential(activeState()));
  });

  it('should set revoked = true on the targeted credential', () => {
    const result = runSentinelTurn(base);
    expect(result.state.player.credentials[0].revoked).toBe(true);
  });

  it('should push a renewed credential into worldCredentials', () => {
    const credBefore = base.worldCredentials.length;
    const result = runSentinelTurn(base);
    expect(result.state.worldCredentials.length).toBe(credBefore + 1);
  });

  it('should mark the renewed credential as not obtained', () => {
    const result = runSentinelTurn(base);
    const renewed = result.state.worldCredentials.at(-1);
    expect(renewed?.obtained).toBe(false);
  });

  it('should plant RESET_NOTICE.txt on the primary valid node', () => {
    const result = runSentinelTurn(base);
    const primaryNodeId = base.player.credentials[0].validOnNodes[0];
    const node = result.state.network.nodes[primaryNodeId];
    const resetFile = node?.files.find(f => f.name === 'RESET_NOTICE.txt');
    expect(resetFile).toBeDefined();
  });

  it('should log a mutation event with action revoke_credential', () => {
    const result = runSentinelTurn(base);
    const log = result.state.sentinel.mutationLog;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      agent: 'sentinel',
      action: 'revoke_credential',
      credentialId: base.player.credentials[0].id,
    });
  });

  it('should emit an error line naming the revoked username', () => {
    const result = runSentinelTurn(base);
    const errorLine = result.lines.find(l => l.type === 'error');
    expect(errorLine?.content).toMatch(/SENTINEL.*revoked/i);
    expect(errorLine?.content).toContain(base.player.credentials[0].username);
  });

  it('should not fire P3 when P2 fires (strict one-action-per-turn)', () => {
    const state = produce(base, s => {
      const n = s.network.nodes['contractor_portal'];
      if (n) {
        n.files.push({
          name: 'target.txt',
          path: '/tmp/target.txt',
          type: 'document',
          content: 'x',
          exfiltrable: true,
          accessRequired: 'user',
        });
      }
      s.sentinel.pendingFileDeletes.push({
        filePath: '/tmp/target.txt',
        nodeId: 'contractor_portal',
        targetTurn: 0,
      });
    });
    const result = runSentinelTurn(state);
    const log = result.state.sentinel.mutationLog;
    expect(log).toHaveLength(1);
    expect(log[0].action).toBe('revoke_credential');
  });

  it('should not fire when all credentials are already revoked', () => {
    const allRevoked = revokeAllCredentials(base);
    const result = runSentinelTurn(allRevoked);
    // Falls through to P4 (spawn_node) since P1 is clear and P2 cannot fire
    const log = result.state.sentinel.mutationLog;
    expect(log[0]?.action).not.toBe('revoke_credential');
  });

  it('should not fire when no credentials are obtained', () => {
    const noneObtained = produce(activeState(), s => {
      for (const c of s.player.credentials) {
        c.obtained = false;
      }
    });
    const result = runSentinelTurn(noneObtained);
    expect(result.state.sentinel.mutationLog[0]?.action).not.toBe('revoke_credential');
  });
});

// ── Priority 3: delete file ─────────────────────────────────

describe('runSentinelTurn — priority 3: delete file', () => {
  let base: GameState;

  beforeEach(() => {
    // Clear P1 and P2 conditions so P3 fires cleanly
    const noCompromised = activeState(); // initial state has no compromised nodes
    const noObtained = produce(noCompromised, s => {
      for (const c of s.player.credentials) c.obtained = false;
    });
    // Add a file and queue a delete for it (targetTurn already passed)
    base = produce(noObtained, s => {
      const n = s.network.nodes['contractor_portal'];
      if (n) {
        n.files.push({
          name: 'classified.txt',
          path: '/tmp/classified.txt',
          type: 'document',
          content: 'secret',
          exfiltrable: true,
          accessRequired: 'user',
        });
      }
      s.turnCount = 10;
      s.sentinel.pendingFileDeletes.push({
        filePath: '/tmp/classified.txt',
        nodeId: 'contractor_portal',
        targetTurn: 5, // already past
      });
    });
  });

  it('should set deleted = true on the target file', () => {
    const result = runSentinelTurn(base);
    const node = result.state.network.nodes['contractor_portal'];
    const file = node?.files.find(f => f.path === '/tmp/classified.txt');
    expect(file?.deleted).toBe(true);
  });

  it('should remove the entry from pendingFileDeletes', () => {
    const result = runSentinelTurn(base);
    const remaining = result.state.sentinel.pendingFileDeletes.filter(
      p => p.filePath === '/tmp/classified.txt' && p.nodeId === 'contractor_portal',
    );
    expect(remaining).toHaveLength(0);
  });

  it('should not remove other pending deletes', () => {
    const state = produce(base, s => {
      const n = s.network.nodes['vpn_gateway'];
      if (n) {
        n.files.push({
          name: 'other.txt',
          path: '/tmp/other.txt',
          type: 'document',
          content: 'other',
          exfiltrable: true,
          accessRequired: 'user',
        });
      }
      s.sentinel.pendingFileDeletes.push({
        filePath: '/tmp/other.txt',
        nodeId: 'vpn_gateway',
        targetTurn: 99, // not yet due
      });
    });
    const result = runSentinelTurn(state);
    const remaining = result.state.sentinel.pendingFileDeletes.filter(
      p => p.filePath === '/tmp/other.txt',
    );
    expect(remaining).toHaveLength(1);
  });

  it('should log a mutation event with action delete_file', () => {
    const result = runSentinelTurn(base);
    const log = result.state.sentinel.mutationLog;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      agent: 'sentinel',
      action: 'delete_file',
      nodeId: 'contractor_portal',
      filePath: '/tmp/classified.txt',
    });
  });

  it('should emit an error line naming the deleted file', () => {
    const result = runSentinelTurn(base);
    const errorLine = result.lines.find(l => l.type === 'error');
    expect(errorLine?.content).toMatch(/SENTINEL.*classified\.txt/i);
  });

  it('should not act on a pending delete whose targetTurn has not yet arrived', () => {
    const state = produce(activeState(), s => {
      const n = s.network.nodes['contractor_portal'];
      if (n) {
        n.files.push({
          name: 'future.txt',
          path: '/tmp/future.txt',
          type: 'document',
          content: 'x',
          exfiltrable: true,
          accessRequired: 'user',
        });
      }
      s.turnCount = 3;
      s.sentinel.pendingFileDeletes.push({
        filePath: '/tmp/future.txt',
        nodeId: 'contractor_portal',
        targetTurn: 10, // future turn — not due yet
      });
    });
    const result = runSentinelTurn(state);
    const node = result.state.network.nodes['contractor_portal'];
    const file = node?.files.find(f => f.path === '/tmp/future.txt');
    expect(file?.deleted).toBeFalsy();
    // Should fall through to P4 instead
    expect(result.state.sentinel.mutationLog[0]?.action).toBe('spawn_node');
  });

  it('should act when targetTurn equals the current turnCount', () => {
    const state = produce(activeState(), s => {
      const n = s.network.nodes['contractor_portal'];
      if (n) {
        n.files.push({
          name: 'exact.txt',
          path: '/tmp/exact.txt',
          type: 'document',
          content: 'x',
          exfiltrable: true,
          accessRequired: 'user',
        });
      }
      s.turnCount = 5;
      s.sentinel.pendingFileDeletes.push({
        filePath: '/tmp/exact.txt',
        nodeId: 'contractor_portal',
        targetTurn: 5, // same turn — boundary: targetTurn <= turnCount
      });
    });
    const result = runSentinelTurn(state);
    const node = result.state.network.nodes['contractor_portal'];
    const file = node?.files.find(f => f.path === '/tmp/exact.txt');
    expect(file?.deleted).toBe(true);
  });
});

// ── Priority 4: spawn node ──────────────────────────────────

describe('runSentinelTurn — priority 4: spawn node', () => {
  // P4 fires when: trace >= 61, no compromised non-aria nodes to patch,
  // no obtained unrevoked credentials, no due pending deletes.
  const p4State = (): GameState => activeState(); // initial state satisfies all these

  it('should add a new sentinel node to state.network.nodes', () => {
    const result = runSentinelTurn(p4State());
    const sentinelNodes = Object.values(result.state.network.nodes).filter(n =>
      n?.id.startsWith('sentinel_node_'),
    );
    expect(sentinelNodes).toHaveLength(1);
  });

  it('should name the first spawned node sentinel_node_1', () => {
    const result = runSentinelTurn(p4State());
    expect(result.state.network.nodes['sentinel_node_1']).toBeDefined();
  });

  it('should assign the first spawned node ip 10.9.0.1', () => {
    const result = runSentinelTurn(p4State());
    expect(result.state.network.nodes['sentinel_node_1']?.ip).toBe('10.9.0.1');
  });

  it('should use the security_node template', () => {
    const result = runSentinelTurn(p4State());
    expect(result.state.network.nodes['sentinel_node_1']?.template).toBe('security_node');
  });

  it('should place the spawned node in layer 2', () => {
    const result = runSentinelTurn(p4State());
    expect(result.state.network.nodes['sentinel_node_1']?.layer).toBe(2);
  });

  it('should mark the spawned node as discovered', () => {
    const result = runSentinelTurn(p4State());
    expect(result.state.network.nodes['sentinel_node_1']?.discovered).toBe(true);
  });

  it('should mark the spawned node as sentinelPatched', () => {
    const result = runSentinelTurn(p4State());
    expect(result.state.network.nodes['sentinel_node_1']?.sentinelPatched).toBe(true);
  });

  it('should connect the spawned node back to existing layer-2 nodes', () => {
    const result = runSentinelTurn(p4State());
    const spawnedNode = result.state.network.nodes['sentinel_node_1'];
    // Layer-2 anchor nodes: sec_access_ctrl and sec_firewall
    expect(spawnedNode?.connections).toEqual(
      expect.arrayContaining(['sec_access_ctrl', 'sec_firewall']),
    );
  });

  it('should wire existing layer-2 nodes back to the spawned node', () => {
    const result = runSentinelTurn(p4State());
    const secAccess = result.state.network.nodes['sec_access_ctrl'];
    const secFirewall = result.state.network.nodes['sec_firewall'];
    const nodeId = 'sentinel_node_1';
    // At least one of the security anchors should now reference the new node
    const anyWiredBack =
      secAccess?.connections.includes(nodeId) || secFirewall?.connections.includes(nodeId);
    expect(anyWiredBack).toBe(true);
  });

  it('should log a mutation event with action spawn_node', () => {
    const result = runSentinelTurn(p4State());
    const log = result.state.sentinel.mutationLog;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      agent: 'sentinel',
      action: 'spawn_node',
      nodeId: 'sentinel_node_1',
    });
  });

  it('should emit an error line showing the deployed ip', () => {
    const result = runSentinelTurn(p4State());
    const errorLine = result.lines.find(l => l.type === 'error');
    expect(errorLine?.content).toMatch(/SENTINEL.*10\.9\.0\.1/);
  });

  it('should increment the spawned node id and ip on subsequent spawn turns', () => {
    // Run P4 twice to get sentinel_node_2 with ip 10.9.0.2
    const after1 = runSentinelTurn(p4State()).state;
    const after2 = runSentinelTurn(after1).state;
    expect(after2.network.nodes['sentinel_node_2']).toBeDefined();
    expect(after2.network.nodes['sentinel_node_2']?.ip).toBe('10.9.0.2');
  });
});

// ── MutationEvent shape ─────────────────────────────────────

describe('runSentinelTurn — MutationEvent shape', () => {
  it('should always include a unique id (UUID format) on each event', () => {
    const state = compromiseNode(activeState(), 'contractor_portal', 1);
    const r1 = runSentinelTurn(state);
    const r2 = runSentinelTurn(state);
    const id1 = r1.state.sentinel.mutationLog[0].id;
    const id2 = r2.state.sentinel.mutationLog[0].id;
    expect(id1).toMatch(/^[0-9a-f-]{36}$/);
    expect(id2).toMatch(/^[0-9a-f-]{36}$/);
    expect(id1).not.toBe(id2);
  });

  it('should always set agent to sentinel', () => {
    const state = compromiseNode(activeState(), 'contractor_portal', 1);
    const result = runSentinelTurn(state);
    expect(result.state.sentinel.mutationLog[0].agent).toBe('sentinel');
  });
});

// ── Strict priority (cross-priority isolation) ──────────────

describe('runSentinelTurn — strict one-action-per-turn guarantee', () => {
  it('should produce exactly one mutation log entry per call regardless of how many conditions are met', () => {
    // P1 + P2 + P3 + P4 all technically applicable
    const state = produce(activeState(), s => {
      // P1: compromised node
      const n = s.network.nodes['contractor_portal'];
      if (n) {
        n.compromised = true;
        n.compromisedAtTurn = 1;
        n.layer = 1;
      }
      // P2: obtained credential
      s.player.credentials[0].obtained = true;
      s.player.credentials[0].revoked = false;
      // P3: pending delete
      const vn = s.network.nodes['vpn_gateway'];
      if (vn) {
        vn.files.push({
          name: 'del.txt',
          path: '/tmp/del.txt',
          type: 'document',
          content: 'x',
          exfiltrable: true,
          accessRequired: 'user',
        });
      }
      s.sentinel.pendingFileDeletes.push({
        filePath: '/tmp/del.txt',
        nodeId: 'vpn_gateway',
        targetTurn: 0,
      });
    });
    const result = runSentinelTurn(state);
    expect(result.state.sentinel.mutationLog).toHaveLength(1);
    expect(result.state.sentinel.mutationLog[0].action).toBe('patch_node');
  });
});

describe('runSentinelTurn — priority 1: reduce tie-break branches', () => {
  it('should prefer the node with a lower compromisedAtTurn when the other has a higher value', () => {
    // Two compromised nodes: nodeA (turn 5) and nodeB (turn 3).
    // nodeB has a lower turn — sentinel should pick nodeA (most recent = highest turn).
    const state = produce(activeState(), s => {
      const nodeA = s.network.nodes['contractor_portal'];
      if (nodeA) {
        nodeA.compromised = true;
        nodeA.compromisedAtTurn = 5;
        nodeA.layer = 1;
      }
      const nodeB = s.network.nodes['vpn_gateway'];
      if (nodeB) {
        nodeB.compromised = true;
        nodeB.compromisedAtTurn = 3;
        nodeB.layer = 1;
        nodeB.discovered = true;
      }
    });
    const result = runSentinelTurn(state);
    // nodeA has higher compromisedAtTurn → most recently compromised → should be patched
    expect(result.state.network.nodes['contractor_portal']?.sentinelPatched).toBe(true);
    expect(result.state.network.nodes['vpn_gateway']?.sentinelPatched).toBeFalsy();
  });

  it('should use id ascending as tie-break when compromisedAtTurn values are equal', () => {
    // Two compromised nodes with the same compromisedAtTurn — pick lower id alphabetically.
    // contractor_portal < vpn_gateway alphabetically so contractor_portal should be picked.
    const state = produce(activeState(), s => {
      const nodeA = s.network.nodes['contractor_portal'];
      if (nodeA) {
        nodeA.compromised = true;
        nodeA.compromisedAtTurn = 5;
        nodeA.layer = 1;
      }
      const nodeB = s.network.nodes['vpn_gateway'];
      if (nodeB) {
        nodeB.compromised = true;
        nodeB.compromisedAtTurn = 5;
        nodeB.layer = 1;
        nodeB.discovered = true;
      }
    });
    const result = runSentinelTurn(state);
    expect(result.state.network.nodes['contractor_portal']?.sentinelPatched).toBe(true);
    expect(result.state.network.nodes['vpn_gateway']?.sentinelPatched).toBeFalsy();
  });
});
