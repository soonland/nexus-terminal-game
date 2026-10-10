import type { GameState, LiveNode, NodeTemplate } from '../types/game';

export const LAYER_LABELS: readonly string[] = [
  'ENTRY',
  'OPS',
  'SECURITY',
  'FINANCE',
  'EXECUTIVE',
  'CASSANDRA',
];

export const COL_W = 220;
export const ROW_H = 96;
export const TOP = 56;
export const LEFT = 40;
export const GROUP_MIN = 3;

export interface PlacedNode {
  kind: 'node';
  id: string;
  node: LiveNode;
  x: number;
  y: number;
}
export interface PlacedGroup {
  kind: 'group';
  id: string;
  template: NodeTemplate;
  layer: number;
  memberIds: string[];
  expanded: boolean;
  x: number;
  y: number;
}
export type PlacedItem = PlacedNode | PlacedGroup;
export interface PlacedColumn {
  layer: number;
  label: string;
  x: number;
}
export interface PlacedLink {
  id: string;
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  touchesCurrent: boolean;
  patched: boolean;
}
export interface MapLayout {
  columns: PlacedColumn[];
  items: PlacedItem[];
  links: PlacedLink[];
  width: number;
  height: number;
  positions: Record<string, { x: number; y: number }>;
}

export const groupId = (layer: number, template: NodeTemplate): string =>
  `group:${String(layer)}:${template}`;

// Nodes that must stay visible whatever the grouping.
const pinned = (n: LiveNode, currentId: string): boolean =>
  n.id === currentId || n.accessLevel !== 'none' || n.compromised || !!n.sentinelPatched;

// What a column holds before positions: nodes and groups in order.
type Slot =
  | { kind: 'node'; node: LiveNode }
  | { kind: 'group'; id: string; template: NodeTemplate; memberIds: string[]; expanded: boolean };

const columnSlots = (
  nodes: LiveNode[],
  layer: number,
  currentId: string,
  expanded: ReadonlySet<string>,
): Slot[] => {
  const anchors = nodes.filter(n => n.anchor);
  const fillers = nodes.filter(n => !n.anchor).sort((a, b) => a.id.localeCompare(b.id));

  const hideable = new Map<NodeTemplate, string[]>();
  for (const n of fillers) {
    if (pinned(n, currentId)) continue;
    hideable.set(n.template, [...(hideable.get(n.template) ?? []), n.id]);
  }
  const grouped = new Map<NodeTemplate, string[]>(
    [...hideable].filter(([, ids]) => ids.length >= GROUP_MIN),
  );

  const slots: Slot[] = anchors.map(node => ({ kind: 'node', node }));
  const emitted = new Set<NodeTemplate>();
  for (const n of fillers) {
    const ids = grouped.get(n.template);
    if (!ids?.includes(n.id)) {
      slots.push({ kind: 'node', node: n });
      continue;
    }
    const gid = groupId(layer, n.template);
    const open = expanded.has(gid);
    if (!emitted.has(n.template)) {
      emitted.add(n.template);
      slots.push({ kind: 'group', id: gid, template: n.template, memberIds: ids, expanded: open });
    }
    if (open) slots.push({ kind: 'node', node: n });
  }
  return slots;
};

export const layoutMap = (state: GameState, expanded: ReadonlySet<string>): MapLayout => {
  const { nodes, currentNodeId } = state.network;
  const shown = Object.values(nodes).filter(
    (n): n is LiveNode => !!n && (n.discovered || n.id === currentNodeId),
  );
  const shownIds = new Set(shown.map(n => n.id));

  const layers = [...new Set(shown.map(n => n.layer))].sort((a, b) => a - b);
  const columns: PlacedColumn[] = [];
  const items: PlacedItem[] = [];
  const positions: Record<string, { x: number; y: number }> = {};
  const representative = new Map<string, string>();
  let maxRows = 0;

  layers.forEach((layer, col) => {
    const x = LEFT + col * COL_W + COL_W / 2;
    columns.push({ layer, label: LAYER_LABELS[layer] ?? '', x });
    const slots = columnSlots(
      shown.filter(n => n.layer === layer),
      layer,
      currentNodeId,
      expanded,
    );
    maxRows = Math.max(maxRows, slots.length);
    slots.forEach((slot, row) => {
      const y = TOP + row * ROW_H + ROW_H / 2;
      if (slot.kind === 'node') {
        items.push({ kind: 'node', id: slot.node.id, node: slot.node, x, y });
        positions[slot.node.id] = { x, y };
        representative.set(slot.node.id, slot.node.id);
        return;
      }
      items.push({
        kind: 'group',
        id: slot.id,
        template: slot.template,
        layer,
        memberIds: slot.memberIds,
        expanded: slot.expanded,
        x,
        y,
      });
      positions[slot.id] = { x, y };
      if (!slot.expanded) {
        for (const m of slot.memberIds) {
          representative.set(m, slot.id);
          positions[m] = { x, y };
        }
      }
    });
  });

  const links: PlacedLink[] = [];
  const seen = new Set<string>();
  for (const a of shown) {
    for (const bId of a.connections) {
      if (!shownIds.has(bId)) continue;
      const from = representative.get(a.id) ?? a.id;
      const to = representative.get(bId) ?? bId;
      if (from === to) continue;
      const id = [from, to].sort().join('|');
      if (seen.has(id)) continue;
      seen.add(id);
      const p1 = positions[from];
      const p2 = positions[to];
      const b = nodes[bId];
      links.push({
        id,
        from,
        to,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        touchesCurrent: a.id === currentNodeId || bId === currentNodeId,
        patched: !!a.sentinelPatched || !!b?.sentinelPatched,
      });
    }
  }

  return {
    columns,
    items,
    links,
    positions,
    width: LEFT * 2 + Math.max(1, columns.length) * COL_W,
    height: TOP + Math.max(1, maxRows) * ROW_H + 24,
  };
};
