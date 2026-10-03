import { describe, it, expect } from 'vitest';
import { buildFileTree, listAccessibleFiles } from './fileTree';
import type { TreeEntry } from './fileTree';
import type { GameFile, LiveNode } from '../types/game';

const file = (path: string, overrides: Partial<GameFile> = {}): GameFile => ({
  name: path.split('/').filter(Boolean).pop() ?? path,
  path,
  type: 'document',
  content: 'x',
  exfiltrable: true,
  accessRequired: 'user',
  ...overrides,
});

const names = (entries: TreeEntry[]) => entries.map(e => `${e.kind}:${e.name}`);

type Dir = Extract<TreeEntry, { kind: 'dir' }>;
type Leaf = Extract<TreeEntry, { kind: 'file' }>;

describe('listAccessibleFiles', () => {
  const node = (accessLevel: LiveNode['accessLevel'], files: GameFile[]) =>
    ({ accessLevel, files }) as LiveNode;

  it('hides deleted files and files above the player access level', () => {
    const visible = file('/a/visible.txt');
    const files = [
      visible,
      file('/a/deleted.txt', { deleted: true }),
      file('/a/admin.txt', { accessRequired: 'admin' }),
    ];
    expect(listAccessibleFiles(node('user', files))).toEqual([visible]);
  });

  it('returns nothing when not authenticated', () => {
    expect(listAccessibleFiles(node('none', [file('/a/b.txt')]))).toEqual([]);
  });
});

describe('buildFileTree', () => {
  it('nests files under directories derived from their paths', () => {
    const tree = buildFileTree([file('/var/log/access_log'), file('/etc/vpn/routing.cfg')]);
    expect(names(tree)).toEqual(['dir:etc', 'dir:var']);
    const varDir = tree[1] as Dir;
    expect(varDir.path).toBe('/var');
    expect(names(varDir.children)).toEqual(['dir:log']);
    const log = varDir.children[0] as Dir;
    expect(log.path).toBe('/var/log');
    expect(names(log.children)).toEqual(['file:access_log']);
  });

  it('sorts directories before files, each alphabetically', () => {
    const tree = buildFileTree([
      file('/b.txt'),
      file('/zdir/c.txt'),
      file('/a.txt'),
      file('/adir/d.txt'),
    ]);
    expect(names(tree)).toEqual(['dir:adir', 'dir:zdir', 'file:a.txt', 'file:b.txt']);
  });

  it('keeps same-named files in different directories as separate entries', () => {
    const a = file('/etc/a/config.ini');
    const b = file('/etc/b/config.ini');
    const tree = buildFileTree([a, b]);
    const etc = tree[0] as Dir;
    const [da, db] = etc.children as Dir[];
    expect((da.children[0] as Leaf).file).toBe(a);
    expect((db.children[0] as Leaf).file).toBe(b);
  });

  it('never drops files with odd paths', () => {
    const noSlash = file('readme.txt');
    const trailing = file('/docs/notes.txt/');
    const empty = file('', { name: 'mystery' });
    const dupA = file('/dup/x.txt');
    const dupB = file('/dup/x.txt');
    const tree = buildFileTree([noSlash, trailing, empty, dupA, dupB]);
    const collect = (entries: TreeEntry[]): GameFile[] =>
      entries.flatMap(e => (e.kind === 'file' ? [e.file] : collect(e.children)));
    const all = collect(tree);
    expect(all).toHaveLength(5);
    expect(all).toEqual(expect.arrayContaining([noSlash, trailing, empty, dupA, dupB]));
  });

  it('returns an empty tree for no files', () => {
    expect(buildFileTree([])).toEqual([]);
  });
});
