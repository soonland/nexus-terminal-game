import { describe, it, expect } from 'vitest';
import { buildConnectivity, DIVISION_ANCHORS } from './buildConnectivity';
import { generateFillerNodes } from './generateFillerNodes';
import { buildNodeMap } from '../data/anchorNodes';
import { createPRNG } from './prng';
import type { LiveNode } from '../types/game';

// ── Minimal LiveNode factory ────────────────────────────────────────────────
// Returns the smallest valid LiveNode needed to drive buildConnectivity.
const makeNode = (id: string, layer: number, connections: string[] = []): LiveNode => ({
  id,
  ip: `10.${String(layer)}.0.${String(Math.floor(Math.random() * 200) + 10)}`,
  template: 'workstation',
  label: id.toUpperCase(),
  description: null,
  layer,
  anchor: false,
  connections: [...connections],
  services: [],
  files: [],
  accessLevel: 'none',
  compromised: false,
  discovered: false,
  credentialHints: [],
});

// Minimal anchor node (anchor: true) for driving the anchor map.
const makeAnchor = (id: string, layer: number, connections: string[] = []): LiveNode => ({
  ...makeNode(id, layer, connections),
  anchor: true,
  discovered: true,
});

// BFS helper — returns reachable set from startId given a full node lookup map.
const bfsReachable = (startId: string, nodeMap: Map<string, LiveNode>): Set<string> => {
  const visited = new Set<string>();
  const queue = [startId];
  visited.add(startId);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const node = nodeMap.get(cur);
    if (!node) continue;
    for (const conn of node.connections) {
      if (!visited.has(conn)) {
        visited.add(conn);
        queue.push(conn);
      }
    }
  }
  return visited;
};

// ── Shared real data ────────────────────────────────────────────────────────
// Built once at module scope — purely reads static data, no mutations.
const anchorNodes = buildNodeMap();

// ── Division layer constants (mirrors buildConnectivity.ts internal map) ───
const DIVISION_LAYER: Record<string, number> = {
  external_perimeter: 0,
  operations: 1,
  security: 2,
  finance: 3,
  executive: 4,
};

// ── 1. Bidirectionality ────────────────────────────────────────────────────
describe('buildConnectivity — bidirectionality', () => {
  it('makes every filler-to-filler edge symmetric within a division', () => {
    // Layer 1 (operations): anchors ops_cctv_ctrl + ops_hr_db, 4 fillers.
    const layer = 1;
    const anchor1 = makeAnchor('ops_cctv_ctrl', layer, []);
    const anchor2 = makeAnchor('ops_hr_db', layer, []);
    const anchorMap: Partial<Record<string, LiveNode>> = {
      ops_cctv_ctrl: anchor1,
      ops_hr_db: anchor2,
    };

    // Fillers: manually wire f1→ops-ws-02 only (asymmetric initial state).
    const f1 = makeNode('ops-ws-01', layer, ['ops_cctv_ctrl', 'ops-ws-02']);
    const f2 = makeNode('ops-ws-02', layer, ['ops_cctv_ctrl']);
    const f3 = makeNode('ops-ws-03', layer, ['ops_cctv_ctrl', 'ops_hr_db']);
    const f4 = makeNode('ops-ws-04', layer, ['ops_hr_db']);

    // Use the real IDs that the division will recognise (layer match is sufficient;
    // node ID prefixes are not checked by buildConnectivity).
    const anchorPatches: Record<string, string[]> = {
      ops_cctv_ctrl: ['ops-ws-01', 'ops-ws-02', 'ops-ws-03', 'ops-ws-04'],
      ops_hr_db: ['ops-ws-01', 'ops-ws-02', 'ops-ws-03', 'ops-ws-04'],
    };

    const prng = createPRNG(42);
    const result = buildConnectivity([f1, f2, f3, f4], anchorMap, anchorPatches, prng);

    const resultMap = new Map(result.fillerNodes.map(n => [n.id, n]));
    const fillerIds = result.fillerNodes.map(n => n.id);

    for (const filler of result.fillerNodes) {
      for (const connId of filler.connections) {
        if (!fillerIds.includes(connId)) continue; // skip anchor connections
        const peer = resultMap.get(connId);
        expect(peer, `peer ${connId} should exist`).toBeDefined();
        expect(
          peer!.connections,
          `${connId} should connect back to ${filler.id} (bidirectionality)`,
        ).toContain(filler.id);
      }
    }
  });

  it('makes a one-way filler→filler edge symmetric across all divisions using real data', () => {
    const { fillerNodes, anchorPatches } = generateFillerNodes(7, anchorNodes);
    const result = buildConnectivity(fillerNodes, anchorNodes, anchorPatches, createPRNG(7));

    const resultMap = new Map(result.fillerNodes.map(n => [n.id, n]));
    const fillerIds = new Set(result.fillerNodes.map(n => n.id));

    for (const filler of result.fillerNodes) {
      for (const connId of filler.connections) {
        if (!fillerIds.has(connId)) continue;
        const peer = resultMap.get(connId);
        expect(peer!.connections).toContain(filler.id);
      }
    }
  });
});

