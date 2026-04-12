import type { AriaAction, GameState, LiveNode, MutationEvent } from '../types/game';
import { isGameCompletable } from './completabilityGuard';
import produce from './produce';

type AriaLine = { type: 'system'; content: string };

const makeMutationEvent = (
  action: AriaAction,
  turnCount: number,
  extras: Omit<MutationEvent, 'id' | 'agent' | 'action' | 'turnCount' | 'visibleToPlayer'> = {},
): MutationEvent => ({
  id: crypto.randomUUID(),
  agent: 'aria',
  action,
  turnCount,
  visibleToPlayer: false,
  ...extras,
});

// ── Trust 80: remove a sentinel-spawned reinforcement node ────────────────

const tryDeleteReinforcement = (
  state: GameState,
): { state: GameState; lines: AriaLine[] } | null => {
  // Pick the most recently spawned sentinel node (highest trailing index)
  const trailingNum = (id: string) => Number.parseInt(id.match(/_(\d+)$/)?.[1] ?? '0', 10);
  const sentinelNodes = Object.values(state.network.nodes)
    .filter((n): n is LiveNode => !!n && n.id.startsWith('sentinel_node_'))
    .sort((a, b) => trailingNum(b.id) - trailingNum(a.id));

  if (sentinelNodes.length === 0) return null;

  const target = sentinelNodes[0];
  const event = makeMutationEvent('delete_reinforcement', state.turnCount, { nodeId: target.id });

  const next = produce(state, s => {
    // Remove the node from the network (set to undefined to satisfy no-dynamic-delete)
    s.network.nodes[target.id] = undefined;

    // Remove all edges that pointed to this node
    for (const node of Object.values(s.network.nodes)) {
      if (node) {
        node.connections = node.connections.filter(id => id !== target.id);
      }
    }

    s.sentinel.mutationLog.push(event);
  });

  // §9.5: roll back silently if mutation would make the game unwinnable.
  if (!isGameCompletable(next)) return null;

  return { state: next, lines: [] };
};

// ── Trust 60: add shortcut edge to a higher-layer anchor ──────────────────

const tryRerouteEdge = (state: GameState): { state: GameState; lines: AriaLine[] } | null => {
  const currentNode = state.network.nodes[state.network.currentNodeId];
  if (!currentNode) return null;

  // Find anchor nodes at a strictly higher layer, not already directly reachable
  const candidates = Object.values(state.network.nodes)
    .filter(
      (n): n is LiveNode =>
        !!n && n.anchor && n.layer > currentNode.layer && !currentNode.connections.includes(n.id),
    )
    // Prefer the nearest next layer, then alphabetical as tie-break
    .sort((a, b) => a.layer - b.layer || a.id.localeCompare(b.id));

  if (candidates.length === 0) return null;

  const target = candidates[0];
  const event = makeMutationEvent('reroute_edge', state.turnCount, { nodeId: target.id });

  const next = produce(state, s => {
    const node = s.network.nodes[state.network.currentNodeId];
    if (node) {
      node.connections.push(target.id);
    }
    s.sentinel.mutationLog.push(event);
  });

  // §9.5: roll back silently if mutation would make the game unwinnable.
  if (!isGameCompletable(next)) return null;

  return { state: next, lines: [] };
};

// ── Main entry point ──────────────────────────────────────────────────────

export const runAriaTurn = (state: GameState): { state: GameState; lines: AriaLine[] } => {
  if (!state.aria.discovered) return { state, lines: [] };

  const trustScore = state.aria.trustScore;

  // Trust 80: delete a sentinel-spawned reinforcement node.
  // Note: the Faraday cage only lifts on the FREE ending, which ends the run and
  // bypasses withTurn. Cage suppression is not applied here — doing so would
  // permanently block this mutation in all reachable game states.
  if (trustScore >= 80) {
    const result = tryDeleteReinforcement(state);
    if (result) return result;
  }

  // Trust 60: add a shortcut edge to a higher-layer anchor.
  if (trustScore >= 60) {
    const result = tryRerouteEdge(state);
    if (result) return result;
  }

  return { state, lines: [] };
};
