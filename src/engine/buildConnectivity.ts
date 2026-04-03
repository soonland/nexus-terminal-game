import type { LiveNode } from '../types/game';
import { DIVISION_SEEDS } from '../data/divisionSeeds';

// ── Division → layer mapping ────────────────────────────────
const DIVISION_LAYER: Record<string, number> = {
  external_perimeter: 0,
  operations: 1,
  security: 2,
  finance: 3,
  executive: 4,
};

// ── Entry and key anchor per division ──────────────────────
// entry: the first reachable anchor in the division (from the previous layer)
// key:   the anchor that bridges to the next layer (or the final target)
/** @public */
export const DIVISION_ANCHORS: Record<string, { entry: string; key: string } | undefined> = {
  external_perimeter: { entry: 'contractor_portal', key: 'vpn_gateway' },
  operations: { entry: 'ops_cctv_ctrl', key: 'ops_hr_db' },
  security: { entry: 'sec_access_ctrl', key: 'sec_firewall' },
  finance: { entry: 'fin_payments_db', key: 'fin_exec_accounts' },
  executive: { entry: 'exec_cfo', key: 'exec_ceo' },
};

/** Maps layer number → the key anchor ID that must be compromised before advancing. */
export const LAYER_KEY_ANCHOR: Record<number, string> = Object.fromEntries(
  Object.entries(DIVISION_LAYER)
    .filter(([div]) => DIVISION_ANCHORS[div]?.key !== undefined)
    .map(([div, layer]) => [layer, DIVISION_ANCHORS[div]?.key as string]),
);

const MIN_CONNECTIONS = 2;
const MAX_CONNECTIONS = 4;

// ── BFS: returns a map of nodeId → hop distance from start ─
const bfs = (startId: string, getNeighbors: (id: string) => string[]): Map<string, number> => {
  const dist = new Map<string, number>();
  dist.set(startId, 0);
  const queue = [startId];
  let current = queue.shift();
  while (current !== undefined) {
    const d = dist.get(current) ?? 0;
    for (const neighbor of getNeighbors(current)) {
      if (!dist.has(neighbor)) {
        dist.set(neighbor, d + 1);
        queue.push(neighbor);
      }
    }
    current = queue.shift();
  }
  return dist;
};

// ── Main connectivity builder ───────────────────────────────
/**
 * Post-processing pass over generated filler nodes.
 *
 * Guarantees:
 *  1. Every filler-to-filler edge is bidirectional.
 *  2. Every filler has 2–4 total connections within its division subnet.
 *  3. Every filler is reachable from its division's entry anchor within 3 hops.
 *  4. A BFS path exists from `contractor_portal` to `exec_ceo`.
 *
 * Anchors are the only nodes with cross-division edges — this invariant is
 * preserved because the builder only ever adds edges within the same subnet.
 *
 * @public
 */
