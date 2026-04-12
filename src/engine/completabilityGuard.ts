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

// Returns the shortest path as an ordered array [start, …, end], or null if unreachable.
const shortestPath = (
  startId: string,
  endId: string,
  nodes: GameState['network']['nodes'],
): string[] | null => {
  if (startId === endId) return [startId];
  const parent = new Map<string, string>();
  const visited = new Set<string>([startId]);
  const queue: string[] = [startId];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    for (const neighbor of nodes[current]?.connections ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parent.set(neighbor, current);
        if (neighbor === endId) {
          const path: string[] = [];
          let n: string | undefined = endId;
          while (n !== undefined) {
            path.unshift(n);
            n = parent.get(n);
          }
          return path;
        }
        queue.push(neighbor);
      }
    }
  }
  return null;
};

// Minimum exploit charge cost to compromise a node via its cheapest vulnerable service.
// Returns Infinity if the node has no vulnerable services.
const minExploitCostForNode = (nodeId: string, nodes: GameState['network']['nodes']): number => {
  const node = nodes[nodeId];
  if (!node) return Infinity;
  const vulnerableCosts = node.services.filter(s => s.vulnerable).map(s => s.exploitCost);
  if (vulnerableCosts.length === 0) return Infinity;
  const base = Math.min(...vulnerableCosts);
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
 * available exploit charge can be applied to a node on the path to the key anchor.
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
 * traverse the shortest path to the key anchor, OR an exploit-kit tool file
 * is findable within 3 hops of the current node.
 */
export const check3ChargesSufficient = (state: GameState): boolean => {
  const currentNodeId = state.network.currentNodeId;
  const currentNode = state.network.nodes[currentNodeId];
  if (!currentNode) return false;

  const keyAnchorId = LAYER_KEY_ANCHOR[currentNode.layer];
  if (!keyAnchorId) return true;

  // An exploit-kit tool file within 3 hops of the current node means the player
  // can recover charge capability before they need it.
  const dist = bfsDistances(currentNodeId, state.network.nodes);
  const exploitKitNearby = [...dist.entries()].some(([nodeId, d]) => {
    if (d > 3) return false;
    return (
      state.network.nodes[nodeId]?.files.some(
        f => f.isTool && f.toolId === 'exploit-kit' && !f.deleted,
      ) ?? false
    );
  });
  if (exploitKitNearby) return true;

  // Sum the minimum exploit charges required for each node on the shortest path
  // that the player cannot already access via credential or existing compromise.
  const path = shortestPath(currentNodeId, keyAnchorId, state.network.nodes);
  if (!path) return false; // defensive: no path (Check 1 would have caught this)

  let chargesNeeded = 0;
  for (const nodeId of path) {
    const node = state.network.nodes[nodeId];
    if (!node) continue;
    if (node.compromised) continue; // already controlled — free to traverse
    const hasCred = state.player.credentials.some(
      c => c.obtained && !c.revoked && c.validOnNodes.includes(nodeId),
    );
    if (hasCred) continue;
    chargesNeeded += minExploitCostForNode(nodeId, state.network.nodes);
  }

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
