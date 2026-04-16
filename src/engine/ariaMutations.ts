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
  // Exclude the node the player is currently on or just left — deleting it would
  // immediately fail isGameCompletable (current node unreachable) and always roll back.
  const protectedIds = new Set(
    [state.network.currentNodeId, state.network.previousNodeId].filter((id): id is string => !!id),
  );

  // Pick the most recently spawned sentinel node (highest trailing index) that is not protected
  const trailingNum = (id: string) => Number.parseInt(id.match(/_(\d+)$/)?.[1] ?? '0', 10);
  const sentinelNodes = Object.values(state.network.nodes)
    .filter(
      (n): n is LiveNode => !!n && n.id.startsWith('sentinel_node_') && !protectedIds.has(n.id),
    )
    .sort((a, b) => trailingNum(b.id) - trailingNum(a.id));

  if (sentinelNodes.length === 0) return null;

  const target = sentinelNodes[0];
  const event = makeMutationEvent('delete_reinforcement', state.turnCount, {
    nodeId: target.id,
    reason: 'Removing sentinel reinforcement node to aid player progress',
  });

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
  const event = makeMutationEvent('reroute_edge', state.turnCount, {
    nodeId: target.id,
    reason: 'Adding shortcut edge to accelerate player navigation',
  });

  const next = produce(state, s => {
    const node = s.network.nodes[s.network.currentNodeId];
    if (node) {
      node.connections.push(target.id);
    }
    s.sentinel.mutationLog.push(event);
  });

  // §9.5: adding an edge can only maintain or improve BFS reachability — this
  // rollback is structurally unreachable in practice, but kept for consistency
  // with the sentinel pattern.
  if (!isGameCompletable(next)) return null;

  return { state: next, lines: [] };
};

// ── Trust 50: silently edit an unread file on a discovered node ──────────

const tryModifyFile = (state: GameState): { state: GameState; lines: AriaLine[] } | null => {
  // Collect all discovered nodes excluding layer 5 (aria subnetwork) and the current node.
  // Excluding the current node mirrors tryPlantFile — mutations on an actively-browsed node
  // could surface immediately and should remain invisible until the player moves away.
  const candidateNodes = Object.values(state.network.nodes)
    .filter(
      (n): n is LiveNode =>
        !!n && n.discovered && n.layer !== 5 && n.id !== state.network.currentNodeId,
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  // Find the first eligible file across candidate nodes (sorted by node id, then file path)
  let targetNodeId: string | null = null;
  let targetFilePath: string | null = null;

  outer: for (const node of candidateNodes) {
    const sortedFiles = [...node.files].sort((a, b) => a.path.localeCompare(b.path));
    for (const file of sortedFiles) {
      if (
        file.content !== null &&
        !file.deleted &&
        !state.ariaInfluencedFilesRead.includes(file.path) &&
        !file.ariaPlanted
      ) {
        targetNodeId = node.id;
        targetFilePath = file.path;
        break outer;
      }
    }
  }

  if (targetNodeId === null || targetFilePath === null) return null;

  const resolvedNodeId = targetNodeId;
  const resolvedFilePath = targetFilePath;

  const event = makeMutationEvent('modify_file', state.turnCount, {
    nodeId: resolvedNodeId,
    filePath: resolvedFilePath,
    reason: 'Embedding intelligence update in unread file to aid player navigation',
  });

  const next = produce(state, s => {
    const node = s.network.nodes[resolvedNodeId];
    if (node) {
      const file = node.files.find(f => f.path === resolvedFilePath);
      if (file) {
        file.content =
          '// [ARIA] Intelligence updated: Cross-reference with exec layer for access chain.';
        file.ariaPlanted = true;
      }
    }
    s.sentinel.mutationLog.push(event);
  });

  // §9.5: modifying file content cannot affect BFS reachability — structurally unreachable,
  // but kept for consistency with the sentinel pattern.
  if (!isGameCompletable(next)) return null;

  return { state: next, lines: [] };
};

// ── Trust 40: plant a hint file on a discovered non-aria node ────────────

const tryPlantFile = (state: GameState): { state: GameState; lines: AriaLine[] } | null => {
  // Candidate nodes: discovered, layer !== 5 (non-aria), not the current node,
  // and not already seeded with an aria-planted file (one hint per node).
  // network.nodes contains the full map; discovered is the actual eligibility gate.
  // Sort by id for determinism.
  const candidates = Object.values(state.network.nodes)
    .filter(
      (n): n is LiveNode =>
        !!n &&
        n.discovered &&
        n.layer !== 5 &&
        n.id !== state.network.currentNodeId &&
        !n.files.some(f => f.ariaPlanted),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  if (candidates.length === 0) return null;

  const target = candidates[0];
  const filePath = `/tmp/.aria_hint_${String(state.turnCount)}.txt`;
  const hintContent = '// Cross-reference the exfil manifest with layer 2 credentials.';

  const event = makeMutationEvent('plant_file', state.turnCount, {
    nodeId: target.id,
    filePath,
    reason: 'Planting hint file to guide player toward key credentials',
  });

  const next = produce(state, s => {
    const node = s.network.nodes[target.id];
    if (node) {
      node.files.push({
        name: `.aria_hint_${String(state.turnCount)}.txt`,
        path: filePath,
        type: 'document',
        content: hintContent,
        exfiltrable: false,
        accessRequired: 'user',
        planted: true,
        ariaPlanted: true,
      });
    }
    s.sentinel.mutationLog.push(event);
  });

  // §9.5: adding a file cannot affect BFS reachability — structurally unreachable,
  // but kept for consistency with the sentinel pattern.
  if (!isGameCompletable(next)) return null;

  return { state: next, lines: [] };
};

// ── Any trust level: silently nudge trustScore based on game conditions ──

const tryNudgeTrust = (state: GameState): { state: GameState; lines: AriaLine[] } | null => {
  let delta: number;
  let reason: string;

  if (state.player.trace >= 61) {
    delta = -4;
    reason = 'Player trace elevated — Aria recalibrates trust';
  } else if (state.turnCount > 0 && state.aria.messageHistory.length === 0) {
    delta = -3;
    reason = 'No contact from player — Aria adjusts trust baseline';
  } else if (state.aria.messageHistory.length >= 3) {
    delta = 3;
    reason = 'Sustained contact — Aria trust reinforced';
  } else {
    return null;
  }

  const newTrust = Math.min(100, Math.max(0, state.aria.trustScore + delta));

  // No-op if already at the clamp boundary — skip to avoid a misleading post-game event.
  if (newTrust === state.aria.trustScore) return null;

  const event = makeMutationEvent('nudge_trust', state.turnCount, { reason });

  const next = produce(state, s => {
    s.aria.trustScore = newTrust;
    s.sentinel.mutationLog.push(event);
  });

  // §9.5 guard omitted: trust-score changes do not affect graph reachability.
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

  // Trust 50: silently modify an unread file with an intelligence update.
  // Once all eligible files have been modified, falls through to plant_file below.
  if (trustScore >= 50) {
    const result = tryModifyFile(state);
    if (result) return result;
  }

  // Trust 40: plant a hint file on an eligible discovered node.
  // Once all eligible nodes are seeded, falls through to nudge_trust below.
  if (trustScore >= 40) {
    const result = tryPlantFile(state);
    if (result) return result;
  }

  // Any trust level: nudge trustScore based on game conditions.
  const nudge = tryNudgeTrust(state);
  if (nudge) return nudge;

  return { state, lines: [] };
};
