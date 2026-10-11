// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import fs from 'node:fs';
import { NetworkMap } from './NetworkMap';
import { createInitialState } from '../engine/state';
import produce from '../engine/produce';
import { makeNode, makeState } from '../engine/__tests__/testHelpers';
import type { GameState, LiveNode } from '../types/game';

const GROUPS_KEY = 'irongate_map_groups';

const mapOf = (
  state: GameState,
  over: Partial<{ onRunCommand: (c: string) => void; disabled: boolean }> = {},
) => <NetworkMap gameState={state} onRunCommand={vi.fn()} disabled={false} {...over} />;

const discoverAll = (state: GameState): GameState =>
  produce(state, s => {
    for (const n of Object.values(s.network.nodes)) if (n) n.discovered = true;
  });

const ws = (id: string, over: Partial<LiveNode> = {}): LiveNode =>
  makeNode({
    id,
    label: id,
    ip: `10.0.0.${String(id.length)}`,
    layer: 1,
    template: 'workstation',
    accessLevel: 'none',
    discovered: true,
    ...over,
  });

const stateWith = (nodes: LiveNode[], current: string): GameState =>
  produce(makeState(), s => {
    s.network.nodes = Object.fromEntries(nodes.map(n => [n.id, n]));
    s.network.currentNodeId = current;
  });

const groupState = (): GameState =>
  stateWith(
    [
      ws('home', { layer: 0, anchor: true }),
      ws('f1', { connections: ['home'] }),
      ws('f2'),
      ws('f3'),
      ws('f4'),
    ],
    'home',
  );

const worldOf = (c: HTMLElement): { x: number; y: number; k: number } => {
  const t = c.querySelector('[data-testid="map-world"]')?.getAttribute('transform') ?? '';
  const m = /translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(t);
  if (!m) throw new Error(`bad transform: ${t}`);
  return { x: Number(m[1]), y: Number(m[2]), k: Number(m[3]) };
};