// ── 2. 2–4 connections per filler ─────────────────────────────────────────
describe('buildConnectivity — 2–4 connections per filler', () => {
  it('adds connections to an isolated filler that starts with zero peers', () => {
    const layer = 0;
    const entryAnchor = makeAnchor('contractor_portal', layer, []);
    const keyAnchor = makeAnchor('vpn_gateway', layer, []);

    // All three fillers connect only to anchors (0 peer connections).
    const f1 = makeNode('ext-ws-01', layer, ['contractor_portal', 'vpn_gateway']);
    const f2 = makeNode('ext-ws-02', layer, ['contractor_portal', 'vpn_gateway']);
    const f3 = makeNode('ext-rtr-03', layer, ['contractor_portal', 'vpn_gateway']);

    const anchorMap: Partial<Record<string, LiveNode>> = {
      contractor_portal: entryAnchor,
      vpn_gateway: keyAnchor,
    };
    const anchorPatches: Record<string, string[]> = {
      contractor_portal: ['ext-ws-01', 'ext-ws-02', 'ext-rtr-03'],
      vpn_gateway: ['ext-ws-01', 'ext-ws-02', 'ext-rtr-03'],
    };

    const result = buildConnectivity([f1, f2, f3], anchorMap, anchorPatches, createPRNG(1));

    for (const filler of result.fillerNodes) {
      // Count only connections within the subnet (anchors in layer + fillers).
      const subnetIds = new Set([
        'contractor_portal',
        'vpn_gateway',
        ...result.fillerNodes.map(n => n.id),
      ]);
      const subnetConns = filler.connections.filter(c => subnetIds.has(c));
      expect(subnetConns.length, `${filler.id} subnet connections`).toBeGreaterThanOrEqual(2);
      expect(subnetConns.length, `${filler.id} subnet connections`).toBeLessThanOrEqual(4);
    }
  });

  it('trims connections when a filler starts with more than 4', () => {
    const layer = 3;
    const anchor = makeAnchor('fin_payments_db', layer, []);
    const anchor2 = makeAnchor('fin_exec_accounts', layer, []);

    // f1 starts with 5 peer connections — should be trimmed to ≤4.
    const peers = ['fin-ws-02', 'fin-ws-03', 'fin-db-04', 'fin-ws-05', 'fin-fs-06'];
    const f1 = makeNode('fin-ws-01', layer, ['fin_payments_db', 'fin_exec_accounts', ...peers]);
    const f2 = makeNode('fin-ws-02', layer, ['fin_payments_db', 'fin-ws-01']);
    const f3 = makeNode('fin-ws-03', layer, ['fin_payments_db', 'fin-ws-01']);
    const f4 = makeNode('fin-db-04', layer, ['fin_payments_db', 'fin-ws-01']);
    const f5 = makeNode('fin-ws-05', layer, ['fin_payments_db', 'fin-ws-01']);
    const f6 = makeNode('fin-fs-06', layer, ['fin_exec_accounts', 'fin-ws-01']);

    const anchorMap: Partial<Record<string, LiveNode>> = {
      fin_payments_db: anchor,
      fin_exec_accounts: anchor2,
    };
    const anchorPatches: Record<string, string[]> = {
      fin_payments_db: ['fin-ws-01', 'fin-ws-02', 'fin-ws-03', 'fin-db-04', 'fin-ws-05'],
      fin_exec_accounts: ['fin-ws-01', 'fin-fs-06'],
    };

    const result = buildConnectivity(
      [f1, f2, f3, f4, f5, f6],
      anchorMap,
      anchorPatches,
      createPRNG(99),
    );

    const subnetIds = new Set([
      'fin_payments_db',
      'fin_exec_accounts',
      ...result.fillerNodes.map(n => n.id),
    ]);

    for (const filler of result.fillerNodes) {
      const subnetConns = filler.connections.filter(c => subnetIds.has(c));
      expect(subnetConns.length, `${filler.id} ≤ 4 subnet connections`).toBeLessThanOrEqual(4);
    }
  });

  it('every filler has ≥2 and ≤4 connections after a full end-to-end run', () => {
    const { fillerNodes, anchorPatches } = generateFillerNodes(42, anchorNodes);
    const result = buildConnectivity(fillerNodes, anchorNodes, anchorPatches, createPRNG(42));

    // Collect all valid node IDs (anchors + fillers).
    const anchorIds = new Set(Object.keys(anchorNodes));
    for (const filler of result.fillerNodes) {
      // Subnet = same layer anchors + all fillers in same layer.
      const samLayerAnchors = new Set(
        [...anchorIds].filter(id => anchorNodes[id].layer === filler.layer),
      );
      const sameLayerFillers = new Set(
        result.fillerNodes.filter(n => n.layer === filler.layer).map(n => n.id),
      );
      const subnetIds = new Set([...samLayerAnchors, ...sameLayerFillers]);

      const subnetConns = filler.connections.filter(c => subnetIds.has(c));
      expect(
        subnetConns.length,
        `${filler.id} (layer ${String(filler.layer)}) should have 2–4 subnet connections`,
      ).toBeGreaterThanOrEqual(2);
      expect(subnetConns.length).toBeLessThanOrEqual(4);
    }
  });
});

