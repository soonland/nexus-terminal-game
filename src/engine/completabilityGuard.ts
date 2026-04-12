import type { GameState } from '../types/game';
import { LAYER_KEY_ANCHOR } from './buildConnectivity';

// ── Internal BFS ───────────────────────────────────────────────────────────
// Returns a map of nodeId → hop distance from startId.

const bfsDistances = (
  startId: string,
  nodes: GameState['network']['nodes'],
): Map<string, number> => {
  const dist = new Map<string, number>();
  dist.set(startId, 0);
  const queue: string[] = [startId];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const d = dist.get(current) ?? 0;
    for (const neighbor of nodes[current]?.connections ?? []) {
      if (!dist.has(neighbor)) {
        dist.set(neighbor, d + 1);
        queue.push(neighbor);
      }
    }
  }
  return dist;
};

// Minimum exploit charge cost to compromise a node via its cheapest exploitable service.
// Mirrors cmdExploit: a service is exploitable only when vulnerable AND not patched.
// Returns Infinity if the node has no exploitable services.
const minExploitCostForNode = (nodeId: string, nodes: GameState['network']['nodes']): number => {
  const node = nodes[nodeId];
  if (!node) return Infinity;
  const exploitableCosts = node.services
    .filter(s => s.vulnerable && !s.patched)
    .map(s => s.exploitCost);
  if (exploitableCosts.length === 0) return Infinity;
  const base = Math.min(...exploitableCosts);
  return base + (node.sentinelPatched ? 1 : 0);
};

// ── Exported check functions ───────────────────────────────────────────────

/**
 * Check 1 (§9.5): A BFS path from the player's current node to the current
 * layer's key anchor still exists in the live network.
 */
export const check1PathExists = (state: GameState): boolean => {
  const currentNodeId = state.network.currentNodeId;
  const currentNode = state.network.nodes[currentNodeId];
  if (!currentNode) return false;

  const keyAnchorId = LAYER_KEY_ANCHOR[currentNode.layer];
  if (!keyAnchorId) return true; // layer has no key anchor (e.g., Aria subnet — layer 5)
  if (currentNodeId === keyAnchorId) return true;

  const dist = bfsDistances(currentNodeId, state.network.nodes);
  return dist.has(keyAnchorId);
};

/**
 * Check 2 (§9.5): At least one valid, unexpired credential OR at least one
 * available exploit charge exists that can be used on a BFS-reachable node.
 * (Credentials are accepted on any reachable node — check3 handles path-specific
 * charge sufficiency.)
 */
export const check2CredentialOrCharge = (state: GameState): boolean => {
  // Any remaining exploit charge satisfies this check — the player can exploit something.
  if (state.player.charges > 0) return true;

  const currentNodeId = state.network.currentNodeId;
  const currentNode = state.network.nodes[currentNodeId];
  if (!currentNode) return false;

  const keyAnchorId = LAYER_KEY_ANCHOR[currentNode.layer];
  if (!keyAnchorId) return true;

  // Check if the player holds a non-revoked, obtained credential valid on any
  // node reachable from their current position.
  const reachable = bfsDistances(currentNodeId, state.network.nodes);
  return state.player.credentials.some(
    c => c.obtained && !c.revoked && c.validOnNodes.some(nodeId => reachable.has(nodeId)),
  );
};

/**
 * Check 3 (§9.5): The player's remaining exploit charges are sufficient to
 * compromise the layer key anchor if it is not yet compromised and no valid
 * credential covers it.
 *
 * `connect` only requires a discovered node and a direct edge — it does NOT
 * require intermediate hops to be compromised. Only the key anchor itself
 * must be compromiseable, so chargesNeeded is based solely on that node.
 */
export const check3ChargesSufficient = (state: GameState): boolean => {
  const currentNodeId = state.network.currentNodeId;
  const currentNode = state.network.nodes[currentNodeId];
  if (!currentNode) return false;

  const keyAnchorId = LAYER_KEY_ANCHOR[currentNode.layer];
  if (!keyAnchorId) return true;

  const keyAnchor = state.network.nodes[keyAnchorId];
  if (!keyAnchor) return false;

  // Key anchor already controlled — no charges needed.
  if (keyAnchor.compromised) return true;

  // Player has a valid credential for the key anchor — no exploit needed.
  const hasCred = state.player.credentials.some(
    c => c.obtained && !c.revoked && c.validOnNodes.includes(keyAnchorId),
  );
  if (hasCred) return true;

  // Player must be able to exploit the key anchor directly.
  const chargesNeeded = minExploitCostForNode(keyAnchorId, state.network.nodes);
  return state.player.charges >= chargesNeeded;
};

// ── Aggregate guard ────────────────────────────────────────────────────────

/**
 * Returns true if all three §9.5 completability checks pass for the given state.
 * Call this after every mutation; roll back the mutation (discard the new state)
 * if this returns false.
 */
export const isGameCompletable = (state: GameState): boolean =>
  check1PathExists(state) && check2CredentialOrCharge(state) && check3ChargesSufficient(state);
