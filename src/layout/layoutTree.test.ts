import { describe, it, expect } from 'vitest';
import {
  PANE_IDS,
  PRESET_IDS,
  PRESET_TREES,
  MIN_RATIO,
  MAX_RATIO,
  collectPanes,
  createDefaultLayout,
  setRatio,
  cyclePreset,
  focusPane,
  toggleZoom,
  resetPreset,
  computeGeometry,
} from './layoutTree';
import type { LayoutNode } from './layoutTree';

describe('presets', () => {
  it.each(PRESET_IDS)('%s contains every pane exactly once', preset => {
    expect([...collectPanes(PRESET_TREES[preset])].sort()).toEqual([...PANE_IDS].sort());
  });

  it('every preset ratio is inside the allowed range', () => {
    const ratios = (n: LayoutNode): number[] =>
      n.kind === 'pane' ? [] : [n.ratio, ...ratios(n.a), ...ratios(n.b)];
    for (const preset of PRESET_IDS) {
      for (const r of ratios(PRESET_TREES[preset])) {
        expect(r).toBeGreaterThanOrEqual(MIN_RATIO);
        expect(r).toBeLessThanOrEqual(MAX_RATIO);
      }
    }
  });
});

describe('createDefaultLayout', () => {
  it('starts on hunt with the terminal focused and nothing zoomed', () => {
    const s = createDefaultLayout();
    expect(s.preset).toBe('hunt');
    expect(s.focused).toBe('term');
    expect(s.zoomed).toBeNull();
    expect(Object.keys(s.trees).sort()).toEqual([...PRESET_IDS].sort());
  });
});

describe('setRatio', () => {
  it('changes only the current preset and clamps to the allowed range', () => {
    const s = createDefaultLayout();
    const low = setRatio(s, [], 0);
    const high = setRatio(s, [], 5);
    const rootRatio = (st: typeof s) => {
      const t = st.trees[st.preset];
      return t.kind === 'split' ? t.ratio : -1;
    };
    expect(rootRatio(low)).toBe(MIN_RATIO);
    expect(rootRatio(high)).toBe(MAX_RATIO);
    expect(low.trees.analyze).toBe(s.trees.analyze);
    expect(low.trees.watch).toBe(s.trees.watch);
  });

  it('updates a nested split by path', () => {
    const s = createDefaultLayout();
    const next = setRatio(s, ['a'], 0.4);
    const t = next.trees.hunt;
    expect(t.kind === 'split' && t.a.kind === 'split' && t.a.ratio).toBe(0.4);
  });

  it('ignores paths that do not lead to a split, and non-finite ratios', () => {
    const s = createDefaultLayout();
    expect(setRatio(s, ['a', 'a', 'a', 'a', 'a'], 0.5)).toBe(s);
    expect(setRatio(s, [], Number.NaN)).toBe(s);
    expect(setRatio(s, [], Number.POSITIVE_INFINITY)).toBe(s);
  });
});

describe('cyclePreset', () => {
  it('walks hunt → analyze → watch → hunt and clears zoom', () => {
    let s = toggleZoom(createDefaultLayout());
    expect(s.zoomed).toBe('term');
    s = cyclePreset(s);
    expect(s.preset).toBe('analyze');
    expect(s.zoomed).toBeNull();
    s = cyclePreset(cyclePreset(s));
    expect(s.preset).toBe('hunt');
  });
});

describe('focusPane / toggleZoom', () => {
  it('focuses a pane', () => {
    expect(focusPane(createDefaultLayout(), 'doc').focused).toBe('doc');
  });

  it('zooms the focused pane and unzooms on a second toggle', () => {
    const s = focusPane(createDefaultLayout(), 'files');
    const zoomed = toggleZoom(s);
    expect(zoomed.zoomed).toBe('files');
    expect(toggleZoom(zoomed).zoomed).toBeNull();
  });

  it('moves the zoom to a newly focused pane while zoomed', () => {
    const s = focusPane(toggleZoom(createDefaultLayout()), 'doc');
    expect(s.focused).toBe('doc');
    expect(s.zoomed).toBe('doc');
  });
});

describe('resetPreset', () => {
  it('restores only the current preset to its default tree', () => {
    let s = setRatio(createDefaultLayout(), [], 0.3);
    s = cyclePreset(s);
    s = setRatio(s, [], 0.7);
    const reset = resetPreset(s);
    expect(reset.trees.analyze).toBe(PRESET_TREES.analyze);
    expect(reset.trees.hunt).not.toBe(PRESET_TREES.hunt);
  });
});

describe('computeGeometry', () => {
  it('splits a row by ratio and reports the divider', () => {
    const tree: LayoutNode = {
      kind: 'split',
      dir: 'row',
      ratio: 0.25,
      a: { kind: 'pane', pane: 'term' },
      b: { kind: 'pane', pane: 'doc' },
    };
    const { panes, dividers } = computeGeometry(tree);
    expect(panes.term).toEqual({ x: 0, y: 0, w: 0.25, h: 1 });
    expect(panes.doc).toEqual({ x: 0.25, y: 0, w: 0.75, h: 1 });
    expect(dividers).toEqual([
      { path: [], dir: 'row', parent: { x: 0, y: 0, w: 1, h: 1 }, ratio: 0.25 },
    ]);
  });

  it.each(PRESET_IDS)('%s tiles the whole area with no overlap or gaps', preset => {
    const { panes } = computeGeometry(PRESET_TREES[preset]);
    const area = PANE_IDS.reduce((sum, id) => sum + panes[id].w * panes[id].h, 0);
    expect(area).toBeCloseTo(1, 6);
    for (const id of PANE_IDS) {
      const r = panes[id];
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('reports one divider per split, each with the path to its split', () => {
    const { dividers } = computeGeometry(PRESET_TREES.hunt);
    expect(dividers).toHaveLength(PANE_IDS.length - 1);
    expect(new Set(dividers.map(d => d.path.join(''))).size).toBe(dividers.length);
  });
});