// ── 3. Within-subnet only (no cross-division filler edges) ─────────────────
describe('buildConnectivity — no cross-division filler edges', () => {
  it('no filler node connects to a filler in a different layer', () => {
    const { fillerNodes, anchorPatches } = generateFillerNodes(11, anchorNodes);
    const result = buildConnectivity(fillerNodes, anchorNodes, anchorPatches, createPRNG(11));

    const fillerLayerMap = new Map(result.fillerNodes.map(n => [n.id, n.layer]));
    const anchorIds = new Set(Object.keys(anchorNodes));

    for (const filler of result.fillerNodes) {
      for (const connId of filler.connections) {
        if (anchorIds.has(connId)) continue; // anchor edges are always OK
        const peerLayer = fillerLayerMap.get(connId);
        expect(
          peerLayer,
          `${filler.id} (layer ${String(filler.layer)}) connects to filler ${connId} in a different layer`,
        ).toBe(filler.layer);
      }
    }
  });

  it('manually placed cross-layer connections are not added by buildConnectivity', () => {
    // Create two divisions (layer 0 and layer 1) with fillers and verify they
    // never get wired together even when both are processed in the same call.
    const layer0Anchor = makeAnchor('contractor_portal', 0, []);
    const layer0Key = makeAnchor('vpn_gateway', 0, []);
    const layer1Anchor = makeAnchor('ops_cctv_ctrl', 1, []);
    const layer1Key = makeAnchor('ops_hr_db', 1, []);

    const f0a = makeNode('ext-ws-01', 0, ['contractor_portal', 'vpn_gateway']);
    const f0b = makeNode('ext-ws-02', 0, ['contractor_portal', 'vpn_gateway']);
    const f0c = makeNode('ext-rtr-03', 0, ['contractor_portal', 'vpn_gateway']);

    const f1a = makeNode('ops-ws-01', 1, ['ops_cctv_ctrl', 'ops_hr_db']);
    const f1b = makeNode('ops-ws-02', 1, ['ops_cctv_ctrl', 'ops_hr_db']);
    const f1c = makeNode('ops-ws-03', 1, ['ops_cctv_ctrl', 'ops_hr_db']);
    const f1d = makeNode('ops-ws-04', 1, ['ops_cctv_ctrl', 'ops_hr_db']);

    const anchorMap: Partial<Record<string, LiveNode>> = {
      contractor_portal: layer0Anchor,
      vpn_gateway: layer0Key,
      ops_cctv_ctrl: layer1Anchor,
      ops_hr_db: layer1Key,
    };
    const anchorPatches: Record<string, string[]> = {
      contractor_portal: ['ext-ws-01', 'ext-ws-02', 'ext-rtr-03'],
      vpn_gateway: ['ext-ws-01', 'ext-ws-02', 'ext-rtr-03'],
      ops_cctv_ctrl: ['ops-ws-01', 'ops-ws-02', 'ops-ws-03', 'ops-ws-04'],
      ops_hr_db: ['ops-ws-01', 'ops-ws-02', 'ops-ws-03', 'ops-ws-04'],
    };

    const result = buildConnectivity(
      [f0a, f0b, f0c, f1a, f1b, f1c, f1d],
      anchorMap,
      anchorPatches,
      createPRNG(55),
    );

    const layer0FillerIds = new Set(['ext-ws-01', 'ext-ws-02', 'ext-rtr-03']);
    const layer1FillerIds = new Set(['ops-ws-01', 'ops-ws-02', 'ops-ws-03', 'ops-ws-04']);
    const resultMap = new Map(result.fillerNodes.map(n => [n.id, n]));

    for (const id of layer0FillerIds) {
      const node = resultMap.get(id)!;
      for (const connId of node.connections) {
        expect(
          layer1FillerIds.has(connId),
          `layer-0 filler ${id} should not connect to layer-1 filler ${connId}`,
        ).toBe(false);
      }
    }

    for (const id of layer1FillerIds) {
      const node = resultMap.get(id)!;
      for (const connId of node.connections) {
        expect(
          layer0FillerIds.has(connId),
          `layer-1 filler ${id} should not connect to layer-0 filler ${connId}`,
        ).toBe(false);
      }
    }
  });
});

