import { describe, it, expect } from 'vitest';
import {
  catCommand,
  exfilCommand,
  fileBadges,
  resolveSelection,
  sourceSelection,
} from './explorerShared';
import { createInitialState } from '../engine/state';
import produce from '../engine/produce';
import type { GameFile } from '../types/game';

const file = (path: string, over: Partial<GameFile> = {}): GameFile => ({
  name: path.split('/').pop() ?? path,
  path,
  type: 'document',
  content: 'x',
  exfiltrable: true,
  accessRequired: 'user',
  ...over,
});

const stateWith = (files: GameFile[], local: GameFile[] = []) =>
  produce(createInitialState(), s => {
    const node = s.network.nodes['contractor_portal']!;
    node.accessLevel = 'user';
    node.files = files;
    s.player.exfiltrated = local;
  });

describe('commands', () => {
  it('builds full-path cat, local cat and exfil commands', () => {
    const f = file('/etc/vpn.cfg');
    expect(catCommand('node', f)).toBe('cat /etc/vpn.cfg');
    expect(catCommand('local', f)).toBe('cat local:/etc/vpn.cfg');
    expect(exfilCommand(f)).toBe('exfil /etc/vpn.cfg');
  });
});

describe('fileBadges', () => {
  it('lists ls-style badges in a stable order', () => {
    expect(
      fileBadges(file('/a', { tripwire: true, exfiltrable: false, locked: true, isTool: true })),
    ).toEqual(['[!]', '[no-exfil]', '[LOCKED]', '[TOOL]']);
    expect(fileBadges(file('/a'))).toEqual([]);
  });
});

describe('resolveSelection', () => {
  it('resolves node and local files by path and returns undefined otherwise', () => {
    const state = stateWith([file('/a/ok.txt')], [file('/loot.csv')]);
    expect(resolveSelection(state, { root: 'node', path: '/a/ok.txt' })?.file.name).toBe('ok.txt');
    expect(resolveSelection(state, { root: 'local', path: '/loot.csv' })?.root).toBe('local');
    expect(resolveSelection(state, { root: 'node', path: '/nope' })).toBeUndefined();
    expect(resolveSelection(state, null)).toBeUndefined();
  });

  it('does not resolve a node file the player cannot access or that was deleted', () => {
    const state = stateWith([
      file('/a/admin.txt', { accessRequired: 'admin' }),
      file('/a/gone.txt', { deleted: true }),
    ]);
    expect(resolveSelection(state, { root: 'node', path: '/a/admin.txt' })).toBeUndefined();
    expect(resolveSelection(state, { root: 'node', path: '/a/gone.txt' })).toBeUndefined();
  });
});

describe('sourceSelection', () => {
  const source = { nodeId: 'ops_hr_db', path: '/var/log/auth.log' };
  const elsewhere = (local: GameFile[]) =>
    produce(createInitialState(), s => {
      s.network.currentNodeId = 'contractor_portal';
      s.player.exfiltrated = local;
    });

  it('opens a file that is on the current node', () => {
    const state = produce(createInitialState(), s => {
      s.network.currentNodeId = 'ops_hr_db';
      const node = s.network.nodes['ops_hr_db']!;
      node.accessLevel = 'user';
      node.files = [file(source.path)];
    });
    expect(sourceSelection(state, source)).toEqual({ root: 'node', path: source.path });
  });

  it('opens an exfiltrated copy that came from the cited node', () => {
    const state = elsewhere([file(source.path, { sourceNodeId: 'ops_hr_db' })]);
    expect(sourceSelection(state, source)).toEqual({ root: 'local', path: source.path });
  });

  it('does not open a same-path copy that came from a different node', () => {
    const state = elsewhere([file(source.path, { sourceNodeId: 'sec_firewall' })]);
    expect(sourceSelection(state, source)).toBeNull();
  });

  it('accepts a copy with no recorded origin (the origin is lost on a reload)', () => {
    const state = elsewhere([file(source.path)]);
    expect(sourceSelection(state, source)).toEqual({ root: 'local', path: source.path });
  });

  it('is null when the file is out of reach', () => {
    expect(sourceSelection(elsewhere([]), source)).toBeNull();
  });
});