const pointer = (el: Element, type: string, x: number, y: number) => {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
  });
};

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('NetworkMap', () => {
  it('shows the current node, one column header and the controls on a new game', () => {
    const state = createInitialState();
    const { container, getByRole } = render(mapOf(state));
    expect(
      container.querySelector(`[data-node-id="${state.network.currentNodeId}"]`),
    ).not.toBeNull();
    expect(container.querySelectorAll('.map-col')).toHaveLength(1);
    getByRole('button', { name: 'Zoom in' });
    getByRole('button', { name: 'Zoom out' });
    getByRole('button', { name: 'Fit to window' });
  });

  it('draws nothing for an undiscovered neighbour', () => {
    const state = createInitialState();
    const cur = state.network.nodes[state.network.currentNodeId];
    const hiddenId = cur?.connections.find(id => !state.network.nodes[id]?.discovered);
    expect(hiddenId).toBeDefined();
    const { container } = render(mapOf(state));
    expect(container.querySelector(`[data-node-id="${hiddenId ?? ''}"]`)).toBeNull();
    expect(container.innerHTML).not.toContain(hiddenId ?? '');
  });

  it('labels the level headers, layer 5 as CASSANDRA', () => {
    const { container } = render(mapOf(discoverAll(createInitialState())));
    const heads = [...container.querySelectorAll('.map-col')].map(e => e.textContent);
    expect(heads).toContain('L1 OPS');
    expect(heads).toContain('L5 CASSANDRA');
  });

  it('carries node state in the accessible name and data attributes', () => {
    const state = produce(createInitialState(), s => {
      const n = s.network.nodes[s.network.currentNodeId];
      if (!n) throw new Error('no current node');
      n.accessLevel = 'admin';
      n.compromised = true;
      n.sentinelPatched = true;
    });
    const { container } = render(mapOf(state));
    const el = container.querySelector(`[data-node-id="${state.network.currentNodeId}"]`);
    const name = el?.getAttribute('aria-label') ?? '';
    expect(name).toMatch(/current/);
    expect(name).toMatch(/admin access/);
    expect(name).toMatch(/compromised/);
    expect(name).toMatch(/patched/);
    expect(el?.getAttribute('data-current')).toBe('true');
    expect(el?.getAttribute('data-access')).toBe('admin');
    expect(el?.getAttribute('data-compromised')).toBe('true');
    expect(el?.getAttribute('data-patched')).toBe('true');
  });

  it('collapses same-template fillers into a group that toggles on click', () => {
    const { container } = render(mapOf(groupState()));
    const group = container.querySelector('[data-group-id]');
    expect(group?.getAttribute('aria-expanded')).toBe('false');
    expect(group?.textContent).toContain('+4 workstation');
    expect(container.querySelector('[data-node-id="f1"]')).toBeNull();
    fireEvent.click(group as Element);
    const open = container.querySelector('[data-group-id]');
    expect(open?.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[data-node-id="f1"]')).not.toBeNull();
    fireEvent.click(open as Element);
    expect(container.querySelector('[data-group-id]')?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-node-id="f1"]')).toBeNull();
  });

  it('toggles a group with Enter and Space', () => {
    const { container } = render(mapOf(groupState()));
    fireEvent.keyDown(container.querySelector('[data-group-id]') as Element, { key: 'Enter' });
    expect(container.querySelector('[data-group-id]')?.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(container.querySelector('[data-group-id]') as Element, { key: ' ' });
    expect(container.querySelector('[data-group-id]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('remembers expanded groups in sessionStorage across a remount', () => {
    const state = groupState();
    const first = render(mapOf(state));
    fireEvent.click(first.container.querySelector('[data-group-id]') as Element);
    const saved: unknown = JSON.parse(sessionStorage.getItem(GROUPS_KEY) ?? 'null');
    expect(saved).toEqual(['group:1:workstation']);
    first.unmount();
    const second = render(mapOf(state));
    expect(second.container.querySelector('[data-group-id]')?.getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it.each(['not json', '{"a":1}', '[1,"x","group:9:junk"]'])(
    'ignores garbage in sessionStorage: %s',
    garbage => {
      sessionStorage.setItem(GROUPS_KEY, garbage);
      const { container } = render(mapOf(groupState()));
      expect(container.querySelector('[data-group-id]')?.getAttribute('aria-expanded')).toBe(
        'false',
      );
    },
  );

  it('ignores storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('x');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('x');
    });
    const { container } = render(mapOf(groupState()));
    fireEvent.click(container.querySelector('[data-group-id]') as Element);
    expect(container.querySelector('[data-group-id]')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('zooms with the buttons and refits', () => {
    const { container, getByRole } = render(mapOf(createInitialState()));
    const start = worldOf(container);
    fireEvent.click(getByRole('button', { name: 'Zoom in' }));
    expect(worldOf(container).k).toBeGreaterThan(start.k);
    fireEvent.click(getByRole('button', { name: 'Fit to window' }));
    expect(worldOf(container)).toEqual(start);
    fireEvent.click(getByRole('button', { name: 'Zoom out' }));
    expect(worldOf(container).k).toBeLessThan(start.k);
  });

  it('pans with the arrow keys', () => {
    const { container, getByTestId } = render(mapOf(createInitialState()));
    const start = worldOf(container);
    fireEvent.keyDown(getByTestId('network-map'), { key: 'ArrowRight' });
    expect(worldOf(container).x).toBeCloseTo(start.x + 40);
  });

  it('zooms and fits with the keyboard', () => {
    const { container, getByTestId } = render(mapOf(createInitialState()));
    const root = getByTestId('network-map');
    const start = worldOf(container);
    fireEvent.keyDown(root, { key: '+' });
    expect(worldOf(container).k).toBeGreaterThan(start.k);
    fireEvent.keyDown(root, { key: '-' });
    fireEvent.keyDown(root, { key: '-' });
    expect(worldOf(container).k).toBeLessThan(start.k);
    fireEvent.keyDown(root, { key: '0' });
    expect(worldOf(container)).toEqual(start);
  });

  it('ignores keys pressed with a modifier', () => {
    const { container, getByTestId } = render(mapOf(createInitialState()));
    const start = worldOf(container);
    const root = getByTestId('network-map');
    fireEvent.keyDown(root, { key: '+', ctrlKey: true });
    expect(worldOf(container)).toEqual(start);
    fireEvent.keyDown(root, { key: 'ArrowRight', altKey: true });
    expect(worldOf(container)).toEqual(start);
    fireEvent.keyDown(root, { key: '+' });
    const zoomed = worldOf(container);
    fireEvent.keyDown(root, { key: '0', metaKey: true });
    expect(worldOf(container)).toEqual(zoomed);
  });

  it('can take keyboard focus', () => {
    const { getByTestId } = render(mapOf(createInitialState()));
    expect(getByTestId('network-map').tabIndex).toBe(0);
  });

  it('fits to the real pane size on mount and keeps the current node in view', () => {
    const w = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 1190,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 205,
    });
    try {
      const all = discoverAll(createInitialState());
      const far = Object.values(all.network.nodes).find(n => n?.layer === 5);
      if (!far) throw new Error('no layer 5 node');
      const base = produce(all, s => {
        s.network.currentNodeId = far.id;
      });
      const { container } = render(mapOf(base));
      const v = worldOf(container);
      expect(v.k).toBeGreaterThanOrEqual(0.8);
      const node = container.querySelector(`[data-node-id="${base.network.currentNodeId}"]`);
      const placed = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(node?.getAttribute('transform') ?? '');
      const sx = Number(placed?.[1]) * v.k + v.x;
      const sy = Number(placed?.[2]) * v.k + v.y;
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sx).toBeLessThanOrEqual(1190);
      expect(sy).toBeGreaterThanOrEqual(0);
      expect(sy).toBeLessThanOrEqual(205);
    } finally {
      if (w) Object.defineProperty(HTMLElement.prototype, 'clientWidth', w);
      else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
      if (h) Object.defineProperty(HTMLElement.prototype, 'clientHeight', h);
      else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
    }
  });

  it('pans by dragging the background', () => {
    const { container } = render(mapOf(createInitialState()));
    const svg = container.querySelector('svg') as SVGSVGElement;
    const start = worldOf(container);
    pointer(svg, 'pointerdown', 100, 100);
    pointer(svg, 'pointermove', 130, 90);
    pointer(svg, 'pointerup', 130, 90);
    const end = worldOf(container);
    expect(end.x).toBeCloseTo(start.x + 30);
    expect(end.y).toBeCloseTo(start.y - 10);
    pointer(svg, 'pointermove', 200, 200);
    expect(worldOf(container)).toEqual(end);
  });

  it('zooms with the wheel', () => {
    const { container } = render(mapOf(createInitialState()));
    const svg = container.querySelector('svg') as SVGSVGElement;
    const start = worldOf(container);
    fireEvent.wheel(svg, { deltaY: -100, clientX: 10, clientY: 10 });
    const zoomed = worldOf(container);
    expect(zoomed.k).toBeGreaterThan(start.k);
    fireEvent.wheel(svg, { deltaY: 100, clientX: 10, clientY: 10 });
    expect(worldOf(container).k).toBeLessThan(zoomed.k);
  });

  it('re-centres when the current node changes off screen, not on other updates', () => {
    const base = discoverAll(createInitialState());
    const far = Object.values(base.network.nodes).find(n => n?.layer === 5);
    if (!far) throw new Error('no layer 5 node');
    const { container, getByTestId, rerender } = render(mapOf(base));
    const root = getByTestId('network-map');
    for (let i = 0; i < 40; i++) fireEvent.keyDown(root, { key: 'ArrowLeft' });
    const panned = worldOf(container);

    rerender(mapOf({ ...base, turnCount: base.turnCount + 1 }));
    expect(worldOf(container)).toEqual(panned);

    const moved = produce(base, s => {
      s.network.currentNodeId = far.id;
    });
    rerender(mapOf(moved));
    const after = worldOf(container);
    expect(after).not.toEqual(panned);
    // the new current node sits inside the default 800x480 box
    const circle = container.querySelector(`[data-node-id="${far.id}"]`);
    expect(circle).not.toBeNull();
    const placed = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(circle?.getAttribute('transform') ?? '');
    const sx = Number(placed?.[1]) * after.k + after.x;
    const sy = Number(placed?.[2]) * after.k + after.y;
    expect(sx).toBeGreaterThanOrEqual(0);
    expect(sx).toBeLessThanOrEqual(800);
    expect(sy).toBeGreaterThanOrEqual(0);
    expect(sy).toBeLessThanOrEqual(480);
  });

  it('never shows the secret name before it is known', () => {
    const state = discoverAll(createInitialState());
    expect(state.flags.ARIA_NAME_KNOWN).toBeFalsy();
    const { container } = render(mapOf(state));
    const labels = [...container.querySelectorAll('[aria-label]')].map(e =>
      e.getAttribute('aria-label'),
    );
    expect(`${container.textContent} ${labels.join(' ')}`).not.toMatch(/\baria\b/i);
  });

  it('only pulses the current node when motion is allowed', () => {
    // jsdom does not evaluate media queries, so check the rule text. The repo's TraceMeter
    // guard forbids any `animation:` outside a no-preference block, so reduced motion gets none.
    const css = fs.readFileSync('src/styles/globals.css', 'utf8');
    const outside = css.replace(
      /@media \(prefers-reduced-motion: no-preference\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g,
      '',
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.map-ring\s*\{[^}]*animation:\s*map-pulse/,
    );
    expect(outside).not.toMatch(/\.map-ring[^}]*animation/);
  });
});

// ── Node menu ────────────────────────────────────────────────────────────────
const nodeEl = (c: HTMLElement, id: string): Element => {
  const el = c.querySelector(`[data-node-id="${id}"]`);
  if (!el) throw new Error(`no node ${id}`);
  return el;
};

// The start state with the current node's first two neighbours discovered.
const menuState = (): { state: GameState; here: LiveNode; a: LiveNode; b: LiveNode } => {
  const base = createInitialState();
  const hereId = base.network.currentNodeId;
  const ids = (base.network.nodes[hereId]?.connections ?? []).slice(0, 2);
  const state = produce(base, s => {
    for (const id of ids) {
      const n = s.network.nodes[id];
      if (n) n.discovered = true;
    }
  });
  const get = (id: string): LiveNode => {
    const n = state.network.nodes[id];
    if (!n) throw new Error(`no node ${id}`);
    return n;
  };
  return { state, here: get(hereId), a: get(ids[0]), b: get(ids[1]) };
};

const withStubbedBox = (w: number, h: number, body: () => void) => {
  const dw = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const dh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: w });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: h });
  try {
    body();
  } finally {
    if (dw) Object.defineProperty(HTMLElement.prototype, 'clientWidth', dw);
    else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
    if (dh) Object.defineProperty(HTMLElement.prototype, 'clientHeight', dh);
    else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  }
};

