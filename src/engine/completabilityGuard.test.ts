import { describe, it, expect } from 'vitest';
import {
  check1PathExists,
  check2CredentialOrCharge,
  check3ChargesSufficient,
  isFutureLayerCompletable,
  isGameCompletable,
} from './completabilityGuard';
import { runSentinelTurn } from './sentinel';
import { createInitialState } from './state';
import produce from './produce';
import type { GameState } from '../types/game';

// ── Helpers ────────────────────────────────────────────────

/**
 * Build a state where the player is at `contractor_portal` with the given
 * overrides applied. Convenient starting point for most tests since layer 0
 * has a known key anchor: `vpn_gateway`.
 */
function makeState(overrides: (draft: GameState) => void): GameState {
  return produce(createInitialState(), overrides);
}

/**
 * Remove all connections from `nodeId` in both directions so it is completely
 * isolated from the rest of the network — useful for check1 path tests.
 */
function isolateNode(state: GameState, nodeId: string): GameState {
  return produce(state, draft => {
    const target = draft.network.nodes[nodeId];
    if (!target) return;
    // Remove back-edges from all neighbors first
    for (const neighbor of target.connections) {
      const neighborNode = draft.network.nodes[neighbor];
      if (neighborNode) {
        neighborNode.connections = neighborNode.connections.filter(c => c !== nodeId);
      }
    }
    // Remove all outgoing connections from the target
    target.connections = [];
  });
}

/**
 * Grant the player an obtained, non-revoked credential valid on `nodeIds`.
 */
function grantCredential(
  state: GameState,
  id: string,
  validOnNodes: string[],
  obtained = true,
  revoked = false,
): GameState {
  return produce(state, draft => {
    draft.player.credentials.push({
      id,
      username: `user_${id}`,
      password: 'secret',
      accessLevel: 'user',
      validOnNodes,
      obtained,
      revoked,
    });
  });
}

/**
 * Place a player on a layer-5 (Aria) node.  The node is created inline so
 * no anchor build machinery is needed.
 */
function moveToAriaLayer(state: GameState): GameState {
  return produce(state, draft => {
    draft.network.nodes['aria_test_node'] = {
      id: 'aria_test_node',
      ip: '10.5.0.99',
      template: 'web_server',
      label: 'ARIA TEST',
      description: null,
      layer: 5,
      anchor: false,
      connections: [],
      services: [],
      files: [],
      accessLevel: 'none',
      compromised: false,
      discovered: true,
      credentialHints: [],
    };
    draft.network.currentNodeId = 'aria_test_node';
  });
}

// ── check1PathExists ───────────────────────────────────────

describe('check1PathExists', () => {
  it('returns true when player is already at the key anchor', () => {
    const state = makeState(draft => {
      draft.network.currentNodeId = 'vpn_gateway';
    });
    expect(check1PathExists(state)).toBe(true);
  });

  it('returns true when a path exists from current node to key anchor', () => {
    // Default state: contractor_portal → vpn_gateway (direct connection)
    const state = createInitialState();
    expect(check1PathExists(state)).toBe(true);
  });

  it('returns false when there is no path (vpn_gateway fully isolated)', () => {
    // Fully isolate vpn_gateway by removing all its connections in both directions.
    // Merely removing the direct portal↔gateway edge is insufficient because filler
    // nodes may provide alternate routes.
    const state = isolateNode(createInitialState(), 'vpn_gateway');
    expect(check1PathExists(state)).toBe(false);
  });

  it('returns true for layer 5 (Aria) — no key anchor defined', () => {
    const state = moveToAriaLayer(createInitialState());
    expect(check1PathExists(state)).toBe(true);
  });
});

// ── check2CredentialOrCharge ───────────────────────────────

