import {
  PANE_IDS,
  PRESET_IDS,
  PRESET_TREES,
  MIN_RATIO,
  MAX_RATIO,
  collectPanes,
  createDefaultLayout,
} from './layoutTree';
import type { LayoutNode, LayoutState, PresetId } from './layoutTree';

export const LAYOUT_KEY = 'irongate_layout';
const LAYOUT_VERSION = 1;

interface StoredLayout {
  version: number;
  preset: PresetId;
  trees: Record<PresetId, LayoutNode>;
}

// Focus and zoom are session-only; only the preset and the (adjustable) trees persist.
export const saveLayout = (layout: Pick<LayoutState, 'preset' | 'trees'>): void => {
  try {
    const payload: StoredLayout = {
      version: LAYOUT_VERSION,
      preset: layout.preset,
      trees: layout.trees,
    };
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[layout] saveLayout failed', e);
  }
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const isValidTree = (v: unknown): v is LayoutNode => {
  if (!isRecord(v)) return false;
  if (v.kind === 'pane') return PANE_IDS.some(id => id === v.pane);
  if (v.kind === 'split') {
    return (
      (v.dir === 'row' || v.dir === 'col') &&
      typeof v.ratio === 'number' &&
      Number.isFinite(v.ratio) &&
      isValidTree(v.a) &&
      isValidTree(v.b)
    );
  }
  return false;
};

const clampTree = (node: LayoutNode): LayoutNode =>
  node.kind === 'pane'
    ? node
    : {
        ...node,
        ratio: Math.min(MAX_RATIO, Math.max(MIN_RATIO, node.ratio)),
        a: clampTree(node.a),
        b: clampTree(node.b),
      };

const hasEveryPaneOnce = (node: LayoutNode): boolean => {
  const panes = collectPanes(node);
  return panes.length === PANE_IDS.length && PANE_IDS.every(id => panes.includes(id));
};

export const loadLayout = (): LayoutState => {
  const fallback = createDefaultLayout();
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return fallback;

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== LAYOUT_VERSION) return fallback;

    const preset = PRESET_IDS.find(id => id === parsed.preset) ?? fallback.preset;
    const storedTrees = isRecord(parsed.trees) ? parsed.trees : {};

    const trees = { ...PRESET_TREES };
    for (const id of PRESET_IDS) {
      const candidate = storedTrees[id];
      if (isValidTree(candidate) && hasEveryPaneOnce(candidate)) trees[id] = clampTree(candidate);
    }

    return { ...fallback, preset, trees };
  } catch (e) {
    console.warn('[layout] loadLayout failed, using default', e);
    return fallback;
  }
};
