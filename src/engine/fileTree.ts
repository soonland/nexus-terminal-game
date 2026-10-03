import { hasAccess } from '../types/game';
import type { GameFile, LiveNode } from '../types/game';

export type TreeEntry =
  | { kind: 'dir'; name: string; path: string; children: TreeEntry[] }
  | { kind: 'file'; name: string; path: string; file: GameFile };

type DirEntry = Extract<TreeEntry, { kind: 'dir' }>;

// The single visibility rule shared by `ls` and the explorer, so they cannot drift.
export const listAccessibleFiles = (node: LiveNode): GameFile[] =>
  node.files.filter(f => !f.deleted && hasAccess(node.accessLevel, f.accessRequired));

const sortEntries = (entries: TreeEntry[]): TreeEntry[] =>
  entries
    .map(e => (e.kind === 'dir' ? { ...e, children: sortEntries(e.children) } : e))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1));

export const buildFileTree = (files: readonly GameFile[]): TreeEntry[] => {
  const root: TreeEntry[] = [];

  for (const file of files) {
    const segments = file.path.split('/').filter(s => s !== '');
    // A path with no usable segments (e.g. '') still has to show up: fall back to the name.
    const leafName = segments.pop() ?? file.name;

    let level = root;
    let dirPath = '';
    for (const segment of segments) {
      dirPath = `${dirPath}/${segment}`;
      let dir = level.find((e): e is DirEntry => e.kind === 'dir' && e.name === segment);
      if (!dir) {
        dir = { kind: 'dir', name: segment, path: dirPath, children: [] };
        level.push(dir);
      }
      level = dir.children;
    }
    level.push({ kind: 'file', name: leafName, path: file.path, file });
  }

  return sortEntries(root);
};