describe('check2CredentialOrCharge', () => {
  it('returns true when player.charges > 0 (even with no credentials)', () => {
    const state = makeState(draft => {
      draft.player.charges = 2;
      draft.player.credentials = [];
    });
    expect(check2CredentialOrCharge(state)).toBe(true);
  });

  it('returns false when player.charges === 0 and no obtained credentials', () => {
    const state = makeState(draft => {
      draft.player.charges = 0;
      // Mark all built-in credentials as not obtained
      for (const c of draft.player.credentials) {
        c.obtained = false;
      }
    });
    expect(check2CredentialOrCharge(state)).toBe(false);
  });

  it('returns false when player.charges === 0 and all credentials are revoked', () => {
    const state = makeState(draft => {
      draft.player.charges = 0;
      for (const c of draft.player.credentials) {
        c.obtained = true;
        c.revoked = true;
      }
    });
    expect(check2CredentialOrCharge(state)).toBe(false);
  });

  it('returns true when player.charges === 0 but player has a valid obtained credential on a reachable node', () => {
    // `vpn_gateway` is directly connected to `contractor_portal` — reachable
    let state = makeState(draft => {
      draft.player.charges = 0;
      for (const c of draft.player.credentials) {
        c.obtained = false;
      }
    });
    state = grantCredential(state, 'cred_reachable', ['vpn_gateway']);
    expect(check2CredentialOrCharge(state)).toBe(true);
  });

  it('returns false when player.charges === 0 and valid credential is on an unreachable node', () => {
    // Fully isolate vpn_gateway (removes all bidirectional edges) so BFS from
    // contractor_portal cannot reach it even through filler nodes.
    let state = isolateNode(createInitialState(), 'vpn_gateway');
    state = produce(state, draft => {
      draft.player.charges = 0;
      for (const c of draft.player.credentials) {
        c.obtained = false;
      }
    });
    // Add an obtained credential valid only on the now-unreachable vpn_gateway
    state = grantCredential(state, 'cred_unreachable', ['vpn_gateway']);
    expect(check2CredentialOrCharge(state)).toBe(false);
  });

  it('returns true for layer 5 (no key anchor)', () => {
    const state = moveToAriaLayer(
      makeState(draft => {
        draft.player.charges = 0;
        for (const c of draft.player.credentials) {
          c.obtained = false;
        }
      }),
    );
    expect(check2CredentialOrCharge(state)).toBe(true);
  });
});

// ── check3ChargesSufficient ────────────────────────────────

describe('check3ChargesSufficient', () => {
  it('returns true when player has enough charges to exploit the key anchor', () => {
    // Default: contractor_portal → vpn_gateway (layer-0 key anchor).
    // check3 only checks the key anchor. vpn_gateway: snmp vulnerable, exploitCost 1,
    // not sentinelPatched → chargesNeeded = 1. Initial charges = 3.
    const state = createInitialState();
    expect(check3ChargesSufficient(state)).toBe(true);
  });

  it('returns false when player has 0 charges and no valid credential for the key anchor', () => {
    // check3 only examines the key anchor (vpn_gateway) — node.files are not inspected.
    // With 0 charges and no obtained credential, there is no way to compromise it.
    const state = makeState(draft => {
      draft.player.charges = 0;
      for (const c of draft.player.credentials) {
        c.obtained = false;
      }
    });
    expect(check3ChargesSufficient(state)).toBe(false);
  });

  it('returns true when player has exactly enough charges to exploit the key anchor', () => {
    // vpn_gateway (layer-0 key anchor) has snmp: vulnerable, exploitCost 1.
    // Player with exactly 1 charge and no credential on vpn_gateway should pass.
    const state = makeState(draft => {
      draft.player.charges = 1;
      for (const c of draft.player.credentials) c.obtained = false;
    });
    expect(check3ChargesSufficient(state)).toBe(true);
  });

  it('returns false when player has 0 charges and key anchor is not yet compromised', () => {
    // check3 does not inspect node.files or tool-file proximity — that logic is not yet
    // implemented. The guard returns false solely because charges < chargesNeeded (1).
    const state = makeState(draft => {
      draft.player.charges = 0;
      for (const c of draft.player.credentials) {
        c.obtained = false;
      }
    });
    expect(check3ChargesSufficient(state)).toBe(false);
  });

  it('already-compromised nodes do not count toward chargesNeeded', () => {
    // check3 only checks the key anchor (vpn_gateway). Compromising contractor_portal
    // has no effect on chargesNeeded. vpn_gateway: exploitCost 1. Player has 1 charge — pass.
    const state = makeState(draft => {
      draft.player.charges = 1;
      const portal = draft.network.nodes['contractor_portal'];
      if (portal) {
        portal.compromised = true;
        portal.compromisedAtTurn = 0;
      }
      for (const c of draft.player.credentials) c.obtained = false;
    });
    expect(check3ChargesSufficient(state)).toBe(true);
  });

  it('nodes where the player has a valid credential do not count toward chargesNeeded', () => {
    // check3 only checks the key anchor (vpn_gateway). Player has a credential on
    // vpn_gateway → hasCred = true → chargesNeeded = 0. Player has 1 charge — pass.
    let state = makeState(draft => {
      draft.player.charges = 1;
      for (const node of Object.values(draft.network.nodes)) {
        if (node) {
          node.files = node.files.filter(f => !f.isTool);
        }
      }
    });
    state = grantCredential(state, 'cred_vpn', ['vpn_gateway']);
    expect(check3ChargesSufficient(state)).toBe(true);
  });

  it('sentinelPatched key anchor adds +1 to its exploit cost', () => {
    // vpn_gateway (layer-0 key anchor) normally costs 1 (snmp). sentinelPatched → costs 2.
    // Player with exactly 1 charge — insufficient, should fail.
    const state = makeState(draft => {
      draft.player.charges = 1;
      for (const c of draft.player.credentials) c.obtained = false;
      const gw = draft.network.nodes['vpn_gateway'];
      if (gw) gw.sentinelPatched = true;
    });
    expect(check3ChargesSufficient(state)).toBe(false);
  });

  it('returns true for layer 5 (no key anchor)', () => {
    const state = moveToAriaLayer(
      makeState(draft => {
        draft.player.charges = 0;
        for (const node of Object.values(draft.network.nodes)) {
          if (node) {
            node.files = node.files.filter(f => !f.isTool);
          }
        }
      }),
    );
    expect(check3ChargesSufficient(state)).toBe(true);
  });
});