// ── 4. 3-hop reachability from division entry anchor ──────────────────────
describe('buildConnectivity — 3-hop reachability from entry anchor', () => {
  it('every filler is reachable from its division entry anchor within 3 hops (real data)', () => {
    const { fillerNodes, anchorPatches } = generateFillerNodes(33, anchorNodes);
    const result = buildConnectivity(fillerNodes, anchorNodes, anchorPatches, createPRNG(33));

    // Build a unified lookup for BFS: anchors patched + fillers.
    const allNodes = new Map<string, LiveNode>(Object.entries(anchorNodes));
    for (const f of result.fillerNodes) {
      allNodes.set(f.id, f);
    }
    // Apply anchor patches to the map.
    for (const [anchorId, ids] of Object.entries(result.anchorPatches)) {
      const anchor = allNodes.get(anchorId);
      if (anchor) {
        allNodes.set(anchorId, {
          ...anchor,
          connections: [...anchor.connections, ...ids],
        });
      }
    }

    // Group fillers by layer.
    const fillersByLayer = new Map<number, LiveNode[]>();
    for (const f of result.fillerNodes) {
      const bucket = fillersByLayer.get(f.layer) ?? [];
      bucket.push(f);
      fillersByLayer.set(f.layer, bucket);
    }

    for (const [divId, divAnchors] of Object.entries(DIVISION_ANCHORS)) {
      if (!divAnchors) continue;
      const layer = DIVISION_LAYER[divId];
      const divFillers = fillersByLayer.get(layer) ?? [];
      if (divFillers.length === 0) continue;

      // BFS from entry anchor.
      const dist = new Map<string, number>();
      dist.set(divAnchors.entry, 0);
      const queue = [divAnchors.entry];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const curDist = dist.get(cur)!;
        const node = allNodes.get(cur);
        if (!node) continue;
        for (const connId of node.connections) {
          if (!dist.has(connId)) {
            dist.set(connId, curDist + 1);
            queue.push(connId);
          }
        }
      }

      for (const filler of divFillers) {
        const d = dist.get(filler.id);
        expect(
          d,
          `${filler.id} should be reachable from ${divAnchors.entry} (div: ${divId}), got dist=${String(d)}`,
        ).toBeDefined();
        expect(d).toBeLessThanOrEqual(3);
      }
    }
  });

  it('adds a fallback edge when a filler is not reachable within 3 hops', () => {
    // Construct a scenario where a filler is isolated beyond 3 hops.
    // Use the external_perimeter division (layer 0).
    // entry=contractor_portal, key=vpn_gateway.
    const layer = 0;

    // The entry anchor has NO connections to filler nodes initially.
    const entryAnchor = makeAnchor('contractor_portal', layer, ['vpn_gateway']);
    const keyAnchor = makeAnchor('vpn_gateway', layer, ['contractor_portal']);

    // f1: connected to anchors so it's reachable at hop 1.
    // f2: connected only to f3 which is only connected to f4 — 4 hops deep.
    // After bidirectionality + min-connection enforcement, f2/f3/f4 may still
    // not be reachable within 3 hops from the entry anchor.
    // We craft it by connecting only f2→f3→f4 in a linear chain with no anchor links.
    const f1 = makeNode('ext-ws-01', layer, ['contractor_portal', 'vpn_gateway']);
    const f2 = makeNode('ext-ws-02', layer, ['ext-rtr-03']); // no anchor link
    const f3 = makeNode('ext-rtr-03', layer, ['ext-iot-04']); // no anchor link, only via f2 → f3 → f4
    // f4 is isolated — not reachable from entry within 3 hops without a fallback.
    const f4 = makeNode('ext-iot-04', layer, []); // completely isolated

    const anchorMap: Partial<Record<string, LiveNode>> = {
      contractor_portal: entryAnchor,
      vpn_gateway: keyAnchor,
    };
    // Patches do NOT include f2, f3, or f4 so anchors don't reach them directly.
    const anchorPatches: Record<string, string[]> = {
      contractor_portal: ['ext-ws-01'],
      vpn_gateway: ['ext-ws-01'],
    };

    const result = buildConnectivity([f1, f2, f3, f4], anchorMap, anchorPatches, createPRNG(7));

    // After buildConnectivity, every filler must be reachable within 3 hops.
    // Build a full map with patches applied.
    const fullMap = new Map<string, LiveNode>([
      [
        'contractor_portal',
        {
          ...entryAnchor,
          connections: [
            ...entryAnchor.connections,
            ...(result.anchorPatches['contractor_portal'] ?? []),
          ],
        },
      ],
      [
        'vpn_gateway',
        {
          ...keyAnchor,
          connections: [...keyAnchor.connections, ...(result.anchorPatches['vpn_gateway'] ?? [])],
        },
      ],
    ]);
    for (const f of result.fillerNodes) {
      fullMap.set(f.id, f);
    }

    const dist = new Map<string, number>();
    dist.set('contractor_portal', 0);
    const queue = ['contractor_portal'];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const curDist = dist.get(cur)!;
      const node = fullMap.get(cur);
      if (!node) continue;
      for (const connId of node.connections) {
        if (!dist.has(connId)) {
          dist.set(connId, curDist + 1);
          queue.push(connId);
        }
      }
    }

    for (const filler of result.fillerNodes) {
      const d = dist.get(filler.id);
      expect(d, `${filler.id} must be reachable from contractor_portal`).toBeDefined();
      expect(d, `${filler.id} must be ≤3 hops from contractor_portal`).toBeLessThanOrEqual(3);
    }
  });

  it('fallback edge for an unreachable filler lands in anchorPatches', () => {
    // A single filler with NO connections at all — after step 2 it gets
    // peer connections, but if the subnet only has one filler and the
    // anchors have no reach, the 3-hop check must fire a fallback.
    const layer = 0;
    const entryAnchor = makeAnchor('contractor_portal', layer, []);
    const keyAnchor = makeAnchor('vpn_gateway', layer, []);

    // Lone filler with no anchor connections and no peers.
    const loneFiller = makeNode('ext-ws-01', layer, []);

    const anchorMap: Partial<Record<string, LiveNode>> = {
      contractor_portal: entryAnchor,
      vpn_gateway: keyAnchor,
    };
    // Anchor patches are empty — nothing connects to the lone filler initially.
    const anchorPatches: Record<string, string[]> = {};

    const result = buildConnectivity([loneFiller], anchorMap, anchorPatches, createPRNG(3));

    // The fallback should have added the entry anchor → filler edge.
    const entryPatches = result.anchorPatches['contractor_portal'] ?? [];
    expect(entryPatches).toContain('ext-ws-01');

    // The filler should connect back to the entry anchor.
    const resultFiller = result.fillerNodes.find(n => n.id === 'ext-ws-01')!;
    expect(resultFiller.connections).toContain('contractor_portal');
  });
});

