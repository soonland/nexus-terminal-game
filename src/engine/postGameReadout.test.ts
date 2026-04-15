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
  visibleToPlayer: true,
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

  it('formats sentinel default/unknown action event', () => {
    const state = produce(withEnding(createInitialState(), 'SELL'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('patch_node', 5, {
          // cast to hit the default branch
          action: 'unknown_action' as unknown as MutationEvent['action'],
        }),
      );
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'error' && l.content.includes('SENTINEL:'));
    expect(eventLine?.content).toContain('Unknown action');
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

  it('formats patch_node event with missing nodeId using fallback ?', () => {
    const state = produce(withEnding(createInitialState(), 'SELL'), s => {
      s.sentinel.mutationLog.push(makeMutation('patch_node', 7));
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'error' && l.content.includes('SENTINEL:'));
    expect(eventLine?.content).toContain("'?'");
  });

  it('formats revoke_credential event with missing credentialId and nodeId using fallback ?', () => {
    const state = produce(withEnding(createInitialState(), 'FREE'), s => {
      s.sentinel.mutationLog.push(makeMutation('revoke_credential', 12));
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'error' && l.content.includes('SENTINEL:'));
    expect(eventLine?.content).toContain("'?'");
    expect(eventLine?.content).toContain('revoked');
  });

  it('formats delete_file event with missing filePath and nodeId using fallback ?', () => {
    const state = produce(withEnding(createInitialState(), 'LEAK'), s => {
      s.sentinel.mutationLog.push(makeMutation('delete_file', 20));
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'error' && l.content.includes('SENTINEL:'));
    expect(eventLine?.content).toContain("'?'");
    expect(eventLine?.content).toContain('deleted');
  });

  it('formats spawn_node event with missing nodeId using fallback ?', () => {
    const state = produce(withEnding(createInitialState(), 'DESTROY'), s => {
      s.sentinel.mutationLog.push(makeMutation('spawn_node', 15));
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'error' && l.content.includes('SENTINEL:'));
    expect(eventLine?.content).toContain("'?'");
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

  it('sentinel action count excludes aria mutations', () => {
    const state = produce(withEnding(createInitialState(), 'LEAK'), s => {
      s.sentinel.mutationLog.push(makeMutation('patch_node', 5, { nodeId: 'node_a' }));
      s.sentinel.mutationLog.push(
        makeMutation('plant_file', 3, {
          agent: 'aria',
          visibleToPlayer: false,
          nodeId: 'node_b',
          filePath: '/tmp/planted.txt',
        }),
      );
    });
    const lines = buildPostGameReadout(state);
    const countLine = lines.find(l => l.content.includes('SENTINEL ACTIONS'));
    expect(countLine?.content).toContain('1');
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

  // ── Aria silent mutations ──────────────────────────────────

  it('does not show aria reveal section when no aria hidden mutations exist', () => {
    const state = withEnding(createInitialState(), 'LEAK');
    const lines = buildPostGameReadout(state);
    const contents = lines.map(l => l.content);
    expect(contents.some(c => c.includes('ARIA SILENT OPERATIONS'))).toBe(false);
  });

  it('does not show aria reveal section for aria mutations that were visible to player', () => {
    const state = produce(withEnding(createInitialState(), 'FREE'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('plant_file', 5, {
          agent: 'aria',
          visibleToPlayer: true,
          nodeId: 'node_a',
          filePath: '/visible.txt',
        }),
      );
    });
    const lines = buildPostGameReadout(state);
    const contents = lines.map(l => l.content);
    expect(contents.some(c => c.includes('ARIA SILENT OPERATIONS'))).toBe(false);
  });

  it('shows aria reveal section header when hidden aria mutations exist', () => {
    const state = produce(withEnding(createInitialState(), 'FREE'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('plant_file', 4, {
          agent: 'aria',
          visibleToPlayer: false,
          nodeId: 'node_a',
          filePath: '/hidden.txt',
        }),
      );
    });
    const lines = buildPostGameReadout(state);
    const header = lines.find(l => l.content.includes('ARIA SILENT OPERATIONS'));
    expect(header).toBeDefined();
    expect(header?.type).toBe('aria');
  });

  it('renders aria plant_file event with filename and node', () => {
    const state = produce(withEnding(createInitialState(), 'SELL'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('plant_file', 8, {
          agent: 'aria',
          visibleToPlayer: false,
          nodeId: 'finance_server',
          filePath: '/var/docs/bait.txt',
        }),
      );
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'aria' && l.content.includes('ARIA:'));
    expect(eventLine?.content).toContain('T008');
    expect(eventLine?.content).toContain('bait.txt');
    expect(eventLine?.content).toContain('finance_server');
    expect(eventLine?.content).toContain('planted');
  });

  it('renders aria modify_file event with filename and node', () => {
    const state = produce(withEnding(createInitialState(), 'DESTROY'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('modify_file', 11, {
          agent: 'aria',
          visibleToPlayer: false,
          nodeId: 'exec_server',
          filePath: '/home/admin/report.doc',
        }),
      );
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'aria' && l.content.includes('ARIA:'));
    expect(eventLine?.content).toContain('T011');
    expect(eventLine?.content).toContain('report.doc');
    expect(eventLine?.content).toContain('exec_server');
    expect(eventLine?.content).toContain('modified');
  });

  it('renders aria plant_file event with missing filePath and nodeId using fallback ?', () => {
    const state = produce(withEnding(createInitialState(), 'SELL'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('plant_file', 8, { agent: 'aria', visibleToPlayer: false }),
      );
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'aria' && l.content.includes('ARIA:'));
    expect(eventLine?.content).toContain("'?'");
    expect(eventLine?.content).toContain('planted');
  });

  it('renders aria modify_file event with missing filePath and nodeId using fallback ?', () => {
    const state = produce(withEnding(createInitialState(), 'DESTROY'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('modify_file', 11, { agent: 'aria', visibleToPlayer: false }),
      );
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'aria' && l.content.includes('ARIA:'));
    expect(eventLine?.content).toContain("'?'");
    expect(eventLine?.content).toContain('modified');
  });

  it('renders aria default/unknown action event', () => {
    const state = produce(withEnding(createInitialState(), 'FREE'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('nudge_trust', 9, {
          agent: 'aria',
          visibleToPlayer: false,
          // cast to hit the default branch
          action: 'unknown_aria_action' as unknown as MutationEvent['action'],
        }),
      );
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'aria' && l.content.includes('ARIA:'));
    expect(eventLine?.content).toContain('Silent operation performed');
  });

  it('renders aria nudge_trust event', () => {
    const state = produce(withEnding(createInitialState(), 'FREE'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('nudge_trust', 6, {
          agent: 'aria',
          visibleToPlayer: false,
        }),
      );
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'aria' && l.content.includes('ARIA:'));
    expect(eventLine?.content).toContain('T006');
    expect(eventLine?.content).toContain('Trust score');
  });

  it('renders all hidden aria events as aria type', () => {
    const state = produce(withEnding(createInitialState(), 'LEAK'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('plant_file', 3, {
          agent: 'aria',
          visibleToPlayer: false,
          nodeId: 'n1',
          filePath: '/a.txt',
        }),
      );
      s.sentinel.mutationLog.push(
        makeMutation('nudge_trust', 7, { agent: 'aria', visibleToPlayer: false }),
      );
    });
    const lines = buildPostGameReadout(state);
    const ariaEventLines = lines.filter(l => l.type === 'aria' && l.content.includes('ARIA:'));
    expect(ariaEventLines).toHaveLength(2);
  });

  // ── ariaInfluencedFilesRead ────────────────────────────────

  it('does not show aria-influenced files section when none were read', () => {
    const state = withEnding(createInitialState(), 'SELL');
    const lines = buildPostGameReadout(state);
    const contents = lines.map(l => l.content);
    expect(contents.some(c => c.includes('ARIA-INFLUENCED FILES'))).toBe(false);
  });

  it('shows aria-influenced files section header when files were read', () => {
    const state = produce(withEnding(createInitialState(), 'FREE'), s => {
      s.ariaInfluencedFilesRead.push('/var/docs/planted.txt');
    });
    const lines = buildPostGameReadout(state);
    const header = lines.find(l => l.content.includes('ARIA-INFLUENCED FILES'));
    expect(header).toBeDefined();
    expect(header?.type).toBe('aria');
  });

  it('lists each aria-influenced file with path and filename', () => {
    const state = produce(withEnding(createInitialState(), 'LEAK'), s => {
      s.ariaInfluencedFilesRead.push('/var/docs/planted.txt');
      s.ariaInfluencedFilesRead.push('/home/admin/bait.log');
    });
    const lines = buildPostGameReadout(state);
    const fileLines = lines.filter(l => l.type === 'aria' && l.content.startsWith('  > '));
    expect(fileLines).toHaveLength(2);
    expect(fileLines[0]?.content).toContain('planted.txt');
    expect(fileLines[0]?.content).toContain('/var/docs/planted.txt');
    expect(fileLines[1]?.content).toContain('bait.log');
  });

  // ── decisionLog ────────────────────────────────────────────

  it('does not show decision log section when log is empty', () => {
    const state = withEnding(createInitialState(), 'DESTROY');
    const lines = buildPostGameReadout(state);
    const contents = lines.map(l => l.content);
    expect(contents.some(c => c.includes('DECISION LOG'))).toBe(false);
  });

  it('shows decision log section header when entries exist', () => {
    const state = produce(withEnding(createInitialState(), 'SELL'), s => {
      s.decisionLog.push({ turn: 1, command: 'connect entry_point' });
    });
    const lines = buildPostGameReadout(state);
    const header = lines.find(l => l.content === '// DECISION LOG');
    expect(header).toBeDefined();
    expect(header?.type).toBe('system');
  });

  it('renders each decision log entry with zero-padded turn number', () => {
    const state = produce(withEnding(createInitialState(), 'FREE'), s => {
      s.decisionLog.push({ turn: 1, command: 'connect entry_point' });
      s.decisionLog.push({ turn: 7, command: 'exploit ssh' });
      s.decisionLog.push({ turn: 14, command: 'exfil secrets.db' });
    });
    const lines = buildPostGameReadout(state);
    const decisionLines = lines.filter(l => l.type === 'output' && l.content.includes('>'));
    expect(decisionLines).toHaveLength(3);
    expect(decisionLines[0]?.content).toContain('T001');
    expect(decisionLines[0]?.content).toContain('connect entry_point');
    expect(decisionLines[1]?.content).toContain('T007');
    expect(decisionLines[1]?.content).toContain('exploit ssh');
    expect(decisionLines[2]?.content).toContain('T014');
    expect(decisionLines[2]?.content).toContain('exfil secrets.db');
  });

  it('renders decision log entries as output type', () => {
    const state = produce(withEnding(createInitialState(), 'LEAK'), s => {
      s.decisionLog.push({ turn: 3, command: 'login admin' });
    });
    const lines = buildPostGameReadout(state);
    const decisionLine = lines.find(l => l.content.includes('T003') && l.content.includes('>'));
    expect(decisionLine?.type).toBe('output');
  });

  // ── Faraday cage suppressions ───────────────────────────

  it('includes CAGE SUPPRESSIONS line when suppressedMutations > 0', () => {
    const state = produce(withEnding(createInitialState(), 'LEAK'), s => {
      s.aria.suppressedMutations = 7;
    });
    const lines = buildPostGameReadout(state);
    const cageLine = lines.find(l => l.content.includes('CAGE SUPPRESSIONS'));
    expect(cageLine).toBeDefined();
    expect(cageLine!.content).toContain('7');
    expect(cageLine!.type).toBe('system');
  });

  it('does NOT include CAGE SUPPRESSIONS line when suppressedMutations is 0', () => {
    const state = withEnding(createInitialState(), 'LEAK');
    const lines = buildPostGameReadout(state);
    const cageLine = lines.find(l => l.content.includes('CAGE SUPPRESSIONS'));
    expect(cageLine).toBeUndefined();
  });

  // ── §9.4 Aria mutation event formatting ─────────────────

  it('renders aria reroute_edge event with target node id', () => {
    const state = produce(withEnding(createInitialState(), 'FREE'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('reroute_edge', 22, {
          agent: 'aria',
          visibleToPlayer: false,
          nodeId: 'fin_payments_db',
        }),
      );
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'aria' && l.content.includes('ARIA:'));
    expect(eventLine?.content).toContain('T022');
    expect(eventLine?.content).toContain('fin_payments_db');
    expect(eventLine?.content).toContain('Shortcut edge added');
  });

  it('renders aria delete_reinforcement event with target node id', () => {
    const state = produce(withEnding(createInitialState(), 'SELL'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('delete_reinforcement', 31, {
          agent: 'aria',
          visibleToPlayer: false,
          nodeId: 'sentinel_node_2',
        }),
      );
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'aria' && l.content.includes('ARIA:'));
    expect(eventLine?.content).toContain('T031');
    expect(eventLine?.content).toContain('sentinel_node_2');
    expect(eventLine?.content).toContain('removed from network');
  });

  it('renders aria reroute_edge event with missing nodeId using fallback ?', () => {
    const state = produce(withEnding(createInitialState(), 'DESTROY'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('reroute_edge', 5, { agent: 'aria', visibleToPlayer: false }),
      );
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'aria' && l.content.includes('ARIA:'));
    expect(eventLine?.content).toContain("'?'");
    expect(eventLine?.content).toContain('Shortcut edge added');
  });

  it('renders aria delete_reinforcement event with missing nodeId using fallback ?', () => {
    const state = produce(withEnding(createInitialState(), 'LEAK'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('delete_reinforcement', 18, { agent: 'aria', visibleToPlayer: false }),
      );
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'aria' && l.content.includes('ARIA:'));
    expect(eventLine?.content).toContain("'?'");
    expect(eventLine?.content).toContain('removed from network');
  });
});

// ── reason field rendering ─────────────────────────────────

describe('buildPostGameReadout — reason field appended when present', () => {
  it('appends reason to a sentinel patch_node line', () => {
    const state = produce(withEnding(createInitialState(), 'LEAK'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('patch_node', 3, { nodeId: 'ops_node', reason: 'Hardening test reason' }),
      );
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'error' && l.content.includes('SENTINEL:'));
    expect(eventLine?.content).toContain('— Hardening test reason');
  });

  it('does not append reason suffix when reason is absent on a sentinel event', () => {
    const state = produce(withEnding(createInitialState(), 'SELL'), s => {
      s.sentinel.mutationLog.push(makeMutation('patch_node', 3, { nodeId: 'ops_node' }));
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'error' && l.content.includes('SENTINEL:'));
    expect(eventLine?.content).not.toContain('—');
  });

  it('appends reason to an aria reroute_edge line', () => {
    const state = produce(withEnding(createInitialState(), 'FREE'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('reroute_edge', 7, {
          agent: 'aria',
          visibleToPlayer: false,
          nodeId: 'exec_node',
          reason: 'Aiding navigation',
        }),
      );
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'aria' && l.content.includes('ARIA:'));
    expect(eventLine?.content).toContain('— Aiding navigation');
  });

  it('does not append reason suffix when reason is absent on an aria event', () => {
    const state = produce(withEnding(createInitialState(), 'FREE'), s => {
      s.sentinel.mutationLog.push(
        makeMutation('reroute_edge', 7, {
          agent: 'aria',
          visibleToPlayer: false,
          nodeId: 'exec_node',
        }),
      );
    });
    const lines = buildPostGameReadout(state);
    const eventLine = lines.find(l => l.type === 'aria' && l.content.includes('ARIA:'));
    expect(eventLine?.content).not.toContain('—');
  });
});