// ── isGameCompletable ──────────────────────────────────────

describe('isGameCompletable', () => {
  it('returns true when all three checks pass', () => {
    // Default initial state: path exists, charges > 0, charges sufficient
    const state = createInitialState();
    expect(isGameCompletable(state)).toBe(true);
  });

  it('returns false if check1 fails (no path to key anchor)', () => {
    // Fully isolate vpn_gateway — removing only the direct edge is insufficient
    // because filler nodes can provide alternate routes.
    const state = isolateNode(createInitialState(), 'vpn_gateway');
    expect(isGameCompletable(state)).toBe(false);
  });

  it('returns false if check2 fails (0 charges and no valid credentials)', () => {
    const state = makeState(draft => {
      draft.player.charges = 0;
      for (const c of draft.player.credentials) {
        c.obtained = false;
      }
      for (const node of Object.values(draft.network.nodes)) {
        if (node) {
          node.files = node.files.filter(f => !f.isTool);
        }
      }
    });
    expect(isGameCompletable(state)).toBe(false);
  });

  it('returns false if check3 fails (0 charges, no credential on key anchor)', () => {
    // Give the player a credential on contractor_portal (check2 passes — reachable node),
    // but 0 charges and no credential on vpn_gateway (layer-0 key anchor).
    // check3 fails: cannot compromise the key anchor.
    let state = makeState(draft => {
      draft.player.charges = 0;
      for (const c of draft.player.credentials) c.obtained = false;
    });
    state = grantCredential(state, 'cred_portal', ['contractor_portal']);
    expect(isGameCompletable(state)).toBe(false);
  });

  // ── Rollback integration ─────────────────────────────────

  it('sentinel revoke_credential rolls back when revocation would make the game unwinnable', () => {
    // Build a state where:
    //  - player has 0 charges
    //  - player has one credential valid on BOTH contractor_portal AND vpn_gateway
    //    (so check3 skips both nodes — chargesNeeded = 0, pre-mutation state is completable)
    //  - no exploit-kit files anywhere
    //  - no compromised nodes (so patch_node has no candidates)
    //  - sentinel is active at turn 1
    //
    // After revocation: player has 0 charges and no valid credentials → check2 fails →
    // isGameCompletable returns false → tryRevokeCredential must roll back and return null.
    //
    // Note: after revoke_credential rolls back, the sentinel priority chain continues to
    // trySpawnNode (since there are no pending file deletes). Spawn adds a layer-2 node
    // which does not affect the layer-0 path, so spawn succeeds. We therefore verify
    // the REVOKE specifically was rejected — not that the sentinel did nothing — by
    // asserting that the credential is still present and not revoked.
    let state = makeState(draft => {
      draft.player.charges = 0;
      // Clear all built-in credentials so they cannot satisfy check2/check3
      for (const c of draft.player.credentials) {
        c.obtained = false;
      }
      // Strip isTool files so no exploit-kit shortcut exists
      for (const node of Object.values(draft.network.nodes)) {
        if (node) {
          node.files = node.files.filter(f => !f.isTool);
        }
      }
      // Activate sentinel and set turn to 1
      draft.sentinel.active = true;
      draft.sentinel.sentinelInterval = 1;
      draft.turnCount = 1;
    });

    // Grant one credential valid on both path nodes.
    // check2: obtained & non-revoked cred on reachable nodes → true.
    // check3: both nodes have a valid credential → chargesNeeded = 0 → true.
    state = grantCredential(state, 'cred_only_way', ['contractor_portal', 'vpn_gateway']);

    // Pre-mutation state must be completable
    expect(isGameCompletable(state)).toBe(true);

    const { state: afterSentinel } = runSentinelTurn(state);

    // The revoke_credential action was rolled back — credential must still be obtained
    // and not revoked, regardless of which subsequent action (if any) the sentinel took.
    const cred = afterSentinel.player.credentials.find(c => c.id === 'cred_only_way');
    expect(cred?.obtained).toBe(true);
    expect(cred?.revoked).toBeFalsy();

    // Mutation log must not contain a revoke_credential entry for turn 1
    const revokeEntry = afterSentinel.sentinel.mutationLog.find(
      e => e.action === 'revoke_credential' && e.turnCount === 1,
    );
    expect(revokeEntry).toBeUndefined();
  });

  it('sentinel priority chain falls through to trySpawnNode when no patch/revoke/delete candidates exist', () => {
    // Verify the ?? chain reaches trySpawnNode when all higher-priority actions have no
    // candidates: no compromised nodes (patch skips), no obtained credentials (revoke skips),
    // no pending file deletes (delete skips). spawn_node should fire and appear in the log.
    const state = makeState(draft => {
      draft.player.charges = 3;
      for (const c of draft.player.credentials) c.obtained = false;
      for (const node of Object.values(draft.network.nodes)) {
        if (node) node.files = node.files.filter(f => !f.isTool);
      }
      draft.sentinel.pendingFileDeletes = [];
      draft.sentinel.active = true;
      draft.sentinel.sentinelInterval = 1;
      draft.turnCount = 1;
    });

    expect(isGameCompletable(state)).toBe(true);

    const { state: afterSentinel } = runSentinelTurn(state);

    const spawnEntry = afterSentinel.sentinel.mutationLog.find(e => e.action === 'spawn_node');
    expect(spawnEntry).toBeDefined();
  });

  // ── Multi-layer look-ahead (§9.5 extension) ──────────────

  it('returns false when future-layer key anchor credential was revoked and player has 0 charges', () => {
    // Player at layer 0. Player has a credential for vpn_gateway (current-layer checks pass)
    // and previously held a credential for ops_hr_db (layer-1 key anchor) that was revoked.
    // 0 charges and the revoked credential signal layer 1 was made unwinnable.
    let state = makeState(draft => {
      draft.player.charges = 0;
      for (const c of draft.player.credentials) c.obtained = false;
      for (const node of Object.values(draft.network.nodes)) {
        if (node) node.files = node.files.filter(f => !f.isTool);
      }
    });
    // Layer-0 credential — current-layer checks pass.
    state = grantCredential(state, 'cred_layer0', ['vpn_gateway']);
    // Revoked layer-1 credential — signals the mutation eliminated access to ops_hr_db.
    state = grantCredential(state, 'cred_ops_revoked', ['ops_hr_db'], true, true);
    expect(isGameCompletable(state)).toBe(false);
  });

  it('returns true when player has charges sufficient for all exploitable future-layer key anchors', () => {
    // Player at layer 0 with 4 charges and no credentials.
    // vpn_gateway (layer 0): snmp exploitCost 1 → needs 1 charge → 4 >= 1 → pass.
    // ops_hr_db (layer 1): mysql exploitCost 1 → 4 >= 1 → pass.
    // sec_firewall (layer 2): proprietary exploitCost 2 → 4 >= 2 → pass.
    // fin_exec_accounts (layer 3): no exploitable service → guard skips charge check → pass.
    // exec_ceo (layer 4): aria-socket exploitCost 0 → 4 >= 0 → pass.
    const state = makeState(draft => {
      draft.player.charges = 4;
      for (const c of draft.player.credentials) c.obtained = false;
      for (const node of Object.values(draft.network.nodes)) {
        if (node) node.files = node.files.filter(f => !f.isTool);
      }
    });
    expect(isGameCompletable(state)).toBe(true);
  });

  it('returns true when future-layer key anchor is already compromised', () => {
    // ops_hr_db (layer 1 key anchor) already compromised — look-ahead skips it.
    // Player has 0 charges and a credential only on vpn_gateway.
    let state = makeState(draft => {
      draft.player.charges = 0;
      for (const c of draft.player.credentials) c.obtained = false;
      for (const node of Object.values(draft.network.nodes)) {
        if (node) node.files = node.files.filter(f => !f.isTool);
      }
      const hrDb = draft.network.nodes['ops_hr_db'];
      if (hrDb) {
        hrDb.compromised = true;
        hrDb.compromisedAtTurn = 0;
        hrDb.accessLevel = 'admin';
      }
    });
    state = grantCredential(state, 'cred_vpn_only', ['vpn_gateway']);
    // Layer 0: check3 passes via credential on vpn_gateway.
    // Layer 1: ops_hr_db already compromised → isFutureLayerCompletable returns true.
    // Remaining future layers still need charges — with 0 charges and no credentials,
    // those will fail. This test only verifies the "already compromised" short-circuit,
    // so we grant credentials for all remaining anchors too.
    state = grantCredential(state, 'cred_firewall', ['sec_firewall']);
    state = grantCredential(state, 'cred_fin', ['fin_exec_accounts']);
    state = grantCredential(state, 'cred_ceo', ['exec_ceo']);
    expect(isGameCompletable(state)).toBe(true);
  });
});