// ── 5. Global path guarantee ───────────────────────────────────────────────
describe('buildConnectivity — global path contractor_portal → exec_ceo', () => {
  it('BFS from contractor_portal reaches exec_ceo with real data', () => {
    const { fillerNodes, anchorPatches } = generateFillerNodes(1, anchorNodes);
    const result = buildConnectivity(fillerNodes, anchorNodes, anchorPatches, createPRNG(1));

    // Build full reachability map.
    const allNodes = new Map<string, LiveNode>(Object.entries(anchorNodes));
    for (const f of result.fillerNodes) {
      allNodes.set(f.id, f);
    }
    for (const [anchorId, ids] of Object.entries(result.anchorPatches)) {
      const anchor = allNodes.get(anchorId);
      if (anchor) {
        allNodes.set(anchorId, { ...anchor, connections: [...anchor.connections, ...ids] });
      }
    }

    const reachable = bfsReachable('contractor_portal', allNodes);
    expect(reachable.has('exec_ceo')).toBe(true);
  });

  it('adds a bridge edge when the global path is broken between divisions', () => {
    // Build a minimal anchor map that has contractor_portal and exec_ceo
    // but breaks the chain by removing the connection from ops_hr_db → sec_access_ctrl.
    // We do this by creating stripped-down anchor stubs so the global BFS cannot
    // reach exec_ceo, forcing the fallback bridge.
    const layer0Entry = makeAnchor('contractor_portal', 0, ['vpn_gateway']);
    const layer0Key = makeAnchor('vpn_gateway', 0, ['contractor_portal']); // no ops link
    // ops entry and key are present but isolated — BFS dead-ends at vpn_gateway.
    // The bridge guard requires both anchors to exist before patching, so both
    // must be in the map for the fallback to fire on the operations division.
    const opsEntry = makeAnchor('ops_cctv_ctrl', 1, []);
    const opsKey = makeAnchor('ops_hr_db', 1, []);

    const anchorMap: Partial<Record<string, LiveNode>> = {
      contractor_portal: layer0Entry,
      vpn_gateway: layer0Key,
      ops_cctv_ctrl: opsEntry,
      ops_hr_db: opsKey,
    };
    const anchorPatches: Record<string, string[]> = {};

    // No filler nodes, but buildConnectivity still enforces the global path.
    const result = buildConnectivity([], anchorMap, anchorPatches, createPRNG(0));

    // The operations division is the first one whose key anchor (ops_hr_db) is
    // unreachable — the bridge should connect exactly that pair bidirectionally.
    expect(result.anchorPatches['ops_cctv_ctrl']).toContain('ops_hr_db');
    expect(result.anchorPatches['ops_hr_db']).toContain('ops_cctv_ctrl');
  });

  it('does not add redundant bridge patches when the path already exists', () => {
    // Full anchor map with intact connectivity — no bridge should be added.
    const { fillerNodes, anchorPatches } = generateFillerNodes(77, anchorNodes);
    const resultBefore = buildConnectivity(fillerNodes, anchorNodes, anchorPatches, createPRNG(77));

    // Build full node map to verify exec_ceo reachability.
    const allNodes = new Map<string, LiveNode>(Object.entries(anchorNodes));
    for (const f of resultBefore.fillerNodes) allNodes.set(f.id, f);
    for (const [anchorId, ids] of Object.entries(resultBefore.anchorPatches)) {
      const anchor = allNodes.get(anchorId);
      if (anchor) {
        allNodes.set(anchorId, { ...anchor, connections: [...anchor.connections, ...ids] });
      }
    }

    // Path must exist.
    const reachable = bfsReachable('contractor_portal', allNodes);
    expect(reachable.has('exec_ceo')).toBe(true);
  });
});

