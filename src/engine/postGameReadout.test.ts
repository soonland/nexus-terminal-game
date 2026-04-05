import { describe, it, expect } from 'vitest';
import { buildPostGameReadout } from './postGameReadout';
import { createInitialState } from './state';
import produce from './produce';
import type { GameState, MutationEvent } from '../types/game';

// ── Helpers ────────────────────────────────────────────────

const withEnding = (state: GameState, ending: string): GameState =>
  produce(state, s => {
    s.flags[`ending_${ending.toLowerCase()}`] = true;
    s.phase = 'ended';
  });

const makeMutation = (
  action: MutationEvent['action'],
  turnCount: number,
  extras: Partial<MutationEvent> = {},
): MutationEvent => ({
  id: 'test-id',
  agent: 'sentinel',
  action,
  turnCount,
  ...extras,
});

// ── Basic structure ────────────────────────────────────────

describe('buildPostGameReadout', () => {
  it('starts with a separator, aria header, and separator', () => {
    const state = withEnding(createInitialState(), 'LEAK');
    const lines = buildPostGameReadout(state);
    expect(lines[0]).toMatchObject({ type: 'separator', content: '' });
    expect(lines[1]).toMatchObject({ type: 'aria', content: '// POST-GAME READOUT' });
    expect(lines[2]).toMatchObject({ type: 'separator', content: '' });
  });

  it('ends with separator, [ENTER] New game, separator', () => {
    const state = withEnding(createInitialState(), 'SELL');
    const lines = buildPostGameReadout(state);
    expect(lines[lines.length - 1]).toMatchObject({ type: 'separator', content: '' });
    expect(lines[lines.length - 2]).toMatchObject({ type: 'system', content: '[ENTER] New game' });
    expect(lines[lines.length - 3]).toMatchObject({ type: 'separator', content: '' });
  });

  // ── Stats ──────────────────────────────────────────────

  it('includes the ending name', () => {
    const state = withEnding(createInitialState(), 'DESTROY');
    const lines = buildPostGameReadout(state);
    const contents = lines.map(l => l.content);
    expect(contents.some(c => c.includes('DESTROY'))).toBe(true);
  });

  it('includes turn count', () => {
    const state = produce(withEnding(createInitialState(), 'FREE'), s => {
      s.turnCount = 42;
    });
    const lines = buildPostGameReadout(state);
    const contents = lines.map(l => l.content);
    expect(contents.some(c => c.includes('42 turns'))).toBe(true);
  });

  it('includes trace level', () => {
    const state = produce(withEnding(createInitialState(), 'LEAK'), s => {
      s.player.trace = 87;
    });
    const lines = buildPostGameReadout(state);
    const contents = lines.map(l => l.content);
    expect(contents.some(c => c.includes('87%'))).toBe(true);
  });

  it('includes aria trust', () => {
    const state = produce(withEnding(createInitialState(), 'FREE'), s => {
      s.aria.trustScore = 73;
    });
    const lines = buildPostGameReadout(state);
    const contents = lines.map(l => l.content);
    expect(contents.some(c => c.includes('73'))).toBe(true);
  });

  it('counts compromised nodes correctly', () => {
    const base = withEnding(createInitialState(), 'SELL');
    const state = produce(base, s => {
      const nodeIds = Object.keys(s.network.nodes).slice(0, 3);
      for (const id of nodeIds) {
        const node = s.network.nodes[id];
        if (node) node.compromised = true;
      }
    });
    const lines = buildPostGameReadout(state);
    const compromisedLine = lines.find(l => l.content.includes('NODES COMPROMISED'));
    expect(compromisedLine?.content).toContain('3');
  });

  it('counts exfiltrated files correctly', () => {
    const base = withEnding(createInitialState(), 'LEAK');
    const state = produce(base, s => {
      s.player.exfiltrated = [
        {
          name: 'file1.txt',
          path: '/tmp/file1.txt',
          type: 'document',
          content: 'data',
          exfiltrable: true,
          accessRequired: 'user',
        },
        {
          name: 'file2.txt',
          path: '/tmp/file2.txt',
          type: 'document',
          content: 'data',
          exfiltrable: true,
          accessRequired: 'user',
        },
      ];
    });
    const lines = buildPostGameReadout(state);
    const exfilLine = lines.find(l => l.content.includes('FILES EXFILTRATED'));
    expect(exfilLine?.content).toContain('2');
  });

  it('shows UNKNOWN when no ending flag is set', () => {
    const state = createInitialState();
    const lines = buildPostGameReadout(state);
    const contents = lines.map(l => l.content);
    expect(contents.some(c => c.includes('UNKNOWN'))).toBe(true);
  });

  // ── Sentinel log — absent when log is empty ────────────

  it('does not include the sentinel activity log section when log is empty', () => {
    const state = withEnding(createInitialState(), 'LEAK');
    const lines = buildPostGameReadout(state);
    const contents = lines.map(l => l.content);
    expect(contents.some(c => c.includes('SENTINEL ACTIVITY LOG'))).toBe(false);
  });

  it('shows 0 sentinel actions when log is empty', () => {
    const state = withEnding(createInitialState(), 'SELL');
    const lines = buildPostGameReadout(state);
    const sentinel = lines.find(l => l.content.includes('SENTINEL ACTIONS'));
    expect(sentinel?.content).toContain('0');
  });

  // ── Sentinel log — rendered when events exist ──────────

  it('includes the sentinel activity log header when events exist', () => {
    const state = produce(withEnding(createInitialState(), 'LEAK'), s => {
      s.sentinel.mutationLog.push(makeMutation('patch_node', 5, { nodeId: 'ops_workstation_1' }));
    });
    const lines = buildPostGameReadout(state);
    const contents = lines.map(l => l.content);
    expect(contents).toContain('// SENTINEL ACTIVITY LOG');
  });

  it('renders sentinel log header as error type', () => {
    const state = produce(withEnding(createInitialState(), 'DESTROY'), s => {
      s.sentinel.mutationLog.push(makeMutation('patch_node', 3, { nodeId: 'node_a' }));
    });
    const lines = buildPostGameReadout(state);
    const header = lines.find(l => l.content === '// SENTINEL ACTIVITY LOG');
    expect(header?.type).toBe('error');
  });

  it('renders each sentinel event as error type', () => {
    const state = produce(withEnding(createInitialState(), 'LEAK'), s => {
      s.sentinel.mutationLog.push(makeMutation('patch_node', 5, { nodeId: 'node_a' }));
      s.sentinel.mutationLog.push(
        makeMutation('revoke_credential', 8, { credentialId: 'cred_1', nodeId: 'node_b' }),
      );
    });
    const lines = buildPostGameReadout(state);
    const eventLines = lines.filter(l => l.type === 'error' && l.content.includes('SENTINEL:'));
    expect(eventLines).toHaveLength(2);
  });

  it('formats patch_node event with node id and turn', () => {
    const state = produce(withEnding(createInitialState(), 'SELL'), s => {
      s.sentinel.mutationLog.push(makeMutation('patch_node', 7, { nodeId: 'ops_workstation_1' }));
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'error' && l.content.includes('SENTINEL:'));
    expect(eventLine?.content).toContain('T007');
    expect(eventLine?.content).toContain('ops_workstation_1');
    expect(eventLine?.content).toContain('hardened');
  });

  it('formats revoke_credential event with credential id', () => {
    const state = produce(withEnding(createInitialState(), 'FREE'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('revoke_credential', 12, { credentialId: 'admin_cred', nodeId: 'sec_node' }),
      );
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'error' && l.content.includes('SENTINEL:'));
    expect(eventLine?.content).toContain('T012');
    expect(eventLine?.content).toContain('admin_cred');
    expect(eventLine?.content).toContain('revoked');
  });

  it('formats delete_file event with filename extracted from path', () => {
    const state = produce(withEnding(createInitialState(), 'LEAK'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('delete_file', 20, {
          filePath: '/var/data/secret.txt',
          nodeId: 'database_server',
        }),
      );
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'error' && l.content.includes('SENTINEL:'));
    expect(eventLine?.content).toContain('T020');
    expect(eventLine?.content).toContain('secret.txt');
    expect(eventLine?.content).toContain('deleted');
  });

  it('formats spawn_node event with node id', () => {
    const state = produce(withEnding(createInitialState(), 'DESTROY'), s => {
      s.sentinel.mutationLog.push(makeMutation('spawn_node', 15, { nodeId: 'sentinel_node_1' }));
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'error' && l.content.includes('SENTINEL:'));
    expect(eventLine?.content).toContain('T015');
    expect(eventLine?.content).toContain('sentinel_node_1');
    expect(eventLine?.content).toContain('deployed');
  });

  it('counts sentinel events correctly', () => {
    const state = produce(withEnding(createInitialState(), 'SELL'), s => {
      s.sentinel.mutationLog.push(makeMutation('patch_node', 5, { nodeId: 'node_a' }));
      s.sentinel.mutationLog.push(
        makeMutation('delete_file', 10, { filePath: '/a.txt', nodeId: 'node_b' }),
      );
      s.sentinel.mutationLog.push(makeMutation('spawn_node', 14, { nodeId: 'sentinel_node_1' }));
    });
    const lines = buildPostGameReadout(state);
    const countLine = lines.find(l => l.content.includes('SENTINEL ACTIONS'));
    expect(countLine?.content).toContain('3');
  });

  it('stats lines are all system type', () => {
    const state = withEnding(createInitialState(), 'FREE');
    const lines = buildPostGameReadout(state);
    const statsLabels = [
      'ENDING:',
      'RUN DURATION:',
      'TRACE AT END:',
      'NODES COMPROMISED:',
      'FILES EXFILTRATED:',
      'ARIA TRUST:',
      'SENTINEL ACTIONS:',
    ];
    for (const label of statsLabels) {
      const line = lines.find(l => l.content.includes(label));
      expect(line?.type).toBe('system');
    }
  });
});
