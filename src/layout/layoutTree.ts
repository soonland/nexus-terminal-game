export type PaneId = 'term' | 'files' | 'doc' | 'aux' | 'comms';
export const PANE_IDS: readonly PaneId[] = ['term', 'files', 'doc', 'aux', 'comms'];

export type PresetId = 'hunt' | 'analyze' | 'watch';
export const PRESET_IDS: readonly PresetId[] = ['hunt', 'analyze', 'watch'];

export type LayoutNode =
  | { kind: 'pane'; pane: PaneId }
  | { kind: 'split'; dir: 'row' | 'col'; ratio: number; a: LayoutNode; b: LayoutNode };

type SplitNode = Extract<LayoutNode, { kind: 'split' }>;

// 'a' / 'b' children from the root to a split node.
export type TreePath = readonly ('a' | 'b')[];

export interface LayoutState {
  preset: PresetId;
  trees: Record<PresetId, LayoutNode>;
  focused: PaneId;
  zoomed: PaneId | null;
}

// No pane may be dragged below 15% of its parent split.
export const MIN_RATIO = 0.15;
export const MAX_RATIO = 0.85;

const pane = (id: PaneId): LayoutNode => ({ kind: 'pane', pane: id });
const split = (dir: 'row' | 'col', ratio: number, a: LayoutNode, b: LayoutNode): LayoutNode => ({
  kind: 'split',
  dir,
  ratio,
  a,
  b,
});

// Trees are treated as immutable: every operation below returns new nodes.
export const PRESET_TREES: Record<PresetId, LayoutNode> = {
  // Big terminal on the left, documents under it, comms/files/aux on the right.
  hunt: split(
    'row',
    0.62,
    split('col', 0.72, pane('term'), pane('doc')),
    split('col', 0.34, pane('comms'), split('col', 0.5, pane('files'), pane('aux'))),
  ),
  // Files and documents dominate.
  analyze: split(
    'row',
    0.3,
    split('col', 0.6, pane('files'), pane('aux')),
    split('col', 0.62, pane('doc'), split('row', 0.55, pane('term'), pane('comms'))),
  ),
  // Comms and the map dominate.
  watch: split(
    'row',
    0.5,
    split('col', 0.6, pane('comms'), pane('term')),
    split('col', 0.6, pane('aux'), split('row', 0.5, pane('files'), pane('doc'))),
  ),
};

export const collectPanes = (node: LayoutNode): PaneId[] =>
  node.kind === 'pane' ? [node.pane] : [...collectPanes(node.a), ...collectPanes(node.b)];

export const createDefaultLayout = (): LayoutState => ({
  preset: 'hunt',
  trees: { ...PRESET_TREES },
  focused: 'term',
  zoomed: null,
});

const clampRatio = (ratio: number): number => Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));

// Returns null when the path does not end at a split node.
const updateAt = (
  node: LayoutNode,
  path: TreePath,
  update: (n: SplitNode) => SplitNode,
): LayoutNode | null => {
  if (node.kind === 'pane') return null;
  if (path.length === 0) return update(node);
  const head = path[0];
  const child = updateAt(head === 'a' ? node.a : node.b, path.slice(1), update);
  if (!child) return null;
  return head === 'a' ? { ...node, a: child } : { ...node, b: child };
};

export const setRatio = (state: LayoutState, path: TreePath, ratio: number): LayoutState => {
  if (!Number.isFinite(ratio)) return state;
  const next = updateAt(state.trees[state.preset], path, n => ({ ...n, ratio: clampRatio(ratio) }));
  if (!next) return state;
  return { ...state, trees: { ...state.trees, [state.preset]: next } };
};

export const cyclePreset = (state: LayoutState): LayoutState => {
  const next = PRESET_IDS[(PRESET_IDS.indexOf(state.preset) + 1) % PRESET_IDS.length];
  return { ...state, preset: next, zoomed: null };
};

// While zoomed, focusing another pane moves the zoom with it so the focused pane is
// always the visible one.
export const focusPane = (state: LayoutState, id: PaneId): LayoutState => ({
  ...state,
  focused: id,
  zoomed: state.zoomed === null ? null : id,
});

export const toggleZoom = (state: LayoutState): LayoutState => ({
  ...state,
  zoomed: state.zoomed === null ? state.focused : null,
});

export const resetPreset = (state: LayoutState): LayoutState => ({
  ...state,
  trees: { ...state.trees, [state.preset]: PRESET_TREES[state.preset] },
});

// ── Geometry ────────────────────────────────────────────────

// Fractions (0–1) of the layout area.
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DividerSpec {
  path: TreePath;
  dir: 'row' | 'col';
  parent: Rect;
  ratio: number;
}

export interface Geometry {
  panes: Record<PaneId, Rect>;
  dividers: DividerSpec[];
}

export const computeGeometry = (tree: LayoutNode): Geometry => {
  const panes = {} as Record<PaneId, Rect>;
  const dividers: DividerSpec[] = [];

  const walk = (node: LayoutNode, rect: Rect, path: TreePath) => {
    if (node.kind === 'pane') {
      panes[node.pane] = rect;
      return;
    }
    dividers.push({ path, dir: node.dir, parent: rect, ratio: node.ratio });
    if (node.dir === 'row') {
      const aw = rect.w * node.ratio;
      walk(node.a, { x: rect.x, y: rect.y, w: aw, h: rect.h }, [...path, 'a']);
      walk(node.b, { x: rect.x + aw, y: rect.y, w: rect.w - aw, h: rect.h }, [...path, 'b']);
    } else {
      const ah = rect.h * node.ratio;
      walk(node.a, { x: rect.x, y: rect.y, w: rect.w, h: ah }, [...path, 'a']);
      walk(node.b, { x: rect.x, y: rect.y + ah, w: rect.w, h: rect.h - ah }, [...path, 'b']);
    }
  };

  walk(tree, { x: 0, y: 0, w: 1, h: 1 }, []);
  return { panes, dividers };
};