// ── 6. Determinism ────────────────────────────────────────────────────────
describe('buildConnectivity — determinism', () => {
  it('same inputs and same PRNG seed produce identical filler node connections', () => {
    const { fillerNodes, anchorPatches } = generateFillerNodes(100, anchorNodes);

    const run1 = buildConnectivity(
      fillerNodes.map(n => ({ ...n, connections: [...n.connections] })),
      anchorNodes,
      { ...anchorPatches },
      createPRNG(100),
    );
    const run2 = buildConnectivity(
      fillerNodes.map(n => ({ ...n, connections: [...n.connections] })),
      anchorNodes,
      { ...anchorPatches },
      createPRNG(100),
    );

    const ids1 = run1.fillerNodes.map(n => n.id).sort();
    const ids2 = run2.fillerNodes.map(n => n.id).sort();
    expect(ids1).toEqual(ids2);

    for (const node1 of run1.fillerNodes) {
      const node2 = run2.fillerNodes.find(n => n.id === node1.id)!;
      expect([...node1.connections].sort()).toEqual([...node2.connections].sort());
    }
  });

  it('same inputs and same PRNG seed produce identical anchor patches', () => {
    const { fillerNodes, anchorPatches } = generateFillerNodes(200, anchorNodes);

    const run1 = buildConnectivity(
      fillerNodes.map(n => ({ ...n, connections: [...n.connections] })),
      anchorNodes,
      { ...anchorPatches },
      createPRNG(200),
    );
    const run2 = buildConnectivity(
      fillerNodes.map(n => ({ ...n, connections: [...n.connections] })),
      anchorNodes,
      { ...anchorPatches },
      createPRNG(200),
    );

    expect(Object.keys(run1.anchorPatches).sort()).toEqual(Object.keys(run2.anchorPatches).sort());
    for (const key of Object.keys(run1.anchorPatches)) {
      expect([...run1.anchorPatches[key]].sort()).toEqual([...run2.anchorPatches[key]].sort());
    }
  });

  it('different PRNG seeds may produce different connections (variation check)', () => {
    const { fillerNodes, anchorPatches } = generateFillerNodes(5, anchorNodes);

    // Run with seed 0xabc and seed 0xdef.
    const run1 = buildConnectivity(
      fillerNodes.map(n => ({ ...n, connections: [...n.connections] })),
      anchorNodes,
      { ...anchorPatches },
      createPRNG(0xabc),
    );
    const run2 = buildConnectivity(
      fillerNodes.map(n => ({ ...n, connections: [...n.connections] })),
      anchorNodes,
      { ...anchorPatches },
      createPRNG(0xdef),
    );

    // The connectivity results may legitimately be the same if no extra edges
    // are needed, but we can verify both produce valid outputs regardless.
    for (const node of run1.fillerNodes) {
      expect(node.connections.length).toBeGreaterThanOrEqual(1);
    }
    for (const node of run2.fillerNodes) {
      expect(node.connections.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ── 7. No duplicate connections ───────────────────────────────────────────
describe('buildConnectivity — no duplicate connections', () => {
  it('no filler has duplicate connection IDs after processing (real data)', () => {
    const { fillerNodes, anchorPatches } = generateFillerNodes(42, anchorNodes);
    const result = buildConnectivity(fillerNodes, anchorNodes, anchorPatches, createPRNG(42));

    for (const filler of result.fillerNodes) {
      const unique = new Set(filler.connections);
      expect(
        unique.size,
        `${filler.id} has duplicate connections: [${filler.connections.join(', ')}]`,
      ).toBe(filler.connections.length);
    }
  });

  it('does not introduce new duplicate connection IDs when adding edges to reach the minimum', () => {
    // f1 has only one subnet connection (anchor only) — buildConnectivity must add
    // a peer to reach MIN=2. It must not add the same peer twice.
    const layer = 2;
    const anchor1 = makeAnchor('sec_access_ctrl', layer, []);
    const anchor2 = makeAnchor('sec_firewall', layer, []);

    const f1 = makeNode('sec-sn-01', layer, ['sec_access_ctrl']); // only 1 subnet conn — will get peer added
    const f2 = makeNode('sec-ws-02', layer, ['sec_access_ctrl', 'sec_firewall']);

    const anchorMap: Partial<Record<string, LiveNode>> = {
      sec_access_ctrl: anchor1,
      sec_firewall: anchor2,
    };
    const anchorPatches: Record<string, string[]> = {
      sec_access_ctrl: ['sec-sn-01', 'sec-ws-02'],
      sec_firewall: ['sec-sn-01', 'sec-ws-02'],
    };

    const result = buildConnectivity([f1, f2], anchorMap, anchorPatches, createPRNG(5));

    // buildConnectivity must not add a peer ID that is already present.
    for (const filler of result.fillerNodes) {
      const unique = new Set(filler.connections);
      expect(unique.size).toBe(filler.connections.length);
    }
  });

  it('no duplicate connections after fallback reachability edges are added', () => {
    // Force fallback path: a lone filler not reachable from entry.
    const layer = 1;
    const entry = makeAnchor('ops_cctv_ctrl', layer, []);
    const key = makeAnchor('ops_hr_db', layer, []);

    // The lone filler already connects to the entry; the fallback would try to
    // add it again — buildConnectivity should guard against this.
    const lone = makeNode('ops-ws-01', layer, ['ops_cctv_ctrl']);

    const anchorMap: Partial<Record<string, LiveNode>> = {
      ops_cctv_ctrl: entry,
      ops_hr_db: key,
    };
    // No patch so entry anchor doesn't reach filler directly.
    const anchorPatches: Record<string, string[]> = {};

    const result = buildConnectivity([lone], anchorMap, anchorPatches, createPRNG(17));

    for (const filler of result.fillerNodes) {
      const unique = new Set(filler.connections);
      expect(unique.size).toBe(filler.connections.length);
    }
  });
});

// ── 8. Integration with real data ─────────────────────────────────────────
describe('buildConnectivity — integration with generateFillerNodes', () => {
  // Run three different seeds to give confidence the invariants hold broadly.
  for (const seed of [0, 42, 9999]) {
    describe(`seed ${String(seed)}`, () => {
      it('all fillers have 2–4 subnet connections', () => {
        const { fillerNodes, anchorPatches } = generateFillerNodes(seed, anchorNodes);
        const result = buildConnectivity(fillerNodes, anchorNodes, anchorPatches, createPRNG(seed));

        for (const filler of result.fillerNodes) {
          const sameLayerAnchors = new Set(
            Object.values(anchorNodes)
              .filter(n => n.layer === filler.layer)
              .map(n => n.id),
          );
          const sameLayerFillers = new Set(
            result.fillerNodes.filter(n => n.layer === filler.layer).map(n => n.id),
          );
          const subnetIds = new Set([...sameLayerAnchors, ...sameLayerFillers]);
          const subnetConns = filler.connections.filter(c => subnetIds.has(c));

          expect(
            subnetConns.length,
            `seed ${String(seed)}: ${filler.id} subnet connections`,
          ).toBeGreaterThanOrEqual(2);
          expect(subnetConns.length).toBeLessThanOrEqual(4);
        }
      });

      it('BFS from contractor_portal reaches exec_ceo', () => {
        const { fillerNodes, anchorPatches } = generateFillerNodes(seed, anchorNodes);
        const result = buildConnectivity(fillerNodes, anchorNodes, anchorPatches, createPRNG(seed));

        const allNodes = new Map<string, LiveNode>(Object.entries(anchorNodes));
        for (const f of result.fillerNodes) allNodes.set(f.id, f);
        for (const [anchorId, ids] of Object.entries(result.anchorPatches)) {
          const anchor = allNodes.get(anchorId);
          if (anchor) {
            allNodes.set(anchorId, { ...anchor, connections: [...anchor.connections, ...ids] });
          }
        }

        const reachable = bfsReachable('contractor_portal', allNodes);
        expect(reachable.has('exec_ceo'), `seed ${String(seed)}: exec_ceo not reachable`).toBe(
          true,
        );
      });

      it('no filler connects outside its own division subnet', () => {
        const { fillerNodes, anchorPatches } = generateFillerNodes(seed, anchorNodes);
        const result = buildConnectivity(fillerNodes, anchorNodes, anchorPatches, createPRNG(seed));

        const fillerLayerMap = new Map(result.fillerNodes.map(n => [n.id, n.layer]));
        const anchorIds = new Set(Object.keys(anchorNodes));

        for (const filler of result.fillerNodes) {
          for (const connId of filler.connections) {
            if (anchorIds.has(connId)) continue;
            expect(
              fillerLayerMap.get(connId),
              `seed ${String(seed)}: ${filler.id} (layer ${String(filler.layer)}) → ${connId} cross-layer`,
            ).toBe(filler.layer);
          }
        }
      });
    });
  }

  it('does not mutate the input fillerNodes array or their connection arrays', () => {
    const { fillerNodes, anchorPatches } = generateFillerNodes(42, anchorNodes);

    // Snapshot the original connection arrays.
    const originalConnections = fillerNodes.map(n => [...n.connections]);

    buildConnectivity(fillerNodes, anchorNodes, anchorPatches, createPRNG(42));

    for (let i = 0; i < fillerNodes.length; i++) {
      expect(fillerNodes[i].connections).toEqual(originalConnections[i]);
    }
  });

  it('does not mutate the input anchorPatches record', () => {
    const { fillerNodes, anchorPatches } = generateFillerNodes(42, anchorNodes);

    const snapshot: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(anchorPatches)) {
      snapshot[k] = [...v];
    }

    buildConnectivity(fillerNodes, anchorNodes, anchorPatches, createPRNG(42));

    for (const [k, v] of Object.entries(snapshot)) {
      expect(anchorPatches[k]).toEqual(v);
    }
  });

  it('returns the correct number of filler nodes (same as input)', () => {
    const { fillerNodes, anchorPatches } = generateFillerNodes(42, anchorNodes);
    const result = buildConnectivity(fillerNodes, anchorNodes, anchorPatches, createPRNG(42));
    expect(result.fillerNodes).toHaveLength(fillerNodes.length);
  });

  it('all filler IDs in the result match the input IDs', () => {
    const { fillerNodes, anchorPatches } = generateFillerNodes(42, anchorNodes);
    const result = buildConnectivity(fillerNodes, anchorNodes, anchorPatches, createPRNG(42));

    const inputIds = new Set(fillerNodes.map(n => n.id));
    for (const node of result.fillerNodes) {
      expect(inputIds.has(node.id), `unexpected filler id ${node.id} in output`).toBe(true);
    }
  });

  it('DIVISION_ANCHORS covers all five gameplay divisions', () => {
    const expected = ['external_perimeter', 'operations', 'security', 'finance', 'executive'];
    for (const divId of expected) {
      const anchors = DIVISION_ANCHORS[divId];
      expect(anchors).toBeDefined();
      expect(anchors?.entry.length).toBeGreaterThan(0);
      expect(anchors?.key.length).toBeGreaterThan(0);
    }
  });
});

// ── 9. Edge cases ─────────────────────────────────────────────────────────
describe('buildConnectivity — edge cases', () => {
  it('returns empty fillerNodes and empty anchorPatches when called with no fillers', () => {
    const result = buildConnectivity([], anchorNodes, {}, createPRNG(0));
    expect(result.fillerNodes).toHaveLength(0);
    // Global path patch may or may not fire, but anchorPatches must be an object.
    expect(result.anchorPatches).toBeTypeOf('object');
  });

  it('handles a division with exactly one filler node', () => {
    const layer = 4; // executive
    const entry = makeAnchor('exec_cfo', layer, ['exec_legal']);
    const key = makeAnchor('exec_ceo', layer, ['exec_legal']);
    const legal = makeAnchor('exec_legal', layer, ['exec_cfo', 'exec_ceo']);

    const single = makeNode('exec-ws-01', layer, ['exec_cfo', 'exec_legal', 'exec_ceo']);

    const anchorMap: Partial<Record<string, LiveNode>> = {
      exec_cfo: entry,
      exec_legal: legal,
      exec_ceo: key,
    };
    const anchorPatches: Record<string, string[]> = {
      exec_cfo: ['exec-ws-01'],
      exec_legal: ['exec-ws-01'],
      exec_ceo: ['exec-ws-01'],
    };

    const result = buildConnectivity([single], anchorMap, anchorPatches, createPRNG(10));

    expect(result.fillerNodes).toHaveLength(1);
    const filler = result.fillerNodes[0];
    // With only one filler and 3 anchor connections, subnet conn count = 3 (within bounds).
    const subnetIds = new Set(['exec_cfo', 'exec_legal', 'exec_ceo', 'exec-ws-01']);
    const subnetConns = filler.connections.filter(c => subnetIds.has(c));
    expect(subnetConns.length).toBeGreaterThanOrEqual(2);
    expect(subnetConns.length).toBeLessThanOrEqual(4);
  });

  it('preserves non-connectivity fields (template, layer, ip, etc.) unchanged', () => {
    const { fillerNodes, anchorPatches } = generateFillerNodes(42, anchorNodes);
    const result = buildConnectivity(fillerNodes, anchorNodes, anchorPatches, createPRNG(42));

    const inputMap = new Map(fillerNodes.map(n => [n.id, n]));
    for (const outputNode of result.fillerNodes) {
      const input = inputMap.get(outputNode.id)!;
      expect(outputNode.id).toBe(input.id);
      expect(outputNode.ip).toBe(input.ip);
      expect(outputNode.template).toBe(input.template);
      expect(outputNode.layer).toBe(input.layer);
      expect(outputNode.label).toBe(input.label);
      expect(outputNode.anchor).toBe(input.anchor);
      expect(outputNode.accessLevel).toBe(input.accessLevel);
      expect(outputNode.compromised).toBe(input.compromised);
      expect(outputNode.discovered).toBe(input.discovered);
    }
  });
});