describe('NetworkMap node menu', () => {
  it('opens on click, toggles, switches and reports the state on the node', () => {
    const { state, a, b } = menuState();
    const { container } = render(mapOf(state));
    const elA = nodeEl(container, a.id);
    expect(elA.getAttribute('aria-haspopup')).toBe('menu');
    expect(elA.getAttribute('aria-expanded')).toBe('false');
    expect(elA.getAttribute('data-menu-open')).toBe('false');
    fireEvent.click(elA);
    screen.getByRole('menuitem', { name: /Connect/ });
    screen.getByRole('menuitem', { name: /Scan/ });
    expect(elA.getAttribute('aria-expanded')).toBe('true');
    expect(elA.getAttribute('data-menu-open')).toBe('true');
    fireEvent.click(elA);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(elA.getAttribute('data-menu-open')).toBe('false');
    fireEvent.click(elA);
    fireEvent.click(nodeEl(container, b.id));
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(elA.getAttribute('aria-expanded')).toBe('false');
    expect(nodeEl(container, b.id).getAttribute('aria-expanded')).toBe('true');
  });

  it('opens with Enter and Space', () => {
    const { state, a } = menuState();
    const { container } = render(mapOf(state));
    fireEvent.keyDown(nodeEl(container, a.id), { key: 'Enter' });
    screen.getByRole('menu');
    fireEvent.keyDown(nodeEl(container, a.id), { key: ' ' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('runs Connect on the first click and closes', () => {
    const { state, a } = menuState();
    const run = vi.fn();
    const { container } = render(mapOf(state, { onRunCommand: run }));
    fireEvent.click(nodeEl(container, a.id));
    fireEvent.click(screen.getByRole('menuitem', { name: /Connect/ }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(`connect ${a.ip}`);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('asks before Scan; Run sends it, Cancel sends nothing', () => {
    const { state, a } = menuState();
    const run = vi.fn();
    const { container } = render(mapOf(state, { onRunCommand: run }));
    fireEvent.click(nodeEl(container, a.id));
    fireEvent.click(screen.getByRole('menuitem', { name: /Scan/ }));
    expect(run).not.toHaveBeenCalled();
    screen.getByRole('menuitem', { name: 'Run' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Run' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(`scan ${a.ip}`);
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(nodeEl(container, a.id));
    fireEvent.click(screen.getByRole('menuitem', { name: /Scan/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancel' }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('offers Scan host and Scan subnet on the current node; subnet sends exactly scan', () => {
    const { state, here } = menuState();
    const run = vi.fn();
    const { container } = render(mapOf(state, { onRunCommand: run }));
    fireEvent.click(nodeEl(container, here.id));
    screen.getByRole('menuitem', { name: /Scan host/ });
    fireEvent.click(screen.getByRole('menuitem', { name: /Scan subnet/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Run' }));
    expect(run).toHaveBeenCalledWith('scan');
  });

  it('closes on Esc and returns focus to the node; Esc while confirming only leaves the confirm', () => {
    const { state, a } = menuState();
    const { container } = render(mapOf(state));
    fireEvent.click(nodeEl(container, a.id));
    fireEvent.click(screen.getByRole('menuitem', { name: /Scan/ }));
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    screen.getByRole('menu');
    screen.getByRole('menuitem', { name: /Connect/ });
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(nodeEl(container, a.id));
  });

  it('returns focus to the node after running', () => {
    const { state, a } = menuState();
    const { container } = render(mapOf(state));
    fireEvent.click(nodeEl(container, a.id));
    fireEvent.click(screen.getByRole('menuitem', { name: /Connect/ }));
    expect(document.activeElement).toBe(nodeEl(container, a.id));
  });

  it('closes on an outside pointerdown, not on one inside the menu', () => {
    const { state, a } = menuState();
    const { container } = render(mapOf(state));
    fireEvent.click(nodeEl(container, a.id));
    pointer(screen.getByRole('menu'), 'pointerdown', 5, 5);
    screen.getByRole('menu');
    pointer(document.body, 'pointerdown', 5, 5);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  describe('closes when the view changes', () => {
    const open = () => {
      const { state, a } = menuState();
      const utils = render(mapOf(state));
      fireEvent.click(nodeEl(utils.container, a.id));
      screen.getByRole('menu');
      return utils;
    };

    it('on the zoom button', () => {
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
      expect(screen.queryByRole('menu')).toBeNull();
    });
    it('on fit', () => {
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Fit to window' }));
      expect(screen.queryByRole('menu')).toBeNull();
    });
    it('on the wheel', () => {
      const { container } = open();
      fireEvent.wheel(container.querySelector('svg') as SVGSVGElement, { deltaY: -100 });
      expect(screen.queryByRole('menu')).toBeNull();
    });
    it('on an arrow-key pan', () => {
      const { getByTestId } = open();
      fireEvent.keyDown(getByTestId('network-map'), { key: 'ArrowRight' });
      expect(screen.queryByRole('menu')).toBeNull();
    });
    it('on a drag that moves', () => {
      const { container } = open();
      const svg = container.querySelector('svg') as SVGSVGElement;
      pointer(svg, 'pointerdown', 100, 100);
      pointer(svg, 'pointermove', 130, 90);
      expect(screen.queryByRole('menu')).toBeNull();
    });
  });

  it('keeps arrow keys inside the menu from panning the map', () => {
    const { state, a } = menuState();
    const { container } = render(mapOf(state));
    fireEvent.click(nodeEl(container, a.id));
    const before = worldOf(container);
    const first = document.activeElement as Element;
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).not.toBe(first);
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    expect(worldOf(container)).toEqual(before);
    screen.getByRole('menu');
  });

  it('is inert when disabled', () => {
    const { state, a } = menuState();
    const run = vi.fn();
    const { container } = render(mapOf(state, { onRunCommand: run, disabled: true }));
    fireEvent.click(nodeEl(container, a.id));
    for (const item of screen.getAllByRole('menuitem')) {
      expect(item.getAttribute('aria-disabled')).toBe('true');
    }
    screen.getByText('Not available right now');
    fireEvent.click(screen.getByRole('menuitem', { name: /Connect/ }));
    expect(run).not.toHaveBeenCalled();
  });

  it('is inert while an unlock sequence is pending', () => {
    const { state, a } = menuState();
    const locked = produce(state, s => {
      s.unlockSession = { filePath: '/x', codes: ['a', 'b', 'c'], step: 0 };
    });
    const run = vi.fn();
    const { container } = render(mapOf(locked, { onRunCommand: run }));
    fireEvent.click(nodeEl(container, a.id));
    screen.getByText(/unlock sequence is waiting/i);
    fireEvent.click(screen.getByRole('menuitem', { name: /Connect/ }));
    expect(run).not.toHaveBeenCalled();
  });

  it('closes when the turn changes', () => {
    const { state, a } = menuState();
    const { container, rerender } = render(mapOf(state));
    fireEvent.click(nodeEl(container, a.id));
    screen.getByRole('menu');
    rerender(mapOf({ ...state, turnCount: state.turnCount + 1 }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes when its node leaves the layout', () => {
    const { container } = render(mapOf(groupState()));
    fireEvent.click(container.querySelector('[data-group-id]') as Element);
    fireEvent.click(nodeEl(container, 'f1'));
    screen.getByRole('menu');
    fireEvent.click(container.querySelector('[data-group-id]') as Element);
    expect(container.querySelector('[data-node-id="f1"]')).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('still toggles a group and opens no menu', () => {
    const { container } = render(mapOf(groupState()));
    fireEvent.click(container.querySelector('[data-group-id]') as Element);
    expect(container.querySelector('[data-group-id]')?.getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('says there is nothing to do on a burned run', () => {
    const { state, a } = menuState();
    const burned = produce(state, s => {
      s.phase = 'burned';
    });
    const { container } = render(mapOf(burned));
    fireEvent.click(nodeEl(container, a.id));
    screen.getByRole('menuitem', { name: 'No actions available' });
  });

  it('never renders the password of a login entry', () => {
    const { state, here } = menuState();
    const withCred = produce(state, s => {
      s.player.credentials.push({
        id: 'cred_menu_test',
        username: 'm.tester',
        password: 'Zq9-unique-secret',
        accessLevel: 'root',
        validOnNodes: [here.id],
        obtained: true,
      });
    });
    const { container } = render(mapOf(withCred));
    fireEvent.click(nodeEl(container, here.id));
    fireEvent.click(screen.getByRole('menuitem', { name: /Login as m\.tester/ }));
    screen.getByRole('menuitem', { name: 'Run' });
    expect(container.innerHTML).not.toContain('Zq9-unique-secret');
  });

  it('never names the secret in any menu before it is known', () => {
    const state = discoverAll(createInitialState());
    expect(state.flags.ARIA_NAME_KNOWN).toBeFalsy();
    const { container } = render(mapOf(state));
    const seen: string[] = [];
    for (const el of [...container.querySelectorAll('[data-node-id]')]) {
      fireEvent.click(el);
      const menu = screen.queryByRole('menu');
      if (menu) {
        seen.push(menu.textContent);
        for (const l of menu.querySelectorAll('[aria-label]')) {
          seen.push(l.getAttribute('aria-label') ?? '');
        }
        seen.push(menu.getAttribute('aria-label') ?? '');
      }
      fireEvent.click(el);
    }
    expect(seen.length).toBeGreaterThan(10);
    expect(seen.join(' ')).not.toMatch(/\baria\b/i);
  });

  it('keeps the menu inside a small pane', () => {
    withStubbedBox(1190, 205, () => {
      const { state, here } = menuState();
      const { container } = render(mapOf(state));
      fireEvent.click(nodeEl(container, here.id));
      const menu = screen.getByRole('menu');
      const left = parseFloat(menu.style.left);
      const top = parseFloat(menu.style.top);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + 240).toBeLessThanOrEqual(1190);
      expect(top).toBeGreaterThanOrEqual(0);
      const rows = menu.querySelectorAll('[role="menuitem"]').length;
      const height = 8 + rows * 34;
      expect(top + height <= 205 || top === 0).toBe(true);
    });
  });
});