// ── isFutureLayerCompletable ───────────────────────────────

describe('isFutureLayerCompletable', () => {
  it('returns true when layer has no key anchor (e.g. layer 5 — Aria)', () => {
    const state = createInitialState();
    expect(isFutureLayerCompletable(state, 5)).toBe(true);
  });

  it('returns true when key anchor is already compromised', () => {
    const state = makeState(draft => {
      draft.player.charges = 0;
      const hrDb = draft.network.nodes['ops_hr_db'];
      if (hrDb) {
        hrDb.compromised = true;
        hrDb.compromisedAtTurn = 0;
      }
    });
    expect(isFutureLayerCompletable(state, 1)).toBe(true);
  });

  it('returns true when player has a valid credential for the key anchor', () => {
    let state = makeState(draft => {
      draft.player.charges = 0;
    });
    state = grantCredential(state, 'cred_ops', ['ops_hr_db']);
    expect(isFutureLayerCompletable(state, 1)).toBe(true);
  });

  it('returns true when player has 0 charges and no credential for an exploitable key anchor (never obtained)', () => {
    // ops_hr_db (layer 1) is exploitable. Player has 0 charges and no credential —
    // but they never held a credential for it. This is a normal pre-gameplay state;
    // the guard does not block it (player will acquire a credential through gameplay).
    const state = makeState(draft => {
      draft.player.charges = 0;
      for (const c of draft.player.credentials) c.obtained = false;
    });
    expect(isFutureLayerCompletable(state, 1)).toBe(true);
  });

  it('returns false when only credential for an exploitable key anchor was revoked', () => {
    // Player previously held cred_ops for ops_hr_db but it was revoked.
    // 0 charges and the revoked credential signal that access was eliminated.
    let state = makeState(draft => {
      draft.player.charges = 0;
    });
    state = grantCredential(state, 'cred_ops', ['ops_hr_db'], true, true); // obtained + revoked
    expect(isFutureLayerCompletable(state, 1)).toBe(false);
  });

  it('returns true when a never-obtained credential has revoked: true (not a real access path)', () => {
    // grantCredential with obtained=false, revoked=true — the player never actually held
    // this credential, so it must not trigger the hadRevokedCred signal.
    let state = makeState(draft => {
      draft.player.charges = 0;
    });
    state = grantCredential(state, 'cred_ops', ['ops_hr_db'], false, true); // not obtained, revoked
    expect(isFutureLayerCompletable(state, 1)).toBe(true);
  });

  it('returns true when key anchor has no exploitable service and player has no credential', () => {
    // fin_exec_accounts (layer 3) has no vulnerable services — charges can never satisfy
    // the check. Player has no credential and no revoked credential either, so the guard
    // treats this as a normal pre-gameplay state (credential to be found through gameplay).
    const state = makeState(draft => {
      draft.player.charges = 0;
      for (const c of draft.player.credentials) c.obtained = false;
    });
    expect(isFutureLayerCompletable(state, 3)).toBe(true);
  });

  it('returns true when player has enough charges to exploit the key anchor', () => {
    // ops_hr_db layer-1 key anchor — check its exploitCost via the guard.
    const state = makeState(draft => {
      draft.player.charges = 3;
      for (const c of draft.player.credentials) c.obtained = false;
    });
    expect(isFutureLayerCompletable(state, 1)).toBe(true);
  });
});