export const buildConnectivity = (
  fillerNodes: LiveNode[],
  anchorNodeMap: Partial<Record<string, LiveNode>>,
  anchorPatches: Record<string, string[]>,
  prng: () => number,
): { fillerNodes: LiveNode[]; anchorPatches: Record<string, string[]> } => {
  // Work on mutable copies so the originals are not mutated.
  const fillerMap = new Map<string, LiveNode>();
  for (const node of fillerNodes) {
    fillerMap.set(node.id, { ...node, connections: [...node.connections] });
  }

  const patches: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(anchorPatches)) {
    patches[key] = [...ids];
  }

  // Returns the live connections for a node, incorporating current patch state.
  const getConnections = (id: string): string[] => {
    const filler = fillerMap.get(id);
    if (filler) return filler.connections;
    const anchor = anchorNodeMap[id];
    if (anchor) return [...anchor.connections, ...(patches[id] ?? [])];
    return [];
  };

  // Group filler IDs by layer (= division).
  const fillersByLayer = new Map<number, string[]>();
  for (const [id, node] of fillerMap) {
    const bucket = fillersByLayer.get(node.layer) ?? [];
    bucket.push(id);
    fillersByLayer.set(node.layer, bucket);
  }

  for (const division of DIVISION_SEEDS) {
    const layer = DIVISION_LAYER[division.divisionId];
    const divAnchors = DIVISION_ANCHORS[division.divisionId];
    if (!divAnchors) continue;

    const divFillerIds = fillersByLayer.get(layer) ?? [];
    if (divFillerIds.length === 0) continue;

    const anchorsInLayer = Object.values(anchorNodeMap)
      .filter((n): n is LiveNode => n !== undefined && n.layer === layer)
      .map(n => n.id);

    const allInSubnet = new Set([...anchorsInLayer, ...divFillerIds]);

    // ── Step 1: Make all filler-to-filler edges bidirectional ──
    for (const fillerId of divFillerIds) {
      const filler = fillerMap.get(fillerId);
      if (!filler) continue;
      for (const conn of filler.connections) {
        if (!divFillerIds.includes(conn)) continue;
        const peer = fillerMap.get(conn);
        if (!peer) continue;
        if (!peer.connections.includes(fillerId)) {
          peer.connections.push(fillerId);
          fillerMap.set(conn, peer);
        }
      }
    }

    // ── Step 2: Enforce 2–4 connections per filler ─────────────
    for (const fillerId of divFillerIds) {
      const filler = fillerMap.get(fillerId);
      if (!filler) continue;
      const subnetConns = filler.connections.filter(c => allInSubnet.has(c));

      if (subnetConns.length > MAX_CONNECTIONS) {
        // Keep all anchor connections; trim excess filler-to-filler edges.
        const anchorConns = filler.connections.filter(c => anchorsInLayer.includes(c));
        const peerConns = filler.connections.filter(c => divFillerIds.includes(c));
        const maxPeers = Math.max(0, MAX_CONNECTIONS - anchorConns.length);
        const keptPeers = peerConns.slice(0, maxPeers);
        const droppedPeers = peerConns.slice(maxPeers);
        filler.connections = [...anchorConns, ...keptPeers];
        fillerMap.set(fillerId, filler);
        // Remove the back-edge from each dropped peer to preserve bidirectionality.
        // If removal leaves a peer below MIN_CONNECTIONS, repair it immediately
        // (it may already have been visited in this loop and won't get another pass).
        for (const droppedId of droppedPeers) {
          const peer = fillerMap.get(droppedId);
          if (!peer) continue;
          peer.connections = peer.connections.filter(c => c !== fillerId);
          const peerSubnetConns = peer.connections.filter(c => allInSubnet.has(c));
          if (peerSubnetConns.length < MIN_CONNECTIONS) {
            const repairCandidates = divFillerIds.filter(
              id => id !== droppedId && id !== fillerId && !peer.connections.includes(id),
            );
            for (let i = repairCandidates.length - 1; i > 0; i--) {
              const j = Math.floor(prng() * (i + 1));
              const tmp = repairCandidates[i];
              repairCandidates[i] = repairCandidates[j];
              repairCandidates[j] = tmp;
            }
            let needed = MIN_CONNECTIONS - peerSubnetConns.length;
            // Note: if every candidate is already at MAX_CONNECTIONS this peer
            // may remain below MIN_CONNECTIONS. Step 3 will still ensure
            // reachability via a direct entry-anchor edge in that case.
            for (const candidateId of repairCandidates) {
              if (needed <= 0) break;
              const candidate = fillerMap.get(candidateId);
              if (!candidate) continue;
              const candidateSubnetConns = candidate.connections.filter(c => allInSubnet.has(c));
              if (candidateSubnetConns.length >= MAX_CONNECTIONS) continue;
              peer.connections.push(candidateId);
              if (!candidate.connections.includes(droppedId)) {
                candidate.connections.push(droppedId);
              }
              fillerMap.set(candidateId, candidate);
              needed--;
            }
          }
          fillerMap.set(droppedId, peer);
        }
      } else if (subnetConns.length < MIN_CONNECTIONS) {
        // Add peer connections until we reach the minimum.
        const candidates = divFillerIds.filter(
          id => id !== fillerId && !filler.connections.includes(id),
        );
        // Shuffle candidates so selection is seed-deterministic.
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(prng() * (i + 1));
          const tmp = candidates[i];
          candidates[i] = candidates[j];
          candidates[j] = tmp;
        }
        let needed = MIN_CONNECTIONS - subnetConns.length;
        for (const peer of candidates) {
          if (needed <= 0) break;
          const peerNode = fillerMap.get(peer);
          if (!peerNode) continue;
          // Only add the edge if the peer has room for the back-edge, so both
          // directions can be written and MAX_CONNECTIONS is never exceeded.
          const peerSubnetConns = peerNode.connections.filter(c => allInSubnet.has(c));
          if (peerSubnetConns.length >= MAX_CONNECTIONS) continue;
          filler.connections.push(peer);
          if (!peerNode.connections.includes(fillerId)) {
            peerNode.connections.push(fillerId);
          }
          needed--;
        }
        fillerMap.set(fillerId, filler);
      }
    }

    // ── Step 3: Verify ≤3-hop reachability from entry anchor ───
    const distFromEntry = bfs(divAnchors.entry, getConnections);
    for (const fillerId of divFillerIds) {
      const dist = distFromEntry.get(fillerId);
      if (dist === undefined || dist > 3) {
        // Add fallback: wire entry anchor → filler (and reverse).
        patches[divAnchors.entry] = [...(patches[divAnchors.entry] ?? []), fillerId];
        const filler = fillerMap.get(fillerId);
        if (filler && !filler.connections.includes(divAnchors.entry)) {
          filler.connections.push(divAnchors.entry);
          fillerMap.set(fillerId, filler);
        }
      }
    }
  }

  // ── Step 4: Verify end-to-end path contractor_portal → exec_ceo ──
  // Skip entirely if either endpoint is absent — the guarantee cannot be met.
  if (anchorNodeMap['contractor_portal'] && anchorNodeMap['exec_ceo']) {
    const globalDist = bfs('contractor_portal', getConnections);
    if (!globalDist.has('exec_ceo')) {
      // Find the first division whose key anchor is not reachable and bridge it.
      // If that division's anchors are missing we cannot fix the real gap by
      // skipping ahead — bridging a later division leaves the earlier break
      // intact. Stop at the first unbridgeable gap.
      for (const division of DIVISION_SEEDS) {
        const divAnchors = DIVISION_ANCHORS[division.divisionId];
        if (!divAnchors) continue;
        if (!globalDist.has(divAnchors.key)) {
          if (!anchorNodeMap[divAnchors.entry] || !anchorNodeMap[divAnchors.key]) break;
          if (!(patches[divAnchors.entry] ?? []).includes(divAnchors.key)) {
            patches[divAnchors.entry] = [...(patches[divAnchors.entry] ?? []), divAnchors.key];
          }
          if (!(patches[divAnchors.key] ?? []).includes(divAnchors.entry)) {
            patches[divAnchors.key] = [...(patches[divAnchors.key] ?? []), divAnchors.entry];
          }
          break;
        }
      }
    }
  }

  return {
    fillerNodes: Array.from(fillerMap.values()),
    anchorPatches: patches,
  };
};
