import { describe, it, expect } from 'vitest';
import { GROUP_MIN, groupId, layoutMap, LAYER_LABELS } from './mapLayout';
import { createInitialState } from './state';
import produce from './produce';
import { makeNode, makeState } from './__tests__/testHelpers';
import type { GameState, LiveNode } from '../types/game';

const none = new Set<string>();

// A state whose network is exactly `nodes`, current node `current`.
const stateWith = (nodes: LiveNode[], current: string): GameState => {
  const base = makeState();
  return produce(base, s => {
    s.network.nodes = Object.fromEntries(nodes.map(n => [n.id, n]));
    s.network.currentNodeId = current;
  });
};

const ws = (id: string, over: Partial<LiveNode> = {}): LiveNode =>
  makeNode({
    id,
    label: id,
    ip: `10.0.0.${String(id.length)}`,
    layer: 1,
    template: 'workstation',
    accessLevel: 'none', // makeNode defaults to 'user', which would pin every node
    ...over,
  });

describe('layoutMap', () => {
  it('shows only discovered nodes plus the current node, in one column per level', () => {
    const state = stateWith(
      [
        ws('a', { layer: 0, anchor: true, discovered: true }),
        ws('b', { layer: 1, anchor: true, discovered: false }),
        ws('c', { layer: 2, anchor: true, discovered: true }),
      ],
      'a',
    );
    const l = layoutMap(state, none);
    expect(l.items.map(i => i.id)).toEqual(['a', 'c']);
    expect(l.columns.map(c => c.layer)).toEqual([0, 2]);
    expect(l.columns[0]?.label).toBe(LAYER_LABELS[0]);
  });

  it('always includes the current node even if not flagged discovered', () => {
    const state = stateWith([ws('a', { layer: 0, discovered: false })], 'a');
    expect(layoutMap(state, none).items.map(i => i.id)).toEqual(['a']);
  });

  it('orders anchors first (as stored), then fillers by id', () => {
    const state = stateWith(
      [
        ws('z_anchor', { anchor: true }),
        ws('filler_b'),
        ws('a_anchor', { anchor: true }),
        ws('filler_a'),
      ],
      'z_anchor',
    );
    expect(layoutMap(state, none).items.map(i => i.id)).toEqual([
      'z_anchor',
      'a_anchor',
      'filler_a',
      'filler_b',
    ]);
  });

  it('draws a link once, only when both ends are shown, and never toward an undiscovered node', () => {
    const state = stateWith(
      [
        ws('a', { layer: 0, anchor: true, connections: ['b', 'ghost'] }),
        ws('b', { layer: 1, anchor: true, connections: ['a'] }),
        ws('hidden', { layer: 1, anchor: true, discovered: false, connections: ['a'] }),
      ],
      'a',
    );
    // 'a' reaches the undiscovered node too:
    const withHiddenLink = produce(state, s => {
      s.network.nodes['a']?.connections.push('hidden');
    });
    const l = layoutMap(withHiddenLink, none);
    expect(l.links).toHaveLength(1);
    expect(l.links[0]?.id).toBe('a|b');
    expect(l.items.some(i => i.id === 'hidden')).toBe(false);
  });

  it('flags links that touch the current node and links to patched nodes', () => {
    const state = stateWith(
      [
        ws('a', { layer: 0, anchor: true, connections: ['b'] }),
        ws('b', { layer: 1, anchor: true, connections: ['c'], sentinelPatched: true }),
        ws('c', { layer: 2, anchor: true }),
      ],
      'a',
    );
    const links = Object.fromEntries(layoutMap(state, none).links.map(x => [x.id, x]));
    expect(links['a|b'].touchesCurrent).toBe(true);
    expect(links['a|b'].patched).toBe(true);
    expect(links['b|c'].touchesCurrent).toBe(false);
    expect(links['b|c'].patched).toBe(true);
  });

  it('is deterministic and a turn that discovers nothing moves nothing', () => {
    const state = createInitialState();
    const a = layoutMap(state, none);
    const b = layoutMap(
      produce(state, s => void (s.turnCount += 1)),
      none,
    );
    expect(b.positions).toEqual(a.positions);
  });

  it('discovering a node shifts only later nodes in its column', () => {
    const base = stateWith(
      [
        ws('a1', { anchor: true, layer: 1 }),
        ws('f1', { layer: 1, template: 'printer' }),
        ws('f3', { layer: 1 }),
      ],
      'a1',
    );
    const before = layoutMap(base, none).positions;
    const after = layoutMap(
      produce(base, s => {
        s.network.nodes['f2'] = ws('f2', { layer: 1, template: 'printer' });
      }),
      none,
    ).positions;
    expect(after['a1']).toEqual(before['a1']);
    expect(after['f1']).toEqual(before['f1']);
    expect(after['f3'].y).toBeGreaterThan(before['f3'].y);
  });

  describe('grouping', () => {
    const fillers = (n: number, over: Partial<LiveNode> = {}) =>
      Array.from({ length: n }, (_, i) => ws(`f${String(i)}`, { layer: 1, ...over }));

    it(`collapses ${String(GROUP_MIN)} or more same-template fillers into one group`, () => {
      const state = stateWith([ws('a', { anchor: true, layer: 1 }), ...fillers(GROUP_MIN)], 'a');
      const l = layoutMap(state, none);
      const group = l.items.find(i => i.kind === 'group');
      expect(group?.id).toBe(groupId(1, 'workstation'));
      expect(group?.kind === 'group' && group.memberIds).toHaveLength(GROUP_MIN);
      expect(l.items.filter(i => i.kind === 'node').map(i => i.id)).toEqual(['a']);
    });

    it('does not group fewer than the threshold', () => {
      const state = stateWith(
        [ws('a', { anchor: true, layer: 1 }), ...fillers(GROUP_MIN - 1)],
        'a',
      );
      expect(layoutMap(state, none).items.some(i => i.kind === 'group')).toBe(false);
    });

    it('does not group different templates together', () => {
      const state = stateWith(
        [
          ws('a', { anchor: true, layer: 1 }),
          ws('p1', { layer: 1, template: 'printer' }),
          ws('p2', { layer: 1, template: 'printer' }),
          ws('w1', { layer: 1 }),
          ws('w2', { layer: 1 }),
        ],
        'a',
      );
      expect(layoutMap(state, none).items.some(i => i.kind === 'group')).toBe(false);
    });

    it.each([
      ['accessed', { accessLevel: 'user' as const }],
      ['compromised', { compromised: true }],
      ['patched', { sentinelPatched: true }],
    ])(
      'never hides an %s filler, and the rest no longer reach the threshold if too few remain',
      (_n, over) => {
        const nodes = [ws('a', { anchor: true, layer: 1 }), ...fillers(GROUP_MIN)];
        const state = produce(stateWith(nodes, 'a'), s => {
          Object.assign(s.network.nodes['f0']!, { accessLevel: 'none' }, over);
        });
        const l = layoutMap(state, none);
        expect(l.items.find(i => i.id === 'f0')?.kind).toBe('node');
        // only GROUP_MIN-1 hideable fillers remain, below the threshold: all shown
        expect(l.items.some(i => i.kind === 'group')).toBe(false);
      },
    );

    it('never hides the current filler node', () => {
      const state = stateWith([...fillers(GROUP_MIN + 1)], 'f0');
      const l = layoutMap(state, none);
      expect(l.items.find(i => i.id === 'f0')?.kind).toBe('node');
      expect(l.items.find(i => i.kind === 'group')).toBeDefined();
    });

    it('an expanded group lists its members after the group item', () => {
      const state = stateWith([ws('a', { anchor: true, layer: 1 }), ...fillers(GROUP_MIN)], 'a');
      const gid = groupId(1, 'workstation');
      const l = layoutMap(state, new Set([gid]));
      expect(l.items.map(i => i.id)).toEqual(['a', gid, 'f0', 'f1', 'f2']);
      const group = l.items.find(i => i.kind === 'group');
      expect(group?.kind === 'group' && group.expanded).toBe(true);
    });

    it('ignores expanded ids for groups that do not exist', () => {
      const state = stateWith([ws('a', { anchor: true, layer: 1 })], 'a');
      expect(layoutMap(state, new Set(['group:3:printer', 'junk'])).items).toHaveLength(1);
    });

    it('routes a link to a hidden node to its group and drops duplicates and self links', () => {
      const nodes = [
        ws('a', { anchor: true, layer: 1, connections: ['f0', 'f1', 'f2'] }),
        ws('f0', { layer: 1, connections: ['f1'] }),
        ws('f1', { layer: 1 }),
        ws('f2', { layer: 1 }),
      ];
      const l = layoutMap(stateWith(nodes, 'a'), none);
      const gid = groupId(1, 'workstation');
      expect(l.links.map(x => x.id)).toEqual([`a|${gid}`]);
      expect(l.positions['f0']).toEqual(l.positions[gid]);
    });
  });

  it('labels layer 5 CASSANDRA and never prints the secret name', () => {
    const state = stateWith([ws('core', { layer: 5, anchor: true })], 'core');
    const l = layoutMap(state, none);
    expect(l.columns[0]?.label).toBe('CASSANDRA');
    expect(JSON.stringify(l.columns)).not.toMatch(/\baria\b/i);
  });

  it('copes with a state whose only shown node is the current one', () => {
    const l = layoutMap(createInitialState(), none);
    expect(l.items.length).toBeGreaterThanOrEqual(1);
    expect(l.width).toBeGreaterThan(0);
    expect(l.height).toBeGreaterThan(0);
  });
});
