import type { GameFile, GameState } from '../types/game';
import { currentNode } from '../engine/state';
import { listAccessibleFiles } from '../engine/fileTree';

export type Root = 'node' | 'local';

export interface Selection {
  root: Root;
  path: string;
}

export interface ResolvedSelection {
  root: Root;
  file: GameFile;
}

export const NO_CONTENT = '[content unavailable]';

export const fileBadges = (f: GameFile): string[] => [
  ...(f.tripwire ? ['[!]'] : []),
  ...(f.exfiltrable ? [] : ['[no-exfil]']),
  ...(f.locked ? ['[LOCKED]'] : []),
  ...(f.isTool ? ['[TOOL]'] : []),
];

// Full paths, never bare names: two directories can hold files with the same name.
export const catCommand = (root: Root, file: GameFile): string =>
  root === 'local' ? `cat local:${file.path}` : `cat ${file.path}`;

export const exfilCommand = (file: GameFile): string => `exfil ${file.path}`;

// Where a casebook source can be opened from right now: the file is on the node the player is
// on, or the player holds an exfiltrated copy. Null when it is out of reach.
export const sourceSelection = (
  gameState: GameState,
  source: { nodeId: string; path: string },
): Selection | null => {
  const node = currentNode(gameState);
  if (node.id === source.nodeId && listAccessibleFiles(node).some(f => f.path === source.path)) {
    return { root: 'node', path: source.path };
  }
  if (gameState.player.exfiltrated.some(f => f.path === source.path)) {
    return { root: 'local', path: source.path };
  }
  return null;
};

// Resolved from live state on every render, so a file the sentinel deletes (or a node
// change) drops the selection instead of leaving stale details on screen.
export const resolveSelection = (
  gameState: GameState,
  selection: Selection | null,
): ResolvedSelection | undefined => {
  if (!selection) return undefined;
  const files =
    selection.root === 'node'
      ? listAccessibleFiles(currentNode(gameState))
      : gameState.player.exfiltrated;
  const file = files.find(f => f.path === selection.path);
  return file ? { root: selection.root, file } : undefined;
};