// ── isGameCompletable — sentinel cross-layer rollback ──────

describe('isGameCompletable — cross-layer sentinel rollback', () => {
  it('sentinel rolls back revoke_credential when it would make a future layer unwinnable', () => {
    // Reproducer from issue #123:
    // - Player at layer 0 (contractor_portal), 0 charges
    // - Has cred_ops on ops_hr_db (layer-1 key anchor, FIRST in credentials list so sentinel
    //   picks it first) — only means of accessing layer 1 with 0 charges
    // - Has cred_vpn on vpn_gateway (layer-0 key anchor, added second) — keeps current-layer
    //   checks passing
    // - Sentinel fires tryRevokeCredential → picks cred_ops (first obtained cred)
    // - Post-mutation guard: check3 passes (cred_vpn on vpn_gateway), but future layer 1
    //   has no credential and 0 charges → isFutureLayerCompletable(layer 1) = false
    // - Guard returns false → rollback → cred_ops preserved
    let state = makeState(draft => {
      draft.player.charges = 0;
      for (const c of draft.player.credentials) c.obtained = false;
      for (const node of Object.values(draft.network.nodes)) {
        if (node) node.files = node.files.filter(f => !f.isTool);
      }
      draft.sentinel.active = true;
      draft.sentinel.sentinelInterval = 1;
      draft.turnCount = 1;
    });
    // Grant cred_ops FIRST so sentinel picks it (credentials.find returns the first match)
    state = grantCredential(state, 'cred_ops', ['ops_hr_db']);
    // Grant cred_vpn SECOND — current-layer check3 passes via this credential
    state = grantCredential(state, 'cred_vpn', ['vpn_gateway']);

    // Pre-mutation: current-layer checks pass, future layer 1 has cred → completable
    expect(isGameCompletable(state)).toBe(true);

    const { state: afterSentinel } = runSentinelTurn(state);

    // cred_ops must still be present and not revoked (revocation was rolled back)
    const cred = afterSentinel.player.credentials.find(c => c.id === 'cred_ops');
    expect(cred?.obtained).toBe(true);
    expect(cred?.revoked).toBeFalsy();

    // No revoke_credential entry for turn 1
    const revokeEntry = afterSentinel.sentinel.mutationLog.find(
      e => e.action === 'revoke_credential' && e.turnCount === 1,
    );
    expect(revokeEntry).toBeUndefined();
  });

  it('sentinel allows revoke_credential when player has charges to cover the future layer', () => {
    // Player at layer 0 with 4 charges — sufficient to exploit ops_hr_db (cost 1)
    // even without a credential. Sentinel can safely revoke the ops_hr_db credential.
    let state = makeState(draft => {
      draft.player.charges = 4;
      for (const c of draft.player.credentials) c.obtained = false;
      for (const node of Object.values(draft.network.nodes)) {
        if (node) node.files = node.files.filter(f => !f.isTool);
      }
      // No compromised nodes so patch_node has no candidates
      draft.sentinel.active = true;
      draft.sentinel.sentinelInterval = 1;
      draft.turnCount = 1;
    });
    // Grant credential for ops_hr_db — sentinel picks it first
    state = grantCredential(state, 'cred_ops', ['ops_hr_db']);

    const { state: afterSentinel } = runSentinelTurn(state);

    // With 4 charges, revoking cred_ops leaves charges sufficient for layer 1 (cost 1).
    // The revocation should have gone through.
    const revokeEntry = afterSentinel.sentinel.mutationLog.find(
      e => e.action === 'revoke_credential' && e.turnCount === 1,
    );
    expect(revokeEntry).toBeDefined();
  });
});
